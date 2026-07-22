import { describe, it, expect } from 'vitest';
import {
  beginTapGesture,
  trackTapGesture,
  isTapGesture,
  TAP_MAX_TRAVEL_PX,
} from './SwipeToBid';

/** Run a pointer path (down at the first point, then moves) through the tracker. */
const gestureFor = (points: Array<[number, number]>) => {
  const [[x0, y0], ...moves] = points;
  const g = beginTapGesture(x0, y0);
  for (const [x, y] of moves) trackTapGesture(g, x, y);
  return g;
};

describe('SwipeToBid tap classifier (max travel, not net travel)', () => {
  it('classifies a motionless press-and-release as a tap', () => {
    expect(isTapGesture(gestureFor([[100, 200]]))).toBe(true);
  });

  it('tolerates sub-threshold jitter (touch taps are never pixel-perfect)', () => {
    const g = gestureFor([[100, 200], [104, 203], [101, 199], [100, 200]]);
    expect(isTapGesture(g)).toBe(true);
  });

  it('a cancelled swipe — drag out and return to the origin — is a drag, never a tap', () => {
    // This is the bug case: net down→up travel is 0px, but the pointer
    // travelled far past the threshold mid-gesture.
    const g = gestureFor([[100, 200], [150, 200], [220, 202], [150, 201], [100, 200]]);
    expect(isTapGesture(g)).toBe(false);
  });

  it('a completed swipe (released far from the origin) is a drag', () => {
    const g = gestureFor([[100, 200], [180, 200], [260, 200]]);
    expect(isTapGesture(g)).toBe(false);
  });

  it('travel exactly at the threshold is a drag; just under it is a tap', () => {
    const at = gestureFor([[0, 0], [TAP_MAX_TRAVEL_PX, 0], [0, 0]]);
    expect(isTapGesture(at)).toBe(false);

    const under = gestureFor([[0, 0], [TAP_MAX_TRAVEL_PX - 1, 0], [0, 0]]);
    expect(isTapGesture(under)).toBe(true);
  });

  it('measures travel radially (vertical scroll-ish movement also disqualifies the tap)', () => {
    const g = gestureFor([[100, 200], [101, 240], [100, 201]]);
    expect(isTapGesture(g)).toBe(false);
  });
});
