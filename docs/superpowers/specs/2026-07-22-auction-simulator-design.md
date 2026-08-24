# Auction Simulator — Design Spec

**Date:** 2026-07-22
**Status:** Approved (MJ chose "full server bot" scope)

## Goal

An admin-only, toggle-on/off testing tool that populates the app with live auction
activity on demand — so the full pipeline (bid → outbid → anti-snipe → win →
settlement → CliQ pay) can be exercised without waiting for a real WhatsApp drop. All
generated data is flagged `isSimulated: true`, hidden from real users, and wiped in one
click. Rival bids go through the REAL server bid pipeline (increments, rate limits,
anti-snipe) so it also stress-tests `placeBid`/settlement.

## Principles

- **Admin-only.** Every control + every callable is gated server-side by the caller's
  `role==='admin' || isAdmin===true` (the pattern already used by existing callables,
  e.g. `functions/index.js` release/refund), and the UI by the `isAdminUser` helper.
- **Zero prod footprint when done.** All docs carry `isSimulated: true`; "Clear all"
  removes them. Real users NEVER see simulated auctions (client filter); real funnel
  metrics exclude simulated docs.
- **Reuse, don't duplicate.** `simulateBid` and `simulateSettleNow` reuse the existing
  bid-application and closer-settlement logic in `functions/index.js` (extract shared
  helpers rather than copy).
- App is **NOT launched** — no data migration; but build so simulated data can't leak
  post-launch (the filter is the guarantee).

## Global constraints

- React 19 + Vite + TS + Tailwind v4, Firebase Functions v1, Vitest. No new deps.
- Bilingual is NOT required for the simulator UI (admin-only internal tool — English is
  fine; keep it simple).
- JOD 3-decimal; simulated bids use the same integer-fils math as real bids.
- Functions/rules deploy via the CI "Deploy Firebase" workflow on merge to main.
- Per wave: `npx tsc --noEmit` (0) · `npm run build` · `npx vitest run` (green).
- `isAdminUser` helper is at `src/utils/adminAuth.ts`.

---

## Wave 1 — Server callables (`functions/index.js`)

All are `functions.https.onCall`, admin-gated (reject non-admins with `permission-denied`).
Extract a shared `assertAdmin(context)` helper mirroring the existing admin checks.

### 1.1 `simulateSpawnAuction(data)`
- Input: `{ title?, startingPrice?, durationSec?, category?, channel?, status? }` with
  sane defaults (title "TEST — <category>", startingPrice 10, durationSec 120,
  category 'Electronics', channel 'misc', status 'live').
- Writes an `auctions` doc: `isSimulated: true`, `status` (live|upcoming), `endTime =
  now + durationSec*1000` (for live) or a near-future `scheduledStartAt` (upcoming),
  `currentPrice = startingPrice`, `startingPrice`, `totalBids: 0`, `isApproved: true`,
  `approvalStatus: 'approved'`, `ownershipAttested: true`, `attestedAt: now`,
  `createdById: <admin uid>`, `createdAt: now`, `minIncrement` computed as the app does
  (`max(5, round(price*0.05))`), plus a placeholder `thumbnailUrl`/`imageUrl`.
- Returns the new auction id.

### 1.2 `simulateBid(data)`
- Input: `{ auctionId, bidderLabel? }`.
- Reuse the real bid-application logic: in a transaction, read the auction, verify it's
  a live simulated (or any) auction not past `endTime`, compute the min next bid from
  `currentPrice + minIncrement` (same rule as `placeBid`/`bidMath`), set
  `currentPrice`, `currentBidderId: 'sim-bot'`, `currentBidderName: bidderLabel ||
  'Test Bidder'`, increment `totalBids`, append a `bids` doc (`isSimulated: true`), and
  apply anti-snipe (extend `endTime` +15s if <10s remain) — identical to the real path
  (`functions/index.js` ~:666-670). Return the new price + endTime.
- If the auction is ended/closed, return a no-op result (don't throw the bot into a loop
  crash).

