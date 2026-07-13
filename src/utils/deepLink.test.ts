import { describe, it, expect } from 'vitest';
import { buildAuctionUrl, parseAuctionIdFromSearch } from './deepLink';

describe('buildAuctionUrl', () => {
  it('builds an origin-rooted url with the auction query param', () => {
    expect(buildAuctionUrl('auction-123', 'https://mazadjo.app')).toBe(
      'https://mazadjo.app/?auction=auction-123',
    );
  });

  it('strips a trailing slash on the origin', () => {
    expect(buildAuctionUrl('a1', 'https://mazadjo.app/')).toBe(
      'https://mazadjo.app/?auction=a1',
    );
  });

  it('url-encodes the id', () => {
    expect(buildAuctionUrl('a b', 'https://x.com')).toBe(
      'https://x.com/?auction=a%20b',
    );
  });
});

describe('parseAuctionIdFromSearch', () => {
  it('reads the auction id from a query string', () => {
    expect(parseAuctionIdFromSearch('?auction=auction-123')).toBe('auction-123');
  });

  it('returns null when absent', () => {
    expect(parseAuctionIdFromSearch('?foo=bar')).toBeNull();
    expect(parseAuctionIdFromSearch('')).toBeNull();
  });
});
