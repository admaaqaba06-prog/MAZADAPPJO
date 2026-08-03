import { describe, it, expect } from 'vitest';
import { curateLandingAuctions, mapToLandingAuction } from './useLandingAuctions';
import type { AuctionItem } from '../types';

const NOW = 1_000_000_000_000;

function auction(overrides: Partial<AuctionItem>): AuctionItem {
  return {
    id: 'a', title: 'Item', category: 'Electronics', startingPrice: 10,
    currentPrice: 100, minIncrement: 5, currentBidderId: null, currentBidderName: null,
    videoUrl: '', thumbnailUrl: 'thumb.jpg', endTime: NOW + 60_000, duration: 300,
    sellerId: 's', sellerName: 'Seller', status: 'live', totalBids: 3, viewersCount: 0,
    isFeatured: false, ...overrides,
  } as AuctionItem;
}

describe('mapToLandingAuction', () => {
  it('prefers thumbnailUrl, falls back to first mediaUrl', () => {
    expect(mapToLandingAuction(auction({ thumbnailUrl: 't.jpg' })).imageUrl).toBe('t.jpg');
    expect(mapToLandingAuction(auction({ thumbnailUrl: '', mediaUrls: ['m.jpg'] })).imageUrl).toBe('m.jpg');
  });
  it('marks approved auctions as verified', () => {
    expect(mapToLandingAuction(auction({ approvalStatus: 'approved' })).isVerified).toBe(true);
    expect(mapToLandingAuction(auction({ approvalStatus: 'pending' })).isVerified).toBe(false);
    expect(mapToLandingAuction(auction({})).isVerified).toBe(false);
  });
});

