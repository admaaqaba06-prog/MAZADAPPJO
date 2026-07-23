import type { AuctionItem } from '../types';

/**
 * Split listing input into (a) the reserve amount, which must go ONLY to the
 * admin-only auctionSecrets doc, and (b) the auction-doc-safe payload, which is
 * written to the world-readable auctions/{id} doc and must NEVER carry the reserve.
 */
export function stripReserve<T extends { reservePrice?: number }>(
  listingData: T,
): { reservePrice?: number; auctionInput: Omit<T, 'reservePrice'> } {
  const { reservePrice, ...auctionInput } = listingData;
  return { reservePrice, auctionInput };
}
