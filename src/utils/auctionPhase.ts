// "Open" = accepting bids. Mirrors the server's placeBid gate
// (functions/index.js: status must be 'live' or 'active').
export function isAuctionOpen(status: string | null | undefined): boolean {
  return status === 'live' || status === 'active';
}
