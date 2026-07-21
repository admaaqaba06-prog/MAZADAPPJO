import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trophy } from 'lucide-react';
import Confetti from './Confetti';
import Pressable from './Pressable';
import { logAnalyticsEvent } from '../../services/analyticsService';
import { totalWithPremium } from '../../utils/bidMath';

/**
 * Total due on a win: hammer price + 5% buyer's premium. Single source of
 * truth is `totalWithPremium` in utils/bidMath; re-exported here for the
 * order/profile views that already import from feedback.
 */
export const winTotalDue = totalWithPremium;

type WinnableAuction = {
  id: string;
  title: string;
  status: string;
  currentBidderId: string | null;
  currentPrice: number;
};

export type WinInfo = {
  auctionId: string;
  auctionTitle: string;
  totalDue: number;
};

/**
 * Detects the *transition* of an auction's status into `'completed'` while
 * the current user is the highest bidder.
 *
 * Previous statuses are tracked per auction id in a ref map, and a win only
 * fires when a previously-seen non-`completed` status flips to `completed`.
 * First sight of an auction (mount, view re-entry, switching onto an
 * already-completed lot) only *seeds* the map — it never fires. This is what
 * keeps the celebration off when you land in a room whose auction already
 * ended, and off again if you leave and come back.
 */
export function useWinDetection(
  auctions: Array<WinnableAuction | null | undefined>,
  currentUserId: string | null | undefined,
  currentUserEmail?: string | null,
): { win: WinInfo | null; clearWin: () => void } {
  const [win, setWin] = useState<WinInfo | null>(null);
  const prevStatuses = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    for (const a of auctions) {
      if (!a) continue;
      const prev = prevStatuses.current.get(a.id);
      if (
        prev !== undefined &&
        prev !== 'completed' &&
        a.status === 'completed' &&
        currentUserId &&
        a.currentBidderId === currentUserId
      ) {
        const totalDue = totalWithPremium(a.currentPrice);
        setWin({
          auctionId: a.id,
          auctionTitle: a.title,
          totalDue,
        });
        // Funnel metric — fire-and-forget (service handles its own errors)
        logAnalyticsEvent('auction_won_seen', currentUserId, currentUserEmail ?? null, {
          auctionId: a.id,
          totalDue,
        });
      }
      prevStatuses.current.set(a.id, a.status);
    }
  }, [auctions, currentUserId, currentUserEmail]);

  return { win, clearWin: () => setWin(null) };
}

type WinCelebrationProps = {
  show: boolean;
  auctionTitle: string;
  totalDue: number;
  isAr: boolean;
  onPay: () => void;
  onClose: () => void;
};

/**
 * The peak moment: always-mounted win overlay. When `show` flips true it
 * fires the confetti burst and scales in a centered card with the total due
 * (incl. 5% buyer's premium) and a single obvious "Pay now" next step.
 *
 * Always keep this mounted (Confetti only bursts on a false→true `fire`
 * transition); when hidden it renders nothing that blocks the app.
 */
export default function WinCelebration({
  show,
  auctionTitle,
  totalDue,
  isAr,
  onPay,
  onClose,
}: WinCelebrationProps) {
  return (
    <>
      {/* Confetti stays mounted so the false→true flip triggers the burst. */}
      <Confetti fire={show} pieceCount={120} />
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md"
            dir={isAr ? 'rtl' : 'ltr'}
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative w-full max-w-sm bg-zinc-950/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8 text-center flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#F05123]/15 text-[#F05123] p-4 rounded-full mb-1">
                <Trophy className="w-12 h-12" />
              </div>

              <h2 className="text-2xl font-black text-white leading-snug">
                {isAr ? '🎉 مبروك! فزت بالمزاد' : '🎉 Congratulations — you won!'}
              </h2>

              <p className="text-zinc-300 text-sm font-bold leading-snug break-words max-w-full">
                {auctionTitle}
              </p>

              <div className="w-full bg-[#F05123]/10 rounded-2xl py-3 px-6 border border-[#F05123]/20 mt-1">
                <p className="text-lg font-black text-[#F05123]">
                  {isAr
                    ? `المجموع: ${totalDue.toLocaleString()} د.أ`
                    : `Total: ${totalDue.toLocaleString()} JOD`}
                </p>
                <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">
                  {isAr ? '(شامل عمولة المشتري ٥٪)' : "(incl. 5% buyer's premium)"}
                </p>
              </div>

              <Pressable
                onClick={onPay}
                className="mt-3 w-full py-3.5 rounded-xl bg-[#F05123] hover:bg-orange-600 text-white text-sm font-black shadow-lg cursor-pointer"
              >
                {isAr ? 'ادفع الآن' : 'Pay now'}
              </Pressable>

              <Pressable
                onClick={onClose}
                className="w-full py-2 rounded-xl text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'لاحقاً' : 'Later'}
              </Pressable>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
