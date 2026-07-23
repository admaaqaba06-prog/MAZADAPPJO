import { describe, it, expect } from 'vitest';
import {
  normalizeDigits,
  validateDeliveryAddress,
  sanitizeDeliveryAddress,
} from './deliveryAddress';

describe('normalizeDigits', () => {
  it('maps Arabic-Indic digits to ASCII', () => {
    expect(normalizeDigits('٠٧٩١٢٣٤٥٦٧')).toBe('0791234567');
  });

  it('maps Persian digits to ASCII', () => {
    expect(normalizeDigits('۰۷۹')).toBe('079');
  });

  it('leaves ASCII digits and separators untouched', () => {
    expect(normalizeDigits('079 123-4567')).toBe('079 123-4567');
  });

  it('handles empty / non-string input', () => {
    expect(normalizeDigits('')).toBe('');
    expect(normalizeDigits(null as unknown as string)).toBe('');
    expect(normalizeDigits(undefined as unknown as string)).toBe('');
  });
});

describe('validateDeliveryAddress', () => {
  const goodAddr = { governorate: 'amman', area: 'Abdoun, Zahran St', building: 'Bldg 12, 3rd floor', notes: 'Blue gate' };
  const goodPhone = '0791234567';

  it('accepts a complete, valid address + phone', () => {
    const r = validateDeliveryAddress(goodAddr, goodPhone);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
    expect(r.normalizedPhone).toBe('+962791234567');
  });

  it('accepts building/notes being omitted (they are optional)', () => {
    const r = validateDeliveryAddress({ governorate: 'irbid', area: 'University St' }, goodPhone);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('requires a governorate from the canonical Jordan list', () => {
    expect(validateDeliveryAddress({ ...goodAddr, governorate: '' }, goodPhone).errors.governorate).toBe(true);
    expect(validateDeliveryAddress({ ...goodAddr, governorate: 'paris' }, goodPhone).errors.governorate).toBe(true);
    expect(validateDeliveryAddress({ area: 'x' }, goodPhone).errors.governorate).toBe(true);
  });

  it('requires a non-empty area/street line', () => {
    expect(validateDeliveryAddress({ ...goodAddr, area: '' }, goodPhone).errors.area).toBe(true);
    expect(validateDeliveryAddress({ ...goodAddr, area: '   ' }, goodPhone).errors.area).toBe(true);
  });

  it('requires a valid Jordanian mobile phone', () => {
    expect(validateDeliveryAddress(goodAddr, '').errors.phone).toBe(true);
    expect(validateDeliveryAddress(goodAddr, '12345').errors.phone).toBe(true);
    expect(validateDeliveryAddress(goodAddr, '+1 555 1234567').errors.phone).toBe(true);
  });

  it('accepts a phone typed with Arabic-Indic digits', () => {
    const r = validateDeliveryAddress(goodAddr, '٠٧٩١٢٣٤٥٦٧');
    expect(r.valid).toBe(true);
    expect(r.normalizedPhone).toBe('+962791234567');
  });

  it('normalizes local, 962 and 00962 phone shapes to E.164', () => {
    expect(validateDeliveryAddress(goodAddr, '0791234567').normalizedPhone).toBe('+962791234567');
    expect(validateDeliveryAddress(goodAddr, '962791234567').normalizedPhone).toBe('+962791234567');
    expect(validateDeliveryAddress(goodAddr, '00962791234567').normalizedPhone).toBe('+962791234567');
    expect(validateDeliveryAddress(goodAddr, '+962 79 123 4567').normalizedPhone).toBe('+962791234567');
  });

  it('reports every problem at once and is invalid overall', () => {
    const r = validateDeliveryAddress({ governorate: 'nowhere', area: '' }, 'nope');
    expect(r.valid).toBe(false);
    expect(r.errors.governorate).toBe(true);
    expect(r.errors.area).toBe(true);
    expect(r.errors.phone).toBe(true);
  });

  it('handles null/undefined address', () => {
    const r = validateDeliveryAddress(null, goodPhone);
    expect(r.valid).toBe(false);
    expect(r.errors.governorate).toBe(true);
    expect(r.errors.area).toBe(true);
  });
});

describe('sanitizeDeliveryAddress', () => {
  it('trims all fields and drops empty optionals', () => {
    const out = sanitizeDeliveryAddress({
      governorate: 'amman',
      area: '  Abdoun  ',
      building: '  ',
      notes: '  gate 3 ',
    });
    expect(out).toEqual({ governorate: 'amman', area: 'Abdoun', notes: 'gate 3' });
  });

  it('keeps only governorate + area when optionals are absent', () => {
    const out = sanitizeDeliveryAddress({ governorate: 'irbid', area: 'Main St' });
    expect(out).toEqual({ governorate: 'irbid', area: 'Main St' });
    expect('building' in out).toBe(false);
    expect('notes' in out).toBe(false);
  });
});
