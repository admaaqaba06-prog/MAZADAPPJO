import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { AuctionMediaItem } from '../../utils/auctionMedia';

/* ======================================================================
   Wave 2 (live-room UX): swipeable media gallery shared by the mobile
   reel and the desktop media column.

   - Items come pre-ordered from getAuctionMedia (video first, then images).
   - Horizontal swipe (touch + pointer drag) and, on desktop, arrow buttons
     and an optional thumbnail strip. Dots indicator + "2/4" counter chip.
   - RTL-aware: the track inherits the document direction, so in Arabic the
     next item slides in from the LEFT and the finger swipes RIGHT — the
     natural RTL carousel direction.

   CRITICAL gesture rule (mobile): the horizontal gallery swipe must never
   fight the vertical reel snap-scroll. Two mechanisms combined:
     1. `touch-action: pan-y` on the viewport — the BROWSER owns vertical
        panning natively (it scrolls the reel container and cancels our
        pointer stream), so a vertical flick is never interpreted here.
     2. JS axis-lock — we only claim a gesture as horizontal once intent is
        unambiguous (|dx| > |dy| AND |dx| past an 8px threshold). Until
        then no drag state changes and the pointer is not captured. A
        gesture that locks vertical first is permanently ignored.

   Video behavior mirrors the reel's original element: loop, playsInline,
   preload="metadata"; plays only while (isActive && isPlaying) AND the
   video is the visible gallery item; muted synced imperatively. The parent
   only mounts this component when the reel `shouldLoad`s, preserving the
   two-reel media budget.

   Parents should key this component by auction id so the index resets when
   the lot changes.
   ====================================================================== */

const AXIS_LOCK_PX = 8; // px of clear horizontal intent before we claim the gesture
const ADVANCE_FRACTION = 0.18; // fraction of viewport width to commit a slide

