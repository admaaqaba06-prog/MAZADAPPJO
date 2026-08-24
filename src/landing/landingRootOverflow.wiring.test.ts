// The landing root must NOT be a scroll container.
//
// THE BUG: the root carried `relative overflow-hidden`. `overflow-hidden` clips
// both axes, and an element whose overflow is not `visible` IS a scroll
// container — so the page held a second, invisible vertical scroller nested
// inside the document's, with 565px of range and no scrollbar to show it.
// Measured at 1280x800:
//
//   stage                window.scrollY   root.scrollTop   hero.top
//   fresh load                        0                0       +77
//   after #categories              5073              565     -5561
//   scrolled back to top              0              565      -488   ← cropped
//
// A fragment jump scrolls the nearest scroll container, so the browser moved
// THIS element's scrollTop to its maximum. Scrolling back up returns
// `window.scrollY` to 0 — the scrollbar is visibly at the very top — but nothing
// returns `root.scrollTop`, because no scrollbar was ever rendered for it. The
// hero stayed pushed 565px up and read as cropped.
//
// After `overflow-x-clip`: root.scrollTop stays 0 through all three stages and
// hero.top returns to exactly +77. The document's scrolling element is the only
// scroll owner.
//
// WHY NOT `overflow-x-hidden`: per spec, `hidden` on one axis forces a `visible`
// other axis to compute to `auto`, so the element would stay a scroll container
// and the bug would survive. `clip` clips without creating one and leaves the
// other axis `visible`. That distinction is the entire fix, so it is asserted.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// the component cannot be rendered. The house idiom, per
// src/components/desktopDescription.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./LandingView.tsx', import.meta.url), 'utf8');

/**
 * The `className` of the landing root.
 *
 * Anchored on `selection:bg-`, which only the root carries — the first version
 * of this helper scanned from `return (` and picked up a NESTED component's
 * root instead (this file declares several), so it asserted against the wrong
 * element's classes and failed on `font-mono`. Throws rather than guessing, so
 * a rename surfaces loudly instead of silently testing something else.
 */
function rootClassName(): string {
  const m = /className="([^"]*selection:bg-[^"]*)"/.exec(SRC);
  if (!m) throw new Error('the landing root className (carrying `selection:bg-`) was not found');
  return m[1];
}

describe('the landing root is not a scroll container', () => {
  it('clips the decorative overflow with overflow-x-clip', () => {
    expect(rootClassName()).toMatch(/(?<![\w-])overflow-x-clip(?![\w-])/);
  });

  it('never re-adds overflow-hidden to the root', () => {
    // This is the exact token that created the hidden scroller.
    expect(rootClassName()).not.toMatch(/(?<![\w-])overflow-hidden(?![\w-])/);
  });

  it('gives the root no vertical overflow of any kind', () => {
    // `overflow-y-*` and the both-axes shorthands all make it a scroller again.
    // `overflow-x-hidden` is banned too: it forces the y axis to compute to
    // `auto`, which is the same bug wearing a different class name.
    const cls = rootClassName();
    for (const banned of [
      /(?<![\w-])overflow-y-(?:auto|scroll|hidden|clip)(?![\w-])/,
      /(?<![\w-])overflow-(?:auto|scroll|hidden|clip)(?![\w-])/,
      /(?<![\w-])overflow-x-hidden(?![\w-])/,
    ]) {
      expect(cls, `root must not carry ${banned}`).not.toMatch(banned);
    }
  });

  it('keeps the root a plain flex column, not a scroll box', () => {
    // Guards the rest of the root contract the fix relied on: it grows with its
    // content and the document scrolls it.
    const cls = rootClassName();
    expect(cls).toMatch(/(?<![\w-])min-h-screen(?![\w-])/);
    expect(cls).toMatch(/(?<![\w-])flex(?![\w-])/);
    expect(cls).toMatch(/(?<![\w-])flex-col(?![\w-])/);
    expect(cls).toMatch(/(?<![\w-])relative(?![\w-])/);
  });

  it('does not paper over the symptom instead of fixing the cause', () => {
    // The forbidden workarounds: forcing the scroll position from a listener,
    // stripping the hash, or timing the page back into place. None of them are
    // the fix, and any of them would mask a regression of the real one.
    expect(SRC).not.toMatch(/scroll(?:Top|Y)\s*=\s*0[\s\S]{0,80}addEventListener\(\s*['"]scroll/);
    expect(SRC).not.toMatch(/addEventListener\(\s*['"]hashchange/);
  });
});
