/**
 * The second-chance offers waiting on ME as the runner-up bidder.
 *
 * WHY A DEDICATED LISTENER: a second-chance offer lives on the AUCTION doc
 * (`secondChanceOffer`), not on an order — no order exists until the runner-up
 * accepts. So none of the surfaces a bidder already looks at can see it:
 *   - `useMyAuctionLots` queries `currentBidderId == me`, and the runner-up is
 *     by definition NOT the current bidder (the defaulter is).
 *   - `orders` has nothing to show, because nothing was minted.
 *   - the broad public auctions listener was removed in Slice 1b Task 5b, and
 *     the discover feed only carries live/upcoming lots.
 * Without this the offer is invisible to the one person who can accept it and
 * expires unseen after 24h — which is the whole reason the card exists.
 *
 * One tiny per-user query, same shape as the `createdById == me` own-pending
 * listener in AppContext: a single equality filter with a limit, so Firestore's
 * automatic single-field index on the map subfield covers it (no composite
 * index, no rules change — `auctions` is already `allow read: if true`).
 *
 * Only fields the card reads are mapped. Simulated lots are dropped for
 * non-admins by the caller via `filterSimulated` — the flag is carried through
 * for that purpose.
 */

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { AuctionItem } from '../types';

/**
 * Subscribe to auctions carrying a second-chance offer addressed to this user.
 * Returns the lots (id/title/sellerId/thumbnail + the offer); empty array and no
 * listener when `userId` is falsy. Terminal and expired offers are NOT filtered
 * here — `secondChanceViewState` in the card owns that decision, and it needs a
 * ticking clock the snapshot does not have.
 */
export function useMySecondChanceOffers(userId: string | null | undefined): AuctionItem[] {
  const [lots, setLots] = useState<AuctionItem[]>([]);

  useEffect(() => {
    if (!userId) {
      setLots([]);
      return;
    }
    let active = true;

    const q = query(
      collection(db, 'auctions'),
      where('secondChanceOffer.bidderId', '==', userId),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!active) return;
        const mapped = snap.docs.map((d) => {
          const data: any = d.data() || {};
          return {
            id: d.id,
            title: data.title ?? '',
            sellerId: data.sellerId ?? '',
            thumbnailUrl: data.thumbnailUrl ?? data.imageUrl ?? '',
            secondChanceOffer: data.secondChanceOffer,
            isSimulated: data.isSimulated === true,
          } as unknown as AuctionItem;
        });
        setLots(mapped);
      },
      (err) => {
        // Leave the prior value in place — a transient error must not blank an
        // offer the user is mid-decision on.
        console.error('[useMySecondChanceOffers] snapshot error:', err);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return lots;
}
