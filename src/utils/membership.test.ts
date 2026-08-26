import { describe, it, expect } from 'vitest';
import {
  parseExpiryMs,
  effectiveExpiryMs,
  isMembershipExpired,
  isActiveMember,
  resolveMembershipStatus,
  msUntilMembershipChange,
} from './membership';

/**
 * The reported bug: the account screen read "ACTIVE" with "Expires On:
 * August 23, 2026" printed directly beneath it, on 2026-08-25. Status was a
 * stored latch that nothing ever rewrote, and no client surface compared the
 * expiry to a clock.
 *
 * NOW is a fixed value, never Date.now(): a test that reads the wall clock is a
 * test that passes today and fails on the boundary date.
 */
const NOW = Date.UTC(2026, 7, 25, 12, 0, 0); // 2026-08-25T12:00:00Z
const DAY = 86_400_000;

/** The account from the screenshot: granted, dated, and two days past it. */
const REPORTED = {
  subscriptionStatus: 'active',
  subscriptionExpiry: Date.UTC(2026, 7, 23, 12, 0, 0),
};

describe('parseExpiryMs — every shape that reaches the client', () => {
  it('takes an epoch number', () => {
    expect(parseExpiryMs(NOW)).toBe(NOW);
  });

  it('takes a Firestore Timestamp', () => {
    expect(parseExpiryMs({ toMillis: () => NOW })).toBe(NOW);
  });

  it('takes a Timestamp that lost its methods to JSON', () => {
    expect(parseExpiryMs({ seconds: NOW / 1000, nanoseconds: 0 })).toBe(NOW);
  });

  it('takes an ISO string', () => {
    expect(parseExpiryMs('2026-08-25T12:00:00.000Z')).toBe(NOW);
  });

  it('reads a NUMERIC string as an epoch, not a date', () => {
    // new Date('1787...') is Invalid Date; Number() is the only correct read.
    expect(parseExpiryMs(String(NOW))).toBe(NOW);
  });

  it('returns null for anything with no date in it', () => {
    for (const junk of [null, undefined, '', '   ', 'not a date', {}, [], NaN, 0, -1, false]) {
      expect(parseExpiryMs(junk), String(junk)).toBeNull();
    }
  });
});

describe('effectiveExpiryMs — the later of the two stored fields', () => {
  it('takes the future one when the other is stale', () => {
    // buildGrantFields writes both from one value; a renewal that updated only
    // one must still count. This is the synchronisation case.
    expect(
      effectiveExpiryMs({
        subscriptionExpiry: NOW - 10 * DAY,
        subscriptionExpiresAt: { toMillis: () => NOW + 30 * DAY },
      }),
    ).toBe(NOW + 30 * DAY);
  });

  it('takes the future one regardless of which field holds it', () => {
    expect(
      effectiveExpiryMs({
        subscriptionExpiry: NOW + 30 * DAY,
        subscriptionExpiresAt: { toMillis: () => NOW - 10 * DAY },
      }),
    ).toBe(NOW + 30 * DAY);
  });

  it('falls back to whichever single field is present', () => {
    expect(effectiveExpiryMs({ subscriptionExpiry: NOW })).toBe(NOW);
    expect(effectiveExpiryMs({ subscriptionExpiresAt: { toMillis: () => NOW } })).toBe(NOW);
    expect(effectiveExpiryMs({})).toBeNull();
    expect(effectiveExpiryMs(null)).toBeNull();
  });
});

describe('active membership with a future expiry', () => {
  const user = { subscriptionStatus: 'active', subscriptionExpiry: NOW + 30 * DAY };

  it('is active, and not expired', () => {
    expect(resolveMembershipStatus(user, NOW)).toBe('active');
    expect(isActiveMember(user, NOW)).toBe(true);
    expect(isMembershipExpired(user, NOW)).toBe(false);
  });

  it('schedules its own flip', () => {
    expect(msUntilMembershipChange(user, NOW)).toBe(30 * DAY);
  });
});

describe('expired membership with a past expiry — THE REPORTED BUG', () => {
  it('reads expired even though the stored status still says active', () => {
    expect(REPORTED.subscriptionStatus).toBe('active'); // the latch, unchanged
    expect(resolveMembershipStatus(REPORTED, NOW)).toBe('expired');
  });

  it('refuses membership, matching what the server already does', () => {
    // functions/index.js placeBid answers MEMBERSHIP_REQUIRED for this account.
    expect(isActiveMember(REPORTED, NOW)).toBe(false);
    expect(isMembershipExpired(REPORTED, NOW)).toBe(true);
  });

  it('has nothing left to schedule', () => {
    expect(msUntilMembershipChange(REPORTED, NOW)).toBeNull();
  });
});

