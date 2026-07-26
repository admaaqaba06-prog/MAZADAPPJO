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
});
