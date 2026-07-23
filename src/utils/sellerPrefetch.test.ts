import { describe, it, expect } from 'vitest';
import {
  SELLER_SYSTEM_SENTINEL,
  distinctSellerIds,
  nextMissingSellerIds,
} from './sellerPrefetch';

describe('distinctSellerIds', () => {
  it('dedupes and strips falsy ids', () => {
    expect(distinctSellerIds(['a', 'a', 'b', '', null, undefined, 'b'])).toEqual(['a', 'b']);
  });

  it('drops the seller-system sentinel', () => {
    expect(distinctSellerIds(['a', SELLER_SYSTEM_SENTINEL, 'b'])).toEqual(['a', 'b']);
  });

  it('returns an empty array for no real ids', () => {
    expect(distinctSellerIds([SELLER_SYSTEM_SENTINEL, null, ''])).toEqual([]);
  });
});

describe('nextMissingSellerIds (negative cache)', () => {
  const hasNone = () => false;

  it('returns ids that are neither cached nor already loaded', () => {
    const attempted = new Set<string>();
    expect(nextMissingSellerIds(['a', 'b'], attempted, hasNone)).toEqual(['a', 'b']);
  });

  it('excludes ids already in the negative cache (never re-fetches a genuine miss)', () => {
    const attempted = new Set<string>(['a']);
    expect(nextMissingSellerIds(['a', 'b'], attempted, hasNone)).toEqual(['b']);
  });

  it('excludes ids whose profile already loaded', () => {
    const attempted = new Set<string>();
    const hasProfile = (id: string) => id === 'a';
    expect(nextMissingSellerIds(['a', 'b'], attempted, hasProfile)).toEqual(['b']);
  });

  it('never returns the seller-system sentinel even if uncached', () => {
    const attempted = new Set<string>();
    expect(nextMissingSellerIds([SELLER_SYSTEM_SENTINEL, 'a'], attempted, hasNone)).toEqual(['a']);
  });

  it('returns empty when everything is cached or loaded', () => {
    const attempted = new Set<string>(['a']);
    const hasProfile = (id: string) => id === 'b';
    expect(nextMissingSellerIds(['a', 'b'], attempted, hasProfile)).toEqual([]);
  });
});
