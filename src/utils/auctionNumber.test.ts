import { describe, it, expect } from 'vitest';
import { computeNextNumber } from './auctionNumber';

describe('computeNextNumber', () => {
  it('seeds at 2000 when the counter is missing', () => {
    expect(computeNextNumber(null)).toEqual({ assigned: 2000, next: 2001 });
    expect(computeNextNumber(undefined)).toEqual({ assigned: 2000, next: 2001 });
  });
  it('assigns the stored value and advances by one', () => {
    expect(computeNextNumber(2000)).toEqual({ assigned: 2000, next: 2001 });
    expect(computeNextNumber(2417)).toEqual({ assigned: 2417, next: 2418 });
  });
  it('honors a custom seed', () => {
    expect(computeNextNumber(null, 5000)).toEqual({ assigned: 5000, next: 5001 });
  });
});
