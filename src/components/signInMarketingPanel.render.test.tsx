// The sign-in marketing panel, tested on what it actually renders.
//
// vitest here is `environment: 'node'` — no jsdom, no @testing-library, and
// neither may be added. `renderToStaticMarkup` (the technique PR #222 introduced
// in contactCompletionModal.render.test.tsx) renders a component to a string in
// plain node, which is far stronger than the source-text assertions this repo
// has leaned on elsewhere: those pass whenever the string appears, including in
// a comment or a dead branch.
//
// The panel is presentational and props-only precisely so it can be rendered
// here without a context, a fetch, or a router.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Icons render to nothing — they carry no assertable content and would drag in
// an ESM-only package. Same proxy mock as contactCompletionModal.render.test.tsx.
vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

import { SignInMarketingPanel } from './SignInMarketingPanel';
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

const lot = (over: Partial<LandingAuction> = {}): LandingAuction => ({
  id: 'a1',
  title: 'Apple Watch Ultra',
  category: 'misc' as LandingAuction['category'],
  currentPrice: 145,
  totalBids: 3,
  endTime: undefined,
  createdAt: 1,
  featuredRank: undefined,
  imageUrl: 'https://x/y.jpg',
  isFeatured: false,
  isVerified: true,
  ...over,
});

const state = (over: Partial<LandingAuctionsState> = {}): LandingAuctionsState => ({
  auctions: [lot()],
  isLoading: false,
  isEmpty: false,
  isError: false,
  ...over,
});

const render = (
  s: LandingAuctionsState,
  lang: 'ar' | 'en' = 'en',
  variant: 'full' | 'compact' | 'steps' = 'full'
) => renderToStaticMarkup(
  React.createElement(SignInMarketingPanel, { state: s, lang, variant })
);

describe('SignInMarketingPanel — live activity', () => {
  it('renders the real count and the lot', () => {
    const html = render(state({ auctions: [lot(), lot({ id: 'b' })] }));
    expect(html).toContain('2 lots live right now');
    expect(html).toContain('Apple Watch Ultra');
    expect(html).toContain('145');
  });

  it('renders at most three lots even when more are live', () => {
    const many = Array.from({ length: 8 }, (_, i) => lot({ id: `a${i}`, title: `Lot ${i}` }));
    const html = render(state({ auctions: many }));
    expect(html).toContain('8 lots live right now');   // the count is the real 8
    const shown = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => html.includes(`Lot ${i}`));
    expect(shown).toHaveLength(3);
  });

  it('renders NO lot markup while loading, and no skeleton', () => {
    const html = render(state({ isLoading: true, auctions: [] }));
    expect(html).not.toContain('lots live right now');
    expect(html).not.toMatch(/animate-pulse|skeleton|shimmer/i);
    // Nor an empty shell that implies content is coming.
    expect(html).not.toContain('<ul');
  });

  it('drops the activity block when empty or errored, and keeps the trust block', () => {
    for (const s of [
      state({ isEmpty: true, auctions: [] }),
      state({ isError: true, auctions: [] }),
      state({ isError: true, auctions: [lot()] }),   // stale list behind an error
    ]) {
      const html = render(s);
      expect(html).not.toContain('lots live right now');
      expect(html).not.toContain('Apple Watch Ultra');
      expect(html).toContain('Buy safely from anyone');  // the panel still stands alone
    }
  });

  it('says nothing about there being no auctions', () => {
    // An "unfortunately nothing is live" line on a marketing surface sells against
    // the product. Absence is silent.
    const html = render(state({ isEmpty: true, auctions: [] }));
    expect(html).not.toMatch(/no auctions|nothing live|check back|soon/i);
  });

  it('never renders a countdown — almost no live lot has a clock', () => {
    const html = render(state({ auctions: [lot({ endTime: Date.now() + 600_000 })] }));
    expect(html).not.toMatch(/ends in|ending|remaining|left\b|ينتهي|متبق/i);
  });

  it('gives every image an alt and lazy loading', () => {
    const html = render(state());
    expect(html).toMatch(/<img[^>]+alt="Apple Watch Ultra"/);
    expect(html).toMatch(/<img[^>]+loading="lazy"/);
  });
});

describe('SignInMarketingPanel — variants', () => {
  it('renders the three steps in full and omits them in compact', () => {
    expect(render(state(), 'en', 'full')).toContain('Pay by CliQ');
    expect(render(state(), 'en', 'compact')).not.toContain('Pay by CliQ');
  });

  it('renders ONLY the steps in the steps variant', () => {
    // The mobile block BELOW the card. The compact block above already carries
    // the hook and the objection; repeating them would read as a stutter.
    const html = render(state(), 'en', 'steps');
    expect(html).toContain('Pay by CliQ');
    expect(html).toContain('How it works');
    expect(html).not.toContain('lots live right now');
    expect(html).not.toContain('Buy safely from anyone');
    expect(html).not.toContain('Apple Watch Ultra');
  });

  it('mobile compact + steps together cover everything full covers', () => {
    // The mobile split must not silently drop a block.
    const mobile = render(state(), 'en', 'compact') + render(state(), 'en', 'steps');
    const full = render(state(), 'en', 'full');
    for (const claim of ['lots live right now', 'Buy safely from anyone', 'How it works', 'Pay by CliQ']) {
      expect(full, `full/${claim}`).toContain(claim);
      expect(mobile, `mobile/${claim}`).toContain(claim);
    }
  });

  it('keeps the hook and the objection in compact — mobile still gets both', () => {
    const html = render(state(), 'en', 'compact');
    expect(html).toContain('lots live right now');
    expect(html).toContain('Buy safely from anyone');
  });
});

describe('SignInMarketingPanel — language', () => {
  it('renders Arabic without English leaking', () => {
    const html = render(state(), 'ar');
    expect(html).toContain('قطعة معروضة الآن');
    expect(html).toContain('اشترِ بأمان');
    expect(html).not.toContain('lots live right now');
    expect(html).not.toContain('Buy safely from anyone');
  });

  it('uses Western digits in Arabic', () => {
    const many = Array.from({ length: 5 }, (_, i) => lot({ id: `a${i}` }));
    const html = render(state({ auctions: many }), 'ar');
    expect(html).toContain('5');
    expect(html).not.toMatch(/[٠-٩]/);
  });

  it('renders the currency in the reader language', () => {
    expect(render(state(), 'en')).toContain('JOD');
    expect(render(state(), 'ar')).toContain('د.أ');
  });
});

describe('SignInMarketingPanel — theme', () => {
  it('uses theme tokens, never a raw hex', () => {
    // src/theme.guard.test.ts is a ratchet that fails the build on new raw
    // neutrals; catching it here gives a clearer failure than a budget count.
    for (const lang of ['ar', 'en'] as const) {
      expect(render(state(), lang)).not.toMatch(/#(?:[0-9a-f]{3}){1,2}\b/i);
    }
  });

  it('renders no inline colour styles', () => {
    expect(render(state())).not.toMatch(/style="[^"]*(?:color|background)/i);
  });
});
