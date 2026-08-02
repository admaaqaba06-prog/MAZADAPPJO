// Pure, unit-testable descriptors of the Discover feed Firestore queries.
// A hook translates these plain objects into real `query(...)` constraints;
// keeping them pure keeps the query shape testable without touching Firestore.

import { AuctionItem } from '../types';

/** Page size for the paginated Discover feeds. */
export const PAGE = 24;

/** A `where(field, op, value)` triple as a plain array. */
export type WhereClause = [string, string, unknown];

/** A `orderBy(field, direction)` pair as a plain array. */
export type OrderByClause = [string, 'asc' | 'desc'];

/** A pure descriptor of a Firestore query the feed hook builds. */
export interface FeedConstraints {
  where: WhereClause[];
  orderBy: OrderByClause[];
  startAfter: unknown;
  limit: number;
}

/**
 * Build the constraint descriptor for the live (ending-soon) feed.
 * Filters to `status === 'live'`, adds a `category in [...]` clause only when a
 * specific category is selected (a non-empty `categoryMatches` list — `null`/
 * empty means the `'All'` chip), optionally adds an `endsAt > endsAfter` range
 * clause to drop past-ended lots at the source, orders by `endsAt asc`, and
 * paginates from `cursor`.
 *
 * `categoryMatches` is the chip's CANONICAL alias list (e.g. `Cars →
 * ['Cars','Vehicles']`): Firestore `in` supports up to 10 values and any alias
 * display names that aren't real stored categories are harmless (they simply
 * never match a doc). This descriptor mirrors the live query the hook builds.
 */
export function buildLiveFeedConstraints({
  categoryMatches,
  cursor,
  endsAfter,
}: {
  categoryMatches?: string[] | null;
  cursor?: unknown;
  endsAfter?: unknown;
}): FeedConstraints {
  const where: WhereClause[] = [['status', '==', 'live']];
  if (categoryMatches && categoryMatches.length > 0) {
    where.push(['category', 'in', categoryMatches.slice(0, 10)]);
  }
  if (endsAfter != null) {
    where.push(['endsAt', '>', endsAfter]);
  }
  return {
    where,
    orderBy: [['endsAt', 'asc']],
    startAfter: cursor ?? null,
    limit: PAGE,
  };
}

/**
 * Build the constraint descriptor for the upcoming feed.
 * Filters to `status === 'upcoming'`, orders by `scheduledStartAt asc`, and
 * paginates from `cursor`.
 */
export function buildUpcomingFeedConstraints({
  cursor,
}: {
  cursor?: unknown;
}): FeedConstraints {
  return {
    where: [['status', '==', 'upcoming']],
    orderBy: [['scheduledStartAt', 'asc']],
    startAfter: cursor ?? null,
    limit: PAGE,
  };
}

/**
 * Whether newer live drops exist beyond what has been loaded.
 * True when there is a latest live drop and either nothing is loaded yet or the
 * latest is strictly newer than the newest loaded item.
 */
export function hasNewerDrops(
  newestLoadedCreatedAt: number | null,
  latestLiveCreatedAt: number | null,
): boolean {
  return (
    latestLiveCreatedAt != null &&
    (newestLoadedCreatedAt == null || latestLiveCreatedAt > newestLoadedCreatedAt)
  );
}

/**
 * Whether a lot should be shown in the live feed: live status, not simulated,
 * and not already past its end time (a missing `endTime` is treated as live).
 */
export function isDisplayableLive(
  // `endTime` is null for a clockless awaiting-first-bid lot (mapFeedDoc →
  // resolveEndTime); the `!a.endTime` guard below treats it as live, which is
  // correct — such a lot IS open and accepting bids.
  a: { status?: string; endTime?: number | null; isSimulated?: boolean },
  now: number,
): boolean {
  return a.status === 'live' && a.isSimulated !== true && (!a.endTime || a.endTime > now);
}

/**
 * The fast-changing fields a live-on-visible subscription overlays onto an
 * already-loaded (paginated) card. Kept in one place so the merge and the live
 * mapper (`mapLiveAuctionFields`) stay in lock-step.
 */
export const LIVE_OVERLAY_FIELDS = [
  'currentPrice',
  'totalBids',
  'currentBidderId',
  'currentBidderName',
  'reserveMet',
  'status',
  'endTime',
] as const;

/**
 * Overlay a lot's live fields over its paginated card snapshot.
 * - Returns `base` unchanged when there is no live value yet (`live == null`).
 * - Copies each live field over `base` ONLY when it is defined, so a live doc
 *   that omits a field (e.g. `reserveMet`) never clobbers the base with
 *   `undefined`.
 * - Never drops base-only fields (title, images, seller, …) — they are always
 *   carried through.
 */
export function mergeLiveIntoCard(
  base: AuctionItem,
  live: Partial<AuctionItem> | null,
): AuctionItem {
  if (!live) return base;
  // Never overlay a live value that belongs to a DIFFERENT lot (guards the
  // bidding room's changing-id subscription against a one-render stale frame
  // before the hook's state resets). A live value with no id (older callers)
  // is allowed through for backward-compat.
  if (live.id !== undefined && live.id !== base.id) return base;
  const out: AuctionItem = { ...base };
  for (const key of LIVE_OVERLAY_FIELDS) {
    const v = (live as any)[key];
    if (v !== undefined) {
      (out as any)[key] = v;
    }
  }
  return out;
}