export interface MediaGalleryProps {
  items: AuctionMediaItem[];
  /** Reel/lot is the currently active one (video only plays when active). */
  isActive?: boolean;
  isPlaying?: boolean;
  isMuted?: boolean;
  isAr?: boolean;
  /** Desktop: chevron arrow buttons over the media. */
  showArrows?: boolean;
  /** Desktop: small clickable thumbnail strip under the media. */
  showThumbnails?: boolean;
  /** Extra classes for the root (the root is a flex column). */
  className?: string;
  /** Optional forwarded ref to the inner <video> (desktop LiveStreamView drives it). */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  /** Tap on the video item (play/pause toggle in both layouts). */
  onVideoClick?: () => void;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  items,
  isActive = false,
  isPlaying = false,
  isMuted = true,
  isAr = false,
  showArrows = false,
  showThumbnails = false,
  className = '',
  videoRef,
  onVideoClick,
}) => {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const dragPxRef = useRef(0);
  const didDragRef = useRef(false);
  const gestureRef = useRef<{ id: number; startX: number; startY: number; axis: 'h' | 'v' | null } | null>(null);

  // In RTL the track flows right-to-left, so advancing slides the track +X;
  // in LTR it slides -X. One sign flips every offset/threshold computation.
  const dirSign = isAr ? 1 : -1;

  const clampIndex = (i: number) => Math.max(0, Math.min(count - 1, i));

  // Keep the index valid if the items list shrinks (e.g. doc update).
  useEffect(() => {
    setIndex(i => Math.max(0, Math.min(count - 1, i)));
  }, [count]);

  const currentIsVideo = items[index]?.type === 'video';

  // Attach both the internal ref and the (optional) forwarded one.
  const setVideoEl = (el: HTMLVideoElement | null) => {
    internalVideoRef.current = el;
    if (videoRef) (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
  };

  // Play only while this lot is active+playing AND the video item is visible.
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;
    if (isActive && isPlaying && currentIsVideo) {
      video.play().catch(err => {
        console.warn('Playback prevented or interrupted:', err);
      });
    } else {
      video.pause();
    }
  }, [isActive, isPlaying, currentIsVideo]);

  // Sync muted imperatively (same as the original reel video element).
  useEffect(() => {
    if (internalVideoRef.current) {
      internalVideoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const applyDrag = (rawDx: number) => {
    // Rubber-band when dragging past either end.
    const travel = rawDx * dirSign; // >0 means "towards next"
    const atStart = index === 0 && travel < 0;
    const atEnd = index === count - 1 && travel > 0;
    const dx = atStart || atEnd ? rawDx / 3 : rawDx;
    dragPxRef.current = dx;
    setDragPx(dx);
  };

  const endDrag = (commit: boolean) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    const dx = dragPxRef.current;
    dragPxRef.current = 0;
    setDragging(false);
    setDragPx(0);
    if (!g || g.axis !== 'h' || !commit) return;
    const width = viewportRef.current?.clientWidth || 1;
    const travel = dx * dirSign; // >0 = advance
    if (travel > width * ADVANCE_FRACTION) setIndex(i => clampIndex(i + 1));
    else if (travel < -width * ADVANCE_FRACTION) setIndex(i => clampIndex(i - 1));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (count < 2) return;
    didDragRef.current = false;
    gestureRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, axis: null };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.axis === null) {
      // Axis-lock: do NOTHING until intent is clear. Vertical wins ties so the
      // reel snap-scroll is never hijacked by a diagonal move.
      if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > AXIS_LOCK_PX) {
        g.axis = 'v'; // browser handles it via touch-action: pan-y
        return;
      }
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > AXIS_LOCK_PX) {
        g.axis = 'h';
        didDragRef.current = true;
        setDragging(true);
        try {
          viewportRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* capture can fail on exotic browsers — drag still works uncaptured */
        }
      } else {
        return; // still ambiguous
      }
    }

    if (g.axis !== 'h') return;
    applyDrag(dx);
  };

  const onPointerUp = () => endDrag(true);
  // pointercancel fires when the browser claims the gesture for vertical
  // scrolling (touch-action: pan-y) — just reset, never commit a slide.
  const onPointerCancel = () => endDrag(false);

  // A completed horizontal drag must not fall through as a click
  // (e.g. toggling video play/pause at the end of a swipe).
  const onClickCapture = (e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
    }
  };

  // Arrows navigate by VISUAL side (left arrow shows the item to the left).
  const goVisual = (side: 'left' | 'right') => {
    const step = (side === 'left' ? -1 : 1) * (isAr ? -1 : 1);
    setIndex(i => clampIndex(i + step));
  };

  if (count === 0) {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="relative flex-1 min-h-0 bg-zinc-900" />
      </div>
    );
  }

  const canGoVisualLeft = isAr ? index < count - 1 : index > 0;
  const canGoVisualRight = isAr ? index > 0 : index < count - 1;

  return (
    <div className={`flex flex-col min-h-0 ${className}`} id="media-gallery-root">
      {/* Viewport — touch-action pan-y hands vertical panning to the browser */}
      <div
        ref={viewportRef}
        className="relative flex-1 min-h-0 overflow-hidden touch-pan-y select-none bg-black"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        id="media-gallery-viewport"
      >
        {/* Track: inherits document direction; slides by whole viewports */}
        <div
          className="flex h-full w-full"
          style={{
            transform: `translateX(calc(${dirSign * index * 100}% + ${dragPx}px))`,
            transition: dragging ? 'none' : 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
        >
          {items.map((item, i) => (
            <div key={item.url} className="w-full h-full shrink-0 relative">
              {item.type === 'video' ? (
                <video
                  ref={setVideoEl}
                  src={item.url}
                  loop
                  muted={isMuted}
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                  onClick={onVideoClick}
                />
              ) : (
                <img
                  src={item.url}
                  alt=""
                  width={800}
                  height={1200}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          ))}
        </div>

        {/* Desktop arrows */}
        {showArrows && count > 1 && (
          <>
            {canGoVisualLeft && (
              <button
                type="button"
                onClick={() => goVisual('left')}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 transition-colors cursor-pointer"
                aria-label={isAr ? 'الصورة التالية' : 'Previous media'}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {canGoVisualRight && (
              <button
                type="button"
                onClick={() => goVisual('right')}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 transition-colors cursor-pointer"
                aria-label={isAr ? 'الصورة السابقة' : 'Next media'}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </>
        )}

        {/* Counter chip + dots (only for real galleries) */}
        {count > 1 && (
          <>
            <span className="absolute top-2 end-2 z-20 bg-black/45 backdrop-blur-md border border-white/15 text-white text-[10px] font-black px-2 py-0.5 rounded-full pointer-events-none font-mono">
              {index + 1}/{count}
            </span>
            <div className="absolute bottom-2 inset-x-0 z-20 flex justify-center gap-1.5 pointer-events-none">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`pointer-events-auto w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                    i === index ? 'bg-white scale-125' : 'bg-white/40'
                  }`}
                  aria-label={`${isAr ? 'الوسائط' : 'Media'} ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Desktop thumbnail strip */}
      {showThumbnails && count > 1 && (
        <div className="flex gap-1.5 pt-2 justify-center shrink-0" id="media-gallery-thumbs">
          {items.map((item, i) => (
            <button
              key={item.url}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative w-11 h-11 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                i === index ? 'border-[#E85D04] opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              aria-label={`${isAr ? 'الوسائط' : 'Media'} ${i + 1}`}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <Play className="w-4 h-4 text-white fill-white" />
                </div>
              ) : (
                <img
                  src={item.url}
                  alt=""
                  width={88}
                  height={88}
                  loading="lazy"
                  draggable={false}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaGallery;
