import { describe, it, expect } from 'vitest';
import {
  compareLandingAuctions,
  curateLandingAuctions,
  isAwaitingFirstLandingBid,
  mapToLandingAuction,
} from './useLandingAuctions';
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
  // comparator's `typeof === 'number' && > 0` agrees with it on every value
  // that survives the filter, so a 0 endTime can never be sorted to the front
  // on an epoch-1970 clock.
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
describe('compareLandingAuctions — order-relation contract', () => {
  const lot = (o: Partial<AuctionItem>) => mapToLandingAuction(auction(o));

  // Named regression for the exact defect that shipped: the clockless branch was
  // `(y.createdAt ?? -Infinity) - (x.createdAt ?? -Infinity)`, and two lots that
  // both lacked createdAt made that `-Infinity - -Infinity` = NaN. The
  // enumeration below also covers this; it is kept as a standalone case because
  // it is the one pair that was actually broken in production.
  it('never returns NaN for two undated clockless lots (the pair that shipped broken)', () => {
    const x = lot({ id: 'n1', endTime: undefined } as any);
    const y = lot({ id: 'n2', endTime: undefined } as any);
    expect(Number.isNaN(compareLandingAuctions(x, y))).toBe(false);
    expect(Number.isNaN(compareLandingAuctions(y, x))).toBe(false);
  });

  // 72 shapes: 4 feature states x 6 endTime values x 3 createdAt values. The
  // endTime list deliberately includes every value that reaches the comparator
  // as "clockless" by a different route — 0 (falsy), NaN (the second NaN path),
  // undefined (absent) and null (a doc that literally stores null).
  //
  // Comparisons are precomputed into a matrix so the transitivity cube is array
  // lookups rather than 373k comparator calls, and violations are collected and
  // asserted once rather than running expect() inside the loops.
  const END_TIMES = [NOW + 60_000, NOW + 10_000, 0, NaN, undefined, null];
  const CREATED_AT = [900, 100, undefined];
  const FEATURE_STATES = [
    { isFeatured: false, featuredRank: undefined },
    { isFeatured: true, featuredRank: 1 },
    { isFeatured: true, featuredRank: 2 },
    { isFeatured: true, featuredRank: undefined },
  ];

  const variants: LandingAuction[] = [];
  for (const f of FEATURE_STATES) {
    for (const endTime of END_TIMES) {
      for (const createdAt of CREATED_AT) {
        variants.push(lot({
          id: `v${variants.length}`, ...f, endTime, createdAt,
        } as any));
      }
    }
  }
  const N = variants.length;
  const M: number[][] = variants.map(x => variants.map(y => compareLandingAuctions(x, y)));

  it('covers 72 distinct shapes', () => {
    expect(N).toBe(72);
  });

  it('is TOTAL: every ordered pair returns a real number, never NaN', () => {
    const bad: string[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const r = M[i][j];
        if (typeof r !== 'number' || Number.isNaN(r)) bad.push(`cmp(v${i},v${j}) = ${r}`);
      }
    }
    expect({ violations: bad.length, sample: bad.slice(0, 5) }).toEqual({ violations: 0, sample: [] });
  });

  it('is ANTISYMMETRIC: sign(cmp(a,b)) === -sign(cmp(b,a))', () => {
    const bad: string[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (Math.sign(M[i][j]) !== -Math.sign(M[j][i])) {
          bad.push(`cmp(v${i},v${j})=${M[i][j]} but cmp(v${j},v${i})=${M[j][i]}`);
        }
      }
    }
    expect({ violations: bad.length, sample: bad.slice(0, 5) }).toEqual({ violations: 0, sample: [] });
  });

  it('is TRANSITIVE: cmp(a,b) <= 0 and cmp(b,c) <= 0 implies cmp(a,c) <= 0', () => {
    const bad: string[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (M[i][j] > 0) continue;
        for (let k = 0; k < N; k++) {
          if (M[j][k] <= 0 && M[i][k] > 0) {
            bad.push(`v${i}<=v${j}<=v${k} but cmp(v${i},v${k})=${M[i][k]}`);
          }
        }
      }
    }
    expect({ violations: bad.length, sample: bad.slice(0, 5) }).toEqual({ violations: 0, sample: [] });
  });

  // The one that actually corrupts a merge sort when violated: if equality is
  // not transitive the runtime can order a set inconsistently with itself.
  it('has TRANSITIVE EQUALITY: cmp(a,b) === 0 and cmp(b,c) === 0 implies cmp(a,c) === 0', () => {
    const bad: string[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (M[i][j] !== 0) continue;
        for (let k = 0; k < N; k++) {
          if (M[j][k] === 0 && M[i][k] !== 0) {
            bad.push(`v${i}==v${j}==v${k} but cmp(v${i},v${k})=${M[i][k]}`);
          }
        }
      }
    }
    expect({ violations: bad.length, sample: bad.slice(0, 5) }).toEqual({ violations: 0, sample: [] });
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

// ---------------------------------------------------------------------------
// The awaiting-first-bid predicate.
//
// This is the rule that decides whether a card may show a clock at all, so it
// is the one place a "-56 years" countdown or a false "Be the first" badge gets
// in. It is a PURE function on the mapped shape, exported so the hero and the
// cards read one rule rather than each carrying their own — they briefly did,
// and that is exactly how two surfaces end up disagreeing about the same lot.
//
// NOT the same as `isAwaitingFirstBid` in utils/auctionPhase.ts: that one
// requires `startMode === 'first_bid'`, and `mapToLandingAuction` does not carry
// `startMode`. It does not need to. A scheduled lot always ships an `endTime`
// (AppContext writes `endTime` AND `endsAt` for every non-first_bid listing),
// so on this shape "live, no clock, no bids" already implies first-bid.
// ---------------------------------------------------------------------------
describe('isAwaitingFirstLandingBid', () => {
  const lot = (o: Partial<AuctionItem>): LandingAuction => mapToLandingAuction(auction(o));

  it('requires no bids and no valid clock', () => {
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 0, endTime: undefined }))).toBe(true);
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 1, endTime: NOW + 60_000 }))).toBe(false);
  });

  it('is false as soon as a bid lands, clock or no clock', () => {
    // A started `first_bid` lot is stamped with `endsAt`, which this shape does
    // not carry, so it arrives clockless WITH bids. It must not be advertised
    // as awaiting a first bid that has already happened.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 1, endTime: undefined }))).toBe(false);
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 25, endTime: undefined }))).toBe(false);
  });

  it('is false for a lot with a real future clock and no bids', () => {
    // A scheduled lot before anyone bids. It has a countdown to show, so the
    // first-bid explanation would be a false statement about its timing.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 0, endTime: NOW + 60_000 }))).toBe(false);
  });

  it('treats a bare 0 endTime as clockless, not as an epoch-1970 clock', () => {
    // `isLiveNow` decides clocked-ness by falsiness, so it ADMITS a 0 endTime
    // and curation keeps the lot. Read as a timestamp, 0 is 1970 — the shape
    // that ships a card counting down from minus fifty-six years.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 0, endTime: 0 }))).toBe(true);
  });

  it('treats a NaN endTime as clockless', () => {
    // Matches the comparator, which already classifies NaN as clockless so its
    // subtraction can never return NaN.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 0, endTime: NaN as any }))).toBe(true);
  });

  it('treats an Infinity endTime as having no RENDERABLE clock', () => {
    // The one value where this predicate deliberately parts company with
    // `compareLandingAuctions`, which asks a different question. The comparator
    // needs a TOTAL ORDER, and `Infinity > 0` is true, so it files such a lot
    // among the clocked ones (last, since it subtracts). This predicate asks
    // whether a countdown can be DRAWN, and `Infinity - now` formats as
    // nothing a reader can use.
    //
    // The divergence is invisible: ordering makes no claim to a visitor, and a
    // card gated on this predicate renders the first-bid explanation instead of
    // an unbounded timer. Asserted rather than left implicit so a future edit to
    // either function has to confront it.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 0, endTime: Infinity as any }))).toBe(true);
  });

  it('treats a negative endTime as clockless', () => {
    // The one value where `isLiveNow` and the comparator genuinely diverge:
    // `!(-5)` is false, so `isLiveNow` calls it clocked. Such a lot is dropped
    // by the expiry check before it reaches a card, but the predicate must not
    // hand a negative remaining time to a formatter if one ever slips through.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: 0, endTime: -5 }))).toBe(true);
  });

  it('treats an absent totalBids as zero rather than as a bid', () => {
    // A doc mid-write, or one predating the counter, must not be reported as
    // having a bid it does not have.
    expect(isAwaitingFirstLandingBid(lot({ totalBids: undefined as any, endTime: undefined }))).toBe(true);
  });

  it('agrees with the comparator on every endTime a real doc can carry', () => {
    // Both answer a version of "does this lot have a clock?", and for every
    // value a Firestore doc actually holds they must agree — a disagreement
    // means a lot sorted among the clocked ones while rendering "Be the first".
    // `Infinity` is excluded on purpose and covered by the test above.
    for (const endTime of [undefined, null, 0, NaN, -1, NOW + 1_000] as any[]) {
      const a = lot({ endTime, totalBids: 0 });
      const clockedByComparator = compareLandingAuctions(a, lot({ endTime: undefined, totalBids: 0 })) < 0;
      expect(
        isAwaitingFirstLandingBid(a),
        `disagreement for endTime=${String(endTime)}`
      ).toBe(!clockedByComparator);
    }
  });
});
