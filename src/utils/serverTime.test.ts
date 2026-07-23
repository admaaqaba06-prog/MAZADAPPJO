import { describe, it, expect, beforeEach } from 'vitest';
import { setServerOffset, serverNow, isAuctionFinished } from './serverTime';

describe('serverNow / setServerOffset', () => {
  beforeEach(() => setServerOffset(0));

  it('reflects a set offset', () => {
    setServerOffset(5000);
    const delta = serverNow() - Date.now();
    // Allow a few ms of clock drift between the two Date.now() reads.
    expect(delta).toBeGreaterThanOrEqual(4900);
    expect(delta).toBeLessThanOrEqual(5100);
  });

  it('defaults to no offset', () => {
    const delta = serverNow() - Date.now();
    expect(Math.abs(delta)).toBeLessThan(100);
  });

  it('accepts a negative offset (local clock ahead of server)', () => {
    setServerOffset(-3000);
    const delta = serverNow() - Date.now();
    expect(delta).toBeGreaterThanOrEqual(-3100);
    expect(delta).toBeLessThanOrEqual(-2900);
  });
});

describe('isAuctionFinished', () => {
  const now = 1_000_000;

  it('is true when status is completed (even if endTime is in the future)', () => {
    expect(isAuctionFinished({ status: 'completed', endTime: now + 60_000 }, now)).toBe(true);
  });

  it('is true when endTime is at or before now', () => {
    expect(isAuctionFinished({ status: 'live', endTime: now }, now)).toBe(true);
    expect(isAuctionFinished({ status: 'live', endTime: now - 1 }, now)).toBe(true);
  });

  it('is false when endTime is in the future (anti-snipe re-clears the overlay)', () => {
    expect(isAuctionFinished({ status: 'live', endTime: now + 1 }, now)).toBe(false);
    expect(isAuctionFinished({ status: 'live', endTime: now + 15_000 }, now)).toBe(false);
  });

  it('is false for a null/undefined auction', () => {
    expect(isAuctionFinished(null, now)).toBe(false);
    expect(isAuctionFinished(undefined, now)).toBe(false);
  });

  it('is false when there is no endTime and it is not completed', () => {
    expect(isAuctionFinished({ status: 'live' }, now)).toBe(false);
  });
});
