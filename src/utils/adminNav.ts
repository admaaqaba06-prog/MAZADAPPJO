/**
 * Wave 4 — the admin panel is one queue plus reference.
 *
 * `verify`, `fulfillment`, `disputes` and `payouts` are gone as tabs: their
 * work is Action Center rows and their per-item cards are row bodies. `launch`
 * became `our-drops` after shedding customer-lot approval, which is now a queue
 * row — the tab used to mix Mazad-as-operator with Mazad-as-referee.
 *
 * `computeAttentionCounts` is deleted. The queue's length is the single source
 * of "how much is waiting"; two counters could disagree.
 */
export type AdminTabId =
  | 'action-center' | 'our-drops'
  | 'orders' | 'members' | 'auction-lookup' | 'audit' | 'system';

export const ADMIN_PRIMARY_TABS: AdminTabId[] = ['action-center', 'our-drops'];
export const ADMIN_REFERENCE_TABS: AdminTabId[] = ['orders', 'members', 'auction-lookup', 'audit', 'system'];
export const ADMIN_TAB_DEFAULT: AdminTabId = 'action-center';

const LEGACY_TAB_MAP: Record<string, AdminTabId> = {
  // Wave 4 dissolutions
  home: 'action-center',
  verify: 'action-center',
  fulfillment: 'action-center',
  disputes: 'action-center',
  payouts: 'action-center',
  launch: 'our-drops',
  // pre-Wave-4 aliases, preserved
  metrics: 'action-center',
  payments: 'action-center',
  subscriptions: 'action-center',
  listings: 'our-drops',
  withdrawals: 'action-center',
  sessions: 'system',
  simulator: 'system',
  users: 'members',
};
const VALID: AdminTabId[] = [...ADMIN_PRIMARY_TABS, ...ADMIN_REFERENCE_TABS];

export function migrateStoredAdminTab(stored: string | null): AdminTabId {
  if (!stored) return ADMIN_TAB_DEFAULT;
  if ((VALID as string[]).includes(stored)) return stored as AdminTabId;
  return LEGACY_TAB_MAP[stored] ?? ADMIN_TAB_DEFAULT;
}
