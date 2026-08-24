# App Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pre-launch Mazzado app performant and dummy-proof — stop the settlement revenue leak, stop re-login-on-reopen, make the browser Back button work, and fix the bidding-room UX/perf bugs.

**Architecture:** Six sequential waves, each its own PR (SDD: Fable implementer → review-package → Fable reviewer → fix → merge → CI deploy). Server `functions/index.js` stays the money source of truth; the client stops writing settlement state. A thin History-API layer + an `authReady` boot gate + pure helper utils (bid math, nav URL, server time, money format) carry the load. Waves 1/2/4/5 all edit the `AppContext.tsx` god-object → strict sequencing, each wave rebased on the prior merge.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind v4, Firebase (Firestore/Auth/Functions v1/Storage), Vitest. No React Router, no new deps.

## Global Constraints

- App **NOT launched** — no live data; no migration/backwards-compat needed.
- Bilingual **Arabic-default, RTL**; every new string in `ar`+`en` in `src/utils/translations.ts`, warm Jordanian register.
- **Server `functions/index.js` is the money source of truth** (increments, anti-snipe +15s, winner, order, `wonCount`, webhooks). Client must never compute/write settlement or money-authoritative state.
- JOD = 3-decimal (fils); premium rounds to whole fils and must equal the server order `totalDue` exactly.
- No React Router; no new dependencies.
- `useApp()` returns `any` (known debt) — do not "fix".
- Rules/functions/indexes deploy via CI "Deploy Firebase" on merge to main.
- Per wave verify: `npx tsc --noEmit` (0 errors) · `npm run build` · `npx vitest run` (all green). Every pure helper gets unit tests.
- Claude can't log into the authed app — each wave ends with a manual smoke list for MJ/colleague.
- SwipeToBid → delete. CliQ alias/QR → deferred (needs MJ data); build only copy-amount + protection line.

---

## Wave 0 — P0 correctness / money (ships first)

### Task 0.1: Shared premium-math helper + adopt everywhere

**Files:**
- Create/Modify: `src/utils/bidMath.ts` (add `totalWithPremium`)
- Test: `src/utils/bidMath.test.ts`
- Modify: `src/components/feedback/WinCelebration.tsx` (replace local `winTotalDue`), `src/components/feedback/BidConfirm.tsx:6-8` (delete `bidTotalWithPremium`, import helper), `src/components/MobileLiveAuctionLayout.tsx:898-899`, `src/components/AuctionDetailsModal.tsx:240-241`

**Interfaces:**
- Produces: `totalWithPremium(priceJod: number): number` — returns JOD total incl. 5% buyer premium, computed as `(fils + round(fils*0.05))/1000` where `fils = Math.round(priceJod*1000)`. Matches server order formula (`functions/index.js:177,1221`).

- [ ] **Step 1: Write failing tests** covering equality with the server double-round at tricky prices (e.g. 1.001, 12.345, 0.999, 47.25, whole dinars), asserting `totalWithPremium(x)` equals `(round(x*1000)+round(round(x*1000)*0.05))/1000`.
- [ ] **Step 2: Run** `npx vitest run src/utils/bidMath.test.ts` → FAIL (function missing).
- [ ] **Step 3: Implement** `totalWithPremium` in `bidMath.ts`.
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Replace** all four call sites (WinCelebration, BidConfirm, MobileLiveAuctionLayout, AuctionDetailsModal) with the helper; delete `bidTotalWithPremium`. Read each file first; keep display formatting unchanged.
- [ ] **Step 6: Verify** `npx tsc --noEmit && npm run build && npx vitest run` → all green.
- [ ] **Step 7: Commit** `fix(bid): single source-of-truth buyer-premium math`.

### Task 0.2: Delete client-side admin auto-end (revenue leak)

**Files:** Modify `src/components/LiveStreamView.tsx:293-308`

**Interfaces:** Consumes: nothing new. The `scheduledAuctionCloser` cron (`functions/index.js`) already owns the status flip + settlement.

- [ ] **Step 1:** Read `LiveStreamView.tsx:280-320` and confirm the admin branch that writes `updateDoc(auctionRef, { status: 'completed' })` on countdown-zero.
- [ ] **Step 2: Remove** that client-side status write entirely (the whole admin auto-end effect/branch). Leave a local "settling…" visual if one exists, but write NO status. Do not add a callable (out of scope; cron suffices).
- [ ] **Step 3: Verify** no other client path writes auction `status: 'completed'|'ended'` (grep). If found, remove/justify.
- [ ] **Step 4: Verify** `npx tsc --noEmit && npm run build && npx vitest run` → green.
- [ ] **Step 5: Commit** `fix(settlement): stop client-side admin auto-end orphaning wins`.

