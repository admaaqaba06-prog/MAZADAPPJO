export type FulfillmentBucket = 'awaiting_shipment' | 'awaiting_delivery' | 'awaiting_release' | null;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const THRESHOLDS: Record<Exclude<FulfillmentBucket, null>, number> = {
  awaiting_shipment: 48 * HOUR_MS,
  awaiting_delivery: 5 * DAY_MS,
  awaiting_release: 24 * HOUR_MS,
};

/**
 * Assigns an order to a fulfillment bucket, or null if it needs no follow-up
 * here. Disputed orders NEVER bucket, regardless of status/fields — disputes
 * are a separate job (Job 4 / a future slice), not this one's concern.
 */
export function bucketOrder(order: { status: string; paymentVerified?: boolean }): FulfillmentBucket {
  if (order.status === 'disputed') return null;
  if (order.status === 'paid' && order.paymentVerified === true) return 'awaiting_shipment';
  if (order.status === 'shipped') return 'awaiting_delivery';
  if (order.status === 'delivered') return 'awaiting_release';
  return null;
}

export function hoursBetween(fromMs: number, nowMs: number): number {
  return Math.floor((nowMs - fromMs) / HOUR_MS);
}

export function daysBetween(fromMs: number, nowMs: number): number {
  return Math.floor((nowMs - fromMs) / DAY_MS);
}

/** True when the order's current bucket has been sitting past its threshold. */
export function isOverdue(
  order: { status: string; paymentVerified?: boolean; updatedAtMs: number },
  nowMs: number,
): boolean {
  const bucket = bucketOrder(order);
  if (!bucket) return false;
  return nowMs - order.updatedAtMs > THRESHOLDS[bucket];
}
