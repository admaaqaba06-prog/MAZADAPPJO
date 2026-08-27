// The landing page's in-page menu links must all reach the section they name.
//
// TWO defects, both measured on the rendered page before the original fix:
//
// 1. `id="why-mazzado"` sat on the TRUST section, while the real «لماذا Mazzado؟»
//    section carried NO id at all. So the menu item took you to a different
//    section, which is what read as "cropped / far from where it should be".
//
// 2. The links were bare `<a href="#…">`, so the landing position was whatever
//    the browser's fragment jump produced: the section's top flush against the
//    viewport top, with no allowance for the header sitting over it.
//
// WHAT CHANGED IN THIS FILE, and why it is not a weakening. The page is now a
// composition shell plus section components, so the old anchors are gone:
// `t.why.title` no longer exists, and neither does a hand-wired
// `onSectionLinkClick("why-mazzado")` on each of nine links. The GUARANTEES are
// unchanged and are now asserted against stable contracts instead:
//
//   - every menu link points at an id some section really declares, once
//     → now checked across the content module and the section components,
//       rather than by grepping one 3,000-line file for both halves
//   - the links stay real links
//     → checked in LandingHeader, which owns them
//   - the scroll is offset by the MEASURED header plus a reviewable gap
//   - the hash is updated with pushState, with no timers
//   - only the plain left click is hijacked
//     → all three checked in the shell, which owns the handler
//
// One assertion is deliberately STRONGER than before. The old file required all
// nine anchors to individually call the handler — a contract that holds only
// until someone adds a tenth. The shell now delegates from the root, so coverage
// is structural: there is no per-link wiring left to forget.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// these components cannot be rendered. The house idiom, per
// src/components/desktopDescription.wiring.test.ts. Behavioural coverage of the
// composition itself lives in LandingView.render.test.tsx.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { landingContent } from './landingContent';

const SHELL = readFileSync(new URL('./LandingView.tsx', import.meta.url), 'utf8');
const HEADER = readFileSync(
  new URL('./components/LandingHeader.tsx', import.meta.url),
  'utf8'
);

/** Every section component that could legitimately declare an anchor target. */
const SECTION_FILES = [
  'LandingAuctionShowcase',
  'LandingHowItWorks',
  'LandingTrust',
  'LandingSellerInvite',
  'LandingPricingFaq',
  'LandingFooter',
  'LandingHero',
] as const;

const SECTION_SOURCES = SECTION_FILES.map(name => ({
  name,
  src: readFileSync(new URL(`./components/${name}.tsx`, import.meta.url), 'utf8'),
}));

/** Files that declare `id="<id>"`. */
function declaredIn(id: string): string[] {
  const re = new RegExp(`id="${id}"`, 'g');
  return SECTION_SOURCES.filter(s => re.test(s.src)).map(s => s.name);
}

/** Index of `re` in `text`, throwing rather than silently yielding -1. */
function at(text: string, re: RegExp, label: string): number {
  const m = text.match(re);
  if (!m || m.index === undefined) throw new Error(`${label} not found — ${re}`);
  return m.index;
}

/** The body of the shell's delegated click handler. Throws if its anchor moved. */
function rootClickHandler(): string {
  const start = SHELL.indexOf('const onRootClick');
  if (start === -1) throw new Error('`const onRootClick` not found — was it renamed?');
  const end = SHELL.indexOf('return (', start);
  if (end === -1) throw new Error('no `return (` after onRootClick — anchor moved');
  return SHELL.slice(start, end);
}

/** The body of `scrollToSection`. Throws if its anchor moved. */
function scrollToSectionBody(): string {
  const start = SHELL.indexOf('const scrollToSection');
  if (start === -1) throw new Error('`const scrollToSection` not found — was it renamed?');
  const end = SHELL.indexOf('const onRootClick', start);
  if (end === -1) throw new Error('`const onRootClick` not found after scrollToSection');
  return SHELL.slice(start, end);
}

describe('the test helpers fail loudly rather than vacuously', () => {
  it('throws when an anchor is absent instead of reporting -1', () => {
    expect(() => at('nothing here', /pushState/, 'the history write')).toThrow(/not found/);
  });

  it('really sliced the live handlers, not empty strings', () => {
    expect(rootClickHandler().length).toBeGreaterThan(100);
    expect(scrollToSectionBody().length).toBeGreaterThan(100);
  });

  it('has section sources to scan', () => {
    expect(SECTION_SOURCES).toHaveLength(SECTION_FILES.length);
    for (const s of SECTION_SOURCES) expect(s.src.length).toBeGreaterThan(200);
  });
});

describe('landing menu links reach the section they name', () => {
  it('names the same sections in both languages', () => {
    // A link present in one language only is a section unreachable in the other.
    expect(landingContent.ar.nav.links.map(l => l.id))
      .toEqual(landingContent.en.nav.links.map(l => l.id));
  });

  it('points every menu link at an id some section declares exactly once', () => {
    for (const link of landingContent.ar.nav.links) {
      const owners = declaredIn(link.id);
      expect(owners, `#${link.id} is linked but no section declares it`).toHaveLength(1);
    }
  });

  it('declares no anchor target that nothing links to', () => {
    // The other direction: a section carrying an id that no menu item reaches is
    // either a dead anchor or a missing menu entry.
    const linked = new Set(landingContent.ar.nav.links.map(l => l.id));
    const declared = new Set(
      SECTION_SOURCES.flatMap(s => [...s.src.matchAll(/id="([A-Za-z][\w-]*)"/g)].map(m => m[1]))
    );
    for (const id of declared) {
      // Panel and control ids are built from template literals, so only literal
      // section ids reach this set.
      expect(linked.has(id), `id="${id}" is declared but no menu item links to it`).toBe(true);
    }
  });

  it('keeps the links real links, in the component that owns them', () => {
    // href is what makes them focusable, announced as links, and
    // middle/ctrl-clickable — and what keeps them working with JavaScript off.
    // They must not have become buttons or onClick-only divs.
    expect(HEADER).toMatch(/<a\s+key=\{link\.id\}\s+href=\{`#\$\{link\.id\}`\}/);
    // Both the desktop row and the mobile panel render from the same list.
    expect((HEADER.match(/href=\{`#\$\{link\.id\}`\}/g) ?? []).length).toBe(2);
  });
});

