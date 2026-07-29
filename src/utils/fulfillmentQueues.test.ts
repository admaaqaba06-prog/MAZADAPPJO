import { describe, it, expect } from 'vitest';
import { bucketOrder, hoursBetween, daysBetween, isOverdue } from './fulfillmentQueues';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

describe('bucketOrder', () => {
  it('buckets a verified paid order as awaiting_shipment', () => {
    expect(bucketOrder({ status: 'paid', paymentVerified: true })).toBe('awaiting_shipment');
  });
  it('does NOT bucket a self-claimed but unverified paid order', () => {
    expect(bucketOrder({ status: 'paid', paymentVerified: false })).toBeNull();
    expect(bucketOrder({ status: 'paid' })).toBeNull();
  });
  it('buckets a preparing_shipment order as awaiting_shipment (no paymentVerified required)', () => {
    expect(bucketOrder({ status: 'preparing_shipment' })).toBe('awaiting_shipment');
  });
  it('buckets shipped as awaiting_delivery, delivered as awaiting_release', () => {
    expect(bucketOrder({ status: 'shipped' })).toBe('awaiting_delivery');
    expect(bucketOrder({ status: 'delivered' })).toBe('awaiting_release');
  });
  it('NEVER buckets a disputed order, regardless of other fields', () => {
    expect(bucketOrder({ status: 'disputed', paymentVerified: true })).toBeNull();
  });
  // waiting_payment used to return null; it now buckets as 'awaiting_payment'
  // (see the 'awaiting_payment bucket' suite below) so unpaid orders are chased.
  it('returns null for completed, cancelled, refunded', () => {
    for (const status of ['completed', 'cancelled', 'refunded']) {
      expect(bucketOrder({ status })).toBeNull();
    }
  });
});

describe('hoursBetween / daysBetween', () => {
  it('computes whole-unit elapsed time', () => {
    expect(hoursBetween(NOW - 3 * HOUR, NOW)).toBe(3);
    expect(daysBetween(NOW - 2 * DAY, NOW)).toBe(2);
    expect(hoursBetween(NOW, NOW)).toBe(0);
  });
});

