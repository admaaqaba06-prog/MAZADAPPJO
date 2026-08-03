import { describe, expect, it } from 'vitest';
import { FEATURED_CAP, canPin, pin, unpin, reorder, ranksFor } from './featuredRank';

describe('FEATURED_CAP', () => {
  it('is 6', () => {
    expect(FEATURED_CAP).toBe(6);
  });
});

describe('canPin', () => {
  it('allows a pin below the cap', () => {
    expect(canPin([])).toBe(true);
    expect(canPin(['a', 'b', 'c', 'd', 'e'])).toBe(true);
  });

  it('refuses at the cap', () => {
    expect(canPin(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false);
  });
});

describe('pin', () => {
  it('appends to the end so an existing order is undisturbed', () => {
    expect(pin(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('refuses past the cap, returning the list unchanged', () => {
    const full = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(pin(full, 'g')).toEqual(full);
  });

  // Double-tap, or a second admin tab. Pinning twice must not create a
  // duplicate that would then claim two ranks.
  it('is idempotent for an already-pinned id', () => {
    expect(pin(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = ['a'];
    pin(input, 'b');
    expect(input).toEqual(['a']);
  });
});

describe('unpin', () => {
  it('removes the id and closes the gap', () => {
    expect(unpin(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('is a no-op for an unknown id', () => {
    expect(unpin(['a', 'b'], 'zz')).toEqual(['a', 'b']);
  });
});

describe('reorder', () => {
  it('accepts a permutation of the same set', () => {
    expect(reorder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  // A drag that races an unpin from another tab would otherwise write ranks for
  // a lot that is no longer featured, or drop one that still is.
  it('rejects a next list that is not the same set, keeping the current order', () => {
    expect(reorder(['a', 'b', 'c'], ['a', 'b'])).toEqual(['a', 'b', 'c']);
    expect(reorder(['a', 'b'], ['a', 'b', 'zz'])).toEqual(['a', 'b']);
  });

  // Same length, same size once de-duplicated, but not the same SET. A naive
  // length+Set check would let this through and drop 'b' from the feed.
  it('rejects a same-length list that swaps one id for another', () => {
    expect(reorder(['a', 'b'], ['a', 'zz'])).toEqual(['a', 'b']);
  });
});

describe('ranksFor', () => {
  it('numbers from 1 contiguously', () => {
    expect(ranksFor(['x', 'y', 'z'])).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('is empty for an empty list', () => {
    expect(ranksFor([])).toEqual({});
  });
});
