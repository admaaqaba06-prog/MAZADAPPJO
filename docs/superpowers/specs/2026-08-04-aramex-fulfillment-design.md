# Aramex fulfillment: model and decisions

**Date:** 2026-08-04
**Status:** Decisions approved. Rate card received 2026-08-18 — see Rates, which supersedes decision 8. Still blocked on Aramex credentials and on Bank al Etihad's API surface.
**Scope:** The end-to-end fulfillment model and the decisions behind it. Each slice below gets its own implementation plan.

## Problem

Fulfillment today is entirely manual and evidence-based:

- The seller uploads a prep photo, then a dispatch photo with a delivery code visible.
- The buyer confirms receipt.
- The admin relay parks orders in `preparing_shipment` while it phones the seller — the queue's normal resting state.
- Payment is buyer-self-claimed: the buyer submits a CliQ reference (`submitOrderPayment`) and an admin verifies it by hand.

Every order therefore costs Mazad staff time, and every status depends on two counterparties remembering to do something. The goal is to move as much as possible onto Aramex, and as little as possible onto the Mazad team, the buyer and the seller.

## What Aramex actually provides

Verified against the supplied WSDLs, not assumed:

| API | Operations |
|---|---|
| Shipping | `CreateShipments`, `CreatePickup`, `CancelPickup`, `PrintLabel` |
| Tracking | `TrackShipments` |
| Rates | `CalculateRate` |
| Location | `FetchCities`, `FetchCountries`, `FetchCountry`, `FetchOffices`, `ValidateAddress` |

Three properties drive the design:

1. **There is no webhook.** No push operation exists in any WSDL. Status must be polled.
2. **Tracking is batched.** The request takes an `ArrayOfstring` of AWBs and returns a keyed map, so one scheduled call covers every open shipment. Polling is therefore cheap and viable at our volume.
3. **`FetchOffices` returns latitude/longitude**, so offices can be ranked by distance from the seller and each quoted with `CalculateRate`.

`CreateShipments` also exposes `CashOnDeliveryAmount` / `CollectAmount`. **COD is deliberately not used** — see Decisions.

## Decisions

Settled with MJ on 2026-08-04. Recorded so they are not relitigated.

1. **Prepay only. No COD.** Payment stays CliQ / IBAN transfer today, card later. The escrow promise — *Mazad holds your payment until you confirm receipt* — survives unchanged. COD was rejected as unnecessary complexity for v1, not as unworkable.
2. **Aramex collects from the seller's door** (`CreatePickup`). The seller never travels. **Pickup only for v1** — seller drop-off is not built, because it is a second rate path with no `CreatePickup`, and a seller who claims to have dropped off but did not leaves a parcel that does not exist.
3. **Two destinations, one process.** The parcel goes to either the buyer's door or an Aramex office for collection. Same AWB, same tracking, same automation on both. The office is the "neutral zone".
4. **The seller may offer free delivery to municipalities they choose**, from Aramex's own city list.
5. **The buyer pays a flat collection fee** for office pickup, explained at checkout as what it buys: a neutral, safe handover point.
6. **Mazad contributes 1 JD** toward office pickup. This is a deliberate exception to "Mazad pays for nothing", scoped to the neutral-zone concept because that is a platform-level safety promise rather than a shipping cost.
7. **The seller may opt to cover the buyer's collection fee**, making pickup free to the buyer.
8. ~~**The destination office is chosen to minimise the leg from the seller**, surfaced as a priced choice.~~ **SUPERSEDED 2026-08-18.** Aramex quoted a flat national rate, so distance does not affect price and there is nothing to optimise. The office is still surfaced as a choice — but on *convenience and trust*, not cost. See Rates.
9. **Shipping is a seller-level setting captured at onboarding**, applied to
   every auction, with per-auction overrides for exceptions. The origin is
   required before the first listing: without an address there is no rate, no
   AWB and no pickup.
10. **Resolved shipping terms are snapshot onto the auction at publish** and
   locked once it has bids, on the same reasoning the existing rules lock price
   and timing. See below.

### Who pays what

