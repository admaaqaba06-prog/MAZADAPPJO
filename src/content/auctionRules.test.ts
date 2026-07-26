import { describe, it, expect } from 'vitest';
import { AUCTION_RULES, RULES_VERSION } from './auctionRules';

// E4 — the shared Auction Rules content is the single source rendered by the
// AuctionRulesModal, the pay-to-bid acceptance gate, and every entry point.
// These guard its shape so a bad edit can't ship an empty/half-translated rule.
describe('auctionRules content', () => {
  it('exposes a positive integer RULES_VERSION (used for re-prompt on change)', () => {
    expect(Number.isInteger(RULES_VERSION)).toBe(true);
    expect(RULES_VERSION).toBeGreaterThan(0);
  });

  it('has at least one rule', () => {
    expect(AUCTION_RULES.length).toBeGreaterThan(0);
  });

  it('every rule has a non-empty English and Arabic string', () => {
    for (const rule of AUCTION_RULES) {
      expect(typeof rule.en).toBe('string');
      expect(rule.en.trim().length).toBeGreaterThan(0);
      expect(typeof rule.ar).toBe('string');
      expect(rule.ar.trim().length).toBeGreaterThan(0);
    }
  });
});
