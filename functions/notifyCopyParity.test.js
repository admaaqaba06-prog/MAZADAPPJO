import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const { copyFor: appCopyFor } = require('./notify.js');
const { emailFor } = require('./emailCopy.js');

// Drift guard: the n8n relay (n8n/build-messages.js) hand-mirrors this repo's
// functions/notify.js -> copyFor(). Two copies of the same Arabic strings means
// an edit to one and not the other silently ships mismatched WhatsApp/email vs
// in-app copy. This test fails the moment they diverge, so CI catches it instead
// of production. If you INTENTIONALLY change copy, change BOTH files — this test
// then passes again.

// --- Load the n8n copyFor by extracting it from the Code-node source. The file
// also runs n8n-only code ($input.all()) at module scope, so we can't require()
// it; we slice out just the copyFor function and build a callable from it. This
// also asserts the function stays syntactically extractable.
const N8N_PATH = path.join(__dirname, '..', 'n8n', 'build-messages.js');
const n8nSrc = fs.readFileSync(N8N_PATH, 'utf8');

function sliceCopyFor(src) {
  const start = src.indexOf('function copyFor');
  if (start === -1) throw new Error('copyFor not found');
  const end = src.indexOf('\n}', start); // first column-0 closing brace = fn end
  if (end === -1) throw new Error('copyFor end not found');
  return src.slice(start, end + 2);
}

const n8nCopyForSrc = sliceCopyFor(n8nSrc);
// eslint-disable-next-line no-new-func
const n8nCopyFor = new Function(`${n8nCopyForSrc}\nreturn copyFor;`)();

/**
 * Slice the `const M = { … }` object literal, ending at its OWN closing brace.
 *
 * This used to slice to end-of-file, which fails open: any later 4-space
 * `key:` in the file — a second map, an options object — silently joined the
 * event key set, so the two sides could agree on a key neither map contains.
 * Brace-matching ends the slice where the map ends.
 *
 * Braces inside `${…}` template holes balance themselves, so naive counting is
 * correct for these two files. A stray unbalanced brace inside a string literal
 * would end the slice early — which shows up as a WRONG key set and a red test,
 * not as a silent pass. Failing loud is the point.
 */
function sliceEventMap(src) {
  const anchor = src.indexOf('const M = {');
  if (anchor === -1) throw new Error('`const M = {` not found — the event map moved or was renamed');
  const open = src.indexOf('{', anchor);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('`const M = {` never closes — unbalanced braces');
}

// Extract the top-level event keys (4-space indent) from the event map.
function eventKeys(copyForSrc) {
  const body = sliceEventMap(copyForSrc);
  const keys = [];
  const re = /^ {4}([a-z_]+):/gm;
  let m;
  while ((m = re.exec(body)) !== null) keys.push(m[1]);
  return keys.sort();
}

/**
 * Run the WHOLE n8n node, not a slice of its source.
 *
 * Its only n8n dependencies are `$input.all()` at module scope and a top-level
 * `return out`, both legal inside a Function body — so injecting `$input` runs
 * the real emitting loop. This matters: source-text matching cannot tell a node
 * that READS `email_content` from one that merely names it in a comment, and it
 * was exactly that gap that let `emailFor()` ship dead on 2026-07-29 and stay
 * dead. Every forwarding assertion below is behavioural for that reason.
 */
function runNode(body) {
  // eslint-disable-next-line no-new-func
  const out = new Function('$input', n8nSrc)({ all: () => [{ json: { body } }] });
  return out[0].json;
}

/** A payload shaped like the one `notify()` posts, with both channels live. */
function payload(extra = {}) {
  return {
    event: 'auction_won',
    phone: '0791234567',
    email: 'winner@example.com',
    name: 'علي',
    channels: { inapp: true, whatsapp: true, email: true },
    auctionTitle: 'ساعة رولكس',
    orderId: 'ORD-1',
    orderRef: 'MZ-000123',
    totalDue: 105,
    paymentDeadlineAt: 1785000000000,
    ...extra,
  };
}

const CANONICAL_EVENTS = [
  'auction_won', 'payment_due', 'payment_reminder', 'below_reserve_offer',
  'below_reserve_seller_accepted', 'below_reserve_declined', 'outbid',
  'order_preparing', 'order_shipped', 'order_delivered', 'order_completed',
  'order_refunded', 'membership_rejected', 'order_payment_rejected',
  'account_banned', 'ban_lifted', 'seller_ship_nudge', 'buyer_confirm_nudge',
  'return_requested', 'return_resolved',
].sort();

