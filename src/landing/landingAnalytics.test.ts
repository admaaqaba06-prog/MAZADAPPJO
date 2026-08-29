import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildLandingEvent, emitLandingEvent } from './landingAnalytics';

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
