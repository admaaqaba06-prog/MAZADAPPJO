import { describe, it, expect } from 'vitest';
import { isAuctionOpen, isLiveNow, getLiveAuctions, getFirstLiveAuction } from './auctionPhase';

const NOW = 1_000_000;

describe('isLiveNow', () => {
  it('true for live with no endTime or future endTime', () => {
    expect(isLiveNow({ status: 'live' }, NOW)).toBe(true);
    expect(isLiveNow({ status: 'live', endTime: NOW + 1000 }, NOW)).toBe(true);
  });
  it('false for live whose endTime has passed (ended stream)', () => {
    expect(isLiveNow({ status: 'live', endTime: NOW - 1 }, NOW)).toBe(false);
  });
  it('false for non-live statuses', () => {
    expect(isLiveNow({ status: 'upcoming' }, NOW)).toBe(false);
    expect(isLiveNow({ status: 'completed' }, NOW)).toBe(false);
  });
});

describe('getLiveAuctions / getFirstLiveAuction', () => {
  const items = [
    { id: 'a', status: 'completed' },
    { id: 'b', status: 'live', endTime: NOW - 5 }, // ended
    { id: 'c', status: 'live', endTime: NOW + 5 }, // genuinely live
    { id: 'd', status: 'live' },                   // live, no endTime
  ];
  it('getLiveAuctions returns only genuinely-live items', () => {
    expect(getLiveAuctions(items, NOW).map(x => x.id)).toEqual(['c', 'd']);
  });
  it('getFirstLiveAuction returns the first genuinely-live item', () => {
    expect(getFirstLiveAuction(items, NOW)?.id).toBe('c');
  });
  it('getFirstLiveAuction returns null when nothing is live (dead-stream guard)', () => {
    expect(getFirstLiveAuction([{ id: 'a', status: 'completed' }, { id: 'b', status: 'live', endTime: NOW - 1 }], NOW)).toBeNull();
    expect(getFirstLiveAuction([], NOW)).toBeNull();
  });
});

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
