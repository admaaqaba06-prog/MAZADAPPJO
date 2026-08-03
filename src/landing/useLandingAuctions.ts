import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { isLiveNow } from '../utils/auctionPhase';
import type { AuctionItem } from '../types';

export interface LandingAuction {
  id: string;
  title: string;
  category: AuctionItem['category'];
  currentPrice: number;
  totalBids: number;
  /**
   * Epoch millis, or `undefined` for a clockless lot. NOT the mapped
   * `AuctionItem.endTime`: this file never goes through `resolveEndTime` —
   * `fetchLandingAuctions` spreads the RAW doc (`{ id, ...d.data() }`), so
   * `mapToLandingAuction` copies the raw field straight across.
   *
   * A `first_bid` lot stores neither `endTime` nor `endsAt` until its first bid
   * (the server stamps `endsAt` then), so this lands as `undefined`. Curation
   * KEEPS such lots, so a curated LandingAuction does NOT always hold a number
   * and every consumer must guard before doing arithmetic on it.
   */
  endTime: number | null | undefined;
  /**
   * Epoch millis of the doc's `createdAt`, or `undefined` when the doc has none.
   * Used to order clockless lots newest-first; a lot without it sorts last.
   */
  createdAt: number | undefined;
  /**
   * Admin curation order — the contiguous 1..n integer written by the featured
   * flow (see `src/utils/featuredRank.ts`), absent when a lot is not featured.
   * `isFeatured` still drives rendering; this only drives ordering.
   */
  featuredRank: number | undefined;
  imageUrl: string;
  isFeatured: boolean;
  isVerified: boolean;
}

export interface LandingAuctionsState {
  auctions: LandingAuction[];
  isLoading: boolean;
  isEmpty: boolean;
  isError: boolean;
}

const DISPLAY_CAP = 8;

/**
 * Read a raw Firestore timestamp-ish value as epoch millis, or `undefined` when
 * it is absent or unreadable.
 *
 * Deliberately NOT `parseAuctionTimestamp`: that helper falls back to
 * `Date.now() + 1h` for a missing value, which would sort an undated lot NEWEST
 * instead of last. This module also stays free of the mapper imports by design.
 */
function readMillis(val: any): number | undefined {
  if (val == null) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const parsed = Date.parse(val);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function mapToLandingAuction(a: AuctionItem): LandingAuction {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    currentPrice: a.currentPrice,
    totalBids: a.totalBids,
    endTime: a.endTime,
    createdAt: readMillis((a as any).createdAt),
    featuredRank: typeof (a as any).featuredRank === 'number' ? (a as any).featuredRank : undefined,
    imageUrl: a.thumbnailUrl || a.mediaUrls?.[0] || '',
    isFeatured: a.isFeatured === true,
    isVerified: a.approvalStatus === 'approved',
  };
}

/**
 * The marketplace strip's sort order: featured by rank, then clocked lots ending
 * soonest, then clockless newest first. A running clock is real urgency and earns
 * the top slots; a clockless lot has no meaningful position among clocked ones.
 *
 * Exported ONLY so its contract can be asserted directly — that is the sole way
 * the bug class described below is catchable at all.
 *
 * MUST BE TOTAL: it must return a number for every pair, never `NaN`. A `NaN`
 * comparator result is unspecified per ES; V8 happens to treat it as `0`
 * (branching only on `< 0` and `> 0`, both false for `NaN`). So a comparator
 * broken this way produces plausible, deterministic, correctly-sized output, and
 * NO test asserting on sort OUTPUT can see the difference at any array size.
 * Assert on this function's return value, not on the sorted array — see the
 * `totality contract` tests.
 *
 * Also relied upon to be antisymmetric and transitive; a comparator that is not
 * yields an implementation-defined permutation.
 */
