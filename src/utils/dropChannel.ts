export type DropChannel = 'phones' | 'cars' | 'misc';

export const DROP_CHANNELS: ReadonlyArray<{ value: DropChannel; en: string; ar: string }> = [
  { value: 'phones', en: 'Mazad — Phones', ar: 'مزاد — هواتف' },
  { value: 'cars', en: 'Mazad — Cars', ar: 'مزاد — سيارات' },
  { value: 'misc', en: 'Mazad — Misc', ar: 'مزاد — منوعات' },
];

export function channelLabel(value: DropChannel, lang: 'en' | 'ar'): string {
  const found = DROP_CHANNELS.find((c) => c.value === value);
  if (!found) return value;
  return lang === 'ar' ? found.ar : found.en;
}

// `channelToCategory` lived here and is gone. It mapped these three channels
// onto three category values and sent everything else to 'Fashion', which is
// how a television ended up in the catch-all bucket — and, through
// createListing's keyword fallback, wearing a stock photo of a shoe.
//
// The channel is still a real concept: it routes a drop to its WhatsApp
// audience. It just no longer doubles as the buyer-facing category, which is
// now picked explicitly from `utils/categories.ts`.

/**
 * Category → WhatsApp routing channel. The DIRECTION matters: deriving the
 * routing audience from what the item IS is sound, whereas the old inverse
 * (deriving the item's category from its audience) could only ever produce
 * three categories and sent everything else to the catch-all.
 *
 * Lossy on purpose — there are three audiences and eight categories, so
 * anything that is not a phone or a vehicle goes to the misc broadcast.
 */
export function categoryToChannel(category: string): DropChannel {
  const key = (category || '').trim().toLowerCase();
  if (key === 'phones') return 'phones';
  if (key === 'vehicles' || key === 'cars') return 'cars';
  return 'misc';
}
