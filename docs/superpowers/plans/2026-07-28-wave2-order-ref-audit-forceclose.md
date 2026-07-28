# Wave 2 — Order Reference · Audit-Log Viewer · Force-Close Guard (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Three audit items: (1) a human-readable `MZ-XXXXX` order reference (random, collision-safe, backfilled) shown everywhere an order id currently leaks; (2) surface the already-subscribed `adminActions` audit log in an admin viewer; (3) replace the native `confirm()` guards on Force-Close / Force-Open-Dispute with a typed-reference confirmation modal that echoes the money impact and captures a reason.

**Architecture:** Order reference is generated + reserved server-side in a dedicated `orderRefs/{code}` lookup doc (reusing the Wave 1 reservation idiom), assigned AFTER order creation so it can never block the settlement money transaction; a backfill script covers existing orders. The audit viewer is a new lazy admin tab consuming existing context state via a schema normalizer (rows have two historical shapes). The force-guard is a reusable typed-confirm modal wired into the two OrderDetailsView force handlers.

**Tech Stack:** React 19 + Vite + TS (`src/`), Firebase Cloud Functions CommonJS (`functions/`), Firestore + rules, Vitest.

## Global Constraints
- Branch `feat/wave2-order-ref` off `origin/main` (incl. Waves 0+1). Never push to main; PR → merge.
- **Do NOT alter** the settlement money math, escrow logic, or the Wave 1 payment path. Order-ref assignment must be DECOUPLED from `settleAuctionTxn`'s money transaction — a ref failure must never fail settlement.
- Order ref format: `MZ-` + 5 chars from the unambiguous alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no `0 O 1 I L`). Uppercase. Collision-checked via `orderRefs/{code}` reservation.
- Every new user-facing string bilingual (ar/en), Arabic primary. Reuse each component's existing language pattern.
- Legacy orders with no ref must still render (fallback to the current `id.substring(...)` display) until backfilled.
- The audit viewer is READ-ONLY. No new write paths, no rules loosening.
- The force-guard changes the CONFIRMATION UX only; it must still call the exact same `executeOrderTransition(order, 'force_close'|'open_dispute', ...)` with the same payload it does today (do not change the money/transition effect).
- All existing tests stay green; new pure logic (ref gen/validate, schema normalizer) is TDD'd.

## File Structure
- **New:** `src/utils/orderRef.ts` (+ `.test.ts`) and `functions/orderRef.js` (+ `.test.js`) — format/generate/validate twins.
- **New:** `functions/assignOrderRef.js` (+ `.test.js`) — reserve `orderRefs/{code}` + stamp `order.orderRef` (retry on collision).
- **New:** `scripts/admin/backfill-order-refs.cjs` — dry-run-first backfill.
- **New:** `src/components/admin/AuditLogSection.tsx` — the viewer.
- **New:** `src/components/admin/ConfirmActionModal.tsx` — reusable typed-confirm modal.
- **Modify:** `functions/index.js` (call assignOrderRef after order creation in settleAuctionTxn + repairEndedAuctionOrder), `firestore.rules` (orderRefs admin-only), `src/types.ts` (`Order.orderRef?`, and reconcile `AdminAction` type), the 5 order-display components, `src/components/AdminDashboardView.tsx` + `src/utils/adminNav.ts` (register audit tab), `src/components/OrderDetailsView.tsx` (wire the modal).

Line numbers cited are from the 2026-07-28 map; implementers MUST re-locate.

---

### Task 1: Order-ref format/generate/validate twins
**Files:** `src/utils/orderRef.ts` + `.test.ts`; `functions/orderRef.js` + `.test.js`.

**Produces (both):**
- `ORDER_REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'`
- `generateOrderRef(randomFn?): string` → `'MZ-' + 5 chars` drawn from the alphabet. Accept an injectable RNG (`() => number` in [0,1) or an int picker) so it's deterministically testable; default to `crypto` (server: `crypto.randomInt`; client: `crypto.getRandomValues`).
- `isValidOrderRef(s): boolean` → matches `^MZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$`.
- `normalizeOrderRefInput(s): string` → trim, uppercase, ensure single `MZ-` prefix (so a user typing `mz 7k3qp` or `7K3QP` resolves to `MZ-7K3QP`); used by the force-confirm modal's typed check.

