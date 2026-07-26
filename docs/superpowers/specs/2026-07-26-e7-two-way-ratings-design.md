# E7 — Two-Way Ratings Design

Date: 2026-07-26
Status: Approved (design). Seventh/final roadmap epic. Two slices — A (seller→buyer rating) then B (reputation aggregation + display).

## Why + current state

Roadmap policy: **two-way ratings (buyer↔seller), visible everywhere.** Today only ONE
direction really works, and the reputation surfaces are half-wired:

- **Buyer → auction/seller:** works. `ReviewPrompt.tsx` client-writes an `OrderReview`
  (`direction:'buyer_rates_auction'`, `stars`, `text`, `vendorId`) to the `reviews`
  collection, gated by `canRateOrder` (order completed/delivered, one-per-order). BUT it
  writes `vendorId` (not `sellerId`) and does NOT feed the seller's displayed rating.
- **Seller reputation display:** exists (`sellerProfiles.rating` shown on the live auction
  + `SellerProfileModal`), but it's fed by SEEDED default reviews and an UNWIRED
  `submitSellerReview` — i.e. the buyers' real ratings don't actually count yet.
- **Seller → buyer:** does not exist. The only admin→buyer path (`mazad_rates_buyer`) is
  written but never aggregated or shown anywhere.
- No reusable `StarRating` component — stars are hand-rolled in 5 places.

So E7 adds the genuinely-missing **seller→buyer** direction, makes **both** directions
count toward a real reputation, and surfaces **buyer reputation** (which has never been
visible) — without destabilizing the existing seller-review UI.

## Verified current state (from a codebase map)

- Collection `reviews`. Types (`src/types.ts`): `OrderReview` (`stars`/`text`/`direction`/
  `vendorId`/`ratedBy`, directions `buyer_rates_auction | mazad_rates_buyer`); `Review`
  (rich seller review `rating`/`comment`/`response`).
- Buyer rating write: `feedback/ReviewPrompt.tsx:45` client `addDoc`. Guard `canRateOrder`
  `OrderDetailsView.tsx:222` (`isBuyer && (completed||delivered) && !hasBuyerReview`).
- Admin→buyer: `OrderDetailsView.tsx:handleAdminRateBuyer` client `addDoc`
  (`direction:'mazad_rates_buyer'`).
- `firestore.rules` reviews (`:361-370`): public read; create if `buyerId==uid &&
  direction!='mazad_rates_buyer'` OR (admin && mazad_rates_buyer); update if
  `sellerId==uid || admin`.
- Completion is server-only (`confirm_delivery` → `releaseOrderEscrow`); client cannot set
  `status:'completed'`.
- `myReviews` listener: `onSnapshot(reviews where buyerId==uid)` (`AppContext.tsx:1886`).
- No shared StarRating; stars hand-rolled in `ReviewPrompt`, `OrderDetailsView`,
  `SellerCenterView`, `SellerProfileModal`, `MyOrdersView`.

