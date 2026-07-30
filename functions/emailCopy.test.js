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
  emailFor, formatJod, formatDeadline, orderDeepLink, cleanTitle, BRAND,
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
