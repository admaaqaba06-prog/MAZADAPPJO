import { describe, it, expect } from 'vitest';
import { opensSummaryLabel, resolveOpens, validateOpens, type OpensMode } from './opensMode';

// parseAmmanLocalToMs reads "YYYY-MM-DDTHH:mm" as Amman wall-clock time.
const FUTURE = '2030-01-01T20:00';
const PAST = '2020-01-01T20:00';
const NOW = Date.UTC(2026, 0, 1);
// 20:00 Amman (UTC+3) is 17:00 UTC on the same day.
const FUTURE_MS = Date.UTC(2030, 0, 1, 17, 0);
// The Amman wall-clock string that lands exactly on NOW.
const EXACTLY_NOW = '2026-01-01T03:00';

describe('resolveOpens', () => {
  it('maps "now" to a scheduled start with no explicit time', () => {
    expect(resolveOpens('now', '')).toEqual({
      startMode: 'scheduled',
      scheduledStartAtMs: null,
    });
  });

  it('ignores a left-over picked time when the mode is "now"', () => {
    expect(resolveOpens('now', FUTURE)).toEqual({
      startMode: 'scheduled',
      scheduledStartAtMs: null,
    });
  });

  it('maps "first_bid" to first_bid with no explicit time', () => {
    expect(resolveOpens('first_bid', FUTURE)).toEqual({
      startMode: 'first_bid',
      scheduledStartAtMs: null,
    });
  });

  it('maps "scheduled" to the parsed Amman time', () => {
    expect(resolveOpens('scheduled', FUTURE)).toEqual({
      startMode: 'scheduled',
      scheduledStartAtMs: FUTURE_MS,
    });
  });

  it('yields a null time for "scheduled" with an unparseable value', () => {
    expect(resolveOpens('scheduled', '')).toEqual({
      startMode: 'scheduled',
      scheduledStartAtMs: null,
    });
  });
});

describe('validateOpens', () => {
  it('never complains about "now"', () => {
    expect(validateOpens('now', '', NOW)).toBeNull();
  });

  it('never complains about "first_bid"', () => {
    expect(validateOpens('first_bid', '', NOW)).toBeNull();
  });

  it('requires a time when "scheduled" is chosen', () => {
    expect(validateOpens('scheduled', '', NOW)).toBe('REQUIRED');
  });

  it('rejects a scheduled time in the past', () => {
    expect(validateOpens('scheduled', PAST, NOW)).toBe('PAST');
  });

  it('rejects a scheduled time that is exactly now', () => {
    expect(validateOpens('scheduled', EXACTLY_NOW, NOW)).toBe('PAST');
  });

  it('accepts a scheduled time in the future', () => {
    expect(validateOpens('scheduled', FUTURE, NOW)).toBeNull();
  });
});

describe('opensSummaryLabel', () => {
  const CLOCK = '8:00 PM';

  it('says "now" in English', () => {
    expect(opensSummaryLabel('now', CLOCK, false)).toBe('Opens now');
  });

  it('says "now" in Arabic', () => {
    expect(opensSummaryLabel('now', CLOCK, true)).toBe('يفتح الآن');
  });

  it('says "first bid" in English', () => {
    expect(opensSummaryLabel('first_bid', CLOCK, false)).toBe('Starts on the first bid');
  });

  it('says "first bid" in Arabic', () => {
    expect(opensSummaryLabel('first_bid', CLOCK, true)).toBe('يبدأ مع أول مزايدة');
  });

  it('interpolates the clock in English when scheduled', () => {
    expect(opensSummaryLabel('scheduled', CLOCK, false)).toBe('Opens at 8:00 PM');
  });

  it('interpolates the clock in Arabic when scheduled', () => {
    expect(opensSummaryLabel('scheduled', CLOCK, true)).toBe('يفتح 8:00 PM');
  });

  // The two timeless modes must never render the clock they are handed. The
  // view passes a live `startTimeDisplay` regardless of mode, so a branch that
  // leaked it would print a stale time next to "Opens now".
  it('ignores the clock entirely for "now" and "first_bid"', () => {
    for (const mode of ['now', 'first_bid'] as const) {
      for (const isAr of [true, false]) {
        expect(opensSummaryLabel(mode, CLOCK, isAr)).not.toContain(CLOCK);
      }
    }
  });

  // formatAmmanClock returns '—' when there is no parsed time, and the panel
  // renders whatever it gets — so the em dash has to survive as itself.
  it('passes an em-dash placeholder through unchanged', () => {
    expect(opensSummaryLabel('scheduled', '—', false)).toBe('Opens at —');
    expect(opensSummaryLabel('scheduled', '—', true)).toBe('يفتح —');
  });

  it('falls back to the scheduled sentence for an unrecognised mode', () => {
    expect(opensSummaryLabel('someday' as OpensMode, CLOCK, false)).toBe('Opens at 8:00 PM');
  });

  // Both languages always: the ops team is mixed and neither is a fallback, so
  // no mode may render the same string in both.
  it('renders a different string per language for every mode', () => {
    for (const mode of ['now', 'scheduled', 'first_bid'] as const) {
      expect(opensSummaryLabel(mode, CLOCK, true)).not.toBe(
        opensSummaryLabel(mode, CLOCK, false),
      );
    }
  });

  it('renders a distinct string for each mode within a language', () => {
    for (const isAr of [true, false]) {
      const labels = (['now', 'scheduled', 'first_bid'] as const).map((m) =>
        opensSummaryLabel(m, CLOCK, isAr),
      );
      expect(new Set(labels).size).toBe(3);
    }
  });
});
