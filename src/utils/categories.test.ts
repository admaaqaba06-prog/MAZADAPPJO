import { describe, it, expect } from 'vitest';
import { CATEGORIES, categoryLabel, matchValues } from './categories';

describe('CATEGORIES', () => {
  it('gives every category an Arabic and an English label', () => {
    for (const c of CATEGORIES) {
      expect(c.labelAr.trim(), `${c.value} labelAr`).not.toBe('');
      expect(c.labelEn.trim(), `${c.value} labelEn`).not.toBe('');
    }
  });

  it('has no duplicate stored values', () => {
    const values = CATEGORIES.map(c => c.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the legacy Luxury value reachable under Watches', () => {
    // Every watch a seller listed before this change stored 'Luxury', which
    // matched no Discover chip at all. It must filter under Watches now.
    expect(matchValues('Watches')).toContain('Luxury');
  });

  it('keeps the legacy Cars value reachable under Vehicles', () => {
    expect(matchValues('Vehicles')).toContain('Cars');
  });

  it('keeps the catch-all Fashion bucket reachable under Other', () => {
    expect(matchValues('Fashion')).toContain('Fashion');
  });

  it('offers Real Estate, which no seller could previously pick', () => {
    expect(CATEGORIES.map(c => c.value)).toContain('Real Estate');
  });
});

describe('categoryLabel', () => {
  it('labels the Fashion catch-all as Other, not as clothing', () => {
    expect(categoryLabel('Fashion', false)).toBe('Other');
    expect(categoryLabel('Fashion', true)).toBe('أخرى');
  });

  it('is case-insensitive, because legacy docs are inconsistent', () => {
    expect(categoryLabel('fashion', false)).toBe('Other');
    expect(categoryLabel('VEHICLES', false)).toBe('Vehicles');
  });

  it('labels a legacy value by the category that absorbed it', () => {
    expect(categoryLabel('Luxury', false)).toBe('Watches');
    expect(categoryLabel('Luxury', true)).toBe('ساعات');
  });

  it('falls back to the raw string so a chip never renders empty', () => {
    expect(categoryLabel('Something New', false)).toBe('Something New');
  });

  it('returns empty for a missing category', () => {
    expect(categoryLabel(null, true)).toBe('');
    expect(categoryLabel(undefined, false)).toBe('');
  });
});

describe('matchValues', () => {
  it('always includes the canonical value itself', () => {
    for (const c of CATEGORIES) {
      expect(matchValues(c.value), c.value).toContain(c.value);
    }
  });

  it('returns the raw value for an unknown category', () => {
    expect(matchValues('Something New')).toEqual(['Something New']);
  });
});
