import { describe, it, expect } from 'vitest';
const { reserveMet, resolveSettlement, nextAuctionNumber } = require('./settlement');

describe('reserveMet', () => {
  it('is true when no reserve is set', () => {
    expect(reserveMet(50, null)).toBe(true);
    expect(reserveMet(50, undefined)).toBe(true);
    expect(reserveMet(50, 0)).toBe(true); // 0/falsey reserve = no reserve
  });
  it('is true only when final price reaches the reserve', () => {
    expect(reserveMet(199, 200)).toBe(false);
    expect(reserveMet(200, 200)).toBe(true);
    expect(reserveMet(250, 200)).toBe(true);
  });
});

describe('resolveSettlement', () => {
  it('sold: bids exist, has winner, reserve met', () => {
    expect(resolveSettlement({ totalBids: 3, winnerId: 'u1', finalPrice: 250, reservePrice: 200 }))
      .toEqual({ outcome: 'sold', status: 'completed' });
  });
  it('sold: no reserve set', () => {
    expect(resolveSettlement({ totalBids: 1, winnerId: 'u1', finalPrice: 5, reservePrice: null }))
      .toEqual({ outcome: 'sold', status: 'completed' });
  });
  it('reserve_not_met: bids exist but under reserve', () => {
    expect(resolveSettlement({ totalBids: 3, winnerId: 'u1', finalPrice: 150, reservePrice: 200 }))
      .toEqual({ outcome: 'reserve_not_met', status: 'reserve_not_met' });
  });
  it('unsold: no bids / no winner', () => {
    expect(resolveSettlement({ totalBids: 0, winnerId: null, finalPrice: 0, reservePrice: 200 }))
      .toEqual({ outcome: 'unsold', status: 'ended' });
  });
});

describe('nextAuctionNumber', () => {
  it('seeds at 2000 when counter is missing', () => {
    expect(nextAuctionNumber(null)).toEqual({ assigned: 2000, next: 2001 });
    expect(nextAuctionNumber(undefined)).toEqual({ assigned: 2000, next: 2001 });
  });
  it('assigns the stored value and advances by one', () => {
    expect(nextAuctionNumber(2000)).toEqual({ assigned: 2000, next: 2001 });
    expect(nextAuctionNumber(2417)).toEqual({ assigned: 2417, next: 2418 });
  });
  it('honors a custom seed', () => {
    expect(nextAuctionNumber(null, 5000)).toEqual({ assigned: 5000, next: 5001 });
  });
});
