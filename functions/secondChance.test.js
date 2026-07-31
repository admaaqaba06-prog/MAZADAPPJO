// Second Chance Offer — the pure decisions.
//
// 21 of 31 real orders are `defaulted`: today the winner is banned and the lot
// simply dies, while the runner-up who bid real money hears nothing. Every
// judgement about who gets offered what, and for how much, lives here so each
// branch is testable without an emulator.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  pickRunnerUp, shouldSkipRunnerUp, openingStateFor, buildOfferRecord, secondChanceOrderMoney,
  secondChanceOrderId, offerIsLive, SECOND_CHANCE_ORDER_SUFFIX,
  needsNotifyRetry, OFFER_STATUSES,
} from './secondChance.js';
import {
  buyerPremiumJod, totalDueJod, sellerCommissionFils, sellerNetFils,
  belowReserveBlocksRelist,
} from './settlement.js';
import { isEffectivelyBlocked } from './banLadder.js';

const NOW = 1750000000000;
const HOUR = 3600000;
const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };
const deps = { Timestamp: FakeTimestamp, now: () => NOW };

const bid = (bidderId, amount, over = {}) => ({ bidderId, amount, bidderName: bidderId, ...over });

describe('pickRunnerUp', () => {
  it('picks the highest bid that is not the defaulter\'s', () => {
    const r = pickRunnerUp([bid('w', 100), bid('a', 90), bid('b', 80)], 'w');
    expect(r.bidderId).toBe('a');
    expect(r.amount).toBe(90);
  });

  it('ignores EVERY bid by the defaulter, not just the top one', () => {
    // The winner bidding twice in a row is exactly why `previousBidderId` is
    // the wrong source: it would hand the lot back to the person who defaulted.
    const r = pickRunnerUp([bid('w', 100), bid('w', 95), bid('a', 90)], 'w');
    expect(r.bidderId).toBe('a');
  });

  it('returns null when the defaulter was the only bidder', () => {
    expect(pickRunnerUp([bid('w', 100), bid('w', 90)], 'w')).toBeNull();
  });

  it('returns null for an empty or missing bid list', () => {
    expect(pickRunnerUp([], 'w')).toBeNull();
    expect(pickRunnerUp(undefined, 'w')).toBeNull();
  });

  it('skips malformed bid rows rather than failing the whole lot', () => {
    const r = pickRunnerUp([null, { amount: 50 }, bid('a', 40), { bidderId: 'x' }], 'w');
    expect(r.bidderId).toBe('a');
  });

  it('leaves a missing bidderName empty rather than inventing an English label', () => {
    // This value reaches WhatsApp/email templates verbatim in an Arabic-first
    // product, so the caller picks the display fallback, not this module.
    const r = pickRunnerUp([{ bidderId: 'a', amount: 40 }], 'w');
    expect(r.bidderName).toBe('');
  });
});

/**
 * REVIEW F1 / I2 — the ban decision, tested BEHAVIOURALLY.
 *
 * This lived inline in index.js and was covered only by source-text greps. A
 * review mutated it to `!isEffectivelyBlocked` — offering the lot to every
 * banned runner-up and skipping every eligible one, the exact inverse of the fix
 * — and all 18 of those assertions still passed. Hence this suite: the inversion
 * has to die here, on behaviour, where no amount of correct-looking source can
 * save it.
 */
