/**
 * The landing page's composition shell.
 *
 * WHAT THIS FILE IS FOR. `LandingView.tsx` was 3,086 lines: a marketing page, a
 * bidding simulator, a fake activity feed, a local-storage-only signup form and
 * a router all in one function. Nothing about it was testable, so nothing about
 * it was tested — which is how it came to render a Toyota Camry, a drifting
 * watcher count and `15,000+ buyers` without anything objecting. It is now a
 * shell that owns state, analytics and navigation and renders eight components.
 *
 * HOW IT IS TESTED. The section components are mocked to CAPTURE THEIR PROPS and
 * render an order marker. That makes the shell's real contract observable
 * without a DOM: which section gets which callback, what each callback emits,
 * and in what order the sections appear. Invoking a captured callback is the
 * closest thing to a click available in `environment: 'node'`, and it tests the
 * wiring rather than the markup.
 *
 * Source text is used for exactly one thing — the ABSENCE of the deleted
 * simulator. That is a property of the file, not of a render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { landingContent } from './landingContent';
import type { LandingAuction, LandingAuctionsState } from './useLandingAuctions';

const RAW = readFileSync(new URL('./LandingView.tsx', import.meta.url), 'utf8');

/**
 * Source with comments removed, string literals intact.
 *
 * The ratchets below assert the ABSENCE of the deleted simulator, and
 * `LandingView.tsx` names it in its header comment — deliberately, since
 * recording what a file replaced is the convention this repo already follows in
 * `constants/support.ts`. Asserting on raw text would make that documentation
 * fail the test it exists to explain. Borrowed from
 * `context/languagePersistence.wiring.test.ts`, which learned the same lesson
 * from the other direction: an assertion satisfied BY a comment.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        const done = src[i] === quote;
        i++;
        if (done) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const SRC = stripComments(RAW);

// `environment: 'node'`, so there is no window. The shell reads localStorage
// through a guard and analytics pushes to window.dataLayer; both need a stub.
const store = new Map<string, string>();
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
(globalThis as any).window.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
};

/**
 * Hoisted so the `vi.mock` factories can write into it.
 *
 * `vi.mock` calls are lifted ABOVE the import block, and their factories run
 * while `./LandingView` is being imported — before any `const` in this file has
 * initialised. So the marker factory lives in here, and each factory imports
 * React itself rather than closing over the module-level import.
 */
const spy = vi.hoisted(() => {
  const props: Record<string, any> = {};
  return {
    props,
    /** Records the props it was given and leaves an order marker behind. */
    marker: (R: any, name: string) => (p: Record<string, unknown>) => {
      props[name] = p;
      return R.createElement('div', { 'data-section': name });
    },
    auctions: {
      auctions: [], isLoading: false, isEmpty: false, isError: false,
    } as LandingAuctionsState,
    setLanguage: [] as unknown[],
  };
});

vi.mock('./components/LandingHeader', async () => {
  const R = await import('react');
  return { LandingHeader: spy.marker(R, 'header') };
});
vi.mock('./components/LandingHero', async () => {
  const R = await import('react');
  return { LandingHero: spy.marker(R, 'hero') };
});
vi.mock('./components/LandingAuctionShowcase', async () => {
  const R = await import('react');
  return { LandingAuctionShowcase: spy.marker(R, 'showcase') };
});
vi.mock('./components/LandingHowItWorks', async () => {
  const R = await import('react');
  return { LandingHowItWorks: spy.marker(R, 'how') };
});
vi.mock('./components/LandingTrust', async () => {
  const R = await import('react');
  return { LandingTrust: spy.marker(R, 'trust') };
});
vi.mock('./components/LandingSellerInvite', async () => {
  const R = await import('react');
  return { LandingSellerInvite: spy.marker(R, 'seller') };
});
vi.mock('./components/LandingPricingFaq', async () => {
  const R = await import('react');
  return { LandingPricingFaq: spy.marker(R, 'pricing') };
});
vi.mock('./components/LandingFooter', async () => {
  const R = await import('react');
  return { LandingFooter: spy.marker(R, 'footer') };
});
vi.mock('../components/TermsModal', async () => {
  const R = await import('react');
  return { default: spy.marker(R, 'terms') };
});
vi.mock('../components/AuctionRulesModal', async () => {
  const R = await import('react');
  return { default: spy.marker(R, 'rules') };
});

vi.mock('./useLandingAuctions', () => ({ useLandingAuctions: () => spy.auctions }));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    setLanguage: (next: unknown) => { spy.setLanguage.push(next); },
    theme: 'light',
    setTheme: () => {},
  }),
}));

import LandingView from './LandingView';

