/**
 * Which host Firebase should run the OAuth handshake against.
 *
 * Google sign-in opens `https://{authDomain}/__/auth/handler`. If that host is a
 * DIFFERENT origin from the page the user is on, the handshake breaks — which is
 * exactly what happened after the move to Firebase Hosting: the hardcoded
 * fallback was `www.mazad-jo.com`, so sign-in worked on `www` and silently did
 * nothing on the bare apex.
 *
 * The fix is to follow the visitor rather than pin one host.
 *
 * BEFORE ADDING A HOST TO THE ARRAY BELOW, read "Three requirements, not one" in
 * docs/DEPLOY.md. A host needs all three, in three different consoles:
 * Hosting serves `/__/auth/*` on it, it is in Firebase's authorized domains, AND
 * `https://{host}/__/auth/handler` is a registered redirect URI on the Google
 * Cloud OAuth client. The third is the one nothing warns you about — this file
 * was written on the strength of the first two, and every Google sign-in on
 * `mazzado.com` failed until the redirect URIs were added by hand on 2026-08-25.
 *
 * A 200 from `/__/auth/handler` does not prove sign-in works; it proves Hosting
 * is serving the file. Only completing a real sign-in on the host does.
 *
 * This also keeps the Google consent screen on the user's own domain, which is
 * why a hardcoded custom domain was wanted in the first place. Pinning
 * `mazadjoapp.firebaseapp.com` would have worked too, but shows Firebase's
 * hostname to the user mid-flow.
 */

/** Hosts that can serve the Firebase auth handler for this project. */
const KNOWN_AUTH_HOSTS = [
  // The Mazzado rebrand. All three requirements met: attached to the Hosting
  // site, in the authorized-domains list, and `/__/auth/handler` registered as
  // a redirect URI on the OAuth client — the last confirmed by a real sign-in.
  'mazzado.com',
  'www.mazzado.com',
  // mazad-jo.com and www.mazad-jo.com were here until 2026-08-24. Both are now
  // DETACHED from Firebase Hosting and removed from the project's authorized
  // domains, so neither serves `/__/auth/*` any more — listing them would point
  // the OAuth handshake at a host that returns "Site not found".
  // `mazadjoapp.web.app` was here and was REMOVED on 2026-08-28. It serves
  // `/__/auth/*` and is an authorized domain, but it has no registered redirect
  // URI — Firebase registers the `.firebaseapp.com` handler, not the `.web.app`
  // one — so echoing it back gave Google's "Access blocked" to anyone reaching
  // the app there. It now falls through to the fallback, which is the same
  // Firebase project and is registered. Requirement 3, again.
  'mazadjoapp.firebaseapp.com',
  'localhost',
] as const;

/**
 * Firebase's own default. Used when the current host is not one we know serves
 * the handler — a preview channel, a staging URL, an IP, someone's tunnel. Those
 * hosts do not serve `/__/auth/*`, so pointing at them would break sign-in in
 * exactly the way this function exists to prevent.
 */
export const FALLBACK_AUTH_DOMAIN = 'mazadjoapp.firebaseapp.com';

/**
 * @param hostname `window.location.hostname`, or undefined outside a browser.
 * @param configured an explicit `VITE_FIREBASE_AUTH_DOMAIN`, which always wins.
 */
export function resolveAuthDomain(
  hostname?: string | null,
  configured?: string | null,
): string {
  const explicit = typeof configured === 'string' ? configured.trim() : '';
  if (explicit !== '') return explicit;

  // An absent host normalises to '' and simply fails the membership check
  // below, so no separate guard is needed — one was written here and removed
  // after mutation testing proved it unreachable.
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';

  return (KNOWN_AUTH_HOSTS as readonly string[]).includes(host)
    ? host
    : FALLBACK_AUTH_DOMAIN;
}
