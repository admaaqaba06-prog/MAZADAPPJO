/**
 * Per-lot viewing: where (if anywhere) a buyer may physically view a lot before
 * bidding.
 *
 * Inspectability is a PER-LOT property. Not every item is at the Mazad office —
 * some sellers are physical stores a buyer can visit, others are private sellers
 * with no walk-in viewing at all. Any global claim ("we inspect everything",
 * "visit our office to see it") is therefore false for some subset of lots, which
 * is the bug this module exists to prevent.
 *
 * The rule: fail CLOSED. Unknown, missing, or malformed values render nothing.
 * Silence is always safe; a fabricated viewing claim is not.
 */

export type ViewingMode = 'office' | 'store' | 'private';

export interface ViewingSource {
  viewing?: string | null;
  viewingPlace?: string | null;
}

export function resolveViewing(
  auction: ViewingSource | null | undefined,
  isAr: boolean,
): { label: string } | null {
  const mode = auction?.viewing;

  if (mode === 'office') {
    return { label: isAr ? 'معاينة بمكاتبنا' : 'Viewable at our office' };
  }

  if (mode === 'store') {
    const place = typeof auction?.viewingPlace === 'string' ? auction.viewingPlace.trim() : '';
    if (!place) {
      return { label: isAr ? 'معاينة عند البائع' : 'Viewable at the seller' };
    }
    return {
      label: isAr ? `معاينة عند البائع · ${place}` : `Viewable at the seller: ${place}`,
    };
  }

  // 'private' and everything else (unset, unknown, garbage) render nothing.
  // 'private' deliberately matches unset: telling a buyer "no viewing" gives them
  // nothing to act on, and escrow already covers that case.
  return null;
}
