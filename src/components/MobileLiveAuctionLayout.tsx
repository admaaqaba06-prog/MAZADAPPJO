import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { SellerProfileModal } from './SellerProfileModal';
import { Pressable, CountUp, BidConfirm, WinningPill, useToast, FirstBidCoach, markFirstBidDone } from './feedback';
import { isAuctionOpen } from '../utils/auctionPhase';
import { minNextBid, totalWithPremium } from '../utils/bidMath';
import { formatAmmanClock } from '../utils/ammanTime';
import { serverNow, isAuctionFinished } from '../utils/serverTime';
import { translations } from '../utils/translations';
import { useBidFlow } from '../hooks/useBidFlow';
import { 
  Volume2, 
  VolumeX, 
  Bookmark, 
  Share2, 
  Sparkles, 
  Eye, 
  Send, 
  Award,
  X,
  Heart,
  Play,
  MessageSquare,
  ShieldCheck,
  Loader2
} from 'lucide-react';

interface MobileLiveAuctionLayoutProps {
  liveAuctions: any[];
  activeAuctionId: string;
  onSelectAuction: (id: string) => void;
  activeAuction: any;
  activePrice: number;
  isMuted: boolean;
  isPlaying: boolean;
  onMuteToggle: (e: React.MouseEvent) => void;
  onPlayPauseToggle: () => void;
  onShareClick: (e: React.MouseEvent) => void;
  onSaveToggle: (e: React.MouseEvent) => void;
  onLikeToggle: (e: React.MouseEvent) => void;
  isSaved: boolean;
  activeComments: any[];
  activeActivities: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  nextBidAmount: number;
  onBidExecute: (amount: number) => void | Promise<{ success: boolean; message: string } | void>;
  currentUser: any;
  language: string;
  isAr: boolean;
  onOpenDetails: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  showToast: string | null;
  onClose: () => void;
}