**Wave 0 smoke:** operator watches a lot end → within ~1 min an order appears, winner notified, `wonCount`++; confirm dialog "total if you win" equals the order total to the fil.

---

## Wave 1 — Session persistence

### Task 1.1: `authReady` boot gate

**Files:** Modify `src/context/AppContext.tsx` (state ~`:471`, `onAuthStateChanged` `:629`, user branch after `:849`, null branch after `:874`), `src/App.tsx:170,231-239`

**Interfaces:** Produces: `authReady: boolean` on the context (init `false` → `true` once `onAuthStateChanged` fully resolves in both branches).

- [ ] **Step 1:** Add `authReady` state (init `false`) + expose on context value + type.
- [ ] **Step 2:** Set `setAuthReady(true)` at the END of both the user branch (after the Firestore user-doc load, ~`:849`) and the null branch (~`:874`) of `onAuthStateChanged`.
- [ ] **Step 3:** In `App.tsx`, while `!authReady` render the existing "Loading Mazad…" fallback (`:231-239`); only render Landing/Login when `authReady && !isAuthenticated`.
- [ ] **Step 4: Verify** `npx tsc --noEmit && npm run build` → green (no unit test — integration behavior; covered by smoke).
- [ ] **Step 5: Commit** `fix(auth): gate boot on authReady so restored sessions don't flash Login`.

### Task 1.2: Explicit persistence

**Files:** Modify `src/services/firebase.ts:17`

- [ ] **Step 1:** After `getAuth(app)`, call `setPersistence(auth, browserLocalPersistence)` (import from `firebase/auth`); it's async — chain a `.catch` that console.warns, do not block init.
- [ ] **Step 2: Verify** build green.
- [ ] **Step 3: Commit** `fix(auth): set browserLocalPersistence explicitly`.

### Task 1.3: Soften duplicate-session logout

**Files:** Modify `src/context/AppContext.tsx:719-778`

- [ ] **Step 1:** Read the block. Replace the hard `signOut(auth)` (`:764`) + `setIsAuthenticated(false)` with a soft, dismissible notice (reuse `addNotification`/toast) — "you're signed in on another device". Keep all session-id bookkeeping and the phone-confirm `mazad_last_login_time` refresh (`:1956-1959`) intact.
- [ ] **Step 2: Verify** build + tests green.
- [ ] **Step 3: Commit** `fix(auth): soft-notice instead of force-logout on duplicate session`.

### Task 1.4: Domain config

**Files:** Modify `src/services/firebase.ts:7`

- [ ] **Step 1:** Set `authDomain` to the canonical serving domain `mazad-jo.com` (the `vercel.json` `/__/auth/*` rewrite to `mazadjoapp.firebaseapp.com` stays). Do NOT touch DNS/redirects (ops step, documented for MJ).
- [ ] **Step 2: Verify** build green.
- [ ] **Step 3: Commit** `chore(auth): authDomain = canonical serving domain`.

**Wave 1 smoke:** close tab, reopen → spinner then app (not Login); second-device sign-in → notice, not forced logout; Google sign-in still round-trips.

---

## Wave 2 — Navigation / History API

### Task 2.1: `navUrl` pure helper

**Files:** Create `src/utils/navUrl.ts` + `src/utils/navUrl.test.ts`

**Interfaces:** Produces: `serializeNav({view, auctionId?, modal?, modalParam?}) → string` (search string, `discovery`+no-modal → `''`); `parseNav(search: string) → {view, auctionId?, modal?, modalParam?}`. Scheme: `?view=<v>`, `?auction=<id>`, `?modal=<name>` (+ `&order=<id>` etc.). Must round-trip.

