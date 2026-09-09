import { describe, it, expect } from 'vitest';
import {
  bidRateLimitConfig,
  readBidRateLimitState,
  evaluateBidRateLimit,
  HOUR_MS,
  DAY_MS,
  DEFAULT_MAX_BIDS_PER_HOUR,
  DEFAULT_MAX_BIDS_PER_DAY,
  DEFAULT_COOLDOWN_MINUTES,
  DEFAULT_MIN_BID_INTERVAL_MS,
} from './bidRateLimit.js';

const NOW = 1_700_000_000_000;
const CFG = bidRateLimitConfig({});

/**
 * Drive N attempts through the limiter the way placeBid does: each attempt
 * feeds the PREVIOUS attempt's nextState back in. `persist: false` verdicts
 * leave the state untouched, exactly as the transaction would.
 */
function runAttempts(count, { startState = {}, startMs = NOW, stepMs = 2000, config = CFG } = {}) {
  let state = readBidRateLimitState({ bidRateLimit: startState });
  const verdicts = [];
  for (let i = 0; i < count; i++) {
    const v = evaluateBidRateLimit(state, startMs + i * stepMs, config);
    verdicts.push(v);
    if (v.persist) state = v.nextState;
  }
  return { verdicts, state };
}

describe('bidRateLimitConfig', () => {
  it('has sensible defaults when nothing is configured', () => {
    expect(CFG.maxBidsPerHour).toBe(DEFAULT_MAX_BIDS_PER_HOUR);
    expect(CFG.maxBidsPerDay).toBe(DEFAULT_MAX_BIDS_PER_DAY);
    expect(CFG.cooldownMs).toBe(DEFAULT_COOLDOWN_MINUTES * 60 * 1000);
    expect(CFG.minBidIntervalMs).toBe(DEFAULT_MIN_BID_INTERVAL_MS);
  });

  it('is configurable — no limit is hardcoded at a call site', () => {
    const c = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '5', MAX_BIDS_PER_DAY: '9', COOLDOWN_MINUTES: '2' });
    expect(c.maxBidsPerHour).toBe(5);
    expect(c.maxBidsPerDay).toBe(9);
    expect(c.cooldownMs).toBe(2 * 60 * 1000);
  });

  it('a malformed env value falls back to the default rather than disabling the limit', () => {
    // A typo in a deploy variable must never silently switch anti-spam OFF.
    for (const bad of ['', 'abc', '0', '-4', undefined]) {
      expect(bidRateLimitConfig({ MAX_BIDS_PER_HOUR: bad }).maxBidsPerHour).toBe(DEFAULT_MAX_BIDS_PER_HOUR);
    }
  });
});

describe('readBidRateLimitState', () => {
  it('starts a brand-new user at zero', () => {
    expect(readBidRateLimitState({})).toEqual({
      hourStartMs: 0, hourCount: 0, dayStartMs: 0, dayCount: 0, cooldownUntilMs: 0, lastBidAtMs: 0,
    });
  });

  it('carries a pre-limiter user\'s top-level lastBidAt across', () => {
    // Users who bid before this shipped have `lastBidAt` and no map. They must
    // not be handed a fresh burst allowance by looking like a new user.
    expect(readBidRateLimitState({ lastBidAt: NOW }).lastBidAtMs).toBe(NOW);
  });

  it('prefers the map over the legacy field once the map exists', () => {
    expect(readBidRateLimitState({ lastBidAt: 1, bidRateLimit: { lastBidAtMs: NOW } }).lastBidAtMs).toBe(NOW);
  });

  it('coerces junk to zero instead of propagating NaN into the arithmetic', () => {
    const s = readBidRateLimitState({ bidRateLimit: { hourCount: 'lots', cooldownUntilMs: null } });
    expect(s.hourCount).toBe(0);
    expect(s.cooldownUntilMs).toBe(0);
  });
});

