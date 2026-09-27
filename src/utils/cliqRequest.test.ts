// The CliQ 90-minute duplicate lock, and the client/server parity that keeps
// it honest.
//
// BAE tests the duplicate rule during onboarding, so the interesting cases here
// are not the happy path but the ones where a lock could leak: a pending
// request with no expiry, an expiry that has silently passed, a status field
// holding junk, and the boundary at exactly 90 minutes.
//
// The parity block is the same guard moneyParity.test.ts puts on the buyer's
// premium: the rule is implemented twice (browser + Admin SDK) and this fails
// the build if the two ever disagree.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  cliqRequestState,
  formatCliqCountdown,
  isCliqSettled,
  CLIQ_REQUEST_TTL_MS,
  CLIQ_PAYMENT_STATUSES,
  type CliqPaymentStatus,
} from './cliqRequest';

const require = createRequire(import.meta.url);
const server = require('../../functions/cliqPayment.js');

const NOW = 1_700_000_000_000;

describe('cliqRequestState — when a new request may be raised', () => {
  it('allows the first request on an order that has never had one', () => {
    const s = cliqRequestState({}, NOW);
    expect(s.canCreate).toBe(true);
    expect(s.status).toBe('none');
    expect(s.blockedReason).toBe('none');
  });

  it('BLOCKS a second request while one is pending inside the window', () => {
    const s = cliqRequestState(
      { cliqPaymentStatus: 'pending', cliqRequestExpiresAt: NOW + 60_000 },
      NOW
    );
    expect(s.canCreate).toBe(false);
    expect(s.blockedReason).toBe('pending');
    expect(s.remainingMs).toBe(60_000);
  });

  it('treats a pending request whose window has passed as expired, and allows a retry', () => {
    // The webhook may never arrive. If expiry were only applied by something
    // coming back to write it, a payer whose bank went quiet would be locked
    // out of retrying forever.
    const s = cliqRequestState(
      { cliqPaymentStatus: 'pending', cliqRequestExpiresAt: NOW - 1 },
      NOW
    );
    expect(s.status).toBe('expired');
    expect(s.canCreate).toBe(true);
  });

  it('still blocks at the exact millisecond before expiry, and releases at it', () => {
    const justBefore = cliqRequestState(
      { cliqPaymentStatus: 'pending', cliqRequestExpiresAt: NOW + 1 },
      NOW
    );
    expect(justBefore.canCreate).toBe(false);

    const exactly = cliqRequestState(
      { cliqPaymentStatus: 'pending', cliqRequestExpiresAt: NOW },
      NOW
    );
    expect(exactly.canCreate).toBe(true);
  });

  it('FAILS CLOSED on a pending request with no expiry rather than handing out a duplicate', () => {
    const s = cliqRequestState({ cliqPaymentStatus: 'pending' }, NOW);
    expect(s.canCreate).toBe(false);
    expect(s.blockedReason).toBe('pending');
  });

  it('refuses a new request once the payment is paid, with a distinct reason', () => {
    const s = cliqRequestState({ cliqPaymentStatus: 'paid' }, NOW);
    expect(s.canCreate).toBe(false);
    // The UI must not tell a buyer who already paid to "wait for the countdown".
    expect(s.blockedReason).toBe('already_paid');
  });

  it('allows a retry after rejected or expired', () => {
    expect(cliqRequestState({ cliqPaymentStatus: 'rejected' }, NOW).canCreate).toBe(true);
    expect(cliqRequestState({ cliqPaymentStatus: 'expired' }, NOW).canCreate).toBe(true);
  });

  it('treats an unknown status as none rather than trusting it', () => {
    const s = cliqRequestState({ cliqPaymentStatus: 'PENDING_APPROVAL' }, NOW);
    expect(s.status).toBe('none');
    expect(s.canCreate).toBe(true);
  });

  it('reads a Firestore Timestamp and a Date, not only a number', () => {
    const asTimestamp = { toMillis: () => NOW + 30_000 };
    expect(
      cliqRequestState({ cliqPaymentStatus: 'pending', cliqRequestExpiresAt: asTimestamp }, NOW).remainingMs
    ).toBe(30_000);

    expect(
      cliqRequestState(
        { cliqPaymentStatus: 'pending', cliqRequestExpiresAt: new Date(NOW + 45_000) },
        NOW
      ).remainingMs
    ).toBe(45_000);
  });

  it('survives a null order', () => {
    expect(cliqRequestState(null, NOW).canCreate).toBe(true);
  });
});

describe('formatCliqCountdown', () => {
  it('renders MM:SS', () => {
    expect(formatCliqCountdown(90 * 60 * 1000)).toBe('90:00');
    expect(formatCliqCountdown(73 * 60 * 1000)).toBe('73:00');
    expect(formatCliqCountdown(65_000)).toBe('01:05');
  });

  it('never renders a negative or a bare minute count', () => {
    expect(formatCliqCountdown(-5_000)).toBe('00:00');
    expect(formatCliqCountdown(0)).toBe('00:00');
  });
});

describe('isCliqSettled', () => {
  it('is true only for terminal outcomes', () => {
    expect(isCliqSettled('paid')).toBe(true);
    expect(isCliqSettled('rejected')).toBe(true);
    expect(isCliqSettled('expired')).toBe(true);
    expect(isCliqSettled('pending')).toBe(false);
    expect(isCliqSettled('none')).toBe(false);
  });
});

describe('client/server parity — the lock is implemented twice', () => {
  it('agrees on the 90-minute window', () => {
    expect(CLIQ_REQUEST_TTL_MS).toBe(server.CLIQ_REQUEST_TTL_MS);
    expect(CLIQ_REQUEST_TTL_MS).toBe(90 * 60 * 1000);
  });

  it('agrees on the status vocabulary', () => {
    expect([...CLIQ_PAYMENT_STATUSES]).toEqual([...server.CLIQ_STATUSES]);
  });

  it('decides every state identically', () => {
    const offsets = [-CLIQ_REQUEST_TTL_MS, -1, 0, 1, 60_000, CLIQ_REQUEST_TTL_MS];
    const statuses: unknown[] = [...CLIQ_PAYMENT_STATUSES, undefined, null, 'junk'];

    for (const status of statuses) {
      for (const offset of offsets) {
        for (const withExpiry of [true, false]) {
          const order = {
            cliqPaymentStatus: status,
            ...(withExpiry ? { cliqRequestExpiresAt: NOW + offset } : {}),
          };
          const label = `status=${String(status)} offset=${offset} expiry=${withExpiry}`;
          const mine = cliqRequestState(order as any, NOW);
          const theirs = server.cliqRequestState(order, NOW);
          expect(mine.status, `status diverged at ${label}`).toBe(theirs.status);
          expect(mine.canCreate, `canCreate diverged at ${label}`).toBe(theirs.canCreate);
          expect(mine.blockedReason, `reason diverged at ${label}`).toBe(theirs.blockedReason);
          expect(mine.remainingMs, `remaining diverged at ${label}`).toBe(theirs.remainingMs);
        }
      }
    }
  });
});
