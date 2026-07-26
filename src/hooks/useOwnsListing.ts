// Discover Slice 1b — scoped "does this user own any listing?" source.
//
// The Seller Center nav gates on whether the current user owns a listing (a
// first-time seller has no `isSeller`/role flag yet). This used to scan the
// broad public `auctions` array (`useAuctions()`), which is being severed so
// realtime read-cost scales with attention, not inventory. This hook replaces
// that scan with ONE tiny per-user single-doc listener.
//
// Cost model: one 1-doc `onSnapshot` per signed-in user — scales with users,
// not inventory. It stays LIVE (not a one-time getDocs) so the badge appears
// the moment a first-time seller creates their first listing. `sellerId`
// equality is a single-field auto-index — NO composite index required.

import { useEffect, useState } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * True when `userId` owns at least one auction listing (`sellerId == userId`).
 *
 * When `userId` is falsy: returns false and opens no listener. On `userId`
 * change / unmount the prior listener is torn down.
 *
 * Leak-safe: an `active` flag drops any late snapshot after unmount so there is
 * never a setState-after-unmount; the error handler logs and leaves the prior
 * value untouched.
 */
export function useOwnsListing(userId: string | null | undefined): boolean {
  const [ownsListing, setOwnsListing] = useState(false);

  useEffect(() => {
    if (!userId) {
      setOwnsListing(false);
      return;
    }

    let active = true;
    const q = query(
      collection(db, 'auctions'),
      where('sellerId', '==', userId),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (active) setOwnsListing(!snap.empty);
      },
      (err) => console.error('[useOwnsListing] snapshot error:', err)
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return ownsListing;
}
