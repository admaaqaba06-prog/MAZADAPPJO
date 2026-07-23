import { describe, it, expect } from 'vitest';
import { isExpectedBidFailure } from './bidErrors';

describe('isExpectedBidFailure', () => {
  it('treats routine server rejections as expected (not health incidents)', () => {
    for (const msg of [
      'Auction has ended',
      'Minimum bid required is 30 JOD',
      'Insufficient Funds in wallet',
      'active subscription required',
      'Account restricted',
      'This auction is not accepting bids',
      'MEMBERSHIP_REQUIRED',
      'PRICE_MOVED_RETRY',
    ]) {
      expect(isExpectedBidFailure(msg), msg).toBe(true);
    }
  });

  it('treats genuinely unexpected failures as NOT expected (still logged)', () => {
    for (const msg of [
      'INTERNAL',
      'permission-denied',
      'Something exploded on the server',
      'undefined is not a function',
    ]) {
      expect(isExpectedBidFailure(msg), msg).toBe(false);
    }
  });

  it('handles empty / nullish messages safely (unexpected → logged)', () => {
    expect(isExpectedBidFailure('')).toBe(false);
    expect(isExpectedBidFailure(null)).toBe(false);
    expect(isExpectedBidFailure(undefined)).toBe(false);
  });
});
