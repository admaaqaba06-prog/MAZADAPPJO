# E3 — Auction Engine Design

Date: 2026-07-26
Status: Approved policy (roadmap). Three independent sub-features; each is its own slice.

## Current lifecycle (verified)
- `scheduledAuctionCloser` (per-minute): scans `active|live|upcoming`; opens scheduled
  auctions (scheduledStartAt), migrates endsAt, settles expired via `settleAuctionTxn`.
- `settleAuctionTxn` → `resolveSettlement({totalBids, winnerId, finalPrice, reservePrice})`
  → `sold` (order) | `reserve_not_met` (status set, NO order) | `unsold` (ended, no bids).
- Reserve lives in `auctionSecrets/{id}` (admin-only).
- `placeBid` writes currentPrice/bidder/endsAt via `applyBidWrites` (anti-snipe soft close).

## Slice A — Start modes (scheduled OR first-bid)
- Per-listing `startMode: 'scheduled' | 'first_bid'` (default 'scheduled'; unset = scheduled).
- **first_bid:** the listing goes **live immediately** (open, accepting bids) with **no
  `endsAt` yet**; the duration clock starts on the FIRST bid: on that bid, set
  `endsAt = now + (duration)`. In `applyBidWrites`/placeBid, when `startMode==='first_bid'`
  and there's no live end yet (totalBids becomes 1 / endsAt unset), compute
  `endsAt = now + durationMs` from the listing's `duration`.
- **Closer:** do NOT settle a `first_bid` listing that has no bids / no `endsAt` (it's open
  indefinitely until a first bid). Once `endsAt` is set, normal expiry applies.
- **UI:** a start-mode picker in the drop builder (scheduled → keep the scheduledStartAt
  control; first_bid → "goes live now, timer starts on the first bid"). Live/discover
  surfaces show "Awaiting first bid" until the clock starts.
- Pure helper `resolveFirstBidEnd(auctionData, nowMs)` → endsAt ms (tested).

## Slice B — Auto-relist unsold
- Per-listing `autoRelist: boolean` (opt-in) + `autoRelistCount` (default 0) + a cap
  `MAX_AUTO_RELISTS` (e.g. 2).
- When an auction ends **unsold** (`ended` / `reserve_not_met`, no completed sale) with
  `autoRelist===true` and `autoRelistCount < cap`, **24h later** create a fresh listing:
  a new auction doc copying the sale-relevant fields (title/desc/media/category/starting
  price/duration/reserve/seller), `autoRelistCount = prev + 1`, scheduled (or first_bid)
  per the original. Implemented in the closer sweep (or a dedicated daily cron): stamp
  `relistEligibleAt = endTime + 24h` on the unsold auction; a sweep relists those past
  `relistEligibleAt` and marks the original `relisted: true` so it fires once.
- Reuse the existing relist/duplicate logic shape (seller `handleDuplicate` mirrors this
  client-side) — but this is server-side + gated on the cap.
- Pure helper `shouldAutoRelist(auction, nowMs, cap)` (tested).

## Slice C — Below-reserve near-miss (seller accepts last price)
- When `settleAuctionTxn` → `reserve_not_met` (top bid < reserve, real bids exist), instead
  of a dead end: stamp the auction/an offer with the top bid + bidder, set a
  seller-decision window (e.g. 24h), and **notify the seller** with an "Accept last price"
  action (E5 wires the notification copy).
- **Seller accepts** (a callable `acceptBelowReserve(auctionId)`, seller/admin only): create
  the order at the top bid (same order shape as a normal sale — buyer premium, seller net,
  24h payment window, escrow), and notify the buyer. **Buyer must confirm** to proceed (the
  buyer sees "the seller accepted your bid of X — confirm to buy"); on confirm → normal
  payment flow. If the seller declines / window lapses → truly unsold (and auto-relist if on).
- Money-path: the order is created at the top bid (below reserve) — same fee math (E1),
  same payment ladder (E2). Careful: don't create a duplicate order; idempotent.
- Pure helper for the offer state; the acceptBelowReserve callable is money-path (TDD + review).

## Build order within E3
1. **Slice A (start modes)** — foundational engine change.
2. **Slice B (auto-relist)** — self-contained cron logic.
3. **Slice C (below-reserve near-miss)** — money-path new flow; pairs with E5 notifications.

## Testing / rollout
- Pure helpers unit-tested. Slices A + C are money-adjacent (placeBid / order creation) →
  cross-model review before merge. Customer-facing UI (drop-builder picker, near-miss
  buyer/seller prompts) → Vercel preview. functions deploy on merge (pipeline now unblocked).

## Open specifics
- Slice A: confirm first-bid clock = `now + duration` on the first bid (assumed).
- Slice B: cap = 2 auto-relists (assumed); relist keeps the same start mode.
- Slice C: seller-decision window = 24h (assumed).
