# Seller Center Redesign — Design

Date: 2026-07-25
Status: Approved direction; spec for implementation.

## Problem

The Seller Center (`src/components/SellerCenterView.tsx`, ~2172 lines) is
comprehensive but **stat-heavy and task-poor**: 7 tabs, 8 metric cards (mostly 0),
three overlapping notification feeds (right rail + "Latest Sales" + a Notifications
tab), no clear "what do I need to do now," and no prominent primary action. Sellers
can't quickly see what needs attention or efficiently manage many listings.

Founder decisions:
- **Primary user: small merchants / power sellers** — many concurrent listings;
  need efficient management + real tools, not just stats.
- **#1 job: "what needs my action now"** — the hub leads with tasks.

## Approach

Rebuild the presentation + information architecture of `SellerCenterView`; **reuse
the existing data layer and handlers unchanged** (`myAuctions`, `myOrders`,
`reviews`, `withdrawals`, `requestWithdrawal`, escrow math, edit/relist/withdraw
modals). This is an IA + UI redesign, not a data rewrite.

## Information architecture: 7 tabs → 5

| New section | Absorbs | Notes |
|---|---|---|
| **Overview** | old Dashboard | "Needs your action" hub + tight metric row + ONE activity feed |
| **Listings** | My Auctions | power-seller management: search/filter, buckets, per-row + bulk actions |
| **Orders** | Orders & Sales | fulfillment pipeline |
| **Money** | Payouts & Balance | balance + escrow + withdraw in one place |
| **Analytics** | Analytics + **Buyer Reviews** | performance + rating/reviews folded in |

- The **Notifications tab is removed** — notifications already live in the bell +
  the right-rail activity; keeping a tab tripled the same feed.
- `activeTab` union becomes `'overview' | 'listings' | 'orders' | 'money' | 'analytics'`.

## Section designs

### Overview — the action hub
Derive a prioritized **`actionItems`** list (pure, unit-tested `deriveSellerActions(myAuctions, myOrders, availableBalance, isVerified)`), each with `{ kind, count, label, cta (target section) }`:
- **Orders to ship** — orders in `paid` / `preparing_shipment` → Orders.
- **Auctions ended** — `myAuctions` ended/completed that are unsold (relist) → Listings (Ended bucket).
- **Disputes to resolve** — orders `disputed` → Orders.
- **Payout ready** — `availableBalance > 0` → Money.
- **Verify your account** — when seller is unverified → the existing Apply-for-Verification flow.

Render as a prominent card list at the top (icon · label · count · one-tap CTA).
When there are **no actions**, show a calm "You're all caught up" state.

Below the hub:
- A **tight metric row** (4, not 8): Active listings · Live bids now (sum of totalBids on live) · This-month sales (JOD) · Available balance. Each is scannable, `tabular-nums`.
- **One** recent-activity feed (reuse the notification data; drop the duplicate "Latest Sales" + right-rail duplication where it overlaps).

### Listings — power-seller workspace
- Header: **+ New Listing** (→ `setActiveView('upload')`) + a search box (title) + a category filter.
- **Status buckets** as filter chips with live counts: **Live · Scheduled · Ended/Unsold · Sold** (derive from `myAuctions` status + order-sold state).
- List rows: thumbnail · title · status pill · current bid + bid count · time-left (live) → per-row quick actions **View · Edit · Relist** (reuse existing edit modal + relist handler).
- **Bulk mode**: row checkboxes → a sticky action bar (**Relist selected · Cancel selected**). Relist/cancel reuse existing per-item handlers looped over the selection; confirm before cancel.

### Orders — fulfillment pipeline
- Status filter chips: **To ship (paid/preparing) · Shipped · Completed · Disputed**, with counts.
- Order rows: item · buyer · amount · status → open the existing order detail / action flow (mark shipped etc. via the existing order handlers). No new money-path logic.

### Money
- Cards: Available balance · Escrow locked (pending release) · This-month / total sales.
- **Withdraw** actions (bank / CliQ) reuse the existing withdrawal modals; withdrawal history list below.

### Analytics
- Revenue trend / totals, top listings by bids, and the **Buyer Reviews** list + average rating (folded in from the old Reviews tab).

## Layout & style
- Keep the app theme (orange `#FF6B00`/`#E85D04`, cream bg, rounded cards, the existing left-nav pattern) — this is consistent with the app, not a new aesthetic.
- Left nav updates to the 5 sections; mobile keeps the existing responsive treatment
  and MUST follow the in-frame scroll rule (root `h-full overflow-y-auto` +
  `pb-[calc(6rem+env(safe-area-inset-bottom))]` — see [[reference_mazzado_mobile_scroll]]).
- Verification prompt (`Apply for Official Verification`) stays, surfaced as an Overview action item when unverified.

## Testing
- Unit-test the new pure helpers: `deriveSellerActions` (each action kind + empty
  "caught up") and the listings bucket/filter logic.
- Existing suite stays green; `npm run lint` + `npm run build` clean.

## Rollout
- Customer-facing (seller-facing) → build on `feat/seller-center-redesign`, Vercel
  preview, founder review before merge. Verify mobile scroll + both languages (AR/EN).
- Phased build so it's reviewable: **P1** Overview (action hub + metrics), **P2**
  Listings workspace, **P3** Orders + Money + Analytics/Reviews + nav consolidation.
  All land on one branch/preview.

## Out of scope
- No changes to order/escrow/withdrawal money logic — reuse handlers as-is.
- No new analytics data pipeline; use what's already computed.
