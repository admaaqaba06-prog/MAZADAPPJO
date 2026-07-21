import type { User } from '../types';

/**
 * Server-verified admin check.
 *
 * `role` and `isAdmin` are protected keys in firestore.rules (not
 * user-writable) and are derived from the auth TOKEN email during
 * hydration — unlike the user doc's `email` field, which any user can
 * write. Never gate admin UI on `user.email`.
 */
export function isAdminUser(user?: Pick<User, 'role' | 'isAdmin'> | null): boolean {
  return !!user && (user.isAdmin === true || user.role === 'admin');
}

/**
 * Seller-or-above check (admin implies seller access).
 */
export function isAdminOrSeller(
  user?: Pick<User, 'role' | 'isAdmin' | 'isSeller'> | null
): boolean {
  return !!user && (isAdminUser(user) || user.role === 'seller' || user.isSeller === true);
}
