/**
 * Pure rank arithmetic for admin-featured lots.
 *
 * The stored field is `featuredRank`: a contiguous integer 1..n, absent when a
 * lot is not featured. Every operation here works on an ORDERED ID LIST and the
 * writer converts that list to ranks via `ranksFor` — so no caller ever computes
 * a rank itself and ranks cannot develop holes or duplicates.
 *
 * Sparse integers rather than fractional/LexoRank keys: at a cap of 6 a reorder
 * rewrites at most 6 docs in one batch, and fractional keys exist to avoid
 * rewriting neighbours in long lists.
 */
export const FEATURED_CAP = 6;

export function canPin(ids: string[]): boolean {
  return ids.length < FEATURED_CAP;
}

export function pin(ids: string[], id: string): string[] {
  if (ids.includes(id)) return [...ids];
  if (!canPin(ids)) return [...ids];
  return [...ids, id];
}

export function unpin(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * Accepts `nextIds` only when it is a permutation of `ids`. A drag that races an
 * unpin in another tab would otherwise write ranks for a lot that is no longer
 * featured (or drop one that still is); rejecting keeps the current order and
 * lets the subscription reconcile.
 *
 * Checks membership in BOTH directions. Same-length-plus-no-duplicates is not
 * enough: `['a','b'] -> ['a','zz']` passes both of those and would silently drop
 * 'b' from the feed while featuring a lot that was never pinned.
 */
export function reorder(ids: string[], nextIds: string[]): string[] {
  const current = new Set(ids);
  const next = new Set(nextIds);
  const same =
    ids.length === nextIds.length &&
    next.size === nextIds.length &&
    nextIds.every((x) => current.has(x)) &&
    ids.every((x) => next.has(x));
  return same ? [...nextIds] : [...ids];
}

export function ranksFor(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    out[id] = i + 1;
  });
  return out;
}
