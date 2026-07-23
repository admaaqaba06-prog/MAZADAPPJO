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
  it('returns null for waiting_payment, completed, cancelled, refunded', () => {
    for (const status of ['waiting_payment', 'completed', 'cancelled', 'refunded']) {
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
