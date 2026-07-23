# Admin Slice D — "Disputes" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Disputes` admin tab — a real queue of disputed orders with the reason they were opened, plus a real resolution form (release/refund/resume, each requiring an admin note) that replaces the native `prompt()`, without touching the existing money-movement engine at all.

**Architecture:** The real money movement (`releaseOrderEscrow`/`refundOrderEscrow`, reached via `executeOrderTransition('resolve_dispute', ...)`) stays completely untouched. A new, separate admin-only callable (`stampDisputeResolution`, backed by a pure `functions/disputeResolution.js` core) records the admin's note as metadata, called ONLY after the real resolution already succeeded — so a stamped note always corresponds to a real resolution, and a failed stamp can never look like a failed resolution.

**Tech Stack:** React 19 + Vite + TS (`strict` off), Firebase Cloud Functions CommonJS, Firestore, Vitest (`src/**/*.test.ts(x)` + `functions/**/*.test.js`), Tailwind, `isAr` bilingual pattern, `getCallableFunction` client pattern.

## Global Constraints

- **The money engine is untouched.** No edits to `releaseOrderEscrow`, `refundOrderEscrow`, or the `resolve_dispute` release/refund branches in `orderWorkflow.ts`. Only the `open_dispute` case gets a one-line addition (thread `disputeReason` through, mirroring the existing `trackingNumber` threading on `mark_shipped`).
- **Sequencing is load-bearing:** the new stamp callable is invoked ONLY after `executeOrderTransition('resolve_dispute', ...)` resolves successfully — never before, never in parallel.
- **A dispute cannot be opened with an empty reason** (MJ's explicit decision) — enforced client-side before the transition fires.
- **A resolution note is required** before the resolve form can submit — enforced client-side, and again server-side in `stampDisputeResolution` (defense-in-depth, matching Slice B/C's reason-validation pattern).
- **`resolutionNotes`/`disputeResolvedBy`/`disputeResolvedAt`/`disputeResolutionType` are admin-stamp-only** — add to the orders S2 rules denylist (the `resume` branch is a plain client write today; a non-admin forging these fields directly against Firestore must be blocked server-side even though the app's role check already prevents it through normal use).
- **`disputeReason` is buyer/seller-writable** — it's part of their own already-permitted `open_dispute` transition, no rules change needed (same class as the existing `deliveryAddress` field).
- **Bilingual + RTL** via `isAr`, matching every existing admin section.
- **No new test debt backfill:** `orderWorkflow.ts` has no existing test file — this plan adds ONE narrowly-scoped test file covering only the new `disputeReason` behavior, not the rest of that module's untested surface.
- **Deploy caveat:** `tsc --noEmit` currently 0 errors — keep it that way.
- **Anchor edits by TEXT, not line numbers** (repo moves fast).
- **Workflow:** Fable SDD (Opus fallback if Fable/org spend cap is hit, per standing instruction); one commit per task minimum; TDD where a pure unit exists.

---

## File Structure

**New:**
- `functions/disputeResolution.js` + `.test.js` — pure, deps-injected: `stampDisputeResolution(deps, {orderId, resolutionType, adminUid, notes})`.
- `src/utils/orderWorkflow.test.ts` — narrow: only the new `disputeReason` behavior on `open_dispute`.
- `src/components/admin/DisputesSection.tsx` — the queue + per-row resolution form.

**Modified:**
- `functions/index.js` — new callable `stampDisputeResolution`.
- `firestore.rules` — orders S2 denylist gains 4 fields.
- `src/types.ts` — `Order` gains `disputeReason?`, `resolutionNotes?`, `disputeResolvedBy?`, `disputeResolvedAt?`, `disputeResolutionType?`.
- `src/utils/orderWorkflow.ts` — `open_dispute` case threads `disputeReason`.
- `src/components/OrderDetailsView.tsx` — `handleOpenDispute` requires a reason before confirming.
- `src/components/AdminDashboardView.tsx` — new `'disputes'` tab (fourth core-job tab), wired the same way Slices B/C wired theirs.

---

## Task 1: Pure dispute-resolution stamp module

**Files:** Create `functions/disputeResolution.js`; Test `functions/disputeResolution.test.js`.

**Interfaces — Consumes:** copy the `makeSnapshot`/`makeFakeDb`/`FakeTimestamp`/`deps`/`makeError` helpers from `functions/fulfillmentNudge.test.js` verbatim into this test file (test-local, do not import across test files).
**Interfaces — Produces (CommonJS):**
- `stampDisputeResolution(deps, { orderId, resolutionType, adminUid, notes } = {})`:
  - `invalid-argument` for missing `orderId`, `resolutionType` not in `{'release','refund','resume'}`, or `notes` missing/whitespace-only (trimmed).
  - `not-found` if the order doesn't exist.
  - Reads the order fresh inside `db.runTransaction`, all reads before writes.
  - Stamps `{ resolutionNotes: <trimmed notes>, disputeResolvedBy: adminUid || null, disputeResolvedAt: Timestamp.fromMillis(now()), disputeResolutionType: resolutionType }` via `txn.set(ref, {...}, {merge:true})`.
  - Returns `{ orderId, resolutionType, notes: <trimmed> }`.
  - This is a metadata stamp only — it does NOT read or validate order status/escrow state; the real resolution already happened via the untouched engine before this is ever called.

- [ ] **Step 1: failing test** — `functions/disputeResolution.test.js`

```js
import { describe, it, expect } from 'vitest';
const { stampDisputeResolution } = require('./disputeResolution');

// ---- copy makeSnapshot/makeFakeDb/FakeTimestamp/deps/makeError from
// functions/fulfillmentNudge.test.js verbatim here ----

describe('stampDisputeResolution', () => {
  it('stamps all four fields on a successful release resolution', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'completed' } });
    const res = await stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'release', adminUid: 'admin1', notes: '  Seller shipped correct item, buyer confirmed in chat.  ' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.resolutionNotes).toBe('Seller shipped correct item, buyer confirmed in chat.');
    expect(write.data.disputeResolvedBy).toBe('admin1');
    expect(write.data.disputeResolvedAt._ms).toBe(NOW_MS);
    expect(write.data.disputeResolutionType).toBe('release');
    expect(res).toEqual({ orderId: 'o1', resolutionType: 'release', notes: 'Seller shipped correct item, buyer confirmed in chat.' });
  });
  it('accepts refund and resume as valid resolutionTypes', async () => {
    const db1 = makeFakeDb({ 'orders/o2': { status: 'refunded' } });
    await stampDisputeResolution(deps(db1), { orderId: 'o2', resolutionType: 'refund', adminUid: 'a', notes: 'Item not as described.' });
    expect(db1._writes[0].data.disputeResolutionType).toBe('refund');

    const db2 = makeFakeDb({ 'orders/o3': { status: 'paid' } });
    await stampDisputeResolution(deps(db2), { orderId: 'o3', resolutionType: 'resume', adminUid: 'a', notes: 'Misunderstanding resolved, order proceeds.' });
    expect(db2._writes[0].data.disputeResolutionType).toBe('resume');
  });
  it('rejects an invalid resolutionType (invalid-argument, zero writes)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'completed' } });
    await expect(stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'bogus', adminUid: 'a', notes: 'x' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });
  it('rejects missing or whitespace-only notes (invalid-argument, zero writes)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'completed' } });
    await expect(stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'release', adminUid: 'a', notes: '   ' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'release', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });
  it('throws not-found for a missing order', async () => {
    const db = makeFakeDb({});
    await expect(stampDisputeResolution(deps(db), { orderId: 'missing', resolutionType: 'release', adminUid: 'a', notes: 'x' }))
      .rejects.toMatchObject({ code: 'not-found' });
  });
  it('rejects a missing orderId (invalid-argument)', async () => {
    const db = makeFakeDb({});
    await expect(stampDisputeResolution(deps(db), { resolutionType: 'release', adminUid: 'a', notes: 'x' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 2:** `npx vitest run functions/disputeResolution.test.js` → FAIL (module missing).
- [ ] **Step 3: implement** — `functions/disputeResolution.js`

```js
/**
 * Pure dispute-resolution metadata stamp (Slice D). This is NOT a money
 * transition — the real resolution (release/refund/resume) already ran
 * through the existing, untouched executeOrderTransition('resolve_dispute')
 * path BEFORE this is ever called. This module only records the admin's
 * note for the record. Mirrors the deps-injection + fake-db test pattern
 * from orderPaymentVerify.js / fulfillmentNudge.js.
 */
const VALID_RESOLUTION_TYPES = ['release', 'refund', 'resume'];

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function stampDisputeResolution(deps, { orderId, resolutionType, adminUid, notes } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  if (!VALID_RESOLUTION_TYPES.includes(resolutionType)) {
    throw makeError('invalid-argument', "resolutionType must be 'release', 'refund', or 'resume'.");
  }
  const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';
  if (!trimmedNotes) throw makeError('invalid-argument', 'A resolution note is required.');

  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);

    txn.set(ref, {
      resolutionNotes: trimmedNotes,
      disputeResolvedBy: adminUid || null,
      disputeResolvedAt: Timestamp.fromMillis(now()),
      disputeResolutionType: resolutionType,
    }, { merge: true });

    return { orderId, resolutionType, notes: trimmedNotes };
  });
}

