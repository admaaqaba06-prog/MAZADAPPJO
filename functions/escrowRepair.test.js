// The escrow-repair winner rule.
//
// A whole-branch review of Second Chance Offer flagged this as the one place
// `orders/<auctionId>__sc` genuinely breaks something money-shaped:
// `repairStuckEscrowsForEndedAuction` read `orders/{auctionId}` to learn who the
// buyer is, and on a second-chanced lot that document is the DEFAULTED order.
// It would have kept the defaulter's escrow locked and refunded the runner-up
// who actually paid.
//
// Latent when written — no per-bid escrows exist under the membership model, so
// the query returns empty and the callable early-returns — which is exactly why
// it needed pinning rather than remembering.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveEscrowWinner, isTerminalForBuyer, TERMINAL_BUYER_STATUSES,
} from './escrowRepair.js';

const AUCTION = { currentBidderId: 'defaulter' };
const DEFAULTED = { buyerId: 'defaulter', status: 'defaulted' };
const LIVE_SC = { buyerId: 'runner-up', status: 'waiting_payment' };

describe('the second-chance case — the bug this exists for', () => {
  it('names the RUNNER-UP, never the defaulter, once a second chance was accepted', () => {
    const r = resolveEscrowWinner({
      auction: AUCTION, baseOrder: DEFAULTED, secondChanceOrder: LIVE_SC,
    });
    expect(r.winnerId).toBe('runner-up');
    expect(r.activeBuyerId).toBe('runner-up');
    expect(r.source).toBe('second_chance_order');
  });

  it('does not protect the defaulter even though the AUCTION still names them', () => {
    // auction.currentBidderId is never rewritten when the winner defaults, so a
    // fallback that trusts it would keep the wrong escrow locked.
    const r = resolveEscrowWinner({
      auction: { currentBidderId: 'defaulter' }, baseOrder: DEFAULTED, secondChanceOrder: LIVE_SC,
    });
    expect(r.winnerId).not.toBe('defaulter');
  });

  it('protects nobody when the second chance ALSO died', () => {
    const r = resolveEscrowWinner({
      auction: AUCTION,
      baseOrder: DEFAULTED,
      secondChanceOrder: { buyerId: 'runner-up', status: 'defaulted' },
    });
    expect(r.winnerId).toBeNull();
    expect(r.activeBuyerId).toBeNull();
  });

  it('lets the second-chance order win at every live status', () => {
    for (const status of ['waiting_payment', 'paid', 'preparing_shipment', 'shipped', 'delivered', 'completed', 'disputed']) {
      const r = resolveEscrowWinner({
        auction: AUCTION, baseOrder: DEFAULTED, secondChanceOrder: { buyerId: 'runner-up', status },
      });
      expect(r.winnerId, status).toBe('runner-up');
    }
  });
});

describe('default without a second chance', () => {
  it('protects nobody — a buyer who never paid must not hold an escrow forever', () => {
    // The old rule excluded only cancelled/rejected, so `defaulted` fell through
    // as "still the active buyer" and the escrow stayed locked indefinitely.
    const r = resolveEscrowWinner({ auction: AUCTION, baseOrder: DEFAULTED, secondChanceOrder: null });
    expect(r.winnerId).toBeNull();
    expect(r.source).toBe('base_order');
  });

  it('treats cancelled and rejected the same way', () => {
    for (const status of ['cancelled', 'rejected']) {
      const r = resolveEscrowWinner({
        auction: AUCTION, baseOrder: { buyerId: 'buyer', status }, secondChanceOrder: null,
      });
      expect(r.winnerId, status).toBeNull();
    }
  });
});

