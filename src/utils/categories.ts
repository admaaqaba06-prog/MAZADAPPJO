/**
 * The ONE category taxonomy. Before this file there were two, written
 * independently and disagreeing:
 *
 *  - The seller picker (ListingWizardView) offered 7 labels over 6 stored
 *    values, storing 'Luxury' for Watches — a value NO Discover chip matched,
 *    so every watch a seller listed was invisible under every category filter
 *    except "All".
 *  - The admin drop builder had 3 channels, and `channelToCategory` collapsed
 *    everything that was not a phone or a car into 'Fashion'.
 *
 * Stored values are NEVER renamed — legacy docs carry them and a rename would
 * orphan every existing lot. `legacyMatch` is how an old value stays reachable:
 * a chip filters on its canonical value PLUS everything it absorbed, so the
 * feed is correct whether or not the backfill has run.
 *
 * `Fashion` is the historical catch-all, not a clothing category. It is stored
 * as `Fashion` and labelled "Other / أخرى" everywhere it is shown.
 */
export interface Category {
  /** The canonical value written to `auctions/{id}.category`. */
  value: string;
  labelAr: string;
  labelEn: string;
  /** Stored values this category must ALSO match when filtering. */
  legacyMatch: string[];
}

export const CATEGORIES: readonly Category[] = [
  { value: 'Vehicles', labelAr: 'سيارات', labelEn: 'Vehicles', legacyMatch: ['Cars'] },
  { value: 'Phones', labelAr: 'هواتف', labelEn: 'Phones', legacyMatch: [] },
  { value: 'Electronics', labelAr: 'إلكترونيات', labelEn: 'Electronics', legacyMatch: [] },
  { value: 'Watches', labelAr: 'ساعات', labelEn: 'Watches', legacyMatch: ['Luxury'] },
  { value: 'Appliances', labelAr: 'أجهزة كهربائية', labelEn: 'Appliances', legacyMatch: [] },
  { value: 'Home & Furniture', labelAr: 'أثاث ومنزل', labelEn: 'Home & Furniture', legacyMatch: [] },
  { value: 'Real Estate', labelAr: 'عقارات', labelEn: 'Real Estate', legacyMatch: [] },
  { value: 'Fashion', labelAr: 'أخرى', labelEn: 'Other', legacyMatch: ['Misc'] },
] as const;

/** Case-insensitive lookup over canonical values AND absorbed legacy values. */
function find(raw: string): Category | undefined {
  const key = raw.trim().toLowerCase();
  return CATEGORIES.find(
    c =>
      c.value.toLowerCase() === key ||
      c.legacyMatch.some(l => l.toLowerCase() === key),
  );
}

/**
 * Bilingual label. Falls back to the raw string for an unknown value so a chip
 * never renders empty — a future category added server-side shows its own name
 * rather than vanishing.
 */
export function categoryLabel(value: string | null | undefined, isAr: boolean): string {
  if (!value) return '';
  const hit = find(value);
  if (!hit) return value;
  return isAr ? hit.labelAr : hit.labelEn;
}

/**
 * Every stored value a filter for `value` must match. Firestore `in` clauses
 * take this array directly.
 */
export function matchValues(value: string): string[] {
  const hit = find(value);
  if (!hit) return [value];
  return [hit.value, ...hit.legacyMatch];
}
