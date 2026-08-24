# Mazzado — WhatsApp Notification Pipe (Phase 5)

The app's Cloud Functions POST structured JSON events to a configurable **n8n
webhook** on key state changes. n8n turns each event into a WhatsApp message.
The app side is done; the n8n workflows + message templates live on the n8n side
and consume the payload contract below.

## How it works

- One helper, `postToN8n(event, payload)`, reads `process.env.N8N_WEBHOOK_URL`.
- **If the URL is unset, every call is a no-op** — the pipe is completely inert
  and safe to ship. It never throws, so a webhook failure can never disrupt
  auction settlement, bidding, or escrow.
- Events are fired from: `scheduledAuctionCloser` (auction_won + payment_due),
  `repairEndedAuctionOrder` (same two, for admin-repaired wins), `onBidCreated`
  (outbid), and `onOrderStatusChanged` (order lifecycle).

## Activation (one-time)

1. In n8n, create a **Webhook** trigger node → copy its production URL.
2. **GitHub repo → Settings → Secrets and variables → Actions → New repository
   secret**: name `N8N_WEBHOOK_URL`, value = the n8n webhook URL.
3. **Run a deploy so the secret takes effect.** Setting the secret alone does
   nothing — the CI step writes it into `functions/.env` at deploy time. Either
   merge any change touching `functions/**`, or go to **Actions → "Deploy
   Firebase" → Run workflow** to deploy now.
4. To **turn the pipe off**, delete the secret (or set it empty) and redeploy —
   the env var goes empty and `postToN8n` no-ops again.

Test without touching production: set the secret to a `https://webhook.site`
URL, deploy, trigger an event (close an auction with a bid, get outbid, ship an
order), and watch the JSON land on webhook.site.

## Event payload contract

Every event is a JSON POST with `{ event, ...fields, ts, idempotencyKey }`
(`ts` = epoch ms). `phone` is the buyer/bidder's `phoneNumber` and **may be
empty** — n8n decides what to do when it's missing (it is not normalized on the
app side).

**`idempotencyKey`** — a stable string unique to each logical event (e.g.
`<auctionId>_payment_due`, `outbid_<bidId>`, `<orderId>_shipped`). Firestore
triggers are at-least-once, so the same event can very occasionally arrive
twice. To avoid double-messaging a customer, have n8n record processed keys
(e.g. in a data store / dedupe node) and skip a key it has already handled.

### Auction events
| event | when | fields |
|-------|------|--------|
| `auction_won` | auction settles with a winner (or admin repairs the order) | `phone, name, auctionId, auctionTitle, amount` |
| `payment_due` | same moment as `auction_won` (payment prompt) | `phone, name, auctionId, auctionTitle, amount` |
| `outbid` | a higher bid displaces the previous bidder | `phone, name, auctionId, auctionTitle, amount` |

`amount` is JOD (the final/leading bid).

### Order lifecycle event
`order_preparing` · `order_shipped` · `order_delivered` · `order_completed` ·
`order_refunded` — fired when an order's `status` changes to
`preparing_shipment` / `shipped` / `delivered` / `completed` / `refunded`.

Fields: `phone, name, orderId, auctionId, auctionTitle, amount, status,
trackingNumber`

Notes:
- `waiting_payment` does **not** emit here — it's already covered by
  `payment_due` at auction close, so there's no duplicate.
- `trackingNumber` is `''` unless set on the order.

## Full field reference

```
auction_won / payment_due / outbid:
  { event, phone, name, auctionId, auctionTitle, amount, ts, idempotencyKey }

order_*:
  { event, phone, name, orderId, auctionId, auctionTitle, amount,
    status, trackingNumber, ts, idempotencyKey }
```