describe('the ordinary cases still work', () => {
  it('a live base order names its buyer', () => {
    const r = resolveEscrowWinner({
      auction: AUCTION, baseOrder: { buyerId: 'winner', status: 'paid' }, secondChanceOrder: null,
    });
    expect(r.winnerId).toBe('winner');
    expect(r.source).toBe('base_order');
  });

  it('falls back to the auction ONLY when no order exists at all', () => {
    // Settlement may still be in flight; releasing the standing winner's escrow
    // moments before their order appears is the expensive mistake.
    const r = resolveEscrowWinner({ auction: AUCTION, baseOrder: null, secondChanceOrder: null });
    expect(r.winnerId).toBe('defaulter');
    expect(r.source).toBe('auction');
    expect(r.activeBuyerId).toBeNull();
  });

  it('reads the auction fallback fields in the documented priority', () => {
    expect(resolveEscrowWinner({ auction: { highestBidderId: 'h' }, baseOrder: null, secondChanceOrder: null }).winnerId).toBe('h');
    expect(resolveEscrowWinner({ auction: { winnerId: 'w' }, baseOrder: null, secondChanceOrder: null }).winnerId).toBe('w');
    expect(resolveEscrowWinner({ auction: { winningBidderId: 'wb' }, baseOrder: null, secondChanceOrder: null }).winnerId).toBe('wb');
    expect(resolveEscrowWinner({
      auction: { currentBidderId: 'c', highestBidderId: 'h' }, baseOrder: null, secondChanceOrder: null,
    }).winnerId).toBe('c');
  });

  it('an order with no buyer falls back rather than releasing everything', () => {
    const r = resolveEscrowWinner({
      auction: AUCTION, baseOrder: { status: 'paid' }, secondChanceOrder: null,
    });
    expect(r.winnerId).toBe('defaulter');
    expect(r.activeBuyerId).toBeNull();
    expect(r.source).toContain('no_buyer');
  });

  it('never throws on junk', () => {
    for (const bad of [undefined, null, {}, { auction: null, baseOrder: null, secondChanceOrder: null }]) {
      expect(() => resolveEscrowWinner(bad)).not.toThrow();
      expect(resolveEscrowWinner(bad).winnerId).toBeNull();
    }
  });
});

describe('the terminal list is exact', () => {
  it('holds precisely the three statuses that end a buyer claim', () => {
    expect([...TERMINAL_BUYER_STATUSES].sort()).toEqual(['cancelled', 'defaulted', 'rejected']);
  });

  it('does NOT include refunded or completed — an unsure repair keeps the lock', () => {
    // Both mean money already moved by the proper path. Releasing again is the
    // unrecoverable direction; leaving it locked is fixable by a human.
    expect(isTerminalForBuyer('refunded')).toBe(false);
    expect(isTerminalForBuyer('completed')).toBe(false);
  });

  it('is frozen, so a caller cannot widen it by accident', () => {
    expect(Object.isFrozen(TERMINAL_BUYER_STATUSES)).toBe(true);
  });

  it('handles missing and non-string statuses without matching', () => {
    for (const bad of [undefined, null, 0, {}, []]) expect(isTerminalForBuyer(bad)).toBe(false);
  });
});

describe('index.js delegates rather than re-implementing the rule', () => {
  // Vitest here is environment: 'node' and index.js cannot be imported (it
  // initialises firebase-admin at module load), so the wiring is asserted
  // against the source — the same idiom as secondChanceCallable.test.js. An
  // earlier version of this exact rule was inlined and got it backwards.
  const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const fn = src.slice(
    src.indexOf('exports.repairStuckEscrowsForEndedAuction'),
    src.indexOf('exports.', src.indexOf('exports.repairStuckEscrowsForEndedAuction') + 10),
  );

  it('calls resolveEscrowWinner', () => {
    expect(fn).toMatch(/resolveEscrowWinner\(/);
  });

  it('reads the SECOND-CHANCE order too, not only orders/{auctionId}', () => {
    // Reading one document is the whole bug.
    expect(fn).toMatch(/secondChanceOrderId\(auctionId\)/);
    // Assert the SNAPSHOT is passed, not merely that the key is present:
    // `secondChanceOrder: null` satisfies /secondChanceOrder:/ while
    // reintroducing the exact bug. Caught by mutating this very line.
    expect(fn).toMatch(/secondChanceOrder:\s*scOrderSnap\b/);
    expect(fn).not.toMatch(/secondChanceOrder:\s*null/);
  });

  it('no longer hard-codes the cancelled/rejected test that missed `defaulted`', () => {
    expect(fn).not.toMatch(/!==\s*'cancelled'/);
    expect(fn).not.toMatch(/!==\s*'rejected'/);
  });

  it('derives the active buyer from the helper, not from the base order doc', () => {
    expect(fn).toMatch(/activeBuyerId/);
    expect(fn).not.toMatch(/orderBuyerId/);
  });
});