describe('isOverdue', () => {
  it('is false for a non-bucketed order regardless of age', () => {
    expect(isOverdue({ status: 'disputed', updatedAtMs: NOW - 100 * DAY }, NOW)).toBe(false);
    expect(isOverdue({ status: 'completed', updatedAtMs: NOW - 100 * DAY }, NOW)).toBe(false);
  });
  // Wave 4 tightened both to 24h — see THRESHOLDS. These cases previously
  // pinned 48h / 5 days, which was the pre-Wave-3 phone-relay pace.
  it('flags awaiting_shipment overdue past 24h, not before', () => {
    const base = { status: 'paid', paymentVerified: true };
    expect(isOverdue({ ...base, updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
    expect(isOverdue({ ...base, updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
  });
  it('flags awaiting_delivery overdue past 24h, not before', () => {
    expect(isOverdue({ status: 'shipped', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
    expect(isOverdue({ status: 'shipped', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
  });
  it('flags awaiting_release overdue past 24h, not before', () => {
    expect(isOverdue({ status: 'delivered', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
    expect(isOverdue({ status: 'delivered', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
  });
});

describe('awaiting_payment bucket', () => {
  it('buckets an unpaid order so money-not-collected is watched by someone', () => {
    expect(bucketOrder({ status: 'waiting_payment' })).toBe('awaiting_payment');
  });

  it('still returns null for terminal and non-actionable states', () => {
    expect(bucketOrder({ status: 'completed' })).toBeNull();
    expect(bucketOrder({ status: 'cancelled' })).toBeNull();
    expect(bucketOrder({ status: 'refunded' })).toBeNull();
  });

  it('a disputed order never buckets, even when unpaid', () => {
    expect(bucketOrder({ status: 'disputed' })).toBeNull();
  });

  it('overdue uses the order OWN payment window, not a fixed threshold', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    // 12h window: overdue at 13h, fine at 11h.
    const short = { status: 'waiting_payment', paymentWindowHours: 12 };
    expect(isOverdue({ ...short, updatedAtMs: now - 13 * hour }, now)).toBe(true);
    expect(isOverdue({ ...short, updatedAtMs: now - 11 * hour }, now)).toBe(false);
    // 72h window: 13h is nowhere near overdue.
    const long = { status: 'waiting_payment', paymentWindowHours: 72 };
    expect(isOverdue({ ...long, updatedAtMs: now - 13 * hour }, now)).toBe(false);
    expect(isOverdue({ ...long, updatedAtMs: now - 73 * hour }, now)).toBe(true);
  });

  it('falls back to 24h when the order carries no payment window', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    const o = { status: 'waiting_payment' };
    expect(isOverdue({ ...o, updatedAtMs: now - 25 * hour }, now)).toBe(true);
    expect(isOverdue({ ...o, updatedAtMs: now - 23 * hour }, now)).toBe(false);
  });

  it('falls back to 24h for a garbage / zero / negative payment window', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    // A zero window would mean "overdue the instant it exists" and a
    // non-numeric one would NaN the comparison — both must land on 24h.
    for (const bad of [0, 'abc' as unknown as number, -5, NaN]) {
      const o = { status: 'waiting_payment', paymentWindowHours: bad };
      expect(isOverdue({ ...o, updatedAtMs: now - 23 * hour }, now)).toBe(false);
      expect(isOverdue({ ...o, updatedAtMs: now - 25 * hour }, now)).toBe(true);
    }
  });

  it('leaves the existing buckets and their thresholds untouched', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    expect(bucketOrder({ status: 'shipped' })).toBe('awaiting_delivery');
    // awaiting_shipment is 24h (Wave 4), and a paymentWindowHours on the order
    // must NOT leak into a non-payment bucket. The leak is what this asserts —
    // the threshold value is incidental to it.
    const shipping = { status: 'preparing_shipment', paymentWindowHours: 1 };
    expect(isOverdue({ ...shipping, updatedAtMs: now - 23 * hour }, now)).toBe(false);
    expect(isOverdue({ ...shipping, updatedAtMs: now - 25 * hour }, now)).toBe(true);
  });
});

/**
 * The server writes an authoritative `paymentDeadlineAt` at order creation and
 * its payment-default cron blocks buyers off exactly that field. `updatedAt`
 * drifts away from it (e.g. the payment-proof upload bumps updatedAt before the
 * separate 'pay' transition), so judging by updatedAt + window can show admins
 * "not overdue" for an order the server is already defaulting.
 */
describe('awaiting_payment honours the server deadline', () => {
  const now = 1_000_000_000_000;
  const hour = 60 * 60 * 1000;
  const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });

  it('is overdue when a Timestamp deadline has passed, even if updatedAt was just bumped', () => {
    // Deadline blown 2h ago, but an unrelated write reset updatedAt 1 minute
    // ago. The window maths would say "fresh"; the server says defaulted.
    const o = {
      status: 'waiting_payment',
      paymentWindowHours: 24,
      paymentDeadlineAt: ts(now - 2 * hour),
      updatedAtMs: now - 60 * 1000,
    };
    expect(isOverdue(o, now)).toBe(true);
  });

  it('is NOT overdue when a Timestamp deadline is still in the future, even for a stale updatedAt', () => {
    // 72h window granted at creation: updatedAt is 30h old, which a 24h
    // default would flag, but the real deadline is still 40h away.
    const o = {
      status: 'waiting_payment',
      paymentDeadlineAt: ts(now + 40 * hour),
      updatedAtMs: now - 30 * hour,
    };
    expect(isOverdue(o, now)).toBe(false);
  });

  it('accepts a raw epoch-ms deadline as well as a Timestamp', () => {
    const past = { status: 'waiting_payment', paymentDeadlineAt: now - hour, updatedAtMs: now };
    const future = {
      status: 'waiting_payment',
      paymentDeadlineAt: now + hour,
      updatedAtMs: now - 100 * hour,
    };
    expect(isOverdue(past, now)).toBe(true);
    expect(isOverdue(future, now)).toBe(false);
  });

  it('falls back to updatedAt + window when the order carries no deadline (legacy docs)', () => {
    const legacy = { status: 'waiting_payment', paymentWindowHours: 12 };
    expect(isOverdue({ ...legacy, updatedAtMs: now - 13 * hour }, now)).toBe(true);
    expect(isOverdue({ ...legacy, updatedAtMs: now - 11 * hour }, now)).toBe(false);
    const noWindow = { status: 'waiting_payment', paymentDeadlineAt: undefined };
    expect(isOverdue({ ...noWindow, updatedAtMs: now - 25 * hour }, now)).toBe(true);
    expect(isOverdue({ ...noWindow, updatedAtMs: now - 23 * hour }, now)).toBe(false);
  });

  it('falls back rather than reading a malformed deadline as epoch 0', () => {
    // Each of these must NOT be coerced to 0 (which would make every order
    // eternally overdue) and must NOT throw.
    const junk = [{}, 'abc', null, true, { seconds: 'abc' }, { nanoseconds: 5 }, NaN];
    for (const paymentDeadlineAt of junk) {
      const o = { status: 'waiting_payment', paymentDeadlineAt };
      expect(isOverdue({ ...o, updatedAtMs: now - 23 * hour }, now)).toBe(false);
      expect(isOverdue({ ...o, updatedAtMs: now - 25 * hour }, now)).toBe(true);
    }
  });

  it('does NOT let paymentDeadlineAt leak into the other buckets', () => {
    // A deadline far in the future must not rescue a shipment that blew its
    // 24h SLA, and one far in the past must not condemn a fresh one.
    const stale = {
      status: 'preparing_shipment',
      paymentDeadlineAt: ts(now + 500 * hour),
      updatedAtMs: now - 25 * hour,
    };
    expect(isOverdue(stale, now)).toBe(true);
    const fresh = {
      status: 'preparing_shipment',
      paymentDeadlineAt: ts(now - 500 * hour),
      updatedAtMs: now - 23 * hour,
    };
    expect(isOverdue(fresh, now)).toBe(false);
    // Same for the delivery and release buckets — both 24h since Wave 4.
    expect(
      isOverdue(
        { status: 'shipped', paymentDeadlineAt: ts(now - 500 * hour), updatedAtMs: now - 23 * hour },
        now,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        { status: 'delivered', paymentDeadlineAt: ts(now + 500 * hour), updatedAtMs: now - 25 * hour },
        now,
      ),
    ).toBe(true);
  });
});

describe('Wave 3 — out_for_delivery buckets with the goods in transit', () => {
  it('buckets as awaiting_delivery, same as legacy shipped', () => {
    expect(bucketOrder({ status: 'out_for_delivery' })).toBe('awaiting_delivery');
  });

  it('goes overdue on the awaiting_delivery SLA (24h), not the payment window', () => {
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: NOW - 1000 }, NOW)).toBe(false);
  });
});

describe('Wave 4 — the operation runs on a 24h clock', () => {
  it('flags an unshipped order 24h after payment, not 48h', () => {
    expect(isOverdue({ status: 'preparing_shipment', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
    expect(isOverdue({ status: 'preparing_shipment', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
  });

  it('flags an unconfirmed delivery 24h after dispatch, not 5 days', () => {
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: NOW - 25 * HOUR }, NOW)).toBe(true);
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: NOW - 23 * HOUR }, NOW)).toBe(false);
  });
});
