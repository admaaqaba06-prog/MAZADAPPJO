import { describe, it, expect } from 'vitest';
import { deriveSellerActions, isUnsoldAuction, SellerAction } from './sellerActions';
import { AuctionItem, Order } from '../../types';

// Minimal factories — only the fields the pure helpers read matter.
const auction = (over: Partial<AuctionItem>): AuctionItem =>
  ({ id: 'a1', title: 'Item', status: 'live', category: 'phones', totalBids: 0, ...over } as AuctionItem);

const order = (over: Partial<Order>): Order =>
  ({ id: 'o1', auctionId: 'a1', status: 'paid', winningBidAmount: 100, ...over } as Order);

const kinds = (actions: SellerAction[]) => actions.map((a) => a.kind);

describe('isUnsoldAuction', () => {
  it('treats ended and reserve_not_met as unsold', () => {
    expect(isUnsoldAuction(auction({ status: 'ended' }), [])).toBe(true);
    expect(isUnsoldAuction(auction({ status: 'reserve_not_met' }), [])).toBe(true);
  });
  it('treats a completed auction with no order as unsold', () => {
    expect(isUnsoldAuction(auction({ id: 'x', status: 'completed' }), [])).toBe(true);
  });
  it('treats a completed auction WITH an order as sold (not unsold)', () => {
    const orders = [order({ auctionId: 'x' })];
    expect(isUnsoldAuction(auction({ id: 'x', status: 'completed' }), orders)).toBe(false);
  });
  it('does not flag live/upcoming auctions', () => {
    expect(isUnsoldAuction(auction({ status: 'live' }), [])).toBe(false);
    expect(isUnsoldAuction(auction({ status: 'upcoming' }), [])).toBe(false);
  });
});

describe('deriveSellerActions', () => {
  it('returns empty array when all caught up (verified, no work)', () => {
    const actions = deriveSellerActions({
      myAuctions: [auction({ status: 'live' })],
      myOrders: [order({ status: 'completed' })],
      availableBalance: 0,
      isVerified: true,
    });
    expect(actions).toEqual([]);
  });

  it('surfaces orders to ship (paid + preparing_shipment)', () => {
    const actions = deriveSellerActions({
      myAuctions: [],
      myOrders: [
        order({ id: 'o1', status: 'paid' }),
        order({ id: 'o2', status: 'preparing_shipment' }),
        order({ id: 'o3', status: 'shipped' }),
      ],
      availableBalance: 0,
      isVerified: true,
    });
    const ship = actions.find((a) => a.kind === 'ship');
    expect(ship).toBeDefined();
    expect(ship!.count).toBe(2);
    expect(ship!.ctaSection).toBe('orders');
  });

  it('surfaces disputes routed to orders', () => {
    const actions = deriveSellerActions({
      myAuctions: [],
      myOrders: [order({ status: 'disputed' })],
      availableBalance: 0,
      isVerified: true,
    });
    const dispute = actions.find((a) => a.kind === 'dispute');
    expect(dispute).toBeDefined();
    expect(dispute!.count).toBe(1);
    expect(dispute!.ctaSection).toBe('orders');
  });

  it('surfaces unsold auctions to relist routed to listings', () => {
    const actions = deriveSellerActions({
      myAuctions: [auction({ id: 'x', status: 'ended' }), auction({ id: 'y', status: 'live' })],
      myOrders: [],
      availableBalance: 0,
      isVerified: true,
    });
    const relist = actions.find((a) => a.kind === 'relist');
    expect(relist).toBeDefined();
    expect(relist!.count).toBe(1);
    expect(relist!.ctaSection).toBe('listings');
  });

  it('surfaces payout ready with the balance as the count, routed to money', () => {
    const actions = deriveSellerActions({
      myAuctions: [],
      myOrders: [],
      availableBalance: 250.5,
      isVerified: true,
    });
    const payout = actions.find((a) => a.kind === 'payout');
    expect(payout).toBeDefined();
    expect(payout!.count).toBe(250.5);
    expect(payout!.ctaSection).toBe('money');
  });

  it('surfaces verify only when unverified, routed to the verify flow', () => {
    const unverified = deriveSellerActions({ myAuctions: [], myOrders: [], availableBalance: 0, isVerified: false });
    expect(kinds(unverified)).toContain('verify');
    expect(unverified.find((a) => a.kind === 'verify')!.ctaSection).toBe('verify');

    const verified = deriveSellerActions({ myAuctions: [], myOrders: [], availableBalance: 0, isVerified: true });
    expect(kinds(verified)).not.toContain('verify');
  });

  it('orders actions by urgency: dispute, ship, relist, payout, verify', () => {
    const actions = deriveSellerActions({
      myAuctions: [auction({ id: 'x', status: 'ended' })],
      myOrders: [order({ id: 'o1', status: 'disputed' }), order({ id: 'o2', status: 'paid' })],
      availableBalance: 100,
      isVerified: false,
    });
    expect(kinds(actions)).toEqual(['dispute', 'ship', 'relist', 'payout', 'verify']);
  });
});
