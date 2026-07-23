// PF5 — identity-preserving auctions snapshot sync (the Wave 3B keystone).
//
// Problem: the auctions onSnapshot handler used to run `snap.forEach(mapAuctionDoc)`
// on EVERY snapshot, handing all ~80 lots a brand-new object identity on every
// single bid to any lot. That fresh identity churned every downstream memo:
// the reel comparator, `[activeAuction]`-keyed countdown intervals, and the
// per-item consumers hanging off `visibleAuctions`/`appValue`.
//
// Fix: rebuild the list from the snapshot's `docs` order, but run the mapper
// ONLY for docs named in `docChanges()` ('added'/'modified'). Every doc NOT in
// the change set reuses its previous object reference.
//
// ⚠️ MONEY-ADJACENT correctness contract (the live bid room renders from this):
//  - A changed lot is re-mapped from the FULL doc by the same mapper the old
//    full-remap path used (`mapAuctionDoc`) — no hand-picked field merge, so
//    `currentPrice`, `currentBidderId`, `currentBidderName`, `endTime`/`endsAt`,
//    `status`, `totalBids`, `winnerId`, … are all carried by construction and
//    the output is value-identical to the pre-PF5 handler (docs.map(mapDoc)).
//  - Output order is EXACTLY the snapshot `docs` order (the query's orderBy),
//    identical to what `snap.forEach` produced.
//  - 'removed' docs are handled explicitly (dropped from the previous-item
//    index) and are naturally absent from `docs`, mirroring the old
//    remap-by-omission behavior.
//  - Defensive: a doc present in `docs` but missing from both `prev` and
//    `changes` is mapped fresh — a lot can never be dropped or rendered stale
//    even if the docChanges contract were ever violated.

export type AuctionDocChangeType = 'added' | 'modified' | 'removed';

/** Structural subset of Firestore's DocumentChange the sync needs. */
export interface AuctionDocChangeLike<D> {
  type: AuctionDocChangeType;
  doc: D;
}

export interface SyncAuctionsArgs<T extends { id: string }, D> {
  /** The list this sync produced last time (NOT arbitrary optimistic state). */
  prev: readonly T[];
  /** Full snapshot docs, in query order — the authoritative order and membership. */
  docs: readonly D[];
  /** snap.docChanges(): which docs were added/modified/removed since last time. */
  changes: readonly AuctionDocChangeLike<D>[];
  getId: (doc: D) => string;
  /** The full-fidelity mapper (mapAuctionDoc) — called ONLY for changed docs. */
  mapDoc: (doc: D) => T;
}

/**
 * Returns the next auctions array:
 *  - membership + order = `docs` (exactly like the old full remap),
 *  - changed docs freshly mapped, untouched docs `===` their previous object,
 *  - and, when nothing effectively changed, the PREVIOUS ARRAY reference
 *    itself (so a no-op snapshot doesn't even churn the array identity).
 */
export function syncAuctionsFromSnapshot<T extends { id: string }, D>({
  prev,
  docs,
  changes,
  getId,
  mapDoc,
}: SyncAuctionsArgs<T, D>): T[] {
  const prevById = new Map<string, T>();
  for (const item of prev) prevById.set(item.id, item);

  const changedIds = new Set<string>();
  for (const change of changes) {
    const id = getId(change.doc);
    if (change.type === 'removed') {
      // Explicit removal: drop the stale reference so it can never be reused.
      prevById.delete(id);
    } else {
      // 'added' | 'modified' → must be re-mapped from the fresh doc.
      changedIds.add(id);
    }
  }

  const next: T[] = new Array(docs.length);
  let identical = prev.length === docs.length;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const id = getId(doc);
    const prior = prevById.get(id);
    // Reuse the previous reference ONLY for docs the snapshot did not change;
    // anything changed — or unknown (defensive) — is mapped fresh in full.
    const item = prior !== undefined && !changedIds.has(id) ? prior : mapDoc(doc);
    next[i] = item;
    if (identical && item !== prev[i]) identical = false;
  }

  // Element-wise identical → keep the array identity stable too.
  return identical ? (prev as T[]) : next;
}
