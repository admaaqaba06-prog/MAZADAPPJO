/**
 * The ONE test that actually executes AdminDashboardView.
 *
 * WHY IT EXISTS: this file's hook order is load-bearing. `actionQueue` is a
 * useMemo declared mid-body (it reads `const`s below the other memos), and the
 * optimistic-action wiring reads it in TWO dependency ARRAYS — which are
 * evaluated during render, at the line they are written on, not deferred like
 * the callbacks they sit beside. Hoisting any of that above the memo throws
 * `ReferenceError: Cannot access 'actionQueue' before initialization` the
 * instant the admin panel opens. Vite compiles it happily; the source-text
 * ordering test in admin/actionCenter.wiring.test.ts only reads line order.
 * This one runs the code. (Verified: hoisting the visibleActionQueue memo above
 * `const actionQueue` makes this test fail with exactly that ReferenceError.)
 *
 * Vitest here is `environment: 'node'` — no jsdom, no @testing-library — so
 * this uses react-dom/server. That renders once and runs no effects, which is
 * enough: TDZ is a RENDER-time fault. Rows render collapsed, so card bodies are
 * not exercised.
 *
 * MAINTENANCE: every non-pure import of AdminDashboardView has to be mocked
 * below. If this starts failing after you add an import, add its mock — do not
 * delete the test.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// NOTE: a bare Proxy would answer `then` with a function, making the module
// namespace a thenable — `import()` would then never resolve and the run hangs.
vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
  limit: () => ({}), orderBy: () => ({}), onSnapshot: () => () => {},
  updateDoc: async () => {}, addDoc: async () => {},
  Timestamp: { now: () => ({ seconds: 0 }) },
}));
vi.mock('../services/firebase', () => ({ db: {}, getCallableFunction: async () => async () => ({ success: true }) }));
vi.mock('./OrderDetailsView', () => ({ OrderDetailsView: () => null }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    currentUser: { id: 'a', name: 'MJ', role: 'admin' },
    users: [], usersTotalCount: 0, escrows: [], orders: [],
    approveListing: async () => {}, rejectListing: async () => {}, setAuctionViewing: async () => {},
    verifySeller: async () => {}, banUser: async () => {}, unbanUser: async () => {},
    releaseEscrow: async () => {}, refundEscrow: async () => {}, deleteAuction: async () => {},
    repairEndedAuctionOrder: async () => {}, repairStuckEscrowsForEndedAuction: async () => {},
    approveWithdrawal: async () => ({ success: true, message: '' }),
    rejectWithdrawal: async () => ({ success: true, message: '' }),
    language: 'en', maintenanceMode: false, featureFlags: {},
    updateMaintenanceMode: async () => {}, updateFeatureFlag: async () => {},
    systemHealthLogs: [], logSystemHealth: async () => {},
    setBids: () => {}, resetOnboarding: async () => {}, setActiveView: () => {}, adminActions: [],
  }),
  useAuctions: () => ({ auctions: [{ id: 'lot-1', status: 'processing', title: 'A lot', startingPrice: 10, thumbnailUrl: 'https://x/y.jpg', createdAt: Date.now() - 1000 }] }),
}));

import { AdminDashboardView } from './AdminDashboardView';

describe('probe', () => {
  it('executes the whole component body with a live action row', () => {
    const html = renderToStaticMarkup(React.createElement(AdminDashboardView));
    expect(html).toContain('Needs your attention');
    expect(html).toContain('Lot awaiting approval');  // the queue produced a row
    expect(html).toContain('>1<');                    // badge counts the FILTERED queue
    expect(html).not.toContain('Working');            // nothing in flight yet
  });
});
