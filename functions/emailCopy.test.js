// Email content layer.
//
// Every channel used to share ONE string from notify.js `copyFor()` — so the
// email rendered an in-app toast inside an HTML shell. A payment reminder went
// out reading «ما زال "ارقيله " بانتظار الدفع. بادر قبل انتهاء المهلة.» with no
// amount, no deadline, no order reference and a generic "open the app" button,
// while the order carried all three.
//
// In-app has to be terse. Email has room. This module is the email's own copy,
// and it also lets n8n stop duplicating a copy map: the payload now carries the
// rendered content, so the workflow is a dumb template.
import { describe, it, expect } from 'vitest';
import {
  emailFor, formatJod, formatDeadline, orderDeepLink, cleanTitle, detailRows, brandFor, BRAND,
} from './emailCopy.js';

const AMMAN = 'Asia/Amman';

describe('cleanTitle', () => {
  it('trims the stray whitespace that shipped inside the quotes', () => {
    // The live reminder rendered «"ارقيله "» — a trailing space inside quotes.
    expect(cleanTitle(' ارقيله ')).toBe('ارقيله');
    expect(cleanTitle('iPhone   15')).toBe('iPhone 15');
  });

  it('never returns undefined into a template', () => {
    expect(cleanTitle(undefined)).toBe('');
    expect(cleanTitle(null)).toBe('');
  });
});

describe('formatJod', () => {
  it('formats with two decimals and Western digits, per the numeral policy', () => {
    expect(formatJod(105)).toBe('105.00 د.أ');
    expect(formatJod(1.5)).toBe('1.50 د.أ');
  });

  it('returns empty for a missing or junk amount rather than "NaN د.أ"', () => {
    expect(formatJod(undefined)).toBe('');
    expect(formatJod('abc')).toBe('');
    expect(formatJod(0)).toBe('');
  });
});

describe('formatDeadline', () => {
  it('renders an Amman-local date and time', () => {
    // 2026-07-30T09:00:00Z === 12:00 in Amman (UTC+3, no DST since 2022).
    const out = formatDeadline(Date.UTC(2026, 6, 30, 9, 0, 0));
    expect(out).toContain('2026');
    expect(out).toMatch(/12:00/);
  });

  it('returns empty for an unusable timestamp instead of "Invalid Date"', () => {
    expect(formatDeadline(null)).toBe('');
    expect(formatDeadline('nonsense')).toBe('');
    expect(formatDeadline(0)).toBe('');
  });
});

describe('orderDeepLink', () => {
  it('links straight to the order, not the app root', () => {
    // modal=order + order=<id> is a real route — AppContext.tsx feeds it to
    // setGlobalSelectedOrderId. A bare /orders would make the buyer hunt.
    expect(orderDeepLink('o1')).toBe('https://www.mazad-jo.com/orders?modal=order&order=o1');
  });

  it('url-encodes the id', () => {
    expect(orderDeepLink('a b')).toContain('order=a%20b');
  });

  it('falls back to the orders list when there is no id', () => {
    expect(orderDeepLink('')).toBe('https://www.mazad-jo.com/orders');
  });
});

describe('emailFor — payment_due carries what the old email omitted', () => {
  const data = {
    auctionTitle: ' ارقيله ',
    orderId: 'ord-1',
    orderRef: 'MZ-7K3QP',
    totalDue: 105,
    paymentDeadlineAt: Date.UTC(2026, 6, 30, 9, 0, 0),
  };

  it('states the amount and the deadline', () => {
    const e = emailFor('payment_due', data);
    const values = e.details.map(d => d.value).join(' | ');
    expect(values).toContain('105.00 د.أ');
    expect(values).toMatch(/12:00/);
  });

  it('carries the MZ order reference so support can be quoted it', () => {
    const e = emailFor('payment_due', data);
    expect(e.details.map(d => d.value)).toContain('MZ-7K3QP');
  });

  it('deep-links to the order rather than "open the app"', () => {
    const e = emailFor('payment_due', data);
    expect(e.cta.url).toBe('https://www.mazad-jo.com/orders?modal=order&order=ord-1');
    expect(e.cta.label).not.toMatch(/افتح التطبيق/);
  });

  it('uses the cleaned title in the subject', () => {
    const e = emailFor('payment_due', data);
    expect(e.subject).toContain('ارقيله');
    expect(e.subject).not.toContain('ارقيله ”');
    expect(e.subject).not.toMatch(/\s{2,}/);
  });

  it('is transactional — no unsubscribe on an email about money owed', () => {
    expect(emailFor('payment_due', data).kind).toBe('transactional');
  });
});

