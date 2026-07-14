import { describe, it, expect } from 'vitest';
import { parseAmmanLocalToMs, formatAmmanClock } from './ammanTime';

describe('parseAmmanLocalToMs', () => {
  it('interprets the wall-clock as Amman +03:00', () => {
    // 19:30 Amman == 16:30 UTC
    expect(parseAmmanLocalToMs('2026-07-14T19:30')).toBe(Date.parse('2026-07-14T16:30:00Z'));
  });
  it('returns null for empty or invalid input', () => {
    expect(parseAmmanLocalToMs('')).toBeNull();
    expect(parseAmmanLocalToMs('not-a-date')).toBeNull();
  });
});

describe('formatAmmanClock', () => {
  it('formats epoch ms as H:MM in Amman time', () => {
    expect(formatAmmanClock(Date.parse('2026-07-14T16:30:00Z'))).toBe('19:30');
    expect(formatAmmanClock(Date.parse('2026-07-14T05:05:00Z'))).toBe('8:05');
  });
});
