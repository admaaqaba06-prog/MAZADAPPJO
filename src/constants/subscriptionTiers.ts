/**
 * DISPLAY-ONLY mirror of the canonical subscription tier table.
 *
 * The AUTHORITATIVE copy lives in functions/subscriptionTiers.js — the server
 * derives every grant (tier + duration) from the verified price there, and
 * Firestore rules block ALL client writes to the user subscription-grant
 * fields. Nothing imported from this file can grant anything; it only keeps
 * the pricing UI in sync. If the server table changes, update this mirror.
 *
 * | price (JD) | tier       | durationDays |
 * |-----------:|------------|-------------:|
 * | 1          | monthly    | 30           |
 * | 4          | semiannual | 180          |
 * | 7          | annual     | 365          |
 */
export const SUBSCRIPTION_TIERS = {
  monthly: { price: 1, durationDays: 30 },
  semiannual: { price: 4, durationDays: 180 },
  annual: { price: 7, durationDays: 365 },
} as const;

export type SubscriptionTierId = keyof typeof SUBSCRIPTION_TIERS;
