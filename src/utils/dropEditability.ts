/**
 * What an admin may still do to a drop they just created.
 *
 * The rule agreed in the spec: edit freely until the first bid, then editing
 * locks because changing an item's terms under someone who has already
 * committed money is not something a UI should make easy. Cancelling stays
 * available while the lot is running, but the caller must confirm loudly once
 * bids exist. Nothing is editable or cancellable after close — settlement has
 * run and orders exist.
 */

export interface DropEditabilitySource {
  status?: string | null;
  totalBids?: number | null;
}

/**
 * Every status settlement can leave behind. `functions/settlement.js` writes
 * exactly three: 'completed' (sold), 'reserve_not_met' (real bids and a winner
 * but under reserve, no order created) and 'ended' (unsold). All three are
 * closed — `DropsListPanel` groups all three under "Recently ended".
 *
 * 'processing' and 'rejected' are deliberately absent: those are pre-live
 * review states and a rejected listing is still editable by its seller.
 */
const FINISHED = new Set(['completed', 'reserve_not_met', 'ended']);

/** Non-numeric counts read as zero; only a real positive number counts as bids. */
export function bidCountOf(a: DropEditabilitySource): number {
  const n = a.totalBids;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

const isFinished = (a: DropEditabilitySource): boolean =>
  FINISHED.has(String(a.status ?? ''));

export function canEditDrop(a: DropEditabilitySource): boolean {
  return !isFinished(a) && bidCountOf(a) === 0;
}

export function canCancelDrop(a: DropEditabilitySource): boolean {
  return !isFinished(a);
}

export function cancelWarnsAboutBids(a: DropEditabilitySource): boolean {
  return bidCountOf(a) > 0;
}
