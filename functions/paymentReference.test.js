import { describe, it, expect } from 'vitest';
const { normalizePaymentRef, isValidPaymentRef } = require('./paymentReference');

describe('normalizePaymentRef', () => {
  it('trims, uppercases, and strips spaces', () => {
    expect(normalizePaymentRef('  ab 12  ')).toBe('AB12');
  });
  it('uppercases dashed refs', () => {
    expect(normalizePaymentRef('txn-abc-9')).toBe('TXN-ABC-9');
  });
  it('removes internal spaces', () => {
    expect(normalizePaymentRef('1 2 3 4')).toBe('1234');
  });
});

describe('isValidPaymentRef', () => {
  it('rejects refs shorter than 4', () => {
    expect(isValidPaymentRef('abc')).toBe(false);
  });
  it('accepts refs of length 4+', () => {
    expect(isValidPaymentRef('ab12')).toBe(true);
  });
  it('rejects empty string', () => {
    expect(isValidPaymentRef('')).toBe(false);
  });
  it('rejects null', () => {
    expect(isValidPaymentRef(null)).toBe(false);
  });
  it('rejects refs that normalize below length 4', () => {
    expect(isValidPaymentRef('  a b  ')).toBe(false);
  });
});
