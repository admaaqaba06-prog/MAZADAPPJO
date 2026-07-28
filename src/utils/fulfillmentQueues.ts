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
  // Wave 3 — evidence-gated dispatch lands in the same queue as legacy shipped:
  // goods are with the buyer's courier, the team is waiting on the buyer.
  if (order.status === 'out_for_delivery') return 'awaiting_delivery';
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
 * Normalizes a stored deadline to epoch ms, or null when there isn't a usable
 * one. Accepts a Firestore Timestamp-like `{ seconds }` (what real docs carry)
 * and a raw epoch-ms number; anything else — `{}`, a string, null, a Date-less
 * junk value — is rejected rather than coerced, so a malformed field can never
 * read as epoch 0 and mark every order eternally overdue. Kept structural on
 * purpose: this module stays pure and imports nothing from Firestore.
 */
function deadlineToMs(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (value && typeof value === 'object') {
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return null;
}

/**
 * True when the order's current bucket has been sitting past its threshold.
 *
 * `awaiting_payment` is per-order and defers to the SERVER's authority. The
 * order carries `paymentDeadlineAt`, written once at creation, and that exact
 * field is what the payment-default cron queries to block a buyer
 * (`where('paymentDeadlineAt', '<=', now)`). `updatedAt` drifts away from it —
 * unrelated writes bump it while the status is still `waiting_payment`, e.g.
 * the payment-proof upload writes `updatedAt` before the separate 'pay'
 * transition — so judging by `updatedAt + window` can silently reset the admin
 * clock and show "not overdue" for an order the server is already defaulting.
 * We therefore prefer the stored deadline, and only fall back to
 * `updatedAt + paymentWindowHours` for legacy orders that carry none.
 *
 * Every other bucket keeps its fixed SLA — neither `paymentDeadlineAt` nor
 * `paymentWindowHours` may leak into them.
 */
export function isOverdue(
  order: {
    status: string;
    paymentVerified?: boolean;
    updatedAtMs: number;
    paymentWindowHours?: number;
    paymentDeadlineAt?: unknown;
  },
  nowMs: number,
): boolean {
  const bucket = bucketOrder(order);
  if (!bucket) return false;
  const age = nowMs - order.updatedAtMs;
  if (bucket === 'awaiting_payment') {
    const deadlineMs = deadlineToMs(order.paymentDeadlineAt);
    // `>=` mirrors the server's `paymentDeadlineAt <= now` so the admin view and
    // the enforcer agree on the boundary instant, not just either side of it.
    if (deadlineMs !== null) return nowMs >= deadlineMs;
    const hours = Number(order.paymentWindowHours);
    const window = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_PAYMENT_WINDOW_HOURS;
    return age > window * HOUR_MS;
  }
  return age > THRESHOLDS[bucket];
}
