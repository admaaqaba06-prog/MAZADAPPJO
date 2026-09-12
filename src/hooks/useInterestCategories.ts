// CR-01 — the `categories` collection, read once per mount.
//
// A ONE-SHOT getDocs, not onSnapshot. The grid is a form the user fills in and
// leaves; a live listener would let a category appear, move, or vanish under a
// finger that is mid-tap, and re-sort the cards while they are being read. The
// collection changes when an admin edits it, which is roughly never, so the
// cost of a stale read is a category that shows up on the next open.
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { interestCategoriesFrom, type InterestCategory } from '../utils/interests';

export interface InterestCategoriesState {
  categories: InterestCategory[];
  loading: boolean;
  /** True when the read failed or returned nothing and the fallback is showing. */
  usedFallback: boolean;
}

export function useInterestCategories(): InterestCategoriesState {
  const [state, setState] = useState<InterestCategoriesState>({
    categories: [],
    loading: true,
    usedFallback: false,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'categories'));
        const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) }));
        if (!alive) return;
        // interestCategoriesFrom falls back on an empty/unusable list, so
        // `usedFallback` is derived from what came back, not from the throw.
        const usable = docs.filter(d => (d as { active?: boolean }).active !== false);
        setState({
          categories: interestCategoriesFrom(docs),
          loading: false,
          usedFallback: usable.length === 0,
        });
      } catch {
        // Rules change, offline first load, unseeded project. The screen must
        // still render something pickable — its Continue button is disabled
        // until a card is selected, so an empty grid locks the user out.
        if (!alive) return;
        setState({ categories: interestCategoriesFrom(null), loading: false, usedFallback: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
