/**
 * The ONE test that actually executes AdminDashboardView.
 *
 * WHY IT EXISTS: this file's hook order is load-bearing. `actionQueue` is a
 * useMemo declared mid-body (it reads `const`s below the other memos), and the
 * optimistic-action wiring reads it in two dependency ARRAYS and in a useMemo
 * FACTORY. Both run during render at the line they are written on — a
 * dependency array is an ordinary array literal, and a memo factory runs
 * synchronously on the first render. (Only a useEffect callback is deferred,
 * and react-dom/server never runs one at all — which is why hoisting just the
 * effect still fails this test: its dep array is enough.) Hoisting any of it
 * above the memo throws `ReferenceError: Cannot access 'actionQueue' before
 * initialization` the instant the admin panel opens. Vite compiles it happily;
 * the source-text ordering test in admin/actionCenter.wiring.test.ts only reads
 * line order. This one runs the code. (Verified: hoisting the
 * visibleActionQueue memo above `const actionQueue` fails here with exactly
 * that ReferenceError.)
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
    // These two resolve { success } now, never undefined — a swallowed failure
    // is what made a rejected approval hide the lot until reload.
    approveListing: async () => ({ success: true }), rejectListing: async () => ({ success: true }),
    setAuctionViewing: async () => {},
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
import { ActionCenterSection } from './admin/ActionCenterSection';
import { buildActionQueue } from '../utils/actionQueue';

describe('probe', () => {
  it('executes the whole component body with a live action row', () => {
    const html = renderToStaticMarkup(React.createElement(AdminDashboardView));
    expect(html).toContain('Needs your attention');
    expect(html).toContain('Lot awaiting approval');  // the queue produced a row
    expect(html).toContain('>1<');                    // badge counts the FILTERED queue
    expect(html).not.toContain('Working');            // nothing in flight yet
  });
});

describe('the busy flag reaches a card at runtime', () => {
  // Rows are collapsed by default, so the dashboard render above never reaches
  // a card body. Without this, `busy={false}` hard-coded on a card and a
  // missing `isPending` prop would BOTH survive the suite and `tsc` — JSX prop
  // checking is inert here because @types/react is not installed.
  const auction = {
    id: 'lot-1', status: 'processing', title: 'A lot', startingPrice: 10,
    thumbnailUrl: 'https://x/y.jpg', createdAt: Date.now() - 1000,
  };
  const queue = buildActionQueue(
    { orders: [], pendingListings: [auction], subscriptionRequests: [], withdrawals: [] },
    Date.now(),
  );

  const renderSection = (isPending: (id: string) => boolean) => renderToStaticMarkup(
    React.createElement(ActionCenterSection, {
      isAr: false, queue, orders: [], pendingListings: [auction],
      subscriptionRequests: [], withdrawals: [], users: [],
      isPending,
      initialExpandedId: queue[0].id,
      handlers: {} as any,
    }),
  );

  it('builds the row id the handlers use', () => {
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('approve_listing:lot-1');
  });

  it('shows the working label while THAT row is in flight', () => {
    const html = renderSection((id) => id === 'approve_listing:lot-1');
    expect(html).toContain('Working');
    expect(html).not.toContain('APPROVE &amp; GO LIVE');
  });

  it('shows the normal label when it is not', () => {
    const html = renderSection(() => false);
    expect(html).toContain('APPROVE &amp; GO LIVE');
    expect(html).not.toContain('Working');
  });

  it('keys the flag on the ROW id, not on any row being busy', () => {
    const html = renderSection((id) => id === 'approve_listing:some-other-lot');
    expect(html).toContain('APPROVE &amp; GO LIVE');
    expect(html).not.toContain('Working');
  });
});
