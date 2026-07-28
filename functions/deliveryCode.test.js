// Wave 3 — delivery-code twin (server). The client twin
// src/utils/deliveryCode.ts MUST keep identical validation/normalization; the
// NORMALIZE_CASES table below is duplicated there on purpose.
import { describe, it, expect } from 'vitest';
import {
  DELIVERY_CODE_ALPHABET,
  generateDeliveryCode,
  isValidDeliveryCode,
  normalizeDeliveryCodeInput,
} from './deliveryCode.js';

const NORMALIZE_CASES = [
  ['dc-7k3qp', 'DC-7K3QP'],
  ['DC-7K3QP', 'DC-7K3QP'],
  ['  dc 7k3qp  ', 'DC-7K3QP'],
  ['7K3QP', 'DC-7K3QP'],
  ['dc7k3qp', 'DC-7K3QP'],
  ['DC-DC-7K3QP', 'DC-7K3QP'],
];

describe('deliveryCode — alphabet', () => {
  it('excludes the ambiguous glyphs 0 O 1 I', () => {
    for (const ch of ['0', 'O', '1', 'I']) {
      expect(DELIVERY_CODE_ALPHABET.includes(ch)).toBe(false);
    }
  });

  // Byte-identical to ORDER_REF_ALPHABET in functions/orderRef.js. Both codes
  // can appear on the same parcel, so a seller reading one and typing the other
  // must hit the same glyph set. (orderRef.js's own comment claims it drops L
  // as well; it does not, and this test is the honest statement of what both
  // alphabets actually are.)
  it('matches the order-ref alphabet exactly', () => {
    expect(DELIVERY_CODE_ALPHABET).toBe('23456789ABCDEFGHJKLMNPQRSTUVWXYZ');
    expect(DELIVERY_CODE_ALPHABET).toHaveLength(32);
  });
});

describe('generateDeliveryCode', () => {
  it('builds DC- plus five alphabet characters', () => {
    const code = generateDeliveryCode(() => 0);
    expect(code).toBe('DC-22222');
    expect(isValidDeliveryCode(code)).toBe(true);
  });

  it('draws every character from the injected picker', () => {
    let i = 0;
    const code = generateDeliveryCode(() => i++);
    expect(code).toBe('DC-23456');
  });

  it('produces valid codes with the real RNG', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidDeliveryCode(generateDeliveryCode())).toBe(true);
    }
  });
});

describe('isValidDeliveryCode', () => {
  it('rejects a wrong prefix, wrong length, ambiguous glyphs and non-strings', () => {
    expect(isValidDeliveryCode('MZ-7K3QP')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3Q')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3QPP')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3Q0')).toBe(false);
    expect(isValidDeliveryCode('dc-7k3qp')).toBe(false);
    expect(isValidDeliveryCode(undefined)).toBe(false);
    expect(isValidDeliveryCode(null)).toBe(false);
    expect(isValidDeliveryCode(12345)).toBe(false);
  });
});

describe('normalizeDeliveryCodeInput', () => {
  it('coerces buyer typing toward the canonical form', () => {
    for (const [input, expected] of NORMALIZE_CASES) {
      expect(normalizeDeliveryCodeInput(input)).toBe(expected);
    }
  });

  it('never throws on junk input', () => {
    expect(normalizeDeliveryCodeInput(undefined)).toBe('DC-UNDEFINED');
    expect(normalizeDeliveryCodeInput(null)).toBe('DC-NULL');
  });
});
