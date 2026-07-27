// Admin Auction Lookup (closed-auction admin search) — debounced, all-status
// search over the swappable `searchProvider`.
//
// Sibling of `useAlgoliaSearch` (read that first) but for the ADMIN lookup, which
// differs in exactly two ways:
//   1. NO feature-flag gate. This hook lives inside the already-admin-gated
//      AdminDashboardView, so it's "active" whenever the box has a non-empty term.
//   2. NO fixed status whitelist. It passes `statuses` straight through:
//        - null / undefined → NO status filter → search ALL statuses (incl. closed:
//          completed / ended / reserve_not_met). This is the point of the feature.
//        - a specific set (e.g. ['completed','ended','reserve_not_met']) → narrow to
//          those, so the UI can offer an All / Closed / Live toggle.
//
// Everything else — the ~250ms debounce, the monotonic request-id stale guard, the
// accumulating paginated `loadMore`, the catch-and-flag error handling — is the
// SAME machinery as `useAlgoliaSearch`, kept deliberately parallel so the two
// behave identically where they overlap.
//
// Imports ONLY the provider interface (never `algoliasearch`) so the backend stays
// swappable — see `src/services/search`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AuctionItem } from '../types';
import { searchProvider } from '../services/search';

const DEBOUNCE_MS = 250;

/**
 * PURE: is an ADMIN search "active"? Unlike the public feed there is NO flag —
 * an admin lookup is active whenever the trimmed term is non-empty. Exported +
 * unit-testable so the empty short-circuit is verifiable without the debounced
 * wrapper.
 */
export function isAdminSearchActive(term: string): boolean {
  return term.trim().length > 0;
}

/**
 * Normalise the status filter into the array (or `undefined`) the provider wants.
 * `null` / `undefined` / an empty array → `undefined` (no status facet → ALL
 * statuses). A non-empty array is passed through as-is. Exported for the unit
 * test; keeps the "All = no filter" contract in one obvious place.
 */
export function normalizeStatusFilter(statusFilter?: string[] | null): string[] | undefined {
  if (statusFilter && statusFilter.length > 0) return statusFilter;
  return undefined;
}

export interface AdminAuctionSearchState {
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
 * Debounced, paginated ADMIN search against the swappable `searchProvider`.
 *
 * @param term         the raw search box value
 * @param statusFilter null/undefined = ALL statuses (incl. closed); a specific
 *                     set narrows to those (e.g. Closed / Live toggles).
 *
 * A NEW query (term OR statusFilter change) RESETS: page 0, results replaced (not
 * appended), pagination cleared, and the pending debounce is cancelled. When the
 * term is empty the hook is inert and makes no provider call.
 *
 * `loadMore()` fetches the NEXT page and APPENDS its hits (deduped by id). Both
 * the initial query and `loadMore` share ONE monotonic request-id guard, bumped
 * synchronously the instant a new query starts, so any earlier in-flight response
 * (an initial page OR a late `loadMore` page from a prior term/filter) is dropped
 * and can never clobber/append onto a fresher query's list.
 *
 * `error` flips true only if the provider throws (a genuine outage), caught here
 * so it never reaches the render path — the UI can then distinguish an outage from
 * a legitimate "no auctions found".
 */
export function useAdminAuctionSearch(
  term: string,
  statusFilter?: string[] | null,
): AdminAuctionSearchState {
  const active = isAdminSearchActive(term);
  const [state, setState] = useState<InternalState>(INERT);

  // The statuses passed to the provider. A stable string key derived from it
  // drives the new-query effect so a changed filter resets exactly like a
  // changed term (arrays are referentially unstable, so we key on the content).
  const statuses = normalizeStatusFilter(statusFilter);
  const statusKey = statuses ? statuses.join(',') : '';

  // Monotonic request id: only the newest query may commit results, so a slow
  // earlier response (initial OR loadMore page) can never touch a fresher one.
  const requestIdRef = useRef(0);
  // The current committed query, captured for loadMore (stale-safe).
  const currentQueryRef = useRef<{ reqId: number; query: string; statuses?: string[] } | null>(null);
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
    // term/filter — is invalidated the instant the query moves on.
    const reqId = ++requestIdRef.current;

    // Empty term → reset to inert, no timer, no call.
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
    // Capture the resolved statuses for this query (undefined = all statuses).
    const queryStatuses = statuses;

    // This is now the current query; loadMore fetches its subsequent pages.
    currentQueryRef.current = { reqId, query, statuses: queryStatuses };
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
        .search(query, { statuses: queryStatuses, page: 0 })
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
    // statusKey stands in for the (content of) statuses array so a changed
    // filter resets the query just like a changed term.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, statusKey, active]);

  // Stable identity (reads refs only) so a results observer effect doesn't
  // re-subscribe on every render.
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
      .search(cur.query, { statuses: cur.statuses, page: nextPage })
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
