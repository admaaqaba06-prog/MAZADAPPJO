/**
 * Single money formatter for the app.
 *
 * Two decisions, one place:
 *  1. Digit style — Western digits everywhere (en-US grouping), including in
 *     Arabic. Every money screen already renders Western digits, so this keeps
 *     price displays consistent instead of mixing Western/Arabic-Indic numerals.
 *  2. Currency label — ONE canonical label per language: "JOD" (en) / "د.أ" (ar).
 *     This replaces the earlier JOD / JD / دينار / د.أ free-for-all.
 *
 * Fractional fils are preserved (up to 3 dp) but never padded with trailing zeros.
 */
export function formatMoney(jod: number, lang: 'ar' | 'en'): string {
  const value = Number.isFinite(jod) ? jod : 0;
  const digits = value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  const label = lang === 'ar' ? 'د.أ' : 'JOD';
  return `${digits} ${label}`;
}
