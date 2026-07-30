# Second Chance Offer (Design Spec)

**Date:** 2026-07-30 · **Status:** LOCKED with MJ. From the admin/seller/order audit's deferred list (`D2` — "Second Chance Offer MISSING (manual admin in v1, `index.js:766`)").

## Why (the WHY — do not lose this)

**21 of 31 real orders in production are `defaulted`** — by far the largest status bucket. Today when a winner doesn't pay, `paymentDefaultEnforcer` marks the order defaulted and bans the buyer, and **the lot dies there**. The runner-up placed a real bid and never hears anything; the seller's item goes nowhere; Mazad earns nothing on a sale that was one bidder away from closing.

The system already knows this is the missing step. The enforcer's own health log reads:

> `Buyer blocked; decide re-run/runner-up.`

That decision is manual today and, in practice, never happens. This makes it automatic.

## The model (LOCKED)

When an order defaults, offer the lot to the **runner-up at their own bid**, once, for 24 hours.

### Decisions taken with MJ (2026-07-30)

1. **Reserve fork.** If the runner-up's bid **clears the reserve**, the offer goes straight to them — the seller already agreed to sell at that level. If it is **below reserve**, the seller must accept first. Selling under a reserve without the seller's consent breaks the promise the reserve makes.
2. **Automatic trigger.** The offer opens the moment `paymentDefaultEnforcer` marks the order defaulted. No admin step: the reserve fork already inserts a human exactly where money requires one.
3. **One offer only.** No cascade to the third bidder. Bounded worst case (24h, or 48h when the seller step is involved — see below), one path to test, and third-place bids are usually far enough below reserve that recovery value drops steeply.
4. **24 hours.** The same clock as the below-reserve window, the payment window and the Wave 4 SLAs. No fourth number.
5. **The defaulter's ban is untouched.** Defaulting costs the original winner exactly what it costs today; recovering the sale is a separate concern from punishing the default.

## Architecture

### Reuse, don't reinvent

`functions/settlement.js` already contains a bounded-offer state machine for the below-reserve case:

```
pending_seller -> pending_buyer -> confirmed
pending_seller | pending_buyer -> declined
```

with `belowReserveExpiryMs`, `isBelowReserveOfferExpired` and `belowReserveBlocksRelist`. Second Chance is the same shape with a different trigger, so it **reuses that machine's semantics and helpers** rather than growing a parallel one. The offer lives on the auction doc as `secondChanceOffer`, mirroring `belowReserveOffer`.

State entered depends on the reserve fork:
- bid **≥ reserve** → opens at `pending_buyer` (no seller step)
- bid **< reserve** → opens at `pending_seller`

**Where the reserve comes from.** `auctionSecrets/{auctionId}` — never the auction
doc, which is world-readable (`allow read: if true`), which is exactly why the
reserve lives in an admin-only collection. The enforcer runs on the Admin SDK
and can read it. **An auction with no `auctionSecrets` doc has no reserve**, so
any bid clears it and the offer opens at `pending_buyer`.

**Each party gets its own 24h.** On the below-reserve path the machine is two
steps — `pending_seller → pending_buyer → confirmed` — so the clock **resets when
the seller accepts**. Sharing one 24h across both would leave a buyer sixty
minutes to decide because the seller answered at hour 23. Worst case for a
below-reserve second chance is therefore 48h, and `belowReserveBlocksRelist`
already treats any live `pending_*` as blocking, so relist stays correct
throughout.

### Finding the runner-up

From the `auctions/{id}/bids` subcollection: the highest bid **not** belonging to the defaulting buyer.

**Not `previousBidderId`.** That field is the last person outbid, which is the winner themselves whenever the winner bid twice in a row — it would offer the lot back to the person who just defaulted.

