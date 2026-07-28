// Discover pagination (Slice 1) — paginated ending-soon feed + new-drops pill.
//
// Owns the paginated LIVE (ending-soon) + UPCOMING lists that replace the broad
// `auctions` onSnapshot on the new (flag-gated) Discover path. The live list is
// ordered by `endsAt asc` and pulled a page at a time via `getDocs` +
// `startAfter` (infinite scroll). A SINGLE lightweight `onSnapshot`
// (`status==live orderBy createdAt desc limit 1`) watches for freshly-created
// live lots and drives the "new drops" pill without re-listening to the whole
// collection; `refresh()` re-pulls page 1 (which clears the pill).
//
// This hook is Firestore-bound: it composes the already-tested pure helpers in
// `discoverQuery` (`PAGE`, `isDisplayableLive`, `hasNewerDrops`) and the shared
// field mapping in `liveAuctionFields`, so it carries no new pure logic of its
// own (no dedicated unit test — see the plan's Task 3).
//
// ADDITIVE: nothing consumes this yet (Task 5 wires it into DiscoveryFeedView).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  Timestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { PAGE, hasNewerDrops, isDisplayableLive } from '../utils/discoverQuery';
import {
  filsToUnits,
  mapLiveAuctionFields,
  parseAuctionTimestamp,
  resolveEndTime,
} from '../utils/liveAuctionFields';
import { serverNow } from '../utils/serverTime';
import { isAwaitingFirstBid } from '../utils/auctionPhase';
import { AuctionItem } from '../types';

/** What the Discover feed exposes to its consumer (Task 5). */
export interface UseDiscoverFeedResult {
  liveItems: AuctionItem[];
  upcomingItems: AuctionItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMoreLive: boolean;
  loadMore: () => void;
  newDropsAvailable: boolean;
  refresh: () => void;
  error: unknown;
}

/**
 * Map a raw feed doc → a full `AuctionItem` card. Static card fields (title,
 * media, seller, category) come from the doc; the fast-changing "live" fields
 * (price/bids/bidder/reserve/status/endTime) are resolved through the SHARED
 * `mapLiveAuctionFields` so a paginated card and its later live-on-visible
 * overlay never drift. Raw `...data` is spread first so the computed fields win.
 */
function mapFeedDoc(docSnap: QueryDocumentSnapshot<DocumentData>): AuctionItem {
  const data = docSnap.data() as any;
  const startingPrice = filsToUnits(data.startingPriceFils, data.startingPrice, 0);
  return {
    ...data,
    id: docSnap.id,
    title: data.title || '',
    description: data.description || '',
    category: data.category || 'Luxury',
    startingPrice,
    minIncrement: filsToUnits(data.minIncrementFils, data.minIncrement, 10),
    videoUrl: data.videoUrl || '',
    thumbnailUrl: data.thumbnailUrl || data.imageUrl || '',
    duration: data.duration ?? 3600,
    sellerId: data.sellerId || 'seller-system',
    sellerName: data.sellerName || data.createdByName || 'Seller JO',
    sellerLogo: data.sellerLogo || '',
    isFeatured: data.isFeatured ?? false,
    viewersCount: data.viewersCount ?? 0,
    endTime: resolveEndTime(data),
    // Live fast-fields (currentPrice, totalBids, bidder, reserveMet, status).
    ...mapLiveAuctionFields(data),
  } as AuctionItem;
}

/**
 * Build the LIVE ending-soon query (optionally category-scoped + cursor-paged).
 *
 * - `categoryMatches` is the selected chip's CANONICAL alias list (e.g.
 *   `Cars → ['Cars','Vehicles']`); a non-empty list scopes with
 *   `where('category','in', matches)`. `null`/empty means the `'All'` chip → no
 *   category clause. Firestore `in` allows up to 10 values; alias display names
 *   that aren't real stored categories are harmless (they never match a doc).
 * - Excludes past-ended lots SERVER-SIDE via `where('endsAt','>', now)`: such
 *   lots (status still 'live' but past their end) sort FIRST under `endsAt asc`
 *   and would otherwise fill a page that then filters to empty client-side,
 *   stranding displayable inventory. `endsAt` is a Firestore `Timestamp` in
 *   prod, so we compare against `Timestamp.fromMillis(serverNow())`. The range
 *   field equals the first `orderBy`, so the existing `(status,endsAt)` /
 *   `(status,category,endsAt)` composite indexes still back it (no new index).
 */
function buildLiveQuery(
  categoryMatches: string[] | null,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
) {
  const constraints: QueryConstraint[] = [where('status', '==', 'live')];
  if (categoryMatches && categoryMatches.length > 0) {
    constraints.push(where('category', 'in', categoryMatches.slice(0, 10)));
  }
  constraints.push(where('endsAt', '>', Timestamp.fromMillis(serverNow())));
  constraints.push(orderBy('endsAt', 'asc'));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(PAGE));
  return query(collection(db, 'auctions'), ...constraints);
}

