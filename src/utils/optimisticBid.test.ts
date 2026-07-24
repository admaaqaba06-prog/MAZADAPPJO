import { describe, it, expect } from 'vitest';
import { effectivePrice, optimisticResolved } from './optimisticBid';

const opt = { auctionId: 'a1', price: 30, bidderId: 'u1', bidderName: 'Me' };

describe('effectivePrice', () => {
  it('prefers a higher optimistic price for the matching auction', () => {
    expect(effectivePrice(25, opt, 'a1')).toBe(30);
  });
  it('ignores optimistic for a different auction', () => {
    expect(effectivePrice(25, opt, 'a2')).toBe(25);
  });
  it('ignores a stale optimistic once the doc meets/exceeds it', () => {
    expect(effectivePrice(30, opt, 'a1')).toBe(30);
    expect(effectivePrice(35, opt, 'a1')).toBe(35);
  });
  it('handles null overlay', () => {
    expect(effectivePrice(25, null, 'a1')).toBe(25);
  });
});

describe('optimisticResolved', () => {
  it('is true when the doc caught up', () => {
    expect(optimisticResolved(30, opt, 'a1')).toBe(true);
    expect(optimisticResolved(31, opt, 'a1')).toBe(true);
  });
  it('is false while the doc still trails', () => {
    expect(optimisticResolved(25, opt, 'a1')).toBe(false);
  });
  it('is true (nothing to hold) for null or mismatched auction', () => {
    expect(optimisticResolved(25, null, 'a1')).toBe(true);
    expect(optimisticResolved(25, opt, 'a2')).toBe(true);
  });
});
