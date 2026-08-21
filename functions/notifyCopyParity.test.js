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

  // Present is not enough. The preheader is INBOX PREVIEW text: it exists to be
  // scraped by the client and never shown. Un-hidden, it opens every email with
  // a duplicate of the sentence the reader already saw in their inbox list — and
  // the previous version of this test, which only asserted presence, was green
  // for exactly that markup.
  it('keeps the preheader hidden, and renders it exactly once', () => {
    const { html } = runNode(payload({ email_content: serverContent('ar') }));
    const m = html.match(/<div style="([^"]*)">ZZ-PREHEADER-ZZ<\/div>/);
    expect(m, 'the preheader must sit in its own styled <div>').not.toBeNull();
    expect(m[1]).toContain('display:none');
    expect(m[1]).toContain('max-height:0');
    expect(m[1]).toContain('overflow:hidden');
    expect(html.split(SENTINEL.preheader).length - 1).toBe(1);
  });

  // The greeting is the ONE string this template still owns, so nothing else
  // would notice it disappearing.
  it('renders the greeting in the language of the content', () => {
    const ar = runNode(payload({ email_content: serverContent('ar'), name: 'ZZ-NAME-ZZ' }));
    expect(ar.html).toContain('مرحباً ZZ-NAME-ZZ،');
    const en = runNode(payload({ email_content: serverContent('en'), name: 'ZZ-NAME-ZZ' }));
    expect(en.html).toContain('Hi ZZ-NAME-ZZ,');
    // With no recipient name the email still opens on a greeting, not a blank line.
    for (const [lang, greet] of [['ar', 'مرحباً،'], ['en', 'Hi,']]) {
      const out = runNode(payload({ email_content: serverContent(lang), name: '' }));
      expect(out.html).toContain(greet);
    }
  });

  it('renders brand.name as the header — and no header at all when it is absent', () => {
    const base = serverContent('ar').brand;
    const named = runNode(payload({
      email_content: serverContent('ar', { brand: { ...base, name: 'ZZ-BRAND-NAME-ZZ' } }),
    }));
    expect(named.html).toContain('ZZ-BRAND-NAME-ZZ');

    // No invented default: the greeting is the only wording this template owns,
    // and a hardcoded brand name would be the second — and the wrong one on the
    // day the brand is renamed.
    for (const name of ['', '   ', null, undefined]) {
      const { html } = runNode(payload({ email_content: serverContent('ar', { brand: { ...base, name } }) }));
      expect(html).toContain(SENTINEL.heading);   // it still rendered the email
      expect(html).not.toContain('مزاد جو');
      expect(html).not.toContain('MAZAD JO');
    }
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

  // `wa_text` goes STRAIGHT into the WhatsApp send body, so it has to be
  // type-guarded exactly as `email_content` is. Accepting it on truthiness alone
  // delivers "[object Object]" to a customer.
  const NON_STRING_WA = [
    ['an object', { a: 1 }],
    ['an array', ['x', 'y']],
    ['a number', 42],
    ['a boolean', true],
  ];
  for (const [label, wa] of NON_STRING_WA) {
    it(`falls back to the local render when wa_text is ${label}`, () => {
      const out = runNode(payload({ wa_text: wa }));
      expect(typeof out.waText).toBe('string');
      expect(out.waText).not.toContain('[object Object]');
      expect(out.waText).toBe(`${LOCAL.title}\n${LOCAL.description}`);
    });
  }
});

/** The style attribute of every `<td>` that carries one. */
function styledCells(html) {
  return Array.from(html.matchAll(/<td style="([^"]*)"/g)).map((m) => m[1]);
}

/**
 * Alignment has to be on EVERY cell, not merely somewhere in the document.
 *
 * Gmail and Outlook.com strip `<html>`/`<head>`/`<body>`, so the per-cell inline
 * `text-align` is the only alignment that survives there: a cell that loses it
 * falls back to the client's default and the email renders half-aligned. The
 * previous version of this assertion only required `text-align:right` to appear
 * *somewhere*, so deleting it from the footer — or from any single cell — left
 * the suite green.
 */
