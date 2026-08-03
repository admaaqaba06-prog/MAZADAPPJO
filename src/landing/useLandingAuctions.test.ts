import { describe, it, expect } from 'vitest';
import { compareLandingAuctions, curateLandingAuctions, mapToLandingAuction } from './useLandingAuctions';
import type { LandingAuction } from './useLandingAuctions';
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
  // endTime is now admitted and sorted after the clocked lots.
  //
  // `endTime: 0` counts as CLOCKLESS, matching `isLiveNow`, which decides
  // clocked-ness by falsiness (`!0` is true) and admits such a lot. The
  // comparator's `typeof === 'number' && > 0` agrees with it by construction,
  // so a 0 endTime can never be sorted to the front on an epoch-1970 clock.
  it('admits a 0 or missing endTime, ordering both as clockless behind clocked lots', () => {
    const out = curateLandingAuctions([
      auction({ id: 'zero', status: 'live', endTime: 0 }),
      auction({ id: 'undef', status: 'live', endTime: undefined as any }),
      auction({ id: 'ok', status: 'live', endTime: NOW + 60_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['ok', 'zero', 'undef']);
  });
  it('orders featured first, then soonest endTime', () => {
    const out = curateLandingAuctions([
      auction({ id: 'soon', endTime: NOW + 10_000, isFeatured: false }),
      auction({ id: 'later', endTime: NOW + 90_000, isFeatured: false }),
      auction({ id: 'feat', endTime: NOW + 50_000, isFeatured: true }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['feat', 'soon', 'later']);
  });
  // Asserts the ORDER, not just the length: the input is built reverse-sorted
  // (a0 ends last, a11 ends soonest) so the cap keeping the TOP n is
  // distinguishable from it keeping an arbitrary n. A length-only assertion
  // would still pass if `.slice` ran before `.sort` — the exact invariant the
  // filter → map → sort → slice order exists to hold.
  it('caps to the requested limit keeping the TOP n, not an arbitrary n', () => {
    const many = Array.from({ length: 12 }, (_, i) => auction({ id: `a${i}`, endTime: NOW + (12 - i) * 1000 }));
    const out = curateLandingAuctions(many, NOW, 8);
    expect(out).toHaveLength(8);
    expect(out.map(a => a.id)).toEqual(['a11', 'a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4']);
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

  // Named for what it actually asserts: input order is preserved. It does NOT
  // test the comparator's no-NaN property — a NaN-returning comparator produces
  // this identical output on V8. That property is tested directly against
  // `compareLandingAuctions` below.
  it('keeps two undated clockless lots in their input order', () => {
    const out = curateLandingAuctions([
      auction({ id: 'n1', endTime: undefined } as any),
      auction({ id: 'n2', endTime: undefined } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['n1', 'n2']);
  });

  it('treats a NaN endTime as clockless, ordering it behind clocked lots', () => {
    const out = curateLandingAuctions([
      auction({ id: 'nan', endTime: NaN as any }),
      auction({ id: 'ok', endTime: NOW + 60_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['ok', 'nan']);
  });
});

// These assert the comparator's CONTRACT (its return value), not the sorted
// output. That distinction is the whole point: a comparator that returns NaN
// sorts identically to one that returns 0 on V8, so no assertion on a sorted
// array can catch it. This is the only reason compareLandingAuctions is exported.
describe('compareLandingAuctions — totality contract', () => {
  const lot = (o: Partial<AuctionItem>) => mapToLandingAuction(auction(o));

  it('never returns NaN for two undated clockless lots (the both-undefined pair)', () => {
    const x = lot({ id: 'n1', endTime: undefined } as any);
    const y = lot({ id: 'n2', endTime: undefined } as any);
    expect(Number.isNaN(compareLandingAuctions(x, y))).toBe(false);
    expect(Number.isNaN(compareLandingAuctions(y, x))).toBe(false);
  });

  it('never returns NaN for two lots with a NaN endTime', () => {
    const x = lot({ id: 'x', endTime: NaN as any });
    const y = lot({ id: 'y', endTime: NaN as any });
    expect(Number.isNaN(compareLandingAuctions(x, y))).toBe(false);
  });

  // 16 shapes = featured/unfeatured x ranked/unranked x clocked/clockless x
  // dated/undated, compared every way round including against themselves.
  it('returns a real number for every pair across all field combinations', () => {
    const variants: LandingAuction[] = [];
    for (const isFeatured of [true, false]) {
      for (const featuredRank of [1, undefined]) {
        for (const endTime of [NOW + 60_000, undefined]) {
          for (const createdAt of [500, undefined]) {
            variants.push(lot({
              id: `v${variants.length}`, isFeatured, featuredRank, endTime, createdAt,
            } as any));
          }
        }
      }
    }
    expect(variants).toHaveLength(16);

    for (const x of variants) {
      for (const y of variants) {
        const r = compareLandingAuctions(x, y);
        expect(typeof r).toBe('number');
        expect(Number.isNaN(r)).toBe(false);
      }
    }
  });
});

describe('mapToLandingAuction — new fields', () => {
  it('carries createdAt through as epoch millis from a Firestore Timestamp shape', () => {
    expect(mapToLandingAuction(auction({ createdAt: { seconds: 5 } } as any)).createdAt).toBe(5000);
  });

  it('carries a numeric createdAt through unchanged', () => {
    expect(mapToLandingAuction(auction({ createdAt: 1234 } as any)).createdAt).toBe(1234);
  });

  // The toMillis branch is the one production actually takes: a real Firestore
  // Timestamp carries BOTH toMillis and seconds, so it short-circuits there and
  // never reaches the {seconds} path above.
  it('reads a real Firestore Timestamp via toMillis (the shape live docs actually carry)', () => {
    expect(mapToLandingAuction(auction({ createdAt: { toMillis: () => 5000 } } as any)).createdAt).toBe(5000);
  });

  it('parses an ISO string createdAt', () => {
    expect(mapToLandingAuction(auction({ createdAt: '2026-08-03T00:00:00.000Z' } as any)).createdAt).toBe(Date.parse('2026-08-03T00:00:00.000Z'));
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
