// respondToSecondChance — the two properties no behavioural test can reach.
//
// The callable lives in index.js, which pulls in firebase-admin at module scope
// and cannot be imported by this (node-only, ESM) suite. Both defects below are
// invisible to a unit test of the helpers anyway, because they are about the
// LITERAL written and the PLACEMENT of a side effect:
//
//   1. The status written on a buyer acceptance must be exactly 'confirmed'.
//      settlement.belowReserveBlocksRelist blocks an auto-relist forever on that
//      one string and on nothing else. 'accepted' or 'sold' would not error
//      anywhere — the block would simply evaporate when the offer's window
//      lapsed, the lot would go live again, and two people could buy one item.
//   2. notify() must fire AFTER the transaction commits. Firestore retries a
//      contended transaction callback, so a notify inside it re-sends on every
//      attempt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { OFFER_STATUSES } = require('./secondChance');

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'index.js'), 'utf8');

/** The body of `exports.respondToSecondChance`, up to the next export. */
function callableSource() {
  const start = SOURCE.indexOf('exports.respondToSecondChance');
  expect(start, 'respondToSecondChance is not exported from index.js').toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const next = rest.indexOf('\nexports.');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('respondToSecondChance — status vocabulary', () => {
  const body = callableSource();

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
    expect(body).not.toMatch(/collection\('orders'\)\.doc\(auctionId\)/);
  });

  it('prices the order from the runner-up bid, not the dead order', () => {
    expect(body).toContain('secondChanceOrderMoney(offer.amount)');
  });
});

describe('respondToSecondChance — notify placement', () => {
  const body = callableSource();

  /**
   * End offset of the runTransaction callback. Plain brace matching is safe
   * here: the callable's only braces inside strings are balanced `${}`
   * interpolations, and its Arabic literals contain none.
   */
  function transactionEnd(src) {
    const at = src.indexOf('runTransaction(');
    expect(at, 'no transaction in respondToSecondChance').toBeGreaterThan(-1);
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let k = open; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}' && --depth === 0) return k;
    }
    return -1;
  }

  it('emits every notify AFTER the transaction commits', () => {
    const end = transactionEnd(body);
    expect(end).toBeGreaterThan(-1);
    const inside = body.slice(0, end);
    expect(inside).not.toMatch(/\bawait notify\(/);
    expect(body.slice(end)).toMatch(/\bawait notify\(/);
  });

  it('resets the captured notify at the top of each attempt', () => {
    // A retried transaction must not re-emit the previous attempt's message.
    expect(body).toMatch(/pendingNotify = null;/);
  });

  it('flags the notification as a second chance so the copy can be truthful', () => {
    // below_reserve_offer / below_reserve_declined copy is written for a
    // genuine below-reserve offer; without this flag it misstates why the
    // recipient is hearing from us.
    expect(body).toMatch(/secondChance: true/);
  });
});
