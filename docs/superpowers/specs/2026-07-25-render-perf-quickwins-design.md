# Render Performance Quick-Wins (customer hot path)

**Date:** 2026-07-25
**Status:** Approved — behavior-preserving render optimizations from the front-end audit.
**Scope:** Reduce re-renders on the two customer hot screens — the live-auction view and the Discover feed — WITHOUT changing behavior, data, money/bidding, or visuals. (Compression was investigated and is already on — Vercel serves brotli — so it's NOT part of this.) The bigger Discover pagination/search redesign is a separate later effort.

## Objective

From the render audit: the context/PF architecture is already well-optimized, but two concrete hotspots remain during live bidding:
1. **Both auction layouts re-render ~3×/sec** — a full-subtree re-render every second from the `HH:MM:SS` countdown state living at the top of `MobileAuctionView` / `DesktopLiveAuctionLayout`, on top of the ~2×/sec bid-driven re-renders.
2. **The feed reconciles ~80 non-memoized `motion.div` card wrappers on every bid** (the memoized card inside bails out, but the motion wrappers don't), plus a couple of unmemoized O(N) filter passes per bid.

Fix both with isolation + memoization. Pure render optimizations — every screen looks and behaves identically; only wasted renders go away.

## Changes

### 1. Extract a `CountdownPill` leaf (isolate the per-second re-render)
- New `src/components/auction/CountdownPill.tsx`: a tiny leaf that owns its own 1s `setInterval` computing `timeLeft`/`ended` from `endTime` (+ the snipe-window red-pulse styling), and renders ONLY the pill. Props: `{ endTime, status, isAr, className? }` (+ whatever the existing pill markup needs). Reduced-motion safe.
- Remove the top-level `timeLeft`/`ended` (+ its interval) from **`MobileAuctionView.tsx`** (~106-132) and the `timeLeftStr` state (+ interval) from **`DesktopLiveAuctionLayout.tsx`** (~106-153); render `<CountdownPill …/>` where the pill was. The layouts no longer re-render every second — only the ~120-byte pill does.
- Preserve the exact visual (same format, same red-pulse-under-threshold, same reduced-motion behavior) and the PF7 primitive-keyed timing (key the interval on `id`/`endTime`/`status`, not object identity) so mid-snipe intervals don't tear down.

### 2. Feed — stop the ~80 motion reconciliations + unmemoized filters per bid
- In `src/components/DiscoveryFeedView.tsx`: the per-card `motion.div` wrappers (~787, ~829) allocate fresh `initial`/`animate`/`transition` object literals and reconcile every bid. Either wrap each card+motion in a memoized subcomponent whose props are reference-stable, OR replace the entrance `motion.div` with a lightweight keyed CSS fade-in (no per-bid framer work). The card's own `React.memo` already prevents inner re-render — this stops the *wrapper* churn.
- Memoize `getLiveAuctions(auctions)` (currently unmemoized at ~439) and ensure the two section `useMemo` filter passes (~353-376) are the only O(N) passes (they're fine memoized). No behavior change — same lists, same order.

### 3. Mobile auction — cheap memoizations
- In `MobileAuctionView.tsx`: `useMemo` `getAuctionMedia(activeAuction)` (~134) keyed on the media source, and `useMemo` the `chatMessages.filter(...)` (~137) keyed on `chatMessages` + `activeAuction.id`. Removes redundant work on each re-render.

## Constraints
- **Behavior-preserving:** identical visuals, identical countdown format/red-pulse/reduced-motion, identical live-price/bid updates, identical bidding flow. No money/callable/rules/data change.
- Bilingual + RTL preserved (the pill renders numerals `dir="ltr"`).
- Don't regress the desktop layout or the shared `MediaGallery`.

## Testing
- Existing suite stays green (509). The `CountdownPill` gets a tiny render/format assertion if the repo harness allows; otherwise the countdown format is covered by the in-browser check.
- **In-browser verification (I drive the app):** open a live test auction — the countdown ticks correctly, the price/bids still update live on incoming bids, the red pulse under threshold still works, reduced-motion still calm; the feed scrolls smoothly during live updates. Confirm no visual/behavior change vs before. Both languages.
- **Re-measure** the auction-view re-render cadence (React DevTools Profiler if reachable, or reasoning from the isolation) to confirm the layout no longer re-renders every second.

## Non-Goals
- No Discover pagination/search change (separate effort).
- No deep restructuring of how `liveAuctions` is passed (the audit's fuller `React.memo`-the-whole-layout idea is entangled with the array-identity-per-bid issue — deferred to the pagination refactor, which changes that data flow anyway).
- No bundle changes (recharts/motion trims) this pass.