// Data variants exercise every branch (account_banned reason, return_resolved
// outcome, *_rejected reason fallback, payment_due paymentHours default, HTML/
// quote-bearing titles). Every event is run against every variant, so whichever
// event uses a given field is covered regardless of which one it is.
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
  // Second-chance variants: below_reserve_offer is shared between a genuine
  // below-reserve offer and a second chance, and the branch must be mirrored in
  // both copies or WhatsApp says something different from the in-app bell.
  { auctionTitle: 'ساعة رولكس', topBid: 90, secondChance: true, offerStatus: 'pending_seller' },
  { auctionTitle: 'ساعة رولكس', topBid: 90, secondChance: true, offerStatus: 'pending_buyer' },
  { auctionTitle: 'ساعة رولكس', secondChance: true },
  { auctionTitle: 'ساعة رولكس', secondChance: false, offerStatus: 'pending_buyer' },
  { auctionTitle: 'ساعة رولكس', secondChance: true, declinedBy: 'buyer' },
  { auctionTitle: 'ساعة رولكس', secondChance: true, declinedBy: 'seller' },
];

describe('n8n build-messages.js mirrors functions/notify.js copyFor (drift guard)', () => {
  it('both cover exactly the same 20 events', () => {
    // The app-side Arabic map moved out of notify.js and into messageCopy.js
    // (one bilingual source; notify.js now re-exports copyFor). The n8n node
    // still hand-mirrors it, so this comparison still guards drift — it just
    // reads the map where the map now lives. The behavioural assertions below
    // are unchanged and are what actually proves the Arabic did not move.
    const appSrc = fs.readFileSync(path.join(__dirname, 'messageCopy.js'), 'utf8');
    const appKeys = eventKeys(appSrc);
    const n8nKeys = eventKeys(n8nCopyForSrc);
    expect(appKeys).toEqual(CANONICAL_EVENTS);
    expect(n8nKeys).toEqual(CANONICAL_EVENTS);
    expect(n8nKeys).toEqual(appKeys);
  });

  it('produces byte-identical {type,title,description} for every event × data variant', () => {
    const mismatches = [];
    for (const event of CANONICAL_EVENTS) {
      for (const data of DATA_VARIANTS) {
        const a = appCopyFor(event, data);
        const b = n8nCopyFor(event, data);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          mismatches.push({ event, data, app: a, n8n: b });
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('agrees on the unknown-event fallback', () => {
    const a = appCopyFor('does_not_exist', { auctionTitle: 'x' });
    const b = n8nCopyFor('does_not_exist', { auctionTitle: 'x' });
    expect(b).toEqual(a);
    expect(a).toEqual({ type: 'info', title: 'تنبيه', description: '' });
  });
});

// ---------------------------------------------------------------------------
// Forwarding.
//
// The drift guard above compares the two copyFor implementations. Both were
// correct on 2026-07-29 and the branded bilingual email STILL shipped dead for
// four days, because nothing asserted that the node reads what the server sent.
// So every assertion below runs the real node through runNode() and looks at
// what it EMITS. Source-text matching is not used: `/email_content/` passes on a
// comment, which is exactly the hole that let this ship.
// ---------------------------------------------------------------------------

/** Values chosen so their presence in the output can only have come from the payload. */
const SENTINEL = {
  subject: 'ZZ-SUBJECT-ZZ',
  preheader: 'ZZ-PREHEADER-ZZ',
  heading: 'ZZ-HEADING-ZZ',
  intro: 'ZZ-INTRO-ZZ',
  rowLabel: 'ZZ-ROW-LABEL-ZZ',
  rowValue: 'ZZ-ROW-VALUE-ZZ',
  ctaLabel: 'ZZ-CTA-LABEL-ZZ',
  ctaUrl: 'https://example.test/zz-cta-url',
  wa: 'ZZ-WHATSAPP-BODY-ZZ',
};

/**
 * A REAL `emailFor()` render — brand, labels and lang exactly as the server
 * builds them — with the copy fields swapped for sentinels. Real brand so the
 * footer assertions test the shipped values; sentinel copy so a passing
 * assertion cannot be satisfied by the node's own Arabic.
 */
function serverContent(lang = 'ar', over = {}) {
  const real = emailFor('payment_due', {
    auctionTitle: 'ساعة رولكس', orderRef: 'MZ-000123',
    totalDue: 105, paymentDeadlineAt: 1785000000000, orderId: 'ORD-1',
  }, lang);
  return {
    ...real,
    subject: SENTINEL.subject,
    preheader: SENTINEL.preheader,
    heading: SENTINEL.heading,
    intro: SENTINEL.intro,
    details: [{ label: SENTINEL.rowLabel, value: SENTINEL.rowValue }],
    cta: { label: SENTINEL.ctaLabel, url: SENTINEL.ctaUrl },
    ...over,
  };
}

// The node's OWN Arabic for payload()'s event, i.e. what it emits when it
// ignores the payload. Every "not its own" assertion is against this.
const LOCAL = n8nCopyFor('auction_won', payload());

describe('the node forwards the email the server rendered', () => {
  it('emits the server subject, not its own title', () => {
    const out = runNode(payload({ email_content: serverContent('ar') }));
    expect(out.subject).toBe(SENTINEL.subject);
    expect(out.subject).not.toBe(LOCAL.title);
  });

  it('renders heading, intro and preheader from the server content', () => {
    const { html } = runNode(payload({ email_content: serverContent('ar') }));
    expect(html).toContain(SENTINEL.heading);
    expect(html).toContain(SENTINEL.intro);
    expect(html).toContain(SENTINEL.preheader);
    // The node's own copy must be nowhere in the message it forwarded.
    expect(html).not.toContain(LOCAL.title);
    expect(html).not.toContain(LOCAL.description);
  });

  it('renders the detail rows the server sent', () => {
    const ec = serverContent('ar', {
      details: [
        { label: 'ZZ-L1-ZZ', value: 'ZZ-V1-ZZ' },
        { label: 'ZZ-L2-ZZ', value: 'ZZ-V2-ZZ' },
      ],
    });
    const { html } = runNode(payload({ email_content: ec }));
    for (const s of ['ZZ-L1-ZZ', 'ZZ-V1-ZZ', 'ZZ-L2-ZZ', 'ZZ-V2-ZZ']) expect(html).toContain(s);
  });

  it('renders the CTA label AND its url', () => {
    const { html } = runNode(payload({ email_content: serverContent('ar') }));
    expect(html).toContain(SENTINEL.ctaLabel);
    expect(html).toContain(`href="${SENTINEL.ctaUrl}"`);
    // The hardcoded button the legacy template ships must not survive alongside it.
    expect(html).not.toContain('افتح التطبيق');
  });

  it('renders the brand footer — legal name, registration, address, hours — each with its label', () => {
    const ec = serverContent('ar');
    const { html } = runNode(payload({ email_content: ec }));
    const b = ec.brand;
    for (const v of [b.legal, b.registration, b.address, b.hours,
      b.labels.registration, b.labels.address, b.labels.hours]) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
      expect(html).toContain(v);
    }
  });

  it('renders the support numbers the account_banned copy points at ("the numbers below")', () => {
    const ec = serverContent('ar');
    const { html } = runNode(payload({ email_content: ec }));
    expect(html).toContain(ec.brand.supportPhone);
    expect(html).toContain(ec.brand.paymentsPhone);
  });

  it('renders the ENGLISH brand values for an English email', () => {
    const ec = serverContent('en');
    const { html } = runNode(payload({ email_content: ec }));
    expect(html).toContain('Al Hani Commercial Brokerage LLC');
    expect(html).toContain('Commercial registration');
    expect(html).toContain('Working hours');
    expect(html).not.toContain('السجل التجاري');
  });
});

describe('the node forwards the WhatsApp text the server rendered', () => {
  it('emits wa_text verbatim, not its own render', () => {
    const out = runNode(payload({ wa_text: SENTINEL.wa }));
    expect(out.waText).toBe(SENTINEL.wa);
    expect(out.waText).not.toContain(LOCAL.title);
  });

  it('treats an empty wa_text as absent rather than sending a blank message', () => {
    const out = runNode(payload({ wa_text: '   ' }));
    expect(out.waText.trim().length).toBeGreaterThan(0);
    expect(out.waText).toContain(LOCAL.title);
  });
});

describe('direction and language follow the server content, not the template', () => {
  it('an Arabic email is rtl/ar and right-aligned', () => {
    const { html } = runNode(payload({ email_content: serverContent('ar') }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('text-align:right');
    expect(html).not.toContain('text-align:left');
  });

  // n8n/build-messages.js hardcoded `<html dir="rtl" lang="ar">`, so an English
  // email would have rendered right-to-left and been announced as Arabic by a
  // screen reader. The direction is a property of the content, not of the node.
  it('an English email is ltr/en and left-aligned', () => {
    const { html } = runNode(payload({ email_content: serverContent('en') }));
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('text-align:left');
    expect(html).not.toContain('dir="rtl"');
    expect(html).not.toContain('lang="ar"');
    expect(html).not.toContain('text-align:right');
  });
});

describe('the local render survives as the fallback', () => {
  // Not optional, and not decoration: with the copy moved server-side, a bad or
  // missing render would otherwise mean a blank subject and a blank body landing
  // in a customer's inbox. This is the mitigation the spec names.
  it('renders its own subject, html and waText when the server sent neither field', () => {
    const out = runNode(payload());
    expect(out.subject).toBe(LOCAL.title);
    expect(out.html).toContain(LOCAL.title);
    // HTML-escaped in the body (the description quotes the lot title), verbatim
    // in the WhatsApp text.
    expect(out.html).toContain(LOCAL.description.replace(/"/g, '&quot;'));
    expect(out.waText).toBe(`${LOCAL.title}\n${LOCAL.description}`);
  });

  it('still keeps a copyFor of its own to fall back to', () => {
    // Behavioural: an unknown event proves the map is consulted, not just present.
    const out = runNode(payload({ event: 'does_not_exist' }));
    expect(out.subject).toBe('تنبيه');
    expect(out.html).toContain('تنبيه');
  });

  // A malformed render is the realistic failure — a deploy half-lands, a field
  // is renamed, the payload is truncated. None of these may throw (a throw in
  // the Code node kills BOTH channels) and none may send an empty email.
  const MALFORMED = [
    ['null', null],
    ['an empty object', {}],
    ['a string', 'oops'],
    ['an array', []],
    ['a subject with no heading', { subject: 'x', details: [], cta: null, brand: {} }],
    ['a heading with no subject', { heading: 'x', details: [], cta: null, brand: {} }],
    ['an empty subject', { subject: '  ', heading: 'x', brand: {} }],
  ];
  for (const [label, ec] of MALFORMED) {
    it(`does not throw and does not send a blank when email_content is ${label}`, () => {
      let out;
      expect(() => { out = runNode(payload({ email_content: ec })); }).not.toThrow();
      expect(out.subject).toBe(LOCAL.title);
      expect(out.html).toContain(LOCAL.title);
      expect(out.html.length).toBeGreaterThan(200);
    });
  }

  it('omits the rows table entirely when details is empty, missing or all-blank', () => {
    const blank = [{ label: 'ZZ-BLANK-LABEL-ZZ', value: '   ' }, { label: 'ZZ-NULL-LABEL-ZZ', value: null }];
    for (const details of [[], undefined, null, 'nonsense', blank]) {
      const { html } = runNode(payload({ email_content: serverContent('ar', { details }) }));
      expect(html).toContain(SENTINEL.heading);   // it still rendered the email
      // A row rendered present-but-blank claims information the email does not
      // have, which is worse than the row being absent.
      expect(html).not.toContain('<tr><td style="padding:10px 14px');
      expect(html).not.toContain('ZZ-BLANK-LABEL-ZZ');
      expect(html).not.toContain('ZZ-NULL-LABEL-ZZ');
    }
  });

  it('omits the button entirely when cta is null or incomplete', () => {
    for (const cta of [null, undefined, {}, { label: 'x' }, { url: 'https://x.test' }]) {
      const { html } = runNode(payload({ email_content: serverContent('ar', { cta }) }));
      expect(html).toContain(SENTINEL.heading);
      expect(html).not.toContain('<a href=');
    }
  });
});

describe('everything interpolated from the payload is escaped', () => {
  // Auction titles are user-supplied and reach the heading, the subject, the
  // rows and the CTA. Unescaped, one lot title is an HTML injection into every
  // recipient's inbox.
  const XSS = '<script>alert("x")</script>';
  it('escapes heading, intro, rows, cta and brand', () => {
    const ec = serverContent('ar', {
      heading: XSS,
      intro: XSS,
      preheader: XSS,
      details: [{ label: XSS, value: XSS }],
      cta: { label: XSS, url: `https://x.test/"${XSS}` },
      brand: { ...serverContent('ar').brand, legal: XSS, address: XSS, hours: XSS },
    });
    const { html } = runNode(payload({ email_content: ec, name: XSS }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert("x")');
    expect(html).toContain('&lt;script&gt;');
    // The quote must not be able to close the href and start a new attribute.
    expect(html).not.toMatch(/href="https:\/\/x\.test\/"/);
  });
});
