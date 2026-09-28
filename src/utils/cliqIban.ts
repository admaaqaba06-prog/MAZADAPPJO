/**
 * Payer bank name, derived from the IBAN prefix BAE returns before a CliQ
 * request is submitted (BAE embedded-CliQ SCREEN 4).
 *
 * WHY THE SCREEN EXISTS. The same CliQ alias can be registered at more than one
 * bank, so "pay from your CliQ account" is ambiguous until the payer is told
 * WHICH bank the request will land at.
 *
 * THE FORMAT:
 *   JO  + 2 check digits + 4 bank letters + account
 *   ^^    ^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^
 *   |     NOT the bank      the bank
 *
 * ⚠️ A CORRECTION TO BAE'S OWN INSTRUCTION. Their onboarding email said the
 * codes are 8 characters and that "the last 4 chars are sufficient to match".
 * The data they then supplied (BankCodes.xlsx) says otherwise, and the data
 * wins:
 *
 *   BANK ALETIHAD      UBSIJOAX     and Staq's own sample IBAN is JO21UBSI…
 *   JORDAN AHLI BANK   JONBJOAX     and our previous IBAN was   JO82JONB…
 *
 * The four characters that appear in an IBAN are the FIRST four of the 8-char
 * code; the trailing JOAX / JOAM are the country and location halves of a BIC
 * and never appear in an IBAN. So this module matches on IBAN characters 5–8
 * against the first four characters of each supplied code. Matching on the last
 * four would resolve every Jordanian bank to one of two values.
 *
 * SOURCE OF TRUTH. The names and codes below are transcribed verbatim from
 * BankCodes.xlsx as supplied by Staq. Do not add an entry that is not in that
 * file — an unknown code falls back to neutral copy, which is correct. This
 * codebase has already shipped a wrong bank destination once (the CAPS IBAN
 * documented in constants/cliq.ts); guessing a bank name is the same defect.
 *
 * ARABIC NAMES are the institutions' own registered Arabic names, and are
 * OPTIONAL by design: where one is absent the English name is shown even in the
 * Arabic UI. That is deliberate — Jordanian banks display Latin names routinely,
 * and showing the name BAE actually supplied beats inventing a translation for
 * a screen whose whole job is helping someone identify their own bank.
 */

export interface BankName {
  /** Verbatim from BankCodes.xlsx. */
  en: string;
  /** The institution's own Arabic name, where it is unambiguous. */
  ar?: string;
}

/**
 * Keyed by the first 4 characters of BAE's 8-char code — the part that appears
 * in an IBAN. The full supplied code is in the comment beside each entry.
 */
export const bankCodeToName: Readonly<Record<string, BankName>> = {
  ALEY: { en: 'Al Alami Exchange Company' },                              // ALEYJOAM
  RJHI: { en: 'Al Rajhi Bank, Jordan Branch', ar: 'مصرف الراجحي — فرع الأردن' }, // RJHIJOAM
  ALEL: { en: 'Alawneh Exchange L.L.C' },                                 // ALELJOAM
  ARAB: { en: 'Arab Bank PLC', ar: 'البنك العربي' },                       // ARABJOAX
  ABCJ: { en: 'Arab Banking Corporation (Jordan)', ar: 'بنك المؤسسة العربية المصرفية' }, // ABCJJOAM
  AJIB: { en: 'Arab Jordan Investment Bank', ar: 'البنك العربي الأردني للاستثمار' },     // AJIBJOAX
  UBSI: { en: 'Bank al Etihad', ar: 'بنك الاتحاد' },                       // UBSIJOAX
  BJOR: { en: 'Bank of Jordan PLC', ar: 'بنك الأردن' },                    // BJORJOAX
  BLOM: { en: 'Blom Bank S.A.L.', ar: 'بنك بلوم' },                        // BLOMJOAM
  CAAB: { en: 'Cairo Amman Bank', ar: 'بنك القاهرة عمان' },                // CAABJOAM
  EFBK: { en: 'Capital Bank of Jordan', ar: 'كابيتال بنك' },               // EFBKJOAM
  CBJO: { en: 'Central Bank of Jordan', ar: 'البنك المركزي الأردني' },      // CBJOJOAX
  CITI: { en: 'Citibank N.A.' },                                          // CITIJOAX
  ARLB: { en: 'Egyptian Arab Land Bank', ar: 'البنك العقاري المصري العربي' }, // ARLBJOAM
  HBHO: { en: 'The Housing Bank for Trade and Finance', ar: 'بنك الإسكان للتجارة والتمويل' }, // HBHOJOAX
  JIFB: { en: 'InvestBank', ar: 'بنك الاستثمار' },                         // JIFBJOAM
  IIBA: { en: 'Islamic International Arab Bank', ar: 'البنك العربي الإسلامي الدولي' },  // IIBAJOAM
  JONB: { en: 'Jordan Ahli Bank PLC', ar: 'البنك الأهلي الأردني' },         // JONBJOAX
  JGBA: { en: 'Jordan Commercial Bank', ar: 'البنك التجاري الأردني' },      // JGBAJOAM
  JIBA: { en: 'Jordan Islamic Bank', ar: 'البنك الإسلامي الأردني' },        // JIBAJOAM
  JKBA: { en: 'Jordan Kuwait Bank', ar: 'البنك الأردني الكويتي' },          // JKBAJOAM
  MAKS: { en: 'Kamal Exchange Co L.L.C' },                                // MAKSJOAX
  MUEO: { en: 'Musharbash Exchange L.L.C' },                              // MUEOJOAM
  RAFB: { en: 'Rafidain Bank', ar: 'مصرف الرافدين' },                      // RAFBJOAM
  JDIB: { en: 'Safwa Islamic Bank', ar: 'بنك صفوة الإسلامي' },             // JDIBJOAM
  SEDC: { en: 'Securities Depository Center' },                           // SEDCJOAX
  SCBL: { en: 'Standard Chartered Bank' },                                // SCBLJOAX

  // Wallets. BAE: "code starts with the bank identifier letters, then a mix of
  // letters/numbers" — these are supplied as 4 characters already.
  ZAIN: { en: 'Zain Cash', ar: 'زين كاش' },
  ORNG: { en: 'Orange Money', ar: 'أورنج موني' },
  UWLT: { en: 'UWallet', ar: 'يو واليت' },
  AYAP: { en: 'Aya Pay', ar: 'آيا باي' },
  DNRK: { en: 'Dinarak', ar: 'دينارك' },
  GDHA: { en: 'Gadha' },
  MDFT: { en: 'Mad Pay / Madfooatcom' },
  MEPS: { en: 'MEPS National Wallet' },
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
 * blocks, never guesses. Falls back to the English name when no Arabic name is
 * recorded, rather than showing nothing.
 */
export function getBankNameFromIban(ibanPrefix: unknown, isAr: boolean): string {
  const code = bankCodeFromIban(ibanPrefix);
  const entry = code ? bankCodeToName[code] : undefined;
  if (!entry) return isAr ? UNKNOWN_BANK_AR : UNKNOWN_BANK_EN;
  if (!isAr) return entry.en;
  return entry.ar ?? entry.en;
}

/** True when we can name the bank — lets the UI choose confident vs neutral copy. */
export function isKnownBank(ibanPrefix: unknown): boolean {
  const code = bankCodeFromIban(ibanPrefix);
  return !!code && !!bankCodeToName[code];
}
