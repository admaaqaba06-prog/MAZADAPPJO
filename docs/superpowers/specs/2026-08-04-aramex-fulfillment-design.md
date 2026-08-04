# Aramex fulfillment: model and decisions

**Date:** 2026-08-04
**Status:** Decisions approved. Blocked on Aramex credentials + one commercial answer before slice plans.
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
8. **The destination office is chosen to minimise the leg from the seller**, but is surfaced to the buyer as a priced choice, never auto-selected. "Buyer is willing to collect" is an assumption; seller in Irbid and buyer in Amman is a 90-minute drive.
9. **The seller's shipping origin is captured before their first listing.** Without an address there is no rate, no AWB and no pickup.

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

1. **Seller shipping origin.** Address capture gated before first listing, validated via `ValidateAddress` + `FetchCities`. **Build first — everything depends on it.** No external cost, no order impact, shippable alone.
2. **Aramex client foundation.** SOAP client, credential handling, `CalculateRate`, `FetchOffices`. Read-only against Aramex; creates nothing. Lets us put real numbers in front of MJ.
3. **Rates and options at checkout.** Free-municipality matching, priced pickup/delivery options, the fee split from config.
4. **Shipment lifecycle.** `CreateShipments` + `CreatePickup` on verified payment, batched `TrackShipments` polling, Aramex status → FSM mapping.
5. **Retire the photo flow.** Delivery codes, prep/dispatch photos, the admin relay. **Last, and only once 4 has run on real orders.** The photo flow is the fallback while Aramex is unproven.

Bank al Etihad payment validation is a **separate track**, not a slice of this one. It replaces the manual CliQ verification and can proceed in parallel; fulfillment does not depend on it beyond "payment is verified somehow".

## Blockers

1. **Aramex API credentials.** `CalculateRate` needs account number, PIN, username, password, entity and country code. Nothing can be quoted without them. Slices 2–5 are blocked; slice 1 is not.
2. **Is hold-for-pickup available on Jordan domestic?** The whole neutral-zone concept rests on it. The WSDL cannot answer this: `Services` is an untyped string of service codes and nothing enumerates what is purchasable in Jordan. **MJ is meeting Aramex on 2026-08-05** — questions listed below.
3. **Bank al Etihad capabilities are unknown.** The developer portal is a JS application behind MJ's session; it would not render for automated reading and a direct fetch returned only the shell. What that API offers — statement retrieval, incoming-payment notification, CliQ lookup, webhooks — has not been established, so the payment track cannot be designed yet.

## Questions for the Aramex meeting

**Product**
1. Is hold-for-pickup at a destination office available for Jordan **domestic** shipments? What is the service code for the `Services` field?
2. How long does an office hold a parcel before returning it, and what does a return cost?
3. What identification does the buyer present to collect? Can we pass a collection reference on the shipment?

**Pricing** — the answers set the numbers in the fee table
4. Domestic rate card: seller door → Aramex office, and seller door → buyer door, across governorates.
5. Is there a pickup premium over drop-off, and does it change per collection or per day?
6. Volume or marketplace pricing, given every order becomes a shipment.
7. Is there a minimum chargeable weight? Most of our lots are small and cheap — the shipping-to-value ratio is the main commercial risk (see Risks).

**Integration**
8. Sandbox credentials, and whether sandbox rates mirror production.
9. Any push/webhook option for tracking, or is `TrackShipments` polling the only route?
10. Rate limits on `TrackShipments` and `CalculateRate`, and the maximum AWBs per tracking call.
11. Whether a shipment can be created before pickup is booked, or whether they must be atomic.

## Risks

- **Shipping-to-value ratio on cheap lots.** Live inventory is largely 5–40 JOD; several lots are 7–10 JOD. A domestic leg of a few JOD is a large fraction of that, and after the 5% seller commission it may exceed the seller's net proceeds. This is the single biggest commercial risk and cannot be assessed until the rate card exists. If it is bad, the likely mitigations are a minimum lot price for shipped items, or reintroducing seller drop-off as the cheap path.
- **Poll-only tracking means status is delayed by the poll interval.** Acceptable, but the interval is a real product decision — a buyer standing at an Aramex office wants to know it arrived.
- **Aramex becomes a hard dependency on the money path.** An Aramex outage stalls fulfillment for every order. The photo flow is retained through slice 4 precisely as the fallback, and slice 5 should not run until that fallback has been genuinely unnecessary for a period.
- **`CancelPickup` exists but the FSM has no cancellation edge for a booked-but-unshipped order.** Slice 4 must define what happens when a seller cancels after an AWB exists.
