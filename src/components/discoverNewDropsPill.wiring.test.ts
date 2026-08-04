// The "New drops" pill must not cover the category chips.
//
// It was positioned `fixed` with a guessed offset
// (`top-[calc(env(safe-area-inset-top)+7.5rem)]`), which lands on top of the
// chips at viewport heights the guess did not anticipate. No fixed offset is
// right for every screen, so the fix is structural: render it in normal flow
// under the sticky header, where it reserves its own space.
//
// Pinned at the source. The component pulls in the whole discover feed — the
// Algolia search path, live listeners, the media stack — so rendering it here
// is not practical; vitest is `environment: 'node'`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./DiscoveryFeedView.tsx', import.meta.url), 'utf8');

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CODE = stripComments(SRC);

function pillBlock(): string {
  const i = CODE.indexOf('id="discover-new-drops-pill"');
  if (i === -1) throw new Error('pill anchor not found — id="discover-new-drops-pill"');
  // The element and its wrapper: enough to see positioning and animation.
  return CODE.slice(Math.max(0, i - 1200), i + 300);
}

describe('the New drops pill sits in flow, not over the chips', () => {
  it('is not positioned fixed', () => {
    // The actual defect. `fixed` takes it out of flow, so it reserves no space
    // and lands wherever the offset guess puts it.
    expect(pillBlock()).not.toMatch(/\bfixed\b/);
  });

  it('does not guess an offset from the top of the viewport', () => {
    const block = pillBlock();
    expect(block).not.toMatch(/top-\[calc/);
    expect(block).not.toMatch(/safe-area-inset-top/);
    expect(block).not.toMatch(/\btop-\d/);
    expect(block).not.toMatch(/lg:top-\d/);
  });

  it('renders AFTER the sticky header closes, so it stacks below the chips', () => {
    // Document order is what puts it under the chips now that it is in flow.
    const header = CODE.indexOf('id="discover-sticky-header"');
    const pill = CODE.indexOf('id="discover-new-drops-pill"');
    const grid = CODE.indexOf('id="discover-feed-grid"');
    if (header === -1 || pill === -1 || grid === -1) {
      throw new Error('header, pill or grid anchor moved');
    }
    expect(pill, 'pill comes after the sticky header').toBeGreaterThan(header);
    expect(pill, 'pill comes before the feed grid').toBeLessThan(grid);
  });

  it('keeps the refresh behaviour that was already correct', () => {
    // Only the placement was broken; tapping must still refresh page 1.
    expect(pillBlock()).toMatch(/onClick=\{\(\) => feed\.refresh\(\)\}/);
  });

  it('stays gated on newDropsAvailable', () => {
    expect(pillBlock()).toMatch(/feed\.newDropsAvailable &&/);
  });

  it('animates out rather than vanishing', () => {
    const block = pillBlock();
    expect(block).toMatch(/AnimatePresence/);
    expect(block).toMatch(/exit=\{/);
  });

  it('is bilingual', () => {
    const block = pillBlock();
    expect(block).toMatch(/دفعات جديدة/);
    expect(block).toMatch(/New drops/);
  });

  it('has no OTHER fixed-position element guessing a top offset near the header', () => {
    // The pill was one instance of a pattern. Anything else pinned by a guessed
    // offset under the sticky header will drift the same way.
    const offenders = [...CODE.matchAll(/className="[^"]*\bfixed\b[^"]*top-\[calc\(env\(safe-area-inset-top\)[^"]*"/g)];
    expect(offenders.map((m) => m[0].slice(0, 80))).toEqual([]);
  });
});
