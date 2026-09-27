/**
 * The payer's CliQ identifier (BAE embedded-CliQ SCREEN 3).
 *
 * CliQ addresses an account by one of two things the payer registered with
 * their own bank: an ALIAS (a nickname) or the MOBILE NUMBER linked to the
 * account. This module validates and normalizes both, and — separately —
 * masks them, because an identifier is the payer's banking handle and must
 * never reach an analytics payload.
 *
 * Pure on purpose: the same rules are asserted server-side before a request is
 * created, so the browser's copy is a courtesy, never the enforcement.
 */

export type CliqIdentifierType = 'alias' | 'mobile';

export const CLIQ_IDENTIFIER_TYPES: readonly CliqIdentifierType[] = ['alias', 'mobile'];

/**
 * CliQ aliases are alphanumeric Latin (same constraint documented on our own
 * alias in constants/cliq.ts). Jordanian banks issue 3–35 characters; we accept
 * that range and reject everything with whitespace or punctuation so a payer
 * cannot submit a request addressed to a string no bank can resolve.
 */
const ALIAS_RE = /^[A-Za-z0-9]{3,35}$/;

/**
 * Jordanian mobile: 7 followed by 8 digits, on 77/78/79 (Zain/Orange/Umniah).
 * Accepts the four shapes a person actually types — +9627…, 009627…, 07…, 7… —
 * and normalizes them all to E.164.
 */
const JO_MOBILE_RE = /^(?:\+962|00962|0)?(7[789]\d{6,7})$/;

export function normalizeCliqAlias(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isValidCliqAlias(raw: unknown): boolean {
  return ALIAS_RE.test(normalizeCliqAlias(raw));
}

/**
 * E.164 (+9627XXXXXXXX) or '' when the input is not a Jordanian mobile.
 * Strips the spaces/dashes people paste out of a contacts app first.
 */
export function normalizeJordanMobile(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const compact = raw.replace(/[\s\-()]/g, '');
  const m = JO_MOBILE_RE.exec(compact);
  if (!m) return '';
  const national = m[1];
  // 7 + 8 digits is the current national length; anything shorter is a typo.
  if (national.length !== 9) return '';
  return `+962${national}`;
}

export function isValidJordanMobile(raw: unknown): boolean {
  return normalizeJordanMobile(raw) !== '';
}

/** Validate whichever field the SCREEN 3 dropdown selected. */
export function isValidCliqIdentifier(type: CliqIdentifierType, raw: unknown): boolean {
  return type === 'alias' ? isValidCliqAlias(raw) : isValidJordanMobile(raw);
}

/**
 * The value actually sent to the backend — normalized, never the raw input,
 * and '' when the input is not a valid identifier of that type.
 *
 * The empty-on-invalid part is not decoration: functions/cliqPayment.js does
 * exactly this and refuses the request when it gets '', so a client that
 * returned the raw text here would hand the server a value it had already
 * decided was unusable. cliqIdentifier.test.ts pins the two together.
 */
export function normalizeCliqIdentifier(type: CliqIdentifierType, raw: unknown): string {
  if (type === 'alias') {
    const s = normalizeCliqAlias(raw);
    return ALIAS_RE.test(s) ? s : '';
  }
  if (type === 'mobile') return normalizeJordanMobile(raw);
  return '';
}

/**
 * Display-safe form for the confirmation screen and for anything that could be
 * logged. Keeps enough for the payer to recognise their own handle and not
 * enough for a reader to reuse it.
 *
 * Deliberately NOT reversible and deliberately not a hash: this is for human
 * eyes, and a hash of a 9-digit space is trivially enumerable anyway.
 */
export function maskCliqIdentifier(type: CliqIdentifierType, value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return '';
  if (type === 'mobile') {
    // +9627XXXXX678 -> ••••678
    return `••••${s.slice(-3)}`;
  }
  if (s.length <= 2) return '••';
  return `${s.slice(0, 2)}${'•'.repeat(Math.max(2, s.length - 2))}`;
}

/** Placeholder shown in the phone field — the shape BAE asked for. */
export const JO_MOBILE_PLACEHOLDER = '+962 7X XXX XXXX';
