/**
 * The runtime presets the drop builder offers, and the ONE place a duration in
 * seconds is turned into words.
 *
 * Two callers want different languages out of the same number, which is what
 * the view's old inline memo got wrong: it returned the Arabic label
 * unconditionally, so the English success panel header read
 * "Opens now · 30 دقيقة".
 *
 *   - the WhatsApp caption (utils/dropCaption.ts) is BUYER-facing and Arabic
 *     end to end, so it asks for Arabic explicitly regardless of the admin's
 *     UI language;
 *   - the success panel is ADMIN-facing, so it follows `isAr`.
 *
 * Passing the language in at the call site is what keeps those two apart. A
 * label baked into the preset list cannot be right for both.
 */
export interface DurationPreset {
  seconds: number;
  ar: string;
  en: string;
}

export const DURATION_PRESETS: DurationPreset[] = [
  { seconds: 600, ar: '10 دقيقة', en: '10 min' },
  { seconds: 900, ar: '15 دقيقة', en: '15 min' },
  { seconds: 1800, ar: '30 دقيقة', en: '30 min' },
];

/**
 * Label for a duration, in the language asked for.
 *
 * Off-preset seconds still get a label rather than a blank: a relist prefills
 * `durationSeconds` from a past lot, and nothing guarantees that lot was
 * created with one of today's three presets. The fallback is language-aware
 * too — an English admin relisting a 45-minute lot must not be shown Arabic
 * either.
 */
export function durationLabel(seconds: number, isAr: boolean): string {
  const preset = DURATION_PRESETS.find((d) => d.seconds === seconds);
  if (preset) return isAr ? preset.ar : preset.en;
  const minutes = Math.round(seconds / 60);
  return isAr ? `${minutes} دقيقة` : `${minutes} min`;
}
