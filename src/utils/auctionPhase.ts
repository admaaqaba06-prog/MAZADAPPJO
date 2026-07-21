// "Open" = accepting bids. Mirrors the server's placeBid gate
// (functions/index.js: status must be 'live' or 'active').
export function isAuctionOpen(status: string | null | undefined): boolean {
  return status === 'live' || status === 'active';
}

type LiveCheckable = { status: string; endTime?: number | null };

/** Genuinely live right now: status 'live' AND not past its end time. */
export function isLiveNow(auction: LiveCheckable, now: number = Date.now()): boolean {
  return auction.status === 'live' && (!auction.endTime || auction.endTime > now);
}

export function getLiveAuctions<T extends LiveCheckable>(auctions: T[], now: number = Date.now()): T[] {
  return auctions.filter(a => isLiveNow(a, now));
}

/**
 * Dead-stream guard: the only sanctioned way to pick a live auction to route
 * into. Returns null when nothing is genuinely live — callers must NOT fall
 * back to auctions[0] (that dumps users into an ended/empty stream).
 */
export function getFirstLiveAuction<T extends LiveCheckable>(auctions: T[], now: number = Date.now()): T | null {
  return getLiveAuctions(auctions, now)[0] ?? null;
}
