/**
 * Single source of truth for ORDER status presentation.
 *
 * Every screen used to hard-code its own status label/colour table, and some
 * leaked raw status codes (e.g. `preparing_shipment`) straight to buyers. This
 * glossary owns the human label (AR + EN) and the semantic tone for each real
 * order status, and NEVER echoes an unknown code back to the user.
 *
 * The set of codes is the superset of the two disagreeing enums plus the
 * literals the backend actually writes to / reads from `orders/{id}.status`:
 *   - src/types.ts            (Order.status union — the full 11-value superset)
 *   - src/utils/orderWorkflow.ts (OrderStatus — a 9-value subset, missing
 *                                 pending_buyer_confirmation and defaulted)
 *   - functions/index.js, functions/orderPaymentVerify.js, functions/*.js
 *
 * Auction-listing (live/upcoming/ended), settlement (pending_seller/…),
 * escrow (locked/released), moderation (pending_review/rejected) and return-
 * claim (open) statuses are intentionally NOT here — they are not order codes.
 */

export type OrderStatusCode =
  | 'pending_buyer_confirmation'
  | 'waiting_payment'
  | 'paid'
  | 'preparing_shipment'
  | 'out_for_delivery'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'refunded'
  | 'defaulted';

export type OrderStatusTone =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'success'
  | 'danger';

export interface OrderStatusChip {
  label: string;
  tone: OrderStatusTone;
}

interface OrderStatusEntry {
  labelAr: string;
  labelEn: string;
  tone: OrderStatusTone;
}

/**
 * Tone semantics:
 *   success -> money received or deal closed well (paid, completed)
 *   info    -> in-progress fulfilment (preparing, shipped, delivered)
 *   warning -> waiting on the buyer, or a problem being worked (awaiting
 *              payment/confirmation, in dispute)
 *   danger  -> money reversed or the deal failed (refunded, defaulted)
 *   neutral -> benign terminal / unknown (cancelled, fallback)
 */
export const ORDER_STATUS_GLOSSARY: Record<OrderStatusCode, OrderStatusEntry> = {
  pending_buyer_confirmation: {
    labelAr: 'بانتظار تأكيد المشتري',
    labelEn: 'Awaiting buyer confirmation',
    tone: 'warning',
  },
  waiting_payment: {
    labelAr: 'بانتظار الدفع',
    labelEn: 'Awaiting payment',
    tone: 'warning',
  },
  paid: {
    labelAr: 'مدفوع',
    labelEn: 'Paid',
    tone: 'success',
  },
  preparing_shipment: {
    labelAr: 'قيد التجهيز للشحن',
    labelEn: 'Preparing shipment',
    tone: 'info',
  },
  // Wave 3 — the seller has photographed the parcel leaving with the delivery
  // code visible. Distinct from legacy `shipped`, which is the admin relay's
  // phone-recorded dispatch with no evidence attached.
  out_for_delivery: {
    labelAr: 'خرج للتوصيل',
    labelEn: 'Out for delivery',
    tone: 'info',
  },
  shipped: {
    labelAr: 'تم الشحن',
    labelEn: 'Shipped',
    tone: 'info',
  },
  delivered: {
    labelAr: 'تم التسليم',
    labelEn: 'Delivered',
    tone: 'info',
  },
  completed: {
    labelAr: 'مكتمل',
    labelEn: 'Completed',
    tone: 'success',
  },
  disputed: {
    labelAr: 'نزاع',
    labelEn: 'In dispute',
    tone: 'warning',
  },
  cancelled: {
    labelAr: 'ملغى',
    labelEn: 'Cancelled',
    tone: 'neutral',
  },
  refunded: {
    labelAr: 'مُسترجع',
    labelEn: 'Refunded',
    tone: 'danger',
  },
  defaulted: {
    labelAr: 'متعثّر',
    labelEn: 'Payment defaulted',
    tone: 'danger',
  },
};

const FALLBACK_CHIP: Record<'ar' | 'en', OrderStatusChip> = {
  ar: { label: 'قيد المعالجة', tone: 'neutral' },
  en: { label: 'Processing', tone: 'neutral' },
};

/**
 * Resolve any order status string to a displayable chip. Unknown, empty or
 * undefined codes get a neutral "Processing" fallback — the raw code is NEVER
 * returned to the user.
 */
export function getOrderStatusChip(
  status: string,
  lang: 'ar' | 'en'
): OrderStatusChip {
  const entry = status
    ? ORDER_STATUS_GLOSSARY[status as OrderStatusCode]
    : undefined;
  if (!entry) {
    return { ...FALLBACK_CHIP[lang] };
  }
  return {
    label: lang === 'ar' ? entry.labelAr : entry.labelEn,
    tone: entry.tone,
  };
}

/**
 * Statuses that mean the buyer's money has actually been received — i.e. a real
 * sale — regardless of where fulfilment has reached. A later task uses this to
 * count genuine sales without double-counting pre-payment or reversed orders.
 * `waiting_payment` (money not yet in) is deliberately absent; `refunded` /
 * `defaulted` / `cancelled` are absent because no sale stands.
 */
export const PAID_OR_BEYOND: ReadonlySet<string> = new Set<OrderStatusCode>([
  'paid',
  'preparing_shipment',
  'out_for_delivery',
  'shipped',
  'delivered',
  'completed',
]);
