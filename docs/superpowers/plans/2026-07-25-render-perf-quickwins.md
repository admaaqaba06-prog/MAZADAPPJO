# Render Perf Quick-Wins Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Behavior-preserving render optimizations on the auction view + Discover feed (from the audit). Spec: `docs/superpowers/specs/2026-07-25-render-perf-quickwins-design.md`.

## Global Constraints
- Behavior/visuals IDENTICAL (countdown format, red-pulse under threshold, reduced-motion, live price/bid updates, bidding flow). No money/callable/rules/data change.
- Bilingual + RTL preserved; numerals `dir="ltr"`.
- After each task: `npx tsc --noEmit` 0 + `npm test` (baseline 509).
- Customer-facing → in-browser verify before merge.

### Task 1: CountdownPill leaf — isolate the per-second re-render
- Create `src/components/auction/CountdownPill.tsx`: leaf owning its own 1s interval computing timeLeft/ended from `endTime`; renders ONLY the pill (same markup/format/red-pulse-under-~12s as today); reduced-motion safe; interval keyed on primitives (id/endTime/status) not object identity (PF7 pattern). Props `{ endTime, status, isAr, className? }` + any pill-markup needs.
- READ the current pill in `MobileAuctionView.tsx` (~106-132 state + where the pill renders) and `DesktopLiveAuctionLayout.tsx` (~106-153 `timeLeftStr` + pill). Move that exact markup into CountdownPill. REMOVE the top-level countdown state + interval from BOTH layouts; render `<CountdownPill .../>` in place. The layouts must no longer re-render every second.
- Verify: tsc 0, tests 509. Confirm both layouts render the same pill, no top-level per-second state remains. Commit `perf(auction): isolate countdown into a leaf so layouts don't re-render every second`.

### Task 2: Feed — kill ~80 motion reconciliations + memoize filters per bid
- In `DiscoveryFeedView.tsx`: the per-card entrance `motion.div` wrappers (~787, ~829) reconcile every bid with fresh object literals. Replace the entrance animation with a lightweight KEYED CSS fade-in (a `.card-fade-in` class + `@keyframes`, reduced-motion safe) OR a memoized wrapper with stable props — the card's own `React.memo` stays. No visual change (same fade-in on mount).
- Memoize `getLiveAuctions(auctions)` (~439, currently unmemoized). Leave the two section `useMemo`s (~353-376) as-is (already memoized).
- Verify: tsc 0, tests 509; feed still shows the same two sections/order and card entrance. Commit `perf(feed): keyed CSS card entrance + memoized live filter (stop ~80 motion reconciles/bid)`.

### Task 3: Mobile auction — cheap memoizations
- In `MobileAuctionView.tsx`: `useMemo` `getAuctionMedia(activeAuction)` (~134) keyed on the media source (e.g. activeAuction.id + videoUrl + mediaUrls), and `useMemo` `chatMessages.filter(...)` (~137) keyed on `chatMessages` + `activeAuction.id`.
- Verify: tsc 0, tests 509. Commit `perf(auction): memoize mobile media + chat filter`.

## Self-Review
Covers the audit's top render hotspots (countdown 1/sec re-render, feed motion churn, mobile redundant work). All behavior-preserving. After T3: whole-branch review + in-browser verify (countdown ticks, live updates, red pulse, feed smooth) → merge.
