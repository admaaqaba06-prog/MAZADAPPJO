# Live-Room UX + Post-Win Flow + Performance — Design Spec

**Date:** 2026-07-22
**Status:** Approved (MJ's three concerns: load performance, media covered by bid UI + no gallery, post-win flow pushes browsing instead of payment)

## Goals

1. **Post-win = payment-first.** The winner's post-auction UX must drive straight to
   completing payment (amount + 24h deadline + one obvious CTA), not "browse other
   auctions".
2. **Media deserves its own space.** The bid interface must not cover the media; media
   becomes a swipeable gallery (video + multiple photos).
3. **Performant under load.** Fix the highest-impact client perf issues found by the
   audit; measure the real single-doc bid-contention ceiling with a stress test.

## Global constraints

- Bilingual Arabic-default RTL; new strings in `ar`+`en` in `translations.ts`, warm
  register. Mobile-first (mid-range Android).
- Server `functions/index.js` stays the money source of truth; no client settlement
  writes. No new deps unless the audit justifies one (prefer none).
- Per wave: `npx tsc --noEmit` 0 · `npm run build` · `npx vitest run` green; unit tests
  for new pure helpers.
- App NOT launched — no migration concerns, but changes must not regress the shipped
  simulator/E2E flows (bot, settle, cleanup).

---

## Wave 1 — Post-win payment-first flow

**Files:** `src/components/LiveStreamView.tsx` (the `AuctionCountdownLayer` ended/winner
card), `src/components/feedback/WinCelebration.tsx`, `src/utils/translations.ts`

- The room's "Auction Ended" card currently shows WINNER + winning bid + a single
  "Browse other auctions" CTA — even when the viewer IS the winner.
- **When `currentUser.id === auction.currentBidderId` (the viewer won):**
  - Headline: "مبروك! 🎉 ربحت المزاد" / "Congratulations — you won!"
  - Show the REAL total due (use the shared `totalWithPremium` helper) + "ادفع خلال ٢٤
    ساعة" / "pay within 24h".
  - Primary CTA: "أكمل الدفع" / "Complete payment" → route to My Orders / the order
    details view for this auction (order id == auction id; if the order isn't settled
    yet — cron lag ≤60s — route to My Orders which will show it when it lands, with a
    short "finalizing your order…" state rather than a dead end).
  - Secondary (subtle): browse other auctions.
- **When the viewer lost / is a spectator:** keep the current card (winner name + browse
  CTA) unchanged.
- **De-duplicate end-of-auction UI:** `WinCelebration` (the "Pay now" modal keyed on the
  status→completed transition) and the ended card can both appear. Rule: WinCelebration
  remains the celebratory moment; the ended card must not fight it — if WinCelebration is
  showing, the ended card defers (or the two are merged so only one surface shows for the
  winner). Pick the simplest arrangement that guarantees the winner ALWAYS sees exactly
  one payment-first surface.
- Test: pure helper for the winner-check + amount formatting if extracted; rest is smoke.

## Wave 2 — Media gallery + uncovered media area

**Files:** `src/components/MobileLiveAuctionLayout.tsx`,
`src/components/DesktopLiveAuctionLayout.tsx`, new
`src/components/feedback/MediaGallery.tsx`, `src/types.ts`, `src/context/AppContext.tsx`
(`createListing`), `src/components/ListingWizardView.tsx`, `src/utils/translations.ts`

### 2a. Data model
- Add `mediaUrls?: string[]` to `AuctionItem` — ordered gallery images (excludes video).
- Gallery source order: `videoUrl` (if any) first, then `thumbnailUrl`, then
  `mediaUrls`/`conciergePhotos` (dedupe thumbnail). Build a pure helper
  `getAuctionMedia(auction) → {type:'video'|'image', url}[]` (unit-tested) used by both
  layouts.
- **Wizard multi-photo upload:** extend `ListingWizardView` to accept up to 4 photos
  (cover + 3 more), uploading extras to the same storage path pattern and writing
  `mediaUrls`. Concierge already collects extra photos → ALSO write them to `mediaUrls`
  (keep `conciergePhotos` for the admin queue, or alias — don't break the admin badge
  flow). The simulator's `simulateSpawnAuction` should populate 2–3 placeholder
  `mediaUrls` so galleries are testable.

### 2b. Layout
- **Mobile reel:** media pane gets a FIXED region (roughly upper ~55–60% of the reel)
  with the bid panel BELOW it — controls never overlay the media. Swipe horizontally
  within the media pane to move between gallery items (video plays in-place; images
  lazy). Dots indicator + item counter ("2/4"). Vertical swipe between lots must still
  work — horizontal gesture must not fight the vertical snap scroll (use touch-action /
  axis-locking; the reviewer will check this).
- **Desktop:** media column shows the gallery with arrows + thumbnails strip; bid panel
  stays in its own column/region (already mostly separate — verify no overlay remains).
- Countdown/urgency overlays (final-seconds, LIVE badge, viewer count) may still sit on
  the media edge as small chips — but price/tiers/swipe-to-bid/confirm all live OUTSIDE
  the media box.
- The coach mark, confirm dialog, and win overlays anchor to the bid panel region, not
  the media.

## Wave 3 — Performance (audit-driven)

**Files:** per audit findings (expected: `src/context/AppContext.tsx` context split or
value memoization, lazy imports, media sizing)

- Take the perf audit's P0s + cheap P1s and implement them. Known candidates (confirm
  against the audit): memoize/split the AppContext value so per-second state doesn't
  re-render every consumer; lazy-load heavyweight views; image `srcset`/sizing; kill any
  off-screen intervals/animations.
- **Contention stress test (controller-run, not a subagent):** from the authenticated
  browser session, fire N parallel `simulateBid` calls (e.g. 30–50) at one simulated
  auction via the callable endpoint; record success/retry/latency distribution; document
  the practical single-lot bidding ceiling in `docs/PERFORMANCE.md` along with the audit
  verdict and the future mitigation path (bid queue / sharding) if ever needed.
- Acceptance: measurable improvement (fewer re-renders on tick — verified by reasoning +
  React profiler where possible), no behavior change, all tests green.

## Sequencing

W1 (small, high-value) → W2 (the big UX change) → W3 (perf fixes after the audit lands).
Each wave its own PR via SDD on Fable. The stress test runs alongside W3.

## Risks

- W2 gesture conflict (horizontal gallery swipe vs vertical reel snap) — the classic
  footgun; must be explicitly tested on mobile.
- W1 order-not-yet-settled window (cron ≤60s): the winner CTA must not dead-end.
- W3 context refactor is the riskiest perf change (touches everything) — only do the
  scope the audit justifies; behavior-preserving.
