// Perf Wave 3c (PF2 part 3) — reel-list virtualization window math.
//
// MobileLiveAuctionLayout used to mount one <MobileAuctionReel> per live/
// upcoming lot (~80 components, each with ~15 hooks) even though only the
// active reel and its immediate neighbours are ever visible or interactive.
// The list now mounts REAL reels only inside the activeIndex ±1 window and
// renders inert, fixed-height spacer <div>s everywhere else, so scroll-snap
// geometry (index = scrollTop / clientHeight) is byte-identical while the
// off-screen React tree disappears.
//
// Invariant guarded by tests: the legacy media-preload set
// {activeIndex, activeIndex + 1} (`shouldLoad`) is ALWAYS a subset of the
// mounted window, so virtualization can never unmount a reel that is loading
// media, counting down, or holding bid-panel state.

/**
 * Anchor for the mounted window. `findIndex` returns -1 when the active lot
 * is not in the list (deep link to a lot that just closed, admin deletion);
 * anchor at 0 so the top of the room is mounted, matching the pre-existing
 * scroll position for that case. Out-of-range (lot removed from the tail)
 * clamps to the last reel.
 */
export function clampActiveIndex(activeIndex: number, length: number): number {
  if (length <= 0) return 0;
  if (activeIndex < 0) return 0;
  if (activeIndex >= length) return length - 1;
  return activeIndex;
}

/**
 * Should the reel at `index` be MOUNTED as a real component?
 * `activeIndex` may be a raw findIndex result (-1 allowed).
 */
export function isReelMounted(
  index: number,
  activeIndex: number,
  length: number,
  radius: number = 1
): boolean {
  if (length <= 0 || index < 0 || index >= length) return false;
  const anchor = clampActiveIndex(activeIndex, length);
  return Math.abs(index - anchor) <= radius;
}

/** Convenience/testing view of the whole mounted window. */
export function mountedReelIndices(
  activeIndex: number,
  length: number,
  radius: number = 1
): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    if (isReelMounted(i, activeIndex, length, radius)) out.push(i);
  }
  return out;
}
