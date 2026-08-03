/**
 * Display-time cleanup for a lot's title.
 *
 * Titles reach the database by paste, mostly out of a WhatsApp drop template,
 * and they arrive carrying the template's decoration. Real examples from the
 * production collection:
 *
 *   📺 * شاشة *Skyworth 43 بوصة QLED 2K Google TV*
 *   ⌚  *Apple Watch Ultra* – مستعملة
 *   اسم المنتج:* ميكروويف منزلي رقمي عملاق
 *   سم المنتج:* مكيف *General Plus DC Inverter* – *2
 *
 * The asterisks are WhatsApp bold markers, the leading pictograph is a
 * decoration for the broadcast post, and "اسم المنتج:" is the template's own
 * FIELD LABEL — sometimes clipped at the front, because the paste was truncated
 * before the label was.
 *
 * This runs at RENDER time and never rewrites the stored value: the title is
 * the seller's own words, an admin may still need to see exactly what was
 * submitted, and a display rule can be changed without a migration.
 *
 * Conservative by design — it removes decoration only. Model numbers,
 * parentheses, slashes and dashes all survive, because a buyer searching for
 * "MC-CG713" needs them. And if cleaning would empty the title, the original is
 * returned: a lot named with three fire emoji still has no better name.
 */

/** WhatsApp bold/italic markers. Never meaningful in a product name. */
const MARKERS = /[*_~]/g;

/**
 * The drop template's field label, including the front-clipped variants that
 * are actually in the data ("سم المنتج:", "م المنتج:"). Anchored to the start —
 * the same words mid-title would be part of a real sentence.
 */
const LEADING_LABEL = /^\s*[اسم]*\s*المنتج\s*:/;

/** A leading run of pictographs, dingbats and the spaces between them. */
const LEADING_DECORATION = /^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]+/u;

export function cleanTitle(raw: string | null | undefined): string {
  const original = String(raw ?? '');
  if (!original.trim()) return '';

  // A title made only of bold markers is decoration end to end and has nothing
  // to fall back TO — unlike an emoji-only title, which is at least a name a
  // human chose. So the fallback is measured against the marker-stripped
  // string, not the raw original.
  const withoutMarkers = original.replace(MARKERS, '').trim();
  if (!withoutMarkers) return '';

  // Label first, then decoration: "📺 * اسم المنتج: x" leads with the emoji,
  // while "اسم المنتج:* 📺 x" leads with the label. Running both, twice, in
  // that order handles either arrangement without a loop.
  let out = withoutMarkers.replace(LEADING_DECORATION, '');
  out = out.replace(LEADING_LABEL, '');
  out = out.replace(LEADING_DECORATION, '');

  out = out.replace(/\s+/g, ' ').trim();

  // Cleaning must never destroy the only name a lot has.
  return out || withoutMarkers.replace(/\s+/g, ' ');
}
