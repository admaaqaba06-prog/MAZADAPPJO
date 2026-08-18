// firebase.json is now the ONLY hosting config.
//
// `vercel.json` used to carry the same SPA fallback and asset caching, so the
// two quietly backed each other up. It was deleted when the frontend moved to
// Firebase Hosting (2026-08-18), which means a mistake in firebase.json is no
// longer covered by anything. These assert the three behaviours the app depends
// on to serve correctly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));

describe('firebase.json hosting', () => {
  it('serves dist/', () => {
    expect(cfg.hosting?.public).toBe('dist');
  });

  it('falls back to index.html so deep links work', () => {
    // Without this, /discover and /auction/:id 404 on a cold load — every link
    // shared into WhatsApp, which is the product's main acquisition channel.
    const spa = (cfg.hosting?.rewrites ?? []).find(
      (r: { source: string; destination: string }) =>
        r.source === '**' && r.destination === '/index.html',
    );
    expect(spa, 'a ** -> /index.html rewrite must exist').toBeTruthy();
  });

  it('caches hashed assets immutably', () => {
    // Vite fingerprints filenames, so these are safe to cache forever; without
    // the header every visit refetches the whole bundle.
    const h = (cfg.hosting?.headers ?? []).find((x: { source: string }) =>
      x.source.includes('/assets/'),
    );
    expect(h, 'an /assets/** header block must exist').toBeTruthy();
    const cc = h.headers.find((k: { key: string }) => k.key.toLowerCase() === 'cache-control');
    expect(cc?.value).toMatch(/immutable/);
    expect(cc?.value).toMatch(/max-age=\d{7,}/); // a year, not a minute
  });

  it('does not reintroduce a /__/auth rewrite', () => {
    // Firebase Hosting serves /__/auth/* natively (verified 200 on both custom
    // domains). vercel.json needed an explicit proxy to firebaseapp.com; adding
    // one here would shadow the built-in handler and break sign-in.
    const authRewrite = (cfg.hosting?.rewrites ?? []).find((r: { source: string }) =>
      r.source.startsWith('/__/'),
    );
    expect(authRewrite).toBeUndefined();
  });
});
