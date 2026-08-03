// PURE mappers for the search provider — zero I/O, fully unit-tested. These are
// the ONLY place raw Algolia records get translated into the app's shapes, so
// the concrete provider stays thin and swappable.

import { AuctionItem } from '../../types';
import { filsToUnits, resolveEndTime } from '../../utils/liveAuctionFields';
import { CATEGORIES, matchValues } from '../../utils/categories';

/**
 * Discovery category chip → canonical stored-`category` alias list.
 *
 * DERIVED from the one taxonomy (`utils/categories.ts`), not hand-maintained.
 * This used to be a literal copy of `DiscoveryFeedView`'s chip `match` arrays
 * with a "keep this in sync" comment, and it had already drifted: there was no
 * entry for the catch-all chip at all, so searching inside it applied no
 * category facet and returned lots from every category.
 *
 * Keyed by chip NAME, which is the category's English label — that is what
 * `useAlgoliaSearch` receives from the chip row. The 'All' chip is
 * intentionally absent (no filter).
 */
export const SEARCH_CATEGORY_MATCHES: Record<string, string[]> = Object.fromEntries(
  CATEGORIES.map((c) => [c.labelEn, matchValues(c.value)]),
);

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
    // `startMode` is copied through because the CARD's awaiting check runs on
    // the MAPPED item: `isAwaitingFirstBid(d)` (DiscoveryFeedView.tsx) reads
    // `d.startMode`, and a search result that dropped the field showed the red
    // LIVE badge while the browse feed showed the amber "BE THE FIRST" one for
    // the same lot. `resolveEndTime` above already reads the field off the RAW
    // hit (via `isAwaitingFirstBidDoc`), so without this line the mapped item
    // carried `endTime: null` with no `startMode` to explain it.
    //
    // The index writes `startMode: d.startMode ?? null` (functions/algoliaSync.js),
    // so a hit can legitimately carry null. The literal guard keeps null/any
    // unexpected value as `undefined` rather than inventing a mode: only the two
    // values `AuctionItem.startMode` declares pass through, so a scheduled lot
    // can never be read as first_bid (and vice versa).
    startMode: h.startMode === 'first_bid' || h.startMode === 'scheduled' ? h.startMode : undefined,
    // Admin Auction Lookup fields. Additive + defensive: the public AuctionCard
    // never reads these, and they stay absent (undefined/null) until the backend
    // sync indexes them — at which point the admin search lights them up with no
    // further change here. A number-guard keeps a stray string from posing as a
    // real auction number.
    auctionNumber: typeof h.auctionNumber === 'number' ? h.auctionNumber : undefined,
    currentBidderName: h.currentBidderName ?? null,
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
