# Admin Order Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Mazad admin team drive an order through fulfillment by hand — advancing each stage with a note, owning it by name, and chasing unpaid orders — so the admin panel becomes the source of truth for post-auction progress.

**Architecture:** Almost all of this already exists. `src/utils/orderWorkflow.ts` is a finite state machine that already permits admins every buyer and seller action and already writes an activity record, an `adminActions` audit entry and buyer/seller notifications on every transition. This plan adds one money-free transition (`mark_delivered`), an optional note carried into the activity record, two admin-only assignment fields, a fourth queue bucket for unpaid orders, and the admin UI that was never wired up.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest, Firebase Firestore (client SDK), Tailwind, lucide-react.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-order-pipeline-design.md`.
- **NEVER touch the money path.** Escrow release and refund are Cloud Function calls guarded inside `executeOrderTransition`; `mark_delivered` must write no escrow/payment/settlement field. The existing client-side `forbiddenFields` / `forbiddenStatuses` / `forbiddenEscrows` guard in that function must remain intact and must keep rejecting `escrowStatus`, `completed`, `refunded`.
- **Never allow a stage to be skipped.** Every advance goes through `validateTransition` against `VALID_TRANSITIONS`.
- The customer-facing status bar in `OrderDetailsView` reads `order.status` — the same field these transitions write. Do NOT add a parallel status field.
- All user-facing strings are bilingual, gated on `isAr` (Arabic) / else English. Arabic strings are copied verbatim from this plan — do not retype or "improve" them.
- Firestore rejects explicit `undefined` (`ignoreUndefinedProperties` is not enabled). Omit keys via conditional spread rather than passing `undefined`.
- `tsconfig` does NOT set `strict`, so a green `tsc` is weak evidence. Reason about correctness directly.
- Test: `npx vitest run <path>`. Typecheck: `npm run lint` (runs `tsc --noEmit`, NOT eslint). Build: `npm run build`. **Use `set -o pipefail` if you pipe their output** — otherwise a failure is masked by the pipe and you will report a false green.
- Run all commands from `/Users/mj/code/mazadjo`. Branch `feat/admin-order-pipeline` already exists — do not create another.

---

### Task 1: `awaiting_payment` bucket

An order sitting in `waiting_payment` is currently in NO queue — money not collected, nobody watching. This adds the fourth bucket, with the overdue threshold taken from the order's own payment window rather than a constant.

**Files:**
- Modify: `src/utils/fulfillmentQueues.ts`
- Test: `src/utils/fulfillmentQueues.test.ts`

**Interfaces:**
- Produces: `FulfillmentBucket` gains the `'awaiting_payment'` member; `bucketOrder` returns it for `status === 'waiting_payment'`; `isOverdue` honours `order.paymentWindowHours` for that bucket. Consumed by Task 5's UI.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/fulfillmentQueues.test.ts`:

```ts
describe('awaiting_payment bucket', () => {
  it('buckets an unpaid order so money-not-collected is watched by someone', () => {
    expect(bucketOrder({ status: 'waiting_payment' })).toBe('awaiting_payment');
  });

  it('still returns null for terminal and non-actionable states', () => {
    expect(bucketOrder({ status: 'completed' })).toBeNull();
    expect(bucketOrder({ status: 'cancelled' })).toBeNull();
    expect(bucketOrder({ status: 'refunded' })).toBeNull();
  });

  it('a disputed order never buckets, even when unpaid', () => {
    expect(bucketOrder({ status: 'disputed' })).toBeNull();
  });

  it('overdue uses the order OWN payment window, not a fixed threshold', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    // 12h window: overdue at 13h, fine at 11h.
    const short = { status: 'waiting_payment', paymentWindowHours: 12 };
    expect(isOverdue({ ...short, updatedAtMs: now - 13 * hour }, now)).toBe(true);
    expect(isOverdue({ ...short, updatedAtMs: now - 11 * hour }, now)).toBe(false);
    // 72h window: 13h is nowhere near overdue.
    const long = { status: 'waiting_payment', paymentWindowHours: 72 };
    expect(isOverdue({ ...long, updatedAtMs: now - 13 * hour }, now)).toBe(false);
    expect(isOverdue({ ...long, updatedAtMs: now - 73 * hour }, now)).toBe(true);
  });

  it('falls back to 24h when the order carries no payment window', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    const o = { status: 'waiting_payment' };
    expect(isOverdue({ ...o, updatedAtMs: now - 25 * hour }, now)).toBe(true);
    expect(isOverdue({ ...o, updatedAtMs: now - 23 * hour }, now)).toBe(false);
  });

  it('leaves the existing buckets and their thresholds untouched', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    expect(bucketOrder({ status: 'shipped' })).toBe('awaiting_delivery');
    // awaiting_shipment is still 48h, and a paymentWindowHours on the order
    // must NOT leak into a non-payment bucket.
    const shipping = { status: 'preparing_shipment', paymentWindowHours: 1 };
    expect(isOverdue({ ...shipping, updatedAtMs: now - 47 * hour }, now)).toBe(false);
    expect(isOverdue({ ...shipping, updatedAtMs: now - 49 * hour }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/fulfillmentQueues.test.ts`
