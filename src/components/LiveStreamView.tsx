import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderLock,
  Trophy,
  X
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { MobileLiveAuctionLayout } from './MobileLiveAuctionLayout';
import { DesktopLiveAuctionLayout } from './DesktopLiveAuctionLayout';
import { isAuctionOpen } from '../utils/auctionPhase';
import { minNextBid } from '../utils/bidMath';

// Countdown tick sound
const playTick = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // Crisp high tick
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (err) {
    console.warn("Audio Context tick failed:", err);
  }
};

// Countdown finish chime
const playFinish = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Play dual-tone pleasant triumphant finish sound
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
    
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
    
    osc1.start();
    osc2.start();
    
    osc1.stop(audioCtx.currentTime + 1.2);
    osc2.stop(audioCtx.currentTime + 1.2);
  } catch (err) {
    console.warn("Audio Context finish failed:", err);
  }
};

export const LiveStreamView: React.FC = () => {
  const { 
    currentUser, 
    auctions, 
    activeAuctionId, 
    setActiveAuctionId, 
    setActiveView, 
    placeBid, 
    wallet,
    language,
    watchlist,
    toggleWatchlist,
    chatMessages,
    sendChatMessage,
    bids,
    orders,
    setGlobalWalletSubView,
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

  // Premium Final Countdown States
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isOverlayDismissed, setIsOverlayDismissed] = useState<boolean>(false);
  const [hasFinishedInSession, setHasFinishedInSession] = useState<boolean>(false);
  const prevSecondsRemaining = useRef<number | null>(null);

  // Get live and upcoming auctions
  const liveAuctions = useMemo(() => {
    const filtered = auctions.filter(a => 
      (a.status === 'live' || a.status === 'upcoming') && 
      (!a.endTime || a.endTime > Date.now())
    );
    const displayList = filtered.length > 0 ? filtered : auctions;
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

  // Reset overlay & session end states on auction change
  useEffect(() => {
    setIsOverlayDismissed(false);
    setHasFinishedInSession(false);
    prevSecondsRemaining.current = null;
  }, [activeAuctionId]);

  const activePrice = activeAuction ? activeAuction.currentPrice : 0;

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

  // Handle countdown timers per card
  const [timeLeftStr, setTimeLeftStr] = useState<string>('00:00:00');
  useEffect(() => {
    if (!activeAuction) {
      setSecondsRemaining(null);
      return;
    }
    
    const updateTimer = () => {
      // Pre-open auctions count down to their scheduled start; open auctions count down to the end.
      const open = isAuctionOpen(activeAuction?.status);
      const target = !open && activeAuction?.scheduledStartAt
        ? activeAuction.scheduledStartAt
        : activeAuction?.endTime;
      const remainingMs = (target ?? 0) - Date.now();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));

      if (activeAuction.status === 'live') {
        setSecondsRemaining(remainingSecs);
      } else {
        setSecondsRemaining(null);
      }

      // T-0 dead zone: scheduled start has passed but the opener cron hasn't flipped it live yet.
      if (!open && (activeAuction?.scheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
        setTimeLeftStr(isAr ? 'يبدأ الآن…' : 'Starting…');
        return; // skip the 4-hour-boundary fallback clock
      }

      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        const now = new Date();
        const hrs = 4 - (now.getHours() % 4);
        const mins = 59 - now.getMinutes();
        const secs = 59 - now.getSeconds();
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    };

    updateTimer(); // Run once immediately
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [activeAuction, isAr]);

  // Handle countdown tick/finish sound effects and database status transition
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
        setHasFinishedInSession(true);

        // Auto-end the auction in Firestore if the current user is an admin
        if (currentUser?.isAdmin || currentUser?.role === 'admin') {
          // Double check that activeAuction has a valid non-NaN endTime and it is truly in the past
          if (activeAuction?.endTime && !isNaN(activeAuction.endTime) && activeAuction.endTime <= Date.now()) {
            const docRef = doc(db, 'auctions', activeAuction.id);
            updateDoc(docRef, { status: 'completed' })
              .then(() => {
                console.log("[Admin auto-end] Successfully updated auction status to completed.");
              })
              .catch(err => {
                console.error("[Admin auto-end] Failed to update auction status in Firestore:", err);
              });
          } else {
            console.log("[Admin auto-end] Skipped completion check because endTime is in the future or invalid:", activeAuction?.endTime);
          }
        }
      }
      prevSecondsRemaining.current = secondsRemaining;
    }
  }, [secondsRemaining, activeAuction, currentUser]);

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
    setIsMuted(!isMuted);
    triggerToast(!isMuted ? (isAr ? '🔊 تم تشغيل الصوت المباشر' : '🔊 Stream unmuted') : (isAr ? '🔇 تم كتم الصوت' : '🔇 Stream muted'));
  };

  const executeBid = async (amount: number) => {
    if (currentUser?.isBlocked) {
      triggerToast(isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!');
      return;
    }
    
    const isEnded = activeAuction?.status === 'completed' || (activeAuction?.endTime ? activeAuction.endTime <= Date.now() : false);
    if (isEnded) {
      triggerToast(isAr ? '❌ انتهى المزاد بالفعل!' : '❌ The auction has already ended!');
      return;
    }

    const res = await placeBid(activeAuction.id, amount);
    if (!res.success) {
      triggerToast(res.message);
    } else {
      triggerToast(isAr ? '🚀 تم تقديم المزايدة بنجاح!' : '🚀 Bid Placed Successfully!');
    }
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
    navigator.clipboard.writeText(window.location.href);
    triggerToast(isAr ? '🔗 تم نسخ رابط البث لمشاركته!' : '🔗 Broadcast link copied to clipboard!');
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    sendChatMessage(commentText);
    setCommentText('');
  };

  const hasLiveAuctions = useMemo(() => {
    return auctions.some(a => a.status === 'live' && (!a.endTime || a.endTime > Date.now()));
  }, [auctions]);

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
      </div>
    );
  }

  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
          timeLeftStr={timeLeftStr}
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
          wallet={wallet}
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
          timeLeftStr={timeLeftStr}
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
          wallet={wallet}
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

      {/* Premium Final Countdown Overlay */}
      <AnimatePresence>
        {activeAuction && !isOverlayDismissed && ((activeAuction.status === 'live' && secondsRemaining !== null && secondsRemaining <= 10) || hasFinishedInSession) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex flex-col items-center justify-center select-none"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOverlayDismissed(true)}
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
                  const hasUserBid = activeAuction?.id && bids ? bids.some(b => b.auctionId === activeAuction.id && b.bidderId === currentUser?.id) : false;
                  const isUserWinner = hasUserBid && activeAuction?.currentBidderId === currentUser?.id;

                  if (isUserWinner) {
                    return (
                      <>
                        <div className="bg-emerald-500/15 text-emerald-400 p-4 rounded-full mb-1 animate-bounce">
                          <Trophy className="w-12 h-12" />
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black text-white">
                          {isAr ? 'مبروك 🎉 ربحت المزاد' : 'Congratulations! You won'}
                        </h2>
                        <p className="text-zinc-300 text-sm font-semibold">
                          {isAr ? 'الطلب صار بانتظار الدفع/التأكيد' : 'The order is pending payment or confirmation'}
                        </p>
                        
                        <div className="w-full bg-emerald-500/10 rounded-2xl py-3 px-6 border border-emerald-500/20 mt-2">
                          <p className="text-xs text-emerald-400 uppercase tracking-wider mb-0.5">
                            {isAr ? 'السعر النهائي' : 'Winning Bid'}
                          </p>
                          <p className="text-2xl font-black text-emerald-400">
                            {activePrice} JOD
                          </p>
                          {activeAuction?.marketPrice && activeAuction.marketPrice > activePrice ? (
                            <p className="text-xs text-emerald-300/80 font-semibold mt-1">
                              {isAr
                                ? `وفّرت ${activeAuction.marketPrice - activePrice} دينار (السعر ${activeAuction.marketPrice})`
                                : `You saved ${activeAuction.marketPrice - activePrice} JOD (worth ${activeAuction.marketPrice})`}
                            </p>
                          ) : null}
                        </div>

                        <button
                          onClick={() => {
                            setIsOverlayDismissed(true);
                            const matchingOrder = orders?.find(o => o.auctionId === activeAuction?.id && o.buyerId === currentUser?.id);
                            if (matchingOrder) {
                              setGlobalSelectedOrderId(matchingOrder.id);
                            }
                            setGlobalWalletSubView('orders');
                            setActiveView('wallet');
                          }}
                          className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
                        >
                          {isAr ? 'عرض الطلب' : 'View Order'}
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
                          {isAr ? 'تم إرجاع المبلغ المحجوز إلى محفظتك' : 'The reserved amount has been returned to your wallet'}
                        </div>

                        <button
                          onClick={() => {
                            setIsOverlayDismissed(true);
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
                              {activePrice} JOD
                            </p>
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setIsOverlayDismissed(true);
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
    </div>
  );
};
