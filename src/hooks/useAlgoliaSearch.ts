// Discover search (Slice 2) — debounced, flag-gated Algolia search.
//
// Bridges the Discovery search box to the swappable `searchProvider` interface.
// FLAG-GATED: `enabled` is `featureFlags.enableAlgoliaSearch`. When the flag is
// OFF (or the box is empty) the hook is fully INERT — no debounce timer, no
// provider call, no loading — so today's client-side `.includes` feed renders
// byte-identically and ZERO Algolia calls fire. When active it debounces (~250ms)
// then calls `searchProvider.search(term, { category, page })`, guarding out-of-order
// responses (request-id ref) and setState-after-unmount (mounted flag).
//
// Deliberately imports ONLY the provider interface (never `algoliasearch`) so
// the backend stays swappable — see `src/services/search`.

import { useCallback, useEffect, useRef, useState } from 'react';
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
  // ACCUMULATED results across all loaded pages of the current query.
  results: AuctionItem[];
  nbHits: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  active: boolean;
  // True while more pages of the current query remain (page < nbPages - 1).
  hasMore: boolean;
  // Fetch + APPEND the next page of the current query. No-op when nothing more
  // to load, a load-more is already in flight, or the query has moved on.
  loadMore: () => void;
}

// Internal state carries page bookkeeping the public `hasMore` derives from.
interface InternalState {
  results: AuctionItem[];
  nbHits: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  active: boolean;
  page: number;
  nbPages: number;
}

const INERT: InternalState = {
  results: [],
  nbHits: 0,
  loading: false,
  loadingMore: false,
  error: false,
  active: false,
  page: 0,
  nbPages: 0,
};

/**
 * Debounced, paginated search against the swappable `searchProvider`.
 *
 * @param term     the raw search box value
 * @param category the selected Discovery chip (drives the facet filter)
 * @param enabled  the `enableAlgoliaSearch` feature flag
 *
 * A NEW query (term/category/enabled change) RESETS: page 0, results replaced
 * (not appended), pagination cleared. The pending debounce is cancelled on
 * change/unmount. When not active, returns the inert state and makes no call.
 *
 * `loadMore()` fetches the NEXT page and APPENDS its hits (deduped by id), so
 * every one of `nbHits` results is reachable by scrolling. Both the initial
 * query and `loadMore` share ONE monotonic request-id guard: it is bumped
 * synchronously the instant a new query starts, so any earlier in-flight
 * response — an initial page OR a late `loadMore` page from a prior term — is
 * dropped and can never clobber/append onto a fresher query's list.
 *
 * `error` flips true only if the provider throws (the provider re-throws a
 * genuine outage; the hook catches it here so it never reaches the render path,
 * letting the UI distinguish an outage from a legitimate "no matches").
 */
export function useAlgoliaSearch(
  term: string,
  category: string,
  enabled: boolean
): AlgoliaSearchState {
  const active = isSearchActive(term, enabled);
  const [state, setState] = useState<InternalState>(INERT);

  // Monotonic request id: only the newest query may commit results, so a slow
  // earlier response (initial OR loadMore page) can never touch a fresher one.
  const requestIdRef = useRef(0);
  // The current committed query, captured for loadMore (stale-safe).
  const currentQueryRef = useRef<{ reqId: number; query: string; cat: string } | null>(null);
  // Page bookkeeping mirrored into refs so loadMore reads them without stale
  // state closures (loadMore is a stable useCallback).
  const pageRef = useRef(0);
  const nbPagesRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Bump SYNCHRONOUSLY on every change (new query OR going inert) so any
    // in-flight request — initial page or a late loadMore page from the prior
    // term — is invalidated the instant the query moves on.
    const reqId = ++requestIdRef.current;

    // Not active → reset to inert, no timer, no call. This is the OFF/empty
    // short-circuit: no `searchProvider.search` is ever reached here.
    if (!active) {
      currentQueryRef.current = null;
      loadingMoreRef.current = false;
      pageRef.current = 0;
      nbPagesRef.current = 0;
      setState((prev) => (prev === INERT ? prev : INERT));
      return;
    }

    let cancelled = false;
    const query = term.trim();
    const cat = category;

    // This is now the current query; loadMore fetches its subsequent pages.
    currentQueryRef.current = { reqId, query, cat };
    loadingMoreRef.current = false;
    // Reset pagination until the fresh page-0 response lands (keeps a stale
    // loadMore from firing against the previous query's page count).
    pageRef.current = 0;
    nbPagesRef.current = 0;

    setState((prev) => ({
      ...prev,
      active: true,
      loading: true,
      loadingMore: false,
      error: false,
      page: 0,
      nbPages: 0,
    }));

    const timer = setTimeout(() => {
      searchProvider
        .search(query, { category: cat, page: 0 })
        .then((res) => {
          // Drop if unmounted OR superseded by a newer request.
          if (cancelled || reqId !== requestIdRef.current) return;
          pageRef.current = res.page;
          nbPagesRef.current = res.nbPages;
          setState({
            results: res.hits,
            nbHits: res.nbHits,
            loading: false,
            loadingMore: false,
            error: false,
            active: true,
            page: res.page,
            nbPages: res.nbPages,
          });
        })
        .catch(() => {
          if (cancelled || reqId !== requestIdRef.current) return;
          setState({
            results: [],
            nbHits: 0,
            loading: false,
            loadingMore: false,
            error: true,
            active: true,
            page: 0,
            nbPages: 0,
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, category, enabled, active]);

  // Stable identity (reads refs only) so the DiscoveryFeedView observer effect
  // doesn't re-subscribe on every render.
  const loadMore = useCallback(() => {
    const cur = currentQueryRef.current;
    if (!cur) return;
    // Guard against a superseded query, a concurrent loadMore, or no more pages.
    if (cur.reqId !== requestIdRef.current) return;
    if (loadingMoreRef.current) return;
    if (pageRef.current >= nbPagesRef.current - 1) return;

    const reqId = cur.reqId;
    const nextPage = pageRef.current + 1;
    loadingMoreRef.current = true;
    setState((prev) => ({ ...prev, loadingMore: true }));

    searchProvider
      .search(cur.query, { category: cur.cat, page: nextPage })
      .then((res) => {
        // Drop a late page whose query has been superseded — it must NOT append
        // onto a newer query's list.
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        loadingMoreRef.current = false;
        pageRef.current = res.page;
        nbPagesRef.current = res.nbPages;
        setState((prev) => {
          // Defensive dedupe by id so a re-served hit can't render twice.
          const seen = new Set(prev.results.map((r) => r.id));
          const appended = res.hits.filter((h) => !seen.has(h.id));
          return {
            ...prev,
            results: [...prev.results, ...appended],
            nbHits: res.nbHits,
            page: res.page,
            nbPages: res.nbPages,
            loadingMore: false,
          };
        });
      })
      .catch(() => {
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        loadingMoreRef.current = false;
        // A failed page load just stops the spinner; the already-loaded results
        // stay put (we don't blow the whole list away for one bad page).
        setState((prev) => ({ ...prev, loadingMore: false }));
      });
  }, []);

  return {
    results: state.results,
    nbHits: state.nbHits,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    active: state.active,
    hasMore: state.page < state.nbPages - 1,
    loadMore,
  };
}
