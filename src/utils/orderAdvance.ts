import type { OrderStatus } from './orderWorkflow';

/**
 * The ONE next stage an admin may advance an order to by hand, or null.
 *
 * The admin team runs the fulfillment relay by phone: they call the seller,
 * the seller acknowledges, and the admin records it here. This map is what the
 * "Advance" button offers, so it is deliberately narrow — every entry is a
 * transition `VALID_TRANSITIONS` already allows, and there is no way to reach
 * a stage out of order.
 *
 * Two states deliberately offer NOTHING:
 *  - `waiting_payment` — the buyer pays. The team chases them, but marking an
 *    order paid by hand would fake a payment that was never verified.
 *  - `delivered` — the next step is acceptance, which RELEASES MONEY. That
 *    stays the guarded escrow-release action, never a one-click advance.
 */
export interface OrderAdvance {
  action: 'prepare_shipment' | 'mark_shipped' | 'mark_delivered';
  to: OrderStatus;
}

const ADVANCE_MAP: Record<string, OrderAdvance> = {
  paid: { action: 'prepare_shipment', to: 'preparing_shipment' },
  preparing_shipment: { action: 'mark_shipped', to: 'shipped' },
  shipped: { action: 'mark_delivered', to: 'delivered' },
  // Wave 3 — if the buyer never confirms (lost phone, no app, gone quiet), the
  // relay can still record the fact that the goods arrived. Same money-free
  // claim as the `shipped` entry above; acceptance still has to happen
  // separately, which is why `delivered` continues to offer nothing.
  out_for_delivery: { action: 'mark_delivered', to: 'delivered' },
};

export function nextAdvance(status?: string | null): OrderAdvance | null {
  if (!status) return null;
  return ADVANCE_MAP[status] ?? null;
}
