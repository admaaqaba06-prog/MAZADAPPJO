import { describe, it, expect } from 'vitest';
import { isAuctionOpen } from './auctionPhase';

describe('isAuctionOpen', () => {
  it('is true only for live/active', () => {
    expect(isAuctionOpen('live')).toBe(true);
    expect(isAuctionOpen('active')).toBe(true);
  });
  it('is false for upcoming, completed, and missing', () => {
    expect(isAuctionOpen('upcoming')).toBe(false);
    expect(isAuctionOpen('completed')).toBe(false);
    expect(isAuctionOpen(undefined)).toBe(false);
    expect(isAuctionOpen(null)).toBe(false);
  });
});
