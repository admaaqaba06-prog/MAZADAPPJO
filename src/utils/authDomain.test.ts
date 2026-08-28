// Which host Firebase runs the OAuth handshake against.
//
// The bug this prevents: authDomain was pinned to "www.mazad-jo.com", so Google
// sign-in worked on www and silently did nothing on the bare apex — the button
// appeared dead, with no error shown to the user.
import { describe, it, expect } from 'vitest';
import { resolveAuthDomain, FALLBACK_AUTH_DOMAIN } from './authDomain';

describe('resolveAuthDomain — follows the visitor', () => {
  it('uses the current host for every host that can complete the handshake', () => {
    // "Serves the handler" is NOT the test — that was the mistake that took
    // Google sign-in down. A host must also be an authorized domain AND have
    // https://{host}/__/auth/handler registered as a redirect URI on the OAuth
    // client. These are verified on all three counts; see docs/DEPLOY.md.
    for (const h of ['mazzado.com', 'www.mazzado.com', 'localhost']) {
      expect(resolveAuthDomain(h), h).toBe(h);
    }
  });

  it('sends mazadjoapp.web.app to the fallback — it serves the handler but is not registered', () => {
    // The trap in one case. Hosting answers 200 on this host and it IS an
    // authorized domain, so by the old two-part reasoning it belonged in the
    // list. Google rejects the handshake anyway, because Firebase registers the
    // .firebaseapp.com redirect URI and not the .web.app one. Echoing it back
    // gave "Access blocked" to every visitor who arrived there.
    expect(resolveAuthDomain('mazadjoapp.web.app')).toBe(FALLBACK_AUTH_DOMAIN);
    // The fallback is the same Firebase project and IS registered, so sign-in
    // completes — just with Firebase's hostname on the consent screen.
    expect(FALLBACK_AUTH_DOMAIN).toBe('mazadjoapp.firebaseapp.com');
  });

  it('keeps the apex on the apex — the exact case that was broken', () => {
    expect(resolveAuthDomain('mazzado.com')).toBe('mazzado.com');
    expect(resolveAuthDomain('mazzado.com')).not.toBe('www.mazzado.com');
  });

  it('sends a RETIRED host to the fallback, not to itself', () => {
    // mazad-jo.com was detached from Firebase Hosting on 2026-08-24, so it no
    // longer serves /__/auth/*. Returning it would point the OAuth handshake at
    // a host that answers "Site not found".
    for (const dead of ['mazad-jo.com', 'www.mazad-jo.com']) {
      expect(resolveAuthDomain(dead), dead).toBe(FALLBACK_AUTH_DOMAIN);
    }
  });

  it('is case- and whitespace-insensitive about the host', () => {
    expect(resolveAuthDomain('WWW.Mazzado.com')).toBe('www.mazzado.com');
    expect(resolveAuthDomain('  mazzado.com  ')).toBe('mazzado.com');
  });
});

describe('resolveAuthDomain — falls back rather than guessing', () => {
  it('uses Firebase default outside a browser', () => {
    // Module init in a node test or any SSR-ish context has no window.
    expect(resolveAuthDomain(undefined)).toBe(FALLBACK_AUTH_DOMAIN);
    expect(resolveAuthDomain(null)).toBe(FALLBACK_AUTH_DOMAIN);
    expect(resolveAuthDomain('')).toBe(FALLBACK_AUTH_DOMAIN);
    expect(resolveAuthDomain('   ')).toBe(FALLBACK_AUTH_DOMAIN);
  });

  it('does NOT trust an unknown host', () => {
    // A preview channel, staging URL, IP or tunnel does not serve /__/auth/*,
    // so echoing it back would break sign-in in the very way this prevents.
    for (const h of [
      'mazadjoapp--pr123-abc.web.app',
      'staging.mazzado.com',
      '192.168.1.34',
      'evil.example.com',
      'mazzado.com.attacker.net',
    ]) {
      expect(resolveAuthDomain(h), h).toBe(FALLBACK_AUTH_DOMAIN);
    }
  });

  it('never returns an empty string', () => {
    for (const h of [undefined, null, '', '  ', 'nope.example']) {
      expect(resolveAuthDomain(h as never).length).toBeGreaterThan(0);
    }
  });
});

describe('resolveAuthDomain — an explicit env var always wins', () => {
  it('prefers the configured value over the host', () => {
    expect(resolveAuthDomain('mazzado.com', 'custom.example.com')).toBe('custom.example.com');
  });

  it('ignores a blank env var rather than returning it', () => {
    // Vite gives '' for an unset var in some setups; that must not become the
    // authDomain, which would break auth entirely.
    expect(resolveAuthDomain('mazzado.com', '')).toBe('mazzado.com');
    expect(resolveAuthDomain('mazzado.com', '   ')).toBe('mazzado.com');
    expect(resolveAuthDomain(undefined, '')).toBe(FALLBACK_AUTH_DOMAIN);
  });
});

describe('the firebase service actually uses it', () => {
  it('passes the live hostname, and no longer pins www', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../services/firebase.ts', import.meta.url), 'utf8'));
    expect(src).toMatch(/resolveAuthDomain\(/);
    expect(src).toMatch(/window\.location\.hostname/);
    // The pinned value that caused the outage must not come back.
    expect(src).not.toMatch(/authDomain:.*"www\.mazad-jo\.com"/);
  });
});
