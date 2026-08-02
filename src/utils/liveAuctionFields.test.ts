import { describe, it, expect } from 'vitest';
import { resolveEndTime, mapLiveAuctionFields } from './liveAuctionFields';

describe('resolveEndTime', () => {
  it('returns null for an awaiting-first-bid doc instead of fabricating a clock', () => {
    expect(resolveEndTime({ startMode: 'first_bid', totalBids: 0 })).toBeNull();
  });

  it('prefers endsAt over endTime', () => {
    expect(resolveEndTime({ endsAt: 5000, endTime: 9000 })).toBe(5000);
  });

  it('falls back to endTime when endsAt is absent', () => {
    expect(resolveEndTime({ endTime: 9000 })).toBe(9000);
  });

  it('returns a real clock for a first_bid lot whose first bid already landed', () => {
    expect(resolveEndTime({ startMode: 'first_bid', totalBids: 1, endsAt: 7000 })).toBe(7000);
  });

  it('still fabricates for a SCHEDULED doc missing both fields (unchanged behaviour)', () => {
    const t = resolveEndTime({ startMode: 'scheduled' });
    expect(typeof t).toBe('number');
    expect(t as number).toBeGreaterThan(Date.now());
  });

  it('falls back to a future number when the value is unparseable', () => {
    const t = resolveEndTime({ endsAt: 'not-a-date' });
    expect(typeof t).toBe('number');
    expect(t as number).toBeGreaterThan(Date.now());
  });
});

describe('mapLiveAuctionFields', () => {
  it('carries the null endTime through so isAwaitingFirstBid can see it', () => {
    expect(mapLiveAuctionFields({ startMode: 'first_bid', totalBids: 0 }).endTime).toBeNull();
  });

  it('carries a real endTime through unchanged', () => {
    expect(mapLiveAuctionFields({ endsAt: 4242 }).endTime).toBe(4242);
  });
});
