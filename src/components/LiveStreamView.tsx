import React, { useState, useEffect, useRef } from 'react';
import { useApp, useChat } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderLock,
  Trophy,
  X
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { MobileAuctionView } from './MobileAuctionView';
import { DesktopLiveAuctionLayout } from './DesktopLiveAuctionLayout';
import { minNextBid, totalWithPremium, isViewerWinner } from '../utils/bidMath';
import { isEffectivelyBlocked } from '../utils/banStatus';
import { translations } from '../utils/translations';
import { formatMoney } from '../utils/formatMoney';
import { effectivePrice, optimisticResolved, type OptimisticBid } from '../utils/optimisticBid';
import { serverNow, isAuctionFinished } from '../utils/serverTime';
import { buildAuctionUrl } from '../utils/deepLink';
import { isDesktopWidth } from '../utils/shellBreakpoint';
import { WinCelebration, useWinDetection } from './feedback';
import { resumeAudio, playTick, playFinish } from '../utils/auctioneerAudio';
import { useAuctionDocState } from '../hooks/useAuctionDoc';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useMyAuctionLots } from '../hooks/useMyAuctionLots';

/* ======================================================================
   ISOLATED COUNTDOWN LAYER (Wave 4)
   ----------------------------------------------------------------------
   The final-countdown clock ticks once per second. Keeping its state
   (`secondsRemaining`) in LiveStreamView re-rendered the ENTIRE live room —
   both heavy layouts and every reel — every second. This child owns the 1s
   interval, the per-second `secondsRemaining` state, the tick/finish audio +
   snipe-window haptics, and the full-screen countdown/winner overlay. A tick
   now re-renders ONLY this small component; the parent room stays still.
   (Desktop's inline HH:MM:SS clock lives inside DesktopLiveAuctionLayout for
   the same reason, so the parent holds no per-second state at all.)
   ====================================================================== */
interface AuctionCountdownLayerProps {
  activeAuction: any;
  activePrice: number;
  isAr: boolean;
  isOverlayDismissed: boolean;
  onDismiss: () => void;
}

