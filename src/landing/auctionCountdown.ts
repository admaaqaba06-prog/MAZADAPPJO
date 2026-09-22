/**
 * Splitting a countdown into days / hours / minutes / seconds.
 *
 * The app's existing countdowns are all short — a lot closes in minutes, so
 * `formatCountdown` renders MM:SS below an hour and Xh YYm above it, and never
 * needs a day. A launch announcement runs for a WEEK, so it needs its own
 * split; it does not need its own clock, and deliberately does not have one.
 * The seconds it receives come from `useCountdownSeconds`, which is driven by
 * the single shared ticker and the SERVER-corrected clock — a visitor whose
 * device clock is a day out still sees the real time remaining.
 *
 * Pure, so the arithmetic that decides what a promotional banner claims can be
 * tested without mounting a component or faking a timer.
 */

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const HOUR = 3600;
const DAY = 86400;

/**
 * Split a remaining-seconds count into its parts.
 *
 * Clamps at zero rather than returning negatives: a countdown that has passed
 * its target reads 00:00:00:00, never "-3 days". `null`/`undefined` (no
 * deadline known yet) also clamps to zeros so the caller can render the boxes
 * immediately instead of flashing an empty layout — `hasStarted` is the flag
 * that decides WHICH copy shows, not the digits.
 */
export function splitCountdown(totalSeconds: number | null | undefined): CountdownParts {
  const s = typeof totalSeconds === 'number' && Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;

  return {
    days: Math.floor(s / DAY),
    hours: Math.floor((s % DAY) / HOUR),
    minutes: Math.floor((s % HOUR) / 60),
    seconds: s % 60,
  };
}

/**
 * Has the auction opened?
 *
 * `null` means the countdown has no target to measure against. That is NOT
 * "started" — treating an unknown deadline as a live auction would put a
 * "bidding is open" banner and a link to a lot on the front page of the site
 * on the strength of missing data. It stays pre-launch until the clock says
 * otherwise.
 */
export function hasAuctionStarted(secondsLeft: number | null | undefined): boolean {
  return typeof secondsLeft === 'number' && Number.isFinite(secondsLeft) && secondsLeft <= 0;
}

/**
 * Parse the configured start date into epoch millis, or null if it is unusable.
 *
 * Returning null on a malformed date is the safe half: `hasAuctionStarted(null)`
 * is false, so a typo in the constant shows a stopped clock rather than
 * announcing that an auction which may not exist is open for bidding.
 */
export function parseAuctionStart(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Zero-pad to two digits for display. Days can exceed 99 and are not clamped. */
export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}
