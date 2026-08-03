// What reaches a regular user's bell, and which tab it belongs in.
//
// THIS RULE WAS INVERTED, and the reason is worth keeping.
//
// It began (Wave D) as an ALLOWLIST of six bidder-relevant types, meaning to
// keep "internal/ops noise (errors, admin actions, escrow ledger jargon)" out
// of the bell. But the allowlist was written against the types the CLIENT
// produces, and the server produces a different set. Counted against
// functions/index.js, fourteen of fifteen notification writes were type 'info',
// 'alert' or 'withdrawal' — none of them allowlisted — so none of them ever
// reached a user:
//
//   "Withdrawal Approved 🎉"                → invisible
//   "Withdrawal Rejected ❌"                → invisible
//   "Escrow Refunded 💸"                    → invisible
//   "Order Completed" (the buyer's copy)    → invisible
//   "Order Cancelled & Refunded" (seller)   → invisible
//
// Those are money movements. A seller could have a payout rejected and be told
// nothing at all.
//
// So the rule is now a DENYLIST of the genuinely internal types. The important
// property is the DEFAULT: an unrecognised type is now SHOWN. Failing open
// costs a little noise; failing closed costs someone the news that their money
// did not arrive — and it fails silently, which is how this survived.
//
// Excluding 'admin' still catches what the original rule was aiming at: the
// client's own addNotification remaps its transient 'alert' errors to 'admin'
// before storing them, and those are already surfaced as a toast at the moment
// they happen.
import type { Notification } from '../types';

/** Types a regular user should NOT see. Everything else reaches the bell. */
export const INTERNAL_NOTIFICATION_TYPES: ReadonlyArray<string> = [
  'admin', // client-side errors, already shown as a toast when they occurred
  'bid', // per-bid chatter; 'outbid' is the part a bidder needs
  'wallet', // raw escrow ledger jargon
  'verify', // an internal step, not an outcome
];

/** True for anything a regular user should see in the bell / rail. */
export function isUserFacingNotification(type: Notification['type'] | string): boolean {
  return !INTERNAL_NOTIFICATION_TYPES.includes(type as string);
}

/** The subset of notifications a regular user should see. */
export function userFacingNotifications(
  notifications: Notification[] | null | undefined
): Notification[] {
  return (notifications || []).filter(n => isUserFacingNotification(n.type));
}

/** Unread badge count over the user-facing subset only. */
export function unreadUserFacingCount(
  notifications: Notification[] | null | undefined
): number {
  return userFacingNotifications(notifications).filter(n => !n.read).length;
}

export type NotificationAudience = 'buying' | 'selling' | 'account';

interface AudienceOrder {
  id: string;
  buyerId?: string | null;
  sellerId?: string | null;
  vendorId?: string | null;
}

/**
 * Which tab a notification belongs in.
 *
 * Resolved through the ORDER rather than the type, because the two sides share
 * types: `win` is both "you won the auction" (buyer) and "Sales Funds
 * Collected" (seller). Only the order says which side of it this user is on.
 *
 * Returns 'account' rather than guessing when the order is not loaded — a
 * notification filed into the WRONG tab is worse than one in the general tab,
 * because a seller scanning "Selling" reads its absence as "nothing happened".
 */
export function notificationAudience(
  notification: Notification & { orderId?: string | null },
  currentUserId: string | null | undefined,
  orders: AudienceOrder[] | null | undefined,
): NotificationAudience {
  const uid = currentUserId || '';

  if (notification.orderId && uid && orders) {
    const order = orders.find(o => o.id === notification.orderId);
    if (order) {
      if (order.sellerId === uid || order.vendorId === uid) return 'selling';
      if (order.buyerId === uid) return 'buying';
    }
    // Known order id but the order has not loaded, or this user is neither
    // party — fall through rather than guess.
  }

  // Bidding activity is buying by definition, and exists before any order does.
  if (notification.type === 'outbid' || notification.type === 'loss' || notification.type === 'bid') {
    return 'buying';
  }

  return 'account';
}
