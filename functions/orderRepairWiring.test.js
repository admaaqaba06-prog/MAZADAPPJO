import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ======================================================================
   orderRepair.test.js proves the DECISION is right. This file proves the
   decision is actually CONSULTED.

   That distinction is the whole bug. `resolveSettlement` was already
   correct, already tested, and already refusing to award below-reserve
   lots — and `repairEndedAuctionOrder` awarded them anyway, because it
   never called it. A guard nothing invokes is worth nothing, and a unit
   test of the guard alone reports full marks either way.

   fileURLToPath, not `.pathname` — see fix/wiring-tests-windows-paths.
   ====================================================================== */

const SRC = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8');

/** The body of `exports.<name> = ...`, up to the next top-level export. */
function bodyOf(name) {
  const start = SRC.indexOf(`exports.${name} =`);
  expect(start, `exports.${name} not found in index.js`).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const nextExport = rest.search(/\nexports\.[A-Za-z0-9_]+ =/);
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

describe('repairEndedAuctionOrder consults the settlement decision', () => {
  const body = bodyOf('repairEndedAuctionOrder');

  it('reads the reserve from auctionSecrets', () => {
    expect(body).toMatch(/auctionSecrets/);
  });

  it('runs the SAME resolveSettlement the cron runs', () => {
    // Not a re-implementation. A second copy of this logic is a second thing
    // to forget to update.
    expect(body).toMatch(/resolveSettlement\(/);
  });

  it('derives reserve intent by presence, via the shared helper', () => {
    expect(body).toMatch(/auctionRecordsReserve\(/);
  });

  it('asks authorizeOrderRepair before doing anything', () => {
    expect(body).toMatch(/authorizeOrderRepair\(/);
  });

  it('the guard runs BEFORE the order is written', () => {
    // Ordering is the assertion that matters. A guard placed after the write
    // satisfies every check above and prevents nothing.
    const guard = body.indexOf('authorizeOrderRepair(');
    const write = body.indexOf('orderRef.set(');
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write);
  });

  it('the reserve is read BEFORE the decision is taken', () => {
    expect(body.indexOf('auctionSecrets')).toBeLessThan(body.indexOf('resolveSettlement('));
  });

  it('returns early on refusal, rather than logging and continuing', () => {
    // `if (!permitted.ok) { ...; return ... }` — the return is what stops it.
    expect(body).toMatch(/if\s*\(\s*!\s*permitted\.ok\s*\)[\s\S]{0,400}?return\s*\{/);
  });

  it('fails CLOSED when auctionSecrets cannot be read', () => {
    // An unreadable reserve must not collapse into "no reserve" — that is
    // precisely how lots were sold under their reserve before #290.
    const catchBlock = body.slice(body.indexOf('auctionSecrets'));
    expect(catchBlock).toMatch(/catch\s*\([a-zA-Z]+\)\s*\{[\s\S]{0,600}?return\s*\{\s*success:\s*false/);
  });

  it('writes the order exactly once, and only past the guard', () => {
    // If a second write appears, the ordering assertion above only covers the
    // first one and the new path is unguarded.
    expect(body.match(/orderRef\.set\(/g) || []).toHaveLength(1);
  });
});

describe('the two settlement paths stay in agreement', () => {
  it('both derive reserve intent from the PRESENCE of reserveMet', () => {
    // settleAuctionTxn does it inline; the repair path goes through the
    // helper. Both must mean the same thing, or one path will award a lot the
    // other refuses.
    expect(SRC).toMatch(/hasOwnProperty\.call\([^)]*,\s*'reserveMet'\)/);
    expect(bodyOf('repairEndedAuctionOrder')).toMatch(/auctionRecordsReserve\(/);
  });

  it('no order-creating path skips resolveSettlement', () => {
    // Every place an order document is written from a settlement-shaped path
    // should be downstream of a decision. This is a coarse net on purpose: if
    // it trips on a NEW path, that path needs the same review this one got.
    const orderWriters = [...SRC.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)]
      .map(m => m[1])
      .filter(name => /orderRef\.set\(|collection\('orders'\)\.doc\([^)]*\)\.set\(/.test(bodyOf(name)));

    const reviewed = new Set([
      'repairEndedAuctionOrder', // guarded here
      'acceptBelowReserve',      // negotiated price, its own transactional guards
      'confirmBelowReserve',     // ditto
    ]);

    const unreviewed = orderWriters.filter(n => !reviewed.has(n));
    expect(unreviewed, `new order-creating path(s) need a reserve review: ${unreviewed.join(', ')}`)
      .toEqual([]);
  });
});
