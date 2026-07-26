/**
 * Client mirror of the server ban-ladder logic (functions/banLadder.js). Kept in
 * sync so the UI never lies: an EXPIRED cooldown must not block on the client
 * either, and a permanent ban (blockedUntil == null) must still block.
 *
 * A payment default gives a graduated, auto-expiring block:
 *   1st  -> 48h cooldown        (blockedReason 'payment_default')
 *   2nd+ -> ~3-month suspension  (blockedReason 'payment_default_repeat')
 *   fraud/admin -> permanent    (blockedReason 'admin_ban', blockedUntil null)
 */
import type { User } from '../types';

type TimestampLike = number | { toMillis?: () => number; seconds?: number } | null | undefined;

/** Normalize a Firestore Timestamp | number(ms) | {seconds} | null to epoch ms (or null). */
export function toMs(v: TimestampLike): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v.toMillis === 'function') {
    const n = v.toMillis();
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Is the user currently blocked FROM BIDDING? Blocked when isBlocked is set AND
 * either there's no expiry (permanent) or the expiry is still in the future. An
 * elapsed blockedUntil means the cooldown lapsed -> not blocked.
 */
export function isEffectivelyBlocked(
  user: Pick<User, 'isBlocked' | 'blockedUntil'> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!user || user.isBlocked !== true) return false;
  const until = toMs(user.blockedUntil);
  if (until == null) return true; // permanent / admin ban
  return until > nowMs;
}

/** Epoch ms the block lifts, or null when permanent. */
export function blockLiftsAt(
  user: Pick<User, 'blockedUntil'> | null | undefined
): number | null {
  if (!user) return null;
  return toMs(user.blockedUntil);
}
