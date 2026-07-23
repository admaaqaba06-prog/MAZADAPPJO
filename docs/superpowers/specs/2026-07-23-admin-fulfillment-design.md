# Admin UX — Slice C: "Fulfillment" (Job 2)

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation plan
**Scope:** Post-auction buyer/seller follow-up (Job 2). Third slice of the job-oriented admin reorganization (Slice A: Launch, Slice B: Verify & Approve).

## Context & Problem

Job 2 — "follow up with buyers/sellers after an auction to facilitate the transaction" — is the messiest manual coordination job today. Verified in code: there is **zero staleness/aging tracking** on any order stage (`orderWorkflow.ts`'s `VALID_TRANSITIONS`/`validateTransition` has no time dimension), and **no WhatsApp nudge events** exist beyond `auction_won`/`payment_due` (`postToN8n` call sites in `functions/index.js`). The admin's only view is a flat, filterable `ORDERS` list (`AdminDashboardView.tsx`) — chasing a slow seller or an unconfirmed delivery means opening each order and messaging people outside the app, with nothing surfacing *which* orders need attention.

## Goals

A new `Fulfillment` admin tab (third in the row, after Verify & Approve and Launch) that turns the order lifecycle from "the admin remembers to check" into "the admin sees what's stuck and nudges it in one click."

### Three stage buckets, each sorted oldest-first with an age badge and an overdue flag
1. **Awaiting shipment** — orders with `status === 'paid'` AND `paymentVerified === true` (i.e. cleared by Slice B — an order the buyer merely self-claimed but the admin hasn't verified is NOT this slice's concern, it's still Slice B's queue). Overdue past **48 hours** since payment.
2. **Awaiting delivery confirmation** — `status === 'shipped'`. Overdue past **5 days** (the WhatsApp caption already promises "2–4 days"; 5 gives one day's buffer before flagging).
3. **Awaiting escrow release** — `status === 'delivered'`. Overdue past **24 hours** — nothing left to happen except an admin click.

**Explicit exclusion:** any order with `status === 'disputed'` is excluded from ALL three buckets, regardless of which stage it would otherwise sit in. Disputes are Job 4's territory (a future Slice D); this slice does not touch dispute resolution.

### Manual nudge (one click, never automatic)
Per the confirmed decision: **nudges fire only on an explicit admin click** — never automatically when an order crosses its threshold. This follows the standing rule to confirm before any customer-facing send; an "overdue" flag is just a visual cue, not a trigger.

- **Awaiting-shipment bucket** → nudges the **seller** ("please ship your item").
- **Awaiting-delivery bucket** → nudges the **buyer** ("please confirm you received it").
- **Awaiting-escrow-release bucket** → no nudge (nothing for a buyer/seller to do — the admin's own one-click **release escrow** action, which already exists via `releaseOrderEscrow`, is surfaced directly in this bucket instead of a nudge button).
- Two new `postToN8n` events: `seller_ship_nudge` (`{ phone, name, orderId, auctionTitle, daysSincePaid, idempotencyKey }`) and `buyer_confirm_nudge` (`{ phone, name, orderId, auctionTitle, daysSinceShipped, idempotencyKey }`). Same safe no-op-if-unwired discipline as every prior notify event — a missing n8n branch never breaks the app.
- Nudges are logged (a lightweight `lastNudgedAt`/`nudgeCount` stamp on the order, admin-only) so the UI can show "nudged 2h ago" and avoid the admin wondering if they already did it — NOT to rate-limit or block a repeat nudge (the admin may deliberately nudge again).

## Architecture & Components

- **`src/utils/fulfillmentQueues.ts`** (new) — pure: `daysBetween`/`hoursBetween` helpers, `isOverdue(order, bucket)`, and `bucketOrder(order): 'awaiting_shipment' | 'awaiting_delivery' | 'awaiting_release' | null` (null = doesn't belong in any bucket — covers disputed, completed, refunded, etc.). Unit-tested with fixed "now" injection (no real-clock flakiness).
- **`functions/index.js`** — two new best-effort notify call sites (`seller_ship_nudge`, `buyer_confirm_nudge`) fired from a new thin admin-gated callable `sendFulfillmentNudge({ orderId, kind: 'ship'|'confirm_delivery' })` that (a) re-validates the order is actually in the matching bucket server-side (an admin-gated callable must not trust client-supplied bucket membership), (b) looks up the target phone/name (seller for `ship`, buyer for `confirm_delivery`), (c) stamps `lastNudgedAt`/`nudgeCount` on the order, (d) fires the notify post-commit, best-effort.
- **`firestore.rules`** — add `lastNudgedAt`/`nudgeCount` to the orders S2 client-update denylist (admin/server-only stamp, same pattern as Slice B's verification fields).
- **`src/components/admin/FulfillmentSection.tsx`** (new) — three-bucket layout, age badges, overdue styling, nudge/release buttons. Presentational + injected data/handlers (no listeners of its own, mirrors `VerifyApproveSection`).
- **`AdminDashboardView.tsx`** — mount the new `'fulfillment'` tab (third position) with an attention-dot on any overdue count; wire `sendFulfillmentNudge` and the existing `releaseOrderEscrow`/`executeOrderTransition('release_escrow')` handler into the section's props.
- **`src/types.ts`** — `Order` gains `lastNudgedAt?`, `nudgeCount?` (optional, admin-stamped).

## Data Flow

Order reaches `paid` (Slice B verified) → appears in Awaiting-shipment if past 48h → admin clicks Nudge → `sendFulfillmentNudge('ship')` stamps + notifies seller → seller ships (`executeOrderTransition('mark_shipped')`, unchanged) → order moves to Awaiting-delivery if past 5d → admin clicks Nudge → `sendFulfillmentNudge('confirm_delivery')` stamps + notifies buyer → buyer confirms (`executeOrderTransition('confirm_delivery')`, unchanged, triggers `releaseOrderEscrow` under the hood per existing code) OR the order sits in Awaiting-escrow-release if the buyer doesn't self-confirm within 24h of delivery, and the admin releases directly.

## Error Handling

- `sendFulfillmentNudge` re-derives bucket eligibility server-side from the fresh order doc (never trusts the client's `kind` blindly) — a `ship` nudge on an order that isn't actually `paid` (e.g. already shipped, or disputed) is rejected `failed-precondition`.
- The nudge stamp write and the notify are independent: a notify failure (best-effort, swallowed) must not roll back the stamp, and vice versa — matches Slice A/B's "never let a notification block a state change" discipline.
- `daysBetween`/`hoursBetween` take an injectable `now` parameter so tests never depend on the real clock.

## Testing

- **`fulfillmentQueues.ts`:** unit tests — bucket assignment for every status (incl. disputed → null, completed → null); overdue boundary exactly at 48h/5d/24h; a fixed injected `now`.
- **`sendFulfillmentNudge`:** pure-core tests (mirroring `orderPaymentVerify.js`'s fake-db pattern) — stamps `lastNudgedAt`/`nudgeCount`; rejects when the order isn't in the claimed bucket; rejects a bad `kind`.
- Manual smoke (needs live/simulated data, MJ/colleague): an aged `paid` order shows overdue + nudge sends; an aged `shipped` order shows overdue + nudge sends; a `delivered` order past 24h surfaces the release button; a `disputed` order never appears in any bucket.

## Non-Goals (YAGNI)

- Courier/tracking-number integration or delivery-status polling.
- SLA automation, auto-refunds, or auto-cancellation on overdue.
- Automatic (non-admin-triggered) nudges — explicitly rejected per the confirmed decision.
- Changes to `orderWorkflow.ts`'s transition state machine.
- Dispute resolution UI (Job 4 / a future Slice D).
- Rate-limiting repeat nudges (the stamp is informational only).
