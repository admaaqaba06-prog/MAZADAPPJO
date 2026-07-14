import { describe, it, expect } from 'vitest';
import { minNextBid } from './bidMath';

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
