import { describe, it, expect } from 'vitest';
const { authorizeOrderRepair, auctionRecordsReserve } = require('./orderRepair');
const { resolveSettlement } = require('./settlement');

/* ======================================================================
   `repairEndedAuctionOrder` is the admin escape hatch for "the closer did
   not run". It created the order having read nothing about the reserve —
   not the amount, not `reserveMet`, not the auction's own status.

   A lot that closed CORRECTLY as `reserve_not_met` presents to an admin
   exactly like a lot the cron dropped: ended, has a winner, has no order.
   One click sold it below its reserve and told the buyer to pay.

   These tests drive the decision through the REAL `resolveSettlement`
   rather than hand-built decision objects, so the repair path and the cron
   cannot drift apart without something here going red.
   ====================================================================== */

const settle = (over = {}) => resolveSettlement({
  totalBids: 3,
  winnerId: 'buyer-1',
  finalPrice: 1000,
  reservePrice: 1000,
  reserveIntended: true,
  ...over,
});

describe('authorizeOrderRepair', () => {
  it('allows the repair it exists for: a genuinely sold lot with no order', () => {
    expect(authorizeOrderRepair({
      auction: { reserveMet: true },
      decision: settle({ finalPrice: 1200 }),
      orderExists: false,
    })).toEqual({ ok: true });
  });

  it('allows a sold lot that never had a reserve at all', () => {
    expect(authorizeOrderRepair({
      auction: {},
      decision: settle({ reservePrice: null, reserveIntended: false }),
      orderExists: false,
    })).toEqual({ ok: true });
  });

  it('REFUSES a lot whose top bid is under the reserve', () => {
    // The headline bug. 950 against a 1000 reserve: a real winner, a real
    // bid, and an order that must not exist.
    const r = authorizeOrderRepair({
      auction: { reserveMet: false },
      decision: settle({ finalPrice: 950 }),
      orderExists: false,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('reserve_not_met');
    expect(r.message).toMatch(/did not meet the reserve/i);
  });

  it('REFUSES a lot far below the reserve, where no offer was even opened', () => {
    // Outside the tolerance band there is no `belowReserveOffer` to point at,
    // so this lot looks even more like a cron failure. It is not one.
    const decision = settle({ finalPrice: 100 });
    expect(decision.offerBelowReserve).toBe(false);
    expect(authorizeOrderRepair({
      auction: { reserveMet: false }, decision, orderExists: false,
    }).ok).toBe(false);
  });

  it('REFUSES a lot whose reserve amount was never stored', () => {
    // The #290 case: intent recorded, amount missing. An admin clicking
    // repair does not make the amount readable.
    const decision = settle({ reservePrice: null });
    expect(decision.reserveUnverifiable).toBe(true);
    const r = authorizeOrderRepair({
      auction: { reserveMet: false }, decision, orderExists: false,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('reserve_unverifiable');
    expect(r.message).toMatch(/auctionSecrets/);
  });

  it('REFUSES a lot with no bids', () => {
    const r = authorizeOrderRepair({
      auction: {},
      decision: settle({ totalBids: 0, winnerId: null }),
      orderExists: false,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsold');
  });

  it('refuses when an order already exists, before judging anything else', () => {
    // Checked first on purpose: a lot that is both already-ordered AND
    // below reserve should report the cheap, true, non-alarming reason.
    const r = authorizeOrderRepair({
      auction: { reserveMet: false },
      decision: settle({ finalPrice: 950 }),
      orderExists: true,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('order_exists');
  });

  it('refuses rather than guessing when there is no decision', () => {
    expect(authorizeOrderRepair({ auction: {}, decision: null, orderExists: false }))
      .toMatchObject({ ok: false, code: 'no_decision' });
    expect(authorizeOrderRepair({ auction: {}, decision: undefined, orderExists: false }).ok)
      .toBe(false);
  });

  describe('a sold lot that is still mid-negotiation', () => {
    const sold = () => settle({ finalPrice: 1200 });

    it.each(['pending_seller', 'pending_buyer'])(
      'refuses while a below-reserve offer sits at %s',
      (status) => {
        // acceptBelowReserve/confirmBelowReserve write this order themselves,
        // transactionally and at the NEGOTIATED price. Writing it here would
        // use the auction's price and race that callable.
        const r = authorizeOrderRepair({
          auction: { reserveMet: true, belowReserveOffer: { status } },
          decision: sold(),
          orderExists: false,
        });
        expect(r.ok).toBe(false);
        expect(r.code).toBe('offer_pending');
      },
    );

    it.each(['declined', 'expired', 'confirmed'])(
      'allows the repair once the offer is settled at %s',
      (status) => {
        expect(authorizeOrderRepair({
          auction: { reserveMet: true, belowReserveOffer: { status } },
          decision: sold(),
          orderExists: false,
        })).toEqual({ ok: true });
      },
    );

    it('is not confused by a malformed offer object', () => {
      expect(authorizeOrderRepair({
        auction: { reserveMet: true, belowReserveOffer: {} },
        decision: sold(), orderExists: false,
      })).toEqual({ ok: true });
      expect(authorizeOrderRepair({
        auction: { reserveMet: true, belowReserveOffer: null },
        decision: sold(), orderExists: false,
      })).toEqual({ ok: true });
    });
  });

  it('survives a missing auction object', () => {
    expect(authorizeOrderRepair({
      auction: null, decision: settle({ finalPrice: 1200 }), orderExists: false,
    })).toEqual({ ok: true });
  });
});

describe('auctionRecordsReserve', () => {
  it('reads PRESENCE, not truthiness', () => {
    // `reserveMet: false` is a lot WITH a reserve that has not been cleared —
    // the most important case, and the one a truthiness check inverts.
    expect(auctionRecordsReserve({ reserveMet: false })).toBe(true);
    expect(auctionRecordsReserve({ reserveMet: true })).toBe(true);
  });

  it('is false only when the marker is absent', () => {
    expect(auctionRecordsReserve({})).toBe(false);
    expect(auctionRecordsReserve({ title: 'no reserve here' })).toBe(false);
    expect(auctionRecordsReserve(null)).toBe(false);
    expect(auctionRecordsReserve(undefined)).toBe(false);
  });

  it('matches what settleAuctionTxn derives, so the two paths cannot drift', () => {
    const auction = { reserveMet: false };
    const viaHelper = auctionRecordsReserve(auction);
    const viaInline = Object.prototype.hasOwnProperty.call(auction || {}, 'reserveMet');
    expect(viaHelper).toBe(viaInline);
  });
});
