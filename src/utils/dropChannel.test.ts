import { describe, it, expect } from 'vitest';
import { DROP_CHANNELS, channelLabel, categoryToChannel } from './dropChannel';

describe('drop channels', () => {
  it('defines exactly phones, cars, misc', () => {
    expect(DROP_CHANNELS.map((c) => c.value)).toEqual(['phones', 'cars', 'misc']);
  });

  it('returns the localized label', () => {
    expect(channelLabel('phones', 'en')).toBe('Mazad — Phones');
    expect(channelLabel('cars', 'ar')).toBe('مزاد — سيارات');
  });

  // `channelToCategory` is gone: three channels could only ever produce three
  // categories, so everything that was not a phone or a car became 'Fashion'.
  // The mapping now runs the other way — the item's category decides which
  // WhatsApp audience the drop is broadcast to.
  it('routes a category to its broadcast channel', () => {
    expect(categoryToChannel('Phones')).toBe('phones');
    expect(categoryToChannel('Vehicles')).toBe('cars');
  });

  it('routes the legacy Cars value like Vehicles', () => {
    expect(categoryToChannel('Cars')).toBe('cars');
  });

  it('is case-insensitive', () => {
    expect(categoryToChannel('vehicles')).toBe('cars');
  });

  it('sends everything else to the misc broadcast', () => {
    // Lossy on purpose: eight categories, three audiences.
    expect(categoryToChannel('Watches')).toBe('misc');
    expect(categoryToChannel('Real Estate')).toBe('misc');
    expect(categoryToChannel('')).toBe('misc');
  });
});