describe('the exact expiry boundary', () => {
  const at = { subscriptionStatus: 'active', subscriptionExpiry: NOW };

  it('an expiry AT this instant is spent', () => {
    // `<=`, matching the server's `subExpiryMs <= Date.now()`. Off-by-one here
    // is a member who can see "active" while the server refuses their bid.
    expect(resolveMembershipStatus(at, NOW)).toBe('expired');
    expect(isActiveMember(at, NOW)).toBe(false);
    expect(isMembershipExpired(at, NOW)).toBe(true);
  });

  it('one millisecond earlier is still active', () => {
    const justBefore = { subscriptionStatus: 'active', subscriptionExpiry: NOW + 1 };
    expect(resolveMembershipStatus(justBefore, NOW)).toBe('active');
    expect(isActiveMember(justBefore, NOW)).toBe(true);
    expect(msUntilMembershipChange(justBefore, NOW)).toBe(1);
  });

  it('one millisecond later is expired', () => {
    const justAfter = { subscriptionStatus: 'active', subscriptionExpiry: NOW - 1 };
    expect(resolveMembershipStatus(justAfter, NOW)).toBe('expired');
    expect(isActiveMember(justAfter, NOW)).toBe(false);
  });
});

describe('renewal synchronisation', () => {
  it('a future expiry beats a stale expired FLAG', () => {
    // The renewal landed and set the date; the status field lagged. The date is
    // the truth, so the badge must not contradict the line beneath it.
    const renewed = { subscriptionStatus: 'expired', subscriptionExpiry: NOW + 30 * DAY };
    expect(resolveMembershipStatus(renewed, NOW)).toBe('active');
  });

  it('a renewal recorded only on the Timestamp field still counts', () => {
    const renewed = {
      subscriptionStatus: 'active',
      subscriptionExpiry: NOW - 2 * DAY,                        // stale
      subscriptionExpiresAt: { toMillis: () => NOW + 28 * DAY }, // fresh
    };
    expect(resolveMembershipStatus(renewed, NOW)).toBe('active');
    expect(isActiveMember(renewed, NOW)).toBe(true);
    expect(isMembershipExpired(renewed, NOW)).toBe(false);
  });

  it('does NOT resurrect an account whose every date has passed', () => {
    const lapsed = {
      subscriptionStatus: 'active',
      subscriptionExpiry: NOW - 2 * DAY,
      subscriptionExpiresAt: { toMillis: () => NOW - DAY },
    };
    expect(resolveMembershipStatus(lapsed, NOW)).toBe('expired');
    expect(isActiveMember(lapsed, NOW)).toBe(false);
  });

  it('a lapsed member with a renewal under review reads pending, not expired', () => {
    // They have already paid and are waiting on us. "Expired" would hide that.
    const awaiting = { subscriptionStatus: 'pending', subscriptionExpiry: NOW - DAY };
    expect(resolveMembershipStatus(awaiting, NOW)).toBe('pending');
    expect(isActiveMember(awaiting, NOW)).toBe(false);
  });

  it('an early renewer keeps their badge but is still gated like the server gates them', () => {
    const early = { subscriptionStatus: 'pending', subscriptionExpiry: NOW + 5 * DAY };
    // Their paid period is genuinely still running.
    expect(resolveMembershipStatus(early, NOW)).toBe('active');
    // But placeBid refuses any status that is not exactly 'active', so the
    // client must refuse too rather than promise a bid the server will reject.
    expect(isActiveMember(early, NOW)).toBe(false);
  });
});

describe('states that are not about a date', () => {
  it('passes review states through when there is no expiry', () => {
    expect(resolveMembershipStatus({ subscriptionStatus: 'pending' }, NOW)).toBe('pending');
    expect(resolveMembershipStatus({ subscriptionStatus: 'rejected' }, NOW)).toBe('rejected');
    expect(resolveMembershipStatus({ subscriptionStatus: 'none' }, NOW)).toBe('none');
    expect(resolveMembershipStatus({}, NOW)).toBe('none');
    expect(resolveMembershipStatus(null, NOW)).toBe('none');
  });

  it('keeps rejected rejected even inside a live date window', () => {
    // A revoked grant must not be re-granted by a date the revoke left behind.
    const revoked = { subscriptionStatus: 'rejected', subscriptionExpiry: NOW + 30 * DAY };
    expect(resolveMembershipStatus(revoked, NOW)).toBe('rejected');
    expect(isActiveMember(revoked, NOW)).toBe(false);
  });

  it('treats a missing expiry as not-expired, exactly as the server does', () => {
    // The server cannot expire what it cannot parse; absence of a date is not
    // evidence of a lapse, and failing closed here would lock out every account
    // whose expiry field was never written.
    const noDate = { subscriptionStatus: 'active' };
    expect(isMembershipExpired(noDate, NOW)).toBe(false);
    expect(isActiveMember(noDate, NOW)).toBe(true);
    expect(resolveMembershipStatus(noDate, NOW)).toBe('active');
  });
});

describe('nothing is hardcoded', () => {
  it('the same account reads active before its date and expired after', () => {
    const user = { subscriptionStatus: 'active', subscriptionExpiry: NOW };
    expect(resolveMembershipStatus(user, NOW - DAY)).toBe('active');
    expect(resolveMembershipStatus(user, NOW)).toBe('expired');
    expect(resolveMembershipStatus(user, NOW + DAY)).toBe('expired');
  });

  it('carries no date literal of its own', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./membership.ts', import.meta.url), 'utf8');
    // No baked dates, and no reaching for the wall clock: `now` is always passed
    // in, so callers supply the server-corrected clock.
    expect(src).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/Date\.now\(\)/);
  });
});
