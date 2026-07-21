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
 * A profile is complete when the user has a real name (phone signups get the
 * placeholder 'User'; a phone-number-looking name doesn't count either) and a
 * city. Email is optional — receipts only — and is deliberately NOT part of
 * completeness.
 */
export function isProfileComplete(user: any): boolean {
  if (!user) return false;
  if (needsName(user)) return false;
  if (!user.city) return false;
  return true;
}
