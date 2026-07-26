# E1 — Money Model (seller commission + CliQ sender-phone) Design

Date: 2026-07-26
Status: Approved policy (see the auction roadmap); this is the E1 implementation spec.

## Goal

Make the app reflect the locked economics: **total take 10%** — buyer pays hammer +
5% (buyer premium, already built); seller **nets 95 on a 100 sale** via a NEW **5%
seller commission** deducted at payout. Plus: capture the **CliQ sender phone** at
payment. No security deposit (docs-only, handled in E4). No auto-release (already
true — must not add a timeout).

## Current state (verified)

- Buyer premium: `buyersPremium = round(hammerFils * 5%)`, `totalDue = hammer + premium`
  (functions/index.js settle/repair; `totalWithPremium` in bidMath.ts for display).
- Escrow holds the **hammer** (`winningBidAmount`). On release, `releaseOrderEscrow`
  credits the seller the **full hammer** (`amountFils`) — no commission today.
- Release is buyer- or admin-triggered; NO automatic timeout release exists.
- No deposit-to-bid code path (the "deposit" references are CliQ wallet top-ups).

## Design

### 1. Seller commission (pure math, one source of truth)
Add to `functions/settlement.js` (integer fils, double-rounded, unit-tested):
- `SELLER_COMMISSION_RATE = 0.05`
- `sellerCommissionFils(hammerFils)` → `round(hammerFils * 0.05)`
- `sellerNetFils(hammerFils)` → `hammerFils - sellerCommissionFils(hammerFils)`

Mirror a display helper in `src/utils/bidMath.ts`:
- `sellerNet(hammerJod)` → `(fils - round(fils*0.05)) / 1000` (95 on 100), symmetric with `totalWithPremium`.

### 2. Deduct commission at payout (`releaseOrderEscrow`)
- Credit the seller `sellerNetFils(amountFils)` instead of the full `amountFils`.
- The 5% commission stays with Mazad (not credited anywhere new — it's simply not paid
  to the seller; the buyer premium already stays with Mazad the same way).
- Ledger: the seller ledger entry amount becomes the NET; add a second ledger line
  `type: 'seller_commission'` for the 5% (audit clarity). Escrow debit stays the full hammer.
- Idempotency + admin/buyer-caller checks unchanged.

### 3. Stamp seller economics on the order (visibility before release)
At settlement (`settleAuctionTxn` + `repairEndedAuctionOrder`), add to the order payload:
- `sellerCommission` (JOD), `sellerNet` (JOD) alongside the existing `buyersPremium`/`totalDue`.
So the seller sees "you'll receive" the moment they win a sale, not only after release.

### 4. CliQ sender phone at payment
- Add a **required** `cliqSenderPhone` field to the buyer's pay step (the CliQ payment
  screen in the order/checkout flow) — "the phone number the CliQ transfer is coming
  from (may differ from your account)".
- Persist `cliqSenderPhone` on the order when the buyer submits payment proof.
- Surface it to admin in the payment-verification view (AdminDashboard / order detail)
  so they can match the incoming transfer.
- Rules: this is a client-writable order field on the buyer's own order — extend the
  order-update allowance (it already permits the buyer's unpaid→paid claim) to include
  `cliqSenderPhone`; it is NOT in the server-only denylist.

### 5. Display surfaces (seller "you'll receive")
Show the net (hammer − 5%) wherever the seller sees proceeds, labelled "after 5% Mazad
commission":
- **Sell/listing** (SellView / AuctionDropBuilder preview): "you'll receive ~X" estimate.
- **Order detail** (OrderDetailsView, seller side) + **My Orders** (seller view).
- **Seller Center → Money** (balance/escrow already there; add per-sale net + a "fees"
  line). Analytics revenue should reflect NET where it means seller earnings.
Buyer premium display is unchanged (already correct).

## Testing
- Unit: `sellerCommissionFils` / `sellerNetFils` (settlement.test.js) — 100→95, rounding
  edges (odd fils), 0, large values; symmetry with buyer premium (buyer 105 / seller 95 / Mazad 10 on 100).
- Unit: `sellerNet` in bidMath.test.ts.
- Existing suite green; lint + build clean.

## Rollout / safety
- **Money-path** → TDD the fils math; **cross-model adversarial review** of the
  `releaseOrderEscrow` change (double-crediting, rounding drift, idempotency) + the rules
  edit before merge.
- Customer-facing (CliQ field + seller "you'll receive") → Vercel preview for MJ before merge.
- Functions + rules change → deploys on merge via CI.

## Out of scope (later epics)
- Admin-only release / buyer-confirm-then-admin-approve refinement → E6.
- Rules/Terms doc rewrite (fee wording, no deposit) → E4.
