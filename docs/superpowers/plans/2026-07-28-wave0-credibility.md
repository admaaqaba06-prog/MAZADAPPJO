# Wave 0 — Credibility & Correctness Pass (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Mazzado product *feel* trustworthy by fixing the small correctness + credibility defects the spec audit surfaced — one shared order-status glossary, "unpaid ≠ sale", a notifications render guard, and the seller-center cosmetic bugs — plus a dry-run-first cleanup of test-data noise.

**Architecture:** Additive shared util (`orderStatusGlossary`) becomes the single source of truth for status label+color; per-screen hard-coded tables are refactored to consume it. Other tasks are localized logic/UI fixes. No schema changes, no new deps. Data cleanup is a standalone script that dry-runs by default.

**Tech Stack:** React 19 + Vite + TS, Tailwind, Firebase (Firestore + Functions), Vitest.

## Global Constraints
- Branch: `feat/wave0-credibility` off `origin/main`. Never push to main; PR → merge.
- Bilingual: every user-facing status/label must resolve for both `ar` and `en`; never leak a raw status code to a user.
- No behavior change to money math, escrow, or FSM transitions — this wave is labels/counters/UI/cleanup only.
- All existing tests (892) must stay green; each task adds tests for its change.
- Merge-without-preview authorized by MJ for group D (customer-facing UI) — bug-fix character only; no layout redesigns beyond removing the horizontal scroll / de-duplicating.
- Data deletion (Task 6) runs DRY-RUN by default; real deletion only behind an explicit `--commit` flag after MJ reviews the dry-run output.

---

## File Structure
- **New:** `src/utils/orderStatusGlossary.ts` + `.test.ts` — single status→{labelAr,labelEn,tone} map + `getOrderStatusChip(status, lang)`.
- **New:** `scripts/admin/audit-test-data.cjs` — dry-run finder/reporter for test-data noise (Task 6).
- **Modify:** `src/views/MyOrdersView.tsx`, `src/components/MyOrdersList.tsx`, `src/components/SoldOrdersList.tsx`, `src/views/OrderDetailsView.tsx`, `src/components/admin/OrdersLedgerSection.tsx`, `src/views/SellerCenterView.tsx`, `src/components/NotificationCenter.tsx`, `src/context/AppContext.tsx`, `src/utils/orderWorkflow.ts`.

Line numbers below are from the 2026-07-27 audit (`docs/admin-seller-audit-2026-07.md`) against `origin/main`; implementers MUST re-locate against current code before editing.

---

### Task 1: Order-status glossary util (backbone)
**Files:** Create `src/utils/orderStatusGlossary.ts` + `src/utils/orderStatusGlossary.test.ts`.

**Interfaces — Produces:**
- `type OrderStatusCode` — union covering EVERY real order status. Reconcile the two existing enums: `types.ts:304` (11 values) and `orderWorkflow.ts:6` (9 values). Include the superset actually written to Firestore; audit both enums + grep `status:` writes in `functions/` and `orderWorkflow.ts` to enumerate real codes.
- `getOrderStatusChip(status: string, lang: 'ar'|'en'): { label: string; tone: 'neutral'|'info'|'warning'|'success'|'danger' }` — never returns a raw code; unknown/missing status → a safe neutral fallback label ("قيد المعالجة" / "Processing"), NOT the raw string.
- Optional `getOrderStatusLabel(status, lang)` convenience.

- [ ] **Step 1:** Enumerate real status codes (grep `functions/index.js`, `orderPaymentVerify.js`, `orderWorkflow.ts`, `types.ts` for status literals) and list them in the test file as the source of truth.
- [ ] **Step 2:** Write failing tests: every real code returns a non-empty AR and EN label + a valid tone; an unknown code returns the neutral fallback (asserted NOT equal to the input string); a couple of tone mappings (paid→success, waiting_payment→warning, defaulted/refunded→danger, completed→success).
- [ ] **Step 3:** Run tests, verify fail.
- [ ] **Step 4:** Implement the map + helper.
- [ ] **Step 5:** Run tests, verify pass. Commit `feat(orders): single order-status glossary util`.

### Task 2: Wire consumers onto the glossary (kill hard-coded tables + raw leaks)
**Files:** Modify `MyOrdersView.tsx:28` (STATUS_CHIP) + `:258` (raw `{ar:order.status}` leak), `MyOrdersList.tsx:91`, `SoldOrdersList.tsx:108`, `OrderDetailsView.tsx:302`, `admin/OrdersLedgerSection.tsx:200`, `SellerCenterView.tsx:1421` (raw `{auction.status}` sold badge), `orderWorkflow.ts:444/451/458` (raw code in notification bodies).

**Interfaces — Consumes:** `getOrderStatusChip` from Task 1.

