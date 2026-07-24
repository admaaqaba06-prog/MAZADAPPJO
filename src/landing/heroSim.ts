// Pure helpers for the landing hero live-auction simulator.
// Kept side-effect free so they can be unit tested and reused by the
// presentational effects in LandingView without pulling in React.

/** Format a countdown given in whole seconds as "mm:ss" (zero-padded, never negative). */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(m)}:${pad(s)}`;
}

/** Advance a price by one bid step. */
export function stepPrice(price: number, step: number): number {
  return price + step;
}

/**
 * Gently drift a watcher/viewer count up or down. Biased slightly upward so
 * the room tends to grow, but clamped so it can never go negative.
 */
export function driftWatchers(n: number, rand: () => number = Math.random): number {
  const delta = Math.round((rand() - 0.45) * 6);
  return Math.max(0, n + delta);
}

/**
 * Anti-snipe extension: if a bid lands with less than 12s left, nudge the
 * countdown back up (by +8s, or to an explicit `bumpTo`) so the lot never
 * dies on a last-second bid. Otherwise the countdown is unchanged.
 */
export function antiSnipe(secondsLeft: number, bumpTo?: number): number {
  if (secondsLeft < 12) {
    return bumpTo ?? secondsLeft + 8;
  }
  return secondsLeft;
}
