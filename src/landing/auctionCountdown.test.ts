import { describe, it, expect } from 'vitest';
import { splitCountdown, hasAuctionStarted, parseAuctionStart, pad2 } from './auctionCountdown';

/* ======================================================================
   This arithmetic decides what a banner on the front page of the site
   claims about a live auction, so the cases that matter are the broken
   ones: a passed deadline, a missing deadline, and a typo in the
   configured date.
   ====================================================================== */

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

describe('splitCountdown', () => {
  it('splits a full week', () => {
    expect(splitCountdown(7 * DAY)).toEqual({ days: 7, hours: 0, minutes: 0, seconds: 0 });
  });

  it('splits a mixed remainder', () => {
    const s = 3 * DAY + 5 * HOUR + 42 * MIN + 17;
    expect(splitCountdown(s)).toEqual({ days: 3, hours: 5, minutes: 42, seconds: 17 });
  });

  it('carries correctly one second before a day boundary', () => {
    expect(splitCountdown(DAY - 1)).toEqual({ days: 0, hours: 23, minutes: 59, seconds: 59 });
    expect(splitCountdown(DAY)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 });
  });

  it('reads all zeros at exactly zero', () => {
    expect(splitCountdown(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('clamps a passed deadline to zero rather than going negative', () => {
    // A banner reading "-3 days" is worse than one reading 00:00:00:00.
    expect(splitCountdown(-1)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(splitCountdown(-999999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('survives a missing or junk value', () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(splitCountdown(bad as never)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    }
  });

  it('does not cap days — a long lead time stays readable', () => {
    expect(splitCountdown(45 * DAY).days).toBe(45);
  });
});

describe('hasAuctionStarted', () => {
  it('is false while time remains', () => {
    expect(hasAuctionStarted(1)).toBe(false);
    expect(hasAuctionStarted(7 * DAY)).toBe(false);
  });

  it('is true at zero and past it', () => {
    expect(hasAuctionStarted(0)).toBe(true);
    expect(hasAuctionStarted(-5)).toBe(true);
  });

  it('is FALSE when the deadline is unknown', () => {
    // The important one. An unknown deadline must not put "bidding is open"
    // and a link to a lot on the front page on the strength of missing data.
    expect(hasAuctionStarted(null)).toBe(false);
    expect(hasAuctionStarted(undefined)).toBe(false);
    expect(hasAuctionStarted(NaN)).toBe(false);
  });
});

describe('parseAuctionStart', () => {
  it('parses an ISO string with an explicit offset', () => {
    // Amman is UTC+3; the offset is written into the constant so the launch
    // time does not drift with whoever is reading it.
    expect(parseAuctionStart('2026-09-24T20:00:00+03:00'))
      .toBe(Date.parse('2026-09-24T17:00:00Z'));
  });

  it('returns null for a typo instead of a wrong date', () => {
    // Falling back to null keeps hasAuctionStarted false, so a mistyped
    // constant shows a stopped clock rather than announcing an open auction.
    expect(parseAuctionStart('')).toBeNull();
    expect(parseAuctionStart('next tuesday')).toBeNull();
    expect(parseAuctionStart('2026-13-45T99:99:99')).toBeNull();
  });
});

describe('pad2', () => {
  it('pads single digits', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(7)).toBe('07');
  });

  it('leaves two or more digits alone', () => {
    expect(pad2(42)).toBe('42');
    expect(pad2(365)).toBe('365');
  });

  it('never renders a negative', () => {
    expect(pad2(-3)).toBe('00');
  });
});
