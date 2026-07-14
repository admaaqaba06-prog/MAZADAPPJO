# Live Theater (de-fake) + Savings Reveal + Bid-Display Fix — Plan (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** (1) Fix the bid-display bug (the room can offer a "next bid" the server rejects). (2) Remove the FAKE theater — fabricated viewer counts + bot bids/activity + a hidden simulation engine — and show only honest signals. (3) Add the "won at X — saved Y vs market Z" reveal, powered by a new per-auction market price. Real-time presence is explicitly OUT of scope (deferred).

**Architecture:** A pure `minNextBid(currentPrice, minIncrement, totalBids)` helper mirrors the server rule and replaces every hardcoded `+10`/`+50` client computation. The fake-theater removal deletes the two simulators (`LiveStreamView`'s interval + `AppContext`'s "websocket simulation") and the random `viewersCount` writes; the UI shows real `totalBids`/`currentBidderName` instead of fabricated watcher counts. A new optional `marketPrice` field on `AuctionItem` threads through `createListing` via the existing spread and powers a savings line in the winner cards.

**Tech Stack:** React 19 + TS + Vite + Firebase. Vitest for the pure helper.

## Global Constraints
- **Server bid rule (match EXACTLY):** min accepted = `currentPrice + (totalBids > 0 ? (minIncrement || 10) : 0)` (`functions/index.js:393-398`). The client's displayed/default next bid must never be below this.
- **De-fake = show real or show nothing.** Do NOT invent numbers. Replace fabricated "watching" counts with a real signal (`totalBids` → "N bids") or remove the element. Real-time viewer presence is deferred — do NOT add it.
- **Do NOT break** bid placement (`placeBid`), auth, the drop-builder, or auto-open. Keep the optimistic local price bump on the USER's own successful bid if present (`LiveStreamView.tsx:495`).
- **`marketPrice`** is optional/additive; the savings line shows ONLY when `marketPrice > final price`. Threads through `createListing` via the existing `...listingData` spread — just add the type field + builder input + reveal math.
- `npm run lint` (tsc) AND `npm run build` must pass after each task; `npx vitest run` stays green.

---

### Task 1: `minNextBid` pure helper (TDD)

**Files:** Create `src/utils/bidMath.ts` + `src/utils/bidMath.test.ts`.

**Interfaces:** `export function minNextBid(currentPrice: number, minIncrement: number | undefined, totalBids: number): number` — the minimum valid next bid, matching the server.

- [ ] **Step 1: Failing test** — create `src/utils/bidMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { minNextBid } from './bidMath';

describe('minNextBid', () => {
  it('first bid (no bids yet) equals the current/starting price', () => {
    expect(minNextBid(100, 5, 0)).toBe(100);
  });
  it('subsequent bids add the increment', () => {
    expect(minNextBid(100, 5, 3)).toBe(105);
    expect(minNextBid(360, 25, 12)).toBe(385);
  });
  it('falls back to +10 when increment missing (matches server)', () => {
    expect(minNextBid(100, undefined, 2)).toBe(110);
    expect(minNextBid(100, 0, 2)).toBe(110);
  });
});
```
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `src/utils/bidMath.ts`:
```ts
// Mirrors the server rule in functions/index.js placeBid:
// first bid may equal currentPrice; later bids need currentPrice + (minIncrement || 10).
export function minNextBid(currentPrice: number, minIncrement: number | undefined, totalBids: number): number {
  const inc = minIncrement && minIncrement > 0 ? minIncrement : 10;
  return totalBids > 0 ? currentPrice + inc : currentPrice;
}
```
- [ ] **Step 4: Run — PASS.**  **Step 5:** `npm run lint` clean.  **Step 6:** commit `feat(theater): add minNextBid helper matching server bid rule`.

---

### Task 2: LiveStreamView — remove fake theater + fix next-bid

**Files:** Modify `src/components/LiveStreamView.tsx`.

