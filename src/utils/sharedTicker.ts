// Perf Wave 3c (PF8) — ONE shared 1-second ticker for every countdown surface.
//
// DiscoveryFeedView used to create one setInterval PER CARD (~80 concurrent
// timers with a full grid) and CountdownStoriesBar ran its own separate timer.
// Every countdown consumer now subscribes to this single module-level ticker:
// the interval exists only while at least one subscriber is registered, and
// each tick delivers the CURRENT serverNow() (CORR1: server-corrected clock,
// not raw Date.now()) so all surfaces read the same corrected time.

import { serverNow } from './serverTime';

type TickListener = (nowMs: number) => void;

const listeners = new Set<TickListener>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const now = serverNow();
  // Snapshot before iterating: a listener may unsubscribe itself (or others)
  // mid-tick, and everyone registered at the start of the tick should still
  // be notified exactly once... except listeners that already unsubscribed,
  // which must NOT fire with a stale closure.
  for (const listener of Array.from(listeners)) {
    if (!listeners.has(listener)) continue;
    try {
      listener(now);
    } catch (err) {
      // One broken subscriber must never starve the other countdowns.
      console.error('[sharedTicker] listener threw:', err);
    }
  }
}

/**
 * Subscribe to the shared 1s tick. Returns an idempotent unsubscribe.
 * The underlying interval starts on the first subscriber and stops when the
 * last one leaves, so an idle app runs zero countdown timers.
 */
export function subscribeToSharedTicker(listener: TickListener): () => void {
  listeners.add(listener);
  if (intervalId === null) {
    intervalId = setInterval(tick, 1000);
  }
  let active = true;
  return () => {
    if (!active) return; // idempotent — double-unsubscribe is a no-op
    active = false;
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Whole seconds remaining until `endTime`, computed against an explicit `now`
 * (pure — testable, and every subscriber derives from the same tick instant).
 * Returns null when there is no real deadline: the old per-card code fabricated
 * a 120s default for missing endTimes, which rendered a fake "02:00" pill.
 */
export function secondsLeftAt(
  endTime: number | null | undefined,
  nowMs: number
): number | null {
  if (!endTime) return null;
  return Math.max(0, Math.floor((endTime - nowMs) / 1000));
}

/** Test-only introspection. */
export function __getTickerInternals(): { listenerCount: number; running: boolean } {
  return { listenerCount: listeners.size, running: intervalId !== null };
}
