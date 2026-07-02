import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { SellerProfileModal } from './SellerProfileModal';
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
  ShieldCheck
} from 'lucide-react';
import { SwipeToBid } from './SwipeToBid';

interface MobileLiveAuctionLayoutProps {
  liveAuctions: any[];
  activeAuctionId: string;
  onSelectAuction: (id: string) => void;
  activeAuction: any;
  activePrice: number;
  timeLeftStr: string;
  isMuted: boolean;
  isPlaying: boolean;
  onMuteToggle: (e: React.MouseEvent) => void;
  onPlayPauseToggle: () => void;
  onShareClick: (e: React.MouseEvent) => void;
  onSaveToggle: (e: React.MouseEvent) => void;
  onLikeToggle: (e: React.MouseEvent) => void;
  isSaved: boolean;
  viewerCount: number;
  activeComments: any[];
  activeActivities: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  nextBidAmount: number;
  onBidExecute: (amount: number) => void;
  wallet: any;
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
  timeLeftStr,
  isMuted,
  isPlaying,
  onMuteToggle,
  onPlayPauseToggle,
  onShareClick,
  onSaveToggle,
  onLikeToggle,
  isSaved,
  viewerCount,
  activeComments,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  nextBidAmount,
  onBidExecute,
  wallet,
  currentUser,
  language,
  isAr,
  onOpenDetails,
  showToast,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { sellerProfiles } = useApp();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const activeSellerProfile = sellerProfiles?.find(
    p => p.userId === activeAuction?.sellerId || p.id === activeAuction?.sellerId
  );

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const isEnded = activeAuction?.status === 'completed' || (activeAuction?.endTime ? activeAuction.endTime <= Date.now() : false);

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
        {liveAuctions.map((auction) => {
          const isActive = auction.id === activeAuctionId;
          
          return (
            <MobileAuctionReel
              key={auction.id}
              auction={auction}
              isActive={isActive}
              isMuted={isMuted}
              isPlaying={isPlaying}
              onPlayPauseToggle={onPlayPauseToggle}
              activePrice={activePrice}
              timeLeftStr={timeLeftStr}
              isSaved={isSaved}
              viewerCount={viewerCount}
              activeComments={activeComments}
              activeActivities={activeActivities}
              commentText={commentText}
              setCommentText={setCommentText}
              onCommentSubmit={onCommentSubmit}
              nextBidAmount={nextBidAmount}
              onBidExecute={onBidExecute}
              wallet={wallet}
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
  isMuted: boolean;
  isPlaying: boolean;
  onPlayPauseToggle: () => void;
  activePrice: number;
  timeLeftStr: string;
  isSaved: boolean;
  viewerCount: number;
  activeComments: any[];
  activeActivities: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  nextBidAmount: number;
  onBidExecute: (amount: number) => void;
  wallet: any;
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
  isMuted,
  isPlaying,
  onPlayPauseToggle,
  activePrice,
  timeLeftStr,
  isSaved,
  viewerCount,
  activeComments,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  nextBidAmount,
  onBidExecute,
  wallet,
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
  const { sellerProfiles } = useApp();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const activeSellerProfile = sellerProfiles?.find(
    p => p.userId === auction?.sellerId || p.id === auction?.sellerId
  );

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const isEnded = auction?.status === 'completed' || (auction?.endTime ? auction.endTime <= Date.now() : false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showChatInput, setShowChatInput] = useState(false);

  // States for micro-animations and unified top toast notifications
  const [priceAnimate, setPriceAnimate] = useState(false);
  const [toastQueue, setToastQueue] = useState<{ id: string; text: string; icon: string }[]>([]);
  const [activeToast, setActiveToast] = useState<{ id: string; text: string; icon: string } | null>(null);

  // Trigger price micro-animation
  useEffect(() => {
    if (activePrice > 0) {
      setPriceAnimate(true);
      const timer = setTimeout(() => setPriceAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [activePrice]);

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

  // Handle single Toast execution loop (automatically disappears after 2-3 seconds)
  useEffect(() => {
    if (activeToast || toastQueue.length === 0) return;

    const [nextToast, ...remaining] = toastQueue;
    setActiveToast(nextToast);
    setToastQueue(remaining);

    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 2500); // 2.5s display duration

    return () => clearTimeout(timer);
  }, [toastQueue, activeToast]);

  // Filter normal comments to keep the chat feed extremely minimal and transparent
  const normalComments = useMemo(() => {
    return activeComments.filter(
      (msg) => !msg.isBid && !msg.text.toLowerCase().includes('bid') && !msg.text.toLowerCase().includes('عطاء')
    );
  }, [activeComments]);

  // Sync html5 video playback based on active reel and global isPlaying state
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;

    if (isActive && isPlaying) {
      video.play().catch((err) => {
        console.warn("Playback prevented or interrupted:", err);
      });
    } else {
      video.pause();
    }
  }, [isActive, isPlaying, auction.videoUrl]);

  // Sync muted property directly on element
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  return (
    <div 
      className="w-full h-full snap-start snap-always shrink-0 relative flex flex-col overflow-hidden bg-black"
      style={{ height: '100%' }}
    >
      {/* CSS keyframes injected locally for robust, failproof animations */}
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

      {/* HTML5 Live Video Element */}
      <video
        ref={localVideoRef}
        src={auction.videoUrl}
        loop
        muted={isMuted}
        playsInline
        preload={isActive ? "auto" : "none"}
        className="absolute inset-0 w-full h-full object-cover z-0"
        onClick={onPlayPauseToggle}
      />

      {/* Subtle glassmorphic and gradient overlays for contrast without solid black masks */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none z-10" />

      {/* Play/Pause Standby overlay button */}
      {!isPlaying && isActive && (
        <div 
          onClick={onPlayPauseToggle}
          className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer z-10 backdrop-blur-[2px]"
        >
          <div className="w-12 h-12 rounded-full bg-[#FF6B00] text-white flex items-center justify-center shadow-lg transition-transform active:scale-90">
            <Play className="w-5 h-5 ml-0.5 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Only display overlays, chat and bidding tools if this reel is the active one */}
      {isActive && (
        <>
          {/* ======================================================================
              1. COMPACT TOP BAR (Seller & Stream Information) - Safe Area Guarded
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

              {/* Viewer Pill */}
              <div className="bg-black/20 backdrop-blur-xl border border-white/10 px-2 py-1 rounded-full flex items-center gap-1 shadow-md text-[9px] text-white font-bold leading-none h-7">
                <Eye className="w-3 h-3 text-zinc-300" />
                <span>{viewerCount.toLocaleString()}</span>
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
              2. SINGLE FLOATING TOAST NOTIFICATION - Floating near the top
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
              3. GLASSY RIGHT ACTION PANEL (TikTok & Instagram style, compact 44px)
              ====================================================================== */}
          <div 
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 190px)', direction: isAr ? 'rtl' : 'ltr' }}
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

            {/* Chat button */}
            <button
              onClick={() => setShowChatInput(!showChatInput)}
              className={`w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center shadow-md active:scale-90 transition-all cursor-pointer ${showChatInput ? 'bg-[#FF6B00] border-orange-400 text-white opacity-100' : 'bg-black/30 border-white/10 text-white opacity-75 hover:opacity-100'}`}
            >
              <MessageSquare className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* ======================================================================
              4. ULTRA COMPACT FLOATING CHAT FEED (Tucked safely at bottom-left)
              ====================================================================== */}
          <div 
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 190px)', direction: isAr ? 'rtl' : 'ltr' }}
            className="absolute left-4 right-20 max-h-[85px] z-20 pointer-events-none flex flex-col justify-end overflow-hidden animate-fade-in"
          >
            <div className="space-y-1 p-1 flex flex-col justify-end">
              {/* Display latest 2 normal comments cleanly */}
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

          {/* ======================================================================
              5. DYNAMIC CHAT INPUT
              ====================================================================== */}
          {showChatInput && (
            <div 
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 16px) + 190px)' }}
              className="absolute left-4 right-4 z-30 animate-fade-in"
            >
              <form 
                onSubmit={(e) => {
                  onCommentSubmit(e);
                  setShowChatInput(false);
                }}
                className="flex gap-2 bg-black/45 backdrop-blur-xl border border-white/10 p-1.5 rounded-xl shadow-lg w-full"
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
              6. PREMIUM GLASSMORPHISM BOTTOM BIDDING CARD (Height reduced by 35%)
              ====================================================================== */}
          <div 
            style={{ 
              bottom: 'calc(env(safe-area-inset-bottom, 16px) + 8px)',
              direction: isAr ? 'rtl' : 'ltr'
            }}
            className="absolute left-4 right-4 z-20 bg-black/35 backdrop-blur-xl border border-white/10 p-2.5 rounded-2xl shadow-xl flex flex-col gap-2 overflow-hidden select-none animate-fade-in"
            id={`bidding-card-${auction.id}`}
          >
            {/* Top row: Active Lot Info (Left) and Current Bid/Timer (Right) */}
            <div className="flex justify-between items-start gap-2 border-b border-white/5 pb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[8px] font-black text-[#FF6B00] tracking-wider uppercase leading-none mb-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <span>{isAr ? 'المعروض الحالي' : 'ACTIVE LOT'}</span>
                </div>
                <h3 className="text-xs font-black text-white truncate leading-tight">
                  {auction.title}
                </h3>
                <span className="text-[9px] text-zinc-400 font-medium leading-none block mt-0.5">
                  by {activeSellerProfile?.storeName || (isAr ? 'مزاد الأردن' : 'MAZAD JO')}
                </span>
              </div>
              
              <div className="text-right shrink-0">
                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-wider block leading-none">
                  {isAr ? 'العطاء الحالي' : 'CURRENT BID'}
                </span>
                <div className="flex items-baseline justify-end gap-0.5 mt-0.5">
                  <span className={`text-sm font-black text-[#FF6B00] font-mono leading-none transition-all duration-300 ${priceAnimate ? 'scale-110 text-amber-400' : 'scale-100'}`}>
                    {activePrice.toLocaleString()}
                  </span>
                  <span className="text-[9px] font-black text-white/70">JOD</span>
                </div>
                {/* Compact countdown badge */}
                <div className="inline-flex items-center gap-1 bg-black/45 px-1.5 py-0.5 rounded border border-white/5 mt-1.5">
                  <span className="text-[8px] font-black text-emerald-400 font-mono leading-none">{timeLeftStr}</span>
                </div>
              </div>
            </div>

            {isEnded ? (
              <div className="w-full bg-black/50 border border-emerald-500/20 rounded-xl p-2.5 text-center backdrop-blur-md flex flex-col items-center justify-center gap-1 shadow-md">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-extrabold flex items-center gap-1">
                  🏁 {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                </span>
                <span className="text-white text-xs font-bold">
                  {isAr ? 'الفائز' : 'Winner'}: <span className="text-amber-400 font-black">{auction?.currentBidderName || (isAr ? 'لا يوجد عطاء' : 'No bids placed')}</span>
                </span>
                {auction?.currentBidderName && (
                  <span className="text-[10px] font-semibold text-zinc-300">
                    {isAr ? 'سعر البيع' : 'Winning Price'}: <span className="text-emerald-400 font-black">{activePrice} JOD</span>
                  </span>
                )}
              </div>
            ) : (
              <>
                {/* Tighter bid increments */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[10, 25, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onBidExecute(activePrice + val)}
                      className="py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-0.5 hover:bg-white/10"
                    >
                      +{val} <span className="text-[8px] opacity-60 font-medium">{isAr ? 'د.أ' : 'JD'}</span>
                    </button>
                  ))}
                </div>

                {/* Swipe To Bid CTA */}
                <div className="w-full">
                  <SwipeToBid
                    amount={nextBidAmount}
                    onSwipeSuccess={() => onBidExecute(nextBidAmount)}
                    disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
                    language={language as 'en' | 'ar'}
                  />
                </div>
              </>
            )}
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