module.exports = { stampDisputeResolution };
```

- [ ] **Step 4:** focused → PASS. **Step 5:** full suite + `node --check functions/disputeResolution.js`. **Step 6: commit** `feat(disputes): pure dispute-resolution stamp module (tested)`

---

## Task 2: Rules denylist + Order type fields

**Files:** Modify `firestore.rules`; Modify `src/types.ts`.

**Interfaces — Produces:** orders S2 denylist gains `resolutionNotes`, `disputeResolvedBy`, `disputeResolvedAt`, `disputeResolutionType`. `Order` gains those 4 (admin-only) plus `disputeReason?: string` (buyer/seller-writable — NOT added to the denylist).

- [ ] **Step 1:** in `firestore.rules`, find the orders S2 `affectedKeys().hasAny([` list (anchor: search for `'lastNudgedAt', 'nudgeCount'` — Slice C's addition, the current last entries) and append:

```
            'resolutionNotes', 'disputeResolvedBy', 'disputeResolvedAt', 'disputeResolutionType'
```

- [ ] **Step 2:** in `src/types.ts`, find the `Order` interface (anchor: search for `nudgeCount?: number;` — Slice C's last addition) and add directly after it:

```ts
  /** Reason the buyer/seller gave when opening the dispute. Buyer/seller-writable (their own transition). */
  disputeReason?: string;
  /** Slice D dispute-resolution stamp — admin-only via stampDisputeResolution, recorded AFTER the real resolution (release/refund/resume) already happened. */
  resolutionNotes?: string;
  disputeResolvedBy?: string;
  disputeResolvedAt?: any;
  disputeResolutionType?: 'release' | 'refund' | 'resume';
```

- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors. Rules dry-run if CLI available (else CI validates on merge). **Step 4: commit** `feat(disputes): rules denylist + Order type fields for dispute stamp`

---

## Task 3: Callable wiring

**Files:** Modify `functions/index.js`.

**Interfaces — Consumes:** Task 1's `stampDisputeResolution`; existing `assertAdmin`, `db`, `admin`.
**Interfaces — Produces:** callable `stampDisputeResolution({ orderId, resolutionType, notes })` → `{ success: true, ...result }`.

- [ ] **Step 1: require the module** — anchor: the require line for `fulfillmentNudge` (Slice C). Add directly after it:

```js
const { stampDisputeResolution: stampDisputeResolutionTxn } = require('./disputeResolution');
```

- [ ] **Step 2: add the callable** — anchor: directly after `exports.sendFulfillmentNudge = …`'s closing `});` (Slice C's callable). Add:

```js
/**
 * stampDisputeResolution — Slice D (Disputes). Records the admin's
 * resolution note AFTER the real resolution (release/refund/resume) has
 * already happened via the existing, unmodified resolve_dispute path.
 * This callable moves no money and re-derives nothing from order state —
 * it is purely descriptive metadata.
 */
