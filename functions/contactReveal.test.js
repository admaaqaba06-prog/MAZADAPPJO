// D5 — counterparty contact reveal.
//
// Once money is in, the buyer and seller have to coordinate a physical handover
// in Amman. Today they cannot: firestore.rules restricts `users` reads to the
// owner and admins, so neither side can look the other up, and the order doc
// carries no seller phone. The whole delivery conversation happens off-platform
// through whatever WhatsApp thread the CS team brokers.
//
// This reveals ONE phone number to ONE counterparty, and only once the money is
// verified in. The gate matters more than the feature: without
// `paymentVerified`, anyone who placed a bid could harvest the seller's number.
import { describe, it, expect } from 'vitest';
import { resolveCounterpartyContact } from './contactReveal.js';

const ORDER = {
  buyerId: 'b1',
  sellerId: 's1',
  status: 'paid',
  paymentVerified: true,
  deliveryPhone: '+962790001111',
};

const BUYER_DOC = { phoneNumber: '+962790001111', name: 'Buyer' };
const SELLER_DOC = { phoneNumber: '+962790002222', name: 'Seller' };

const ctx = (over = {}) => ({
  order: ORDER, buyer: BUYER_DOC, seller: SELLER_DOC, ...over,
});

describe('resolveCounterpartyContact — who sees whom', () => {
  it('gives the buyer the seller phone', () => {
    const r = resolveCounterpartyContact(ctx(), 'b1');
    expect(r.phone).toBe('+962790002222');
    expect(r.name).toBe('Seller');
    expect(r.role).toBe('seller');
  });

  it('gives the seller the delivery phone the buyer chose, not their account phone', () => {
    // The buyer may pay from one number and want delivery coordinated on
    // another — deliveryPhone is the one they nominated at checkout.
    const r = resolveCounterpartyContact(ctx({
      order: { ...ORDER, deliveryPhone: '+962790009999' },
    }), 's1');
    expect(r.phone).toBe('+962790009999');
    expect(r.role).toBe('buyer');
  });

  it('falls back to the buyer account phone when no delivery phone was given', () => {
    const r = resolveCounterpartyContact(ctx({
      order: { ...ORDER, deliveryPhone: undefined },
    }), 's1');
    expect(r.phone).toBe('+962790001111');
  });
});

describe('resolveCounterpartyContact — the gate', () => {
  it('refuses anyone who is not a party to the order', () => {
    expect(() => resolveCounterpartyContact(ctx(), 'stranger'))
      .toThrowError(/party/i);
  });

  it('refuses before the payment is verified — a bidder must not harvest numbers', () => {
    expect(() => resolveCounterpartyContact(ctx({
      order: { ...ORDER, paymentVerified: false },
    }), 'b1')).toThrowError(/verified/i);
  });

  it('refuses on a cancelled or refunded order — there is nothing left to coordinate', () => {
    for (const status of ['cancelled', 'refunded']) {
      expect(() => resolveCounterpartyContact(ctx({
        order: { ...ORDER, status },
      }), 'b1')).toThrowError(/closed|cancel|refund/i);
    }
  });

  it('reports a missing phone rather than returning an empty string', () => {
    expect(() => resolveCounterpartyContact(ctx({
      seller: { name: 'Seller' },
    }), 'b1')).toThrowError(/no phone/i);
  });

  it('throws codes the callable can map', () => {
    const cases = [
      ['stranger', ctx(), 'permission-denied'],
      ['b1', ctx({ order: { ...ORDER, paymentVerified: false } }), 'failed-precondition'],
    ];
    for (const [uid, c, code] of cases) {
      try {
        resolveCounterpartyContact(c, uid);
        throw new Error('should have thrown');
      } catch (e) {
        expect(e.code).toBe(code);
      }
    }
  });
});

describe('waMeLink', () => {
  it('strips everything but digits, as wa.me requires', async () => {
    const { waMeLink } = await import('./contactReveal.js');
    expect(waMeLink('+962 79 000 2222')).toBe('https://wa.me/962790002222');
    expect(waMeLink('00962790002222')).toBe('https://wa.me/962790002222');
  });

  it('returns null for junk rather than a broken link', async () => {
    const { waMeLink } = await import('./contactReveal.js');
    expect(waMeLink('')).toBeNull();
    expect(waMeLink('abc')).toBeNull();
  });
});
