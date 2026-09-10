import { describe, it, expect } from 'vitest';
const {
  offerDeadlineMs, lapsedOffers, undatableOffers, expiryNotification, expiryNeedsCopy, OFFER_FIELDS,
} = require('./offerExpiry');
const { BELOW_RESERVE_WINDOW_HOURS, isBelowReserveOfferExpired, belowReserveBlocksRelist } = require('./settlement');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ======================================================================
   The 24h offer window is enforced when somebody ACTS on an offer, and
   not when nobody does — which is the case it exists for. An ignored
   offer sits at `pending_seller` forever: both parties keep seeing a
   decision that can no longer be made, nobody is told the window closed,
   and the lot never reaches a terminal state.

   These pin the decisions behind the sweep that retires them.
   ====================================================================== */

const HOUR = 3600 * 1000;
const WINDOW = BELOW_RESERVE_WINDOW_HOURS * HOUR;
const T0 = 1_760_000_000_000; // fixed clock — no Date.now() in tests

/** A Firestore-shaped Timestamp, which is what tsToMillis actually receives. */
const ts = (ms) => ({ toMillis: () => ms });

const auctionWith = (field, offer, extra = {}) => ({
  sellerId: 'seller-1', settledAt: ts(T0), [field]: offer, ...extra,
});

describe('offerDeadlineMs', () => {
  it('uses expiresAt when it is usable', () => {
    expect(offerDeadlineMs({ expiresAt: ts(T0 + WINDOW) }, {}))
      .toEqual({ ms: T0 + WINDOW, derived: false });
  });

  it('accepts a raw epoch number as well as a Timestamp', () => {
    expect(offerDeadlineMs({ expiresAt: T0 + WINDOW }, {}).ms).toBe(T0 + WINDOW);
  });

  describe('when expiresAt is unusable', () => {
    // This is the state worth caring about: isBelowReserveOfferExpired returns
    // FALSE for an unreadable deadline, so the offer never expires, blocks
    // auto-relist forever, and stays acceptable forever.
    it.each([
      ['missing', undefined],
      ['null', null],
      ['a string', 'tomorrow'],
      ['NaN', NaN],
      ['an empty object', {}],
    ])('falls back to a derived deadline when expiresAt is %s', (_label, bad) => {
      const r = offerDeadlineMs({ expiresAt: bad }, { settledAt: ts(T0) });
      expect(r).toEqual({ ms: T0 + WINDOW, derived: true });
    });

    it('confirms the state it is rescuing really is unexpirable', () => {
      // Guards the premise. If this ever goes red, the fallback is unnecessary.
      expect(isBelowReserveOfferExpired({ expiresAt: undefined }, T0 + 10 * WINDOW)).toBe(false);
      expect(belowReserveBlocksRelist({ status: 'pending_seller' }, T0 + 10 * WINDOW)).toBe(true);
    });

    it('prefers sellerAcceptedAt, which restarted the window', () => {
      // On a pending_buyer offer the seller's acceptance is nearer the truth
      // than the lot's original settlement.
      const r = offerDeadlineMs(
        { status: 'pending_buyer', sellerAcceptedAt: ts(T0 + 5 * HOUR) },
        { settledAt: ts(T0) },
      );
      expect(r).toEqual({ ms: T0 + 5 * HOUR + WINDOW, derived: true });
    });

    it('falls back to the lot settling only when the offer has no date of its own', () => {
      expect(offerDeadlineMs({}, { settledAt: ts(T0) })).toEqual({ ms: T0 + WINDOW, derived: true });
    });

    it('gives up rather than guessing when nothing is datable', () => {
      expect(offerDeadlineMs({}, {})).toBeNull();
      expect(offerDeadlineMs({}, null)).toBeNull();
    });
  });
});

