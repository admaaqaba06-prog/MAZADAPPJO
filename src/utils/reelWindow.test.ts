import { describe, it, expect } from 'vitest';
import { clampActiveIndex, isReelMounted, mountedReelIndices } from './reelWindow';

describe('clampActiveIndex', () => {
  it('returns 0 for a not-found active id (findIndex -1)', () => {
    expect(clampActiveIndex(-1, 10)).toBe(0);
  });

  it('passes a valid index through', () => {
    expect(clampActiveIndex(0, 10)).toBe(0);
    expect(clampActiveIndex(4, 10)).toBe(4);
    expect(clampActiveIndex(9, 10)).toBe(9);
  });

  it('clamps an out-of-range index to the last item', () => {
    // e.g. the active lot was removed from the tail of the list mid-session
    expect(clampActiveIndex(10, 10)).toBe(9);
    expect(clampActiveIndex(500, 10)).toBe(9);
  });

  it('returns 0 for an empty list', () => {
    expect(clampActiveIndex(-1, 0)).toBe(0);
    expect(clampActiveIndex(3, 0)).toBe(0);
  });
});

describe('isReelMounted (activeIndex ±1 window)', () => {
  it('mounts exactly active-1, active, active+1 in the middle of the list', () => {
    const mounted = [0, 1, 2, 3, 4, 5, 6].filter(i => isReelMounted(i, 3, 7));
    expect(mounted).toEqual([2, 3, 4]);
  });

  it('mounts 0 and 1 when the first reel is active (no negative neighbour)', () => {
    const mounted = [0, 1, 2, 3].filter(i => isReelMounted(i, 0, 4));
    expect(mounted).toEqual([0, 1]);
  });

  it('mounts last-1 and last when the last reel is active', () => {
    const mounted = [0, 1, 2, 3].filter(i => isReelMounted(i, 3, 4));
    expect(mounted).toEqual([2, 3]);
  });

  it('single-item list mounts its only reel', () => {
    expect(isReelMounted(0, 0, 1)).toBe(true);
  });

  it('always contains the legacy shouldLoad set {active, active+1}', () => {
    // shouldLoad (media preload) is a strict subset of the mounted window for
    // every activeIndex, so virtualization can never unmount a loading reel.
    for (const len of [1, 2, 3, 10, 80]) {
      for (let active = 0; active < len; active++) {
        expect(isReelMounted(active, active, len)).toBe(true);
        if (active + 1 < len) {
          expect(isReelMounted(active + 1, active, len)).toBe(true);
        }
      }
    }
  });

  it('supports a wider radius', () => {
    const mounted = [0, 1, 2, 3, 4, 5, 6].filter(i => isReelMounted(i, 3, 7, 2));
    expect(mounted).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('mountedReelIndices', () => {
  it('returns the same window as isReelMounted', () => {
    expect(mountedReelIndices(3, 7)).toEqual([2, 3, 4]);
    expect(mountedReelIndices(0, 4)).toEqual([0, 1]);
    expect(mountedReelIndices(3, 4)).toEqual([2, 3]);
  });

  it('handles a not-found activeIndex (-1) by anchoring at 0', () => {
    expect(mountedReelIndices(-1, 5)).toEqual([0, 1]);
  });

  it('returns [] for an empty list', () => {
    expect(mountedReelIndices(0, 0)).toEqual([]);
    expect(mountedReelIndices(-1, 0)).toEqual([]);
  });
});