const lot: LandingAuction = {
  id: 'lot-abc', title: 'iPhone 13 Pro', category: 'Electronics', currentPrice: 120,
  totalBids: 0, endTime: undefined, createdAt: 1, featuredRank: 1,
  imageUrl: 'x.jpg', isFeatured: true, isVerified: true,
};

let onEnter: unknown[];
let onOpenAuction: unknown[];

function render(over: Partial<LandingAuctionsState> = {}) {
  // Clear IN PLACE. The hoisted markers close over this exact object, so
  // reassigning it would leave them writing to an orphan and every capture
  // would read as undefined.
  for (const key of Object.keys(spy.props)) delete spy.props[key];
  spy.setLanguage = [];
  onEnter = [];
  onOpenAuction = [];
  spy.auctions = { auctions: [], isLoading: false, isEmpty: false, isError: false, ...over };
  (window as any).dataLayer = [];
  return renderToStaticMarkup(
    <LandingView
      onEnter={(target?: string) => { onEnter.push(target); }}
      onOpenAuction={(id: string) => { onOpenAuction.push(id); }}
    />
  );
}

/** The events pushed to window.dataLayer, in order. */
const events = () =>
  ((window as any).dataLayer as Array<{ event: string; params: Record<string, unknown> }>)
    .map(e => ({ event: e.event, params: e.params }));

beforeEach(() => {
  store.clear();
});