/** Build the UPCOMING query (soonest scheduled first). */
function buildUpcomingQuery() {
  return query(
    collection(db, 'auctions'),
    where('status', '==', 'upcoming'),
    orderBy('scheduledStartAt', 'asc'),
    limit(PAGE),
  );
}

/**
 * Build the "Be the First" query: LIVE `first_bid` lots, newest first. These go
 * live with NO `endsAt` until the first bid lands, so the ending-soon feed
 * (`orderBy('endsAt')`) excludes them entirely — this dedicated query surfaces
 * them. Ordering by `createdAt desc` keeps a stable, index-backed shape;
 * un-started lots are then kept client-side via `isAwaitingFirstBid`.
 */
function buildFirstBidQuery() {
  return query(
    collection(db, 'auctions'),
    where('status', '==', 'live'),
    where('startMode', '==', 'first_bid'),
    orderBy('createdAt', 'desc'),
    limit(PAGE),
  );
}

/**
 * Largest `createdAt` (epoch ms) across a page of docs, folded into `current`.
 * Skips docs with no `createdAt` (so a missing field never inflates the max via
 * `parseAuctionTimestamp`'s future fallback). Returns `null` only when nothing
 * has ever contributed a value.
 */
function foldMaxCreatedAt(
  docs: QueryDocumentSnapshot<DocumentData>[],
  current: number | null,
): number | null {
  let max = current;
  for (const d of docs) {
    const raw = (d.data() as any).createdAt;
    if (raw == null) continue;
    const ms = parseAuctionTimestamp(raw);
    if (max == null || ms > max) max = ms;
  }
  return max;
}

/**
 * Paginated ending-soon Discover feed with infinite scroll + a new-drops pill.
 *
 * - Resets and pulls page 1 of LIVE + a page of UPCOMING on mount and whenever
 *   `category` changes (server re-query, not a client filter).
 * - `loadMore()` pulls the next LIVE page via `startAfter(cursor)` and appends
 *   (deduped by id). `hasMoreLive` is true while a full page came back.
 * - `newDropsAvailable` is driven by a single `createdAt desc limit 1` snapshot
 *   compared against the newest loaded live lot; `refresh()` re-pulls page 1.
 *
 * Leak-safe: every async setState is gated by a per-request generation token
 * (`reqIdRef`) and a `mountedRef`, and the new-drops snapshot is torn down on
 * unmount. Errors surface via `error` and stop the relevant loading flag rather
 * than throwing.
 */
