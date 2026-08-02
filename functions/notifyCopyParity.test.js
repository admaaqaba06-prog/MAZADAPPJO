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
