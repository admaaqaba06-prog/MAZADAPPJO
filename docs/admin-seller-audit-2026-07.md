# Mazad JO — Admin / Seller Center / Order-flow Spec: Codebase Audit

**Date:** 2026-07-27 · **Audited against:** `origin/main` (live product) · **Source:** colleague's "Consolidated Development Spec" (Parts A–E).

Every spec recommendation was checked against the actual code. Verdict = **EXISTS / PARTIAL / MISSING** with `file:line` evidence. Key finding: **the spec overstates how broken things are — much of the critical money-safety work is already built.** Full per-item verdicts below, then the consolidated picture + re-prioritized plan.

---

## Part A — Foundations

| # | Item | Verdict | Evidence + note |
|---|---|---|---|
| A1 | Single status glossary/mapping | **MISSING** | Each screen hard-codes AR/EN words+colors: `MyOrdersView.tsx:28 STATUS_CHIP`, `MyOrdersList.tsx:91`, `SoldOrdersList.tsx:108`, `OrderDetailsView.tsx:302`, `admin/OrdersLedgerSection.tsx:200`. Raw codes leak in fallbacks (`MyOrdersView.tsx:258`) and into notification bodies (`orderWorkflow.ts:444/451/458`). `currentMonthSales` counts non-PAID orders (`SellerCenterView.tsx:537`). Listing status IS cleanly separate. TWO order-status enums coexist (`types.ts:304`=11 vs `orderWorkflow.ts:6`=9). |
| A2 | Server-side state machine | **PARTIAL** | Real FSM exists but CLIENT-side: `orderWorkflow.ts:9 VALID_TRANSITIONS`/`:29 validateTransition`/`:80 executeOrderTransition` (writes Firestore `:342`). Server transitions scattered + self-guarding: `orderPaymentVerify.js:31/54`, `index.js:265/733/815/2392/2594/2879/1552`, `disputeResolution.js`, `returns.js`. No single server owner; bypassable by direct `updateDoc({status})`. |
| A3 | Notifications & language | **PARTIAL** | Server `notify.js:40 copyFor` is Arabic-only (`index.js:75`). Some client writes do titleAr/titleEn (`orderWorkflow.ts:439`, `index.js:3036/3154`). Recipient-lang picked at load (`AppContext.tsx:2914`) but `||data.title` falls back to Arabic for EN. NO empty-content render guard (`NotificationCenter.tsx:342/357`); load doesn't filter empty (`AppContext.tsx:2911`). |
| A4 | Counters from one source | **EXISTS (mostly)** | Fulfillment badge `AdminDashboardView.tsx:206` + rows `FulfillmentSection.tsx:490/552` share `utils/fulfillmentQueues.ts`. Verify `:192`, Disputes `:226` share predicate with list. Only labeled gap: stat chips use sim-excluded `realOrders`, filter-bar uses sim-included `orders`. **The "4 vs 9" is likely stale/test data, not a live bug.** |

## Part B — Admin Panel

