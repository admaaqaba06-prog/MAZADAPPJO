import { describe, it, expect } from 'vitest';
const { buildBuyerRating, canSellerRateOrder } = require('./ratings');

describe('buildBuyerRating', () => {
  it('accepts 1–5 stars + optional comment', () => {
    expect(buildBuyerRating({ stars: 5, comment: ' great ' }, 10))
      .toEqual({ stars: 5, text: 'great', createdAt: 10 });
    expect(buildBuyerRating({ stars: 3 }, 1)).toEqual({ stars: 3, text: '', createdAt: 1 });
  });
  it('rejects out-of-range / non-integer stars', () => {
    expect(() => buildBuyerRating({ stars: 0 }, 1)).toThrow(/star/i);
    expect(() => buildBuyerRating({ stars: 6 }, 1)).toThrow(/star/i);
    expect(() => buildBuyerRating({ stars: 4.5 }, 1)).toThrow(/star/i);
  });
  it('rejects a comment over 500 chars', () => {
    expect(() => buildBuyerRating({ stars: 5, comment: 'x'.repeat(501) }, 1)).toThrow(/comment/i);
  });
});

describe('canSellerRateOrder', () => {
  const order = { status: 'completed', sellerId: 's1' };
  it('true for completed order by its seller with no prior rating', () => {
    expect(canSellerRateOrder(order, 's1', null)).toBe(true);
  });
  it('false when not the seller', () => {
    expect(canSellerRateOrder(order, 's2', null)).toBe(false);
  });
  it('false when not completed', () => {
    expect(canSellerRateOrder({ ...order, status: 'shipped' }, 's1', null)).toBe(false);
  });
  it('false when already rated', () => {
    expect(canSellerRateOrder(order, 's1', { id: 'r1' })).toBe(false);
  });
  it('false on null order', () => { expect(canSellerRateOrder(null, 's1', null)).toBe(false); });
});
