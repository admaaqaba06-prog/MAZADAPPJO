import React, { useRef, useEffect, useState } from 'react';
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

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showChatInput, setShowChatInput] = useState(false);

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
      {/* HTML5 Live Video Element */}
      <video
        ref={localVideoRef}
        src={auction.videoUrl}
        loop
        muted={isMuted}
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        onClick={onPlayPauseToggle}
      />

      {/* Subtle glassmorphic and gradient overlays for contrast without solid black masks */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none z-10" />

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
              1. COMPACT TOP BAR (Seller & Stream Information)
              ====================================================================== */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between animate-fade-in" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
            <div className="flex items-center gap-1.5">
              {/* Seller pill */}
              <div 
                onClick={() => {
                  if (activeSellerProfile) {
                    setSelectedProfileId(activeSellerProfile.userId);
                  }
                }}
                className="bg-black/40 backdrop-blur-xl border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-all"
              >
                {activeSellerProfile?.storeLogo ? (
                  <img 
                    src={activeSellerProfile.storeLogo} 
                    alt="Logo" 
                    className="w-5.5 h-5.5 rounded-full object-cover shrink-0" 
                  />
                ) : (
                  <div className="w-5.5 h-5.5 rounded-full bg-gradient-to-tr from-[#FF6B00] to-orange-400 flex items-center justify-center font-black text-white text-[9.5px] shrink-0">
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
              <div className="bg-black/25 backdrop-blur-xl border border-white/10 px-2 py-1.5 rounded-full flex items-center gap-1 shadow-md text-[9px] text-white font-bold leading-none h-7.5">
                <Eye className="w-3 h-3 text-zinc-300" />
                <span>{viewerCount.toLocaleString()}</span>
              </div>
            </div>

            {/* Mute and Exit Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onMuteToggle}
                className="w-8 h-8 rounded-full bg-black/25 backdrop-blur-xl flex items-center justify-center text-white border border-white/10 shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              </button>
              
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/25 backdrop-blur-xl flex items-center justify-center text-white border border-white/10 shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ======================================================================
              2. GLASSY RIGHT ACTION PANEL
              ====================================================================== */}
          <div 
            className="absolute right-4 bottom-[230px] z-20 flex flex-col gap-3.5 items-center select-none animate-fade-in"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
          >
            {/* Like appreciation button */}
            <button
              onClick={onLikeToggle}
              className="flex flex-col items-center gap-0.5 group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-black/25 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-md active:scale-90 transition-all hover:bg-red-500/10">
                <Heart className="w-4.5 h-4.5 text-white fill-none group-hover:scale-110 group-hover:text-red-500 transition-all" />
              </div>
              <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wide drop-shadow-sm">
                {isAr ? 'تفاعل' : 'Like'}
              </span>
            </button>

            {/* Save Bookmark button */}
            <button
              onClick={onSaveToggle}
              className="flex flex-col items-center gap-0.5 group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-black/25 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-md active:scale-90 transition-all">
                <Bookmark className={`w-4.5 h-4.5 transition-all group-hover:scale-110 ${isSaved ? 'text-[#FF6B00] fill-[#FF6B00]' : 'text-white'}`} />
              </div>
              <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wide drop-shadow-sm">
                {isAr ? 'حفظ' : 'Save'}
              </span>
            </button>

            {/* Share link button */}
            <button
              onClick={onShareClick}
              className="flex flex-col items-center gap-0.5 group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-black/25 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-md active:scale-90 transition-all">
                <Share2 className="w-4.5 h-4.5 text-white group-hover:scale-110 transition-all" />
              </div>
              <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wide drop-shadow-sm">
                {isAr ? 'نشر' : 'Share'}
              </span>
            </button>

            {/* Specifications specifications sheet trigger */}
            <button
              onClick={() => onOpenDetails(auction.id)}
              className="flex flex-col items-center gap-0.5 group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-black/25 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-md active:scale-90 transition-all">
                <Award className="w-4.5 h-4.5 text-amber-400 group-hover:scale-110 transition-all" />
              </div>
              <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wide drop-shadow-sm">
                {isAr ? 'الوصف' : 'Specs'}
              </span>
            </button>

            {/* Chat button (triggers inline input collapse toggle) */}
            <button
              onClick={() => setShowChatInput(!showChatInput)}
              className="flex flex-col items-center gap-0.5 group cursor-pointer"
            >
              <div className={`w-9 h-9 rounded-full backdrop-blur-xl border flex items-center justify-center shadow-md active:scale-90 transition-all ${showChatInput ? 'bg-[#FF6B00] border-orange-400 text-white' : 'bg-black/25 border-white/10 text-white'}`}>
                <MessageSquare className="w-4.5 h-4.5" />
              </div>
              <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wide drop-shadow-sm">
                {isAr ? 'دردشة' : 'Chat'}
              </span>
            </button>
          </div>

          {/* ======================================================================
              3. GLASSY CHAT FEED (Latest 2 Messages as Floating Bubbles)
              ====================================================================== */}
          <div 
            className="absolute left-4 bottom-[230px] right-20 h-[105px] z-20 pointer-events-none flex flex-col justify-end overflow-hidden animate-fade-in"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
          >
            <div className="space-y-1.5 p-1 flex flex-col justify-end">
              {/* Latest active activities or system notifications */}
              {activeActivities.slice(-1).map((act) => (
                <div 
                  key={`act-reel-${auction.id}-${act.id}`}
                  className="bg-orange-600/25 backdrop-blur-xl border border-orange-500/20 px-3 py-1.5 rounded-xl text-white flex items-center gap-1.5 shadow-sm animate-fade-in max-w-[95%]"
                >
                  <span className="text-[10px] font-black text-amber-300">★</span>
                  <p className="text-[10px] font-black truncate leading-tight">
                    <span className="text-orange-200 font-extrabold mr-1">{act.name}</span>
                    {isAr ? act.textAr : act.textEn}
                  </p>
                </div>
              ))}

              {/* Latest 2 floating bubbles chat feed */}
              {activeComments.slice(-2).map((msg) => {
                const isBidMsg = msg.isBid;
                return (
                  <div 
                    key={`chat-reel-${auction.id}-${msg.id}`} 
                    className={`${
                      isBidMsg 
                        ? 'bg-[#FF6B00]/15 border border-[#FF6B00]/30' 
                        : 'bg-black/25 border border-white/10'
                    } backdrop-blur-xl rounded-xl p-2 flex items-start gap-2 max-w-[95%] animate-fade-in pointer-events-auto shadow-sm`}
                  >
                    <img 
                      src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                      alt="User" 
                      className="w-5 h-5 rounded-full object-cover border border-white/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-orange-400 leading-none block">
                        {msg.userName}
                      </span>
                      <p className="text-[10px] text-zinc-100 font-medium leading-tight mt-0.5">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ======================================================================
              4. DYNAMIC CHAT INPUT (Only shows when chat button is toggled)
              ====================================================================== */}
          {showChatInput && (
            <div className="absolute bottom-[230px] left-4 right-4 z-30 animate-fade-in">
              <form 
                onSubmit={(e) => {
                  onCommentSubmit(e);
                  setShowChatInput(false); // Collapse immediately on send
                }}
                className="flex gap-2 bg-black/35 backdrop-blur-xl border border-white/10 p-1.5 rounded-xl shadow-lg w-full"
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
              5. COMPACT GLASSMORTPHISM BOTTOM BIDDING CARD (Max-height < 28vh)
              ====================================================================== */}
          <div 
            className="absolute bottom-4 left-4 right-4 z-20 bg-black/35 backdrop-blur-xl border border-white/10 p-3 rounded-2xl shadow-xl flex flex-col gap-2.5 max-h-[28vh] overflow-hidden select-none animate-fade-in"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id={`bidding-card-${auction.id}`}
          >
            {/* Active Lot Header info */}
            <div className="flex justify-between items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[8px] font-black text-[#FF6B00] tracking-wider uppercase leading-none mb-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <span>{isAr ? 'المعروض الحالي' : 'ACTIVE LOT'}</span>
                </div>
                <h3 className="text-[11px] font-black text-white truncate leading-tight">
                  {auction.title}
                </h3>
              </div>
              
              {/* Floating count down pill */}
              <div className="bg-black/40 px-2 py-0.5 rounded-md border border-white/5 text-right flex flex-col shrink-0 leading-none">
                <span className="text-[7px] text-zinc-400 font-extrabold uppercase leading-none">{isAr ? 'متبقي' : 'TIME'}</span>
                <span className="text-[9.5px] font-black text-emerald-400 font-mono mt-0.5 leading-none">
                  {timeLeftStr}
                </span>
              </div>
            </div>

            {/* Prices details row */}
            <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
              <div>
                <span className="text-[7px] text-zinc-400 font-black tracking-wider block leading-none">{isAr ? 'أعلى عطاء حالي' : 'CURRENT BID'}</span>
                <span className="text-xs font-black text-[#FF6B00] font-mono block mt-0.5 leading-none">
                  {activePrice.toLocaleString()} <span className="text-[8.5px] font-bold text-white/50">{isAr ? 'د.أ' : 'JOD'}</span>
                </span>
              </div>
              <div 
                onClick={() => {
                  if (activeSellerProfile) {
                    setSelectedProfileId(activeSellerProfile.userId);
                  }
                }}
                className="text-right cursor-pointer active:scale-95 transition-all"
              >
                <span className="text-[7px] text-zinc-400 font-black tracking-wider block leading-none">{isAr ? 'البائع' : 'SELLER'}</span>
                <span className="text-[9.5px] font-extrabold text-amber-400 block mt-0.5 leading-none uppercase flex items-center gap-0.5 justify-end">
                  {isVerified && (
                    <ShieldCheck className={`w-3 h-3 ${isPremium ? 'text-amber-400' : 'text-emerald-400'}`} />
                  )}
                  <span>{activeSellerProfile?.storeName || (isAr ? 'مزاد الأردن' : 'MAZAD JO')}</span>
                </span>
              </div>
            </div>

            {/* Quick multi bid buttons float over the video like TikTok LIVE gifts */}
            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onBidExecute(activePrice + val)}
                  className="py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-0.5"
                >
                  +{val} <span className="text-[9px] opacity-60 font-medium">{isAr ? 'د.أ' : 'JD'}</span>
                </button>
              ))}
            </div>

            {/* Swipe to bid handle */}
            <div className="w-full">
              <SwipeToBid
                amount={nextBidAmount}
                onSwipeSuccess={() => onBidExecute(nextBidAmount)}
                disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
                language={language as 'en' | 'ar'}
              />
            </div>
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