Expected: FAIL — `bucketOrder({status:'waiting_payment'})` returns `null`, not `'awaiting_payment'`.

- [ ] **Step 3: Implement**

In `src/utils/fulfillmentQueues.ts`, replace the type, thresholds, `bucketOrder` and `isOverdue` with:

```ts
export type FulfillmentBucket =
  | 'awaiting_payment'
  | 'awaiting_shipment'
  | 'awaiting_delivery'
  | 'awaiting_release'
  | null;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Default payment window when an order carries none — mirrors the server default. */
const DEFAULT_PAYMENT_WINDOW_HOURS = 24;

const THRESHOLDS: Record<Exclude<FulfillmentBucket, null | 'awaiting_payment'>, number> = {
  awaiting_shipment: 48 * HOUR_MS,
  awaiting_delivery: 5 * DAY_MS,
  awaiting_release: 24 * HOUR_MS,
};

/**
 * Assigns an order to a fulfillment bucket, or null if it needs no follow-up
 * here. Disputed orders NEVER bucket, regardless of status/fields — disputes
 * are a separate job (Job 4 / a future slice), not this one's concern.
 *
 * `waiting_payment` buckets too: an order the buyer has not paid for is money
 * not collected, and before this it appeared in no queue at all.
 */
export function bucketOrder(order: {
  status: string;
  paymentVerified?: boolean;
}): FulfillmentBucket {
  if (order.status === 'disputed') return null;
  if (order.status === 'waiting_payment') return 'awaiting_payment';
  if (order.status === 'paid' && order.paymentVerified === true) return 'awaiting_shipment';
  if (order.status === 'preparing_shipment') return 'awaiting_shipment';
  if (order.status === 'shipped') return 'awaiting_delivery';
  if (order.status === 'delivered') return 'awaiting_release';
  return null;
}

export function hoursBetween(fromMs: number, nowMs: number): number {
  return Math.floor((nowMs - fromMs) / HOUR_MS);
}

export function daysBetween(fromMs: number, nowMs: number): number {
  return Math.floor((nowMs - fromMs) / DAY_MS);
}

/**
 * True when the order's current bucket has been sitting past its threshold.
 *
 * `awaiting_payment` is per-order: the buyer was given a specific window at
 * auction creation, so overdue means THAT deadline was blown, not a global one.
 * Every other bucket keeps its fixed SLA — a payment window on the order must
 * not leak into them.
 */
export function isOverdue(
  order: {
    status: string;
    paymentVerified?: boolean;
    updatedAtMs: number;
    paymentWindowHours?: number;
  },
  nowMs: number,
): boolean {
  const bucket = bucketOrder(order);
  if (!bucket) return false;
  const age = nowMs - order.updatedAtMs;
  if (bucket === 'awaiting_payment') {
    const hours = Number(order.paymentWindowHours);
    const window = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_PAYMENT_WINDOW_HOURS;
    return age > window * HOUR_MS;
  }
  return age > THRESHOLDS[bucket];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/fulfillmentQueues.test.ts`
Expected: PASS — all existing tests plus the 6 new ones.

- [ ] **Step 5: Verify nothing else broke**

Run: `set -o pipefail; npm run lint && npx vitest run`
Expected: `tsc` exits 0; full suite passes. Note `FulfillmentSection.tsx` types a `LiveBucket` as `Exclude<FulfillmentBucket, null>` — widening the union may surface a type error there. If it does, DO NOT widen `FulfillmentSection`'s `BUCKETS` yet (that is Task 5); instead narrow its local type to the three it currently renders:

```ts
type LiveBucket = Exclude<FulfillmentBucket, null | 'awaiting_payment'>;
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/fulfillmentQueues.ts src/utils/fulfillmentQueues.test.ts src/components/admin/FulfillmentSection.tsx
git commit -m "feat(fulfillment): queue unpaid orders, overdue by their own payment window

An order in waiting_payment bucketed to null, so money-not-collected sat in
no queue and nobody was chasing it. Overdue for this bucket is per-order —
the buyer was given a specific window at auction creation — while every other
bucket keeps its fixed SLA.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `mark_delivered` — a money-free delivery transition

Today `confirm_delivery` routes straight to the `releaseOrderEscrow` Cloud Function, so marking an order delivered **releases the money**. The admin relay needs delivery and acceptance separate.

**Files:**
- Modify: `src/utils/orderWorkflow.ts`
- Test: `src/utils/orderWorkflow.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `'mark_delivered'` accepted by `executeOrderTransition`'s `action` union and by `checkRolePermission`. Consumed by Task 5's UI.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/orderWorkflow.test.ts`:

```ts
import { checkRolePermission } from './orderWorkflow';

