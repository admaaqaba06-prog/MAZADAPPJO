/**
 * Grammatically-correct "N reviews" label for the seller's rating summary.
 *
 * The old code always rendered the bare plural word ("1 reviews"), which reads
 * as broken. English needs singular at 1; Arabic has a richer count grammar:
 *   0      -> لا تقييمات        (none)
 *   1      -> تقييم واحد        (singular)
 *   2      -> تقييمان           (dual)
 *   3–10   -> N تقييمات         (small plural)
 *   11+    -> N تقييمًا          (accusative singular after 11)
 * This is a reasonable simplified Arabic plural — full ICU is overkill here.
 */
export function reviewCountLabel(count: number, lang: 'ar' | 'en'): string {
  const n = Math.max(0, Math.floor(count));

  if (lang === 'en') {
    if (n === 1) return '1 review';
    return `${n} reviews`;
  }

  // Arabic
  if (n === 0) return 'لا تقييمات';
  if (n === 1) return 'تقييم واحد';
  if (n === 2) return 'تقييمان';
  if (n <= 10) return `${n} تقييمات`;
  return `${n} تقييمًا`;
}
