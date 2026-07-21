// Wave D — Alerts trim (spec §5).
// A bidder only cares about four alert kinds: you've been outbid, you won,
// payment confirmed/activated, and a followed drop starting/closing.
// This display-time allowlist keeps internal/ops noise (errors, admin actions,
// escrow ledger jargon) out of the user-facing bell and right rail.
// Admin surfaces intentionally bypass it and keep the full stream.
import type { Notification } from '../types';

/** Notification types a regular bidder should see in the bell / rail. */
export const USER_FACING_NOTIFICATION_TYPES: ReadonlyArray<Notification['type']> = [
  'outbid', // ① you've been outbid (also carries followed-drop "closing soon")
  'win', // ② you won
  'loss', // you lost / your locked funds were returned
  'refund', // refund confirmed
  'order', // payment / shipping progress on something you won
  'subscription', // membership payment confirmed / activated
];

/** True only for the bidder-relevant notification types (spec §5). */
export function isUserFacingNotification(type: Notification['type']): boolean {
  return USER_FACING_NOTIFICATION_TYPES.includes(type);
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
