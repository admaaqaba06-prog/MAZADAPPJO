import { describe, it, expect } from 'vitest';
import { matchesAuctionSearch } from './auctionSearch';

const lot = { title: 'iPhone 17 Pro', description: 'Sealed, box and papers', auctionNumber: 2002 };

describe('matchesAuctionSearch', () => {
  it('matches the auction number with and without the #', () => {
    expect(matchesAuctionSearch(lot, '2002')).toBe(true);
    expect(matchesAuctionSearch(lot, '#2002')).toBe(true);
    expect(matchesAuctionSearch(lot, ' #2002 ')).toBe(true);
  });

  it('matches the number EXACTLY — a prefix must not drag in neighbours', () => {
    // The whole point of quoting "#2002" is to land on one lot.
    expect(matchesAuctionSearch(lot, '200')).toBe(false);
    expect(matchesAuctionSearch(lot, '20020')).toBe(false);
    expect(matchesAuctionSearch({ ...lot, auctionNumber: 2003 }, '2002')).toBe(false);
  });

  it('still matches title and description as substrings', () => {
    expect(matchesAuctionSearch(lot, 'iphone')).toBe(true);
    expect(matchesAuctionSearch(lot, 'PRO')).toBe(true);
    expect(matchesAuctionSearch(lot, 'papers')).toBe(true);
    expect(matchesAuctionSearch(lot, 'samsung')).toBe(false);
  });

  it('lets a digit string still hit the title when the number does not match', () => {
    // "17" is not lot #17, but it IS in the title — the number check must not
    // short-circuit the text search.
    expect(matchesAuctionSearch(lot, '17')).toBe(true);
  });

  it('matches everything on a blank term', () => {
    expect(matchesAuctionSearch(lot, '')).toBe(true);
    expect(matchesAuctionSearch(lot, '   ')).toBe(true);
    expect(matchesAuctionSearch(lot, null)).toBe(true);
    expect(matchesAuctionSearch(lot, undefined)).toBe(true);
  });

  it('never throws on missing fields or a missing item', () => {
    expect(matchesAuctionSearch({}, 'anything')).toBe(false);
    expect(matchesAuctionSearch({ title: null, description: null }, 'x')).toBe(false);
    expect(matchesAuctionSearch(null, 'x')).toBe(false);
    expect(matchesAuctionSearch(undefined, 'x')).toBe(false);
    // A lot with no number is still searchable by text.
    expect(matchesAuctionSearch({ title: 'Rolex' }, 'rolex')).toBe(true);
    expect(matchesAuctionSearch({ title: 'Rolex' }, '2002')).toBe(false);
  });
});