describe('the shell handles every in-page anchor, by delegation', () => {
  it('matches any in-page anchor rather than a fixed list of ids', () => {
    // This is what replaces "all nine links call the handler". A link added to
    // any section is covered with no wiring to remember.
    const handler = rootClickHandler();
    expect(handler).toMatch(/closest\?\.\('a\[href\^="#"\]'\)/);
    expect(handler).toMatch(/getAttribute\('href'\)/);
  });

  it('only hijacks the plain left click', () => {
    const handler = rootClickHandler();
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      expect(handler, `${key} must be left to the browser`).toContain(key);
    }
    expect(handler).toMatch(/e\.button\s*!==\s*0/);
    expect(handler).toMatch(/defaultPrevented/);
    // And it only preventDefaults once it has actually scrolled somewhere, so a
    // link to a section that is not on the page still behaves like a link.
    expect(handler).toMatch(/if\s*\(scrollToSection\(id\)\)\s*e\.preventDefault\(\)/);
  });
});

describe('the scroll lands the section below the header', () => {
  it('offsets by the measured header and a reviewable 12-24px gap', () => {
    const body = scrollToSectionBody();
    expect(body).toMatch(/-\s*headerOverlap\(\)/);
    expect(body).toMatch(/-\s*SECTION_TOP_GAP/);
    const gap = SHELL.match(/const SECTION_TOP_GAP\s*=\s*(\d+)/);
    expect(gap, 'SECTION_TOP_GAP must be a plain numeric constant').toBeTruthy();
    const px = Number(gap![1]);
    expect(px).toBeGreaterThanOrEqual(12);
    expect(px).toBeLessThanOrEqual(24);
  });

  it('measures the real <header>, not a wrapper around it', () => {
    // A ref on a wrapper around <LandingHeader/> needs `display: contents` to
    // stay out of the layout, which makes the wrapper's own `position` `static`.
    // `headerOverlap` would then read `static`, return 0, and land every section
    // one header-height too high — under the header. Found in the tree instead.
    const overlap = SHELL.slice(
      at(SHELL, /const headerOverlap/, 'headerOverlap'),
      at(SHELL, /const scrollToSection/, 'scrollToSection')
    );
    expect(overlap).toMatch(/querySelector\('header'\)/);
    expect(overlap).not.toMatch(/headerRef/);
    expect(SHELL).not.toMatch(/className="contents"/);
  });

  it('measures the header instead of hardcoding a height', () => {
    const overlap = SHELL.slice(
      at(SHELL, /const headerOverlap/, 'headerOverlap'),
      at(SHELL, /const scrollToSection/, 'scrollToSection')
    );
    expect(overlap).toMatch(/getBoundingClientRect\(\)/);
    expect(overlap).toMatch(/getComputedStyle/);
  });

  it('treats `clip` as not establishing a scrollport', () => {
    // The root carries `overflow-x-clip`, which per spec clips WITHOUT creating
    // a scroll container — so the header DOES stick and its height must be
    // subtracted. The previous check treated every non-`visible` overflow as a
    // scrollport, which was right under the old `overflow-hidden` root and
    // became wrong the moment that was fixed: it would return 0 and land every
    // section one header-height too high, under the header.
    const overlap = SHELL.slice(
      at(SHELL, /const headerOverlap/, 'headerOverlap'),
      at(SHELL, /const scrollToSection/, 'scrollToSection')
    );
    expect(overlap).toMatch(/!==\s*['"]clip['"]/);
    expect(overlap).toMatch(/!==\s*['"]visible['"]/);
  });

  it('scrolls smoothly via window.scrollTo, never below zero', () => {
    const body = scrollToSectionBody();
    expect(body).toMatch(/window\.scrollTo\(\{[\s\S]*behavior:\s*'smooth'/);
    expect(body).toMatch(/Math\.max\(0,/);
  });

  it('updates the hash without breaking Back, and without a timer', () => {
    const body = scrollToSectionBody();
    // pushState keeps a history entry and carries the existing state object.
    // Assigning location.hash would make the browser add its own instant jump
    // on top of the smooth scroll — the jitter this exists to remove.
    expect(body).toMatch(/history\.pushState\(/);
    expect(body).not.toMatch(/location\.hash\s*=/);
    expect(body).not.toMatch(/setTimeout|requestAnimationFrame/);
  });
});

describe('the shell does not paper over the old scroll bug', () => {
  it('never forces the scroll position from a listener or strips the hash', () => {
    // The forbidden workarounds for the second-scroller defect. Any of them
    // would mask a regression of the real fix (`overflow-x-clip` on the root).
    expect(SHELL).not.toMatch(/scroll(?:Top|Y)\s*=\s*0[\s\S]{0,80}addEventListener\(\s*['"]scroll/);
    expect(SHELL).not.toMatch(/addEventListener\(\s*['"]hashchange/);
  });
});
