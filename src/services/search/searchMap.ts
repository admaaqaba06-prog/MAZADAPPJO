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
    // A missing/empty category maps to '' (neutral) rather than a real chip
    // value — a lot with no category must NOT be mislabeled (e.g. as 'Luxury')
    // on the card. The card renders category-agnostically, so '' is safe.
    category: h.category || '',
    status: h.status || 'live',
    sellerName: h.sellerName || '',
    thumbnailUrl: h.thumbnailUrl || '',
    currentPrice: filsToUnits(h.currentPriceFils, h.currentPrice, startingPrice),
    startingPrice,
    endTime: resolveEndTime(h),
  } as AuctionItem;
}

/**
 * Translate the selected Discovery chip + optional status constraint into an
 * Algolia `facetFilters` value.
 *
 * Algolia semantics: the return is an ARRAY of GROUPS. Groups are AND-ed
 * together; members WITHIN a group are OR-ed. So the two constraints combine as
 * "(category OR-group) AND (status OR-group)".
 *
 * - Category: `undefined` / `'All'` / unknown chip → no category group; a known
 *   chip → a single OR group of `category:<value>` clauses over the chip's
 *   canonical alias list, e.g. Cars → `['category:Cars','category:Vehicles']`.
 * - Statuses: a non-empty array → a SEPARATE OR group of `status:<s>` clauses,
 *   e.g. `['live','upcoming']` → `['status:live','status:upcoming']`. The public
 *   Discover search passes `['live','upcoming']` so it ONLY ever returns
 *   biddable lots; an admin search omits `statuses` to see all statuses.
 *
 * Combinations:
 * - category + statuses → `[[category ORs...], ['status:live','status:upcoming']]`
 * - statuses only       → `[['status:live','status:upcoming']]`
 * - category only       → `[[category ORs...]]`
 * - neither             → `undefined`
 */
export function buildFacetFilters(opts: {
  category?: string;
  statuses?: string[];
}): string[][] | undefined {
  const groups: string[][] = [];

  const category = opts?.category;
  if (category && category !== 'All') {
    const matches = SEARCH_CATEGORY_MATCHES[category];
    if (matches && matches.length > 0) {
      groups.push(matches.map((value) => `category:${value}`));
    }
  }

  const statuses = opts?.statuses;
  if (statuses && statuses.length > 0) {
    groups.push(statuses.map((s) => `status:${s}`));
  }

  return groups.length > 0 ? groups : undefined;
}
