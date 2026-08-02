import { describe, it, expect } from 'vitest';
import { isAuctionOpen, isLiveNow, getLiveAuctions, getFirstLiveAuction, isAwaitingFirstBid, isAwaitingFirstBidDoc } from './auctionPhase';

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

describe('isAwaitingFirstBid', () => {
  it('true for a mapped first_bid item with no clock and no bids', () => {
    expect(isAwaitingFirstBid({ startMode: 'first_bid', endTime: null, totalBids: 0 })).toBe(true);
  });
  it('true when totalBids is absent entirely (never-bid item)', () => {
    expect(isAwaitingFirstBid({ startMode: 'first_bid', endTime: null })).toBe(true);
  });
  it('false once the clock has started (endTime set)', () => {
    expect(isAwaitingFirstBid({ startMode: 'first_bid', endTime: 123, totalBids: 0 })).toBe(false);
  });
  it('false once a bid has landed', () => {
    expect(isAwaitingFirstBid({ startMode: 'first_bid', endTime: null, totalBids: 1 })).toBe(false);
  });
  it('false for scheduled lots, which always have a clock', () => {
    expect(isAwaitingFirstBid({ startMode: 'scheduled', endTime: null, totalBids: 0 })).toBe(false);
  });
  it('false for null/undefined input rather than throwing', () => {
    expect(isAwaitingFirstBid(null)).toBe(false);
    expect(isAwaitingFirstBid(undefined)).toBe(false);
  });
});

describe('isAwaitingFirstBidDoc', () => {
  it('true for a live first_bid doc with no clock and no bids', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', totalBids: 0 })).toBe(true);
  });
  it('true when totalBids is absent entirely (never-bid doc)', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid' })).toBe(true);
  });
  it('false once a bid has landed', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', totalBids: 1 })).toBe(false);
  });
  it('false once the server has stamped endsAt', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', endsAt: { seconds: 5 }, totalBids: 0 })).toBe(false);
  });
  it('false when a legacy endTime is present', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', endTime: 123, totalBids: 0 })).toBe(false);
  });
  it('false for scheduled lots, which always have a clock', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'scheduled', totalBids: 0 })).toBe(false);
    expect(isAwaitingFirstBidDoc({ totalBids: 0 })).toBe(false);
  });
  it('false for null/undefined input rather than throwing', () => {
    expect(isAwaitingFirstBidDoc(null)).toBe(false);
    expect(isAwaitingFirstBidDoc(undefined)).toBe(false);
  });
});