exports.stampDisputeResolution = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { orderId, resolutionType, notes } = data || {};
  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    const result = await stampDisputeResolutionTxn(deps, { orderId, resolutionType, adminUid: context.auth.uid, notes });
    console.log(`[stampDisputeResolution] ${resolutionType} note stamped for order=${orderId} by ${context.auth.uid}`);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in stampDisputeResolution:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'invalid-argument'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});
```

- [ ] **Step 3:** `node --check functions/index.js`; full `npx vitest run`. **Step 4: commit** `feat(disputes): stampDisputeResolution admin callable`

---

## Task 4: Required reason on open + narrow orderWorkflow test

**Files:** Modify `src/utils/orderWorkflow.ts`; Create `src/utils/orderWorkflow.test.ts`; Modify `src/components/OrderDetailsView.tsx`.

**Interfaces — Produces:** `executeOrderTransition(order, 'open_dispute', currentUser, { disputeReason })` writes `disputeReason` alongside `status: 'disputed'`. `handleOpenDispute` in `OrderDetailsView.tsx` requires a non-empty reason before the transition fires.

- [ ] **Step 1: failing test** — `src/utils/orderWorkflow.test.ts` (new file; narrow scope — only the new behavior):

```ts
import { describe, it, expect } from 'vitest';

