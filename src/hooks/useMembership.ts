import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { serverNow } from '../utils/serverTime';
import {
  effectiveExpiryMs,
  isActiveMember,
  msUntilMembershipChange,
  resolveMembershipStatus,
  type MembershipStatus,
} from '../utils/membership';

export interface Membership {
  /** What the UI shows. Derived from the expiry, never read off a stored flag. */
  status: MembershipStatus;
  /** Whether this account may bid. Mirrors the server's placeBid gate exactly. */
  isMember: boolean;
  /** The governing expiry in epoch ms, or null when no date is stored. */
  expiresAtMs: number | null;
}

/**
 * Membership, recomputed at the moment it actually changes.
 *
 * WHY A TIMER AT ALL: the state is a function of the clock, and nothing
 * re-renders when a clock passes a threshold. Without this the badge would keep
 * saying "active" until some unrelated context update happened to repaint the
 * screen — which is a smaller version of the original bug rather than a fix.
 *
 * ONE TIMEOUT, SET TO THE BOUNDARY, not an interval. A member with 29 days left
 * gets a single sleeping timer; polling every second for 29 days to catch one
 * transition is 2.5 million wakeups for the same answer. The timer is re-armed
 * whenever the user document changes, so a renewal moves the boundary rather
 * than leaving a stale one queued.
 *
 * `serverNow()` and not `Date.now()`: the whole point is not to trust the
 * device. A phone whose clock is a day fast would otherwise show its owner an
 * expired badge on a membership the server still honours.
 */
export function useMembership(): Membership {
  const { currentUser } = useApp();

  const compute = (): Membership => {
    const now = serverNow();
    return {
      status: resolveMembershipStatus(currentUser, now),
      isMember: isActiveMember(currentUser, now),
      // The governing expiry itself, PAST OR FUTURE. Deriving it from
      // msUntilMembershipChange would have returned null for a lapsed account —
      // and the expired date is precisely what the account screen must show,
      // since a badge reading "Expired" with no date beneath it tells the user
      // nothing about when, or what to renew from.
      expiresAtMs: effectiveExpiryMs(currentUser),
    };
  };

  const [membership, setMembership] = useState<Membership>(compute);

  // Depend on the FIELDS, not the user object: AppContext hands back a fresh
  // object on unrelated writes, which would re-arm the timer constantly.
  const status = currentUser?.subscriptionStatus ?? null;
  const expiry = currentUser?.subscriptionExpiry ?? null;
  const expiresAt = (currentUser as { subscriptionExpiresAt?: unknown } | null)?.subscriptionExpiresAt ?? null;

  useEffect(() => {
    setMembership(compute());

    const ms = msUntilMembershipChange(currentUser, serverNow());
    if (ms === null) return;

    // setTimeout clamps above ~24.8 days (2^31-1 ms) and would fire IMMEDIATELY
    // on anything longer, so a long membership would flip its own badge to
    // expired within a frame. Re-arm in bounded hops instead.
    const MAX_DELAY = 2_147_483_000;
    const id = window.setTimeout(() => setMembership(compute()), Math.min(ms, MAX_DELAY));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, expiry, expiresAt, membership.status]);

  return membership;
}
