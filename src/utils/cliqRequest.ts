/**
 * The CliQ 90-minute duplicate-request lock.
 *
 * BAE's hard constraint: a CliQ payment request is valid for 90 minutes across
 * all banks, and a payer cannot raise a second request for the same payment
 * until the first is Paid, Rejected or Expired, or the window has run out.
 * BAE tests this during onboarding.
 *
 * ⚠️ THIS FILE IS THE DISPLAY COPY, NOT THE ENFORCEMENT. The identical rule
 * lives in functions/cliqPayment.js and runs inside the create transaction on
 * the Admin SDK; cliqRequestParity.test.ts asserts the two agree. A browser can
 * be refreshed, reloaded with a patched bundle, or driven from a console — so
 * what this module decides only governs what is DRAWN. Never make it the
 * gate. (Same split as bidMath.ts vs settlement.js for money.)
 *
 * EXPIRY IS DERIVED, NOT WATCHED. A request whose window has run out while the
 * page sat open is treated as expired the moment `nowMs` passes it, without
 * waiting for a webhook or a sweep — otherwise a payer whose bank never
 * answered would be locked out of retrying forever by a status field that
 * nothing came back to change.
 */

export const CLIQ_REQUEST_TTL_MS = 90 * 60 * 1000;

export type CliqPaymentStatus = 'none' | 'pending' | 'paid' | 'rejected' | 'expired';

export const CLIQ_PAYMENT_STATUSES: readonly CliqPaymentStatus[] = [
  'none', 'pending', 'paid', 'rejected', 'expired',
];

/** Statuses a user may raise a FRESH request from. 'paid' is absent on purpose. */
const RETRYABLE: ReadonlySet<CliqPaymentStatus> = new Set<CliqPaymentStatus>([
  'none', 'rejected', 'expired',
]);

export interface CliqOrderFields {
  cliqPaymentStatus?: unknown;
  /** Millis. Firestore Timestamps must be converted by the caller. */
  cliqRequestExpiresAt?: unknown;
}

export interface CliqRequestState {
  /** The effective status after applying the derived expiry above. */
  status: CliqPaymentStatus;
  /** True when a new request may be created right now. */
  canCreate: boolean;
  /** Milliseconds until the pending request expires; 0 when not pending. */
  remainingMs: number;
  /** Why creation is refused — drives which message the UI shows. */
  blockedReason: 'none' | 'pending' | 'already_paid';
}

function readStatus(raw: unknown): CliqPaymentStatus {
  return (CLIQ_PAYMENT_STATUSES as readonly unknown[]).includes(raw)
    ? (raw as CliqPaymentStatus)
    : 'none';
}

function readMillis(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  // Firestore Timestamp-like, and Date, without importing either.
  if (raw && typeof (raw as any).toMillis === 'function') {
    const v = (raw as any).toMillis();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  if (raw instanceof Date) {
    const v = raw.getTime();
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

export function cliqRequestState(order: CliqOrderFields | null | undefined, nowMs: number): CliqRequestState {
  const stored = readStatus(order?.cliqPaymentStatus);
  const expiresAt = readMillis(order?.cliqRequestExpiresAt);

  if (stored === 'pending') {
    // A pending request with NO expiry is malformed — fail CLOSED and hold the
    // lock rather than hand out a duplicate on a missing field.
    if (expiresAt == null) {
      return { status: 'pending', canCreate: false, remainingMs: CLIQ_REQUEST_TTL_MS, blockedReason: 'pending' };
    }
    const remainingMs = expiresAt - nowMs;
    if (remainingMs > 0) {
      return { status: 'pending', canCreate: false, remainingMs, blockedReason: 'pending' };
    }
    return { status: 'expired', canCreate: true, remainingMs: 0, blockedReason: 'none' };
  }

  if (stored === 'paid') {
    return { status: 'paid', canCreate: false, remainingMs: 0, blockedReason: 'already_paid' };
  }

  return {
    status: stored,
    canCreate: RETRYABLE.has(stored),
    remainingMs: 0,
    blockedReason: 'none',
  };
}

/** MM:SS for the retry countdown. Clamps at 00:00; never renders a negative. */
export function formatCliqCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Terminal statuses — the UI stops polling once one of these lands. */
export function isCliqSettled(status: CliqPaymentStatus): boolean {
  return status === 'paid' || status === 'rejected' || status === 'expired';
}
