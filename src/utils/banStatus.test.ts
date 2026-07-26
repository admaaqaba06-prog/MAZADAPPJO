import { describe, it, expect } from 'vitest';
import { toMs, isEffectivelyBlocked, blockLiftsAt } from './banStatus';

const NOW = 1_700_000_000_000;

describe('toMs', () => {
  it('null / undefined -> null', () => {
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
  });
  it('passes through a number (epoch ms)', () => {
    expect(toMs(NOW)).toBe(NOW);
  });
  it('reads a Firestore Timestamp via toMillis()', () => {
    expect(toMs({ toMillis: () => NOW })).toBe(NOW);
  });
  it('reads a {seconds} shape (seconds -> ms)', () => {
    expect(toMs({ seconds: NOW / 1000 })).toBe(NOW);
  });
  it('non-finite number -> null', () => {
    expect(toMs(NaN)).toBeNull();
  });
});

describe('isEffectivelyBlocked', () => {
  it('not blocked when isBlocked is false/absent', () => {
    expect(isEffectivelyBlocked({ isBlocked: false }, NOW)).toBe(false);
    expect(isEffectivelyBlocked(null, NOW)).toBe(false);
    expect(isEffectivelyBlocked(undefined, NOW)).toBe(false);
  });
  it('an ACTIVE cooldown blocks (blockedUntil in the future)', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: NOW + 1000 }, NOW)).toBe(true);
  });
  it('an EXPIRED cooldown does NOT block (blockedUntil in the past)', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: NOW - 1000 }, NOW)).toBe(false);
  });
  it('the exact expiry boundary does NOT block (until <= now)', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: NOW }, NOW)).toBe(false);
  });
  it('a PERMANENT ban (blockedUntil null) stays blocked', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: null }, NOW)).toBe(true);
  });
  it('a PERMANENT ban (blockedUntil absent) stays blocked', () => {
    expect(isEffectivelyBlocked({ isBlocked: true }, NOW)).toBe(true);
  });
  it('handles a Firestore Timestamp shape (active)', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: { toMillis: () => NOW + 5000 } }, NOW)).toBe(true);
  });
  it('handles a {seconds} shape (expired)', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: { seconds: (NOW - 5000) / 1000 } }, NOW)).toBe(false);
  });
  it('defaults nowMs to Date.now() when omitted', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: Date.now() + 60_000 })).toBe(true);
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: Date.now() - 60_000 })).toBe(false);
  });
});

describe('blockLiftsAt', () => {
  it('returns the lift time in ms for a cooldown', () => {
    expect(blockLiftsAt({ blockedUntil: NOW })).toBe(NOW);
    expect(blockLiftsAt({ blockedUntil: { seconds: NOW / 1000 } })).toBe(NOW);
  });
  it('returns null for a permanent ban', () => {
    expect(blockLiftsAt({ blockedUntil: null })).toBeNull();
    expect(blockLiftsAt({})).toBeNull();
    expect(blockLiftsAt(null)).toBeNull();
  });
});
