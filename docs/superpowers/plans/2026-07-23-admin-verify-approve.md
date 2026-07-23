# Admin Slice B — "Verify & Approve" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Verify & Approve` admin section — two focused sub-views (Memberships, Order payments) on one shared verify core — so the team's highest-volume job (verify CliQ payment → approve/reject) happens on one screen with a big receipt, amount context, payer identity, duplicate guard, and reject-with-reason that notifies the user.

**Architecture:** All state changes go through server callables — the client never writes grant/verify/money state. Order-payment verify/reject logic lives in a new pure CommonJS module `functions/orderPaymentVerify.js` (mirroring PR #61's `subscriptionApproval.js` extraction + fake-db test pattern), wrapped by a thin admin-gated callable. Membership reject extends the existing `rejectSubscriptionRequest` pure helper with a reason. Receipt-URL fragmentation is absorbed once by a pure `src/utils/paymentReceipt.ts`. The UI is one presentational card (`PaymentVerifyCard`) consumed by a section component mounted as a new admin tab; data + handlers flow in as props from `AdminDashboardView` (reuses its existing listeners/callables — no new listeners).

**Tech Stack:** React 19 + Vite + TS (`strict` off), Firebase (Firestore/Functions CommonJS), Vitest (`src/**/*.test.ts(x)` + `functions/**/*.test.js`), Tailwind, `isAr` bilingual pattern, `postToN8n` WhatsApp pipe.

## Global Constraints

- **Server-authoritative money/grant state:** membership grants via `approveSubscription`/`rejectSubscription` callables; order verification via the new `verifyOrderPayment` callable. Client writes NONE of: `paymentVerified`, `paymentVerifiedBy`, `paymentVerifiedAt`, `paymentRejectionReason`, subscription tier/expiry.
- **Bilingual + RTL:** every user-facing string has Arabic + English via `isAr`; containers respect the existing direction handling.
- **Firestore rejects explicit `undefined`** — omit optional keys via conditional spread.
- **Notifications are best-effort:** `postToN8n('membership_rejected'|'order_payment_rejected', …)` fires AFTER the state change commits and must never block or fail it (same discipline as the settle-path webhooks). Payload always includes `idempotencyKey`.
- **Reject requires a non-empty reason** (both sub-views). Reason is stored (`rejectionReason` on the request doc / `paymentRejectionReason` on the order) and sent in the notify payload.
- **Vestigial deposit flow untouched:** do not modify the `CLIQ PAYMENTS` tab, `escrows`, `requestTopUp`, `releaseEscrow`.
- **Anchor edits by TEXT, not line numbers** — this repo moves fast (3 PRs merged today); every Modify instruction below gives the anchor string.
- **Deploy caveat:** `tsc --noEmit` currently 0 errors — keep it that way; rely on `npm run build` + Vitest.
- **Workflow:** Fable SDD; one commit per task minimum; TDD where a pure unit exists.

---

## File Structure

**New:**
- `src/utils/paymentReceipt.ts` + `.test.ts` — `normalizeReceiptUrl`, `receiptFingerprint`, `findDuplicateFingerprints`. Pure.
- `functions/orderPaymentVerify.js` + `.test.js` — pure `verifyOrderPayment(deps, {orderId, adminUid})` / `rejectOrderPayment(deps, {orderId, adminUid, reason})`.
- `src/components/admin/PaymentVerifyCard.tsx` — shared verify-core card (presentational, callback props).
- `src/components/admin/VerifyApproveSection.tsx` — the two sub-views + segment switch + counts.

**Modified:**
- `functions/subscriptionApproval.js` + `.test.js` — `rejectSubscriptionRequest` gains optional `reason`.
- `functions/index.js` — `verifyOrderPayment` callable; `rejectSubscription` passes reason + fires notify; order-reject notify.
- `firestore.rules` — orders S2 denylist gains the 4 verification fields.
- `src/types.ts` — `Order` gains `paymentVerified?`, `paymentVerifiedBy?`, `paymentVerifiedAt?`, `paymentRejectionReason?`.
- `src/components/AdminDashboardView.tsx` — new `verify` tab mounting the section; handlers wired to existing/new callables.

---

## Task 1: Receipt normalization util

**Files:** Create `src/utils/paymentReceipt.ts`; Test `src/utils/paymentReceipt.test.ts`.

**Interfaces — Produces:**
- `normalizeReceiptUrl(record: Record<string, any>): string | null` — resolves the fragmented field names (`receiptUrl`, `paymentProofUrl`, `paymentProofImage`, `proofUrl`, `paymentImageUrl`) in that priority order; returns null when none holds a real http(s) URL.
- `receiptFingerprint(url: string | null): string | null` — canonical identity for duplicate detection: the URL minus its query string (Firebase Storage download tokens differ per fetch; the storage path is the identity). Null in → null out.
- `findDuplicateFingerprints(records: { id: string; url: string | null }[]): Set<string>` — fingerprints appearing on ≥2 distinct record ids. **Honest scope:** this catches the same storage object referenced twice; it does NOT content-hash images (two uploads of the same screenshot get different paths) — document that in the JSDoc.

- [ ] **Step 1: failing test** — `src/utils/paymentReceipt.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { normalizeReceiptUrl, receiptFingerprint, findDuplicateFingerprints } from './paymentReceipt';

describe('normalizeReceiptUrl', () => {
  it('resolves each legacy field name in priority order', () => {
    expect(normalizeReceiptUrl({ receiptUrl: 'https://a/1.png' })).toBe('https://a/1.png');
    expect(normalizeReceiptUrl({ paymentProofUrl: 'https://a/2.png' })).toBe('https://a/2.png');
    expect(normalizeReceiptUrl({ paymentProofImage: 'https://a/3.png' })).toBe('https://a/3.png');
    expect(normalizeReceiptUrl({ proofUrl: 'https://a/4.png' })).toBe('https://a/4.png');
    expect(normalizeReceiptUrl({ paymentImageUrl: 'https://a/5.png' })).toBe('https://a/5.png');
    expect(normalizeReceiptUrl({ receiptUrl: 'https://a/1.png', paymentProofUrl: 'https://a/2.png' })).toBe('https://a/1.png');
  });
  it('returns null for missing, empty, or non-http values', () => {
    expect(normalizeReceiptUrl({})).toBeNull();
    expect(normalizeReceiptUrl({ receiptUrl: '' })).toBeNull();
    expect(normalizeReceiptUrl({ receiptUrl: 'N/A' })).toBeNull();
    expect(normalizeReceiptUrl({ receiptUrl: 42 })).toBeNull();
  });
});

describe('receiptFingerprint', () => {
  it('strips the query string (storage tokens differ per fetch)', () => {
    expect(receiptFingerprint('https://s/o/payment-proofs%2Fu%2F1.png?alt=media&token=abc'))
      .toBe('https://s/o/payment-proofs%2Fu%2F1.png');
    expect(receiptFingerprint('https://a/x.png')).toBe('https://a/x.png');
    expect(receiptFingerprint(null)).toBeNull();
  });
});

describe('findDuplicateFingerprints', () => {
  it('flags a fingerprint used by two records, ignores same-record repeats and nulls', () => {
    const dups = findDuplicateFingerprints([
      { id: 'r1', url: 'https://s/p.png?token=a' },
      { id: 'r2', url: 'https://s/p.png?token=b' },
      { id: 'r3', url: 'https://s/other.png' },
      { id: 'r4', url: null },
    ]);
    expect(dups.has('https://s/p.png')).toBe(true);
    expect(dups.has('https://s/other.png')).toBe(false);
    expect(dups.size).toBe(1);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/utils/paymentReceipt.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement** — `src/utils/paymentReceipt.ts`

```ts
/**
 * Receipt-URL normalization for the Verify & Approve queues. The codebase
 * stores the CliQ receipt under five different field names depending on the
 * flow's era; every consumer used to repeat the fallback chain inline. This is
 * the one place that knows the chain.
 */
const RECEIPT_FIELDS = ['receiptUrl', 'paymentProofUrl', 'paymentProofImage', 'proofUrl', 'paymentImageUrl'] as const;

export function normalizeReceiptUrl(record: Record<string, any>): string | null {
  for (const f of RECEIPT_FIELDS) {
    const v = record?.[f];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return null;
}

/**
 * Duplicate identity = the URL minus its query string: Firebase Storage
 * download tokens vary, the object path doesn't. Honest limitation: this
 * catches the SAME storage object referenced twice, not two separate uploads
 * of the same screenshot (no content hashing).
 */
export function receiptFingerprint(url: string | null): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function findDuplicateFingerprints(records: { id: string; url: string | null }[]): Set<string> {
  const seen = new Map<string, Set<string>>(); // fingerprint -> record ids
  for (const r of records) {
    const fp = receiptFingerprint(r.url);
    if (!fp) continue;
    if (!seen.has(fp)) seen.set(fp, new Set());
    seen.get(fp)!.add(r.id);
  }
  return new Set([...seen.entries()].filter(([, ids]) => ids.size >= 2).map(([fp]) => fp));
}
```

- [ ] **Step 4:** focused test → PASS. **Step 5:** `npm run build && npx vitest run` → all green. **Step 6: commit** `feat(verify): receipt normalization + duplicate-fingerprint util`

---

## Task 2: Pure order-payment verify/reject module

**Files:** Create `functions/orderPaymentVerify.js`; Test `functions/orderPaymentVerify.test.js`.

**Interfaces — Consumes:** the fake-db test pattern from `functions/subscriptionApproval.test.js` (`makeFakeDb(fixtures)`, `deps = { db, Timestamp, now }`, `makeError(code,msg)` with `.code`). Mirror it — copy the small mock helpers into this test file (they are test-local by design there; do not import across test files).
**Interfaces — Produces (CommonJS `module.exports`):**
- `verifyOrderPayment(deps, { orderId, adminUid })` → txn: order must exist, must have a proof (any of the receipt fields — reuse the same 5-name chain, implemented locally in JS), must not be already verified (already-verified → return `{ alreadyVerified: true }`, no writes — idempotent). Writes `{ paymentVerified: true, paymentVerifiedBy: adminUid, paymentVerifiedAt: Timestamp.fromMillis(now()), ...(status==='waiting_payment' ? { status: 'paid', paymentStatus: 'paid' } : {}) }` merge. Returns `{ orderId, buyerId, buyerName, alreadyVerified: false }`.
- `rejectOrderPayment(deps, { orderId, adminUid, reason })` → validates non-empty trimmed `reason` (else `invalid-argument`); order must exist (`not-found`); already-verified orders CANNOT be rejected (`failed-precondition` — verification is the terminal state of this slice; un-verifying is out of scope). Writes `{ paymentStatus: 'unpaid', status: 'waiting_payment', paymentRejectionReason: reason, paymentRejectedBy: adminUid, paymentRejectedAt: Timestamp.fromMillis(now()) }` merge. Returns `{ orderId, buyerId, buyerName, reason }`.
- Both read the order fresh inside `db.runTransaction`; all reads before writes.

- [ ] **Step 1: failing test** — `functions/orderPaymentVerify.test.js` (mirror the subscriptionApproval mock; test matrix):

```js
import { describe, it, expect } from 'vitest';
const { verifyOrderPayment, rejectOrderPayment } = require('./orderPaymentVerify');

// ---- fake-db helpers: copy the makeSnapshot/makeFakeDb/FakeTimestamp/deps
// pattern from functions/subscriptionApproval.test.js verbatim ----

describe('verifyOrderPayment', () => {
  it('stamps paymentVerified/By/At on a self-claimed paid order with proof', async () => { /* fixture: orders/o1 {status:'paid', paymentStatus:'paid', paymentProofUrl:'https://x', buyerId:'b1', buyerName:'B'} → expect one write to orders/o1 with paymentVerified:true, paymentVerifiedBy:'admin1', paymentVerifiedAt._ms === NOW_MS, and NO status change */ });
  it('normalizes a waiting_payment straggler with proof to paid while stamping', async () => { /* fixture status:'waiting_payment' → write includes status:'paid', paymentStatus:'paid' */ });
  it('is idempotent: already-verified returns alreadyVerified:true with zero writes', async () => {});
  it('throws failed-precondition when the order has no receipt on any legacy field', async () => {});
  it('throws not-found for a missing order', async () => {});
});

describe('rejectOrderPayment', () => {
  it('resets to waiting_payment/unpaid and stamps reason + rejectedBy/At', async () => {});
  it('requires a non-empty reason (invalid-argument, whitespace-only rejected)', async () => {});
  it('refuses to reject an already-verified order (failed-precondition)', async () => {});
  it('throws not-found for a missing order', async () => {});
});
```

Write every test body out fully (the skeleton comments above tell you each fixture + assertion; assert on `db._writes` contents exactly like subscriptionApproval.test.js does, and use `await expect(...).rejects` + `.code` for error cases).

- [ ] **Step 2:** focused run → FAIL. **Step 3: implement** `functions/orderPaymentVerify.js`:

```js
/**
 * Pure order-payment verification core (Slice B). The verifyOrderPayment
 * callable in index.js is a thin admin-gated wrapper; the state machine and
 * idempotency live here so Vitest covers them (same split as
 * subscriptionApproval.js).
 */
const RECEIPT_FIELDS = ['receiptUrl', 'paymentProofUrl', 'paymentProofImage', 'proofUrl', 'paymentImageUrl'];

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function hasReceipt(orderData) {
  return RECEIPT_FIELDS.some((f) => typeof orderData[f] === 'string' && /^https?:\/\//i.test(orderData[f].trim()));
}

async function verifyOrderPayment(deps, { orderId, adminUid } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};
    if (o.paymentVerified === true) {
      return { orderId, buyerId: o.buyerId || null, buyerName: o.buyerName || 'Buyer', alreadyVerified: true };
    }
    if (!hasReceipt(o)) throw makeError('failed-precondition', `Order ${orderId} has no payment receipt to verify.`);
    txn.set(ref, {
      paymentVerified: true,
      paymentVerifiedBy: adminUid || null,
      paymentVerifiedAt: Timestamp.fromMillis(now()),
      ...(o.status === 'waiting_payment' ? { status: 'paid', paymentStatus: 'paid' } : {}),
    }, { merge: true });
    return { orderId, buyerId: o.buyerId || null, buyerName: o.buyerName || 'Buyer', alreadyVerified: false };
  });
}

