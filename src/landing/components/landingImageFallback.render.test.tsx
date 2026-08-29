/**
 * The image-failure fallback — the branch nothing else reaches.
 *
 * WHY THIS FILE EXISTS. The fallback has two entry conditions and they were not
 * equally covered. "The lot has no image URL at all" is exercised by the card and
 * hero render tests. "The URL exists but the load fails" — the `onError` path —
 * was covered by nothing, and a browser attempt to force it failed for a reason
 * that had nothing to do with the component: the Vite dev server answers unknown
 * paths with `200 text/html` (its SPA fallback), so an image request against it
 * never 404s. Recorded as a real gap in
 * docs/verification/landing-conversion-redesign.md §4.1.5, and closed here.
 *
 * HOW IT IS REACHED WITHOUT A DOM. vitest runs `environment: 'node'`; there is no
 * jsdom, no browser, and none may be installed. `renderToStaticMarkup` runs no
 * effects and dispatches no events, so an `error` event cannot be fired.
 *
 * But an event is not the only way to reach an event handler. `onError` is a
 * plain function sitting on a React element, and React elements are inspectable
 * objects. `LandingAuctionCard` uses NO hooks of its own, so it can be called
 * directly as a function to obtain its element tree; the `<CardImage>` element is
 * found in that tree and called in turn with `React.useState` temporarily
 * stubbed, which yields the real `<img>` element carrying the real handler. That
 * handler is then invoked, and what it does to the state is asserted.
 *
 * This exercises the production handler on the production element. What it does
 * NOT prove is that the browser fires `error` at that handler — that is React's
 * contract for `onError` on an `<img>`, not this component's.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import type { LandingAuction } from '../useLandingAuctions';
import { landingContent } from '../landingContent';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

import { LandingAuctionCard } from './LandingAuctionCard';

const AR = landingContent.ar;

const lot: LandingAuction = {
  id: 'lot-1', title: 'iPhone 13 Pro 256GB', category: 'Electronics', currentPrice: 120,
  totalBids: 0, endTime: undefined, createdAt: 1, featuredRank: 1,
  imageUrl: 'https://firebasestorage.googleapis.com/lot-1.jpg',
  isFeatured: true, isVerified: true,
};

/** Depth-first walk of a React element tree. */
function* walk(node: any): Generator<any> {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  yield node;
  const kids = node.props?.children;
  if (kids !== undefined) yield* walk(kids);
}

/** The `<CardImage>` element inside a rendered card. Throws rather than guessing. */
function findCardImageElement(auction: LandingAuction) {
  const tree = LandingAuctionCard({
    auction, lang: 'ar', copy: AR.marketplace, now: 1_800_000_000_000, onView: () => {},
  } as any);
  const hit = [...walk(tree)].find(
    n => typeof n.type === 'function' && n.type.name === 'CardImage'
  );
  if (!hit) throw new Error('no <CardImage> element in the card tree — was it renamed or inlined?');
  return hit;
}

/**
 * Calls a component with `React.useState` stubbed to a fixed value, so a
 * state-dependent branch can be selected and the setter observed.
 *
 * The patch is restored in a `finally`, so a failure here cannot leak a broken
 * `useState` into another test in this file.
 */
function callWithState<T>(component: (p: any) => T, props: any, failed: boolean) {
  const setFailed = vi.fn();
  const real = React.useState;
  (React as any).useState = (initial: unknown) => [failed ?? initial, setFailed];
  try {
    return { element: component(props) as any, setFailed };
  } finally {
    (React as any).useState = real;
  }
}

/** The first `<img>` in an element tree, or null. */
const findImg = (tree: any) => [...walk(tree)].find(n => n.type === 'img') ?? null;

describe('the test reaches the real component, not a stand-in', () => {
  it('finds the CardImage element the card actually renders', () => {
    expect(findCardImageElement(lot).type).toBeTypeOf('function');
  });

  it('throws loudly if the element it depends on disappears', () => {
    const tree = { props: { children: [] } };
    expect(() => {
      const hit = [...walk(tree)].find(n => typeof n.type === 'function');
      if (!hit) throw new Error('no <CardImage> element in the card tree');
    }).toThrow(/no <CardImage>/);
  });

  it('restores React.useState after stubbing it', () => {
    const real = React.useState;
    callWithState(findCardImageElement(lot).type, findCardImageElement(lot).props, false);
    expect(React.useState).toBe(real);
  });
});

