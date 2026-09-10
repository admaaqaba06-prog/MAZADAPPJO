import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ======================================================================
   `settleAuctionTxn` needs the Admin SDK, so it has no unit test. Its
   invariants are structural, though, and structure can be asserted: which
   reads are inside the transaction, what the idempotency guard looks at,
   and which snapshot each input is taken from.

   Every rule below is here because breaking it silently awards a lot.
   ====================================================================== */

const SRC = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8');

/** The body of settleAuctionTxn's transaction callback. */
function txnBody() {
  const fnStart = SRC.indexOf('async function settleAuctionTxn');
  expect(fnStart, 'settleAuctionTxn not found').toBeGreaterThan(-1);
  const open = SRC.indexOf('db.runTransaction(', fnStart);
  expect(open, 'runTransaction not found in settleAuctionTxn').toBeGreaterThan(-1);
  // Callback ends at the first line that closes it at the function's indent.
  const close = SRC.indexOf('\n  });', open);
  expect(close).toBeGreaterThan(open);
  return SRC.slice(open, close);
}

/** settleAuctionTxn from its declaration to the start of the transaction. */
function preTxn() {
  const fnStart = SRC.indexOf('async function settleAuctionTxn');
  return SRC.slice(fnStart, SRC.indexOf('db.runTransaction(', fnStart));
}

describe('the reserve amount is read inside the transaction', () => {
  it('is read with transaction.get, not a bare document read', () => {
    // Read outside, the one value the sale hinges on sits outside the
    // consistency guarantee covering everything else: a setAuctionReserve
    // landing in the gap settles against an amount the seller has replaced.
    expect(txnBody()).toMatch(/transaction\.get\(secretRef\)/);
  });

  it('is NOT read before the transaction opens', () => {
    const before = preTxn();
    expect(before).not.toMatch(/auctionSecrets[^\n]*\)\.get\(\)/);
    expect(before).not.toMatch(/secretSnap/);
  });

  it('only the document REFERENCE is built outside', () => {
    // A ref is inert; building it early costs nothing and keeps the read
    // itself next to the other in-transaction reads.
    expect(preTxn()).toMatch(/const secretRef = db\.collection\('auctionSecrets'\)/);
  });

  it('the read comes before any write, as Firestore requires', () => {
    const body = txnBody();
    const read = body.indexOf('transaction.get(secretRef)');
    const firstWrite = Math.min(
      ...[/transaction\.set\(/, /transaction\.update\(/]
        .map(re => { const m = body.match(re); return m ? body.indexOf(m[0]) : Infinity; }),
    );
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(firstWrite);
  });

  it('an absent secret means no reserve, and is not confused with a failed read', () => {
    // A missing document is not an error; a throw aborts the transaction and
    // the cron retries. Both are correct, and they are different.
    expect(txnBody()).toMatch(/secretSnap\.exists\s*\?/);
  });
});

describe('every decision input comes from the in-transaction snapshot', () => {
  const body = txnBody();

  it.each([
    ['winner', /const winnerId = freshData\./],
    ['price', /const finalPrice = freshData\./],
    ['bid count', /const totalBids = freshData\./],
    ['tolerance', /resolveReserveTolerancePct\(freshData\)/],
  ])('%s is taken from freshData', (_label, re) => {
    expect(body).toMatch(re);
  });

  it('reserve INTENT is taken from freshData too', () => {
    // This was the odd one out. A reserve set between the sweep query and the
    // transaction leaves the stale snapshot with no `reserveMet`, so intent
    // read false and the lot was awarded as though it never had a reserve —
    // the exact failure the flag exists to prevent.
    expect(body).toMatch(/const reserveIntended = auctionRecordsReserve\(freshData\)/);
  });

  it('no decision input is read from the pre-transaction snapshot', () => {
    // `auctionData` is the sweep-time snapshot. Nothing the decision depends
    // on may come from it.
    const decisionCall = body.slice(body.indexOf('resolveSettlement({'));
    expect(decisionCall.slice(0, 300)).not.toMatch(/auctionData/);
    expect(body).not.toMatch(/reserveIntended[^\n]*auctionData/);
  });
});

describe('the already-settled guard', () => {
  const body = txnBody();

  it('checks the terminal statuses', () => {
    expect(body).toMatch(/\['completed', 'ended', 'reserve_not_met'\]\.includes\(freshData\.status\)/);
  });

  it('ALSO checks settledAt, which survives a status overwrite', () => {
    // "Approve & go live" rewrites status back to `live` — observed in
    // production on auction-new-1784771726248-7597. After that, only
    // `settledAt` still records that the lot ever settled. Without this the
    // lot settles twice, and since orders are keyed `orders/{auctionId}` and
    // created only `if (!orderSnap.exists)`, the second winner gets no order.
    expect(body).toMatch(/freshData\.settledAt != null/);
  });

  it('both checks run before the decision is taken', () => {
    expect(body.indexOf('freshData.settledAt != null'))
      .toBeLessThan(body.indexOf('resolveSettlement({'));
  });

  it('handles a lot deleted between the sweep and the transaction', () => {
    // `.data()` on a missing doc is undefined, and reading `.status` off it
    // throws inside the transaction — logged as a settlement failure and
    // retried forever.
    expect(body).toMatch(/!freshDoc\.exists/);
    expect(body.indexOf('!freshDoc.exists')).toBeLessThan(body.indexOf('freshData.status'));
  });
});