describe('emailFor — every email-enabled event produces usable content', () => {
  const EVENTS = [
    'auction_won', 'payment_due', 'payment_reminder', 'below_reserve_offer',
    'below_reserve_seller_accepted', 'order_preparing', 'order_shipped',
    'order_delivered', 'order_completed', 'order_refunded', 'membership_rejected',
    'order_payment_rejected', 'account_banned', 'ban_lifted', 'return_requested',
    'return_resolved',
  ];

  it('gives every event a subject, a heading and a body', () => {
    for (const ev of EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'X', orderId: 'o1' });
      expect(e.subject.length, ev).toBeGreaterThan(0);
      expect(e.heading.length, ev).toBeGreaterThan(0);
      expect(e.intro.length, ev).toBeGreaterThan(0);
    }
  });

  it('never leaks an empty detail row', () => {
    // No amount, no deadline, no ref on this payload — the rows must be absent,
    // not present-and-blank.
    for (const ev of EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'X' });
      for (const row of e.details) {
        expect(String(row.value).trim().length, `${ev}/${row.label}`).toBeGreaterThan(0);
      }
    }
  });

  it('falls back safely for an unknown event', () => {
    const e = emailFor('never_heard_of_it', {});
    expect(e.subject.length).toBeGreaterThan(0);
    expect(e.kind).toBe('transactional');
  });
});

describe('emailFor — below_reserve_offer branches for a second chance', () => {
  // Same event, two different situations. The default intro says the bids did
  // not reach the asking price; for a second chance that is false — the winner
  // defaulted — and it is addressed to a seller, not to the runner-up.
  const base = { auctionTitle: 'ساعة', orderId: 'o1' };

  it('keeps the below-reserve intro when no second-chance flag is set', () => {
    const e = emailFor('below_reserve_offer', base);
    expect(e.intro).toContain('لم تبلغ المزايدات السعر المطلوب');
  });

  it('never tells a second-chance recipient their bids fell short', () => {
    for (const offerStatus of ['pending_seller', 'pending_buyer']) {
      const e = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus });
      expect(e.intro, offerStatus).not.toContain('لم تبلغ المزايدات السعر المطلوب');
      expect(e.intro, offerStatus).toContain('لم يكمل الفائز');
      expect(e.subject, offerStatus).toContain('فرصة ثانية');
      expect(e.heading.length, offerStatus).toBeGreaterThan(0);
      expect(e.preheader.length, offerStatus).toBeGreaterThan(0);
    }
  });

  it('addresses the seller and the runner-up differently', () => {
    const seller = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus: 'pending_seller' });
    const buyer = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus: 'pending_buyer' });
    expect(seller.intro).not.toBe(buyer.intro);
    expect(seller.subject).not.toBe(buyer.subject);
    expect(seller.intro).toContain('السعر المطلوب'); // asked to sell under reserve
    expect(buyer.intro).toContain('معروض عليك');     // offered the lot
  });

  it('an unknown offerStatus still gets second-chance copy, not the false one', () => {
    const e = emailFor('below_reserve_offer', { ...base, secondChance: true });
    expect(e.intro).toContain('لم يكمل الفائز');
  });

  it('leaves other events alone even when the flag rides along', () => {
    const e = emailFor('payment_due', { ...base, secondChance: true, offerStatus: 'pending_buyer' });
    expect(e.intro).toBe(emailFor('payment_due', base).intro);
  });

  it('stays transactional with a working CTA', () => {
    const e = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus: 'pending_buyer' });
    expect(e.kind).toBe('transactional');
    expect(e.cta.url).toContain('mazad-jo.com');
  });
});

