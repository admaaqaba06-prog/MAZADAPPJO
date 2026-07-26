import { describe, it, expect } from 'vitest';
const { isIndexable, buildAlgoliaRecord, resolveEndMs } = require('./algoliaSync');

describe('isIndexable', () => {
  it('is true only for public, non-simulated live/upcoming lots', () => {
    expect(isIndexable({ status: 'live' })).toBe(true);
    expect(isIndexable({ status: 'upcoming' })).toBe(true);
    expect(isIndexable({ status: 'live', isSimulated: false })).toBe(true);
  });
  it('is false for a simulated lot even when live/upcoming', () => {
    expect(isIndexable({ status: 'live', isSimulated: true })).toBe(false);
    expect(isIndexable({ status: 'upcoming', isSimulated: true })).toBe(false);
  });
  it('is false for non-public / non-searchable statuses', () => {
    for (const status of ['processing', 'rejected', 'ended', 'completed', 'reserve_not_met', 'active']) {
      expect(isIndexable({ status })).toBe(false);
    }
  });
  it('is false / null-safe for missing data or missing status', () => {
    expect(isIndexable(null)).toBe(false);
    expect(isIndexable(undefined)).toBe(false);
    expect(isIndexable({})).toBe(false);
  });
});

describe('resolveEndMs', () => {
  it('prefers a numeric endTime', () => {
    expect(resolveEndMs({ endTime: 1234, endsAt: { toMillis: () => 9999 } })).toBe(1234);
  });
  it('falls back to an endsAt Firestore Timestamp (.toMillis)', () => {
    expect(resolveEndMs({ endsAt: { toMillis: () => 5000 } })).toBe(5000);
  });
  it('reads an endsAt { seconds } shape', () => {
    expect(resolveEndMs({ endsAt: { seconds: 7 } })).toBe(7000);
  });
  it('parses an ISO endsAt string', () => {
    expect(resolveEndMs({ endsAt: '2026-07-26T00:00:00.000Z' })).toBe(Date.parse('2026-07-26T00:00:00.000Z'));
  });
  it('returns 0 when no end time is present', () => {
    expect(resolveEndMs({})).toBe(0);
  });
});

describe('buildAlgoliaRecord', () => {
  it('maps the full field set with fils→units price and a sortable epoch-ms endTime', () => {
    const rec = buildAlgoliaRecord('auc1', {
      title: 'Rolex',
      description: 'nice watch',
      category: 'watches',
      condition: 'used',
      status: 'live',
      currentPriceFils: 125500,
      endTime: 1_800_000_000_000,
      sellerName: 'MJ',
      thumbnailUrl: 'https://x/y.jpg',
    });
    expect(rec).toEqual({
      objectID: 'auc1',
      id: 'auc1',
      title: 'Rolex',
      description: 'nice watch',
      category: 'watches',
      condition: 'used',
      status: 'live',
      currentPrice: 125.5,
      endTime: 1_800_000_000_000,
      endsAt: 1_800_000_000_000,
      sellerName: 'MJ',
      thumbnailUrl: 'https://x/y.jpg',
    });
  });

  it('falls back to currentPrice (JOD) when currentPriceFils is absent', () => {
    const rec = buildAlgoliaRecord('a', { status: 'upcoming', currentPrice: 42 });
    expect(rec.currentPrice).toBe(42);
  });

  it('defaults missing fields (empty strings, price 0, endTime 0)', () => {
    const rec = buildAlgoliaRecord('a', { status: 'live' });
    expect(rec).toEqual({
      objectID: 'a',
      id: 'a',
      title: '',
      description: '',
      category: '',
      condition: '',
      status: 'live',
      currentPrice: 0,
      endTime: 0,
      endsAt: 0,
      sellerName: '',
      thumbnailUrl: '',
    });
  });

  it('resolves endTime from an endsAt Timestamp when the numeric endTime is absent', () => {
    const rec = buildAlgoliaRecord('a', { status: 'live', endsAt: { toMillis: () => 1_700_000_000_000 } });
    expect(rec.endTime).toBe(1_700_000_000_000);
    expect(rec.endsAt).toBe(1_700_000_000_000);
  });

  it('is null-safe on empty data (objectID/id still set from the passed id)', () => {
    const rec = buildAlgoliaRecord('only-id', {});
    expect(rec.objectID).toBe('only-id');
    expect(rec.id).toBe('only-id');
    expect(rec.currentPrice).toBe(0);
  });
});
