// Wave 1 S3 — canonical subscription tier table tests.
// The table in functions/subscriptionTiers.js is the SINGLE source of truth
// for price -> { tier, durationDays }. Any drift here is a money bug.
import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_TIERS,
  LEGACY_TIERS,
  resolveTierByPrice,
  resolveLegacyPlan,
  resolveGrantForRequest,
} from './subscriptionTiers.js';

describe('SUBSCRIPTION_TIERS canonical table', () => {
  it('offers exactly monthly(1 JD/30d), semiannual(4 JD/180d), annual(7 JD/365d)', () => {
    expect(Object.keys(SUBSCRIPTION_TIERS).sort()).toEqual(['annual', 'monthly', 'semiannual']);
    expect(SUBSCRIPTION_TIERS.monthly).toEqual({ price: 1, durationDays: 30 });
    expect(SUBSCRIPTION_TIERS.semiannual).toEqual({ price: 4, durationDays: 180 });
    expect(SUBSCRIPTION_TIERS.annual).toEqual({ price: 7, durationDays: 365 });
  });

  it('keeps quarterly as LEGACY only (accepted, never offered)', () => {
    expect(SUBSCRIPTION_TIERS.quarterly).toBeUndefined();
    expect(LEGACY_TIERS.quarterly).toEqual({ durationDays: 90 });
  });
});

describe('resolveTierByPrice', () => {
  it('maps 1 -> monthly/30', () => {
    expect(resolveTierByPrice(1)).toEqual({ tier: 'monthly', durationDays: 30 });
  });

  it('maps 4 -> semiannual/180', () => {
    expect(resolveTierByPrice(4)).toEqual({ tier: 'semiannual', durationDays: 180 });
  });

  it('maps 7 -> annual/365', () => {
    expect(resolveTierByPrice(7)).toEqual({ tier: 'annual', durationDays: 365 });
  });

  it('rejects unknown prices (incl. the old ||15 fallback)', () => {
    expect(resolveTierByPrice(15)).toBeNull();
    expect(resolveTierByPrice(2)).toBeNull();
    expect(resolveTierByPrice(0)).toBeNull();
    expect(resolveTierByPrice(-1)).toBeNull();
    expect(resolveTierByPrice(365)).toBeNull();
  });

  it('rejects non-number prices (no string coercion into a grant)', () => {
    expect(resolveTierByPrice('7')).toBeNull();
    expect(resolveTierByPrice(null)).toBeNull();
    expect(resolveTierByPrice(undefined)).toBeNull();
    expect(resolveTierByPrice(NaN)).toBeNull();
    expect(resolveTierByPrice({ price: 7 })).toBeNull();
  });
});

describe('resolveLegacyPlan', () => {
  it('maps the legacy quarterly label to 90 days', () => {
    expect(resolveLegacyPlan('quarterly')).toEqual({ tier: 'quarterly', durationDays: 90 });
  });

  it('maps offered labels to their canonical tiers', () => {
    expect(resolveLegacyPlan('monthly')).toEqual({ tier: 'monthly', durationDays: 30 });
    expect(resolveLegacyPlan('semiannual')).toEqual({ tier: 'semiannual', durationDays: 180 });
    expect(resolveLegacyPlan('annual')).toEqual({ tier: 'annual', durationDays: 365 });
  });

  it("maps the legacy 'yearly' alias to annual", () => {
    expect(resolveLegacyPlan('yearly')).toEqual({ tier: 'annual', durationDays: 365 });
  });

  it('rejects unknown labels', () => {
    expect(resolveLegacyPlan('lifetime')).toBeNull();
    expect(resolveLegacyPlan('')).toBeNull();
    expect(resolveLegacyPlan(null)).toBeNull();
    expect(resolveLegacyPlan(42)).toBeNull();
  });
});

describe('resolveGrantForRequest (approval-time recompute)', () => {
  it('resolves a consistent new-format request from its price (tier agrees)', () => {
    expect(resolveGrantForRequest({ tier: 'semiannual', price: 4, durationDays: 180 }))
      .toEqual({ tier: 'semiannual', durationDays: 180 });
    expect(resolveGrantForRequest({ tier: 'monthly', price: 1 }))
      .toEqual({ tier: 'monthly', durationDays: 30 });
  });

  it('THROWS on a tier/price mismatch — the forged {price:1, tier:annual} request', () => {
    expect(() => resolveGrantForRequest({ price: 1, tier: 'annual' })).toThrow(/mismatch/i);
    expect(() => resolveGrantForRequest({ price: 4, tier: 'annual' })).toThrow(/mismatch/i);
    expect(() => resolveGrantForRequest({ price: 7, tier: 'monthly' })).toThrow(/mismatch/i);
    expect(() => resolveGrantForRequest({ price: 1, tier: 'quarterly' })).toThrow(/mismatch/i);
  });

  it('anchors on price when present: a tampered durationDays never grants', () => {
    expect(resolveGrantForRequest({ price: 1, tier: 'monthly', durationDays: 365 }))
      .toEqual({ tier: 'monthly', durationDays: 30 });
  });

  it('resolves from price alone (no tier stored)', () => {
    expect(resolveGrantForRequest({ price: 4 }))
      .toEqual({ tier: 'semiannual', durationDays: 180 });
  });

  it('RECOMPUTES duration from the tier on price-less docs, ignoring a tampered durationDays field', () => {
    expect(resolveGrantForRequest({ tier: 'monthly', durationDays: 365 }))
      .toEqual({ tier: 'monthly', durationDays: 30 });
  });

  it('accepts a stored legacy quarterly tier (no price)', () => {
    expect(resolveGrantForRequest({ tier: 'quarterly' }))
      .toEqual({ tier: 'quarterly', durationDays: 90 });
  });

  it('falls back to price for old requests without a tier', () => {
    expect(resolveGrantForRequest({ price: 7, plan: 'annual' }))
      .toEqual({ tier: 'annual', durationDays: 365 });
  });

  it('NEVER trusts the plan label over the price (the 1 JD -> annual exploit)', () => {
    expect(resolveGrantForRequest({ price: 1, plan: 'annual' }))
      .toEqual({ tier: 'monthly', durationDays: 30 });
  });

  it('maps the legacy plan label only when price is missing', () => {
    expect(resolveGrantForRequest({ plan: 'quarterly' }))
      .toEqual({ tier: 'quarterly', durationDays: 90 });
    expect(resolveGrantForRequest({ plan: 'yearly' }))
      .toEqual({ tier: 'annual', durationDays: 365 });
    expect(resolveGrantForRequest({ plan: 'annual' }))
      .toEqual({ tier: 'annual', durationDays: 365 });
  });

  it('throws on a present-but-unknown price (e.g. the old 15 fallback)', () => {
    expect(() => resolveGrantForRequest({ price: 15, plan: 'monthly' })).toThrow(/price/i);
  });

  it('throws on an unknown stored tier', () => {
    expect(() => resolveGrantForRequest({ tier: 'lifetime' })).toThrow(/tier/i);
  });

  it('throws when nothing resolvable is present', () => {
    expect(() => resolveGrantForRequest({})).toThrow();
    expect(() => resolveGrantForRequest({ plan: 'gold' })).toThrow();
  });
});
