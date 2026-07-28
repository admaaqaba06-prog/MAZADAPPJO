import { describe, it, expect } from 'vitest';
import { DURATION_PRESETS, durationLabel } from './dropDuration';

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

describe('durationLabel', () => {
  it('labels every preset in Arabic', () => {
    expect(durationLabel(600, true)).toBe('10 دقيقة');
    expect(durationLabel(900, true)).toBe('15 دقيقة');
    expect(durationLabel(1800, true)).toBe('30 دقيقة');
  });

  it('labels every preset in English', () => {
    expect(durationLabel(600, false)).toBe('10 min');
    expect(durationLabel(900, false)).toBe('15 min');
    expect(durationLabel(1800, false)).toBe('30 min');
  });

  // The shipped bug, pinned directly: the English success panel header read
  // "Opens now · 30 دقيقة" because the label ignored the language.
  it('never leaks Arabic into an English label', () => {
    for (const preset of DURATION_PRESETS) {
      expect(durationLabel(preset.seconds, false)).not.toMatch(ARABIC);
    }
    expect(durationLabel(2700, false)).not.toMatch(ARABIC);
  });

  it('never leaks Latin letters into an Arabic label', () => {
    for (const preset of DURATION_PRESETS) {
      expect(durationLabel(preset.seconds, true)).not.toMatch(LATIN);
    }
    expect(durationLabel(2700, true)).not.toMatch(LATIN);
  });

  it('falls back to minutes for an off-preset duration, in both languages', () => {
    // A relist prefills durationSeconds from a past lot, which need not be one
    // of today's presets.
    expect(durationLabel(2700, false)).toBe('45 min');
    expect(durationLabel(2700, true)).toBe('45 دقيقة');
    expect(durationLabel(3600, false)).toBe('60 min');
  });

  it('rounds the fallback to whole minutes', () => {
    expect(durationLabel(100, false)).toBe('2 min');
    expect(durationLabel(89, true)).toBe('1 دقيقة');
  });

  it('gives each preset a distinct label in each language', () => {
    const ar = DURATION_PRESETS.map((d) => durationLabel(d.seconds, true));
    const en = DURATION_PRESETS.map((d) => durationLabel(d.seconds, false));
    expect(new Set(ar).size).toBe(DURATION_PRESETS.length);
    expect(new Set(en).size).toBe(DURATION_PRESETS.length);
  });

  it('keeps the presets the form offers in ascending order', () => {
    expect(DURATION_PRESETS.map((d) => d.seconds)).toEqual([600, 900, 1800]);
  });
});
