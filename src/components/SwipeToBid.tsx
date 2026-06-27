import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronsRight } from 'lucide-react';

interface SwipeToBidProps {
  amount: number;
  onSwipeSuccess: () => void;
  disabled?: boolean;
  language?: 'en' | 'ar';
}

export const SwipeToBid: React.FC<SwipeToBidProps> = ({
  amount,
  onSwipeSuccess,
  disabled = false,
  language = 'en',
}) => {
  const isAr = language === 'ar';
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

  const startDrag = (e: React.PointerEvent) => {
    if (disabled || isSwiped) return;
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

  return (
    <div
      ref={containerRef}
      className={`w-full h-12 bg-gradient-to-r from-[#E85D04] to-[#F37021] rounded-full relative flex items-center p-1 overflow-hidden select-none touch-none shadow-md ${
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
              <span>{isAr ? 'اسحب للتأكيد' : 'SWIPE TO BID'}</span>
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
