import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Pressable from './Pressable';
import { totalWithPremium } from '../../utils/bidMath';
import { translations } from '../../utils/translations';

type BidConfirmProps = {
  /** Amount pending confirmation; null = hidden. */
  amount: number | null;
  isAr: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  /** Positioning wrapper classes; defaults to an overlay anchored to the bid panel. */
  className?: string;
  /**
   * The price moved up during the confirm window and `amount` is the fresh
   * minimum — swap the copy to "price moved — new min is X. Bid that?" so the
   * user knowingly re-confirms the higher amount instead of a stale rejection.
   */
  priceMoved?: boolean;
  /**
   * Colour scheme. Defaults to `dark` (black/blur + white text), which is what
   * the video-overlay surfaces want. `light` is for consumers that anchor this
   * inside a WHITE card — the desktop bid panel — where the dark treatment
   * reads as broken. Only the palette differs; layout and behaviour are shared.
   */
  variant?: 'dark' | 'light';
};

/**
 * Per-variant palettes. `wrapper` is the default overlay styling (still
 * overridable via the `className` prop, which wins for both variants).
 */
const VARIANTS = {
  dark: {
    wrapper:
      'absolute inset-0 z-40 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 shadow-2xl flex flex-col items-center justify-center gap-2 p-3',
    title: 'text-white',
    titleMoved: 'text-amber-400',
    total: 'text-zinc-300',
    binding: 'text-amber-400',
    confirm: 'bg-[#FF6B00] hover:bg-orange-600 text-white shadow-md',
    cancel: 'bg-white/10 border border-white/15 text-white',
  },
  light: {
    wrapper:
      'absolute inset-0 z-40 rounded-2xl bg-white/95 backdrop-blur-sm border border-orange-200 shadow-xl flex flex-col items-center justify-center gap-2 p-3',
    title: 'text-gray-900',
    titleMoved: 'text-amber-600',
    total: 'text-gray-500',
    binding: 'text-amber-600',
    confirm: 'bg-[#E85D04] hover:bg-orange-600 text-white shadow-md',
    cancel: 'bg-gray-100 border border-gray-200 text-gray-700',
  },
} as const;

const AUTO_DISMISS_MS = 10000;
/** Countdown granularity for the pause-aware auto-dismiss timer. */
const TICK_MS = 100;

/**
 * Compact inline bid confirmation, anchored to the bid panel (not a modal).
 * Shows the bid amount + total incl. 5% premium, confirm/cancel Pressables,
 * and auto-dismisses after 10s of inaction. The countdown PAUSES while the
 * pointer hovers the dialog (resumes where it left off on leave), so a user
 * reading the copy never has it vanish under their cursor. Ease-out motion only.
 *
 * `variant` picks the palette: `dark` (default) for video-overlay surfaces,
 * `light` for consumers anchored inside a white card. See VARIANTS above.
 */
export default function BidConfirm({
  amount,
  isAr,
  onConfirm,
  onCancel,
  className,
  priceMoved = false,
  variant = 'dark',
}: BidConfirmProps) {

  const t = translations[isAr ? 'ar' : 'en'];
  const v = VARIANTS[variant];
  const firedRef = React.useRef(false);
  React.useEffect(() => { firedRef.current = false; }, [amount]);
  // Keep the latest onCancel in a ref so the auto-dismiss timer isn't reset by
  // parent re-renders (live rooms re-render every second).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Hover pause: while the pointer is over the dialog the countdown stops
  // ticking (it is NOT reset). Held in a ref so re-renders don't restart the
  // interval. The dialog remounts per amount (key={amount}), so a stale
  // hovered=true from a departing element is cleared when the amount changes —
  // the countdown can never wedge in a permanently-paused state.
  const hoveredRef = useRef(false);

  useEffect(() => {
    if (amount == null) return;
    hoveredRef.current = false; // fresh confirm: never inherit a stale pause
    let remaining = AUTO_DISMISS_MS;
    const interval = setInterval(() => {
      if (hoveredRef.current) return; // paused — hold remaining time as-is
      remaining -= TICK_MS;
      if (remaining <= 0) {
        clearInterval(interval);
        onCancelRef.current();
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [amount]);

  return (
    <AnimatePresence>
      {amount != null && (
        <motion.div
          key={amount}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onMouseEnter={() => { hoveredRef.current = true; }}
          onMouseLeave={() => { hoveredRef.current = false; }}
          className={className ?? v.wrapper}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <p className={`text-xs font-black text-center leading-snug ${priceMoved ? v.titleMoved : v.title}`}>
            {priceMoved
              ? t.priceMovedTitle.replace('{amount}', amount.toLocaleString())
              : isAr
                ? `تأكيد المزايدة: ${amount.toLocaleString()} د.أ`
                : `Confirm bid: ${amount.toLocaleString()} JD`}
          </p>
          <p className={`text-[10px] font-bold text-center leading-snug ${v.total}`}>
            {isAr
              ? `المجموع عند الفوز ${totalWithPremium(amount).toLocaleString()} د.أ (شامل ٥٪)`
              : `Total if you win ${totalWithPremium(amount).toLocaleString()} JD (incl. 5%)`}
          </p>
          {/* E4 — just-in-time binding reminder (copy only, no flow change) */}
          <p className={`text-[9.5px] font-black text-center leading-snug ${v.binding}`}>
            {isAr ? 'هذه المزايدة مُلزِمة.' : 'This bid is binding.'}
          </p>
          <div className="flex gap-2 w-full max-w-[280px] mt-1">
            <Pressable
              onClick={() => {
                if (firedRef.current) return; // exit-animation window: one shot only
                firedRef.current = true;
                onConfirm(amount);
              }}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black cursor-pointer ${v.confirm}`}
            >
              {priceMoved
                ? t.priceMovedConfirm.replace('{amount}', amount.toLocaleString())
                : isAr ? 'زايد الآن' : 'Bid now'}
            </Pressable>
            <Pressable
              onClick={onCancel}
              className={`px-4 py-2 rounded-xl text-[11px] font-black cursor-pointer ${v.cancel}`}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Pressable>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Small "you're winning" pill that pops over the bid panel on a successful bid.
 * Scale+fade in, held by the parent (~1.2s), fades out. Pointer-events pass through.
 */
export function WinningPill({ show, isAr }: { show: boolean; isAr: boolean }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-emerald-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-xl whitespace-nowrap"
            dir={isAr ? 'rtl' : 'ltr'}
          >
            {isAr ? '🔥 أنت الأعلى الآن!' : "🔥 You're winning!"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
