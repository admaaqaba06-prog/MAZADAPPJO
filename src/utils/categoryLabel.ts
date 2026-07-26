/** Bilingual label for an auction's `category` (AuctionItem.category — the
 * discovery-filter value written by channelToCategory). Falls back to the raw
 * string for legacy/unknown categories so a chip never renders empty. Matching
 * is case-insensitive; the caller supplies the language.
 *
 * `Fashion` is the CATCH-ALL bucket, not a clothing category. There are only
 * three drop channels — phones, cars, misc — and `channelToCategory` sends misc
 * to `Fashion`, so every lot that is not a phone or a car is stored as
 * `Fashion`. The seller's own picker in ListingWizardView already labels that
 * value "أخرى / Other"; this rendered it "أزياء / Fashion", so a mixed bag of
 * goods was presented to buyers as clothing. Labelled "Other" here to match the
 * picker and the reality of what is in the bucket. The STORED value is
 * deliberately unchanged — renaming it would orphan every existing lot.
 */
const CATEGORY_AR: Record<string, string> = {
  electronics: 'إلكترونيات',
  vehicles: 'سيارات',
  fashion: 'أخرى',
  // legacy values that may exist on older auction docs
  cars: 'سيارات',
  phones: 'هواتف',
  watches: 'ساعات',
};

/** English overrides. Anything absent falls through to the raw stored value. */
const CATEGORY_EN: Record<string, string> = {
  fashion: 'Other',
};

export function categoryLabel(category: string | null | undefined, isAr: boolean): string {
  if (!category) return '';
  const key = category.trim().toLowerCase();
  if (!isAr) return CATEGORY_EN[key] ?? category;
  return CATEGORY_AR[key] ?? category;
}
