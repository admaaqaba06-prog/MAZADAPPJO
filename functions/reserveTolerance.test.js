import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  reserveMet,
  resolveSettlement,
  resolveReserveTolerancePct,
  toleranceFloorFils,
  classifyAgainstReserve,
  belowReservePublicStatus,
  BELOW_RESERVE_PUBLIC_STATUS,
  DEFAULT_RESERVE_TOLERANCE_PCT,
  MAX_RESERVE_TOLERANCE_PCT,
} from './settlement.js';

// The worked example from the spec, in fils. 1,000 JOD reserve, 10% tolerance,
// so the floor is 900 JOD. Everything below is stated in fils because that is
// the unit the comparison actually runs in.
const RESERVE = 1_000_000; // 1,000 JOD
const FLOOR = 900_000; //   900 JOD

describe('toleranceFloorFils', () => {
  it('puts a 10% band on a 1,000 JOD reserve at 900 JOD', () => {
    expect(toleranceFloorFils(RESERVE, 10)).toBe(FLOOR);
  });

  it('is exact integer fils — never a float artefact', () => {
    // 0.1 * 3 !== 0.3 in binary floating point; the fils path must not care.
    const r = 333_333; // 333.333 JOD
    const floor = toleranceFloorFils(r, 10);
    expect(Number.isInteger(floor)).toBe(true);
    // 333333 * 0.9 = 299999.7 -> ceil -> 300000. Ceil, so the floor is never a
    // fraction of a fil UNDER the true percentage.
    expect(floor).toBe(300_000);
  });

  it('a 0% tolerance collapses the band onto the reserve', () => {
    expect(toleranceFloorFils(RESERVE, 0)).toBe(RESERVE);
  });

  it('clamps a hostile tolerance to the maximum', () => {
    expect(toleranceFloorFils(RESERVE, 999)).toBe(toleranceFloorFils(RESERVE, MAX_RESERVE_TOLERANCE_PCT));
  });

  it('no reserve means no floor', () => {
    expect(toleranceFloorFils(0, 10)).toBe(0);
    expect(toleranceFloorFils(null, 10)).toBe(0);
  });

  it('survives a reserve far larger than any real lot without precision loss', () => {
    const huge = 10_000_000 * 1000; // 10,000,000 JOD in fils
    expect(toleranceFloorFils(huge, 10)).toBe(9_000_000_000);
    expect(Number.isSafeInteger(huge * 100)).toBe(true);
  });
});

describe('classifyAgainstReserve — the four boundaries the spec asked for', () => {
  const at = (priceFils) =>
    classifyAgainstReserve({ finalPriceFils: priceFils, reserveFils: RESERVE, tolerancePct: 10 });

  it('bid EXACTLY equal to the reserve -> reserve met', () => {
    expect(at(RESERVE)).toBe('reserve_met');
  });

  it('bid one fil above the reserve -> reserve met', () => {
    expect(at(RESERVE + 1)).toBe('reserve_met');
  });

  it('bid one fil BELOW the reserve -> within tolerance, not met', () => {
    expect(at(RESERVE - 1)).toBe('within_tolerance');
  });

  it('bid EXACTLY equal to the tolerance floor -> within tolerance (floor is inclusive)', () => {
    expect(at(FLOOR)).toBe('within_tolerance');
  });

  it('bid one fil ABOVE the floor -> within tolerance', () => {
    expect(at(FLOOR + 1)).toBe('within_tolerance');
  });

  it('bid one fil BELOW the floor -> below tolerance', () => {
    expect(at(FLOOR - 1)).toBe('below_tolerance');
  });

  it('the spec worked example: 950 is inside the band, 880 is not', () => {
    expect(at(950_000)).toBe('within_tolerance');
    expect(at(880_000)).toBe('below_tolerance');
  });

  it('no reserve is always "met" — there is nothing to miss', () => {
    expect(classifyAgainstReserve({ finalPriceFils: 1, reserveFils: 0, tolerancePct: 10 })).toBe('reserve_met');
    expect(classifyAgainstReserve({ finalPriceFils: 1, reserveFils: null, tolerancePct: 10 })).toBe('reserve_met');
  });
});

describe('resolveReserveTolerancePct', () => {
  it('defaults to 10 when unset', () => {
    expect(resolveReserveTolerancePct({})).toBe(DEFAULT_RESERVE_TOLERANCE_PCT);
    expect(resolveReserveTolerancePct(null)).toBe(DEFAULT_RESERVE_TOLERANCE_PCT);
  });

  it('honours a per-auction override', () => {
    expect(resolveReserveTolerancePct({ reserveTolerancePct: 5 })).toBe(5);
  });

  it('clamps a forged value rather than trusting it', () => {
    // The field sits on the world-readable auction doc, which admins write from
    // a browser — an unclamped 95 would offer the seller 5% of their reserve.
    expect(resolveReserveTolerancePct({ reserveTolerancePct: 95 })).toBe(MAX_RESERVE_TOLERANCE_PCT);
    expect(resolveReserveTolerancePct({ reserveTolerancePct: -5 })).toBe(DEFAULT_RESERVE_TOLERANCE_PCT);
    expect(resolveReserveTolerancePct({ reserveTolerancePct: 'abc' })).toBe(DEFAULT_RESERVE_TOLERANCE_PCT);
  });
});

