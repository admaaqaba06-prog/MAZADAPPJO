// Mirrors the server rule in functions/index.js placeBid:
// first bid may equal currentPrice; later bids need currentPrice + (minIncrement || 10).
export function minNextBid(currentPrice: number, minIncrement: number | undefined, totalBids: number): number {
  const inc = minIncrement && minIncrement > 0 ? minIncrement : 10;
  return totalBids > 0 ? currentPrice + inc : currentPrice;
}