describe('shouldSkipRunnerUp — the ban gate', () => {
  const user = (over = {}) => ({ isBlocked: false, ...over });
  const read = (u) => ({ readable: true, user: u });

  it('SKIPS a runner-up serving an active block', () => {
    expect(shouldSkipRunnerUp(read(user({ isBlocked: true, blockedUntil: NOW + 48 * HOUR })), NOW)).toBe(true);
  });

  it('OFFERS to a clean account', () => {
    // The inversion mutant fails right here: it would skip this bidder.
    expect(shouldSkipRunnerUp(read(user()), NOW)).toBe(false);
    expect(shouldSkipRunnerUp(read({}), NOW)).toBe(false);
  });

  it('SKIPS a permanent ban, which carries no blockedUntil', () => {
    expect(shouldSkipRunnerUp(read(user({ isBlocked: true, blockedUntil: null })), NOW)).toBe(true);
    expect(shouldSkipRunnerUp(read(user({ isBlocked: true })), NOW)).toBe(true);
  });

  it('OFFERS once the cooldown has elapsed — an expired block is not a block', () => {
    expect(shouldSkipRunnerUp(read(user({ isBlocked: true, blockedUntil: NOW - 1 })), NOW)).toBe(false);
  });

  it('is exact at the expiry boundary, matching isEffectivelyBlocked', () => {
    const lift = NOW + HOUR;
    const blocked = read(user({ isBlocked: true, blockedUntil: lift }));
    expect(shouldSkipRunnerUp(blocked, lift - 1)).toBe(true);
    expect(shouldSkipRunnerUp(blocked, lift)).toBe(false); // `until > now` — not >=
    expect(shouldSkipRunnerUp(blocked, lift + 1)).toBe(false);
  });

  it('reads a Firestore Timestamp blockedUntil, not just epoch ms', () => {
    // What the real user doc actually carries.
    expect(shouldSkipRunnerUp(read(user({ isBlocked: true, blockedUntil: { toMillis: () => NOW + HOUR } })), NOW)).toBe(true);
    expect(shouldSkipRunnerUp(read(user({ isBlocked: true, blockedUntil: { seconds: (NOW - HOUR) / 1000 } })), NOW)).toBe(false);
  });

  it('OFFERS when there is no user doc at all', () => {
    // A bid with no surviving user record is not evidence of a ban.
    expect(shouldSkipRunnerUp(read(null), NOW)).toBe(false);
    expect(shouldSkipRunnerUp(read(undefined), NOW)).toBe(false);
  });

  /**
   * THE FAIL-OPEN PATH, which had no coverage at all.
   *
   * Deliberately the opposite call to the reserve lookup in the same caller.
   * Both reads fail in the direction that preserves the option; the costs
   * differ. A failed RESERVE read risks selling under a seller's reserve, so it
   * fails safe by asking the seller. A failed BAN read risks only re-creating
   * the behaviour that shipped before this check existed — while failing closed
   * would permanently destroy a legitimate runner-up's one and only shot, since
   * a `defaulted` order never re-enters the enforcer's query. The accept-time
   * gate remains a complete backstop: it reads the bidder doc inside the
   * transaction, so it is atomic rather than TOCTOU.
   */
  it('OFFERS when the user lookup THREW — never punishes a bidder for our outage', () => {
    expect(shouldSkipRunnerUp({ readable: false, user: null }, NOW)).toBe(false);
  });

  it('fails open even if a stale user object rides along with a failed read', () => {
    // `readable: false` is decisive: whatever `user` holds is not trustworthy.
    const stale = { readable: false, user: user({ isBlocked: true, blockedUntil: NOW + 48 * HOUR }) };
    expect(shouldSkipRunnerUp(stale, NOW)).toBe(false);
  });

  it('fails open on a malformed lookup rather than throwing inside the sweep', () => {
    // openSecondChanceOffers must never throw — paymentDefaultEnforcer also
    // lifts expired bans, and a throw here would stop that too.
    for (const junk of [null, undefined, 'nope', 42, []]) {
      expect(() => shouldSkipRunnerUp(junk, NOW)).not.toThrow();
      expect(shouldSkipRunnerUp(junk, NOW)).toBe(false);
    }
  });

  it('gives the same answer as the accept-time gate for the same account', () => {
    // One answer to "is this account restricted". If these two ever disagree,
    // the enforcer opens offers the callable refuses — the original defect.
    const cases = [
      user(),
      user({ isBlocked: true, blockedUntil: NOW + 48 * HOUR }),
      user({ isBlocked: true, blockedUntil: NOW - 1 }),
      user({ isBlocked: true, blockedUntil: null }),
    ];
    for (const u of cases) {
      expect(shouldSkipRunnerUp(read(u), NOW)).toBe(isEffectivelyBlocked(u, NOW));
    }
  });
});

describe('openingStateFor — the reserve fork', () => {
  it('goes straight to the buyer when the bid clears the reserve', () => {
    expect(openingStateFor(100, 90)).toBe('pending_buyer');
    expect(openingStateFor(90, 90)).toBe('pending_buyer'); // equal clears
  });

  it('asks the seller first when the bid is under the reserve', () => {
    expect(openingStateFor(80, 90)).toBe('pending_seller');
  });

  it('treats an ABSENT reserve as cleared — an auction without auctionSecrets has none', () => {
    for (const noReserve of [null, undefined]) {
      expect(openingStateFor(10, noReserve)).toBe('pending_buyer');
    }
  });

  it('treats 0 as no reserve — that is how "no reserve" is stored today', () => {
    expect(openingStateFor(10, 0)).toBe('pending_buyer');
  });

  it('fails SAFE on a reserve that is present but unreadable — asks the seller', () => {
    // Absent and corrupt are different: a stored-but-unparseable reserve must
    // never auto-sell the lot under it without the seller's consent. Compare
    // settlement.reserveMet(10, 'abc') === false — same question, same answer.
    for (const corrupt of [NaN, 'abc', -5, '', {}]) {
      expect(openingStateFor(10, corrupt)).toBe('pending_seller');
    }
  });
});

