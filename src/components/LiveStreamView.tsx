import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderLock,
  Trophy,
  X
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { MobileLiveAuctionLayout } from './MobileLiveAuctionLayout';
import { DesktopLiveAuctionLayout } from './DesktopLiveAuctionLayout';
import { minNextBid, totalWithPremium, isViewerWinner } from '../utils/bidMath';
import { translations } from '../utils/translations';
import { formatMoney } from '../utils/formatMoney';
import { serverNow, isAuctionFinished } from '../utils/serverTime';
import { buildAuctionUrl } from '../utils/deepLink';
import { WinCelebration, useWinDetection } from './feedback';
import { resumeAudio, playTick, playFinish } from '../utils/auctioneerAudio';

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
  useEffect(() => {
    if (!activeAuction) {
      setSecondsRemaining(null);
      return;
    }
    const update = () => {
      if (activeAuction.status === 'live') {
        const remainingMs = (activeAuction.endTime ?? 0) - serverNow();
        setSecondsRemaining(Math.max(0, Math.floor(remainingMs / 1000)));
      } else {
        setSecondsRemaining(null);
      }
    };
    update(); // run once immediately
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeAuction]);

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
            className="absolute top-4 right-4 md:top-6 md:right-6 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
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
                        className="mt-4 w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
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

                      <div className="w-full bg-white/5 rounded-2xl py-3 px-6 border border-white/5 my-2">
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
                        className="mt-4 w-full bg-white/15 hover:bg-white/25 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
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
    auctions, 
    activeAuctionId, 
    setActiveAuctionId, 
    setActiveView, 
    placeBid,
    language,
    watchlist,
    toggleWatchlist,
    chatMessages,
    sendChatMessage,
    orders,
    setGlobalSelectedOrderId
  } = useApp();

  const isAr = language === 'ar';
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

  // Get live and upcoming auctions
  const liveAuctions = useMemo(() => {
    const filtered = auctions.filter(a =>
      (a.status === 'live' || a.status === 'upcoming') &&
      (!a.endTime || a.endTime > serverNow())
    );
    // Fallback (nothing live/upcoming): never leak unapproved lots — a
    // 'processing' (awaiting Mazad review), legacy 'pending' or 'rejected'
    // listing must stay invisible to buyers on every surface (spec §6). Also
    // exclude finished lots ('completed'/'ended') so the fallback never shows a
    // dead auction as if it were watchable.
    const approvedOnly = auctions.filter(a =>
      a.status !== 'processing' && a.status !== 'pending' && a.status !== 'rejected' &&
      a.status !== 'completed' && a.status !== 'ended'
    );
    const displayList = filtered.length > 0 ? filtered : approvedOnly;
    return [...displayList].sort((a, b) => {
      const tA = a.approvedAt ? (a.approvedAt.seconds ? a.approvedAt.seconds * 1000 : Number(a.approvedAt)) : (a.createdAt || 0);
      const tB = b.approvedAt ? (b.approvedAt.seconds ? b.approvedAt.seconds * 1000 : Number(b.approvedAt)) : (b.createdAt || 0);
      return tB - tA;
    });
  }, [auctions]);

  // Set initial active auction if none is set
  useEffect(() => {
    if (liveAuctions.length > 0 && !activeAuctionId) {
      setActiveAuctionId(liveAuctions[0].id);
    }
  }, [liveAuctions, activeAuctionId, setActiveAuctionId]);

  // Active auction item helper
  const activeAuction = useMemo(() => {
    return liveAuctions.find(a => a.id === activeAuctionId) || liveAuctions[0];
  }, [liveAuctions, activeAuctionId]);

  // Reset the manual overlay dismissal on auction change. The finished state is
  // now DERIVED (isAuctionFinished) rather than latched, so there is nothing to
  // reset for it — it re-clears on its own if anti-snipe pushes endTime forward.
  useEffect(() => {
    setIsOverlayDismissed(false);
  }, [activeAuctionId]);

  const activePrice = activeAuction ? activeAuction.currentPrice : 0;

  // Win celebration: fires only on the status *transition* to 'completed'
  // while this user holds the highest bid (per-id previous-status ref inside
  // the hook — never fires on mount into an already-completed auction).
  // Watch ALL auctions (not just the active lot): a won auction drops out of
  // liveAuctions the moment it flips to completed, so watching only the active
  // lot would miss the winning edge whenever another live lot exists.
  const { win, clearWin } = useWinDetection(auctions, currentUser?.id, currentUser?.email);

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

  // Sync video source & playback when active lot swaps
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeAuction) return;

    video.src = activeAuction.videoUrl;
    video.load();
    video.muted = isMuted;

    if (isPlaying) {
      video.play().catch(err => {
        console.warn("Autoplay was blocked, muted instead:", err);
        video.muted = true;
        setIsMuted(true);
        video.play().catch(e => console.warn("Playback failed entirely:", e));
      });
    } else {
      video.pause();
    }
  }, [activeAuctionId, activeAuction?.videoUrl]);

  // Manage mute state on video tag
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Fullscreen support
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

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
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
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
    if (currentUser?.isBlocked) {
      const message = isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!';
      triggerToast(message);
      return { success: false, message };
    }

    const isEnded = isAuctionFinished(activeAuction, serverNow());
    if (isEnded) {
      const message = isAr ? '❌ انتهى المزاد بالفعل!' : '❌ The auction has already ended!';
      triggerToast(message);
      return { success: false, message };
    }

    const res = await placeBid(activeAuction.id, amount);
    if (!res.success) {
      triggerToast(res.message);
    }
    // Success feedback (price count-up + winning pill) is owned by the layouts.
    return res;
  };

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    if (!commentText.trim()) return;
    sendChatMessage(commentText);
    setCommentText('');
  };

  const hasLiveAuctions = useMemo(() => {
    // An upcoming-only room is still an active room — gating on 'live' alone
    // made a room that only holds scheduled lots render "No live auctions".
    return auctions.some(a =>
      (a.status === 'live' || a.status === 'upcoming') && (!a.endTime || a.endTime > serverNow())
    );
  }, [auctions]);

  // Must stay above the no-live-auctions early return: the branch switch on
  // the last auction completing would otherwise change the hook order.
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!hasLiveAuctions || !activeAuction) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center bg-[#070709] p-6 text-gray-400 h-full min-h-[500px]" id="no-live-stream-fallback">
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
        <MobileLiveAuctionLayout
          liveAuctions={liveAuctions}
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
          toggleFullscreen={toggleFullscreen}
        />
      )}

      {/* Slide-up lot specifications sheet details modal */}
      {selectedLotDetailsId && (
        <AuctionDetailsModal
          auctionId={selectedLotDetailsId}
          onClose={() => setSelectedLotDetailsId(null)} 
        />
      )}

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
