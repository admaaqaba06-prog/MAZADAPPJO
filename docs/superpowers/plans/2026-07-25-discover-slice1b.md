# Discover Slice 1b — sever the broad `auctions` listener

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Remove the broad public `auctions` `onSnapshot` (`AppContext.tsx:1490-1496`, buyer mode, `where status in [live,upcoming] orderBy createdAt desc limit 80`) so realtime read-cost scales with *attention*, not *inventory*. Every current consumer of the broad array (`useAuctions()`) is re-sourced to a scoped query FIRST (additive, broad listener stays), then the listener + Discover OFF fallback are deleted LAST.

**Base:** `feat/discover-slice1b` off `origin/main` (Slice 1 merged, flag ON in prod). Baseline 558 tests (incl. 1b-A).

## Global Constraints
- ADDITIVE until the final task: the broad listener STAYS while consumers are re-sourced, so nothing breaks mid-slice. Each task is independently reviewable + shippable.
- No money/rules/`placeBid`/escrow/chat change. Bilingual/RTL preserved.
- **1b-C (the deletion) is GATED** on the paginated feed being proven on a real live drop (flag ON verified end-to-end). Do NOT delete the listener until then.
- Admin mode (`auctionSubMode==='admin'`) uses a SEPARATE branch of the same effect (`AppContext.tsx:1472`, all-statuses limit 100) — OUT OF SCOPE; do not touch it.
- After each task: `npx tsc --noEmit` 0 + `npm test` (baseline 558).

## Consumer map (from recon) → re-source
| Consumer | file:line | Today | Re-source |
|---|---|---|---|
| Open bidding lot | LiveStreamView/ReelsDesktopRightPanel | ✅ DONE 1b-A (own single-doc sub) | — |
| Review-prompt vendorId | App.tsx:145 | `order.vendorId ?? auctions.find(...).vendorId` | drop fallback → `order.vendorId ?? null` |
| Seller badge "owns listing" | DesktopFrame.tsx:106 | `auctions.some(sellerId==uid)` | scoped `getDocs(where sellerId==uid limit 1)` |
| Details modal lot | AuctionDetailsModal.tsx:38 | `auctions.find(id)` | single-doc subscription (full doc) |
| MyOrders "just won" hint | MyOrdersView.tsx:99 | `auctions.some(isViewerWinner && finished)` | scoped my-lots query (shared w/ win-detect) |
| Win detection | WinCelebration `useWinDetection`, called LiveStreamView:417 + DiscoveryFeedView:351 | iterates broad array for live→completed | scoped my-lots subscription |
| Social-proof live count/bidders | useSocialProof.ts:177-188 | derived from broad array | `getCountFromServer(status==live)`; drop/approx bidders |
| Drops list rows | DropsListPanel.tsx:27 | groups broad array | consume `useDiscoverFeed` or own paginated query |
| Discover OFF path | DiscoveryFeedView.tsx:376-401 | filters broad array | removed WITH the listener in 1b-C |

---

### Task 1: Incidental re-sources (low risk, additive)
**Files:** `src/App.tsx`, `src/components/DesktopFrame.tsx`, `src/hooks/useOwnsListing.ts` (new).
- App.tsx:145 — drop the `auctions.find(...)` fallback; vendorId comes from `order.vendorId ?? null` (order carries it as primary already). Remove the now-unused `useAuctions()` import in that host if nothing else uses it.
- New `useOwnsListing(userId)`: one-time (cached) `getDocs(query(auctions, where('sellerId','==',userId), limit(1)))` → boolean; DesktopFrame `ownsListing` consumes it instead of scanning the array. Guards: no query when no userId.
- Test: `useOwnsListing` gated logic if extractable; else covered by tsc + the getDocs shape.

### Task 2: Shared "my lots" scoped source + win-detection + MyOrders hint
**Files:** `src/hooks/useMyAuctionLots.ts` (new), `src/components/feedback/WinCelebration.tsx` (call sites), `src/components/MyOrdersView.tsx`, `firestore.indexes.json`.
- New `useMyAuctionLots(userId)`: `onSnapshot(query(auctions, where('currentBidderId','==',userId), where('status','in',['live','completed','ended','reserve_not_met']), limit(20)))` → mapped `AuctionItem[]`. One tiny per-user listener. Index `(currentBidderId ASC, status ASC)`.
- Feed `useWinDetection(myLots, …)` from this instead of the broad `auctions` at both call sites (LiveStreamView, DiscoveryFeedView) — the live→completed transition for MY lots is fully covered (a lot I'm winning keeps `currentBidderId==me` when it completes).
- MyOrders `hasUnsettledWin` derives from the same `myLots` (finished + isViewerWinner + no order yet), not the broad array.
- **Highest-risk task (win/payment path)** — dedicated review; verify seed-not-fire semantics preserved.

### Task 3: Social-proof + drops list re-source
**Files:** `src/hooks/useSocialProof.ts`, `src/components/DropsListPanel.tsx`.
- useSocialProof live count → `getCountFromServer(query(auctions, where('status','==','live')))` (cached, periodic). `biddersNow` → derive from the count or a small query; if not cheaply reproducible, show live-count only (no fabricated bidder number).
- DropsListPanel → consume `useDiscoverFeed` (already paginated) or its own scoped query; group into drop rows from that.

### Task 4: Details modal single-doc source
**Files:** `src/components/AuctionDetailsModal.tsx` (+ maybe a `useAuctionDoc(id)` hook).
- Replace `auctions.find(id)` with a single-doc subscription (full `AuctionItem`, static + live). If the modal is always opened with the lot already in hand, prefer passing the lot in; else `useAuctionDoc(id)`.

### Task 5 (GATED — after feed proven on a live drop): delete the broad listener + OFF path
**Files:** `src/context/AppContext.tsx` (remove buyer-mode listener + `auctions`/`visibleAuctions` if now unused), `src/components/DiscoveryFeedView.tsx` (remove OFF path + the `enablePaginatedDiscover` branch → paginated is the only path), remove the now-dead flag.
- Only after Tasks 1-4 merged AND MJ has verified the paginated feed live on a real drop. Re-run the load-test to confirm read-cost dropped.
- This removes the kill switch, so it is the LAST, deliberate, separately-approved step.

## Self-Review
Every customer screen that read the broad live array gets its own scoped source (Tasks 1-4), each additive + reviewable while the listener still runs. Task 5 (the deletion + the real scaling win) is explicitly gated on live-drop verification so the flag kill-switch survives until the new model is proven. Admin surfaces untouched. Then Slice 2 (Algolia).
