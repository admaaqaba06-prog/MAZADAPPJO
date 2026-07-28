# Wave 1 — CliQ Transaction-Reference Uniqueness (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Stop a reused CliQ transaction reference from being accepted as payment — the one real fraud hole in the audit. Capture a transaction reference at buyer submit, enforce global uniqueness server-side (hard reject on reuse by a different order), cap resubmissions at 3, and gate admin Approve on a "verified in bank" checkbox.

**Architecture:** Payment submission moves from a direct client `updateDoc` to a new `submitOrderPayment` Cloud callable that, in one Firestore transaction, reserves the normalized reference in a `paymentReferences/{normalizedRef}` lookup doc and writes the order's proof fields. Firestore rules are tightened so the payment-proof fields can only be written by the callable (Admin SDK), making the uniqueness check un-bypassable. Admin verify card gains the reference display + a bank-verified checkbox gate + a soft phone+amount duplicate warning.

**Tech Stack:** React 19 + Vite + TS (`src/`), Firebase Cloud Functions Gen-1 CommonJS (`functions/`), Firestore + rules, Vitest.

## Global Constraints
- Branch `feat/wave1-cliq-reference` off `origin/main` (which now includes Wave 0). Never push to main; PR → merge.
- **Do NOT change** the escrow-release money-in guard, settlement, bid math, or the *existing* `verifyOrderPayment`/`rejectOrderPayment` transaction/idempotency logic (only ADD reference display + bank-checkbox around verify).
- Preserve the EXACT current order status behavior on submit — read `orderWorkflow.ts` `'pay'` transition + `OrderDetailsView.handleSubmitCliqPayment` and replicate whatever status/paymentStatus it produces today; this wave changes WHERE the write happens (server) and ADDS reference/attempt logic, not the status semantics.
- **Reservation ownership rule:** `paymentReferences/{ref}` stores `{orderId, buyerId, createdAt}`. A submit is rejected ONLY if the ref exists AND `orderId` differs from the submitting order. Same order resubmitting the same ref (after an "unclear receipt" rejection) MUST be allowed. Never release/delete a reservation on reject.
- Loose ref validation: normalize = trim → uppercase → remove all internal whitespace; valid = normalized length ≥ 4. NO format/regex assumptions (CliQ ref shape unknown).
- Bilingual (ar/en) on every new user-facing string; Arabic is primary. Reuse the component's existing language pattern.
- Resubmit cap = 3 attempts per order.
- All existing tests stay green; new logic is TDD'd. Money-path server logic MUST have unit tests.
- Legacy orders (no reference) must still be verifiable — the reference is required only for NEW submissions through the new callable.

## File Structure
- **New:** `functions/orderPaymentSubmit.js` (+ `functions/orderPaymentSubmit.test.js`) — pure, dependency-injected submit logic (mirror the shape of `functions/orderPaymentVerify.js`).
- **New:** `src/utils/paymentReference.ts` (+ `.test.ts`) — client-side normalize + validate (mirrors the server normalizer; keep the two in sync — same rules).
- **New:** `functions/paymentReference.js` (+ `.test.js`) — server-side normalize + validate (same logic; CommonJS).
- **Modify:** `functions/index.js` — add `submitOrderPayment` callable wrapper (auth = buyer owns order).
- **Modify:** `src/components/OrderDetailsView.tsx` — add reference field; route submit through the callable; handle already-exists / cap errors.
- **Modify:** `src/components/admin/PaymentVerifyCard.tsx` + `src/components/admin/VerifyApproveSection.tsx` — reference display, bank-verified checkbox gating Approve, soft phone+amount dup warning.
- **Modify:** `src/types.ts` — add `txnRef?`, `txnRefNormalized?`, `paymentAttempts?` to `Order`.
- **Modify:** `firestore.rules` — `paymentReferences` collection locked to Admin SDK; buyers may no longer write payment-proof fields on `orders`.

Line numbers cited are from the 2026-07-28 flow-map; implementers MUST re-locate against current code.

---

### Task 1: Reference normalizer/validator (client + server twins)
**Files:** Create `src/utils/paymentReference.ts` + `.test.ts`; `functions/paymentReference.js` + `.test.js`.

**Interfaces — Produces:**
- (both) `normalizePaymentRef(raw: string): string` — `String(raw ?? '').trim().toUpperCase().replace(/\s+/g,'')`.
- (both) `isValidPaymentRef(raw: string): boolean` — `normalizePaymentRef(raw).length >= 4`.
- TS file exports typed; JS file `module.exports = { normalizePaymentRef, isValidPaymentRef }`.

