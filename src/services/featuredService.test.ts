import { describe, expect, it } from 'vitest';
import { featuredWrites } from './featuredService';

describe('featuredWrites', () => {
  it('writes a rank for each lot in the new order', () => {
    expect(featuredWrites([], ['a', 'b'])).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: 2 },
    ]);
  });

  it('deletes the field for a lot that was dropped', () => {
    expect(featuredWrites(['a', 'b'], ['a'])).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: null },
    ]);
  });

  // The point of rewriting every survivor rather than only the moved one: after
  // an unpin the remaining ranks must close up to 1..n with no holes.
  it('compacts survivors after a removal from the middle', () => {
    expect(featuredWrites(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { id: 'a', rank: 1 },
      { id: 'c', rank: 2 },
      { id: 'b', rank: null },
    ]);
  });

  it('rewrites every rank on a reorder', () => {
    expect(featuredWrites(['a', 'b'], ['b', 'a'])).toEqual([
      { id: 'b', rank: 1 },
      { id: 'a', rank: 2 },
    ]);
  });

  it('still writes the surviving rank when nothing changed', () => {
    expect(featuredWrites(['a'], ['a'])).toEqual([{ id: 'a', rank: 1 }]);
  });

  it('emits nothing at all when the featured set is empty on both sides', () => {
    expect(featuredWrites([], [])).toEqual([]);
  });

  // Unpinning the last featured lot must still emit its delete, or the field
  // would be stranded on the doc and the lot would stay at the head of the feed.
  it('emits the delete when the last featured lot is unpinned', () => {
    expect(featuredWrites(['a'], [])).toEqual([{ id: 'a', rank: null }]);
  });
});
