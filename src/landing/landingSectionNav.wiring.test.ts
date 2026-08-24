// The landing page's in-page menu links must all reach the section they name.
//
// TWO defects, both measured on the rendered page before the fix:
//
// 1. `id="why-mazzado"` sat on the TRUST section — the one whose heading is
//    `t.trust.title` («مزاد ليس للتصفية…») and whose badge is `t.trust.badge`
//    («الأمان والنزاهة»). The real «لماذا Mazzado؟» section, which renders
//    `t.why.title`, carried NO id at all. So «لماذا مزادو؟» in the menu took
//    you to a different section, which is what read as "cropped / far from
//    where it should be".
//
// 2. The links were bare `<a href="#…">`, so the landing position was whatever
//    the browser's fragment jump produced: the section's top flush against the
//    viewport top, with no breathing room and no allowance for a header.
//
// A third thing was measured and deliberately NOT changed: the header is
// `position: sticky; top: 0` but it never sticks, because the landing root
// wrapper carries `overflow-hidden` and a non-`visible` overflow ancestor
// becomes the sticky element's scrollport. Its rect tracks `-scrollY` exactly.
// `headerOverlap()` therefore encodes that CSS rule instead of assuming a
// height, so the offset is correct both today and if the root is ever fixed.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// the component cannot be rendered — and adding Playwright or any browser
// harness just for this is not on the table. The house idiom, per
// src/components/desktopDescription.wiring.test.ts. Assertions anchor on real
// syntax, never on fixed character windows.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./LandingView.tsx', import.meta.url), 'utf8');

/** Every distinct `#section` an anchor in this file points at. */
function linkedSectionIds(): string[] {
  return [...new Set([...SRC.matchAll(/href="#([A-Za-z][\w-]*)"/g)].map((m) => m[1]))].sort();
}

/**
 * The body of `scrollToSection`, sliced declaration-to-declaration so it stays
 * anchored when anything above or below it moves. Throws rather than returning
 * a half-region, so a rename surfaces loudly instead of as an empty haystack.
 */
function scrollToSectionBody(): string {
  const start = SRC.indexOf('const scrollToSection');
  if (start === -1) throw new Error('`const scrollToSection` not found — was it renamed?');
  const end = SRC.indexOf('const onSectionLinkClick', start);
  if (end === -1) throw new Error('`const onSectionLinkClick` not found after scrollToSection');
  return SRC.slice(start, end);
}

describe('landing menu links reach the section they name', () => {
  it('points every menu link at an id that exists exactly once', () => {
    const ids = linkedSectionIds();
    // The three section links, in the desktop nav, the mobile drawer and the
    // footer. If a fourth is added, add it here on purpose.
    expect(ids).toEqual(['categories', 'pricing', 'why-mazzado']);
    for (const id of ids) {
      const declared = (SRC.match(new RegExp(`id="${id}"`, 'g')) ?? []).length;
      expect(declared, `id="${id}" must be declared exactly once`).toBe(1);
    }
  });

  it('puts why-mazzado on the section headed by t.why.title, not t.trust.title', () => {
    const anchor = SRC.indexOf('id="why-mazzado"');
    expect(anchor, 'id="why-mazzado" is missing entirely').toBeGreaterThan(-1);

    const why = SRC.indexOf('{t.why.title}', anchor);
    const trustAfter = SRC.indexOf('{t.trust.title}', anchor);
    expect(why, 't.why.title must appear after the id').toBeGreaterThan(-1);
    // The heading that follows the id must be the WHY heading. When the id was
    // on the trust section, t.trust.title came first and this failed.
    if (trustAfter !== -1) expect(why).toBeLessThan(trustAfter);

    // And the trust section must sit BEFORE it — that is the page order, and it
    // is what makes the assertion above meaningful rather than accidental.
    expect(SRC.indexOf('{t.trust.title}')).toBeLessThan(anchor);
  });

  it('routes desktop, mobile and footer links through the one handler', () => {
    for (const id of linkedSectionIds()) {
      const hrefs = (SRC.match(new RegExp(`href="#${id}"`, 'g')) ?? []).length;
      const wired = (SRC.match(new RegExp(`onSectionLinkClick\\("${id}"\\)`, 'g')) ?? []).length;
      expect(hrefs, `${id}: expected the desktop, mobile and footer links`).toBe(3);
      expect(wired, `${id}: every link must use the central handler`).toBe(hrefs);
    }
    // Total, so a link added later without the handler fails here too.
    expect((SRC.match(/href="#[A-Za-z][\w-]*"/g) ?? []).length).toBe(9);
    expect((SRC.match(/onSectionLinkClick\("/g) ?? []).length).toBe(9);
  });

  it('keeps the links real links', () => {
    // href is what makes them focusable, announced as links, and
    // middle/ctrl-clickable. The handler must not have replaced them with
    // buttons or onClick-only divs.
    expect(SRC).toMatch(/<a\s+href="#why-mazzado"\s+onClick=\{onSectionLinkClick\("why-mazzado"\)\}/);
  });

  it('offsets the scroll by the measured header and a 12-24px gap', () => {
    const body = scrollToSectionBody();
    // Subtracts BOTH terms.
    expect(body).toMatch(/-\s*headerOverlap\(\)/);
    expect(body).toMatch(/-\s*SECTION_TOP_GAP/);
    // The gap is a real, reviewable constant inside the required band.
    const gap = SRC.match(/const SECTION_TOP_GAP\s*=\s*(\d+)/);
    expect(gap, 'SECTION_TOP_GAP must be a plain numeric constant').toBeTruthy();
    const px = Number(gap![1]);
    expect(px).toBeGreaterThanOrEqual(12);
    expect(px).toBeLessThanOrEqual(24);
    // The header term is MEASURED, not a hardcoded pixel count.
    const overlap = SRC.slice(SRC.indexOf('const headerOverlap'), SRC.indexOf('const scrollToSection'));
    expect(overlap).toMatch(/getBoundingClientRect\(\)/);
    expect(overlap).toMatch(/getComputedStyle/);
    // Smooth, and via window.scrollTo as specified.
    expect(body).toMatch(/window\.scrollTo\(\{[\s\S]*behavior:\s*'smooth'/);
  });

  it('updates the hash without breaking Back, and without a timer', () => {
    const body = scrollToSectionBody();
    // pushState keeps a history entry (so Back returns the user) and carries
    // the existing state object. Assigning location.hash would make the browser
    // add its own instant jump on top of the smooth scroll.
    expect(body).toMatch(/history\.pushState\(/);
    expect(body).not.toMatch(/location\.hash\s*=/);
    // No timers anywhere in the navigation path, and no new scroll listener.
    expect(body).not.toMatch(/setTimeout|requestAnimationFrame/);
  });

  it('only hijacks the plain left click', () => {
    const handler = SRC.slice(SRC.indexOf('const onSectionLinkClick'));
    const guard = handler.slice(0, handler.indexOf('};'));
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      expect(guard, `${key} must be left to the browser`).toContain(key);
    }
    expect(guard).toMatch(/e\.button\s*!==\s*0/);
    expect(guard).toMatch(/preventDefault/);
  });
});
