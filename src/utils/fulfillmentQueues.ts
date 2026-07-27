export type FulfillmentBucket =
  | 'awaiting_payment'
  | 'awaiting_shipment'
  | 'awaiting_delivery'
  | 'awaiting_release'
  | null;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Default payment window when an order carries none — mirrors the server default. */
const DEFAULT_PAYMENT_WINDOW_HOURS = 24;

const THRESHOLDS: Record<Exclude<FulfillmentBucket, null | 'awaiting_payment'>, number> = {
  awaiting_shipment: 48 * HOUR_MS,
  awaiting_delivery: 5 * DAY_MS,
  awaiting_release: 24 * HOUR_MS,
};

/**
 * Assigns an order to a fulfillment bucket, or null if it needs no follow-up
 * here. Disputed orders NEVER bucket, regardless of status/fields — disputes
 * are a separate job (Job 4 / a future slice), not this one's concern.
 *
 * `waiting_payment` buckets too: an order the buyer has not paid for is money
 * not collected, and before this it appeared in no queue at all.
 */
export function bucketOrder(order: {
  status: string;
  paymentVerified?: boolean;
}): FulfillmentBucket {
  if (order.status === 'disputed') return null;
  if (order.status === 'waiting_payment') return 'awaiting_payment';
  if (order.status === 'paid' && order.paymentVerified === true) return 'awaiting_shipment';
  if (order.status === 'preparing_shipment') return 'awaiting_shipment';
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

/**
 * True when the order's current bucket has been sitting past its threshold.
 *
 * `awaiting_payment` is per-order: the buyer was given a specific window at
 * auction creation, so overdue means THAT deadline was blown, not a global one.
 * Every other bucket keeps its fixed SLA — a payment window on the order must
 * not leak into them.
 */
export function isOverdue(
  order: {
    status: string;
    paymentVerified?: boolean;
    updatedAtMs: number;
    paymentWindowHours?: number;
  },
  nowMs: number,
): boolean {
  const bucket = bucketOrder(order);
  if (!bucket) return false;
  const age = nowMs - order.updatedAtMs;
  if (bucket === 'awaiting_payment') {
    const hours = Number(order.paymentWindowHours);
    const window = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_PAYMENT_WINDOW_HOURS;
    return age > window * HOUR_MS;
  }
  return age > THRESHOLDS[bucket];
}
