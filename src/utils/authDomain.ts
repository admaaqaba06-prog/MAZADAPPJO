/**
 * Which host Firebase should run the OAuth handshake against.
 *
 * Google sign-in sends the user to Google with
 * `redirect_uri=https://{authDomain}/__/auth/handler`. A host is only usable as
 * an authDomain if THREE separate things are true of it:
 *
 *   1. Firebase Hosting serves `/__/auth/*` on it.
 *   2. It is in the Firebase project's **Authorized domains** list
 *      (Authentication → Settings). This is what prevents the client-side
 *      `auth/unauthorized-domain` error.
 *   3. `https://{host}/__/auth/handler` is in the Google Cloud **OAuth 2.0
 *      client's Authorized redirect URIs** (APIs & Services → Credentials →
 *      client `622832200971-um3nc5odmfsh71eluir8b9r1dvoshi66`).
 *
 * REQUIREMENT 3 IS THE ONE THAT BITES, because nothing in the Firebase console
 * mentions it and adding a domain in step 2 does NOT add it in step 3. Google
 * rejects an unregistered redirect_uri with `Error 400: redirect_uri_mismatch`
 * — an "Access blocked" page, before any account picker.
 *
 * That is exactly what shipped with the Mazzado cutover. `mazzado.com` and
 * `www.mazzado.com` satisfied 1 and 2 and were listed here on that basis, but
 * were never added to the OAuth client, so Google sign-in was dead on
 * production. Measured 2026-08-25 by running the real flow per host:
 *
 *   www.mazzado.com              → redirect_uri_mismatch   (Access blocked)
 *   mazadjoapp.web.app           → redirect_uri_mismatch   (Access blocked)
 *   mazadjoapp.firebaseapp.com   → real Google sign-in page ✓
 *
 * So the list below is gated on requirement 3, not on 1 and 2. A host that
 * serves the handler and sits in the authorized-domains list is still not
 * eligible until its handler url is registered on the OAuth client.
 *
 * The cost of falling back is cosmetic and known: the Google screen reads
 * "to continue to mazadjoapp.firebaseapp.com" rather than the brand's own
 * domain. A branded consent screen is worth having — see the re-enable note
 * below — but not at the price of no sign-in at all.
 */

/**
 * Hosts whose `/__/auth/handler` is a REGISTERED redirect URI on the OAuth
 * client. Membership here is not about DNS or Hosting; see requirement 3 above.
 *
 * TO PUT THE CONSENT SCREEN BACK ON THE BRAND'S OWN DOMAIN:
 *   1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client
 *      `622832200971-um3nc5odmfsh71eluir8b9r1dvoshi66` → Authorized redirect
 *      URIs → add BOTH:
 *        https://www.mazzado.com/__/auth/handler
 *        https://mazzado.com/__/auth/handler
 *   2. Wait for propagation (Google says up to a few minutes; in practice it can
 *      be longer).
 *   3. Re-run the real flow on both hosts and confirm the Google page is the
 *      account picker and not "Access blocked".
 *   4. Only then move the two hosts out of the block below and into this array,
 *      and update authDomain.test.ts to match.
 * Do not do step 4 first. Doing so is the outage this comment exists to explain.
 */
const KNOWN_AUTH_HOSTS = [
  // Registered by Firebase when the project was created. Verified working
  // 2026-08-25 — Google served the real sign-in page.
  'mazadjoapp.firebaseapp.com',
  // Dev. Google special-cases localhost for OAuth; left as it was, since this
  // change is about production hosts and local sign-in was not re-measured.
  'localhost',

  // NOT ELIGIBLE — requirement 3 unmet. Each of these serves /__/auth/* and is
  // in the authorized-domains list, and each still returns redirect_uri_mismatch:
  //   'mazzado.com',          ← re-enable per the note above, after step 3
  //   'www.mazzado.com',      ← re-enable per the note above, after step 3
  //   'mazadjoapp.web.app',   ← Firebase registers .firebaseapp.com, not .web.app
  //
  // mazad-jo.com and www.mazad-jo.com were here until 2026-08-24. Both are now
  // DETACHED from Firebase Hosting and removed from the project's authorized
  // domains, so neither serves `/__/auth/*` any more — listing them would point
  // the OAuth handshake at a host that returns "Site not found".
] as const;

/**
 * Firebase's own default, and the only host proven to complete the handshake.
 * Used for any host not in the list above — a production custom domain pending
 * OAuth registration, a preview channel, a staging URL, an IP, someone's tunnel.
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