describe('mark_delivered — delivery WITHOUT releasing money', () => {
  it('shipped -> delivered is a legal transition', () => {
    expect(VALID_TRANSITIONS.shipped).toContain('delivered');
    expect(() => validateTransition('shipped', 'delivered')).not.toThrow();
  });

  it('cannot be used to skip straight to completed', () => {
    // Acceptance/release stays its own guarded step.
    expect(() => validateTransition('shipped', 'completed')).toThrow();
  });

  it('is permitted for sellers and admins, not buyers', () => {
    // A seller reporting delivery is legitimate; admins inherit every action.
    expect(checkRolePermission('mark_delivered', 'seller')).toBe(true);
    expect(checkRolePermission('mark_delivered', 'admin')).toBe(true);
    expect(checkRolePermission('mark_delivered', 'buyer')).toBe(false);
  });

  it('leaves the money actions admin-only', () => {
    expect(checkRolePermission('release_escrow', 'seller')).toBe(false);
    expect(checkRolePermission('release_escrow', 'buyer')).toBe(false);
    expect(checkRolePermission('release_escrow', 'admin')).toBe(true);
    expect(checkRolePermission('refund', 'seller')).toBe(false);
    expect(checkRolePermission('refund', 'admin')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/orderWorkflow.test.ts`
Expected: FAIL — `checkRolePermission('mark_delivered', 'seller')` returns `false` because the action does not exist yet.

- [ ] **Step 3: Add the action to the permission table**

In `src/utils/orderWorkflow.ts`, find:

```ts
  const sellerActions = ['prepare_shipment', 'mark_shipped', 'upload_tracking', 'open_dispute'];
```

Replace with:

```ts
  // mark_delivered is a claim of FACT (the goods arrived), not a money move —
  // escrow release remains admin-only below. Admins inherit every action, which
  // is what lets the team advance an order on the seller's behalf.
  const sellerActions = ['prepare_shipment', 'mark_shipped', 'mark_delivered', 'upload_tracking', 'open_dispute'];
```

- [ ] **Step 4: Widen the action union**

Find the `action` parameter type on `executeOrderTransition`:

```ts
  action: 'pay' | 'cancel_before_payment' | 'prepare_shipment' | 'mark_shipped' | 'confirm_delivery' | 'open_dispute' | 'release_escrow' | 'refund' | 'resolve_dispute' | 'force_close',
```

Replace with:

```ts
  action: 'pay' | 'cancel_before_payment' | 'prepare_shipment' | 'mark_shipped' | 'mark_delivered' | 'confirm_delivery' | 'open_dispute' | 'release_escrow' | 'refund' | 'resolve_dispute' | 'force_close',
```

- [ ] **Step 5: Add the transition case**

Find the `case 'mark_shipped':` block and insert this case immediately AFTER its `break;`:

```ts
    case 'mark_delivered':
      toStatus = 'delivered';
      // MONEY-FREE BY CONSTRUCTION. `confirm_delivery` above routes to the
      // releaseOrderEscrow Cloud Function, so using it to record "the goods
      // arrived" would also pay the seller. The admin relay needs those
      // separate: goods arrive -> buyer accepts or rejects -> only THEN does
      // accounting release. So this writes status/shippingStatus only, and the
      // forbiddenFields guard below still rejects any escrow key.
      updateFields = {
        status: 'delivered',
        shippingStatus: 'delivered'
      };
      activityType = 'Package Delivered';
      activityMessageAr = 'تم تسليم الطرد للمشتري — بانتظار تأكيد الاستلام قبل تحرير المبلغ.';
      activityMessageEn = 'Parcel delivered to the buyer — awaiting acceptance before funds are released.';
      break;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/utils/orderWorkflow.test.ts`
Expected: PASS.

- [ ] **Step 7: Confirm the money guard by reading, and state it in your report**

Read the `forbiddenFields` / `forbiddenStatuses` / `forbiddenEscrows` block near the end of `executeOrderTransition`. Confirm in your report that `mark_delivered`'s `updateFields` contains no key in `forbiddenFields`, and that `'delivered'` is not in `forbiddenStatuses` (so it is allowed) while `'completed'` and `'refunded'` still are (so acceptance/refund cannot be smuggled through this action).

- [ ] **Step 8: Verify and commit**

Run: `set -o pipefail; npm run lint && npx vitest run && npm run build`

```bash
git add src/utils/orderWorkflow.ts src/utils/orderWorkflow.test.ts
git commit -m "feat(orders): mark_delivered — record delivery without releasing money

confirm_delivery routes to the releaseOrderEscrow Cloud Function, so marking
an order delivered also paid the seller. The admin relay needs them separate:
goods arrive -> buyer accepts or rejects -> only then does accounting release.

mark_delivered writes status/shippingStatus only. The existing client-side
forbidden-field guard still rejects every escrow/settlement key and the
completed/refunded statuses, so it cannot move money even if mis-called.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Carry a note into the activity record

`nudgeCount: 3` says three nudges fired. It does not say the seller promised a Tuesday courier. Without that, the next person picks up cold and chasing is indistinguishable from ignoring.

**Files:**
- Modify: `src/utils/orderWorkflow.ts`

**Interfaces:**
- Consumes: `mark_delivered` from Task 2.
- Produces: `executeOrderTransition(order, action, currentUser, { note?: string })` — the note lands on the activity record as `note`. Consumed by Task 5's UI.

- [ ] **Step 1: Widen `extraFields`**

In `src/utils/orderWorkflow.ts`, find:

```ts
  extraFields?: { trackingNumber?: string; resolutionType?: 'release' | 'refund' | 'resume'; disputeReason?: string }
```

Replace with:

```ts
  extraFields?: {
    trackingNumber?: string;
    resolutionType?: 'release' | 'refund' | 'resume';
    disputeReason?: string;
    /**
     * Free-text context from whoever advanced the order — "called seller,
     * courier collects Tuesday". Additive: the canned bilingual activity
     * message still goes to the buyer and seller, this is what the TEAM reads
     * when picking the order up next.
     */
    note?: string;
  }
```

- [ ] **Step 2: Write it onto the activity record**

Find the activity write inside `executeOrderTransition`:

```ts
    await addDoc(activityColRef, {
      id: activityId,
      type: activityType,
      messageAr: activityMessageAr,
      messageEn: activityMessageEn,
      message: activityMessageEn, // English default as requested
      performedBy: currentUser.id,
      performedByName: currentUser.name || 'User',
      timestamp: Timestamp.now()
    });
```

Replace with:

```ts
    const trimmedNote = typeof extraFields?.note === 'string' ? extraFields.note.trim() : '';
    await addDoc(activityColRef, {
      id: activityId,
      type: activityType,
      messageAr: activityMessageAr,
      messageEn: activityMessageEn,
      message: activityMessageEn, // English default as requested
      // Conditional spread: Firestore rejects an explicit `undefined`, and an
      // advance with no note must simply not carry the key.
      ...(trimmedNote ? { note: trimmedNote } : {}),
      performedBy: currentUser.id,
      performedByName: currentUser.name || 'User',
      timestamp: Timestamp.now()
    });
```

- [ ] **Step 3: Include the note in the admin audit entry**

Find the `adminActions` write:

```ts
        details: `Transitioned order from ${fromStatus} to ${toStatus} via action: ${action}`
```

Replace with:

```ts
        details: `Transitioned order from ${fromStatus} to ${toStatus} via action: ${action}`
          + (trimmedNote ? ` — note: ${trimmedNote}` : '')
```

- [ ] **Step 4: Verify and commit**

Run: `set -o pipefail; npm run lint && npx vitest run && npm run build`
Expected: all green.

```bash
git add src/utils/orderWorkflow.ts
git commit -m "feat(orders): carry a free-text note onto the activity record

nudgeCount says a nudge fired; it does not say the seller promised a Tuesday
courier. The note is additive — the canned bilingual message still goes to the
buyer and seller — and is what the team reads when picking an order up next.
Also appended to the adminActions audit entry.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Assignment fields + rules

Nothing records which team member is accountable for an order. This adds it, admin-only.

**Files:**
- Modify: `src/types.ts` (the `Order` interface)
- Modify: `firestore.rules` (the `orders` update denylist)

**Interfaces:**
- Produces: `Order.assignedToId?: string`, `Order.assignedToName?: string`. Consumed by Task 5.

- [ ] **Step 1: MANDATORY — audit every client path that writes an order**

Before adding a rule, find every client write to `orders`. Making `viewing` admin-only on auctions silently broke Seller Center relist, because `handleDuplicate` copied a lot by spreading the source doc and the new presence-guard denied it. Orders are `allow create: if false` (server-created only), which makes a repeat unlikely — but confirm it, do not assume.

Run:

```bash
grep -rn "collection(db, 'orders')\|doc(db, 'orders'\|'orders'," src/ | grep -v node_modules
```

For each hit, check whether it writes a **spread of an existing order doc** (dangerous — would carry `assignedToId` and trip the denylist) or an **explicit field set** (safe). Report every site and its verdict in your report. If you find a spread-based write by a non-admin, STOP and report it rather than proceeding.

- [ ] **Step 2: Add the fields to the Order type**

In `src/types.ts`, find the `Order` interface and add these fields at the end of it, before the closing brace:

```ts
  /**
   * Which team member is accountable for chasing this order along. Admin-only:
   * both fields are on the buyer/seller denylist in firestore.rules, so a
   * seller cannot reassign or clear ownership of their own order.
   */
  assignedToId?: string;
  assignedToName?: string;
```

- [ ] **Step 3: Add both fields to the buyer/seller denylist**

In `firestore.rules`, inside `match /orders/{orderId}`, find the `affectedKeys().hasAny([...])` list in the non-admin update branch and find this line:

```
            'lastNudgedAt', 'nudgeCount',
```

Replace with:

```
            'lastNudgedAt', 'nudgeCount',
            // Ownership of chasing an order is a Mazad ops decision — a seller
            // must not be able to reassign it away from the team member
            // accountable for it, or clear it so nobody appears responsible.
            'assignedToId', 'assignedToName',
```

- [ ] **Step 4: Verify the rules compile**

Run: `set -o pipefail; npx firebase deploy --only firestore:rules --project mazadjoapp --dry-run`
Expected: `✔ cloud.firestore: rules file firestore.rules compiled successfully` and `✔ Dry run complete!`. Nothing is released by a dry run.

Note in your report that the repo has **no rules test harness** (no `@firebase/rules-unit-testing`, no emulator config), so this is a syntax check plus the Step 1 audit — not a behavioural test.

- [ ] **Step 5: Verify and commit**

Run: `set -o pipefail; npm run lint && npx vitest run`

```bash
git add src/types.ts firestore.rules
git commit -m "feat(orders): admin-only assignment fields

assignedToId/assignedToName record which team member is accountable for
chasing an order. Both are on the buyer/seller denylist — a seller must not be
able to reassign ownership away from the person responsible, or clear it so
nobody appears accountable.

Audited every client order-write path first: orders are allow-create:false
(server-created only) and the client writes are explicit field sets, not
spreads of an existing doc — so the new denylist entries cannot break a
legitimate write the way the auctions viewing guard did.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The admin UI — advance, note, assign

The whole backend has existed all along; `AdminDashboardView` only ever called `executeOrderTransition` for `resolve_dispute`. This wires it up.

**Files:**
- Create: `src/utils/orderAdvance.ts`
- Test: `src/utils/orderAdvance.test.ts`
- Modify: `src/components/admin/FulfillmentSection.tsx`
- Modify: `src/components/AdminDashboardView.tsx`

**Interfaces:**
- Consumes: `bucketOrder`/`isOverdue` with `'awaiting_payment'` (Task 1); `'mark_delivered'` (Task 2); `extraFields.note` (Task 3); `assignedToId`/`assignedToName` (Task 4).
- Produces: `nextAdvance(status)` from `src/utils/orderAdvance.ts`.

- [ ] **Step 1: Write the failing test for the advance map**

The button must never offer an illegal jump, so the mapping from a status to its single next admin action is a pure, tested function.

Create `src/utils/orderAdvance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextAdvance } from './orderAdvance';
import { VALID_TRANSITIONS } from './orderWorkflow';

describe('nextAdvance', () => {
  it('maps each chaseable status to its one next admin action', () => {
    expect(nextAdvance('paid')).toEqual({ action: 'prepare_shipment', to: 'preparing_shipment' });
    expect(nextAdvance('preparing_shipment')).toEqual({ action: 'mark_shipped', to: 'shipped' });
    expect(nextAdvance('shipped')).toEqual({ action: 'mark_delivered', to: 'delivered' });
  });

  it('offers NOTHING for states the admin must not advance by hand', () => {
    // waiting_payment: the buyer pays, we chase — we do not mark it paid.
    expect(nextAdvance('waiting_payment')).toBeNull();
    // delivered -> completed is acceptance, which RELEASES MONEY. It stays its
    // own guarded escrow action, never a one-click advance.
    expect(nextAdvance('delivered')).toBeNull();
    expect(nextAdvance('disputed')).toBeNull();
    expect(nextAdvance('completed')).toBeNull();
    expect(nextAdvance('cancelled')).toBeNull();
    expect(nextAdvance('refunded')).toBeNull();
  });

  it('never proposes a target the FSM would reject', () => {
    for (const status of Object.keys(VALID_TRANSITIONS)) {
      const advance = nextAdvance(status);
      if (!advance) continue;
      expect(VALID_TRANSITIONS[status as keyof typeof VALID_TRANSITIONS]).toContain(advance.to);
    }
  });

  it('is null for an unknown or missing status rather than guessing', () => {
    expect(nextAdvance('banana')).toBeNull();
    expect(nextAdvance('')).toBeNull();
    expect(nextAdvance(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/orderAdvance.test.ts`
Expected: FAIL — `Failed to resolve import "./orderAdvance"`.

- [ ] **Step 3: Implement**

Create `src/utils/orderAdvance.ts`:

```ts
import type { OrderStatus } from './orderWorkflow';

/**
 * The ONE next stage an admin may advance an order to by hand, or null.
 *
 * The admin team runs the fulfillment relay by phone: they call the seller,
 * the seller acknowledges, and the admin records it here. This map is what the
 * "Advance" button offers, so it is deliberately narrow — every entry is a
 * transition `VALID_TRANSITIONS` already allows, and there is no way to reach
 * a stage out of order.
 *
 * Two states deliberately offer NOTHING:
 *  - `waiting_payment` — the buyer pays. The team chases them, but marking an
 *    order paid by hand would fake a payment that was never verified.
 *  - `delivered` — the next step is acceptance, which RELEASES MONEY. That
 *    stays the guarded escrow-release action, never a one-click advance.
 */
export interface OrderAdvance {
  action: 'prepare_shipment' | 'mark_shipped' | 'mark_delivered';
  to: OrderStatus;
}

const ADVANCE_MAP: Record<string, OrderAdvance> = {
  paid: { action: 'prepare_shipment', to: 'preparing_shipment' },
  preparing_shipment: { action: 'mark_shipped', to: 'shipped' },
  shipped: { action: 'mark_delivered', to: 'delivered' },
};

export function nextAdvance(status?: string | null): OrderAdvance | null {
  if (!status) return null;
  return ADVANCE_MAP[status] ?? null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/utils/orderAdvance.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add the fourth bucket to the UI config**

In `src/components/admin/FulfillmentSection.tsx`:

If Task 1 narrowed the local type, restore it to the full union:

```ts
type LiveBucket = Exclude<FulfillmentBucket, null>;
```

Then add this entry to the FRONT of the `BUCKETS` array (unpaid orders are the most urgent — money not collected):

```ts
  {
    id: 'awaiting_payment',
    title: { ar: 'بانتظار الدفع', en: 'Awaiting payment' },
    nameLabel: { ar: 'المشتري', en: 'Buyer' },
    nameField: 'buyerName',
  },
```

Then add the bucket to the `map` initialiser inside the `grouped` memo:

```ts
    const map: Record<LiveBucket, DerivedOrder[]> = {
      awaiting_payment: [],
      awaiting_shipment: [],
      awaiting_delivery: [],
      awaiting_release: [],
    };
```

And include it in `totalCount`:

```ts
  const totalCount =
    grouped.awaiting_payment.length +
    grouped.awaiting_shipment.length +
    grouped.awaiting_delivery.length +
    grouped.awaiting_release.length;
```

- [ ] **Step 6: Add the advance + assign controls to the row**

In `FulfillmentSection.tsx`, extend the props interface:

```ts
export interface FulfillmentSectionProps {
  isAr: boolean;
  orders: any[];                                  // realOrders (sim-excluded, matches Slice B's fix)
  onNudge: (orderId: string, kind: 'ship' | 'confirm_delivery') => Promise<void>;
  onReleaseEscrow: (orderId: string) => Promise<void>;
  /** Advance one stage, recording who did it and what they were told. */
  onAdvance: (order: any, note: string) => Promise<{ success: boolean; message?: string }>;
  /** Assign the order to a team member (or '' to unassign). */
  onAssign: (orderId: string, adminId: string, adminName: string) => Promise<{ success: boolean; message?: string }>;
  /** Admin users available to assign to. */
  adminUsers: Array<{ id: string; name: string }>;
  /** The signed-in admin, for the "mine only" filter. */
  currentAdminId: string;
}
```

Inside `FulfillmentRow`, add local state and the controls. Place this block immediately before the row's existing action button:

```tsx
{/* ---- Advance one stage, with a required note ---- */}
{(() => {
  const advance = nextAdvance(order.status);
  if (!advance) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        placeholder={isAr ? 'ماذا قال البائع/المشتري؟ (مطلوب)' : 'What did the seller/buyer say? (required)'}
        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-emerald-500"
      />
      <button
        type="button"
        disabled={busy || !note.trim()}
        onClick={async () => {
          setBusy(true);
          const res = await onAdvance(order, note.trim());
          setBusy(false);
          if (res.success) setNote('');
          else setFeedback(res.message || (isAr ? 'فشل التحديث.' : 'Update failed.'));
        }}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-[11px] py-1.5 rounded-lg transition-all cursor-pointer"
      >
        {ADVANCE_LABEL[advance.action][isAr ? 'ar' : 'en']}
      </button>
      {/* The trail records who ACTED, which is the admin — the note is what
          carries "seller confirmed courier collected". */}
      <p className="text-[9px] text-gray-400 leading-tight">
        {isAr
          ? 'سيُسجَّل باسمك في سجل الطلب.'
          : 'Recorded under your name in the order trail.'}
      </p>
    </div>
  );
})()}
```

Add this label map at module scope in the same file:

```ts
const ADVANCE_LABEL: Record<string, { ar: string; en: string }> = {
  prepare_shipment: { ar: 'البائع بدأ التجهيز', en: 'Seller started preparing' },
  mark_shipped: { ar: 'خرج للتوصيل', en: 'Out for delivery' },
  mark_delivered: { ar: 'تم التسليم للمشتري', en: 'Delivered to buyer' },
};
```

Import `nextAdvance` at the top:

```ts
import { nextAdvance } from '../../utils/orderAdvance';
```

The row needs `note` state alongside its existing busy/feedback state:

```ts
const [note, setNote] = useState('');
```

- [ ] **Step 7: Wire the handlers in the shell**

In `src/components/AdminDashboardView.tsx`, add these handlers near `handleSendFulfillmentNudge`:

```ts
  // Advance an order one stage by hand. The admin team runs this relay by
  // phone; executeOrderTransition already validates the FSM, writes the
  // activity + adminActions records, and notifies buyer and seller.
  const handleAdvanceOrder = useCallback(async (order: any, note: string) => {
    const advance = nextAdvance(order?.status);
    if (!advance) return { success: false, message: 'No next stage for this order.' };
    try {
      await executeOrderTransition(order, advance.action, currentUser as any, { note });
      return { success: true };
    } catch (err: any) {
      console.error('[handleAdvanceOrder] failed:', err);
      return { success: false, message: err?.message || 'Update failed.' };
    }
  }, [currentUser]);

  const handleAssignOrder = useCallback(async (orderId: string, adminId: string, adminName: string) => {
    if (!isAdminUser(currentUser)) return { success: false, message: 'Admins only.' };
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        assignedToId: adminId,
        assignedToName: adminName,
      });
      return { success: true };
    } catch (err: any) {
      console.error('[handleAssignOrder] failed:', err);
      return { success: false, message: err?.message || 'Assign failed.' };
    }
  }, [currentUser]);

  // Team members who can be assigned an order to chase.
  const adminUsers = useMemo(
    () => (users || []).filter((u: any) => isAdminUser(u)).map((u: any) => ({ id: u.id, name: u.name || u.email || u.id })),
    [users],
  );
```

Add the imports this needs at the top of `AdminDashboardView.tsx` (check which are already present before adding — the file already imports `executeOrderTransition`):

```ts
import { nextAdvance } from '../utils/orderAdvance';
import { isAdminUser } from '../utils/adminAuth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
```

Then pass them to the section, beside the existing `onNudge` / `onReleaseEscrow` props:

```tsx
              onAdvance={handleAdvanceOrder}
              onAssign={handleAssignOrder}
              adminUsers={adminUsers}
              currentAdminId={currentUser?.id || ''}
```

- [ ] **Step 8: Verify**

Run: `set -o pipefail; npm run lint && npx vitest run && npm run build`
Expected: `tsc` exits 0, full suite passes, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/utils/orderAdvance.ts src/utils/orderAdvance.test.ts src/components/admin/FulfillmentSection.tsx src/components/AdminDashboardView.tsx
git commit -m "feat(admin): advance orders by hand, with a required note and an owner

The backend for this relay existed all along — orderWorkflow is a finite state
machine that already permits admins every seller action and already writes the
activity record, the adminActions audit entry and buyer/seller notifications.
AdminDashboardView just never called it for anything but resolve_dispute.

nextAdvance() is a pure, tested map from a status to its ONE next admin action,
so the button can never offer an illegal jump. Two states deliberately offer
nothing: waiting_payment (marking it paid by hand would fake an unverified
payment) and delivered (the next step releases money, so it stays the guarded
escrow action).

The note is required on an admin advance — an advance with no note is exactly
what makes a trail useless.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Show the trail, and filter to mine

An audit trail nobody can read is not an audit trail.

**Files:**
- Modify: `src/components/admin/FulfillmentSection.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Add the "mine only" filter**

In `FulfillmentSection.tsx`, add local state near the top of the component:

```ts
// "Mine" is the point of assignment — a queue nobody filters is a queue
// nobody owns.
const [mineOnly, setMineOnly] = useState(false);
```

Filter inside the `grouped` memo, immediately after `if (!bucket) continue;`:

```ts
      if (mineOnly && order.assignedToId !== currentAdminId) continue;
```

Add `mineOnly` and `currentAdminId` to the memo's dependency array.

Render the toggle in the header block, beside the count:

```tsx
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
              mineOnly
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {isAr ? 'المسندة لي' : 'Mine'}
          </button>
```

- [ ] **Step 2: Add the assignment picker to each row**

Inside `FulfillmentRow`, place this above the advance block from Task 5:

```tsx
<div className="mt-2 flex items-center gap-1.5">
  <span className="text-[9px] font-bold text-gray-400 uppercase shrink-0">
    {isAr ? 'المسؤول' : 'Owner'}
  </span>
  <select
    value={order.assignedToId || ''}
    onChange={async (e) => {
      const id = e.target.value;
      const picked = adminUsers.find((a) => a.id === id);
      setBusy(true);
      const res = await onAssign(order.id, id, picked?.name || '');
      setBusy(false);
      if (!res.success) setFeedback(res.message || (isAr ? 'فشل الإسناد.' : 'Assign failed.'));
    }}
    disabled={busy}
    className="flex-1 min-w-0 text-[10px] px-2 py-1 rounded-lg border border-gray-200 bg-white outline-none focus:border-emerald-500 cursor-pointer"
  >
    <option value="">{isAr ? 'غير مسند' : 'Unassigned'}</option>
    {adminUsers.map((a) => (
      <option key={a.id} value={a.id}>{a.name}</option>
    ))}
  </select>
</div>
```

`FulfillmentRow` needs `adminUsers` and `onAssign` passed down. Add them to its prop type:

```ts
const FulfillmentRow: React.FC<{
  // ...existing props unchanged...
  onAssign: (orderId: string, adminId: string, adminName: string) => Promise<{ success: boolean; message?: string }>;
  adminUsers: Array<{ id: string; name: string }>;
}> = ({ /* ...existing... */ onAssign, adminUsers }) => {
```

and pass them at the single place the section renders a row, alongside the props it already forwards:

```tsx
                  onAssign={onAssign}
                  adminUsers={adminUsers}
```

Read the existing `<FulfillmentRow ... />` call before editing — forward the new props without disturbing the ones already there.

- [ ] **Step 3: Show the last note inline**

The full activity trail lives in a subcollection this section does not subscribe to. Rather than add a listener per row, surface what the order doc already carries. Inside `FulfillmentRow`, below the owner picker:

```tsx
{order.assignedToName && (
  <p className="text-[9px] text-gray-400 mt-1">
    {isAr ? `المسؤول: ${order.assignedToName}` : `Owner: ${order.assignedToName}`}
  </p>
)}
```

Note in your report that the per-order activity trail (with notes) is visible on the existing order-details surface, and that adding a per-row listener here was deliberately avoided — this section documents that it "creates NO Firestore listeners", and breaking that would regress admin performance.

- [ ] **Step 4: Verify**

Run: `set -o pipefail; npm run lint && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 5: Commit and push**

```bash
git add src/components/admin/FulfillmentSection.tsx
git commit -m "feat(admin): owner picker and a mine-only filter on the fulfillment queue

A queue nobody filters is a queue nobody owns. Deliberately does NOT add a
per-row activity listener — this section documents that it creates no
Firestore listeners, and the full trail is already on the order-details
surface.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/admin-order-pipeline
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --title "feat(admin): order pipeline — advance by hand, with a note and an owner" --body "Implements docs/superpowers/specs/2026-07-27-order-pipeline-design.md

**Touches firestore.rules, so merging deploys rules to production.**

## Why

The admin team runs post-auction fulfillment as a human relay: they phone the seller, the seller acknowledges, the admin records it. They could not record any of it — \`AdminDashboardView\` only ever called \`executeOrderTransition\` for \`resolve_dispute\`.

## What already existed

Most of it. \`orderWorkflow.ts\` is a finite state machine that already permits admins every buyer and seller action, and every transition already writes an activity record, an \`adminActions\` audit entry and notifications to both parties. The customer status bar reads the same \`order.status\`, so advancing an order updates what buyers and sellers already see. There was simply no button.

## What this adds

- **\`mark_delivered\`** — records delivery WITHOUT releasing money. \`confirm_delivery\` routes to the escrow-release Cloud Function, so it could not be used for \"the goods arrived\". Money path untouched.
- **A required note** on admin advances, landing on the activity record and the audit entry.
- **\`assignedToId\`/\`assignedToName\`** — admin-only, on the buyer/seller denylist.
- **An \`awaiting_payment\` queue** — unpaid orders were in NO queue. Overdue uses each order's own \`paymentWindowHours\`.
- **The UI** — advance, note, owner picker, mine-only filter.

## Safety

\`nextAdvance()\` is pure and tested: it offers exactly one next action per status and never a target the FSM would reject. It deliberately offers nothing for \`waiting_payment\` (marking paid by hand would fake an unverified payment) and nothing for \`delivered\` (acceptance releases money, so it stays the guarded escrow action).

## Verification

\`tsc --noEmit\` clean, full vitest suite, \`vite build\` clean, rules compiled via dry-run. No rules test harness exists in this repo, so the denylist is verified by syntax check plus a full audit of client order-write paths (reported in the task).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Notes for the implementer

- **Never** write an escrow, payment-settlement or payout field from `executeOrderTransition`. The forbidden-field guard exists because a client must not move money.
- **Never** add a status to `ADVANCE_MAP` without checking `VALID_TRANSITIONS` allows it — a test enforces this, do not weaken it.
- Arabic strings are copied verbatim in this plan. Paste them; do not retype.