describe('resolveSettlement — the tolerance gate on the settlement decision', () => {
  const settle = (finalPrice, tolerancePct = 10) =>
    resolveSettlement({ totalBids: 2, winnerId: 'u1', finalPrice, reservePrice: 1000, tolerancePct });

  it('Case A — bid at or above the reserve sells, and opens no offer', () => {
    expect(settle(1000)).toMatchObject({ outcome: 'sold', offerBelowReserve: false });
    expect(settle(1200)).toMatchObject({ outcome: 'sold', offerBelowReserve: false });
  });

  it('Case B — a near miss inside the band opens a seller offer', () => {
    expect(settle(950)).toMatchObject({
      outcome: 'reserve_not_met',
      status: 'reserve_not_met',
      offerBelowReserve: true,
      reserveClass: 'within_tolerance',
    });
  });

  it('Case C — below the floor opens NO offer and creates no pending decision', () => {
    expect(settle(880)).toMatchObject({
      outcome: 'reserve_not_met',
      status: 'reserve_not_met',
      offerBelowReserve: false,
      reserveClass: 'below_tolerance',
    });
  });

  it('the floor itself is inside the band', () => {
    expect(settle(900)).toMatchObject({ offerBelowReserve: true });
    expect(settle(899.999)).toMatchObject({ offerBelowReserve: false });
  });

  it('reserveMet stays the sole authority on whether a sale happens', () => {
    // The tolerance band must never turn a below-reserve top bid into a SALE.
    // It only decides whether the seller is ASKED.
    for (const price of [880, 899, 900, 950, 999]) {
      expect(reserveMet(price, 1000)).toBe(false);
      expect(settle(price).outcome).toBe('reserve_not_met');
    }
  });

  it('no winner is unsold regardless of the band', () => {
    expect(resolveSettlement({ totalBids: 0, winnerId: null, finalPrice: 950, reservePrice: 1000, tolerancePct: 10 }))
      .toMatchObject({ outcome: 'unsold', offerBelowReserve: false });
  });
});

describe('belowReservePublicStatus — the API contract vocabulary', () => {
  it('maps every stored status to a contract status', () => {
    expect(belowReservePublicStatus('pending_seller')).toBe('pending_seller_decision');
    expect(belowReservePublicStatus('pending_buyer')).toBe('accepted_below_reserve');
    expect(belowReservePublicStatus('confirmed')).toBe('accepted_below_reserve');
    expect(belowReservePublicStatus('declined')).toBe('rejected_below_reserve');
    expect(belowReservePublicStatus('expired')).toBe('rejected_below_reserve');
  });

  it('returns null rather than inventing a status for an unknown value', () => {
    expect(belowReservePublicStatus('nonsense')).toBeNull();
    expect(belowReservePublicStatus(undefined)).toBeNull();
  });

  it('emits only the three statuses the contract names', () => {
    expect(new Set(Object.values(BELOW_RESERVE_PUBLIC_STATUS))).toEqual(
      new Set(['pending_seller_decision', 'accepted_below_reserve', 'rejected_below_reserve']),
    );
  });
});

describe('the reserve amount never leaves the server', () => {
  it('no settlement decision carries the reserve, the floor, or the gap to either', () => {
    // This is the whole point of the band being classified into a NAME. A
    // decision object that carried `floor` or `remaining` would be one careless
    // spread away from a client payload, and either value discloses the reserve.
    const decision = resolveSettlement({
      totalBids: 2, winnerId: 'u1', finalPrice: 950, reservePrice: 1000, tolerancePct: 10,
    });
    const serialised = JSON.stringify(decision);
    expect(serialised).not.toContain('1000');
    expect(serialised).not.toContain('900');
    expect(Object.keys(decision).sort()).toEqual(
      ['offerBelowReserve', 'outcome', 'reserveClass', 'status'],
    );
  });
});