- [ ] **Step 1: Read** `LiveStreamView.tsx` around the cited lines (numbers approximate — match real code).
- [ ] **Step 2: Remove the fake bid/activity simulator + fake viewer count:**
  - Delete `JORDANIAN_NAMES` (`:72-76`), `simulatedBids`/`simulatedActivities` state (`:111-112`) and their seeding + 5.5s interval (`:347-448`), including the `localCurrentPrices` inflation (`:415-419`).
  - Delete the `viewerCount` seed `2354` (`:119`) and its random-walk interval (`:366`).
  - Where `recentBids`/`allActivities` were passed to the desktop layout (`:671-672`) and `viewerCount` to layouts (`:628,659` area): pass REAL data instead — real recent bids come from the `auctions/{id}/bids` subcollection; if a live subcollection listener isn't already available, pass an empty array and let the layouts show `totalBids` (Task 3) rather than a fabricated feed. Do NOT fabricate.
- [ ] **Step 3: Fix next-bid + de-inflate price:**
  - `activePrice` (`:160-161`): drop the `localCurrentPrices` lookup for the *display* price; use `activeAuction.currentPrice`. KEEP an optimistic bump only for the user's OWN just-placed bid if that logic exists at `:495` (scope it to the current user, not the simulator).
  - Replace `const nextBidAmount = activePrice + 10;` (`:602`) with `import { minNextBid } from '../utils/bidMath';` and `const nextBidAmount = activeAuction ? minNextBid(activeAuction.currentPrice, activeAuction.minIncrement, activeAuction.totalBids || 0) : 0;`
- [ ] **Step 4:** `npm run lint` + `npm run build` + `npx vitest run` — all green.
- [ ] **Step 5: Verify (dev serve)** the room renders without the fake watcher count / bot activity and the bid button shows a server-valid amount. Commit `feat(theater): de-fake LiveStreamView + correct next-bid`.

---

### Task 3: Layout components — correct next-bid + drop fake counts

**Files:** Modify `src/components/MobileLiveAuctionLayout.tsx`, `src/components/DesktopLiveAuctionLayout.tsx`, `src/components/ReelsDesktopRightPanel.tsx`, `src/components/AuctionDetailsModal.tsx`.

- [ ] **Step 1: Next-bid, all four, via `minNextBid`:**
  - `MobileLiveAuctionLayout.tsx:171` — replace `currentReelPrice + 10` with `minNextBid(currentReelPrice, <reel item>.minIncrement, <reel item>.totalBids || 0)`.
  - `DesktopLiveAuctionLayout.tsx:483-487` — the quick-bid `[10,25,50]` buttons: rebuild as multiples of the increment (e.g. base `minNextBid(...)`, then `+1×/+2×/+5× minIncrement`), so no option is below server minimum. `SwipeToBid` at `:569` already uses the (now-correct) `nextBidAmount` prop from LiveStreamView.
  - `ReelsDesktopRightPanel.tsx:103-104` — replace the `|| 50` fallback + manual formula with `minNextBid(currentItem.currentPrice, currentItem.minIncrement, currentItem.totalBids || 0)`.
  - `AuctionDetailsModal.tsx:80` is already correct — leave it; but `:217-224` quick-bid `[10,25,50,100]` buttons should likewise be increment-multiples (not below min).
- [ ] **Step 2: Drop fabricated viewer counts:**
  - `DesktopLiveAuctionLayout.tsx:158` (`|| 2349`) and `:352` ("{viewerCount} Watching"), `MobileLiveAuctionLayout.tsx:523` ("{viewerCount}"): replace the "watching" display with a REAL signal — `{auction.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}` — or remove the watcher element. No fake fallbacks.
  - `DiscoveryFeedView.tsx:127` (`👁️ {item.viewersCount || 12}`): same — show `totalBids` or drop it.
- [ ] **Step 3:** lint + build + vitest green. Verify dev serve. Commit `feat(theater): increment-correct bids + honest counts in layouts`.

---

### Task 4: Remove the AppContext simulation engine + its triggers/writes

