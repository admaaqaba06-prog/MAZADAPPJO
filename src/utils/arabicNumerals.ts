/**
 * One decision, one place: which digits an Arabic UI string renders.
 *
 * The drop builder shipped a mix. `MoreSettingsDrawer` hardcoded `'٢٤'` for the
 * payment window while the duration and the anti-snipe window on the SAME
 * summary line interpolated Western digits, so a default form read
 * "… مهلة الدفع ٢٤ ساعة · حماية من القنص 30 ثانية …". `MediaPicker` interpolated
 * a Western `3` where the markup it replaced had `٣`. `dropProgress` used
 * Western throughout. Three files, three answers.
 *
 * The choice here is WESTERN digits, in both languages:
 *
 *  - `utils/formatMoney.ts` already made exactly this call for every money
 *    string in the app ("Western digits everywhere, including in Arabic,
 *    because every money screen already renders Western digits"). Two competing
 *    digit policies in one product is the same bug one level up.
 *  - These numbers sit on screen beside money (`formatMoney`) and clock values
 *    (`formatAmmanClock`), both Western. Arabic-Indic here would mix the
 *    builder's lines rather than un-mix them.
 *  - `utils/dropProgress.ts`'s Arabic labels, and the tests pinning them, are
 *    already Western. Choosing Western makes the majority behaviour deliberate
 *    instead of accidental.
 *
 * The policy is a named constant rather than an assumption baked into the
 * formatter's body: flipping `ARABIC_UI_DIGITS` to `'arabic-indic'` switches
 * every call site at once, which is the entire point of routing them through
 * here. (`utils/deliveryAddress.ts` has its own digit mapper — that one is an
 * INPUT normaliser for phone/address parsing and stays where it is; this module
 * is about display.)
 */

export type DigitStyle = 'western' | 'arabic-indic';

/** The app-wide answer for Arabic UI strings. Change here, changes everywhere. */
export const ARABIC_UI_DIGITS: DigitStyle = 'western';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Arabic-Indic (٠-٩) and Eastern Arabic/Persian (۰-۹) digits → Western 0-9.
 * Anything that is not a digit is returned untouched, so this is safe to run
 * over a whole sentence.
 */
export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

/** Western 0-9 → Arabic-Indic ٠-٩. Non-digits are returned untouched. */
export function toArabicIndicDigits(input: string): string {
  return input.replace(/[0-9]/g, (ch) => ARABIC_INDIC_DIGITS[Number(ch)]);
}

/**
 * Render a number for interpolation into a user-visible string.
 *
 * Deliberately NOT a money formatter: no thousands grouping and no currency
 * label, because `formatMoney` owns those and a second grouping rule would
 * reintroduce the drift this module exists to remove. Counts, minutes, hours,
 * seconds and percentages only.
 *
 * A non-finite number renders as "0" rather than "NaN"/"Infinity" — the same
 * rule `dropProgress.percent` already applies, on the grounds that a button
 * reading "Uploading video… NaN%" reads as a crash. String input is normalised
 * to Western first, so a legacy Arabic-Indic literal passed in still lands on
 * whichever style the policy selects.
 */
export function formatNumeral(value: number | string, isAr: boolean): string {
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '0') : value;
  const western = toWesternDigits(raw);
  if (!isAr || ARABIC_UI_DIGITS === 'western') return western;
  return toArabicIndicDigits(western);
}