describe('the burst guard (pre-existing 1.5s rule)', () => {
  it('refuses a second bid inside the interval', () => {
    const v = evaluateBidRateLimit({ lastBidAtMs: NOW - 500 }, NOW, CFG);
    expect(v.allowed).toBe(false);
    expect(v.code).toBe('BID_TOO_FAST');
    expect(v.persist).toBe(false); // a double tap must not cost a write
  });

  it('allows the bid once the interval has elapsed', () => {
    expect(evaluateBidRateLimit({ lastBidAtMs: NOW - 1600 }, NOW, CFG).allowed).toBe(true);
  });

  it('is NOT a cooldown trigger — a double tap is not abuse', () => {
    const v = evaluateBidRateLimit({ lastBidAtMs: NOW - 100 }, NOW, CFG);
    expect(v.nextState.cooldownUntilMs || 0).toBe(0);
  });
});

describe('hourly limit', () => {
  it('allows exactly the configured number of bids, then refuses', () => {
    const { verdicts } = runAttempts(DEFAULT_MAX_BIDS_PER_HOUR + 1);
    expect(verdicts.slice(0, DEFAULT_MAX_BIDS_PER_HOUR).every((v) => v.allowed)).toBe(true);
    const last = verdicts[DEFAULT_MAX_BIDS_PER_HOUR];
    expect(last.allowed).toBe(false);
    expect(last.code).toBe('BIDDING_RATE_LIMITED');
  });

  it('rolls the window — the next hour starts a fresh budget', () => {
    const { state } = runAttempts(DEFAULT_MAX_BIDS_PER_HOUR);
    const nextHour = evaluateBidRateLimit(state, NOW + HOUR_MS + 1, CFG);
    expect(nextHour.allowed).toBe(true);
    expect(nextHour.nextState.hourCount).toBe(1);
  });
});

describe('daily limit', () => {
  it('holds even when the bidder paces themselves under the hourly cap', () => {
    // 29/hour for 24 hours never trips the hourly rule, but must still meet the
    // daily one. Spacing is one bid every 2 minutes.
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '1000', MAX_BIDS_PER_DAY: '100' });
    const { verdicts } = runAttempts(101, { stepMs: 120_000, config: cfg });
    expect(verdicts.slice(0, 100).every((v) => v.allowed)).toBe(true);
    expect(verdicts[100].allowed).toBe(false);
    expect(verdicts[100].code).toBe('BIDDING_RATE_LIMITED');
  });

  it('the daily budget is its own counter, not a rollup of hourly windows', () => {
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '10', MAX_BIDS_PER_DAY: '15' });
    // 10 in hour one, then 5 more an hour later = 15, the daily cap.
    let { state } = runAttempts(10, { config: cfg });
    const later = NOW + HOUR_MS + 1;
    for (let i = 0; i < 5; i++) {
      const v = evaluateBidRateLimit(state, later + i * 2000, cfg);
      expect(v.allowed).toBe(true);
      state = v.nextState;
    }
    // The hourly window has plenty of room; the DAY is what refuses.
    const v = evaluateBidRateLimit(state, later + 20_000, cfg);
    expect(v.allowed).toBe(false);
    expect(v.nextState.hourCount).toBeLessThan(cfg.maxBidsPerHour);
  });

  it('rolls after a day', () => {
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '1000', MAX_BIDS_PER_DAY: '3' });
    const { state } = runAttempts(3, { config: cfg });
    expect(evaluateBidRateLimit(state, NOW + DAY_MS + 1, cfg).allowed).toBe(true);
  });
});

describe('cooldown', () => {
  it('is opened when a limit is crossed, and is persisted', () => {
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2' });
    const { verdicts, state } = runAttempts(3, { config: cfg });
    expect(verdicts[2].allowed).toBe(false);
    expect(verdicts[2].persist).toBe(true);
    expect(state.cooldownUntilMs).toBe(NOW + 2 * 2000 + cfg.cooldownMs);
  });

  it('keeps refusing for its whole duration', () => {
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2', COOLDOWN_MINUTES: '15' });
    const { state } = runAttempts(3, { config: cfg });
    const midway = evaluateBidRateLimit(state, state.cooldownUntilMs - 1, cfg);
    expect(midway.allowed).toBe(false);
    expect(midway.code).toBe('BIDDING_RATE_LIMITED');
    expect(midway.retryAfterMs).toBe(1);
  });

  it('a blocked user cannot EXTEND their own cooldown by retrying', () => {
    // The deadline is set once, when the limit is crossed. Re-evaluating during
    // the cooldown must return the SAME deadline, or a hammering client would
    // lock itself out forever.
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2' });
    const { state } = runAttempts(3, { config: cfg });
    const deadline = state.cooldownUntilMs;
    for (const t of [1000, 5000, 60_000]) {
      const v = evaluateBidRateLimit(state, NOW + t, cfg);
      expect(v.nextState.cooldownUntilMs).toBe(deadline);
      expect(v.persist).toBe(false); // and costs no write
    }
  });

  it('lifts once elapsed', () => {
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2', COOLDOWN_MINUTES: '1' });
    const { state } = runAttempts(3, { config: cfg });
    // Past the cooldown AND past the hour window, so the budget has reset too.
    expect(evaluateBidRateLimit(state, state.cooldownUntilMs + HOUR_MS, cfg).allowed).toBe(true);
  });
});