**Files:** Modify `src/context/AppContext.tsx`, `src/components/DesktopFrame.tsx`, `src/components/AdminPanel.tsx`, `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1: Remove the "websocket simulation" engine** in `AppContext.tsx:3164-3316` (fake `arabBidders`/`arabChatter`, fake chat, fake bids that mutate `auctions` state and locally fake-refund escrow) and the `viewersCount` random-walk at `:3181-3187`. Remove the `isSimulating` state (`:426`) and its setter from the context if nothing else uses them (grep first). Read the block fully — excise cleanly, leaving real listeners intact.
- [ ] **Step 2: Remove the trigger** at `DesktopFrame.tsx:324` (`setIsSimulating(true)` on admin nav) and any `isSimulating` references it leaves dangling.
- [ ] **Step 3: Stop writing fake viewer counts on go-live:** `AdminPanel.tsx:58` and `AdminDashboardView.tsx:339` — remove `viewersCount: Math.floor(2 + Math.random()*8)` from the go-live `updateDoc` (drop the field; real presence is deferred). Also `AppContext.tsx:2744` (`viewersCount: 2` seed in createListing) — leave `0` or drop; don't seed a misleading number.
- [ ] **Step 4:** lint + build + vitest green. **Verify:** as an admin, opening the Admin view no longer spawns fake bids/chat/price changes. Commit `feat(theater): remove hidden bid/chat simulation engine + fake viewer writes`.

---

### Task 5: Savings reveal (market price → "you saved X")

**Files:** Modify `src/types.ts`, `src/components/AuctionDropBuilderView.tsx`, and the three winner cards (`LiveStreamView.tsx`, `DesktopLiveAuctionLayout.tsx`, `MobileLiveAuctionLayout.tsx`).

- [ ] **Step 1: Add the field** — `src/types.ts` `interface AuctionItem`, add `marketPrice?: number; // retail/market reference for the "you saved X" reveal`.
- [ ] **Step 2: Capture it in the builder** — `AuctionDropBuilderView.tsx`: add a `marketPrice` number input (styled like the existing starting-price field), state + parse, and include `marketPrice: Number(marketPrice) || undefined` in the `createListing` payload (`:97-117`). It threads to Firestore via the existing spread — no `createListing` change needed. (Optional: also surface it in the WhatsApp caption as the retail line — nice-to-have, not required.)
- [ ] **Step 3: Reveal in the winner cards** — where each shows the winning price, add, when `auction.marketPrice && auction.marketPrice > finalPrice`:
  `{isAr ? `وفّرت ${auction.marketPrice - finalPrice} دينار (السعر ${auction.marketPrice})` : `You saved ${auction.marketPrice - finalPrice} JOD (worth ${auction.marketPrice})`}`
  - `LiveStreamView.tsx:745-752` (Winning Bid block; `finalPrice` = the displayed winning price there).
  - `DesktopLiveAuctionLayout.tsx:393-421` (winner branch).
  - `MobileLiveAuctionLayout.tsx:730-750` (winner branch).
  Show for the winner; a subtle "sold for X (worth Y)" is also fine for non-winners — keep it simple, winner-focused.
- [ ] **Step 4:** lint + build + vitest green. Verify dev serve (create a drop with a market price; confirm the reveal math). Commit `feat(theater): market price + "you saved X" winner reveal`.

---

## Notes for the executor
- **Line numbers are approximate** — read each region; the room files are large and recently changed.
- **`minNextBid` is the single source** for the client's minimum — every bid control's default must derive from it; quick-bid "shortcuts" may offer MORE but never LESS than it.
- **De-fake is deletion-heavy** — excise simulators cleanly; after removal, grep for orphaned refs (`simulatedBids`, `isSimulating`, `viewerCount`, `JORDANIAN_NAMES`, `arabBidders`) and remove dangling usages so lint/build stay green.
- **Real-time presence is OUT of scope** — do not add RTDB/heartbeat; honest `totalBids` is the substitute this phase.
- **`marketPrice` is optional** — old auctions without it simply show no savings line.
