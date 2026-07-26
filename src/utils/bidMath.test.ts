import { describe, it, expect } from 'vitest';
import { minNextBid, totalWithPremium, isViewerWinner, sellerNet } from './bidMath';

describe('sellerNet (hammer − 5% commission)', () => {
  it('nets 95 on a 100 sale', () => {
    expect(sellerNet(100)).toBe(95);
  });
  it('buyer total and seller net bracket the hammer by ±5% (10% total take)', () => {
    expect(totalWithPremium(100)).toBe(105);
    expect(sellerNet(100)).toBe(95);
    expect(totalWithPremium(100) - sellerNet(100)).toBe(10);
  });
  it('is 0 for non-positive', () => {
    expect(sellerNet(0)).toBe(0);
    expect(sellerNet(-5)).toBe(0);
  });
});

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

describe('isViewerWinner', () => {
  it('true only when the auction highest bidder is the viewer', () => {
    expect(isViewerWinner({ currentBidderId: 'u1' }, 'u1')).toBe(true);
    expect(isViewerWinner({ currentBidderId: 'u1' }, 'u2')).toBe(false);
  });
  it('false when there is no signed-in user', () => {
    expect(isViewerWinner({ currentBidderId: 'u1' }, null)).toBe(false);
    expect(isViewerWinner({ currentBidderId: 'u1' }, undefined)).toBe(false);
    expect(isViewerWinner({ currentBidderId: 'u1' }, '')).toBe(false);
  });
  it('false when the auction has no bids or no auction at all', () => {
    expect(isViewerWinner({ currentBidderId: null }, 'u1')).toBe(false);
    expect(isViewerWinner({}, 'u1')).toBe(false);
    expect(isViewerWinner(null, 'u1')).toBe(false);
    expect(isViewerWinner(undefined, 'u1')).toBe(false);
  });
  it('never matches an empty-string bidder against an empty-string user', () => {
    expect(isViewerWinner({ currentBidderId: '' }, '')).toBe(false);
  });
});
