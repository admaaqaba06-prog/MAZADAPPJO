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
import { readFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// The 320px header contract.
//
// Found at 320x700 in Arabic RTL during the rendered review: the language
// control was clipped at the inline edge and the menu button was entirely
// off-screen and unreachable, while `documentElement.scrollWidth` still read
// 320 — the row was OVERFLOWING and the landing root's `overflow-x-clip` was
// clipping it rather than letting it scroll.
//
// The arithmetic behind it: the MAZZADO lockup is 600x127, so at `h-8` it is
// 151px wide, and 320px minus `px-4` leaves 288px for that lockup plus the
// theme, language and menu controls.
//
// Layout cannot be measured here — vitest runs `environment: 'node'`, there is
// no jsdom and no browser. So these assert the STRUCTURAL invariants that make
// the overflow impossible, each one a thing whose removal would bring the defect
// back. The visual confirmation is a browser row in
// docs/verification/landing-conversion-redesign.md.
// ---------------------------------------------------------------------------
const HEADER_SRC = readFileSync(new URL('./LandingHeader.tsx', import.meta.url), 'utf8');
const LOGO_SRC = readFileSync(new URL('./Logo.tsx', import.meta.url), 'utf8');
const CSS_SRC = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

describe('the header fits a 320px screen', () => {
  it('defines every responsive variant it uses', () => {
    // THE ASSERTION THAT MATTERS MOST. Tailwind's smallest default breakpoint is
    // `sm` at 640px; `xs` is a project addition. An undefined variant emits NO
    // CSS AT ALL, so every `xs:` class in the header would silently do nothing
    // and the 320px fix would be inert while still looking correct in review.
    const variants = new Set(
      [...HEADER_SRC.matchAll(/(?<![\w-])([a-z]{2,4}):[a-z[]/g)].map(m => m[1])
    );
    // Only the width variants are breakpoints; the rest are state variants.
    const BREAKPOINTS = ['xs', 'sm', 'md', 'lg', 'xl'];
    const TAILWIND_DEFAULTS = ['sm', 'md', 'lg', 'xl'];
    for (const v of variants) {
      if (!BREAKPOINTS.includes(v) || TAILWIND_DEFAULTS.includes(v)) continue;
      expect(CSS_SRC, `the header uses \`${v}:\` but no --breakpoint-${v} is defined`)
        .toMatch(new RegExp(`--breakpoint-${v}:\\s*\\d`));
    }
    // And the one it relies on is really there.
    expect(CSS_SRC).toMatch(/--breakpoint-xs:\s*360px/);
  });

  it('lets the brand give up width, and nothing else', () => {
    // The width-independent half of the fix: the control cluster is `shrink-0`,
    // so the flex algorithm can only take space from the lockup. Reversing this
    // is what allows a control to be pushed out of the row.
    expect(HEADER_SRC).toMatch(/className="flex shrink-0 items-center/);
    // The brand button opts IN to shrinking, so it must not be `shrink-0`.
    // Asserted on the className TOKENS, not on the surrounding source: the
    // comment beside it explains why `shrink-0` is absent, and a substring
    // search finds the word in that explanation.
    const brandStart = HEADER_SRC.indexOf('aria-label={copy.brandLabel}');
    expect(brandStart, 'the brand button was not found').toBeGreaterThan(-1);
    const brandClass = /className="([^"]*)"/.exec(HEADER_SRC.slice(brandStart))?.[1];
    expect(brandClass, 'the brand button has no className').toBeTruthy();
    const tokens = brandClass!.split(/\s+/);
    expect(tokens).toContain('min-w-0');
    expect(tokens).not.toContain('shrink-0');
  });

  it('caps the lockup below xs and lets it scale rather than overflow', () => {
    expect(HEADER_SRC).toMatch(/<Logo className="h-8 max-w-\[\d+px\] xs:max-w-none" \/>/);
    // Without `max-w-full` on the img, `w-auto` keeps the natural 151px and
    // overflows the capped span instead of scaling inside it — so the cap above
    // would have no effect.
    expect(LOGO_SRC).toMatch(/className="h-full w-auto max-w-full object-contain"/);
  });

  it('keeps the menu button present at every width', () => {
    // It is the ONLY route to the section links and the browse CTA below `lg`,
    // so a `hidden` variant on it strands the whole mobile navigation — which is
    // what being pushed off-screen amounted to.
    const menuStart = HEADER_SRC.indexOf('aria-expanded={open}');
    expect(menuStart, 'the menu button was not found').toBeGreaterThan(-1);
    const menuClass = /className=\{`\$\{iconButtonClass\} ([^`]*)`\}/
      .exec(HEADER_SRC.slice(menuStart))?.[1];
    expect(menuClass, 'the menu button has no className').toBeTruthy();
    const menuTokens = menuClass!.split(/\s+/);
    // `lg:hidden` is correct — above `lg` the desktop nav replaces it. A bare
    // `hidden`, or any smaller breakpoint variant, would strand the mobile menu.
    expect(menuTokens).toContain('lg:hidden');
    expect(menuTokens).not.toContain('hidden');
    for (const bp of ['xs', 'sm', 'md']) {
      expect(menuTokens, `menu must not be hidden at ${bp}`).not.toContain(`${bp}:hidden`);
    }
  });

  it('keeps the language control labelled when it collapses to an icon', () => {
    // Below `xs` the visible text is hidden, so without `aria-label` the control
    // becomes an unnamed button.
    const html = header();
    expect(html).toContain(`aria-label="${AR.nav.languageToggle}"`);
    expect(HEADER_SRC).toMatch(/<span className="hidden xs:inline">\{copy\.languageToggle\}<\/span>/);
    expect(HEADER_SRC).toMatch(/className="w-4 h-4 xs:hidden"/);
  });

  it('tightens padding and gaps below xs, and restores them above', () => {
    // The measured ~30px that turns "just fits" into "fits comfortably".
    expect(HEADER_SRC).toContain('px-3 xs:px-4 sm:px-6');
    expect(HEADER_SRC).toContain('gap-2 xs:gap-3');
    expect(HEADER_SRC).toContain('gap-1.5 xs:gap-2');
  });

  it('still renders every narrow-width control in the markup', () => {
    // Belt and braces: whatever the CSS does, the brand, the language control
    // and the menu button must all exist to be tappable at 320px.
    const html = header();
    expect(html).toContain(`aria-label="${AR.nav.brandLabel}"`);
    expect(html).toContain(`aria-label="${AR.nav.languageToggle}"`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(AR.nav.menuOpenLabel);
  });
});

// ---------------------------------------------------------------------------
// Why the 320px result generalises across theme and direction.
//
// The 320px defect (D1) was fixed and confirmed at a true 320x700 viewport in
// Arabic RTL light. The other three 320px cells — Arabic dark, English light,
// English dark — were not separately observed. Rather than assume they follow,
// this proves it: the header's SIZING and LAYOUT carry no theme-conditional and
// no direction-conditional variant, so no theme or direction can change what
// fits in the row. Colour variants are irrelevant to overflow and are ignored.
// ---------------------------------------------------------------------------
describe('the header layout is independent of theme and direction', () => {
  /** Class tokens that affect how much horizontal room something takes. */
  const LAYOUT = /^(w-|max-w-|min-w-|px-|pe-|ps-|pl-|pr-|p-|gap-|mx-|ms-|me-|ml-|mr-|basis-|flex-|shrink|grow|hidden$|inline|block|text-\[|text-(xs|sm|base|lg|xl))/;

  const classAttrs = [...HEADER_SRC.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map(m => m[1] ?? m[2]);

  it('finds the header class lists to inspect', () => {
    expect(classAttrs.length).toBeGreaterThan(4);
  });

  it('gates no layout class on the theme', () => {
    // A `dark:` variant on a width, a gap or a padding would make the dark
    // header a different size from the light one, and the 320px budget would
    // hold for only one of them.
    const offenders = classAttrs
      .flatMap(a => a.split(/\s+/))
      .filter(t => t.startsWith('dark:'))
      .filter(t => LAYOUT.test(t.slice(5)));
    expect(offenders, 'theme-conditional layout in the header').toEqual([]);
  });

  it('gates no layout class on the reading direction', () => {
    // `rtl:`/`ltr:` variants on sizing would do the same across languages.
    // Logical properties (`ms-`, `pe-`, `start-`) are the correct tool and are
    // direction-aware WITHOUT a variant, so they are not offenders.
    const offenders = classAttrs
      .flatMap(a => a.split(/\s+/))
      .filter(t => t.startsWith('rtl:') || t.startsWith('ltr:'));
    expect(offenders, 'direction-conditional classes in the header').toEqual([]);
  });

  it('sizes the language control identically in both languages', () => {
    // The control renders `copy.languageToggle`, whose two values differ in
    // length ("English" vs "العربية"). Below `xs` it collapses to a fixed-size
    // icon button, so the narrow-width budget cannot depend on which language
    // is active — which is the specific reason 320 EN and 320 AR behave alike.
    expect(HEADER_SRC).toMatch(/h-9 w-9 xs:h-auto xs:w-auto/);
    expect(HEADER_SRC).toMatch(/className="w-4 h-4 xs:hidden"/);
  });
});

// ---------------------------------------------------------------------------
// Reduced motion, verified against the stylesheet rather than an OS setting.
// ---------------------------------------------------------------------------
describe('every landing animation stops under reduced motion', () => {
  /** Animation-bearing rules the landing page owns. */
  const landingAnimations = [...CSS_SRC.matchAll(/\.landing-[\w-]*\s*\{[^}]*animation:[^;}]*/g)]
    .map(m => m[0]);

  it('has landing animations to check', () => {
    expect(landingAnimations.length).toBeGreaterThan(0);
  });

  it('disables each of them inside a prefers-reduced-motion block', () => {
    const reduced = CSS_SRC.slice(CSS_SRC.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const rule of landingAnimations) {
      const cls = /\.(landing-[\w-]*)/.exec(rule)?.[1];
      expect(cls, `could not read the class from: ${rule}`).toBeTruthy();
      expect(
        reduced,
        `.${cls} animates but is never disabled under prefers-reduced-motion`
      ).toMatch(new RegExp(`\\.${cls}[^}]*\\{[^}]*animation:\\s*none`));
    }
  });

  it('keeps the hero entrance gated on the motion preference', () => {
    // The hero is the only component-level animation; it must render its final
    // state directly rather than animate to it quickly.
    const hero = readFileSync(new URL('./LandingHero.tsx', import.meta.url), 'utf8');
    expect(hero).toContain('useReducedMotion');
    expect(hero).toMatch(/reduce\s*\?\s*\{\}/);
  });
});
