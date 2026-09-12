// CR-04 — the PWA surface, asserted against the shipped files.
//
// Everything here is a value that lives OUTSIDE the TypeScript build (a JSON
// manifest, an HTML meta tag, a hand-written service worker), so nothing else
// in this repo would notice if it regressed. A wrong `start_url` or a dropped
// apple-touch-icon does not fail a typecheck, a lint, or a build — it fails
// silently on a phone, weeks later, as a blurry icon nobody reports.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const root = (p: string) => new URL(`../../${p}`, import.meta.url);
const readRoot = (p: string) => readFileSync(root(p), 'utf8');
const manifest = () => JSON.parse(readRoot('public/manifest.json'));

/** PNG header: width at byte 16, height at byte 20, both big-endian uint32. */
function pngSize(p: string): { w: number; h: number } {
  const b = readFileSync(root(p));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('manifest', () => {
  it('is installable with the Arabic brand name', () => {
    const m = manifest();
    expect(m.name).toBe('مزادو');
    expect(m.short_name).toBe('مزادو');
    expect(m.display).toBe('standalone');
    expect(m.orientation).toBe('portrait');
    expect(m.lang).toBe('ar');
    expect(m.dir).toBe('rtl');
  });

  it('tags installed launches so the install rate is measurable', () => {
    // The whole point of tracking installs: on iOS an installed app is the
    // only route to free web push, so install rate is a channel metric, not a
    // vanity one. Without the marker on start_url there is no way to tell an
    // installed launch from a browser visit.
    expect(manifest().start_url).toBe('/?source=pwa');
  });

  it('ships the full icon set at the sizes each platform needs', () => {
    const icons = manifest().icons;
    const bySize = (s: string, purpose: string) =>
      icons.find((i: { sizes: string; purpose: string }) => i.sizes === s && i.purpose === purpose);
    expect(bySize('192x192', 'any')).toBeTruthy();
    expect(bySize('512x512', 'any')).toBeTruthy();
    // Without a maskable icon Android crops the square into its adaptive shape
    // and clips the logo.
    expect(bySize('512x512', 'maskable')).toBeTruthy();

    // And the files are actually those sizes. A manifest can claim anything.
    expect(pngSize('public/icon-192.png')).toEqual({ w: 192, h: 192 });
    expect(pngSize('public/icon-512.png')).toEqual({ w: 512, h: 512 });
    expect(pngSize('public/icon-maskable-512.png')).toEqual({ w: 512, h: 512 });
  });

  it('carries the 180x180 apple-touch-icon iOS needs', () => {
    // iOS ignores the manifest icons entirely. Without this file it renders a
    // blurry screenshot of the page as the home-screen icon.
    expect(() => statSync(root('public/apple-touch-icon.png'))).not.toThrow();
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ w: 180, h: 180 });
    expect(readRoot('index.html')).toMatch(/rel="apple-touch-icon" sizes="180x180"/);
  });

  it('names the installed iOS app in the same place iOS actually reads', () => {
    // iOS takes the home-screen label from this meta tag, NOT from the
    // manifest's short_name, so the two drifting apart is invisible until an
    // icon appears on a phone with the wrong word under it.
    const html = readRoot('index.html');
    expect(html).toMatch(/name="apple-mobile-web-app-title" content="مزادو"/);
    expect(manifest().short_name).toBe('مزادو');
  });
});

describe('service worker', () => {
  const sw = () => readRoot('public/sw.js');

  it('never caches live auction data', () => {
    // "Stale bid amounts are worse than an error state" — a user who sees a
    // stale price bids against a number that no longer exists. Every origin
    // that can carry a price or a bid count has to be bypassed outright.
    const src = sw();
    for (const host of [
      'firestore.googleapis.com',
      'algolia',
      'cloudfunctions.net',
      'run.app',
      'firebaseio.com',
    ]) {
      expect(src).toContain(host);
    }
  });

  it('does not treat JSON as a cacheable static asset', () => {
    // '.json' in the static list put every JSON response on a
    // stale-while-revalidate path: served from cache FIRST, revalidated after.
    const src = sw();
    const listLine = src.slice(
      src.indexOf('const STATIC_ASSET_EXTENSIONS'),
      src.indexOf('const CACHEABLE_JSON'),
    );
    expect(listLine).not.toContain("'.json'");
    // The shell manifest is the one exception, named explicitly.
    expect(src).toMatch(/CACHEABLE_JSON = \['\/manifest\.json'\]/);
  });

  it('serves an error rather than stale data for anything unrecognised', () => {
    // The default branch used to be network-first WITH a cache fallback, which
    // is how data reached the cache in the first place.
    const src = sw();
    const tail = src.slice(src.indexOf('// Default:'));
    expect(tail).toMatch(/NETWORK ONLY/);
    expect(tail).not.toMatch(/caches\.match\(event\.request\)/);
  });

  it('bumps the cache name so old cached data is actually evicted', () => {
    // The activate handler deletes every cache whose name is not the current
    // one. Tightening the rules without bumping the name would leave existing
    // users served from the cache the old rules filled.
    expect(sw()).toMatch(/mazzado-cache-v2/);
  });
});
