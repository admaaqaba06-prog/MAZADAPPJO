# Mobile Auction Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the mobile TikTok-Live-style auction reel (`MobileLiveAuctionLayout.tsx`, 1375 lines) with a calm **product-drop page** (`MobileAuctionView`) — autoplay media + tap-expand, one price/time/bids block, a single Place-Bid sheet (quick + custom amount + premium), working chat, activity toasts, real data — and fix the chat bug so comments actually render.

**Architecture:** New focused `MobileAuctionView` (composed of small subcomponents) drops into the `isMobile ?` switch in `LiveStreamView` with the SAME prop interface the reel used. Reuse `MediaGallery`, `useBidFlow`, `bidMath`, `feedback/*`, `useChat`/`sendChatMessage`, `useToast`. No change to `placeBid`, callables, Firestore rules, or money logic.

**Tech Stack:** React 19 + TS, Tailwind, `motion/react`, Vitest. Firestore listeners already in `AppContext` (auctions + chats).

## Global Constraints

- **Visual contract:** `docs/superpowers/specs/2026-07-25-mobile-auction-approved-mockup.html` (MJ-approved enriched Direction A). Match its layout/hierarchy/feel. Read it before building UI.
- **Bilingual, RTL-native** (Arabic is primary): every string in both `ar`+`en`; RTL layout correct; `dir="ltr"` on prices/timers/numerals. Follow the app's existing `isAr ? … : …` pattern.
- **Brand:** orange `#F05123`, ink `#0A0A0A`, off-white, `font-alexandria`/`font-ibmarabic`. No palette/font change.
- **Real data only** — never render fabricated fields. `location`/`shipping` do NOT exist on `AuctionItem` → do not show them. `condition` (`'new'|'used'`) is optional → show only if set. "Inspected by Mazad" badge = `approvalStatus === 'approved'`.
- **No money/backend change:** bid goes through the existing `onBidExecute` (=`executeBid` → `placeBid`) unchanged; no new optimistic layers; no rules/callable edits. `totalWithPremium` (5%) unchanged.
- **Reuse, don't duplicate:** mobile MUST use `useBidFlow` (no bespoke confirm copy). One per-page countdown timer (today's screen runs ~4).
- **a11y/perf:** autoplay + animations gated behind `useReducedMotion()` (from `motion/react`) — reduced-motion users get a static first frame + play button, no auto-advance/toasts-motion. Fewer listeners/timers than today.
- Customer-facing → after the build I verify **in-browser** (real live test auction, mobile viewport, both languages) before merge. After each task: `npx tsc --noEmit` (0) + `npm test` (baseline 506).

