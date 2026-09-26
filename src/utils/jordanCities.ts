/**
 * Jordan governorates + profile-completeness helper (Auth/KYC Wave 2).
 *
 * The 12 governorates are the canonical "city" choices for user profiles.
 * Ids are stable lowercase/kebab identifiers persisted in the users doc
 * (`city` field) — labels can change, ids must not.
 */

export interface JordanGovernorate {
  id: string;
  ar: string;
  en: string;
}

export const JORDAN_GOVERNORATES: JordanGovernorate[] = [
  { id: 'amman', ar: 'عمّان', en: 'Amman' },
  { id: 'irbid', ar: 'إربد', en: 'Irbid' },
  { id: 'zarqa', ar: 'الزرقاء', en: 'Zarqa' },
  { id: 'balqa', ar: 'البلقاء', en: 'Balqa' },
  { id: 'mafraq', ar: 'المفرق', en: 'Mafraq' },
  { id: 'jerash', ar: 'جرش', en: 'Jerash' },
  { id: 'ajloun', ar: 'عجلون', en: 'Ajloun' },
  { id: 'karak', ar: 'الكرك', en: 'Karak' },
  { id: 'tafilah', ar: 'الطفيلة', en: 'Tafilah' },
  { id: 'maan', ar: 'معان', en: "Ma'an" },
  { id: 'aqaba', ar: 'العقبة', en: 'Aqaba' },
  { id: 'madaba', ar: 'مادبا', en: 'Madaba' },
];

/** Stable list of valid `city` ids (same order as JORDAN_GOVERNORATES). */
export const CITY_IDS: readonly string[] = JORDAN_GOVERNORATES.map(g => g.id);

const CITY_ID_SET = new Set(CITY_IDS);

export function isValidCityId(x: unknown): boolean {
  return typeof x === 'string' && CITY_ID_SET.has(x);
}

/**
 * Names that look like a phone number (all digits / E.164, optionally with
 * spaces or dashes). Legacy phone signups were created with
 * `name = firebaseUser.phoneNumber` — that must never count as a real name.
 */
const PHONE_LIKE_NAME = /^\+?[\d][\d\s-]{5,}$/;

/**
 * True when the user still needs to provide a real display name:
 * missing/blank, the phone-signup placeholder 'User', or a name that is
 * really a phone number (legacy docs created before the placeholder fix).
 */
export function needsName(user: any): boolean {
  if (!user) return true;
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (!name || name === 'User') return true;
  return PHONE_LIKE_NAME.test(name);
}

/**
 * True when the user still needs to provide a city.
 *
 * ASKED AT THE WIN, NOT AT SIGNUP. A city is a DELIVERY address: nobody needs
 * one to browse, and nobody needs one to bid. It is required when a lot is won
 * and has to be sent somewhere — see the payment/fulfilment path.
 */
export function needsCity(user: any): boolean {
  if (!user) return true;
  const city = typeof user.city === 'string' ? user.city.trim() : '';
  return city === '';
}

/**
 * WHY THIS NO LONGER GATES THE APP.
 *
 * `isProfileComplete` used to require a name AND a city, and App.tsx rendered a
 * non-dismissible full-screen modal until both existed. Every phone signup hit
 * it by construction — the new user document is written with `name: 'User'` and
 * `city: ''` — so the last step of an eight-screen signup was a wall asking for
 * two things the visitor did not need in order to do the thing they came for.
 *
 * Both fields are still required, just at the moment they are actually used:
 *   - `needsName`  -> the bid gate. A bid shows a name in the history and on
 *                     the order, so it cannot be placed anonymously.
 *   - `needsCity`  -> the win. A city is a delivery address and is meaningless
 *                     before there is something to deliver.
 *
 * This is kept as the "everything we will eventually need is present" predicate
 * for surfaces that legitimately want the whole profile (admin views, the
 * profile screen's own completeness hint). It must NOT be used to block
 * navigation again.
 */
export function isProfileComplete(user: any): boolean {
  if (!user) return false;
  if (needsName(user)) return false;
  if (needsCity(user)) return false;
  return true;
}
