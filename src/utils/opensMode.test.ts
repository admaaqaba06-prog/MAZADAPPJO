import { describe, it, expect } from 'vitest';
import { resolveOpens, validateOpens } from './opensMode';

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
