import type { Firestore } from 'firebase/firestore';

/** Auction-number seed — the first number ever assigned. Keep in sync with functions/settlement.js. */
export const AUCTION_NUMBER_SEED = 2000;

/** Pure allocation: `current` is the counter's stored value (next-to-assign). */
export function computeNextNumber(
  current?: number | null,
  seed: number = AUCTION_NUMBER_SEED,
): { assigned: number; next: number } {
  const base = typeof current === 'number' && Number.isFinite(current) ? current : seed;
  return { assigned: base, next: base + 1 };
}

/**
 * Atomically allocate the next auction number via a Firestore transaction on
 * counters/auctionNumber. Safe against concurrent launches. Admin-gated by rules.
 */
export async function allocateAuctionNumber(db: Firestore): Promise<number> {
  const { doc, runTransaction } = await import('firebase/firestore');
  const ref = doc(db, 'counters', 'auctionNumber');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().value as number) : null;
    const { assigned, next } = computeNextNumber(current);
    tx.set(ref, { value: next }, { merge: true });
    return assigned;
  });
}
