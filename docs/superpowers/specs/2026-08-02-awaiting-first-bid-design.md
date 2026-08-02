# Awaiting-first-bid: revive the state, surface the inventory

**Date:** 2026-08-02
**Status:** Approved, ready for implementation plan

## Problem

On `/discover`, the **Be the First** chip renders lots with a red pulsing `LIVE`
badge and a countdown ticking down from `59:55`. Neither is real. A `first_bid`
lot has no clock — the server sets `endsAt = now + duration` on the first bid.
Left alone the fake countdown reaches zero and the card flips to `🏁 ENDED` on a
lot that never started.

The same lots are also unreachable from the **All** chip and from every category
chip, so `Be the First` is their only entry point.

## Root cause

`resolveEndTime()` (`src/utils/liveAuctionFields.ts:39`) returns
`Date.now() + 3600000` for any doc missing both `endsAt` and `endTime` — exactly
the shape of an awaiting-first-bid lot. In `mapAuctionDocFull` the fabricated
value is assigned at `auctionDocMap.ts:71`, and the trailing `...data` spread at
`:80` cannot override it because the doc has no `endTime` key to override with.

`isAwaitingFirstBid()` (`src/utils/auctionPhase.ts:15`) requires
`!auction.endTime`. Since `endTime` is never falsy on a mapped `AuctionItem`,
**the helper returns `false` at every call site in the app**:

| Call site | Intended behaviour | Actual |
|---|---|---|
| `DiscoveryFeedView.tsx:184` | `⏳ Awaiting first bid` pill | dead — renders a fabricated countdown |
| `DesktopLiveAuctionLayout.tsx:919/931/934` | desktop live-room awaiting copy | dead |
| `MobileAuctionView.tsx:485` | mobile live-room awaiting state | dead |
| `ReelsDesktopRightPanel.tsx:59` | right-panel awaiting branch | dead |

The E3 Slice A awaiting-first-bid feature is written and shipped but unreachable.
The Discover card is one symptom of four.

A second, independent cause hides the inventory: `buildLiveQuery`
(`useDiscoverFeed.ts:105`) uses `where('endsAt','>',now)` + `orderBy('endsAt')`.
Firestore excludes docs missing the ordered field, so `first_bid` lots cannot
appear under `All` or any category chip.

## Scope

In:

1. Stop fabricating `endTime` for awaiting-first-bid docs — app-wide.
2. Distinct card treatment for the awaiting state.
3. A `⚡ Be the first` section in the **All** tab.
4. Pagination for the **Be the First** chip past its current 24-lot cap.
5. `isSimulated` parity filter on the first-bid query (hardening, see §6).

Out:

- The category chips (`Cars`, `Watches`, …) keep showing clock-running lots only.
  A first-bid lot stays reachable from `All` and `Be the First`, not from its
  category. Deliberate: smallest surface, and `Be the First` is the merchandising
  home for these lots.
- Indexing `startMode` in Algolia (see Known gaps).

## 1. The mapper

Add a pure helper to `src/utils/auctionPhase.ts` that operates on **raw doc
data**, not a mapped `AuctionItem`:

```ts
export function isAwaitingFirstBidDoc(data: any): boolean {
  return (
    data?.startMode === 'first_bid' &&
    !data.endsAt &&
    !data.endTime &&
    (data.totalBids || 0) === 0
  );
}
```

`resolveEndTime()` returns `null` when `isAwaitingFirstBidDoc(data)` is true, and
its current value otherwise. Its return type widens to `number | null`, as does
`AuctionItem.endTime` (`src/types.ts:109`).

Changing `resolveEndTime` itself — rather than each caller — means all five
consumers (`auctionDocMap`, `mapLiveAuctionFields`, `useDiscoverFeed.mapFeedDoc`,
`useSocialProof`, `searchMap`) inherit the fix, which is what makes the four dead
call sites above come alive.

The hand-rolled raw-doc filter at `useDiscoverFeed.ts:243` is replaced by this
helper. That also closes a small hole: the current inline filter never rechecks
`startMode`, relying entirely on the query's `where` clause.

### Null-safety audit

`tsc` will not catch this widening — the repo has no `@types/react` and no strict
mode, so `.tsx` call sites go unchecked.

Method: all 50 non-test `.endTime` reads in `src/` were enumerated, those whose
read is immediately followed by a null-safe token (`)`, `,`, `}`, `?`, `&&`,
`||`, `;`, end-of-line) were set aside as structurally safe, and the remaining 15
— every site doing arithmetic or comparison on the value — were opened and read.
The implementation plan should re-run that enumeration rather than trust this
list, since the plan may touch new sites.

Verified safe, no change needed:

- `MobileAuctionView.tsx:101,117` and `DesktopLiveAuctionLayout.tsx:223` — both
  end-flip timers guard on `!activeAuction?.endTime` and correctly no-op.
- `AppContext.tsx:4595` — `null - now` is negative, so the `diff > 0` gate keeps
  the 5-minute alert from firing. Correct: an awaiting lot has no time remaining.
- `useLandingAuctions.ts:52`, `MyOrdersView.tsx:164`, `serverTime.ts:92`,
  `AuctionLookupSection.tsx:72` — explicit `typeof === 'number'` guards.
