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
/**
 * Updated 2026-09-28: 'MAZZADO' -> 'MAZZADO26', together with the move to Bank
 * al Etihad below. Confirmed by the account owner as the registered, live
 * destination — the file's rule (bank first, confirm, then edit) was followed.
 *
 * NOT the same thing as the embedded-CliQ gateway alias. BAE requires the
 * gateway to use a DIFFERENT alias so gateway payments (which fire webhooks)
 * stay distinguishable from manual transfers sent straight here; that one lives
 * in Firebase secrets and never enters this repo. See constants/cliqGateway.ts.
 */
export const CLIQ_ALIAS = 'MAZZADO26';

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
/**
 * Updated 2026-09-04 to the bank's OFFICIAL name. It was 'Al Ahli Bank', which
 * is not what the bank calls itself and is one word away from several other
 * Jordanian banks — on a screen whose only job is telling someone where to send
 * money, an approximate bank name is a defect.
 *
 * This is a NAMING correction, not an account move: the account is the same one
 * confirmed on 2026-08-26. The destination itself is CLIQ_ALIAS, untouched.
 */
/**
 * Updated 2026-09-28: Jordan Ahli Bank -> Bank al Etihad. This is an ACCOUNT
 * MOVE, confirmed by the account owner, not a naming correction.
 *
 * The English name is the one Bank al Etihad is listed under in the official
 * code list Staq supplied (BankCodes.xlsx: "BANK ALETIHAD", code UBSIJOAX).
 */
export const CLIQ_BANK_NAME_AR = 'بنك الاتحاد';
export const CLIQ_BANK_NAME_EN = 'Bank al Etihad';

/**
 * The receiving IBAN — the fallback destination for anyone who would rather
 * transfer by IBAN than by the CliQ alias.
 *
 * Added 2026-09-04, and it now lives HERE for the same reason the bank name
 * does. Before this it was a bare literal inside OrderDetailsView, with a
 * SECOND copy inside a dead SubscriptionView handler, and both read
 * 'JO83 CAPS 1020 0085 4100 00' — bank code CAPS, Capital Bank of Jordan, which
 * matched neither the old Arab Bank account nor the Jordan Ahli Bank account
 * that replaced it. It could not have been a correct destination for either.
 *
 * Stored COMPACT (no spaces): that is the form a bank form accepts, and it is
 * what the copy button must put on the clipboard. Group it for display with
 * formatIban() — never re-type it by hand.
 *
 * Same non-negotiable rule as the names above: this follows the BANK RECORD.
 * An IBAN also encodes its own bank in characters 5-8, so it must agree with
 * CLIQ_BANK_NAME_* — brandBoundary.test.ts asserts that, and asserts the
 * mod-97 checksum, so a typo cannot reach a payment screen.
 */
/**
 * ⚠️ SUPPRESSED 2026-09-28 — awaiting the Bank al Etihad IBAN.
 *
 * It was 'JO82JONB9999000000001013478507'. JONB is Jordan Ahli Bank, and the
 * account has MOVED to Bank al Etihad, so that string is now a destination at a
 * bank we no longer hold the account with. It was being shown to customers as a
 * transfer target and offered on a copy button.
 *
 * Null until the real one arrives, and the UI hides the row entirely. Showing
 * NOTHING is strictly safer than showing a stale IBAN: a customer with no IBAN
 * uses the alias, which is correct and live; a customer with the old IBAN sends
 * money to an account we may no longer control. This is the same failure the
 * file's header describes from the 'mazadjom' era, and the reason the
 * bank-first rule exists.
 *
 * TO RESTORE: paste the Bank al Etihad IBAN for CLIQ_ALIAS here, taken from a
 * statement or a completed transfer — never re-typed from a message. It must
 * start JO, and characters 5-8 must be UBSI; brandBoundary.test.ts asserts both
 * that and the mod-97 checksum, so a typo cannot reach a payment screen.
 */
export const CLIQ_IBAN: string | null = null;

/** Group an IBAN in fours for reading. Display only — copy the raw value. */
export const formatIban = (iban: string) =>
  iban.replace(/(.{4})/g, '$1 ').trim();
