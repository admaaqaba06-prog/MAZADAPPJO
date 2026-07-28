# Desktop bid card — button CTA + card-sized confirm

**Date:** 2026-07-28
**Status:** Approved
**Surface:** Desktop live auction room, right-panel bid card (Card 2)

## Problem

Two issues on the desktop bid card in `DesktopLiveAuctionLayout`:

1. **Swipe-to-bid is wrong for desktop.** A drag gesture on a mouse is friction, not
   confirmation. The component already had a click fallback, so most desktop users were
   clicking a control that visually instructs them to swipe.

2. **The bid confirmation covers the whole screen.** `BidConfirm` renders
   `absolute inset-0`, but neither the bid-card div (`#desktop-bid-panel`) nor its
   `<aside>` is positioned. The overlay therefore anchors to the root platform container
   (`h-[calc(100vh-64px)] … relative`, line 254) and blankets all three columns —
   video included. `WinningPill` has the identical bug despite its docstring claiming it
   "pops over the bid panel."

## Scope

`DesktopLiveAuctionLayout` only — the desktop branch of `LiveStreamView`. Mobile
(`MobileAuctionView` / `BidSheet`) never used `SwipeToBid` and is untouched.

## Design

### 1. Swipe bar → button

Replace `<SwipeToBid>` (line 1003) with a `<Pressable>` at an identical footprint —
full-width, `h-12`, `rounded-full`, same `#E85D04→#F37021` gradient — so the card layout
does not shift.

```
┌────────────────────────────────────┐
│  🔨   BID 25 JOD                   │   was: ⟩⟩ SWIPE TO BID 25 JOD ›››
└────────────────────────────────────┘
   Total if you win: 26.25 JOD (incl. 5% buyer's premium)
                    ⓘ Rules
```

`onClick → openConfirm(nextBidAmount)` — the exact handler the swipe track's click
fallback already used. `openConfirm` carries the guest→sign-in and blocked→ban-notice
guards, so no auth logic moves or is duplicated.

Consequences:

- The quick-bid chips already route through `setPendingBid`, so all four CTAs on the card
  now behave identically: stage an amount, then confirm.
- The direct-bid-without-confirm path (`runBid` fired by a completed swipe gesture) is
  gone on desktop. Every desktop bid now passes through `BidConfirm`. `runBid` itself
  stays — `handleConfirm` still calls it.
- `FirstBidCoach` copy ("👆 Tap to bid — you pay nothing unless you win") already reads
  correctly for a button; unchanged.
- The `totalWithPremium` note and the Rules affordance below the CTA are unchanged.

### 2. Confine the confirm to the card

Add `relative overflow-hidden` to the bid-card div (`#desktop-bid-panel`, line 757). The
overlay then resolves against the card and is clipped to its rounded corners.

`overflow-hidden` is safe: `FirstBidCoach` is `relative` and in-flow, and its only
absolutely-positioned child is a 2px arrow well inside the card bounds.

This one change also fixes `WinningPill`, which shares the `absolute inset-0` pattern.

### 3. Light variant for `BidConfirm`

`BidConfirm`'s default styling (`bg-black/85` + blur + white text) was built for the old
dark video-overlay context. Confined to a white card it would read as broken.

Add `variant?: 'dark' | 'light'`, **defaulting to `dark`**. The desktop card passes
`variant="light"`: white/95 + blur, orange border, `gray-900` / `gray-500` text, orange
"Bid now", gray "Cancel", `amber-600` price-moved copy.

Defaulting to `dark` means the other three consumers — `AuctionDetailsModal`, `BidSheet`
(mobile), `ReelsDesktopRightPanel` — keep their current appearance with no changes. The
existing `className` escape hatch still overrides the wrapper for both variants.

Untouched inside `BidConfirm`: the 10s auto-dismiss, hover-pause countdown, price-moved
re-prompt, and the one-shot `firedRef` confirm guard.

## Explicitly not doing

`SwipeToBid.tsx` and `SwipeToBid.test.ts` stay in the tree, unused. Its only other
importer, `ReelsDesktopRightPanel`, is imported into `DesktopFrame` but never rendered.
Keeping the file makes the change trivially reversible; deleting it can be a separate
cleanup.

## Verification

- `tsc` typecheck + production build.
- Full vitest suite. `SwipeToBid.test.ts` exercises exported pure helpers
  (`beginTapGesture` / `trackTapGesture` / `isTapGesture`) and keeps passing.
- This repo's vitest is node-only (no jsdom, no testing-library), so there is no component
  render test to add. Correctness here is visual.
- Customer-facing layout change → preview pass, MJ approves before merge.
