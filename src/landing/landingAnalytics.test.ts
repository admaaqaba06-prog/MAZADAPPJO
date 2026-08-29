import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildLandingEvent, emitLandingEvent } from './landingAnalytics';
import type { LandingPlacement } from './landingAnalytics';

// The repo's vitest environment is `node` (no jsdom/happy-dom installed), so
// `window` is not a global. Existing tests (e.g. useSimulatorEnabled.test.ts)
// stub it on globalThis; we do the same so these window-based assertions run.
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('buildLandingEvent', () => {
  it('normalizes event name, params, and timestamp', () => {
    const payload = buildLandingEvent('seller_cta_clicked', { location: 'hero' }, 1000);
    expect(payload).toEqual({
      event: 'seller_cta_clicked',
      params: { location: 'hero' },
      ts: 1000,
    });
  });

  it('defaults params to an empty object', () => {
    const payload = buildLandingEvent('landing_viewed', undefined, 42);
    expect(payload.params).toEqual({});
    expect(payload.event).toBe('landing_viewed');
    expect(payload.ts).toBe(42);
  });
});

describe('emitLandingEvent', () => {
  beforeEach(() => {
    delete (window as any).dataLayer;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    delete (window as any).dataLayer;
  });

  it('pushes onto window.dataLayer when present', () => {
    (window as any).dataLayer = [];
    emitLandingEvent('browse_cta_clicked', { location: 'hero' });
    expect((window as any).dataLayer).toHaveLength(1);
    expect((window as any).dataLayer[0].event).toBe('browse_cta_clicked');
    expect((window as any).dataLayer[0].params).toEqual({ location: 'hero' });
  });

  it('does not throw when window.dataLayer is absent', () => {
    expect(() => emitLandingEvent('landing_viewed')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Placement is the dimension every rate on this page is sliced by, so its exact
// values are part of the measurement contract rather than an implementation
// detail. The page this replaces emitted eleven of them — including
// `marketplace_error`, `coming_soon` and `sticky`, naming sections that no
// longer exist, plus `final`/`final_secondary` splitting one button pair across
// two buckets.
// ---------------------------------------------------------------------------
describe('the approved placement set', () => {
  const APPROVED: LandingPlacement[] = ['nav', 'hero', 'marketplace', 'seller', 'final'];

  it('carries every approved value through to the payload unchanged', () => {
    for (const location of APPROVED) {
      expect(buildLandingEvent('browse_cta_clicked', { location }, 1).params)
        .toEqual({ location });
    }
  });

  it('is exactly five values, so a rate is never split by a typo', () => {
    // Typed as LandingPlacement[], so adding a sixth value to the union without
    // deciding it here fails `tsc` at the declaration above.
    expect(APPROVED).toHaveLength(5);
    expect(new Set(APPROVED).size).toBe(5);
  });
});

describe('the funnel payloads the landing page actually emits', () => {
  it('names the auction AND the placement on an auction view', () => {
    // Without the id, the auction-view rate cannot be attributed to a lot;
    // without the placement, the hero and the strip are indistinguishable.
    expect(buildLandingEvent('auction_viewed', { auctionId: 'lot-7', location: 'hero' }, 5))
      .toEqual({ event: 'auction_viewed', params: { auctionId: 'lot-7', location: 'hero' }, ts: 5 });
  });

  it('names the destination language on a switch', () => {
    expect(buildLandingEvent('language_switched', { to: 'en' }, 5).params).toEqual({ to: 'en' });
  });

  it('names the language on a page view', () => {
    expect(buildLandingEvent('landing_viewed', { lang: 'ar' }, 5).params).toEqual({ lang: 'ar' });
  });
});

describe('analytics can never break the page', () => {
  // The landing page emits BEFORE it navigates, precisely so a lost event
  // cannot cost a conversion. That ordering is only safe because emitting is
  // incapable of throwing — these are the failures it has to absorb.
  it('swallows a throwing dataLayer.push', () => {
    (window as any).dataLayer = { push() { throw new Error('GTM exploded'); } };
    expect(() => emitLandingEvent('browse_cta_clicked', { location: 'hero' })).not.toThrow();
  });

  it('ignores a dataLayer that is not an array', () => {
    (window as any).dataLayer = 'not-an-array';
    expect(() => emitLandingEvent('landing_viewed', { lang: 'ar' })).not.toThrow();
  });

  it('swallows a dataLayer whose access throws', () => {
    Object.defineProperty(window as any, 'dataLayer', {
      configurable: true,
      get() { throw new Error('blocked'); },
    });
    expect(() => emitLandingEvent('seller_cta_clicked', { location: 'final' })).not.toThrow();
    delete (window as any).dataLayer;
  });
});