**Exact APIs (from recon — use verbatim):**
- **Drop-in props** `MobileAuctionView` must accept (same as `MobileLiveAuctionLayoutProps`, `MobileLiveAuctionLayout.tsx:35-64`): `liveAuctions, activeAuctionId, onSelectAuction, activeAuction, activePrice, isMuted, isPlaying, onMuteToggle, onPlayPauseToggle, onShareClick, onSaveToggle, onLikeToggle, isSaved, activeComments, activeActivities, commentText, setCommentText, onCommentSubmit, nextBidAmount, onBidExecute, currentUser, language, isAr, onOpenDetails, videoRef, videoContainerRef, showToast, onClose`.
- **`useBidFlow(execute)`** → `{ isMember, isGuest, requestSignIn, pendingBid, submitting, startBid, confirmBid, cancelBid }`; `execute:(amount:number)=>Promise<{success,message}|void>`; plus pure `resolveConfirm(pendingAmount, latestMin)`.
- **`MediaGallery`** props: `items: AuctionMediaItem[]` (from `getAuctionMedia(auction)` in `utils/auctionMedia.ts`; each `{type:'video'|'image', url}`), `isActive`, `isPlaying`, `isMuted`, `isAr`, `showArrows`, `showThumbnails`, `videoRef`, `onVideoClick`. No expand exists (Task 3 adds it).
- **`bidMath`:** `minNextBid(currentPrice, minIncrement, totalBids)`, `totalWithPremium(priceJod)` (5%), `isViewerWinner(auction, userId)`.
- **Chat:** `useApp().sendChatMessage(text)` writes to `chats`; `useChat()` → `{chatMessages,setChatMessages}`. Messages typed `ChatMessage` (`types.ts:195-206`). Guest gate = `!isAuthenticated` → `requestSignIn()`.
- **Toasts:** `useToast()` → `showToast({title, message?, type:'success'|'info'|'warn'})` (`feedback/Toast.tsx`).
- **Reduced motion:** `import { useReducedMotion } from 'motion/react'`.
- **Auction fields** (`types.ts`): `title, description, category, condition?('new'|'used'), currentPrice, minIncrement, endTime, duration, totalBids, currentBidderId, currentBidderName, reserveMet?, approvalStatus?('approved'…), videoUrl, thumbnailUrl, mediaUrls?[]`.
- **Chat bug:** `activeAuctionId` inits to `'auction-rolex'` (`AppContext.tsx:614`); auto-select guarded by `!activeAuctionId` (`LiveStreamView.tsx:378`) never fires; `sendChatMessage` writes `auctionId: activeAuctionId||'auction-rolex'` (`AppContext.tsx:3286`) and the listener queries the same (`:1746-1752`) so it round-trips, but render filter `chatMessages.filter(m=>m.auctionId===activeAuction.id)` (`LiveStreamView.tsx:474`) drops it because `activeAuction.id` ≠ `'auction-rolex'`.

---

### Task 1: Pure helpers + tests

**Files:** Create `src/utils/auctionBid.ts` + `src/utils/auctionBid.test.ts`.

**Interfaces:**
- Produces: `validateCustomBid(amount: number, minNext: number): { ok: true; amount: number } | { ok: false; reason: 'too_low' | 'invalid' }`; `resolveActiveAuctionId(activeAuctionId: string | null | undefined, liveAuctions: {id:string}[]): string | null` — returns `activeAuctionId` if it matches a live lot, else `liveAuctions[0]?.id ?? null` (the real active id, single source of truth for chat).

- [ ] **Step 1: failing tests** — `auctionBid.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateCustomBid, resolveActiveAuctionId } from './auctionBid';
describe('validateCustomBid', () => {
  it('accepts amount >= minNext', () => { expect(validateCustomBid(2200, 2200)).toEqual({ ok: true, amount: 2200 }); expect(validateCustomBid(2500, 2200)).toEqual({ ok: true, amount: 2500 }); });
  it('rejects below minNext', () => { expect(validateCustomBid(2100, 2200)).toEqual({ ok: false, reason: 'too_low' }); });
  it('rejects NaN / non-positive', () => { expect(validateCustomBid(NaN, 2200)).toEqual({ ok: false, reason: 'invalid' }); expect(validateCustomBid(0, 100)).toEqual({ ok: false, reason: 'invalid' }); });
});
describe('resolveActiveAuctionId', () => {
  const lots = [{ id: 'a' }, { id: 'b' }];
  it('keeps a matching id', () => expect(resolveActiveAuctionId('b', lots)).toBe('b'));
  it('falls back to first live lot when id does not match (e.g. placeholder)', () => expect(resolveActiveAuctionId('auction-rolex', lots)).toBe('a'));
  it('handles empty', () => { expect(resolveActiveAuctionId('auction-rolex', [])).toBe(null); expect(resolveActiveAuctionId(null, lots)).toBe('a'); });
});
```
- [ ] **Step 2:** run → fail. `cd <worktree> && npx vitest run src/utils/auctionBid.test.ts`
- [ ] **Step 3: implement** `auctionBid.ts`:
```ts
export function validateCustomBid(amount: number, minNext: number):
  { ok: true; amount: number } | { ok: false; reason: 'too_low' | 'invalid' } {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid' };
  if (amount < minNext) return { ok: false, reason: 'too_low' };
  return { ok: true, amount };
}
export function resolveActiveAuctionId(
  activeAuctionId: string | null | undefined,
  liveAuctions: { id: string }[]
): string | null {
  if (activeAuctionId && liveAuctions.some(a => a.id === activeAuctionId)) return activeAuctionId;
  return liveAuctions[0]?.id ?? null;
}
```
- [ ] **Step 4:** run → pass. **Step 5:** `git add src/utils/auctionBid.ts src/utils/auctionBid.test.ts && git commit -m "feat(auction): pure helpers — custom-bid validation + active-auction-id resolution"`

