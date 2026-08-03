import { describe, expect, it } from 'vitest';
import { ADMIN_AUCTIONS_CAP, truncation, directoryPage, DIRECTORY_CHUNK } from './adminDirectory';

describe('ADMIN_AUCTIONS_CAP', () => {
  it('is 100, matching the admin auctions subscription', () => {
    expect(ADMIN_AUCTIONS_CAP).toBe(100);
  });
});

describe('truncation', () => {
  it('reports nothing hidden when the total fits inside the cap', () => {
    expect(truncation(40, 40)).toEqual({ truncated: false, hidden: 0 });
  });

  it('reports the hidden remainder when the total exceeds the cap', () => {
    // Production at the time of writing: 241 auctions, a 100-doc window.
    expect(truncation(100, 241)).toEqual({ truncated: true, hidden: 141 });
  });

  // The count is a separate, best-effort read that can fail or lag. An unknown
  // total must not render "141 hidden" from a stale number, nor claim
  // everything is visible when it might not be.
  it('reports nothing when the total is unknown', () => {
    expect(truncation(100, null)).toEqual({ truncated: false, hidden: 0 });
  });

  // A count that lags behind a deletion can read lower than what is loaded.
  // Never render a negative remainder.
  it('never reports a negative remainder', () => {
    expect(truncation(100, 80)).toEqual({ truncated: false, hidden: 0 });
  });

  it('is exact at the boundary', () => {
    expect(truncation(100, 101)).toEqual({ truncated: true, hidden: 1 });
    expect(truncation(100, 100)).toEqual({ truncated: false, hidden: 0 });
  });
});

describe('directoryPage', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ id: `a${i}` }));

  it('renders one chunk at a time', () => {
    const r = directoryPage(items, 1);
    expect(r.rows).toHaveLength(DIRECTORY_CHUNK);
    expect(r.hasMore).toBe(true);
    expect(r.remaining).toBe(60 - DIRECTORY_CHUNK);
  });

  it('grows by a chunk per page', () => {
    expect(directoryPage(items, 2).rows).toHaveLength(DIRECTORY_CHUNK * 2);
  });

  it('stops at the end and reports no more', () => {
    const r = directoryPage(items, 99);
    expect(r.rows).toHaveLength(60);
    expect(r.hasMore).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('handles an empty list', () => {
    expect(directoryPage([], 1)).toEqual({ rows: [], hasMore: false, remaining: 0 });
  });

  // Page 0 or negative would otherwise render nothing and look like an empty
  // directory rather than a paging bug.
  it('always renders at least one chunk', () => {
    expect(directoryPage(items, 0).rows).toHaveLength(DIRECTORY_CHUNK);
  });
});