No qualifying bidder (single-bidder auction, or every other bid is the defaulter's) → **no offer**; the lot follows today's relist path unchanged.

### The order-id constraint — the sharpest detail

Orders are keyed by the auction id: `db.collection('orders').doc(auctionId)`, guarded by `if (!orderSnap.exists)` (`index.js:306,339`). **The defaulted order already occupies that id**, so a second order for the same lot cannot reuse it. `docs/BACKLOG.md` records the same trap for re-approving a settled auction.

The second-chance order therefore takes an explicit derived id: **`<auctionId>__sc`**.

- The defaulted order stays exactly where it is, as the audit trail.
- `__sc` is a **one-shot** scheme. It works *because* there is exactly one second chance. Any future cascade must redesign the id first — do not extend it to `__sc2`.

### Accepting

The runner-up accepting mints `orders/<auctionId>__sc`:
- `winningBidAmount` = the runner-up's own bid (not the defaulter's)
- `buyersPremium` / `totalDue` recomputed from that bid via the existing `settlement.js` helpers — never copied from the dead order
- `status: 'waiting_payment'`, fresh 24h `paymentDeadlineAt`
- `orderRef` assigned via `assignOrderRef` like any other order

From there it is an ordinary order: the Wave 3 evidence chain, the Action Center, the payment-default enforcer all apply with no special-casing.

### Declining, lapsing, relist

Declining or letting the 24h lapse sets the offer terminal and unblocks relist. Relist blocking reuses `belowReserveBlocksRelist`'s logic: a live `pending_*` offer blocks; `confirmed` blocks permanently; expired or declined does not.

### Notifications

**No new n8n events.** The live workflow has a fixed 21-event contract (`CHANNEL_POLICY` in `notify.js` mirrors it), and an event it does not route is silently dropped. Second Chance reuses:

| moment | event |
|---|---|
| offer opens to the runner-up | `below_reserve_offer` |
| seller accepts, buyer must confirm | `below_reserve_seller_accepted` |
| declined or expired | `below_reserve_declined` |

These already mean the right thing to a bidder. The Wave-4 email content layer (`emailCopy.js`) gives them amount, deadline and a deep link for free.

## Components

| File | Responsibility |
|---|---|
| `functions/secondChance.js` **(new)** | Pure decisions: pick the runner-up, decide the opening state from the reserve, judge whether an offer is live/expired, build the offer record and the new order's money fields. No Firestore. |
| `functions/secondChance.test.js` **(new)** | Every branch above. |
| `functions/index.js` | Hook in `paymentDefaultEnforcer` **after** the batch commits (opening an offer needs a bids query, which must not sit inside the batch loop); an `respondToSecondChance` callable for seller-accept / buyer-accept / decline. |
| `src/` | Buyer + seller cards to act on a live offer, reusing the below-reserve UI. |

## Error handling

- **Never break the enforcer.** Opening offers is wrapped so a failure logs and moves on — same contract as `assignOrderRef`'s non-fatal call at settlement. A lot that fails to get an offer is the status quo; an enforcer that throws stops defaulting orders *and* stops unblocking expired bans.
- **Idempotent.** The enforcer runs every 30 minutes. An auction that already carries a `secondChanceOffer` is skipped, so a re-run cannot open a second one or overwrite a live one.
- **Accepting is transactional and idempotent** — `orders/<auctionId>__sc` is created under `!exists`, mirroring `settleAuctionTxn`, so a double-tap cannot mint two orders.
- **A malformed bid document is skipped**, not fatal — one bad row must not deny the whole lot a second chance.

## Testing

- `secondChance.test.js`: runner-up selection (including the winner-bid-twice case that makes `previousBidderId` wrong, and the no-qualifying-bidder case); the reserve fork in both directions; expiry boundaries; idempotency; money recomputed from the runner-up's bid rather than inherited.
- A source-level guard that the enforcer hook sits **outside** the batch, in the `txnPurity.test.js` idiom.
- Cards verified by `npm run build` plus a browser pass — vitest here is node-only.

## Explicitly NOT in scope

- **Cascading** to the third bidder and beyond.
- **Changing the ban ladder.** `banLadder.js` keeps its 48h → ~90d policy.
- **Reviving the defaulted order.** A new order is minted; the dead one is history.
- **New notification events**, for the n8n reason above.

## Risk to name plainly

This is **the first fully automatic sale path in the system**. Above reserve, a lot changes hands at a lower price with no human involved. That is deliberate — 21 dead orders is the cost of the status quo — but it deserves watching after launch: the `system_health` row the enforcer already writes should record the offer alongside the default.