- [ ] **Step 1:** Failing tests (both): generated ref matches `isValidOrderRef`; with a stubbed RNG the output chars are deterministic; alphabet excludes `0O1IL`; `isValidOrderRef('MZ-7K3QP')` true, `isValidOrderRef('MZ-7K3Q0')` false (0 not allowed), lowercase false; `normalizeOrderRefInput(' mz-7k3qp ')`→`'MZ-7K3QP'`, `normalizeOrderRefInput('7k3qp')`→`'MZ-7K3QP'`.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Implement both (identical logic; RNG source differs by platform but the char-mapping identical).
- [ ] **Step 4:** `npx vitest run src/utils/orderRef.test.ts functions/orderRef.test.js` green; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(orders): order-ref format/generate/validate (client+server)`.

### Task 2: `assignOrderRef` reservation + wire into creation + rules + type
**Files:** `functions/assignOrderRef.js` + `.test.js`; modify `functions/index.js`, `firestore.rules`, `src/types.ts`.
**Consumes:** `functions/orderRef.js`.

**Produces:** `async function assignOrderRef(deps, orderId)` where `deps = { db, Timestamp, now, generate? }`. Loops up to N (e.g. 6) times: `code = generate()`; `refDoc = db.collection('orderRefs').doc(code)`; in a transaction, if `refDoc` exists → retry; else `txn.set(refDoc, { orderId, createdAt })` AND `txn.set(orders/{orderId}, { orderRef: code, updatedAt }, {merge:true})`. Return `code`. If all tries collide (astronomically unlikely) → throw; callers must treat failure as non-fatal (log, continue). Idempotent: if the order already has `orderRef`, return it without allocating.

- [ ] **Step 1:** Failing tests with fake db: fresh order gets a valid ref reserved + stamped; a collision on the first code retries and succeeds on the second; an order that already has `orderRef` returns it without writing a new reservation. Inject `generate` to force a collision.
- [ ] **Step 2:** Run, confirm fail. Implement. Confirm pass.
- [ ] **Step 3 (wire — settle):** In `functions/index.js` `settleAuctionTxn`, AFTER the settlement transaction commits and the order doc exists (NOT inside the money transaction), call `await assignOrderRef({db, Timestamp: admin.firestore.Timestamp, now: Date.now}, auctionId)` wrapped in try/catch that logs and swallows errors (ref must never fail settlement). Do the same in `repairEndedAuctionOrder` after `orderRef.set(orderPayload)`.
- [ ] **Step 4 (rules):** Add `match /orderRefs/{code} { allow read, write: if false; }` (Admin SDK only) — mirror the Wave 1 `paymentReferences` block.
- [ ] **Step 5 (type):** Add `orderRef?: string;` to `Order` in `src/types.ts`.
- [ ] **Step 6:** `node --check functions/index.js`; `npx vitest run` (full) green; `npm run lint` clean; validate rules if the CLI is authed (`firebase deploy --only firestore:rules --dry-run --project mazadjoapp`) — if not authed, skip and note it.
- [ ] **Step 7:** Commit `feat(orders): assign unique MZ order reference on creation + orderRefs rules`.

### Task 3: Display the order reference everywhere
**Files:** `src/components/OrderDetailsView.tsx` (~:917), `src/components/admin/OrdersLedgerSection.tsx` (~:168), `src/components/SoldOrdersList.tsx` (~:69), `src/components/MyOrdersList.tsx` (~:81), `src/components/SellerCenterView.tsx` (~:1605).

- [ ] **Step 1:** In each spot, render `order.orderRef` when present, else the existing `order.id.substring(...)` fallback (keep the current truncation as the legacy display). Prefer a tiny shared helper `displayOrderRef(order): string` in `src/utils/orderRef.ts` (`order.orderRef || '#' + order.id.substring(0,8).toUpperCase()`) so the fallback is consistent; use it in all five. Where a copy-to-clipboard affordance already exists (OrderDetailsView), copy the `orderRef` when present.
- [ ] **Step 2:** `npx vitest run` (full) green; `npm run lint` clean.
- [ ] **Step 3:** Commit `feat(orders): show MZ order reference across order screens (legacy id fallback)`.

### Task 4: Backfill script (dry-run first)
**Files:** `scripts/admin/backfill-order-refs.cjs`.

- [ ] **Step 1:** Admin-SDK script mirroring `scripts/admin/audit-test-data.cjs` init (GOOGLE_APPLICATION_CREDENTIALS; firebase-admin v14 `getFirestore()` compat shim — see that script). Scans `orders` for docs missing a valid `orderRef`; for each, calls the SAME reservation logic as `assignOrderRef` (require `functions/orderRef.js` + replicate the reserve loop against `orderRefs`). DRY-RUN by default: prints how many orders would get a ref (and a sample of proposed codes) but writes nothing. `--commit` performs the reservations + stamps. Batch/sequential is fine (small volume). Idempotent (skips orders that already have a valid ref).
- [ ] **Step 2:** `node --check`. Do NOT run it. Commit `chore(admin): backfill-order-refs script (dry-run default)`.

### Task 5: Audit-log viewer (admin tab)
**Files:** `src/components/admin/AuditLogSection.tsx` (new); modify `src/utils/adminNav.ts`, `src/components/AdminDashboardView.tsx`, `src/types.ts` (reconcile `AdminAction`).

- [ ] **Step 1 (normalizer + type):** In `src/types.ts`, widen/adjust `AdminAction` to cover BOTH historical shapes (fields observed: `id`, `action`|`actionType`, `orderId`|`auctionId`|`targetId`, `targetName?`, `adminId?`, `adminName`, `timestamp` (number ms OR Firestore Timestamp), `details?`). Add a small pure normalizer `normalizeAdminAction(raw): { id; action; targetId?; targetLabel?; adminName; at: number; details? }` (put it in a util, e.g. `src/utils/adminAudit.ts` + `.test.ts`) that maps `action||actionType`, `orderId||auctionId||targetId`, coerces `timestamp` (number vs `.toMillis?.()` vs `.seconds`) to ms. TDD the normalizer for both schemas.
- [ ] **Step 2 (section):** `AuditLogSection.tsx` — an admin-only, read-only list consuming `adminActions` from context (props `{ isAr: boolean; actions: AdminAction[] }`), sorted newest-first, each row: normalized action label (bilingual map for known actions: release_escrow/refund_order_escrow/approve_withdrawal/etc., fallback to the raw action), target (order ref if resolvable else id), admin name, relative/absolute time (reuse `ammanTime` util if it has a formatter), and details text. Empty-state message when none. Match the visual style of an existing section (e.g. DisputesSection).
- [ ] **Step 3 (register):** Add `'audit'` to `AdminTabId` + `ADMIN_REFERENCE_TABS` in `adminNav.ts`; a `TAB_META.audit` bilingual label ("السجل" / "AUDIT LOG") in `AdminDashboardView.tsx`; a lazy import + an `activeTab === 'audit'` Suspense block passing `actions={adminActions}` (already on context) + `isAr`.
- [ ] **Step 4:** `npx vitest run` (full) green; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(admin): audit-log viewer tab (normalizes both row schemas)`.