export const MobileLiveAuctionLayout: React.FC<MobileLiveAuctionLayoutProps> = ({
  liveAuctions,
  activeAuctionId,
  onSelectAuction,
  activeAuction,
  activePrice,
  isMuted,
  isPlaying,
  onMuteToggle,
  onPlayPauseToggle,
  onShareClick,
  onSaveToggle,
  onLikeToggle,
  isSaved,
  activeComments,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  nextBidAmount,
  onBidExecute,
  currentUser,
  language,
  isAr,
  onOpenDetails,
  showToast,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { sellerProfiles } = useApp();
  const { showToast: pushToast } = useToast();

  // Anti-snipe drama: toast when the end time extends (a late bid pushed the clock)
  const prevEndRef = useRef<{ id: string; end: number } | null>(null);
  useEffect(() => {
    const id = activeAuction?.id;
    const end = activeAuction?.endTime;
    if (!id || !end) return;
    const prev = prevEndRef.current;
    if (prev && prev.id === id && end > prev.end && isAuctionOpen(activeAuction?.status)) {
      pushToast({
        type: 'info',
        title: isAr ? '⏱️ تمديد ١٥ ثانية — مزايدة جديدة!' : '⏱️ +15s — new bid!',
      });
    }
    prevEndRef.current = { id, end };
  }, [activeAuction?.id, activeAuction?.endTime, activeAuction?.status, isAr, pushToast]);

  // Handle scroll snap to detect current active reel
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const height = container.clientHeight;
    
    if (height === 0) return;
    
    const index = Math.round(scrollTop / height);
    if (index >= 0 && index < liveAuctions.length) {
      const targetAuction = liveAuctions[index];
      if (targetAuction && targetAuction.id !== activeAuctionId) {
        onSelectAuction(targetAuction.id);
      }
    }
  };

  // Sync scroll position when activeAuctionId changes externally
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const activeIndex = liveAuctions.findIndex(a => a.id === activeAuctionId);
    if (activeIndex !== -1) {
      const height = container.clientHeight;
      const targetScrollTop = activeIndex * height;
      
      if (Math.abs(container.scrollTop - targetScrollTop) > 5) {
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [activeAuctionId, liveAuctions]);

  return (
    <div 
      className="w-full h-full relative bg-black select-none overflow-hidden"
      id="mobile-live-layout-wrapper"
    >
      {/* Global Toast Overlay */}
      {showToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#FF6B00] text-white px-4 py-2 rounded-xl text-[10.5px] font-black tracking-wide shadow-xl animate-fade-in text-center border border-orange-400/20">
          {showToast}
        </div>
      )}

      {/* Snap-Scrolling Reels Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar"
        id="mobile-reels-snap-container"
      >
        {liveAuctions.map((auction, index) => {
          const isActive = auction.id === activeAuctionId;
          const activeIndex = liveAuctions.findIndex(a => a.id === activeAuctionId);
          
          // Performance protection: load only current and next auction to preserve memory & networking
          const shouldLoad = index === activeIndex || index === activeIndex + 1;
          const currentReelPrice = isActive ? activePrice : (auction.currentPrice || 0);
          
          return (
            <MobileAuctionReel
              key={auction.id}
              auction={auction}
              isActive={isActive}
              shouldLoad={shouldLoad}
              isMuted={isMuted}
              isPlaying={isPlaying}
              onPlayPauseToggle={onPlayPauseToggle}
              activePrice={currentReelPrice}
              isSaved={isSaved}
              activeComments={activeComments}
              activeActivities={activeActivities}
              commentText={commentText}
              setCommentText={setCommentText}
              onCommentSubmit={onCommentSubmit}
              nextBidAmount={isActive ? nextBidAmount : minNextBid(currentReelPrice, auction.minIncrement, auction.totalBids || 0)}
              onBidExecute={onBidExecute}
              currentUser={currentUser}
              language={language}
              isAr={isAr}
              onOpenDetails={onOpenDetails}
              onMuteToggle={onMuteToggle}
              onShareClick={onShareClick}
              onSaveToggle={onSaveToggle}
              onLikeToggle={onLikeToggle}
              onClose={onClose}
            />
          );
        })}
      </div>
    </div>
  );
};

/* ======================================================================
   INDIVIDUAL MOBILE REEL COMPONENT
   ====================================================================== */
interface MobileAuctionReelProps {
  auction: any;
  isActive: boolean;
  shouldLoad: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  onPlayPauseToggle: () => void;
  activePrice: number;
  isSaved: boolean;
  activeComments: any[];
  activeActivities: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  nextBidAmount: number;
  onBidExecute: (amount: number) => void | Promise<{ success: boolean; message: string } | void>;
  currentUser: any;
  language: string;
  isAr: boolean;
  onOpenDetails: (id: string) => void;
  onMuteToggle: (e: React.MouseEvent) => void;
  onShareClick: (e: React.MouseEvent) => void;
  onSaveToggle: (e: React.MouseEvent) => void;
  onLikeToggle: (e: React.MouseEvent) => void;
  onClose: () => void;
}

const MobileAuctionReel: React.FC<MobileAuctionReelProps> = ({
  auction,
  isActive,
  shouldLoad,
  isMuted,
  isPlaying,
  onPlayPauseToggle,
  activePrice,
  isSaved,
  activeComments,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  nextBidAmount,
  onBidExecute,
  currentUser,
  language,
  isAr,
  onOpenDetails,
  onMuteToggle,
  onShareClick,
  onSaveToggle,
  onLikeToggle,
  onClose,
}) => {
  const { sellerProfiles, bids, orders, setActiveView, setGlobalSelectedOrderId } = useApp();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const t = translations[language as 'en' | 'ar'];

  const activeSellerProfile = sellerProfiles?.find(
    p => p.userId === auction?.sellerId || p.id === auction?.sellerId
  );

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const isEnded = isAuctionFinished(auction, serverNow());

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showChatInput, setShowChatInput] = useState(false);
  const [isChatHidden, setIsChatHidden] = useState(false);

  // States for micro-animations and feedback
  const [priceAnimate, setPriceAnimate] = useState(false);
  const [justBidded, setJustBidded] = useState(false);
  // Optimistic price override (submitting/pending live in useBidFlow below).
  const [optimisticPrice, setOptimisticPrice] = useState<number | null>(null);
  const [toastQueue, setToastQueue] = useState<{ id: string; text: string; icon: string }[]>([]);
  const [activeToast, setActiveToast] = useState<{ id: string; text: string; icon: string } | null>(null);

  // Optimistic price: show the just-placed bid instantly; never dip below the
  // real echo (a higher outbid overtakes it). Reconciled when the subscription
  // catches up — CountUp smooths any correction.
  const displayPrice = optimisticPrice != null ? Math.max(optimisticPrice, activePrice) : activePrice;

  // Reconcile: once the real (subscription) price reaches our optimistic value,
  // drop the override so live updates flow through unmodified.
  useEffect(() => {
    if (optimisticPrice != null && activePrice >= optimisticPrice) {
      setOptimisticPrice(null);
    }
  }, [activePrice, optimisticPrice]);

  // Trigger price micro-animation
  useEffect(() => {
    if (displayPrice > 0) {
      setPriceAnimate(true);
      const timer = setTimeout(() => setPriceAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [displayPrice]);

  // Per-reel countdown: each reel derives its OWN clock from its own endTime
  // (or scheduledStartAt before it opens) via serverNow(), so a swiped reel
  // never shows the active lot's time. Ticks only while loaded (2 reels max).
  const [reelTimeLeft, setReelTimeLeft] = useState<string>('00:00:00');
  useEffect(() => {
    if (!shouldLoad) return;
    const compute = () => {
      const open = isAuctionOpen(auction?.status);
      const target = !open && auction?.scheduledStartAt ? auction.scheduledStartAt : auction?.endTime;
      const remainingMs = (target ?? 0) - serverNow();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));

      // T-0 dead zone: scheduled start passed but the opener cron hasn't flipped it live.
      if (!open && (auction?.scheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
        setReelTimeLeft(isAr ? 'يبدأ الآن…' : 'Starting…');
        return;
      }
      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setReelTimeLeft(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      } else {
        setReelTimeLeft(isAr ? 'انتهى المزاد' : 'Auction ended');
      }
    };
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [shouldLoad, auction?.endTime, auction?.scheduledStartAt, auction?.status, isAr]);

  // Queue joined, liked, saved notifications
  useEffect(() => {
    if (activeActivities.length === 0) return;
    const latestAct = activeActivities[activeActivities.length - 1];
    if (!latestAct) return;

    let icon = '⭐';
    let text = '';
    if (latestAct.type === 'join') {
      icon = '⭐';
      text = isAr ? `${latestAct.name} انضم للبث` : `${latestAct.name} joined`;
    } else if (latestAct.type === 'like') {
      icon = '❤️';
      text = isAr ? `${latestAct.name} أعجب بالبث` : `${latestAct.name} liked the stream`;
    } else if (latestAct.type === 'save') {
      icon = '🔖';
      text = isAr ? `${latestAct.name} حفظ المعروض` : `${latestAct.name} bookmarked the lot`;
    } else {
      icon = '✨';
      text = isAr ? `${latestAct.name} ${latestAct.textAr}` : `${latestAct.name} ${latestAct.textEn}`;
    }

    setToastQueue((prev) => {
      if (prev.some((t) => t.id === latestAct.id)) return prev;
      return [...prev, { id: latestAct.id, text, icon }];
    });
  }, [activeActivities, isAr]);

  // Queue bid notifications from comments list
  useEffect(() => {
    if (activeComments.length === 0) return;
    const latestComment = activeComments[activeComments.length - 1];
    if (!latestComment) return;

    if (latestComment.isBid || latestComment.text.toLowerCase().includes('bid') || latestComment.text.toLowerCase().includes('عطاء') || latestComment.text.toLowerCase().includes('عطائه')) {
      const icon = '🔥';
      const text = latestComment.text;
      setToastQueue((prev) => {
        if (prev.some((t) => t.id === latestComment.id)) return prev;
        return [...prev, { id: latestComment.id, text, icon }];
      });
    }
  }, [activeComments]);

  // Handle single Toast execution loop
  useEffect(() => {
    if (activeToast || toastQueue.length === 0) return;

    const [nextToast, ...remaining] = toastQueue;
    setActiveToast(nextToast);
    setToastQueue(remaining);

    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 2500);

    return () => clearTimeout(timer);
  }, [toastQueue, activeToast]);

  // Filter normal comments to keep the chat feed extremely minimal
  const normalComments = useMemo(() => {
    return activeComments.filter(
      (msg) => !msg.isBid && !msg.text.toLowerCase().includes('bid') && !msg.text.toLowerCase().includes('عطاء')
    );
  }, [activeComments]);

  // Sync html5 video playback based on active reel, performance limits, and global isPlaying state
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;

    if (isActive && isPlaying && shouldLoad) {
      video.play().catch((err) => {
        console.warn("Playback prevented or interrupted:", err);
      });
    } else {
      video.pause();
    }
  }, [isActive, isPlaying, shouldLoad, auction.videoUrl]);

  // Sync muted property directly on element
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Bid logic status selectors
  const hasUserBid = auction?.id && bids ? bids.some(b => b.auctionId === auction.id && b.bidderId === currentUser?.id) : false;
  const isUserWinner = hasUserBid && auction?.currentBidderId === currentUser?.id;

  // --- The bid moment: confirm-then-bid + success rush ---
  const [showWinPill, setShowWinPill] = useState(false);
  const winPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justBiddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (winPillTimer.current) clearTimeout(winPillTimer.current);
    if (justBiddedTimer.current) clearTimeout(justBiddedTimer.current);
  }, []);

  // Execute wraps the callable with the reel's optimistic paint: reflect the bid
  // + "you're winning" instantly, then await. The subscription echo reconciles
  // the real price/winner; a rejection rolls the optimism back.
  const executeWithOptimism = async (amount: number) => {
    setOptimisticPrice(amount);
    setJustBidded(true);
    setShowWinPill(true);
    if (winPillTimer.current) clearTimeout(winPillTimer.current);
    winPillTimer.current = setTimeout(() => setShowWinPill(false), 1200);

    const res = await onBidExecute(amount);
    if (res && res.success) {
      markFirstBidDone(); // first successful bid retires the first-bid coach
      if (justBiddedTimer.current) clearTimeout(justBiddedTimer.current);
      justBiddedTimer.current = setTimeout(() => setJustBidded(false), 2500);
    } else {
      // Rejected (outbid, ended, membership, spam): roll back the optimism —
      // the real state (outbid banner + toast) governs from here.
      setOptimisticPrice(null);
      setJustBidded(false);
      setShowWinPill(false);
    }
    return res;
  };

  // Shared bid flow: membership gate (non-members never reach confirm) +
  // confirm step + in-flight submitting guard. Same handler the details modal uses.
  const { isMember, pendingBid, submitting, startBid, confirmBid, cancelBid } = useBidFlow(executeWithOptimism);

  // Tapping the bid button routes through the shared gate (invite → confirm).
  const handleLocalBid = () => {
    startBid(nextBidAmount);
  };

  // Anti-snipe drama: red pulsing countdown under 10s (active reel only)
  const msLeft = auction?.endTime ? auction.endTime - serverNow() : Infinity;
  const isSnipeWindow =
    isActive &&
    !isEnded &&
    isAuctionOpen(auction?.status) &&
    Number.isFinite(msLeft) &&
    msLeft > 0 &&
    msLeft < 10000;

  const getBidButtonText = () => {
    if (isUserWinner) {
      return isAr ? "أنت الأعلى حالياً" : "You are highest";
    }
    if (hasUserBid && !isUserWinner) {
      return isAr ? "زايد مرة أخرى" : "Bid Again";
    }
    return isAr ? "زايد الآن" : "Bid Now";
  };

  const getStatusMessage = () => {
    if (justBidded) {
      return isAr ? "تمت المزايدة 🎉" : "Bid placed successfully! 🎉";
    }
    if (hasUserBid) {
      if (isUserWinner) {
        return isAr ? "أنت الأعلى حالياً 🎉" : "You are currently the highest bidder 🎉";
      } else {
        return isAr ? "شخص آخر زايد أعلى منك ⚠️" : "Someone else bid higher than you ⚠️";
      }
    }
    return isAr ? "ابدأ المزايدة الآن لتفوز بالقطعة!" : "Place your first bid to win this lot!";
  };

  // If this reel is not selected to be loaded, return lightweight skeleton to save performance
  if (!shouldLoad) {
    return (
      <div 
        className="w-full h-full snap-start snap-always shrink-0 relative flex flex-col items-center justify-center bg-zinc-950"
        style={{ height: '100%' }}
      >
        <div className="w-10 h-10 border-4 border-t-orange-500 border-zinc-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full snap-start snap-always shrink-0 relative flex flex-col overflow-hidden bg-black"
      style={{ height: '100%' }}
    >
      <style>{`
        @keyframes slideDownFade {
          0% {
            opacity: 0;
            transform: translate(-50%, -15px);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          85% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -10px);
          }
        }
        .animate-slide-down-fade {
          animation: slideDownFade 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* HTML5 Live Video Element — falls back to the auction image when no video exists */}
      {auction.videoUrl ? (
        <video
          ref={localVideoRef}
          src={auction.videoUrl}
          loop
          muted={isMuted}
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover z-0"
          onClick={onPlayPauseToggle}
        />
      ) : (
        <img
          src={auction.thumbnailUrl || (auction as any).imageUrl || ''}
          alt={auction.title}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Gradient overlays for contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none z-10" />

      {/* Play/Pause standby overlay */}
      {!isPlaying && isActive && (
        <div 
          onClick={onPlayPauseToggle}
          className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer z-10 backdrop-blur-[1px]"
        >
          <div className="w-12 h-12 rounded-full bg-[#FF6B00] text-white flex items-center justify-center shadow-lg transition-transform active:scale-90">
            <Play className="w-5 h-5 ml-0.5 fill-white text-white" />
          </div>
        </div>
      )}

      {isActive && (
        <>
          {/* ======================================================================
              1. COMPACT TOP BAR (Seller & Stream Info)
              ====================================================================== */}
          <div 
            className="absolute left-4 right-4 z-30 flex items-center justify-between animate-fade-in" 
            style={{ 
              top: 'calc(env(safe-area-inset-top, 16px) + 12px)',
              direction: isAr ? 'rtl' : 'ltr' 
            }}
          >
            <div className="flex items-center gap-1.5">
              {/* Seller pill */}
              <div 
                onClick={() => {
                  if (activeSellerProfile) {
                    setSelectedProfileId(activeSellerProfile.userId);
                  }
                }}
                className="bg-black/35 backdrop-blur-xl border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-all"
              >
                {activeSellerProfile?.storeLogo ? (
                  <img 
                    src={activeSellerProfile.storeLogo} 
                    alt="Logo" 
                    className="w-5 h-5 rounded-full object-cover shrink-0" 
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#FF6B00] to-orange-400 flex items-center justify-center font-black text-white text-[9px] shrink-0">
                    {activeSellerProfile?.storeName?.[0] || 'M'}
                  </div>
                )}
                <div className="flex flex-col text-left rtl:text-right">
                  <span className="text-[9px] font-black text-white leading-none flex items-center gap-0.5">
                    {activeSellerProfile?.storeName || (isAr ? 'مزاد الأردن' : 'MAZAD JO')}
                    {isVerified && (
                      <ShieldCheck className={`w-2.5 h-2.5 ${isPremium ? 'text-amber-400' : 'text-emerald-400'}`} />
                    )}
                  </span>
                  <span className="text-[6.5px] text-orange-400 font-extrabold leading-none mt-0.5 uppercase tracking-wider">
                    🔴 LIVE
                  </span>
                </div>
              </div>

              {/* Bid count pill */}
              <div className="bg-black/20 backdrop-blur-xl border border-white/10 px-2 py-1 rounded-full flex items-center gap-1 shadow-md text-[9px] text-white font-bold leading-none h-7">
                <Eye className="w-3 h-3 text-zinc-300" />
                <span>{auction.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}</span>
              </div>
            </div>

            {/* Mute and Exit Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onMuteToggle}
                className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-xl flex items-center justify-center text-white border border-white/10 shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-xl flex items-center justify-center text-white border border-white/10 shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ======================================================================
              2. SINGLE FLOATING TOAST NOTIFICATION
              ====================================================================== */}
          {activeToast && (
            <div 
              style={{ top: 'calc(env(safe-area-inset-top, 16px) + 64px)' }}
              className="absolute left-1/2 -translate-x-1/2 z-40 bg-black/35 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-lg text-white pointer-events-none text-center max-w-[85%] animate-slide-down-fade"
            >
              <span className="text-xs shrink-0">{activeToast.icon}</span>
              <span className="text-[10px] font-extrabold tracking-wide text-zinc-100 whitespace-nowrap overflow-hidden text-ellipsis">
                {activeToast.text}
              </span>
            </div>
          )}

          {/* ======================================================================
              3. FLOATING ACTION PANEL (TikTok Side Actions)
              ====================================================================== */}
          <div 
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 210px)', direction: isAr ? 'rtl' : 'ltr' }}
            className="absolute right-4 z-20 flex flex-col gap-3.5 items-center select-none animate-fade-in"
          >
            {/* Like appreciation button */}
            <button
              onClick={onLikeToggle}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Heart className="w-4.5 h-4.5" />
            </button>

            {/* Save Bookmark button */}
            <button
              onClick={onSaveToggle}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Bookmark className={`w-4.5 h-4.5 ${isSaved ? 'text-[#FF6B00] fill-[#FF6B00]' : 'text-white'}`} />
            </button>

            {/* Share link button */}
            <button
              onClick={onShareClick}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Share2 className="w-4.5 h-4.5" />
            </button>

            {/* Specifications trigger */}
            <button
              onClick={() => onOpenDetails(auction.id)}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-amber-400 opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Award className="w-4.5 h-4.5" />
            </button>

            {/* Hide/Show Chat button */}
            <button
              onClick={() => setIsChatHidden(!isChatHidden)}
              className={`w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center shadow-md active:scale-90 transition-all cursor-pointer ${!isChatHidden ? 'bg-[#FF6B00] border-orange-400 text-white opacity-100' : 'bg-black/30 border-white/10 text-white opacity-75 hover:opacity-100'}`}
              title={isAr ? "إظهار/إخفاء المحادثة" : "Show/Hide Chat"}
            >
              <MessageSquare className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* ======================================================================
              4. COMPACT CHAT FEED (Tucked at bottom-left, avoids covering product)
              ====================================================================== */}
          {!isChatHidden && (
            <div 
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 210px)', direction: isAr ? 'rtl' : 'ltr' }}
              className="absolute left-4 right-20 max-h-[85px] z-20 pointer-events-none flex flex-col justify-end overflow-hidden animate-fade-in"
            >
              <div className="space-y-1 p-1 flex flex-col justify-end">
                {normalComments.slice(-2).map((msg) => (
                  <div 
                    key={`chat-reel-${auction.id}-${msg.id}`} 
                    className="bg-black/25 backdrop-blur-md border border-white/5 rounded-xl px-2.5 py-1.5 flex items-start gap-2 max-w-[95%] animate-fade-in pointer-events-auto shadow-sm"
                  >
                    <img 
                      src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                      alt="User" 
                      className="w-4 h-4 rounded-full object-cover border border-white/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <span className="text-[8.5px] font-black text-orange-400 leading-none block">
                        {msg.userName}
                      </span>
                      <p className="text-[9.5px] text-zinc-100 font-medium leading-tight mt-0.5">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat text box trigger */}
          <div 
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 172px)' }}
            className="absolute left-4 z-20"
          >
            <button
              onClick={() => setShowChatInput(!showChatInput)}
              className="bg-black/30 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] font-black text-white hover:bg-black/50 transition-colors"
            >
              {isAr ? '💬 اكتب تعليقاً...' : '💬 Send a message...'}
            </button>
          </div>

          {/* Floating Chat Input form */}
          {showChatInput && (
            <div 
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 172px)' }}
              className="absolute left-4 right-4 z-30 animate-fade-in"
            >
              <form 
                onSubmit={(e) => {
                  onCommentSubmit(e);
                  setShowChatInput(false);
                }}
                className="flex gap-2 bg-black/75 backdrop-blur-xl border border-white/10 p-1.5 rounded-xl shadow-lg w-full"
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                <input 
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={isAr ? 'اكتب تعليقاً عاماً...' : 'Send live message...'}
                  className="flex-grow h-8 px-2.5 bg-white/5 border border-white/10 rounded-lg text-zinc-100 text-[11px] placeholder-zinc-500 outline-none focus:border-[#FF6B00]/40 transition-colors"
                  autoFocus
                />
                <button 
                  type="submit"
                  className="h-8 w-8 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg transition-all flex items-center justify-center shrink-0 shadow-md cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* ======================================================================
              5. THE MAZAD LIVE-BIDDING CARD (Strictly 5 Required Elements)
              ====================================================================== */}
          <div 
            style={{ 
              bottom: 'calc(env(safe-area-inset-bottom, 16px) + 8px)',
              direction: isAr ? 'rtl' : 'ltr'
            }}
            className="absolute left-4 right-4 z-20 bg-black/45 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl flex flex-col gap-3.5 overflow-hidden select-none animate-fade-in"
            id={`bidding-card-${auction.id}`}
          >
            {/* Row 1: Product Title & Time Left (aligned nicely) */}
            <div className="flex justify-between items-center gap-3">
              <h3 className="text-sm font-black text-white truncate max-w-[70%]">
                {auction.title}
              </h3>
              
              <motion.div
                animate={isSnipeWindow ? { scale: [1, 1.08, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                transition={isSnipeWindow ? { duration: 1, ease: 'easeOut', repeat: Infinity } : { duration: 0.2, ease: 'easeOut' }}
                className={`inline-flex items-center gap-1 bg-black/50 border border-white/10 px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono ${isSnipeWindow ? 'text-red-400' : 'text-emerald-400'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${isSnipeWindow ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                <span>{reelTimeLeft}</span>
              </motion.div>
            </div>

            {/* Row 2: Current Bid */}
            <div className="flex items-center justify-between border-t border-b border-white/5 py-2">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                {isAr ? 'العطاء الحالي' : 'CURRENT BID'}
              </span>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl font-black text-[#FF6B00] font-mono transition-all duration-300 ${priceAnimate ? 'scale-110 text-amber-400' : 'scale-100'}`}>
                  <CountUp value={displayPrice} format={(n) => Math.round(n).toLocaleString()} />
                </span>
                <span className="text-[11px] font-bold text-white/70">JOD</span>
              </div>
            </div>

            {isEnded ? (
              <div className="w-full bg-black/75 border border-amber-500/30 rounded-xl p-3 text-center backdrop-blur-md flex flex-col items-center justify-center gap-2 shadow-xl">
                {(() => {
                  const hasUserBid = auction?.id && bids ? bids.some(b => b.auctionId === auction.id && b.bidderId === currentUser?.id) : false;
                  const isUserWinner = hasUserBid && auction?.currentBidderId === currentUser?.id;
                  
                  if (isUserWinner) {
                    return (
                      <>
                        <span className="text-emerald-400 font-black text-xs block">
                          {isAr ? 'مبروك 🎉 ربحت المزاد' : 'Congratulations! You won'}
                        </span>
                        {auction?.marketPrice && auction.marketPrice > activePrice ? (
                          <span className="text-emerald-300/80 text-[10.5px] font-bold block">
                            {isAr
                              ? `وفّرت ${auction.marketPrice - activePrice} دينار (السعر ${auction.marketPrice})`
                              : `You saved ${auction.marketPrice - activePrice} JOD (worth ${auction.marketPrice})`}
                          </span>
                        ) : null}
                        <button
                          onClick={() => {
                            const matchingOrder = orders?.find(o => o.auctionId === auction?.id && o.buyerId === currentUser?.id);
                            if (matchingOrder) {
                              setGlobalSelectedOrderId(matchingOrder.id);
                            }
                            setActiveView('orders');
                          }}
                          className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-black shadow-md cursor-pointer"
                        >
                          {isAr ? 'عرض الطلب' : 'View Order'}
                        </button>
                      </>
                    );
                  } else {
                    return (
                      <span className="text-zinc-300 text-xs font-bold block">
                        {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                      </span>
                    );
                  }
                })()}
              </div>
            ) : !isAuctionOpen(auction?.status) ? (
              <div className="w-full rounded-xl bg-neutral-800 text-white text-center p-4">
                <div className="text-sm opacity-80">{isAr ? 'يبدأ المزاد' : 'Auction starts'}</div>
                <div className="text-lg font-bold">
                  {auction?.scheduledStartAt ? formatAmmanClock(auction.scheduledStartAt) : (isAr ? 'قريباً' : 'Soon')}
                </div>
              </div>
            ) : (
              <>
                {/* Row 3: Winning / Outbid status feed with instant feedback */}
                {(() => {
                  const isLosing = hasUserBid && !isUserWinner && !justBidded;
                  return (
                    <motion.div
                      key={isLosing ? 'outbid' : 'status'}
                      initial={{ boxShadow: '0 0 0 0 rgba(244,63,94,0)' }}
                      animate={
                        isLosing
                          ? {
                              boxShadow: [
                                '0 0 0 0 rgba(244,63,94,0)',
                                '0 0 0 5px rgba(244,63,94,0.25)',
                                '0 0 0 0 rgba(244,63,94,0)',
                                '0 0 0 5px rgba(244,63,94,0.25)',
                                '0 0 0 0 rgba(244,63,94,0)',
                              ],
                            }
                          : { boxShadow: '0 0 0 0 rgba(244,63,94,0)' }
                      }
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className={`py-1.5 px-3 rounded-xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-black tracking-wide border transition-all duration-300 ${
                        justBidded
                          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400 animate-pulse"
                          : isUserWinner
                          ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
                          : isLosing
                          ? "bg-rose-500/15 border-rose-500/25 text-rose-400"
                          : "bg-white/5 border-white/5 text-zinc-400"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {justBidded && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                        <span>{getStatusMessage()}</span>
                      </span>
                      {isLosing && (
                        <Pressable
                          disabled={submitting}
                          onClick={() => startBid(nextBidAmount)}
                          className="w-full py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white text-[10px] font-black shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>{isAr ? `زايد ${nextBidAmount.toLocaleString()} د.أ لاستعادة الصدارة` : `Bid ${nextBidAmount.toLocaleString()} JD to retake the lead`}</span>
                        </Pressable>
                      )}
                    </motion.div>
                  );
                })()}

                {/* One-time first-bid coach for active members who have never bid */}
                <FirstBidCoach
                  show={isActive && currentUser?.subscriptionStatus === 'active'}
                  isAr={isAr}
                />

                {/* Row 4: Single HUGE Thumb-Tappable Bid Button (opens the inline confirm) */}
                <Pressable
                  disabled={currentUser?.isBlocked || submitting}
                  onClick={handleLocalBid}
                  className="w-full h-14 bg-[#FF6B00] hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700/50 text-white border border-orange-400/20 font-black rounded-2xl flex flex-col items-center justify-center transition-colors shadow-[0_4px_20px_rgba(255,107,0,0.3)] cursor-pointer"
                >
                  {!isMember ? (
                    <span className="text-sm tracking-wide font-black">
                      {t.joinToBid}
                    </span>
                  ) : submitting ? (
                    <span className="flex items-center gap-2 text-sm tracking-wide font-black">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isAr ? 'جارٍ الإرسال…' : 'Placing bid…'}
                    </span>
                  ) : (
                    <>
                      <span className="text-sm tracking-wide font-black">
                        {getBidButtonText()}
                      </span>
                      <span className="text-[10px] opacity-80 font-bold font-mono mt-0.5">
                        {isAr ? `زايد ${nextBidAmount} د.أ` : `Bid ${nextBidAmount} JD`}
                      </span>
                    </>
                  )}
                </Pressable>
                <p className="text-[11px] text-gray-400 text-center mt-1">
                  {isAr
                    ? `المجموع عند الفوز: ${totalWithPremium(nextBidAmount).toLocaleString()} د.أ (شامل عمولة المشتري ٥٪)`
                    : `Total if you win: ${totalWithPremium(nextBidAmount).toLocaleString()} JOD (incl. 5% buyer's premium)`}
                </p>
              </>
            )}

            {/* Inline bid confirmation (anchored to the bidding card, auto-dismisses) */}
            <BidConfirm
              amount={pendingBid}
              isAr={isAr}
              onConfirm={confirmBid}
              onCancel={cancelBid}
            />

            {/* Winning pill: pops over the bidding card on a successful bid */}
            <WinningPill show={showWinPill} isAr={isAr} />
          </div>
        </>
      )}

      {/* Complete Seller Profile Modal */}
      {selectedProfileId && (
        <SellerProfileModal 
          sellerId={selectedProfileId}
          isOpen={true}
          onClose={() => setSelectedProfileId(null)}
        />
      )}
    </div>
  );
};
