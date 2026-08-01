/**
 * Undo a local optimistic flip on ONE auction.
 *
 * `approveListing`/`rejectListing` flip the lot locally the instant the button
 * is pressed, before the Firestore write settles. On a FAILED write that flip
 * has to be undone by hand: the document never changed, so no snapshot arrives
 * to correct it, and the lot would sit locally as `live`/`rejected` for the rest
 * of the session. It would then drop out of `pendingListingDrops`, drop out of
 * `actionQueue`, and the Action Center row would stay gone no matter what the
 * optimistic-hide state said.
 *
 * A separate function because it is the only part of that path a node-only
 * suite can execute: everything around it needs a stateful renderer, so left
 * inline it was pinned by source text alone — which accepts an inverted match,
 * a no-op map, and an id that matches nothing.
 *
 * Pure, and same-array-when-unchanged like the rest of the optimistic layer.
 */
export function restoreLocalAuction<T extends { id?: string }>(
  prev: readonly T[],
  id: string,
  before: T | undefined | null,
): readonly T[] {
  // Nothing was captured — the lot was not in the local array when the write
  // started (admin surfaces render outside the auctions subscription), so there
  // is no prior value to restore and the flip never landed either.
  if (!before) return prev as readonly T[];
  if (!prev) return prev;
  let found = false;
  const next = prev.map((a) => {
    if (a && a.id === id) { found = true; return before; }
    return a;
  });
  // Identity in, identity out: a rollback for an id no row carries must not
  // allocate a new array and re-render the whole admin panel.
  return found ? next : prev;
}