| # | Item | Verdict | Evidence + note |
|---|---|---|---|
| B1 | Admin tabs today | EXISTS | `adminNav.ts:5-6` — home/verify/fulfillment/disputes/payouts/launch + orders/members/auction-lookup/system. |
| B1 | Unified Action Center | **EXISTS** (Wave 4) | `ActionCenterSection.tsx` + `utils/actionQueue.ts`. Six tabs → one queue + Our drops. |
| B4 | Dispute: mandatory reason | EXISTS | `DisputesSection.tsx:76,259-265` — confirm disabled until note. |
| B4 | Dispute: confirmation dialog | PARTIAL | Two-step inline, not an amount-echo "are you sure" modal. |
| B4 | Dispute: money move (server) | EXISTS | `orderWorkflow.ts:121-183` → `releaseOrderEscrow`/`refundOrderEscrow` callables. |
| B4 | Dispute: audit log written | EXISTS | `index.js:3102-3113,3439-3456` write `adminActions`. |
| B4 | Side-by-side evidence | PARTIAL | Returns show complaint photos (`DisputesSection.tsx:145-201`); original listing photos not juxtaposed; plain disputes text-only. |
| B4 | Seller-first 48–72h window | PARTIAL | Return path has seller-response stage (`index.js:2543,2654`); generic `open_dispute` hits admin queue immediately. |
| B5 | Two-column expected-vs-submitted | PARTIAL | `PaymentVerifyCard.tsx:92-115` — no submitted-amount column. |
| B5 | **Reused CliQ ref REJECTED** | **MISSING** | `PaymentVerifyCard.tsx:53,70-74`, `paymentReceipt.ts:46` — dup check = receipt-image fingerprint, advisory only; Approve not blocked; no ref unique constraint. **← the one real fraud hole.** |
| B5 | Atomic confirm | EXISTS | `orderPaymentVerify.js:22-38 runTransaction` sets verified+paid atomically; notify post-commit. |
| B5 | Two-admin double-confirm guard | EXISTS | `orderPaymentVerify.js:27-29 alreadyVerified` idempotency. |
| B5 | Reject-with-reason | EXISTS | `orderPaymentVerify.js:44-45`. |
| B5 | Resubmit-max-3 | MISSING | No `resubmitCount` cap. |
| B5 | "Verified in bank" checkbox | MISSING | `PaymentVerifyCard.tsx:53` — Approve enabled by receipt presence alone. |
| B6 | Approval checklist UI | PARTIAL/MISSING | `LaunchSection.tsx` — approve/reject, no itemized checklist. |
| B6 | Bulk approve (1-by-1 server-enforced) | MISSING (correct) | No bulk anywhere; money paths are per-item callables. |
| B6 | Trust-tier auto-publish | MISSING | `firestore.rules:115` — no trusted-seller auto-approve. |
| B7 | Force Open Dispute guarded | PARTIAL | `OrderDetailsView.tsx:714-742` prompt()+confirm(); no typed-ID/money warning. |
| B7 | Force Close Order guarded | WEAK | `OrderDetailsView.tsx:787-809` single confirm(), no reason/typed-ID/amount echo. |
| B8 | Audit collection + writer | EXISTS | `index.js:1487,1576,3102,3439` write `adminActions`. |
| B8 | Reason + before/after | PARTIAL | from→to as a sentence, not structured diff. |
| B8 | Audit viewer UI | MISSING | Subscribed into context (`AppContext.tsx:1286-1309`) but rendered nowhere. |
| B | Server-side admin gating | EXISTS (strong) | `index.js:99,121 assertAdmin`; `firestore.rules:14,275-277,296-308` lock role + financial fields; escrows/wallets/adminActions `write:if false`. |

## Part C — Seller Center

| # | Item | Verdict | Evidence + note |
|---|---|---|---|
| C1a | Task strip → real tasks | PARTIAL | `sellerActions.ts:55` dispute/ship/relist/payout/verify; MISSING pickup-code + auction-ending. |
| C1b | Verification deduplicated | MISSING (tripled) | badge `:1044` + header btn `:1061` + strip `sellerActions.ts:78`. |
| C1c | Wallet in one place | MISSING (dup) | header `:1074` + stat `:1221` + Money `:1674`. |
| C1d | Verification label | MIXED | "Apply for Official Verification" `:1066` vs "Verify your seller account" `:286`. |
| C1e | This-month sales = PAID+ | MISSING | `:537` by month only, ignores status. |
| C1f | Recent activity = events only | MISSING (order dump) | `:1244` pushes every myOrders row. |
| C2a | Sold badge clean label | MISSING (raw) | `:1421` renders raw `{auction.status}`. |
| C2b | Sold listing links to order | MISSING | `:1432` view/edit/relist only. |
| C2c | Icon action tooltips | EXISTS | `title` `:1437-1454`. |
| C3a | One status chip | MISSING (4 cols) | STATUS/PAYMENT/SHIPPING/ESCROW `:1580-1583`. |
| C3b | Horizontal scrollbar | EXISTS (problem) | `overflow-x-auto :1573`. |
| C3c | "To ship" tab + pickup action | PARTIAL | tab `:1547`; pickup-code action absent. |
| C3d | MZ-##### ref shown | MISSING | `#{id.substring(0,8)} :1597`; Order has no ref field. |
| C4a | Three-way money split | EXISTS | `:1674/1701/1714`. |
| C4b | ONE withdrawal btn, disabled@0, min+SLA | PARTIAL | two buttons `:1678-1691`, not disabled@0, no min/SLA copy. |
| C4c | Payout model built | wallet+request | `functions/index.js:3801 requestWithdrawal` — **already the recommended model**. |
| C4d | Payout approval gated | EXISTS (1 gap) | `approveWithdrawal:3998` admin-only/txn/single/idempotent; GAP: no "I sent via CliQ"+ref capture. |
| C4e | "Net of 5% commission" note | EXISTS | `:1719/1704/1818`; `bidMath.ts:24 sellerNet`. |
| C5a | Rating gate = COMPLETED (server) | PARTIAL | order path gated `ratings.js:14`; `reviews` collection `firestore.rules:378` checks buyerId only, no completed gate. |
| C5b | 5/5 w/ 0 sales possible | YES | hardcoded 4.8 default `:548`. |
| C5c | Empty-chart handling | PARTIAL | only category pie guarded `:1880`. |
| C5d | "1 reviews" plural | EXISTS (bug) | `:1799` always plural. |
| C6a | Admin nav admin-only + server role | EXISTS | `DesktopFrame:92/228`, `adminAuth:11`, `firestore.rules:70`. |
| C6b | Icon color convention | MISSING (mixed) | emerald/amber/indigo/purple stat icons `:1670-1812`. |

