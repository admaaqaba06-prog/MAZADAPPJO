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

/**
 * The write-side twin of resolveViewing: turns an admin's approval choice into the
 * exact fields to merge into the lot's document.
 *
 * Firestore's updateDoc MERGES — a key you leave out keeps whatever was stored
 * there before. Lots get approved more than once (rejected → resubmitted →
 * approved again), so "only write the place when we actually have one" quietly
 * revives the place from an EARLIER approval: approve as store/"Shop 12", then
 * re-approve as store with the place field blank, and the lot still advertises
 * Shop 12 — a viewing claim nobody made for it. So whenever a mode is chosen we
 * write BOTH keys, using '' to positively erase a place rather than omitting it.
 *
 * The one case that must stay a no-op is "the admin said nothing about viewing":
 * that has to leave both fields exactly as they were, which is what keeps every
 * pre-existing lot rendering nothing.
 *
 * Never returns a key whose value is `undefined` — Firestore rejects explicit
 * undefined (ignoreUndefinedProperties is off) and would throw on the write.
 */
export function viewingWritePayload(
  viewing?: ViewingMode | '',
  viewingPlace?: string,
): { viewing?: ViewingMode; viewingPlace?: string } {
  // No decision made → touch nothing.
  if (!viewing) return {};

  // A place only means anything for 'store'; every other mode clears it.
  const place =
    viewing === 'store' && typeof viewingPlace === 'string' ? viewingPlace.trim() : '';

  return { viewing, viewingPlace: place };
}