describe('emailFor — a second-chance CTA never points at the defaulted order', () => {
  // No order exists when the offer goes out, and orders/<auctionId> belongs to
  // the buyer who defaulted — firestore.rules refuses to show it to the
  // runner-up. The one email whose job is to convert them used to land there.
  it('links a second-chance offer to the lot page', () => {
    for (const event of ['below_reserve_offer', 'below_reserve_seller_accepted']) {
      const e = emailFor(event, { auctionTitle: 'ساعة', auctionId: 'a1', secondChance: true });
      expect(e.cta.url, event).toBe('https://www.mazad-jo.com/auction/a1');
      expect(e.cta.url, event).not.toContain('modal=order');
    }
  });

  it('still links to the order once one exists', () => {
    const e = emailFor('payment_due', { auctionTitle: 'ساعة', auctionId: 'a1', orderId: 'a1__sc', secondChance: true });
    expect(e.cta.url).toBe('https://www.mazad-jo.com/orders?modal=order&order=a1__sc');
  });

  it('leaves the non-second-chance fallback alone (a normal order IS the auction id)', () => {
    const e = emailFor('auction_won', { auctionTitle: 'ساعة', auctionId: 'a1' });
    expect(e.cta.url).toBe('https://www.mazad-jo.com/orders?modal=order&order=a1');
  });

  it('url-encodes an awkward auction id', () => {
    const e = emailFor('below_reserve_offer', { auctionId: 'a b', secondChance: true });
    expect(e.cta.url).toBe('https://www.mazad-jo.com/auction/a%20b');
  });
});

describe('BRAND — the footer identity that was missing entirely', () => {
  it('carries the registered entity and licence number', () => {
    expect(BRAND.legalName).toContain('Al Hani');
    expect(BRAND.registration).toBe('200213982');
  });

  it('carries the address, hours and both published numbers', () => {
    // 'عمّان' carries a shadda — assert on the street, which is stable either way.
    expect(BRAND.addressAr).toContain('شارع المدينة المنورة');
    expect(BRAND.hoursAr.length).toBeGreaterThan(0);
    expect(BRAND.supportPhone).toBe('+962781444899');
    expect(BRAND.paymentsPhone).toBe('+962785446498');
  });

  it('links terms and privacy', () => {
    expect(BRAND.termsUrl).toContain('mazad-jo.com');
    expect(BRAND.privacyUrl).toContain('mazad-jo.com');
  });
});

// ---------------------------------------------------------------------------
// Bilingual email. Nothing renders this yet — the live n8n Build Messages node
// has never referenced `email_content` and builds its own subject and html, so
// emailFor's output has been computed and discarded on every send since it
// shipped. Task 4 makes the node a forwarder; until it lands these tests are
// the ONLY signal on the English copy, so they assert the meaning of the words
// and not just their presence.
// ---------------------------------------------------------------------------

// U+0600–U+06FF. Emoji and Western digits are deliberately outside it: the
// numeral policy keeps digits Western in both languages.
const ARABIC = /[؀-ۿ]/;

const EMAIL_EVENTS = [
  'auction_won', 'payment_due', 'payment_reminder', 'below_reserve_offer',
  'below_reserve_seller_accepted', 'order_preparing', 'order_shipped',
  'order_delivered', 'order_completed', 'order_refunded', 'membership_rejected',
  'order_payment_rejected', 'account_banned', 'ban_lifted', 'return_requested',
  'return_resolved',
];

