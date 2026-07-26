// Mirrors the server rule in functions/index.js placeBid:
// first bid may equal currentPrice; later bids need currentPrice + (minIncrement || 10).
export function minNextBid(currentPrice: number, minIncrement: number | undefined, totalBids: number): number {
  const inc = minIncrement && minIncrement > 0 ? minIncrement : 10;
  return totalBids > 0 ? currentPrice + inc : currentPrice;
}

/**
 * Total due on a win: hammer price + 5% buyer's premium, double-rounded at the
 * fils (1/1000 JOD) level. Single source of truth mirroring the server order
 * totalDue (functions/index.js placeBid + scheduledAuctionCloser).
 */
export function totalWithPremium(priceJod: number): number {
  const fils = Math.round(priceJod * 1000);
  return (fils + Math.round(fils * 0.05)) / 1000;
}

/**
 * Seller net proceeds on a sale: hammer price MINUS Mazad's 5% seller commission
 * (95 on a 100 sale). Mirrors sellerNetFils in functions/settlement.js — the
 * display counterpart of totalWithPremium. Mazad's total take is 10% (buyer +5%,
 * seller -5%).
 */
export function sellerNet(priceJod: number): number {
  const fils = Math.round(priceJod * 1000);
  if (fils <= 0) return 0;
  return (fils - Math.round(fils * 0.05)) / 1000;
}

/**
 * Did this viewer win the auction? Server-authoritative check: the highest
 * bidder recorded ON THE AUCTION DOC (`currentBidderId`) is the winner.
 * Deliberately does NOT consult the local `bids` cache — that list is
 * localStorage-backed and can be empty for a real winner (another device,
 * cleared storage), which previously dropped winners into the spectator
 * "browse other auctions" card.
 */
export function isViewerWinner(
  auction: { currentBidderId?: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  return !!userId && !!auction?.currentBidderId && auction.currentBidderId === userId;
}
