/**
 * Embedded CliQ gateway — OPS CONFIG. Nothing here is user-facing.
 *
 * ⚠️ READ THIS BEFORE TOUCHING constants/cliq.ts.
 *
 * Mazzado now has TWO CliQ destinations, and they must not be merged:
 *
 *   constants/cliq.ts  CLIQ_ALIAS = 'MAZZADO'
 *     The MANUAL transfer target. A buyer opens their own banking app and
 *     sends money to it, then uploads a screenshot. Shown on screen. Already
 *     registered at Jordan Ahli Bank. DO NOT RENAME IT — the file's own rule
 *     is bank-record-first, and a rename ahead of the bank sends customers'
 *     money to an alias that no longer resolves.
 *
 *   GATEWAY_ALIAS below
 *     The EMBEDDED target. Bank al Etihad raises the request against it and
 *     calls our webhook. Never shown to a payer.
 *
 * WHY THEY MUST DIFFER. BAE's onboarding note is explicit: the gateway alias
 * must NOT be the business name, because payments arriving through the gateway
 * (which fire webhooks) have to be distinguishable from manual transfers people
 * send straight to the public alias. If both were 'MAZZADO', every manual
 * transfer would look like a gateway payment that lost its webhook, and
 * reconciliation would be guesswork on live money.
 *
 * TODO: BAE CliQ API — register the technical alias with BAE (their example
 * shape is `MAZZADO123`), then set it in Firebase secrets and read it there.
 * It is intentionally NOT a literal in this file: it is account identity, it
 * belongs with the certificate and the keys, and this repo is public to
 * everyone who can clone it.
 *
 * WHERE THE SECRETS LIVE. Firebase secrets only — never functions:config,
 * never a .env, never this repo:
 *   - CLIQ_GATEWAY_ALIAS      the technical alias above
 *   - CLIQ_GATEWAY_CERT       the signed client certificate BAE issued
 *   - CLIQ_GATEWAY_KEY        its private key
 *   - CLIQ_WEBHOOK_SECRET     what we verify inbound webhooks against
 * The certificate BAE emailed (signedCert__680.crt) must not be committed;
 * .gitignore has a rule for it.
 *
 * (Optional, per BAE) link a separate bank account to the gateway alias so
 * reconciliation is a statement filter rather than a join.
 */

/** Documented for ops; resolved server-side from secrets, never bundled. */
export const GATEWAY_ALIAS_SECRET_NAME = 'CLIQ_GATEWAY_ALIAS';

/**
 * BAE: "Payments are usually processed in real time. However, in some cases,
 * processing may take up to 2 hours." The payer must acknowledge this before
 * the request is submitted (SCREEN 5), so the number lives here rather than
 * inside the copy — if BAE revises it, the disclaimer and any support macro
 * move together.
 */
export const CLIQ_PROCESSING_MAX_HOURS = 2;

/**
 * Arabic hours, with the dual.
 *
 * Interpolating the number straight into the disclaimer produced «حتى 2
 * ساعتين» — "up to 2 two-hours" — because ساعتين is already the dual and
 * carries the 2 inside it. Arabic counts in four shapes, so a number and a
 * noun cannot simply be concatenated the way English allows:
 *   1      ساعة       (no numeral)
 *   2      ساعتان     (the dual, no numeral)
 *   3–10   N ساعات    (plural)
 *   11+    N ساعة     (singular after the numeral)
 *
 * Kept next to the constant so a change to CLIQ_PROCESSING_MAX_HOURS updates
 * the sentence rather than breaking it.
 */
export function arabicHours(n: number): string {
  if (n === 1) return 'ساعة';
  if (n === 2) return 'ساعتين';
  if (n >= 3 && n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}