---

### Task 2: Fix the chat comment-not-rendering bug

**Files:** Modify `src/components/LiveStreamView.tsx` (+ `src/context/AppContext.tsx` if needed).

The member's comment writes but is filtered out because write/listener key on the placeholder `activeAuctionId` while the render filter keys on the real `activeAuction.id`. Make them consistent using `resolveActiveAuctionId` (Task 1).

- [ ] **Step 1** — READ `LiveStreamView.tsx:370-390` (auto-select + `activeAuction` resolution) and `:470-478` (the comment filter), and `AppContext.tsx:3282-3303` (`sendChatMessage`) + `:1742-1767` (chat listener). Confirm the recon's diagnosis.
- [ ] **Step 2** — Make the **real active id** the single source of truth. Preferred fix: in `LiveStreamView`, compute `const realActiveId = activeAuction?.id ?? null;` and ensure `activeAuctionId` is corrected to it — either (a) an effect that calls `setActiveAuctionId(activeAuction.id)` whenever `activeAuction` is set and `activeAuctionId !== activeAuction.id` (so the write in `sendChatMessage` and the AppContext listener both use the real id), or (b) if `setActiveAuctionId` isn't available here, change the comment FILTER at `:474` AND `sendChatMessage`'s `auctionId` AND the listener query to all use `resolveActiveAuctionId(activeAuctionId, liveAuctions)`. Pick the smallest change that makes write id === listener id === filter id. Do NOT change `firestore.rules`.
- [ ] **Step 3** — Verify the render filter (`activeComments`) will now include a message the current member just sent (write id matches filter id).
- [ ] **Step 4** — `npx tsc --noEmit` 0; `npm test` (existing chat/deeplink tests still pass). If a pure helper was added, it's Task 1's (already tested).
- [ ] **Step 5** — commit: `git add -p`-style stage ONLY the touched files; `git commit -m "fix(auction): member comments now render — align chat write/listener/filter to the real active auction id"`

---

### Task 3: MediaGallery — expand-to-fullscreen + auto-advance photos

**Files:** Modify `src/components/feedback/MediaGallery.tsx` (add expand + optional auto-advance), or add a thin wrapper if cleaner.

- [ ] **Step 1** — READ `MediaGallery.tsx` fully. Add two capabilities behind new optional props (keep existing desktop callers working — default off): `expandable?: boolean` (default false) — renders a small ⤢ button; tapping opens a fullscreen overlay showing the current item (image zoomable via pinch/double-tap or a simple fit-to-screen; video plays with sound-toggle), closable. `autoAdvancePhotos?: boolean` (default false) — when the current item is an image and `isActive`, auto-advance to the next media every ~4s (pause on manual swipe/interaction); NEVER auto-advance under `useReducedMotion()`.
- [ ] **Step 2** — Gate both new behaviors so existing desktop/reel usage (props default false) is byte-unchanged. Fullscreen overlay is a portal/fixed layer with a close (X) and respects `isAr` direction.
- [ ] **Step 3** — `tsc` 0; `npm test` (existing `MediaGallery` behavior unaffected). Add a minimal render/interaction assertion if the repo has a test harness for it; otherwise rely on the in-browser verify.
- [ ] **Step 4** — commit `feat(media): MediaGallery expand-to-fullscreen + opt-in photo auto-advance (reduced-motion safe)`

---

### Task 4: `MobileAuctionView` — page scaffold, media, header, info block

**Files:** Create `src/components/MobileAuctionView.tsx` (+ small subcomponents in the same file or `src/components/auction/`); modify `src/components/LiveStreamView.tsx` (swap the mobile branch).

