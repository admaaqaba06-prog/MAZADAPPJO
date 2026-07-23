// Pure helpers for the seller-profile prefetch negative cache (PF1).
//
// The prefetch effect in AppContext re-runs on every auctions snapshot. Without
// a negative cache, a seller with NO profile doc (including the `seller-system`
// sentinel written by mapAuctionDoc) is missing forever, so the same reads
// re-fire on every bid / listener churn. These helpers keep the filtering logic
// pure and unit-testable; the caller owns the module-level attempted-id Set.

/** Sentinel sellerId for system-owned lots; it never has a profile doc. */
export const SELLER_SYSTEM_SENTINEL = 'seller-system';

/** Distinct, truthy, non-sentinel seller ids from a list of auction sellerIds. */
export function distinctSellerIds(
  auctionSellerIds: ReadonlyArray<string | undefined | null>
): string[] {
  const out = new Set<string>();
  for (const id of auctionSellerIds) {
    if (id && id !== SELLER_SYSTEM_SENTINEL) out.add(id);
  }
  return Array.from(out);
}

/**
 * Seller ids still worth fetching: not already loaded, not previously attempted
 * (negative cache), and never the system sentinel. `attempted` should hold ids
 * whose fetch came back a GENUINE miss (no profile doc existed at read time) so
 * a profile-less seller is never re-fetched.
 */
export function nextMissingSellerIds(
  sellerIds: ReadonlyArray<string>,
  attempted: ReadonlySet<string>,
  hasProfile: (id: string) => boolean
): string[] {
  return sellerIds.filter(
    (id) => id !== SELLER_SYSTEM_SENTINEL && !attempted.has(id) && !hasProfile(id)
  );
}
