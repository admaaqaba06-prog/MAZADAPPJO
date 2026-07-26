# Discover Slice 2 — Algolia search

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Typo-tolerant, faceted search across ALL auctions (not just loaded lots), behind a swappable provider abstraction, synced Firestore→Algolia by an in-repo Cloud Function. Search-only key ships in the client; the admin/write key is a Firebase secret. Additive — when the search box is empty, Discovery behaves exactly as today (Slice-1 paginated feed).

**Base:** `feat/discover-search` off `origin/main` (Slice 1 merged; independent of Slice 1b). Baseline 555 tests, tsc 0.

**Architecture:** A `SearchProvider` interface (client) with an Algolia-lite implementation reads a public **search-only** key. A Firestore `onWrite('auctions/{id}')` Cloud Function upserts/deletes the Algolia record using `ALGOLIA_ADMIN_KEY` (Firebase secret). `DiscoveryFeedView` switches to provider results when `searchTerm` is non-empty, and back to the Firestore feed when cleared. Visible result cards still get the live-on-visible overlay (`useVisibleAuctionLive`) for a fresh price.

## Global Constraints
- **Swappable:** all Algolia specifics live behind `SearchProvider` (`search(query, opts) → { hits, nbHits, facets }`). The feed imports the interface, never `algoliasearch` directly — so Typesense/other is a drop-in later.
- **Key hygiene:** client uses the **search-only** key (App ID `O45I2Z57QS`, search key `82e302cd6429c71d908ec360333e2706`) via `VITE_ALGOLIA_APP_ID`/`VITE_ALGOLIA_SEARCH_KEY` with those as safe fallbacks (public-safe, mirrors firebase.ts). The **admin/write key is NEVER in client code** — only `defineSecret('ALGOLIA_ADMIN_KEY')` in functions.
- **No fabricated data / honest empty + loading states.** Bilingual + RTL. Bundle: use `algoliasearch/lite` (search-only, small), not full InstantSearch.
- **Index only public lots:** sync indexes non-simulated lots with status in `['live','upcoming']` (searchable inventory); deletes on delete or transition OUT of those states (or `isSimulated===true`). Never index `processing`/`rejected`/simulated.
- After each task: `npx tsc --noEmit` 0 + `npm test` (baseline 555).

## Index shape (Algolia `auctions` index)
- `objectID` = auction id. Attributes: `title, description, category, condition, status, currentPrice, endTime, endsAt, sellerName, thumbnailUrl, id`.
- searchableAttributes: `title, description, category, sellerName`. attributesForFaceting: `filterOnly(status)`, `category`. customRanking: `asc(endsAt)` (ending-soon first). Configured once (Task 2 settings call / backfill).

---

### Task 1: Client search provider abstraction (pure + Algolia-lite)
**Files:** `src/services/search/SearchProvider.ts` (interface + types), `src/services/search/algoliaProvider.ts`, `src/services/search/index.ts` (exports the configured singleton), `src/services/search/searchMap.ts` (+ `.test.ts`).
- `SearchProvider` interface: `search(query: string, opts?: { category?: string; page?: number; hitsPerPage?: number }): Promise<SearchResult>` where `SearchResult = { hits: AuctionItem[]; nbHits: number; page: number; nbPages: number }`.
- `searchMap.ts` (PURE, tested): `algoliaHitToAuction(hit): AuctionItem` (map objectID→id, fils/price + endTime resolution reusing `liveAuctionFields` helpers, defaults for missing) and `buildFacetFilters({category})` (→ Algolia `filters`/`facetFilters` array; `'All'`/undefined → none; a category chip maps to its canonical `match` list via `category in [...]` semantics — reuse the same chip→canonical mapping as the feed). Tests cover hit mapping (present/missing fields), and facet building (All vs a category).
- `algoliaProvider.ts`: lazy-import `algoliasearch/lite`, build a client from env (`VITE_ALGOLIA_APP_ID`/`VITE_ALGOLIA_SEARCH_KEY` with the public fallbacks), `search()` calls the `auctions` index and maps hits via `searchMap`. Never import the admin key.
- `index.ts`: export a singleton `searchProvider: SearchProvider` (the Algolia impl) so consumers depend on the interface.
- Add `algoliasearch` to `package.json` deps.
- Commit `feat(search): swappable SearchProvider + Algolia-lite client + pure mappers`.

