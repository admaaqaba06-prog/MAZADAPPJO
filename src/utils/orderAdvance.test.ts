import { describe, it, expect } from 'vitest';
import { nextAdvance } from './orderAdvance';
import { VALID_TRANSITIONS } from './orderWorkflow';

describe('nextAdvance', () => {
  it('maps each chaseable status to its one next admin action', () => {
    expect(nextAdvance('paid')).toEqual({ action: 'prepare_shipment', to: 'preparing_shipment' });
    expect(nextAdvance('preparing_shipment')).toEqual({ action: 'mark_shipped', to: 'shipped' });
    expect(nextAdvance('shipped')).toEqual({ action: 'mark_delivered', to: 'delivered' });
  });

  it('offers NOTHING for states the admin must not advance by hand', () => {
    // waiting_payment: the buyer pays, we chase — we do not mark it paid.
    expect(nextAdvance('waiting_payment')).toBeNull();
    // delivered -> completed is acceptance, which RELEASES MONEY. It stays its
    // own guarded escrow action, never a one-click advance.
    expect(nextAdvance('delivered')).toBeNull();
    expect(nextAdvance('disputed')).toBeNull();
    expect(nextAdvance('completed')).toBeNull();
    expect(nextAdvance('cancelled')).toBeNull();
    expect(nextAdvance('refunded')).toBeNull();
  });

  it('never proposes a target the FSM would reject', () => {
    for (const status of Object.keys(VALID_TRANSITIONS)) {
      const advance = nextAdvance(status);
      if (!advance) continue;
      expect(VALID_TRANSITIONS[status as keyof typeof VALID_TRANSITIONS]).toContain(advance.to);
    }
  });

  it('is null for an unknown or missing status rather than guessing', () => {
    expect(nextAdvance('banana')).toBeNull();
    expect(nextAdvance('')).toBeNull();
    expect(nextAdvance(undefined)).toBeNull();
  });
});

describe('Wave 3 — the relay can still hand-advance a stalled evidence flow', () => {
  it('offers "delivered" out of out_for_delivery — a claim of fact, no money', () => {
    expect(nextAdvance('out_for_delivery')).toEqual({ action: 'mark_delivered', to: 'delivered' });
  });

  it('still offers nothing at delivered — the next step releases money', () => {
    expect(nextAdvance('delivered')).toBeNull();
  });
});