function expectAlignedThroughout(html, align) {
  const other = align === 'left' ? 'right' : 'left';
  const cells = styledCells(html);
  // header, body, row label, row value, footer — for serverContent()'s one row.
  expect(cells.length).toBe(5);
  expect(cells.filter((s) => !s.includes(`text-align:${align};`))).toEqual([]);
  expect(cells.filter((s) => s.includes(`text-align:${other};`))).toEqual([]);
}

/**
 * What Gmail and Outlook.com actually hand to their renderer: the document-level
 * tags removed. Anything set only on `<html>` is gone by this point.
 */
function stripDocumentTags(html) {
  return html
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<\/?(?:html|body)[^>]*>/gi, '');
}

describe('direction and language follow the server content, not the template', () => {
  it('an Arabic email is rtl/ar and right-aligned', () => {
    const { html } = runNode(payload({ email_content: serverContent('ar') }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).not.toContain('dir="ltr"');
    expect(html).not.toContain('lang="en"');
    expectAlignedThroughout(html, 'right');
  });

  // n8n/build-messages.js hardcoded `<html dir="rtl" lang="ar">`, so an English
  // email would have rendered right-to-left and been announced as Arabic by a
  // screen reader. The direction is a property of the content, not of the node.
  it('an English email is ltr/en and left-aligned', () => {
    const { html } = runNode(payload({ email_content: serverContent('en') }));
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).not.toContain('dir="rtl"');
    expect(html).not.toContain('lang="ar"');
    expectAlignedThroughout(html, 'left');
  });

  // Gmail and Outlook.com are the two biggest clients and both strip <html>,
  // <head> and <body>. dir/lang set only on <html> therefore reach nobody there.
  it('dir and lang survive a client that strips <html>, <head> and <body>', () => {
    for (const [lang, dir] of [['ar', 'rtl'], ['en', 'ltr']]) {
      const { html } = runNode(payload({ email_content: serverContent(lang) }));
      const rendered = stripDocumentTags(html);
      expect(rendered).not.toContain('<html');
      expect(rendered).not.toContain('<body');
      expect(rendered).not.toContain('<head');
      expect(rendered, `dir lost when <html> is stripped (${lang})`).toContain(`dir="${dir}"`);
      expect(rendered, `lang lost when <html> is stripped (${lang})`).toContain(`lang="${lang}"`);
      expectAlignedThroughout(rendered, lang === 'en' ? 'left' : 'right');
    }
  });
});