describe('secondChanceOrderId', () => {
  it('derives a distinct id — the defaulted order already owns the auction id', () => {
    expect(secondChanceOrderId('auction-1')).toBe('auction-1__sc');
    expect(SECOND_CHANCE_ORDER_SUFFIX).toBe('__sc');
  });
});

describe('secondChanceOrderMoney', () => {
  it('recomputes fees from the runner-up bid, never inherits the dead order\'s', () => {
    const m = secondChanceOrderMoney(100);
    expect(m.winningBidAmount).toBe(100);
    expect(m.buyersPremium).toBeGreaterThan(0);
    expect(m.totalDue).toBeGreaterThan(100);
    expect(m.sellerNet).toBeLessThan(100);
  });

  it('matches the platform rates used everywhere else', () => {
    // 5% buyer premium, 5% seller commission — from settlement.js, not inline.
    const m = secondChanceOrderMoney(100);
    expect(m.totalDue).toBeCloseTo(105, 5);
    expect(m.sellerNet).toBeCloseTo(95, 5);
  });

  it('pins every field, including the two a mutation could quietly break', () => {
    // buyersPremium and sellerCommission had no real assertion: mutating them
    // to 999 / 0 used to leave the suite green.
    const m = secondChanceOrderMoney(90);
    expect(m.winningBidAmount).toBe(90);
    expect(m.buyersPremium).toBeCloseTo(4.5, 5);
    expect(m.sellerCommission).toBeCloseTo(4.5, 5);
    expect(m.totalDue).toBeCloseTo(94.5, 5);
    expect(m.sellerNet).toBeCloseTo(85.5, 5);
  });

  it('agrees with the settlement helpers across amounts, including odd fils', () => {
    // Catches using the WRONG helper (commission/net swapped, premium where
    // total belongs) and any future rate change made in only one of the two
    // places. It canNOT catch an inlined copy of the same arithmetic — see the
    // source-level test below for that.
    for (const bidAmount of [100, 137.5, 0.333]) {
      const m = secondChanceOrderMoney(bidAmount);
      const fils = Math.round(bidAmount * 1000);
      expect(m.buyersPremium).toBe(buyerPremiumJod(bidAmount));
      expect(m.totalDue).toBe(totalDueJod(bidAmount));
      expect(m.sellerCommission).toBe(sellerCommissionFils(fils) / 1000);
      expect(m.sellerNet).toBe(sellerNetFils(fils) / 1000);
    }
  });

  it('never inlines a rate — the money comes only from the settlement helpers', () => {
    // "Don't inline a rate" is unenforceable by value: settlement's premium is
    // literally `Math.round(h * 0.05)`, so an inlined copy matches the helper
    // for EVERY input. Spying is unavailable too — secondChance.js reaches
    // settlement through CommonJS `require`, which vi.mock does not intercept
    // from an ESM test. So assert it structurally: the only number allowed in
    // this function is the 1000 fils-per-JOD scale, and all four helpers must
    // appear. Inlining `* 0.05` or hardcoding 1.05 fails here.
    const src = readFileSync(new URL('./secondChance.js', import.meta.url), 'utf8');
    const start = src.indexOf('function secondChanceOrderMoney');
    const body = src.slice(start, src.indexOf('\n}', start));
    expect(start).toBeGreaterThan(-1);
    for (const helper of ['buyerPremiumJod', 'totalDueJod', 'sellerCommissionFils', 'sellerNetFils']) {
      expect(body).toContain(`${helper}(`);
    }
    expect([...new Set(body.match(/\d+(\.\d+)?/g) || [])]).toEqual(['1000']);
  });
});

describe('buildOfferRecord', () => {
  const runnerUp = { bidderId: 'a', bidderName: 'Runner Up', amount: 90 };

  it('stamps the runner-up, the amount, the state and a 24h expiry', () => {
    const o = buildOfferRecord(deps, { runnerUp, defaultedOrderId: 'auction-1', openingState: 'pending_buyer' });
    expect(o.status).toBe('pending_buyer');
    expect(o.bidderId).toBe('a');
    expect(o.amount).toBe(90);
    expect(o.defaultedOrderId).toBe('auction-1');
    expect(o.expiresAt.toMillis()).toBe(NOW + 24 * HOUR);
  });

  it('records when it opened, for the audit trail', () => {
    const o = buildOfferRecord(deps, { runnerUp, defaultedOrderId: 'x', openingState: 'pending_seller' });
    expect(o.openedAt.toMillis()).toBe(NOW);
  });
});

