import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronsRight } from 'lucide-react';

interface SwipeToBidProps {
  amount: number;
  onSwipeSuccess: () => void;
  /**
   * Click/keyboard fallback: fired on a plain CLICK on the track (a gesture
   * whose pointer never strayed past the tap threshold — never during a drag,
   * including a drag returned to its origin) and on Enter/Space. Consumers
   * wire this to their bid-CONFIRM flow (not a direct bid), so tapping is the
   * accessible equivalent of the quick-bid tier buttons.
   */
  onTap?: () => void;
  disabled?: boolean;
  language?: 'en' | 'ar';
  /**
   * Bilingual prompt shown on the track before a swipe/tap. Defaults to the
   * mobile swipe wording ("SWIPE TO BID" / "اسحب للتأكيد"). Desktop reel usage
   * passes a click-oriented label since there the affordance is a click, not a
   * swipe. The "BID CONFIRMED!" success state is unaffected.
   */
  label?: { en: string; ar: string };
}

/** Peak pointer travel below this is a tap; at/above it is a drag. */
export const TAP_MAX_TRAVEL_PX = 10;

/**
 * Tap-vs-drag tracking for one pointer gesture. Classification uses the MAX
 * travel from the down point at any moment — not the net down→up distance —
 * so a cancelled swipe (drag the handle out, drag back, release at the origin)
 * is a drag, never a tap, even though it ends with ~0 net travel.
 */
export type TapGesture = { x: number; y: number; maxTravel: number };

export const beginTapGesture = (x: number, y: number): TapGesture => ({
  x,
  y,
  maxTravel: 0,
});

/** Fold a pointer position into the gesture's peak travel. */
export const trackTapGesture = (g: TapGesture, x: number, y: number): void => {
  const travel = Math.hypot(x - g.x, y - g.y);
  if (travel > g.maxTravel) g.maxTravel = travel;
};

/** True only if the pointer NEVER strayed ≥ TAP_MAX_TRAVEL_PX during the gesture. */
export const isTapGesture = (g: TapGesture): boolean =>
  g.maxTravel < TAP_MAX_TRAVEL_PX;

