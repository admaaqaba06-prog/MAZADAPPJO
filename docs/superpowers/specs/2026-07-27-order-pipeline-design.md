# Admin order pipeline — design

**Date:** 2026-07-27
**Status:** approved in principle (MJ); spec pending review

## Problem

MJ: the admin panel should be the source of truth for post-auction fulfillment —
payment, escrow, fulfillment, delivery, acceptance, funds release — and someone on
the team must be visibly responsible for chasing each order along.

The workflow he described is a **human relay**. The admin team phones both sides and
records progress:

1. Payment lands → admin **calls the seller** to tell them and to start fulfillment
2. Seller acknowledges → admin **advances the order**
3. Seller reports it is out for delivery → admin **advances the order**
4. Buyer receives it and accepts or rejects → tells the team → admin **advances**
5. Accounting **releases funds** to the seller

## What already exists (verified, not assumed)

Substantially more than expected. `src/utils/orderWorkflow.ts` is a real state machine:

- **`VALID_TRANSITIONS`** — a finite state machine over
  `waiting_payment → paid → preparing_shipment → shipped → delivered → completed`
  (plus `disputed`/`cancelled`/`refunded`). Skipping a stage already throws.
- **`checkRolePermission`** — **an admin is already permitted every buyer and seller
  action**, so `prepare_shipment` / `mark_shipped` are already legal for the team.
- Every transition already writes: the order update, an **activity** subcollection
  record (`performedBy`, `performedByName`, timestamp), an **`adminActions`** audit
  entry when the actor is an admin, and **notifications to buyer, seller and admin**.
- **`fulfillmentQueues.ts`** — three SLA-timed buckets (`awaiting_shipment` 48h,
  `awaiting_delivery` 5d, `awaiting_release` 24h) with overdue detection.
- **`fulfillmentNudge.js`** — nudges, recorded as `lastNudgedAt` / `nudgeCount`.
- The customer-facing status bar in `OrderDetailsView` reads `order.status` — the
  same field these transitions write, so advancing an order updates what the buyer
  and seller already see. No new customer-facing surface is needed.

**So the backend for MJ's relay is already built and guarded. What is missing is the
button.** `AdminDashboardView` only ever calls `executeOrderTransition` for
`resolve_dispute`; the fulfillment queue can nudge and release, nothing else.

## Gaps

1. **No admin UI to advance an order.** The dominant gap, and the cheapest to close.
2. **No free-text note.** `nudgeCount: 3` says three nudges fired; it does not say the
   seller promised a Tuesday courier. The next person picks up cold, and chasing is
   indistinguishable from ignoring.
3. **No owner.** Nothing records which team member is accountable for an order.
   `role` is binary admin/seller — there is no per-person assignment.
4. **`waiting_payment` is in no queue.** `bucketOrder` returns `null` for it, so an
   order where the buyer simply has not paid is watched by nobody. This is money not
   collected, and it is the first stage MJ named.
5. **`confirm_delivery` conflates delivery with acceptance.** It routes straight to
   the `releaseOrderEscrow` Cloud Function, so marking an order delivered *releases
   the money*. MJ's flow needs them separate: goods arrive → buyer accepts or rejects
   → only then does accounting release.

## Design

### 1. `mark_delivered` — a new, money-free transition

Add an action that moves `shipped → delivered`, writes `shippingStatus: 'delivered'`,
and **touches no escrow or payment field**. It goes through the existing
client-side forbidden-field guard in `executeOrderTransition`, which already rejects
`escrowStatus`, `completed`, `refunded` and the settlement fields — so it cannot move
money even if mis-called.

`delivered → completed` (acceptance) stays exactly as it is: the guarded
`release_escrow` Cloud Function path. **This spec does not touch the money path.**

Permission: `mark_delivered` joins `sellerActions` (a seller reporting delivery is
legitimate) which admins already inherit.

### 2. A note on every transition

`executeOrderTransition` gains an optional `extraFields.note`. When present it is
appended to the activity record it already writes:

```ts
// orders/{id}/activity
{ ..., note?: string, performedBy, performedByName, timestamp }
```

Nothing else changes — the canned bilingual `activityMessageAr/En` stay, because the
buyer and seller read them. The note is additive context for the team.

**The note is required for admin-driven advances** (enforced in the UI, not the
transition — a seller self-serving does not owe anyone a note).

### 3. Assignment

Two new admin-only fields on the order:

```ts
assignedToId?: string;
assignedToName?: string;
```

Set from a picker listing admin users. Drives a **"mine to chase"** filter in the
fulfillment queue. Both fields join the buyer/seller **denylist** in
`firestore.rules` — a seller must not be able to reassign or clear ownership.

**Before adding that rule, grep every client path that writes an order for a
spread-based copy.** Making `viewing` admin-only on auctions silently broke Seller
Center relist because `handleDuplicate` spread the source doc; orders are
`allow create: if false` (server-created only) which makes a repeat unlikely, but the
check is mandatory, not optional. Record the result in the PR.

### 4. `awaiting_payment` bucket

`bucketOrder` gains a fourth bucket for `status === 'waiting_payment'`, with a
threshold derived from the order's own `paymentWindowHours` rather than a constant —
the window is already per-order and defaults to 24h. Overdue means the buyer has blown
their payment deadline and the team should be calling them.

This changes a pure, unit-tested function, so it is TDD'd like the rest of
`fulfillmentQueues`.

### 5. UI

Extend `FulfillmentSection` rather than adding a new admin tab — it already owns the
"keep orders moving" job, the buckets, and the overdue logic.

Per order row:
- the current stage and how long it has sat there (exists)
- **Advance to ‹next stage›** — one button, derived from `VALID_TRANSITIONS` so it can
  never offer an illegal jump — opening a small form with a **required note**
- **Assign** — a picker of admin users, with a "mine" filter on the queue
- the **activity trail** (who advanced it, when, and their notes) — read from the
  activity subcollection that is already being written

## Explicitly out of scope

- **Any change to the money path.** Escrow release and refund keep their Cloud
  Function guards untouched. `mark_delivered` is money-free by construction.
- **New customer-facing surfaces.** The buyer/seller status bar already reads
  `order.status`; advancing an order moves it for free.
- Automating any of the phone calls. This is a human relay by design.

## Risks

- **Admin advancing on the seller's behalf records the admin as actor.** That is
  correct — the admin *is* who acted — but it means the activity trail shows
  "Maher marked shipped", not the seller. The note is what carries "seller confirmed
  courier collected". Worth stating in the UI copy so the trail is not misread.
- **A required note is a speed bump.** It is deliberate: an advance with no note is
  the exact thing that makes the trail useless. If it proves annoying in practice,
  loosen it for the low-value transitions rather than all of them.
- `mark_delivered` widens what a seller can self-serve (they can already
  `mark_shipped`). Acceptable: delivery is a claim of fact, and the money still does
  not move until the buyer accepts.
