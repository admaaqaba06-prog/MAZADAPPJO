/**
 * Where a notification click should take you.
 *
 * Notifications were inert: `NotificationCenter` called `markAsRead(id)` and
 * nothing else, so the reader had to go find the lot or the order themselves.
 *
 * THE RULE HERE IS: NEVER GUESS. It mirrors the philosophy already stated for
 * `notificationAudience` in `notifications.ts` — *"a notification filed into the
 * WRONG tab is worse than one in the general tab"* — and the cost is higher for
 * navigation than for filing. Sending someone to the wrong lot, or to an empty
 * screen because an id was blank, reads as a broken auction rather than a
 * broken bell. `null` means "stay where you are", which is always safe.
 *
 * Scope note: this is the CUSTOMER's bell (its audiences are buying/selling/
 * account), so the destinations are lots, orders, the wallet and the profile.
 * Admin destinations — payment verification, membership approval — belong to the
 * admin Action Center, which already collapses "notification → find the record"
 * into a queue you act on in place.
 */
import type { Notification } from '../types';

/** Views the app can actually render — a subset of AppContext's setActiveView union. */
export type DestinationView = 'live' | 'orders' | 'wallet' | 'profile';

export type NotificationDestination =
  | { view: 'live'; auctionId: string }
  | { view: 'orders'; orderId: string }
  | { view: 'wallet' }
  | { view: 'profile' };

/** A usable entity id: a non-blank string. `''` would open an empty screen. */
function id(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function notificationDestination(
  notification: Notification | null | undefined
): NotificationDestination | null {
  if (!notification || typeof notification !== 'object') return null;

  const orderId = id((notification as { orderId?: unknown }).orderId);
  const auctionId = id((notification as { auctionId?: unknown }).auctionId);

  switch (notification.type) {
    // Bidding activity is about a lot, and exists before any order does.
    case 'outbid':
    case 'bid':
    case 'win':
    case 'loss':
      return auctionId ? { view: 'live', auctionId } : null;

    // Order activity is about the order. It may also name the lot it came from;
    // the order is the more specific answer, so it wins.
    case 'order':
    case 'refund':
      if (orderId) return { view: 'orders', orderId };
      return auctionId ? { view: 'live', auctionId } : null;

    case 'wallet':
    case 'withdrawal':
      return { view: 'wallet' };

    case 'subscription':
      return { view: 'profile' };

    // 'info', 'alert', 'verify', 'admin' — announcements, not pointers. And an
    // unknown or legacy type falls through here too: no throw, no guess.
    default:
      return null;
  }
}
