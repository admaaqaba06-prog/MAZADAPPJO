import { describe, it, expect } from 'vitest';
import { DROP_CHANNELS, channelLabel, channelToCategory } from './dropChannel';

describe('drop channels', () => {
  it('defines exactly phones, cars, misc', () => {
    expect(DROP_CHANNELS.map((c) => c.value)).toEqual(['phones', 'cars', 'misc']);
  });

  it('returns the localized label', () => {
    expect(channelLabel('phones', 'en')).toBe('Mazad — Phones');
    expect(channelLabel('cars', 'ar')).toBe('مزاد — سيارات');
  });

  it('maps each channel to an existing AuctionItem category', () => {
    expect(channelToCategory('phones')).toBe('Electronics');
    expect(channelToCategory('cars')).toBe('Vehicles');
    expect(channelToCategory('misc')).toBe('Fashion');
  });
});
