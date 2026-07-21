import { describe, it, expect } from 'vitest';
import { formatMoney } from './formatMoney';

describe('formatMoney', () => {
  it('uses Western digits with the JOD label in English', () => {
    expect(formatMoney(1250, 'en')).toBe('1,250 JOD');
  });

  it('uses Western digits with the canonical د.أ label in Arabic', () => {
    // Money screens use Western digits app-wide — Arabic keeps the same digits,
    // only the currency label changes. (Stops the JOD/JD/دينار/د.أ mix.)
    expect(formatMoney(1250, 'ar')).toBe('1,250 د.أ');
  });

  it('groups thousands', () => {
    expect(formatMoney(325000, 'en')).toBe('325,000 JOD');
    expect(formatMoney(325000, 'ar')).toBe('325,000 د.أ');
  });

  it('renders zero cleanly', () => {
    expect(formatMoney(0, 'en')).toBe('0 JOD');
    expect(formatMoney(0, 'ar')).toBe('0 د.أ');
  });

  it('preserves fractional fils without forcing trailing zeros', () => {
    expect(formatMoney(12.5, 'en')).toBe('12.5 JOD');
    expect(formatMoney(105.375, 'ar')).toBe('105.375 د.أ');
  });

  it('never emits a canonical label other than JOD / د.أ', () => {
    expect(formatMoney(1, 'en')).not.toContain('JD');
    expect(formatMoney(1, 'ar')).not.toContain('دينار');
  });

  it('is resilient to non-finite input', () => {
    expect(formatMoney(NaN as unknown as number, 'en')).toBe('0 JOD');
  });
});
