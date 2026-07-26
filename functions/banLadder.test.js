import { describe, it, expect } from 'vitest';
const {
  FIRST_COOLDOWN_MS,
  REPEAT_SUSPENSION_MS,
  resolvePaymentDefaultBan,
  isEffectivelyBlocked,
} = require('./banLadder');

const NOW = 1_000_000_000_000;

describe('resolvePaymentDefaultBan (the ladder)', () => {
  it('1st strike → 48h cooldown', () => {
    expect(resolvePaymentDefaultBan(1, NOW)).toEqual({
      blockedUntil: NOW + FIRST_COOLDOWN_MS,
      blockedReason: 'payment_default',
    });
    expect(FIRST_COOLDOWN_MS).toBe(48 * 3600 * 1000);
  });
  it('2nd strike → 3-month suspension', () => {
    expect(resolvePaymentDefaultBan(2, NOW)).toEqual({
      blockedUntil: NOW + REPEAT_SUSPENSION_MS,
      blockedReason: 'payment_default_repeat',
    });
  });
  it('3rd+ strike stays at the 3-month tier (permanent is admin/fraud only)', () => {
    expect(resolvePaymentDefaultBan(5, NOW).blockedReason).toBe('payment_default_repeat');
    expect(resolvePaymentDefaultBan(5, NOW).blockedUntil).toBe(NOW + REPEAT_SUSPENSION_MS);
  });
  it('treats a missing/0 count as the first strike (never no-block)', () => {
    expect(resolvePaymentDefaultBan(0, NOW).blockedReason).toBe('payment_default');
  });
});

describe('isEffectivelyBlocked', () => {
  it('is false when not blocked', () => {
    expect(isEffectivelyBlocked({ isBlocked: false }, NOW)).toBe(false);
    expect(isEffectivelyBlocked({}, NOW)).toBe(false);
    expect(isEffectivelyBlocked(null, NOW)).toBe(false);
  });
  it('permanent ban (blockedUntil null) stays blocked forever', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: null }, NOW)).toBe(true);
    expect(isEffectivelyBlocked({ isBlocked: true }, NOW)).toBe(true);
  });
  it('active cooldown (future blockedUntil) is blocked', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: NOW + 1000 }, NOW)).toBe(true);
  });
  it('expired cooldown (past blockedUntil) is NOT blocked', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: NOW - 1 }, NOW)).toBe(false);
  });
  it('accepts a Firestore Timestamp and a {seconds} shape', () => {
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: { toMillis: () => NOW + 5000 } }, NOW)).toBe(true);
    expect(isEffectivelyBlocked({ isBlocked: true, blockedUntil: { seconds: (NOW - 10000) / 1000 } }, NOW)).toBe(false);
  });
});