const AuctionCountdownLayer: React.FC<AuctionCountdownLayerProps> = ({
  activeAuction,
  activePrice,
  isAr,
  isOverlayDismissed,
  onDismiss,
}) => {
  const { bids, currentUser, orders, setActiveView, setGlobalSelectedOrderId } = useApp();

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const prevSecondsRemaining = useRef<number | null>(null);

  // 1s countdown tick — only meaningful while the lot is live.
  // PF7: depend on the primitives the tick actually reads (id/endTime/status),
  // NOT the activeAuction object identity — before PF5, every bid on ANY lot
  // handed this component a fresh object and tore down/rebuilt the interval
  // mid-snipe-window. ⚠️TIMING: `endTime` MUST stay in the deps — an anti-snipe
  // extension (server adds +15s to endsAt) must restart the countdown from the
  // new endTime, and `status` must stay so the live→completed flip re-evaluates.
  const activeAuctionId = activeAuction?.id;
  const activeAuctionEndTime = activeAuction?.endTime;
  const activeAuctionStatus = activeAuction?.status;
  useEffect(() => {
    if (!activeAuctionId) {
      setSecondsRemaining(null);
      return;
    }
    const update = () => {
      // E3 first_bid: a live lot with no endTime hasn't started its clock — keep
      // the countdown null so the final-10s overlay never fires on a 0-derived
      // remaining (the clock starts server-side on the first bid).
      if (activeAuctionStatus === 'live' && activeAuctionEndTime) {
        const remainingMs = activeAuctionEndTime - serverNow();
        setSecondsRemaining(Math.max(0, Math.floor(remainingMs / 1000)));
      } else {
        setSecondsRemaining(null);
      }
    };
    update(); // run once immediately
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeAuctionId, activeAuctionEndTime, activeAuctionStatus]);

  // Reset the edge-detector when the active lot swaps.
  useEffect(() => {
    prevSecondsRemaining.current = null;
  }, [activeAuction?.id]);

  // Tick/finish audio + snipe-window haptics (edge-triggered so each second
  // fires exactly once). Uses the shared single AudioContext (auctioneerAudio).
  useEffect(() => {
    if (secondsRemaining === null || !activeAuction || activeAuction.status !== 'live') {
      prevSecondsRemaining.current = null;
      return;
    }
    if (prevSecondsRemaining.current !== secondsRemaining) {
      if (secondsRemaining > 0 && secondsRemaining <= 10) {
        playTick();
      } else if (secondsRemaining === 0 && prevSecondsRemaining.current !== 0 && prevSecondsRemaining.current !== null) {
        playFinish();
        // NOTE: settlement is server-authoritative. The client must NEVER write
        // status:'completed' — the scheduledAuctionCloser cron settles the lot
        // (order creation, wonCount, FCM, auction_won/payment_due webhooks) and
        // only for auctions still in ['active','live','upcoming']. A client flip
        // to 'completed' would orphan the win. Countdown-zero is visual only.
      }
      prevSecondsRemaining.current = secondsRemaining;
    }
  }, [secondsRemaining, activeAuction]);

  // DERIVED finish state — recomputed each tick (this component re-renders every
  // second), so if an anti-snipe extension (functions/index.js, +15s) pushes
  // endTime back into the future, the ended/winner overlay re-clears itself.
  const isFinished = activeAuction ? isAuctionFinished(activeAuction, serverNow()) : false;

  return (
    <AnimatePresence>
      {activeAuction && !isOverlayDismissed && ((activeAuction.status === 'live' && secondsRemaining !== null && secondsRemaining <= 10) || isFinished) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex flex-col items-center justify-center select-none"
        >
          {/* Close Button */}
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 md:top-6 md:right-6 bg-surface-raised/10 hover:bg-surface-raised/20 text-white rounded-full p-2.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>

          {secondsRemaining !== null && secondsRemaining > 0 ? (
            <div className="flex flex-col items-center gap-4 text-center">
              {/* Big Scale Countdown Number */}
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={secondsRemaining}
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1.1, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="text-[120px] md:text-[200px] font-black text-white select-none filter drop-shadow-[0_0_35px_rgba(255,255,255,0.45)]"
                >
                  {secondsRemaining}
                </motion.div>
              </AnimatePresence>
              <p className="text-white/80 font-semibold text-lg md:text-xl uppercase tracking-widest animate-pulse">
                {isAr ? 'المزايدة النهائية!' : 'Final Countdown!'}
              </p>
            </div>
          ) : (
            /* Winner Card */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              className="bg-zinc-950/95 backdrop-blur-md rounded-3xl p-8 border border-white/10 max-w-sm w-full mx-4 text-center shadow-2xl flex flex-col items-center gap-4"
            >
              {(() => {
                // Winner check is server-authoritative (auction.currentBidderId).
                // It must NOT be gated on the localStorage `bids` cache — a real
                // winner with an empty local cache (other device, cleared
                // storage) used to fall into the spectator browse-only card.
                const isUserWinner = isViewerWinner(activeAuction, currentUser?.id);
                const hasUserBid = activeAuction?.id && bids ? bids.some((b: any) => b.auctionId === activeAuction.id && b.bidderId === currentUser?.id) : false;
                const t = translations[isAr ? 'ar' : 'en'];

                if (isUserWinner) {
                  const totalDue = totalWithPremium(activePrice);
                  const goToOrder = () => {
                    onDismiss();
                    // Deep-open the order when it's already settled; if the
                    // closer cron (≤60s) hasn't created it yet, still land on
                    // My Orders — it shows a "finalizing your order…" hint
                    // until the order doc arrives. Never a dead end.
                    const matchingOrder = orders?.find((o: any) => o.auctionId === activeAuction?.id && o.buyerId === currentUser?.id);
                    if (matchingOrder) {
                      setGlobalSelectedOrderId(matchingOrder.id);
                    }
                    setActiveView('orders');
                  };
                  return (
                    <>
                      <div className="bg-emerald-500/15 text-emerald-400 p-4 rounded-full mb-1 animate-bounce">
                        <Trophy className="w-12 h-12" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black text-white">
                        {t.winEndedHeadline}
                      </h2>

                      <div className="w-full bg-emerald-500/10 rounded-2xl py-3 px-6 border border-emerald-500/20 mt-2">
                        <p className="text-xs text-emerald-400 uppercase tracking-wider mb-0.5">
                          {t.winTotalDueLabel}
                        </p>
                        <p className="text-2xl font-black text-emerald-400">
                          {formatMoney(totalDue, isAr ? 'ar' : 'en')}
                        </p>
                        <p className="text-[11px] text-emerald-300/70 font-semibold mt-0.5">
                          {t.winPremiumNote}
                        </p>
                        {activeAuction?.marketPrice && activeAuction.marketPrice > activePrice ? (
                          <p className="text-xs text-emerald-300/80 font-semibold mt-1">
                            {isAr
                              ? `وفّرت ${formatMoney(activeAuction.marketPrice - activePrice, 'ar')} (السعر ${formatMoney(activeAuction.marketPrice, 'ar')})`
                              : `You saved ${formatMoney(activeAuction.marketPrice - activePrice, 'en')} (worth ${formatMoney(activeAuction.marketPrice, 'en')})`}
                          </p>
                        ) : null}
                      </div>

                      <p className="text-amber-400 text-xs font-black tracking-wide">
                        ⏳ {t.winPayWithin24h}
                      </p>

                      <button
                        onClick={goToOrder}
                        className="mt-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
                        id="ended-card-complete-payment"
                      >
                        {t.winCompletePaymentCta}
                      </button>

                      <button
                        onClick={() => {
                          onDismiss();
                          setActiveView('discovery');
                        }}
                        className="w-full py-2 text-zinc-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                        id="ended-card-browse-secondary"
                      >
                        {t.winBrowseOtherLink}
                      </button>
                    </>
                  );
                } else if (hasUserBid) {
                  return (
                    <>
                      <div className="bg-zinc-500/15 text-zinc-400 p-4 rounded-full mb-1">
                        <X className="w-12 h-12" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black text-white">
                        {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                      </h2>
                      <p className="text-zinc-300 text-sm font-semibold">
                        {isAr ? 'لم تربح هذه المرة' : 'You did not win this time'}
                      </p>

                      <div className="w-full bg-emerald-500/10 rounded-2xl py-3 px-4 border border-emerald-500/20 text-center text-xs text-emerald-400 font-bold leading-relaxed my-1">
                        {isAr ? 'تم تجاوز مزايدتك — زايد الآن لاستعادة الصدارة' : "You've been outbid — bid again to take the lead"}
                      </div>

                      <button
                        onClick={() => {
                          onDismiss();
                          setActiveView('discovery');
                        }}
                        className="mt-4 w-full bg-surface-raised/10 hover:bg-surface-raised/20 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
                      >
                        {isAr ? 'تصفح مزادات أخرى' : 'Browse other auctions'}
                      </button>
                    </>
                  );
                } else {
                  return (
                    <>
                      <div className="bg-amber-500/15 text-amber-400 p-4 rounded-full mb-1">
                        <Trophy className="w-12 h-12" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black text-white">
                        {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                      </h2>

                      <div className="w-full bg-surface-raised/5 rounded-2xl py-3 px-6 border border-white/5 my-2">
                        <p className="text-xs text-white/60 uppercase tracking-wider mb-1">
                          {isAr ? 'المزايد الأعلى' : 'Winner'}
                        </p>
                        <p className="text-lg font-bold text-white truncate">
                          {activeAuction.currentBidderName || (isAr ? 'لا يوجد عطاء' : 'No bids placed')}
                        </p>
                      </div>

                      {activeAuction.currentBidderName && (
                        <div className="w-full bg-emerald-500/10 rounded-2xl py-2.5 px-6 border border-emerald-500/20">
                          <p className="text-xs text-emerald-400 uppercase tracking-wider mb-0.5">
                            {isAr ? 'السعر النهائي' : 'Winning Bid'}
                          </p>
                          <p className="text-xl font-black text-emerald-400">
                            {formatMoney(activePrice, isAr ? 'ar' : 'en')}
                          </p>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          onDismiss();
                          setActiveView('discovery');
                        }}
                        className="mt-4 w-full bg-surface-raised/15 hover:bg-surface-raised/25 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
                      >
                        {isAr ? 'تصفح مزادات أخرى' : 'Browse other auctions'}
                      </button>
                    </>
                  );
                }
              })()}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const LiveStreamView: React.FC = () => {
  const {
    currentUser,
    activeAuctionId,
    setActiveAuctionId,
    setActiveView,
    placeBid,
    language,
    watchlist,
    toggleWatchlist,
    sendChatMessage,
    orders,
    setGlobalSelectedOrderId,
    isAuthenticated,
    requestSignIn,
    setShowBanNotice
  } = useApp();
  const { chatMessages } = useChat();
  // Slice 1b Task 2: win-detection reads from a SCOPED per-user "my lots"
  // subscription (not the broad `auctions` array, whose `[live,upcoming]` query
  // drops a won lot as `removed` before any `completed` snapshot).
  const myWinLots = useMyAuctionLots(currentUser?.id);

  const isAr = language === 'ar';
  // Optimistic bid overlay: the price paints my bid instantly (before the
  // callable round-trip + Firestore echo), then reconciles when the doc catches up.
  const [optimistic, setOptimistic] = useState<OptimisticBid>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Core visual settings
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [selectedLotDetailsId, setSelectedLotDetailsId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<string>('');

  // Immersive overlay states (messages and alerts that fade away dynamically)
  const [activeComments, setActiveComments] = useState<Array<any>>([]);
  const [activeActivities, setActiveActivities] = useState<Array<any>>([]);

  // Premium Final Countdown States. The per-second `secondsRemaining` now lives
  // in <AuctionCountdownLayer> (isolated so a tick doesn't re-render this room);
  // only the infrequently-changing dismissal flag stays here.
  const [isOverlayDismissed, setIsOverlayDismissed] = useState<boolean>(false);

  // Slice 1b Task 5a-3: the desktop "Live Auctions" rail sources its list from
  // the room's OWN paginated ending-soon feed (`useDiscoverFeed`), not the broad
  // `auctions` array — so a viewer in the room no longer needs all ~80 lots to
  // stream. `null` category = the 'All' feed (the room has no category chip).
  // Kept under the name `liveAuctions` so every rail/details pass-site is
  // unchanged. NOTE: this is LIVE-only (upcoming lots are a separate feed list);
  // the old array included 'upcoming' in the rail.
  const feedLive = useDiscoverFeed(null, true).liveItems;
  const liveAuctions = feedLive;

  // Slice 1b Task 5a-3: the active lot gets its OWN single-doc realtime
  // subscription (`useAuctionDoc`, ref-counted + leak-safe) returning the FULL
  // live+static object — this replaces the old `activeAuctionBase` (from the
  // broad array) + `useVisibleAuctionLive` overlay. `useAuctionDoc` fetches the
  // lot directly by id, so a deep-link to a lot NOT on the feed's first page
  // still resolves. AppContext seeds `activeAuctionId` with a placeholder that
  // isn't a real doc → `useAuctionDoc` returns null → we fall back to the first
  // live feed lot; the id-sync effect below then sets `activeAuctionId` to that
  // real lot and `useAuctionDoc` picks it up on the next render.
  const { item: docLot, status: docStatus } = useAuctionDocState(activeAuctionId);
  const feedMatch = feedLive.find(a => a.id === activeAuctionId);
  /**
   * The feed fallback (`feedLive[0]`) is a DIFFERENT lot, so it may only stand in
   * when no specific lot is being resolved.
   *
   * It used to apply to every null: `docLot ?? feedMatch ?? feedLive[0]`. But
   * `useAuctionDoc` returned null while a lot was still loading too, so opening
   * /auction/<id> directly — a deep link, a refresh, a shared link — rendered
   * whichever lot happened to be first in the ending-soon feed, complete with
   * its title, description, condition and price. Worse, the id-sync effect below
   * then wrote THAT lot's id into `activeAuctionId`, so the wrong auction stuck
   * instead of flickering.
   *
   * `loading` now holds: the room waits for the lot it was asked for. The
   * fallback survives for the two cases it was actually written for — the
   * placeholder id AppContext seeds when the room is opened with no lot, and a
   * `missing` id that no longer resolves to a doc.
   */
  const activeAuction = docLot
    ?? feedMatch
    ?? (docStatus === 'loading' ? undefined : feedLive[0]);

  // Align activeAuctionId to the REAL resolved lot so every chat surface keys on
  // one id. AppContext seeds activeAuctionId with the placeholder 'auction-rolex'
  // (a truthy value the old `!activeAuctionId` guard never overrode), so
  // `sendChatMessage` wrote — and the chat listener queried — auctionId
  // 'auction-rolex', while the render filter below keys on `activeAuction.id`
  // (the real fallback lot). Write/listener/filter disagreed and members' own
  // comments were silently dropped. Syncing the id here makes all three agree.
  // Guarded on inequality so it can't loop.
  useEffect(() => {
    if (activeAuction && activeAuctionId !== activeAuction.id) {
      setActiveAuctionId(activeAuction.id);
    }
  }, [activeAuction, activeAuctionId, setActiveAuctionId]);

  // Reset the manual overlay dismissal on auction change. The finished state is
  // now DERIVED (isAuctionFinished) rather than latched, so there is nothing to
  // reset for it — it re-clears on its own if anti-snipe pushes endTime forward.
  useEffect(() => {
    setIsOverlayDismissed(false);
  }, [activeAuctionId]);

  const activePrice = activeAuction ? effectivePrice(activeAuction.currentPrice, optimistic, activeAuction.id) : 0;

  // Clear the optimistic overlay once the live doc has caught up to (or passed) it.
  useEffect(() => {
    if (optimistic && activeAuction && optimisticResolved(activeAuction.currentPrice, optimistic, activeAuction.id)) {
      setOptimistic(null);
    }
  }, [activeAuction?.currentPrice, activeAuction?.id, optimistic]);

  // Win celebration: fires only on the status *transition* to 'completed'
  // while this user holds the highest bid (per-id previous-status ref inside
  // the hook — never fires on mount into an already-completed auction).
  // Fed the SCOPED `myWinLots` (not the active lot, not the broad array): a
  // won lot keeps `currentBidderId==me` and STAYS in that per-user query when
  // it completes, so the winning `live→completed` edge is observable — which
  // the broad `[live,upcoming]` array can never deliver (it drops the lot as
  // `removed` first).
  const { win, clearWin } = useWinDetection(myWinLots, currentUser?.id, currentUser?.email);

  // De-dup rule (Wave 1): WinCelebration is THE payment-first surface for the
  // winner the moment the win transition fires — the ended card defers to it.
  // Suppression is render-synchronous below (`isOverlayDismissed || win !== null`
  // passed to <AuctionCountdownLayer>) so the two full-screen layers can never
  // stack, not even for a frame; this effect additionally LATCHES the dismissal
  // so the ended card doesn't pop back up after the celebration is closed.
  useEffect(() => {
    if (win) setIsOverlayDismissed(true);
  }, [win]);

  const handleWinPay = () => {
    const wonAuctionId = win?.auctionId;
    clearWin();
    const matchingOrder = orders?.find(o => o.auctionId === wonAuctionId && o.buyerId === currentUser?.id);
    if (matchingOrder) {
      setGlobalSelectedOrderId(matchingOrder.id);
    }
    setActiveView('orders');
  };

  // Always mounted (Confetti needs the false→true flip to burst); renders
  // nothing interactive while hidden.
  const winCelebrationEl = (
    <WinCelebration
      show={win !== null}
      auctionTitle={win?.auctionTitle ?? ''}
      totalDue={win?.totalDue ?? 0}
      isAr={isAr}
      onPay={handleWinPay}
      onClose={clearWin}
    />
  );

  // NOTE (Wave 2 fix): video src/load/play/pause used to be driven imperatively
  // from here on every lot swap. MediaGallery now OWNS playback for both mobile
  // (per-reel, via its own internal video ref) and desktop (via the forwarded
  // `videoRef` below) — it sets <video src> declaratively and plays/pauses based
  // on (isActive && isPlaying && currentIsVideo). Because effects run child-first,
  // this parent effect used to re-play the new lot's video (with audio, if
  // unmuted) AFTER MediaGallery had already paused it on a lot switch, while a
  // stale gallery index still showed an image slide. Removed entirely so there is
  // exactly one video controller. Only the mute sync below remains, since it never
  // touches .src/.load()/.play() — it only mirrors `isMuted` onto the DOM node
  // that MediaGallery's own ref points at (desktop only; mobile reels are muted
  // via their own MediaGallery instance and don't read this shared videoRef).
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // The per-second countdown clock (secondsRemaining + HH:MM:SS + tick/finish
  // audio) now lives entirely inside <AuctionCountdownLayer> (see top of file)
  // and, for the desktop HH:MM:SS pill, inside DesktopLiveAuctionLayout — so a
  // tick no longer re-renders this whole room.

  // Active auction watchlist checks
  const isSaved = activeAuction ? watchlist.includes(activeAuction.id) : false;

  // Sync active comments state with chatMessages from global store
  useEffect(() => {
    if (!activeAuction) return;
    const lotChats = chatMessages.filter(msg => msg.auctionId === activeAuction.id);
    if (lotChats.length === 0) return;
    
    // Get the most recent chat message
    const latestChat = lotChats[lotChats.length - 1];
    
    // Append and keep only the latest 5 comments using functional state update to prevent duplicates
    const newComment = { ...latestChat, localTimestamp: Date.now() };
    setActiveComments(prev => {
      if (prev.some(c => c.id === latestChat.id)) return prev;
      return [...prev.slice(-4), newComment];
    });
    
    // Set timer to fade it out after 7 seconds
    const timer = setTimeout(() => {
      setActiveComments(prev => prev.filter(c => c.id !== latestChat.id));
    }, 7000);
    
    return () => clearTimeout(timer);
  }, [chatMessages, activeAuction?.id]);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const togglePlayPause = () => {
    // User gesture — unlock the shared AudioContext (iOS autoplay policy) so the
    // later programmatic countdown ticks are audible.
    resumeAudio();
    // Just flip the flag — MediaGallery (desktop's forwarded ref AND every
    // mobile reel's own internal ref) reacts to `isPlaying` itself and calls
    // .play()/.pause() on whichever video element is actually active+visible.
    // Driving `videoRef.current` here too would be a second controller (and on
    // mobile the shared `videoRef` is never populated in the first place, since
    // each reel owns its own local video ref).
    setIsPlaying(!isPlaying);
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Unmuting is the clearest intent-to-hear gesture — resume the shared audio
    // context here so snipe-window ticks/finish chime can play.
    resumeAudio();
    setIsMuted(!isMuted);
    triggerToast(!isMuted ? (isAr ? '🔊 تم تشغيل الصوت المباشر' : '🔊 Stream unmuted') : (isAr ? '🔇 تم كتم الصوت' : '🔇 Stream muted'));
  };

  const executeBid = async (amount: number): Promise<{ success: boolean; message: string }> => {
    // E2: only an ACTIVE/permanent block gates bidding (an expired cooldown does
    // not — matches the server). Show the ban notice instead of a terse toast.
    if (isEffectivelyBlocked(currentUser)) {
      setShowBanNotice(true);
      const message = isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!';
      return { success: false, message };
    }

    const isEnded = isAuctionFinished(activeAuction, serverNow());
    if (isEnded) {
      const message = isAr ? '❌ انتهى المزاد بالفعل!' : '❌ The auction has already ended!';
      triggerToast(message);
      return { success: false, message };
    }

    // Optimistic paint: show my bid instantly; reconcile when the listener echoes.
    const auctionId = activeAuction.id;
    if (currentUser) {
      setOptimistic({ auctionId, price: amount, bidderId: currentUser.id, bidderName: currentUser.name || (isAr ? 'أنت' : 'You') });
    }
    const res = await placeBid(auctionId, amount);
    if (!res.success) {
      setOptimistic(prev => (prev && prev.auctionId === auctionId ? null : prev)); // roll back
      triggerToast(res.message);
    }
    // Success feedback (price count-up + winning pill) is owned by the layouts.
    return res;
  };

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Guest browsing: reactions are an account action — the signup moment.
    if (!isAuthenticated) {
      requestSignIn('bid');
      return;
    }
    triggerToast(isAr ? '❤️ أرسلت تفاعلاً للبث المباشر!' : '❤️ Sent stream appreciation!');
    
    // Show the user's own real reaction in the fading activity overlay
    const newAct = {
      id: `act-like-${Date.now()}`,
      name: currentUser?.name || (isAr ? 'أنت' : 'You'),
      type: 'like' as const,
      textAr: 'أرسل قلباً للبث المباشر',
      textEn: 'sent a love reaction',
      time: isAr ? 'الآن' : 'now'
    };
    setActiveActivities(prev => [...prev.slice(-3), newAct]);
    setTimeout(() => {
      setActiveActivities(prev => prev.filter(a => a.id !== newAct.id));
    }, 6000);
  };

  const handleSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Guest browsing: saving/following is an account action — the signup moment.
    if (!isAuthenticated) {
      requestSignIn('save');
      return;
    }
    toggleWatchlist(activeAuction.id);
    const saved = !isSaved;
    triggerToast(saved ? (isAr ? '🔖 تم الحفظ في قائمتك!' : '🔖 Saved to Watchlist!') : (isAr ? 'تمت الإزالة من المفضلة' : 'Removed from Watchlist'));
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Copy the canonical deep link (/?auction=<id>), not window.location.href —
    // in-app nav keeps the URL clean so href would otherwise share the homepage.
    const shareUrl = activeAuctionId
      ? buildAuctionUrl(activeAuctionId, window.location.origin)
      : window.location.href;
    navigator.clipboard.writeText(shareUrl);
    triggerToast(isAr ? '🔗 تم نسخ رابط البث لمشاركته!' : '🔗 Broadcast link copied to clipboard!');
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Guest browsing: chatting is an account action — the signup moment.
    // (Guests can't read `chats` per firestore.rules either, so the composer
    // is their entry into the room, not a silent failed write.)
    if (!isAuthenticated) {
      requestSignIn('chat');
      return;
    }
    if (!commentText.trim()) return;
    sendChatMessage(commentText);
    setCommentText('');
  };

  // The room is "active" when its own live feed has lots OR a specific active lot
  // resolved (a deep-link to an off-page lot loads via `useAuctionDoc` even
  // before the feed page arrives — so `activeAuction` alone keeps that room up).
  const hasLiveAuctions = feedLive.length > 0 || !!activeAuction;

  // Must stay above the no-live-auctions early return: the branch switch on
  // the last auction completing would otherwise change the hook order.
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      // Same threshold DesktopFrame picks its shell with — they must agree, or
      // this renders the mobile layout inside the desktop shell (and vice versa).
      setIsMobile(!isDesktopWidth(window.innerWidth));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  /**
   * A requested lot that has not answered yet is LOADING, not absent. Without
   * this branch the room fell through to "no live auctions currently" — telling
   * someone who opened a perfectly good shared link that the auction does not
   * exist. Same shell and spinner language as the branch below it, so the two
   * read as one component in two states.
   */
  if (!activeAuction && docStatus === 'loading') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center bg-[#0A0A0A] p-6 text-fg-muted h-full min-h-[500px]" id="live-stream-loading">
        <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
          <div className="w-7 h-7 rounded-full border-2 border-[#FF6B00] border-t-transparent animate-spin" />
        </div>
        <h3 className="font-extrabold text-sm uppercase text-white mb-2">
          {isAr ? 'جاري تحميل المزاد…' : 'Loading auction…'}
        </h3>
      </div>
    );
  }

  if (!hasLiveAuctions || !activeAuction) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center bg-[#070709] p-6 text-fg-muted h-full min-h-[500px]" id="no-live-stream-fallback">
        <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center text-3xl mb-4 animate-pulse">
          📺
        </div>
        <h3 className="font-extrabold text-sm uppercase text-white mb-2">
          {isAr ? 'لا توجد مزادات مباشرة حالياً' : 'No live auctions currently'}
        </h3>
        <p className="text-zinc-500 text-xs mb-6 max-w-xs leading-relaxed">
          {isAr ? 'تابع بائعينا المميزين لتصلك إشعارات فور بدء بثوثهم المباشرة!' : 'Follow our premium sellers to get notified as soon as they go live!'}
        </p>
        <button 
          onClick={() => {
            setActiveView('discovery');
          }}
          className="px-6 py-3 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-lg transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
        >
          {isAr ? 'تصفح المزادات القادمة' : 'Browse Upcoming Auctions'}
        </button>
        {/* The last live auction completing lands us on this branch — the
            celebration must survive the branch switch to still fire. */}
        {winCelebrationEl}
      </div>
    );
  }

  const nextBidAmount = activeAuction ? minNextBid(activeAuction.currentPrice, activeAuction.minIncrement, activeAuction.totalBids || 0) : 0;

  return (
    <div className="w-full h-full relative" id="live-stream-viewport-wrapper">
      {isMobile ? (
        <MobileAuctionView
          activeAuctionId={activeAuctionId}
          onSelectAuction={(id) => setActiveAuctionId(id)}
          activeAuction={activeAuction}
          activePrice={activePrice}
          isMuted={isMuted}
          isPlaying={isPlaying}
          onMuteToggle={handleMuteToggle}
          onPlayPauseToggle={togglePlayPause}
          onShareClick={handleShareClick}
          onSaveToggle={handleSaveToggle}
          onLikeToggle={handleLikeToggle}
          isSaved={isSaved}
          activeComments={activeComments}
          activeActivities={activeActivities}
          commentText={commentText}
          setCommentText={setCommentText}
          onCommentSubmit={handleCommentSubmit}
          nextBidAmount={nextBidAmount}
          onBidExecute={executeBid}
          currentUser={currentUser}
          language={language}
          isAr={isAr}
          onOpenDetails={(id) => setSelectedLotDetailsId(id)}
          videoRef={videoRef}
          videoContainerRef={videoContainerRef}
          showToast={showToast}
          onClose={() => setActiveView('discovery')}
        />
      ) : (
        <DesktopLiveAuctionLayout
          activeAuction={activeAuction}
          activePrice={activePrice}
          isMuted={isMuted}
          isPlaying={isPlaying}
          onMuteToggle={handleMuteToggle}
          onPlayPauseToggle={togglePlayPause}
          onShareClick={handleShareClick}
          onSaveToggle={handleSaveToggle}
          onLikeToggle={handleLikeToggle}
          isSaved={isSaved}
          activeComments={activeComments}
          activeActivities={activeActivities}
          commentText={commentText}
          setCommentText={setCommentText}
          onCommentSubmit={handleCommentSubmit}
          nextBidAmount={nextBidAmount}
          onBidExecute={executeBid}
          currentUser={currentUser}
          isAr={isAr}
          onOpenDetails={(id) => setSelectedLotDetailsId(id)}
          liveAuctions={liveAuctions}
          onSelectAuction={(id) => setActiveAuctionId(id)}
          videoRef={videoRef}
          videoContainerRef={videoContainerRef}
          showToast={showToast}
        />
      )}

      {/* Slide-up lot specifications sheet details modal — resolve the lot from
          `liveAuctions` (= the room's own `useDiscoverFeed` live list, Task 5a-3).
          Mount only when the lot is in hand. */}
      {(() => {
        if (!selectedLotDetailsId) return null;
        const detailsLot = liveAuctions.find(a => a.id === selectedLotDetailsId);
        if (!detailsLot) return null;
        return (
          <AuctionDetailsModal
            auction={detailsLot}
            onClose={() => setSelectedLotDetailsId(null)}
          />
        );
      })()}

      {/* Premium Final Countdown Overlay — isolated so its 1s tick re-renders
          only itself, not this whole live room. */}
      <AuctionCountdownLayer
        activeAuction={activeAuction}
        activePrice={activePrice}
        isAr={isAr}
        isOverlayDismissed={isOverlayDismissed || win !== null}
        onDismiss={() => setIsOverlayDismissed(true)}
      />

      {/* Win celebration — always mounted; bursts on the win transition */}
      {winCelebrationEl}
    </div>
  );
};
