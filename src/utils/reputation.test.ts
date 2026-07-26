import { describe, it, expect } from 'vitest';
import { computeReputation, buyerReputation, sellerReputation } from './reputation';

const R = [
  { direction: 'seller_rates_buyer', buyerId: 'b1', stars: 5 },
  { direction: 'seller_rates_buyer', buyerId: 'b1', stars: 3 },
  { direction: 'mazad_rates_buyer',  buyerId: 'b1', stars: 1 },
  { direction: 'buyer_rates_auction', vendorId: 's1', stars: 4 },
  { direction: 'buyer_rates_auction', vendorId: 's1', stars: 2 },
];

describe('buyerReputation', () => {
  it('averages seller_rates_buyer for the buyer (excludes admin by default)', () => {
    expect(buyerReputation(R, 'b1')).toEqual({ average: 4, count: 2 });
  });
  it('can include mazad_rates_buyer', () => {
    expect(buyerReputation(R, 'b1', { includeAdmin: true })).toEqual({ average: 3, count: 3 });
  });
  it('empty for an unrated buyer', () => {
    expect(buyerReputation(R, 'bX')).toEqual({ average: null, count: 0 });
  });
});

describe('sellerReputation', () => {
  it('averages buyer_rates_auction by vendorId', () => {
    expect(sellerReputation(R, 's1')).toEqual({ average: 3, count: 2 });
  });
});
