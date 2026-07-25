# Discover Pagination — Slice 1 (additive, flag-gated feed)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Build a paginated **ending-soon** Discover feed with **live-on-visible** per-card subscriptions and a **"new drops" pill**, behind an `enablePaginatedDiscover` feature flag (default OFF). ADDITIVE — the current broad-listener feed stays as the fallback; nothing is removed. Slice 1b (remove the broad listener + give the auction room its own subscription) and Slice 2 (Algolia search) follow. Spec: `docs/superpowers/specs/2026-07-25-discover-pagination-search-design.md`.

**Architecture:** New self-contained hooks own the paginated list + visible subscriptions; `DiscoveryFeedView` branches on the flag (new path vs unchanged old path). Mirrors the existing shared-`IntersectionObserver` + shared-ticker registry pattern.

## Global Constraints
- **Flag default OFF** — with the flag off, `DiscoveryFeedView` behaves EXACTLY as today (the current `useAuctions()` path untouched). Only when the flag is ON does the new paginated path render. Prod cannot break from this slice.
- **Do NOT remove** the broad `auctions` `onSnapshot` (AppContext ~1506-1511), `visibleAuctions`, `useAuctions`, PF5 sync, or any consumer — Slice 1b handles removal. Do NOT change the auction/bidding room, `placeBid`, rules, or money.
- Reuse `serverNow()` (`src/utils/serverTime.ts`) for ending-soon math; mirror `useIsOnScreen`/`sharedTicker` (`src/hooks/useCountdownSeconds.ts`, `src/utils/sharedTicker.ts`) for the visible-subscription registry.
- **Ending-soon order:** `orderBy('endsAt','asc')` (the Timestamp field `mapAuctionDoc` reads first; confirm it's the field anti-snipe updates — if a live doc can lack `endsAt`, fall back to `endTime`). Exclude `isSimulated===true` and past-ended lots client-side after the query (same as `filterSimulated`/live checks today).
- Bilingual + RTL; brand; reduced-motion; **no fabricated data** (real lots, honest empty/loading, no fake counts).
- After each task: `npx tsc --noEmit` 0 + `npm test` (baseline 509).

**Key anchors (from recon):** broad listener AppContext:1506-1511; `mapAuctionDoc` :68-155 (reuse for mapping paginated docs — export/extract if needed); `filterSimulated` (`utils/simVisibility.ts`); `useIsOnScreen`/`getSharedObserver` (`useCountdownSeconds.ts:56-100`); `subscribeToSharedTicker` (`sharedTicker.ts:39-54`); `DiscoveryFeedView` reads `useAuctions()` at :299, filter state :312-313, section maps :838/:876, empty state :907-1045, `AuctionCard`+`useIsOnScreen` :65-87; featureFlags state :428-434 / listener :1196-1248 / interface :317-326; indexes `firestore.indexes.json` (has `(status,createdAt desc)`; needs `(status,endsAt)`, `(status,category,endsAt)`, `(status,scheduledStartAt)`).

---

### Task 1: Pure helpers + tests
**Files:** Create `src/utils/discoverQuery.ts` + `.test.ts`.
- `buildLiveFeedConstraints({ category, cursor })` → returns the Firestore constraint list description (pure, testable as a plain object): `{ where:[['status','==','live'], ...(category&&category!=='All'?[['category','==',category]]:[])], orderBy:[['endsAt','asc']], startAfter: cursor??null, limit: PAGE }` where `PAGE=24`. (A pure descriptor the hook translates to real `query(...)` constraints — keeps the query shape unit-testable.)
- `buildUpcomingFeedConstraints({ cursor })` → `status==upcoming`, `orderBy scheduledStartAt asc`.
- `hasNewerDrops(newestLoadedCreatedAt: number|null, latestLiveCreatedAt: number|null): boolean` → true when `latestLiveCreatedAt!=null && (newestLoadedCreatedAt==null || latestLiveCreatedAt > newestLoadedCreatedAt)`.
- `isDisplayableLive(a: {status?:string; endTime?:number; isSimulated?:boolean}, now:number): boolean` → `status==='live' && a.isSimulated!==true && (!a.endTime || a.endTime>now)`.
- Tests: constraint objects for All vs a category vs with-cursor; `hasNewerDrops` all branches; `isDisplayableLive` (live/simulated/past/upcoming). TDD.
- Commit `feat(discover): pure query/new-drops/displayable helpers`.

### Task 2: `useVisibleAuctionLive` — per-card live-on-visible subscription
**Files:** Create `src/hooks/useVisibleAuctionLive.ts` (+ a small registry). 
- Mirror the shared-observer/ticker registry shape: a module-level `Map<id, { unsub, refCount, listeners:Set }>` so multiple visible cards of the same id share ONE `onSnapshot(doc(db,'auctions',id))`.
- `useVisibleAuctionLive(id: string, enabled: boolean): Partial<AuctionItem> | null` — when `enabled` (card on-screen) subscribes (or joins existing) and returns the live doc's changing fields (`currentPrice, totalBids, currentBidderId, currentBidderName, reserveMet, status, endTime/endsAt`) mapped via the shared mapping (reuse `mapAuctionDoc`/`parseTimestamp`); when `enabled` false, unsubscribes (refCount--). Cleans up on unmount. Returns null until first snapshot (caller falls back to the paginated doc's values).
- No test harness for the subscription (Firestore) — extract any pure merge logic (`mergeLiveIntoCard(base, live)`) as a tiny tested helper.
- Commit `feat(discover): per-card live-on-visible subscription (shared, ref-counted)`.

