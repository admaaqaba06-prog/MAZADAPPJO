import { parseAmmanLocalToMs } from './ammanTime';

/**
 * When a drop opens, as one control instead of two.
 *
 * The old form had a `startMode` toggle AND a start-time field, where
 * "Scheduled" with an empty time silently meant *immediately* — the label
 * contradicted the behaviour, so someone who meant to schedule and left the
 * field blank opened the lot instantly. These three states are explicit and
 * map onto the unchanged server semantics.
 *
 *   now        -> scheduled, scheduledStartAt = <caller's now>
 *   scheduled  -> scheduled, scheduledStartAt = the picked Amman time
 *   first_bid  -> first_bid, clock starts on the first bid
 *
 * `scheduledStartAtMs: null` means "the caller substitutes its own now",
 * which is exactly what buildDropPayload's `?? now` already does.
 */
export type OpensMode = 'now' | 'scheduled' | 'first_bid';

export interface OpensResult {
  startMode: 'scheduled' | 'first_bid';
  scheduledStartAtMs: number | null;
}

export function resolveOpens(mode: OpensMode, scheduledLocal: string): OpensResult {
  if (mode === 'first_bid') {
    return { startMode: 'first_bid', scheduledStartAtMs: null };
  }
  if (mode === 'now') {
    return { startMode: 'scheduled', scheduledStartAtMs: null };
  }
  return { startMode: 'scheduled', scheduledStartAtMs: parseAmmanLocalToMs(scheduledLocal) };
}

export type OpensError = 'REQUIRED' | 'PAST';

/**
 * A time is only meaningful in the `scheduled` state, so the other two can
 * never be invalid. Unlike the old form, a blank time is an error here rather
 * than a silent "open now" — that is what `now` is for.
 */
export function validateOpens(
  mode: OpensMode,
  scheduledLocal: string,
  now: number,
): OpensError | null {
  if (mode !== 'scheduled') return null;
  const ms = parseAmmanLocalToMs(scheduledLocal);
  if (ms == null) return 'REQUIRED';
  if (ms <= now) return 'PAST';
  return null;
}
