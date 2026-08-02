# Featured lots: admin-curated ordering on Discover

**Date:** 2026-08-02
**Status:** Approved, ready for implementation plan
**Issues:** #204 (displayOrder), #205 (drag-and-drop ordering)

## Problem

Feed order is entirely derived from auction data — `endsAt asc` for the
ending-soon feed, `createdAt desc` for the first-bid feed
(`src/utils/discoverQuery.ts`). An admin has no way to put a lot in front of a
visitor. Reported by a partner alongside five other items (#202–#207).

`isFeatured` already exists and is already wired to a surface: the landing page
sorts featured-first, before bid count, before soonest-ending
(`src/landing/useLandingAuctions.ts:65`). Nothing can ever set it — the two
creation paths write `isFeatured: false` (`ListingWizardView.tsx:147`,
`SellView.tsx:186`) and there is no admin write path anywhere. Production
confirms: **241 auctions, zero featured, 48 docs missing the field entirely.**
It is a dead lever with a working sort attached.

## Decisions

Settled during brainstorming, recorded so the plan does not relitigate them:

1. **Featuring, not total ordering.** Pin a handful to the top; everything below
   keeps today's automatic ordering. Dragging 147 lots into a total order is
   unusable and the merchandising value is in the first screen.
2. **`/discover` only.** Not category chips, not the landing page.
3. **A pin survives the first bid; it dies when the lot leaves `live`.** Dropping
   a lot at the moment it starts working is backwards. Both behaviours fall out
   of the same `status == 'live'` filter.
4. **Hard cap of 6.**
5. **No new section and no new header.** A pinned lot floats to the front of
   whichever section it already appears in.
6. **`isFeatured` is left alone.** The landing page behaves exactly as it does
   today.

### Why no `⭐ Featured` section

The obvious design — a fourth section on the `All` tab — was rejected twice
over. The `All` tab already stacks `LIVE NOW`, `Be the first` and `Upcoming`
(#219); a fourth header pushes cards below the fold on mobile.

More decisive: 147 of the live lots are `first_bid`, and those do not appear in
`LIVE NOW` at all — they are in `Be the first`. "Featured leads the `LIVE NOW`
grid" would therefore silently fail for almost everything worth pinning.

Floating a pin to the head of its own section works for both inventory types and
means the same thing in both places. The cost is that a pin is invisible as
curation — a visitor sees a lot first, with nothing marking it as chosen. That
is accepted: the merchandising works whether or not anyone knows it happened.

## Data model

A single field on the auction doc:

```
featuredRank: number   // integer 1–6; absent means not featured
```

Absent, not `null` — the read query orders by `featuredRank`, and Firestore
excludes docs missing the ordered field. That exclusion is the same behaviour
that *caused* #202; here it is the desired semantics and is used deliberately.
It also means **no backfill** onto the 241 existing docs.

Ranks are sparse integers, not fractional or LexoRank keys. At a cap of 6 a
reorder rewrites at most 6 documents in one `writeBatch` — atomic, so the feed
can never observe two lots claiming rank 3. Fractional keys exist to avoid
rewriting neighbours in long lists; at n=6 that machinery buys nothing.

### Index

New composite index on `auctions`: `(status ASC, featuredRank ASC)`. None of the
8 existing auction indexes cover it.

**Deploy the index before the frontend that queries it.** A missing composite
index fails the query outright, which would take the feed's featured merge down.

## Write path

`featuredRank` is not a money/timing key, so `adminEditBlocked()`
(`firestore.rules:120`) does not apply and an admin may write it directly from
the client — including on lots that already have bids. No Cloud Function, no
callable.

Three operations, in `src/utils/featuredRank.ts` as pure functions over the
current featured list, plus a thin Firestore writer:

- **pin(auctionId)** — assign `count + 1`; refuse at 6.
- **unpin(auctionId)** — `deleteField()`, then compact the survivors to 1..n so
  ranks never develop holes.
- **reorder(orderedIds)** — rewrite 1..n from the dragged order.

All three commit as a single `writeBatch`.

### Rules changes (required, security-relevant)

The admin branch already permits this write. Two holes must close, both in the
**non-admin** paths:

- `allow update` creator branch (`firestore.rules:196`) denylists 13 fields;
  `featuredRank` is not among them. A seller editing their own listing while it
  is in `processing`/`pending`/`rejected` could set `featuredRank: 1`, and the
  field would survive admin approval straight to the top of the feed.
- `allow create` non-admin branch (`firestore.rules:133`) likewise does not
  block it, so a forged value can be seeded at creation.

Add `featuredRank` to the creator-update denylist and to the create branch's
`!(... in request.resource.data)` guards. Same class of defence as the existing
`soldByMazad` / `isApproved` / `viewing` guards, and stated in those terms.

Rules cannot count documents, so **the cap of 6 is enforced in the write helper
and the admin UI, not in rules.** An admin with a Firestore console could exceed
it. The read query's `limit(6)` bounds the blast radius: the feed renders at
most 6 regardless, so the failure mode is a confusing admin panel, not a broken
feed. Rules do validate the value: integer, 1–6, admin-only.

## Admin UI

A `FeaturedSection` in the admin dashboard, alongside the existing sections in
`src/components/admin/`.

**Finding a lot to pin.** The admin auctions subscription is
`orderBy('createdAt','desc'), limit(100)` (`AppContext.tsx:1576`) against 241
production auctions — the panel cannot see most of the inventory (#207). Rather
than widen that subscription, the pin picker reuses `useAdminAuctionSearch`
(`AuctionLookupSection.tsx`), an admin-only Algolia search across every status
that creates no Firestore listeners and writes nothing. Searching for a lot to
pin is the natural interaction anyway; browsing 241 rows is not.

**Reordering.** `framer-motion` is already installed (motion 12.40.0) and
exports `Reorder.Group` / `Reorder.Item` with touch drag included — no new
dependency. Per the standing motion preference, the drag transition uses a
smooth bezier ease-out, not a spring.

Two constraints from prior work:

- `DesktopFrame` is `overflow-hidden` and every in-frame view owns its own
  scroll. A touch drag that also scrolls the list is the usual failure here;
  the list is short (≤6) and must not introduce its own scroll container.
- The list renders the 6 pinned lots only. It is never the 241-row directory.

**Writes are optimistic**: the reorder paints immediately and reconciles from
the auctions subscription. A failed batch reverts and surfaces the error inline.

## Feed read path

A fourth query builder in `src/utils/discoverQuery.ts`, following the shape of
the three already there:

```
buildFeaturedQuery()
  where('status', '==', 'live')
  where('featuredRank', '>', 0)
  orderBy('featuredRank', 'asc')
  limit(6)
```

`useDiscoverFeed` fetches it once per feed load, alongside the existing page-1
queries, and merges the result at the head of `liveItems` and `firstBidItems`,
deduped by id against the page that follows it.

Which list a featured lot joins is decided by the **doc shape, not by which
section is on screen**, using the helper #219 already added: a lot that
`isAwaitingFirstBidDoc()` accepts (`startMode === 'first_bid'` **and** no
`endsAt` **and** no `endTime` **and** `totalBids === 0`) goes to the head of
`firstBidItems`; every other featured lot goes to the head of `liveItems`. This
is the same predicate the first-bid feed itself filters on, so a featured lot can
never land in both lists or in neither.

The merge also drops `isSimulated === true` lots, matching `keepAwaitingFirstBid`
(`useDiscoverFeed.ts:187`). A simulated lot should not be pinnable in the first
place, but the feed's two entry points must not disagree about whether it is
visible.

It must be a separate query rather than a client-side sort of the loaded page: a
pinned lot sitting on page 3 of an ending-soon feed would otherwise never float
up.

Consequences to expect, not bugs:

- Fewer than 6 may appear in any one section. The cap is 6 across the feed, not
  6 per section.
- A pinned lot that receives its first bid moves from the head of `Be the first`
  to the head of `LIVE NOW`, because it now has an `endsAt` and changes which
  query returns it. This is decision 3 working as intended.
- The featured query is not category-filtered. On a category chip the merge is
  skipped entirely (`/discover` `All` and `Be the First` only), matching
  decision 2.

## Testing

`vitest` here is node-only — no jsdom, no testing-library — so components cannot
be render-tested. Coverage sits at the pure-helper layer plus rules plus manual
verification. (`reference_mazadjo_testing`; note also that a clean `tsc` proves
nothing about `.tsx` call sites in this repo.)

Unit:

- `featuredRank.ts` — pin at 0..5 existing, pin refused at 6, unpin compacts
  1..n with no holes, reorder produces a contiguous 1..n permutation, and every
  operation is a no-op on an unknown id.
- `buildFeaturedQuery()` via the existing `FeedConstraints` descriptor pattern in
  `discoverQuery.test.ts`.
- The merge helper — featured at head, dedup against the page, correct list
  chosen per lot shape, empty-featured passthrough unchanged.

Rules (`firestore.rules` IS testable here via the `projects.test` evaluator):

- Admin may set `featuredRank`; non-admin creator may not, in each of
  `processing` / `pending` / `rejected`.
- Non-admin create with `featuredRank` present is rejected.
- Out-of-range and non-integer values are rejected for everyone.

Manual:

- Pin, reorder and unpin against a real admin session.
- Touch drag on mobile inside `DesktopFrame`.
- MJ's preview pass on `/discover` before merge — this is a customer-facing
  layout change and goes through the preview gate.

## Out of scope

- **#203** (zero-bid lots labelled "Current bid") — same branch, separate change.
- **#206** (feed is not realtime) — own spec.
- **#207** (admin panel performance) — this spec routes *around* the 100-doc cap
  via search; it does not fix it.
- **Landing page coupling.** Deferred by decision until the feature has been
  used. Turning it on later is one line in `auctionDocMap.ts` — derive
  `isFeatured` from `featuredRank` — plus one test. Because nothing ever writes
  `isFeatured: true`, the two fields cannot drift in the meantime.
- **Category chips**, per decision 2.

## Risks

- The cap is UI-enforced, not rules-enforced. Bounded by the query's `limit(6)`.
- Reviving `isFeatured` later changes landing-page behaviour on a surface not
  covered by this spec's testing. It needs its own preview pass when it happens.
- The featured merge adds one query to every Discover page-1 load. It is capped
  at 6 docs and runs in parallel with the existing three, so the added latency is
  one round trip, not a serial cost.