describe('offerIsLive', () => {
  const live = { status: 'pending_buyer', expiresAt: FakeTimestamp.fromMillis(NOW + HOUR) };

  it('is live while pending and unexpired', () => {
    expect(offerIsLive(live, NOW)).toBe(true);
    expect(offerIsLive({ ...live, status: 'pending_seller' }, NOW)).toBe(true);
  });

  it('is not live once expired', () => {
    expect(offerIsLive({ ...live, expiresAt: FakeTimestamp.fromMillis(NOW - 1) }, NOW)).toBe(false);
  });

  it('is not live in a terminal state', () => {
    for (const status of ['confirmed', 'declined', 'expired']) {
      expect(offerIsLive({ ...live, status }, NOW)).toBe(false);
    }
  });

  it('is not live when there is no offer at all', () => {
    expect(offerIsLive(null, NOW)).toBe(false);
    expect(offerIsLive(undefined, NOW)).toBe(false);
  });
});

describe('buildOfferRecord stamps an explicit notifiedAt', () => {
  const runnerUp = { bidderId: 'a', bidderName: 'Runner Up', amount: 90 };

  it('writes notifiedAt: null rather than omitting the field', () => {
    // Not cosmetic: Firestore's `where('...notifiedAt','==',null)` does NOT
    // return documents that simply lack the field, so an omitted null would
    // make an un-notified offer invisible to the retry sweep — the one thing
    // that can rescue it.
    const o = buildOfferRecord(deps, { runnerUp, defaultedOrderId: 'x', openingState: 'pending_buyer' });
    expect(Object.prototype.hasOwnProperty.call(o, 'notifiedAt')).toBe(true);
    expect(o.notifiedAt).toBe(null);
  });
});

describe('needsNotifyRetry', () => {
  const live = { status: 'pending_buyer', expiresAt: FakeTimestamp.fromMillis(NOW + HOUR), notifiedAt: null };

  it('retries a live offer nobody was ever told about', () => {
    expect(needsNotifyRetry(live, NOW)).toBe(true);
    expect(needsNotifyRetry({ ...live, status: 'pending_seller' }, NOW)).toBe(true);
  });

  it('treats a missing notifiedAt as un-notified too', () => {
    const { notifiedAt, ...withoutField } = live;
    expect(needsNotifyRetry(withoutField, NOW)).toBe(true);
  });

  it('does not re-announce an offer that was already announced', () => {
    expect(needsNotifyRetry({ ...live, notifiedAt: FakeTimestamp.fromMillis(NOW - 1) }, NOW)).toBe(false);
  });

  it('does not announce an offer that has expired unheard', () => {
    // Re-announcing a dead offer is worse than the silence: it invites someone
    // to act on something they can no longer act on.
    expect(needsNotifyRetry({ ...live, expiresAt: FakeTimestamp.fromMillis(NOW - 1) }, NOW)).toBe(false);
  });

  it('does not announce an offer that is already decided', () => {
    for (const status of ['confirmed', 'declined', 'expired']) {
      expect(needsNotifyRetry({ ...live, status }, NOW)).toBe(false);
    }
  });

  it('is false when there is no offer at all', () => {
    expect(needsNotifyRetry(null, NOW)).toBe(false);
    expect(needsNotifyRetry(undefined, NOW)).toBe(false);
  });
});

describe('OFFER_STATUSES pins the vocabulary the relist guard understands', () => {
  // The trap this closes: `belowReserveBlocksRelist` recognises the literal
  // 'confirmed' and nothing else as a sale. If a later task writes 'accepted'
  // instead, NOTHING errors — the status just falls through to "does not
  // block", the lot auto-relists while a live offer stands on it, and two
  // people can buy the same item. Every status the second-chance flow may ever
  // write must therefore be declared here AND be understood over there.
  const unexpired = { expiresAt: FakeTimestamp.fromMillis(NOW + HOUR) };

  it('declares exactly the statuses in use today', () => {
    expect(Object.keys(OFFER_STATUSES).sort()).toEqual(
      ['confirmed', 'declined', 'expired', 'pending_buyer', 'pending_seller'],
    );
  });

  for (const [status, meaning] of Object.entries(OFFER_STATUSES)) {
    it(`'${status}' behaves as '${meaning}' in both offerIsLive and belowReserveBlocksRelist`, () => {
      const offer = { ...unexpired, status };
      // live = undecided and actionable; sold/closed = decided.
      expect(offerIsLive(offer, NOW)).toBe(meaning === 'live');
      // live and sold both hold the lot back; only closed releases it.
      expect(belowReserveBlocksRelist(offer, NOW)).toBe(meaning !== 'closed');
    });
  }

  it('a live status stops blocking once its window lapses, a sold one never does', () => {
    for (const [status, meaning] of Object.entries(OFFER_STATUSES)) {
      const lapsed = { status, expiresAt: FakeTimestamp.fromMillis(NOW - 1) };
      expect(belowReserveBlocksRelist(lapsed, NOW)).toBe(meaning === 'sold');
    }
  });
});
