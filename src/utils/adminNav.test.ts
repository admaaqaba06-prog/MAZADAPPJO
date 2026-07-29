import { describe, it, expect } from 'vitest';
import { migrateStoredAdminTab, ADMIN_PRIMARY_TABS, ADMIN_REFERENCE_TABS, ADMIN_TAB_DEFAULT } from './adminNav';

describe('migrateStoredAdminTab', () => {
  // Wave 4 dissolved verify/payouts/launch/home, so these legacy ids now land
  // on the queue (or Our drops). The Wave 4 suite below covers the new targets
  // in full; this case keeps the reference aliases pinned.
  it('maps removed legacy ids to their new home', () => {
    expect(migrateStoredAdminTab('sessions')).toBe('system');
    expect(migrateStoredAdminTab('simulator')).toBe('system');
    expect(migrateStoredAdminTab('users')).toBe('members');
  });
  it('passes through still-valid ids', () => {
    expect(migrateStoredAdminTab('action-center')).toBe('action-center');
    expect(migrateStoredAdminTab('our-drops')).toBe('our-drops');
    expect(migrateStoredAdminTab('orders')).toBe('orders');
  });
  it('falls back to the default on null/unknown', () => {
    expect(migrateStoredAdminTab(null)).toBe(ADMIN_TAB_DEFAULT);
    expect(migrateStoredAdminTab('garbage')).toBe(ADMIN_TAB_DEFAULT);
  });
});

describe('tab groups', () => {
  it('primary then reference cover the nav set with no overlap', () => {
    // Wave 4: six primary tabs became two. The no-overlap invariant is the
    // point of this case and still holds.
    expect(ADMIN_PRIMARY_TABS).toEqual(['action-center','our-drops']);
    expect(ADMIN_REFERENCE_TABS).toEqual(['orders','members','auction-lookup','audit','system']);
    expect(ADMIN_PRIMARY_TABS.some(t => ADMIN_REFERENCE_TABS.includes(t))).toBe(false);
  });
});

describe('Wave 4 — the panel is a queue plus reference', () => {
  it('has exactly two primary tabs: the queue and our own drops', () => {
    expect(ADMIN_PRIMARY_TABS).toEqual(['action-center', 'our-drops']);
    expect(ADMIN_TAB_DEFAULT).toBe('action-center');
  });

  it('keeps every reference tab', () => {
    expect(ADMIN_REFERENCE_TABS).toEqual(['orders', 'members', 'auction-lookup', 'audit', 'system']);
  });

  it('redirects every dissolved tab to the Action Center — no bookmark breaks', () => {
    for (const old of ['home', 'verify', 'fulfillment', 'disputes', 'payouts', 'metrics', 'payments', 'subscriptions', 'withdrawals']) {
      expect(migrateStoredAdminTab(old)).toBe('action-center');
    }
  });

  it('sends the old launch tab to our drops, where that work now lives', () => {
    expect(migrateStoredAdminTab('launch')).toBe('our-drops');
    expect(migrateStoredAdminTab('listings')).toBe('our-drops');
  });

  it('still migrates the legacy reference aliases', () => {
    expect(migrateStoredAdminTab('users')).toBe('members');
    expect(migrateStoredAdminTab('sessions')).toBe('system');
    expect(migrateStoredAdminTab('simulator')).toBe('system');
  });

  it('falls back to the queue for junk', () => {
    expect(migrateStoredAdminTab('nonsense')).toBe('action-center');
    expect(migrateStoredAdminTab(null)).toBe('action-center');
  });
});
