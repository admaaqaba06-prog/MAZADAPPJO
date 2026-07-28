import { describe, it, expect } from 'vitest';
const { maskBidderName } = require('./bidderMask');

describe('maskBidderName', () => {
  it('masks a full name keeping first + last char', () => {
    expect(maskBidderName('Karam Samman')).toBe('K***n');
  });
  it('masks a short name', () => {
    expect(maskBidderName('Ali')).toBe('A***i');
    expect(maskBidderName('Jo')).toBe('J***o');
    expect(maskBidderName('A')).toBe('A***');
  });
  it('handles Arabic names (unicode-safe)', () => {
    expect(maskBidderName('كرم سمان')).toBe('ك***ن');
  });
  it('never returns the full name for a multi-char input', () => {
    const out = maskBidderName('Mohammad Janajri');
    expect(out).not.toBe('Mohammad Janajri');
    expect(out).toContain('***');
  });
  it('falls back to "Bidder" for empty/null/whitespace', () => {
    expect(maskBidderName('')).toBe('Bidder');
    expect(maskBidderName(null)).toBe('Bidder');
    expect(maskBidderName('   ')).toBe('Bidder');
  });
});
