import { describe, it, expect } from 'vitest';
import { bucketListings, filterListings } from './sellerListings';
import { AuctionItem, Order } from '../../types';

const auction = (over: Partial<AuctionItem>): AuctionItem =>
  ({ id: 'a1', title: 'Item', status: 'live', category: 'phones', totalBids: 0, ...over } as AuctionItem);

const order = (over: Partial<Order>): Order =>
  ({ id: 'o1', auctionId: 'a1', status: 'completed', winningBidAmount: 100, ...over } as Order);

describe('bucketListings', () => {
  it('places auctions into mutually-exclusive lifecycle buckets', () => {
    const auctions = [
      auction({ id: 'live1', status: 'live' }),
      auction({ id: 'sched1', status: 'upcoming', approvalStatus: 'approved' }),
      auction({ id: 'rev1', status: 'processing' }),
      auction({ id: 'rej1', status: 'rejected' }),
      auction({ id: 'ended1', status: 'ended' }),
      auction({ id: 'sold1', status: 'completed' }),
    ];
    const orders = [order({ id: 'o-sold', auctionId: 'sold1' })];
    const b = bucketListings(auctions, orders);

    expect(b.live.map((a) => a.id)).toEqual(['live1']);
    expect(b.scheduled.map((a) => a.id)).toEqual(['sched1']);
    expect(b.review.map((a) => a.id)).toEqual(['rev1']);
    expect(b.rejected.map((a) => a.id)).toEqual(['rej1']);
    expect(b.endedUnsold.map((a) => a.id)).toEqual(['ended1']);
    expect(b.sold.map((a) => a.id)).toEqual(['sold1']);
  });

  it('routes a legacy upcoming+pending doc to review, not scheduled', () => {
    const b = bucketListings([auction({ id: 'x', status: 'upcoming', approvalStatus: 'pending' })], []);
    expect(b.review.map((a) => a.id)).toEqual(['x']);
    expect(b.scheduled).toHaveLength(0);
  });

  it('routes an upcoming+rejected doc to rejected', () => {
    const b = bucketListings([auction({ id: 'x', status: 'upcoming', approvalStatus: 'rejected' })], []);
    expect(b.rejected.map((a) => a.id)).toEqual(['x']);
  });

  it('treats a completed auction with an order as sold, without an order as endedUnsold', () => {
    const withOrder = bucketListings([auction({ id: 'c', status: 'completed' })], [order({ auctionId: 'c' })]);
    expect(withOrder.sold.map((a) => a.id)).toEqual(['c']);
    expect(withOrder.endedUnsold).toHaveLength(0);

    const noOrder = bucketListings([auction({ id: 'c', status: 'completed' })], []);
    expect(noOrder.endedUnsold.map((a) => a.id)).toEqual(['c']);
    expect(noOrder.sold).toHaveLength(0);
  });

  it('sorts newest first by createdAt', () => {
    const b = bucketListings(
      [
        auction({ id: 'old', status: 'live', createdAt: 1000 } as any),
        auction({ id: 'new', status: 'live', createdAt: 5000 } as any),
      ],
      []
    );
    expect(b.live.map((a) => a.id)).toEqual(['new', 'old']);
  });
});

describe('filterListings', () => {
  const list = [
    auction({ id: '1', title: 'iPhone 15 Pro', category: 'Electronics' }),
    auction({ id: '2', title: 'Rolex Submariner', category: 'Luxury' }),
    auction({ id: '3', title: 'iPhone 13', category: 'Electronics' }),
  ];

  it('passes everything through with empty query and all category', () => {
    expect(filterListings(list, { query: '', category: 'all' })).toHaveLength(3);
    expect(filterListings(list, {})).toHaveLength(3);
  });

  it('filters by case-insensitive title substring', () => {
    const res = filterListings(list, { query: 'iphone' });
    expect(res.map((a) => a.id)).toEqual(['1', '3']);
  });

  it('filters by exact category', () => {
    const res = filterListings(list, { category: 'Luxury' });
    expect(res.map((a) => a.id)).toEqual(['2']);
  });

  it('combines query and category', () => {
    const res = filterListings(list, { query: 'iphone', category: 'Electronics' });
    expect(res.map((a) => a.id)).toEqual(['1', '3']);
  });
});
