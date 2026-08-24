/**
 * Copy for the sign-in marketing panel.
 *
 * Kept out of `src/landing/translations.ts` deliberately: that file belongs to
 * the landing page, already runs to hundreds of lines per language, and this is
 * a different surface with a different lifecycle.
 *
 * EVERY CLAIM BELOW IS CONDENSED FROM AN EXISTING, ALREADY-APPROVED PRODUCT
 * STATEMENT. Nothing here is new marketing. A sign-in screen is the first thing
 * a cold visitor reads and therefore the easiest place to promise something the
 * product does not do — `signInPanelCopy.test.ts` asserts the absence of the
 * specific claims Mazzado makes nowhere else (free shipping, guarantees,
 * refunds, delivery windows, "no fees" — there IS a 5% buyer commission).
 */
export interface PanelCopy {
  /** Takes the REAL live count; never hardcode a number here. */
  activityLabel: (count: number) => string;
  trustTitle: string;
  trustBody: string;
  howTitle: string;
  steps: [string, string, string];
}

const EN: PanelCopy = {
  // Western digits in both languages, per the ARABIC_UI_DIGITS house convention.
  activityLabel: (n) => `${n} lots live right now`,
  trustTitle: 'Buy safely from anyone',
  // Condensed from translations.ts:551. Do not strengthen this claim: the money
  // is held and released on the buyer's confirmation — that is the whole promise.
  trustBody:
    'Mazad holds your payment until you receive the item and confirm it matches. Only then is the seller paid.',
  howTitle: 'How it works',
  steps: [
    'Watch a live auction',
    'Place your bid',
    'Pay by CliQ — the item ships to you',
  ],
};

const AR: PanelCopy = {
  activityLabel: (n) => `${n} قطعة معروضة الآن`,
  trustTitle: 'اشترِ بأمان من أي بائع',
  // Condensed from translations.ts:309.
  trustBody:
    'مزادو يحتفظ بمبلغك حتى تستلم القطعة وتتأكد أنها مطابقة، وعندها فقط يُحوَّل للبائع.',
  howTitle: 'كيف تعمل المنصة',
  steps: [
    'تابع مزاداً مباشراً',
    'قدّم مزايدتك',
    'ادفع عبر كليك — وتصلك القطعة',
  ],
};

/**
 * Unknown languages fall back to Arabic — the same rule as `resolveLang` in
 * `functions/messageCopy.js` and `copyFor`. Nobody is shown a language they
 * cannot read by accident, and it matches the market.
 */
export function panelCopy(lang: 'ar' | 'en'): PanelCopy {
  return lang === 'en' ? EN : AR;
}
