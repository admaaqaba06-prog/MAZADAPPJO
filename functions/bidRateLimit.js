/**
 * Server-side, per-USER bidding rate limit. Pure (no firebase deps) so it is
 * unit-testable under Vitest the same way settlement.js is, and so the whole
 * decision is one function the transaction in placeBid can call.
 *
 * WHY PER-USER AND NOT PER-AUCTION: the limit is a platform-wide anti-spam
 * measure, so the counters hang off the BIDDER, not the lot. Switching auction
 * ids does not reset anything. Neither does refreshing, logging out and back
 * in, or editing frontend state — the state lives on `users/{uid}` and the
 * decision is made inside the placeBid transaction, which already reads and
 * writes that doc. That is also why this adds ZERO extra reads and zero extra
 * documents: the counters ride along on a write placeBid was making anyway.
 *
 * WHY NOT IP: an IP is shared (carrier NAT is the norm in Jordan) and trivially
 * rotated. The authenticated uid is the only identity worth limiting on here.
 * IP could be layered on later as a SECONDARY signal; it must not be primary.
 *
 * CONCURRENCY: the caller runs this inside the same Firestore transaction that
 * reads and writes `users/{uid}`. Two bids racing therefore serialize on that
 * document — the loser retries, re-reads the incremented counter, and is
 * counted. Evaluating outside a transaction would let N concurrent requests all
 * read the same pre-increment count and all pass.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Defaults. The task called for "sensible defaults" and these mirror the
 * client-side window that used to be the only limit (10/min was far looser than
 * it looked, because it was pure frontend state).
 */
const DEFAULT_MAX_BIDS_PER_HOUR = 30;
const DEFAULT_MAX_BIDS_PER_DAY = 100;
const DEFAULT_COOLDOWN_MINUTES = 15;
/** Pre-existing burst guard, preserved verbatim from the old inline check. */
const DEFAULT_MIN_BID_INTERVAL_MS = 1500;

/** Client-safe codes. Neither carries a limit, a count or a configuration value. */
const RATE_LIMITED = 'BIDDING_RATE_LIMITED';
const TOO_FAST = 'BID_TOO_FAST';

/**
 * Read one integer from the environment, clamped. A malformed or absurd value
 * falls back to the default rather than disabling the limiter — a typo in a
 * deploy variable must never silently switch anti-spam off.
 */
