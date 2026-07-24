import { describe, it, expect } from 'vitest';
import { categoryLabel } from './categoryLabel';

describe('categoryLabel', () => {
  it('returns the raw category in English (isAr=false)', () => {
    expect(categoryLabel('Electronics', false)).toBe('Electronics');
    expect(categoryLabel('Vehicles', false)).toBe('Vehicles');
  });
  it('maps the known categories to Arabic', () => {
    expect(categoryLabel('Electronics', true)).toBe('إلكترونيات');
    expect(categoryLabel('Vehicles', true)).toBe('سيارات');
    expect(categoryLabel('Fashion', true)).toBe('أزياء');
  });
  it('matches case-insensitively and maps legacy values', () => {
    expect(categoryLabel('electronics', true)).toBe('إلكترونيات');
    expect(categoryLabel('CARS', true)).toBe('سيارات');
    expect(categoryLabel('Phones', true)).toBe('هواتف');
  });
  it('falls back to the raw string for unknown categories', () => {
    expect(categoryLabel('Jewelry', true)).toBe('Jewelry');
  });
  it('returns empty string for null/undefined/empty', () => {
    expect(categoryLabel(null, true)).toBe('');
    expect(categoryLabel(undefined, false)).toBe('');
    expect(categoryLabel('', true)).toBe('');
  });
});
