import { describe, it, expect } from 'vitest';
import { buildDropPayload, slugifyVendor, type DropPayloadInput } from './dropPayload';

const NOW = 1_800_000_000_000;

const base: DropPayloadInput = {
  productName: '  iPhone 15 Pro  ',
  startingPrice: '250',
  channel: 'phones',
  durationSeconds: 1800,
  paymentWindowHours: 24,
  antiSnipeSec: 30,
  startMode: 'scheduled',
  scheduledStartAtMs: null,
  autoRelist: false,
  viewing: '',
  viewingPlace: '',
  marketPrice: '',
  reservePrice: '',
  vendorName: '',
  extraPhotoUrls: [],
};

describe('buildDropPayload — characterization of the shipped payload', () => {
  it('produces exactly the keys the current form sends for a minimal drop', () => {
    expect(buildDropPayload(base, NOW)).toEqual({
      title: 'iPhone 15 Pro',
      description: 'iPhone 15 Pro',
      category: 'Electronics',
      startingPrice: 250,
      minIncrement: 13,
      currentBidderId: null,
      currentBidderName: null,
      videoUrl: '',
      thumbnailUrl: '',
      endTime: NOW + 1800 * 1000,
      duration: 1800,
      paymentWindowHours: 24,
      antiSnipeWindowSec: 30,
      antiSnipeExtendSec: 30,
      channel: 'phones',
      startMode: 'scheduled',
      autoRelist: false,
      scheduledStartAt: NOW,
      soldByMazad: true,
    });
  });

  it('never emits condition or specs — the current form does not store them', () => {
    const p = buildDropPayload(base, NOW);
    expect(p).not.toHaveProperty('condition');
    expect(p).not.toHaveProperty('specs');
  });

  it('floors minIncrement at 5 for cheap lots', () => {
    expect(buildDropPayload({ ...base, startingPrice: '20' }, NOW).minIncrement).toBe(5);
  });

  it('uses the scheduled start when one is given', () => {
    const at = NOW + 3_600_000;
    const p = buildDropPayload({ ...base, scheduledStartAtMs: at }, NOW);
    expect(p.scheduledStartAt).toBe(at);
    expect(p.endTime).toBe(at + 1800 * 1000);
  });

  it('omits viewingPlace unless the mode is store and a place was typed', () => {
    expect(buildDropPayload({ ...base, viewing: 'office', viewingPlace: 'x' }, NOW))
      .not.toHaveProperty('viewingPlace');
    expect(buildDropPayload({ ...base, viewing: 'store', viewingPlace: '  ' }, NOW))
      .not.toHaveProperty('viewingPlace');
    expect(buildDropPayload({ ...base, viewing: 'store', viewingPlace: ' Shop 12 ' }, NOW))
      .toMatchObject({ viewing: 'store', viewingPlace: 'Shop 12' });
  });

  it('omits optional numerics when blank or zero', () => {
    const p = buildDropPayload({ ...base, marketPrice: '0', reservePrice: '' }, NOW);
    expect(p).not.toHaveProperty('marketPrice');
    expect(p).not.toHaveProperty('reservePrice');
  });

  it('coerces present optional numerics to numbers, not strings', () => {
    const p = buildDropPayload({ ...base, marketPrice: '300', reservePrice: '180.5' }, NOW);
    expect(p.marketPrice).toBe(300);
    expect(p.reservePrice).toBe(180.5);
    // The form holds these as raw input strings; Firestore must receive numbers.
    expect(typeof p.marketPrice).toBe('number');
    expect(typeof p.reservePrice).toBe('number');
  });

  it('emits vendorName with a slug when a vendor is named', () => {
    expect(buildDropPayload({ ...base, vendorName: '  Al Hani Traders ' }, NOW))
      .toMatchObject({ vendorName: 'Al Hani Traders', vendorId: 'al-hani-traders' });
  });

  it('falls back to a null vendorId when the name slugifies to nothing', () => {
    const p = buildDropPayload({ ...base, vendorName: ' !!! ' }, NOW);
    expect(p.vendorName).toBe('!!!');
    // Never '' — the empty slug is coerced to null so the field reads as "unset".
    expect(p.vendorId).toBeNull();
  });

  it('attaches mediaUrls only when gallery photos uploaded', () => {
    expect(buildDropPayload(base, NOW)).not.toHaveProperty('mediaUrls');
    expect(buildDropPayload({ ...base, extraPhotoUrls: ['a', 'b'] }, NOW).mediaUrls)
      .toEqual(['a', 'b']);
  });
});

describe('slugifyVendor', () => {
  it('lowercases and dashes latin names', () => {
    expect(slugifyVendor('  Al Hani   Traders ')).toBe('al-hani-traders');
  });
  it('keeps arabic letters', () => {
    expect(slugifyVendor('الهاني للتجارة')).toBe('الهاني-للتجارة');
  });
  it('strips punctuation and collapses dashes', () => {
    expect(slugifyVendor('A&&&B -- C!')).toBe('ab-c');
  });
  it('returns empty string for punctuation-only input', () => {
    expect(slugifyVendor('!!!')).toBe('');
  });
});