export const SwipeToBid: React.FC<SwipeToBidProps> = ({
  amount,
  onSwipeSuccess,
  onTap,
  disabled = false,
  language = 'en',
  label,
}) => {
  const isAr = language === 'ar';
  const promptText = label
    ? (isAr ? label.ar : label.en)
    : (isAr ? 'اسحب للتأكيد' : 'SWIPE TO BID');
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const [dragX, setDragX] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Maximum drag width based on container
  const [maxDrag, setMaxDrag] = useState(150);

  useEffect(() => {
    if (containerRef.current && handleRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const handleWidth = handleRef.current.offsetWidth;
      setMaxDrag(containerWidth - handleWidth - 8); // 8px for margins
    }
  }, [containerRef.current, handleRef.current, amount]);

  // Tap-vs-drag tracking for the click fallback (armed in onTrackPointerDown,
  // resolved in onTrackPointerUp below).
  const tapGestureRef = useRef<TapGesture | null>(null);

  const startDrag = (e: React.PointerEvent) => {
    if (disabled || isSwiped) return;
    // Drop any stale tap tracking from a previous gesture (e.g. a pointerup
    // the track never saw). This same pointerdown then bubbles to the track,
    // which arms a FRESH tracker for this gesture — classified by max travel,
    // so once the handle is dragged past the threshold it can never end as a tap.
    tapGestureRef.current = null;
    setIsDragging(true);
    if (handleRef.current) {
      handleRef.current.setPointerCapture(e.pointerId);
    }
  };

  const onDrag = (e: React.PointerEvent) => {
    if (!isDragging || disabled || isSwiped) return;
    
    // We adjust drag coordinate based on RTL/LTR
    const movementX = e.movementX;
    setDragX((prev) => {
      const delta = isAr ? -movementX : movementX;
      let nextX = prev + delta;
      if (nextX < 0) nextX = 0;
      if (nextX > maxDrag) {
        nextX = maxDrag;
      }
      return nextX;
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (handleRef.current) {
      handleRef.current.releasePointerCapture(e.pointerId);
    }

    // If dragged past 80% of track width, trigger success!
    if (dragX >= maxDrag * 0.80) {
      setDragX(maxDrag);
      setIsSwiped(true);
      // satisfying trigger callback
      setTimeout(() => {
        onSwipeSuccess();
        // Reset after trigger so users can bid again
        setIsSwiped(false);
        setDragX(0);
      }, 350);
    } else {
      // snap back
      setDragX(0);
    }
  };

  const progressPercent = maxDrag > 0 ? (dragX / maxDrag) * 100 : 0;

  // ── Click fallback (a11y + non-drag input) ────────────────────────────────
  // A plain click anywhere on the track opens the confirm flow via onTap.
  // Tap vs drag is decided by the MAX pointer travel during the gesture (see
  // TapGesture): a drag that ever moved the pointer past the threshold — even
  // one dragged back and released at its origin (a cancelled swipe) — can
  // therefore NEVER also fire the tap. No double-fire with onSwipeSuccess, no
  // spurious confirm after an intentionally aborted swipe.
  //
  // The handle's pointer events (incl. while pointer-captured during a drag)
  // bubble to the track, so the tracker (tapGestureRef, declared above) observes
  // the whole handle drag too.
  const fireTap = () => {
    if (disabled || isSwiped) return;
    onTap?.();
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    tapGestureRef.current = beginTapGesture(e.clientX, e.clientY);
  };

  const onTrackPointerMove = (e: React.PointerEvent) => {
    const g = tapGestureRef.current;
    if (g) trackTapGesture(g, e.clientX, e.clientY);
  };

  const onTrackPointerUp = (e: React.PointerEvent) => {
    const g = tapGestureRef.current;
    tapGestureRef.current = null;
    if (!g) return;
    trackTapGesture(g, e.clientX, e.clientY);
    if (isTapGesture(g)) fireTap();
  };

  const onTrackKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); // Space must not scroll the page
      fireTap();
    }
  };

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={
        isAr
          ? `زايد ${amount.toLocaleString()} دينار — اسحب أو اضغط للتأكيد`
          : `Bid ${amount.toLocaleString()} JOD — swipe or press to confirm`
      }
      onPointerDown={onTrackPointerDown}
      onPointerMove={onTrackPointerMove}
      onPointerUp={onTrackPointerUp}
      onKeyDown={onTrackKeyDown}
      className={`w-full h-12 bg-gradient-to-r from-[#E85D04] to-[#F37021] rounded-full relative flex items-center p-1 overflow-hidden select-none touch-none shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85D04] ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="swipe-to-bid-container"
    >
      {/* Background slide track color (darker orange behind handle) */}
      <div
        className="absolute top-0 bottom-0 bg-black/15 transition-all duration-75"
        style={{
          width: `${progressPercent}%`,
          left: isAr ? 'auto' : 0,
          right: isAr ? 0 : 'auto',
        }}
      />

      {/* Slide Text Indicator prompt */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center px-12 z-10">
        <span className="text-[11px] font-extrabold tracking-wider text-white uppercase filter drop-shadow flex items-center gap-1.5">
          {isSwiped ? (
            <>
              <Check className="w-3.5 h-3.5 text-white stroke-[3] animate-bounce" />
              <span>{isAr ? 'تم تأكيد المزايدة!' : 'BID CONFIRMED!'}</span>
            </>
          ) : (
            <>
              <span>{promptText}</span>
              <span className="font-black text-white/95">
                {amount.toLocaleString()} JOD
              </span>
              <span className="opacity-70 text-[9px] flex items-center gap-0.5">
                <span className="animate-pulse">›</span>
                <span className="animate-pulse delay-75">›</span>
                <span className="animate-pulse delay-150">›</span>
              </span>
            </>
          )}
        </span>
      </div>

      {/* Swipe handle button */}
      <div
        ref={handleRef}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        className={`w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md active:scale-95 transition-transform relative z-20 cursor-grab ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
        style={{
          transform: `translateX(${isAr ? -dragX : dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        id="swipe-bid-handle"
      >
        <ChevronsRight className="w-5 h-5 text-[#E85D04] stroke-[2.5]" />
      </div>
    </div>
  );
};
