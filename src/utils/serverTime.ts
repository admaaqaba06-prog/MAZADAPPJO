// Single source of client-side "server time" for auction finish detection.
//
// The auction lifecycle (open/closed, winner settlement) is server-authoritative
// (functions/index.js placeBid + scheduledAuctionCloser). The client must never
// decide a winner or write status:'completed' — but it DOES need to decide when
// to render the "ended"/countdown overlay, and a device clock that is skewed by
// minutes would either freeze a live auction or leave a finished one interactive.
//
// We keep a single module-level offset (server epoch minus local epoch) so every
// countdown and finish check reads from the same corrected clock.

let serverOffsetMs = 0;

/** Set the correction added to Date.now() to approximate server time (ms). */
export function setServerOffset(ms: number): void {
  if (typeof ms === 'number' && Number.isFinite(ms)) {
    serverOffsetMs = ms;
  }
}

/** Current best estimate of server time in epoch ms. */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

type FinishableAuction = {
  status?: string;
  endTime?: number | null;
} | null | undefined;

/**
 * True when an auction should render as finished:
 *   - status is 'completed' (server has settled it), OR
 *   - its endTime is at/behind `now`.
 *
 * Crucially this is DERIVED, not latched: if an anti-snipe extension pushes
 * endTime back into the future (functions/index.js:668-669 adds +15s), this
 * returns false again so a prematurely-shown ended overlay re-clears.
 */
export function isAuctionFinished(auction: FinishableAuction, now: number): boolean {
  if (!auction) return false;
  if (auction.status === 'completed') return true;
  if (typeof auction.endTime === 'number' && auction.endTime > 0) {
    return auction.endTime <= now;
  }
  return false;
}