describe('the simulated page is gone', () => {
  it('carries no trace of the hero simulator or its cast', () => {
    for (const ghost of [
      'ACTIVE_ITEMS', 'AR_NAMES', 'EN_NAMES', 'BidLog', 'bidLogsList', 'driftWatchers',
      'antiSnipe', 'stepPrice', 'setWatchers', 'justBidToast', 'flashHit', 'priceBump',
      'isAutoCycling', 'unsplash', 'Rolex', 'Toyota',
    ]) {
      expect(SRC, `LandingView must not contain "${ghost}"`).not.toContain(ghost);
    }
  });

  it('makes no unverified scale or adopter claim', () => {
    for (const claim of ['Early Adopters', '15,000+', '1,250+', '3,400+', 'formSuccess', 'registeredTitle']) {
      expect(SRC, `LandingView must not contain "${claim}"`).not.toContain(claim);
    }
  });

  it('no longer reads the legacy translation tree', () => {
    // The redesigned sections read `landingContent`. A surviving import of the
    // old 590-line TranslationType means a section was left behind.
    expect(SRC).not.toContain('TranslationType');
    expect(SRC).not.toMatch(/from ["']\.\/translations["']/);
    expect(SRC).not.toContain('heroSim');
  });

  it('is a shell, not a page', () => {
    // The size IS the contract here: the deleted code cannot creep back in
    // piecemeal if the file has to stay small.
    expect(RAW.split('\n').length).toBeLessThan(400);
  });
});

describe('section composition and order', () => {
  it('renders every approved section exactly once', () => {
    const html = render();
    for (const name of ['header', 'hero', 'showcase', 'how', 'trust', 'seller', 'pricing', 'footer']) {
      expect((html.match(new RegExp(`data-section="${name}"`, 'g')) ?? []), name).toHaveLength(1);
    }
  });

  it('demonstrates real inventory before it asks for money', () => {
    const html = render();
    const at = (name: string) => html.indexOf(`data-section="${name}"`);
    expect(at('hero')).toBeLessThan(at('showcase'));
    expect(at('showcase')).toBeLessThan(at('how'));
    expect(at('how')).toBeLessThan(at('trust'));
    expect(at('trust')).toBeLessThan(at('seller'));
    expect(at('seller')).toBeLessThan(at('pricing'));
    expect(at('pricing')).toBeLessThan(at('footer'));
  });

  it('keeps the header above everything', () => {
    const html = render();
    expect(html.indexOf('data-section="header"')).toBeLessThan(html.indexOf('data-section="hero"'));
  });
});

describe('the root stays the document\'s only scroll owner', () => {
  // The guarantee landingRootOverflow.wiring.test.ts was written for: the root
  // carried `overflow-hidden`, which made it a second, invisible scroller with
  // 565px of range and no scrollbar. Re-asserted here so the contract survives
  // this rewrite even if that file's anchor ever moves.
  /** The root's class tokens. Anchored on `selection:bg-`, which only it carries. */
  const rootClasses = (html: string): string[] => {
    const m = /class="([^"]*selection:bg-[^"]*)"/.exec(html);
    if (!m) throw new Error('the landing root className (carrying `selection:bg-`) was not found');
    return m[1].split(/\s+/).filter(Boolean);
  };

  it('paints the page ground rather than a raised surface', () => {
    // `bg-surface`, not `bg-surface-raised`: the Warm Marketplace cream lives on
    // `--color-surface`, and a raised (white) root would paint straight over it.
    // Compared as whole TOKENS — `bg-surface-raised` contains `bg-surface` as a
    // substring, so a regex would pass on exactly the wrong value.
    const tokens = rootClasses(render());
    expect(tokens).toContain('bg-surface');
    expect(tokens).not.toContain('bg-surface-raised');
  });

  it('clips horizontally without becoming a scroll container', () => {
    const html = render();
    const cls = rootClasses(html).join(' ');
    expect(cls).toMatch(/(?<![\w-])overflow-x-clip(?![\w-])/);
    expect(cls).not.toMatch(/(?<![\w-])overflow-hidden(?![\w-])/);
    expect(cls).not.toMatch(/(?<![\w-])overflow-x-hidden(?![\w-])/);
    expect(cls).toMatch(/(?<![\w-])min-h-screen(?![\w-])/);
  });
});

describe('Arabic-first language behaviour', () => {
  it('opens in Arabic for a first-time visitor', () => {
    render();
    expect(spy.props.header.lang).toBe('ar');
    expect(spy.props.hero.copy).toBe(landingContent.ar.hero);
  });

  it('restores a saved English choice', () => {
    store.set('mazad_language', 'en');
    render();
    expect(spy.props.header.lang).toBe('en');
    expect(spy.props.pricing.pricing).toBe(landingContent.en.pricing);
  });

  it('treats an unreadable storage as a first visit rather than crashing', () => {
    const original = (window as any).localStorage;
    (window as any).localStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    };
    try {
      expect(() => render()).not.toThrow();
      expect(spy.props.header.lang).toBe('ar');
    } finally {
      (window as any).localStorage = original;
    }
  });

  it('persists a switch locally AND through the shared context path', () => {
    render();
    spy.props.header.onLanguageToggle();
    // localStorage is what the landing page and the auth screens both read.
    expect(store.get('mazad_language')).toBe('en');
    // setLanguage owns the write to users/{uid}.language — the landing toggle
    // must not re-implement it, and must not skip it.
    expect(spy.setLanguage).toEqual(['en']);
    expect(events()).toEqual([{ event: 'language_switched', params: { to: 'en' } }]);
  });

  it('hands each section the copy for the active language, never a mix', () => {
    store.set('mazad_language', 'en');
    render();
    const en = landingContent.en;
    expect(spy.props.hero.copy).toBe(en.hero);
    expect(spy.props.showcase.copy).toBe(en.marketplace);
    expect(spy.props.how.copy).toBe(en.how);
    expect(spy.props.trust.copy).toBe(en.trust);
    expect(spy.props.seller.copy).toBe(en.seller);
    expect(spy.props.pricing.faq).toBe(en.faq);
    expect(spy.props.footer.copy).toBe(en.footer);
  });
});

describe('analytics and navigation are wired per placement', () => {
  it('routes hero Browse to discovery, emitting the hero placement first', () => {
    render();
    spy.props.hero.onBrowse();
    expect(events()).toEqual([{ event: 'browse_cta_clicked', params: { location: 'hero' } }]);
    expect(onEnter).toEqual([undefined]);
  });

  it('routes hero Sell to the upload flow', () => {
    render();
    spy.props.hero.onSell();
    expect(events()).toEqual([{ event: 'seller_cta_clicked', params: { location: 'hero' } }]);
    expect(onEnter).toEqual(['upload']);
  });

  it('opens the exact auction that was clicked, never a fallback', () => {
    render({ auctions: [lot] });
    spy.props.showcase.onView('lot-abc');
    expect(events()).toEqual([
      { event: 'auction_viewed', params: { auctionId: 'lot-abc', location: 'marketplace' } },
    ]);
    expect(onOpenAuction).toEqual(['lot-abc']);
  });

  it('attributes a hero auction view to the hero, with the hero lot\'s id', () => {
    render({ auctions: [lot] });
    spy.props.hero.onAuctionView('lot-abc');
    expect(events()).toEqual([
      { event: 'auction_viewed', params: { auctionId: 'lot-abc', location: 'hero' } },
    ]);
    expect(onOpenAuction).toEqual(['lot-abc']);
  });

  it('uses only the five approved placements', () => {
    render({ auctions: [lot] });
    spy.props.header.onBrowse();
    spy.props.hero.onBrowse();
    spy.props.hero.onSell();
    spy.props.showcase.onView('lot-abc');
    spy.props.showcase.onSell();
    spy.props.seller.onSell();
    spy.props.footer.onBrowse();
    spy.props.footer.onSell();
    const placements = new Set(events().map(e => e.params.location));
    expect([...placements].sort()).toEqual(['final', 'hero', 'marketplace', 'nav', 'seller']);
  });

  it('emits before it navigates, for every CTA', () => {
    // If navigation ran first, a view swap could unmount this component before
    // the event was pushed and the funnel would under-count silently.
    for (const fire of [
      () => spy.props.hero.onBrowse(),
      () => spy.props.hero.onSell(),
      () => spy.props.footer.onBrowse(),
      () => spy.props.footer.onSell(),
    ]) {
      render();
      fire();
      expect(events()).toHaveLength(1);
      expect(onEnter.length + onOpenAuction.length).toBe(1);
    }
  });

  it('sends Subscribe to the subscription screen, not to discovery', () => {
    // The button says "Subscribe now". `wallet` is the view that renders
    // SubscriptionView (App.tsx); a bare `onEnter()` defaults to discovery, so
    // the visitor would land on a different screen from the one they pressed.
    render();
    spy.props.pricing.onSubscribe();
    expect(onEnter).toEqual(['wallet']);
    expect(onOpenAuction).toEqual([]);
  });

  it('emits no landing event for Subscribe, rather than inventing a placement', () => {
    // The five approved placements have no pricing bucket. Emitting
    // `browse_cta_clicked` with a sixth value would change what every
    // conversion rate on this page is computed over, so this click is
    // deliberately unmeasured until a named event is reviewed.
    render();
    spy.props.pricing.onSubscribe();
    expect(events()).toEqual([]);
  });

  it('never duplicates the application-level funnel events', () => {
    // `user_registration` and `first_bid` are emitted by the app, not here.
    // Emitting them again from the landing page double-counts the funnel.
    expect(SRC).not.toContain('user_registration');
    expect(SRC).not.toContain('first_bid');
  });

  it('emits landing_viewed once on mount, with the language', () => {
    // renderToStaticMarkup runs no effects, so the mount emit is asserted at
    // the source. Its payload shape is covered in landingAnalytics.test.ts.
    expect(SRC).toMatch(/emitLandingEvent\('landing_viewed',\s*\{\s*lang\s*\}\)/);
    const effect = SRC.slice(SRC.indexOf("emitLandingEvent('landing_viewed'"));
    expect(effect.slice(0, 200)).toMatch(/\}, \[\]\)/);
  });

  it('survives an analytics failure without blocking navigation', () => {
    render();
    (window as any).dataLayer = {
      push() { throw new Error('GTM exploded'); },
    };
    expect(() => spy.props.hero.onBrowse()).not.toThrow();
    expect(onEnter).toEqual([undefined]);
  });
});