- [ ] **Step 1:** Write failing tests (both files): `" ab 12 "`→`AB12`; lowercase→upper; internal spaces removed; `isValid('abc')`=false (len 3), `isValid('ab12')`=true, `isValid('')`=false, `isValid(null as any)`=false.
- [ ] **Step 2:** Run both, confirm fail.
- [ ] **Step 3:** Implement both (identical logic).
- [ ] **Step 4:** `npx vitest run src/utils/paymentReference.test.ts functions/paymentReference.test.js` green; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(payments): payment-reference normalize+validate (client+server)`.

### Task 2: `submitOrderPayment` server logic + reservation transaction
**Files:** Create `functions/orderPaymentSubmit.js` + `.test.js`. Read `functions/orderPaymentVerify.js` first for the exact dependency-injection + `makeError` + `runTransaction` house shape and mirror it.

**Interfaces — Consumes:** `normalizePaymentRef`, `isValidPaymentRef` from `functions/paymentReference.js`.
**Produces:** `submitOrderPayment(deps, args)` where `deps = { db, Timestamp, now }` and `args = { orderId, buyerUid, proofUrl, cliqSenderPhone, txnRef, deliveryAddress, deliveryPhone }`. Returns `{ orderId, attempts }` or throws `makeError(code, msg)`.

Transaction body (single `db.runTransaction`):
- get `orders/{orderId}`; if missing → `not-found`.
- assert `order.buyerId === buyerUid` → else `permission-denied`.
- assert order is in the submittable state (whatever today's precondition is — typically `status==='waiting_payment'`); else `failed-precondition`.
- `attempts = (order.paymentAttempts || 0)`; if `attempts >= 3` → `resource-exhausted` ("too many attempts").
- validate: `isValidPaymentRef(txnRef)` else `invalid-argument`; `proofUrl` present else `invalid-argument`; `cliqSenderPhone` non-empty else `invalid-argument`.
- `normRef = normalizePaymentRef(txnRef)`; `refRef = db.collection('paymentReferences').doc(normRef)`; `refSnap = await txn.get(refRef)`.
  - if `refSnap.exists && refSnap.data().orderId !== orderId` → `already-exists` ("this transaction reference has already been used").
- `txn.set(refRef, { orderId, buyerId: buyerUid, createdAt: Timestamp.fromMillis(now()) }, { merge: true })`.
- `txn.set(orderRef, { paymentProofUrl: proofUrl, cliqSenderPhone, txnRef, txnRefNormalized: normRef, paymentAttempts: attempts + 1, deliveryAddress, deliveryPhone, paymentSubmittedAt: Timestamp.fromMillis(now()), updatedAt: Timestamp.fromMillis(now()), ...<the exact status/paymentStatus fields today's submit path produces> }, { merge: true })`.
  - IMPORTANT: determine the status fields by reading the current client submit + `'pay'` transition; replicate them here so behavior is unchanged.
- return `{ orderId, attempts: attempts + 1 }`.

- [ ] **Step 1:** Write failing tests with a fake `db`/txn (mirror how `orderPaymentVerify.test.js` fakes Firestore): (a) fresh submit reserves ref + writes order + attempts=1; (b) same ref, DIFFERENT existing order → throws `already-exists`; (c) same ref, SAME order (resubmit) → allowed, attempts increments; (d) `attempts>=3` → `resource-exhausted`; (e) invalid ref (len<4) → `invalid-argument`; (f) wrong buyer → `permission-denied`; (g) missing proofUrl → `invalid-argument`.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Implement mirroring `orderPaymentVerify.js`.
- [ ] **Step 4:** Tests green; lint clean.
- [ ] **Step 5:** Commit `feat(payments): submitOrderPayment reserves unique reference (server)`.

### Task 3: Wire the `submitOrderPayment` callable into functions/index.js
**Files:** Modify `functions/index.js` (near the existing `verifyOrderPayment` wrapper ~:1878).

- [ ] **Step 1:** Add an `exports.submitOrderPayment = functions.https.onCall(async (data, context))` wrapper: require auth (`context.auth`); pull `orderId, proofUrl, cliqSenderPhone, txnRef, deliveryAddress, deliveryPhone` from `data`; call `submitOrderPayment({ db, Timestamp: admin.firestore.Timestamp, now: Date.now }, { ...data, buyerUid: context.auth.uid })`; map thrown `makeError` codes to `functions.https.HttpsError`. Follow the exact wrapper/error-mapping pattern the `verifyOrderPayment` wrapper uses. Do NOT gate on admin (this is the buyer's own action; ownership is enforced inside the txn).
- [ ] **Step 2:** If the repo has a functions smoke/index test, run it; otherwise `node --check functions/index.js`. Lint clean.
- [ ] **Step 3:** Commit `feat(payments): submitOrderPayment callable wrapper`.

### Task 4: Client — route submit through callable + reference field
**Files:** Modify `src/components/OrderDetailsView.tsx`. Consumes `isValidPaymentRef` from `src/utils/paymentReference.ts`.

- [ ] **Step 1:** Add `txnRef` state + a required text input in the CliQ pay form (near the `cliqSenderPhone` input ~:1478): bilingual label ("رقم العملية / المرجع" / "Transaction / reference number") + helper text ("from your CliQ payment confirmation" / "من إشعار تحويل كليك"). Client-side pre-validate with `isValidPaymentRef` and block submit with an inline message if invalid.
- [ ] **Step 2:** In `handleSubmitCliqPayment` (~:416): keep the Storage image upload (still client-side). REPLACE the direct `updateDoc(doc(db,'orders',...))` + `executeOrderTransition(order,'pay',...)` with a single `httpsCallable(functions,'submitOrderPayment')({ orderId: order.id, proofUrl, cliqSenderPhone: cliqSenderPhone.trim(), txnRef, deliveryAddress: sanitizeDeliveryAddress(addressInput), deliveryPhone: addressCheck.normalizedPhone })`. Keep the analytics event on success.
- [ ] **Step 3:** Error handling: map `functions/already-exists` → an inline error "This transaction reference has already been used. Enter the reference from your actual CliQ transfer." / Arabic equivalent; `functions/resource-exhausted` → "You've reached the maximum payment attempts for this order — please contact support." / Arabic; `functions/invalid-argument` → generic "check your details". Mirror the existing `functions/already-exists` handling style used elsewhere (e.g. `AppContext.tsx:286`).
- [ ] **Step 4:** `npx vitest run` (full) green; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(payments): buyer submits payment via callable with transaction reference`.

### Task 5: Admin verify card — reference, bank-verified checkbox, soft dup warning
**Files:** Modify `src/components/admin/PaymentVerifyCard.tsx` + `src/components/admin/VerifyApproveSection.tsx`.

- [ ] **Step 1 (PaymentVerifyCard):** Render the order's `txnRef` (labeled "Reference / رقم العملية") near the `cliqSenderPhone` line (~:107). Add a required checkbox "I verified this payment in the bank account" / "تأكدت من وصول الدفعة إلى الحساب البنكي"; add its checked state; change `canApprove` (~:54) to also require the checkbox checked. Add an optional `refReuseWarning?: boolean` / `phoneAmountDupWarning?: boolean` prop rendered as a warning chip like the existing `amountMismatch`/`isDuplicateReceipt` chips (~:64-77).
- [ ] **Step 2 (VerifyApproveSection):** Compute a soft `phoneAmountDup` per order — same `cliqSenderPhone` AND same `totalDue` appearing on another pending/verified order (mirror the existing dup-fingerprint computation ~:120-129). Pass it + the `txnRef` into the card. (Reference reuse is already hard-blocked at submit, so this is a secondary human signal — soft only, does NOT block Approve.)
- [ ] **Step 3:** `npx vitest run` (full) green; `npm run lint` clean.
- [ ] **Step 4:** Commit `feat(admin): payment verify shows reference + bank-verified gate + soft dup warning`.

### Task 6: Types + Firestore rules
**Files:** Modify `src/types.ts`; `firestore.rules`.

- [ ] **Step 1 (types):** Add to `Order`: `txnRef?: string`, `txnRefNormalized?: string`, `paymentAttempts?: number`, `paymentSubmittedAt?: any`. Lint clean.
- [ ] **Step 2 (rules — paymentReferences):** Add a rule block: `match /paymentReferences/{ref} { allow read, write: if false; }` (Admin SDK bypasses; no client access). 
- [ ] **Step 3 (rules — orders):** In the buyer-facing `orders` update rule, REMOVE the payment-proof fields from what a buyer may write (so `paymentProofUrl`, `txnRef`, `txnRefNormalized`, `cliqSenderPhone`, `paymentAttempts`, `paymentStatus`, `status` on the pay path can no longer be client-written). FIRST read the current orders update rule and enumerate exactly which fields it currently allows a buyer to change; keep delivery-address self-service working ONLY if some other client flow still needs it — otherwise route it through the callable too. Document in the commit message which fields you locked. Be conservative: do not break seller/admin order writes or non-payment buyer writes.
- [ ] **Step 4:** If the repo has firestore-rules tests, run them. Otherwise reason through: buyer can no longer write proof fields directly; callable (Admin SDK) still can; verify/reject unaffected. `npx vitest run` (full) green; lint clean.
- [ ] **Step 5:** Commit `feat(payments): types + rules — lock payment-proof writes to the callable; paymentReferences admin-only`.

---

## Self-Review
- Coverage: reference capture (T4), normalize (T1), server uniqueness+cap (T2/T3), admin gate+signal (T5), schema+rules lockdown (T6). Maps to the approved design 1–6.
- Ownership rule (same-order resubmit allowed) is tested in T2(c). Cap in T2(d).
- Un-bypassable: T6 rules ensure the callable is the only writer of proof fields; T2 does the atomic reservation.
- Risk: T6 rules change is the highest-risk step (could block a legit write) — it explicitly requires reading the current rule + being conservative + preserving verify/reject and seller/admin writes. T4 removes the client transition; T2 must replicate the exact status semantics so nothing regresses.
- Legacy orders: verify still keys off `hasReceipt`; reference required only in the new submit path.
