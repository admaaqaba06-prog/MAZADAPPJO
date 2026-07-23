// Session heartbeat scheduling (PF4 part 2).
//
// The client periodically writes `lastSeen`/`deviceInfo`/`appVersion` to its
// own user doc. Every such write fans out to the admin's live `users` listener,
// so if every client fired on the same fixed cadence they would write in
// lockstep and hammer that listener in bursts. We lengthen the base interval
// (5 min -> 8-12 min) and add per-tick random jitter so the writes spread out.

export const HEARTBEAT_MIN_MS = 8 * 60 * 1000; // 8 minutes
export const HEARTBEAT_MAX_MS = 12 * 60 * 1000; // 12 minutes

/**
 * Returns the delay (ms) until the next heartbeat, uniformly distributed in
 * [HEARTBEAT_MIN_MS, HEARTBEAT_MAX_MS]. Call it fresh before scheduling each
 * tick so clients that happen to line up drift apart over time.
 *
 * @param rand injectable RNG in [0,1) (defaults to Math.random) for testing.
 */
export function nextHeartbeatDelayMs(rand: () => number = Math.random): number {
  const span = HEARTBEAT_MAX_MS - HEARTBEAT_MIN_MS;
  // +1 so rand() -> ~1 can reach the inclusive upper bound.
  return HEARTBEAT_MIN_MS + Math.floor(rand() * (span + 1));
}
