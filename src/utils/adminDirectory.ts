/**
 * Admin directory paging + truncation reporting.
 *
 * The admin auctions subscription is `orderBy('createdAt','desc').limit(100)`
 * (AppContext) against 241 production auctions, and the master directory used
 * to render that array whole, with no indication that 141 lots were missing.
 * A silent cap reads as "this is everything" — which is how 150 uploaded lots
 * looked like 20 (#202) and how the featured list could exceed its own cap
 * (#220). This module makes the cap visible and keeps the rendered DOM bounded
 * as the cap rises.
 */

/** Mirrors the `limit()` on the admin auctions subscription in AppContext. */
export const ADMIN_AUCTIONS_CAP = 100;

/** How many directory rows are added per "show more". */
export const DIRECTORY_CHUNK = 25;

export interface Truncation {
  truncated: boolean;
  hidden: number;
}

/**
 * How much of the collection the admin is NOT seeing.
 *
 * `total` is a best-effort `getCountFromServer` read that can fail (null) or
 * lag behind a deletion (lower than what is loaded). Both degrade to "nothing
 * hidden" rather than rendering a stale or negative remainder — an unknown
 * total must not manufacture a number.
 */
export function truncation(loaded: number, total: number | null): Truncation {
  if (total == null) return { truncated: false, hidden: 0 };
  const hidden = total - loaded;
  if (hidden <= 0) return { truncated: false, hidden: 0 };
  return { truncated: true, hidden };
}

export interface DirectoryPage<T> {
  rows: T[];
  hasMore: boolean;
  remaining: number;
}

/**
 * The rows to render for a given page count, one `DIRECTORY_CHUNK` at a time.
 * `pages` below 1 is clamped up: rendering nothing would look like an empty
 * directory rather than a paging bug.
 */
export function directoryPage<T>(items: T[], pages: number): DirectoryPage<T> {
  const take = Math.max(1, Math.floor(pages)) * DIRECTORY_CHUNK;
  const rows = items.slice(0, take);
  const remaining = Math.max(0, items.length - rows.length);
  return { rows, hasMore: remaining > 0, remaining };
}
