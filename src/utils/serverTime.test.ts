import { describe, it, expect, beforeEach } from 'vitest';
import { setServerOffset, serverNow, isAuctionFinished, computeServerOffset } from './serverTime';

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

describe('computeServerOffset (latency-compensated)', () => {
  it('is ~0 when the server clock matches local and latency is symmetric', () => {
    // sent at 1000, received at 1100 (100ms RTT), server sampled the true
    // midpoint 1050 → offset should be ~0.
    const offset = computeServerOffset({ serverEpochMs: 1050, sentAtMs: 1000, receivedAtMs: 1100 });
    expect(offset).toBe(0);
  });

  it('recovers a pure clock skew independent of latency', () => {
    // Local clock is 5000ms BEHIND the server. RTT 100ms, server midpoint = 1050
    // local, so server reports 1050 + 5000 = 6050.
    const offset = computeServerOffset({ serverEpochMs: 6050, sentAtMs: 1000, receivedAtMs: 1100 });
    expect(offset).toBe(5000);
  });

  it('recovers a negative skew (local clock ahead of server)', () => {
    const offset = computeServerOffset({ serverEpochMs: 1050 - 3000, sentAtMs: 1000, receivedAtMs: 1100 });
    expect(offset).toBe(-3000);
  });

  it('does not fold network latency into the offset', () => {
    // Same true skew (0) but a slow 400ms round-trip; the half-RTT compensation
    // keeps the offset ~0 rather than reporting a 200ms skew.
    const offset = computeServerOffset({ serverEpochMs: 1200, sentAtMs: 1000, receivedAtMs: 1400 });
    expect(offset).toBe(0);
  });

  it('rejects a non-finite server sample (returns null → keeps prior offset)', () => {
    expect(computeServerOffset({ serverEpochMs: NaN, sentAtMs: 1000, receivedAtMs: 1100 })).toBeNull();
    expect(computeServerOffset({ serverEpochMs: Infinity, sentAtMs: 1000, receivedAtMs: 1100 })).toBeNull();
  });

  it('rejects an unreliable sample with an absurd or negative round-trip', () => {
    // negative RTT (clock went backwards mid-request)
    expect(computeServerOffset({ serverEpochMs: 1050, sentAtMs: 1100, receivedAtMs: 1000 })).toBeNull();
    // > 10s RTT: too noisy to trust the half-RTT assumption
    expect(computeServerOffset({ serverEpochMs: 1050, sentAtMs: 1000, receivedAtMs: 1000 + 11_000 })).toBeNull();
  });

  it('a garbage sample never poisons serverNow (offset stays 0)', () => {
    setServerOffset(0);
    const bad = computeServerOffset({ serverEpochMs: NaN, sentAtMs: 1000, receivedAtMs: 1100 });
    if (bad !== null) setServerOffset(bad); // never runs
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(100);
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
