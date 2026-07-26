# Discover Slice 1b — Task 5: delete the broad `auctions` listener

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Remove the broad public `auctions` `onSnapshot` (`AppContext.tsx` buyer mode, `where status in [live,upcoming] limit 80`) so a viewer in a bidding room no longer streams all ~80 lots' updates — realtime read-cost finally scales with *attention*, not *inventory* (the original scaling goal). Tasks 1–4 (merged) re-sourced the feed + win-detection + social-proof + details modal; the LAST holdouts are the **bidding room** (active lot + the desktop "Live Auctions" rail) and the DiscoveryFeed OFF path.

**Base:** off current `main` (Slices 1, 1b Tasks 1–4, and 2 all merged). Feed proven live on a real drop.

**Risk:** HIGH — touches the live bidding room (money-adjacent) and removes the LAST fallback (the `enablePaginatedDiscover` OFF path is the current kill-switch). Split: **5a is additive** (room gets its own sources, listener stays); **5b is the removal** (gated on 5a merged + verified on a drop + MJ's OK).

## Remaining broad-array consumers (recon)
| Consumer | file:line | Uses the array for | 5a re-source |
|---|---|---|---|
| Room active lot | `LiveStreamView.tsx:385` `activeAuctionBase` | the active lot's FULL object (static+live) | `useAuctionDoc(activeAuctionId)` single-doc full subscription |
| Room active lot (desktop reel panel) | `ReelsDesktopRightPanel.tsx:30` `currentItemBase` | same | same `useAuctionDoc` |
| Desktop "Live Auctions" rail | `DesktopLiveAuctionLayout.tsx:264,270` via `LiveStreamView` `liveAuctions` prop | a LIST of live lots (clickable to switch) | `useDiscoverFeed().liveItems` (already paginated, ending-soon) |
| `LiveStreamView:643` `auctions.some(...)` | one predicate | check what it needs | derive from the same scoped sources |
| Discovery OFF path | `DiscoveryFeedView.tsx` `!usePaginated` branch | the feed grid | removed in 5b (flag is ON in prod; OFF path unused) |
| Mobile room | `MobileAuctionView` | declares `liveAuctions` prop but does NOT use it | drop the unused prop |

Admin-mode consumers (SellerCenter, DropBuilder, AuctionDropBuilder, AdminDashboard, DropsListPanel) use the SEPARATE admin listener — OUT OF SCOPE.

---

### Task 5a-1: Extract a full auction-doc mapper (shared)
**Files:** `src/utils/auctionDocMap.ts` (new) + `.test.ts`; refactor `AppContext.tsx` `mapAuctionDoc` to consume it.
- `mapAuctionDoc` in AppContext maps a raw doc → full `AuctionItem` (static + live + timestamp/fils logic) AND kicks off async storage video-URL resolution. Extract the PURE synchronous mapping (everything except the async video side-effect + setState) into `mapAuctionDocFull(id, data): AuctionItem`, reusing `liveAuctionFields` helpers. `mapAuctionDoc` keeps the async video-resolution wrapper but builds its base via `mapAuctionDocFull` (behavior identical — parity is the review focus).
- Test the pure mapper (fields, fils→units, endsAt/endTime, missing fields).
- Commit `refactor(discover): extract mapAuctionDocFull (shared full-doc mapper)`.

### Task 5a-2: `useAuctionDoc(id)` — single-doc full subscription
**Files:** `src/hooks/useAuctionDoc.ts`.
- `useAuctionDoc(id: string | null): AuctionItem | null` — `onSnapshot(doc(db,'auctions',id))` → `mapAuctionDocFull`; includes the same async video-URL resolution the broad path did (so the room's video still plays). Leak-safe (mirror `useVisibleAuctionLive`'s registry/cleanup); returns null until first snapshot. Reuse the shared registry pattern so multiple room surfaces of the same id share one listener.
- Commit `feat(discover): useAuctionDoc single-doc full subscription`.

### Task 5a-3: Rewire the bidding room off the broad array (ADDITIVE)
**Files:** `LiveStreamView.tsx`, `ReelsDesktopRightPanel.tsx`, `DesktopLiveAuctionLayout.tsx`, `MobileAuctionView.tsx`.
- `LiveStreamView`: `activeAuctionBase` ← `useAuctionDoc(activeAuctionId)` (not `liveAuctions.find`). The `liveAuctions` rail list ← `useDiscoverFeed(selectedCategory).liveItems` (or a small scoped live query) — passed to `DesktopLiveAuctionLayout`. Resolve line 643's `auctions.some(...)` off the scoped source. The details-modal resolution (Task 4, `liveAuctions.find`) now reads the feed list.
- `ReelsDesktopRightPanel`: `currentItemBase` ← `useAuctionDoc(activeAuctionId)`.
- `MobileAuctionView`: drop the unused `liveAuctions` prop.
- **Broad listener STAYS** (still feeds nothing customer-critical now, but keep until 5b). Keep the `useVisibleAuctionLive` overlay where it still adds value, or fold into `useAuctionDoc` (which is already full+live).
- **Preview-gate + drop-verify:** MJ watches a real bidding room (active lot loads via its own doc, video plays, price/bids live, the desktop rail lists live lots, switching lots works, deep-link to an off-page lot still opens) before 5b.
- Commit `feat(discover): bidding room sources active lot + rail off broad array (additive)`.

### Task 5b (GATED): remove the broad listener + OFF path + flag
**Files:** `AppContext.tsx` (delete the buyer-mode `onSnapshot` + `useAuctions`/`visibleAuctions` if now unused by any buyer surface — KEEP admin mode), `DiscoveryFeedView.tsx` (delete the `!usePaginated` OFF path; paginated becomes the sole path), remove the now-dead `enablePaginatedDiscover` flag + its AppContext wiring.
- Only after 5a merged AND MJ verifies the room on a real drop. Re-audit every `useAuctions()` caller is admin-only or gone. Re-run the load-test to confirm read-cost dropped.
- Commit `perf(discover): remove broad auctions listener + OFF fallback (attention-scaled reads)`.

## Self-Review
5a is additive (room gets its own active-lot + rail sources; nothing removed) → reviewable + drop-verifiable with the broad listener still as a safety net. 5b (the actual read-cost win + kill-switch removal) is fenced behind 5a proving out on a live drop. Admin mode untouched. This completes the Discover scaling epic (Slices 1, 1b, 2).
