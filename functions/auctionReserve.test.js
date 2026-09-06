import { describe, it, expect } from 'vitest';
const { normalizeReservePrice, authorizeReserveWrite } = require('./auctionReserve');

/* ======================================================================
   These pin the two decisions behind the reserve-price bug.

   The reserve is admin-only by rule, but createListing wrote it from the
   SELLER'S BROWSER. Firestore denied it, the error was swallowed to a
   console.warn, and the lot went live with `reserveMet: false` and no amount —
   so settlement read an absent document, called that "no reserve", and awarded
   the lot at whatever the top bid was.
   ====================================================================== */

describe('normalizeReservePrice', () => {
  it('accepts a plain number', () => {
    expect(normalizeReservePrice(500)).toBe(500);
    expect(normalizeReservePrice(0.5)).toBe(0.5);
  });

  it('accepts the STRING the form actually sends', () => {
    // dropFormState.reservePrice is typed `string` — a number is not guaranteed
    // at this boundary, which is exactly why this coercion is explicit.
    expect(normalizeReservePrice('500')).toBe(500);
    expect(normalizeReservePrice('  750  ')).toBe(750);
  });

  it('treats an empty or junk value as NO reserve, not as a number', () => {
    // `Number('')` is 0 and `Number('abc')` is NaN. Both must land on null:
    // storing either would be worse than storing nothing.
    expect(normalizeReservePrice('')).toBeNull();
    expect(normalizeReservePrice('   ')).toBeNull();
    expect(normalizeReservePrice('abc')).toBeNull();
    expect(normalizeReservePrice(NaN)).toBeNull();
    expect(normalizeReservePrice(null)).toBeNull();
    expect(normalizeReservePrice(undefined)).toBeNull();
  });

  it('rejects zero and negatives', () => {
    // A zero reserve is cleared by every bid, so it is a reserve in name only.
    expect(normalizeReservePrice(0)).toBeNull();
    expect(normalizeReservePrice('0')).toBeNull();
    expect(normalizeReservePrice(-100)).toBeNull();
  });

  it('rejects Infinity and booleans rather than coercing them', () => {
    // `Number(true)` is 1 — a silent reserve of 1 JOD is the kind of value that
    // looks like it worked.
    expect(normalizeReservePrice(Infinity)).toBeNull();
    expect(normalizeReservePrice(true)).toBeNull();
    expect(normalizeReservePrice(false)).toBeNull();
  });
});

describe('authorizeReserveWrite', () => {
  const auction = { sellerId: 'seller-1' };

  it('lets the owning seller set their own reserve', () => {
    expect(authorizeReserveWrite({ callerUid: 'seller-1', isAdmin: false, auction }))
      .toEqual({ ok: true });
  });

  it('lets an admin set it', () => {
    expect(authorizeReserveWrite({ callerUid: 'someone-else', isAdmin: true, auction }))
      .toEqual({ ok: true });
  });

  it('refuses a different signed-in user', () => {
    // The whole reason this moved server-side: the browser cannot be trusted to
    // decide whose lot this is.
    expect(authorizeReserveWrite({ callerUid: 'attacker', isAdmin: false, auction }))
      .toEqual({ ok: false, code: 'permission-denied' });
  });

  it('refuses an unauthenticated caller', () => {
    expect(authorizeReserveWrite({ callerUid: null, isAdmin: false, auction }))
      .toEqual({ ok: false, code: 'unauthenticated' });
  });

  it('reports a missing auction as not-found, checked before ownership', () => {
    // Distinct from permission-denied on purpose: collapsing the two would let a
    // caller probe which auction ids exist by reading the error.
    expect(authorizeReserveWrite({ callerUid: 'anyone', isAdmin: false, auction: null }))
      .toEqual({ ok: false, code: 'not-found' });
  });

  it('does not treat a missing sellerId as ownership', () => {
    // `undefined === undefined` would be true if the check were written
    // carelessly, handing an ownerless lot to any caller.
    expect(authorizeReserveWrite({ callerUid: undefined, isAdmin: false, auction: {} }))
      .toEqual({ ok: false, code: 'unauthenticated' });
    expect(authorizeReserveWrite({ callerUid: 'x', isAdmin: false, auction: {} }))
      .toEqual({ ok: false, code: 'permission-denied' });
  });

  it('requires isAdmin to be exactly true, not merely truthy', () => {
    expect(authorizeReserveWrite({ callerUid: 'x', isAdmin: 'yes', auction }))
      .toEqual({ ok: false, code: 'permission-denied' });
  });
});
