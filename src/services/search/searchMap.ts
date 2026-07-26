// PURE mappers for the search provider — zero I/O, fully unit-tested. These are
// the ONLY place raw Algolia records get translated into the app's shapes, so
// the concrete provider stays thin and swappable.

import { AuctionItem } from '../../types';
import { filsToUnits, resolveEndTime } from '../../utils/liveAuctionFields';

/**
 * Discovery category chip → canonical stored-`category` alias list.
 *
 * EXTRACTED from `DiscoveryFeedView.tsx`'s local `categoriesList` (the `match`
 * arrays) so the search facet filters use the EXACT same chip→canonical mapping
 * the Firestore feed uses (`buildLiveFeedConstraints` consumes the same alias
 * lists). Keep this in sync with that component — the `searchMap.test.ts`
 * snapshot guards it. The 'All' chip is intentionally absent (no filter).
 */
export const SEARCH_CATEGORY_MATCHES: Record<string, string[]> = {
  Cars: ['Cars', 'Vehicles'],
  'Real Estate': ['Real Estate'],
  Phones: ['Phones', 'Electronics'],
  Watches: ['Watches'],
  Electronics: ['Electronics'],
};

/**
 * Map a raw Algolia hit → an `AuctionItem` the existing `AuctionCard` can
 * render. Price/endTime resolution reuses the shared `liveAuctionFields`
 * helpers so a search-result card resolves these identically to the paginated
 * feed (and to the live-on-visible overlay that later refreshes it). Missing
 * fields degrade to safe defaults — this never throws.
 *
 * The returned object is a partial cast to `AuctionItem` (same pattern as the
 * feed's `mapAuctionDoc` / `mapLiveAuctionFields`); the live-on-visible overlay
 * fills the fast-changing numbers once a card is on screen.
 */
export function algoliaHitToAuction(hit: any): AuctionItem {
  const h = hit || {};
  const startingPrice = filsToUnits(h.startingPriceFils, h.startingPrice, 0);
  return {
    id: h.objectID ?? h.id ?? '',
    title: h.title || '',
    description: h.description || '',
    category: h.category || 'Luxury',
    status: h.status || 'live',
    sellerName: h.sellerName || '',
    thumbnailUrl: h.thumbnailUrl || '',
    currentPrice: filsToUnits(h.currentPriceFils, h.currentPrice, startingPrice),
    startingPrice,
    endTime: resolveEndTime(h),
  } as AuctionItem;
}

/**
 * Translate the selected Discovery chip into an Algolia `facetFilters` value.
 *
 * - `undefined` / `'All'` / unknown chip → `undefined` (no category filter).
 * - A known chip → a single OR group of `category:<value>` clauses over the
 *   chip's canonical alias list, e.g. Cars → `[['category:Cars','category:Vehicles']]`.
 *   (Outer array = AND groups; inner array = OR within a group.)
 */
export function buildFacetFilters(opts: { category?: string }): string[][] | undefined {
  const category = opts?.category;
  if (!category || category === 'All') return undefined;
  const matches = SEARCH_CATEGORY_MATCHES[category];
  if (!matches || matches.length === 0) return undefined;
  return [matches.map((value) => `category:${value}`)];
}
