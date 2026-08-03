import { describe, expect, it } from 'vitest';
import { priceLabel, bidCtaLabel } from './bidLabels';

describe('priceLabel', () => {
  it('calls it an opening price when nobody has bid', () => {
    expect(priceLabel(0, false)).toBe('Opening price');
    expect(priceLabel(0, true)).toBe('السعر الافتتاحي');
  });

  it('calls it the current bid once a bid has landed', () => {
    expect(priceLabel(1, false)).toBe('Current bid');
    expect(priceLabel(9, true)).toBe('المزايدة الحالية');
  });

  // A doc that predates the counter, or one mid-write, must not claim a bid
  // exists. Absent is treated exactly like zero.
  it('treats a missing count as no bids', () => {
    expect(priceLabel(undefined, false)).toBe('Opening price');
  });
});

describe('bidCtaLabel', () => {
  it('invites the first bid when nobody has bid', () => {
    expect(bidCtaLabel(0, false)).toBe('Be the first to bid');
    expect(bidCtaLabel(0, true)).toBe('كن أول مزايد');
  });

  it('is a plain place-bid once bidding is open', () => {
    expect(bidCtaLabel(3, false)).toBe('Place Bid');
    expect(bidCtaLabel(3, true)).toBe('قدّم مزايدة');
  });

  it('treats a missing count as no bids', () => {
    expect(bidCtaLabel(undefined, true)).toBe('كن أول مزايد');
  });
});
