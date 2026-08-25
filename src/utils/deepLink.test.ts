import { describe, it, expect } from 'vitest';
import { buildAuctionUrl, parseAuctionIdFromSearch, parseAuctionIdFromPath } from './deepLink';

describe('buildAuctionUrl', () => {
  it('builds an origin-rooted /auction/:id url', () => {
    expect(buildAuctionUrl('auction-123', 'https://www.mazzado.com')).toBe(
      'https://www.mazzado.com/auction/auction-123',
    );
  });

  it('strips a trailing slash on the origin', () => {
    expect(buildAuctionUrl('a1', 'https://www.mazzado.com/')).toBe(
      'https://www.mazzado.com/auction/a1',
    );
  });

  it('url-encodes the id', () => {
    expect(buildAuctionUrl('a b', 'https://x.com')).toBe('https://x.com/auction/a%20b');
  });
});

describe('parseAuctionIdFromSearch (legacy back-compat)', () => {
  it('reads the auction id from a query string', () => {
    expect(parseAuctionIdFromSearch('?auction=auction-123')).toBe('auction-123');
  });

  it('returns null when absent', () => {
    expect(parseAuctionIdFromSearch('?foo=bar')).toBeNull();
    expect(parseAuctionIdFromSearch('')).toBeNull();
  });

  it('trims a padded auction id', () => {
    expect(parseAuctionIdFromSearch('?auction=%20abc%20')).toBe('abc');
  });

  it('returns null for a whitespace-only auction id', () => {
    expect(parseAuctionIdFromSearch('?auction=%20%20')).toBeNull();
  });
});

describe('parseAuctionIdFromPath', () => {
  it('reads the id from /auction/:id', () => {
    expect(parseAuctionIdFromPath('/auction/auction-123')).toBe('auction-123');
  });

  it('decodes and tolerates a trailing slash', () => {
    expect(parseAuctionIdFromPath('/auction/a%20b/')).toBe('a b');
  });

  it('returns null for a non-auction path', () => {
    expect(parseAuctionIdFromPath('/discover')).toBeNull();
    expect(parseAuctionIdFromPath('/')).toBeNull();
    expect(parseAuctionIdFromPath('')).toBeNull();
  });
});