async function rejectOrderPayment(deps, { orderId, adminUid, reason } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed) throw makeError('invalid-argument', 'A rejection reason is required.');
  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};
    if (o.paymentVerified === true) {
      throw makeError('failed-precondition', `Order ${orderId} is already verified; un-verifying is not supported.`);
    }
    txn.set(ref, {
      paymentStatus: 'unpaid',
      status: 'waiting_payment',
      paymentRejectionReason: trimmed,
      paymentRejectedBy: adminUid || null,
      paymentRejectedAt: Timestamp.fromMillis(now()),
    }, { merge: true });
    return { orderId, buyerId: o.buyerId || null, buyerName: o.buyerName || 'Buyer', reason: trimmed };
  });
}

module.exports = { verifyOrderPayment, rejectOrderPayment };
```

- [ ] **Step 4:** focused → PASS. **Step 5:** full suite + `node --check functions/orderPaymentVerify.js`. **Step 6: commit** `feat(verify): pure order-payment verify/reject core (tested)`

---

## Task 3: Membership reject reason (pure helper + tests)

**Files:** Modify `functions/subscriptionApproval.js` (`rejectSubscriptionRequest`); Modify `functions/subscriptionApproval.test.js`.

**Interfaces — Produces:** `rejectSubscriptionRequest(deps, { reqId, userId, reason })` — `reason` optional (backward-compatible); when a non-empty string, both txn branches also merge `rejectionReason: reason.trim()` onto the **request doc** (reqId branch) and include `reason` in the returned object (`{ ..., reason: trimmedOrNull }`) so the callable can pass it to the notify. No reason → behavior byte-identical to today.

- [ ] **Step 1: extend the test file** — add to `functions/subscriptionApproval.test.js` (reusing its existing helpers):

```js
describe('rejectSubscriptionRequest — reason (Slice B)', () => {
  it('stores rejectionReason on the request doc and returns it', async () => {
    const db = makeFakeDb({ 'subscriptionRequests/r1': { userId: 'u1' }, 'users/u1': { subscriptionStatus: 'pending' } });
    const res = await rejectSubscriptionRequest(deps(db), { reqId: 'r1', reason: '  receipt unclear ' });
    const reqWrite = db._writes.find((w) => w.path === 'subscriptionRequests/r1');
    expect(reqWrite.data.rejectionReason).toBe('receipt unclear');
    expect(res.reason).toBe('receipt unclear');
  });
  it('omits rejectionReason entirely when no reason is given (back-compat)', async () => {
    const db = makeFakeDb({ 'subscriptionRequests/r1': { userId: 'u1' }, 'users/u1': { subscriptionStatus: 'pending' } });
    const res = await rejectSubscriptionRequest(deps(db), { reqId: 'r1' });
    const reqWrite = db._writes.find((w) => w.path === 'subscriptionRequests/r1');
    expect('rejectionReason' in reqWrite.data).toBe(false);
    expect(res.reason).toBeNull();
  });
});
```

- [ ] **Step 2:** run → FAIL. **Step 3: implement** — in `rejectSubscriptionRequest`, compute `const trimmedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;` at the top; in the reqId-branch `txn.set(reqRef, {...})` add `...(trimmedReason ? { rejectionReason: trimmedReason } : {})`; add `reason: trimmedReason` to BOTH branches' return objects. Signature: `async function rejectSubscriptionRequest(deps, { reqId, userId, reason } = {})`.
- [ ] **Step 4:** focused → PASS (new + all pre-existing subscriptionApproval tests). **Step 5:** full suite. **Step 6: commit** `feat(verify): rejectSubscriptionRequest carries a rejection reason`

---

## Task 4: Callables + notifications + rules

**Files:** Modify `functions/index.js`; Modify `firestore.rules`.

**Interfaces — Consumes:** Task 2's module; Task 3's `reason` return; existing `assertAdmin(context)`, `postToN8n(event, payload)`, `db`, `admin.firestore.Timestamp`.
**Interfaces — Produces:** callable `verifyOrderPayment({ orderId, action: 'verify' | 'reject', reason? })`; `rejectSubscription` accepts + forwards `reason`; notify events `order_payment_rejected` and `membership_rejected`, each `{ phone, name, reason, orderId?/reqId?, idempotencyKey }`.

- [ ] **Step 1: require the module** — top of `functions/index.js` next to `const { ... } = require('./subscriptionApproval');` (anchor: that require line), add:

```js
const { verifyOrderPayment: verifyOrderPaymentTxn, rejectOrderPayment: rejectOrderPaymentTxn } = require('./orderPaymentVerify');
```

- [ ] **Step 2: add the callable** — place directly after the `exports.rejectSubscription = …` block (anchor: its closing `});`):

```js
/**
 * verifyOrderPayment — Slice B (Verify & Approve).
 * Admin verifies (or rejects) a buyer's self-claimed CliQ payment on an order.
 * State machine + idempotency live in orderPaymentVerify.js (unit-tested);
 * this wrapper is admin-gating + the post-commit WhatsApp notify.
 */
