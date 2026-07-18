import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

const FLAG_KEY = 'mazad_first_bid_done';
const DONE_EVENT = 'mazad:first-bid-done';

/** Persist the flag and notify any mounted coach instances (both layouts). */
export function markFirstBidDone() {
  try {
    localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* storage unavailable — coach just stays session-local */
  }
  window.dispatchEvent(new Event(DONE_EVENT));
}

export function isFirstBidDone(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return true; // storage unavailable — don't nag
  }
}

type FirstBidCoachProps = {
  /** Parent-side gate: active member, auction open, reel active, etc. */
  show: boolean;
  isAr: boolean;
};

/**
 * One-time dismissible coach tooltip shown near the bid controls for an active
 * member who has never bid. Cleared on dismiss AND on the first successful bid
 * (via markFirstBidDone()).
 */
export default function FirstBidCoach({ show, isAr }: FirstBidCoachProps) {
  const [done, setDone] = useState(() => isFirstBidDone());

  useEffect(() => {
    const onDone = () => setDone(true);
    window.addEventListener(DONE_EVENT, onDone);
    return () => window.removeEventListener(DONE_EVENT, onDone);
  }, []);

  const visible = show && !done;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full mb-2"
          style={{ direction: isAr ? 'rtl' : 'ltr' }}
          id="first-bid-coach"
        >
          <div className="flex items-start gap-2 bg-white/95 border border-[#FF6B00]/40 shadow-[0_4px_16px_rgba(0,0,0,0.15)] rounded-xl px-3 py-2.5">
            <p className="flex-1 text-[11px] font-bold text-gray-800 leading-snug">
              {isAr
                ? '👆 زايد بضغطة — ما بتدفع شي إلا إذا فزت'
                : '👆 Tap to bid — you pay nothing unless you win'}
            </p>
            <button
              type="button"
              onClick={markFirstBidDone}
              aria-label={isAr ? 'إغلاق' : 'Dismiss'}
              className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Little pointer toward the bid controls below */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white/95 border-b border-r border-[#FF6B00]/40 rotate-45" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
