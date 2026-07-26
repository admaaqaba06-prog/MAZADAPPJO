// Algolia-lite concrete implementation of the SearchProvider interface.
//
// NOTE (algoliasearch v5): the search-only entry point is `liteClient` (search
// method: `searchForHits`), not the v4 `algoliasearch(...).initIndex().search`.
// All of that is contained here, behind the `SearchProvider` boundary, so the
// feed never learns which backend/version it talks to.

import { liteClient } from 'algoliasearch/lite';
import { SearchOptions, SearchProvider, SearchResult } from './SearchProvider';
import { algoliaHitToAuction, buildFacetFilters } from './searchMap';

// Config from env with PUBLIC-SAFE fallbacks (mirrors src/services/firebase.ts).
// The search-only key is safe to ship in the client; the admin/write key MUST
// NEVER appear here — it lives only as a Firebase secret used by the sync fn.
const APP_ID = (import.meta as any).env.VITE_ALGOLIA_APP_ID || 'O45I2Z57QS';
const SEARCH_KEY = (import.meta as any).env.VITE_ALGOLIA_SEARCH_KEY || '82e302cd6429c71d908ec360333e2706';
const INDEX = 'auctions';

// Lazily create the client on first search() so the lib isn't pulled into the
// initial bundle path unless a search actually happens.
let client: ReturnType<typeof liteClient> | null = null;
function getClient() {
  if (!client) {
    client = liteClient(APP_ID, SEARCH_KEY);
  }
  return client;
}

export const algoliaProvider: SearchProvider = {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    try {
      const { results } = await getClient().searchForHits<any>({
        requests: [
          {
            indexName: INDEX,
            query,
            facetFilters: buildFacetFilters({ category: opts?.category }),
            page: opts?.page ?? 0,
            hitsPerPage: opts?.hitsPerPage ?? 24,
          },
        ],
      });
      const res = results[0];
      return {
        hits: (res?.hits ?? []).map(algoliaHitToAuction),
        nbHits: res?.nbHits ?? 0,
        page: res?.page ?? 0,
        nbPages: res?.nbPages ?? 0,
      };
    } catch (err) {
      // Log then RE-THROW a genuine outage. `useAlgoliaSearch` catches this out
      // of the render path and flips its `error` flag, so Discovery can show a
      // distinct "search temporarily unavailable" state instead of rendering an
      // outage identically to a legitimate "no matches". The throw never reaches
      // the UI directly — the hook is the only caller and it always catches.
      console.error('[algoliaProvider] search failed:', err);
      throw err;
    }
  },
};
