/**
 * Price and CTA copy for the bidding surfaces.
 *
 * A `first_bid` lot opens with `currentPrice === startingPrice` and
 * `totalBids === 0`, and the server deliberately allows the first bid to EQUAL
 * that price (functions/index.js bidPricing). Labelling it "Current bid" next to
 * "0 bids" made a correct opening bid read as a broken increment — the bid math
 * was never wrong, the label was.
 *
 * Absent counts are treated as zero: a doc mid-write or predating the counter
 * must not claim a bid that does not exist.
 */
export function priceLabel(totalBids: number | undefined, isAr: boolean): string {
  const bidded = (totalBids || 0) > 0;
  if (bidded) return isAr ? 'المزايدة الحالية' : 'Current bid';
  return isAr ? 'السعر الافتتاحي' : 'Opening price';
}

export function bidCtaLabel(totalBids: number | undefined, isAr: boolean): string {
  const bidded = (totalBids || 0) > 0;
  if (bidded) return isAr ? 'قدّم مزايدة' : 'Place Bid';
  // Matches the feed section copy in DiscoveryFeedView (`⚡ كن أول مزايد`) so the
  // card a visitor tapped and the screen it opens use the same words.
  return isAr ? 'كن أول مزايد' : 'Be the first to bid';
}
