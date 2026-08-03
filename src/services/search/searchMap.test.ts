import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { algoliaHitToAuction, buildFacetFilters, SEARCH_CATEGORY_MATCHES } from './searchMap';
import { isAwaitingFirstBid } from '../../utils/auctionPhase';

// Cross-boundary require: the REAL indexer that produces the hits this mapper
// consumes. Used so the awaiting-first-bid cases below run on a record built by
// production code (doc → record → mapped item → the card's predicate) instead of
// a hand-written hit that could silently drift from the index. `createRequire`
// because algoliaSync.js is CommonJS and this package is `"type": "module"`.
const requireCjs = createRequire(import.meta.url);
const { buildAlgoliaRecord } = requireCjs('../../../functions/algoliaSync');

describe('SEARCH_CATEGORY_MATCHES', () => {
  it('is derived from the one taxonomy, keyed by the chip label', () => {
    // No longer hand-maintained: it is generated from utils/categories.ts, so
    // it cannot drift from the Discover chips the way it had already drifted
    // (the catch-all chip had no entry at all, making search inside it
    // unfiltered).
    expect(SEARCH_CATEGORY_MATCHES).toEqual({
      Vehicles: ['Vehicles', 'Cars'],
      Phones: ['Phones'],
      Electronics: ['Electronics'],
      Watches: ['Watches', 'Luxury'],
      Appliances: ['Appliances'],
      'Home & Furniture': ['Home & Furniture'],
      'Real Estate': ['Real Estate'],
      Other: ['Fashion', 'Misc'],
    });
  });

  it('gives the catch-all chip a facet group, which it never had', () => {
    expect(SEARCH_CATEGORY_MATCHES.Other).toEqual(['Fashion', 'Misc']);
  });

  it('reaches legacy Luxury lots from the Watches chip', () => {
    // Seller-listed watches stored 'Luxury' and were unreachable from search.
    expect(SEARCH_CATEGORY_MATCHES.Watches).toContain('Luxury');
  });
});

describe('algoliaHitToAuction', () => {
  it('maps a full hit into a renderable AuctionItem', () => {
    const endMs = Date.now() + 7200000;
    const hit = {
      objectID: 'auc-1',
      title: 'iPhone 15 Pro',
      description: 'Sealed box',
      category: 'Phones',
      status: 'live',
      sellerName: 'Amman Tech',
      thumbnailUrl: 'https://cdn/x.jpg',
      currentPriceFils: 250000,
      startingPriceFils: 100000,
      endsAt: endMs,
    };
    const item = algoliaHitToAuction(hit);
    expect(item.id).toBe('auc-1');
    expect(item.title).toBe('iPhone 15 Pro');
    expect(item.description).toBe('Sealed box');
    expect(item.category).toBe('Phones');
    expect(item.status).toBe('live');
    expect(item.sellerName).toBe('Amman Tech');
    expect(item.thumbnailUrl).toBe('https://cdn/x.jpg');
    // fils → units (÷1000) via filsToUnits
    expect(item.currentPrice).toBe(250);
    // endsAt resolved via resolveEndTime
    expect(item.endTime).toBe(endMs);
  });

  it('carries the admin-lookup fields (auctionNumber, currentBidderName) when the index has them', () => {
    const item = algoliaHitToAuction({
      objectID: 'auc-3',
      auctionNumber: 137,
      currentBidderName: 'Layla',
    });
    expect(item.auctionNumber).toBe(137);
    expect(item.currentBidderName).toBe('Layla');
  });

  it('defaults the admin-lookup fields when absent (pre-backfill index)', () => {
    // Until the backend indexes them these are simply not present: number → undefined,
    // winner name → null. The section hides both when falsy, so this renders cleanly.
    const item = algoliaHitToAuction({ objectID: 'auc-4' });
    expect(item.auctionNumber).toBeUndefined();
    expect(item.currentBidderName).toBeNull();
  });

  it('ignores a non-numeric auctionNumber (no string posing as a real number)', () => {
    expect(algoliaHitToAuction({ objectID: 'auc-5', auctionNumber: 'NaN' as any }).auctionNumber).toBeUndefined();
  });

  it('prefers objectID but falls back to hit.id', () => {
    expect(algoliaHitToAuction({ id: 'from-id' }).id).toBe('from-id');
    expect(algoliaHitToAuction({ objectID: 'from-obj', id: 'from-id' }).id).toBe('from-obj');
  });

  it('degrades gracefully on a sparse hit (missing price/endTime/title) without throwing', () => {
    const before = Date.now();
    const item = algoliaHitToAuction({ objectID: 'auc-2' });
    expect(item.id).toBe('auc-2');
    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.sellerName).toBe('');
    expect(item.thumbnailUrl).toBe('');
    // no price fields → 0
    expect(item.currentPrice).toBe(0);
    // no endsAt/endTime → resolveEndTime default (~1h out), never NaN/expired
    expect(item.endTime).toBeGreaterThan(before);
    expect(Number.isNaN(item.endTime)).toBe(false);
    // sensible status default
    expect(item.status).toBe('live');
  });

  it('resolves currentPrice from plain currentPrice when no *Fils field', () => {
    expect(algoliaHitToAuction({ objectID: 'x', currentPrice: 42 }).currentPrice).toBe(42);
  });

  it('defaults a missing category to "" (neutral), NOT "Luxury"', () => {
    // A lot with no stored category must not be mislabeled on the card.
    expect(algoliaHitToAuction({ objectID: 'no-cat' }).category).toBe('');
    expect(algoliaHitToAuction({ objectID: 'no-cat' }).category).not.toBe('Luxury');
  });

  it('defaults an empty-string category to "" (not "Luxury")', () => {
    expect(algoliaHitToAuction({ objectID: 'empty-cat', category: '' }).category).toBe('');
  });

  it('preserves a present category unchanged', () => {
    expect(algoliaHitToAuction({ objectID: 'c', category: 'Cars' }).category).toBe('Cars');
  });
});

