# Discover Pagination, Live-on-Visible, & Robust Search

**Date:** 2026-07-25
**Status:** Approved (design), pending implementation plan
**Scope:** The customer **Discover** browse experience — how auctions are loaded, kept fresh, and searched — plus the Firestore→Algolia sync. Large architectural change to `DiscoveryFeedView` and the `AuctionsContext` role. The open-auction/bidding view is **out of scope** (its single-lot realtime model is already correct).

## Objective

Today Discover opens **one realtime `onSnapshot`** on `auctions` (`where status in ['live','upcoming'] orderBy createdAt desc limit 80`) and streams *every bid on all ~80 lots to every viewer*, with category/search filtered client-side over that capped 80. At hundreds/thousands of concurrent auctions this fails two ways:
1. **Discovery caps at 80** — most inventory is unreachable (a business problem).
2. **Fan-out cost + client churn** — every viewer receives every visible lot's bid stream (the load-test's "cost = viewers × fan-out"), and re-renders on it.

Goal: make discovery **unbounded** and make realtime cost scale with **what people actually watch**, not what exists — while keeping the feed feeling alive. Plus add real search (Firestore has no full-text).

**Decisions locked with MJ:**
- **Freshness = "live-on-visible" + a "new drops" pill.**
- **Default Live sort = ending-soon** (a Newest/Hottest toggle is an easy later add).
- **Browse = paginated queries; realtime only on the open lot.**
- **Search = Algolia** (typo-tolerant, faceted) synced from Firestore.

## Architecture

### 1. Browse = paginated queries (no broad live listener)
- **Live section:** `query(auctions, where('status','==','live'), orderBy('endTime','asc'), limit(PAGE))`, cursor-paginated via `startAfter(lastDoc)` → **infinite scroll**. `getDocs` (one-time), not `onSnapshot`. Discovery is now unbounded.
- **Upcoming section:** its own smaller, lower-priority section/tab — `where('status','==','upcoming') orderBy('scheduledStartAt','asc')`, paginated similarly.
- **Category chips** move into the query: `where('category','==', cat) + orderBy('endTime')` (composite index). No more client-filtering a capped page.
- `PAGE` ≈ 20–24. Simulated lots (`isSimulated`) excluded at the query/derivation level.

### 2. Freshness — live-on-visible + new-drops pill
- **Per-card realtime, only while visible.** Reuse the existing shared `IntersectionObserver` pattern: when a card scrolls on-screen it subscribes a single-doc `onSnapshot(doc(auctions, id))` for live price/bidCount/reserveMet; when it scrolls off, it unsubscribes. So a viewer holds ~N-visible (~6–10) live listeners, not 80+. A small `useVisibleAuctionLive(id)` hook owns subscribe/unsubscribe + a shared registry to dedupe.
- **Countdowns tick client-side** from `endTime` (already the shared 1s ticker) — zero server cost, always lively.
- **"New drops ↓" pill.** One lightweight detector — e.g. `onSnapshot(query(auctions, where('status','==','live'), orderBy('createdAt','desc'), limit(1)))` (or a periodic count) — compares the newest live `createdAt` to the top of the loaded list; when newer lots exist, show a "N new drops ↓" pill that prepends them on tap. (This is the ONE small always-on listener; it delivers a single doc, negligible cost.)

### 3. Search = Algolia (typo-tolerant, faceted)
- **Sync:** install the official **Firestore→Algolia** Firebase extension (or an equivalent Cloud Function) to index the `auctions` collection into an Algolia index. Indexed fields: `title, description, category, condition, status, currentPrice, endTime, sellerName, id`. Facets: `category`, `status`, price range. Keep the index lean (only what search/facets need).
- **Query path:** when the search box has a term, Discover switches from the Firestore-paginated feed to **Algolia results** (Algolia InstantSearch or the search-only API key from the client) — typo-tolerant, faceted, paginated by Algolia. Clearing search returns to the Firestore ending-soon feed. Facet filters (category/status) apply within search.
- **Freshness of search results:** search results are point-in-time from Algolia; once a result card is on screen it can still get the live-on-visible Firestore subscription (§2) for its price, so an opened/visible search result is current.
- **Keys:** the client uses the **search-only** Algolia key (never the admin key). Admin/write key lives only in the extension/functions config.