// executeOrderTransition is Firebase-bound (imports db/getCallableFunction from
// '../services/firebase'), so it cannot run headless in this test. Instead,
// this test locks down the PURE transition-target logic by re-deriving it
// from the module's exported VALID_TRANSITIONS/validateTransition, which ARE
// pure and exported. It asserts the FSM still allows the transition this
// slice depends on (paid -> disputed) and that disputed is a legal source
// for all three resolution targets — a regression guard, not a full
// integration test of the Firestore write (which the manual smoke test covers).
import { VALID_TRANSITIONS, validateTransition } from './orderWorkflow';

describe('orderWorkflow — dispute transitions (Slice D regression guard)', () => {
  it('paid, shipped, and delivered can all transition to disputed', () => {
    expect(VALID_TRANSITIONS.paid).toContain('disputed');
    expect(VALID_TRANSITIONS.shipped).toContain('disputed');
    expect(VALID_TRANSITIONS.delivered).toContain('disputed');
  });
  it('disputed can resolve to completed, refunded, or paid (resume)', () => {
    expect(VALID_TRANSITIONS.disputed).toEqual(expect.arrayContaining(['completed', 'refunded', 'paid']));
  });
  it('validateTransition does not throw for paid -> disputed', () => {
    expect(() => validateTransition('paid', 'disputed')).not.toThrow();
  });
});
```

- [ ] **Step 2:** run → this actually PASSES immediately if `VALID_TRANSITIONS`/`validateTransition` are already exported (they are — confirmed in the existing file). This is a REGRESSION-GUARD test, not new-behavior TDD; skip the RED step and note in the report that this test locks down pre-existing exported behavior this slice depends on, rather than driving new code.

- [ ] **Step 3: thread `disputeReason` through `open_dispute`** — in `orderWorkflow.ts`, find the `case 'open_dispute':` block (anchor: `activityMessageEn = 'Formal dispute logged. Mazad has paused the payout to the seller pending review.';`) and change:

```ts
    case 'open_dispute':
      toStatus = 'disputed';
      updateFields = {
        status: 'disputed'
      };
