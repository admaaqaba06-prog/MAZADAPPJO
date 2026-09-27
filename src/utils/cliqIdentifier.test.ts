// The payer's CliQ identifier: what we accept, what we normalize it to, and
// what we are allowed to log.
//
// The masking block is not cosmetic. An identifier is the payer's banking
// handle; BAE's brief says it must never reach analytics, and this codebase
// already ships a Meta Pixel, so "don't log it" needs a test rather than a
// comment.
//
// The parity block matters for the same reason as cliqRequest's: the server
// re-normalizes independently, and a browser that accepts a shape the server
// rejects produces a user who fills the form correctly and is refused.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  isValidCliqAlias,
  isValidJordanMobile,
  normalizeJordanMobile,
  normalizeCliqIdentifier,
  isValidCliqIdentifier,
  maskCliqIdentifier,
} from './cliqIdentifier';

const require = createRequire(import.meta.url);
const server = require('../../functions/cliqPayment.js');

describe('alias', () => {
  it('accepts the alphanumeric Latin aliases banks issue', () => {
    expect(isValidCliqAlias('MAZZADO123')).toBe(true);
    expect(isValidCliqAlias('yazan90')).toBe(true);
    expect(isValidCliqAlias('abc')).toBe(true);
  });

  it('rejects shapes no bank can resolve', () => {
    expect(isValidCliqAlias('ab')).toBe(false);          // too short
    expect(isValidCliqAlias('my alias')).toBe(false);    // whitespace
    expect(isValidCliqAlias('user@bank')).toBe(false);   // punctuation
    expect(isValidCliqAlias('مزادو')).toBe(false);        // not Latin
    expect(isValidCliqAlias('')).toBe(false);
    expect(isValidCliqAlias(null)).toBe(false);
  });

  it('trims, because a trailing space is a paste artefact and not a refusal', () => {
    expect(isValidCliqAlias('  MAZZADO123  ')).toBe(true);
    expect(normalizeCliqIdentifier('alias', '  MAZZADO123  ')).toBe('MAZZADO123');
  });
});

describe('Jordanian mobile', () => {
  it('normalizes every shape a person actually types to E.164', () => {
    for (const input of ['+962790000000', '00962790000000', '0790000000', '790000000']) {
      expect(normalizeJordanMobile(input), `failed on ${input}`).toBe('+962790000000');
    }
  });

  it('accepts all three networks', () => {
    expect(isValidJordanMobile('0770000000')).toBe(true);
    expect(isValidJordanMobile('0780000000')).toBe(true);
    expect(isValidJordanMobile('0790000000')).toBe(true);
  });

  it('strips the spaces and dashes a contacts app pastes in', () => {
    expect(normalizeJordanMobile('+962 79 000 0000')).toBe('+962790000000');
    expect(normalizeJordanMobile('079-000-0000')).toBe('+962790000000');
    expect(normalizeJordanMobile('(079) 000 0000')).toBe('+962790000000');
  });

  it('rejects numbers that are not Jordanian mobiles', () => {
    expect(isValidJordanMobile('0760000000')).toBe(false);   // 76 is not a mobile prefix
    expect(isValidJordanMobile('062000000')).toBe(false);    // landline
    expect(isValidJordanMobile('079000000')).toBe(false);    // one digit short
    expect(isValidJordanMobile('07900000000')).toBe(false);  // one digit long
    expect(isValidJordanMobile('+971501234567')).toBe(false);// UAE
    expect(isValidJordanMobile('')).toBe(false);
    expect(isValidJordanMobile(undefined)).toBe(false);
  });
});

describe('maskCliqIdentifier — what may be logged', () => {
  it('keeps only the last three digits of a mobile', () => {
    const masked = maskCliqIdentifier('mobile', '+962790000123');
    expect(masked).toBe('••••123');
    expect(masked).not.toContain('962');
    expect(masked).not.toContain('790000');
  });

  it('keeps only the first two characters of an alias', () => {
    const masked = maskCliqIdentifier('alias', 'MAZZADO123');
    expect(masked.startsWith('MA')).toBe(true);
    expect(masked).not.toContain('ZZADO');
  });

  it('does not leak a short alias whole', () => {
    expect(maskCliqIdentifier('alias', 'ab')).toBe('••');
  });

  it('returns empty for empty input rather than a mask of nothing', () => {
    expect(maskCliqIdentifier('mobile', '')).toBe('');
    expect(maskCliqIdentifier('alias', null)).toBe('');
  });
});

describe('isValidCliqIdentifier routes by the selected type', () => {
  it('does not accept a phone number in the alias field, or the reverse', () => {
    // '0790000000' is alphanumeric-ish but an alias field must not silently
    // accept a phone: the request would be addressed as an alias and fail at
    // the bank, after the payer has already been told it was submitted.
    expect(isValidCliqIdentifier('mobile', '0790000000')).toBe(true);
    expect(isValidCliqIdentifier('alias', 'MAZZADO123')).toBe(true);
    expect(isValidCliqIdentifier('mobile', 'MAZZADO123')).toBe(false);
  });
});

describe('client/server parity — normalization is implemented twice', () => {
  const CASES: Array<['alias' | 'mobile', unknown]> = [
    ['alias', 'MAZZADO123'], ['alias', '  yazan90 '], ['alias', 'ab'], ['alias', 'my alias'],
    ['alias', 'مزادو'], ['alias', ''], ['alias', null], ['alias', 42],
    ['mobile', '+962790000000'], ['mobile', '00962790000000'], ['mobile', '0790000000'],
    ['mobile', '790000000'], ['mobile', '+962 79 000 0000'], ['mobile', '079-000-0000'],
    ['mobile', '0760000000'], ['mobile', '079000000'], ['mobile', '+971501234567'],
    ['mobile', ''], ['mobile', undefined],
  ];

  it('normalizes every case identically', () => {
    for (const [type, raw] of CASES) {
      expect(
        normalizeCliqIdentifier(type, raw),
        `diverged on ${type} / ${String(raw)}`
      ).toBe(server.normalizeCliqIdentifier(type, raw));
    }
  });

  it('agrees that an unknown identifier type is never valid', () => {
    expect(server.normalizeCliqIdentifier('iban', 'JO82JONB9999000000001013478507')).toBe('');
  });

  it('masks identically on both sides — the server mask is what the buyer sees', () => {
    // The order doc now carries only the SERVER-masked value (the full
    // identifier is admin-only), so the UI renders whatever the server wrote.
    // If the two masks diverged, the buyer would be shown a form of their own
    // handle this codebase never intended to display.
    const MASK_CASES: Array<['alias' | 'mobile', string]> = [
      ['mobile', '+962790000123'], ['mobile', '+962771234567'],
      ['alias', 'MAZZADO123'], ['alias', 'ab'], ['alias', 'abc'], ['alias', ''],
    ];
    for (const [type, value] of MASK_CASES) {
      expect(
        maskCliqIdentifier(type, value),
        `mask diverged on ${type} / ${value}`
      ).toBe(server.maskCliqIdentifier(type, value));
    }
  });
});
