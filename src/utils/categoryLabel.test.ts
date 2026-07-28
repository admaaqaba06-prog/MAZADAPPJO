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
    // 'Fashion' is the CATCH-ALL bucket (channelToCategory sends the misc drop
    // channel here), not a clothing category — so it reads "Other", matching
    // the seller's own picker in ListingWizardView.
    expect(categoryLabel('Fashion', true)).toBe('أخرى');
    expect(categoryLabel('Fashion', false)).toBe('Other');
    // Categories with no English override still fall through to the raw value.
    expect(categoryLabel('Electronics', false)).toBe('Electronics');
  });
  it('matches case-insensitively and maps legacy values', () => {
    expect(categoryLabel('electronics', true)).toBe('إلكترونيات');
    expect(categoryLabel('CARS', true)).toBe('سيارات');
    expect(categoryLabel('Phones', true)).toBe('هواتف');
  });
  it('maps the new Appliances / Home & Furniture categories', () => {
    expect(categoryLabel('Appliances', true)).toBe('أجهزة كهربائية');
    expect(categoryLabel('Appliances', false)).toBe('Appliances');
    expect(categoryLabel('Home & Furniture', true)).toBe('أثاث ومنزل');
    expect(categoryLabel('Home & Furniture', false)).toBe('Home & Furniture');
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
