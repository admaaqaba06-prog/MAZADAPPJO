/**
 * Executes FeaturedSection's component body.
 *
 * WHY IT EXISTS: this repo has no `@types/react` and is non-strict, so `tsc`
 * checks nothing about JSX call sites — a bad prop, a TDZ ordering fault, or a
 * hook called conditionally all survive a clean lint AND the unit suite, then
 * blow up the instant an admin opens the panel. The pure helpers
 * (`featuredRank`, `featuredService`) are unit-tested; nothing else executed
 * this component until now.
 *
 * Vitest here is `environment: 'node'` — no jsdom, no @testing-library — so
 * this uses react-dom/server, exactly like adminDashboard.render.test.tsx.
 * That renders once and runs NO effects, so the onSnapshot subscription never
 * fires: this proves the component renders, not that the subscription works.
 * The empty state is therefore what renders here, which is the point — it is
 * the state every admin sees before pinning anything.
 *
 * MAINTENANCE: every non-pure import has to be mocked below. If this starts
 * failing after you add an import, add its mock — do not delete the test.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// A bare Proxy would answer `then` with a function, making the module namespace
// a thenable — `import()` would then never resolve and the run hangs.
vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
  limit: () => ({}), orderBy: () => ({}), onSnapshot: () => () => {},
  writeBatch: () => ({ update: () => {}, commit: async () => {} }),
  deleteField: () => ({}),
}));
vi.mock('../../services/firebase', () => ({ db: {} }));
// Reorder.Group / Reorder.Item must still render their children as real
// elements, or a broken list would render as nothing and pass.
vi.mock('motion/react', () => ({
  Reorder: {
    Group: ({ children }: any) => React.createElement('ul', null, children),
    Item: ({ children }: any) => React.createElement('li', null, children),
  },
}));
vi.mock('../../hooks/useAdminAuctionSearch', () => ({
  useAdminAuctionSearch: () => ({
    results: [], nbHits: 0, loading: false, loadingMore: false,
    error: false, active: false, hasMore: false, loadMore: () => {},
  }),
}));

import FeaturedSection from './FeaturedSection';

describe('FeaturedSection renders', () => {
  it('renders the empty state in English without throwing', () => {
    const html = renderToStaticMarkup(React.createElement(FeaturedSection, { isAr: false }));
    expect(html).toContain('Featured lots');
    // The counter must read off FEATURED_CAP, not a hardcoded number.
    expect(html).toContain('0/6');
    expect(html).toContain('Nothing featured yet.');
    // Below the cap, the picker is available rather than showing the cap notice.
    expect(html).toContain('Search a live lot to feature');
    expect(html).not.toContain('Cap reached');
  });

  it('renders in Arabic', () => {
    const html = renderToStaticMarkup(React.createElement(FeaturedSection, { isAr: true }));
    expect(html).toContain('المزادات المميزة');
    expect(html).toContain('لا توجد مزادات مميزة بعد.');
  });
});
