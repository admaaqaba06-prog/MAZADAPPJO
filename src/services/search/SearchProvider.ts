import { AuctionItem } from '../../types';

/**
 * Options a consumer can pass to a search. Kept intentionally small and
 * provider-agnostic — Algolia-specific concepts (facetFilters, index name,
 * typo tolerance) NEVER leak past this boundary. `category` is the selected
 * Discovery chip name ('All'/undefined = no category filter); the provider is
 * responsible for translating it to whatever its backend needs.
 */
export interface SearchOptions {
  category?: string;
  // Optional status whitelist. Omitted = no status filter (all statuses); the
  // public Discover search passes ['live','upcoming'] so buyers only ever see
  // biddable lots even once closed auctions are indexed for admin lookup.
  statuses?: string[];
  page?: number;
  hitsPerPage?: number;
}

/**
 * A normalised page of search results. `hits` are already mapped into the
 * app's `AuctionItem` shape so the existing `AuctionCard` can render them with
 * zero knowledge of the search backend.
 */
export interface SearchResult {
  hits: AuctionItem[];
  nbHits: number;
  page: number;
  nbPages: number;
}

/**
 * The ONLY surface the feed depends on. Swapping Algolia for Typesense (or a
 * mock in tests) is a drop-in replacement of the concrete provider behind this
 * interface — the feed never imports `algoliasearch` directly.
 */
export interface SearchProvider {
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
}