exports.verifyOrderPayment = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { orderId, action, reason } = data || {};
  if (action !== 'verify' && action !== 'reject') {
    throw new functions.https.HttpsError('invalid-argument', "action must be 'verify' or 'reject'.");
  }
  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    if (action === 'verify') {
      const result = await verifyOrderPaymentTxn(deps, { orderId, adminUid: context.auth.uid });
      console.log(`[verifyOrderPayment] verified order=${orderId} already=${result.alreadyVerified} by ${context.auth.uid}`);
      return { success: true, ...result };
    }
    const result = await rejectOrderPaymentTxn(deps, { orderId, adminUid: context.auth.uid, reason });
    // Post-commit, best-effort: tell the buyer why, so they can resubmit.
    let phone = '';
    try {
      const buyerSnap = result.buyerId ? await db.collection('users').doc(result.buyerId).get() : null;
      phone = buyerSnap && buyerSnap.exists ? (buyerSnap.data().phoneNumber || '') : '';
    } catch (e) { console.warn('[verifyOrderPayment] buyer phone lookup failed:', e); }
    await postToN8n('order_payment_rejected', {
      phone, name: result.buyerName, reason: result.reason, orderId,
      idempotencyKey: `order_payment_rejected_${orderId}_${Date.now()}`,
    });
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in verifyOrderPayment:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'invalid-argument', 'failed-precondition'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});
```

- [ ] **Step 3: membership reject reason + notify** — in `exports.rejectSubscription` (anchor: `const { reqId, userId } = data || {};`): change the destructure to `const { reqId, userId, reason } = data || {};`, pass `reason` into `rejectSubscriptionRequest(deps, { reqId, userId, reason })`, and after the `console.log` line add the best-effort notify (phone lookup from `result.userId` like Step 2's pattern):

```js
    let phone = '';
    try {
      const userSnap = result.userId ? await db.collection('users').doc(result.userId).get() : null;
      phone = userSnap && userSnap.exists ? (userSnap.data().phoneNumber || '') : '';
    } catch (e) { console.warn('[rejectSubscription] phone lookup failed:', e); }
    await postToN8n('membership_rejected', {
      phone,
      name: result.userId || 'Member',
      reason: result.reason || '',
      reqId: result.reqId || null,
      idempotencyKey: `membership_rejected_${result.reqId || result.userId}_${Date.now()}`,
    });
