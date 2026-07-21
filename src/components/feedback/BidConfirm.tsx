import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Pressable from './Pressable';
import { totalWithPremium } from '../../utils/bidMath';

type BidConfirmProps = {
  /** Amount pending confirmation; null = hidden. */
  amount: number | null;
  isAr: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  /** Positioning wrapper classes; defaults to an overlay anchored to the bid panel. */
  className?: string;
};

const AUTO_DISMISS_MS = 5000;

/**
 * Compact inline bid confirmation, anchored to the bid panel (not a modal).
 * Shows the bid amount + total incl. 5% premium, confirm/cancel Pressables,
 * and auto-dismisses after 5s of inaction. Ease-out motion only.
 */
export default function BidConfirm({
  amount,
  isAr,
  onConfirm,
  onCancel,
  className,
}: BidConfirmProps) {

  const firedRef = React.useRef(false);
  React.useEffect(() => { firedRef.current = false; }, [amount]);
  // Keep the latest onCancel in a ref so the 5s timer isn't reset by
  // parent re-renders (live rooms re-render every second).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (amount == null) return;
    const timer = setTimeout(() => onCancelRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
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
          className={
            className ??
            'absolute inset-0 z-40 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 shadow-2xl flex flex-col items-center justify-center gap-2 p-3'
          }
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <p className="text-xs font-black text-white text-center leading-snug">
            {isAr
              ? `تأكيد المزايدة: ${amount.toLocaleString()} د.أ`
              : `Confirm bid: ${amount.toLocaleString()} JD`}
          </p>
          <p className="text-[10px] text-zinc-300 font-bold text-center leading-snug">
            {isAr
              ? `المجموع عند الفوز ${totalWithPremium(amount).toLocaleString()} د.أ (شامل ٥٪)`
              : `Total if you win ${totalWithPremium(amount).toLocaleString()} JD (incl. 5%)`}
          </p>
          <div className="flex gap-2 w-full max-w-[280px] mt-1">
            <Pressable
              onClick={() => {
                if (firedRef.current) return; // exit-animation window: one shot only
                firedRef.current = true;
                onConfirm(amount);
              }}
              className="flex-1 py-2 rounded-xl bg-[#FF6B00] hover:bg-orange-600 text-white text-[11px] font-black shadow-md cursor-pointer"
            >
              {isAr ? 'زايد الآن' : 'Bid now'}
            </Pressable>
            <Pressable
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-[11px] font-black cursor-pointer"
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
