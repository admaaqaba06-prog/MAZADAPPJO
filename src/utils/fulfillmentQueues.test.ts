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
  it('flags awaiting_shipment overdue past 48h, not before', () => {
    const base = { status: 'paid', paymentVerified: true };
    expect(isOverdue({ ...base, updatedAtMs: NOW - 47 * HOUR }, NOW)).toBe(false);
    expect(isOverdue({ ...base, updatedAtMs: NOW - 49 * HOUR }, NOW)).toBe(true);
  });
  it('flags awaiting_delivery overdue past 5 days, not before', () => {
    expect(isOverdue({ status: 'shipped', updatedAtMs: NOW - 4 * DAY }, NOW)).toBe(false);
    expect(isOverdue({ status: 'shipped', updatedAtMs: NOW - 6 * DAY }, NOW)).toBe(true);
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

  it('leaves the existing buckets and their thresholds untouched', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    expect(bucketOrder({ status: 'shipped' })).toBe('awaiting_delivery');
    // awaiting_shipment is still 48h, and a paymentWindowHours on the order
    // must NOT leak into a non-payment bucket.
    const shipping = { status: 'preparing_shipment', paymentWindowHours: 1 };
    expect(isOverdue({ ...shipping, updatedAtMs: now - 47 * hour }, now)).toBe(false);
    expect(isOverdue({ ...shipping, updatedAtMs: now - 49 * hour }, now)).toBe(true);
  });
});
