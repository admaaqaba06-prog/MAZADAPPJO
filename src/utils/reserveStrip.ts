/**
 * Split listing input into (a) the reserve amount, which must go ONLY to the
 * admin-only auctionSecrets doc, and (b) the auction-doc-safe payload, which is
 * written to the world-readable auctions/{id} doc and must NEVER carry the reserve.
 *
 * `T` is constrained to a plain object (not `{ reservePrice?: number }`) so that
 * callers passing input WITHOUT a reservePrice still get every other field
 * preserved on `auctionInput` via `Omit<T, 'reservePrice'>`.
 */
export function stripReserve<T extends Record<string, any>>(
  listingData: T,
): { reservePrice?: number; auctionInput: Omit<T, 'reservePrice'> } {
  const { reservePrice, ...auctionInput } = listingData as T & { reservePrice?: number };
  return { reservePrice, auctionInput: auctionInput as Omit<T, 'reservePrice'> };
}