- [ ] **Step 1: Write failing tests:** round-trip for discovery(bare), `?view=wallet`, live+auction, `?modal=notifications`, `?modal=order&order=x`; ignore/normalize an `/__/auth` search.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using `URLSearchParams`; reuse `deepLink.ts` `?auction=` semantics.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(nav): navUrl serialize/parse helper`.

### Task 2.2: History-API sync layer in AppContext

**Files:** Modify `src/context/AppContext.tsx` (nav state `:433-434`, add effects), consume `navUrl.ts`

**Interfaces:** Consumes `serializeNav`/`parseNav`. On view-change/modal-open → `history.pushState(node,'',url)`; initial mount/deep-link → `replaceState`; single `popstate` listener applies `parseNav(location.search)` via setters WITHOUT pushing (close top modal first, else set view). Cosmetic state never pushes.

- [ ] **Step 1:** Read the current initial-routing effect (`App.tsx:153-161`) and the nav/modal state list (spec §2.4). Centralize a `navigate(node)` that sets state + pushState, and route existing setters through it (or wrap `setActiveView`).
- [ ] **Step 2:** Add the `popstate` listener (mount once) applying parsed state without re-pushing; `replaceState` the resolved node on first paint.
- [ ] **Step 3:** Ignore/normalize the Google `signInWithRedirect` callback URL (`/__/auth/*`) — don't route it as a view.
- [ ] **Step 4: Verify** `tsc && build && vitest` green.
- [ ] **Step 5: Commit** `feat(nav): History-API sync (pushState + popstate) for in-app back`.

### Task 2.3: Wire modals into history + fix footgun + share link

**Files:** Modify `src/context/AppContext.tsx` (modal state), `src/App.tsx` (modal hosts), `src/components/DesktopLiveAuctionLayout.tsx:328-335`, `src/components/LiveStreamView.tsx:414`

- [ ] **Step 1:** Encode the top-most open overlay (`showNotifications`, `showSubscriptionPrompt`, `reviewPromptOrderId`, Onboarding, `entered` gate, per-view `selectedLotDetailsId`/`selectedOrderId`/edit/withdraw/verification) in the pushed nav node so Back closes it first.
- [ ] **Step 2:** Replace `window.history.back()` (`DesktopLiveAuctionLayout.tsx:330`) with `setActiveView('discovery')`.
- [ ] **Step 3:** Fix `LiveStreamView.tsx:414` to copy `buildAuctionUrl(activeAuctionId, window.location.origin)` (from `deepLink.ts`).
- [ ] **Step 4: Verify** green.
- [ ] **Step 5: Commit** `fix(nav): modals close on Back; kill history.back footgun; fix share link`.

**Wave 2 smoke:** navigate several screens → Back reverses them; open modal → Back closes it; share live lot → link opens that lot; refresh a deep link → no 404; Google login callback routes correctly.

---

## Wave 3 — Bidding UX / dummy-proofing

### Task 3.1: Server-time helper + finish derived from live state

**Files:** Create `src/utils/serverTime.ts` + test; Modify `src/components/LiveStreamView.tsx:145-149,289-291,546`

**Interfaces:** Produces `setServerOffset(ms)` / `serverNow(): number` (returns `Date.now()+offset`); offset captured once from a server timestamp echo.

- [ ] **Step 1: Write failing tests** for `serverNow()` reflecting a set offset; `isAuctionFinished(auction, now)` → true when `status==='completed'` or `endTime<=now`, false when `endTime` is future (re-clears).
- [ ] **Step 2:** Implement `serverTime.ts` + an `isAuctionFinished` helper (colocate).
- [ ] **Step 3:** Replace the latched `hasFinishedInSession` with a derived check off `isAuctionFinished(activeAuction, serverNow())`; re-clear when `endTime` moves to the future (anti-snipe +15s). Countdown uses `serverNow()`.
- [ ] **Step 4:** Capture the offset once where auctions load (subscription) or via a lightweight server timestamp.
- [ ] **Step 5: Verify** green; **Commit** `fix(bid): server-time finish; unstick ended overlay on anti-snipe`.

### Task 3.2: Submitting/optimistic bid state

**Files:** Modify `src/components/MobileLiveAuctionLayout.tsx:401-413,867,884-895`

- [ ] **Step 1:** Add a `submitting` state; disable the bid button + "Bid Again" pill + show a spinner from tap through `await onBidExecute` resolve.
- [ ] **Step 2:** Apply optimistic price/"you're winning" UI immediately; reconcile on the subscription echo (CountUp smooths correction).
- [ ] **Step 3: Verify** green; **Commit** `fix(bid): submitting + optimistic state (no double-submit)`.

### Task 3.3: Pre-bid membership invite

**Files:** Modify `src/components/MobileLiveAuctionLayout.tsx` (bid control render, `:879`), `src/components/LiveStreamView.tsx:364-384`, consume `isMember`

- [ ] **Step 1:** At render, if not a member, the bid control becomes "انضم بـ ١ دينار للمزايدة" / "Join for 1 JD to bid" opening the subscription sheet — non-members never reach `BidConfirm`. Add `ar`/`en` strings.
- [ ] **Step 2: Verify** green; **Commit** `fix(bid): invite non-members before confirm, not after`.

### Task 3.4: Unify AuctionDetailsModal bid path

**Files:** Modify `src/components/AuctionDetailsModal.tsx:71-73,219-234`

- [ ] **Step 1:** Route its bids through the same shared handler as the reel (confirm + submitting + membership gate). Remove the instant single-tap bid.
- [ ] **Step 2: Verify** green; **Commit** `fix(bid): single bid entry path (details modal matches reel)`.

### Task 3.5: Per-reel countdown

**Files:** Modify `src/components/MobileLiveAuctionLayout.tsx:179`, `src/components/LiveStreamView.tsx:231-277`

- [ ] **Step 1:** Each `MobileAuctionReel` derives its own countdown from its `auction.endTime` (using `serverNow()`), instead of receiving the active lot's `timeLeftStr`.
- [ ] **Step 2: Verify** green; **Commit** `fix(bid): per-reel countdown`.

### Task 3.6: Recompute stale bid amount at confirm

**Files:** Modify `src/components/MobileLiveAuctionLayout.tsx:397`, `src/components/feedback/BidConfirm.tsx:20,42-46`

- [ ] **Step 1:** At confirm time, recompute from the latest `nextBidAmount`; if it moved, show "price moved — new min is X, bid that?" instead of sending a stale amount that the server rejects.
- [ ] **Step 2: Verify** green; **Commit** `fix(bid): refresh amount at confirm (no stale rejection)`.

**Wave 3 smoke:** non-member → Join CTA (no post-confirm rug-pull); double-tap → one bid; late final-second bid keeps room live; swiped reels show own timers.

---

## Wave 4 — Bidding performance + audio

### Task 4.1: Memoize reels + subscription lifecycle

**Files:** Modify `src/context/AppContext.tsx:1091-1095,1216,1248`, `src/components/MobileLiveAuctionLayout.tsx:236`, `src/components/LiveStreamView.tsx:113-142`

- [ ] **Step 1:** Keep the auctions `onSnapshot` mounted across live/discovery (remove `[activeView]` dependency; subscribe once).
- [ ] **Step 2:** `React.memo` `MobileAuctionReel` with a focused comparator (id, currentPrice, endTime, isActive, isMuted, isPlaying).
- [ ] **Step 3:** Isolate the 1s countdown into a small component so a tick doesn't re-render the room.
- [ ] **Step 4: Verify** green; **Commit** `perf(bid): memo reels + persistent subscription + isolated countdown`.

### Task 4.2: Reusable AudioContext + haptics

**Files:** Create `src/utils/auctioneerAudio.ts`; Modify `src/components/LiveStreamView.tsx:19-71,287`

- [ ] **Step 1:** One module-level `AudioContext`, resumed on first user gesture (iOS autoplay), reused for every tick; `playTick`/`playFinish` move here and stop calling `new AudioContext()` per tick.
- [ ] **Step 2:** Add `navigator.vibrate` haptics in the final-10s snipe window (guarded for unsupported).
- [ ] **Step 3: Verify** green; **Commit** `fix(bid): one reusable AudioContext + snipe-window haptics`.

**Wave 4 smoke:** reels don't re-render off-tick (React DevTools); ticks audible through the final second; phone vibrates in the last seconds.

---

## Wave 5 — Polish + lingering items

### Task 5.1: Money formatter (numerals + currency label)

**Files:** Create `src/utils/formatMoney.ts` + test; Modify `src/components/MobileLiveAuctionLayout.tsx:773,870,893,898`, `src/components/LiveStreamView.tsx:610,689`

**Interfaces:** Produces `formatMoney(jod: number, lang: 'ar'|'en'): string` — one locale-aware digit style + one canonical currency label (no more `JOD`/`JD`/`د.أ` mix).

- [ ] **Step 1: Failing tests** for grouping + label per language; **Step 2** implement; **Step 3** adopt at all cited sites; **Step 4** verify green; **Step 5** commit `fix(ui): one money formatter`.

### Task 5.2: Prominent unmute

**Files:** Modify `src/components/LiveStreamView.tsx:96`, `src/components/MobileLiveAuctionLayout.tsx:580-585` + strings

- [ ] Add a prominent one-tap "🔊 اضغط للصوت / Tap for sound" over the video on first play; verify; commit `fix(ui): prominent unmute`.

### Task 5.3: `hasLiveAuctions` includes upcoming + fallback list

**Files:** Modify `src/components/LiveStreamView.tsx:121-124,425-427,441`

- [ ] Empty-state gate counts `live`+`upcoming`; fallback list excludes `completed`/`ended`; verify; commit `fix(ui): upcoming counts as a live room; clean fallback`.

### Task 5.4: Lazy/sized images

**Files:** Modify `src/components/MobileLiveAuctionLayout.tsx:503-507,674-678`

- [ ] Add width/height + `loading="lazy"` to reel fallback image + chat avatars; verify; commit `perf(ui): lazy/sized images`.

### Task 5.5: Delete dead code

**Files:** Delete `src/components/feedback/SwipeToBid.tsx`; Modify `src/components/LiveStreamView.tsx:191-216`

- [ ] Confirm `SwipeToBid` has no importers (grep) → delete; remove the unused desktop `videoRef` plumbing dead on mobile (keep desktop path if still used — verify first); verify; commit `chore: remove SwipeToBid + dead video plumbing`.

### Task 5.6: Onboarding respects language

**Files:** Modify `src/components/OnboardingModal.tsx:9`

- [ ] Initialize from the global `language` instead of hardcoded `'ar'`; verify; commit `fix(ui): onboarding uses chosen language`.

### Task 5.7: Concierge category picker

**Files:** Modify `src/components/SellView.tsx:119` + strings

- [ ] Replace hardcoded `category:'Fashion'` with a 3-way picker matching `channel: phones|cars|misc` (required); verify; commit `fix(sell): concierge category picker`. (Coordinate with parked auth/KYC spec's SellView edits — rebase.)

### Task 5.8: Admin approval queue ordering + index

**Files:** Modify `src/context/AppContext.tsx:~1108`, `firestore.indexes.json`

- [ ] Add `orderBy('createdAt','desc')` to the admin approval-queue query + the composite index; verify build; commit `fix(admin): order approval queue + index (no stranding)`.

### Task 5.9: Discovery query cleanup (preserve seller-own-pending)

**Files:** Modify `src/components/DiscoveryFeedView.tsx` (feed query ~`:359-387`)

- [ ] Public grid queries only `['live','upcoming']`; the seller's own pending items shown via a separate targeted read (`createdById == me && status=='processing'`) so E1's "seller sees own pending in feed" is preserved (do NOT silently drop it); verify; commit `fix(feed): query live/upcoming; seller-own pending via targeted read`.

### Task 5.10: CliQ cheap dummy-proofing

**Files:** Modify `src/components/OrderDetailsView.tsx:962` + strings

- [ ] Add a copy button on the amount with "must match to the fil"; add a buyer-protection reassurance line at the pay step (disputes model exists, `firestore.rules:261`). Do NOT touch IBAN→alias/QR (deferred). Verify; commit `fix(pay): copy-amount + buyer-protection line`.

**Wave 5 smoke:** consistent digits/label on money screens; unmute obvious; upcoming-only room isn't "no live auctions"; onboarding matches chosen language; concierge item lands in the right admin bucket; pay panel amount copyable.

---

## Self-Review

**Spec coverage:** W0.1/0.2, W1.1–1.4, W2.1–2.3, W3.1–3.6, W4.1–4.2, W5.1–5.10 cover every spec section incl. lingering items. Documented-not-built (`/notifications` server move, CliQ alias/QR, DNS redirects) correctly excluded.

**Placeholder scan:** no TBD/"handle edge cases"; each task has files, concrete change, test-or-smoke, verify, commit. Pure helpers (bidMath, navUrl, serverTime, formatMoney) have real TDD; integration-heavy AppContext tasks use build+smoke (no unit harness for the god-object — honest, matches the codebase's no-test-on-AppContext reality).

**Type consistency:** `totalWithPremium` (0.1) reused in 3.x displays; `serverNow`/`isAuctionFinished` (3.1) reused in 3.5; `serializeNav`/`parseNav` (2.1) consumed by 2.2/2.3; `authReady` (1.1) consumed by App.tsx. Names consistent across tasks.
