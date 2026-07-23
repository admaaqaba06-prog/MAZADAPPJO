# Admin Slice C — "Fulfillment" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Fulfillment` admin tab (third, after Verify & Approve and Launch) that surfaces which orders are stuck at each post-payment stage — awaiting shipment, awaiting delivery confirmation, awaiting escrow release — with an age badge, an overdue flag, and a manual one-click nudge (never automatic).

**Architecture:** Bucket assignment and overdue math live in a pure, injectable-clock util (`src/utils/fulfillmentQueues.ts`) so tests never depend on the real clock. The nudge is a thin admin-gated callable (`sendFulfillmentNudge`) wrapping a pure core module (`functions/fulfillmentNudge.js`, mirroring `orderPaymentVerify.js`'s deps-injection + fake-db test pattern) that RE-DERIVES bucket eligibility server-side — the client's claimed bucket is never trusted. Disputed orders are excluded at the bucket-assignment layer, so no downstream code has to remember to filter them.

**Tech Stack:** React 19 + Vite + TS (`strict` off), Firebase Cloud Functions CommonJS, Firestore, Vitest (`src/**/*.test.ts(x)` + `functions/**/*.test.js`), Tailwind, `isAr` bilingual pattern, `postToN8n` WhatsApp pipe, `getCallableFunction` client invocation pattern.

## Global Constraints

- **Nudges are manual-only, never automatic.** No cron, no trigger fires a nudge on threshold-cross — only an explicit admin callable invocation.
- **Disputed orders never appear in any bucket**, full stop — regardless of how long they've been in any status.
- **Overdue thresholds:** 48h since payment (awaiting shipment), 5 days since shipped (awaiting delivery), 24h since delivered (awaiting release).
- **Server re-validates bucket membership** on every nudge — the callable must reject a nudge whose `kind` doesn't match the order's ACTUAL current bucket (read fresh from Firestore), not just trust the client.
- **Client never writes `lastNudgedAt`/`nudgeCount`** — admin-only via the callable; add to the orders rules S2 denylist (same pattern as Slice B's 6 verification fields).
- **Notify is best-effort:** a `postToN8n` failure must never fail the nudge stamp, and vice versa (independent, matches Slice A/B discipline). `idempotencyKey` has NO wall-clock component (Slice B's whole-branch-review fix applies here too — use it correctly from the start).
- **Bilingual + RTL** via `isAr`, matching every existing admin section.
- **Firestore rejects explicit `undefined`** — conditional spread for optional fields.
- **Deploy caveat:** `tsc --noEmit` currently 0 errors — keep it that way.
- **Anchor edits by TEXT, not line numbers** (repo moves fast).
- **Workflow:** Fable SDD (Opus fallback if Fable's monthly cap is hit, per standing instruction); one commit per task minimum; TDD where a pure unit exists.

---

## File Structure

**New:**
- `src/utils/fulfillmentQueues.ts` + `.test.ts` — pure: `bucketOrder`, `isOverdue`, `daysBetween`/`hoursBetween` (injectable `now`).
- `functions/fulfillmentNudge.js` + `.test.js` — pure, deps-injected: `sendFulfillmentNudge(deps, {orderId, kind, adminUid})`.
- `src/components/admin/FulfillmentSection.tsx` — three-bucket UI, presentational + injected props.

**Modified:**
- `functions/index.js` — new callable `sendFulfillmentNudge`; two new `postToN8n` events.
- `firestore.rules` — orders S2 denylist gains `lastNudgedAt`, `nudgeCount`.
- `src/types.ts` — `Order` gains `lastNudgedAt?: any`, `nudgeCount?: number`.
- `src/components/AdminDashboardView.tsx` — `ADMIN_TABS` gains `'fulfillment'`; tab-row array + labels + attention-dot; new handler `handleSendFulfillmentNudge`; mount `<FulfillmentSection>`.

---

## Task 1: Pure bucket-assignment + overdue util

**Files:** Create `src/utils/fulfillmentQueues.ts`; Test `src/utils/fulfillmentQueues.test.ts`.

**Interfaces — Produces:**
- `type FulfillmentBucket = 'awaiting_shipment' | 'awaiting_delivery' | 'awaiting_release' | null`
- `bucketOrder(order: { status: string; paymentVerified?: boolean }): FulfillmentBucket` — `'paid'` + `paymentVerified===true` → `'awaiting_shipment'`; `'shipped'` → `'awaiting_delivery'`; `'delivered'` → `'awaiting_release'`; `'disputed'` (regardless of any other field) → `null`; anything else (`waiting_payment`, `paid` without verification, `completed`, `cancelled`, `refunded`) → `null`.
- `hoursBetween(fromMs: number, nowMs: number): number` / `daysBetween(fromMs: number, nowMs: number): number` — simple arithmetic, floor division.
- `isOverdue(order: { status: string; paymentVerified?: boolean; updatedAtMs: number }, nowMs: number): boolean` — `false` when `bucketOrder(order)` is `null`; else compares `hoursBetween`/`daysBetween` against the bucket's threshold (48h shipment / 5d delivery / 24h release) using `order.updatedAtMs` as the stage-entry timestamp.

- [ ] **Step 1: failing test** — `src/utils/fulfillmentQueues.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { bucketOrder, hoursBetween, daysBetween, isOverdue } from './fulfillmentQueues';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

describe('bucketOrder', () => {
  it('buckets a verified paid order as awaiting_shipment', () => {
    expect(bucketOrder({ status: 'paid', paymentVerified: true })).toBe('awaiting_shipment');
  });
  it('does NOT bucket a self-claimed but unverified paid order', () => {
    expect(bucketOrder({ status: 'paid', paymentVerified: false })).toBeNull();
    expect(bucketOrder({ status: 'paid' })).toBeNull();
  });
  it('buckets shipped as awaiting_delivery, delivered as awaiting_release', () => {
    expect(bucketOrder({ status: 'shipped' })).toBe('awaiting_delivery');
    expect(bucketOrder({ status: 'delivered' })).toBe('awaiting_release');
  });
  it('NEVER buckets a disputed order, regardless of other fields', () => {
    expect(bucketOrder({ status: 'disputed', paymentVerified: true })).toBeNull();
  });
  it('returns null for waiting_payment, completed, cancelled, refunded', () => {
    for (const status of ['waiting_payment', 'completed', 'cancelled', 'refunded']) {
      expect(bucketOrder({ status })).toBeNull();
    }
  });
});

describe('hoursBetween / daysBetween', () => {
  it('computes whole-unit elapsed time', () => {
    expect(hoursBetween(NOW - 3 * HOUR, NOW)).toBe(3);
    expect(daysBetween(NOW - 2 * DAY, NOW)).toBe(2);
    expect(hoursBetween(NOW, NOW)).toBe(0);
  });
});

describe('isOverdue', () => {
  it('is false for a non-bucketed order regardless of age', () => {
    expect(isOverdue({ status: 'disputed', updatedAtMs: NOW - 100 * DAY }, NOW)).toBe(false);
    expect(isOverdue({ status: 'completed', updatedAtMs: NOW - 100 * DAY }, NOW)).toBe(false);
  });
  it('flags awaiting_shipment overdue past 48h, not before', () => {
    const base = { status: 'paid', paymentVerified: true };
    expect(isOverdue({ ...base, updatedAtMs: NOW - 47 * HOUR }, NOW)).toBe(false);
    expect(isOverdue({ ...base, updatedAtMs: NOW - 49 * HOUR }, NOW)).toBe(true);
  });
  it('flags awaiting_delivery overdue past 5 days, not before', () => {
    expect(isOverdue({ status: 'shipped', updatedAtMs: NOW - 4 * DAY }, NOW)).toBe(false);
    expect(isOverdue({ status: 'shipped', updatedAtMs: NOW - 6 * DAY }, NOW)).toBe(true);
  });
  it('flags awaiting_release overdue past 24h, not before', () => {
    expect(isOverdue({ status: 'delivered', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
    expect(isOverdue({ status: 'delivered', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/utils/fulfillmentQueues.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement** — `src/utils/fulfillmentQueues.ts`

```ts
export type FulfillmentBucket = 'awaiting_shipment' | 'awaiting_delivery' | 'awaiting_release' | null;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const THRESHOLDS: Record<Exclude<FulfillmentBucket, null>, number> = {
  awaiting_shipment: 48 * HOUR_MS,
  awaiting_delivery: 5 * DAY_MS,
  awaiting_release: 24 * HOUR_MS,
};

/**
 * Assigns an order to a fulfillment bucket, or null if it needs no follow-up
 * here. Disputed orders NEVER bucket, regardless of status/fields — disputes
 * are a separate job (Job 4 / a future slice), not this one's concern.
 */
export function bucketOrder(order: { status: string; paymentVerified?: boolean }): FulfillmentBucket {
  if (order.status === 'disputed') return null;
  if (order.status === 'paid' && order.paymentVerified === true) return 'awaiting_shipment';
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

/** True when the order's current bucket has been sitting past its threshold. */
export function isOverdue(
  order: { status: string; paymentVerified?: boolean; updatedAtMs: number },
  nowMs: number,
): boolean {
  const bucket = bucketOrder(order);
  if (!bucket) return false;
  return nowMs - order.updatedAtMs > THRESHOLDS[bucket];
}
```

- [ ] **Step 4:** focused run → PASS. **Step 5:** `npm run build && npx vitest run` → all green. **Step 6: commit** `feat(fulfillment): pure bucket-assignment + overdue util`

---

## Task 2: Pure nudge module (fake-db test pattern)

**Files:** Create `functions/fulfillmentNudge.js`; Test `functions/fulfillmentNudge.test.js`.

**Interfaces — Consumes:** copy the `makeSnapshot`/`makeFakeDb`/`FakeTimestamp`/`deps`/`makeError` helpers from `functions/orderPaymentVerify.test.js` verbatim into this test file (test-local, do not import across test files).
**Interfaces — Produces (CommonJS):**
- `sendFulfillmentNudge(deps, { orderId, kind, adminUid })` where `kind: 'ship' | 'confirm_delivery'`.
  - Reads the order fresh inside `db.runTransaction`. `not-found` if missing.
  - Re-derives the order's ACTUAL bucket via a local re-implementation of `bucketOrder` (JS twin — same reasoning as Task 5's `nextAuctionNumber`/`computeNextNumber` split in Slice A: this module can't import from `src/`). `kind:'ship'` is only valid when the actual bucket is `'awaiting_shipment'`; `kind:'confirm_delivery'` only valid for `'awaiting_delivery'`. Mismatch → `failed-precondition` (e.g. admin clicks "nudge to ship" on an order that's already shipped, or got disputed in the meantime).
  - On match: `txn.set(ref, { lastNudgedAt: Timestamp.fromMillis(now()), nudgeCount: (o.nudgeCount || 0) + 1 }, { merge: true })`.
  - Returns `{ orderId, kind, targetUserId, targetUserName }` where for `'ship'` the target is the SELLER (`o.sellerId`/`o.sellerName`) and for `'confirm_delivery'` the target is the BUYER (`o.buyerId`/`o.buyerName`).
  - `invalid-argument` for a missing `orderId` or a `kind` not in the allowed set.

- [ ] **Step 1: failing test** — `functions/fulfillmentNudge.test.js`

```js
import { describe, it, expect } from 'vitest';
const { sendFulfillmentNudge } = require('./fulfillmentNudge');

// ---- copy makeSnapshot/makeFakeDb/FakeTimestamp/deps from
// functions/orderPaymentVerify.test.js verbatim here ----

describe('sendFulfillmentNudge', () => {
  it('ship nudge on an awaiting_shipment order stamps lastNudgedAt/nudgeCount and targets the seller', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentVerified: true, sellerId: 's1', sellerName: 'Seller One' } });
    const res = await sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'ship', adminUid: 'admin1' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.lastNudgedAt._ms).toBe(NOW_MS);
    expect(write.data.nudgeCount).toBe(1);
    expect(res).toEqual({ orderId: 'o1', kind: 'ship', targetUserId: 's1', targetUserName: 'Seller One' });
  });
  it('increments nudgeCount on a repeat nudge (no rate limit)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentVerified: true, sellerId: 's1', sellerName: 'Seller One', nudgeCount: 2 } });
    await sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'ship', adminUid: 'admin1' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.nudgeCount).toBe(3);
  });
  it('confirm_delivery nudge on an awaiting_delivery order targets the buyer', async () => {
    const db = makeFakeDb({ 'orders/o2': { status: 'shipped', buyerId: 'b1', buyerName: 'Buyer One' } });
    const res = await sendFulfillmentNudge(deps(db), { orderId: 'o2', kind: 'confirm_delivery', adminUid: 'admin1' });
    expect(res).toEqual({ orderId: 'o2', kind: 'confirm_delivery', targetUserId: 'b1', targetUserName: 'Buyer One' });
  });
  it('rejects a ship nudge on an order that is not awaiting_shipment (failed-precondition)', async () => {
    const db = makeFakeDb({ 'orders/o3': { status: 'shipped', sellerId: 's1', sellerName: 'S' } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o3', kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });
  it('rejects a confirm_delivery nudge on a disputed order even if it was shipped', async () => {
    const db = makeFakeDb({ 'orders/o4': { status: 'disputed', buyerId: 'b1', buyerName: 'B' } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o4', kind: 'confirm_delivery', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });
  it('throws not-found for a missing order', async () => {
    const db = makeFakeDb({});
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'missing', kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'not-found' });
  });
  it('throws invalid-argument for a bad kind or missing orderId', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentVerified: true } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'bogus', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(sendFulfillmentNudge(deps(db), { kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 2:** focused run → FAIL. **Step 3: implement** `functions/fulfillmentNudge.js`:

```js
/**
 * Pure fulfillment-nudge core (Slice C). The sendFulfillmentNudge callable in
 * index.js is a thin admin-gated wrapper; bucket re-derivation + idempotent
 * stamping live here so Vitest covers them (same split as orderPaymentVerify.js).
 *
 * NOTE: bucketOrder is re-implemented here (not imported) — this CommonJS
 * module can't import from src/. Kept in sync by mirrored tests, same
 * intentional duplication as Slice A's nextAuctionNumber/computeNextNumber.
 */
function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bucketOrder(order) {
  if (order.status === 'disputed') return null;
  if (order.status === 'paid' && order.paymentVerified === true) return 'awaiting_shipment';
  if (order.status === 'shipped') return 'awaiting_delivery';
  if (order.status === 'delivered') return 'awaiting_release';
  return null;
}

const KIND_TO_BUCKET = { ship: 'awaiting_shipment', confirm_delivery: 'awaiting_delivery' };

async function sendFulfillmentNudge(deps, { orderId, kind, adminUid } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  if (!KIND_TO_BUCKET[kind]) throw makeError('invalid-argument', "kind must be 'ship' or 'confirm_delivery'.");

  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};

    const actualBucket = bucketOrder(o);
    if (actualBucket !== KIND_TO_BUCKET[kind]) {
      throw makeError('failed-precondition', `Order ${orderId} is not in the '${KIND_TO_BUCKET[kind]}' bucket (actual: ${actualBucket || 'none'}).`);
    }

    txn.set(ref, {
      lastNudgedAt: Timestamp.fromMillis(now()),
      nudgeCount: (o.nudgeCount || 0) + 1,
    }, { merge: true });

    return kind === 'ship'
      ? { orderId, kind, targetUserId: o.sellerId || null, targetUserName: o.sellerName || 'Seller' }
      : { orderId, kind, targetUserId: o.buyerId || null, targetUserName: o.buyerName || 'Buyer' };
  });
}

module.exports = { sendFulfillmentNudge };
```

- [ ] **Step 4:** focused → PASS. **Step 5:** full suite + `node --check functions/fulfillmentNudge.js`. **Step 6: commit** `feat(fulfillment): pure nudge core — server re-derives bucket, never trusts client`

---

## Task 3: Rules denylist + Order type fields

**Files:** Modify `firestore.rules`; Modify `src/types.ts`.

**Interfaces — Produces:** `orders/{orderId}` S2 update rule denies client writes to `lastNudgedAt`, `nudgeCount`. `Order` gains `lastNudgedAt?: any; nudgeCount?: number;` with doc comments.

- [ ] **Step 1:** in `firestore.rules`, find the orders S2 `affectedKeys().hasAny([` list (the one Slice B extended with the 6 `paymentVerified*`/`paymentRejection*` fields — search for `'paymentRejectedAt'` to anchor precisely) and append:

```
            'lastNudgedAt', 'nudgeCount'
```

- [ ] **Step 2:** in `src/types.ts`, find the `Order` interface's payment-verification cluster (search for `paymentRejectionReason?: string;` — the last field Slice B added) and add directly after it:

```ts
  /** Slice C fulfillment nudge — admin-stamped only, via sendFulfillmentNudge. Informational (no rate-limit). */
  lastNudgedAt?: any;
  /** Times an admin has nudged this order (any bucket). Admin-only. */
  nudgeCount?: number;
```

- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors. Rules dry-run if CLI available (else CI validates on merge). **Step 4: commit** `feat(fulfillment): rules denylist + Order type fields for nudge stamp`

---

## Task 4: Callable + notify wiring

**Files:** Modify `functions/index.js`.

**Interfaces — Consumes:** Task 2's `sendFulfillmentNudge`; existing `assertAdmin`, `postToN8n`, `db`.
**Interfaces — Produces:** callable `sendFulfillmentNudge({ orderId, kind })` → looks up the target's phone from `users/{targetUserId}`, fires `seller_ship_nudge` or `buyer_confirm_nudge`, returns `{ success: true, ...result }`.

- [ ] **Step 1: require the module** — anchor: the require line for `orderPaymentVerify` (added in Slice B). Add directly after it:

```js
const { sendFulfillmentNudge: sendFulfillmentNudgeTxn } = require('./fulfillmentNudge');
```

- [ ] **Step 2: add the callable** — anchor: directly after `exports.verifyOrderPayment = …` 's closing `});` (Slice B's callable). Add:

```js
/**
 * sendFulfillmentNudge — Slice C (Fulfillment). Admin nudges a seller to
 * ship or a buyer to confirm delivery. Manual-only: this callable is the
 * ONLY way a nudge fires — nothing calls it on a timer/trigger.
 */
exports.sendFulfillmentNudge = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { orderId, kind } = data || {};
  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    const result = await sendFulfillmentNudgeTxn(deps, { orderId, kind, adminUid: context.auth.uid });

    let phone = '';
    try {
      const targetSnap = result.targetUserId ? await db.collection('users').doc(result.targetUserId).get() : null;
      phone = targetSnap && targetSnap.exists ? (targetSnap.data().phoneNumber || '') : '';
    } catch (e) { console.warn('[sendFulfillmentNudge] target phone lookup failed:', e); }

    const event = kind === 'ship' ? 'seller_ship_nudge' : 'buyer_confirm_nudge';
    await postToN8n(event, {
      phone, name: result.targetUserName, orderId,
      idempotencyKey: `${event}_${orderId}`,
    });

    console.log(`[sendFulfillmentNudge] ${kind} nudge sent for order=${orderId} by ${context.auth.uid}`);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in sendFulfillmentNudge:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'invalid-argument', 'failed-precondition'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});
```

(Idempotency key is stable — no `Date.now()` — per Slice B's whole-branch-review fix; this is Slice C getting it right from the start.)

- [ ] **Step 3:** `node --check functions/index.js`; full `npx vitest run`. **Step 4: commit** `feat(fulfillment): sendFulfillmentNudge callable + WhatsApp notify events`

---

## Task 5: FulfillmentSection UI

**Files:** Create `src/components/admin/FulfillmentSection.tsx`.

**Interfaces — Consumes:** Task 1's `bucketOrder`/`isOverdue`/`hoursBetween`/`daysBetween`.
**Interfaces — Produces:**

```ts
export interface FulfillmentSectionProps {
  isAr: boolean;
  orders: any[];                                  // realOrders (sim-excluded, matches Slice B's fix)
  onNudge: (orderId: string, kind: 'ship' | 'confirm_delivery') => Promise<void>;
  onReleaseEscrow: (orderId: string) => Promise<void>;
}
```

Behavior:
- Derive `now = Date.now()` once per render. For each order, compute `bucketOrder(order)`; group into three buckets, each sorted by `updatedAtMs` ascending (oldest/most-stuck first). `updatedAtMs` = `order.updatedAt?.seconds ? order.updatedAt.seconds*1000 : (order.updatedAt || order.createdAt || now)` (mirror the existing timestamp-normalization pattern used elsewhere in `AdminDashboardView.tsx` for `createdAt`).
- Each row: order id/title, buyer or seller name (whichever is the nudge target for that bucket), an age badge (`hoursBetween`/`daysBetween` since stage entry, bilingual "Xh" / "Xd"), and — only when `isOverdue(...)` — an amber/red "⚠ overdue" chip.
- **Awaiting shipment** row → Nudge button → `onNudge(order.id, 'ship')`, busy-disables while pending, brief inline "✅ nudged" / error toast on completion (mirror `PaymentVerifyCard`'s busy/feedback pattern — no need for a shared component, this is simpler single-button feedback).
- **Awaiting delivery** row → Nudge button → `onNudge(order.id, 'confirm_delivery')`.
- **Awaiting release** row → NO nudge button; instead a "Release escrow" button → `onReleaseEscrow(order.id)`.
- Empty-state per bucket, bilingual ("لا يوجد طلبات متأخرة هنا ✅" / "Nothing stuck here ✅").
- Section header + three sub-headers each show a count; overdue count highlighted.

- [ ] Steps: implement → `npm run build && npx vitest run && npx tsc --noEmit` (0 errors; no unit test for this presentational component — build+suite are the evidence) → **commit** `feat(fulfillment): FulfillmentSection — three buckets, age badges, nudge/release actions`

---

## Task 6: Admin mount

**Files:** Modify `src/components/AdminDashboardView.tsx`.

**Interfaces — Consumes:** Task 5's `FulfillmentSection`; `realOrders` (existing); `getCallableFunction` (existing pattern, mirror `handleVerifyOrderPayment` at the anchor `const handleVerifyOrderPayment = async (orderId: string) => {`).

- [ ] **Step 1: lazy import** — anchor: `const VerifyApproveSection = React.lazy(() => import('./admin/VerifyApproveSection'));`. Add directly after:

```ts
const FulfillmentSection = React.lazy(() => import('./admin/FulfillmentSection'));
```

- [ ] **Step 2: add `'fulfillment'` to `ADMIN_TABS`** — anchor: the `ADMIN_TABS` array (`'verify', 'metrics', 'orders', ...`). Insert `'fulfillment'` as the SECOND element (after `'verify'`, before `'metrics'`) — matches "third slice, third-priority job" positioning right after Verify & Approve:

```ts
const ADMIN_TABS = [
  'verify',
  'fulfillment',
  'metrics',
  ...
```

- [ ] **Step 3: overdue count memo** — anchor: `const pendingOrderPaymentsCount = useMemo(`. Add directly after that memo's closing `);`:

```ts
  // Fulfillment (Slice C): orders sitting past their stage's overdue threshold,
  // across all three buckets. Sourced from realOrders (sim-excluded), matching
  // the Slice B fix for the Verify badge.
  const overdueFulfillmentCount = useMemo(() => {
    const now = Date.now();
    return realOrders.filter((o: any) => {
      const updatedAtMs = o.updatedAt?.seconds ? o.updatedAt.seconds * 1000 : (o.updatedAt || o.createdAt || now);
      return isOverdue({ status: o.status, paymentVerified: o.paymentVerified, updatedAtMs }, now);
    }).length;
  }, [realOrders]);
```

Add the import: `import { isOverdue } from '../utils/fulfillmentQueues';` alongside the other util imports.

- [ ] **Step 4: tab-row array + labels + dot** — anchor: the tab-row array literal (`(['verify', 'metrics', 'orders', ...] as const).map((tab) => {`) — insert `'fulfillment'` as the second element (matching Step 2's position). In BOTH label ternaries (Arabic + English), add a branch: `tab === 'fulfillment' ? 'المتابعة والتنفيذ' : ...` / `tab === 'fulfillment' ? 'FULFILLMENT' : ...` (insert right after the `'verify'` branch in each ternary chain). In the attention-dot condition (anchor: `(tab === 'verify' && (subscriptionRequests.length > 0 || pendingOrderPaymentsCount > 0)) ||`), add a sibling clause:

```ts
            (tab === 'fulfillment' && overdueFulfillmentCount > 0) ||
```

And in the badge-count ternary (anchor: `{tab === 'verify' ? subscriptionRequests.length + pendingOrderPaymentsCount`), add a branch: `: tab === 'fulfillment' ? overdueFulfillmentCount`.

- [ ] **Step 5: nudge + release handlers** — anchor: directly after `handleRejectOrderPayment`'s closing `};`. Add (mirror `handleVerifyOrderPayment`'s exact structure):

```ts
  const handleSendFulfillmentNudge = async (orderId: string, kind: 'ship' | 'confirm_delivery') => {
    try {
      const nudgeCallable = await getCallableFunction<
        { orderId: string; kind: 'ship' | 'confirm_delivery' },
        { success: boolean; targetUserName?: string }
      >('sendFulfillmentNudge');
      await nudgeCallable({ orderId, kind });
      alert(isAr ? '✅ تم إرسال التذكير.' : '✅ Nudge sent.');
    } catch (err: any) {
      console.error('Error sending fulfillment nudge:', err);
      alert(isAr ? `❌ فشل إرسال التذكير: ${err.message || String(err)}` : `❌ Failed to send nudge: ${err.message || String(err)}`);
    }
  };

  const handleFulfillmentReleaseEscrow = async (orderId: string) => {
    try {
      const releaseCallable = await getCallableFunction<
        { orderId: string; action: 'admin_release' },
        { success: boolean; message?: string }
      >('releaseOrderEscrow');
      await releaseCallable({ orderId, action: 'admin_release' });
      alert(isAr ? '✅ تم تحرير المبلغ.' : '✅ Escrow released.');
    } catch (err: any) {
      console.error('Error releasing escrow:', err);
      alert(isAr ? `❌ فشل تحرير المبلغ: ${err.message || String(err)}` : `❌ Failed to release escrow: ${err.message || String(err)}`);
    }
  };
```

(`'admin_release'` confirmed against `orderWorkflow.ts`'s `cfAction` mapping — the same value `executeOrderTransition('release_escrow')` already sends.)

- [ ] **Step 6: mount** — anchor: directly after the `activeTab === 'verify'` block's closing `)}` (before the `ORDERS MANAGEMENT` comment block). Add:

```tsx
        {activeTab === 'fulfillment' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-150 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <FulfillmentSection
              isAr={isAr}
              orders={realOrders}
              onNudge={handleSendFulfillmentNudge}
              onReleaseEscrow={handleFulfillmentReleaseEscrow}
            />
          </React.Suspense>
        )}

```

- [ ] **Step 7:** `npm run build && npx vitest run && npx tsc --noEmit` (0 errors). **Step 8: commit** `feat(fulfillment): mount Fulfillment tab (second position) with overdue badge`

---

## Post-implementation

- **n8n:** add `seller_ship_nudge` / `buyer_confirm_nudge` branches to the Webhook Receiver's Switch (assisted-post, safe no-op until wired).
- **Manual smoke** (MJ/colleague, live/sim): an old `paid`+verified order shows in Awaiting shipment, overdue past 48h, nudge sends and stamps; an old `shipped` order shows in Awaiting delivery past 5d; a `delivered` order past 24h shows Release (no nudge); a `disputed` order never appears anywhere in this tab regardless of age.
- Finish via superpowers:finishing-a-development-branch → PR → merge (per MJ's standing instruction).

## Self-Review

**Spec coverage:** three buckets + thresholds (Task 1) ✓; manual-only nudge, server re-derives bucket (Task 2/4) ✓; disputes excluded at the source (Task 1, inherited everywhere) ✓; rules lockdown + type fields (Task 3) ✓; UI with age/overdue/nudge/release (Task 5/6) ✓; stable idempotency keys (Task 4, learned from Slice B) ✓; non-goals (no courier, no SLA automation, no state-machine changes, no dispute UI) respected — nothing in any task touches `orderWorkflow.ts`.

**Placeholder scan:** no TBD/TODO. The `releaseOrderEscrow` action string (`'admin_release'`) was verified against `orderWorkflow.ts` before finalizing this plan — no open question left for the implementer.

**Type consistency:** `bucketOrder(order): FulfillmentBucket` identical signature between the TS util (Task 1) and its JS twin in `functions/fulfillmentNudge.js` (Task 2, intentionally duplicated across the CJS/ESM boundary, same pattern as Slice A). `sendFulfillmentNudge(deps,{orderId,kind,adminUid})` matches between Tasks 2 and 4. Callable payload `{orderId,kind}` matches between Tasks 4 and 6. `FulfillmentSectionProps` matches between Tasks 5 and 6. Field names (`lastNudgedAt`, `nudgeCount`) consistent across Tasks 2/3/4.
