# Wave 4 — Admin Action Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five action tabs of the admin panel with one Action Center queue that shows only what needs a human — each row carrying why it is there and how long it has waited — leaving Mazad's own drop pipeline as its own tab and the reference tabs untouched.

**Architecture:** All ranking, SLA evaluation and reason derivation live in one pure function, `buildActionQueue`, in `src/utils/actionQueue.ts` — no Firestore, no React. `ActionCenterSection` renders its output and owns expand/collapse; each expanded row delegates to a per-item card extracted from the section it replaces. `AdminDashboardView` already subscribes to every collection involved, so no new subscriptions are added.

**Tech Stack:** React 19 + TypeScript (Vite), Firebase v12 client SDK, Vitest (node environment, no jsdom).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-28-wave4-action-center-design.md`. Read it before starting.
- **One SLA number: 24 hours.** Ship, deliver-confirm, and every money/listing row age against 24h. MJ: *"shipment has to happen asap within 24 hrs after payment is made… its basically all in amman or surrounding areas."* Do not introduce a second threshold.
- **Vitest is `environment: 'node'` — no jsdom, no `@testing-library/react`.** Component rendering tests are impossible. Logic left in JSX ships untested; that is why the builder is pure. Components are verified by `npm run build` plus a browser pass.
- **Bilingual, Arabic-primary.** Row labels follow the file's existing `isAr ? '…' : '…'` idiom. The builder returns `label: { ar, en }` and never renders.
- **Money is fils** everywhere in this codebase. `amountFils`, not JOD.
- **Never invent an age.** A row whose timestamp is unusable sorts as `new` and shows no age, rather than "waiting 56 years".
- **Simulated data is excluded.** Use `realOrders` / `realAuctions` (the `isSimulated !== true` filters already in `AdminDashboardView`), matching every existing badge.
- **Run `npx vitest run` from the repo root.** It covers `src/**/*.test.ts` and `functions/**/*.test.js`.

## Spec correction (data model)

The spec's `ActionQueueInput` listed a `disputes: []` array. **There is no disputes collection feeding the admin badges.** `AdminDashboardView.tsx:229` derives `openDisputesCount` from `realOrders.filter(o => o.status === 'disputed')`, and return claims live on `order.returnClaim` (see `functions/returns.js` `buildReturnClaim`). Dispute and return rows are therefore derived from **orders**. The input shape in Task 1 is authoritative; the spec's is not.

## File Structure

**New**
- `src/utils/actionQueue.ts` — types, `buildActionQueue`, severity/ordering. The whole brain.
- `src/utils/actionQueue.test.ts`
- `src/components/admin/ActionCenterSection.tsx` — list + expand/collapse. No business logic.
- `src/components/admin/cards/ListingApprovalCard.tsx` — from `LaunchSection`
- `src/components/admin/cards/DisputeCard.tsx` — from `DisputesSection`
- `src/components/admin/cards/PayoutCard.tsx` — from `PayoutsSection`
- `src/components/admin/cards/StalledDeliveryCard.tsx` — from `FulfillmentSection`
- `src/components/admin/OurDropsSection.tsx` — `LaunchSection` minus the approval path

**Modified**
- `src/utils/adminNav.ts` — tab ids, primary tabs, legacy map; delete `computeAttentionCounts`
- `src/utils/fulfillmentQueues.ts` — `THRESHOLDS` to 24h/24h
- `src/components/AdminDashboardView.tsx` — render the Action Center, drop four tabs
- `src/components/admin/AdminHome.tsx` — **deleted** (replaced by `ActionCenterSection`)

**Untouched:** `PaymentVerifyCard.tsx` (already standalone — reused as-is, and the pattern the other four cards copy), and every reference tab.

---

### Task 1: Queue types, money rows, and the ordering core

The three money rows are the simplest — no cross-entity derivation — so they carry the shared severity and ordering logic into existence.

**Files:**
- Create: `src/utils/actionQueue.ts`, `src/utils/actionQueue.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ActionKind`, `ActionReason`, `ActionRow`, `ActionQueueInput`, `buildActionQueue(input: ActionQueueInput, nowMs: number): ActionRow[]`, `SLA_MS`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/actionQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildActionQueue, SLA_MS, type ActionQueueInput } from './actionQueue';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const empty: ActionQueueInput = {
  orders: [], pendingListings: [], subscriptionRequests: [], withdrawals: [],
};

const input = (over: Partial<ActionQueueInput>): ActionQueueInput => ({ ...empty, ...over });

describe('buildActionQueue — the empty state', () => {
  it('returns nothing when nothing needs a human', () => {
    expect(buildActionQueue(empty, NOW)).toEqual([]);
  });
});

describe('buildActionQueue — money rows', () => {
  it('raises a row for an order payment awaiting verification', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentProofUrl: 'https://x/r.png',
        paymentVerified: false, totalDue: 10,
        paymentSubmittedAt: { seconds: (NOW - 2 * HOUR) / 1000 },
      }],
    }), NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('verify_order_payment');
    expect(rows[0].reason).toBe('receipt_to_verify');
    expect(rows[0].entityId).toBe('o1');
    expect(rows[0].id).toBe('verify_order_payment:o1');
    expect(rows[0].severity).toBe('new');
    expect(rows[0].amountFils).toBe(10_000);
  });

  it('ages an order payment past the 24h SLA', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentProofUrl: 'https://x/r.png',
        paymentVerified: false,
        paymentSubmittedAt: { seconds: (NOW - 25 * HOUR) / 1000 },
      }],
    }), NOW);
    expect(rows[0].severity).toBe('aging');
  });

  it('does not raise a row for an already-verified payment', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentProofUrl: 'https://x/r.png', paymentVerified: true,
      }],
    }), NOW);
    expect(rows.filter(r => r.kind === 'verify_order_payment')).toHaveLength(0);
  });

  it('raises a row for a membership request and a pending payout', () => {
    const rows = buildActionQueue(input({
      subscriptionRequests: [{ id: 's1', userId: 'u1', createdAt: NOW - 3 * HOUR }],
      withdrawals: [{ id: 'w1', userId: 'u2', status: 'pending_review', amount: 25, timestamp: NOW - HOUR }],
    }), NOW);

    expect(rows.map(r => r.kind).sort()).toEqual(['payout', 'verify_membership']);
    const payout = rows.find(r => r.kind === 'payout')!;
    expect(payout.reason).toBe('payout_to_approve');
    expect(payout.amountFils).toBe(25_000);
  });

  it('ignores a withdrawal that is not pending review', () => {
    const rows = buildActionQueue(input({
      withdrawals: [{ id: 'w1', userId: 'u2', status: 'completed', amount: 25, timestamp: NOW }],
    }), NOW);
    expect(rows).toEqual([]);
  });
});

describe('buildActionQueue — ordering', () => {
  it('sorts aging before new, then oldest first, then larger amount first', () => {
    const rows = buildActionQueue(input({
      subscriptionRequests: [{ id: 'fresh', userId: 'u', createdAt: NOW - HOUR }],
      withdrawals: [
        { id: 'old-small', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - 40 * HOUR },
        { id: 'old-big', userId: 'u', status: 'pending_review', amount: 500, timestamp: NOW - 40 * HOUR },
      ],
    }), NOW);

    // Both withdrawals are aging and equally old, so the larger amount wins the tie.
    expect(rows.map(r => r.entityId)).toEqual(['old-big', 'old-small', 'fresh']);
  });

  it('is deterministic — the same input yields the same order', () => {
    const i = input({
      withdrawals: [
        { id: 'a', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - HOUR },
        { id: 'b', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - HOUR },
      ],
    });
    expect(buildActionQueue(i, NOW).map(r => r.id)).toEqual(buildActionQueue(i, NOW).map(r => r.id));
  });
});

describe('buildActionQueue — malformed input never breaks the queue', () => {
  it('keeps other rows when one document is unusable', () => {
    const rows = buildActionQueue(input({
      withdrawals: [
        { id: 'good', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - HOUR },
        null as any,
        { status: 'pending_review' } as any,   // no id
      ],
    }), NOW);
    expect(rows.map(r => r.entityId)).toContain('good');
  });

  it('shows no age for an unusable timestamp and sorts it as new', () => {
    const rows = buildActionQueue(input({
      withdrawals: [{ id: 'w', userId: 'u', status: 'pending_review', amount: 5, timestamp: 'garbage' as any }],
    }), NOW);
    expect(rows[0].waitingSinceMs).toBeNull();
    expect(rows[0].severity).toBe('new');
  });

  it('exposes the SLA as one number', () => {
    expect(SLA_MS).toBe(24 * HOUR);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/actionQueue.test.ts`
