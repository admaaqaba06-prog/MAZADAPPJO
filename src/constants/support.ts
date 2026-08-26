/**
 * The ONE official MAZZADO contact number.
 *
 * There used to be two, in five formats, hardcoded across nine files: a
 * customer-service line (`+962781444899`) and a separate payments line
 * (`+962785446498`), each written variously as `wa.me/962…`, `tel:+962…`,
 * `0781444899` in the legal docs, and duplicated again in the email footer and
 * its HTML template. Nothing tied them together, so they drifted — and a support
 * number that is wrong in one place is worse than no number, because the
 * customer who calls it believes they have reached us.
 *
 * DERIVED, NOT LISTED. Only `NATIONAL` is written down; every other form is
 * computed from it, so there is no second place to forget. Add a format here
 * rather than formatting a number at a call site.
 *
 * Not to be confused with a user's own phone. This is the company's line —
 * `phoneNumber.ts` handles customer numbers, OTP and E.164 validation, and none
 * of that is affected by this file.
 */

/** As printed for a Jordanian reader: local trunk form. */
export const SUPPORT_PHONE_NATIONAL = '0785168550';

/** Jordan's country calling code, without the plus. */
const COUNTRY_CODE = '962';

/**
 * E.164. Built by dropping the national trunk '0' and prefixing the country
 * code — the same normalisation `normalizeJordanPhone` applies to user input.
 */
export const SUPPORT_PHONE_E164 = `+${COUNTRY_CODE}${SUPPORT_PHONE_NATIONAL.replace(/^0/, '')}`;

/** `tel:` target. E.164 with the plus, which is what dialers expect. */
export const SUPPORT_PHONE_TEL = `tel:${SUPPORT_PHONE_E164}`;

/**
 * WhatsApp deep link. wa.me takes digits only — no plus, no separators — and
 * silently fails to resolve a number that carries them.
 */
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE_E164.replace(/\D/g, '')}`;

/**
 * The official Instagram profile.
 *
 * CANONICAL URL, deliberately. The link supplied carried an `igsi=` query
 * parameter, which Instagram appends when a profile is shared from the app: it
 * identifies the share that produced the link, not the profile. Publishing it
 * on every page view would republish that token to every visitor, and the
 * profile resolves identically without it.
 *
 * Here rather than in the footer component for the same reason the phone number
 * is: the moment a second surface links to it — a share sheet, an email, a
 * seller page — a hardcoded copy starts drifting.
 */
export const SOCIAL_INSTAGRAM_HANDLE = 'mazzadoofficial';
export const SOCIAL_INSTAGRAM_URL = `https://www.instagram.com/${SOCIAL_INSTAGRAM_HANDLE}`;
