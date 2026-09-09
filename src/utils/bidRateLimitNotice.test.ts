import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isRateLimited,
  cooldownUntil,
  minutesRemaining,
  rateLimitMessage,
  BIDDING_RATE_LIMITED,
} from './bidRateLimitNotice';

const NOW = 1_700_000_000_000;

describe('isRateLimited', () => {
  it('recognises the server code on either field', () => {
    // placeBid returns the code in `code` and mirrors it into `message` so the
    // existing message-substring paths (bidErrors) keep working.
    expect(isRateLimited({ code: BIDDING_RATE_LIMITED })).toBe(true);
    expect(isRateLimited({ message: BIDDING_RATE_LIMITED })).toBe(true);
  });

  it('does not fire on other refusals', () => {
    expect(isRateLimited({ message: 'MEMBERSHIP_REQUIRED' })).toBe(false);
    expect(isRateLimited({ code: 'BID_TOO_FAST' })).toBe(false);
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited({})).toBe(false);
  });
});

describe('cooldownUntil', () => {
  it('uses the server-supplied retry window', () => {
    expect(cooldownUntil({ code: BIDDING_RATE_LIMITED, retryAfterMs: 900_000 }, NOW)).toBe(NOW + 900_000);
  });

  it('is zero when not rate limited', () => {
    expect(cooldownUntil({ message: 'ended' }, NOW)).toBe(0);
  });

  it('falls back to a minute rather than zero on a missing window', () => {
    // A zero would re-enable the button instantly and drop the user straight
    // back into a refusal loop.
    for (const bad of [undefined, null, 0, -5, NaN, 'abc' as unknown as number]) {
      expect(cooldownUntil({ code: BIDDING_RATE_LIMITED, retryAfterMs: bad as number }, NOW)).toBe(NOW + 60_000);
    }
  });

  it('caps an absurd window so the UI cannot be locked out indefinitely', () => {
    const year = 365 * 24 * 60 * 60 * 1000;
    expect(cooldownUntil({ code: BIDDING_RATE_LIMITED, retryAfterMs: year }, NOW)).toBe(NOW + 24 * 60 * 60 * 1000);
  });
});

describe('minutesRemaining', () => {
  it('rounds UP so "1 minute" never means "any second now"', () => {
    expect(minutesRemaining(NOW + 61_000, NOW)).toBe(2);
    expect(minutesRemaining(NOW + 1, NOW)).toBe(1);
  });

  it('is zero once elapsed', () => {
    expect(minutesRemaining(NOW, NOW)).toBe(0);
    expect(minutesRemaining(NOW - 5000, NOW)).toBe(0);
  });
});

describe('rateLimitMessage', () => {
  it('is bilingual', () => {
    expect(rateLimitMessage(NOW + 600_000, NOW, false)).toContain('bidding limit');
    expect(rateLimitMessage(NOW + 600_000, NOW, true)).toContain('حد المزايدات');
  });

  it('pluralises correctly', () => {
    expect(rateLimitMessage(NOW + 60_000, NOW, false)).toContain('1 minute.');
    expect(rateLimitMessage(NOW + 120_000, NOW, false)).toContain('2 minutes.');
  });

  it('degrades to the generic line with no countdown', () => {
    expect(rateLimitMessage(NOW, NOW, false)).toBe("You've reached the bidding limit. Please try again later.");
  });

  it('never discloses the limit, the count or the window', () => {
    // A bidder who learns the exact cap learns exactly how to pace a bot just
    // under it. The server does not send these; neither may the copy invent them.
    for (const isAr of [true, false]) {
      const msg = rateLimitMessage(NOW + 900_000, NOW, isAr);
      expect(msg).not.toMatch(/\b30\b|\b100\b/); // the hourly / daily caps
      expect(msg.toLowerCase()).not.toContain('per hour');
      expect(msg.toLowerCase()).not.toContain('per day');
    }
  });
});

describe('the client cannot be the enforcement', () => {
  const ctx = readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');

  it('placeBid records the SERVER\'s cooldown rather than inventing one', () => {
    expect(ctx).toContain('if (isRateLimited(result.data))');
    expect(ctx).toContain('cooldownUntil(result.data, Date.now())');
  });

  it('the local guard short-circuits but the server still decides', () => {
    // The early return is an optimisation. Clearing the ref sends the request,
    // and the server refuses it — that is where the limit lives.
    expect(ctx).toContain('if (bidCooldownUntilRef.current > now)');
    // The guard only ever RETURNS a message — it never writes state, never
    // marks a bid placed, and nothing downstream trusts it. Structural, not
    // prose: the whole block is a message-shaped early return.
    const guard = ctx.slice(ctx.indexOf('if (bidCooldownUntilRef.current > now)'), ctx.indexOf('// 1. Double check blocking status'));
    expect(guard).toContain('rateLimitMessage(bidCooldownUntilRef.current, now,');
    expect(guard).toContain('success: false');
    expect(guard).not.toMatch(/setDoc|updateDoc|callable|logAnalyticsEvent/);
  });

  it('a successful bid clears a stale local deadline', () => {
    expect(ctx).toContain('if (bidCooldownUntilRef.current !== 0)');
  });

  it('the server-side limiter is the one wired into placeBid', () => {
    const fn = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
    expect(fn).toContain("require('./bidRateLimit')");
    expect(fn).toContain('const rateVerdict = evaluateBidRateLimit(');
    // Inside the transaction, against the user doc already read there.
    const placeBid = fn.slice(fn.indexOf('exports.placeBid'), fn.indexOf('exports.releaseEscrow'));
    expect(placeBid.indexOf('db.runTransaction')).toBeLessThan(placeBid.indexOf('evaluateBidRateLimit('));
    expect(placeBid).toContain('readBidRateLimitState(userData)');
  });

  it('the attempt is counted before any bid validation can return', () => {
    // Counting only SUCCESSFUL bids left the limiter bypassable by sending
    // deliberately invalid amounts — those paths returned before any write.
    const fn = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
    const placeBid = fn.slice(fn.indexOf('exports.placeBid'), fn.indexOf('exports.releaseEscrow'));
    const counted = placeBid.indexOf('bidRateLimit: rateVerdict.nextState');
    expect(counted).toBeGreaterThan(-1);
    expect(counted).toBeLessThan(placeBid.indexOf('This auction is not accepting bids'));
    expect(counted).toBeLessThan(placeBid.indexOf('Minimum bid of'));
  });

  it('the rate-limit refusal is treated as an expected outcome, not a health incident', () => {
    const bidErrors = readFileSync(new URL('./bidErrors.ts', import.meta.url), 'utf8');
    expect(bidErrors).toContain('BIDDING_RATE_LIMITED');
    expect(bidErrors).toContain('BID_TOO_FAST');
  });
});