export function compareLandingAuctions(x: LandingAuction, y: LandingAuction): number {
  if (x.isFeatured !== y.isFeatured) return x.isFeatured ? -1 : 1;
  if (x.isFeatured && y.isFeatured) {
    const xr = x.featuredRank ?? Number.MAX_SAFE_INTEGER;
    const yr = y.featuredRank ?? Number.MAX_SAFE_INTEGER;
    if (xr !== yr) return xr - yr;
  }
  // `> 0` rather than a bare `typeof === 'number'` so this agrees with
  // `isLiveNow` on every value that SURVIVES THE FILTER — the only domain this
  // comparator ever sees. `isLiveNow` decides clocked-ness by falsiness
  // (`!endTime`), so it treats 0 as clockless and admits such a lot; a bare
  // typeof check would call 0 clocked and sort it to the very front on a 1970
  // clock. (The two do diverge outside that domain — for a negative endTime
  // `!(-5)` is false, so `isLiveNow` calls it clocked while this calls it
  // clockless — but such a lot is dropped by the expiry check before it gets
  // here.) The `> 0` guard also keeps a NaN endTime out of the subtraction
  // below, which would otherwise make this comparator return NaN.
  const xClocked = typeof x.endTime === 'number' && x.endTime > 0;
  const yClocked = typeof y.endTime === 'number' && y.endTime > 0;
  if (xClocked !== yClocked) return xClocked ? -1 : 1;
  if (xClocked && yClocked) return (x.endTime as number) - (y.endTime as number);
  // Both clockless: newest first; an undated lot sorts last, and two undated
  // lots keep their input order. Written as explicit `undefined` branches
  // rather than `?? -Infinity`, because `-Infinity - -Infinity` is NaN —
  // unspecified per ES, and V8 happens to treat it as 0, which is exactly why
  // no test asserting on sort output can see the difference.
  const xc = x.createdAt;
  const yc = y.createdAt;
  if (xc === undefined && yc === undefined) return 0;
  if (xc === undefined) return 1;
  if (yc === undefined) return -1;
  return yc - xc;
}

// Pure curation: live, titled auctions ordered for the marketplace strip, capped.
// Simulated auctions ARE included pre-launch so the section never looks dead while
// real volume ramps (founder decision — revisit once real live volume is steady).
//
// `isLiveNow` is the ONLY liveness test: it keeps a lot with no clock and drops one
// whose clock has passed. The previous `typeof endTime === 'number'` guard was
// redundant with it for clocked lots and silently discarded every clockless
// (awaiting-first-bid) lot — which, with an all-first_bid catalogue, meant the
// section rendered its empty state while the whole inventory was live.
//
// Ordering lives in `compareLandingAuctions`. The step order matters: filter →
// map → sort → slice, so the comparator sees the mapped shape (it reads
// `featuredRank`/`createdAt`) and the cap trims the ORDERED list, not an
// arbitrary subset. Unit-tested; the hook wrapper is not.
export function curateLandingAuctions(
  auctions: AuctionItem[],
  now: number = Date.now(),
  cap: number = DISPLAY_CAP
): LandingAuction[] {
  return auctions
    .filter(a => !!a.title && isLiveNow(a, now))
    .map(mapToLandingAuction)
    .sort(compareLandingAuctions)
    .slice(0, cap);
}

// One fetch per session, mirroring useSocialProof's module-level cache.
let landingAuctionsCache: Promise<AuctionItem[]> | null = null;

function fetchLandingAuctions(): Promise<AuctionItem[]> {
  if (landingAuctionsCache) return landingAuctionsCache;
  landingAuctionsCache = getDocs(
    query(
      collection(db, 'auctions'),
      where('status', '==', 'live'),
      limit(60)
    )
  )
    .then(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuctionItem, 'id'>) })))
    .catch(err => { console.warn('[landing] failed to load live auctions', err); landingAuctionsCache = null; throw err; });
  return landingAuctionsCache;
}

export function useLandingAuctions(): LandingAuctionsState {
  const [auctions, setAuctions] = useState<LandingAuction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLandingAuctions()
      .then(raw => {
        if (!active) return;
        setAuctions(curateLandingAuctions(raw));
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsError(true);
        setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  return { auctions, isLoading, isEmpty: !isLoading && !isError && auctions.length === 0, isError };
}
