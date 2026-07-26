import { describe, it, expect } from 'vitest';
import { resolveCachedVideo } from './auctionVideoResolve';

/**
 * Pure branch-selection for `useAuctionDoc`'s video resolution. Mirrors the three
 * branches AppContext's broad-path `mapAuctionDoc` runs, so a room lot resolves
 * its video identically to the broad feed.
 */
describe('resolveCachedVideo', () => {
  it('cache hit (same rawUrl): returns the cached resolved URL, no async, no re-cache', () => {
    const cached = { rawUrl: 'blob:abc', resolvedUrl: 'blob:object-123' };
    expect(resolveCachedVideo('blob:abc', cached)).toEqual({
      videoUrl: 'blob:object-123',
      needsAsync: false,
      cacheDirect: false,
    });
  });

  it('cache hit also short-circuits a direct network URL (raw already resolved)', () => {
    const cached = { rawUrl: 'https://cdn/x.mp4', resolvedUrl: 'https://cdn/x.mp4' };
    expect(resolveCachedVideo('https://cdn/x.mp4', cached)).toEqual({
      videoUrl: 'https://cdn/x.mp4',
      needsAsync: false,
      cacheDirect: false,
    });
  });

  it('direct network URL, uncached: playable as-is and flagged to cache directly', () => {
    expect(resolveCachedVideo('https://cdn/x.mp4', undefined)).toEqual({
      videoUrl: 'https://cdn/x.mp4',
      needsAsync: false,
      cacheDirect: true,
    });
  });

  it('direct network URL, stale cache (different rawUrl): re-resolves as a fresh direct URL', () => {
    const cached = { rawUrl: 'https://cdn/OLD.mp4', resolvedUrl: 'https://cdn/OLD.mp4' };
    expect(resolveCachedVideo('https://cdn/NEW.mp4', cached)).toEqual({
      videoUrl: 'https://cdn/NEW.mp4',
      needsAsync: false,
      cacheDirect: true,
    });
  });

  it('blob: URL, uncached: needs async IndexedDB resolution', () => {
    expect(resolveCachedVideo('blob:abc', undefined)).toEqual({
      videoUrl: 'blob:abc',
      needsAsync: true,
      cacheDirect: false,
    });
  });

  it('empty URL, uncached: needs async (resolver returns "" → thumbnail fallback)', () => {
    expect(resolveCachedVideo('', undefined)).toEqual({
      videoUrl: '',
      needsAsync: true,
      cacheDirect: false,
    });
  });

  it('blob: URL with stale cache (different rawUrl): re-resolves via async', () => {
    const cached = { rawUrl: 'blob:OLD', resolvedUrl: 'blob:object-OLD' };
    expect(resolveCachedVideo('blob:NEW', cached)).toEqual({
      videoUrl: 'blob:NEW',
      needsAsync: true,
      cacheDirect: false,
    });
  });
});