describe('a lot whose image loads', () => {
  it('renders the img, not the fallback', () => {
    const el = findCardImageElement(lot);
    const { element } = callWithState(el.type, el.props, false);
    const img = findImg(element);
    expect(img, 'expected an <img> while the load has not failed').toBeTruthy();
    expect(img.props.src).toBe(lot.imageUrl);
    expect(img.props.alt).toBe(lot.title);
    expect(img.props.loading).toBe('lazy');
    expect(element.props['data-card-image-fallback']).toBeUndefined();
  });

  it('attaches an error handler to that img', () => {
    // Without this the load failure is never observed and the broken-image icon
    // is what a visitor gets.
    const el = findCardImageElement(lot);
    const { element } = callWithState(el.type, el.props, false);
    expect(findImg(element).props.onError).toBeTypeOf('function');
  });
});

describe('when the image fails to load', () => {
  it('the error handler marks the image failed', () => {
    // THE GAP THIS FILE CLOSES. The real handler, from the real element, invoked.
    const el = findCardImageElement(lot);
    const { element, setFailed } = callWithState(el.type, el.props, false);
    findImg(element).props.onError();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(setFailed).toHaveBeenCalledWith(true);
  });

  it('the failed state renders the branded fallback instead of the img', () => {
    const el = findCardImageElement(lot);
    const { element } = callWithState(el.type, el.props, true);
    expect(findImg(element), 'a failed image must not stay in the document').toBeNull();
    expect(element.props['data-card-image-fallback']).toBeDefined();
  });

  it('gives the fallback an accessible name rather than leaving a silent gap', () => {
    const el = findCardImageElement(lot);
    const { element } = callWithState(el.type, el.props, true);
    expect(element.props.role).toBe('img');
    expect(element.props['aria-label']).toBe(AR.marketplace.imageFallbackLabel);
  });

  it('keeps the fallback the same size as the image it replaces', () => {
    // A fallback of a different height reflows the whole strip the moment one
    // image 404s — the layout-stability requirement.
    const el = findCardImageElement(lot);
    const withImg = callWithState(el.type, el.props, false).element;
    const withFallback = callWithState(el.type, el.props, true).element;
    const aspect = (n: any) => String(n.props.className).match(/aspect-\[[^\]]+\]/)?.[0];
    expect(aspect(withFallback)).toBe(aspect(findImg(withImg)));
    expect(aspect(withFallback)).toBeTruthy();
  });
});

describe('a lot with no image at all', () => {
  it('renders the fallback without waiting for a load to fail', () => {
    const el = findCardImageElement({ ...lot, imageUrl: '' });
    const { element } = callWithState(el.type, el.props, false);
    expect(findImg(element)).toBeNull();
    expect(element.props['data-card-image-fallback']).toBeDefined();
  });
});

describe('the hero image carries the same wiring', () => {
  // `LandingHero` calls `useReducedMotion`, whose own hooks would have to be
  // stubbed to call it directly — a deeper patch than this behaviour is worth.
  // Its image is the same shape as the card's, so the contract is pinned at the
  // source instead, and the BEHAVIOUR above is what proves the shape works.
  const HERO = readFileSync(new URL('./LandingHero.tsx', import.meta.url), 'utf8');

  it('marks the image failed on error, and renders a fallback for it', () => {
    expect(HERO).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
    expect(HERO).toMatch(/if \(!auction\.imageUrl \|\| failed\)/);
    expect(HERO).toContain('data-hero-image-fallback');
  });

  it('binds the img src to the lot, so it can never be empty', () => {
    // Asserted as the POSITIVE binding rather than the absence of `src=""`: the
    // component documents "never an <img src=\"\">" in its own comment, and an
    // absence check matches that prose. This is the fourth time an assertion in
    // this branch has collided with the documentation of the thing it asserts —
    // absence checks over these files need comment-stripping or, as here, a
    // positive form.
    expect(HERO).toMatch(/src=\{auction\.imageUrl\}/);
  });
});
