// Discover Slice 1b (Task 5a-2) — single-doc FULL auction subscription.
//
// The bidding room needs the active lot's complete object (static + live +
// timestamp/fils fields), which it historically pulled out of AppContext's broad
// `auctions` array (`liveAuctions.find(...)`). To let realtime read-cost scale
// with attention instead of inventory, Task 5 gives the room its OWN per-lot
// listener so it no longer depends on all ~80 lots streaming. `useAuctionDoc`
// opens ONE `onSnapshot(doc(db,'auctions',id))`, maps it through the SAME pure
// mapper the broad feed uses (`mapAuctionDocFull`, tested), and resolves the
// video URL through the SAME resolver the broad path used so the room's lot video
// still plays.
//
// ADDITIVE: nothing consumes this yet (Task 5a-3 wires it into LiveStreamView /
// ReelsDesktopRightPanel). The broad listener is untouched.
//
// VIDEO PARITY: how the broad path makes a lot's video playable, replicated here.
// `mapAuctionDocFull` sets `videoUrl` to the raw `data.videoUrl` (network URL,
// `blob:` URL, or ''). AppContext then runs a three-branch resolution keyed by a
// module-level `{rawUrl, resolvedUrl}` cache:
//   1. cache hit (same rawUrl) → use the cached resolved URL, no async work;
//   2. direct network URL (non-blob, non-empty) → already playable, cache it as
//      its own resolution, no async work (this is the case for MOST lots — a
//      Firebase Storage download URL);
//   3. otherwise (`blob:`/empty) → resolve asynchronously via
//      `resolveVideoUrl(id, rawUrl, category)` (IndexedDB blob → object URL, else
//      '') and patch state when it lands.
// This hook reuses `resolveVideoUrl` from `utils/videoDb` VERBATIM (it is already
// exported and shared — no AppContext extraction needed) so resolution behavior
// is byte-identical. The `{rawUrl, resolvedUrl}` cache below is intentionally
// hook-local: it is a pure perf optimisation (avoid redundant IndexedDB reads),
// not correctness, and it becomes the room's sole cache once Task 5b deletes the
// broad path — so sharing AppContext's private Map would only couple two modules
// that are about to diverge. The pure branch selection is extracted to
// `resolveCachedVideo` and unit-tested; the subscription (Firestore) is not.

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { AuctionItem } from '../types';
import { mapAuctionDocFull } from '../utils/auctionDocMap';
import { resolveVideoUrl } from '../utils/videoDb';
import { resolveCachedVideo } from '../utils/auctionVideoResolve';

type FullListener = (v: AuctionItem) => void;

interface FullEntry {
  unsub: () => void;
  refCount: number;
  last: AuctionItem | null;
  // Raw `data.videoUrl` of the LATEST snapshot. Guards the async video patch: an
  // in-flight resolution is dropped if a newer snapshot has since changed the raw
  // video (so a stale resolved URL never clobbers fresher state).
  lastRaw: string;
  listeners: Set<FullListener>;
}

// Module-level registry: ONE `onSnapshot(doc(db,'auctions',id))` per lot id,
// shared by every room surface subscribed to that id (LiveStreamView and
// ReelsDesktopRightPanel can both mount for the same active lot). `last` caches
// the most recent fully-mapped snapshot so a freshly-mounting surface seeds
// immediately (no null flash / no re-fetch). Mirrors `useVisibleAuctionLive`.
const registry = new Map<string, FullEntry>();

// Hook-local resolved-video cache (see the VIDEO PARITY note above). Same shape
// and same three-branch semantics as AppContext's private `videoUrlCache`, but a
// separate instance on purpose.
const videoUrlCache = new Map<string, { rawUrl: string; resolvedUrl: string }>();

function notify(e: FullEntry, item: AuctionItem): void {
  e.last = item;
  // Snapshot the listener set: a listener may unsubscribe mid-notify.
  for (const l of Array.from(e.listeners)) {
    if (!e.listeners.has(l)) continue;
    try {
      l(item);
    } catch (err) {
      console.error('[useAuctionDoc] listener threw:', err);
    }
  }
}

/**
 * Subscribe to a single auction doc's full-object snapshot. Opens the underlying
 * `onSnapshot` on the first subscriber for an id and tears it down when the last
 * one leaves. Returns an idempotent unsubscribe (double-call is a no-op).
 */
export function subscribeAuctionDoc(id: string, listener: FullListener): () => void {
  let entry = registry.get(id);
  if (!entry) {
    entry = { unsub: () => {}, refCount: 0, last: null, lastRaw: '', listeners: new Set() };
    registry.set(id, entry);
    entry.unsub = onSnapshot(
      doc(db, 'auctions', id),
      (snap) => {
        if (!snap.exists()) return;
        const e = registry.get(id);
        if (!e) return;
        const data = snap.data() as any;
        const item = mapAuctionDocFull(snap.id, data);
        const rawVideoUrl = data.videoUrl || '';
        e.lastRaw = rawVideoUrl;

        const decision = resolveCachedVideo(rawVideoUrl, videoUrlCache.get(id));
        item.videoUrl = decision.videoUrl;
        if (decision.cacheDirect) {
          videoUrlCache.set(id, { rawUrl: rawVideoUrl, resolvedUrl: rawVideoUrl });
        }

        // Emit the mapped item synchronously (matches the broad path: state
        // updates immediately for price/bids/clock; video may patch in after).
        notify(e, item);

        if (decision.needsAsync) {
          resolveVideoUrl(id, rawVideoUrl, data.category || 'Luxury')
            .then((resolvedUrl) => {
              videoUrlCache.set(id, { rawUrl: rawVideoUrl, resolvedUrl });
              const cur = registry.get(id);
              // Drop the patch if a newer snapshot changed the raw video, or the
              // resolution is a no-op (raw already displayed).
              if (!cur || !cur.last || cur.lastRaw !== rawVideoUrl) return;
              if (cur.last.videoUrl === resolvedUrl) return;
              notify(cur, { ...cur.last, videoUrl: resolvedUrl });
            })
            .catch((err) => console.error('[useAuctionDoc] video resolution failed:', err));
        }
      },
      (err) => console.error('[useAuctionDoc] snapshot error:', err)
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
 * The full `AuctionItem` for a single lot, sourced from its OWN single-doc
 * `onSnapshot` (not the broad `auctions` array). Returns `null` while `id` is
 * null and until the first snapshot arrives. The lot's video URL is resolved the
 * same way the broad path resolved it, so the room's video plays.
 *
 * Leak-safe: an `active` flag drops any late snapshot after unmount / id change
 * so there is never a setState-after-unmount; cleanup always unsubscribes
 * (ref-count decrement), and the shared registry entry is deleted at refCount 0
 * so no Firestore subscription outlives its last room surface.
 */
export function useAuctionDoc(id: string | null): AuctionItem | null {
  const [item, setItem] = useState<AuctionItem | null>(null);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) {
      prevIdRef.current = null;
      setItem(null);
      return;
    }
    let active = true;

    // Seed synchronously from the shared cache so a surface joining an
    // already-subscribed lot shows the last-known object immediately.
    const existing = registry.get(id);
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      setItem(existing?.last ?? null); // id changed → clear prior lot (seed from cache if present)
    } else if (existing?.last) {
      setItem(existing.last);
    }

    const unsubscribe = subscribeAuctionDoc(id, (v) => {
      if (active) setItem(v);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [id]);

  return item;
}
