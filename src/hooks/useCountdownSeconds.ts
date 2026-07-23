// Perf Wave 3c (PF8) — per-card countdown driven by the ONE shared ticker.
//
// Replaces the per-card `setInterval` in DiscoveryFeedView (~80 concurrent
// timers with a full grid). Each card subscribes to the shared 1s ticker only
// while it's on screen and its lot hasn't ended; the setState bails out
// (React skips the re-render) whenever the displayed second didn't change.

import React, { useEffect, useRef, useState } from 'react';
import { subscribeToSharedTicker, secondsLeftAt } from '../utils/sharedTicker';
import { serverNow } from '../utils/serverTime';

/**
 * Seconds remaining until `endTime` (server-corrected clock), live-updating
 * once per second while `enabled`. Returns `null` when there is no deadline —
 * callers should hide their timer UI instead of showing a fabricated value.
 *
 * While `enabled` is false (card scrolled off screen) the subscription is
 * dropped; on re-enable the value re-syncs IMMEDIATELY from the clock (not on
 * the next tick), so a card scrolled back into view never shows a stale time.
 */
export function useCountdownSeconds(
  endTime: number | null | undefined,
  enabled: boolean = true
): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    secondsLeftAt(endTime, serverNow())
  );

  useEffect(() => {
    // Always re-sync on endTime/enabled changes (covers anti-snipe extensions
    // and IO re-entry). setState with an unchanged value is a no-op render.
    const initial = secondsLeftAt(endTime, serverNow());
    setSecondsLeft(initial);
    if (!enabled || !endTime || initial === null || initial <= 0) return;

    const unsubscribe = subscribeToSharedTicker((now) => {
      const left = secondsLeftAt(endTime, now);
      setSecondsLeft(left);
      if (left !== null && left <= 0) unsubscribe(); // ended — stop ticking
    });
    return unsubscribe;
  }, [endTime, enabled]);

  return secondsLeft;
}

// ---------------------------------------------------------------------------
// Shared IntersectionObserver — one observer instance for ALL subscribed
// elements (never one per card). Used to gate the countdown subscription to
// viewport cards only.
// ---------------------------------------------------------------------------

type VisibilityCallback = (visible: boolean) => void;

const visibilityCallbacks = new Map<Element, VisibilityCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null; // old WebViews / tests
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibilityCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      // Start ticking slightly before the card scrolls in so the first visible
      // frame already shows a fresh time.
      { rootMargin: '120px' }
    );
  }
  return sharedObserver;
}

/**
 * Whether `ref`'s element is (near-)visible in the viewport, via ONE shared
 * IntersectionObserver. Defaults to `true` (and stays true when IO is
 * unavailable) so the countdown fails towards ticking, never towards frozen.
 */
export function useIsOnScreen(ref: React.RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(true);
  // The IO callback closes over setVisible via a ref-stable wrapper so the
  // Map entry never goes stale across re-renders.
  const setVisibleRef = useRef(setVisible);
  setVisibleRef.current = setVisible;

  useEffect(() => {
    const el = ref.current;
    const observer = getSharedObserver();
    if (!el || !observer) return; // stay visible=true — safe fallback
    visibilityCallbacks.set(el, (v) => setVisibleRef.current(v));
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      visibilityCallbacks.delete(el);
    };
  }, [ref]);

  return visible;
}
