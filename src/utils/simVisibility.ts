import { isAdminUser } from './adminAuth';
import type { User } from '../types';

/**
 * Wave 3 — simulator visibility: the SINGLE source of truth for who may see
 * `isSimulated` data (auctions / bids / orders created by the admin simulator).
 *
 * The rule: real users must NEVER see simulated data. Admins see it ONLY while
 * the simulator master toggle is ON (so an admin can hide test data without
 * deleting it).
 *
 * NOTE on enforcement: firestore.rules keeps `auctions` publicly readable
 * (`allow read: if true`), so simulated auction docs are technically readable
 * by anyone who queries Firestore directly. The guarantee that they never
 * SHOW is this client-side filter — which is exactly why it lives here as one
 * tested pure helper applied at the AppContext source, instead of per-surface
 * ad-hoc checks any new surface could forget.
 */
export function canSeeSimulated(user: unknown, simEnabled: boolean): boolean {
  return simEnabled && isAdminUser(user as Pick<User, 'role' | 'isAdmin'> | null);
}

/**
 * Drop `isSimulated === true` items unless the viewer is an admin with the
 * simulator toggle ON. Items without the flag (all pre-simulator docs) always
 * pass. Returns the input array by reference when nothing changes, so memo'd
 * consumers don't re-render on every snapshot.
 */
export function filterSimulated<T extends { isSimulated?: boolean }>(
  items: T[],
  user: unknown,
  simEnabled: boolean
): T[] {
  if (canSeeSimulated(user, simEnabled)) return items;
  const filtered = items.filter((item) => item.isSimulated !== true);
  return filtered.length === items.length ? items : filtered;
}
