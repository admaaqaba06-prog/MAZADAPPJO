import { describe, it, expect } from 'vitest';
import {
  bidCountOf,
  canEditDrop,
  canCancelDrop,
  cancelWarnsAboutBids,
} from './dropEditability';

describe('bidCountOf — fails closed to "has bids" only on real numbers', () => {
  it('reads a numeric count', () => {
    expect(bidCountOf({ totalBids: 3 })).toBe(3);
  });
  it('treats missing, null and non-numeric as zero', () => {
    expect(bidCountOf({})).toBe(0);
    expect(bidCountOf({ totalBids: null })).toBe(0);
    expect(bidCountOf({ totalBids: undefined })).toBe(0);
    expect(bidCountOf({ totalBids: NaN })).toBe(0);
  });
  // Firestore documents are not type-checked at the boundary: a count that
  // arrives as a string must not coerce into "this lot has bids".
  it('does not coerce non-number types that look numeric', () => {
    expect(bidCountOf({ totalBids: '3' as unknown as number })).toBe(0);
    expect(bidCountOf({ totalBids: true as unknown as number })).toBe(0);
    expect(bidCountOf({ totalBids: [2] as unknown as number })).toBe(0);
    expect(bidCountOf({ totalBids: {} as unknown as number })).toBe(0);
  });
  it('reads a negative count as zero rather than passing it through', () => {
    expect(bidCountOf({ totalBids: -2 })).toBe(0);
  });
  it('reads a non-finite count as zero', () => {
    expect(bidCountOf({ totalBids: Infinity })).toBe(0);
    expect(bidCountOf({ totalBids: -Infinity })).toBe(0);
  });
});

describe('canEditDrop', () => {
  it('allows editing an upcoming lot with no bids', () => {
    expect(canEditDrop({ status: 'upcoming', totalBids: 0 })).toBe(true);
  });
  it('allows editing a live lot that nobody has bid on yet', () => {
    expect(canEditDrop({ status: 'live', totalBids: 0 })).toBe(true);
  });
  it('refuses once a single bid lands', () => {
    expect(canEditDrop({ status: 'live', totalBids: 1 })).toBe(false);
  });
  it('refuses on a finished lot regardless of bids', () => {
    expect(canEditDrop({ status: 'completed', totalBids: 0 })).toBe(false);
    expect(canEditDrop({ status: 'ended', totalBids: 0 })).toBe(false);
  });
  // Locking an admin out of a lot nobody has bid on is the worse failure, so a
  // junk count must not read as "has bids".
  it('still allows editing when the count is junk rather than a real bid', () => {
    expect(canEditDrop({ status: 'live', totalBids: -1 })).toBe(true);
    expect(canEditDrop({ status: 'live', totalBids: NaN })).toBe(true);
    expect(canEditDrop({ status: 'live' })).toBe(true);
  });
  it('allows editing a lot whose status is missing or unrecognised', () => {
    expect(canEditDrop({ totalBids: 0 })).toBe(true);
    expect(canEditDrop({ status: null, totalBids: 0 })).toBe(true);
    expect(canEditDrop({ status: 'scheduled', totalBids: 0 })).toBe(true);
  });
});

describe('canCancelDrop', () => {
  it('allows cancelling before and during bidding', () => {
    expect(canCancelDrop({ status: 'upcoming', totalBids: 0 })).toBe(true);
    expect(canCancelDrop({ status: 'live', totalBids: 4 })).toBe(true);
  });
  it('refuses on a finished lot — settlement already ran', () => {
    expect(canCancelDrop({ status: 'completed', totalBids: 4 })).toBe(false);
    expect(canCancelDrop({ status: 'ended', totalBids: 0 })).toBe(false);
  });
});

describe('cancelWarnsAboutBids', () => {
  it('stays quiet when nobody has bid', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: 0 })).toBe(false);
  });
  it('warns as soon as there is a bid to destroy', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: 1 })).toBe(true);
  });
  it('stays quiet on a junk count — no bid to destroy', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: -1 })).toBe(false);
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: NaN })).toBe(false);
    expect(cancelWarnsAboutBids({ status: 'live' })).toBe(false);
  });
});
