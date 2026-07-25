// Pure, unit-testable descriptors of the Discover feed Firestore queries.
// A hook translates these plain objects into real `query(...)` constraints;
// keeping them pure keeps the query shape testable without touching Firestore.

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
 * Filters to `status === 'live'`, adds a `category` clause only when a real
 * category is selected (not undefined and not the `'All'` sentinel), orders by
 * `endsAt asc`, and paginates from `cursor`.
 */
export function buildLiveFeedConstraints({
  category,
  cursor,
}: {
  category?: string;
  cursor?: unknown;
}): FeedConstraints {
  const where: WhereClause[] = [['status', '==', 'live']];
  if (category && category !== 'All') {
    where.push(['category', '==', category]);
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
  a: { status?: string; endTime?: number; isSimulated?: boolean },
  now: number,
): boolean {
  return a.status === 'live' && a.isSimulated !== true && (!a.endTime || a.endTime > now);
}
