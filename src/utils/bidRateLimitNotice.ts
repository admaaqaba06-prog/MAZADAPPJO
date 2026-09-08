/**
 * Client presentation of the SERVER's bidding rate limit.
 *
 * The limiter itself lives in functions/bidRateLimit.js and is enforced inside
 * the placeBid transaction. Nothing here enforces anything — this only turns the
 * server's `code` + `retryAfterMs` into a message and a "stop asking" deadline,
 * so a cooled-down bidder sees a countdown instead of hammering a button that
 * will be refused. Clearing localStorage or reloading removes the local hint and
 * changes nothing about the outcome: the server still refuses.
 *
 * The server deliberately does not send the limit, the count or the window, so
 * neither does this copy. "You've reached the bidding limit" is the whole
 * message — a bidder who learns the exact cap learns exactly how to pace a bot
 * just under it.
 */

export const BIDDING_RATE_LIMITED = 'BIDDING_RATE_LIMITED';

export interface BidRateLimitResponse {
  code?: string | null;
  retryAfterMs?: number | null;
  message?: string | null;
}

/** True when a placeBid response is the server's rate-limit refusal. */
export function isRateLimited(res: BidRateLimitResponse | null | undefined): boolean {
  if (!res) return false;
  return res.code === BIDDING_RATE_LIMITED || res.message === BIDDING_RATE_LIMITED;
}

/**
 * Epoch ms until which bidding should stay disabled, or 0 when not limited.
 * A missing/absurd retryAfterMs falls back to 60s rather than 0 — a zero would
 * re-enable the button instantly and put the user straight back into a refusal
 * loop. Capped at 24h so a bad value cannot lock the UI out indefinitely.
 */
export function cooldownUntil(res: BidRateLimitResponse | null | undefined, nowMs: number): number {
  if (!isRateLimited(res)) return 0;
  const raw = Number(res?.retryAfterMs);
  const ms = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 24 * 60 * 60 * 1000) : 60_000;
  return nowMs + ms;
}

/** Whole minutes remaining, rounded UP so "1 minute" never means "any second now". */
export function minutesRemaining(untilMs: number, nowMs: number): number {
  const ms = untilMs - nowMs;
  return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
}

/**
 * User-facing cooldown copy. Bilingual, matching the rest of the bid surface.
 * Names no limit and no count.
 */
export function rateLimitMessage(untilMs: number, nowMs: number, isAr: boolean): string {
  const mins = minutesRemaining(untilMs, nowMs);
  if (mins <= 0) {
    return isAr
      ? 'وصلت إلى حد المزايدات. يرجى المحاولة لاحقاً.'
      : "You've reached the bidding limit. Please try again later.";
  }
  if (isAr) {
    return `وصلت إلى حد المزايدات. يرجى المحاولة بعد ${mins} دقيقة.`;
  }
  return `You've reached the bidding limit. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
}