### Task 6: Typed-confirmation modal for Force actions
**Files:** `src/components/admin/ConfirmActionModal.tsx` (new); modify `src/components/OrderDetailsView.tsx`.

- [ ] **Step 1 (modal):** `ConfirmActionModal` — props `{ open, isAr, title, impactLines: string[], confirmToken: string, requireReason?: boolean, tokenLabel, onConfirm: (reason?: string) => void, onCancel }`. Renders the title, the `impactLines` (e.g. "This releases 250 JOD to the seller"), a text input that must exactly match `confirmToken` after `normalizeOrderRefInput` (the order's MZ ref — or the raw id if no ref), an optional required reason textarea, and a Confirm button DISABLED until the typed token matches (and reason non-empty if required). Smooth ease-out transition (no bouncy spring — house motion pref). Bilingual.
- [ ] **Step 2 (wire Force Close):** Replace the `confirm()` in `handleForceClose` (~:827) with opening `ConfirmActionModal` (title "Force close order", impact "releases escrow of {amount} JOD to the seller", confirmToken = `displayOrderRef(order)`/the order's ref, requireReason: true). On confirm, call the EXACT same `executeOrderTransition(order, 'force_close', currentUser)` as today (pass the reason into the activity/notes if the transition accepts it; otherwise keep behavior identical and just log the reason locally — do NOT change the transition's money effect).
- [ ] **Step 3 (wire Force Open Dispute):** Replace the `prompt()`+`confirm()` in `handleOpenDispute` (~:754) admin/force path with the modal (requireReason: true → the reason replaces the current `prompt` reason; confirmToken = the order ref; impact "locks escrow"). Preserve the buyer/seller "File Formal Dispute" paths' current behavior — this task hardens the ADMIN force path; if the same handler serves all three, gate the typed-token requirement to the admin/force invocation only (keep the buyer/seller reason prompt working, or route them through the modal with requireReason but NO token — your judgment; do not make ordinary users type an ID).
- [ ] **Step 4:** `npx vitest run` (full) green; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(admin): typed-reference confirmation for force-close / force-open-dispute`.

---

## Self-Review
- Coverage: order ref gen/reserve/display/backfill (T1–T4), audit viewer (T5), force guard (T6) — maps to the three approved features.
- Decoupling: T2 assigns the ref OUTSIDE the settlement money transaction, try/catch-swallowed — settlement can never fail on a ref hiccup; backfill (T4) guarantees eventual coverage. Constraint satisfied.
- Reuse: T2/T4 reuse the Wave 1 reservation idiom (`orderRefs` mirrors `paymentReferences`); T6 typed token uses the T1 `normalizeOrderRefInput`; T5 consumes already-subscribed context state (no new subscription).
- Risk: T2 touches `functions/index.js` near settlement — the try/catch swallow + "after commit" placement is mandatory. T6 must not change the transition's money effect (UX-only). T5 is read-only.
- Type consistency: `orderRef`, `displayOrderRef`, `normalizeOrderRefInput`, `normalizeAdminAction`, `assignOrderRef` names are stable across tasks.
