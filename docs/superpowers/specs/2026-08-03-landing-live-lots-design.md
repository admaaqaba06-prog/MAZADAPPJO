# Landing page: show the live lots that already exist

**Date:** 2026-08-03
**Status:** Approved, ready for implementation plan

## Problem

`mazad-jo.com` renders its marketplace section's EMPTY STATE while 147 lots are
live:

> **"New auctions launch daily"**
> **"Be one of the first sellers — list your item now and lead the page."**
> (`المزادات تنطلق يومياً` / `كن من أوائل البائعين`)

Verified on production. The landing page is the first surface in the funnel —
visitors reach it, are told there is nothing to buy and that they should sell
instead, and only then reach the sign-in screen.

## Root cause

`curateLandingAuctions` (`src/landing/useLandingAuctions.ts:62`) filters:

```ts
.filter(a => !!a.title && typeof a.endTime === 'number' && a.endTime > now && isLiveNow(a, now))
```

A `startMode: 'first_bid'` lot has no clock until someone bids — the server
stamps `endsAt` on the first bid. `fetchLandingAuctions` spreads the RAW doc, so
those lots arrive with `endTime` **absent**. `typeof undefined === 'number'` is
false, so every one is dropped and the section falls through to `isEmpty`.

Census taken 2026-08-03: **147 live lots, all `first_bid`, all clockless, none
with a single bid.** So the filter drops 100% of live inventory.

The fetch itself is not the problem: `where('status','==','live') limit(60)` has
no `orderBy`, so clockless lots ARE retrieved. Only curation discards them.

This is the same root cause fixed in Discover by PR #219. The landing page holds
an independent copy of the filter and was deliberately left alone at the time —
recorded as "pre-existing, not a regression", which was true but under-weighted.

## Second, independent defect on the same surface

The landing card hardcodes `t.marketplace.currentBid` for its price label
(`LandingView.tsx:295`). PR #220 added `priceLabel()` in `src/utils/bidLabels.ts`
precisely because labelling a zero-bid lot "Current bid" next to "0 bids" makes a
correct opening bid read as a broken increment. The bidding surfaces were fixed;
the landing card was missed. With the filter fixed, all 147 lots would render
"Current bid X JOD · 0 bids".

## Scope

In:

1. Stop dropping clockless lots from landing curation.
2. A deterministic sort that works when `endTime` is absent.
3. A "Be the first" badge for clockless lots instead of the ending-soon badge.
4. Reuse `priceLabel()` so zero-bid lots read "Opening price".
5. Correct the `LandingAuction.endTime` docblock, which this change falsifies.

Out:

- The sign-in screen redesign. Separate spec, deliberately sequenced after this.
- The `Fashion` category skew (125 of 147 live lots sit in the `misc`→`Fashion`
  catch-all while actually being home appliances, so category filtering is close
  to useless on current inventory). Real, separate, needs its own decision.
- Any change to `fetchLandingAuctions`' query, cache, or the `DISPLAY_CAP` of 8.

## 1. Curation filter

Replace the filter with `isLiveNow(a, now)` alone:

```ts
.filter(a => !!a.title && isLiveNow(a, now))
```

`isLiveNow` (`src/utils/auctionPhase.ts`) is `status === 'live' && (!endTime ||
endTime > now)` — it already keeps a clockless lot and already drops an expired
one, so the expiry guard is not loosened. The `typeof === 'number'` test was the
only thing excluding first-bid lots and it is redundant with `isLiveNow`.

## 2. Ordering

The current sort ends `return x.endTime - y.endTime`, which yields `NaN` when
either side is absent — an unstable comparator once clockless lots are admitted.

New rule, in order:

1. Featured lots first, by `featuredRank` ascending (the contiguous 1..n integer
   stored by PR #220; absent when not featured — see `src/utils/featuredRank.ts`).
2. Then lots WITH a clock, by `endTime` ascending (ending soonest first).
3. Then clockless lots, by `createdAt` descending (newest first) — matching how
   Discover orders its Be-the-First feed.

Two fields are ADDED to `LandingAuction`, both already present on the raw doc:

- `createdAt: number | undefined` (epoch millis), parsed in `mapToLandingAuction`.
- `featuredRank: number | undefined`, copied straight across.

`LandingAuction.isFeatured` stays as-is (the card renders off it). Ranking uses
`featuredRank`, because two featured lots would otherwise order arbitrarily and
the whole point of #220 is admin-controlled order. A featured lot with no
`featuredRank` sorts after ranked ones but before unfeatured. A lot missing
`createdAt` sorts last rather than throwing.

Note: zero lots are currently featured, so branch 1 is untested by production
data — its ordering tests are the only coverage it will get.

Clocked-before-clockless is deliberate: a running clock is genuine urgency and
earns the top slots. With today's inventory every lot is clockless, so the
effective order is newest-first across all 8 display slots.

## 3. Card badge

`LandingView.tsx:268` computes `const endingSoon = a.endTime - Date.now() <
3600_000`. For a clockless lot that is `NaN < 3600000` → `false`, so the badge is
already suppressed — but by accident, not by intent, and the expression reads as
though it works.

Make it explicit:

```ts
const hasClock = typeof a.endTime === 'number';
const endingSoon = hasClock && a.endTime - Date.now() < 3600_000;
```

When `!hasClock`, render a **Be the first** badge in that slot instead. Copy must
be byte-identical to what already ships in the app so a visitor who taps through
sees the same words: `كن أول مزايد` / `BE THE FIRST`. Style it amber
(`bg-amber-400 text-zinc-900`) to match the Discover card badge, NOT the brand
orange `#F05123` the ending-soon badge uses — orange means "clock running" on
every other surface.

## 4. Price label

Import `priceLabel` from `src/utils/bidLabels.ts` and replace the hardcoded
`t.marketplace.currentBid`:

```ts
{priceLabel(a.totalBids, isAr)}
```

Yields `Opening price` / `السعر الافتتاحي` at zero bids and `Current bid` /
`المزايدة الحالية` once a bid lands.

`LandingView.tsx:296` is the ONLY reader of `t.marketplace.currentBid` (verified
by grep across `src/`), so after this change the key is dead. Leave it in
`translations.ts` anyway — deleting a key from both language objects is churn
outside this fix's purpose, and `bidLabels` deliberately owns this copy now.
Note it in the implementation report so it can be swept later.

## 5. The docblock

`LandingAuction.endTime`'s comment currently ends:

> "`curateLandingAuctions` filters both out with a `typeof === 'number'` check
> before mapping, so a curated LandingAuction always holds a number"

This change makes that false. Rewrite it to state what the code will actually do:
a curated `LandingAuction` may hold `undefined` for a clockless lot, and every
consumer must guard. This branch's predecessor found six comments that went stale
exactly this way — a statement true when written, falsified later by a change in
a different file. Do not add a seventh.

## Testing

`vitest` here is node-only: no jsdom, no `@testing-library/react`. Components
cannot be render-tested; the pure curation logic can and must be.

`src/landing/useLandingAuctions.test.ts` already exists. Extend it:

- A clockless live lot (no `endTime`) is KEPT — the regression this fixes.
- An expired lot (`endTime` in the past) is still dropped.
- A non-live lot is still dropped.
- A titleless lot is still dropped.
- Ordering: featured before non-featured; clocked before clockless; clocked sorted
  by `endTime` asc; clockless sorted by `createdAt` desc.
- A clockless lot missing `createdAt` sorts last and does not throw.
- `mapToLandingAuction` carries `createdAt` through and leaves `endTime` absent
  rather than fabricating one.

Manual, because none of the above is renderable here: load the landing page and
confirm real lots render with the Be-the-first badge and "Opening price", and
that the empty state no longer appears.

## Risks

- **`tsc` is not a net.** No `@types/react`, no `strictNullChecks` — the
  `endTime` narrowing in `LandingView.tsx` is unchecked. Verify by reading.
- **Ordering is the subtle part.** A comparator that returns `NaN` sorts
  unpredictably rather than failing loudly, so the ordering tests matter more
  than the filter test.
- **This surface has no automated render coverage at all.** The manual pass is
  the only thing that catches a broken badge or a layout regression.
