// Membership state, DERIVED from the expiry rather than read off a stored flag.
//
// THE BUG THIS FIXES: every client surface asked `subscriptionStatus === 'active'`
// and nothing anywhere compared the expiry to the clock. `subscriptionStatus` is
// a LATCH — subscriptionApproval.js writes 'active' at grant time and no
// scheduled job ever rewrites it — so an account stayed "ACTIVE" in the UI
// forever, with an expiry date sitting visibly in the past directly underneath.
//
// The server already had it right. functions/index.js placeBid gates on
//   subscriptionStatus !== 'active' || (subExpiryMs && subExpiryMs <= now)
// so an expired member is refused with MEMBERSHIP_REQUIRED at the moment they
// bid. The two halves disagreed: the UI promised access the server refused.
// `isActiveMember` below is that server predicate, mirrored exactly, so the
// answer is the same on both sides.
//
// TWO EXPIRY FIELDS EXIST, both written from one value by buildGrantFields:
// `subscriptionExpiry` (epoch ms) and `subscriptionExpiresAt` (Timestamp). The
// client only ever read the first. Taking the LATER of the two is what makes a
// renewal land even if one field is stale — a half-applied write, a legacy admin
// edit, an older client that only knew about one of them.

/** What the UI shows. Derived; never stored under this name. */
export type MembershipStatus = 'active' | 'expired' | 'pending' | 'rejected' | 'none';

/** The stored fields this module reads. Loose on purpose — Firestore hands back
 *  Timestamps, epoch numbers or (from legacy writes) ISO strings. */
export interface MembershipUserLike {
  subscriptionStatus?: string | null;
  subscriptionExpiry?: unknown;
  subscriptionExpiresAt?: unknown;
}

/**
 * One stored expiry value → epoch ms, or null when it carries no usable date.
 *
 * Accepts the three shapes that actually reach the client:
 *   - epoch number (what buildGrantFields writes to `subscriptionExpiry`)
 *   - Firestore Timestamp (`subscriptionExpiresAt`, and any `.toMillis()` object)
 *   - a date string (legacy/admin writes; the client User type still allows it)
 *
 * STRINGS ARE PARSED HERE ON PURPOSE, and that is a deliberate difference from
 * the server's inline parser, which handles only Timestamp and number and so
 * resolves a string to null — meaning a string-stored expiry never expires
 * anyone server-side. Parsing it here makes the UI honest about the date it is
 * displaying. The server-side gap is real and is fixed in the same change.
 */
export function parseExpiryMs(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  // Firestore Timestamp, or anything else exposing toMillis().
  if (typeof raw === 'object') {
    const asTs = raw as { toMillis?: () => unknown; seconds?: unknown };
    if (typeof asTs.toMillis === 'function') {
      const ms = asTs.toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    // A Timestamp that survived JSON (loses its methods, keeps its fields).
    if (typeof asTs.seconds === 'number' && Number.isFinite(asTs.seconds)) {
      const ms = asTs.seconds * 1000;
      return ms > 0 ? ms : null;
    }
    return null;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    // A numeric string is an epoch, not a date to be parsed by the Date parser —
    // `new Date('1787600000000')` is Invalid Date in every engine.
    if (/^\d+$/.test(trimmed)) {
      const ms = Number(trimmed);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * The expiry that actually governs, from whichever stored field is furthest in
 * the future. See the note at the top: the grant writes two fields from one
 * value, so the later of the two is the one a renewal updated.
 */
export function effectiveExpiryMs(user: MembershipUserLike | null | undefined): number | null {
  if (!user) return null;
  const a = parseExpiryMs(user.subscriptionExpiry);
  const b = parseExpiryMs(user.subscriptionExpiresAt);
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Has a real expiry that has passed.
 *
 * The boundary is `<= now`: an expiry AT the current instant is spent, matching
 * the server's `subExpiryMs <= Date.now()` exactly. A null expiry is NOT expired
 * — absence of a date is not evidence of a lapse, and treating it as one would
 * lock out every account whose expiry field never got written.
 */
export function isMembershipExpired(
  user: MembershipUserLike | null | undefined,
  nowMs: number,
): boolean {
  const expiry = effectiveExpiryMs(user);
  return expiry !== null && expiry <= nowMs;
}

/**
 * THE GATING PREDICATE. Mirrors functions/index.js placeBid exactly, so the
 * client never offers what the server will refuse:
 *   stored status is 'active' AND no expiry has passed.
 *
 * Deliberately NOT lenient about `pending`. A member renewing early sits at
 * 'pending' while their proof is reviewed, and the server refuses them — so the
 * client must too. Being generous here would recreate the split this module
 * exists to close, in the opposite direction.
 */
export function isActiveMember(
  user: MembershipUserLike | null | undefined,
  nowMs: number,
): boolean {
  if (!user) return false;
  if (user.subscriptionStatus !== 'active') return false;
  return !isMembershipExpired(user, nowMs);
}

/**
 * What the account screen shows.
 *
 * A FUTURE EXPIRY WINS OVER A STALE 'expired' FLAG. That is the renewal-sync
 * case: the grant sets the expiry, and if the status field lags behind — a
 * partial write, an older admin path — the date is the truth and the badge says
 * active rather than contradicting the line beneath it.
 *
 * `pending` and `rejected` are review states about a REQUEST, not claims about
 * a date, so they pass through untouched unless a live expiry says the previous
 * period is still running.
 */
export function resolveMembershipStatus(
  user: MembershipUserLike | null | undefined,
  nowMs: number,
): MembershipStatus {
  if (!user) return 'none';

  const stored = user.subscriptionStatus;
  const expiry = effectiveExpiryMs(user);

  if (expiry !== null) {
    if (expiry <= nowMs) {
      // Past its date. 'pending' survives — a lapsed member with a renewal under
      // review is genuinely pending, and calling that "expired" would hide the
      // fact that they have already paid and are waiting on us.
      return stored === 'pending' ? 'pending' : 'expired';
    }
    // Still inside the paid period.
    if (stored === 'rejected') return 'rejected';
    return 'active';
  }

  switch (stored) {
    case 'active':
      // Active with no date at all. Mirrors the server, which cannot expire what
      // it cannot parse. Reported rather than silently downgraded.
      return 'active';
    case 'pending':
      return 'pending';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    default:
      return 'none';
  }
}

/**
 * When this account's state next changes on its own, in ms from `nowMs`, or null
 * if nothing is scheduled.
 *
 * This is what lets the badge flip AT the boundary instead of on the next
 * unrelated re-render. A screen can set one timer for exactly this long rather
 * than polling a clock.
 */
export function msUntilMembershipChange(
  user: MembershipUserLike | null | undefined,
  nowMs: number,
): number | null {
  const expiry = effectiveExpiryMs(user);
  if (expiry === null || expiry <= nowMs) return null;
  return expiry - nowMs;
}
