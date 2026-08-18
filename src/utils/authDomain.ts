/**
 * Which host Firebase should run the OAuth handshake against.
 *
 * Google sign-in opens `https://{authDomain}/__/auth/handler`. If that host is a
 * DIFFERENT origin from the page the user is on, the handshake breaks — which is
 * exactly what happened after the move to Firebase Hosting: the hardcoded
 * fallback was `www.mazad-jo.com`, so sign-in worked on `www` and silently did
 * nothing on the bare apex.
 *
 * The fix is to follow the visitor rather than pin one host. Firebase Hosting
 * serves `/__/auth/*` natively on every custom domain attached to the site
 * (verified 200 on `mazad-jo.com`, `www.mazad-jo.com` and `mazadjoapp.web.app`),
 * and all of them are in the project's authorized-domains list — so the current
 * hostname is always a valid handler host.
 *
 * This also keeps the Google consent screen on the user's own domain, which is
 * why a hardcoded custom domain was wanted in the first place. Pinning
 * `mazadjoapp.firebaseapp.com` would have worked too, but shows Firebase's
 * hostname to the user mid-flow.
 */

/** Hosts that can serve the Firebase auth handler for this project. */
const KNOWN_AUTH_HOSTS = [
  'mazad-jo.com',
  'www.mazad-jo.com',
  'mazadjoapp.web.app',
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
