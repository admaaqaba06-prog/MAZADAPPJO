import { describe, it, expect } from 'vitest';
// Cross-boundary import: the CLIENT predicate that consumes these records. It is
// imported here so the "awaiting first bid" cases assert the real consumer's
// verdict on a real record, not a restatement of the predicate's logic.
import { isAwaitingFirstBidDoc } from '../src/utils/auctionPhase';
const { isIndexable, buildAlgoliaRecord, resolveEndMs } = require('./algoliaSync');

describe('isIndexable', () => {
  it('is true for any non-simulated auction regardless of status (incl. closed)', () => {
    expect(isIndexable({ status: 'live' })).toBe(true);
    expect(isIndexable({ status: 'upcoming' })).toBe(true);
    expect(isIndexable({ status: 'live', isSimulated: false })).toBe(true);
    // Closed lots stay indexed so the admin lookup can find them (public search
    // filters to live/upcoming client-side).
    expect(isIndexable({ status: 'completed' })).toBe(true);
    expect(isIndexable({ status: 'ended' })).toBe(true);
    expect(isIndexable({ status: 'reserve_not_met' })).toBe(true);
  });
  it('is false for a simulated lot regardless of status', () => {
    expect(isIndexable({ status: 'live', isSimulated: true })).toBe(false);
    expect(isIndexable({ status: 'upcoming', isSimulated: true })).toBe(false);
    expect(isIndexable({ status: 'completed', isSimulated: true })).toBe(false);
  });
  it('is false / null-safe for missing data', () => {
    expect(isIndexable(null)).toBe(false);
    expect(isIndexable(undefined)).toBe(false);
  });
  it('is true for a doc with no status (any real auction is indexable)', () => {
    expect(isIndexable({})).toBe(true);
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
      startMode: 'scheduled',
      currentPriceFils: 125500,
      endTime: 1_800_000_000_000,
      sellerName: 'MJ',
      thumbnailUrl: 'https://x/y.jpg',
      auctionNumber: 42,
      currentBidderName: 'Bidder Bob',
    });
    expect(rec).toEqual({
      objectID: 'auc1',
      id: 'auc1',
      title: 'Rolex',
      description: 'nice watch',
      category: 'watches',
      condition: 'used',
      status: 'live',
      startMode: 'scheduled',
      currentPrice: 125.5,
      endTime: 1_800_000_000_000,
      endsAt: 1_800_000_000_000,
      sellerName: 'MJ',
      thumbnailUrl: 'https://x/y.jpg',
      auctionNumber: 42,
      currentBidderName: 'Bidder Bob',
    });
  });

  it('falls back to currentPrice (JOD) when currentPriceFils is absent', () => {
    const rec = buildAlgoliaRecord('a', { status: 'upcoming', currentPrice: 42 });
    expect(rec.currentPrice).toBe(42);
  });

  it('defaults missing fields (empty strings, price 0, endTime 0, startMode null)', () => {
    const rec = buildAlgoliaRecord('a', { status: 'live' });
    expect(rec).toEqual({
      objectID: 'a',
      id: 'a',
      title: '',
      description: '',
      category: '',
      condition: '',
      status: 'live',
      startMode: null,
      currentPrice: 0,
      endTime: 0,
      endsAt: 0,
      sellerName: '',
      thumbnailUrl: '',
      auctionNumber: null,
      currentBidderName: '',
    });
  });

  it('maps auctionNumber and currentBidderName; defaults them to null / empty when absent', () => {
    const withFields = buildAlgoliaRecord('a', { status: 'completed', auctionNumber: 7, currentBidderName: 'Winner W' });
    expect(withFields.auctionNumber).toBe(7);
    expect(withFields.currentBidderName).toBe('Winner W');
    const without = buildAlgoliaRecord('b', { status: 'live' });
    expect(without.auctionNumber).toBe(null);
    expect(without.currentBidderName).toBe('');
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

describe('buildAlgoliaRecord — startMode (awaiting-first-bid in search)', () => {
  // An awaiting first_bid lot: live and accepting bids, but the duration clock
  // has not started, so the doc carries NO endsAt/endTime and no bids.
  const awaitingDoc = { status: 'live', title: 'Clockless lot', startMode: 'first_bid', totalBids: 0 };
  // The same lot after its first bid: the server (applyBidWrites) stamps both
  // endTime (number) and endsAt (Timestamp) to now + duration.
  const bidOnDoc = {
    status: 'live',
    title: 'Clock started',
    startMode: 'first_bid',
    totalBids: 1,
    endTime: 1_800_000_000_000,
    endsAt: { toMillis: () => 1_800_000_000_000 },
  };

  it('indexes startMode for an awaiting first_bid lot, with endTime/endsAt 0', () => {
    const rec = buildAlgoliaRecord('a', awaitingDoc);
    expect(rec.startMode).toBe('first_bid');
    expect(rec.endTime).toBe(0);
    expect(rec.endsAt).toBe(0);
  });

  it('indexes startMode for a first_bid lot that already has a bid, with a real endTime', () => {
    const rec = buildAlgoliaRecord('a', bidOnDoc);
    expect(rec.startMode).toBe('first_bid');
    expect(rec.endTime).toBe(1_800_000_000_000);
    expect(rec.endsAt).toBe(1_800_000_000_000);
  });

  it('carries a scheduled lot through as scheduled, never first_bid', () => {
    const rec = buildAlgoliaRecord('a', { status: 'upcoming', startMode: 'scheduled' });
    expect(rec.startMode).toBe('scheduled');
    expect(rec.startMode).not.toBe('first_bid');
  });

  it('defaults a doc with no startMode to null, never the string first_bid', () => {
    const rec = buildAlgoliaRecord('a', { status: 'live' });
    expect(rec.startMode).toBe(null);
    expect(rec.startMode).not.toBe('first_bid');
  });

  // End-to-end across the functions/ → src/ boundary: the record this indexer
  // produces is fed to the CLIENT predicate that decides whether search renders
  // "Awaiting first bid" or a countdown. Before startMode was indexed the
  // awaiting case returned false here and the client fabricated `now + 1h`.
  it('makes the client isAwaitingFirstBidDoc predicate true for an awaiting record', () => {
    expect(isAwaitingFirstBidDoc(buildAlgoliaRecord('a', awaitingDoc))).toBe(true);
  });

  it('keeps the client predicate false for a first_bid record that has a bid', () => {
    expect(isAwaitingFirstBidDoc(buildAlgoliaRecord('a', bidOnDoc))).toBe(false);
  });

  it('keeps the client predicate false for scheduled and startMode-less records', () => {
    expect(isAwaitingFirstBidDoc(buildAlgoliaRecord('a', { status: 'upcoming', startMode: 'scheduled' }))).toBe(false);
    expect(isAwaitingFirstBidDoc(buildAlgoliaRecord('a', { status: 'live' }))).toBe(false);
  });
});