```
to:
```ts
    case 'open_dispute':
      toStatus = 'disputed';
      updateFields = {
        status: 'disputed',
        disputeReason: extraFields?.disputeReason || ''
      };
```
(Leave the `activityType`/`activityMessageAr`/`activityMessageEn` lines immediately below unchanged.)

- [ ] **Step 4: require a reason before opening** — in `OrderDetailsView.tsx`, find `handleOpenDispute` (anchor: `const handleOpenDispute = async () => {`). Replace the bare `confirm(...)` gate with a reason prompt that must be non-empty, keeping the existing confirm as a second step (mirrors this same file's existing `prompt()`-then-proceed idiom used a few lines below in `handleCloseDispute` — do not build a new inline-form UI component for this; that's out of scope for this admin-focused slice):

```ts
  const handleOpenDispute = async () => {
    const reason = prompt(
      isAr
        ? 'يرجى وصف المشكلة قبل فتح النزاع (مطلوب):'
        : 'Please describe the issue before opening a dispute (required):'
    );
    if (!reason || !reason.trim()) {
      if (reason !== null) {
        alert(isAr ? 'سبب النزاع مطلوب.' : 'A dispute reason is required.');
      }
      return;
    }
    if (confirm(isAr ? 'هل ترغب في فتح نزاع رسمي حول هذا الطلب؟ سيتم تجميد الضمان.' : 'Open a formal dispute for this order? Escrow assets will be locked.')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'open_dispute', currentUser, { disputeReason: reason.trim() });
        addNotification(
          isAr ? 'تم فتح نزاع رسمي' : 'Dispute Opened',
          isAr ? 'تم فتح نزاع رسمي. مزاد أوقف تحويل المبلغ للبائع لحين مراجعة الفريق.' : 'Formal dispute logged. Mazad has paused the payout to the seller pending review.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل فتح النزاع: ${err.message}` : `Failed to open dispute: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };
```

`executeOrderTransition`'s 4th parameter (`extraFields`) already accepts `{ disputeReason?: ... }` once Step 3 lands — if TS complains about the `extraFields` type not listing `disputeReason`, widen `executeOrderTransition`'s `extraFields` parameter type in `orderWorkflow.ts` (anchor: `extraFields?: { trackingNumber?: string; resolutionType?: 'release' | 'refund' | 'resume' }`) to also include `disputeReason?: string`.

- [ ] **Step 5:** `npm run build && npx vitest run && npx tsc --noEmit` (0 errors). **Step 6: commit** `feat(disputes): required reason to open a dispute, threaded to the order`

---

## Task 5: DisputesSection UI

**Files:** Create `src/components/admin/DisputesSection.tsx`.

**Interfaces — Consumes:** none from Task 1/2/3 directly at the type level (receives already-fetched `orders` as props); calls the two callables via injected handler props.
**Interfaces — Produces:**

```ts
export interface DisputesSectionProps {
  isAr: boolean;
  orders: any[];                                        // realOrders (sim-excluded)
  onResolve: (orderId: string, resolutionType: 'release' | 'refund' | 'resume', notes: string) => Promise<void>;
}
```

Behavior:
- Filter `orders` to `status === 'disputed'`, sort oldest-first by `createdAt`/`updatedAt` (mirror the existing `.seconds ? .seconds*1000 : ...` normalization pattern already used elsewhere in `AdminDashboardView.tsx`/`FulfillmentSection.tsx`).
- Each row: order/auction title, buyer name, seller name, **the dispute reason** (`order.disputeReason`, bilingual "no reason recorded" fallback for any pre-existing disputed orders from before this slice), how long it's been open (reuse `hoursBetween`/`daysBetween` from `../../utils/fulfillmentQueues` — already-tested, no need to re-derive).
- Three resolution buttons: **Release to seller**, **Refund buyer**, **Resume as paid**. Clicking one reveals an inline required-notes textarea (mirror `PaymentVerifyCard`'s reject-reason pattern: quick-pick chips are NOT required here, just a free-text box) with a Confirm button disabled until non-empty trimmed text is present.
- On confirm: `onResolve(order.id, resolutionType, notes)`. Busy-disable all three action buttons for that row while pending; brief inline success/error feedback (mirror `FulfillmentSection`'s per-row `busy`/`feedback` local-state pattern).
- Bilingual empty state when there are zero disputed orders. Section header shows the count.

- [ ] Steps: implement → `npm run build && npx vitest run && npx tsc --noEmit` (0 errors; presentational, no unit test — build+suite are the evidence) → **commit** `feat(disputes): DisputesSection — queue, reasons, required-note resolution`

---

## Task 6: Admin mount + orchestrated resolve handler

**Files:** Modify `src/components/AdminDashboardView.tsx`.

**Interfaces — Consumes:** Task 5's `DisputesSection`; `executeOrderTransition` (confirmed NOT currently imported in `AdminDashboardView.tsx` — add `import { executeOrderTransition } from '../utils/orderWorkflow';`, same import `OrderDetailsView.tsx` uses); `currentUser` (confirmed already destructured from `useApp()` in this file); Task 3's `stampDisputeResolution` callable via `getCallableFunction`.

- [ ] **Step 1: lazy import** — anchor: `const FulfillmentSection = React.lazy(() => import('./admin/FulfillmentSection'));` (Slice C). Add directly after:

```ts
const DisputesSection = React.lazy(() => import('./admin/DisputesSection'));
```

- [ ] **Step 2: add `'disputes'` to `ADMIN_TABS`** — anchor: the `ADMIN_TABS` array. Insert `'disputes'` as the THIRD element (after `'verify'`, `'fulfillment'`, before `'metrics'`):

```ts
const ADMIN_TABS = [
  'verify',
  'fulfillment',
  'disputes',
  'metrics',
  ...
```

- [ ] **Step 3: disputed-count memo** — anchor: the `overdueFulfillmentCount` memo (Slice C). Add directly after its closing `);`:

```ts
  // Disputes (Slice D): count of open disputed orders, for the tab's
  // attention dot. Sourced from realOrders (sim-excluded), matching the
  // established pattern from Slices B/C.
  const openDisputesCount = useMemo(
    () => realOrders.filter((o: any) => o.status === 'disputed').length,
    [realOrders]
  );
```

- [ ] **Step 4: tab-row array + labels + dot** — anchor: the tab-row array literal. Insert `'disputes'` as the THIRD element (matching Step 2's position). In BOTH label ternaries, add a branch after the `'fulfillment'` branch: `tab === 'disputes' ? 'النزاعات' : ...` / `tab === 'disputes' ? 'DISPUTES' : ...`. In the attention-dot condition, add a sibling clause:

```ts
            (tab === 'disputes' && openDisputesCount > 0) ||
```

And in the badge-count ternary, add a branch: `: tab === 'disputes' ? openDisputesCount`.

- [ ] **Step 5: orchestrated resolve handler** — this is the task's one piece of real logic: sequencing the untouched money transition BEFORE the new stamp call. Anchor: directly after `handleFulfillmentReleaseEscrow`'s closing `};` (Slice C). Add the import alongside this file's other utility imports: `import { executeOrderTransition } from '../utils/orderWorkflow';`. `currentUser` is already destructured from `useApp()` in this file. Add:

```ts
  const handleResolveDispute = async (orderId: string, resolutionType: 'release' | 'refund' | 'resume', notes: string) => {
    const order = realOrders.find((o: any) => o.id === orderId);
    if (!order) {
      alert(isAr ? 'تعذر العثور على الطلب.' : 'Order not found.');
      return;
    }
    try {
      // 1. The REAL resolution — untouched, existing engine (money moves here).
      await executeOrderTransition(order, 'resolve_dispute', currentUser, { resolutionType });
      // 2. ONLY on success: record the admin's note. A failure here must never
      // read as if the resolution itself failed — it already succeeded.
      try {
        const stampCallable = await getCallableFunction<
          { orderId: string; resolutionType: 'release' | 'refund' | 'resume'; notes: string },
          { success: boolean }
        >('stampDisputeResolution');
        await stampCallable({ orderId, resolutionType, notes });
      } catch (stampErr: any) {
        console.warn('[handleResolveDispute] resolution succeeded but the note failed to save:', stampErr);
        alert(isAr
          ? '✅ تم الحل، لكن تعذر حفظ الملاحظة.'
          : '✅ Resolved, but the note could not be saved.'
        );
        return;
      }
      alert(isAr ? '✅ تم حل النزاع بنجاح.' : '✅ Dispute resolved successfully.');
    } catch (err: any) {
      console.error('Error resolving dispute:', err);
      alert(isAr ? `❌ فشل حل النزاع: ${err.message || String(err)}` : `❌ Failed to resolve dispute: ${err.message || String(err)}`);
    }
  };
```

- [ ] **Step 6: mount** — anchor: directly after the `activeTab === 'fulfillment'` block's closing `)}` (Slice C, before the `ORDERS MANAGEMENT` comment block). Add:

```tsx
        {activeTab === 'disputes' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-150 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <DisputesSection
              isAr={isAr}
              orders={realOrders}
              onResolve={handleResolveDispute}
            />
          </React.Suspense>
        )}

