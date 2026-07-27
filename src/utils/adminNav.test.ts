import { describe, it, expect } from 'vitest';
import { computeAttentionCounts, migrateStoredAdminTab, ADMIN_PRIMARY_TABS, ADMIN_REFERENCE_TABS } from './adminNav';

describe('computeAttentionCounts', () => {
  it('sums a total across all job queues', () => {
    const c = computeAttentionCounts({ pendingVerify: 3, overdueFulfillment: 2, openDisputes: 1, pendingPayouts: 4, pendingListings: 5 });
    expect(c.total).toBe(15);
    expect(c.pendingVerify).toBe(3);
    expect(c.pendingPayouts).toBe(4);
  });
  it('is zero when all queues are empty', () => {
    const c = computeAttentionCounts({ pendingVerify: 0, overdueFulfillment: 0, openDisputes: 0, pendingPayouts: 0, pendingListings: 0 });
    expect(c.total).toBe(0);
  });
});

describe('migrateStoredAdminTab', () => {
  it('maps removed legacy ids to their new home', () => {
    expect(migrateStoredAdminTab('metrics')).toBe('home');
    expect(migrateStoredAdminTab('payments')).toBe('verify');
    expect(migrateStoredAdminTab('subscriptions')).toBe('verify');
    expect(migrateStoredAdminTab('listings')).toBe('launch');
    expect(migrateStoredAdminTab('withdrawals')).toBe('payouts');
    expect(migrateStoredAdminTab('sessions')).toBe('system');
    expect(migrateStoredAdminTab('simulator')).toBe('system');
    expect(migrateStoredAdminTab('users')).toBe('members');
  });
  it('passes through still-valid ids', () => {
    expect(migrateStoredAdminTab('verify')).toBe('verify');
    expect(migrateStoredAdminTab('home')).toBe('home');
    expect(migrateStoredAdminTab('orders')).toBe('orders');
  });
  it('falls back to home on null/unknown', () => {
    expect(migrateStoredAdminTab(null)).toBe('home');
    expect(migrateStoredAdminTab('garbage')).toBe('home');
  });
});

describe('tab groups', () => {
  it('primary then reference cover the nav set with no overlap', () => {
    expect(ADMIN_PRIMARY_TABS).toEqual(['home','verify','fulfillment','disputes','payouts','launch']);
    expect(ADMIN_REFERENCE_TABS).toEqual(['orders','members','auction-lookup','system']);
    expect(ADMIN_PRIMARY_TABS.some(t => ADMIN_REFERENCE_TABS.includes(t))).toBe(false);
  });
});
