/** Bilingual label for an auction's `category` (AuctionItem.category — the
 * discovery-filter value written by channelToCategory). Falls back to the raw
 * string for legacy/unknown categories so a chip never renders empty. Matching
 * is case-insensitive; the caller supplies the language. */
const CATEGORY_AR: Record<string, string> = {
  electronics: 'إلكترونيات',
  vehicles: 'سيارات',
  fashion: 'أزياء',
  // legacy values that may exist on older auction docs
  cars: 'سيارات',
  phones: 'هواتف',
  watches: 'ساعات',
};

export function categoryLabel(category: string | null | undefined, isAr: boolean): string {
  if (!category) return '';
  if (!isAr) return category;
  return CATEGORY_AR[category.trim().toLowerCase()] ?? category;
}
