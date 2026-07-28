# Wave 3 — Evidence-Gated, Self-Service Delivery Flow (Design Spec)

**Date:** 2026-07-28 · **Status:** LOCKED with MJ (build in a fresh session). Part of the admin/seller/order-flow audit roadmap — see `docs/admin-seller-audit-2026-07.md` (Part D) and the shipped Waves 0–2.

## Strategic framing (the WHY — do not lose this)
Mazad is **not** a fulfillment hub. Any item routing through Mazad (a warehouse, admin handling goods) does not scale. The model **offloads trust to the network**: buyers and sellers self-report delivery status with a **photo evidence chain**, and **seller ratings compound over time** so the network gets stronger and needs less oversight. The admin/CS team must **not** be the bottleneck — they are pulled in only for disputes. Today the process is pure trust + paper: driver delivers, buyer signs a paper receipt, driver films it and WhatsApps it to CS. "There is no system." Wave 3 **is** that system.

## The model (LOCKED)

### Evidence-gated, self-service status transitions
Each transition is driven by the counterparty uploading a required photo **in-app** — not by admin.

| Step | Actor | In-app action | Resulting status |
|---|---|---|---|
| 1 | **Seller** | Uploads photo of the item **being prepared** | `preparing_shipment` |
| 2 | **Seller** | Uploads photo of it **sent, with the delivery code visible** | `out_for_delivery` (new status) |
| 3 | **Buyer** | Uploads photo of it **received, with the delivery code visible** | `delivered` → **final sale → escrow releases to seller** |

- **The code is the thread.** A system-generated delivery code is shown to the seller; it must appear in BOTH the seller's "sent" photo and the buyer's "received" photo. Same code out = same code in → the proof the network self-produces. No admin verification needed on the happy path.
- **Self-service UI is mandatory** for seller and buyer: each sees exactly the next photo they owe and the status advances when they provide it. If this lands on the admin team it overwhelms them — the whole point is to offload it.
- **Delivery methods:** hand delivery (in person) and local courier. NOT shipping-with-tracking. The driver/courier never needs the app — the buyer (who has the app) provides the receiving evidence, which is the digital equivalent of the paper signature they collect today.
- **Final sale on delivery.** No protection-window timer, **no auto-complete cron**. The buyer's step-3 confirmation IS completion and releases escrow.
- **Dispute gate (only recourse):** damaged / not-as-described. The buyer opens a dispute **instead of** confirming receipt; admin adjudicates the buyer's photos against the seller's dispatch photos. No returns for buyer's remorse.
- **Paper receipt** may be retained as an offline physical fallback, but the app is the system of record.
- **Ratings compound:** every clean cycle feeds seller ratings → network trust → less oversight over time.

## Resolved decisions (MJ: "go with your recommendation", 2026-07-28)
1. **Code entry:** buyer uploads the received-photo (code visible) **AND also types the delivery code** for a quick automated match — belt and suspenders, still self-service. The photo is the evidence for disputes; the typed code gives an instant server-verified confirmation.
2. **Escrow release on step 3 goes through a SERVER CALLABLE** (same pattern as the Wave 1 payment guard): the buyer's "received" confirmation calls the callable, which verifies preconditions (typed code matches, sent-photo present, not already released) and releases escrow atomically + idempotently. Never a raw client write.
3. **Code visibility:** the delivery code is seller+admin-visible and **hidden from the buyer** (buyer learns it only from the physical parcel/handover). Mirror Wave 1's payment-proof lockdown.

   > **Mechanism corrected at build time (2026-07-28).** This decision said "via Firestore rules field-level denylist". Firestore has **no field-level read denylist** — a granted document read returns every field, and `orders/{orderId}` grants the buyer `allow read`, so a `deliveryCode` key on the order doc would be readable by the one party it must be hidden from no matter what the update denylist says. The code therefore lives in its own document, `deliveryCodes/{orderId}` (`allow read: seller || admin`, `allow write: if false`) — exactly the shape Wave 1 used for `paymentReferences` and Wave 2 for `orderRefs`. The intent of the decision is unchanged; only the mechanism is.
4. **Transition gating:** each photo-gated transition requires its evidence field to be set; **money-touching transitions move server-side** (escrow release via the step-3 callable), per the Wave 1 lesson. Seller's step-1/step-2 photo-advances can stay client transitions with rules that require the photo field, but the step-3 escrow release must be the callable.

## What this changes in the codebase (pointers for the plan)
- **Order FSM** (`src/utils/orderWorkflow.ts` + server): add `deliveryMethod` ('hand'|'courier'), add `out_for_delivery` status, add photo-evidence fields (e.g. `prepPhotoUrl`, `sentPhotoUrl`, `receivedPhotoUrl`) and a `deliveryCode`. Current statuses incl. `preparing_shipment`, `shipped`, `delivered` (see `orderStatusGlossary.ts` from Wave 0 — will need new-status labels).
- **Escrow release** currently server-gated on `paymentVerified` (`functions/index.js` releaseOrderEscrow, money-in guard). Step-3 confirmation should invoke a callable that releases escrow — do NOT bypass the money-in guard.
- **Delivery code** = reuse the reservation/hidden-field patterns from Wave 1 (`paymentReferences`) and Wave 2 (`orderRefs`): `allow read, write: if false` collections, field-level denylists in `firestore.rules`.
- **Seller UI:** SellerCenterView / OrderDetailsView seller actions — the step-1/step-2 photo uploads + status advance.
- **Buyer UI:** OrderDetailsView buyer actions — the step-3 photo upload + confirm, or the damaged/not-as-described dispute.
- **Glossary + counters** (Wave 0) and the audit-log viewer (Wave 2) should reflect the new statuses/actions.

## Build process (same as Waves 0–2)
Fresh session → brainstorm/confirm the open decisions above → write implementation plan (`docs/superpowers/plans/`) → subagent-driven build with per-task + whole-branch review → PR → squash-merge → watch Firebase deploy → run any backfill → update memory. Money-adjacent (escrow release timing) — give it the full delegated-review treatment.
