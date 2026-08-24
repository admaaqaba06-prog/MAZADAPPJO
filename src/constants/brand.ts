/**
 * The product's name, in one place.
 *
 * Before this file the brand was 94 hardcoded Latin strings spread across six
 * different casings, plus 57 Arabic ones, so renaming meant a tree-wide
 * find-and-replace and hoping. It is a constant now: the next rename is this
 * file. (This comment used to name the old spellings as examples, and the
 * rename rewrote them mid-sentence, which is the argument for the constant
 * made rather more neatly than the sentence managed.)
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * `mazadjoapp` — the Firebase/GCP PROJECT ID. It is not a brand string and it
 * cannot be renamed: project IDs are immutable, and it is embedded in the
 * storage bucket, the hosting target `mazadjoapp.web.app` that the domain
 * CNAMEs to, the deploy service account, and the URL of every product photo
 * already uploaded. Changing it means a new project plus a migration of
 * Firestore, Storage and every Auth user — which would sign out the entire user
 * base. It is also invisible to customers: the Google consent screen shows
 * `authDomain`, which is the customer's own domain.
 *
 * The Arabic name is a transliteration of the Latin one. If a different
 * spelling is wanted (مزّادو with the shadda, say), change BRAND_AR here and
 * nothing else — every surface reads it from this constant.
 */

/** The product name, Latin script. */
export const BRAND_EN = 'Mazzado';

/** The product name, Arabic script. */
export const BRAND_AR = 'مزادو';

/** Canonical public host, no protocol. */
export const BRAND_HOST = 'www.mazzado.com';

/** Canonical public origin, for links built outside a browser context. */
export const BRAND_ORIGIN = `https://${BRAND_HOST}`;

/** The name in the reader's language. */
export function brandName(isAr: boolean): string {
  return isAr ? BRAND_AR : BRAND_EN;
}