describe('the buyer is told their bid is with the seller — and nothing more', () => {
  const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const settleFn = src.slice(
    src.indexOf('async function settleAuctionTxn'),
    src.indexOf('exports.scheduledAuctionCloser'),
  );

  it('the notification fires only when an offer was actually stamped', () => {
    // Gated on `belowReserveNotify`, which is itself gated on
    // `decision.offerBelowReserve`. A below-tolerance top bid gets no message:
    // "your bid was too far below" would disclose roughly where the reserve is.
    expect(settleFn).toContain("if (belowReserveNotify && belowReserveNotify.topBidderId) {");
    expect(settleFn).toContain("event: 'below_reserve_pending'");
    const gate = settleFn.indexOf('if (winnerId && decision.offerBelowReserve) {');
    expect(gate).toBeGreaterThan(-1);
    expect(settleFn.indexOf('topBidderId: winnerId')).toBeGreaterThan(gate);
  });

  it('carries no reserve amount and no tolerance floor', () => {
    const call = settleFn.slice(
      settleFn.indexOf("event: 'below_reserve_pending'"),
      settleFn.indexOf('return { settled, orderId: settledOrderId };'),
    );
    expect(call).not.toMatch(/reservePrice|reserveFils|toleranceFloor|reserveClass/);
    // topBid is the buyer's OWN bid — they already know it.
    expect(call).toContain('topBid: belowReserveNotify.topBid');
  });

  it('is in-app only — no WhatsApp, no email, and it never reaches n8n', () => {
    const notify = readFileSync(new URL('./notify.js', import.meta.url), 'utf8');
    expect(notify).toContain('below_reserve_pending: INAPP_ONLY');
    // The n8n post is gated on whatsapp||email, so INAPP_ONLY never routes there
    // and the live workflow needs no change to support this event.
    expect(readFileSync(new URL('./index.js', import.meta.url), 'utf8'))
      .toContain('if (channels.whatsapp || channels.email) {');
  });

  it('has its own idempotency key, distinct from the seller prompt', () => {
    expect(settleFn).toContain('_below_reserve_pending');
    expect(settleFn).toContain('_below_reserve_offer');
  });

  it('is bilingual and says nothing about the reserve amount', () => {
    const copy = readFileSync(new URL('./messageCopy.js', import.meta.url), 'utf8');
    const lines = copy.split('\n').filter((l) => l.includes('below_reserve_pending:'));
    expect(lines.length).toBe(2); // EN and AR
    for (const line of lines) {
      expect(line).not.toMatch(/reservePrice|d\.reserve|floor/);
    }
    expect(copy).toContain('Your bid is with the seller');
    expect(copy).toContain('مزايدتك بانتظار البائع');
  });
});

describe('tolerance × an UNVERIFIABLE reserve (the interaction that could go wrong quietly)', () => {
  // main's #290 added `reserveIntended`: when a lot records that it HAS a
  // reserve but the amount was never stored, settlement must refuse to award and
  // hand the decision to the seller. The tolerance band is a percentage OF THE
  // RESERVE, so with no amount there is no floor — and the naive composition
  // (classify a missing reserve) reads it as 0, answers 'reserve_met', and
  // SUPPRESSES the offer. That would silently strip the recourse #290 added,
  // on exactly the broken lots it was written for, and every other test here
  // would still pass.
  const unverifiable = (finalPrice) =>
    resolveSettlement({
      totalBids: 3, winnerId: 'u1', finalPrice, reservePrice: null,
      reserveIntended: true, tolerancePct: 10,
    });

  it('never awards the lot, at any price', () => {
    for (const price of [1, 150, 999_999]) {
      expect(unverifiable(price).outcome).toBe('reserve_not_met');
      expect(unverifiable(price).reserveUnverifiable).toBe(true);
    }
  });

  it('STILL opens the seller offer — the band must not suppress it', () => {
    for (const price of [1, 150, 999_999]) {
      expect(unverifiable(price).offerBelowReserve).toBe(true);
    }
  });

  it('is classified as unverifiable, not as a band outcome', () => {
    // If this ever reads 'below_tolerance' or 'reserve_met', the branch has been
    // routed through classifyAgainstReserve and the bug above is back.
    expect(unverifiable(150).reserveClass).toBe('unverifiable');
  });

  it('a 0% tolerance cannot switch the recourse off either', () => {
    // 0% is the setting most likely to be reached for by someone trying to
    // "turn the band off". It must not take the unverifiable path with it.
    expect(resolveSettlement({
      totalBids: 3, winnerId: 'u1', finalPrice: 150, reservePrice: null,
      reserveIntended: true, tolerancePct: 0,
    }).offerBelowReserve).toBe(true);
  });

  it('a lot with NO reserve intended is untouched by any of this', () => {
    expect(resolveSettlement({
      totalBids: 3, winnerId: 'u1', finalPrice: 150, reservePrice: null,
      reserveIntended: false, tolerancePct: 10,
    })).toMatchObject({ outcome: 'sold', offerBelowReserve: false });
  });

  it('a READABLE reserve still goes through the band as normal', () => {
    // reserveIntended must not short-circuit the band when the amount IS there.
    expect(resolveSettlement({
      totalBids: 3, winnerId: 'u1', finalPrice: 950, reservePrice: 1000,
      reserveIntended: true, tolerancePct: 10,
    })).toMatchObject({ offerBelowReserve: true, reserveClass: 'within_tolerance' });
    expect(resolveSettlement({
      totalBids: 3, winnerId: 'u1', finalPrice: 880, reservePrice: 1000,
      reserveIntended: true, tolerancePct: 10,
    })).toMatchObject({ offerBelowReserve: false, reserveClass: 'below_tolerance' });
  });
});
