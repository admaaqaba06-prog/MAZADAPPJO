import { describe, expect, it } from 'vitest';
import {
  ALL_TAB_FIRST_BID_LIMIT,
  PAGE,
  buildFirstBidFeedConstraints,
  buildLiveFeedConstraints,
  buildUpcomingFeedConstraints,
  hasNewerDrops,
  isDisplayableLive,
  mergeLiveIntoCard,
} from './discoverQuery';
import type { AuctionItem } from '../types';

describe('PAGE', () => {
  it('is 24', () => {
    expect(PAGE).toBe(24);
  });
});

describe('buildLiveFeedConstraints', () => {
  it('has no category clause for the "All" chip (null matches)', () => {
    expect(buildLiveFeedConstraints({ categoryMatches: null })).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('has no category clause when categoryMatches is undefined', () => {
    expect(buildLiveFeedConstraints({})).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('has no category clause for an empty matches list', () => {
    expect(buildLiveFeedConstraints({ categoryMatches: [] })).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('adds a category `in` clause for a single-value matches list', () => {
    expect(buildLiveFeedConstraints({ categoryMatches: ['Watches'] })).toEqual({
      where: [
        ['status', '==', 'live'],
        ['category', 'in', ['Watches']],
      ],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('uses the full alias list so legacy stored values still match (Cars→Vehicles)', () => {
    expect(buildLiveFeedConstraints({ categoryMatches: ['Cars', 'Vehicles'] })).toEqual({
      where: [
        ['status', '==', 'live'],
        ['category', 'in', ['Cars', 'Vehicles']],
      ],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('caps the `in` list at 10 values', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `c${i}`);
    const result = buildLiveFeedConstraints({ categoryMatches: eleven });
    expect(result.where).toEqual([
      ['status', '==', 'live'],
      ['category', 'in', eleven.slice(0, 10)],
    ]);
  });

  it('adds an `endsAt >` range clause when endsAfter is passed', () => {
    const bound = { seconds: 123 };
    expect(buildLiveFeedConstraints({ categoryMatches: null, endsAfter: bound })).toEqual({
      where: [
        ['status', '==', 'live'],
        ['endsAt', '>', bound],
      ],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('combines category `in` + endsAt range + cursor', () => {
    const cursor = { id: 'doc-42' };
    const bound = { seconds: 456 };
    expect(
      buildLiveFeedConstraints({ categoryMatches: ['Phones', 'Electronics'], cursor, endsAfter: bound }),
    ).toEqual({
      where: [
        ['status', '==', 'live'],
        ['category', 'in', ['Phones', 'Electronics']],
        ['endsAt', '>', bound],
      ],
      orderBy: [['endsAt', 'asc']],
      startAfter: cursor,
      limit: 24,
    });
  });

  it('sets startAfter with no category clause when only a cursor is passed', () => {
    const cursor = { id: 'doc-7' };
    expect(buildLiveFeedConstraints({ cursor })).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: cursor,
      limit: 24,
    });
  });
});

describe('buildUpcomingFeedConstraints', () => {
  it('builds upcoming constraints with no cursor', () => {
    expect(buildUpcomingFeedConstraints({})).toEqual({
      where: [['status', '==', 'upcoming']],
      orderBy: [['scheduledStartAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('sets startAfter when a cursor is passed', () => {
    const cursor = { id: 'up-9' };
    expect(buildUpcomingFeedConstraints({ cursor })).toEqual({
      where: [['status', '==', 'upcoming']],
      orderBy: [['scheduledStartAt', 'asc']],
      startAfter: cursor,
      limit: 24,
    });
  });
});

describe('buildFirstBidFeedConstraints', () => {
  it('filters to live first_bid lots ordered newest-first', () => {
    const c = buildFirstBidFeedConstraints({});
    expect(c.where).toEqual([
      ['status', '==', 'live'],
      ['startMode', '==', 'first_bid'],
    ]);
    expect(c.orderBy).toEqual([['createdAt', 'desc']]);
  });

  it('defaults to the full page size and no cursor', () => {
    const c = buildFirstBidFeedConstraints({});
    expect(c.limit).toBe(PAGE);
    expect(c.startAfter).toBeNull();
  });

  it('carries a cursor through for infinite scroll', () => {
    const cursor = { __cursor: true };
    expect(buildFirstBidFeedConstraints({ cursor }).startAfter).toBe(cursor);
  });

  it('accepts a smaller limit for the All-tab preview section', () => {
    expect(buildFirstBidFeedConstraints({ limit: ALL_TAB_FIRST_BID_LIMIT }).limit).toBe(8);
  });

  it('never adds a category clause — first-bid lots are not category-scoped', () => {
    const c = buildFirstBidFeedConstraints({});
    expect(c.where.some(([field]) => field === 'category')).toBe(false);
  });
});

describe('hasNewerDrops', () => {
  it('is false when latest is null', () => {
    expect(hasNewerDrops(100, null)).toBe(false);
    expect(hasNewerDrops(null, null)).toBe(false);
  });

  it('is true when nothing is loaded yet but a latest exists', () => {
    expect(hasNewerDrops(null, 100)).toBe(true);
  });

  it('is true when latest is newer than loaded', () => {
    expect(hasNewerDrops(100, 200)).toBe(true);
  });

  it('is false when latest is equal to or older than loaded', () => {
    expect(hasNewerDrops(200, 200)).toBe(false);
    expect(hasNewerDrops(200, 100)).toBe(false);
  });
});

describe('isDisplayableLive', () => {
  const now = 1_000;

  it('passes a live lot ending in the future', () => {
    expect(isDisplayableLive({ status: 'live', endTime: 2_000 }, now)).toBe(true);
  });

  it('passes a live lot with no endTime', () => {
    expect(isDisplayableLive({ status: 'live' }, now)).toBe(true);
  });

  it('fails a simulated lot', () => {
    expect(isDisplayableLive({ status: 'live', endTime: 2_000, isSimulated: true }, now)).toBe(false);
  });

  it('fails a lot whose endTime has passed', () => {
    expect(isDisplayableLive({ status: 'live', endTime: 500 }, now)).toBe(false);
  });

  it('fails an upcoming lot', () => {
    expect(isDisplayableLive({ status: 'upcoming', endTime: 2_000 }, now)).toBe(false);
  });
});

describe('mergeLiveIntoCard', () => {
  const base: AuctionItem = {
    id: 'a1',
    title: 'Rolex',
    description: 'nice',
    category: 'Luxury',
    startingPrice: 100,
    currentPrice: 100,
    minIncrement: 10,
    currentBidderId: null,
    currentBidderName: null,
    videoUrl: '',
    thumbnailUrl: 'thumb.jpg',
    endTime: 1_000,
    duration: 3600,
    sellerId: 's1',
    sellerName: 'Seller',
    sellerLogo: 'logo.jpg',
    status: 'live',
    isFeatured: false,
    totalBids: 0,
    viewersCount: 5,
    reserveMet: false,
  };

  it('returns base unchanged when live is null', () => {
    expect(mergeLiveIntoCard(base, null)).toBe(base);
  });

  it('overlays live fields over base', () => {
    const merged = mergeLiveIntoCard(base, {
      currentPrice: 250,
      totalBids: 7,
      currentBidderId: 'u9',
      currentBidderName: 'Ahmad',
      reserveMet: true,
      status: 'ended',
      endTime: 9_999,
    });
    expect(merged.currentPrice).toBe(250);
    expect(merged.totalBids).toBe(7);
    expect(merged.currentBidderId).toBe('u9');
    expect(merged.currentBidderName).toBe('Ahmad');
    expect(merged.reserveMet).toBe(true);
    expect(merged.status).toBe('ended');
    expect(merged.endTime).toBe(9_999);
  });

  it('never drops base-only fields', () => {
    const merged = mergeLiveIntoCard(base, { currentPrice: 300 });
    expect(merged.title).toBe('Rolex');
    expect(merged.thumbnailUrl).toBe('thumb.jpg');
    expect(merged.sellerName).toBe('Seller');
    expect(merged.viewersCount).toBe(5);
    expect(merged.startingPrice).toBe(100);
  });

  it('does not clobber base fields with undefined live values', () => {
    const merged = mergeLiveIntoCard(base, { currentPrice: 300, reserveMet: undefined });
    expect(merged.currentPrice).toBe(300);
    // reserveMet was undefined on the live overlay → base value preserved.
    expect(merged.reserveMet).toBe(false);
    // Untouched base bidder fields remain.
    expect(merged.currentBidderId).toBeNull();
  });

  it('returns a new object (does not mutate base)', () => {
    const merged = mergeLiveIntoCard(base, { currentPrice: 999 });
    expect(merged).not.toBe(base);
    expect(base.currentPrice).toBe(100);
  });

  it('overlays when the live value matches the base lot id', () => {
    const baseB: AuctionItem = { ...base, id: 'B' };
    const merged = mergeLiveIntoCard(baseB, { id: 'B', currentPrice: 999 });
    expect(merged.currentPrice).toBe(999);
    expect(merged.id).toBe('B');
  });

  it('rejects a live value that belongs to a different lot (cross-lot guard)', () => {
    const baseB: AuctionItem = { ...base, id: 'B' };
    const merged = mergeLiveIntoCard(baseB, { id: 'A', currentPrice: 999 });
    // A different-lot live value must not overlay: base values are preserved.
    expect(merged.currentPrice).toBe(100);
    expect(merged.id).toBe('B');
  });

  it('overlays a live value with NO id (backward-compat for older callers)', () => {
    const merged = mergeLiveIntoCard(base, { currentPrice: 999 });
    expect(merged.currentPrice).toBe(999);
  });
});