export function useDiscoverFeed(
  categoryMatches: string[] | null,
  enabled: boolean = true,
  feedMode: 'default' | 'first_bid' = 'default',
): UseDiscoverFeedResult {
  const [liveItems, setLiveItems] = useState<AuctionItem[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreLive, setHasMoreLive] = useState(false);
  const [newestLoadedCreatedAt, setNewestLoadedCreatedAt] = useState<number | null>(null);
  const [latestLiveCreatedAt, setLatestLiveCreatedAt] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Stable primitive key so effects/callbacks re-run only on a real category
  // change, not on array-identity churn from the parent.
  const categoryKey = categoryMatches && categoryMatches.length ? categoryMatches.join('|') : '';

  // Refs mirror state read inside stable callbacks (avoids stale closures) and
  // carry cross-render bookkeeping the render output doesn't need.
  const mountedRef = useRef(true);
  const reqIdRef = useRef(0); // bumped on every page-1 load; stale results discard
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const hasMoreLiveRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const newestCreatedRef = useRef<number | null>(null);
  const categoryMatchesRef = useRef(categoryMatches);
  categoryMatchesRef.current = categoryMatches;
  const latestLiveCreatedAtRef = useRef<number | null>(null); // detector's newest
  const ackFloorRef = useRef<number | null>(null); // baseline raised on refresh (acknowledge)

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Page 1 (also used by refresh + category change): reset + pull LIVE + UPCOMING.
  const loadPage1 = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    // Cancel any in-flight loadMore that belonged to a prior generation.
    loadingMoreRef.current = false;
    cursorRef.current = null;
    if (mountedRef.current) {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
    }
    try {
      // "Be the First" mode: a single dedicated query for live first_bid lots
      // awaiting their first bid. No upcoming list, no pagination, no new-drops
      // detector, category filtering ignored (see the effect/loadMore guards).
      if (feedMode === 'first_bid') {
        const fbSnap = await getDocs(buildFirstBidQuery());
        if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale
        const live = fbSnap.docs.map(mapFeedDoc).filter((a) => isAwaitingFirstBid(a));
        cursorRef.current = null;
        hasMoreLiveRef.current = false;
        setLiveItems(live);
        setUpcomingItems([]);
        setHasMoreLive(false);
        setLoading(false);
        return;
      }

      const [liveSnap, upSnap] = await Promise.all([
        getDocs(buildLiveQuery(categoryMatchesRef.current, null)),
        getDocs(buildUpcomingQuery()),
      ]);
      if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale

      const now = serverNow();
      const live = liveSnap.docs.map(mapFeedDoc).filter((a) => isDisplayableLive(a, now));
      const upcoming = upSnap.docs.map(mapFeedDoc);
      // Fold the acknowledged baseline (a refresh may have raised it above this
      // ending-soon page's max, since the newest-created lot ends farthest out)
      // so a prior acknowledge is never undone by a page-1 reload.
      let newest = foldMaxCreatedAt(liveSnap.docs, null);
      if (ackFloorRef.current != null) {
        newest = newest == null ? ackFloorRef.current : Math.max(newest, ackFloorRef.current);
      }

      cursorRef.current = liveSnap.docs[liveSnap.docs.length - 1] ?? null;
      hasMoreLiveRef.current = liveSnap.docs.length === PAGE;
      newestCreatedRef.current = newest;

      setLiveItems(live);
      setUpcomingItems(upcoming);
      setHasMoreLive(liveSnap.docs.length === PAGE);
      setNewestLoadedCreatedAt(newest);
      setLoading(false);
    } catch (e) {
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      setError(e);
      setLoading(false);
    }
  }, [categoryKey, feedMode]);

  useEffect(() => {
    // OFF (flag-gated fallback path): never fetch. The consumer keeps using the
    // broad `useAuctions()` feed, so this hook must stay completely inert — no
    // page-1 getDocs, no reads — until it is actually mounted behind the flag.
    if (!enabled) return;
    void loadPage1();
  }, [loadPage1, enabled]);

  const loadMore = useCallback(() => {
    // "Be the First" is a single non-paginated page — nothing more to load.
    if (feedMode === 'first_bid') return;
    if (!hasMoreLiveRef.current || loadingMoreRef.current) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    const reqId = reqIdRef.current; // guards against a category switch mid-flight

    loadingMoreRef.current = true;
    if (mountedRef.current) setLoadingMore(true);

    getDocs(buildLiveQuery(categoryMatchesRef.current, cursor))
      .then((snap) => {
        if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale
        const now = serverNow();
        const more = snap.docs.map(mapFeedDoc).filter((a) => isDisplayableLive(a, now));

        cursorRef.current = snap.docs[snap.docs.length - 1] ?? cursorRef.current;
        hasMoreLiveRef.current = snap.docs.length === PAGE;
        newestCreatedRef.current = foldMaxCreatedAt(snap.docs, newestCreatedRef.current);

        setLiveItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...more.filter((a) => !seen.has(a.id))];
        });
        setHasMoreLive(snap.docs.length === PAGE);
        setNewestLoadedCreatedAt(newestCreatedRef.current);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      })
      .catch((e) => {
        loadingMoreRef.current = false;
        if (reqId !== reqIdRef.current || !mountedRef.current) return;
        setError(e);
        setLoadingMore(false);
      });
  }, [categoryKey, feedMode]);

  // New-drops detector: ONE snapshot on the newest live lot by createdAt.
  // Gated by `enabled` so the OFF path opens no listener at all.
  useEffect(() => {
    // Skip in "Be the First" mode: that feed has no new-drops pill.
    if (!enabled || feedMode === 'first_bid') return;
    const unsub = onSnapshot(
      query(
        collection(db, 'auctions'),
        where('status', '==', 'live'),
        orderBy('createdAt', 'desc'),
        limit(1),
      ),
      (snap) => {
        if (!mountedRef.current) return;
        const top = snap.docs[0];
        const raw = top ? (top.data() as any).createdAt : null;
        const parsed = raw == null ? null : parseAuctionTimestamp(raw);
        latestLiveCreatedAtRef.current = parsed;
        setLatestLiveCreatedAt(parsed);
      },
      (e) => {
        if (mountedRef.current) setError(e);
      },
    );
    return unsub;
  }, [enabled, feedMode]);

  const refresh = useCallback(() => {
    // ACKNOWLEDGE the new-drops pill: raise the loaded baseline to the newest
    // live lot the detector has seen. The feed is ordered ending-soon while the
    // detector tracks newest-CREATED, so a freshly-listed lot (farthest endsAt)
    // won't land on page 1 — without this the pill would re-arm forever after a
    // refresh. Acknowledging clears it now; the lot still surfaces naturally as
    // its end-time approaches. "New drops" thus means "new lots were listed —
    // tap to re-pull + dismiss."
    const ack = latestLiveCreatedAtRef.current;
    if (ack != null) {
      ackFloorRef.current = ackFloorRef.current == null ? ack : Math.max(ackFloorRef.current, ack);
      newestCreatedRef.current =
        newestCreatedRef.current == null ? ack : Math.max(newestCreatedRef.current, ack);
      if (mountedRef.current) {
        setNewestLoadedCreatedAt((prev) => (prev == null ? ack : Math.max(prev, ack)));
      }
    }
    void loadPage1();
  }, [loadPage1]);

  const newDropsAvailable = hasNewerDrops(newestLoadedCreatedAt, latestLiveCreatedAt);

  return {
    liveItems,
    upcomingItems,
    loading,
    loadingMore,
    hasMoreLive,
    loadMore,
    newDropsAvailable,
    refresh,
    error,
  };
}
