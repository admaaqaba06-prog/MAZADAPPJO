# App Hardening Pass — Correctness, Session, Navigation, Bidding UX + Performance

**Date:** 2026-07-21
**Status:** Approved (MJ) — grounded in three independent Fable investigations (nav/URL, session, bidding)
**Relationship to other specs:** Separate from `2026-07-21-auth-expansion-kyc-groundwork-design.md` (parked, awaiting MJ review). Both touch AppContext's auth flow; **this pass ships first**, the auth/KYC pass rebases on top.

## Goal

Make the app performant and dummy-proof: stop a live revenue leak, stop users being
logged out on every reopen, make the browser Back button work, and fix the bidding-room
UX/perf bugs that risk mis-bids or a dead room — plus the lingering items from prior
reviews.

## Global constraints

- Bilingual **Arabic-default, RTL**. New strings in both `ar`/`en` in `translations.ts`,
  warm Jordanian register.
- No React Router, no new deps. React 19 + Vite + TS + Tailwind v4 + Firebase only.
- The **server `placeBid`/closer transaction in `functions/index.js` is the source of
  truth** for money, increments, anti-snipe, winner. The client must never compute or
  write settlement/money state authoritatively.
- JOD is 3-decimal (fils). All premium/total math rounds premium to whole fils and must
  match the server order exactly.
- `useApp()` returns `any` (known debt) — do not "fix" here.
- Rules/functions changes deploy via the CI "Deploy Firebase" workflow on merge to main.
- Verify each wave: `npx tsc --noEmit` (0 errors) · `npm run build` · `npx vitest run`
  (all green). Add unit tests for every pure helper introduced (premium math, nav
  URL (de)serialization, `isProfileComplete`-style predicates, server-time offset).
- Claude cannot log into the authed app; each wave lists the manual smoke MJ/colleague
  runs post-deploy.

---

## Wave 0 — P0 correctness / money (ships first)

**Files:** `src/components/LiveStreamView.tsx`, `src/components/feedback/BidConfirm.tsx`,
`src/components/feedback/WinCelebration.tsx`, `src/components/MobileLiveAuctionLayout.tsx`,
`src/components/AuctionDetailsModal.tsx`, (optionally `functions/index.js`)

### 0.1 — Kill the client-side admin auto-end (revenue leak)
`LiveStreamView.tsx:293-308` writes `updateDoc(auctionRef, { status: 'completed' })`
directly from the browser when the countdown hits 0 and the viewer is an admin. The
server closer only settles auctions in `['active','live','upcoming']`
(`functions/index.js:44, 89-92`); order creation + `wonCount` + FCM + `auction_won`/
`payment_due` webhooks live only inside that closer transaction (`index.js:152-246`). A
client flip to `completed` makes the closer skip the lot → **no order, no payment
request, no winner notification, winner never charged**; buyer sees "Pay now" and lands
on an empty orders view (`handleWinPay`, `LiveStreamView.tsx:167-175`).
- **Fix:** delete the client-side auto-end write entirely. Let `scheduledAuctionCloser`
  (1-min cron, already fixed per B1) own the status flip and settlement.