- [ ] **Step 1** — Create `MobileAuctionView` with the EXACT drop-in prop interface (copy `MobileLiveAuctionLayoutProps` field list from Global Constraints). Layout per the mockup (frame 1): a vertically scrollable page (not a reel), sticky top bar (back/close `onClose`, share `onShareClick`), then:
  - **Media** via `<MediaGallery items={getAuctionMedia(activeAuction)} isActive isPlaying={isPlaying} isMuted={isMuted} isAr={isAr} videoRef={videoRef} onVideoClick={onPlayPauseToggle} expandable autoAdvancePhotos />` (autoplay on open, expand, auto-advance — Task 3). A small "Video · m:ss" / photo-dots indicator (MediaGallery already shows dots).
  - **Title + trust chips:** `activeAuction.title`; **"Inspected by Mazad ✓"** chip when `activeAuction.approvalStatus === 'approved'` (ar: "مفحوص من مزادو ✓"); category chip; condition chip only if `activeAuction.condition` set.
  - **Bid block:** `Current bid` = `activePrice` via `CountUp`; `Ends in` = a single countdown from `activeAuction.endTime` (ONE `setInterval`, cleaned up); `# bids` = `activeAuction.totalBids`; sub-row: reserve-met (from `reserveMet`) + top bidder (`currentBidderName`). `dir="ltr"` on numerals.
- [ ] **Step 2** — In `LiveStreamView.tsx:662`, replace the mobile branch `isMobile ? <MobileLiveAuctionLayout …/>` with `<MobileAuctionView …/>` passing the identical props. Leave `DesktopLiveAuctionLayout` untouched. Lazy-import consistent with the existing pattern.
- [ ] **Step 3** — Reduced-motion: `const reduce = useReducedMotion();` gate autoplay/auto-advance/toast-motion. Under reduce, media shows first frame + play button.
- [ ] **Step 4** — `tsc` 0; `npm test` 506. (Place Bid + chat are stubbed/next tasks — render a placeholder Place Bid button + a "chat below" anchor for now, or fold Tasks 5-6 in immediately; keep the app compiling.)
- [ ] **Step 5** — commit `feat(auction): MobileAuctionView scaffold — media + info block, wired into LiveStreamView`

---

### Task 5: Place-Bid sheet (quick + custom amount + premium)

**Files:** Modify `src/components/MobileAuctionView.tsx` (+ a `BidSheet` subcomponent).

- [ ] **Step 1** — Sticky bottom **"Place Bid — <minNext> JOD"** button (minNext = `minNextBid(activeAuction.currentPrice, activeAuction.minIncrement, activeAuction.totalBids)`). Tapping opens a bottom `BidSheet` (mockup frame 2).
- [ ] **Step 2** — `BidSheet`: quick-step chips (`minNext`, `minNext+inc`, `minNext+2·inc`), an **"enter amount"** field validated with `validateCustomBid(amount, minNext)` (Task 1) — show inline error on `too_low`/`invalid`; the **premium total** `totalWithPremium(chosen)` ("Total if you win … incl. 5%"); a Confirm button.
- [ ] **Step 3** — Wire through `useBidFlow(onBidExecute)`: destructure `{ isMember, isGuest, requestSignIn, pendingBid, submitting, startBid, confirmBid, cancelBid }`. Tapping a quick chip / confirming custom → `startBid(amount)` (runs guest→signup / membership / photo gate); render `BidConfirm` on `pendingBid`; confirm → `confirmBid(amount)`; disable while `submitting`. Show `WinningPill`/`FirstBidCoach` from `feedback/*` as the current layouts do. NO new optimistic layer (the parent `executeBid`/`onBidExecute` already handles it).
- [ ] **Step 4** — `tsc` 0; `npm test` 506 + Task 1 tests. Confirm the bid path calls `onBidExecute` with the chosen amount, identical to today.
- [ ] **Step 5** — commit `feat(auction): Place-Bid sheet — quick steps + custom amount + premium via useBidFlow`