### 4. Open auction = unchanged
The single-lot realtime subscription in the auction view stays. This redesign only removes the *broad feed* listener. Deep-linking (`/auction/:id`) unaffected.

### 5. Context refactor (the real blast radius)
Today `useAuctions()` hands the whole `auctions` array to the feed AND to hooks (`useSocialProof`, `useWinDetection`) and elsewhere. That broad array goes away for the feed. Plan:
- The feed owns its **paginated list state** + the visible-live subscriptions locally (or via a dedicated `useDiscoverFeed` hook).
- Hooks that needed "all live auctions" (`useSocialProof` live-count/bidders, `useWinDetection`) switch to their own **scoped one-time queries / aggregation** (e.g. a cheap `count()` for live-count, a small recent-wins query — `useSocialProof` already does a standalone recent-wins query; the live-count piece moves to a `getCountFromServer` or a small query). `useLandingAuctions` (landing) is already a standalone limited query — unaffected.
- Keep the `AuctionsContext` only for whatever genuinely still needs a shared array (audit each consumer); the goal is that **no customer screen holds a broad live `auctions` listener** anymore.

### 6. Indexes (Firestore)
Composite indexes required: `(status ASC, endTime ASC)`, `(status ASC, category ASC, endTime ASC)`, `(status ASC, scheduledStartAt ASC)`, `(status ASC, createdAt DESC)` (new-drops detector). Ship `firestore.indexes.json` updates.

### 7. Cost re-model
- **Before:** ~`viewers × (live lots ≤80) × bid-updates` continuous reads.
- **After:** `viewers × ~8 visible cards × their bid rate` (live-on-visible) + page reads (`viewers × pages scrolled × PAGE`) + one new-drops doc/viewer + Algolia searches. Realtime cost now scales with *attention*, not *inventory*. Matches the load-test's read-cost model.

## External prerequisites (MJ / ops — not code)
- Create an **Algolia account**; get the App ID, **search-only** key (client) and **admin** key (extension/functions only).
- Install the **Firestore→Algolia** Firebase extension on the `auctions` collection (or deploy the sync function); configure indexed fields + facets; run an initial backfill so existing lots are indexed.
- Add the composite Firestore indexes (deploy `firestore.indexes.json`).
- Cost note: Algolia free tier (~10k records + 10k searches/mo) covers early launch; monitor as volume grows (Typesense is the documented cheaper-at-scale fallback).

## Testing
- **Pure/unit:** a query-builder + cursor helper (`buildDiscoverQuery(filters, sort, cursor)`), a `hasNewerDrops(newestLoadedCreatedAt, latestLiveCreatedAt)` predicate, the visible-subscription registry (subscribe/dedupe/unsubscribe) logic, and a search-params mapper — all pure + tested.
- **Existing** bidding/auction tests untouched (open-lot view unchanged).
- **In-browser verification** (I can drive the real app): feed loads a page, infinite-scroll loads more, ending-soon order correct, on-screen cards update price live and off-screen don't, new-drops pill appears + prepends, category filter re-queries, search returns typo-tolerant results with facets, opening a lot is still fully live. Both languages/RTL.
- **Cost/scale re-measure:** re-run `scripts/loadtest/viewer-storm.js` against the new model to confirm read cost dropped and characterize it; add a discover-feed load scenario if useful.

## Non-Goals (YAGNI)
- No change to the **open-auction/bidding view**, `placeBid`, callables, escrow/settlement, rules for bids, or money logic.
- No Newest/Hottest sort toggle in v1 (ending-soon only; toggle is a fast follow).
- No personalization/recommendations engine (just sort + filter + search).
- Not migrating other collections to Algolia (auctions only).
- Desktop and mobile both use `DiscoveryFeedView` — both get the change (not a mobile-only pass).

## Constraints
- Bilingual, RTL-native. Brand preserved. Reduced-motion respected.
- **No fabricated data** (real lots, honest empty/loading states, no fake counts).
- Search uses the **search-only** key client-side; write/admin keys never shipped to the browser.
- Ship carefully (large change) — consider a feature flag to fall back to the current feed if needed during rollout.