### Task 3: `useDiscoverFeed` — paginated ending-soon list + infinite scroll
**Files:** Create `src/hooks/useDiscoverFeed.ts`.
- State: `liveItems: AuctionItem[]`, `upcomingItems`, `loading`, `loadingMore`, `hasMoreLive`, `error`, cursor refs. On mount / category change: run `getDocs(query(collection(db,'auctions'), where('status','==','live'), ...(category filter), orderBy('endsAt','asc'), limit(PAGE)))`, map via `mapAuctionDoc`, filter `isDisplayableLive`, set list + cursor (`snap.docs[snap.docs.length-1]`). `loadMore()` → `getDocs` with `startAfter(cursor)`, append, update cursor/hasMore (hasMore = returned PAGE docs). Same for a smaller upcoming query.
- New-drops detector: ONE `onSnapshot(query(auctions, where('status','==','live'), orderBy('createdAt','desc'), limit(1)))` → track `latestLiveCreatedAt`; expose `newDropsAvailable` via `hasNewerDrops(newestLoadedCreatedAt, latestLiveCreatedAt)` and a `refresh()` that re-runs the first page.
- Returns `{ liveItems, upcomingItems, loading, loadingMore, hasMoreLive, loadMore, newDropsAvailable, refresh, error }`.
- Reuse `serverNow()` for the `isDisplayableLive` now. Exclude simulated. No test (Firestore) beyond the Task-1 helpers it composes.
- Commit `feat(discover): paginated ending-soon feed hook + new-drops detector`.

### Task 4: Feature flag `enablePaginatedDiscover`
**Files:** `src/context/AppContext.tsx` (flag state/listener/interface), `src/utils/guestGate.ts` only if the flag helper lives there (it doesn't — inline like the others).
- Add `enablePaginatedDiscover` to: the `featureFlags` `useState` default (~428-434, **default `false`**), the `siteSettings/featureFlags` snapshot setter (~1221-1239, `enablePaginatedDiscover: data.enablePaginatedDiscover === true` — note: default-OFF, so use `=== true` not `!== false`), and the interface (~317-326). No new listener (rides the existing doc).
- Verify `featureFlags.enablePaginatedDiscover` is readable via `useApp()`.
- Commit `feat(discover): enablePaginatedDiscover flag (default off)`.

### Task 5: Wire the new path into `DiscoveryFeedView` (behind the flag)
**Files:** `src/components/DiscoveryFeedView.tsx`.
- Read `featureFlags.enablePaginatedDiscover` (via `useApp()`). When **false**: render EXACTLY today's path (untouched). When **true**: use `useDiscoverFeed()` for the lists (instead of the `useAuctions()`-derived `liveAuctionsList`/`upcomingAuctionsList`), render the same card grid + sections + empty/skeleton states, an infinite-scroll trigger (IntersectionObserver sentinel at the list end → `loadMore()`), and the **"new drops ↓" pill** (shown when `newDropsAvailable`, calls `refresh()`).
- Each `AuctionCard` in the new path additionally calls `useVisibleAuctionLive(item.id, isOnScreen)` (isOnScreen already computed at :73) and merges live fields over the paginated values (`mergeLiveIntoCard`) so the price/bids stay live while visible. Countdown already ticks via the shared ticker.
- Category chips in the new path drive `useDiscoverFeed`'s category (server re-query) instead of client filter. Search box: in Slice 1 keep it client-side over the loaded live items (Slice 2 replaces with Algolia) — or disable/hide it when flag on with a "search coming" note; prefer keeping client-filter over loaded items so nothing regresses.
- Do NOT touch the old path. Bilingual/RTL, reduced-motion, brand preserved.
- Commit `feat(discover): flag-gated paginated feed path with live-on-visible + new-drops pill`.

### Task 6: Firestore indexes
**Files:** `firestore.indexes.json`.
- Add composite indexes: `(status ASC, endsAt ASC)`, `(status ASC, category ASC, endsAt ASC)`, `(status ASC, scheduledStartAt ASC)`. `(status ASC, createdAt DESC)` already exists (backs the new-drops detector). Match the file's existing JSON shape.
- Commit `chore(discover): firestore indexes for ending-soon + category + upcoming`.

---

## Self-Review
Slice 1 is fully additive + flag-gated (default off) → zero prod risk; the current feed is the untouched fallback. Delivers a testable paginated ending-soon feed with live-on-visible + new-drops pill. Reuses the shared observer/ticker/serverNow patterns; no money/room/listener removal (Slice 1b). After Task 6: whole-branch review (opus+fable) → in-browser verify with the flag flipped on locally (paginated load, infinite scroll, visible cards update live + off-screen don't, new-drops pill, category re-query) → merge (flag stays OFF in prod until Slice 1b proves the removal). Then Slice 1b + Slice 2.