### Task 2: Firestore→Algolia sync Cloud Function + settings + backfill
**Files:** `functions/algoliaSync.js` (+ `functions/algoliaSync.test.js` for the pure record-builder), wire exports into `functions/index.js`, `functions/package.json` (+`algoliasearch`), `scripts/algolia-backfill.cjs` (one-time), docs note.
- Pure `buildAlgoliaRecord(id, data)` → the indexed object (objectID + attributes above); and `isIndexable(data)` → `data.isSimulated !== true && ['live','upcoming'].includes(data.status)`. Unit-test both.
- `exports.onAuctionWriteAlgolia = functions.runWith({ secrets: [ALGOLIA_ADMIN_KEY] }).firestore.document('auctions/{auctionId}').onWrite(async (change, ctx) => {...})`: on delete OR `!isIndexable(after)` → `index.deleteObject(id)`; else `index.saveObject(buildAlgoliaRecord(id, after))`. Guard so a transient Algolia error is logged, never throws the function into infinite retry (catch + return).
- `ALGOLIA_ADMIN_KEY = defineSecret('ALGOLIA_ADMIN_KEY')` (from `firebase-functions/params`). App ID + index name are non-secret constants.
- `scripts/algolia-backfill.cjs`: reads all auctions via admin SDK, filters `isIndexable`, batch `saveObjects`, and applies index `setSettings` (searchable/faceting/customRanking). Run once by MJ with `ALGOLIA_ADMIN_KEY` in env. (Idempotent.)
- Commit `feat(search): Firestore→Algolia sync function + index settings + backfill script`.

### Task 3: Wire search into DiscoveryFeedView (provider results ↔ feed)
**Files:** `src/components/DiscoveryFeedView.tsx`, maybe a small `src/hooks/useAlgoliaSearch.ts`.
- `useAlgoliaSearch(term, category)`: debounced (~250ms) call to `searchProvider.search`; returns `{ results, loading, error, active }` where `active = term.trim().length > 0`. Cancels stale calls (request id). Empty term → inert (no call).
- In DiscoveryFeedView: when `active`, render the search results grid (reuse `AuctionCard` + the live-on-visible overlay so an on-screen result stays price-fresh) with honest loading/empty ("no matches") states + result count; the category chips become Algolia facet filters. When the term is cleared → the existing feed path renders unchanged. Keep the existing `searchTerm` state/box; just route it to Algolia instead of the client-side `.includes` filter when non-empty.
- Bilingual/RTL; reduced-motion. No change to the empty-term feed.
- Commit `feat(search): Discovery search box drives Algolia results (facet-filtered, live-fresh)`.

### Task 4: Ops doc (env, secret, deploy, backfill, billing)
**Files:** `docs/search-algolia.md`.
- Exact steps for MJ: set `ALGOLIA_ADMIN_KEY` secret (`firebase functions:secrets:set ALGOLIA_ADMIN_KEY`); add `VITE_ALGOLIA_APP_ID`/`VITE_ALGOLIA_SEARCH_KEY` to Vercel (optional — public fallbacks exist); `firebase deploy --only functions:onAuctionWriteAlgolia`; run `node scripts/algolia-backfill.cjs` once; set an Algolia usage/billing alert (free 10K searches/mo, then $0.50/1K). Note the swappable abstraction for a future Typesense move.
- Commit `docs(search): Algolia ops runbook (secret, deploy, backfill, billing cap)`.

## Self-Review
Search is additive + provider-abstracted: empty box = today's feed, non-empty = Algolia across all lots. Client holds only the public search key; the admin key is a Firebase secret used solely by the sync function. Sync indexes only public, non-simulated live/upcoming lots and deletes on exit. Deploy/secret/backfill are MJ ops steps (Task 4 runbook). Whole-branch review (opus+fable) before merge; in-browser verify a real typo-tolerant search once backfilled.
