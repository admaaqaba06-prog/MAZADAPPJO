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
