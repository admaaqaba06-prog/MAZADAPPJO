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

// Maps a drop channel to one of AuctionItem.category's existing values, since
// category drives the app's discovery filter and media-fallback logic.
export function channelToCategory(value: DropChannel): 'Electronics' | 'Vehicles' | 'Fashion' {
  switch (value) {
    case 'cars':
      return 'Vehicles';
    case 'phones':
      return 'Electronics';
    case 'misc':
    default:
      return 'Fashion';
  }
}
