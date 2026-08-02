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
// `discoverQuery` (`PAGE`, `ALL_TAB_FIRST_BID_LIMIT`, `isDisplayableLive`,
// `hasNewerDrops` — see discoverQuery.test.ts), `isAwaitingFirstBidDoc` from
// `auctionPhase` (auctionPhase.test.ts), and the shared field mapping in
// `liveAuctionFields`, so it carries no new pure logic of its own and has no
// dedicated unit test — vitest here is node-only, so a hook cannot be rendered.
//
// Consumed by `DiscoveryFeedView` (the Discover grid) and `LiveStreamView`
// (the live room's own ending-soon list).

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
import { isAwaitingFirstBidDoc } from '../utils/auctionPhase';
import {
  ALL_TAB_FIRST_BID_LIMIT,
  PAGE,
  hasNewerDrops,
  isDisplayableLive,
} from '../utils/discoverQuery';
import {
  filsToUnits,
  mapLiveAuctionFields,
  parseAuctionTimestamp,
  resolveEndTime,
} from '../utils/liveAuctionFields';
import { serverNow } from '../utils/serverTime';
import { AuctionItem } from '../types';

/** What the Discover feed exposes to its consumer (Task 5). */
export interface UseDiscoverFeedResult {
  liveItems: AuctionItem[];
  /**
   * Awaiting-first-bid lots. Populated in `first_bid` mode (the Be the First
   * chip — paginated, and `liveItems` stays empty) AND on the All chip (a
   * `limit(8)` preview, alongside a full `liveItems`). Empty under any specific
   * category chip: first-bid lots are not category-scoped (see the spec).
   */
  firstBidItems: AuctionItem[];
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
 * Build the "Be the First" query: LIVE `first_bid` lots, newest first,
 * optionally cursor-paged and size-capped. These go live with NO `endsAt` until
 * the first bid lands, so the ending-soon feed (`orderBy('endsAt')`) excludes
 * them entirely — this dedicated query surfaces them. Ordering by `createdAt
 * desc` keeps a stable, index-backed shape; lots whose clock has since started
 * are dropped client-side via `isAwaitingFirstBidDoc`.
 *
 * Mirrors the pure `buildFirstBidFeedConstraints` descriptor, which is where
 * this shape is unit-tested.
 */
function buildFirstBidQuery(
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  pageSize: number = PAGE,
) {
  const constraints: QueryConstraint[] = [
    where('status', '==', 'live'),
    where('startMode', '==', 'first_bid'),
    orderBy('createdAt', 'desc'),
  ];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize));
  return query(collection(db, 'auctions'), ...constraints);
}

/**
 * Keep only lots still awaiting their first bid, and drop simulator data.
 *
 * Filters RAW doc data, not mapped items: `resolveEndTime` returns null only
 * because it consults the same predicate, so filtering here on the raw doc is
 * the authoritative check and stays correct regardless of mapping order.
 *
 * The `isSimulated` clause is parity with `isDisplayableLive`, not a live fix —
 * `simulateSpawnAuction` writes no `startMode`, so simulated docs already fail
 * this query's `where`. It exists so that stays true if the simulator ever
 * gains a first-bid option.
 */
function keepAwaitingFirstBid(docs: QueryDocumentSnapshot<DocumentData>[]): AuctionItem[] {
  return docs
    .filter((d) => {
      const x = d.data() as any;
      return isAwaitingFirstBidDoc(x) && x.isSimulated !== true;
    })
    .map(mapFeedDoc);
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
  const [firstBidItems, setFirstBidItems] = useState<AuctionItem[]>([]);
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
      // "Be the First" mode: a dedicated paginated query for live first_bid
      // lots awaiting their first bid. No upcoming list, no new-drops detector,
      // category filtering ignored (see the effect/loadMore guards). Results
      // land in `firstBidItems` and `liveItems` stays EMPTY — which is what
      // keeps the "Live now" section header and the orange live-now strip (both
      // rendered off `liveItems`) from claiming these lots have a clock.
      if (feedMode === 'first_bid') {
        const fbSnap = await getDocs(buildFirstBidQuery(null));
        if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale
        cursorRef.current = fbSnap.docs[fbSnap.docs.length - 1] ?? null;
        // Keyed off the RAW page length, not the filtered count: a page whose
        // lots have all since received a first bid filters to empty but must
        // still advance the cursor. Same contract as the ending-soon feed.
        hasMoreLiveRef.current = fbSnap.docs.length === PAGE;
        setFirstBidItems(keepAwaitingFirstBid(fbSnap.docs));
        setLiveItems([]);
        setUpcomingItems([]);
        setHasMoreLive(fbSnap.docs.length === PAGE);
        setLoading(false);
        return;
      }

      // The All chip (no category clause) additionally previews first-bid lots,
      // which the ending-soon query structurally cannot return. Capped at the
      // query level rather than sliced client-side, so it costs 8 reads not 24.
      // Any specific category chip skips it: first-bid lots are not
      // category-scoped in this slice (see the spec's Scope section).
      const isAllChip = !categoryMatchesRef.current || categoryMatchesRef.current.length === 0;
      const [liveSnap, upSnap, fbSnap] = await Promise.all([
        getDocs(buildLiveQuery(categoryMatchesRef.current, null)),
        getDocs(buildUpcomingQuery()),
        isAllChip
          ? getDocs(buildFirstBidQuery(null, ALL_TAB_FIRST_BID_LIMIT))
          : Promise.resolve(null),
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
      setFirstBidItems(fbSnap ? keepAwaitingFirstBid(fbSnap.docs) : []);
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
    if (!hasMoreLiveRef.current || loadingMoreRef.current) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    const reqId = reqIdRef.current; // guards against a category switch mid-flight

    loadingMoreRef.current = true;
    if (mountedRef.current) setLoadingMore(true);

    // "Be the First" pages its own query and appends to `firstBidItems`; every
    // other mode pages the ending-soon feed into `liveItems`.
    if (feedMode === 'first_bid') {
      getDocs(buildFirstBidQuery(cursor))
        .then((snap) => {
          if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale
          cursorRef.current = snap.docs[snap.docs.length - 1] ?? cursorRef.current;
          hasMoreLiveRef.current = snap.docs.length === PAGE;
          const more = keepAwaitingFirstBid(snap.docs);
          setFirstBidItems((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            return [...prev, ...more.filter((a) => !seen.has(a.id))];
          });
          setHasMoreLive(snap.docs.length === PAGE);
          loadingMoreRef.current = false;
          setLoadingMore(false);
        })
        .catch((e) => {
          loadingMoreRef.current = false;
          if (reqId !== reqIdRef.current || !mountedRef.current) return;
          setError(e);
          setLoadingMore(false);
        });
      return;
    }

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
    firstBidItems,
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