---

### Task 6: Chat section + working composer + activity toasts

**Files:** Modify `src/components/MobileAuctionView.tsx` (+ a `ChatSection` subcomponent).

- [ ] **Step 1** — A **Chat / comments** section lower on the page (mockup frame 3), NOT overlaid on media: header ("Chat" + presence), message list from `activeComments` (system/bid rows styled distinctly), and a composer bound to `commentText`/`setCommentText`/`onCommentSubmit` (existing props — the send path, now fixed in Task 2). Guest → the existing `requestSignIn()` gate (`isGuest`); signed-in member → working input. (Verify a member can post — Task 2 makes it render.)
- [ ] **Step 2** — **Activity toasts** via `useToast()` `showToast(...)`: when a new bid lands (watch `activeActivities`/`activePrice` change) fire a compact `info` toast ("🔥 <name> just bid <amt>"); on the viewer being outbid fire a `warn` toast; on reserve-met a `success` toast. Debounce so rapid bids don't spam (one per ~2s). Gate motion under reduced-motion (still show, just no animation).
- [ ] **Step 3** — `tsc` 0; `npm test` 506.
- [ ] **Step 4** — commit `feat(auction): chat section (working composer) + activity toasts`

---

### Task 7: Details/seller + remove the old reel + cleanup

**Files:** Modify `src/components/MobileAuctionView.tsx`; remove/retire `src/components/MobileLiveAuctionLayout.tsx`; modify `LiveStreamView.tsx`.

- [ ] **Step 1** — Details/seller section (mockup): description (`activeAuction.description`), condition (if set), ref/auction id, and a seller card (real seller fields + `onSaveToggle`/save state; open seller modal via existing handler if wired). Do NOT render location/shipping (not on the type — no fake).
- [ ] **Step 2** — Remove the now-unused `MobileLiveAuctionLayout` import/usage from `LiveStreamView`. DELETE `MobileLiveAuctionLayout.tsx` **only if** nothing else imports it (grep first — its test `MobileLiveAuctionLayout.test.ts` tests `areReelPropsEqual`; if that memo helper is gone, remove/retire the test too; if kept elsewhere, leave). If unsure, leave the file unreferenced and note it rather than risk a broken import.
- [ ] **Step 3** — Grep for orphaned imports/props after the swap; remove zero-reference dead code only (confirm via grep).
- [ ] **Step 4** — `tsc` 0; `npm test` (green; adjust/remove only tests tied to deleted reel internals, note in report).
- [ ] **Step 5** — commit `feat(auction): details/seller section + retire the mobile reel`

---

## Self-Review

**Spec coverage:** product page (T4) ✓; autoplay/auto-advance/expand media (T3+T4) ✓; one price/time/bids block, single timer (T4) ✓; Place-Bid sheet quick+custom+premium via useBidFlow (T5) ✓; working chat + the bug fix (T2+T6) ✓; activity toasts (T6) ✓; inspected badge via approvalStatus + real data, no fake location/shipping (T4/T7) ✓; remove reel clutter (T7) ✓; bilingual/RTL, reduced-motion, no money change (Global) ✓. Desktop deferred (Non-Goal) ✓.

**Placeholder scan:** pure helpers (T1) + the chat fix (T2, exact root cause/location) are complete; UI tasks reference the in-repo mockup as the visual contract and the exact named APIs from Global Constraints (drop-in props, useBidFlow, MediaGallery, bidMath, useToast, getAuctionMedia) — no invented identifiers.

**Type consistency:** `MobileAuctionView` prop names === `MobileLiveAuctionLayoutProps`; `useBidFlow` return names (`startBid`/`confirmBid`/`cancelBid`), `bidMath`/`validateCustomBid`/`resolveActiveAuctionId` signatures match across tasks.

**After T7:** whole-branch review (opus + fable) → fix wave → **in-browser verification** (mobile viewport, both languages, real live test auction: autoplay, expand, bid via sheet, post a comment [bug fixed], toasts, RTL) → merge. Then the separate Sell-flow gallery-upload fix.
