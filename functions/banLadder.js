/**
 * Graduated, auto-expiring ban ladder for payment defaults (E2). Pure — no
 * firebase deps — so it's unit-testable and shared by the enforcer + placeBid.
 *
 * Policy: 1st non-payment (after the 24h window lapses) = 48h cooldown; a repeat
 * = 3-month suspension. Permanent bans are admin/fraud only and are represented
 * as isBlocked:true with blockedUntil == null (this module never produces one).
 */
'use strict';

const FIRST_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours
const REPEAT_SUSPENSION_MS = 90 * 24 * 60 * 60 * 1000; // ~3 months

/** Normalize a Firestore Timestamp | number(ms) | null to epoch ms (or null). */
function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Given the buyer's NEW strike count (post-increment) and now, decide the block
 * window. Returns { blockedUntil (epoch ms), blockedReason }.
 */
function resolvePaymentDefaultBan(newStrikeCount, nowMs) {
  const strikes = Math.max(1, Math.round(Number(newStrikeCount) || 1));
  if (strikes <= 1) {
    return { blockedUntil: nowMs + FIRST_COOLDOWN_MS, blockedReason: 'payment_default' };
  }
  return { blockedUntil: nowMs + REPEAT_SUSPENSION_MS, blockedReason: 'payment_default_repeat' };
}

/**
 * Is the user currently blocked FROM BIDDING? Blocked when isBlocked is set AND
 * either there's no expiry (permanent) or the expiry is still in the future.
 * An elapsed blockedUntil means the cooldown lapsed → not blocked.
 */
function isEffectivelyBlocked(user, nowMs) {
  if (!user || user.isBlocked !== true) return false;
  const until = toMs(user.blockedUntil);
  if (until == null) return true; // permanent / admin ban
  return until > nowMs;
}

module.exports = {
  FIRST_COOLDOWN_MS,
  REPEAT_SUSPENSION_MS,
  toMs,
  resolvePaymentDefaultBan,
  isEffectivelyBlocked,
};
