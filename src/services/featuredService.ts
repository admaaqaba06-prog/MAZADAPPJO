import { deleteField, doc, writeBatch, type Firestore } from 'firebase/firestore';
import { ranksFor } from '../utils/featuredRank';

/** One doc's worth of pending change. `rank: null` means delete the field. */
export interface FeaturedWrite {
  id: string;
  rank: number | null;
}

/**
 * The writes that take the featured set from `prevIds` to `nextIds`.
 *
 * EVERY survivor is rewritten, not just the lot that moved: after an unpin the
 * remaining ranks must compact to a contiguous 1..n, and a partial write would
 * leave holes that make the next reorder ambiguous. At a cap of 6 the whole set
 * is at most 6 docs, which is one batch.
 */
export function featuredWrites(prevIds: string[], nextIds: string[]): FeaturedWrite[] {
  const ranks = ranksFor(nextIds);
  const writes: FeaturedWrite[] = nextIds.map((id) => ({ id, rank: ranks[id] }));
  const kept = new Set(nextIds);
  for (const id of prevIds) {
    if (!kept.has(id)) writes.push({ id, rank: null });
  }
  return writes;
}

/**
 * Commit the whole transition atomically. Atomic matters: a half-applied
 * reorder would let the feed observe two lots claiming the same rank, and the
 * order of two equal ranks is undefined.
 */
export async function commitFeaturedOrder(
  db: Firestore,
  prevIds: string[],
  nextIds: string[],
): Promise<void> {
  const writes = featuredWrites(prevIds, nextIds);
  if (writes.length === 0) return;
  const batch = writeBatch(db);
  for (const w of writes) {
    batch.update(doc(db, 'auctions', w.id), {
      featuredRank: w.rank === null ? deleteField() : w.rank,
    });
  }
  await batch.commit();
}
