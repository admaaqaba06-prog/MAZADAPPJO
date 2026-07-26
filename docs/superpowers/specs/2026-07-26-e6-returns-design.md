# E6 — Returns (not-as-described / damaged) Design

Date: 2026-07-26
Status: Approved (design). Sixth roadmap epic. Two slices — A (buyer request) then B (seller/admin resolution).

## Why + the key fit

Today a buyer's only action on a **shipped** order is "Confirm Parcel Received"
(`confirm_delivery`), which jumps `shipped → completed` and **releases escrow to the
seller** in one step (`OrderDetailsView.tsx:1407`, `releaseOrderEscrow` at
`functions/index.js:2424`). There is no inspection gate and no buyer-facing return.

MJ's locked policy: returns are allowed for **not-as-described / damaged only** (photo
evidence, no remorse), **seller pays** return shipping on a valid claim, and the return
window is **"upon delivery"** — i.e. bound to the receive step, not a separate countdown.

That maps cleanly onto splitting the receive step in two. Because a return is raised
**before** escrow releases, the buyer's money is still **locked in escrow**, so the
existing admin-only `refundOrderEscrow` (`functions/index.js:2787`) refunds it with no
new money-path — it only ever moves funds still sitting in buyer escrow, exactly our case.
No "claw back from a paid seller" path is needed (and none exists — good).

## Verified current state (from a codebase map)

- **Order status** (`src/types.ts:287`): includes `shipped`, `delivered`, `completed`,
  `disputed`, `refunded`, `cancelled`. `escrowStatus`: `pending|locked|released|refunded`.
- **FSM** (`src/utils/orderWorkflow.ts`): `shipped → delivered|disputed`,
  `delivered → completed|disputed`, `disputed → completed|refunded|paid`. Money-moving
  transitions (`confirm_delivery`, `release_escrow`, `refund`, `resolve_dispute`) are
  intercepted and delegated to the `releaseOrderEscrow` / `refundOrderEscrow` callables.
- **Disputes today**: `open_dispute` (buyer|seller) sets `status:'disputed'` +
  a single free-text `disputeReason`. No `disputes` collection — state lives on the order.
  Admin resolves in `admin/DisputesSection.tsx` with release/refund/resume + a required
  note, then `stampDisputeResolution` (`functions/disputeResolution.js`, metadata-only).
- **`refundOrderEscrow`** (admin-only): buyer `escrowBalance -= amount`,
  `availableBalance += amount`; order `status:'refunded'`, `escrowStatus:'refunded'`;
  double-entry ledger + `financialAuditLogs`; notifies both parties. Idempotent.
- **Photos**: buyers already upload images elsewhere (CliQ proof, listing media) to
  Firebase Storage — reuse that upload path for return-evidence photos.
- **Notifications**: E5's `notify({uid, event, data})` choke point + pure
  `channelsFor`/`copyFor` in `functions/notify.js`. E6 adds two events there.
- **`delivered` status is never actually set** by any action today (buyer confirms from
  `shipped`). E6 does not need it; it hooks the `shipped` receive step.

## Design

### Buyer receive step → a two-way decision
On a **shipped** order the buyer sees two actions instead of one:
- **"Everything's good — release payment"** → existing `confirm_delivery` →
  `completed` + escrow releases to seller. **Unchanged.**
- **"Report a problem"** → a return-claim form: pick a **reason**
  (`not_as_described` | `damaged`), a short **description**, and **≥1 required photo** →
  submits the claim. Order → `disputed`, **escrow stays `locked`** (no money moves),
  seller + admin notified.

Once the buyer approves, the return option is gone (matches "upon delivery").

### `requestReturn` callable (buyer-only) — the safe path
A return freezes escrow and blocks release, so it is money-adjacent — model it as a
callable (like the other money-adjacent transitions), NOT a raw client write:

```
requestReturn(orderId, { reason, description, photoUrls })  // buyer/owner only
  guards: caller is order.buyerId; order.status === 'shipped'; escrow not already
          released/refunded; no existing open returnClaim.
  writes (single transaction, NO wallet/ledger writes):
    status: 'disputed'
    disputeType: 'return'                      // distinguishes from a generic dispute
    disputeReason: <generated summary>          // back-comcompat with existing admin card
    returnClaim: {
      reason, description, photoUrls,
      sellerPaysReturnShipping: true,           // policy: seller pays on valid claim
      status: 'open',                            // open | accepted | resolved_refunded | resolved_denied
      createdAt
    }
  post-commit: notify seller (return_requested) + an admin system_health entry.
```