## Part D — Order Lifecycle

| # | Item | Verdict | Evidence + note |
|---|---|---|---|
| D1 | Buyer payment (CliQ) | PARTIAL | Itemized amount+5% premium, CliQ alias, copy, 24h countdown EXIST (`index.js:288-292`, `OrderDetailsView.tsx:349,357-369`). MISSING: MZ ref; txn-ref field; date field; receipt size cap; **duplicate-txn-ref rejection**. "Under review" is a flag, not a distinct status; buyer click sets `status:'paid'` directly (`orderWorkflow.ts:198-210`). Resubmit-after-reject works. |
| D2 | Unpaid winners | PARTIAL | DEFAULTED cron EXISTS (`paymentDefaultEnforcer index.js:768-848`). Strike ladder EXISTS but different policy (`banLadder.js:11-33`: 48h cooldown → ~90d). Second Chance Offer MISSING (manual admin in v1, `index.js:766`). |
| D3 | Delivery, 3 methods | MISSING | No `deliveryMethod`, no `out_for_delivery`, single linear pipeline (`orderWorkflow.ts:19-20`); fixed 6-step timeline (`OrderDetailsView.tsx:301-308`). Good: no fake tracking (removed, `orderWorkflow.ts:236-241`); seller self-advances w/o admin (`orderAdvance.ts:23-27`). |
| D4 | Pickup confirmation code | MISSING | No 6-digit handover code (only phone-auth OTP). Buyer-confirm + `mark_delivered` exist; no code entry/lockout. |
| D5 | Contact reveal | PARTIAL (weak) | Buyer phone+address revealed to seller after `paymentStatus==='paid'` (`OrderDetailsView.tsx:323`). MISSING: wa.me deep link, order-ref prefill, seller-phone-to-buyer, re-hide after completed. |
| D6 | Protection window & completion | PARTIAL | "Report a problem"/return EXISTS but not time-bound off delivery (`returns.js:29-33` allows only at `shipped`); no 48h `deliveredAt` window; no auto-complete / 7-day auto-DELIVERED. Overdue admin queue EXISTS w/ 48h/5d/24h thresholds (`fulfillmentQueues.ts:14-18`) — detection only. |

---

## Consolidated picture

### ✅ Already solved (spec assumes broken)
Payment verify atomic + idempotent (two-admin safe); dispute money moves require reason + write audit rows; admin gating strong server-side + no bulk money endpoint; payout model = recommended wallet+request, admin-gated/single/idempotent; settlement backbone (escrow, 5% premium, seller net, 24h deadline, DEFAULTED enforcer, strike ladder, overdue queue); no fake tracking; counters mostly share source; 3-way money split + net-of-5% copy; admin nav server-gated.

### 🗑️ Test-data / noise (not code bugs)
Null-content notifications (legacy docs); seeded fake reviews (rejected by rules in prod — dead code; real issue = hardcoded 4.8 default); "4 vs 9" counter mismatch (stale snapshot); gibberish sellers / mismatched images / typo dispute (delete). Sim orders already excluded from metrics.

### ✅ Was "genuinely missing" — now closed (2026-07-28/29)
1. **CliQ transaction-ref reuse** (`B5`) + txn-ref field (`D1`) — Wave 1.
2. **Single status glossary** (`A1`) + "unpaid ≠ sale" — Wave 0. **The "reconcile 2 status enums" half
   shipped 2026-07-29:** `OrderStatusCode` in `orderStatusGlossary.ts` is now the single source, and
   both `Order['status']` and `orderWorkflow.OrderStatus` derive from it. A parity test proves the FSM
   and the glossary cover each other, so a status can never again exist in one and not the other —
   which is what made adding `out_for_delivery` a two-file edit you had to remember.
3. **Cheap credibility bugs** — Wave 0.
4. **MZ-##### order reference** (`C3d/D1`) — Wave 2.
5. Audit-log **viewer** — Wave 2. Force-Close **and** Force-Open guards — both typed-reference gated.
   "Verified in bank" checkbox + resubmit-max-3 — Wave 1. **Payout "sent via CliQ" + ref capture
   shipped 2026-07-29:** approving a payout now REQUIRES the CliQ transfer reference, so an
   approved-but-unsent payout is no longer indistinguishable from a sent one.