| Path | Buyer | Seller | Mazad |
|---|---|---|---|
| Free delivery (seller's chosen municipalities) | — | full door rate | — |
| Paid delivery to door | quoted door rate | — | — |
| Aramex office pickup | flat collection fee | remainder | 1 JD |
| Office pickup, seller absorbs it | — | remainder + buyer's fee | 1 JD |

**Every fee in this table lives in Firestore config, not in code** — alongside the existing `featureFlags` — so the split, the flat fee and the 1 JD contribution can be tuned without a deploy. The numbers themselves are not yet set; see Blockers.

**Two shape questions are still open** and were raised but not answered. They do not block slice 1, and config placement means neither blocks a deploy — but both need an answer before slice 3 prices anything:

- **Is the flat collection fee national or per-governorate?** A single national number is simpler to explain and keeps the buyer's cost predictable, but it means the seller's remainder absorbs all the distance variance — which is precisely the variance the seller was promised transparency about.
- **Is the 1 JD contribution per order, or capped?** Per order, it scales linearly with volume and is a permanent line in the cost of every shipped sale. A monthly cap bounds it but makes the buyer's price depend on how much of the budget is left, which is not defensible to a buyer.

## Rates (Aramex, 2026-08-18)

Quoted verbally by Aramex; not yet confirmed against `CalculateRate`.

| Weight | Price | Coverage |
|---|---|---|
| up to 5 kg | **3 JD** | anywhere in Jordan |
| up to 10 kg | **4 JD** | anywhere in Jordan |

**Per leg.** Pickup from the seller, delivered **next day**. Hold-for-pickup at an
Aramex office is **confirmed available**, which is what the neutral-zone concept
required.

Three consequences, two of them uncomfortable:

### 1. Flat national pricing removes the cheapest-office optimization

Decision 8 assumed distance drove price, so the design ranked offices by distance
from the seller and quoted each. **At a flat national rate there is nothing to
rank.** Every office costs the same 3 JD.

This is a large simplification: no geo ranking, no per-office quoting, no
lat/long maths, and `CalculateRate` is not needed on the common path — a weight
band lookup answers it. `FetchOffices` is still needed, but only to let the buyer
choose *which* branch is convenient.

### 2. Office pickup is no longer cheaper than delivery — so its rationale changes

Seller door → buyer door is one leg. Seller door → office is one leg. **Both are
3 JD.** The buyer who collects saves nothing and still travels.

That breaks the framing behind decisions 5 and 6. The flat collection fee was
justified as a discount on delivery; there is no discount to give. Office pickup
is now a *same-price alternative* whose only value is the neutral handover — real
for a 300 JD watch, hard to justify for a 7 JD kettle.

**This needs a decision (open):** either price pickup below delivery deliberately
(Mazad's 1 JD absorbs part of the same 3 JD leg, making pickup 2 JD to the buyer
and giving them a genuine reason to choose it), or keep both at 3 JD and sell
pickup purely on trust. The first makes the 1 JD contribution do real work; the
second makes it decorative. **Ask Aramex whether HFPU is itself cheaper than a
door delivery** — that was not covered in the meeting and it decides this.

### 3. The cheap-lot problem is now quantified, and it is real

Seller net after the 5% commission, minus one 3 JD leg:

| Lot | Seller net (95%) | After 3 JD shipping | Shipping as % of lot |
|---|---|---|---|
| 5 JD | 4.75 | **1.75** | 60% |
| 7 JD | 6.65 | **3.65** | 43% |
| 10 JD | 9.50 | 6.50 | 30% |
| 20 JD | 19.00 | 16.00 | 15% |
| 40 JD | 38.00 | 35.00 | 8% |
| 100 JD | 95.00 | 92.00 | 3% |

If instead the **buyer** pays the leg, a 7 JD lot bills 10.35 JD — 29% of the
bill is shipping. A 5 JD lot bills 8.25, of which 36% is shipping.

Most current live inventory sits in the 5–40 JD band, with several lots at 7–10
JD. So:

- **Free delivery is only viable above roughly 20 JD.** A seller offering it on a
  7 JD lot gives up 45% of their net. The listing UI should say so rather than
  let them discover it at payout.
- **Buyer-paid shipping on sub-10 JD lots looks disproportionate** and will
  suppress bidding on exactly the volume tier that currently dominates.
- **The 10 kg band is the better deal** — 5→10 kg costs 1 JD more, so heavier
  lots are proportionally cheaper. Nothing in the design should discourage them.

Mitigations to decide, in rough order of preference: a **minimum lot price for
shipped items**; **buyer-collects-from-seller** reinstated as the cheap path for
low-value lots (rejected for v1, but the economics may force it back); or
**batching multiple wins from one seller into a single shipment**, which the flat
per-leg rate makes unusually attractive — two lots from the same seller in one
parcel is one 3 JD leg, not two.

### Return legs

"Per leg" implies a refused or uncollected parcel returning to the seller is a
**second 3 JD leg**. Nobody has agreed who pays it. The FSM has no cancellation
edge for a booked-but-unshipped order either (see Risks). **Open — ask Aramex
what an undelivered return costs and how long an office holds before returning.**

## Seller shipping profile, and per-auction exceptions

Shipping is a **seller-level setting captured during onboarding and applied to
every auction**, with per-auction overrides for the exceptions a seller wants to
make as lots come in. It is not a per-listing form — a seller who sells fifty
lots from one address should enter that address once.

Lives on `sellerProfiles/{userId}` beside the existing store fields:

```
shipping: {
  origin: { city, area, addressLine, postCode?, phone },  // validated via ValidateAddress
  freeDeliveryCities: string[],       // Aramex city names the seller ships to free
  absorbsCollectionFee: boolean,      // seller covers the buyer's flat fee
  offersPickup: boolean,              // office collection enabled at all
}
```

An auction may carry a partial `shippingOverride` of the same shape. Resolution
is a **pure function** — `resolveShipping(auction, sellerProfile)` — field by
field, override first, profile second, following the existing
`resolveViewing` / `resolveMissingContact` pattern so it is unit-testable
without Firestore.

**Onboarding gate:** a seller cannot publish their first listing until `origin`
is present and validated. That is the natural gate — without an origin there is
no rate, no AWB and no pickup — and it belongs in the same place the app already
blocks on missing contact details.

### The terms are SNAPSHOT onto the auction at publish, not read live

This is the load-bearing decision in this section.

The resolved shipping terms are **copied onto the auction document when it goes
live**, and the order reads them from there. The seller profile is the source
for *new* listings only.

Without this, a seller who edits their profile changes the deal under everyone
who has already bid. Someone bids 40 JOD on a lot advertised as free delivery to
their city; the seller later removes that city; the buyer wins and is charged
delivery they were never offered. That is a bait-and-switch, and it would be
invisible — no field on the order would have changed.

This is not a new principle here. `firestore.rules` already locks
`startingPrice`, `currentPrice`, `duration`, `endTime` and the anti-snipe
settings once a lot has bids, on exactly the reasoning that *changing any of
these after someone has committed a bid changes the deal under them*. Shipping
terms are commercially identical: they change what the winner pays. **They
should be treated as money/timing fields and locked by the same rule** — added
to `moneyTimingKeys()` so the existing `adminEditBlocked()` covers them.

A seller who genuinely needs to change terms mid-auction has the same remedy
they have for price: they cannot, and that is the point.

### Shipping origin is not `viewing`

`viewing` / `viewingPlace` (`office` | `store` | `private`) is a **pre-bid inspection claim**, admin-set precisely so sellers cannot assert it, and it fails closed on unknown values. A shipping origin is different in every respect: it is the seller's own data, it must validate against Aramex's city/area list via `ValidateAddress`, and it is required before listing. **The two must not be conflated.** Reusing `viewing` as an origin would both break its fail-closed guarantee and let a seller publish an inspection claim by filling in a shipping form.

## Flow

```
seller's door ──(CreatePickup)──► Aramex ──► destination
                                              ├─ buyer's door   (delivery)
                                              └─ Aramex office  (pickup, hold-for-collection)
```

Order lifecycle, replacing the photo gates:

1. Auction closes, order created, buyer pays (prepay, verified — see Bank al Etihad below).
2. On verified payment: `CreateShipments` with our order id in `Reference1`, then `CreatePickup`.
3. A scheduled function polls `TrackShipments` with every open AWB and maps Aramex statuses onto the order FSM.
4. Aramex's delivered/collected status completes the delivery leg. The buyer's receipt confirmation still releases escrow — that is a money decision and stays with `releaseOrderEscrow`.

The existing FSM (`waiting_payment → paid → preparing_shipment → out_for_delivery|shipped → delivered → completed`) is largely reusable; what changes is **who writes the transitions** — Aramex tracking instead of counterparty photo uploads.

## Decomposition

Five slices. Each gets its own implementation plan.

1. **Seller shipping profile.** The onboarding-level settings above — origin,
   free-delivery cities, fee absorption, pickup on/off — plus the per-auction
   override shape, the pure `resolveShipping` resolver, the first-listing gate,
   the publish-time snapshot, and the `moneyTimingKeys()` rule change that locks
   the terms once a lot has bids. **Build first — everything depends on it.**
   No external cost and no order impact; the only Aramex call is
   `ValidateAddress` / `FetchCities`, and the city list can be seeded manually
   if credentials are still outstanding.
2. **Aramex client foundation.** SOAP client, credential handling, `CalculateRate`, `FetchOffices`. Read-only against Aramex; creates nothing. Lets us put real numbers in front of MJ.
3. **Rates and options at checkout.** Free-municipality matching, priced pickup/delivery options, the fee split from config.
4. **Shipment lifecycle.** `CreateShipments` + `CreatePickup` on verified payment, batched `TrackShipments` polling, Aramex status → FSM mapping.
5. **Retire the photo flow.** Delivery codes, prep/dispatch photos, the admin relay. **Last, and only once 4 has run on real orders.** The photo flow is the fallback while Aramex is unproven.

Bank al Etihad payment validation is a **separate track**, not a slice of this one. It replaces the manual CliQ verification and can proceed in parallel; fulfillment does not depend on it beyond "payment is verified somehow".

## Blockers

1. **Aramex API credentials.** `CalculateRate` needs account number, PIN, username, password, entity and country code. Nothing can be quoted without them. Slices 2–5 are blocked; slice 1 is not.
2. ~~**Is hold-for-pickup available on Jordan domestic?**~~ **ANSWERED 2026-08-18: yes.** The service code for the `Services` field is still needed before slice 4 can create shipments.
3. **Bank al Etihad capabilities are still unknown.** The developer portal is a JS
   application that will not render for automated reading — retried 2026-08-18
   with MJ logged in, same result; it appears to block script injection, and a
   direct fetch returns only the shell. What the API offers (statement retrieval,
   incoming-payment notification, CliQ lookup, webhooks) is therefore
   unestablished and **the payment track cannot be designed.** Unblocking needs
   either an exported OpenAPI/Postman collection or the product list pasted in.

4. **Whether HFPU is priced below a door delivery.** Decides whether office
   pickup has an economic rationale at all — see Rates §2.

## Still to ask Aramex

Answered on 2026-08-18: HFPU is available; 3 JD to 5 kg and 4 JD to 10 kg, flat
nationwide, per leg; pickup with next-day delivery.

Outstanding, in priority order:

1. **Is HFPU cheaper than a door delivery?** Decides whether office pickup has any
   economic rationale (Rates §2). The single most consequential open question.
2. **What does an undelivered return cost, and how long does an office hold before
   returning?** Currently unpriced and unassigned.
3. **The service code for HFPU** in the `Services` field. Needed to create a
   shipment at all.
4. **Sandbox credentials**, and whether sandbox rates mirror production.
5. **Can several lots from one seller ship as one parcel?** At a flat per-leg rate
   this is the strongest cheap-lot mitigation available (Rates §3).
6. **Is there a minimum chargeable weight**, and does the 5 kg band round up?
7. **Rate limits** on `TrackShipments` / `CalculateRate`, and max AWBs per
   tracking call — sets the poll interval.
8. **Must a shipment and its pickup be created atomically**, or can the AWB exist
   before pickup is booked?
9. **What ID does the buyer present at collection**, and can we pass a collection
   reference on the shipment?
10. **Volume or marketplace pricing**, given every order becomes a shipment.

## Risks

- **Shipping-to-value ratio on cheap lots.** Live inventory is largely 5–40 JOD; several lots are 7–10 JOD. A domestic leg of a few JOD is a large fraction of that, and after the 5% seller commission it may exceed the seller's net proceeds. This is the single biggest commercial risk and cannot be assessed until the rate card exists. If it is bad, the likely mitigations are a minimum lot price for shipped items, or reintroducing seller drop-off as the cheap path.
- **Poll-only tracking means status is delayed by the poll interval.** Acceptable, but the interval is a real product decision — a buyer standing at an Aramex office wants to know it arrived.
- **Aramex becomes a hard dependency on the money path.** An Aramex outage stalls fulfillment for every order. The photo flow is retained through slice 4 precisely as the fallback, and slice 5 should not run until that fallback has been genuinely unnecessary for a period.
- **`CancelPickup` exists but the FSM has no cancellation edge for a booked-but-unshipped order.** Slice 4 must define what happens when a seller cancels after an AWB exists.
