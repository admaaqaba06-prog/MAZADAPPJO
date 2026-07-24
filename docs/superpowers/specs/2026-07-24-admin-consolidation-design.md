# Admin Consolidation & Simplification

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Scope:** `src/components/AdminDashboardView.tsx` (3166-line monolith) + `src/components/admin/*` section components. Pure UI reorganization + one new aggregator screen. **No money logic, Firestore rules, or callables change.**

## Context & Objective

The admin grew in two layers: the original **10 entity-organized tabs** (raw DB views — metrics, orders, CliQ payments, withdrawals, listings, users, subscriptions, sessions, health, simulator) and, bolted on beside them, **3 newer job-oriented tabs** (Verify & Approve, Fulfillment, Disputes) plus a Launch button. The result is **13 tabs with real duplication**, a passive stats page as the landing screen, and dev/test tabs sitting in the live operational admin. MJ: "so much duplication and irrelevant tabs… be strategic and comprehensive."

Confirmed operating model: **1–2 generalists do every job** — so we build ONE shared admin with a needs-attention home and NO role-gating (roles deferred).

The confirmed duplication (from a full code map):
- **`subscriptions` (Premium Subs) ≡ `verify`** — same `subscriptionRequests` records, same `approveSubscription`/`rejectSubscription` handlers. `subscriptions` only adds a `pendingByUsersOnly` "no-receipt" failsafe (`approveUserDirect`/`rejectUserDirect`).
- **`orders` ⊃ `fulfillment` + `disputes`** — the job tabs slice the same `orders` collection by state with sharp actions; `orders` is the full ledger + escrow detail pane.
- **`payments` (CliQ wallet top-ups)** — a third "review a CliQ receipt → approve/reject" surface (`escrows` where `status==='locked' && auctionId==='cliq-dep'`), separate from Verify only by collection.

Dead / low-value: **`metrics`** (passive, default landing, overlaps health), **`sessions`** (read-only device/IP dump, zero actions), **🧪 `simulator`** (dev/test console in the live admin), plus health's fake "backup" (writes only a `localStorage` timestamp), "reset onboarding," and destructive "reset all auctions."

## Target Structure (approved)

**Default landing changes from `metrics` → `home`.**

**Primary — the jobs (nav group 1):**
1. **🏠 Home / Needs Attention** *(new)* — a roll-up: per-job attention counts (payments to verify, fulfillments overdue, disputes open, payouts pending, listings awaiting approval) each linking into its tab, plus the few live metric cards worth glancing at (escrow held, live auctions, registered members). Replaces the passive `metrics` tab.
2. **Verify** — the ONE receipt-review surface: memberships + order payments (already here) **+ CliQ wallet top-ups** (absorb `payments`) **+ the subs "no-receipt" failsafe** (absorb `subscriptions`). All existing handlers reused unchanged.
3. **Fulfillment** — unchanged (nudge seller/buyer, release escrow).
4. **Disputes** — unchanged (resolve with note).
5. **Payouts** — seller withdrawals (approve/reject with reason), promoted from the old `withdrawals` tab to a first-class primary surface (money-out deserves a deliberate home). Handlers unchanged.
6. **Launch** — `listings` management (approve/reject pending, completed-auction repair/dispatch tools, master directory/delete — absorb the `listings` tab) **+ a prominent "Create auction drop" CTA** that opens the existing `auction-drop-builder` view (the big WhatsApp creation flow stays its own full view).

**Reference — occasional, demoted (nav group 2, visually separated):**
7. **Orders** — the full order ledger + `OrderDetailsView` escrow detail pane (what the job tabs link into). Kept as searchable reference, not a front-line job.
8. **Members** — the `users` tools (verify seller, ban/unban, lookup).
9. **System** — Operations (maintenance mode, feature flags, live system-health log) + **Monitoring** (Active Sessions panel — absorb `sessions`) + **Developer** (🧪 Simulator — absorb `simulator` — and the destructive reset utilities, quarantined in a clearly-labeled zone). The fake "backup" button is removed (or relabeled honestly); "reset onboarding" + "reset all" live only inside the quarantined Developer zone.

