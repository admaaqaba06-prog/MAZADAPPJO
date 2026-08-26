/**
 * Canonical CliQ recipient (receiving account name) — single source of truth
 * for every money surface that tells a user who to transfer to
 * (order payment, wallet top-up, membership subscription).
 *
 * Wave 4 groundwork: the NAME and ALIAS are centralized here. The CliQ IBAN
 * and the QR are deliberately deferred — do not add them without a spec.
 *
 * ⚠️ THESE FOLLOW THE BANK RECORD, NOT THE BRAND.
 *
 * Updated 2026-08-26, AFTER the registration changed and not before. The
 * account moved from Arab Bank to Al Ahli Bank and was re-registered as
 * MAZZADO; the previous alias 'mazadjom' was confirmed DEAD, which meant every
 * payment screen was handing customers a destination that no longer resolved —
 * subscriptions and post-win payments were going nowhere.
 *
 * THE ARABIC NAME IS LATIN ON PURPOSE. A CliQ alias is alphanumeric Latin, and
 * what the bank shows a payer when they enter it is the registered string. The
 * point of this field is to MATCH that exactly so the payer can verify it, so
 * an Arabic rendering — «مزادو» — would be a name the bank does not hold. If
 * the registration also carries a separate Arabic account name, put that here
 * instead; until then, matching the record beats translating it.
 *
 * Order of operations, unchanged and non-negotiable: change the registration at
 * the bank FIRST, confirm it on a real statement or transfer, THEN edit here. A
 * rebrand sweep that runs ahead of the bank is a payments incident.
 */
export const CLIQ_RECIPIENT_NAME_AR = 'MAZZADO';
export const CLIQ_RECIPIENT_NAME_EN = 'MAZZADO';

/**
 * CliQ alias — the PRIMARY transfer target. CliQ transfers in Jordan are
 * normally sent to an alias, not the IBAN (the IBAN stays as a fallback).
 *
 * Registered at the bank, so it is covered by the warning above: it is the
 * actual destination a transfer is addressed to, and renaming it here without
 * re-registering it there sends customers' money to an alias that no longer
 * resolves.
 */
export const CLIQ_ALIAS = 'MAZZADO';

/**
 * The bank holding the receiving account.
 *
 * Lives here, with the rest of the payment identity, because it was written
 * out by hand in SEVENTEEN places across seven files — the how-it-works copy,
 * the wallet lock note, the desktop payment line, translations.ts, the admin
 * console — with nothing tying them together. When the account MOVED from Arab
 * Bank to Al Ahli Bank (confirmed 2026-08-26) every one of those places became
 * a line telling a customer to look for their money at the wrong bank.
 *
 * Same rule as the names above: this follows the BANK RECORD, not the brand.
 */
export const CLIQ_BANK_NAME_AR = 'البنك الأهلي';
export const CLIQ_BANK_NAME_EN = 'Al Ahli Bank';
