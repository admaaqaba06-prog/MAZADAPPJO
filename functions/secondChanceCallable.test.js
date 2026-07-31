// respondToSecondChance — the properties no behavioural test can reach.
//
// The behaviour lives in secondChanceRespond.test.js (injected db). What is
// left here is PLACEMENT, which a behavioural test passes happily while the
// defect ships:
//
//   1. `pendingNotify = null` must be the FIRST statement of the transaction
//      callback. Firestore retries a contended callback; without the reset, a
//      retry that takes a different branch still carries the previous attempt's
//      message and the wrong person gets told.
//   2. notify() must fire AFTER the transaction commits — so the core module
//      must not send messages at all.
//   3. The status literal written on acceptance must be 'confirmed', the one
//      string settlement.belowReserveBlocksRelist treats as a permanent relist
//      block. A near-synonym errors nowhere and silently relists a sold lot.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { OFFER_STATUSES } = require('./secondChance');

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(join(HERE, 'index.js'), 'utf8');
const CORE = readFileSync(join(HERE, 'secondChanceRespond.js'), 'utf8');

/** The body of `exports.respondToSecondChance` in index.js, up to the next export. */
function callableSource() {
  const start = INDEX.indexOf('exports.respondToSecondChance');
  expect(start, 'respondToSecondChance is not exported from index.js').toBeGreaterThan(-1);
  const rest = INDEX.slice(start + 1);
  const next = rest.indexOf('\nexports.');
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * The transaction callback body in the core module. Plain brace matching is
 * safe here: the only braces inside its strings are balanced `${}`
 * interpolations, and its Arabic literals contain none.
 */
function coreTransactionBody() {
  const at = CORE.indexOf('runTransaction(');
  expect(at, 'no transaction in secondChanceRespond.js').toBeGreaterThan(-1);
  const open = CORE.indexOf('{', at);
  let depth = 0;
  for (let k = open; k < CORE.length; k++) {
    if (CORE[k] === '{') depth++;
    else if (CORE[k] === '}' && --depth === 0) return CORE.slice(open + 1, k);
  }
  throw new Error('unterminated transaction callback');
}

describe('respondToSecondChance — notify placement', () => {
  it('resets the captured notify as the FIRST statement of the transaction', () => {
    // Anchored to the START of the callback on purpose. A loose
    // /pendingNotify = null;/ over the whole file also matches the `let`
    // DECLARATION outside the callback, so deleting this reset — the exact
    // regression this guards — would leave the suite green.
    const body = coreTransactionBody();
    const firstStatement = body
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))[0];
    expect(firstStatement).toMatch(/^pendingNotify = null;/);
  });

  it('never sends a message from inside the transaction module', () => {
    // The core describes the notify and returns it; the wrapper sends it after
    // the commit. So the core must not so much as know how to send one.
    expect(CORE).not.toMatch(/\bawait notify\(/);
    expect(CORE).not.toMatch(/require\('\.\/notify'\)/);
    expect(CORE).not.toMatch(/postToN8n|admin\.messaging/);
  });

  it('sends from the wrapper only after the core has resolved', () => {
    const body = callableSource();
    const coreCallAt = body.indexOf('respondToSecondChanceTxn(');
    const notifyAt = body.indexOf('await notify(');
    expect(coreCallAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(coreCallAt);
    // And the wrapper must stay a wrapper — no transaction re-inlined into it.
    expect(body).not.toContain('runTransaction(');
  });

  it('flags the notification as a second chance so the copy can be truthful', () => {
    // below_reserve_offer / below_reserve_declined copy is written for a
    // genuine below-reserve offer; without this flag it misstates why the
    // recipient is hearing from us.
    expect(CORE).toMatch(/secondChance: true/);
  });
});

describe('respondToSecondChance — status vocabulary and money', () => {
  const body = coreTransactionBody();

  it('writes only statuses the relist guard understands', () => {
    const written = [...body.matchAll(/'secondChanceOffer\.status':\s*'([a-z_]+)'/g)].map(m => m[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const s of written) {
      expect(Object.keys(OFFER_STATUSES), `unknown status '${s}'`).toContain(s);
    }
  });

  it('confirms a buyer acceptance with the literal that blocks relist forever', () => {
    const written = [...body.matchAll(/'secondChanceOffer\.status':\s*'([a-z_]+)'/g)].map(m => m[1]);
    expect(written).toContain('confirmed');
    expect(OFFER_STATUSES.confirmed).toBe('sold');
    // Near-synonyms are the failure mode: they read fine and silently unblock.
    expect(body).not.toMatch(/'secondChanceOffer\.status':\s*'(accepted|sold|open|complete[d]?)'/);
  });

  it('mints the second-chance order under its own id, never the auction id', () => {
    // orders/{auctionId} already belongs to the DEFAULTED order.
    expect(body).toContain('secondChanceOrderId(auctionId)');
    expect(CORE).not.toMatch(/collection\('orders'\)\.doc\(auctionId\)/);
  });

  it('prices the order from the runner-up bid, not the dead order', () => {
    expect(body).toContain('secondChanceOrderMoney(');
  });
});
