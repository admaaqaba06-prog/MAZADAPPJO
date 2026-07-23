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

/** The offset currently applied (server epoch minus local epoch, ms). */
export function getServerOffset(): number {
  return serverOffsetMs;
}

export type ServerTimeSample = {
  /** Server's own Date.now() (epoch ms) as reported by the source. */
  serverEpochMs: number;
  /** Local Date.now() captured just BEFORE the request went out. */
  sentAtMs: number;
  /** Local Date.now() captured just AFTER the response arrived. */
  receivedAtMs: number;
};

/**
 * Compute the client↔server offset from a single round-trip sample, NTP-style:
 * the server's clock is sampled somewhere inside the round-trip, so we assume
 * it landed near the midpoint and add half the round-trip time before comparing
 * to the local clock at receipt. This keeps NETWORK LATENCY out of the offset —
 * a slow request no longer looks like clock skew.
 *
 * Returns `null` (rather than a poisoned value) when the sample can't be
 * trusted: a non-finite server time, a negative round-trip (clock went
 * backwards mid-request), or an absurdly long round-trip where the half-RTT
 * assumption breaks down. The caller must then leave the prior offset in place.
 *
 * SAFETY: the returned offset only shifts the CLIENT's rendered clock toward
 * the server's. It is never authoritative — functions/index.js re-checks
 * endTime with the real server clock inside the placeBid transaction, so a
 * client whose offset is slightly off (or who tampers with its own local
 * timestamps to skew this math) can only affect its own UI, never settle or
 * bid past the true auction close.
 */
export function computeServerOffset(sample: ServerTimeSample): number | null {
  const { serverEpochMs, sentAtMs, receivedAtMs } = sample;
  if (
    !Number.isFinite(serverEpochMs) ||
    !Number.isFinite(sentAtMs) ||
    !Number.isFinite(receivedAtMs)
  ) {
    return null;
  }
  const roundTripMs = receivedAtMs - sentAtMs;
  // Negative RTT is impossible on a monotonic clock; > 10s is too noisy to trust.
  if (roundTripMs < 0 || roundTripMs > 10_000) return null;
  const estimatedServerNowAtReceipt = serverEpochMs + roundTripMs / 2;
  return estimatedServerNowAtReceipt - receivedAtMs;
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
