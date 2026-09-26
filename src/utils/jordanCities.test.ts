import { describe, it, expect } from 'vitest';
import { JORDAN_GOVERNORATES, CITY_IDS, isValidCityId, isProfileComplete, needsName , needsCity } from './jordanCities';

describe('JORDAN_GOVERNORATES', () => {
  it('contains exactly the 12 governorates of Jordan', () => {
    expect(JORDAN_GOVERNORATES).toHaveLength(12);
    const ids = JORDAN_GOVERNORATES.map(g => g.id);
    for (const id of [
      'amman', 'irbid', 'zarqa', 'balqa', 'mafraq', 'jerash',
      'ajloun', 'karak', 'tafilah', 'maan', 'aqaba', 'madaba',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('has unique ids', () => {
    const ids = JORDAN_GOVERNORATES.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has non-empty Arabic and English labels', () => {
    for (const g of JORDAN_GOVERNORATES) {
      expect(g.ar.length).toBeGreaterThan(0);
      expect(g.en.length).toBeGreaterThan(0);
    }
  });

  it('CITY_IDS mirrors the governorate ids', () => {
    expect([...CITY_IDS]).toEqual(JORDAN_GOVERNORATES.map(g => g.id));
  });
});

describe('isValidCityId', () => {
  it('accepts every governorate id', () => {
    for (const g of JORDAN_GOVERNORATES) {
      expect(isValidCityId(g.id)).toBe(true);
    }
  });

  it('rejects unknown ids and non-strings', () => {
    expect(isValidCityId('paris')).toBe(false);
    expect(isValidCityId('')).toBe(false);
    expect(isValidCityId(null)).toBe(false);
    expect(isValidCityId(undefined)).toBe(false);
    expect(isValidCityId(42)).toBe(false);
    expect(isValidCityId({ id: 'amman' })).toBe(false);
  });
});

describe('isProfileComplete', () => {
  it('is false for null/undefined user', () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete(undefined)).toBe(false);
  });

  it("is false when name is the phone-signup placeholder 'User'", () => {
    expect(isProfileComplete({ name: 'User', city: 'amman', email: '' })).toBe(false);
  });

  it('is false when name is blank', () => {
    expect(isProfileComplete({ name: '', city: 'amman', email: 'a@b.com' })).toBe(false);
  });

  it('is false when city is blank or missing', () => {
    expect(isProfileComplete({ name: 'Tareq', city: '', email: 'a@b.com' })).toBe(false);
    expect(isProfileComplete({ name: 'Tareq', email: 'a@b.com' })).toBe(false);
  });

  it('is false when the name is really a phone number (legacy phone signups)', () => {
    expect(isProfileComplete({ name: '+962791234567', city: 'amman', email: '' })).toBe(false);
    expect(isProfileComplete({ name: '0791234567', city: 'amman', email: '' })).toBe(false);
  });

  it('is true when name + city are set — email is irrelevant', () => {
    expect(isProfileComplete({ name: 'Tareq', city: 'amman', email: '' })).toBe(true);
    expect(isProfileComplete({ name: 'Tareq', city: 'irbid', email: 'a@b.com' })).toBe(true);
    expect(isProfileComplete({ name: 'Ahmad', city: 'amman', email: '' })).toBe(true);
  });
});

describe('needsName', () => {
  it('is true for null/undefined user', () => {
    expect(needsName(null)).toBe(true);
    expect(needsName(undefined)).toBe(true);
  });

  it("is true for blank or the 'User' placeholder", () => {
    expect(needsName({ name: '' })).toBe(true);
    expect(needsName({ name: '   ' })).toBe(true);
    expect(needsName({ name: 'User' })).toBe(true);
    expect(needsName({})).toBe(true);
  });

  it('is true for phone-number-looking names (E.164 and local formats)', () => {
    expect(needsName({ name: '+962791234567' })).toBe(true);
    expect(needsName({ name: '0791234567' })).toBe(true);
    expect(needsName({ name: '079 123 4567' })).toBe(true);
    expect(needsName({ name: '079-123-4567' })).toBe(true);
  });

  it('is false for real names', () => {
    expect(needsName({ name: 'Ahmad' })).toBe(false);
    expect(needsName({ name: 'Tareq Al-Omari' })).toBe(false);
    // Short digit strings are not phone-like (pattern requires 6+ chars).
    expect(needsName({ name: 'Abu 79' })).toBe(false);
  });
});

describe('a legacy account is not broken by moving the fields', () => {
  // The population that existed before this change: every phone signup was
  // written with name 'User' and city '', and the wall is what used to fix
  // them. With the wall gone they must browse freely and be asked at the
  // moment each field is used — not crash, and not be silently let through.
  const legacy = { name: 'User', city: '' };

  it('browses freely — nothing about them blocks the app any more', () => {
    // isProfileComplete is still false, but it no longer gates navigation.
    expect(isProfileComplete(legacy)).toBe(false);
  });

  it('is asked for a name when they bid', () => {
    expect(needsName(legacy)).toBe(true);
  });

  it('is asked for a city at the win, separately', () => {
    expect(needsCity(legacy)).toBe(true);
  });

  it('a legacy user who already has a real name is NOT re-asked for it', () => {
    expect(needsName({ name: 'كرم', city: '' })).toBe(false);
    expect(needsCity({ name: 'كرم', city: '' })).toBe(true);
  });

  it('treats a whitespace-only city as missing rather than present', () => {
    expect(needsCity({ name: 'كرم', city: '   ' })).toBe(true);
  });

  it('a fully-filled legacy account is asked for nothing', () => {
    const done = { name: 'كرم', city: 'amman' };
    expect(needsName(done)).toBe(false);
    expect(needsCity(done)).toBe(false);
    expect(isProfileComplete(done)).toBe(true);
  });
});
