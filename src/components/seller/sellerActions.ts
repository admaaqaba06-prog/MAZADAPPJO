import { AuctionItem, Order } from '../../types';

/**
 * Pure helpers for the Seller Center "Overview" action hub.
 * These derive "what needs my action now" from the existing data layer
 * (myAuctions / myOrders / wallet balance / verification status). No I/O,
 * no React — unit-tested in sellerActions.test.ts.
 */

export type SellerActionKind = 'dispute' | 'ship' | 'relist' | 'payout' | 'verify';

/** Where a one-tap CTA sends the seller. 'verify' opens the existing Apply-for-Verification modal. */
export type SellerActionSection = 'orders' | 'listings' | 'money' | 'verify';

export interface SellerAction {
  kind: SellerActionKind;
  /** Badge number. Item count for ship/relist/dispute; the JOD balance for payout; 1 for verify. */
  count: number;
  /** Canonical English descriptor (bilingual copy is rendered in the component keyed off `kind`). */
  label: string;
  ctaSection: SellerActionSection;
}

export interface DeriveSellerActionsInput {
  myAuctions: AuctionItem[];
  myOrders: Order[];
  availableBalance: number;
  isVerified: boolean;
}

/** Orders that are paid/preparing and therefore need the seller to ship. */
export const SHIP_STATUSES: Order['status'][] = ['paid', 'preparing_shipment'];

/**
 * An auction is "unsold" (relist candidate) when it has ended without producing
 * a sale: an explicit ended/reserve-not-met status, or a 'completed' auction that
 * has no corresponding order.
 */
export function isUnsoldAuction(auction: AuctionItem, orders: Order[]): boolean {
  const status = auction.status;
  if (status === 'ended' || status === 'reserve_not_met') return true;
  if (status === 'completed') {
    return !orders.some((o) => o.auctionId === auction.id);
  }
  return false;
}

/**
 * Build the prioritized "needs your action" list. Only non-empty actions are
 * returned; an empty array means the seller is all caught up.
 *
 * Priority (most urgent first): disputes (money at risk) > orders to ship
 * (fulfillment SLA) > unsold auctions to relist > payout ready > verify account.
 */
export function deriveSellerActions(input: DeriveSellerActionsInput): SellerAction[] {
  const { myAuctions, myOrders, availableBalance, isVerified } = input;
  const actions: SellerAction[] = [];

  const disputes = myOrders.filter((o) => o.status === 'disputed').length;
  if (disputes > 0) {
    actions.push({ kind: 'dispute', count: disputes, label: 'Disputes to resolve', ctaSection: 'orders' });
  }

  const toShip = myOrders.filter((o) => SHIP_STATUSES.includes(o.status)).length;
  if (toShip > 0) {
    actions.push({ kind: 'ship', count: toShip, label: 'Orders to ship', ctaSection: 'orders' });
  }

  const unsold = myAuctions.filter((a) => isUnsoldAuction(a, myOrders)).length;
  if (unsold > 0) {
    actions.push({ kind: 'relist', count: unsold, label: 'Auctions ended — relist', ctaSection: 'listings' });
  }

  if (availableBalance > 0) {
    actions.push({ kind: 'payout', count: availableBalance, label: 'Payout ready', ctaSection: 'money' });
  }

  if (!isVerified) {
    actions.push({ kind: 'verify', count: 1, label: 'Verify your account', ctaSection: 'verify' });
  }

  return actions;
}
