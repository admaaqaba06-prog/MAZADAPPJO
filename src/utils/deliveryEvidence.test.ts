import { describe, it, expect } from 'vitest';
import { deliveryStepFor } from './deliveryEvidence';

const o = (status: string) => ({ status });

describe('deliveryStepFor', () => {
  it('gives the seller the prep photo once the money is in', () => {
    expect(deliveryStepFor(o('paid'), 'seller')).toBe('seller_prep');
  });

  it('gives the seller the dispatch photo while preparing', () => {
    expect(deliveryStepFor(o('preparing_shipment'), 'seller')).toBe('seller_dispatch');
  });

  it('gives the buyer the receipt step once it is out for delivery', () => {
    expect(deliveryStepFor(o('out_for_delivery'), 'buyer')).toBe('buyer_confirm');
  });

  it('never gives a party the other party step', () => {
    expect(deliveryStepFor(o('paid'), 'buyer')).toBe('none');
    expect(deliveryStepFor(o('preparing_shipment'), 'buyer')).toBe('none');
    expect(deliveryStepFor(o('out_for_delivery'), 'seller')).toBe('none');
  });

  it('offers nothing on legacy, terminal or disputed states', () => {
    for (const s of ['waiting_payment', 'shipped', 'delivered', 'completed', 'disputed', 'cancelled', 'refunded', 'defaulted']) {
      expect(deliveryStepFor(o(s), 'seller')).toBe('none');
      expect(deliveryStepFor(o(s), 'buyer')).toBe('none');
    }
  });

  it('offers the admin nothing — the whole point is that they are not in the loop', () => {
    expect(deliveryStepFor(o('paid'), 'admin')).toBe('none');
    expect(deliveryStepFor(o('preparing_shipment'), 'admin')).toBe('none');
    expect(deliveryStepFor(o('out_for_delivery'), 'admin')).toBe('none');
  });

  it('never throws on a missing order or status', () => {
    expect(deliveryStepFor(null, 'seller')).toBe('none');
    expect(deliveryStepFor(undefined, 'buyer')).toBe('none');
    expect(deliveryStepFor({}, 'seller')).toBe('none');
  });
});
