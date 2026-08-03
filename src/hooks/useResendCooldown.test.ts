import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RESEND_COOLDOWN_S, nextCooldown } from './useResendCooldown';

describe('RESEND_COOLDOWN_S', () => {
  it('is 60 — Jordanian carrier SMS can lag 10-60s, so a retry needs room', () => {
    expect(RESEND_COOLDOWN_S).toBe(60);
  });
});

describe('nextCooldown', () => {
  it('ticks down by one', () => {
    expect(nextCooldown(10)).toBe(9);
  });

  // The tick must land exactly on 0 and stop, never pass through it — a
  // negative would render "resend in -3s" and never re-enable the button.
  it('lands on zero and stops', () => {
    expect(nextCooldown(1)).toBe(0);
    expect(nextCooldown(0)).toBe(0);
  });

  it('never goes negative from a bad start', () => {
    expect(nextCooldown(-5)).toBe(0);
  });
});

describe('useResendCooldown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // The hook itself needs React to run. These cover the timer contract through
  // the same pure step function the hook uses, which is where the off-by-one
  // and the negative-countdown bugs would live.
  it('counts a full window down to zero in exactly that many ticks', () => {
    let v = RESEND_COOLDOWN_S;
    let ticks = 0;
    while (v > 0) {
      v = nextCooldown(v);
      ticks++;
      if (ticks > 1000) throw new Error('cooldown never reached zero');
    }
    expect(ticks).toBe(RESEND_COOLDOWN_S);
    expect(v).toBe(0);
  });
});
