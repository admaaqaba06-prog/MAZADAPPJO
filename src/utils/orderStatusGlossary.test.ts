import { describe, it, expect } from 'vitest';
import {
  getOrderStatusChip,
  PAID_OR_BEYOND,
  ORDER_STATUS_GLOSSARY,
} from './orderStatusGlossary';

/**
 * SOURCE OF TRUTH — real ORDER status codes.
 *
 * Enumerated from the two disagreeing enums plus the literals actually written
 * to / compared against `orders/{id}.status` in the backend:
 *   - src/types.ts (Order.status union, 11 values)
 *   - src/utils/orderWorkflow.ts (OrderStatus, a 9-value subset)
 *   - functions/index.js, functions/orderPaymentVerify.js, functions/*.js
 *     (status: 'x' writes and `status === 'x'` reads on order docs)
 *
 * The Order.status union in types.ts is the full superset. orderWorkflow.ts is
 * missing `pending_buyer_confirmation` and `defaulted`, both of which the Cloud
 * Functions genuinely write to order docs (index.js:2317 and :854).
 *
 * DELIBERATELY EXCLUDED (auction/listing/escrow/other-entity statuses, never on
 * an order doc):
 *   live, upcoming, ended            -> auction listing lifecycle
 *   reserve_not_met, pending_seller, pending_buyer, accepted -> auction settlement/near-miss
 *   pending_review, rejected, approved, confirmed, declined  -> listing/seller moderation
 *   locked, released, pending        -> escrowStatus, not order status
 *   open                             -> returnClaim.status, not order status
 *   lost, down, nonsense_status      -> notifications / health-check / test fixtures
 *   out_for_delivery, returned       -> named in the spec as examples but NOT
 *                                       present anywhere as a real order status
 */
const REAL_ORDER_STATUS_CODES = [
  'pending_buyer_confirmation',
  'waiting_payment',
  'paid',
  'preparing_shipment',
  'shipped',
  'delivered',
  'completed',
  'disputed',
  'cancelled',
  'refunded',
  'defaulted',
] as const;

const ALLOWED_TONES = ['neutral', 'info', 'warning', 'success', 'danger'] as const;

describe('getOrderStatusChip', () => {
  it('has a glossary entry for every real order status code', () => {
    for (const code of REAL_ORDER_STATUS_CODES) {
      expect(ORDER_STATUS_GLOSSARY[code]).toBeDefined();
    }
  });

  it('returns non-empty AR + EN labels and a valid tone for every real code', () => {
    for (const code of REAL_ORDER_STATUS_CODES) {
      const ar = getOrderStatusChip(code, 'ar');
      const en = getOrderStatusChip(code, 'en');

      expect(typeof ar.label).toBe('string');
      expect(ar.label.length).toBeGreaterThan(0);
      expect(typeof en.label).toBe('string');
      expect(en.label.length).toBeGreaterThan(0);

      expect(ALLOWED_TONES).toContain(ar.tone);
      expect(ALLOWED_TONES).toContain(en.tone);
      // AR and EN describe the same status, so tone must agree.
      expect(ar.tone).toBe(en.tone);
    }
  });

  it('never leaks the raw code — unknown codes get a neutral fallback', () => {
    const unknown = getOrderStatusChip('some_unknown_code', 'en');
    expect(unknown.label).not.toBe('some_unknown_code');
    expect(unknown.label.length).toBeGreaterThan(0);
    expect(unknown.tone).toBe('neutral');

    const unknownAr = getOrderStatusChip('some_unknown_code', 'ar');
    expect(unknownAr.label.length).toBeGreaterThan(0);
    expect(unknownAr.tone).toBe('neutral');
  });

  it('falls back neutrally for empty string and undefined', () => {
    const empty = getOrderStatusChip('', 'en');
    expect(empty.label.length).toBeGreaterThan(0);
    expect(empty.tone).toBe('neutral');

    const undef = getOrderStatusChip(undefined as unknown as string, 'en');
    expect(undef.label.length).toBeGreaterThan(0);
    expect(undef.tone).toBe('neutral');

    const undefAr = getOrderStatusChip(undefined as unknown as string, 'ar');
    expect(undefAr.label.length).toBeGreaterThan(0);
    expect(undefAr.tone).toBe('neutral');
  });

  it('assigns sane tones (terminal-good=success, awaiting-buyer=warning, money-reversal/failure=danger)', () => {
    expect(getOrderStatusChip('paid', 'en').tone).toBe('success');
    expect(getOrderStatusChip('completed', 'en').tone).toBe('success');
    expect(getOrderStatusChip('waiting_payment', 'en').tone).toBe('warning');
    expect(getOrderStatusChip('defaulted', 'en').tone).toBe('danger');
    expect(getOrderStatusChip('refunded', 'en').tone).toBe('danger');
  });

  it('produces the expected Jordanian-marketplace Arabic + human English labels', () => {
    expect(getOrderStatusChip('waiting_payment', 'ar').label).toBe('بانتظار الدفع');
    expect(getOrderStatusChip('paid', 'ar').label).toBe('مدفوع');
    expect(getOrderStatusChip('shipped', 'ar').label).toBe('تم الشحن');
    expect(getOrderStatusChip('delivered', 'ar').label).toBe('تم التسليم');
    expect(getOrderStatusChip('completed', 'ar').label).toBe('مكتمل');
    expect(getOrderStatusChip('defaulted', 'ar').label).toBe('متعثّر');
    expect(getOrderStatusChip('refunded', 'ar').label).toBe('مُسترجع');
    expect(getOrderStatusChip('cancelled', 'ar').label).toBe('ملغى');
    expect(getOrderStatusChip('disputed', 'ar').label).toBe('نزاع');

    expect(getOrderStatusChip('waiting_payment', 'en').label).toBe('Awaiting payment');
    expect(getOrderStatusChip('paid', 'en').label).toBe('Paid');
    expect(getOrderStatusChip('shipped', 'en').label).toBe('Shipped');
    expect(getOrderStatusChip('delivered', 'en').label).toBe('Delivered');
    expect(getOrderStatusChip('completed', 'en').label).toBe('Completed');
    expect(getOrderStatusChip('defaulted', 'en').label).toBe('Payment defaulted');
    expect(getOrderStatusChip('refunded', 'en').label).toBe('Refunded');
    expect(getOrderStatusChip('cancelled', 'en').label).toBe('Cancelled');
    expect(getOrderStatusChip('disputed', 'en').label).toBe('In dispute');
  });
});

describe('PAID_OR_BEYOND', () => {
  it('counts a paid order as a real sale but not one merely awaiting payment', () => {
    expect(PAID_OR_BEYOND.has('paid')).toBe(true);
    expect(PAID_OR_BEYOND.has('waiting_payment')).toBe(false);
  });

  it('includes every money-received status that exists', () => {
    for (const code of ['paid', 'preparing_shipment', 'shipped', 'delivered', 'completed']) {
      expect(PAID_OR_BEYOND.has(code)).toBe(true);
    }
  });

  it('excludes pre-payment and reversal/terminal-bad statuses', () => {
    for (const code of ['pending_buyer_confirmation', 'waiting_payment', 'cancelled', 'refunded', 'defaulted', 'disputed']) {
      expect(PAID_OR_BEYOND.has(code)).toBe(false);
    }
  });
});
