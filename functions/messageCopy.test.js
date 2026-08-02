// functions/messageCopy.test.js
// One source of product copy, in both languages.
//
// This existed only in Arabic, in two places: functions/notify.js and a
// hand-mirrored copy inside the n8n Build Messages node. The duplication is
// what let the branded email layer ship dead on 2026-07-29 and stay dead —
// nothing compared what the server rendered to what the node actually sent.
import { describe, it, expect } from 'vitest';
const { copyFor, resolveLang, SUPPORTED_LANGS } = require('./messageCopy.js');
const { CHANNEL_POLICY } = require('./notify.js');

const EVENTS = Object.keys(CHANNEL_POLICY);

describe('completeness — no event may ship half-translated', () => {
  it('covers exactly the events the n8n contract routes', () => {
    // 20 keys. The live workflow silently drops anything else, so an event
    // here that is not in CHANNEL_POLICY is copy that can never be delivered.
    expect(EVENTS).toHaveLength(20);
  });

  it('returns a non-empty title and description for every event, in BOTH languages', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const event of EVENTS) {
        const c = copyFor(event, { auctionTitle: 'X', totalDue: 10 }, lang);
        expect(c.title.trim().length, `${event}/${lang} title`).toBeGreaterThan(0);
        expect(c.description.trim().length, `${event}/${lang} description`).toBeGreaterThan(0);
      }
    }
  });

  it('never returns Arabic text when English was asked for', () => {
    // The failure this catches is a missing English entry silently falling
    // through to the Arabic map.
    const ARABIC = /[؀-ۿ]/;
    for (const event of EVENTS) {
      const c = copyFor(event, { auctionTitle: 'Rolex', totalDue: 10, reason: 'x' }, 'en');
      expect(ARABIC.test(c.title), `${event} title leaked Arabic`).toBe(false);
    }
  });

  it('keeps the same `type` in both languages — it drives the in-app icon', () => {
    for (const event of EVENTS) {
      expect(copyFor(event, {}, 'en').type, event).toBe(copyFor(event, {}, 'ar').type);
    }
  });
});

describe('sub-branches exist in both languages', () => {
  const bothLangs = (event, data, probe) => {
    for (const lang of SUPPORTED_LANGS) {
      const c = copyFor(event, data, lang);
      expect(c.description.trim().length, `${event}/${lang}`).toBeGreaterThan(0);
      if (probe) probe(c, lang);
    }
  };

  it('account_banned has all three reasons', () => {
    const seen = new Set();
    for (const reason of ['payment_default_repeat', 'payment_default', 'admin_ban']) {
      bothLangs('account_banned', { reason }, (c, lang) => seen.add(`${lang}:${c.description}`));
    }
    // Three distinct messages per language, not one repeated.
    expect(seen.size).toBe(6);
  });

  it('return_resolved differs between refunded and not', () => {
    for (const lang of SUPPORTED_LANGS) {
      const a = copyFor('return_resolved', { auctionTitle: 'X', outcome: 'refunded' }, lang);
      const b = copyFor('return_resolved', { auctionTitle: 'X', outcome: 'rejected' }, lang);
      expect(a.description, lang).not.toBe(b.description);
    }
  });

  it('below_reserve_offer has all three second-chance shapes', () => {
    for (const lang of SUPPORTED_LANGS) {
      const plain = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10 }, lang);
      const seller = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: 'pending_seller' }, lang);
      const buyer = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: 'pending_buyer' }, lang);
      expect(new Set([plain.description, seller.description, buyer.description]).size, lang).toBe(3);
    }
  });

  it('a second-chance recipient is never told their bids fell short', () => {
    // The whole reason this event branches. Arabic: «لم تبلغ المزايدات».
    for (const status of ['pending_seller', 'pending_buyer']) {
      const ar = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: status }, 'ar');
      expect(ar.description).not.toMatch(/لم تبلغ المزايدات/);
      const en = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: status }, 'en');
      expect(en.description.toLowerCase()).not.toMatch(/did not (reach|meet)/);
    }
  });

  it('below_reserve_declined distinguishes a buyer decline on a second chance', () => {
    for (const lang of SUPPORTED_LANGS) {
      const a = copyFor('below_reserve_declined', { auctionTitle: 'X', secondChance: true, declinedBy: 'buyer' }, lang);
      const b = copyFor('below_reserve_declined', { auctionTitle: 'X' }, lang);
      expect(a.description, lang).not.toBe(b.description);
    }
  });
});

describe('an unknown event falls back safely, in the asked-for language', () => {
  it('never throws and never returns an empty title', () => {
    for (const lang of SUPPORTED_LANGS) {
      const c = copyFor('never_heard_of_it', {}, lang);
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.type).toBe('info');
    }
  });

  it('an unknown LANGUAGE falls back to Arabic rather than breaking', () => {
    const c = copyFor('auction_won', { auctionTitle: 'X' }, 'fr');
    expect(c.description).toBe(copyFor('auction_won', { auctionTitle: 'X' }, 'ar').description);
  });
});

describe('resolveLang', () => {
  it("returns 'en' only when the user doc explicitly says so", () => {
    expect(resolveLang({ language: 'en' })).toBe('en');
  });

  it("returns 'ar' for everything else", () => {
    // Arabic is the market default and the safe direction: nobody receives a
    // language they cannot read by accident.
    for (const user of [
      { language: 'ar' }, {}, null, undefined, { language: '' },
      { language: 'EN' }, { language: 'fr' }, { language: 5 }, { language: {} },
    ]) {
      expect(resolveLang(user), JSON.stringify(user)).toBe('ar');
    }
  });

  it('never throws', () => {
    for (const bad of [null, undefined, 0, '', [], 'string']) {
      expect(() => resolveLang(bad)).not.toThrow();
    }
  });
});

describe('SUPPORTED_LANGS', () => {
  it('is exactly ar and en, frozen', () => {
    expect([...SUPPORTED_LANGS].sort()).toEqual(['ar', 'en']);
    expect(Object.isFrozen(SUPPORTED_LANGS)).toBe(true);
  });
});
