// Where a notification click should take you.
//
// The rule this file exists to enforce: NEVER GUESS. It mirrors the philosophy
// already stated in notifications.ts for `notificationAudience` — *"a
// notification filed into the WRONG tab is worse than one in the general tab"* —
// and the cost is higher for navigation than for filing. Sending someone to the
// wrong lot reads as a bug in the auction, not a bug in the bell.
import { describe, it, expect } from 'vitest';
import { notificationDestination } from './notificationDestination';
import type { Notification } from '../types';

const n = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  type: 'info',
  title: 't',
  description: 'd',
  timestamp: 1,
  read: false,
  ...over,
} as Notification);

describe('notificationDestination — bidding activity goes to the lot', () => {
  it('routes outbid, bid, win and loss to their auction', () => {
    for (const type of ['outbid', 'bid', 'win', 'loss'] as const) {
      const d = notificationDestination(n({ type, auctionId: 'a1' }));
      expect(d, type).toEqual({ view: 'live', auctionId: 'a1' });
    }
  });

  it('does NOT route bidding activity with no auction id', () => {
    // Better to stay put than open an arbitrary lot.
    for (const type of ['outbid', 'bid', 'win', 'loss'] as const) {
      expect(notificationDestination(n({ type })), type).toBeNull();
    }
  });
});

describe('notificationDestination — order activity goes to the order', () => {
  it('routes order and refund to that order', () => {
    for (const type of ['order', 'refund'] as const) {
      const d = notificationDestination(n({ type, orderId: 'o1' }));
      expect(d, type).toEqual({ view: 'orders', orderId: 'o1' });
    }
  });

  it('prefers the ORDER over the auction when a notification carries both', () => {
    // An order notification that also names its lot is about the order.
    const d = notificationDestination(n({ type: 'order', orderId: 'o1', auctionId: 'a1' }));
    expect(d).toEqual({ view: 'orders', orderId: 'o1' });
  });

  it('falls back to the lot when an order notification has no order id', () => {
    const d = notificationDestination(n({ type: 'order', auctionId: 'a1' }));
    expect(d).toEqual({ view: 'live', auctionId: 'a1' });
  });

  it('does not route an order notification carrying neither id', () => {
    expect(notificationDestination(n({ type: 'order' }))).toBeNull();
  });
});

describe('notificationDestination — wallet and subscription', () => {
  it('routes wallet and withdrawal to the wallet', () => {
    for (const type of ['wallet', 'withdrawal'] as const) {
      expect(notificationDestination(n({ type })), type).toEqual({ view: 'wallet' });
    }
  });

  it('routes subscription to the profile', () => {
    expect(notificationDestination(n({ type: 'subscription' }))).toEqual({ view: 'profile' });
  });
});

describe('notificationDestination — never guesses', () => {
  it('returns null for informational types with no entity', () => {
    // 'info', 'alert', 'verify' and 'admin' are announcements, not pointers.
    for (const type of ['info', 'alert', 'verify', 'admin'] as const) {
      expect(notificationDestination(n({ type })), type).toBeNull();
    }
  });

  it('returns null for an unknown/legacy type rather than erroring', () => {
    // The spec's own acceptance criterion: fall back gracefully.
    expect(notificationDestination(n({ type: 'something_new' as never }))).toBeNull();
    expect(notificationDestination(n({ type: undefined as never }))).toBeNull();
  });

  it('does not throw on a malformed notification', () => {
    expect(() => notificationDestination(null as never)).not.toThrow();
    expect(notificationDestination(null as never)).toBeNull();
    expect(notificationDestination({} as never)).toBeNull();
  });

  it('ignores blank and whitespace ids rather than routing to them', () => {
    // '' would open the auction view with no lot — a blank screen.
    expect(notificationDestination(n({ type: 'outbid', auctionId: '' }))).toBeNull();
    expect(notificationDestination(n({ type: 'outbid', auctionId: '   ' }))).toBeNull();
    expect(notificationDestination(n({ type: 'order', orderId: '  ' }))).toBeNull();
  });

  it('ignores a non-string id', () => {
    expect(notificationDestination(n({ type: 'outbid', auctionId: 123 as never }))).toBeNull();
  });

  it('trims the id it returns', () => {
    expect(notificationDestination(n({ type: 'outbid', auctionId: ' a1 ' })))
      .toEqual({ view: 'live', auctionId: 'a1' });
  });
});

describe('notificationDestination — every routed view is a real one', () => {
  it('only ever names views the app can actually show', () => {
    // A typo here is a dead click. These are the AppContext setActiveView union.
    const valid = new Set(['live', 'orders', 'wallet', 'profile']);
    const samples: Notification[] = [
      n({ type: 'outbid', auctionId: 'a' }),
      n({ type: 'order', orderId: 'o' }),
      n({ type: 'wallet' }),
      n({ type: 'withdrawal' }),
      n({ type: 'subscription' }),
      n({ type: 'win', auctionId: 'a' }),
      n({ type: 'refund', orderId: 'o' }),
    ];
    for (const s of samples) {
      const d = notificationDestination(s);
      if (d) expect(valid.has(d.view), `${s.type} -> ${d.view}`).toBe(true);
    }
  });
});
