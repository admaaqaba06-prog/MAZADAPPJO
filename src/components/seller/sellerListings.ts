import { AuctionItem, Order } from '../../types';
import { isUnsoldAuction } from './sellerActions';

/**
 * Pure listing bucketing + filtering for the Seller Center "Listings" workspace.
 * Mirrors the legacy categorizedAuctions logic but reshapes it to the redesign's
 * status buckets. No React — unit-tested in sellerListings.test.ts.
 */

export type ListingBucketId =
  | 'live'
  | 'scheduled'
  | 'review'
  | 'endedUnsold'
  | 'sold'
  | 'rejected';

export type ListingBuckets = Record<ListingBucketId, AuctionItem[]>;

const isReview = (a: AuctionItem): boolean =>
  a.status === 'processing' ||
  (a.status as string) === 'pending' ||
  (a.status === 'upcoming' && a.approvalStatus === 'pending');

const isRejected = (a: AuctionItem): boolean =>
  a.status === 'rejected' ||
  (a.status === 'upcoming' && a.approvalStatus === 'rejected');

const isScheduled = (a: AuctionItem): boolean =>
  a.status === 'upcoming' &&
  a.approvalStatus !== 'rejected' &&
  a.approvalStatus !== 'pending';

/** A listing is "sold" when it produced an order. */
const isSold = (a: AuctionItem, orders: Order[]): boolean =>
  orders.some((o) => o.auctionId === a.id);

/**
 * Split the seller's auctions into mutually-exclusive lifecycle buckets,
 * newest first. Status takes precedence over approvalStatus (a resubmitted
 * listing lands in Review, not Rejected).
 */
export function bucketListings(myAuctions: AuctionItem[], myOrders: Order[]): ListingBuckets {
  const newestFirst = [...myAuctions].sort(
    (a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0)
  );

  const buckets: ListingBuckets = {
    live: [],
    scheduled: [],
    review: [],
    endedUnsold: [],
    sold: [],
    rejected: [],
  };

  for (const a of newestFirst) {
    if (isSold(a, myOrders)) {
      buckets.sold.push(a);
    } else if (a.status === 'live') {
      buckets.live.push(a);
    } else if (isReview(a)) {
      buckets.review.push(a);
    } else if (isRejected(a)) {
      buckets.rejected.push(a);
    } else if (isScheduled(a)) {
      buckets.scheduled.push(a);
    } else if (isUnsoldAuction(a, myOrders)) {
      buckets.endedUnsold.push(a);
    }
  }

  return buckets;
}

/**
 * Filter a listing set by case-insensitive title substring and (optional)
 * exact category. An empty query / 'all' category is a passthrough.
 */
export function filterListings(
  listings: AuctionItem[],
  opts: { query?: string; category?: string }
): AuctionItem[] {
  const q = (opts.query || '').trim().toLowerCase();
  const cat = opts.category && opts.category !== 'all' ? opts.category : null;
  return listings.filter((a) => {
    if (q && !(a.title || '').toLowerCase().includes(q)) return false;
    if (cat && a.category !== cat) return false;
    return true;
  });
}