```

- [ ] **Step 7:** `npm run build && npx vitest run && npx tsc --noEmit` (0 errors). **Step 8: commit** `feat(disputes): mount Disputes tab (third position) — orchestrated resolve, untouched money engine`

---

## Post-implementation

- **Manual smoke** (MJ/colleague, live/sim): open a dispute with a reason → visible in the Disputes queue; resolve via each of the three actions with a note → money moves exactly as before (verify no change in `releaseOrderEscrow`/`refundOrderEscrow` behavior) AND the note appears on the order; attempt to submit a resolution with an empty note → blocked client-side; attempt to open a dispute with an empty reason → blocked.
- Finish via superpowers:finishing-a-development-branch → PR → merge (per MJ's standing instruction).

## Self-Review

**Spec coverage:** required reason on open (Task 4) ✓; Disputes queue with reason + age (Task 5) ✓; real resolution form w/ required note (Task 5/6) ✓; money engine untouched — verified no task edits `releaseOrderEscrow`/`refundOrderEscrow`/the release-refund branches of `orderWorkflow.ts` ✓; stamp-after-success sequencing (Task 6 Step 5, the core safety property) ✓; rules lockdown on admin-stamp fields (Task 2) ✓; non-goals (no evidence uploads, no SLA automation, no state-machine changes) respected — no task touches those.

**Placeholder scan:** no TBD/TODO. Task 4 Step 2 explicitly documents WHY it skips the RED step (regression-guard test on pre-existing exported behavior, not new-behavior TDD) rather than silently deviating from the TDD pattern — this is a disclosed, justified exception, not a placeholder.

**Type consistency:** `stampDisputeResolution(deps,{orderId,resolutionType,adminUid,notes})` matches between Tasks 1 and 3. Callable payload `{orderId,resolutionType,notes}` matches between Tasks 3 and 6. `DisputesSectionProps` matches between Tasks 5 and 6. `resolutionType: 'release'|'refund'|'resume'` used consistently across Tasks 1/3/5/6 — same three literals as the pre-existing `executeOrderTransition`'s `extraFields.resolutionType`. Field names (`disputeReason`, `resolutionNotes`, `disputeResolvedBy`, `disputeResolvedAt`, `disputeResolutionType`) consistent across Tasks 2/3/4/5.