- **If a faster visual close is wanted:** the client may show an "ending…/settling"
  state locally, but MUST NOT write `status`. (Optional, only if MJ wants it: a
  `closeAuctionNow` callable that runs the *same* settlement transaction server-side —
  not a bare status write. Default: don't build it; the cron is enough.)

### 0.2 — One buyer's-premium formula (single source of truth)
Two divergent formulas exist. Correct (double-round at fils, matches server order
`index.js:177,1221`): `winTotalDue` in `WinCelebration.tsx:12-15`. Wrong (single-round
×1.05, diverges by a fil off whole-dinar prices): `bidTotalWithPremium`
(`BidConfirm.tsx:6-8`), `MobileLiveAuctionLayout.tsx:898-899`, `AuctionDetailsModal.tsx:240-241`.
- **Fix:** export `winTotalDue` (rename to a neutral name, e.g. `totalWithPremiumFils` /
  `totalWithPremium`, in a shared `utils/bidMath.ts`), unit-test it against the server
  formula across tricky prices (non-multiple-of-20 fils), and call it from BidConfirm,
  MobileLiveAuctionLayout, AuctionDetailsModal, and WinCelebration. Delete
  `bidTotalWithPremium`. The pre-commit "you'll pay X" must equal the order `totalDue`.

**Smoke:** operator watches a lot end → order appears, winner notified, `wonCount`++;
confirm dialog's "total if you win" matches the order's total to the fil.

---

## Wave 1 — Session persistence (stop the re-login-every-time)

**Files:** `src/services/firebase.ts`, `src/context/AppContext.tsx`, `src/App.tsx`

### 1.1 — `authReady` boot gate (primary fix)
Root cause: `isAuthenticated` starts `false` (`AppContext.tsx:471`) and `App.tsx:170`
renders Landing/Login whenever `!isAuthenticated` — but `isAuthenticated` only flips true
*after* the async `onAuthStateChanged` chain (token result + Firestore `getDoc`) finishes
(`AppContext.tsx:629→849/870`). So every reopen shows Login for seconds while Firebase is
restoring a session that already exists → users re-login.
- **Fix:** add `authReady` boolean state (init `false`), set `true` at the END of the
  `onAuthStateChanged` callback in BOTH the user branch (after `:849`) and the null branch
  (after `:874`). In `App.tsx`, while `!authReady` render the existing "Loading Mazad…"
  fallback (`App.tsx:231-239`); only fall through to Landing/Login once
  `authReady && !isAuthenticated`.

### 1.2 — Explicit persistence
`setPersistence` is never called; the SDK default (`indexedDBLocalPersistence`) works but
is brittle. Call `setPersistence(auth, browserLocalPersistence)` in `firebase.ts` right
after `getAuth` (`:17`) (belt-and-suspenders for environments where IndexedDB is
unavailable).

### 1.3 — Soften the duplicate-session auto-logout
`AppContext.tsx:719-778` hard-calls `signOut(auth)` (`:764`) when local `mazad_session_id`
differs from the Firestore `sessionId`. It's guarded (grace/rate-limit/fail-open) and
only fires cross-device, but it will keep logging out a WhatsApp/mobile audience that hops
devices.
- **Fix:** replace the hard `signOut` with a soft, dismissible "you're signed in on
  another device" notice, OR scope it so it never fires on the normal restore path. Keep
  the session-id bookkeeping. Do not regress the phone-confirm fix (`:1956-1959`).

### 1.4 — Domain unification (config + ops)
`authDomain: "mazadappjo.vercel.app"` (`firebase.ts:7`) ≠ the serving domain
`mazad-jo.com`; apex/www/.vercel.app are separate origins with separate IndexedDB login
state, so returning via a different hostname = fresh login.
- **Code:** set `authDomain` to the canonical serving domain; keep the existing
  `vercel.json` `/__/auth/*` rewrite to `mazadjoapp.firebaseapp.com`.
- **Ops (MJ/colleague, browser-driven — documented, not code):** pick apex `mazad-jo.com`
  canonical, 301-redirect `www` + `.vercel.app` to it, ensure all WhatsApp links use that
  one hostname. Add Firebase Auth authorized domain if needed.
- **Note (environmental, no fix):** WhatsApp in-app WebView + iOS Safari ITP can evict
  IndexedDB across launches — some true re-logins are unavoidable; the fixes above remove
  the *code-caused* ones.

**Smoke:** close the tab, reopen → land on the app (spinner, then in), not Login. Sign in
on a second device → first device shows a notice, not a forced logout.

---

## Wave 2 — Navigation / History API (fix the Back button)

**Files:** `src/context/AppContext.tsx`, `src/App.tsx`, `src/utils/deepLink.ts` (+ new
`src/utils/navUrl.ts` + test), `src/components/DesktopLiveAuctionLayout.tsx`,
`src/components/LiveStreamView.tsx`

Root cause: routing is 100% in-memory (`activeView`/`activeAuctionId`,
`AppContext.tsx:433-434`); no `pushState`/`replaceState`/`popstate` anywhere, so the
browser stack holds only the pre-app entry and Back exits.

### 2.1 — History-API sync layer (the fix)
- **URL scheme** (query-param, extends existing `deepLink.ts`): `?view=<activeView>`
  (`discovery` = bare `/`), auction detail reuses `?auction=<id>` (so live =
  `/?view=live&auction=<id>`), modals = `?modal=<name>` (+ `&order=<id>` etc.).
- New `navUrl.ts`: pure `serializeNav({view, auctionId, modal}) → search string` and
  `parseNav(search) → {view, auctionId, modal}`. Unit-tested round-trip.
- In AppContext: on **view change / modal open** → `history.pushState(node, '', url)`; on
  **initial mount / deep-link entry** → `replaceState` (no phantom entry); cosmetic state
  (toasts, countdowns, language) never pushes.
- One `popstate` listener reads `event.state`/`parseNav(location.search)` and calls the
  setters WITHOUT pushing again → Back walks the in-app stack. Close top modal first if
  present, else change view.

### 2.2 — Delete the footgun
`DesktopLiveAuctionLayout.tsx:328-335` calls `window.history.back()` (exits app because no
app entry exists). Replace with `setActiveView('discovery')` (or, once 2.1 lands, a
`history.back()` that now resolves in-app).

### 2.3 — Fix the broken share link
`LiveStreamView.tsx:414` copies `window.location.href` (which lacks `?auction=` during
normal nav → copies the homepage). Use `buildAuctionUrl(activeAuctionId,
window.location.origin)` (util already exists).

### 2.4 — Wire modals into history (mobile Back closes overlays)
Encode the top-most open overlay in the pushed state so hardware/gesture Back closes it
instead of exiting. Enumerated overlays: `showNotifications`, `showSubscriptionPrompt`,
`reviewPromptOrderId`, Onboarding, the landing→login `entered` gate, and per-view
`selectedLotDetailsId`/`selectedOrderId`/edit/withdraw/verification modals.
- **Edge cases:** `replaceState` the resolved node on first paint; landing = root, Enter/
  login = `pushState` (Back returns to landing, not exit); the Google
  `signInWithRedirect` callback URL (`/__/auth/*`) must be ignored/normalized by the nav
  layer (don't route it as a view); deep-link + unauthenticated preserves current behavior
  (`App.tsx:170-179`). No Vercel change (the `/(.*)→/` rewrite already covers it).

**Smoke:** navigate several screens → Back walks them in reverse; open a modal → Back
closes it; share a live lot → link opens that lot; refresh a deep link → no 404.

---

## Wave 3 — Bidding UX / dummy-proofing

**Files:** `src/components/LiveStreamView.tsx`, `src/components/MobileLiveAuctionLayout.tsx`,
`src/components/AuctionDetailsModal.tsx`, `src/components/feedback/BidConfirm.tsx`,
`src/context/AppContext.tsx`, new `src/utils/serverTime.ts` (+ test)

### 3.1 — Server-time-based finish (unstick the "Auction Ended" overlay)
`hasFinishedInSession` latches true when the *client* clock hits 0
(`LiveStreamView.tsx:289-291`), reset only on auction change (`:145-149`); the ended/winner
overlay renders off it (`:546`). A fast/lagged handset hits 0 while the server auction is
still live; anti-snipe extends `endTime` +15s (`index.js:668-669`) and the subscription
pushes it, but the overlay stays stuck on a live lot for the whole session.
- **Fix:** derive "finished" from live state (`status==='completed'` OR
  `endTime <= serverNow`), re-clearing if `endTime` moves back into the future. Add
  `serverTime.ts`: capture the server/client skew once (from a `serverTimestamp` echo or
  the auction docs) and expose `serverNow()`. Countdown + gating track `serverNow()`, not
  `Date.now()`.

### 3.2 — Submitting/optimistic bid state (no double-submit)
`confirmBid` (`MobileLiveAuctionLayout.tsx:401-413`) clears the overlay then awaits the
callable with no disabled/spinner state; the bid button (`:884-895`) and "Bid Again" pill
(`:867`) are live during the 1–3s round-trip → double-tap → duplicate bid (server
rate-limit/duplicate-guard reject it, but the user gets a confusing rejection).
- **Fix:** a `submitting` state disables the button + shows a spinner from tap through
  resolve; apply optimistic price/"you're winning" UI immediately, reconcile on the
  subscription echo (CountUp already smooths a correction).

### 3.3 — Pre-bid membership invite (stop the rug-pull)
No bid path checks membership before `BidConfirm`; non-members see "confirm — you'll pay
X", tap confirm, THEN get a toast + subscription modal simultaneously
(`AppContext.tsx:2602-2610`, `LiveStreamView.tsx:379-381`).
- **Fix:** know membership at render; for non-members the bid control becomes an inviting
  "انضم بـ ١ دينار للمزايدة" / "Join for 1 JD to bid" CTA that opens the subscription
  sheet BEFORE any confirm. Non-members never reach `BidConfirm`.

### 3.4 — Unify the second bid entry point
`AuctionDetailsModal.tsx:71-73, 219-234` bids on a single tap — no confirm, no membership
check, no double-submit guard, its own countdown (`:53`). Route it through the same shared
bid handler as the reel (confirm + submitting + membership gate).

### 3.5 — Per-reel countdown
`LiveStreamView.tsx:231-277` computes one `timeLeftStr` for the active auction and passes
it to every `MobileAuctionReel` (`MobileLiveAuctionLayout.tsx:179`), so swiped reels show
the active lot's time. Each reel derives its own countdown from its `auction.endTime`.

### 3.6 — Recompute stale bid amount at confirm
`handleLocalBid` captures `nextBidAmount` (`MobileLiveAuctionLayout.tsx:397`); if outbid
during the ≤5s confirm window (`BidConfirm.tsx:20,42-46`) the stale amount is rejected.
Recompute from the latest `nextBidAmount` at confirm, or show "price moved — new min is X,
bid that?" instead of a raw rejection.

**Smoke:** non-member taps bid → sees Join CTA, not a post-confirm rug-pull; double-tap
places one bid; a late bid in the final seconds keeps the room live (no stuck overlay);
swiped reels show their own timers.

---

## Wave 4 — Bidding performance + audio reliability

**Files:** `src/components/MobileLiveAuctionLayout.tsx`, `src/components/LiveStreamView.tsx`,
`src/context/AppContext.tsx`, new `src/utils/auctioneerAudio.ts`

### 4.1 — Stop re-rendering the whole room every tick
The auctions `onSnapshot` depends on `[activeView]` (`AppContext.tsx:1091-1095,1248`) →
full re-subscribe + video-URL re-resolution on every view change; each snapshot rebuilds
the whole `auctions` array (`:1216`) and the 1s countdown re-renders `LiveStreamView`;
`MobileAuctionReel` (`:236`) is not memoized, so every reel (incl. off-screen) re-renders
each second and each write.
- **Fix:** keep the auctions subscription mounted across live/discovery (don't key on
  `activeView`); `React.memo` the reel with a focused comparator (id, currentPrice,
  endTime, isActive, isMuted, isPlaying); isolate the 1s countdown into a small component
  so a tick doesn't re-render the room.

### 4.2 — One reusable AudioContext + haptics
`playTick`/`playFinish` (`LiveStreamView.tsx:19-71`) `new AudioContext()` every call, never
`close()`; in the final-10s window the browser context cap is hit, `new AudioContext()`
throws, the `catch` swallows it → urgency ticks go SILENT exactly when they matter.
- **Fix:** `auctioneerAudio.ts` holds one module-level `AudioContext`, resumed on first
  user gesture (iOS autoplay), reused for every tick. Add `navigator.vibrate` haptics for
  the snipe window (audio is muted-by-default anyway).

**Smoke:** DevTools shows reels not re-rendering off-tick; ticks audible through the final
second; phone vibrates in the last seconds.

---

## Wave 5 — Polish + lingering items (from this + prior reviews)

**Files:** across `MobileLiveAuctionLayout.tsx`, `LiveStreamView.tsx`, `OnboardingModal.tsx`,
`DiscoveryFeedView.tsx`, `AdminDashboardView.tsx`, `SellView.tsx`, `translations.ts`,
`firestore.indexes.json`

- **5.1 Numeral + currency consistency.** Prices use `toLocaleString()` with no locale
  (Western digits in Arabic UI) and the label flips between `JOD`/`JD`/`د.أ` on one
  screen (`MobileLiveAuctionLayout.tsx:773,870,893,898`, `LiveStreamView.tsx:610,689`).
  One shared money formatter (locale-aware digits + one canonical currency label); apply
  everywhere on the money surfaces.
- **5.2 Prominent unmute.** `isMuted` starts true (`LiveStreamView.tsx:96`); unmute is a
  tiny top-bar icon. Add a prominent one-tap "🔊 اضغط للصوت / Tap for sound" over the
  video on first play.
- **5.3 `hasLiveAuctions` includes `upcoming`.** Empty-state gate only counts `'live'`
  (`LiveStreamView.tsx:425-427,441`) so an upcoming-only room shows "No live auctions";
  and the fallback list includes `completed/ended` (`:121-124`). Fix both.
- **5.4 Lazy/sized images.** Reel fallback image + chat avatars
  (`MobileLiveAuctionLayout.tsx:503-507,674-678`) lack width/height + `loading="lazy"`.
- **5.5 Remove dead code.** `LiveStreamView` desktop `videoRef` plumbing unused on mobile
  (`:191-216`); `SwipeToBid.tsx` unused — adopt (a swipe-to-bid is more dummy-proof) or
  delete. Decision: delete unless MJ wants swipe-to-bid; note in the plan.
- **5.6 Onboarding respects chosen language.** `OnboardingModal.tsx:9` hardcodes
  `useState('ar')` + its own toggle; initialize from the global `language`.
- **5.7 Concierge category picker.** Concierge submit hardcodes `category:'Fashion'`
  (`SellView.tsx:119`); add a 3-way picker matching `channel: phones|cars|misc` so the
  admin queue is pre-triaged. (Coordinate with the auth/KYC spec's SellView changes.)
- **5.8 Admin approval queue ordering.** The queue subscribes with `limit(100)` and NO
  `orderBy` (`AppContext.tsx:~1108`) → past 100 auctions a fresh `processing` listing can
  fall outside the window and strand from buyers AND admin. Add
  `orderBy('createdAt','desc')` + the composite index in `firestore.indexes.json`.
- **5.9 Discovery query.** It includes `'processing'` in the `where in` then filters
  client-side (wasted `limit(80)` budget + a refactor away from a leak). Query only
  `['live','upcoming']` for the public grid; the seller's own pending items are shown via
  a separate targeted read (`createdById == me && status=='processing'`) so E1's
  "seller sees own pending in feed" is preserved — do NOT silently drop that behavior.

**CliQ money-moment (partial — needs MJ input):** the pay panel showing IBAN with no
copy-amount button and screenshot-only is fragile. Cheap dummy-proofing to include:
a **copy button on the amount** (`OrderDetailsView.tsx:962`) with "must match to the fil",
and a **buyer-protection reassurance line** at the pay step (a disputes model exists,
`types.ts:292`, `firestore.rules:261`). **Deferred pending MJ's data:** replacing IBAN
with the CliQ **alias/QR** (needs the actual alias + whether a QR image exists) and the
canonical recipient constant (owned by the auth/KYC spec Wave 4 — do not duplicate).

---

## Documented but NOT built in this pass

- **`/notifications` server-side move.** Any signed-in user can still write a notification
  to any `userId` (bounded by shape/size/type) because buyer/seller notify writes happen
  client-side (`orderWorkflow.ts:325-357`). Real close = move those writes into Cloud
  Functions, then tighten the rule to `isAdmin() || userId==uid`. A Functions refactor,
  out of scope here; keep on the backlog.
- **CliQ alias/QR** (see above) — blocked on MJ's payment data.
- **Domain 301 redirects / DNS** — ops step for MJ + colleague via browser, not code.

## Build sequencing & collision notes

Waves ship in order (0→5), each its own PR/review/merge/deploy. Waves 1, 2, 4, 5.8/5.9 all
edit `AppContext.tsx` (auth flow, nav layer, subscription lifecycle, queries) — sequence
strictly, rebasing each wave on the prior merge to avoid conflicts in the god-object. The
parked **auth-expansion/KYC spec rebases on top of this whole pass** (it also edits the
auth boot flow + SellView, which Waves 1 and 5.7 touch).
