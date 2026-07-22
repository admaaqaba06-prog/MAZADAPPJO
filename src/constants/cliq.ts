/**
 * Canonical CliQ recipient (receiving account name) — single source of truth
 * for every money surface that tells a user who to transfer to
 * (order payment, wallet top-up, membership subscription).
 *
 * Wave 4 groundwork: the NAME and ALIAS are centralized here. The CliQ IBAN
 * and the QR are deliberately deferred — do not add them without a spec.
 */
export const CLIQ_RECIPIENT_NAME_AR = 'مؤسسة مزاد الأردن م';
export const CLIQ_RECIPIENT_NAME_EN = 'MAZAD JO M';

/**
 * CliQ alias — the PRIMARY transfer target. CliQ transfers in Jordan are
 * normally sent to an alias, not the IBAN (the IBAN stays as a fallback).
 */
export const CLIQ_ALIAS = 'mazadjom';
