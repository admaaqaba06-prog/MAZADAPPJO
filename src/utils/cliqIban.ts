/**
 * Payer bank name, derived from the IBAN prefix BAE returns before a CliQ
 * request is submitted (BAE embedded-CliQ SCREEN 4).
 *
 * WHY THE SCREEN EXISTS. The same CliQ alias can be registered at more than one
 * bank, so "pay from your CliQ account" is ambiguous until the payer is told
 * WHICH bank the request will land at. BAE asked for the bank name on the
 * confirmation screen for exactly that reason.
 *
 * THE FORMAT, per BAE:
 *   JO  + 2 check digits + 4 bank letters + account
 *   ^^    ^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^
 *   |     NOT the bank      the bank
 * BAE distributes an 8-char code per bank; the last 4 characters are what
 * identifies it, which is why this module matches on characters 5-8 only.
 *
 * ⚠️ THE FULL BANK LIST IS NOT IN THIS REPO. BAE attached it to the onboarding
 * thread. The two entries below are the only ones established as FACT:
 *   - UBSI — given by BAE itself as the worked example (JO20UBSI).
 *   - JONB — the bank code inside our own receiving IBAN (constants/cliq.ts),
 *            which brandBoundary.test.ts already pins to 'Jordan Ahli Bank'.
 * Everything else must come from BAE's list. Guessing a bank name on a payment
 * screen is the same class of defect as the wrong IBAN this codebase already
 * shipped once — an unknown code falls back to neutral copy instead.
 */

/** TODO: BAE CliQ API — fill from the official bank code list BAE attached. */
export const bankCodeToName: Readonly<Record<string, { ar: string; en: string }>> = {
  UBSI: { ar: 'بنك الاتحاد', en: 'Bank al Etihad' },
  JONB: { ar: 'البنك الأهلي الأردني', en: 'Jordan Ahli Bank' },
};

/** Shown when the code is absent from the list. Must NOT block payment. */
export const UNKNOWN_BANK_AR = 'البنك المرتبط بحسابك';
export const UNKNOWN_BANK_EN = 'your linked bank';

/**
 * The 4 letters that identify the bank, or null when the input cannot contain
 * them. Tolerates the spacing banks put in displayed IBANs and lower case;
 * rejects anything that is not a Jordanian IBAN shape, because a silent
 * substring of a malformed value would map to a confident wrong bank.
 */
export function bankCodeFromIban(ibanPrefix: unknown): string | null {
  if (typeof ibanPrefix !== 'string') return null;
  const compact = ibanPrefix.replace(/[\s-]/g, '').toUpperCase();
  // JO + 2 digits + at least 4 letters.
  const m = /^JO\d{2}([A-Z]{4})/.exec(compact);
  return m ? m[1] : null;
}

/**
 * Bank name for SCREEN 4. Falls back to neutral copy — never throws, never
 * blocks, never guesses.
 */
export function getBankNameFromIban(ibanPrefix: unknown, isAr: boolean): string {
  const code = bankCodeFromIban(ibanPrefix);
  const entry = code ? bankCodeToName[code] : undefined;
  if (!entry) return isAr ? UNKNOWN_BANK_AR : UNKNOWN_BANK_EN;
  return isAr ? entry.ar : entry.en;
}

/** True when we can name the bank — lets the UI choose confident vs neutral copy. */
export function isKnownBank(ibanPrefix: unknown): boolean {
  const code = bankCodeFromIban(ibanPrefix);
  return !!code && !!bankCodeToName[code];
}