## Locked design decisions
- Seller rates buyer with **1–5 stars + optional comment**, after the order is `completed`.
- One rating per order per direction; **final** (no edit) for v1.
- Buyer reputation is shown to the seller **on the order + a buyer badge** — NOT during
  live bidding (so it can't bias bids).
- Both directions computed from the `reviews` collection via pure aggregation (single
  source of truth), not the seeded `sellerProfiles.rating`.

## Slice A — Seller → buyer rating

### `rateBuyer` callable (seller-only) — the safe path
Client rules today only allow `buyerId==uid` or admin to create a review, so a seller
writing a `seller_rates_buyer` doc needs either a rules change or a callable. Use a
**callable** (authoritative + avoids loosening client write rules):

```
rateBuyer({ orderId, stars, comment })  // seller/owner only
  guards: caller === order.sellerId; order.status === 'completed';
          no existing seller_rates_buyer review for this order (one-per-order).
  writes ONE reviews doc: {
    orderId, auctionId, buyerId: order.buyerId,
    sellerId: order.sellerId, ratedBy: order.sellerId,
    stars, text: comment, direction: 'seller_rates_buyer', createdAt
  }
  NO wallet/ledger/escrow writes (ratings never touch money).
  (No notification for v1 — avoid ping spam.)
```

Pure helpers (tested): `buildBuyerRating({stars, comment}, nowMs)` → validated fields
(stars integer 1–5, comment optional trimmed string, ≤500 chars); `canSellerRateOrder(
order, sellerId, existingSellerRatingForOrder)` → boolean (completed + seller is author +
none existing).

Add `direction: 'seller_rates_buyer'` to the `OrderReview` union in `types.ts`.

### Seller UI
On a **completed** order (Seller Center order detail and/or `OrderDetailsView` seller
block), show "Rate the buyer" → StarRating input + optional comment → `rateBuyer`. Once a
`seller_rates_buyer` review exists for the order, show it read-only. Bilingual AR/EN;
smooth ease-out.

## Slice B — Reputation aggregation + display + shared StarRating

### Pure aggregation (single source of truth)
`src/utils/reputation.ts` (tested):
- `computeReputation(reviews, { forId, directions }) → { average: number|null, count: number }`
  — average of `stars` over reviews whose subject matches `forId` in the given directions.
- `buyerReputation(reviews, buyerId)` = `computeReputation` over `seller_rates_buyer`
  (subject = `buyerId`); optionally include `mazad_rates_buyer`.
- `sellerReputation(reviews, sellerId)` = over `buyer_rates_auction` (subject = `vendorId`
  === sellerId) — so buyers' real ratings finally count.
- Rounding/`toFixed(1)` display handled at the edge, not in the helper.

### Shared `StarRating` component
`src/components/ui/StarRating.tsx` — read mode (`value`, `count?`, size) and input mode
(`onChange`). Reuse it for the new seller-rates-buyer UI and the buyer-reputation badge.
(Retrofitting the 5 existing hand-rolled star blocks is out of scope — new surfaces only.)

### Display surfaces
- **Buyer reputation to the seller:** on the seller's view of an order (and the admin
  order view), a small "Buyer rating ★4.6 (12)" using `buyerReputation`. NOT shown in the
  live-auction/bidding UI.
- **Buyer badge:** where a buyer's own profile/orders surface, a "Your buyer rating" badge.
- **Seller reputation made real:** the seller-profile rating reads `sellerReputation(
  reviews, sellerId)` (falling back to the existing seeded `sellerProfiles.rating` only
  when there are zero real reviews), so buyer ratings visibly count. Loads reviews
  on-demand as `SellerProfileModal` already does.

### Reads / rules
- Reviews are publicly readable already — aggregation can run client-side over a
  `where(direction, subjectId)` query. Buyer-reputation reads: query
  `reviews where buyerId==X and direction=='seller_rates_buyer'`.
- `firestore.rules`: the `rateBuyer` callable writes via admin SDK (no client rule change
  needed). Confirm no client path can forge a `seller_rates_buyer` doc (client create rule
  still requires `buyerId==uid` for non-mazad directions, which a seller is NOT for these
  docs — so the callable is the only writer; good).

## Deferred (explicitly out)
- Editing/deleting a submitted rating (v1 is one-shot final).
- Mutual-blind reveal (hide until both sides rate) — show immediately for v1.
- Retrofitting the 5 existing hand-rolled star renders to `StarRating`.
- Structured rating tags ("paid on time", "communication") — plain stars + comment for v1.
- A rating notification (`you_were_rated`) — omitted to avoid ping spam.

## Testing / rollout
- Pure helpers (`buildBuyerRating`, `canSellerRateOrder`, `computeReputation`/
  `buyer`/`sellerReputation`) unit-tested.
- `rateBuyer` is a new callable but NON-money (ratings never move funds) → still gets a
  review confirming zero wallet writes + correct seller-only auth + one-per-order.
- Seller rating UI + buyer-reputation surfaces are customer-facing → Vercel preview.
- Note: making seller reputation read from real reviews may visibly change seller scores
  vs today's seeded values — flag on the PR for MJ's eyes.

## Slices
- **A — Seller→buyer rating:** pure helpers + `rateBuyer` callable + seller UI.
- **B — Reputation + display:** pure aggregation + shared StarRating + buyer-rep surfaces +
  seller-rep-from-real-reviews.

## Open specifics (assumed unless changed)
- Buyer reputation optionally includes the legacy `mazad_rates_buyer` admin stars — default
  YES (they're buyer-trust signals); easy to exclude.
- Comment cap 500 chars; stars integer 1–5.
- Seller can rate only after `completed` (not `delivered`, which is unused in practice).
