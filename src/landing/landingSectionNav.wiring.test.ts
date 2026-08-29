// The landing page's in-page menu links must all reach the section they name,
// and must land it below the sticky header.
//
// THREE defects sit behind this file, all measured on the rendered page:
//
// 1. `id="why-mazzado"` sat on the TRUST section while the real «لماذا Mazzado؟»
//    section carried no id at all, so the menu item went somewhere else.
//
// 2. The links were bare `<a href="#…">`, so the section landed flush against
//    the viewport top with the header sitting over its heading.
//
// 3. The fix for (2) was a `preventDefault()` handler driving
//    `window.scrollTo({behavior:'smooth'})`. A browser review measured that
//    turning the links into DEAD LINKS: where smooth scrolling is unavailable
//    the scroll silently did nothing while `preventDefault` had already
//    suppressed the browser's own jump — `location.hash` changed to `#how` and
//    `window.scrollY` stayed at 0. Verified against a control page carrying none
//    of the application's code, where `behavior:'smooth'` was equally inert
//    while `behavior:'instant'` moved: the suppression was environmental, but
//    the failure mode it exposed was ours. Handing a link to the browser and
//    offsetting it with `scroll-margin-top` cannot fail that way, because there
//    is nothing left to suppress.
//
// WHAT THIS FILE GUARANTEES, unchanged across all three fixes:
//   - every menu link points at an id some section really declares, exactly once
//   - nothing declares an anchor that no menu item reaches
//   - the links stay real links
//   - the section lands clear of the sticky header
//   - Back still works, and no timer is involved
//
// Two of those are now STRONGER than the arrangement they replace. Coverage of
// the offset is structural rather than per-link: the old file asserted that all
// nine anchors individually called the handler, which holds only until someone
// adds a tenth, whereas `scroll-margin-top` applies to `section[id]` and cannot
// be forgotten. And Back is now native rather than a `pushState` call.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// these components cannot be rendered. The house idiom, per
// src/components/desktopDescription.wiring.test.ts. Behavioural coverage of the
// composition lives in LandingView.render.test.tsx.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { landingContent } from './landingContent';

const SHELL_RAW = readFileSync(new URL('./LandingView.tsx', import.meta.url), 'utf8');

