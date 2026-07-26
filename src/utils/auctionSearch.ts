/**
 * Discover search matching.
 *
 * Search used to cover only `title + description`, so the auction NUMBER — the
 * identifier Mazad and its customers actually quote to each other ("#2002") —
 * found nothing. This adds it, and accepts the number with or without the `#`
 * so both "2002" and "#2002" work.
 *
 * The number match is EXACT on the whole number, not a substring: searching
 * "200" must not drag in #2001, #2002 and #2003. Free text stays a substring
 * match, which is what people expect from a title search.
 */

export interface AuctionSearchable {
  title?: string | null;
  description?: string | null;
  auctionNumber?: number | null;
}

/** Does `item` match `term`? An empty/blank term matches everything. */
export function matchesAuctionSearch(
  item: AuctionSearchable | null | undefined,
  term: string | null | undefined,
): boolean {
  const q = (term ?? '').trim();
  if (!q) return true;
  if (!item) return false;

  // "#2002" and "2002" both target the auction number.
  const numeric = q.replace(/^#/, '');
  if (/^\d+$/.test(numeric) && typeof item.auctionNumber === 'number') {
    if (String(item.auctionNumber) === numeric) return true;
    // Fall through: a digit string can still be part of a title ("iPhone 17").
  }

  const haystack = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
  return haystack.includes(q.toLowerCase());
}
