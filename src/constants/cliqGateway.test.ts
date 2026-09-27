// Arabic hours in the CliQ processing disclaimer.
//
// This exists because the disclaimer shipped as «قد تستغرق حتى 2 ساعتين» —
// "up to 2 two-hours" — from interpolating the number in front of a noun that
// already carries it. Arabic counts in four shapes and English concatenation
// produces a wrong sentence in three of them, so the rule gets a test rather
// than a comment.

import { describe, it, expect } from 'vitest';
import { arabicHours, CLIQ_PROCESSING_MAX_HOURS } from './cliqGateway';

describe('arabicHours', () => {
  it('uses the dual for 2, with NO numeral — the value BAE specified', () => {
    expect(arabicHours(2)).toBe('ساعتين');
    // The original defect, stated so a regression is unmistakable.
    expect(arabicHours(2)).not.toBe('2 ساعتين');
    expect(arabicHours(2)).not.toContain('2');
  });

  it('uses the bare singular for 1, also with no numeral', () => {
    expect(arabicHours(1)).toBe('ساعة');
    expect(arabicHours(1)).not.toContain('1');
  });

  it('uses the plural for 3–10', () => {
    expect(arabicHours(3)).toBe('3 ساعات');
    expect(arabicHours(10)).toBe('10 ساعات');
  });

  it('returns to the singular after 10, as Arabic requires', () => {
    expect(arabicHours(11)).toBe('11 ساعة');
    expect(arabicHours(24)).toBe('24 ساعة');
  });

  it('renders the configured value as a grammatical phrase', () => {
    // Whatever BAE revises the window to, the disclaimer must still read.
    const phrase = arabicHours(CLIQ_PROCESSING_MAX_HOURS);
    expect(phrase.trim().length).toBeGreaterThan(0);
    expect(phrase).not.toMatch(/^\d+\s*ساعتين$/);
  });
});