function readIntEnv(env, name, fallback, min, max) {
  const raw = Number((env || {})[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/**
 * The live configuration. Configurable per deploy, resolved in ONE place so no
 * limit is ever hardcoded at a call site.
 *
 * NOTE these values are deliberately never returned to a client. The rejection
 * says "you have reached the limit", not what the limit is or how far into it
 * you are — publishing the numbers just tells a scripted bidder how to pace.
 */
function bidRateLimitConfig(env = process.env) {
  return {
    maxBidsPerHour: readIntEnv(env, 'MAX_BIDS_PER_HOUR', DEFAULT_MAX_BIDS_PER_HOUR, 1, 10000),
    maxBidsPerDay: readIntEnv(env, 'MAX_BIDS_PER_DAY', DEFAULT_MAX_BIDS_PER_DAY, 1, 100000),
    cooldownMs: readIntEnv(env, 'COOLDOWN_MINUTES', DEFAULT_COOLDOWN_MINUTES, 1, 1440) * 60 * 1000,
    minBidIntervalMs: readIntEnv(env, 'MIN_BID_INTERVAL_MS', DEFAULT_MIN_BID_INTERVAL_MS, 0, 60000),
  };
}

/**
 * Pull the limiter state off a user doc, tolerating the pre-limiter shape.
 *
 * Users who bid before this shipped have a top-level `lastBidAt` and no
 * `bidRateLimit` map. They must not be treated as brand-new (which would hand
 * them a fresh burst allowance) NOR crash on the missing map — so the legacy
 * `lastBidAt` is carried into the new state and the counters start at zero.
 */
function readBidRateLimitState(userData) {
  const d = userData || {};
  const s = d.bidRateLimit || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    hourStartMs: num(s.hourStartMs),
    hourCount: num(s.hourCount),
    dayStartMs: num(s.dayStartMs),
    dayCount: num(s.dayCount),
    cooldownUntilMs: num(s.cooldownUntilMs),
    lastBidAtMs: num(s.lastBidAtMs) || num(d.lastBidAt),
  };
}

/**
 * Decide whether this bid attempt may proceed, and what the counters become.
 *
 * Returns:
 *   allowed      — may the bid go ahead
 *   code         — client-safe rejection code, null when allowed
 *   retryAfterMs — how long until it is worth trying again (0 when allowed)
 *   persist      — whether nextState is worth writing (see below)
 *   nextState    — the state to store on the user doc
 *
 * `persist` exists so a user hammering the button during a cooldown does not
 * generate a write per attempt: the cooldown is already recorded, re-writing it
 * unchanged would just burn quota on exactly the traffic pattern being
 * defended against. It also means a blocked user cannot EXTEND their own
 * cooldown by retrying — the deadline is set once, when the limit is crossed.
 */
function evaluateBidRateLimit(state, nowMs, config) {
  const s = state || {};
  const cfg = config || bidRateLimitConfig();

  // 1. Serving an active cooldown. Checked first so it short-circuits before
  //    any window arithmetic, and returns no new state to write.
  if (s.cooldownUntilMs > nowMs) {
    return {
      allowed: false,
      code: RATE_LIMITED,
      retryAfterMs: s.cooldownUntilMs - nowMs,
      persist: false,
      nextState: s,
    };
  }

  // 2. Burst guard (the pre-existing 1.5s rule). Deliberately NOT a cooldown
  //    trigger — a double-tapped button is not abuse, it is a double tap.
  if (cfg.minBidIntervalMs > 0 && nowMs - s.lastBidAtMs < cfg.minBidIntervalMs) {
    return {
      allowed: false,
      code: TOO_FAST,
      retryAfterMs: cfg.minBidIntervalMs - (nowMs - s.lastBidAtMs),
      persist: false,
      nextState: s,
    };
  }

  // 3. Roll the fixed windows. A window whose start is missing, in the future
  //    (clock skew / forged value) or older than its span restarts at now.
  let { hourStartMs, hourCount, dayStartMs, dayCount } = s;
  if (!hourStartMs || hourStartMs > nowMs || nowMs - hourStartMs >= HOUR_MS) {
    hourStartMs = nowMs;
    hourCount = 0;
  }
  if (!dayStartMs || dayStartMs > nowMs || nowMs - dayStartMs >= DAY_MS) {
    dayStartMs = nowMs;
    dayCount = 0;
  }

  // 4. Over either limit — open a cooldown. Both limits are checked, so a user
  //    who paces themselves under the hourly cap still meets the daily one.
  if (hourCount >= cfg.maxBidsPerHour || dayCount >= cfg.maxBidsPerDay) {
    const cooldownUntilMs = nowMs + cfg.cooldownMs;
    return {
      allowed: false,
      code: RATE_LIMITED,
      retryAfterMs: cfg.cooldownMs,
      persist: true,
      nextState: {
        hourStartMs, hourCount, dayStartMs, dayCount,
        cooldownUntilMs,
        lastBidAtMs: s.lastBidAtMs,
      },
    };
  }

  // 5. Allowed. Both counters advance — the daily one is not a rollup of the
  //    hourly windows, it is its own budget.
  return {
    allowed: true,
    code: null,
    retryAfterMs: 0,
    persist: true,
    nextState: {
      hourStartMs,
      hourCount: hourCount + 1,
      dayStartMs,
      dayCount: dayCount + 1,
      cooldownUntilMs: 0,
      lastBidAtMs: nowMs,
    },
  };
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  RATE_LIMITED,
  TOO_FAST,
  DEFAULT_MAX_BIDS_PER_HOUR,
  DEFAULT_MAX_BIDS_PER_DAY,
  DEFAULT_COOLDOWN_MINUTES,
  DEFAULT_MIN_BID_INTERVAL_MS,
  bidRateLimitConfig,
  readBidRateLimitState,
  evaluateBidRateLimit,
};
