// Discover pagination (Slice 1) — per-card live-on-visible subscription.
//
// A paginated Discover card holds a one-time snapshot of its lot from the page
// query. To keep the price/bids/reserve fresh WITHOUT the removed broad
// `auctions` listener, each card opens a single-doc `onSnapshot` ONLY while it
// is on screen. Many visible cards of the SAME lot (e.g. a lot in both the
// live grid and a featured rail) must share ONE Firestore subscription, so the
// registry below is ref-counted and mirrors the shared-observer / shared-ticker
// shape used by `useCountdownSeconds` / `sharedTicker`.
//
// ADDITIVE: nothing consumes this yet (Task 5 wires it into DiscoveryFeedView).

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { AuctionItem } from '../types';
import { mapLiveAuctionFields } from '../utils/liveAuctionFields';

type LiveListener = (v: Partial<AuctionItem>) => void;

interface LiveEntry {
  unsub: () => void;
  refCount: number;
  last: Partial<AuctionItem> | null;
  listeners: Set<LiveListener>;
}

// Module-level registry: ONE `onSnapshot(doc(db,'auctions',id))` per lot id,
// shared by every subscribed listener. `last` caches the most recent mapped
// snapshot so a freshly-mounting card seeds immediately (no null flash while the
// first snapshot round-trips).
const registry = new Map<string, LiveEntry>();

/**
 * Subscribe to a lot's live single-doc snapshot. Opens the underlying
 * `onSnapshot` on the first subscriber for an id and tears it down when the last
 * one leaves. Returns an idempotent unsubscribe (double-call is a no-op).
 */
export function subscribeLiveAuction(id: string, listener: LiveListener): () => void {
  let entry = registry.get(id);
  if (!entry) {
    entry = { unsub: () => {}, refCount: 0, last: null, listeners: new Set() };
    registry.set(id, entry);
    entry.unsub = onSnapshot(
      doc(db, 'auctions', id),
      (snap) => {
        if (!snap.exists()) return;
        const live: Partial<AuctionItem> = { ...mapLiveAuctionFields(snap.data()), id };
        const e = registry.get(id);
        if (!e) return;
        e.last = live;
        // Snapshot the listener set: a listener may unsubscribe mid-notify.
        for (const l of Array.from(e.listeners)) {
          if (!e.listeners.has(l)) continue;
          try {
            l(live);
          } catch (err) {
            console.error('[useVisibleAuctionLive] listener threw:', err);
          }
        }
      },
      (err) => console.error('[useVisibleAuctionLive] snapshot error:', err)
    );
  }
  entry.listeners.add(listener);
  entry.refCount++;

  let active = true;
  return () => {
    if (!active) return; // idempotent — double-unsubscribe is a no-op
    active = false;
    const e = registry.get(id);
    if (!e) return;
    e.listeners.delete(listener);
    e.refCount--;
    if (e.refCount <= 0) {
      e.unsub();
      registry.delete(id);
    }
  };
}

/**
 * Live "fast fields" of a lot while a card is on screen. When `enabled` (card
 * visible) the card joins/opens the shared subscription and returns the latest
 * mapped `Partial<AuctionItem>`; when `enabled` is false the card unsubscribes
 * but the last-known value is retained (the caller can keep showing it, or fall
 * back to the paginated doc). Returns `null` until the first snapshot arrives.
 *
 * Leak-safe: an `active` flag drops any late snapshot after unmount / disable so
 * there is never a setState-after-unmount, and cleanup always unsubscribes
 * (ref-count decrement) so no subscription outlives its card.
 */
export function useVisibleAuctionLive(
  id: string,
  enabled: boolean
): Partial<AuctionItem> | null {
  const [live, setLive] = useState<Partial<AuctionItem> | null>(null);
  const prevIdRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !id) return;
    let active = true;

    // Seed synchronously from the shared cache so a card re-entering the
    // viewport shows fresh values immediately, not on the next snapshot.
    const existing = registry.get(id);
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      setLive(existing?.last ?? null); // id changed → clear prior lot's value (seed from cache if present)
    } else if (existing?.last) {
      setLive(existing.last);          // same id re-enable → unchanged behavior
    }

    const unsubscribe = subscribeLiveAuction(id, (v) => {
      if (active) setLive(v);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [id, enabled]);

  return live;
}
