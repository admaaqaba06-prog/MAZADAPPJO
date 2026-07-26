// Scoped "my lots" subscription — the per-user replacement for the broad
// `useAuctions()` array that win-detection and MyOrders' unsettled-win hint
// used to read.
//
// WHY THIS EXISTS (win/payment path — read carefully):
// The broad buyer listener queries `status in ['live','upcoming']`. The instant
// a lot I'm winning flips to `completed` it FALLS OUT of that query — Firestore
// delivers it as a `removed` change, and the doc never appears in a `completed`
// snapshot there. So `useWinDetection`, fed the broad array, can never observe
// the `live→completed` transition for a buyer: the winning edge is effectively
// dead. This hook fixes that by scoping to MY lots and including `completed`
// in the `status in [...]` list, so a lot I'm winning STAYS in the result when
// it settles (delivered as `modified`, not `removed`). The `live→completed`
// transition is therefore observable — the exact thing the broad
// `[live,upcoming]` query denies — which is what lets the per-id transition
// rule in `useWinDetection` fire the celebration. This activation is intended
// and approved.
//
// STATUS SET = ['live','completed'] ONLY (not 'ended'/'reserve_not_met'). A win
// settles to 'completed' (see settleAuctionTxn: 'completed' is written only on
// outcome 'sold' — reserve met, real winner). 'ended' (unsold) and
// 'reserve_not_met' are NON-wins where I may still be the top `currentBidderId`;
// including them would fire a false MyOrders "just won, settling…" hint for a
// lot that never sold and for which no order is ever created. A non-win lot
// leaves this query as `removed`, so neither consumer reacts — correct.
//
// One tiny per-user listener (limit 20). Consumers read only a subset of the
// mapped fields, so elements are shaped from `mapLiveAuctionFields` (the shared
// live-field mapper) plus id/title/isSimulated and cast to `AuctionItem`.

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { AuctionItem } from '../types';
import { mapLiveAuctionFields } from '../utils/liveAuctionFields';

/**
 * Subscribe to the auctions where this user is the current highest bidder and
 * the lot is live or in a terminal state. Returns the mapped lots (a subset of
 * `AuctionItem` fields the win/settlement consumers read). Empty array + no
 * listener when `userId` is falsy.
 *
 * Leak-safe: an `active` flag drops any late snapshot after unmount / userId
 * change; the effect unsubscribes on cleanup and re-subscribes when `userId`
 * changes; snapshot errors are logged and leave the prior value in place.
 */
export function useMyAuctionLots(userId: string | null | undefined): AuctionItem[] {
  const [lots, setLots] = useState<AuctionItem[]>([]);

  useEffect(() => {
    if (!userId) {
      setLots([]);
      return;
    }
    let active = true;

    const q = query(
      collection(db, 'auctions'),
      where('currentBidderId', '==', userId),
      where('status', 'in', ['live', 'completed']),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!active) return;
        const mapped = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...mapLiveAuctionFields(data),
            id: d.id,
            title: data.title ?? '',
            isSimulated: data.isSimulated === true,
          } as unknown as AuctionItem;
        });
        setLots(mapped);
      },
      (err) => {
        // Leave the prior value untouched — a transient error must not wipe a
        // win the consumer is mid-transition on.
        console.error('[useMyAuctionLots] snapshot error:', err);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return lots;
}
