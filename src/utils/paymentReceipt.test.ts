import { describe, it, expect } from 'vitest';
import { normalizeReceiptUrl, receiptFingerprint, findDuplicateFingerprints } from './paymentReceipt';

describe('normalizeReceiptUrl', () => {
  it('resolves each legacy field name in priority order', () => {
    expect(normalizeReceiptUrl({ receiptUrl: 'https://a/1.png' })).toBe('https://a/1.png');
    expect(normalizeReceiptUrl({ paymentProofUrl: 'https://a/2.png' })).toBe('https://a/2.png');
    expect(normalizeReceiptUrl({ paymentProofImage: 'https://a/3.png' })).toBe('https://a/3.png');
    expect(normalizeReceiptUrl({ proofUrl: 'https://a/4.png' })).toBe('https://a/4.png');
    expect(normalizeReceiptUrl({ paymentImageUrl: 'https://a/5.png' })).toBe('https://a/5.png');
    expect(normalizeReceiptUrl({ receiptUrl: 'https://a/1.png', paymentProofUrl: 'https://a/2.png' })).toBe('https://a/1.png');
  });
  it('returns null for missing, empty, or non-http values', () => {
    expect(normalizeReceiptUrl({})).toBeNull();
    expect(normalizeReceiptUrl({ receiptUrl: '' })).toBeNull();
    expect(normalizeReceiptUrl({ receiptUrl: 'N/A' })).toBeNull();
    expect(normalizeReceiptUrl({ receiptUrl: 42 })).toBeNull();
  });
});

describe('receiptFingerprint', () => {
  it('strips the query string (storage tokens differ per fetch)', () => {
    expect(receiptFingerprint('https://s/o/payment-proofs%2Fu%2F1.png?alt=media&token=abc'))
      .toBe('https://s/o/payment-proofs%2Fu%2F1.png');
    expect(receiptFingerprint('https://a/x.png')).toBe('https://a/x.png');
    expect(receiptFingerprint(null)).toBeNull();
  });
});

describe('findDuplicateFingerprints', () => {
  it('flags a fingerprint used by two records, ignores same-record repeats and nulls', () => {
    const dups = findDuplicateFingerprints([
      { id: 'r1', url: 'https://s/p.png?token=a' },
      { id: 'r2', url: 'https://s/p.png?token=b' },
      { id: 'r3', url: 'https://s/other.png' },
      { id: 'r4', url: null },
    ]);
    expect(dups.has('https://s/p.png')).toBe(true);
    expect(dups.has('https://s/other.png')).toBe(false);
    expect(dups.size).toBe(1);
  });
});
