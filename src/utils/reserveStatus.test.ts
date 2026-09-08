import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  reserveStatusOf,
  showsReserveBadge,
  belowReserveOfferPublicStatus,
  offerAwaitsSeller,
} from './reserveStatus';

describe('reserveStatusOf', () => {
  it('true -> met, false -> not met', () => {
    expect(reserveStatusOf({ reserveMet: true })).toBe('met');
    expect(reserveStatusOf({ reserveMet: false })).toBe('not_met');
  });

  it('UNSET means no reserve, not an unmet one', () => {
    // createListing writes `reserveMet: false` only when a reserve was actually
    // set. Treating the absent field as 'not_met' would invent a reserve on
    // every no-reserve lot and suppress bidding on lots that are already
    // sellable at any price.
    expect(reserveStatusOf({})).toBe('none');
    expect(reserveStatusOf(undefined)).toBe('none');
    expect(reserveStatusOf(null)).toBe('none');
  });

  it('a no-reserve lot shows no badge at all', () => {
    expect(showsReserveBadge({})).toBe(false);
    expect(showsReserveBadge({ reserveMet: false })).toBe(true);
    expect(showsReserveBadge({ reserveMet: true })).toBe(true);
  });

  it('is two-state — it can never return an amount or a shortfall', () => {
    // The whole contract: the public surface is a label. If this function ever
    // grew a numeric return, that number could only have come from the reserve.
    for (const a of [{ reserveMet: true }, { reserveMet: false }, {}]) {
      expect(typeof reserveStatusOf(a)).toBe('string');
      expect(['met', 'not_met', 'none']).toContain(reserveStatusOf(a));
    }
  });
});

describe('belowReserveOfferPublicStatus mirrors the server table', () => {
  it('maps stored -> contract vocabulary', () => {
    expect(belowReserveOfferPublicStatus('pending_seller')).toBe('pending_seller_decision');
    expect(belowReserveOfferPublicStatus('pending_buyer')).toBe('accepted_below_reserve');
    expect(belowReserveOfferPublicStatus('confirmed')).toBe('accepted_below_reserve');
    expect(belowReserveOfferPublicStatus('declined')).toBe('rejected_below_reserve');
    expect(belowReserveOfferPublicStatus('expired')).toBe('rejected_below_reserve');
    expect(belowReserveOfferPublicStatus(undefined)).toBeNull();
  });

  it('agrees with functions/settlement.js — the two tables cannot drift', () => {
    // Two copies of a mapping in two languages is exactly the divergent-formula
    // bug class settlement.js was written to avoid. tsc cannot see across into
    // the .js, so bind them here by reading the server table's source.
    const serverSrc = readFileSync(
      new URL('../../functions/settlement.js', import.meta.url),
      'utf8',
    );
    const table = serverSrc.slice(
      serverSrc.indexOf('const BELOW_RESERVE_PUBLIC_STATUS = {'),
      serverSrc.indexOf('};', serverSrc.indexOf('const BELOW_RESERVE_PUBLIC_STATUS = {')),
    );
    expect(table).toBeTruthy();
    for (const [stored, expected] of [
      ['pending_seller', 'pending_seller_decision'],
      ['pending_buyer', 'accepted_below_reserve'],
      ['confirmed', 'accepted_below_reserve'],
      ['declined', 'rejected_below_reserve'],
      ['expired', 'rejected_below_reserve'],
    ] as const) {
      expect(table).toContain(`${stored}: '${expected}'`);
      expect(belowReserveOfferPublicStatus(stored)).toBe(expected);
    }
  });
});

describe('offerAwaitsSeller', () => {
  const NOW = 1_700_000_000_000;

  it('only a pending_seller offer awaits the seller', () => {
    expect(offerAwaitsSeller({ status: 'pending_seller', expiresAt: NOW + 1000 }, NOW)).toBe(true);
    for (const status of ['pending_buyer', 'confirmed', 'declined', 'expired']) {
      expect(offerAwaitsSeller({ status, expiresAt: NOW + 1000 }, NOW)).toBe(false);
    }
    expect(offerAwaitsSeller(null, NOW)).toBe(false);
  });

  it('respects an elapsed window', () => {
    expect(offerAwaitsSeller({ status: 'pending_seller', expiresAt: NOW - 1 }, NOW)).toBe(false);
  });

  it('decodes every timestamp shape the app actually hands it', () => {
    const live = { toMillis: () => NOW + 5000 };
    const serialised = { seconds: (NOW + 5000) / 1000 };
    const admin = { _seconds: (NOW + 5000) / 1000 };
    for (const expiresAt of [NOW + 5000, live, serialised, admin]) {
      expect(offerAwaitsSeller({ status: 'pending_seller', expiresAt }, NOW)).toBe(true);
    }
  });

  it('fails OPEN on a missing/undecodable expiry', () => {
    // The server re-checks expiry in acceptBelowReserve/rejectBelowReserve, so
    // failing open shows a button the server may refuse; failing closed would
    // hide the seller's only decision surface on a live offer.
    expect(offerAwaitsSeller({ status: 'pending_seller' }, NOW)).toBe(true);
    expect(offerAwaitsSeller({ status: 'pending_seller', expiresAt: 'nonsense' }, NOW)).toBe(true);
  });
});