describe('emailFor — both languages', () => {
  it('gives every email-enabled event a subject, heading and body in English', () => {
    for (const ev of EMAIL_EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'Rolex', orderId: 'o1' }, 'en');
      expect(e.subject.trim().length, ev).toBeGreaterThan(0);
      expect(e.heading.trim().length, ev).toBeGreaterThan(0);
      expect(e.intro.trim().length, ev).toBeGreaterThan(0);
    }
  });

  it('does not leak Arabic into an English subject or heading', () => {
    for (const ev of EMAIL_EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'Rolex', orderId: 'o1' }, 'en');
      expect(ARABIC.test(e.subject), `${ev} subject`).toBe(false);
      expect(ARABIC.test(e.heading), `${ev} heading`).toBe(false);
    }
  });

  it('does not leak Arabic into the body, preview text or button either', () => {
    // The subject and heading are the loudest, not the only, place a missing
    // English entry shows up — a dropped entry falls through to Arabic, and it
    // must be caught wherever it lands.
    for (const ev of EMAIL_EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'Rolex', orderId: 'o1' }, 'en');
      expect(ARABIC.test(e.intro), `${ev} intro`).toBe(false);
      expect(ARABIC.test(e.preheader), `${ev} preheader`).toBe(false);
      if (e.cta) expect(ARABIC.test(e.cta.label), `${ev} cta`).toBe(false);
    }
  });

  it('defaults to Arabic when no language is given — every existing caller', () => {
    const a = emailFor('payment_due', { auctionTitle: 'ساعة', orderId: 'o1' });
    const b = emailFor('payment_due', { auctionTitle: 'ساعة', orderId: 'o1' }, 'ar');
    expect(a).toEqual(b);
  });

  it('falls back to Arabic for a language it does not speak', () => {
    // Safe direction: an Arabic reader must never be sent a language by accident.
    for (const junk of ['fr', 'EN', '', null, undefined, 42, {}]) {
      const e = emailFor('payment_due', { auctionTitle: 'ساعة', orderId: 'o1' }, junk);
      expect(e.intro, String(junk)).toBe(emailFor('payment_due', { auctionTitle: 'ساعة', orderId: 'o1' }, 'ar').intro);
    }
  });

  it('never leaks an empty detail row in either language', () => {
    for (const lang of ['ar', 'en']) {
      for (const ev of EMAIL_EVENTS) {
        for (const row of emailFor(ev, { auctionTitle: 'X' }, lang).details) {
          expect(String(row.value).trim().length, `${ev}/${lang}/${row.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('branches second chance in English too', () => {
    const e = emailFor('below_reserve_offer', { auctionTitle: 'Rolex', auctionId: 'a1', secondChance: true, offerStatus: 'pending_buyer' }, 'en');
    expect(e.intro.toLowerCase()).not.toMatch(/did not (reach|meet)/);
    expect(e.cta.url).toBe('https://www.mazad-jo.com/auction/a1');
  });

  it('keeps the legal identity untranslated — a registered name is not translated', () => {
    expect(BRAND.legalName).toContain('Al Hani');
    expect(BRAND.registration).toBe('200213982');
  });

  it('names the sender rather than a lot when the payload carries no title', () => {
    const e = emailFor('account_banned', {}, 'en');
    expect(ARABIC.test(e.subject)).toBe(false);
    expect(emailFor('auction_won', {}, 'en').subject).toContain('Mazad JO');
    expect(emailFor('auction_won', {}, 'ar').subject).toContain('مزاد جو');
  });

  it('falls back safely for an unknown event in English', () => {
    const e = emailFor('never_heard_of_it', {}, 'en');
    expect(e.subject.trim().length).toBeGreaterThan(0);
    expect(ARABIC.test(e.subject)).toBe(false);
    expect(ARABIC.test(e.intro)).toBe(false);
    expect(e.kind).toBe('transactional');
  });

  it('never degrades a known event to the generic update email', () => {
    // A known event missing from a language map is a BUG, and it must not be
    // servable as "you have an update". The Arabic-leak assertions catch it
    // today only because the miss falls through to Arabic; this catches it even
    // if that fall-through is ever replaced by a drop to FALLBACK.
    for (const lang of ['ar', 'en']) {
      const generic = emailFor('never_heard_of_it', { auctionTitle: 'Rolex', orderId: 'o1' }, lang);
      for (const ev of EMAIL_EVENTS) {
        const e = emailFor(ev, { auctionTitle: 'Rolex', orderId: 'o1' }, lang);
        expect(e.subject, `${ev}/${lang}`).not.toBe(generic.subject);
        expect(e.heading, `${ev}/${lang}`).not.toBe(generic.heading);
        expect(e.intro, `${ev}/${lang}`).not.toBe(generic.intro);
      }
    }
  });

  it('reports the language it rendered in', () => {
    expect(emailFor('payment_due', {}, 'en').lang).toBe('en');
    expect(emailFor('payment_due', {}).lang).toBe('ar');
  });
});

describe('emailFor — the second chance says what actually happened, in English', () => {
  const base = { auctionTitle: 'Rolex', auctionId: 'a1' };

  it('states the defaulted winner as a fact to both recipients', () => {
    // Asserted POSITIVELY. A denylist of one phrase is defeated by rewording;
    // the real requirement is that the runner-up and the seller are TOLD the
    // winner failed to pay, because that is the entire reason for the email.
    for (const offerStatus of ['pending_seller', 'pending_buyer', 'something_else']) {
      const e = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus }, 'en');
      expect(e.intro.toLowerCase(), offerStatus).toMatch(/winner/);
      expect(e.intro.toLowerCase(), offerStatus).toMatch(/did not complete payment/);
      expect(e.subject, offerStatus).toContain('Second chance');
      expect(e.heading.trim().length, offerStatus).toBeGreaterThan(0);
      expect(e.preheader.trim().length, offerStatus).toBeGreaterThan(0);
      expect(ARABIC.test(e.intro), offerStatus).toBe(false);
    }
  });

  it('keeps the below-reserve wording when there is no second chance', () => {
    // The false sentence the branch exists to avoid is TRUE here, and must stay:
    // if it disappeared the branch would be indistinguishable from no branch.
    const e = emailFor('below_reserve_offer', base, 'en');
    expect(e.intro.toLowerCase()).toMatch(/did not reach/);
    expect(e.intro.toLowerCase()).not.toMatch(/winner/);
  });

  it('asks the seller and the runner-up different things', () => {
    const seller = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus: 'pending_seller' }, 'en');
    const buyer = emailFor('below_reserve_offer', { ...base, secondChance: true, offerStatus: 'pending_buyer' }, 'en');
    expect(seller.intro).not.toBe(buyer.intro);
    expect(seller.subject).not.toBe(buyer.subject);
    expect(seller.intro.toLowerCase()).toMatch(/your asking price/); // asked to sell under reserve
    expect(buyer.intro.toLowerCase()).toMatch(/offered to you/);     // offered the lot
  });

  it('leaves other English events alone when the flag rides along', () => {
    const e = emailFor('payment_due', { ...base, secondChance: true, offerStatus: 'pending_buyer' }, 'en');
    expect(e.intro).toBe(emailFor('payment_due', base, 'en').intro);
  });
});

describe('formatJod / formatDeadline carry the language', () => {
  it('writes the currency as JOD in English and د.أ in Arabic', () => {
    expect(formatJod(105, 'en')).toBe('105.00 JOD');
    expect(formatJod(105, 'en')).not.toContain('د.أ');
    expect(formatJod(105, 'ar')).toBe('105.00 د.أ');
    expect(formatJod(105)).toBe('105.00 د.أ'); // unchanged for every old caller
  });

  it('keeps Western digits in English, per the numeral policy', () => {
    expect(formatJod(1.5, 'en')).toBe('1.50 JOD');
    expect(formatJod(1.5, 'en')).not.toMatch(/[٠-٩]/);
  });

  it('returns empty for a junk amount in English too — never "NaN JOD"', () => {
    expect(formatJod(undefined, 'en')).toBe('');
    expect(formatJod('abc', 'en')).toBe('');
    expect(formatJod(0, 'en')).toBe('');
  });

  it('keeps the deadline in Amman time in English — the deadline is not the reader´s clock', () => {
    // 09:00 UTC is 12:00 in Amman. Any other timezone (including the machine
    // running these tests) gives a different hour and fails.
    const out = formatDeadline(Date.UTC(2026, 6, 30, 9, 0, 0), 'en');
    expect(out).toContain('2026');
    expect(out).toMatch(/12:00/);
    expect(out).toMatch(/Jul/);
  });

  it('orders the date the way each reader expects — month-first in English', () => {
    const ms = Date.UTC(2026, 6, 30, 9, 0, 0);
    expect(formatDeadline(ms, 'en')).toMatch(/^Jul 30, 2026/); // en-US
    expect(formatDeadline(ms, 'ar')).toMatch(/^30 Jul 2026/);  // en-GB, reads with RTL prose
    expect(formatDeadline(ms)).toMatch(/^30 Jul 2026/);
  });

  it('keeps 24-hour time in English so a payment deadline cannot be read 12 hours out', () => {
    // 21:00 UTC on the 29th is 00:00 on the 30th in Amman.
    expect(formatDeadline(Date.UTC(2026, 6, 29, 21, 0, 0), 'en')).toMatch(/00:00/);
    // 13:00 UTC is 16:00 Amman — "4:00" with no meridiem would be ambiguous.
    expect(formatDeadline(Date.UTC(2026, 6, 30, 13, 0, 0), 'en')).toMatch(/16:00/);
  });

  it('returns empty for an unusable timestamp in English too', () => {
    expect(formatDeadline(null, 'en')).toBe('');
    expect(formatDeadline('nonsense', 'en')).toBe('');
  });
});

describe('detailRows — labelled in the reader´s language', () => {
  const data = {
    auctionTitle: 'Rolex Submariner',
    orderRef: 'MZ-7K3QP',
    totalDue: 105,
    paymentDeadlineAt: Date.UTC(2026, 6, 30, 9, 0, 0),
  };

  it('labels every row in English without an Arabic word left in', () => {
    const rows = detailRows(data, 'en');
    expect(rows.length).toBe(4);
    for (const r of rows) {
      expect(ARABIC.test(r.label), r.label).toBe(false);
      expect(ARABIC.test(String(r.value)), r.label).toBe(false);
    }
    expect(rows.map(r => r.label)).toEqual(['Auction', 'Order number', 'Amount due', 'Payment deadline']);
  });

  it('states the amount and the deadline in the English email', () => {
    const values = emailFor('payment_due', data, 'en').details.map(r => r.value).join(' | ');
    expect(values).toContain('105.00 JOD');
    expect(values).toMatch(/12:00/);
    expect(values).toContain('MZ-7K3QP');
  });

  it('leaves the Arabic rows exactly as they were', () => {
    expect(detailRows(data).map(r => r.label)).toEqual(['المزاد', 'رقم الطلب', 'المبلغ المستحق', 'آخر موعد للدفع']);
    expect(detailRows(data, 'ar')).toEqual(detailRows(data));
  });

  it('omits a missing row in English rather than rendering it blank', () => {
    // Present-and-blank claims information the email does not have.
    const rows = detailRows({ auctionTitle: 'Rolex' }, 'en');
    expect(rows.map(r => r.label)).toEqual(['Auction']);
  });
});

describe('brandFor — the identity stays, the labels translate', () => {
  it('states the registered entity and licence number unchanged in English', () => {
    const b = brandFor('en');
    expect(b.legal).toBe('Al Hani Commercial Brokerage LLC');
    expect(b.registration).toBe('200213982');
    expect(b.supportPhone).toBe('+962781444899');
    expect(b.paymentsPhone).toBe('+962785446498');
  });

  it('translates only the words around it', () => {
    const b = brandFor('en');
    for (const [k, v] of Object.entries(b.labels)) {
      expect(ARABIC.test(v), k).toBe(false);
    }
    expect(ARABIC.test(b.address)).toBe(false);
    expect(ARABIC.test(b.hours)).toBe(false);
    expect(ARABIC.test(b.name)).toBe(false);
  });

  it('keeps the Arabic footer Arabic', () => {
    const b = brandFor('ar');
    expect(b.name).toBe('مزاد جو');
    expect(b.legal).toBe('شركة الهاني للوساطة التجارية ذ.م.م');
    expect(b.address).toContain('شارع المدينة المنورة');
    expect(b.labels.registration).toMatch(ARABIC);
    expect(brandFor(undefined)).toEqual(b);
  });

  it('is what the email carries, in the email´s language', () => {
    expect(emailFor('payment_due', {}, 'en').brand.labels.registration).toBe('Commercial registration');
    expect(emailFor('payment_due', {}).brand.labels.registration).toBe('السجل التجاري');
    // Every original BRAND key survives — a template reading brand.nameAr or
    // brand.legalName must not start reading undefined.
    for (const k of Object.keys(BRAND)) {
      expect(emailFor('payment_due', {}, 'en').brand[k], k).toBe(BRAND[k]);
    }
  });
});