/**
 * Source with comments removed, string literals intact.
 *
 * `LandingView.tsx` documents the dead-link defect it was changed to fix, which
 * means its header comment necessarily contains the words `preventDefault` and
 * `window.scrollTo`. Asserting those are absent from the RAW text would make the
 * documentation fail the test it exists to explain. The same idiom, for the same
 * reason, as context/languagePersistence.wiring.test.ts — which learned it from
 * the other direction, having once had an assertion satisfied BY a comment.
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

const SHELL = stripComments(SHELL_RAW);
const HEADER = readFileSync(
  new URL('./components/LandingHeader.tsx', import.meta.url),
  'utf8'
);
const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

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
  return SECTION_SOURCES.filter(s => s.src.includes(`id="${id}"`)).map(s => s.name);
}

describe('the test helpers fail loudly rather than vacuously', () => {
  it('has section sources to scan', () => {
    expect(SECTION_SOURCES).toHaveLength(SECTION_FILES.length);
    for (const s of SECTION_SOURCES) expect(s.src.length).toBeGreaterThan(200);
  });

  it('has content links to scan', () => {
    expect(landingContent.ar.nav.links.length).toBeGreaterThan(0);
  });

  it('strips comments, and still leaves the real code', () => {
    // Without this the assertions below would be vacuous the moment the stripper
    // broke: everything would look absent because everything was removed.
    expect(SHELL_RAW).toMatch(/preventDefault/);   // present, in the header comment
    expect(SHELL).not.toMatch(/preventDefault/);   // and nowhere in the code
    expect(SHELL).toContain('export default function LandingView');
    expect(SHELL.length).toBeGreaterThan(SHELL_RAW.length / 3);
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
    const linked = new Set(landingContent.ar.nav.links.map(l => l.id));
    const declared = new Set(
      SECTION_SOURCES.flatMap(s => [...s.src.matchAll(/id="([A-Za-z][\w-]*)"/g)].map(m => m[1]))
    );
    for (const id of declared) {
      expect(linked.has(id), `id="${id}" is declared but no menu item links to it`).toBe(true);
    }
  });

  it('keeps the links real links, in the component that owns them', () => {
    // href is what makes them focusable, announced as links, middle-clickable,
    // and working before the JavaScript loads. With the scroll handler gone,
    // the href is now the ONLY thing that navigates — so this matters more than
    // it did, not less.
    expect(HEADER).toMatch(/<a\s+key=\{link\.id\}\s+href=\{`#\$\{link\.id\}`\}/);
    // The desktop row and the mobile panel render from the same list.
    expect((HEADER.match(/href=\{`#\$\{link\.id\}`\}/g) ?? []).length).toBe(2);
  });
});

describe('the section lands clear of the sticky header', () => {
  /** The `scroll-margin-top` rule that supplies the offset. */
  function scrollMarginRule(): string {
    const m = /\.landing-root section\[id\]\s*\{([^}]*)\}/.exec(CSS);
    if (!m) throw new Error('no `.landing-root section[id]` scroll-margin rule in index.css');
    return m[1];
  }

  it('reserves scroll margin on every anchored section', () => {
    // Applies to `section[id]` rather than to a list of ids, so a section added
    // later is covered with nothing to remember.
    expect(scrollMarginRule()).toMatch(/scroll-margin-top:/);
  });

  it('puts every anchor target on a <section>, which is what the rule selects', () => {
    // The rule is `section[id]`. An id on a <div> would be linked, reachable,
    // and land under the header — silently, because nothing else would notice.
    for (const link of landingContent.ar.nav.links) {
      const owner = SECTION_SOURCES.find(s => s.src.includes(`id="${link.id}"`));
      expect(owner, `no owner for #${link.id}`).toBeTruthy();
      expect(
        owner!.src,
        `#${link.id} must sit on a <section> for the scroll-margin rule to apply`
      ).toMatch(new RegExp(`<section[^>]*\\sid="${link.id}"`));
    }
  });

  it('clears the header height with room to spare', () => {
    // The header is `h-16` = 4rem, plus a 1rem gap.
    const rule = scrollMarginRule();
    expect(rule).toMatch(/calc\(\s*4rem\s*\+\s*1rem\s*\)/);
    // And the height it is derived from is still what the header uses. Changing
    // the header height fails HERE, pointing at the constant that must follow.
    expect(HEADER, 'header height changed — update the scroll-margin in index.css')
      .toMatch(/className="flex h-16 items-center/);
  });
});

describe('nothing intercepts a section link', () => {
  // The D2 guarantee. Every assertion here forbids a way of reintroducing
  // "the hash changed and the page never moved".
  it('never calls preventDefault on a navigation', () => {
    expect(SHELL).not.toMatch(/preventDefault/);
  });

  it('runs no scroll machinery of its own', () => {
    for (const gone of ['scrollToSection', 'headerOverlap', 'SECTION_TOP_GAP', 'onRootClick']) {
      expect(SHELL, `${gone} must not come back`).not.toContain(gone);
    }
    expect(SHELL).not.toMatch(/window\.scrollTo/);
    expect(SHELL).not.toMatch(/scrollIntoView/);
  });

  it('leaves history to the browser', () => {
    // Native fragment navigation records the entry itself, so Back works with
    // no `pushState` — and cannot desynchronise from a scroll that did not run.
    expect(SHELL).not.toMatch(/history\.pushState/);
    expect(SHELL).not.toMatch(/location\.hash\s*=/);
  });

  it('uses no timer in any navigation path', () => {
    expect(SHELL).not.toMatch(/setTimeout|requestAnimationFrame/);
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