**Net: 13 tabs → 6 primary (incl. Home) + 3 reference.** Nothing is deleted outright except the standalone `metrics` tab (folded into Home); `sessions` and `simulator` are relocated into System, not removed (MJ's explicit call — keep dev/monitoring tools, just house them well).

## Hard Constraints (money-path & safety)

- **Reuse every existing handler/callable verbatim** — `approveSubscription`, `rejectSubscription`, `approveUserDirect`, `rejectUserDirect`, `verifyOrderPayment`, `releaseEscrow`, `refundEscrow`, `approveWithdrawal`, `rejectWithdrawal`, dispute resolve, fulfillment nudge/release, `approveListing`, `rejectListing`, `repairEndedAuctionOrder`, `deleteAuction`, `verifySeller`, `banUser`/`unbanUser`, maintenance/feature-flag updaters, etc. This is a UI reorganization: NO change to any money logic, transition, callable, or Firestore rule. Sections receive handlers/data as props (from `useApp()`) and call them identically.
- **No new Firestore listeners or data shapes** — the existing subscriptions/withdrawals listeners and derived lists (`realOrders`, `pendingOrderPaymentsCount`, `overdueFulfillmentCount`, `openDisputesCount`, pending withdrawals, pending listings, `subscriptionRequests`) are reused as the count sources.
- **Simulated data stays excluded** from all operational surfaces and counts (`realOrders`/`realAuctions` convention preserved).
- Bilingual (ar/RTL + en) for every new/moved string; preserve the existing label pattern. Preserve `sessionStorage` tab-persistence (`mazad_admin_tab`) — but migrate any stored legacy tab id (`metrics`/`payments`/`subscriptions`/`sessions`/`simulator`) to its new home so a returning admin doesn't land on a dead id.
- Admin gating unchanged (`isAdminUser`); every tab stays visible to every admin (no role-gating). Simulator keeps its existing inline `isAdminUser` gate.

## Architecture & Components

The monolith holds 10 tab bodies inline; the 3 job tabs already follow an extracted `admin/*Section.tsx` pattern. This reorg **extracts each relocated/absorbed body into its own `admin/*Section.tsx` component** (props-in, handlers-from-parent) — both to make the move clean and to break up the 3166-line file. Extraction must be behavior-preserving (no logic edits during a move).

- **`admin/AdminHome.tsx`** *(new)* — the needs-attention landing. Consumes a pure `computeAttentionCounts(...)` helper (new, unit-tested) that takes the already-derived inputs (subscriptionRequests, pendingOrderPayments, overdue fulfillments, open disputes, pending withdrawals, pending listings, escrow total, live-auction count, members count) and returns the display model. Each attention row calls the parent's `selectTab(id)`.
- **`admin/VerifyApproveSection.tsx`** *(extend)* — add the CliQ wallet-top-up queue (the old `payments` body: `pendingCliQDrops` + `releaseEscrow`/`refundEscrow`) and the `pendingByUsersOnly` failsafe (`approveUserDirect`/`rejectUserDirect`) as additional sub-sections. Three receipt types under one surface.
- **`admin/LaunchSection.tsx`** *(new, extracted from `listings`)* — the three listings sub-lists + a "Create auction drop" button that calls `setActiveView('auction-drop-builder')`.
- **`admin/PayoutsSection.tsx`** *(new, extracted from `withdrawals`)* — pending + history, `approveWithdrawal`/`rejectWithdrawal`.
- **`admin/OrdersLedgerSection.tsx`** *(new, extracted from `orders`)* — the full ledger + detail-pane trigger.
- **`admin/MembersSection.tsx`** *(new, extracted from `users`)*.
- **`admin/SystemSection.tsx`** *(new)* — Operations + Monitoring (sessions) + Developer (simulator + quarantined resets), extracted/merged from `health` + `sessions` + `simulator`.
- **`AdminDashboardView.tsx`** — becomes the shell: data wiring from `useApp()`, the restructured nav (primary group + a visual divider + reference group), `selectTab`/persistence with legacy-id migration, and routing to the section components. Target: a much smaller orchestrator.

## Testing

- **`computeAttentionCounts`** — unit tests: correct per-job counts from representative inputs; zero/empty; simulated excluded; the roll-up total.
- **Legacy tab-id migration** — a pure `migrateStoredAdminTab(stored)` helper mapping `metrics|payments|subscriptions|sessions|simulator` → their new tab (`home|verify|verify|system|system`), unit-tested.
- **Existing suite stays green** (457 tests) after each extraction — the regression guard that money handlers/logic are untouched.
- **Manual preview (hard gate, MJ, both languages):** the new Home reads right and each count links correctly; Verify shows all three receipt types + failsafe and every approve/reject/verify still works; Launch lists + create-drop opens the builder; Payouts approve/reject; System houses ops + sessions + simulator cleanly; no dead tab; a returning admin with a stored legacy tab lands somewhere sensible. Money actions are reused-not-changed, so the gate is structural/visual judgment — MJ's call. He will "feel it out" and fine-tune placement live.

## Non-Goals (YAGNI)

- No role/permission system (generalist model; deferred).
- No change to any money callable, transition, escrow/settlement logic, or Firestore rule.
- No new data model, collection, or listener.
- No redesign of the drop-builder creation flow itself (Launch links to it unchanged).
- No courier/SLA/automation additions.
- Not deleting dev/monitoring tooling — relocating it (simulator, sessions, resets) into System.
