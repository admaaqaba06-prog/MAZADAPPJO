/**
 * Wave 1 S3 — Canonical subscription tier table (SINGLE SOURCE OF TRUTH).
 *
 * The PRICE is the anchor: the admin verifies the CliQ transfer proof against
 * the amount, so every grant duration must be derived from the verified amount
 * (or a server-derived tier), NEVER from a client-supplied plan label.
 *
 * | price (JD) | tier         | durationDays |
 * |-----------:|--------------|-------------:|
 * | 1          | monthly      | 30           |
 * | 4          | semiannual   | 180          |
 * | 7          | annual       | 365          |
 * | (legacy)   | quarterly    | 90           |  <- accepted for old pending requests, never offered
 *
 * A display-only mirror lives at src/constants/subscriptionTiers.ts — if this
 * table changes, update the mirror. Rules lock the user grant fields to the
 * Admin SDK, so the mirror can never grant anything.
 */
'use strict';

const SUBSCRIPTION_TIERS = Object.freeze({
  monthly: Object.freeze({ price: 1, durationDays: 30 }),
  semiannual: Object.freeze({ price: 4, durationDays: 180 }),
  annual: Object.freeze({ price: 7, durationDays: 365 }),
});

// Legacy tiers: honored when found on an old request, never purchasable.
const LEGACY_TIERS = Object.freeze({
  quarterly: Object.freeze({ durationDays: 90 }),
});

// Legacy plan-label aliases (old client sent free-text labels).
const LEGACY_PLAN_ALIASES = Object.freeze({
  yearly: 'annual',
});

/**
 * price -> { tier, durationDays } for OFFERED tiers only.
 * Strict number match (no string coercion — a coerced grant is a money bug).
 * Returns null for anything not in the table.
 */
function resolveTierByPrice(price) {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  for (const [tier, def] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (def.price === price) return { tier, durationDays: def.durationDays };
  }
  return null;
}

/**
 * Legacy plan label -> { tier, durationDays }. Accepts offered tier ids,
 * the legacy 'quarterly', and known aliases ('yearly' -> annual).
 * Returns null for anything unknown.
 */
function resolveLegacyPlan(plan) {
  if (typeof plan !== 'string' || plan === '') return null;
  const normalized = LEGACY_PLAN_ALIASES[plan.toLowerCase().trim()] || plan.toLowerCase().trim();
  if (SUBSCRIPTION_TIERS[normalized]) {
    return { tier: normalized, durationDays: SUBSCRIPTION_TIERS[normalized].durationDays };
  }
  if (LEGACY_TIERS[normalized]) {
    return { tier: normalized, durationDays: LEGACY_TIERS[normalized].durationDays };
  }
  return null;
}

/**
 * Approval-time recompute for a subscriptionRequests doc -> { tier, durationDays }.
 *
 * Resolution order — THE PRICE IS THE ANCHOR (the admin verifies the CliQ
 * proof against the amount, and the amount is what the admin queue displays):
 *   1. `price` present: derive the tier from the price. A present-but-unknown
 *      price throws (e.g. the old `price || 15` fallback): admin must resolve
 *      manually. If a stored `tier` is ALSO present and disagrees with the
 *      price-derived tier, THROW — a mismatch means a forged/corrupt request
 *      (e.g. a direct-created doc with { price: 1, tier: 'annual' } trying to
 *      turn a genuine 1 JD proof into a 365-day grant). Never trust `tier`
 *      over the amount.
 *   2. `price` absent (true legacy docs only): fall back to the stored
 *      canonical `tier` — duration is RECOMPUTED from the table, never read
 *      from the doc.
 *   3. Legacy `plan` label — ONLY when both price and tier are missing.
 *
 * Throws Error with .code = 'failed-precondition' when unresolvable.
 */
function resolveGrantForRequest(reqData) {
  const data = reqData || {};

  if (data.price !== undefined && data.price !== null) {
    const byPrice = resolveTierByPrice(data.price);
    if (!byPrice) {
      throw makeResolutionError(
        `Unresolvable subscription price ${JSON.stringify(data.price)} on request — not a valid tier amount (1, 4 or 7 JD).`
      );
    }
    if (typeof data.tier === 'string' && data.tier !== '' && data.tier !== byPrice.tier) {
      throw makeResolutionError(
        `Tier/price mismatch on request: stored tier "${data.tier}" does not match the tier for price ` +
        `${JSON.stringify(data.price)} ("${byPrice.tier}"). Possible forged request — do not approve.`
      );
    }
    return byPrice;
  }

  if (typeof data.tier === 'string' && data.tier !== '') {
    const byTier =
      (SUBSCRIPTION_TIERS[data.tier] && { tier: data.tier, durationDays: SUBSCRIPTION_TIERS[data.tier].durationDays }) ||
      (LEGACY_TIERS[data.tier] && { tier: data.tier, durationDays: LEGACY_TIERS[data.tier].durationDays });
    if (byTier) return byTier;
    throw makeResolutionError(`Unknown subscription tier "${data.tier}" on request.`);
  }

  if (data.plan !== undefined && data.plan !== null && data.plan !== '') {
    const byPlan = resolveLegacyPlan(data.plan);
    if (byPlan) return byPlan;
    throw makeResolutionError(`Unknown legacy plan label "${data.plan}" on request without a price.`);
  }

  throw makeResolutionError('Subscription request has no tier, price or plan to derive a grant from.');
}

function makeResolutionError(message) {
  const err = new Error(message);
  err.code = 'failed-precondition';
  return err;
}

module.exports = {
  SUBSCRIPTION_TIERS,
  LEGACY_TIERS,
  resolveTierByPrice,
  resolveLegacyPlan,
  resolveGrantForRequest,
};