Expected: FAIL — cannot resolve `./actionQueue`

- [ ] **Step 3: Write the module**

Create `src/utils/actionQueue.ts`:

```ts
/**
 * Wave 4 — the admin Action Center queue.
 *
 * ONE pure function decides everything the admin panel puts in front of a
 * human: what qualifies, why, how urgent, and in what order. It touches no
 * Firestore and renders nothing, because vitest here is `environment: 'node'`
 * with no jsdom — logic left in a component ships untested. If the queue
 * DECIDES something, it belongs in this file.
 *
 * Post-Wave-3 this queue should be near-empty on a healthy day. A row means the
 * self-service flow did not complete.
 */
import { isPendingOrderPayment } from './paymentReceipt';

export type ActionKind =
  | 'verify_order_payment'
  | 'verify_membership'
  | 'approve_listing'
  | 'payout'
  | 'delivery_stalled'
  | 'dispute';

export type ActionReason =
  | 'receipt_to_verify'
  | 'membership_to_verify'
  | 'lot_awaiting_review'
  | 'payout_to_approve'
  | 'seller_hasnt_prepped'
  | 'buyer_hasnt_confirmed'
  | 'code_attempts_exhausted'
  | 'dispute_open'
  | 'return_claim';

export type ActionSeverity = 'blocking' | 'aging' | 'new';

export interface ActionRow {
  /** `${kind}:${entityId}` — stable across rebuilds, so React keys and expand state survive. */
  id: string;
  kind: ActionKind;
  entityId: string;
  reason: ActionReason;
  /** Epoch ms the wait started, or null when the source timestamp is unusable. */
  waitingSinceMs: number | null;
  severity: ActionSeverity;
  amountFils?: number;
  label: { ar: string; en: string };
}

export interface ActionQueueInput {
  /** Real (sim-excluded) orders. Drives payments, stalled deliveries, disputes and returns. */
  orders: any[];
  /** Auctions under review — status 'processing' or legacy 'pending'. */
  pendingListings: any[];
  subscriptionRequests: any[];
  withdrawals: any[];
}

/**
 * One number for the whole operation. MJ: shipment within 24h of payment, and
 * delivery is Amman and surrounding areas. Nobody should have to remember which
 * queue has which clock.
 */
export const SLA_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize a stored timestamp to epoch ms, or null.
 *
 * Rejects rather than coerces — the same discipline as `deadlineToMs` in
 * fulfillmentQueues.ts. A junk value that read as epoch 0 would mark its row
 * eternally overdue and park it permanently at the top of the queue.
 */
function toMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (value && typeof value === 'object') {
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return null;
}

/** JOD (as stored on legacy docs) → fils. Returns undefined for junk. */
function toFils(jod: unknown): number | undefined {
  const n = Number(jod);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
}

function severityFor(reason: ActionReason, waitingSinceMs: number | null, nowMs: number): ActionSeverity {
  // Blocking is about state, not age: the counterparty cannot proceed without a
  // human no matter how recent it is.
  if (reason === 'dispute_open' || reason === 'return_claim' || reason === 'code_attempts_exhausted') {
    return 'blocking';
  }
  if (waitingSinceMs === null) return 'new';
  return nowMs - waitingSinceMs > SLA_MS ? 'aging' : 'new';
}

const SEVERITY_RANK: Record<ActionSeverity, number> = { blocking: 0, aging: 1, new: 2 };

function row(
  kind: ActionKind,
  entityId: string,
  reason: ActionReason,
  waitingSinceMs: number | null,
  nowMs: number,
  label: { ar: string; en: string },
  amountFils?: number,
): ActionRow {
  return {
    id: `${kind}:${entityId}`,
    kind,
    entityId,
    reason,
    waitingSinceMs,
    severity: severityFor(reason, waitingSinceMs, nowMs),
    ...(amountFils !== undefined ? { amountFils } : {}),
    label,
  };
}

export function buildActionQueue(input: ActionQueueInput, nowMs: number): ActionRow[] {
  const rows: ActionRow[] = [];
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const withdrawals = Array.isArray(input.withdrawals) ? input.withdrawals : [];
  const subs = Array.isArray(input.subscriptionRequests) ? input.subscriptionRequests : [];

  // --- Money: order payments awaiting verification ------------------------
  // Same predicate the Verify queue uses, so the queue and that view can never
  // disagree about what is pending.
  for (const o of orders) {
    if (!o || !o.id) continue;
    if (!isPendingOrderPayment(o)) continue;
    rows.push(row(
      'verify_order_payment', o.id, 'receipt_to_verify',
      toMs(o.paymentSubmittedAt) ?? toMs(o.updatedAt),
      nowMs,
      { ar: 'إيصال دفع بانتظار التحقق', en: 'Payment receipt to verify' },
      toFils(o.totalDue ?? o.winningBidAmount),
    ));
  }

  // --- Money: membership requests -----------------------------------------
  for (const s of subs) {
    if (!s || !s.id) continue;
    rows.push(row(
      'verify_membership', s.id, 'membership_to_verify',
      toMs(s.createdAt),
      nowMs,
      { ar: 'طلب عضوية بانتظار التحقق', en: 'Membership request to verify' },
    ));
  }

  // --- Money: payouts ------------------------------------------------------
  for (const w of withdrawals) {
    if (!w || !w.id) continue;
    if (w.status !== 'pending_review') continue;
    rows.push(row(
      'payout', w.id, 'payout_to_approve',
      toMs(w.timestamp),
      nowMs,
      { ar: 'طلب سحب بانتظار الموافقة', en: 'Payout awaiting approval' },
      toFils(w.amount),
    ));
  }

  return sortQueue(rows);
}

/**
 * Severity, then oldest first, then larger amount first. Fully deterministic —
 * no tie is left to array order, so the queue does not reshuffle between
 * renders when two rows are otherwise equal.
 */
export function sortQueue(rows: ActionRow[]): ActionRow[] {
  return [...rows].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    const aw = a.waitingSinceMs ?? Number.POSITIVE_INFINITY;
    const bw = b.waitingSinceMs ?? Number.POSITIVE_INFINITY;
    if (aw !== bw) return aw - bw;
    const amt = (b.amountFils ?? 0) - (a.amountFils ?? 0);
    if (amt !== 0) return amt;
    return a.id.localeCompare(b.id);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/actionQueue.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/actionQueue.ts src/utils/actionQueue.test.ts
git commit -m "feat(wave4): action queue types, money rows and deterministic ordering"
```

