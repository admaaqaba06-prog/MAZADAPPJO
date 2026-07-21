import { describe, it, expect } from 'vitest';
import { minNextBid, totalWithPremium } from './bidMath';

describe('totalWithPremium', () => {
  // Double-round at fils (1/1000 JOD): matches the server order totalDue.
  const expected = (x: number) =>
    (Math.round(x * 1000) + Math.round(Math.round(x * 1000) * 0.05)) / 1000;

  it('double-rounds at the fils level for representative prices', () => {
    for (const price of [1, 1.001, 12.345, 0.999, 47.25, 100, 3.33]) {
      expect(totalWithPremium(price)).toBe(expected(price));
    }
  });
});

describe('minNextBid', () => {
  it('first bid (no bids yet) equals the current/starting price', () => {
    expect(minNextBid(100, 5, 0)).toBe(100);
  });
  it('subsequent bids add the increment', () => {
    expect(minNextBid(100, 5, 3)).toBe(105);
    expect(minNextBid(360, 25, 12)).toBe(385);
  });
  it('falls back to +10 when increment missing (matches server)', () => {
    expect(minNextBid(100, undefined, 2)).toBe(110);
    expect(minNextBid(100, 0, 2)).toBe(110);
  });
});
