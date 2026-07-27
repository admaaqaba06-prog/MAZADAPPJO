export type AdminTabId =
  | 'home' | 'verify' | 'fulfillment' | 'disputes' | 'payouts' | 'launch'
  | 'orders' | 'members' | 'auction-lookup' | 'system';

export const ADMIN_PRIMARY_TABS: AdminTabId[] = ['home','verify','fulfillment','disputes','payouts','launch'];
export const ADMIN_REFERENCE_TABS: AdminTabId[] = ['orders','members','auction-lookup','system'];
export const ADMIN_TAB_DEFAULT: AdminTabId = 'home';

export interface AttentionInput {
  pendingVerify: number;
  overdueFulfillment: number;
  openDisputes: number;
  pendingPayouts: number;
  pendingListings: number;
}
export interface AttentionCounts extends AttentionInput { total: number; }

export function computeAttentionCounts(input: AttentionInput): AttentionCounts {
  const total = input.pendingVerify + input.overdueFulfillment + input.openDisputes
    + input.pendingPayouts + input.pendingListings;
  return { ...input, total };
}

const LEGACY_TAB_MAP: Record<string, AdminTabId> = {
  metrics: 'home',
  payments: 'verify',
  subscriptions: 'verify',
  listings: 'launch',
  withdrawals: 'payouts',
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
