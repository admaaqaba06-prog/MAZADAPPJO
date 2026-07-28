/**
 * Wave 3 — which delivery-evidence step, if any, the person looking at this
 * order owes right now. One function so the seller card and the buyer card can
 * never disagree about whose turn it is.
 *
 * `admin` deliberately gets 'none'. The admin team is not a step in this flow —
 * offloading the handoff to the counterparties is the entire point. The relay's
 * hand-advance (orderAdvance.ts) is their separate escape hatch.
 *
 * Legacy `shipped` gets 'none' too: those orders came from the phone-driven
 * relay with no code ever issued, so the buyer's existing "release payment"
 * button (unchanged) is their path, not a code they were never given.
 */
export type DeliveryStep = 'seller_prep' | 'seller_dispatch' | 'buyer_confirm' | 'none';

export function deliveryStepFor(
  order: { status?: string } | null | undefined,
  role: 'buyer' | 'seller' | 'admin',
): DeliveryStep {
  const status = order?.status;
  if (role === 'seller') {
    if (status === 'paid') return 'seller_prep';
    if (status === 'preparing_shipment') return 'seller_dispatch';
    return 'none';
  }
  if (role === 'buyer') {
    if (status === 'out_for_delivery') return 'buyer_confirm';
    return 'none';
  }
  return 'none';
}
