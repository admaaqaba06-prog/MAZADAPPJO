# Mobile Auction Screen Redesign — "Product Drop Page"

**Date:** 2026-07-25
**Status:** Approved (design via visual companion — enriched Direction A), pending implementation plan
**Scope:** The **mobile** live-auction / bidding screen. Replace the TikTok-Live-style reel (`MobileLiveAuctionLayout.tsx`, 1375 lines) with a calm, focused product-drop page. Desktop (`DesktopLiveAuctionLayout`) is **out of scope** for this pass (follow-up). Approved mockup: `docs/superpowers/specs/2026-07-25-mobile-auction-approved-mockup.html`.

## Objective

MJ: the bidding/auction screen is "cluttered, doesn't work, not easy to use" — **worst on mobile.** Ground truth established: Mazad JO auctions are **not** live video streams — they're time-boxed **drops** with an **uploaded video + photos** of the item ("live" = the drop is currently open). The current mobile screen borrows the entire Whatnot/TikTok-*Live* interaction model (full-bleed reel, chat-over-video, action rail, "tap for sound", snap-scroll between lots, a dense stacked bid dock) for something that isn't live. That mismatch is the clutter.

MJ reviewed two simplified directions and chose **Direction A (a clean product page)**, then asked to fold back in the good "alive" cues from the current page. This spec implements that enriched Direction A.

## Approved design (enriched Direction A)

Tapping a lot in Discover opens a **scrollable product page** (no swipe-between-lots reel). Top-to-bottom:

1. **Media (top).** The uploaded **video autoplays** (muted, looped) on open; **photos auto-advance** in the gallery; **tap to expand** to a fullscreen zoomable viewer. Swipe/dots to move through media manually. A small "Video · 0:42" / photo-dots indicator. (Reuse the existing `MediaGallery` which already owns play/pause/mute + swipe — drive it in autoplay mode; add expand.)
2. **Title + trust chips** — item title, and prominently an **"Inspected by Mazad ✓"** badge (MJ flagged this as a key value prop), plus category + condition chips (from **real** auction fields — not the current hardcoded "NEW / Free Delivery / Amman").
3. **One bid block** — big **Current bid**, **Ends-in** countdown, **# bids**; a sub-row with reserve-met status + top bidder. Clear hierarchy, one place.
4. **Primary action: one "Place Bid — <next min> JOD" button** pinned at the bottom. Tapping opens a **bid sheet**: quick-step chips (+inc, +2·inc, +5·inc or similar) **AND a custom-amount field** (enter any valid amount), the **buyer's-premium total** ("Total if you win … incl. 5%"), and Confirm. One consistent flow via the shared `useBidFlow` hook + `bidMath`.
5. **Details / Seller** — condition, description, ref, seller card (real data), below the fold.
6. **Chat / comments (working).** A real chat section lower on the page (NOT overlaid on the media): activity + buyer↔seller Q&A, with a **working composer** — the current one is broken ("can't write a comment"); this must let a signed-in member post. Guests get the signup CTA (existing gate).
7. **Mini activity toasts** — non-intrusive "🔥 Sara just bid", "You've been outbid", "Reserve met" notifications that blip in over the media without hijacking the screen (reuse the existing toast host).

**Removed from mobile:** the snap-scroll reel navigation, the TikTok action rail (Like/Save/Share/Specs/Chat toggle stack), chat overlaid on the video, the "tap for sound" full-screen prompt, and the redundant `AuctionDetailsModal` quick-bid grid (its content folds into the page's details + the single bid sheet).

## Architecture

- **New `src/components/MobileAuctionView.tsx`** (product page) replaces `MobileLiveAuctionLayout` as the mobile branch in `LiveStreamView` (`LiveStreamView.tsx:662-721`, the `isMobile ?` switch). Composed of small focused subcomponents (media, bid block, bid sheet, details, seller, chat) — not one 1000-line function.
- **Reuse, don't reinvent:** `MediaGallery` (autoplay/gallery/expand), `useBidFlow` (the shared gate→confirm→submit state machine — mobile must use THIS, not a bespoke copy), `bidMath` (`minNextBid`/`totalWithPremium`/`isViewerWinner`), the `feedback/*` components (`BidConfirm`, `WinningPill`, `CountUp`, `useToast`, `FirstBidCoach`), the existing chat context (`useChat`) + composer, `guestGate`'s `resolveBidGate`.
- **Bid action = one path.** Mobile uses `useBidFlow` → `placeBid` (`AppContext.placeBid`, unchanged — no callable/rules/money-logic change). Do NOT add new optimistic layers; keep the existing `LiveStreamView.executeBid` optimism (one layer).
- **Real data.** Read condition/location/shipping/description/media from the auction doc; delete the hardcoded literals. Missing fields degrade gracefully (hide the row, never show fake).
- **Real-time.** Reuse the existing `auctions` `onSnapshot` (price/time/bids/winner from the doc) and the `chats` `onSnapshot` (already gated to `activeView==='live'`). No new heavy listeners. Consolidate the per-second countdown to **one** timer for the page (the current screen runs ~4).
- **Chat fix.** Investigate why the composer can't post (likely a gating/handler bug); fix so a signed-in member's message writes to `chats` and appears. Guests → signup gate (unchanged).
- Desktop layout untouched this pass; the same product-page model can be ported to desktop later (noted follow-up).

## Testing

- **Pure logic already covered** (`bidMath`, `useBidFlow`/`resolveConfirm`, `guestGate`, `optimisticBid`) — reuse; add cases only if new helpers appear (e.g. a custom-amount validator: rejects < min-next, non-numeric, over some sane cap).
- **A custom-bid-amount validator** (`validateCustomBid(amount, minNext)`) as a pure tested helper.
- **Chat composer:** a focused test/verification that a member submit calls the send path (the fix).
- **Manual + in-browser (hard gate):** I can now drive the real app in-browser — verify on a real live test auction, mobile viewport, **both languages**: video autoplays, photos auto-advance, tap-expand works, price/time/bids correct, Place Bid sheet (quick + custom + premium) places a bid via the real flow, chat posts a comment (the bug fixed), toasts appear, inspected badge shows, no reel/action-rail/overlay clutter, RTL native. Guest path still gates to signup. MJ approves the preview before merge.

## Non-Goals (YAGNI)

- **Desktop auction layout** — unchanged this pass (follow-up: port the same product-page model).
- **The Sell/listing flow's image upload** (camera-only → allow gallery + multiple photos) — a **separate** screen and a separate small fix; tracked as its own follow-up, NOT in this spec.
- No change to `placeBid`, the callable, Firestore rules, escrow/settlement, or any money logic — this is a UI/UX reorganization of the bidding *surface*.
- No live-video-streaming features (there is no live host).
- No new business rules (reserve, premium %, increments unchanged).

## Constraints

- Preserve brand (orange `#F05123` / ink / off-white, `font-alexandria`/`font-ibmarabic`).
- **Bilingual, RTL-native** — Arabic is the primary language; every string bilingual, layout correct in RTL, `dir="ltr"` on prices/timers/numerals.
- Performance: fewer timers/listeners than today; autoplay respects `prefers-reduced-motion` (no autoplay/animation for those users — show a play button + static first frame).
- Customer-facing → preview-gated; verified in-browser against the mockup before merge.
