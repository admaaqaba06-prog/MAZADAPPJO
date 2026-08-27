/**
 * Executes the redesigned header and hero.
 *
 * `renderToStaticMarkup` because vitest here is `environment: 'node'` with no
 * jsdom — the house idiom, per `src/components/ui/themeToggle.render.test.tsx`.
 * It runs no effects and dispatches no events, so these tests prove what the
 * markup SAYS: ordering, semantics, accessible wiring, and — the point of the
 * whole exercise — the ABSENCE of activity the data does not support.
 *
 * The old hero is what these guard against. It rendered a hard-coded Toyota
 * Camry and a Rolex from Unsplash, a bidder count that drifted upward on a
 * timer, a fake bid log with invented Jordanian names, and a countdown that
 * ticked regardless of whether any auction had a clock. Every one of those read
 * as real marketplace activity to a first-time visitor. The assertions below
 * fail if any of it returns.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LandingAuction } from '../useLandingAuctions';
import { landingContent } from '../landingContent';

// Icons render as nothing: they carry no accessible text, and stubbing them
// keeps these assertions about copy and structure rather than svg paths.
vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

// ThemeToggle reads the app context. The header must not require a provider to
// render, and the theme itself is covered by themeToggle.render.test.tsx.
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ theme: 'light', setTheme: () => {} }),
}));

import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';

/** A real-shaped lot: `first_bid`, so no bids and NO clock. */
const lot: LandingAuction = {
  id: 'lot-real-1',
  title: 'iPhone 13 Pro 256GB',
  category: 'Electronics',
  currentPrice: 120,
  totalBids: 0,
  endTime: undefined,
  createdAt: 1_700_000_000_000,
  featuredRank: 1,
  imageUrl: 'https://firebasestorage.googleapis.com/lot-real-1.jpg',
  isFeatured: true,
  isVerified: true,
};

const AR = landingContent.ar;
const EN = landingContent.en;

function hero(props: Partial<React.ComponentProps<typeof LandingHero>> = {}) {
  return renderToStaticMarkup(
    <LandingHero
      lang="ar"
      copy={AR.hero}
      firstBidLabel={AR.marketplace.firstBidLabel}
      firstBidHint={AR.marketplace.firstBidHint}
      auction={lot}
      isLoading={false}
      onBrowse={() => {}}
      onSell={() => {}}
      onAuctionView={() => {}}
      {...props}
    />
  );
}

function header(props: Partial<React.ComponentProps<typeof LandingHeader>> = {}) {
  return renderToStaticMarkup(
    <LandingHeader
      lang="ar"
      copy={AR.nav}
      onBrowse={() => {}}
      onLanguageToggle={() => {}}
      whatsappUrl="https://wa.me/962785168550"
      {...props}
    />
  );
}