describe('curateLandingAuctions', () => {
  it('INCLUDES simulated auctions (pre-launch, so the section is never empty)', () => {
    const out = curateLandingAuctions([auction({ id: 'x', isSimulated: true })], NOW);
    expect(out.map(a => a.id)).toEqual(['x']);
  });
  // Was 'orders hottest first: featured, then most bids, then soonest'. The
  // totalBids tie-break was deliberately dropped: every lot in the live
  // catalogue has zero bids so it never discriminated, and ranking it above the
  // clocked/clockless split would let a bid-less clocked lot fall below a
  // clockless one. Soonest-ending now wins outright among unfeatured lots.
  it('ignores totalBids when ordering — the clock is the only urgency signal', () => {
    const out = curateLandingAuctions([
      auction({ id: 'quiet', endTime: NOW + 10_000, totalBids: 0 }),
      auction({ id: 'hot', endTime: NOW + 90_000, totalBids: 25 }),
      auction({ id: 'mid', endTime: NOW + 50_000, totalBids: 5 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['quiet', 'mid', 'hot']);
  });
  it('excludes non-live and past-endTime auctions', () => {
    const out = curateLandingAuctions([
      auction({ id: 'live', status: 'live', endTime: NOW + 60_000 }),
      auction({ id: 'upcoming', status: 'upcoming' }),
      auction({ id: 'past', status: 'live', endTime: NOW - 1 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['live']);
  });
  it('excludes items without a title', () => {
    expect(curateLandingAuctions([auction({ title: '' })], NOW)).toHaveLength(0);
  });
  // Was 'excludes live auctions with a missing or invalid endTime' — that
  // exclusion WAS the bug: it dropped the entire first_bid catalogue. A missing
  // endTime is now admitted and sorted last (see the clockless describe below).
  //
  // `endTime: 0` is an inconsistency this test pins rather than endorses:
  // `isLiveNow` reads it as clockless (`!0`) and admits it, but the comparator's
  // `typeof === 'number'` reads it as CLOCKED, so it sorts to the very front on
  // an epoch-1970 clock. No writer in this app stores 0, so it is documented
  // here as real current behaviour, not fixed inside this task's scope.
  it('admits a missing endTime (sorted last) and treats a 0 endTime as clocked', () => {
    const out = curateLandingAuctions([
      auction({ id: 'zero', status: 'live', endTime: 0 }),
      auction({ id: 'undef', status: 'live', endTime: undefined as any }),
      auction({ id: 'ok', status: 'live', endTime: NOW + 60_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['zero', 'ok', 'undef']);
  });
  it('orders featured first, then soonest endTime', () => {
    const out = curateLandingAuctions([
      auction({ id: 'soon', endTime: NOW + 10_000, isFeatured: false }),
      auction({ id: 'later', endTime: NOW + 90_000, isFeatured: false }),
      auction({ id: 'feat', endTime: NOW + 50_000, isFeatured: true }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['feat', 'soon', 'later']);
  });
  it('caps the result to the requested limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => auction({ id: `a${i}`, endTime: NOW + i * 1000 }));
    expect(curateLandingAuctions(many, NOW, 8)).toHaveLength(8);
  });
});

describe('curateLandingAuctions — clockless (awaiting-first-bid) lots', () => {
  it('KEEPS a live lot that has no endTime (the regression this fixes)', () => {
    const out = curateLandingAuctions([auction({ id: 'clockless', endTime: undefined })], NOW);
    expect(out.map(a => a.id)).toEqual(['clockless']);
  });

  it('still drops a lot whose clock has expired', () => {
    const out = curateLandingAuctions([auction({ id: 'expired', endTime: NOW - 1 })], NOW);
    expect(out).toEqual([]);
  });

  it('still drops non-live lots, clockless or not', () => {
    const out = curateLandingAuctions([
      auction({ id: 'up', status: 'upcoming', endTime: undefined }),
      auction({ id: 'done', status: 'completed', endTime: undefined }),
    ], NOW);
    expect(out).toEqual([]);
  });

  it('still drops a titleless lot', () => {
    const out = curateLandingAuctions([auction({ id: 'notitle', title: '', endTime: undefined })], NOW);
    expect(out).toEqual([]);
  });
});

describe('curateLandingAuctions — ordering', () => {
  it('ranks featured lots first, by featuredRank ascending', () => {
    const out = curateLandingAuctions([
      auction({ id: 'plain' }),
      auction({ id: 'rank2', isFeatured: true, featuredRank: 2 } as any),
      auction({ id: 'rank1', isFeatured: true, featuredRank: 1 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['rank1', 'rank2', 'plain']);
  });

  it('places a featured lot with no rank after ranked ones but before unfeatured', () => {
    const out = curateLandingAuctions([
      auction({ id: 'plain' }),
      auction({ id: 'noRank', isFeatured: true }),
      auction({ id: 'rank1', isFeatured: true, featuredRank: 1 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['rank1', 'noRank', 'plain']);
  });

  it('places clocked lots before clockless ones', () => {
    const out = curateLandingAuctions([
      auction({ id: 'clockless', endTime: undefined }),
      auction({ id: 'clocked', endTime: NOW + 60_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['clocked', 'clockless']);
  });

  it('orders clocked lots by endTime ascending (soonest first)', () => {
    const out = curateLandingAuctions([
      auction({ id: 'later', endTime: NOW + 90_000 }),
      auction({ id: 'sooner', endTime: NOW + 10_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['sooner', 'later']);
  });

  it('orders clockless lots by createdAt descending (newest first)', () => {
    const out = curateLandingAuctions([
      auction({ id: 'old', endTime: undefined, createdAt: 100 } as any),
      auction({ id: 'new', endTime: undefined, createdAt: 900 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['new', 'old']);
  });

  it('sorts a clockless lot with no createdAt last, without throwing', () => {
    const out = curateLandingAuctions([
      auction({ id: 'nodate', endTime: undefined } as any),
      auction({ id: 'dated', endTime: undefined, createdAt: 500 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['dated', 'nodate']);
  });
});

describe('mapToLandingAuction — new fields', () => {
  it('carries createdAt through as epoch millis from a Firestore Timestamp shape', () => {
    expect(mapToLandingAuction(auction({ createdAt: { seconds: 5 } } as any)).createdAt).toBe(5000);
  });

  it('carries a numeric createdAt through unchanged', () => {
    expect(mapToLandingAuction(auction({ createdAt: 1234 } as any)).createdAt).toBe(1234);
  });

  it('leaves createdAt undefined when the doc has none — never fabricates one', () => {
    expect(mapToLandingAuction(auction({})).createdAt).toBeUndefined();
  });

  it('carries featuredRank through, undefined when absent', () => {
    expect(mapToLandingAuction(auction({ featuredRank: 3 } as any)).featuredRank).toBe(3);
    expect(mapToLandingAuction(auction({})).featuredRank).toBeUndefined();
  });

  it('leaves endTime undefined for a clockless lot rather than inventing a clock', () => {
    expect(mapToLandingAuction(auction({ endTime: undefined })).endTime).toBeUndefined();
  });
});
