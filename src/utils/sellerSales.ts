import { PAID_OR_BEYOND } from './orderStatusGlossary';

/**
 * A Firestore createdAt as it reaches the seller-center UI: either an epoch-ms
 * number, a Firestore timestamp (`{ seconds }`), or an ISO string — the exact
 * shapes SellerCenterView already normalises when it reads `order.createdAt`.
 */
type CreatedAt = number | string | { seconds?: number } | null | undefined;

interface SellerOrderLike {
  status: string;
  winningBidAmount?: number;
  createdAt?: CreatedAt;
}

/**
 * Sum the hammer value (`winningBidAmount`) of this month's REAL sales.
 *
 * An order counts only when BOTH hold:
 *   1. its status is in PAID_OR_BEYOND — the buyer's money is actually in, so a
 *      `waiting_payment` / `defaulted` / `cancelled` / `refunded` order never
 *      inflates the figure; and
 *   2. its `createdAt` falls in the same calendar month + year as `now`.
 *
 * Date handling mirrors SellerCenterView exactly (local `getMonth`/`getFullYear`
 * against `now`, and the number/`{ seconds }`/ISO createdAt shapes) so the only
 * behavioural change versus the old inline reduce is the status gate.
 */
export function sumPaidSalesThisMonth(
  orders: SellerOrderLike[],
  now: Date
): number {
  return orders
    .filter(o => {
      if (!PAID_OR_BEYOND.has(o.status)) return false;
      if (!o.createdAt) return false;
      const date = new Date(
        typeof o.createdAt === 'number'
          ? o.createdAt
          : typeof o.createdAt === 'object' && o.createdAt.seconds
            ? o.createdAt.seconds * 1000
            : (o.createdAt as string | number)
      );
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, o) => sum + (o.winningBidAmount || 0), 0);
}