### 1.3 `simulateSettleNow(data)`
- Input: `{ auctionId }`.
- Run the SAME settlement transaction the `scheduledAuctionCloser` runs for one auction
  immediately (mark completed, create the order with `buyersPremium`/`totalDue`/
  `paymentDeadlineAt`, increment winner `wonCount`, fire the webhooks) — extract the
  closer's per-auction settle into a shared function and call it here. The created order
  is flagged `isSimulated: true`. Lets win→pay be tested in seconds, not a ≤60s cron wait.

### 1.4 `simulateCleanup()`
- Delete ALL `isSimulated` docs: `auctions`, their `bids`, and any `orders` with
  `isSimulated: true` (batched). Return counts deleted. Idempotent.

---

## Wave 2 — Simulator admin UI (`src/components/SimulatorPanel.tsx` + Admin tab)

- New "🧪 Simulator" tab in `AdminDashboardView` (gated by `isAdminUser`).
- **Master toggle** persisted in `localStorage` (`mazad_simulator_enabled`); a fixed
  banner ("🧪 Simulator ON — test data visible to admins only") shows while enabled.
- **Spawn** section: preset buttons (Phone·2min, Car·5min, Watch·30s-snipe,
  Upcoming·starts-1min) + a custom form (title/price/duration/category) → call
  `simulateSpawnAuction`.
- **Active simulated auctions** list (live query where `isSimulated==true`): each row
  shows title/price/time-left/totalBids and per-auction controls:
  - **Start bot / Stop bot** — a client `setInterval` (pace selector: slow ~12s / fast
    ~4s) calling `simulateBid(auctionId)`; auto-stops when the auction ends, on Stop, on
    toggle-off, and on cleanup. Only one interval per auction; guard against duplicates.
  - **End now** — set `endTime = now` (admin update).
  - **Settle now** — call `simulateSettleNow`.
- **Clear all simulated data** button → `simulateCleanup` (with a confirm), stops all bots.
- Keep it a self-contained component; no bilingual strings needed.

---

## Wave 3 — Visibility filtering + metric hygiene

- **Buyer surfaces never show simulated auctions.** Add an `isSimulated` filter so that
  for non-admins (`!isAdminUser(currentUser)`) all `isSimulated` auctions are excluded
  from: the Discovery feed (`DiscoveryFeedView` live/upcoming tabs), the live room
  (`LiveStreamView`/`liveAuctions`/`getLiveAuctions`), social proof (`useSocialProof`
  recent wins + live counts), and the auctions subscription-derived lists. Admins see
  them only when the master toggle is ON (so an admin can hide test data without
  deleting it). Real users: hidden always, regardless of toggle.
- **Metrics:** the admin funnel/counters and `useSocialProof` exclude `isSimulated`
  orders/auctions so test runs don't inflate real numbers. (Admin dashboard general
  metrics may show a separate "(incl. N simulated)" note — optional.)
- Confirm the auctions `allow read: if true` rule means simulated docs are technically
  publicly readable; the guarantee they don't SHOW is the client filter — document this
  and keep the filter centralized (a single `visibleToUser(auction, currentUser, simOn)`
  helper) so no surface forgets it.

## Testing

- Unit: the shared min-next-bid + anti-snipe helpers (already covered by `bidMath`;
  add for any extracted settle helper if pure); a `visibleToUser` filter helper
  (admin+simOn shows, non-admin hides, toggle-off hides for admin).
- Manual (admin, post-deploy): toggle on → spawn a 30s auction → it appears for admin,
  NOT in an incognito/non-admin view → start bot → watch price climb + outbid + anti-snipe
  extension in the final seconds → settle now → order appears → win→pay CliQ panel (with
  the `mazzadom` alias) → clear all → everything gone, real feed clean.

## Risks

- **Simulated data leaking to real users** — the single most important guard; centralize
  the filter, test the non-admin path explicitly.
- **Bot interval leaks** — must clear on unmount/toggle-off/cleanup/auction-end; one
  interval per auction.
- **`simulateSettleNow` reusing closer logic** — must not double-settle an auction the
  cron already settled (guard on status/existing order, like the real closer).
- **Cleanup completeness** — orphaned simulated bids/orders; delete by `isSimulated`
  across all three collections.