6. **Pickup code** (`D4`) + delivery methods (`D3`) — Wave 3. **wa.me contact reveal (`D5`) shipped
   2026-07-29:** a gated callable hands one party the other's number once payment is verified, because
   `firestore.rules` restricts `users` reads to owner/admin and the buyer physically could not look the
   seller up. **Deliberately NOT built:** the third delivery method (Wave 3 ruled out
   shipping-with-tracking) and the delivery-anchored protection window / auto-complete (`D6`) — the
   Wave 3 spec rejected both; the buyer's confirmation IS completion.
7. **Action Center consolidation** (`B1/B3`) — Wave 4.

### 🕒 Defer (premature at current scale)
Trust-tier auto-publish (build when active sellers > ~25–30); Second Chance Offer; seller-first dispute window (one open dispute today); full server-authoritative state-machine rewrite (money callables already self-guard — hardening, not urgent).

---

## Re-prioritized build plan (waves)
- **Wave 0 — Credibility & correctness pass (days):** delete test data + status glossary (A1) + cheap bugs + "unpaid ≠ sale."
- **Wave 1 — Close the money hole:** CliQ txn-ref field + hard unique/reject + bank-verified checkbox + resubmit cap.
- **Wave 2 — MZ order reference + surface audit-log viewer + guard Force-Close.**
- **Wave 3 — ✅ SHIPPED 2026-07-28. Evidence-gated self-service delivery.** Landed as a photo-evidence chain rather than the "pickup code + protection window" this line originally sketched: MJ locked the model in `docs/superpowers/specs/2026-07-28-wave3-delivery-evidence-design.md`, and it explicitly has **no protection window and no auto-complete cron** — the buyer's confirmation IS completion. What shipped:
  - New order status `out_for_delivery` (glossary, buckets, admin ledger filter, seller centre tabs, buyer timeline, `order_shipped` notify event reused so n8n's 21-event contract is untouched).
  - Seller steps 1–2 as client transitions gated by `firestore.rules` on `prepPhotoUrl` / `sentPhotoUrl` + `deliveryMethod` (`'hand' | 'courier'`).
  - Delivery code `DC-XXXXX` in `deliveryCodes/{orderId}` — seller + admin read, no client write. **Not** a field on the order: Firestore has no field-level read denylist and the buyer can read their own order.
  - Buyer step 3 (`releaseOrderEscrow` action `buyer_confirm_receipt`): receipt photo + typed code, verified inside the money transaction, escrow released in the same commit. Rate-limited to 5 attempts by `deliveryConfirm.js`, which counts failures in its own transaction because the money transaction structurally cannot.
  - The legacy one-tap `buyer_confirm_delivery` is now refused for non-admins at `out_for_delivery` — it had no status precondition and would otherwise have been a one-click way around the whole chain.
  - Dispute gate: `canRequestReturn` opens for `out_for_delivery`, so refusing to confirm has a real alternative.
- **Wave 4 — ✅ SHIPPED 2026-07-29. Admin panel re-cut: Action Center + Our drops.**
  Reframed during brainstorming: the audit called this "consolidation" and implied the problem was
  tab-hopping. MJ's actual complaint was that each tab was confusing and several did two unrelated
  jobs at once — and **Wave 3 had just invalidated the fulfillment tab's premise** (its buckets
  described the phone relay that self-service replaced). What shipped:
  - **Six primary tabs became two.** `verify`, `fulfillment`, `disputes` and `payouts` are deleted;
    their per-item cards are row bodies in the queue. `launch` became `our-drops` after shedding the
    customer-approval queue — that tab mixed Mazad-as-operator with Mazad-as-referee.
  - **One queue for anything needing a human**, six row kinds and nine reason codes, each row
    carrying *why* it is there and *how long* it has waited ("buyer hasn't confirmed · 6 days ·
    972 JOD") rather than a bare count. `B1` unified Action Center: now **EXISTS**.
  - **All ranking in a pure builder** (`src/utils/actionQueue.ts`) — vitest here is node-only, so
    logic left in a component ships untested. 28 cases cover every reason, the ordering and its
    tie-breaks, malformed input, and that a healthy in-flight order raises **no** row.
  - **`computeAttentionCounts` deleted.** Queue length is the single source of "how much is
    waiting"; five counters could disagree with the lists they linked to.
  - **SLAs tightened to 24h ship / 24h confirm** (was 48h / 5 days) — MJ: delivery is Amman and
    surrounding areas. Client-only; `functions/fulfillmentNudge.js` reads no thresholds.
  - Legacy tab ids redirect, so no bookmark breaks.

Rule (unchanged from spec): never push to main; branch → PR → review → merge; flag-gate risky flows. Prefer targeted flag-gated slices over a full parallel `admin_v2` rebuild.

_Raw per-part audit notes: `scratchpad/audit-part{A,B,C,D}.md` (session-local)._