Pure helper `buildReturnClaim({reason, description, photoUrls}, nowMs)` (tested):
validates `reason ∈ {not_as_described, damaged}`, non-empty trimmed `description`,
`photoUrls` length ≥ 1 (and ≤ 6), returns the normalized claim object or throws a
typed validation error. `canRequestReturn(order)` guard helper (tested): true only for
`status==='shipped'` with no existing `returnClaim`/terminal state.

Photos upload client-side to Storage under `returns/{orderId}/{n}` before the callable
(pass the resulting download URLs), mirroring the existing evidence-upload pattern.

### Seller view (Seller Center)
On a returned order the seller sees the claim: reason, description, photo gallery, and
"You are responsible for return shipping on a valid claim." Two optional actions:
- **Accept return** → sets `returnClaim.status: 'accepted'` (a signal to admin; still
  admin who moves money) + notifies admin.
- **Contest** → appends a `sellerResponse` note.
Neither moves money — the admin owns the refund decision (all-money-manual rule).

### Admin resolution (reuse existing machinery)
`admin/DisputesSection.tsx` already resolves disputes with release/refund/resume +
required notes. E6 enriches the card for `disputeType==='return'` to show the reason,
description, photo gallery, seller response, and the seller-pays-shipping liability.
- **Refund** → existing `refundOrderEscrow` (money still locked → clean); also set
  `returnClaim.status:'resolved_refunded'`; notify buyer (`return_resolved`, refunded).
- **Deny / side with seller** → `resolve_dispute:release` → `releaseOrderEscrow`;
  set `returnClaim.status:'resolved_denied'`; notify buyer (`return_resolved`, denied).
- The physical return shipment is off-platform (cash/CliQ); in-app records liability +
  performs the refund. No shipping-fee money movement in-app.

### Notifications (add to `functions/notify.js`)
- `return_requested` → seller (in-app + WhatsApp + email) + admin surfacing.
- `return_resolved` → buyer (in-app + WhatsApp + email); copy branches on
  refunded vs denied.
Add both to `channelsFor` (ALL) and `copyFor` (bilingual, Arabic-primary).

### firestore.rules
`requestReturn` is a callable (admin SDK write), so no client rule change is needed for
the transition itself. Confirm the buyer can still only *read* their own order and that
no client path can forge `returnClaim`. Return-evidence Storage path
`returns/{orderId}/**`: allow the order's buyer to write, authenticated users to read
(or signed URLs) — mirror the existing evidence-upload rules.

## Slices
- **Slice A — Buyer return request:** pure helpers (`buildReturnClaim`,
  `canRequestReturn`) + `requestReturn` callable + `return_requested` event
  (channelsFor/copyFor) + buyer UI (two-way receive step + claim form w/ photo upload) +
  Storage rules. Money-path review (freezes escrow; must never move money).
- **Slice B — Resolution:** seller claim view + accept/contest + admin card enrichment +
  wire `return_resolved` on refund/deny (reusing refundOrderEscrow/releaseOrderEscrow) +
  `returnClaim.status` stamping. Customer-facing → Vercel preview.

## Deferred (explicitly out)
- Returns **after** escrow already released to the seller (window is the receive step,
  per "upon delivery") — would need a seller-clawback path; not built.
- In-app return-**shipping-fee** payment/tracking (off-platform cash/CliQ).
- A dedicated `disputes` collection / multi-round messaging — claim state stays on the
  order doc, matching the current pattern.

## Testing / rollout
- Pure helpers unit-tested. `requestReturn` is money-adjacent (freezes escrow) →
  cross-model review of the functions diff; it must make ZERO wallet/ledger writes.
- Buyer return flow + seller/admin surfaces are customer-facing → Vercel preview.
- Functions deploy on merge (pipeline healthy).

## Open specifics (assumed unless changed)
- Reasons: exactly `not_as_described` and `damaged`. Photos: 1–6 required.
- Seller "Accept return" is advisory; admin still executes the refund (all-money-manual).
- Return option shows only on `shipped` (the live receive state); `delivered` unused.
