# Live Auction Experience Redesign — Design

Date: 2026-07-24
Status: Approved direction; pending spec review → implementation plan.

## Problem

Feedback from MJ on the live-auction/bidding UX (desktop + mobile), with reference
screenshots from Whatnot and TikTok Shop live:

1. **Desktop "phone box" falls below the fold.** The center media frame is sized
   `height: calc(100vh - 64px)` at `aspect-[9/16]`, so the media alone consumes the
   full viewport height and shoves the product-info row + bid controls below the fold;
   the portrait ratio also leaves large empty side-gutters.
2. **Large prices cram.** Quick-bid chips and the current-bid block aren't sized for
   6–7 digit values (e.g. `500,000`).
3. **Bid feels slow.** No optimistic update: `runBid` awaits the callable, then waits
   for the Firestore transaction → `onSnapshot` echo before the price moves (300ms–1s+
   of "did it work?" dead air).
4. **Mobile is cluttered.** One portrait screen crams badge, title, seller, share/
   expand, price, timer, top-bidder, quick-bids, swipe-to-bid, history, AND chat.
5. **Anti-snipe is weak.** Current rule (in `applyBidWrites`): a bid with <10s remaining
   extends by 15s. MJ wants a stronger, visible soft-close.

## Non-goals

- No live *video streaming* infrastructure. Media = the existing uploaded video/image
  per lot (portrait). This is a layout/interaction redesign only.
- No change to the money-path bid validation, pricing, escrow, or settlement logic
  beyond the anti-snipe window value + making it per-auction configurable.
- Desktop is NOT re-conceived — MJ is fine with the centered vertical view; only two
  fixes (fit-above-fold, remove expand).

## Design DNA (from the references)

Full-bleed portrait media with four overlaid layers, simplified from Whatnot/TikTok:
- **Top scrim:** seller avatar + name + verified + Follow (leading) · LIVE pill +
  viewer count + close (trailing).
- **Floating chat:** semi-transparent messages that fade up over the lower-middle of
  the media, incl. "X joined" / "X is winning" system lines. **Kept** — MJ likes it.
- **Right rail, trimmed:** Share, Save, Details only. (Drop Whatnot Clip/Wallet and
  TikTok gift/rose/emoji.)
- **Bottom bid dock (hero):** compact pinned card:
  - status line: `● [top bidder] is winning · last bid X`
  - product row: thumbnail · title · condition/tags · **big current price** (trailing)
  - **urgency countdown**: `MM:SS`, turns red + pulses in the final 30s (the ☠️ timer)
  - **primary `Bid: [next]` tap** + secondary **Custom** (opens amount entry).
    Chosen over swipe-to-bid and the 3 quick-bid tiers for a one-action dock.

## Components & changes

### 1. `src/utils/bidFormat.ts` (new) — number formatting
- `compactJod(n)`: `500000 → "500K"`, `1500000 → "1.5M"`, `< 1000 → "500"`. For chips
  and tight labels.
- Keep full `toLocaleString()` for the primary current-bid number, wrapped in a
  `tabular-nums` span so digits don't jitter during CountUp.
- Unit-tested (thresholds, rounding, Arabic-safe — digits only, caller adds JOD/د.أ).

### 2. Optimistic bid paint (shared)
- Add a shared **optimistic overlay** in `AppContext` (or a small `useOptimisticBid`
  hook) keyed by `auctionId`: `{ price, bidderId, bidderName, at }`.
- On confirm: set the overlay immediately (price = staged next amount, bidder = me),
  play CountUp, append a synthetic "you" row to bid history.
- `activePrice` / top-bidder / history readers prefer the overlay when it is newer than
  the doc's `currentPrice`; when the listener echoes an equal-or-higher value the
  overlay clears (reconciled).
- On failure (`res.success === false`): clear the overlay + revert (existing toast).
- Never let the overlay show a price the server rejected — overlay is display-only;
  the authoritative `nextBidAmount` still derives from doc state for the NEXT bid.

### 3. Mobile — `MobileLiveAuctionLayout.tsx` (redesign)
- Full-bleed media container (`100dvh` minus the docked bottom bar; use `dvh` +
  `env(safe-area-inset-*)` so it works with the PWA standalone + the fixed tab bar).
- Top scrim, floating chat (reuse existing chat), trimmed right rail, bottom bid dock
  per Design DNA.
- Remove the framed "phone box" and the in-media expand button.
- Bid dock uses `useBidFlow` + the optimistic overlay; primary `Bid: [next]`.

### 4. Desktop — `DesktopLiveAuctionLayout.tsx` (constrain, don't redesign)
- Media frame: cap so **media + product-info row + bid rail all fit within
  `calc(100vh - 64px)`** — i.e. media height = viewport − header − info-row − gaps
  (derive width from the 9:16 ratio off the *constrained height*), no page scroll.
- **Remove the expand/fullscreen button** entirely.
- Apply compact price formatting + optimistic paint here too.

### 5. Anti-snipe soft-close + per-auction config (money-path)
- `functions/settlement.js`: add `resolveAntiSnipe(auctionData)` → `{ windowMs, extendMs }`,
  default **30s / 30s**, clamped to sane bounds (window 5–120s, extend 5–120s). One
  unit-tested source of truth (mirrors the payment-window pattern).
- `functions/index.js applyBidWrites`: replace the hardcoded `<10000 → +15000` with
  "if remaining < window, set endsAt = now + extend" (reset-to-30s soft close, not
  additive), reading the per-auction values.
- `AuctionDropBuilderView`: optional anti-snipe preset (Off / 15s / 30s / 60s), default
  30s; carried through relist. Admin-gated; seller self-serve pinned to default in
  `firestore.rules` (same denylist pattern as `paymentWindowHours`).
- Urgency countdown UI (both layouts) turns red + pulses inside the window so the
  extension is visible.

## Rollout / safety

- **Customer-facing layout change** → build on `feat/live-auction-redesign`, deploy the
  Vercel preview, and get MJ's eyes on mobile + desktop BEFORE any merge (per the
  "visual changes need MJ's eyes" rule).
- Money-path pieces (optimistic paint invariants, anti-snipe) get a cross-model
  adversarial review before merge (per repo pattern).
- Phasing so value lands incrementally and risk stays isolated:
  - **P1 (feel, low visual risk):** bidFormat + optimistic paint + anti-snipe backend/
    config. Shippable behind the existing UI.
  - **P2 (mobile redesign):** the big visual — preview-gated.
  - **P3 (desktop fit-above-fold + remove expand):** preview-gated.
- Tests: unit for bidFormat + resolveAntiSnipe + optimistic reconcile logic; existing
  463-test suite stays green; typecheck + build clean.

## Open questions (non-blocking)

- Right-rail "Save" vs "Follow seller" — confirm which during P2 build against live data.
- Whether the desktop right bid-rail stays as-is or mirrors the mobile dock styling
  (cosmetic; decide at P3).