- `useSocialProof.ts:182` → `getLiveAuctions` → `isLiveNow` handles `!endTime`.
  Awaiting lots keep counting as live, which is correct — they accept bids.

Two sites break on `null` and need a guard:

- `OurDropsSection.tsx:240` — `a.status === 'live' && a.endTime < Date.now()`.
  `null < now` is `true`, so an awaiting lot would be miscounted as completed in
  an admin stat.
- `AuctionDetailsModal.tsx:111` —
  `Math.max(0, Math.floor((auction.endTime - serverNow()) / 1000))` yields `0`,
  rendering "0s remaining" instead of the awaiting state.

## 2. The card

`DiscoveryFeedView.tsx:184` already renders the `⏳ Awaiting first bid` pill and
needs no change — §1 is what makes the branch reachable. Three additions:

- `:162` — gate the red pulsing `LIVE` badge on `!awaitingFirstBid`, and render
  an amber `⚡ Be the first` / `⚡ كن أول مزايد` chip in its place.
  `bg-amber-400 text-zinc-900`, no pulse. Red belongs to `LIVE` and brand orange
  `#E85D04` is the CTA colour, so neither reads as a distinct third state.
- `:218` — the desktop hover CTA becomes `⚡ Be the first to bid` /
  `⚡ كن أول مزايد` instead of `🔴 Join live`.
- Pill copy stays `Awaiting first bid` / `بانتظار أول مزايدة`.

The card's memo comparator (`areCardPropsEqual`, `:259`) already compares
`endTime` and `totalBids`, so the awaiting→live transition re-renders correctly
when the first bid lands. No comparator change.

**Preview gate:** this is a customer-facing visual change. MJ approves a preview
before merge, not after.

## 3. The All tab

`useDiscoverFeed` gains `firstBidItems: AuctionItem[]` alongside `liveItems`.

- **`All` chip only** (`feedMode === 'default'` and `categoryMatches === null`) —
  additionally fetches the first-bid query with `limit(8)` at the query level,
  not a client-side slice of a 24-doc page. Rendered as a `⚡ Be the first`
  section between `🔥 Live now` and `📅 Upcoming drops`, matching the existing
  section pattern in the file. This section is never paginated; a "See all" link
  switches `selectedCategory` to `Be the First`, which is the paged view.
- **`Be the First` chip** — results land in `firstBidItems`; `liveItems` stays
  empty. This alone removes the incorrect `🔥 LIVE NOW 24` section header and the
  orange `Live now — 24 auctions · Watch` strip, because both render off
  `liveItems` (`:1023` and `:751`). No special-casing of either surface.
- **Category chips** — unchanged, per Scope.

## 4. Pagination

`buildFirstBidQuery` takes a cursor and appends `startAfter`, mirroring
`buildLiveQuery`. `loadMore()` stops early-returning in `first_bid` mode
(`useDiscoverFeed.ts:301`).

The `(status ASC, startMode ASC, createdAt DESC)` composite index **already
exists** in `firestore.indexes.json`. No new index, no deploy ordering concern.

`hasMoreLive` keys off the raw page length (`snap.docs.length === PAGE`), not the
post-filter count, so a page that filters down to fewer cards still advances the
cursor — identical to the ending-soon feed's behaviour.

## 5. Testing

`vitest` here is node-only: no jsdom, no testing-library. Cards cannot be
render-tested. Coverage is at the pure-helper layer plus manual verification.

Unit:

- `isAwaitingFirstBidDoc` across raw doc shapes — awaiting, bid-landed
  (`totalBids > 0`), scheduled (`startMode !== 'first_bid'`), `endsAt` present,
  `endTime` present, null/undefined input.
- `resolveEndTime` returns `null` for an awaiting doc and an unchanged number for
  every other shape, including the `NaN` fallback path.
- The first-bid query descriptor via the existing `FeedConstraints` pattern in
  `discoverQuery.ts` — cursor present and absent.

Manual:

- The two null-guard sites in §1.
- Both live rooms with an awaiting lot, now that their branches are reachable.
- MJ's preview pass on the card.

## 6. isSimulated

`isSimulated: true` is written in exactly one place — `simulateSpawnAuction`
(`functions/index.js:5414`), the admin simulator. That function never writes a
`startMode` field, so simulated docs cannot match
`where('startMode','==','first_bid')` and are **already excluded** from the
first-bid query.

The `isSimulated !== true` filter is therefore hardening, not a fix: it buys
nothing today and exists so the exclusion does not break silently if the
simulator later gains a first-bid option. Recorded here so nobody reads it as a
live bug that was fixed.

## Known gaps

**Algolia search results keep the fabricated countdown.** `searchMap.ts:54` calls
`resolveEndTime(h)` on an Algolia hit, but `buildAlgoliaRecord` does not index
`startMode`, so `isAwaitingFirstBidDoc` cannot detect the state from a search
record. A first-bid lot found via search still renders a fake clock. The path is
null-safe — it simply never returns `null`. Fixing it needs `startMode` added to
the indexed record plus a reindex; deferred to its own slice.

## Risks

- The `number | null` widening is invisible to `tsc` for the reasons above. The
  50-site audit in §1 is the safety net, not the compiler.
- Reviving four dead call sites at once means the live rooms render an awaiting
  state that has never actually run in production. The manual pass in §5 is not
  optional.