describe('bypass resistance', () => {
  it('switching auctions does not reset anything — the state is per USER', () => {
    // There is no auctionId in this module at all. That is the point: the
    // counters cannot be per-lot, so bidding across 50 different lots draws on
    // one budget. This test guards against a future "reset per auction" idea.
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '3' });
    const { verdicts } = runAttempts(4, { config: cfg });
    expect(verdicts[3].allowed).toBe(false);
    expect(Object.keys(verdicts[3].nextState)).not.toContain('auctionId');
  });

  it('a re-read of the stored state (page reload, sign out and in) still refuses', () => {
    // Reloading gives the client fresh memory but re-reads the SAME user doc.
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2' });
    const { state } = runAttempts(3, { config: cfg });
    const rehydrated = readBidRateLimitState({ bidRateLimit: state });
    expect(evaluateBidRateLimit(rehydrated, NOW + 5000, cfg).allowed).toBe(false);
  });

  it('a forged FUTURE window start does not buy extra bids', () => {
    // A window that starts in the future is nonsense; treat it as "restart now"
    // rather than "this window has ages to run".
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2' });
    const forged = { hourStartMs: NOW + DAY_MS, hourCount: 0, dayStartMs: NOW, dayCount: 0, cooldownUntilMs: 0, lastBidAtMs: 0 };
    const v = evaluateBidRateLimit(forged, NOW, cfg);
    expect(v.allowed).toBe(true);
    expect(v.nextState.hourStartMs).toBe(NOW);
  });

  it('concurrent attempts against the SAME pre-read state cannot both slip past the cap', () => {
    // This models the transaction contract: two racing bids that both read the
    // state at count = cap-1. Firestore serialises them on users/{uid}, so the
    // loser retries and re-reads the INCREMENTED state — which refuses. The
    // failure this guards is evaluating outside a transaction, where both
    // requests would see the stale count and both be allowed.
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '3' });
    const { state } = runAttempts(2, { config: cfg }); // hourCount = 2, cap 3
    const shared = { ...state, lastBidAtMs: 0 };

    const first = evaluateBidRateLimit(shared, NOW + 10_000, cfg);
    expect(first.allowed).toBe(true);
    expect(first.nextState.hourCount).toBe(3);

    // The retry sees the committed state, not the stale snapshot.
    const retried = evaluateBidRateLimit({ ...first.nextState, lastBidAtMs: 0 }, NOW + 10_001, cfg);
    expect(retried.allowed).toBe(false);
    expect(retried.code).toBe('BIDDING_RATE_LIMITED');
  });
});

describe('what the client is told', () => {
  it('a refusal carries a code and a retry hint — never a limit, count or window', () => {
    const cfg = bidRateLimitConfig({ MAX_BIDS_PER_HOUR: '2' });
    const { verdicts } = runAttempts(3, { config: cfg });
    const refusal = verdicts[2];
    // nextState is server-side bookkeeping; only code + retryAfterMs are
    // surfaced by placeBid. Assert the SHAPE of what a client may be handed.
    const clientVisible = { code: refusal.code, retryAfterMs: refusal.retryAfterMs };
    expect(clientVisible.code).toBe('BIDDING_RATE_LIMITED');
    expect(clientVisible.retryAfterMs).toBe(cfg.cooldownMs);
    expect(JSON.stringify(clientVisible)).not.toContain('hourCount');
    expect(JSON.stringify(clientVisible)).not.toContain(String(cfg.maxBidsPerHour));
  });
});
