// Second Chance Offer — the pure decisions.
//
// 21 of 31 real orders are `defaulted`: today the winner is banned and the lot
// simply dies, while the runner-up who bid real money hears nothing. Every
// judgement about who gets offered what, and for how much, lives here so each
// branch is testable without an emulator.
import { describe, it, expect } from 'vitest';
import {
  pickRunnerUp, openingStateFor, buildOfferRecord, secondChanceOrderMoney,
  secondChanceOrderId, offerIsLive, SECOND_CHANCE_ORDER_SUFFIX,
} from './secondChance.js';

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
});

describe('openingStateFor — the reserve fork', () => {
  it('goes straight to the buyer when the bid clears the reserve', () => {
    expect(openingStateFor(100, 90)).toBe('pending_buyer');
    expect(openingStateFor(90, 90)).toBe('pending_buyer'); // equal clears
  });

  it('asks the seller first when the bid is under the reserve', () => {
    expect(openingStateFor(80, 90)).toBe('pending_seller');
  });

  it('treats no reserve as cleared — an auction without auctionSecrets has none', () => {
    for (const noReserve of [null, undefined, 0, NaN, 'abc']) {
      expect(openingStateFor(10, noReserve)).toBe('pending_buyer');
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