describe('algoliaHitToAuction — startMode (awaiting-first-bid parity with browse)', () => {
  // A live first_bid lot whose clock has NOT started: the doc carries no
  // endsAt/endTime and no bids, so buildAlgoliaRecord indexes endTime/endsAt 0.
  const awaitingRecord = buildAlgoliaRecord('awaiting-1', {
    status: 'live',
    title: 'Clockless lot',
    startMode: 'first_bid',
    totalBids: 0,
  });
  // The same lot after its first bid: the server (applyBidWrites) stamps both
  // endTime and endsAt, so the record carries a real epoch-ms clock.
  const clockMs = 1_800_000_000_000;
  const bidOnRecord = buildAlgoliaRecord('bid-on-1', {
    status: 'live',
    title: 'Clock started',
    startMode: 'first_bid',
    totalBids: 3,
    endTime: clockMs,
    endsAt: clockMs,
  });
  const scheduledRecord = buildAlgoliaRecord('sched-1', {
    status: 'live',
    title: 'Scheduled lot',
    startMode: 'scheduled',
    endTime: clockMs,
  });

  it('maps an awaiting hit to startMode first_bid + endTime null', () => {
    const item = algoliaHitToAuction(awaitingRecord);
    expect(item.startMode).toBe('first_bid');
    expect(item.endTime).toBeNull();
  });

  it('makes the CARD predicate agree with browse on an awaiting hit', () => {
    // This is the parity bug: the card decides its badge with
    // isAwaitingFirstBid on the MAPPED item, so search showed the red LIVE
    // badge while browse showed the amber "BE THE FIRST" one.
    expect(isAwaitingFirstBid(algoliaHitToAuction(awaitingRecord))).toBe(true);
  });

  it('keeps a real countdown for a first_bid lot that HAS taken a bid', () => {
    const item = algoliaHitToAuction(bidOnRecord);
    expect(item.startMode).toBe('first_bid');
    expect(item.endTime).toBe(clockMs);
    expect(isAwaitingFirstBid(item)).toBe(false);
  });

  it('never turns a scheduled lot into a first_bid one', () => {
    const item = algoliaHitToAuction(scheduledRecord);
    expect(item.startMode).toBe('scheduled');
    expect(item.endTime).toBe(clockMs);
    expect(isAwaitingFirstBid(item)).toBe(false);
  });

  it('leaves startMode undefined when the index has null / no value', () => {
    // buildAlgoliaRecord writes `startMode: d.startMode ?? null`, and an older
    // record predating that field has none at all. Neither may become a mode.
    expect(algoliaHitToAuction(buildAlgoliaRecord('no-mode', { status: 'live' })).startMode).toBeUndefined();
    expect(algoliaHitToAuction({ objectID: 'legacy' }).startMode).toBeUndefined();
    expect(algoliaHitToAuction({ objectID: 'junk', startMode: 'nonsense' }).startMode).toBeUndefined();
  });
});

describe('buildFacetFilters', () => {
  it('returns undefined for an undefined category (no filter)', () => {
    expect(buildFacetFilters({})).toBeUndefined();
  });

  it('returns undefined for the "All" chip (no filter)', () => {
    expect(buildFacetFilters({ category: 'All' })).toBeUndefined();
  });

  it('returns undefined for an unknown category (no crash, no filter)', () => {
    expect(buildFacetFilters({ category: 'Nonsense' })).toBeUndefined();
  });

  it('builds a single-value OR group for a chip with no legacy aliases', () => {
    expect(buildFacetFilters({ category: 'Appliances' })).toEqual([['category:Appliances']]);
  });

  it('builds a two-value OR group for a chip that absorbed a legacy value', () => {
    expect(buildFacetFilters({ category: 'Watches' })).toEqual([
      ['category:Watches', 'category:Luxury'],
    ]);
  });

  it('builds an OR group over the full canonical alias list (Vehicles absorbs Cars)', () => {
    expect(buildFacetFilters({ category: 'Vehicles' })).toEqual([
      ['category:Vehicles', 'category:Cars'],
    ]);
  });

  it('keeps Phones and Electronics distinct', () => {
    // They used to be the same bucket: the seller picker offered both labels
    // and wrote 'Electronics' for each, so the Phones chip had to match
    // Electronics too and therefore also returned laptops and televisions.
    expect(buildFacetFilters({ category: 'Phones' })).toEqual([['category:Phones']]);
    expect(buildFacetFilters({ category: 'Electronics' })).toEqual([['category:Electronics']]);
  });

  it('builds a status-only OR group when statuses given without a category', () => {
    expect(buildFacetFilters({ statuses: ['live', 'upcoming'] })).toEqual([
      ['status:live', 'status:upcoming'],
    ]);
  });

  it('combines category + statuses as two AND-ed groups (category ORs AND status ORs)', () => {
    expect(buildFacetFilters({ category: 'Vehicles', statuses: ['live', 'upcoming'] })).toEqual([
      ['category:Vehicles', 'category:Cars'],
      ['status:live', 'status:upcoming'],
    ]);
  });

  it('ignores an empty statuses array (no status group)', () => {
    expect(buildFacetFilters({ statuses: [] })).toBeUndefined();
    expect(buildFacetFilters({ category: 'Appliances', statuses: [] })).toEqual([
      ['category:Appliances'],
    ]);
  });
});
