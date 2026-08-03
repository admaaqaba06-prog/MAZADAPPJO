import { describe, it, expect } from 'vitest';
import {
  isUserFacingNotification,
  userFacingNotifications,
  unreadUserFacingCount,
  notificationAudience,
} from './notifications';

const n = (over: Record<string, unknown> = {}) =>
  ({
    id: 'n1',
    userId: 'user-current',
    title: 'title',
    description: 'description',
    type: 'order',
    timestamp: 0,
    read: false,
    ...over,
  }) as any;

describe('isUserFacingNotification', () => {
  // This rule was INVERTED. It used to be an allowlist of six bidder-relevant
  // types, and the tests below used to assert that 'info' and 'alert' were
  // correctly excluded as "ops noise". They are not ops noise: they are what
  // the SERVER writes for every money movement.
  //
  // Counted against functions/index.js, fourteen of the fifteen notification
  // writes were invisible in the bell — including "Withdrawal Approved 🎉",
  // "Withdrawal Rejected ❌", "Escrow Refunded 💸" and the buyer's own
  // "Order Completed". The server also writes type 'withdrawal', which was not
  // even in the Notification union.
  //
  // The client's own addNotification remaps its transient 'alert' errors to
  // 'admin' before they are stored, so excluding 'admin' still excludes exactly
  // the chatter the original rule was aiming at.
  it('shows the money-movement types the server actually writes', () => {
    for (const t of ['info', 'alert', 'withdrawal', 'refund', 'order', 'win', 'loss', 'outbid', 'subscription']) {
      expect(isUserFacingNotification(t as any), t).toBe(true);
    }
  });

  it('still hides genuinely internal chatter', () => {
    // 'admin'  — client-side errors, already surfaced as a toast when they happened.
    // 'bid'    — per-bid chatter; 'outbid' is the part a bidder needs.
    // 'wallet' — raw escrow ledger jargon.
    // 'verify' — an internal step, not an outcome.
    for (const t of ['admin', 'bid', 'wallet', 'verify']) {
      expect(isUserFacingNotification(t as any), t).toBe(false);
    }
  });

  it('shows an UNKNOWN type rather than swallowing it', () => {
    // The point of the inversion. Under an allowlist a new server-side type is
    // invisible by default, which is precisely how "Withdrawal Rejected" came
    // to reach nobody. Failing open costs a little noise; failing closed costs
    // a seller the news that their payout failed.
    expect(isUserFacingNotification('something_new' as any)).toBe(true);
  });
});

describe('userFacingNotifications', () => {
  it('keeps money news and drops admin chatter, preserving order', () => {
    const list = [
      n({ id: 'a', type: 'outbid' }),
      n({ id: 'b', type: 'admin' }),
      n({ id: 'c', type: 'info' }),
      n({ id: 'd', type: 'wallet' }),
      n({ id: 'e', type: 'order' }),
    ];
    expect(userFacingNotifications(list).map(x => x.id)).toEqual(['a', 'c', 'e']);
  });

  it('is safe on null/undefined', () => {
    expect(userFacingNotifications(null)).toEqual([]);
    expect(userFacingNotifications(undefined)).toEqual([]);
  });
});

describe('unreadUserFacingCount', () => {
  it('counts only unread, visible notifications', () => {
    const list = [
      n({ type: 'outbid', read: false }), // counts
      n({ type: 'outbid', read: true }), // read
      n({ type: 'admin', read: false }), // hidden type
      n({ type: 'info', read: false }), // counts — a withdrawal result
      n({ type: 'wallet', read: false }), // hidden type
    ];
    expect(unreadUserFacingCount(list)).toBe(2);
  });

  it('is 0 on empty/null input', () => {
    expect(unreadUserFacingCount([])).toBe(0);
    expect(unreadUserFacingCount(null)).toBe(0);
  });
});

describe('notificationAudience', () => {
  const orders = [
    { id: 'o-sold', buyerId: 'someone', sellerId: 'me' },
    { id: 'o-bought', buyerId: 'me', sellerId: 'someone' },
  ] as any[];

  it('reads an order I sold as selling', () => {
    expect(notificationAudience(n({ orderId: 'o-sold', type: 'win' }), 'me', orders)).toBe('selling');
  });

  it('reads an order I bought as buying', () => {
    // The SAME 'win' type as the seller's payout notification — the type alone
    // cannot tell them apart, which is why this resolves through the order.
    expect(notificationAudience(n({ orderId: 'o-bought', type: 'win' }), 'me', orders)).toBe('buying');
  });

  it('reads bidding activity as buying even before any order exists', () => {
    expect(notificationAudience(n({ type: 'outbid' }), 'me', orders)).toBe('buying');
    expect(notificationAudience(n({ type: 'loss' }), 'me', orders)).toBe('buying');
  });

  it('reads payouts and membership as account', () => {
    expect(notificationAudience(n({ type: 'withdrawal' }), 'me', orders)).toBe('account');
    expect(notificationAudience(n({ type: 'subscription' }), 'me', orders)).toBe('account');
  });

  it('falls back to account rather than guessing', () => {
    // An order that has not loaded yet must not be filed into the wrong tab.
    expect(notificationAudience(n({ orderId: 'o-missing', type: 'order' }), 'me', orders)).toBe('account');
    expect(notificationAudience(n({ orderId: 'o-sold' }), 'me', null)).toBe('account');
    expect(notificationAudience(n({ orderId: 'o-sold' }), '', orders)).toBe('account');
  });
});
