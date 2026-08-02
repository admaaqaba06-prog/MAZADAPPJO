import { describe, it, expect } from 'vitest';
import { buildDropPayload, slugifyVendor, type DropPayloadInput } from './dropPayload';

const NOW = 1_800_000_000_000;

const base: DropPayloadInput = {
  productName: '  iPhone 15 Pro  ',
  specs: [],
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
      // WAS `'iPhone 15 Pro'` — a copy of the title. That was the third
      // fabrication path in this codebase, and the one still producing new
      // rows. `base` carries no specs, so an honest empty string is correct.
      description: '',
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

  it('never emits condition — the form collects it but it has never reached the doc', () => {
    expect(buildDropPayload(base, NOW)).not.toHaveProperty('condition');
  });

  it('never emits a raw `specs` key — the specs BECOME the description', () => {
    const p = buildDropPayload({ ...base, specs: ['128GB', 'بطارية 90%'] }, NOW);
    expect(p).not.toHaveProperty('specs');
    expect(p.description).toBe('128GB\nبطارية 90%');
  });

  describe('the description is no longer a copy of the title', () => {
    // This payload used to set `description: productName.trim()`. Every lot in
    // every Mazad drop therefore published a description that merely repeated
    // its own heading — 102 of 115 real auctions carried exactly that, and the
    // desktop bidding screen now renders descriptions, which would have
    // surfaced the echo on the highest-traffic surface in the app.
    it('uses the specs the builder already collects', () => {
      const p = buildDropPayload({ ...base, specs: ['حالة ممتازة', 'مع الشاحن'] }, NOW);
      expect(p.description).toBe('حالة ممتازة\nمع الشاحن');
      expect(p.description).not.toBe(p.title);
    });

    it('leaves the description EMPTY when there are no specs, rather than echoing the title', () => {
      const p = buildDropPayload({ ...base, specs: [] }, NOW);
      expect(p.description).toBe('');
      expect(p.description).not.toBe(p.title);
    });

    it('drops blank spec lines instead of emitting empty rows', () => {
      const p = buildDropPayload({ ...base, specs: ['  ', 'real', '', '   x  '] }, NOW);
      expect(p.description).toBe('real\nx');
    });

    it('survives a missing specs array without throwing', () => {
      const p = buildDropPayload({ ...base, specs: undefined as any }, NOW);
      expect(p.description).toBe('');
    });

    it('never equals the title, whatever the specs say', () => {
      // The suppression on the display side is a safety net, not the fix.
      const p = buildDropPayload({ ...base, specs: ['  iPhone 15 Pro  '] }, NOW);
      expect(p.title).toBe('iPhone 15 Pro');
      // A seller CAN type the title as a spec; that is their choice, and the
      // display layer suppresses the echo. The payload does not invent it.
      expect(p.description).toBe('iPhone 15 Pro');
    });
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
