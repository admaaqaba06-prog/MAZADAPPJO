import { describe, expect, it } from 'vitest';
import { algoliaHitToAuction, buildFacetFilters, SEARCH_CATEGORY_MATCHES } from './searchMap';

describe('SEARCH_CATEGORY_MATCHES', () => {
  it('mirrors the DiscoveryFeedView chip → canonical alias lists (Cars→Vehicles)', () => {
    // Keep in sync with `categoriesList` in DiscoveryFeedView.tsx.
    expect(SEARCH_CATEGORY_MATCHES).toEqual({
      Cars: ['Cars', 'Vehicles'],
      'Real Estate': ['Real Estate'],
      Phones: ['Phones', 'Electronics'],
      Watches: ['Watches'],
      Electronics: ['Electronics'],
      Appliances: ['Appliances'],
      'Home & Furniture': ['Home & Furniture'],
    });
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

  it('builds a single-value OR group for a chip with one match', () => {
    expect(buildFacetFilters({ category: 'Watches' })).toEqual([['category:Watches']]);
  });

  it('builds an OR group over the full canonical alias list (Cars→Vehicles)', () => {
    expect(buildFacetFilters({ category: 'Cars' })).toEqual([
      ['category:Cars', 'category:Vehicles'],
    ]);
  });

  it('builds an OR group for Phones (Phones + Electronics aliases)', () => {
    expect(buildFacetFilters({ category: 'Phones' })).toEqual([
      ['category:Phones', 'category:Electronics'],
    ]);
  });

  it('builds a status-only OR group when statuses given without a category', () => {
    expect(buildFacetFilters({ statuses: ['live', 'upcoming'] })).toEqual([
      ['status:live', 'status:upcoming'],
    ]);
  });

  it('combines category + statuses as two AND-ed groups (category ORs AND status ORs)', () => {
    expect(buildFacetFilters({ category: 'Cars', statuses: ['live', 'upcoming'] })).toEqual([
      ['category:Cars', 'category:Vehicles'],
      ['status:live', 'status:upcoming'],
    ]);
  });

  it('ignores an empty statuses array (no status group)', () => {
    expect(buildFacetFilters({ statuses: [] })).toBeUndefined();
    expect(buildFacetFilters({ category: 'Watches', statuses: [] })).toEqual([
      ['category:Watches'],
    ]);
  });
});