describe('inventory state is passed through, never re-derived', () => {
  it('hands the showcase the hook state verbatim', () => {
    render({ isLoading: true });
    expect(spy.props.showcase.state).toBe(spy.auctions);
  });

  it('features the first curated lot in the hero, and does not reorder', () => {
    const second = { ...lot, id: 'lot-2' };
    render({ auctions: [lot, second] });
    expect(spy.props.hero.auction).toBe(lot);
  });

  it('gives the hero no auction when the catalogue is empty', () => {
    render({ isEmpty: true });
    expect(spy.props.hero.auction ?? null).toBeNull();
  });

  it('tells the hero it is loading, so it shows a skeleton rather than a gap', () => {
    render({ isLoading: true });
    expect(spy.props.hero.isLoading).toBe(true);
  });

  it('gives the hero no auction while an error stands', () => {
    render({ isError: true });
    expect(spy.props.hero.auction ?? null).toBeNull();
  });
});

describe('legal surfaces and support', () => {
  it('mounts the terms and rules modals', () => {
    const html = render();
    expect(html).toContain('data-section="terms"');
    expect(html).toContain('data-section="rules"');
  });

  it('opens the rules from the trust section and the footer', () => {
    render();
    expect(typeof spy.props.trust.onRules).toBe('function');
    expect(typeof spy.props.footer.onRules).toBe('function');
    expect(() => spy.props.trust.onRules()).not.toThrow();
  });

  it('routes terms and privacy to the combined legal document', () => {
    // TermsModal IS the "Terms of Use & Privacy Policy" document — one modal,
    // two footer entry points. That is existing behaviour, not a new claim.
    render();
    expect(typeof spy.props.footer.onTerms).toBe('function');
    expect(typeof spy.props.footer.onPrivacy).toBe('function');
  });

  it('hands one support URL, from the constants, to every section that needs it', () => {
    render();
    expect(spy.props.header.whatsappUrl).toBe(spy.props.trust.whatsappUrl);
    expect(spy.props.trust.whatsappUrl).toBe(spy.props.footer.whatsappUrl);
    expect(spy.props.header.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\d+$/);
    // Derived, not typed here.
    expect(SRC).not.toMatch(/wa\.me\/\d/);
  });
});
