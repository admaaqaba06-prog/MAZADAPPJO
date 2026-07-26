// Client/server money parity.
//
// The 5% buyer premium and 5% seller commission are implemented TWICE: once in
// functions/settlement.js (authoritative — what gets written to the order and
// what the winner actually owes) and once in src/utils/bidMath.ts (what the UI
// quotes before the bid lands). Every doc comment in bidMath.ts says it
// "mirrors the server" — but nothing enforced it, so the two could drift on a
// rate change and the app would quote a number it doesn't charge.
//
// That is the worst class of bug in this app: silent, money-denominated, and
// only visible to the customer. This test makes the drift impossible to ship —
// it runs BOTH implementations over the same prices and demands identical
// output, so changing the rate in one file fails the build until the other
// matches.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { totalWithPremium, sellerNet } from './bidMath';

// functions/settlement.js is CommonJS (Cloud Functions runtime) — load it the
// way index.js does rather than converting it to ESM.
const require = createRequire(import.meta.url);
const {
  buyerPremiumJod,
  totalDueJod,
  sellerNetFils,
  BUYER_PREMIUM_RATE,
  SELLER_COMMISSION_RATE,
} = require('../../functions/settlement.js');

// Realistic hammer prices plus the rounding traps: sub-dinar, fils-level
// fractions, and amounts where 5% lands exactly on a half fil.
const PRICES = [
  0.5, 1, 3, 7.35, 10, 12.5, 25, 49.99, 100, 149.5, 250, 999.99, 1234.567, 5000,
];

describe('client/server money parity', () => {
  it("quotes the same total due (hammer + buyer's premium) as the server writes", () => {
    for (const price of PRICES) {
      expect(totalWithPremium(price), `total due diverged at ${price} JOD`).toBe(
        totalDueJod(price)
      );
    }
  });

  it('quotes the same seller net proceeds as the server writes', () => {
    for (const price of PRICES) {
      expect(sellerNet(price), `seller net diverged at ${price} JOD`).toBe(
        sellerNetFils(Math.round(price * 1000)) / 1000
      );
    }
  });

  it('keeps the two rates in step (both 5% — 10% total take)', () => {
    // If a rate changes on the server, the parity assertions above fail first;
    // this pins the documented business rule itself so a silent change to BOTH
    // still trips a review.
    expect(BUYER_PREMIUM_RATE).toBe(0.05);
    expect(SELLER_COMMISSION_RATE).toBe(0.05);
  });

  it("total due is always hammer + premium, and the buyer's premium is never negative", () => {
    for (const price of PRICES) {
      const fils = Math.round(price * 1000);
      expect(buyerPremiumJod(price)).toBeGreaterThanOrEqual(0);
      expect(totalDueJod(price)).toBe((fils + Math.round(fils * 0.05)) / 1000);
    }
  });

  it('takes exactly 10% of the hammer across the buyer and seller sides', () => {
    for (const price of PRICES) {
      const fils = Math.round(price * 1000);
      const buyerPays = Math.round(totalDueJod(price) * 1000);
      const sellerGets = sellerNetFils(fils);
      // Two INDEPENDENT 5% legs, each rounded to whole fils, so the take can
      // sit up to 1 fil off exactly 10% (e.g. 7.35 JOD: both legs round 367.5
      // up to 368). Anything beyond 1 fil means a rate or formula drifted.
      expect(Math.abs(buyerPays - sellerGets - fils * 0.1)).toBeLessThanOrEqual(1);
    }
  });
});
