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

// The same variant set functions/notifyCopyParity.test.js drives its byte-identity
// check with. Every event is run against every variant, so whichever event uses a
// given field is covered regardless of which one it is — and, crucially, every
// sub-branch is actually entered.
const DATA_VARIANTS = [
  undefined,
  {},
  { auctionTitle: 'ساعة رولكس', totalDue: 105, paymentHours: 48, topBid: 90, orderId: 'ORD-1', amount: 100, trackingNumber: 'TRK9' },
  { orderId: 'ORD-2' },
  { reason: 'payment_default' },
  { reason: 'payment_default_repeat' },
  { reason: 'admin' },
  { reason: 'حساب مكرر' },
  { outcome: 'refunded' },
  { outcome: 'denied' },
  { auctionTitle: 'x "y" & <z>' },
  { auctionTitle: 'ساعة رولكس', topBid: 90, secondChance: true, offerStatus: 'pending_seller' },
  { auctionTitle: 'ساعة رولكس', topBid: 90, secondChance: true, offerStatus: 'pending_buyer' },
  { auctionTitle: 'ساعة رولكس', secondChance: true },
  { auctionTitle: 'ساعة رولكس', secondChance: false, offerStatus: 'pending_buyer' },
  { auctionTitle: 'ساعة رولكس', secondChance: true, declinedBy: 'buyer' },
  { auctionTitle: 'ساعة رولكس', secondChance: true, declinedBy: 'seller' },
];

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

  it('keeps the same `type` in both languages, in every sub-branch — it drives the in-app icon', () => {
    // Empty `data` alone enters NO sub-branch, so English below_reserve_declined's
    // second-chance branch could carry `type: 'order'` where Arabic carries
    // 'info' and the two recipients would see different icons for the identical
    // event. Drive it with the full variant set instead.
    for (const data of DATA_VARIANTS) {
      for (const event of EVENTS) {
        const label = `${event} / ${JSON.stringify(data)}`;
        expect(copyFor(event, data, 'en').type, label).toBe(copyFor(event, data, 'ar').type);
      }
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

  it('return_resolved differs between refunded and not, and neither branch is blank', () => {
    for (const lang of SUPPORTED_LANGS) {
      const a = copyFor('return_resolved', { auctionTitle: 'X', outcome: 'refunded' }, lang);
      const b = copyFor('return_resolved', { auctionTitle: 'X', outcome: 'rejected' }, lang);
      expect(a.description, lang).not.toBe(b.description);
      // `not.toBe(theOtherBranch)` alone is satisfied by '': an approved refund
      // would then send an empty WhatsApp and email body. The completeness test
      // does not reach here — it probes { auctionTitle, totalDue } and lands on
      // the non-refunded branch.
      expect(a.description.trim().length, `refunded/${lang}`).toBeGreaterThan(0);
      expect(b.description.trim().length, `rejected/${lang}`).toBeGreaterThan(0);
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

  it('a second-chance recipient is TOLD the winner defaulted, not merely spared one phrasing', () => {
    // Positive assertion, replacing a denylist that was weak in English and
    // VACUOUS in Arabic:
    //   - `not.toMatch(/did not (reach|meet)/)` let "Your bids fell short on X"
    //     through untouched — the exact falsehood the branch exists to prevent.
    //   - `not.toMatch(/لم تبلغ المزايدات/)` asserted against a phrase that has
    //     never appeared in this copy map at all (it lives in
    //     functions/emailCopy.js:155), so it could not fail for any input.
    //
    // A second-chance recipient's bids did NOT fall short — the winner failed to
    // pay. Require that fact to be present rather than banning one way of
    // omitting it; fell-short wording cannot satisfy a positive check.
    for (const status of ['pending_seller', 'pending_buyer']) {
      const d = { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: status };
      expect(copyFor('below_reserve_offer', d, 'ar').description, `ar/${status}`).toMatch(/لم يكمل الفائز/);
      expect(copyFor('below_reserve_offer', d, 'en').description, `en/${status}`).toMatch(/never paid/i);
    }
  });

  it('below_reserve_declined distinguishes a buyer decline on a second chance, and neither branch is blank', () => {
    for (const lang of SUPPORTED_LANGS) {
      const a = copyFor('below_reserve_declined', { auctionTitle: 'X', secondChance: true, declinedBy: 'buyer' }, lang);
      const b = copyFor('below_reserve_declined', { auctionTitle: 'X' }, lang);
      expect(a.description, lang).not.toBe(b.description);
      // Same hole as return_resolved: '' differs from the other branch, so the
      // second-chance branch could ship an empty body and stay green.
      expect(a.description.trim().length, `second-chance/${lang}`).toBeGreaterThan(0);
      expect(b.description.trim().length, `plain/${lang}`).toBeGreaterThan(0);
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
