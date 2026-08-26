/**
 * Canonical CliQ recipient (receiving account name) — single source of truth
 * for every money surface that tells a user who to transfer to
 * (order payment, wallet top-up, membership subscription).
 *
 * Wave 4 groundwork: the NAME and ALIAS are centralized here. The CliQ IBAN
 * and the QR are deliberately deferred — do not add them without a spec.
 *
 * ⚠️ THESE THREE VALUES DO NOT FOLLOW THE BRAND, AND THAT IS DELIBERATE.
 *
 * The product renamed to MAZZADO / مزادو; these still say Mazad JO. They are not
 * brand strings — they are what the BANK has on the receiving account, and a
 * customer copies them into a transfer. If they stop matching the bank record,
 * the money leaves against a name the bank does not recognise on that account.
 * The Arabic name is worded differently again («مؤسسة مزاد الأردن م», not a
 * translation of the English), which is the clearest sign these came from a bank
 * registration form rather than from the brand.
 *
 * Order of operations: change the registration at the bank FIRST, confirm the
 * new values on a real statement, THEN edit them here. A rebrand sweep that
 * "fixes" them ahead of the bank is a payments incident, not a copy update.
 */
export const CLIQ_RECIPIENT_NAME_AR = 'مؤسسة مزاد الأردن م';
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
export const CLIQ_ALIAS = 'mazadjom';

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