---

### Task 2: Listing and trouble rows

**Files:**
- Modify: `src/utils/actionQueue.ts`, `src/utils/actionQueue.test.ts`

**Interfaces:**
- Consumes: `buildActionQueue`, `row`, `toMs` (Task 1).
- Produces: rows of kind `approve_listing` and `dispute` (reasons `lot_awaiting_review`, `dispute_open`, `return_claim`).

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/actionQueue.test.ts`:

```ts
describe('buildActionQueue — listings awaiting review', () => {
  it('raises a row per pending listing, titled with the lot', () => {
    const rows = buildActionQueue(input({
      pendingListings: [{ id: 'a1', title: 'iPhone 15', createdAt: NOW - 2 * HOUR }],
    }), NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('approve_listing');
    expect(rows[0].reason).toBe('lot_awaiting_review');
    expect(rows[0].label.en).toContain('iPhone 15');
  });

  it('ages a listing past 24h — a seller waiting on approval is a seller not selling', () => {
    const rows = buildActionQueue(input({
      pendingListings: [{ id: 'a1', title: 'x', createdAt: NOW - 25 * HOUR }],
    }), NOW);
    expect(rows[0].severity).toBe('aging');
  });

  it('falls back to a generic label when the lot has no title', () => {
    const rows = buildActionQueue(input({
      pendingListings: [{ id: 'a1', createdAt: NOW }],
    }), NOW);
    expect(rows[0].label.en.length).toBeGreaterThan(0);
    expect(rows[0].label.ar.length).toBeGreaterThan(0);
  });
});

describe('buildActionQueue — trouble', () => {
  it('raises a blocking row for a disputed order regardless of age', () => {
    const rows = buildActionQueue(input({
      orders: [{ id: 'o1', status: 'disputed', updatedAt: { seconds: NOW / 1000 }, winningBidAmount: 100 }],
    }), NOW);

    expect(rows[0].kind).toBe('dispute');
    expect(rows[0].reason).toBe('dispute_open');
    expect(rows[0].severity).toBe('blocking');
    expect(rows[0].amountFils).toBe(100_000);
  });

  it('distinguishes a return claim from a plain dispute', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'disputed', disputeType: 'return',
        returnClaim: { status: 'open', reason: 'damaged' },
        updatedAt: { seconds: NOW / 1000 },
      }],
    }), NOW);
    expect(rows[0].reason).toBe('return_claim');
  });

  it('does not raise trouble rows for a resolved claim on a live order', () => {
    const rows = buildActionQueue(input({
      orders: [{ id: 'o1', status: 'completed', returnClaim: { status: 'resolved_denied' } }],
    }), NOW);
    expect(rows).toEqual([]);
  });

  it('puts blocking rows above aging ones', () => {
    const rows = buildActionQueue(input({
      orders: [{ id: 'disputed', status: 'disputed', updatedAt: { seconds: NOW / 1000 } }],
      withdrawals: [{ id: 'oldpayout', userId: 'u', status: 'pending_review', amount: 9, timestamp: NOW - 100 * HOUR }],
    }), NOW);
    expect(rows.map(r => r.kind)).toEqual(['dispute', 'payout']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/utils/actionQueue.test.ts`
Expected: FAIL — no listing or dispute rows are produced

- [ ] **Step 3: Implement**

In `src/utils/actionQueue.ts`, inside `buildActionQueue` before `return sortQueue(rows)`:

```ts
  // --- Customer lots awaiting review --------------------------------------
  // Doubly important since PR #188: approving a lot is what grants the seller
  // their account, so a lot sitting here is a seller who cannot trade at all.
  const listings = Array.isArray(input.pendingListings) ? input.pendingListings : [];
  for (const a of listings) {
    if (!a || !a.id) continue;
    const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim() : '';
    rows.push(row(
      'approve_listing', a.id, 'lot_awaiting_review',
      toMs(a.createdAt),
      nowMs,
      {
        ar: title ? `مزاد بانتظار الاعتماد: ${title}` : 'مزاد بانتظار الاعتماد',
        en: title ? `Lot awaiting approval: ${title}` : 'Lot awaiting approval',
      },
    ));
  }

  // --- Trouble: disputes and return claims --------------------------------
  // Derived from ORDERS, not a disputes collection — that is what
  // AdminDashboardView's openDisputesCount does, and returnClaim lives on the
  // order (functions/returns.js buildReturnClaim). Always blocking: a dispute
  // is someone stuck, however recent.
  for (const o of orders) {
    if (!o || !o.id) continue;
    if (o.status !== 'disputed') continue;
    const isReturn = o.disputeType === 'return' || (o.returnClaim && o.returnClaim.status === 'open');
    rows.push(row(
      'dispute', o.id, isReturn ? 'return_claim' : 'dispute_open',
      toMs(o.updatedAt),
      nowMs,
      isReturn
        ? { ar: 'طلب إرجاع بحاجة إلى قرار', en: 'Return claim needs a decision' }
        : { ar: 'نزاع مفتوح', en: 'Open dispute' },
      toFils(o.winningBidAmount),
    ));
  }
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run src/utils/actionQueue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/actionQueue.ts src/utils/actionQueue.test.ts
git commit -m "feat(wave4): listing-approval and dispute/return rows"
```

---

### Task 3: Stalled deliveries and the 24h SLAs

The row family Wave 3 created the need for, and the SLA change MJ asked for. Both in one task because the tests for the first depend on the second.

**Files:**
- Modify: `src/utils/fulfillmentQueues.ts:14-18` (THRESHOLDS), `src/utils/actionQueue.ts`
- Test: `src/utils/fulfillmentQueues.test.ts`, `src/utils/actionQueue.test.ts`

**Interfaces:**
- Consumes: `buildActionQueue` (Tasks 1–2).
- Produces: rows of kind `delivery_stalled` with reasons `seller_hasnt_prepped`, `buyer_hasnt_confirmed`, `code_attempts_exhausted`.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/fulfillmentQueues.test.ts`:

```ts
describe('Wave 4 — the operation runs on a 24h clock', () => {
  it('flags an unshipped order 24h after payment, not 48h', () => {
    expect(isOverdue({ status: 'preparing_shipment', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
    expect(isOverdue({ status: 'preparing_shipment', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
  });

  it('flags an unconfirmed delivery 24h after dispatch, not 5 days', () => {
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
  });
});
```

Append to `src/utils/actionQueue.test.ts`:

```ts
describe('buildActionQueue — stalled deliveries (the Wave 3 chain did not complete)', () => {
  it('raises nothing for a healthy in-flight order', () => {
    const rows = buildActionQueue(input({
      orders: [
        { id: 'fresh-paid', status: 'paid', paymentVerified: true, updatedAt: { seconds: (NOW - HOUR) / 1000 } },
        { id: 'fresh-out', status: 'out_for_delivery', updatedAt: { seconds: (NOW - HOUR) / 1000 } },
      ],
    }), NOW);
    expect(rows).toEqual([]);
  });

  it('raises a row when the seller has not prepped 24h after payment cleared', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentVerified: true,
        winningBidAmount: 50, updatedAt: { seconds: (NOW - 30 * HOUR) / 1000 },
      }],
    }), NOW);

    expect(rows[0].kind).toBe('delivery_stalled');
    expect(rows[0].reason).toBe('seller_hasnt_prepped');
    expect(rows[0].severity).toBe('aging');
  });

  it('raises a row when the buyer has not confirmed 24h after dispatch', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'out_for_delivery',
        updatedAt: { seconds: (NOW - 30 * HOUR) / 1000 },
      }],
    }), NOW);
    expect(rows[0].reason).toBe('buyer_hasnt_confirmed');
  });

  it('raises a BLOCKING row when the buyer has burned all delivery-code attempts', () => {
    // 5/5 attempts means the buyer is locked out and cannot self-serve at all —
    // urgent regardless of how recently it happened.
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'out_for_delivery', deliveryCodeAttempts: 5,
        updatedAt: { seconds: (NOW - HOUR) / 1000 },
      }],
    }), NOW);

    expect(rows[0].reason).toBe('code_attempts_exhausted');
    expect(rows[0].severity).toBe('blocking');
  });

  it('raises one row per order, not one per reason', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'out_for_delivery', deliveryCodeAttempts: 5,
        updatedAt: { seconds: (NOW - 30 * HOUR) / 1000 },
      }],
    }), NOW);
    expect(rows.filter(r => r.entityId === 'o1')).toHaveLength(1);
  });

  it('never raises a stalled row for a completed or cancelled order', () => {
    for (const status of ['completed', 'cancelled', 'refunded']) {
      const rows = buildActionQueue(input({
        orders: [{ id: 'o1', status, updatedAt: { seconds: (NOW - 100 * HOUR) / 1000 } }],
      }), NOW);
      expect(rows).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/utils/actionQueue.test.ts src/utils/fulfillmentQueues.test.ts`
Expected: FAIL — 48h/5-day thresholds still pass, and no `delivery_stalled` rows exist

- [ ] **Step 3: Tighten the SLAs**

In `src/utils/fulfillmentQueues.ts`, replace the `THRESHOLDS` constant:

```ts
/**
 * Wave 4 — one clock for the whole operation: 24 hours.
 *
 * Was 48h to ship and FIVE DAYS to deliver. MJ, 2026-07-28: shipment happens
 * within 24h of payment, and delivery is Amman and surrounding areas — five
 * days of silence was nearly a week of invisible drift on a same-city handoff.
 *
 * Client-only: functions/fulfillmentNudge.js re-implements bucketOrder but
 * reads no thresholds, so this changes the admin view and nothing server-side.
 *
 * `awaiting_release` is unchanged and now applies only to legacy `delivered`
 * orders — under Wave 3 the buyer confirms straight from `out_for_delivery`.
 */
const THRESHOLDS: Record<Exclude<FulfillmentBucket, null | 'awaiting_payment'>, number> = {
  awaiting_shipment: 24 * HOUR_MS,
  awaiting_delivery: 24 * HOUR_MS,
  awaiting_release: 24 * HOUR_MS,
};
```

- [ ] **Step 4: Add the stalled-delivery rows**

In `src/utils/actionQueue.ts`, add the import at the top:

```ts
import { bucketOrder, isOverdue } from './fulfillmentQueues';
```

and inside `buildActionQueue`, after the trouble loop:

```ts
  // --- Stalled deliveries --------------------------------------------------
  // ONE row per order, not one per reason: the admin needs the order, and a
  // single order producing three rows would be the noise this wave removes.
  // Reasons are ordered by urgency — a locked-out buyer outranks mere lateness.
  for (const o of orders) {
    if (!o || !o.id) continue;
    if (o.status === 'disputed') continue;       // already a trouble row above

    const lockedOut = Number(o.deliveryCodeAttempts) >= 5 && o.status === 'out_for_delivery';

    const updatedAtMs = toMs(o.updatedAt) ?? toMs(o.createdAt);
    const overdue = updatedAtMs !== null && isOverdue(
      {
        status: o.status,
        paymentVerified: o.paymentVerified,
        paymentWindowHours: o.paymentWindowHours,
        paymentDeadlineAt: o.paymentDeadlineAt,
        updatedAtMs,
      },
      nowMs,
    );

    // `awaiting_payment` is the buyer owing money, not a stalled delivery — the
    // payment-default enforcer already handles it, and surfacing it here would
    // refill the queue with orders nobody can act on.
    const bucket = bucketOrder({ status: o.status, paymentVerified: o.paymentVerified });
    const isDeliveryBucket = bucket === 'awaiting_shipment' || bucket === 'awaiting_delivery' || bucket === 'awaiting_release';

    if (!lockedOut && (!overdue || !isDeliveryBucket)) continue;

    const reason: ActionReason = lockedOut
      ? 'code_attempts_exhausted'
      : bucket === 'awaiting_shipment'
        ? 'seller_hasnt_prepped'
        : 'buyer_hasnt_confirmed';

    const label = {
      code_attempts_exhausted: { ar: 'المشتري استنفد محاولات رمز التسليم', en: 'Buyer locked out of delivery code' },
      seller_hasnt_prepped: { ar: 'البائع لم يبدأ التجهيز', en: "Seller hasn't started preparing" },
      buyer_hasnt_confirmed: { ar: 'المشتري لم يؤكد الاستلام', en: "Buyer hasn't confirmed receipt" },
    }[reason];

    rows.push(row('delivery_stalled', o.id, reason, updatedAtMs, nowMs, label, toFils(o.winningBidAmount)));
  }
```

- [ ] **Step 5: Run to verify passing**

Run: `npx vitest run src/utils/actionQueue.test.ts src/utils/fulfillmentQueues.test.ts`
Expected: PASS

- [ ] **Step 6: Run the whole suite — the SLA change has reach**

Run: `npx vitest run`
Expected: PASS. If `fulfillmentNudge.test.js` fails, the server does read a threshold after all and the spec's blast-radius claim is wrong — **stop and report** rather than editing the server to match.

- [ ] **Step 7: Commit**

```bash
git add src/utils/actionQueue.ts src/utils/actionQueue.test.ts src/utils/fulfillmentQueues.ts src/utils/fulfillmentQueues.test.ts
git commit -m "feat(wave4): stalled-delivery rows + tighten SLAs to 24h ship / 24h confirm"
```

---

### Task 4: Reshape the admin navigation

**Files:**
- Modify: `src/utils/adminNav.ts`
- Test: `src/utils/adminNav.test.ts` (exists — check its current cases before editing)

**Interfaces:**
- Consumes: nothing.
- Produces: `AdminTabId` without `'home' | 'verify' | 'fulfillment' | 'disputes' | 'payouts' | 'launch'` and with `'action-center' | 'our-drops'`; `ADMIN_TAB_DEFAULT = 'action-center'`. `computeAttentionCounts`, `AttentionInput`, `AttentionCounts` are **removed**.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/adminNav.test.ts`:

```ts
describe('Wave 4 — the panel is a queue plus reference', () => {
  it('has exactly two primary tabs: the queue and our own drops', () => {
    expect(ADMIN_PRIMARY_TABS).toEqual(['action-center', 'our-drops']);
    expect(ADMIN_TAB_DEFAULT).toBe('action-center');
  });

  it('keeps every reference tab', () => {
    expect(ADMIN_REFERENCE_TABS).toEqual(['orders', 'members', 'auction-lookup', 'audit', 'system']);
  });

  it('redirects every dissolved tab to the Action Center — no bookmark breaks', () => {
    for (const old of ['home', 'verify', 'fulfillment', 'disputes', 'payouts', 'metrics', 'payments', 'subscriptions', 'withdrawals']) {
      expect(migrateStoredAdminTab(old)).toBe('action-center');
    }
  });

  it('sends the old launch tab to our drops, where that work now lives', () => {
    expect(migrateStoredAdminTab('launch')).toBe('our-drops');
    expect(migrateStoredAdminTab('listings')).toBe('our-drops');
  });

  it('still migrates the legacy reference aliases', () => {
    expect(migrateStoredAdminTab('users')).toBe('members');
    expect(migrateStoredAdminTab('sessions')).toBe('system');
    expect(migrateStoredAdminTab('simulator')).toBe('system');
  });

  it('falls back to the queue for junk', () => {
    expect(migrateStoredAdminTab('nonsense')).toBe('action-center');
    expect(migrateStoredAdminTab(null)).toBe('action-center');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/utils/adminNav.test.ts`
Expected: FAIL

- [ ] **Step 3: Rewrite the nav module**

Replace the top of `src/utils/adminNav.ts` (keep `migrateStoredAdminTab`'s shape):

```ts
/**
 * Wave 4 — the admin panel is one queue plus reference.
 *
 * `verify`, `fulfillment`, `disputes` and `payouts` are gone as tabs: their
 * work is Action Center rows and their per-item cards are row bodies. `launch`
 * became `our-drops` after shedding customer-lot approval, which is now a queue
 * row — the tab used to mix Mazad-as-operator with Mazad-as-referee.
 *
 * `computeAttentionCounts` is deleted. The queue's length is the single source
 * of "how much is waiting"; two counters could disagree.
 */
export type AdminTabId =
  | 'action-center' | 'our-drops'
  | 'orders' | 'members' | 'auction-lookup' | 'audit' | 'system';

export const ADMIN_PRIMARY_TABS: AdminTabId[] = ['action-center', 'our-drops'];
export const ADMIN_REFERENCE_TABS: AdminTabId[] = ['orders', 'members', 'auction-lookup', 'audit', 'system'];
export const ADMIN_TAB_DEFAULT: AdminTabId = 'action-center';

const LEGACY_TAB_MAP: Record<string, AdminTabId> = {
  // Wave 4 dissolutions
  home: 'action-center',
  verify: 'action-center',
  fulfillment: 'action-center',
  disputes: 'action-center',
  payouts: 'action-center',
  launch: 'our-drops',
  // pre-Wave-4 aliases, preserved
  metrics: 'action-center',
  payments: 'action-center',
  subscriptions: 'action-center',
  listings: 'our-drops',
  withdrawals: 'action-center',
  sessions: 'system',
  simulator: 'system',
  users: 'members',
};
```

Delete `AttentionInput`, `AttentionCounts` and `computeAttentionCounts` entirely. Leave `VALID` and `migrateStoredAdminTab` unchanged.

- [ ] **Step 4: Remove the now-dangling references**

Run: `grep -rn "computeAttentionCounts\|AttentionInput\|AttentionCounts" src`

Every hit must go. Expected hits: `src/components/admin/AdminHome.tsx` (deleted in Task 6) and `src/components/AdminDashboardView.tsx` (rewired in Task 7). If a test file references them, delete those cases — the concept is gone, not renamed.

- [ ] **Step 5: Run to verify passing**

Run: `npx vitest run src/utils/adminNav.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/adminNav.ts src/utils/adminNav.test.ts
git commit -m "feat(wave4): admin nav becomes queue + our-drops + reference"
```

---

### Task 5: Extract the four row-body cards

Mechanical but the bulk of the work. Each card is lifted out of its section with the list/filter chrome dropped — that chrome is what made those files 226–764 lines. `PaymentVerifyCard` is already this shape; copy its conventions (props interface exported, no data fetching, all actions passed in).

**Files:**
- Create: `src/components/admin/cards/ListingApprovalCard.tsx`, `DisputeCard.tsx`, `PayoutCard.tsx`, `StalledDeliveryCard.tsx`
- Read first: `src/components/admin/PaymentVerifyCard.tsx` (the pattern), then `LaunchSection.tsx`, `DisputesSection.tsx`, `PayoutsSection.tsx`, `FulfillmentSection.tsx`

**Interfaces:**
- Consumes: `ActionRow` (Task 1).
- Produces, each `React.FC` with an exported props interface:
  - `ListingApprovalCard({ auction, isAr, onApprove, onReject })`
  - `DisputeCard({ order, isAr, onResolve })`
  - `PayoutCard({ withdrawal, isAr, onApprove, onReject })`
  - `StalledDeliveryCard({ order, reason, isAr, onNudge, onAdvance, onOpenOrder })`

- [ ] **Step 1: Read the pattern**

Read `src/components/admin/PaymentVerifyCard.tsx` end to end. Note: props interface exported, no `useEffect`/data loading, every mutation arrives as a callback, bilingual strings inline. Every card below matches this.

- [ ] **Step 2: Extract `ListingApprovalCard`**

From `LaunchSection.tsx`, lift the per-listing approval card: the lot summary, media gate, the approval checklist added in PR #176, and the approve/reject controls with `ViewingSelector`. Leave behind the queue list, filters and headers. Preserve the checklist gating exactly — it is an enforced go-live requirement, not decoration.

- [ ] **Step 3: Extract `DisputeCard`**

From `DisputesSection.tsx`, lift the per-dispute card: order summary, the return-claim evidence photos (`:145-201`), the mandatory-reason note field and the two-step confirm. Keep the mandatory reason — `:76,259-265` disables confirm until a note exists, and the audit lists that as a control that already works.

- [ ] **Step 4: Extract `PayoutCard`**

From `PayoutsSection.tsx`, lift the per-withdrawal card: user, amount, method/destination, approve and reject.

- [ ] **Step 5: Extract `StalledDeliveryCard`**

From `FulfillmentSection.tsx`, lift the per-order row body: order summary, age, the nudge button and the `nextAdvance()` hand-advance control with its `ADVANCE_LABEL` map. Add a "why it's stalled" line driven by the `reason` prop. Drop the four-bucket queue chrome entirely — that structure described the phone relay Wave 3 replaced.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: succeeds. Cards are not yet rendered anywhere; this only proves they compile.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/cards/
git commit -m "feat(wave4): extract the four row-body cards from the dissolving sections"
```

---

### Task 6: The Action Center

**Files:**
- Create: `src/components/admin/ActionCenterSection.tsx`
- Delete: `src/components/admin/AdminHome.tsx`

**Interfaces:**
- Consumes: `buildActionQueue`, `ActionRow` (Tasks 1–3); all five cards (Task 5, plus `PaymentVerifyCard`).
- Produces: `ActionCenterSection({ isAr, queue, orders, auctions, withdrawals, subscriptionRequests, handlers })` — `handlers` bundles the callbacks each card needs.

- [ ] **Step 1: Write the failing test for the one piece of testable logic**

The component cannot be rendered under vitest, so extract and test what it decides. Create the helper in `src/utils/actionQueue.ts`:

Append to `src/utils/actionQueue.test.ts`:

```ts
import { formatWaitingFor } from './actionQueue';

describe('formatWaitingFor', () => {
  it('reads in hours under a day and days beyond', () => {
    expect(formatWaitingFor(NOW - 3 * HOUR, NOW, 'en')).toBe('3h');
    expect(formatWaitingFor(NOW - 50 * HOUR, NOW, 'en')).toBe('2d');
  });

  // The house numeral policy is WESTERN digits in Arabic UI strings —
  // ARABIC_UI_DIGITS in utils/arabicNumerals.ts, a deliberate app-wide choice.
  // Hand-writing '٣' here would reintroduce exactly the drift that module
  // exists to remove.
  it('uses Western digits in Arabic, per the app-wide numeral policy', () => {
    expect(formatWaitingFor(NOW - 3 * HOUR, NOW, 'ar')).toBe('3 ساعات');
    expect(formatWaitingFor(NOW - 50 * HOUR, NOW, 'ar')).toBe('2 أيام');
  });

  it('shows nothing rather than a fabricated age', () => {
    expect(formatWaitingFor(null, NOW, 'en')).toBe('');
  });

  it('never shows a negative age for a clock-skewed future timestamp', () => {
    expect(formatWaitingFor(NOW + 5 * HOUR, NOW, 'en')).toBe('0h');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/utils/actionQueue.test.ts`
Expected: FAIL — `formatWaitingFor` is not exported

- [ ] **Step 3: Implement `formatWaitingFor`**

Append to `src/utils/actionQueue.ts`:

```ts
import { formatNumeral } from './arabicNumerals';

/**
 * "3h" / "2d" — how long a row has waited.
 *
 * Returns '' for an unusable timestamp: a row that says nothing is honest, one
 * that says "56 years" is not. Clamps at zero so clock skew never renders a
 * negative age.
 *
 * Digits go through `formatNumeral`, which owns the app-wide Arabic numeral
 * policy (currently Western). Interpolating raw digits here would be exactly
 * the drift that module was created to remove.
 */
export function formatWaitingFor(waitingSinceMs: number | null, nowMs: number, lang: 'ar' | 'en'): string {
  if (waitingSinceMs === null) return '';
  const isAr = lang === 'ar';
  const ms = Math.max(0, nowMs - waitingSinceMs);
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return isAr ? `${formatNumeral(hours, true)} ساعات` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return isAr ? `${formatNumeral(days, true)} أيام` : `${days}d`;
}
```

`formatNumeral(value, isAr)` is the real export in `src/utils/arabicNumerals.ts` — verified 2026-07-29. There is no `toArabicDigits`.

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run src/utils/actionQueue.test.ts`
Expected: PASS

- [ ] **Step 5: Build the component**

Create `src/components/admin/ActionCenterSection.tsx`. Requirements:

- Renders `queue` in order. **No sorting, filtering or severity logic** — the builder owns all of it.
- Each collapsed row shows: the bilingual label, the reason line, the age from `formatWaitingFor`, the amount when present, and a severity dot (`blocking` red, `aging` amber, `new` grey).
- Tapping a row expands it in place and renders the card for its `kind`: `verify_order_payment` → `PaymentVerifyCard`; `verify_membership` → the membership approve/reject controls from `VerifyApproveSection`; `approve_listing` → `ListingApprovalCard`; `payout` → `PayoutCard`; `delivery_stalled` → `StalledDeliveryCard`; `dispute` → `DisputeCard`.
- Expand state is keyed on `row.id` so a rebuild does not collapse what the admin is working on.
- Empty state: "كل شيء تحت السيطرة — لا يوجد ما ينتظر." / "All clear — nothing waiting." Reuse `AdminHome`'s existing wording before deleting it.
- Follows the admin idiom: `bg-white rounded-3xl border border-gray-200 p-5`, `text-xs font-black`, `#FF6B00` accents.

- [ ] **Step 6: Delete `AdminHome`**

```bash
git rm src/components/admin/AdminHome.tsx
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds (`AdminDashboardView` still imports `AdminHome` — fix that import as part of Task 7 if the build objects here; the two tasks may be committed together if so).

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/ActionCenterSection.tsx src/utils/actionQueue.ts src/utils/actionQueue.test.ts
git commit -m "feat(wave4): the Action Center — one queue, rows expand in place"
```

---

### Task 7: Wire the dashboard, add Our drops, remove the dissolved tabs

**Files:**
- Create: `src/components/admin/OurDropsSection.tsx`
- Modify: `src/components/AdminDashboardView.tsx`
- Delete: `src/components/admin/FulfillmentSection.tsx`, `DisputesSection.tsx`, `PayoutsSection.tsx`, `LaunchSection.tsx`, `VerifyApproveSection.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: an admin panel with two primary tabs.

- [ ] **Step 1: Create `OurDropsSection`**

Copy `LaunchSection.tsx` to `OurDropsSection.tsx` and **remove the customer-lot approval path** — the pending-approval queue and its approve/reject controls, which are now `approve_listing` rows. What remains is Mazad's own inventory pipeline: the drop builder entry point, scheduling, and go-live. Add a header comment recording that approvals moved to the Action Center and why (the tab used to mix operator work with refereeing).

- [ ] **Step 2: Build the queue in the dashboard**

In `AdminDashboardView.tsx`, replace the `pendingVerify` / `overdueFulfillment` / `openDisputes` / `pendingPayouts` / `pendingListings` count memos with a single memo:

```tsx
const actionQueue = useMemo(
  () => buildActionQueue({
    orders: realOrders,
    pendingListings: pendingListingDrops,
    subscriptionRequests,
    withdrawals: allWithdrawals,
  }, Date.now()),
  [realOrders, pendingListingDrops, subscriptionRequests, allWithdrawals],
);
```

Note `pendingOrderPaymentsCount` and `overdueFulfillmentCount` become dead once the badges are gone — delete them rather than leaving unused memos.

- [ ] **Step 3: Render the two primary tabs**

Replace the `AdminHome` render with `<ActionCenterSection …>` and the `LaunchSection` render with `<OurDropsSection …>`. Delete the `verify` / `fulfillment` / `disputes` / `payouts` tab branches and their imports. The tab bar derives from `ADMIN_PRIMARY_TABS`, so it updates itself; the attention badge becomes `actionQueue.length`.

- [ ] **Step 4: Delete the dissolved sections**

```bash
git rm src/components/admin/FulfillmentSection.tsx src/components/admin/DisputesSection.tsx src/components/admin/PayoutsSection.tsx src/components/admin/LaunchSection.tsx src/components/admin/VerifyApproveSection.tsx
```

Then run `grep -rn "FulfillmentSection\|DisputesSection\|PayoutsSection\|LaunchSection\|VerifyApproveSection" src` and clear every remaining reference. If a `.test.ts` covers logic exported from one of these files, **move that logic and its tests** rather than deleting the coverage — check before removing anything.

- [ ] **Step 5: Verify**

Run: `npm run build && npx vitest run`
Expected: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(wave4): admin panel is now Action Center + Our drops"
```

---

### Task 8: Docs, verification, preview gate

**Files:**
- Modify: `docs/admin-seller-audit-2026-07.md`, `docs/BACKLOG.md`

- [ ] **Step 1: Mark Wave 4 shipped**

In `docs/admin-seller-audit-2026-07.md`, mark the Wave 4 line shipped and record what landed: the four dissolved tabs, `our-drops`, the pure queue builder, the 24h SLAs. Note that B1's "unified Action Center" is now EXISTS, and that the framing changed from "consolidation" to "re-cut" and why.

- [ ] **Step 2: Record the SLA change in the backlog**

In `docs/BACKLOG.md`, note under infra/runbook that fulfillment SLAs are now 24h ship / 24h confirm, that this is client-only, and that the queue will show a backlog on day one because five days of drift becomes visible at once.

- [ ] **Step 3: Full verification**

Run each and paste the real output into the PR body:

```bash
npx vitest run
npm run build
```

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/
git commit -m "docs(wave4): record the Action Center re-cut and the 24h SLAs"
```

- [ ] **Step 5: MJ preview gate — DO NOT MERGE FIRST**

This deletes four tabs from the team's daily tool. On the Vercel preview, desktop and phone, both languages:

1. The panel opens on the Action Center; the tab bar shows only it and Our drops.
2. A pending payment, a pending listing, a pending payout and a stalled order each appear as a row with a reason and an age.
3. Expanding each row reveals its card, and acting on it works and removes the row.
4. A blocking row (dispute, or a buyer at 5/5 code attempts) sorts above an aging one.
5. Our drops still builds, schedules and launches Mazad's own lots — with no customer-approval queue in it.
6. An old bookmark to `?tab=verify` lands on the Action Center.
7. With nothing pending, the empty state reads correctly in both languages.

**Expect a non-empty queue on day one** — the SLA tightening surfaces orders that have been drifting. That is the intent, not a bug.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Action Center replaces home | 4, 6, 7 |
| Our drops = launch minus approvals | 7 |
| verify/fulfillment/disputes/payouts dissolve | 5, 7 |
| Reference tabs untouched | 4 (asserted in tests) |
| Legacy tab ids redirect | 4 |
| `computeAttentionCounts` deleted | 4 |
| Six row kinds, nine reasons | 1, 2, 3 |
| Row carries reason + age + amount | 1, 6 |
| Severity rules incl. per-reason SLA table | 1, 3 |
| Ordering: severity → oldest → amount | 1 |
| 24h ship / 24h confirm | 3 |
| Pure builder, no Firestore | 1 |
| Cards extracted, `PaymentVerifyCard` reused | 5 |
| No new subscriptions | 7 |
| Idempotent actions / stale rows safe | inherent — no new mutations are written; every card calls an existing callable |
| Malformed docs skipped | 1 |
| Never invent an age | 1, 6 |
| Testing: reason codes, ordering, malformed, empty, healthy-order-no-row | 1, 2, 3 |
| Preview gate | 8 |

**Notes for the implementer**

- Tasks 1–4 are pure logic and independently reviewable. Tasks 5–7 are UI and must land together to keep the build green — if Task 6's build step fails on the `AdminHome` import, fold 6 and 7 into one commit.
- The riskiest step is Task 7's deletion sweep. Check for exported logic with test coverage inside the deleted sections **before** removing them.
- Do not add a second SLA number anywhere. If a row seems to need a different clock, that is a design question for MJ, not an implementation detail.
