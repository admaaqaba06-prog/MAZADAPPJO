// Which host Firebase runs the OAuth handshake against.
//
// Two outages are pinned down here.
//
// (1) authDomain was pinned to "www.mazad-jo.com", so Google sign-in worked on
//     www and silently did nothing on the bare apex — the button appeared dead,
//     with no error shown to the user.
//
// (2) The Mazzado cutover listed mazzado.com / www.mazzado.com as auth hosts
//     because they serve /__/auth/* AND sit in the Firebase authorized-domains
//     list. Both true, and both insufficient: the handler url must ALSO be a
//     registered redirect URI on the Google Cloud OAuth client, which it was
//     not. Google answered redirect_uri_mismatch and sign-in was dead on
//     production. See the requirement list in authDomain.ts.
//
// The assertions below are therefore gated on OAuth-client registration, which
// is the binding constraint — not on DNS or Hosting, which are not.
import { describe, it, expect } from 'vitest';
import fsSync from 'node:fs';
import { resolveAuthDomain, FALLBACK_AUTH_DOMAIN } from './authDomain';

describe('resolveAuthDomain — only hosts registered on the OAuth client', () => {
  it('uses the current host when its handler url is a registered redirect URI', () => {
    // Verified 2026-08-25 by running the real flow: Google served the account
    // picker on this host, not "Access blocked".
    for (const h of ['mazadjoapp.firebaseapp.com', 'localhost']) {
      expect(resolveAuthDomain(h), h).toBe(h);
    }
  });

  it('sends an UNREGISTERED host to the fallback, however valid it looks', () => {
    // The outage. Each of these serves /__/auth/* and is in the Firebase
    // authorized-domains list, and each was still rejected by Google with
    // redirect_uri_mismatch because its handler url is not on the OAuth client.
    // Echoing them back is precisely what broke sign-in.
    for (const unregistered of ['mazzado.com', 'www.mazzado.com', 'mazadjoapp.web.app']) {
      expect(resolveAuthDomain(unregistered), unregistered).toBe(FALLBACK_AUTH_DOMAIN);
    }
  });

  it('states the re-enable procedure where the list is, not in a ticket', () => {
    // A future reader WILL want the brand's own domain on the consent screen.
    // The order of operations is the whole lesson, so it has to live next to
    // the array they are about to edit.
    const src = fsSync.readFileSync(new URL('./authDomain.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/Authorized redirect URIs/);
    expect(src).toContain('https://www.mazzado.com/__/auth/handler');
    expect(src).toContain('https://mazzado.com/__/auth/handler');
    expect(src).toMatch(/redirect_uri_mismatch/);
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
    expect(resolveAuthDomain('MazadJoApp.FirebaseApp.com')).toBe('mazadjoapp.firebaseapp.com');
    expect(resolveAuthDomain('  mazadjoapp.firebaseapp.com  ')).toBe('mazadjoapp.firebaseapp.com');
    // Normalisation must not smuggle an unregistered host through either.
    expect(resolveAuthDomain('  WWW.Mazzado.COM  ')).toBe(FALLBACK_AUTH_DOMAIN);
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
    expect(resolveAuthDomain('mazadjoapp.firebaseapp.com', '')).toBe('mazadjoapp.firebaseapp.com');
    expect(resolveAuthDomain('mazadjoapp.firebaseapp.com', '   ')).toBe('mazadjoapp.firebaseapp.com');
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