describe('lapsedOffers', () => {
  const pending = { status: 'pending_seller', topBidderId: 'buyer-1', expiresAt: ts(T0 + WINDOW) };

  it('retires an offer past its deadline', () => {
    const r = lapsedOffers(auctionWith('belowReserveOffer', pending), T0 + WINDOW + 1);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ field: 'belowReserveOffer', derived: false });
  });

  it('leaves a live offer alone', () => {
    expect(lapsedOffers(auctionWith('belowReserveOffer', pending), T0 + HOUR)).toEqual([]);
  });

  it('expires exactly AT the deadline, matching the callables', () => {
    // isBelowReserveOfferExpired is `now >= expiresAt`. A sweep that used `>`
    // would leave a one-tick window where the callables refuse the offer and
    // the sweep declines to retire it.
    const at = T0 + WINDOW;
    expect(lapsedOffers(auctionWith('belowReserveOffer', pending), at)).toHaveLength(1);
    expect(isBelowReserveOfferExpired(pending, at)).toBe(true);
  });

  it.each(['confirmed', 'declined', 'expired'])('ignores an offer already at %s', (status) => {
    const settledOffer = { ...pending, status };
    expect(lapsedOffers(auctionWith('belowReserveOffer', settledOffer), T0 + 10 * WINDOW)).toEqual([]);
  });

  it.each(OFFER_FIELDS)('sweeps %s', (field) => {
    // secondChanceOffer is the same machine, not a similar one — same statuses,
    // same expiresAt, same helpers. Sweeping only one would be arbitrary.
    const r = lapsedOffers(auctionWith(field, pending), T0 + WINDOW + 1);
    expect(r.map(x => x.field)).toEqual([field]);
  });

  it('retires both when a lot somehow carries two lapsed offers', () => {
    const a = { sellerId: 's', settledAt: ts(T0), belowReserveOffer: pending, secondChanceOffer: pending };
    expect(lapsedOffers(a, T0 + WINDOW + 1).map(x => x.field)).toEqual(OFFER_FIELDS);
  });

  it('retires an undated-but-clearly-stale offer via the derived deadline', () => {
    const broken = { status: 'pending_seller', topBidderId: 'buyer-1' };
    const r = lapsedOffers(auctionWith('belowReserveOffer', broken), T0 + WINDOW + 1);
    expect(r).toHaveLength(1);
    expect(r[0].derived).toBe(true);
  });

  it('does NOT retire an undated offer that is still young by the derived clock', () => {
    // The fallback can only ever retire early-or-on-time, never a fresh offer.
    const broken = { status: 'pending_seller' };
    expect(lapsedOffers(auctionWith('belowReserveOffer', broken), T0 + HOUR)).toEqual([]);
  });

  it('survives junk auctions', () => {
    expect(lapsedOffers(null, T0)).toEqual([]);
    expect(lapsedOffers({}, T0)).toEqual([]);
    expect(lapsedOffers({ belowReserveOffer: null }, T0)).toEqual([]);
    expect(lapsedOffers({ belowReserveOffer: { status: 'pending_seller' } }, T0)).toEqual([]);
  });
});

describe('undatableOffers', () => {
  it('surfaces a pending offer with nothing to date it by', () => {
    // Permanently stuck: unexpirable, un-relistable, acceptable forever. The
    // sweep must not invent a date — it reports it instead.
    const r = undatableOffers({ belowReserveOffer: { status: 'pending_seller' } });
    expect(r).toHaveLength(1);
    expect(r[0].field).toBe('belowReserveOffer');
  });

  it('says nothing about offers it can date', () => {
    expect(undatableOffers(auctionWith('belowReserveOffer', { status: 'pending_seller' }))).toEqual([]);
    expect(undatableOffers(auctionWith('belowReserveOffer', {
      status: 'pending_seller', expiresAt: ts(T0),
    }))).toEqual([]);
  });

  it('says nothing about offers that are not pending', () => {
    expect(undatableOffers({ belowReserveOffer: { status: 'declined' } })).toEqual([]);
  });

  it('and lapsedOffers never both claim the same offer', () => {
    const a = { belowReserveOffer: { status: 'pending_seller' } }; // undatable
    expect(lapsedOffers(a, T0 + 10 * WINDOW)).toEqual([]);
    expect(undatableOffers(a)).toHaveLength(1);
  });
});

describe('expiryNotification', () => {
  const auction = { sellerId: 'seller-1' };

  it('tells the BIDDER when the seller never answered', () => {
    // The person who let the window pass and the person left waiting on a
    // result are not the same person, and it is the second one that matters.
    const n = expiryNotification(auction, 'belowReserveOffer', {
      status: 'pending_seller', topBidderId: 'buyer-1',
    });
    expect(n).toMatchObject({ uid: 'buyer-1', event: 'below_reserve_declined' });
  });

  it('reuses existing copy that is already true', () => {
    // "The seller did not accept your bid" — silence and refusal look
    // identical from the bidder's side and have the same consequence, so no
    // new string is needed. `declinedBy` must not be 'buyer', or the copy
    // flips to the other party's wording.
    const n = expiryNotification(auction, 'belowReserveOffer', {
      status: 'pending_seller', topBidderId: 'buyer-1',
    });
    expect(n.data.declinedBy).not.toBe('buyer');
  });

  it('the event it uses really exists and is in-app only', async () => {
    // Guards the claim that this adds no WhatsApp, no email, and needs no
    // n8n change. If the policy is ever loosened, this goes red.
    const notifySrc = readFileSync(
      fileURLToPath(new URL('./notify.js', import.meta.url)), 'utf8',
    );
    expect(notifySrc).toMatch(/below_reserve_declined:\s*INAPP_ONLY/);
  });

  it('reads the second-chance offer’s bidderId too', () => {
    const n = expiryNotification(auction, 'secondChanceOffer', {
      status: 'pending_seller', bidderId: 'runner-up',
    });
    expect(n.uid).toBe('runner-up');
  });

  it('sends nothing rather than notifying undefined', () => {
    expect(expiryNotification(auction, 'belowReserveOffer', { status: 'pending_seller' })).toBeNull();
  });

  it('sends nothing for a lapsed pending_buyer, because no true copy exists', () => {
    // The seller-facing variant of below_reserve_declined is gated on `sc`
    // and would render the BIDDER's wording on a below-reserve lot. Notifying
    // someone with copy describing the wrong event is worse than the silence.
    expect(expiryNotification(auction, 'belowReserveOffer', {
      status: 'pending_buyer', topBidderId: 'buyer-1',
    })).toBeNull();
  });

  it('sends nothing for a status that is not pending', () => {
    expect(expiryNotification(auction, 'belowReserveOffer', {
      status: 'declined', topBidderId: 'buyer-1',
    })).toBeNull();
    expect(expiryNotification(auction, 'belowReserveOffer', null)).toBeNull();
  });
});