```

(Verify `postToN8n` never throws — it is the established no-op-on-unset pipe; if it can throw, wrap in try/catch.)

- [ ] **Step 4: rules denylist** — in `firestore.rules`, orders S2 update rule (anchor: the `affectedKeys().hasAny([` list containing `'buyerId', 'sellerId', 'auctionId', 'winningBidAmount', 'totalDue',`) — append to that list:

```
            'paymentVerified', 'paymentVerifiedBy', 'paymentVerifiedAt',
            'paymentRejectionReason', 'paymentRejectedBy', 'paymentRejectedAt'
```

(Callable uses the Admin SDK and bypasses rules; this stops any client — buyer, seller, or spoofed — from self-verifying.)

- [ ] **Step 5:** `node --check functions/index.js`; full suite; rules dry-run if CLI available (else CI validates). **Step 6: commit** `feat(verify): verifyOrderPayment callable + reject notifies + rules denylist`

---

## Task 5: Order type fields + PaymentVerifyCard

**Files:** Modify `src/types.ts` (Order interface — anchor: `status: "waiting_payment"`); Create `src/components/admin/PaymentVerifyCard.tsx`.

**Interfaces — Consumes:** Task 1's util.
**Interfaces — Produces:**
- `Order` gains: `paymentVerified?: boolean; paymentVerifiedBy?: string; paymentVerifiedAt?: any; paymentRejectionReason?: string;` (doc comments: Slice B verification stamp, server-only via verifyOrderPayment callable).
- `PaymentVerifyCard` props:

```ts
export interface PaymentVerifyCardProps {
  record: Record<string, any>;          // sub request or order — receipt resolved via normalizeReceiptUrl
  title: string;                        // e.g. product title or plan label (caller-localized)
  expectedAmountJod: number;            // shown big next to the receipt
  amountMismatch?: boolean;             // caller-computed (e.g. sub price ≠ canonical tier price)
  payerName: string;
  payerPhone?: string;
  isDuplicateReceipt?: boolean;         // caller-computed via findDuplicateFingerprints
  approveLabel: string;                 // caller-localized ('Approve' / 'Mark verified')
  busy?: boolean;
  isAr: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;   // card enforces non-empty reason before calling
}
```

Card layout (Tailwind, matches admin card idiom): receipt image large (`max-h-72 object-contain`, click toggles a full-screen zoom overlay `fixed inset-0 bg-black/85 z-50` with the image `max-h-[90vh]`, click-to-close); "no receipt attached" state (bilingual) with Approve disabled; amount block (`expectedAmountJod` big mono + amber `⚠ mismatch` chip when `amountMismatch`); payer name + phone line; red `⚠ duplicate receipt` chip when `isDuplicateReceipt` (warning only — never blocks); Approve button (emerald, disabled when `busy` or no receipt); Reject flow = button reveals an inline reason box (3 quick-pick bilingual chips: unclear receipt / amount mismatch / wrong account — `['الإيصال غير واضح|Receipt unclear','المبلغ غير مطابق|Amount mismatch','حساب غير صحيح|Wrong account']` — plus free-text input), confirm disabled until non-empty, then `onReject(reason)`. All strings bilingual via `isAr`.

- [ ] Steps: types edit → implement card → `npm run build && npx vitest run` (no unit test for the presentational card; build + suite) → **commit** `feat(verify): shared PaymentVerifyCard (receipt zoom, amount, dup guard, reject reason)`

---

## Task 6: VerifyApproveSection + admin mount

**Files:** Create `src/components/admin/VerifyApproveSection.tsx`; Modify `src/components/AdminDashboardView.tsx`.

**Interfaces — Consumes:** Tasks 1, 5; AdminDashboardView's existing `subscriptionRequests` state, `realOrders`/orders source, `approveSubscription(request)` / `rejectSubscription(request)`-family handlers, `getCallableFunction`.
**Interfaces — Produces:** `<VerifyApproveSection {...props} />` with props (all data/handlers injected — the section creates NO listeners):

```ts
export interface VerifyApproveSectionProps {
  isAr: boolean;
  subscriptionRequests: any[];
  orders: any[];                        // admin's orders array (same source the ORDERS tab uses)
  onApproveSubscription: (req: any) => Promise<void>;
  onRejectSubscription: (req: any, reason: string) => Promise<void>;
  onVerifyOrderPayment: (orderId: string) => Promise<void>;
  onRejectOrderPayment: (orderId: string, reason: string) => Promise<void>;
}
```

Section behavior:
- Segment switch `Memberships | Order payments` (bilingual), each label with its pending count.
- **Memberships queue** = `subscriptionRequests` (already only pending — verify against how the PREMIUM SUBS tab filters; mirror it). Per request → `PaymentVerifyCard` with: `expectedAmountJod = req.price`, `amountMismatch` = `req.price` differs from the canonical tier price for `req.planId`/`req.subscriptionPlan` (canonical map `{ monthly: 1, semiannual: 4, annual: 7 }` — confirm ids against `functions/subscriptionTiers.js` and import/duplicate consciously per its constants), `payerName = req.transferFullName || req.userName || '—'`, `payerPhone = req.transferPhone`, dup-guard across all requests' fingerprints.
- **Order-payments queue** = `orders.filter(o => normalizeReceiptUrl(o) && o.paymentVerified !== true && ['waiting_payment','paid'].includes(o.status))`. Per order → card with `expectedAmountJod = o.totalDue`, `payerName = o.buyerName`, `payerPhone = o.deliveryPhone`, title = `o.auctionTitle`, dup-guard across the queue + verified orders' fingerprints, `approveLabel` = 'تأكيد الدفع'/'Mark verified'.
- Empty states bilingual ("لا يوجد طلبات بانتظار المراجعة ✅" / "Nothing waiting for review ✅").
- Per-card `busy` while its handler runs; errors surface via the handlers (AdminDashboardView already toasts).

AdminDashboardView wiring:
- Add `'verify'` to the `AdminTab` union + `readStoredAdminTab` allowlist (anchor: the `'metrics',` literal list) and to the tab-row array (anchor: `(['metrics', 'orders', …] as const)`), label `التحقق والموافقات` / `VERIFY & APPROVE`, placed FIRST in the row (it's the daily job), with the attention-dot condition `(tab === 'verify' && (subscriptionRequests.length > 0 || pendingOrderPaymentsCount > 0))` alongside the existing dot conditions.
- `pendingOrderPaymentsCount` = same filter as the section's order queue, computed with `useMemo` next to the other counts.
- Handlers: `onApproveSubscription` / `onRejectSubscription` delegate to the EXISTING approve/reject functions (extend the existing reject call to pass `reason` through to the callable — anchor: where `rejectSubscription` callable is invoked with `{ reqId, userId }`, add `reason`); `onVerifyOrderPayment` / `onRejectOrderPayment` call the new callable via `getCallableFunction('verifyOrderPayment')` with `{ orderId, action: 'verify' }` / `{ orderId, action: 'reject', reason }`, then toast success/failure like the neighbors.
- Render block: `{activeTab === 'verify' && (<VerifyApproveSection … />)}` (anchor: `{activeTab === 'orders' && (` — place before it). Lazy-import the section like SimulatorPanel if the file uses lazy chunks for tabs (check `SimulatorPanel` import style and mirror it).
- Do NOT remove/alter the existing PREMIUM SUBS or CLIQ PAYMENTS tabs this slice.

- [ ] Steps: build section → wire dashboard → `npm run build && npx vitest run` → **commit** `feat(verify): Verify & Approve section (memberships + order payments) as first admin tab`

---

## Post-implementation

- **n8n (assisted, not code):** add `membership_rejected` + `order_payment_rejected` branches to the Webhook Receiver workflow's Switch (same shape as the existing 8 events). Until then `postToN8n` no-ops safely.
- **Manual smoke (MJ/colleague, live or simulator):** membership: submit request with receipt → appears in Memberships → approve grants tier; reject with reason → request rejected + WhatsApp reason (once n8n branch exists). Order: sim-win an order, upload proof + self-claim pay → appears in Order payments → verify stamps `paymentVerified` (check doc) → reject path resets to waiting_payment with reason. Confirm a non-admin client CANNOT write `paymentVerified` (rules).
- Finish via superpowers:finishing-a-development-branch → PR → merge (per MJ's standing instruction this session).

## Self-Review

- **Spec coverage:** verify core (Task 5) ✓; receipt normalization (1) ✓; amount-match (5/6: display + sub-tier sanity flag — no OCR, per spec non-goal) ✓; payer identity (5/6) ✓; dup guard (1/5/6, honest URL-identity scope documented) ✓; memberships sub-view (6) ✓; order-payments sub-view + `verifyOrderPayment` (2/4/6) ✓; reject-with-reason + notify both paths (2/3/4/5) ✓; rules denylist (4) ✓; deposits untouched (constraint) ✓; Slice C seam (reject/verify only, no post-verify UI) ✓.
- **Placeholder scan:** Task 2 Step 1 test bodies are enumerated with exact fixtures/assertions in comments and an explicit instruction to write them out — acceptable brief-style delegation; all other code steps carry full code. No TBDs.
- **Type consistency:** `verifyOrderPayment(deps,{orderId,adminUid})` / `rejectOrderPayment(deps,{orderId,adminUid,reason})` match between Tasks 2 and 4; callable payload `{orderId, action, reason?}` matches between Tasks 4 and 6; `PaymentVerifyCardProps` matches between Tasks 5 and 6; field names (`paymentVerified/By/At`, `paymentRejectionReason/By/At`) consistent across Tasks 2/4 (rules)/5 (types).