describe('LandingHero', () => {
  it('renders browse as the primary hero action and sell as secondary', () => {
    const html = hero();
    expect(html.indexOf('تصفّح المزادات')).toBeLessThan(html.indexOf('بيع منتجك'));
    expect(html).toContain('ابدأ المزاد');
  });

  it('never invents hero auction activity for a clockless lot', () => {
    const html = hero({ auction: { ...lot, endTime: undefined, totalBids: 0 } });
    expect(html).toContain(AR.marketplace.firstBidLabel);
    expect(html).not.toMatch(/\d\d:\d\d/);
    expect(html).not.toContain('watching');
  });

  it('renders no countdown even for a lot whose clock is a bare zero', () => {
    // `endTime: 0` is the shape `isLiveNow` treats as clockless and curation
    // therefore KEEPS. Read as a number it is 1970, which is how a "-56 years"
    // countdown ships.
    const html = hero({ auction: { ...lot, endTime: 0, totalBids: 0 } });
    expect(html).toContain(AR.marketplace.firstBidLabel);
    expect(html).not.toMatch(/\d\d:\d\d/);
  });

  it('shows the first-bid explanation next to the badge, not a bare label', () => {
    // A badge saying "Be the first" with no clock and no explanation is the
    // state a visitor reads as broken. The sentence is the whole point.
    expect(hero()).toContain(AR.marketplace.firstBidHint);
  });

  it('renders the first-bid claim it was given, never one of its own', () => {
    // Guards against the sentence being re-stated inside the component, which
    // is how a reviewed claim about auction timing acquires an unreviewed
    // second copy. A sentinel proves the rendered text is the prop.
    const html = hero({ firstBidHint: 'SENTINEL-HINT-TEXT' });
    expect(html).toContain('SENTINEL-HINT-TEXT');
    expect(html).not.toContain(AR.marketplace.firstBidHint);
  });

  it('stops claiming a first bid once the lot actually has one', () => {
    const html = hero({ auction: { ...lot, totalBids: 3, endTime: 1_900_000_000_000 } });
    expect(html).not.toContain(AR.marketplace.firstBidLabel);
    expect(html).not.toContain(AR.marketplace.firstBidHint);
  });

  it('features the real lot: its own title, price and category', () => {
    const html = hero();
    expect(html).toContain('iPhone 13 Pro 256GB');
    expect(html).toContain('120');
    expect(html).toContain('د.أ');
    expect(html).toContain('إلكترونيات'); // categoryLabel('Electronics', ar)
  });

  it('binds the view action to the lot it rendered, never to a fixed id', () => {
    // The plan's hard requirement: `onAuctionView` must not fall back to a
    // different auction. A hard-coded id passes every other assertion here.
    expect(hero()).toContain('data-auction-id="lot-real-1"');
    expect(hero({ auction: { ...lot, id: 'lot-other-9' } }))
      .toContain('data-auction-id="lot-other-9"');
  });

  it('carries no simulated inventory, remote stock imagery, or activity feed', () => {
    const html = hero();
    for (const ghost of ['unsplash', 'Rolex', 'Toyota', 'Camry', 'bidder', 'Just now']) {
      expect(html.toLowerCase(), `hero must not render "${ghost}"`)
        .not.toContain(ghost.toLowerCase());
    }
  });

  it('renders a stable skeleton while loading, with no product data', () => {
    const html = hero({ isLoading: true, auction: undefined });
    expect(html).toContain('data-hero-skeleton');
    expect(html).not.toContain('iPhone 13 Pro 256GB');
    expect(html).not.toContain(AR.marketplace.firstBidLabel);
    // The headline and both CTAs stay: the hero is not blocked on Firestore.
    expect(html).toContain('تصفّح المزادات');
    expect(html).toContain('اكتشف صفقتك');
  });

  it('renders an honest fallback panel when no lot is available', () => {
    const html = hero({ auction: null, isLoading: false });
    expect(html).toContain(AR.hero.fallbackTitle);
    expect(html).toContain(AR.hero.fallbackBody);
    expect(html).not.toContain('data-auction-id');
    expect(html).not.toContain(AR.marketplace.firstBidLabel);
  });

  it('keeps a lot with no image readable instead of rendering an empty img', () => {
    const html = hero({ auction: { ...lot, imageUrl: '' } });
    expect(html).not.toContain('src=""');
    expect(html).toContain('iPhone 13 Pro 256GB');
    expect(html).toContain('data-hero-image-fallback');
  });

  it('gives the lot image meaningful alt text, not a decorative blank', () => {
    expect(hero()).toContain('alt="iPhone 13 Pro 256GB"');
  });

  it('renders one h1 only — the page headline', () => {
    expect((hero().match(/<h1/g) ?? [])).toHaveLength(1);
  });

  it('renders English copy with no Arabic leaking through', () => {
    const html = hero({
      lang: 'en',
      copy: EN.hero,
      firstBidLabel: EN.marketplace.firstBidLabel,
      firstBidHint: EN.marketplace.firstBidHint,
    });
    expect(html).toContain('Browse auctions');
    expect(html).toContain('Find your deal');
    expect(html).toContain('JOD');
    expect(html).toContain('Electronics');
    expect(html).not.toMatch(/[؀-ۿ]/);
  });
});

describe('LandingHeader', () => {
  it('is a semantic header with a navigation landmark', () => {
    const html = header();
    expect(html).toContain('<header');
    expect(html).toContain('<nav');
  });

  it('gives the brand lockup an accessible name', () => {
    // The logo is an image with no surrounding text; without this the first
    // control in the tab order announces as "link".
    expect(header()).toContain(`aria-label="${AR.nav.brandLabel}"`);
  });

  it('links only to sections the page actually renders', () => {
    const html = header();
    for (const link of AR.nav.links) {
      expect(html, `missing anchor for #${link.id}`).toContain(`href="#${link.id}"`);
      expect(html).toContain(link.label);
    }
    // No anchor to a section that no longer exists — the exact defect
    // landingSectionNav.wiring.test.ts was written for. Compared as a SET: the
    // desktop row and the mobile menu legitimately render the same anchors, so
    // duplicates are expected and only the reachable ids are the contract.
    const hrefs = new Set([...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]));
    expect([...hrefs].sort()).toEqual(AR.nav.links.map(l => l.id).sort());
  });

  it('exposes the mobile menu button as a labelled, collapsed disclosure', () => {
    const html = header();
    expect(html).toContain('aria-expanded="false"');
    const controls = /aria-controls="([^"]+)"/.exec(html);
    expect(controls, 'menu button must reference the panel it controls').not.toBeNull();
    // The referenced id must actually exist, or the reference is a dead pointer.
    expect(html).toContain(`id="${controls![1]}"`);
    expect(html).toContain(AR.nav.menuOpenLabel);
  });

  it('offers the language it would switch TO', () => {
    // Same rule ThemeToggle follows: a control reading "العربية" while already
    // Arabic reads as broken.
    expect(header()).toContain('English');
    expect(header({ lang: 'en', copy: EN.nav })).toContain('العربية');
  });

  it('takes the support link from the caller instead of hardcoding a number', () => {
    const html = header({ whatsappUrl: 'https://wa.me/962700000000' });
    expect(html).toContain('https://wa.me/962700000000');
    expect(html).not.toContain('962785168550');
  });

  it('opens the support link safely in a new tab', () => {
    const html = header();
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('keeps a browse action in the header for the primary funnel', () => {
    expect(header()).toContain(AR.nav.browseCta);
  });
});