describe('expiryNeedsCopy', () => {
  it('flags the gap instead of hiding it', () => {
    // The offer is still retired — that is the part that was broken. The
    // missing notification is reported so it shows up in the logs rather than
    // being discovered by a seller wondering where their sale went.
    expect(expiryNeedsCopy({ status: 'pending_buyer' })).toBe(true);
  });

  it('is false where an event already covers it', () => {
    expect(expiryNeedsCopy({ status: 'pending_seller' })).toBe(false);
    expect(expiryNeedsCopy({ status: 'declined' })).toBe(false);
    expect(expiryNeedsCopy(null)).toBe(false);
  });
});

describe('the sweep is actually wired into a tick', () => {
  // A sweep nobody calls is the same as no sweep — and that is precisely the
  // shape of the bug it fixes: the 24h window was enforced everywhere except
  // on the path where nobody acts.
  const INDEX = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8');

  it('expireLapsedOffers is defined', () => {
    expect(INDEX).toMatch(/async function expireLapsedOffers\(\)/);
  });

  it('and is invoked from paymentDefaultEnforcer', () => {
    const start = INDEX.indexOf('exports.paymentDefaultEnforcer');
    expect(start).toBeGreaterThan(-1);
    const body = INDEX.slice(start, INDEX.indexOf('\nexports.', start + 1));
    expect(body).toMatch(/await expireLapsedOffers\(\)/);
  });

  it('runs before the enforcer can return early', () => {
    // The lapsed offers are from EARLIER runs, so the ticks that clear them
    // are the quiet ones where nothing new defaults. Below the early return,
    // it would only run on ticks that happen to have a fresh default.
    const start = INDEX.indexOf('exports.paymentDefaultEnforcer');
    const body = INDEX.slice(start, INDEX.indexOf('\nexports.', start + 1));
    const call = body.indexOf('await expireLapsedOffers()');
    const earlyReturn = body.search(/if \(snap.empty\) return/);
    expect(call).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(call).toBeLessThan(earlyReturn);
  });

  it('queries by status, so it needs no composite index', () => {
    // A range on expiresAt combined with an equality on status would need one,
    // and would also scan every offer that has ever expired rather than only
    // those pending now.
    const start = INDEX.indexOf('async function expireLapsedOffers');
    const body = INDEX.slice(start, INDEX.indexOf('\n}', start));
    expect(body).toMatch(/\.where\(`\$\{field\}\.status`, '==', status\)/);
    expect(body).not.toMatch(/expiresAt['"`],\s*'<=?'/);
  });

  it('never throws, so it cannot stop the rest of the tick', () => {
    // The same enforcer lifts expired bans. A stuck offer must not block that.
    const start = INDEX.indexOf('async function expireLapsedOffers');
    const body = INDEX.slice(start, INDEX.indexOf('\n}', start));
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch\s*\(e\)\s*\{[\s\S]*?console\.error/);
  });

  it('sends no notification when the status write failed', () => {
    // Telling a bidder the offer was declined while it is still pending would
    // be worse than the silence this replaces.
    const start = INDEX.indexOf('async function expireLapsedOffers');
    const body = INDEX.slice(start, INDEX.indexOf('\n}', start));
    const write = body.indexOf('docSnap.ref.update(');
    const notifyCall = body.indexOf('expiryNotification(');
    expect(write).toBeLessThan(notifyCall);
    expect(body).toMatch(/continue;\s*\/\/ no write, so send nothing/);
  });
});
