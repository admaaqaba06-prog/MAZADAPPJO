import { describe, it, expect } from 'vitest';
import { JORDAN_GOVERNORATES, CITY_IDS, isValidCityId, isProfileComplete } from './jordanCities';

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

  it('is true when name + city are set — email is irrelevant', () => {
    expect(isProfileComplete({ name: 'Tareq', city: 'amman', email: '' })).toBe(true);
    expect(isProfileComplete({ name: 'Tareq', city: 'irbid', email: 'a@b.com' })).toBe(true);
  });
});