- [ ] **Step 1:** Replace each per-screen hard-coded label/color table with `getOrderStatusChip(status, lang)`; preserve existing Tailwind tone classes by mapping `tone`→existing class set (one small local `toneClass` map per file is fine, or a shared one — implementer's judgment, but no raw codes may render).
- [ ] **Step 2:** For `orderWorkflow.ts:444/451/458`, replace the raw-code interpolation in the notification title/body with the glossary label (Arabic side at minimum; keep existing bilingual fields if present).
- [ ] **Step 3:** Grep the repo for any remaining `order.status` / `auction.status` rendered directly in JSX; fix stragglers.
- [ ] **Step 4:** `npx vitest run` green; `npm run lint` (tsc) clean. Commit `refactor(orders): consumers read status glossary; remove raw-code leaks`.

### Task 3: currentMonthSales counts PAID+ only
**Files:** Modify `SellerCenterView.tsx:537`.

- [ ] **Step 1:** Locate `currentMonthSales`; it sums orders by month regardless of status. Add a test (new `SellerCenterView` sales-calc test, or extract the sum into a pure helper `sumPaidSalesThisMonth(orders, now)` in a util + test it — prefer extraction for testability).
- [ ] **Step 2:** Failing test: an order in-month but `waiting_payment`/`defaulted` is EXCLUDED; a `paid`/`completed`/`shipped`/`delivered` in-month is INCLUDED.
- [ ] **Step 3:** Implement: only count orders whose status is paid-or-beyond (paid, completed, shipped, delivered, out_for_delivery — use a `PAID_OR_BEYOND` set derived from the glossary/enum, NOT a magic list scattered inline).
- [ ] **Step 4:** Tests + lint green. Commit `fix(seller): this-month sales counts only paid+ orders`.

### Task 4: Notifications render guard + recipient language
**Files:** Modify `NotificationCenter.tsx` (~:342/:357), `AppContext.tsx` (~:2911 load).

- [ ] **Step 1:** In the notification load/select (`AppContext.tsx:2911`), filter out docs whose resolved content (title+body for the recipient's language) is empty — don't surface blank rows.
- [ ] **Step 2:** Language: when rendering, pick the recipient's language fields (`titleEn/bodyEn` vs `titleAr/bodyAr`) instead of `||data.title` unconditional Arabic fallback; if the recipient-language field is missing, fall back to the other language (still non-empty), and only then to nothing (filtered by Step 1).
- [ ] **Step 3:** Add a render guard in `NotificationCenter.tsx` so a row with empty resolved content is not rendered even if it slips through.
- [ ] **Step 4:** Add a small unit test for the content-resolution helper (extract if needed): en recipient with only Arabic fields → gets Arabic (non-empty); doc with no content → resolves empty (filtered). Tests + lint green. Commit `fix(notifications): drop empty rows; resolve recipient language`.

### Task 5: Seller-center credibility bugs
**Files:** Modify `SellerCenterView.tsx` — several localized spots.

- [ ] **Step 1 — "1 reviews" plural (`:1799`):** pluralize correctly (`1 review` / `N reviews`; Arabic uses correct form). Test the pluralize helper if extracted.
- [ ] **Step 2 — default rating (`:548`):** stop showing a hardcoded `4.8` for sellers with 0 reviews; render an honest empty state ("No reviews yet" / "لا تقييمات بعد") and don't feed a fake number into any average.
- [ ] **Step 3 — empty charts (`:1880` + peers):** when a chart has no data, render an empty-state message instead of an empty/blank chart that reads as broken.
- [ ] **Step 4 — tripled verification prompt (`:1044`, `:1061`, `sellerActions.ts:78` strip):** show the verification CTA in ONE place; remove the duplicates. Keep the most contextually correct one (implementer's judgment; note which was kept in the report).
- [ ] **Step 5 — duplicated wallet card (`:1074`, `:1221`, `:1674`):** show wallet balance once (keep the Money section instance `:1674`; remove the header/stat duplicates OR make them a single non-redundant summary — no two cards showing the same balance).
- [ ] **Step 6 — 4-column orders table + h-scroll (`:1573`–`:1583`):** collapse STATUS/PAYMENT/SHIPPING/ESCROW into a single status chip (via `getOrderStatusChip`) so the table fits with no horizontal scrollbar (`overflow-x-auto` at `:1573` removed or made unnecessary). This is a bug-fix collapse, not a redesign.
- [ ] **Step 7:** `npx vitest run` + `npm run lint` green. Commit `fix(seller): credibility pass (plural, empty rating, empty charts, de-dupe verify+wallet, single status chip)`.

### Task 6: Test-data audit script (dry-run first)
**Files:** Create `scripts/admin/audit-test-data.cjs`.

- [ ] **Step 1:** Using the existing Admin-SDK pattern (see `scripts/admin/*.cjs`, service-account key path from memory `reference_mazadjo_prod_admin`), write a script that FINDS and PRINTS (does not delete) candidate test-data: reviews that violate the `reviews` rules gate (seeded/fake), notifications with empty resolved content, users that look like test/gibberish sellers, and the known typo/mismatched-image dispute records. Group + count them; print doc IDs.
- [ ] **Step 2:** Guard deletion behind `--commit`; default run is read-only and prints "DRY RUN — pass --commit to delete". Deletion uses batched writes and logs each deleted ID.
- [ ] **Step 3:** Do NOT run `--commit`. Commit the script only: `chore(admin): test-data audit script (dry-run default)`. MJ runs the dry-run and reviews before any deletion.

---

## Self-Review
- Coverage: A(Task 6 dry-run), B(Tasks 3,4), C(Tasks 1,2), D(Task 5) — all four audit groups mapped.
- Type consistency: `getOrderStatusChip`/`OrderStatusCode`/`tone` names are stable across Tasks 1→2→3→5.
- Risk: Task 2 + Task 5.6 touch customer-facing render but are label/column changes only; money/FSM untouched (Global Constraints). Task 6 cannot delete without an explicit flag + human review.