// ---------------------------------------------------------------------------
// NO PREFERENCE MEANS ARABIC.
//
// The audience is Jordanian; English is opt-in. So the Arabic shell has to be
// what an unresolved, missing or junk `lang` produces. Written as `ec.lang !==
// 'ar'` the template does the opposite — every payload whose language the server
// failed to resolve gets an English LTR email — and no test noticed, because
// nothing here ever sent a payload without a valid `lang`.
// ---------------------------------------------------------------------------
describe('a missing or unrecognised lang falls back to ARABIC, never English', () => {
  const MISSING = Symbol('absent');
  const NO_PREFERENCE = [
    ['the key is absent', MISSING],
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '  '],
    ['an unrecognised code', 'fr'],
    ['a locale rather than a code', 'en-US'],
    ['mis-cased', 'EN'],
    ['a number', 7],
    ['an object', {}],
  ];

  for (const [label, lang] of NO_PREFERENCE) {
    it(`renders the Arabic RTL shell when ${label}`, () => {
      const ec = serverContent('ar');
      if (lang === MISSING) delete ec.lang; else ec.lang = lang;
      const { html } = runNode(payload({ email_content: ec }));

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('lang="ar"');
      expect(html).not.toContain('dir="ltr"');
      expect(html).not.toContain('lang="en"');
      expectAlignedThroughout(html, 'right');
      // The greeting is the one string the template picks by language, so it is
      // the tell that the Arabic branch — not just the Arabic payload — ran.
      expect(html).toContain('مرحباً');
      expect(html).not.toContain('Hi ');
    });
  }

  it("and 'en' — spelled exactly — is still honoured", () => {
    const ec = serverContent('ar');
    ec.lang = 'en';
    const { html } = runNode(payload({ email_content: ec }));
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
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

// ---------------------------------------------------------------------------
// THE PASTE-ORDER GUARD.
//
// This node and functions/emailCopy.js ship separately: the node is pasted into
// n8n by hand, the module goes out with a Firebase deploy. Paste-then-deploy is
// therefore a real window, and in it the still-deployed OLD emailFor sends an
// `email_content` whose `brand` is the raw frozen BRAND — no `labels`, no
// `name`, no `legal`, no `address`, no `hours`. Subject and heading are both
// present, so a subject/heading-only gate ACCEPTS it, and the branded template
// then renders an email with no header row, no company name and a footer of
// three bare unlabelled numbers. That was measured on the real artefacts, and
// the runbook used to claim the order was "safe either way".
//
// It is safe now because the node rejects that shape and falls back to its own
// Arabic email — complete, correct, and exactly what customers get today.
// ---------------------------------------------------------------------------
describe('a PRE-BILINGUAL email_content is rejected rather than half-rendered', () => {
  const { BRAND } = require('./emailCopy.js');

  /** Exactly what `emailFor` returned before brandFor(): raw BRAND, no `lang`. */
  function preBilingualContent() {
    const ec = serverContent('ar');
    delete ec.lang;
    ec.brand = BRAND;
    return ec;
  }

  it('the old shape really is the one that has no labels (the premise, pinned)', () => {
    // If BRAND ever grows a `labels` key this whole guard becomes vacuous, and
    // this is where that is caught.
    expect(BRAND.labels).toBeUndefined();
    expect(BRAND.name).toBeUndefined();
    for (const k of ['legal', 'address', 'hours']) expect(BRAND[k]).toBeUndefined();
  });

  it('falls back to the local Arabic email instead of a brandless one', () => {
    const out = runNode(payload({ email_content: preBilingualContent() }));
    // Rejected: the server's copy is nowhere in what shipped.
    expect(out.subject).toBe(LOCAL.title);
    expect(out.html).not.toContain(SENTINEL.subject);
    expect(out.html).not.toContain(SENTINEL.heading);
    // And what shipped is the whole fallback email, not a stump: its own header,
    // its own body, its own footer.
    expect(out.html).toContain('مزاد جو');
    expect(out.html).toContain(LOCAL.title);
    expect(out.html).toContain('هذه رسالة آلية من مزاد جو، لا حاجة للرد عليها.');
  });

  it('never prints the bare unlabelled footer that the old shape produced', () => {
    const { html } = runNode(payload({ email_content: preBilingualContent() }));
    // The exact regression: registration number and both phone numbers rendered
    // as three anonymous lines because there were no labels to pair them with.
    for (const v of [BRAND.registration, BRAND.supportPhone, BRAND.paymentsPhone]) {
      expect(typeof v).toBe('string');
      expect(html).not.toContain(v);
    }
  });

  it('the real emailFor render still satisfies the labels contract', () => {
    // Non-vacuity, and a rename alarm: if emailCopy.js renames a footer label,
    // the guard would silently send EVERY recipient to the local fallback. This
    // fails first and says why.
    for (const lang of ['ar', 'en']) {
      const ec = emailFor('payment_due', { auctionTitle: 'ساعة', totalDue: 105 }, lang);
      for (const k of ['registration', 'address', 'hours', 'support', 'payments']) {
        expect(typeof ec.brand.labels[k], `brand.labels.${k} missing for ${lang}`).toBe('string');
        expect(ec.brand.labels[k].trim().length).toBeGreaterThan(0);
      }
      const out = runNode(payload({ email_content: { ...ec, subject: SENTINEL.subject } }));
      expect(out.subject).toBe(SENTINEL.subject);
    }
  });

  it('one missing footer label is enough to reject the render', () => {
    const base = serverContent('ar').brand;
    for (const k of ['registration', 'address', 'hours', 'support', 'payments']) {
      const labels = { ...base.labels };
      delete labels[k];
      const out = runNode(payload({
        email_content: serverContent('ar', { brand: { ...base, labels } }),
      }));
      expect(out.subject, `a missing '${k}' label must reject the render`).toBe(LOCAL.title);
    }
    // Control: untouched labels are accepted, so the loop above is not passing
    // for some unrelated reason.
    const ok = runNode(payload({ email_content: serverContent('ar') }));
    expect(ok.subject).toBe(SENTINEL.subject);
  });
});

// ---------------------------------------------------------------------------
// The local Arabic render is the FALLBACK. On the happy path the node owns no
// wording at all, so it must not build any — it used to run copyFor on every
// item and emit its `title`/`description` on the output, where nothing reads
// them (`Send: WhatsApp` uses `waText`; `Send: Email` uses `subject`/`html`).
// ---------------------------------------------------------------------------
describe('the local Arabic render is built only when a surface actually needs it', () => {
  /**
   * A payload that COUNTS copyFor calls. `secondChance` is read unconditionally
   * at the top of copyFor and nowhere else in the node, so a getter on it is an
   * exact invocation counter — behavioural, where source-text could not tell an
   * eager call from a lazy one.
   */
  function countingPayload(extra = {}) {
    const body = payload(extra);
    const counter = { calls: 0 };
    Object.defineProperty(body, 'secondChance', {
      get() { counter.calls++; return undefined; },
      enumerable: true,
      configurable: true,
    });
    return { body, counter };
  }

  it('the counter really counts (the probe is not vacuous)', () => {
    const { body, counter } = countingPayload();
    const out = runNode(body);
    // Nothing server-rendered: both surfaces fall back, so copyFor must run…
    expect(counter.calls).toBeGreaterThan(0);
    expect(out.subject).toBe(LOCAL.title);
  });

  it('does not build it at all when the server rendered both surfaces', () => {
    const { body, counter } = countingPayload({
      email_content: serverContent('ar'),
      wa_text: SENTINEL.wa,
    });
    const out = runNode(body);
    expect(out.subject).toBe(SENTINEL.subject);
    expect(out.waText).toBe(SENTINEL.wa);
    expect(counter.calls, 'copyFor ran on the server-rendered happy path').toBe(0);
  });

  it('builds it exactly once when only one surface falls back', () => {
    // WhatsApp missing, email fine.
    const wa = countingPayload({ email_content: serverContent('ar') });
    expect(runNode(wa.body).waText).toBe(`${LOCAL.title}\n${LOCAL.description}`);
    expect(wa.counter.calls, 'the fallback render is not memoised').toBe(1);
    // Email missing, WhatsApp fine.
    const em = countingPayload({ wa_text: SENTINEL.wa });
    expect(runNode(em.body).subject).toBe(LOCAL.title);
    expect(em.counter.calls, 'the fallback render is not memoised').toBe(1);
  });

  it('emits no dead copy fields on the output', () => {
    // `title`/`description` were emitted on every item and consumed by nothing.
    // Re-adding them would force the eager render back.
    const out = runNode(payload({ email_content: serverContent('ar'), wa_text: SENTINEL.wa }));
    expect('title' in out).toBe(false);
    expect('description' in out).toBe(false);
    expect(Object.keys(out).sort()).toEqual([
      // `fromName` is the sender DISPLAY name. It belongs on this list rather
      // than being dead copy: `Send: Email (Resend)` interpolates it into the
      // Resend `from` field, which previously hardcoded `مزاد جو` and so sent
      // English mail from an Arabic-named sender.
      'email', 'event', 'fromName', 'html', 'idempotencyKey', 'name', 'phone',
      'sendEmail', 'sendWhatsapp', 'subject', 'waText',
    ]);
  });

  it('resolves the sender display name from the rendered language', () => {
    const en = runNode(payload({ email_content: serverContent('en'), wa_text: SENTINEL.wa }));
    expect(en.fromName).toBe('MAZAD JO');
    const ar = runNode(payload({ email_content: serverContent('ar'), wa_text: SENTINEL.wa }));
    expect(ar.fromName).toBe('مزاد جو');
  });

  it('names the sender in Arabic when the local Arabic fallback rendered the mail', () => {
    // No usable email_content, so buildHtml (Arabic-only) produced the mail —
    // an English sender name on an Arabic email is the same mismatch inverted.
    const out = runNode(payload({ wa_text: SENTINEL.wa }));
    expect(out.fromName).toBe('مزاد جو');
  });
});

describe('everything interpolated from the payload is escaped', () => {
  // Auction titles are user-supplied and reach the heading, the subject, the
  // rows and the CTA. Unescaped, one lot title is an HTML injection into every
  // recipient's inbox.
  //
  // Every field gets its OWN tagged payload, so this pins esc() PER FIELD. A
  // single shared XSS string only proves that *something* was escaped — dropping
  // esc() from brand.name, from a footer label, or from the registration number
  // survived that version of the test.
  const xss = (tag) => `<script>alert("${tag}")</script>`;
  const escaped = (tag) => `&lt;script&gt;alert(&quot;${tag}&quot;)&lt;/script&gt;`;

  it('escapes every field it interpolates — copy, cta, brand identity and footer labels', () => {
    const base = serverContent('ar').brand;
    const ec = serverContent('ar', {
      heading: xss('HEADING'),
      intro: xss('INTRO'),
      preheader: xss('PREHEADER'),
      details: [{ label: xss('ROWLABEL'), value: xss('ROWVALUE') }],
      cta: { label: xss('CTALABEL'), url: `https://x.test/"${xss('CTAURL')}` },
      brand: {
        ...base,
        name: xss('BRANDNAME'),
        legal: xss('LEGAL'),
        registration: xss('REGISTRATION'),
        address: xss('ADDRESS'),
        hours: xss('HOURS'),
        supportPhone: xss('SUPPORTPHONE'),
        paymentsPhone: xss('PAYMENTSPHONE'),
        labels: {
          registration: xss('LBLREG'),
          address: xss('LBLADDR'),
          hours: xss('LBLHOURS'),
          support: xss('LBLSUPPORT'),
          payments: xss('LBLPAYMENTS'),
        },
      },
    });
    const { html } = runNode(payload({ email_content: ec, name: xss('NAME') }));

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');

    const FIELDS = [
      'HEADING', 'INTRO', 'PREHEADER', 'ROWLABEL', 'ROWVALUE', 'CTALABEL', 'NAME',
      'BRANDNAME', 'LEGAL', 'REGISTRATION', 'ADDRESS', 'HOURS',
      'SUPPORTPHONE', 'PAYMENTSPHONE',
      'LBLREG', 'LBLADDR', 'LBLHOURS', 'LBLSUPPORT', 'LBLPAYMENTS',
    ];
    for (const tag of FIELDS) {
      // Rendered (so the escaping is actually reachable) AND escaped.
      expect(html, `${tag} was not rendered escaped`).toContain(escaped(tag));
      expect(html, `${tag} was rendered raw`).not.toContain(xss(tag));
    }
    // The quote must not be able to close the href and start a new attribute.
    expect(html).not.toMatch(/href="https:\/\/x\.test\/"/);
  });

  // esc() stops a quote closing the attribute; it says nothing about the SCHEME.
  // The server builds this url from SITE today — the allowlist is what keeps a
  // live `javascript:` link out of an inbox if that ever changes.
  it('renders no button at all when cta.url is not http(s)', () => {
    const HOSTILE = [
      'javascript:alert(1)',
      '  javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '\tjavascript:alert(1)',
      'data:text/html,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.test/x',
      'mazad-jo.com/x',
    ];
    for (const url of HOSTILE) {
      const { html } = runNode(payload({
        email_content: serverContent('ar', { cta: { label: SENTINEL.ctaLabel, url } }),
      }));
      expect(html).toContain(SENTINEL.heading);      // the email still rendered
      expect(html, `rendered a link for ${url}`).not.toContain('<a href=');
      expect(html).not.toContain(SENTINEL.ctaLabel); // no dead label either
    }
  });

  it('still renders an http(s) cta.url', () => {
    for (const url of ['https://mazad-jo.com/x', 'http://mazad-jo.com/x', 'HTTPS://mazad-jo.com/x']) {
      const { html } = runNode(payload({
        email_content: serverContent('ar', { cta: { label: SENTINEL.ctaLabel, url } }),
      }));
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(SENTINEL.ctaLabel);
    }
  });
});

// ---------------------------------------------------------------------------
// The checked-in workflow export must not drift from the node source.
//
// `n8n/webhook-receiver-v2.json` is what the README calls the recoverable /
// rollback copy, and it is what gets re-imported into n8n Cloud. When it carried
// the PRE-forwarder node body, importing it silently reverted this entire task
// and no test noticed — a stale copy living outside the repo is the exact
// failure this project exists to end.
// ---------------------------------------------------------------------------
describe('the workflow export embeds the same node source', () => {
  const WF_PATH = path.join(__dirname, '..', 'n8n', 'webhook-receiver-v2.json');
  const workflow = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
  const buildNode = workflow.nodes.find((n) => n.name === 'Build Messages');

  it('has a Build Messages Code node', () => {
    expect(buildNode, 'Build Messages node missing from the export').toBeTruthy();
    expect(buildNode.type).toBe('n8n-nodes-base.code');
    expect(typeof buildNode.parameters.jsCode).toBe('string');
  });

  it('its jsCode is identical to n8n/build-messages.js', () => {
    // If this fails: re-embed the file into the export (they are ONE artefact,
    // committed together). Do not edit the JSON by hand and do not relax this.
    expect(buildNode.parameters.jsCode.trimEnd()).toBe(n8nSrc.trimEnd());
  });

  it('the Resend node sends FROM the resolved name, not a hardcoded one', () => {
    // The exact failure this repo exists to end: `email_content` was rendered
    // on every send for four days while the live node never referenced it. A
    // `fromName` that nothing interpolates is that bug again, one field down —
    // so assert the consumer, not just the producer.
    const send = workflow.nodes.find((n) => n.name === 'Send: Email (Resend)');
    expect(send, 'Send: Email (Resend) missing from the export').toBeTruthy();
    const body = send.parameters.jsonBody;
    expect(body).toContain('$json.fromName');
    // The Arabic literal must be GONE from the transport: while it is still
    // there, an English mail can still ship from an Arabic sender.
    expect(body).not.toContain('مزاد جو');
    // The address itself is not language-dependent and must survive.
    expect(body).toContain('no-reply@mazad-jo.com');
  });

  it('the embedded copy really forwards — not just matches by string', () => {
    // eslint-disable-next-line no-new-func
    const out = new Function('$input', buildNode.parameters.jsCode)({
      all: () => [{ json: { body: payload({ email_content: serverContent('ar'), wa_text: SENTINEL.wa }) } }],
    })[0].json;
    expect(out.subject).toBe(SENTINEL.subject);
    expect(out.waText).toBe(SENTINEL.wa);
    expect(out.html).toContain(SENTINEL.heading);
    expect(out.html).not.toContain(LOCAL.title);
  });
});
