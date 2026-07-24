import { describe, it, expect } from 'vitest';
import { isPlaceholderWinner } from './useSocialProof';

describe('isPlaceholderWinner', () => {
  it('flags null/empty as placeholder (no real winner to show)', () => {
    expect(isPlaceholderWinner(null)).toBe(true);
    expect(isPlaceholderWinner('')).toBe(true);
    expect(isPlaceholderWinner('   ')).toBe(true);
  });

  it('flags generic placeholder names, case-insensitively, both languages', () => {
    for (const n of ['Guest', 'guest', ' GUEST ', 'User', 'Anonymous', 'Buyer', 'Bidder', 'زائر', 'مستخدم']) {
      expect(isPlaceholderWinner(n)).toBe(true);
    }
  });

  it('keeps real first names', () => {
    for (const n of ['Mohammad', 'Sara', 'Ahmad', 'خالد']) {
      expect(isPlaceholderWinner(n)).toBe(false);
    }
  });
});
