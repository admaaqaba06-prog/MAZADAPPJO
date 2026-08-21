/**
 * Pins the BidSheet's ACCESSIBILITY CONTRACT — the parts a screen-reader or
 * keyboard user depends on, all of which are plain markup and therefore
 * provable here.
 *
 * WHY IT EXISTS: the sheet is the money control. It shipped as a modal that
 * announced as an unnamed group (no role/aria-modal/name), over an amount field
 * whose only label was a bare <span> — so the input that decides how much a
 * bidder commits announced as an unlabelled number box. None of that is
 * visible on screen, so nothing caught it; a render test is the only thing that
 * can, because it asserts the attributes rather than the pixels.
 *
 * Vitest here is `environment: 'node'` — no jsdom, no @testing-library — so
 * this uses react-dom/server like the other *.render.test.tsx files. That runs
 * NO effects, so the Escape-to-close handler is deliberately NOT covered here:
 * it is an effect-bound window listener and there is no DOM to dispatch into.
 * It was verified by hand in the browser (Escape flips `open` false, other keys
 * do not, and the listener is torn down on close).
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

// AnimatePresence/motion render host elements here so the markup under test is
// the sheet's own; the animation itself is not what this test is about.
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  motion: new Proxy({}, {
    get: (_t, tag: any) => ({ children, ...rest }: any) => {
      // Drop the animation-only props so they do not leak into the markup.
      const { initial, animate, exit, transition, ...domProps } = rest;
      return React.createElement(String(tag), domProps, children);
    },
  }),
}));

vi.mock('../feedback', () => ({
  BidConfirm: () => null,
  WinningPill: () => null,
  FirstBidCoach: () => null,
  Pressable: ({ children, ...rest }: any) => React.createElement('button', rest, children),
}));

import { BidSheet } from './BidSheet';

const props = {
  open: true,
  onClose: () => {},
  isAr: true,
  reduce: true,
  currentPrice: 100,
  minNext: 105,
  inc: 5,
  submitting: false,
  onStage: () => {},
  pendingBid: null,
  priceMoved: false,
  onConfirm: () => {},
  onCancel: () => {},
  showCoach: false,
  showWinPill: false,
};

const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(BidSheet as any, { ...props, ...over }));

describe('BidSheet accessibility contract', () => {
  it('announces as a named modal dialog', () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    // The name must RESOLVE — an aria-labelledby pointing at nothing is worse
    // than no name at all, because it suppresses the fallback.
    expect(html).toContain('aria-labelledby="bid-sheet-title"');
    expect(html).toContain('id="bid-sheet-title"');
  });

  it('labels the amount field with a real <label for>', () => {
    const html = render();
    expect(html).toContain('for="bid-sheet-amount"');
    expect(html).toContain('id="bid-sheet-amount"');
  });

  it('marks the amount field valid and undescribed while there is no error', () => {
    const html = render();
    expect(html).toContain('aria-invalid="false"');
    // No error node, so nothing may claim to describe the field.
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toContain('role="alert"');
  });

  it('renders status colours through the theme tokens, not fixed hexes', () => {
    const html = render();
    // A fixed hex cannot satisfy both themes: #F04438 reads 3.76:1 on the light
    // card. `text-danger`/`border-danger` flip per theme instead.
    expect(html).not.toContain('#F04438');
    expect(html).not.toContain('#ccc');
  });
});
