import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Play, Maximize2, X, Volume2, VolumeX, ImageOff } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import type { AuctionMediaItem } from '../../utils/auctionMedia';

/* ======================================================================
   Wave 2 (live-room UX): swipeable media gallery shared by the mobile
   reel and the desktop media column.

   - Items come pre-ordered from getAuctionMedia (video first, then images).
   - Horizontal swipe (touch + pointer drag) and, on desktop, arrow buttons
     and an optional thumbnail strip. Dots indicator + "2/4" counter chip.
   - RTL-aware and self-sufficient: the root sets its own `dir` from the
     `isAr` prop (rather than inheriting `document.dir`, which is only ever
     set by LandingView and can be stale/unset on a deep link into the live
     room or a language toggle while inside it). That keeps the actual flex
     flow direction in sync with the `dirSign` swipe math below — in Arabic
     the next item slides in from the LEFT and the finger swipes RIGHT, the
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
  /**
   * OPT-IN (default false). Renders a small ⤢ expand button on the media that
   * opens a fullscreen overlay of the CURRENT item (image fit-to-screen, or the
   * video with a sound toggle). Closes on ✕, backdrop tap, or Esc. Existing
   * desktop callers omit this, so their render is byte-unchanged.
   */
  expandable?: boolean;
  /**
   * OPT-IN (default false). When true AND the current item is an image AND the
   * gallery isActive, auto-advances to the next media every ~4s. Pauses
   * PERMANENTLY once the user manually swipes/interacts. NEVER auto-advances
   * when the user prefers reduced motion.
   */
  autoAdvancePhotos?: boolean;
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
  expandable = false,
  autoAdvancePhotos = false,
}) => {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Opt-in fullscreen overlay + photo auto-advance (both default OFF so every
  // existing caller renders exactly as before).
  const [expanded, setExpanded] = useState(false);
  const [overlayMuted, setOverlayMuted] = useState(false);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);
  const reduceMotion = useReducedMotion();

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

  const currentIsImage = items[index]?.type === 'image';

  // A real manual gesture (swipe / arrow / dot) permanently stops photo
  // auto-advance so we never yank the media out from under the user.
  const markManualInteraction = () => {
    if (autoAdvancePhotos && !autoAdvancePaused) setAutoAdvancePaused(true);
  };

  // OPT-IN photo auto-advance. Only runs while the prop is on, the lot is
  // active, the visible item is an image, the overlay is closed, the user hasn't
  // taken over, and — critically — reduced-motion is NOT requested. Depending on
  // `index` re-arms the 4s timer per item and naturally stops on a video item.
  useEffect(() => {
    if (
      !autoAdvancePhotos ||
      !isActive ||
      !currentIsImage ||
      autoAdvancePaused ||
      expanded ||
      reduceMotion ||
      count < 2
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setIndex(i => (i + 1) % count);
    }, 4000);
    return () => window.clearInterval(id);
  }, [autoAdvancePhotos, isActive, currentIsImage, autoAdvancePaused, expanded, reduceMotion, count, index]);

  // Esc closes the fullscreen overlay.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

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
        markManualInteraction();
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
    markManualInteraction();
    const step = (side === 'left' ? -1 : 1) * (isAr ? -1 : 1);
    setIndex(i => clampIndex(i + step));
  };

  // No media at all (no video, no photos): render a branded "coming soon"
  // placeholder instead of a dead black player. Fills the same area the
  // gallery would occupy (flex-1 within the parent's container/aspect).
  if (count === 0) {
    return (
      <div className={`flex flex-col min-h-0 ${className}`} dir={isAr ? 'rtl' : 'ltr'}>
        <div
          className="relative flex-1 min-h-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-orange-50 to-orange-100/60 text-center px-6"
          id="media-gallery-empty"
        >
          <div className="w-16 h-16 rounded-2xl bg-surface-raised/70 border border-[#FF6B00]/20 flex items-center justify-center shadow-sm">
            <ImageOff className="w-7 h-7 text-[#FF6B00]" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-black text-fg leading-tight">
              {isAr ? 'الصور قريباً' : 'Photos coming soon'}
            </span>
            <span className="text-[11px] font-semibold text-[#FF6B00]/80 leading-tight">
              {isAr ? 'Photos coming soon' : 'الصور قريباً'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const canGoVisualLeft = isAr ? index < count - 1 : index > 0;
  const canGoVisualRight = isAr ? index > 0 : index < count - 1;

  const currentItem = items[index];

  const overlay =
    expandable && expanded && currentItem && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
            dir={isAr ? 'rtl' : 'ltr'}
            onClick={() => setExpanded(false)}
            id="media-gallery-overlay"
          >
            {/* Close (✕) */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setExpanded(false);
              }}
              className="absolute top-4 end-4 z-10 w-10 h-10 rounded-full bg-surface-raised/10 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-surface-raised/20 transition-colors cursor-pointer"
              aria-label={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>

            {currentItem.type === 'video' ? (
              <>
                <video
                  src={currentItem.url}
                  autoPlay
                  loop
                  muted={overlayMuted}
                  playsInline
                  controls={false}
                  className="max-w-full max-h-full object-contain"
                  onClick={e => e.stopPropagation()}
                />
                {/* Sound toggle */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setOverlayMuted(m => !m);
                  }}
                  className="absolute bottom-4 end-4 z-10 w-10 h-10 rounded-full bg-surface-raised/10 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-surface-raised/20 transition-colors cursor-pointer"
                  aria-label={
                    overlayMuted ? (isAr ? 'تشغيل الصوت' : 'Unmute') : isAr ? 'كتم الصوت' : 'Mute'
                  }
                >
                  {overlayMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </>
            ) : (
              <img
                src={currentItem.url}
                alt=""
                className="max-w-full max-h-full object-contain"
                draggable={false}
                referrerPolicy="no-referrer"
                onClick={e => e.stopPropagation()}
              />
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className={`flex flex-col min-h-0 ${className}`}
      dir={isAr ? 'rtl' : 'ltr'}
      id="media-gallery-root"
    >
      {overlay}
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
                /* `contain`, not `cover`. Lot photos measured 0.82 → 1.65 in
                   aspect ratio — a 2× spread — so `cover` cropped each one by a
                   different amount, and a 1.65 landscape lost ~55% of its width
                   on the 3:4 mobile stage and ~66% on the desktop 9/16 one. On a
                   site whose promise is «صور حقيقية», the cropped-away part can
                   be the flaw a bidder needed to see. The stage is a fixed ratio
                   so every lot occupies the same box; the photo is letterboxed
                   inside it rather than trimmed to fit.

                   VIDEO deliberately keeps `cover` (below/above): reel clips are
                   shot vertically for this stage, so they fill it, and letter-
                   boxing them would put bars around the one item that is already
                   the right shape. */
                <img
                  src={item.url}
                  alt=""
                  width={800}
                  height={1200}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="w-full h-full object-contain"
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

        {/* Opt-in expand button (⤢) — opens the fullscreen overlay. */}
        {expandable && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute top-2 start-2 z-20 w-8 h-8 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 transition-colors cursor-pointer"
            aria-label={isAr ? 'تكبير' : 'Expand'}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
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
                  onClick={() => {
                    markManualInteraction();
                    setIndex(i);
                  }}
                  className={`pointer-events-auto w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                    i === index ? 'bg-surface-raised scale-125' : 'bg-surface-raised/40'
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
