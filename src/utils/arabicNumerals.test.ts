import { describe, it, expect } from 'vitest';
import {
  ARABIC_UI_DIGITS,
  formatNumeral,
  toArabicIndicDigits,
  toWesternDigits,
} from './arabicNumerals';

describe('ARABIC_UI_DIGITS — the decision itself', () => {
  // This is the assertion that makes the choice reviewable. It matches
  // utils/formatMoney.ts, which already fixed Western digits for every money
  // string in the app; a change here is a product decision, not a refactor.
  it('is Western, matching formatMoney', () => {
    expect(ARABIC_UI_DIGITS).toBe('western');
  });
});

describe('toWesternDigits', () => {
  it('maps every Arabic-Indic digit to its Western twin', () => {
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('maps every Eastern Arabic (Persian) digit too', () => {
    // U+06F0-U+06F9 is a different block from U+0660-U+0669 and a naive
    // single-range replace silently passes these through.
    expect(toWesternDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('leaves Western digits alone', () => {
    expect(toWesternDigits('0123456789')).toBe('0123456789');
  });

  it('converts only the digits inside a sentence', () => {
    expect(toWesternDigits('مهلة الدفع ٢٤ ساعة')).toBe('مهلة الدفع 24 ساعة');
  });

  it('leaves non-digit Arabic letters and punctuation untouched', () => {
    // ٪ (U+066A) is the Arabic percent sign, not a digit, and must survive.
    expect(toWesternDigits('٩٥٪ · حالة')).toBe('95٪ · حالة');
  });

  it('handles a string that already mixes both systems', () => {
    expect(toWesternDigits('٢٤ / 30')).toBe('24 / 30');
  });

  it('is a no-op on a string with no digits at all', () => {
    expect(toWesternDigits('بدون سعر احتياطي')).toBe('بدون سعر احتياطي');
    expect(toWesternDigits('')).toBe('');
  });
});

describe('toArabicIndicDigits', () => {
  it('maps every Western digit to its Arabic-Indic twin', () => {
    expect(toArabicIndicDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩');
  });

  it('converts only the digits inside a sentence', () => {
    expect(toArabicIndicDigits('مهلة الدفع 24 ساعة')).toBe('مهلة الدفع ٢٤ ساعة');
  });

  it('is the exact inverse of toWesternDigits over the digit set', () => {
    expect(toWesternDigits(toArabicIndicDigits('0123456789'))).toBe('0123456789');
    expect(toArabicIndicDigits(toWesternDigits('٠١٢٣٤٥٦٧٨٩'))).toBe('٠١٢٣٤٥٦٧٨٩');
  });

  it('is a no-op on a string with no Western digits', () => {
    expect(toArabicIndicDigits('ساعة')).toBe('ساعة');
  });
});

describe('formatNumeral', () => {
  it('renders Western digits in English', () => {
    expect(formatNumeral(24, false)).toBe('24');
  });

  // The whole point of the module: under the current policy Arabic gets the
  // SAME digits as English, so a line can never mix the two systems.
  it('renders the same digits in Arabic as in English', () => {
    for (const n of [0, 3, 24, 30, 100]) {
      expect(formatNumeral(n, true)).toBe(formatNumeral(n, false));
    }
  });

  it('normalises an Arabic-Indic string input to the chosen style', () => {
    // A legacy literal handed to the formatter must not survive as-is.
    expect(formatNumeral('٢٤', true)).toBe('24');
    expect(formatNumeral('٢٤', false)).toBe('24');
  });

  it('passes a Western string input straight through', () => {
    expect(formatNumeral('72', true)).toBe('72');
  });

  it('keeps a negative sign and a decimal point', () => {
    expect(formatNumeral(-5, false)).toBe('-5');
    expect(formatNumeral(42.5, true)).toBe('42.5');
  });

  it('adds no thousands grouping — formatMoney owns that', () => {
    // A second grouping rule here is exactly the drift this module removes.
    expect(formatNumeral(1250, true)).toBe('1250');
  });

  it('renders a non-finite number as 0 rather than NaN or Infinity', () => {
    // "Uploading video… NaN%" reads as a crash; dropProgress already applies
    // this rule to its own percentage and the formatter must not undo it.
    expect(formatNumeral(NaN, true)).toBe('0');
    expect(formatNumeral(Infinity, false)).toBe('0');
    expect(formatNumeral(-Infinity, true)).toBe('0');
  });

  it('renders zero as "0", not as an empty string', () => {
    expect(formatNumeral(0, true)).toBe('0');
    expect(formatNumeral(0, false)).toBe('0');
  });

  it('never returns a string containing Arabic-Indic digits under this policy', () => {
    for (const n of [0, 1, 9, 24, 1250]) {
      expect(formatNumeral(n, true)).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
});
