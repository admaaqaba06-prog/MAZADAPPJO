// Discover search (Slice 2) — debounced, flag-gated Algolia search.
//
// Bridges the Discovery search box to the swappable `searchProvider` interface.
// FLAG-GATED: `enabled` is `featureFlags.enableAlgoliaSearch`. When the flag is
// OFF (or the box is empty) the hook is fully INERT — no debounce timer, no
// provider call, no loading — so today's client-side `.includes` feed renders
// byte-identically and ZERO Algolia calls fire. When active it debounces (~250ms)
// then calls `searchProvider.search(term, { category })`, guarding out-of-order
// responses (request-id ref) and setState-after-unmount (mounted flag).
//
// Deliberately imports ONLY the provider interface (never `algoliasearch`) so
// the backend stays swappable — see `src/services/search`.

import { useEffect, useRef, useState } from 'react';
import { AuctionItem } from '../types';
import { searchProvider } from '../services/search';

const DEBOUNCE_MS = 250;

/**
 * PURE: is a search "active" (should we hit the provider instead of the feed)?
 * Active only when the feature is enabled AND the trimmed term is non-empty.
 * Exported + unit-tested so the OFF/empty short-circuit is verifiable without
 * the debounced integration wrapper.
 */
export function isSearchActive(term: string, enabled: boolean): boolean {
  return enabled && term.trim().length > 0;
}

export interface AlgoliaSearchState {
  results: AuctionItem[];
  nbHits: number;
  loading: boolean;
  error: boolean;
  active: boolean;
}

const INERT: AlgoliaSearchState = {
  results: [],
  nbHits: 0,
  loading: false,
  error: false,
  active: false,
};

/**
 * Debounced search against the swappable `searchProvider`.
 *
 * @param term     the raw search box value
 * @param category the selected Discovery chip (drives the facet filter)
 * @param enabled  the `enableAlgoliaSearch` feature flag
 *
 * Re-runs on any of `term`/`category`/`enabled` change; the pending debounce is
 * cancelled on change/unmount. When not active, returns the inert state and
 * makes no call. When active, `loading` is true while a query is in flight and
 * `error` flips true only if the provider throws (it returns empty rather than
 * throwing, but we stay defensive).
 */
export function useAlgoliaSearch(
  term: string,
  category: string,
  enabled: boolean
): AlgoliaSearchState {
  const active = isSearchActive(term, enabled);
  const [state, setState] = useState<AlgoliaSearchState>(INERT);

  // Monotonic request id: only the newest in-flight request may commit results,
  // so a slow earlier response can never clobber a fresher one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Not active → reset to inert, no timer, no call. This is the OFF/empty
    // short-circuit: no `searchProvider.search` is ever reached here.
    if (!active) {
      // Invalidate any in-flight request so a late resolve can't commit.
      requestIdRef.current++;
      setState((prev) => (prev === INERT ? prev : INERT));
      return;
    }

    let mounted = true;
    const query = term.trim();
    const cat = category;

    setState((prev) => ({ ...prev, active: true, loading: true, error: false }));

    const timer = setTimeout(() => {
      const reqId = ++requestIdRef.current;
      searchProvider
        .search(query, { category: cat })
        .then((res) => {
          // Drop if unmounted OR superseded by a newer request.
          if (!mounted || reqId !== requestIdRef.current) return;
          setState({
            results: res.hits,
            nbHits: res.nbHits,
            loading: false,
            error: false,
            active: true,
          });
        })
        .catch(() => {
          if (!mounted || reqId !== requestIdRef.current) return;
          setState({
            results: [],
            nbHits: 0,
            loading: false,
            error: true,
            active: true,
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [term, category, enabled, active]);

  return state;
}
