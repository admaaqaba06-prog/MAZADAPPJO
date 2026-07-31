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
 * One tiny per-user query. It needs a COMPOSITE INDEX (declared in
 * `firestore.indexes.json`; see the query notes below for why the status filter
 * and the orderBy are not optional) — deploy indexes BEFORE this ships or the
 * query fails `failed-precondition` and the card is silently absent. No rules
 * change is needed: `auctions` is already `allow read: if true`.
 *
 * Only fields the card reads are mapped. Simulated lots are dropped for
 * non-admins by the caller via `filterSimulated` — the flag is carried through
 * for that purpose.
 */

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { PLACEHOLDER_MEDIA } from '../utils/auctionDocMap';
import { SECOND_CHANCE_PENDING_STATUSES } from '../utils/secondChanceOffer';
import { AuctionItem } from '../types';

/**
 * Subscribe to auctions carrying a LIVE second-chance offer addressed to this
 * user. Empty array and no listener when `userId` is falsy.
 *
 * THE QUERY MUST NOT BE ABLE TO LOSE A LIVE OFFER. Two things guarantee that,
 * and neither is optional:
 *
 * 1. `status in [pending_*]` — without it, `confirmed` / `declined` / `expired`
 *    offers never age out of the result and a user with 20 historical ones would
 *    never see their 21st. It would not render and would not error; it would
 *    just expire unseen in 24h, which is the exact failure this hook exists to
 *    prevent.
 * 2. `orderBy(openedAt, 'desc')` — the status filter alone is not enough,
 *    because an EXPIRED offer keeps its `pending_*` status forever (nothing
 *    sweeps it; only a relist rewrites it to 'expired'). Newest-first means a
 *    freshly opened offer is always inside the 20. `openedAt` is written
 *    unconditionally by `secondChance.buildOfferRecord`, so no offer is skipped
 *    for lacking the ordering field.
 *
 * The `in` + equality + orderBy shape needs a composite index; it is declared in
 * `firestore.indexes.json`, mirroring the `currentBidderId ASC, status ASC`
 * entry this repo already carries for the same shape in `useMyAuctionLots`. No
 * rules change is needed — `auctions` is already `allow read: if true`.
 *
 * Expiry itself is still NOT decided here: `secondChanceViewState` in the card
 * owns it, because it needs a ticking clock the snapshot does not have.
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
      where('secondChanceOffer.status', 'in', SECOND_CHANCE_PENDING_STATUSES),
      orderBy('secondChanceOffer.openedAt', 'desc'),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!active) return;
        const mapped = snap.docs.map((d) => {
          const data: any = d.data() || {};
          // Thumbnail resolution copied from mapAuctionDocFull, NOT reinvented:
          // `||` (not `??`) so an empty-string thumbnailUrl falls through to
          // imageUrl, and a stale `blob:` URL — which would render a broken
          // <img> on the customer-facing MyOrders card — falls back to the
          // bundled poster.
          const rawThumbnail = data.thumbnailUrl || data.imageUrl || '';
          const thumbnailUrl = !rawThumbnail || rawThumbnail.startsWith('blob:')
            ? PLACEHOLDER_MEDIA
            : rawThumbnail;
          return {
            id: d.id,
            title: data.title || '',
            sellerId: data.sellerId || '',
            thumbnailUrl,
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
