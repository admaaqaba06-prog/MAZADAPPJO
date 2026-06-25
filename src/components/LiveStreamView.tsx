import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Gavel, 
  Volume2, 
  VolumeX, 
  Bell, 
  Heart, 
  MessageSquare, 
  Share2, 
  Bookmark, 
  X, 
  Sparkles, 
  FolderLock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { SwipeToBid } from './SwipeToBid';

// --- MAIN REELS COMPONENT ---
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
    sendChatMessage
  } = useApp();

  const isAr = language === 'ar';
  const containerRef = useRef<HTMLDivElement>(null);

  // Global mute state so unmuting one unmutes all reels (Standard reels UX)
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showToast, setShowToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  // Get live and upcoming auctions
  const liveAuctions = useMemo(() => {
    const filtered = auctions.filter(a => a.status === 'live' || a.status === 'upcoming');
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

  if (liveAuctions.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center bg-[#111111] p-6 text-gray-400 font-sans h-full" id="no-live-stream-fallback">
        <FolderLock className="w-12 h-12 text-[#FF6B00] mb-3 animate-bounce" />
        <h3 className="font-extrabold text-sm uppercase text-white">{isAr ? 'لا يوجد بثوث نشطة حالياً' : 'No channels active'}</h3>
        <p className="text-xs text-gray-500 max-w-xs mt-1">
          {isAr ? 'يرجى تقديم مزاد جديد عبر زر الإنشاء ومن ثم اعتماده لفتحه فوراً!' : 'Submit a lot from the creator wizard and approve it to open it!'}
        </p>
        <button 
          onClick={() => setActiveView('discovery')}
          className="mt-6 px-5 py-2.5 bg-[#FF6B00] text-white rounded-xl text-xs font-black shadow-md uppercase hover:bg-orange-500 transition-colors cursor-pointer"
        >
          {isAr ? 'العودة للرئيسية' : 'Back to Home'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] flex overflow-hidden" id="reels-view-root">
      
      {/* Toast Overlay */}
      {showToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#FF6B00] text-white px-4 py-2 rounded-xl text-[11px] font-black tracking-wide shadow-[0_8px_32px_rgba(255,107,0,0.35)] animate-bounce text-center">
          {showToast}
        </div>
      )}

      {/* 1. DESKTOP ONLY: LEFT SIDEBAR (All Live Reels List) */}
      <aside className="hidden lg:flex flex-col w-[260px] bg-zinc-950 border-r border-white/5 p-4 shrink-0 overflow-y-auto" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
        <h3 className="text-xs font-black tracking-wider text-zinc-400 mb-4 uppercase font-sans">
          {isAr ? 'البثوث النشطة حالياً 🔴' : 'ACTIVE REELS 🔴'}
        </h3>
        <div className="space-y-3">
          {liveAuctions.map((item) => {
            const isActive = item.id === activeAuctionId;
            return (
              <button
                key={item.id}
                onClick={() => setActiveAuctionId(item.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all border text-left ${
                  isActive 
                    ? 'bg-zinc-900 border-[#FF6B00]/40 text-white font-black shadow-[0_4px_12px_rgba(255,107,0,0.15)]' 
                    : 'bg-transparent border-transparent hover:bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                }`}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                <div className="w-12 h-16 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-white/10 relative">
                  <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  {isActive && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-ping" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-grow">
                  <h4 className="text-[11.5px] font-black truncate">{item.title}</h4>
                  <p className="text-[9.5px] text-[#FF6B00] font-bold mt-0.5">{item.currentPrice.toLocaleString()} JD</p>
                  <span className="inline-block text-[8px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded mt-1">
                    {item.category || (isAr ? 'مزاد' : 'Auction')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 2. REELS VERTICAL FEED CONTAINER */}
      <div 
        ref={containerRef}
        className="flex-1 w-full h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar select-none relative bg-zinc-950"
        style={{ scrollbarWidth: 'none' }}
        id="reels-feed-scroll"
      >
        {liveAuctions.map((item) => {
          const isActive = item.id === activeAuctionId;
          return (
            <ReelCard 
              key={item.id}
              item={item}
              isActive={isActive}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              triggerToast={triggerToast}
              onVisible={() => {
                if (activeAuctionId !== item.id) {
                  setActiveAuctionId(item.id);
                }
              }}
              placeBid={placeBid}
              currentUser={currentUser}
              wallet={wallet}
              watchlist={watchlist}
              toggleWatchlist={toggleWatchlist}
              chatMessages={chatMessages}
              sendChatMessage={sendChatMessage}
              language={language}
              isAr={isAr}
            />
          );
        })}
      </div>

    </div>
  );
};

// --- SINGLE REEL CARD COMPONENT ---
interface ReelCardProps {
  item: any;
  isActive: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  triggerToast: (msg: string) => void;
  onVisible: () => void;
  placeBid: any;
  currentUser: any;
  wallet: any;
  watchlist: string[];
  toggleWatchlist: (id: string) => void;
  chatMessages: any[];
  sendChatMessage: (text: string) => void;
  language: string;
  isAr: boolean;
}

const ReelCard: React.FC<ReelCardProps> = ({
  item,
  isActive,
  isMuted,
  setIsMuted,
  triggerToast,
  onVisible,
  placeBid,
  currentUser,
  wallet,
  watchlist,
  toggleWatchlist,
  chatMessages,
  sendChatMessage,
  language,
  isAr
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Local likes, saves, comments interaction
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(() => {
    return Math.floor(((item.title?.charCodeAt(0) || 75) * 12) + 242);
  });
  const [isSaved, setIsSaved] = useState<boolean>(() => watchlist.includes(item.id));
  const [commentCount, setCommentCount] = useState<number>(() => {
    return Math.floor(((item.title?.charCodeAt(1) || 82) * 2) + 14);
  });

  const [showCommentsModal, setShowCommentsModal] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [selectedLotDetailsId, setSelectedLotDetailsId] = useState<string | null>(null);

  // Time remaining dynamic state
  const [timeLeftStr, setTimeLeftStr] = useState<string>('00:00:00');

  // Trigger onVisible when intersecting
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible();
        }
      },
      { threshold: 0.6 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    return () => observer.disconnect();
  }, [onVisible]);

  // Sync isSaved with global watchlist
  useEffect(() => {
    setIsSaved(watchlist.includes(item.id));
  }, [watchlist, item.id]);

  // Handle countdown timers per card
  useEffect(() => {
    const interval = setInterval(() => {
      const remainingSecs = Math.max(0, Math.floor((item.endTime - Date.now()) / 1000));
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
    }, 1000);

    return () => clearInterval(interval);
  }, [item]);

  // Sync mute property and play/pause based on isActive
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = isMuted;

    if (isActive) {
      video.load();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (e && (e.name === 'AbortError' || e.message?.includes('interrupted'))) return;
          console.log("Reels autoplay muted required:", e);
          video.muted = true;
          setIsMuted(true);
          video.play().catch(pe => console.warn("Reels play blocked completely:", pe));
        });
      }
    } else {
      video.pause();
    }
  }, [isActive, isMuted, item.videoUrl]);

  const executeBid = async (amount: number) => {
    if (currentUser?.isBlocked) {
      triggerToast(isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!');
      return;
    }
    const res = await placeBid(item.id, amount);
    if (!res.success) {
      triggerToast(res.message);
    } else {
      triggerToast(isAr ? '🚀 تم تقديم المزايدة بنجاح!' : '🚀 Bid Placed Successfully!');
      setCommentCount(prev => prev + 1);
    }
  };

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLiked) {
      setIsLiked(true);
      setLikesCount(prev => prev + 1);
      triggerToast(isAr ? '❤️ تمت الإضافة للمفضلة!' : '❤️ Added to favorites!');
    } else {
      setIsLiked(false);
      setLikesCount(prev => prev - 1);
    }
  };

  const handleSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWatchlist(item.id);
    const saved = !isSaved;
    setIsSaved(saved);
    triggerToast(saved ? (isAr ? '🔖 تم الحفظ في قائمتك!' : '🔖 Saved to Watchlist!') : (isAr ? 'تمت الإزالة' : 'Removed'));
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerToast(isAr ? '🔗 تم نسخ رابط المزاد لمشاركته!' : '🔗 Auction link copied to clipboard!');
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    sendChatMessage(commentText);
    setCommentText('');
    setCommentCount(prev => prev + 1);
    triggerToast(isAr ? '💬 تم إرسال تعليقك فوراً!' : '💬 Comment broadcasted live!');
  };

  const formattedTitle = useMemo(() => {
    if (!item.title) return '';
    return item.title.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }, [item.title]);

  const bidIncrement = item.minIncrement || 50;
  const nextBidAmount = item.currentPrice + bidIncrement;

  const cardChatMessages = useMemo(() => {
    return chatMessages
      .filter(msg => msg.auctionId === item.id)
      .slice(-4);
  }, [chatMessages, item.id]);

  return (
    <div 
      ref={cardRef}
      className="w-full h-full snap-start snap-always shrink-0 relative overflow-hidden flex flex-row bg-zinc-950 text-white"
      id={`reel-card-${item.id}`}
    >
      {/* ======================================================================
          COLUMN 1: THE VIDEO VIEWPORT (TAKES FULL SIZE ON MOBILE, PORTRAIT CENTER ON DESKTOP)
          ====================================================================== */}
      <div className="flex-1 h-full relative overflow-hidden flex items-center justify-center bg-[#0a0a0a]">
        
        {/* Responsive Frame: Fits standard full viewport on mobile, and standard aspect ratio on desktop */}
        <div className="w-full h-full lg:max-w-[420px] lg:h-[95%] lg:aspect-[9/16] relative overflow-hidden lg:rounded-2xl lg:shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-[#0d0d0d] border border-transparent lg:border-white/10 flex flex-col justify-between">
          
          {/* 1. MEDIA BACKGROUND */}
          <div className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-[#0d0d0d]">
            {item.videoUrl ? (
              <video
                ref={videoRef}
                src={item.videoUrl}
                poster={item.thumbnailUrl}
                loop
                playsInline
                webkit-playsinline="true"
                x5-playsinline="true"
                className="w-full h-full object-cover opacity-90 cursor-pointer"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) {
                    if (video.paused) {
                      video.play().catch(() => {});
                      triggerToast(isAr ? '▶️ تشغيل' : '▶️ Play');
                    } else {
                      video.pause();
                      triggerToast(isAr ? '⏸️ إيقاف مؤقت' : '⏸️ Pause');
                    }
                  }
                }}
              />
            ) : (
              <img 
                src={item.thumbnailUrl || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80'} 
                alt={item.title} 
                className="w-full h-full object-cover opacity-85"
                referrerPolicy="no-referrer"
              />
            )}
            
            {/* Subtle Dark Vignette Gradients */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-black/60 pointer-events-none" />
          </div>

          {/* 2. COMPACT TOP STATUS OVERLAYS (z-index 20) */}
          <div className="absolute top-4 inset-x-0 z-20 px-4 flex items-center justify-between pointer-events-none">
            
            {/* Live / Status tag */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="bg-[#FF6B00] text-white text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                <span className="w-1 h-1 bg-white rounded-full animate-ping" />
                <span>{isAr ? 'مباشر' : 'LIVE'}</span>
              </div>
              <span className="bg-black/55 backdrop-blur-md border border-white/10 text-white text-[8px] font-black tracking-wider px-2 py-0.5 rounded-full uppercase">
                {item.category || (isAr ? 'فاخر' : 'Luxury')}
              </span>
            </div>

            {/* Mute and specs triggers */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button 
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  triggerToast(isMuted ? (isAr ? '🔊 الصوت مفعّل' : '🔊 Audio On') : (isAr ? '🔇 كتم الصوت' : '🔇 Audio Muted'));
                }}
                className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:text-[#FF6B00] transition-colors cursor-pointer min-w-[32px] min-h-[32px]"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-[#FF6B00]" />}
              </button>

              <button 
                type="button"
                onClick={() => setSelectedLotDetailsId(item.id)}
                className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:text-[#FF6B00] transition-colors cursor-pointer min-w-[32px] min-h-[32px]"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
              </button>
            </div>

          </div>

          {/* 3. COMPACT TIME & CURRENT PRICE OVERLAYS (Visible on Mobile overlay only) */}
          <div className="absolute top-16 left-4 z-10 flex lg:hidden flex-col space-y-1 text-left ltr" style={{ direction: 'ltr' }}>
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-3.5 shadow-lg select-none">
              <div className="border-r border-white/10 pr-3.5">
                <span className="text-[7.5px] text-zinc-400 font-extrabold uppercase tracking-wider block leading-none">CURRENT</span>
                <span className="text-sm font-black text-white block mt-0.5 leading-none">
                  {item.currentPrice.toLocaleString()} <span className="text-[9px] text-[#FF6B00] font-bold">JD</span>
                </span>
              </div>
              <div>
                <span className="text-[7.5px] text-zinc-400 font-extrabold uppercase tracking-wider block leading-none">TIME LEFT</span>
                <span className="text-[11px] font-black text-white font-mono block mt-0.5 leading-none tracking-wide text-emerald-400">
                  {timeLeftStr}
                </span>
              </div>
            </div>
          </div>

          {/* 4. FLOATING RIGHT ACTION BUTTONS (Visible on Mobile overlay only) */}
          <div className="absolute right-3 bottom-44 z-20 flex lg:hidden flex-col items-center gap-4">
            
            {/* Like */}
            <div className="flex flex-col items-center gap-0.5">
              <button 
                type="button"
                onClick={handleLikeToggle}
                className={`w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border flex items-center justify-center transition-all active:scale-90 hover:brightness-110 cursor-pointer min-w-[36px] min-h-[36px] ${
                  isLiked ? 'border-red-500 text-red-500' : 'border-white/15 text-white'
                }`}
              >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              </button>
              <span className="text-[9px] font-extrabold text-zinc-300 drop-shadow-md select-none">
                {likesCount}
              </span>
            </div>

            {/* Comment */}
            <div className="flex flex-col items-center gap-0.5">
              <button 
                type="button"
                onClick={() => setShowCommentsModal(true)}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition-all active:scale-90 hover:brightness-110 cursor-pointer min-w-[36px] min-h-[36px]"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              <span className="text-[9px] font-extrabold text-zinc-300 drop-shadow-md select-none">
                {commentCount}
              </span>
            </div>

            {/* Save */}
            <div className="flex flex-col items-center gap-0.5">
              <button 
                type="button"
                onClick={handleSaveToggle}
                className={`w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border flex items-center justify-center transition-all active:scale-90 hover:brightness-110 cursor-pointer min-w-[36px] min-h-[36px] ${
                  isSaved ? 'border-[#FF6B00] text-[#FF6B00]' : 'border-white/15 text-white'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[#FF6B00] text-[#FF6B00]' : ''}`} />
              </button>
              <span className="text-[9px] font-extrabold text-zinc-300 drop-shadow-md select-none">
                {isSaved ? (isAr ? 'محفوظ' : 'Saved') : (isAr ? 'حفظ' : 'Save')}
              </span>
            </div>

            {/* Share */}
            <div className="flex flex-col items-center gap-0.5">
              <button 
                type="button"
                onClick={handleShareClick}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition-all active:scale-90 hover:brightness-110 cursor-pointer min-w-[36px] min-h-[36px]"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <span className="text-[9px] font-extrabold text-zinc-300 drop-shadow-md select-none">
                {isAr ? 'مشاركة' : 'Share'}
              </span>
            </div>

          </div>

          {/* 5. BOTTOM OVERLAY INFORMATION & CONTROLS (Visible on Mobile overlay only) */}
          <div className="absolute bottom-0 inset-x-0 z-10 px-4 pb-4 pt-16 flex lg:hidden flex-col gap-3 pointer-events-none bg-gradient-to-t from-black/95 via-black/40 to-transparent">
            
            <div className="space-y-2 pointer-events-auto select-text">
              
              {/* Chat Stream overlay */}
              <div 
                className="w-full max-h-[100px] overflow-y-auto mb-1 space-y-1 pr-4 no-scrollbar flex flex-col justify-end pointer-events-auto"
                style={{ 
                  maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
                  WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'
                }}
              >
                {cardChatMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex items-start gap-1 px-2 py-0.5 rounded-lg w-max max-w-[85%] text-[10.5px] backdrop-blur-md select-none font-sans ${
                      msg.isBid 
                        ? 'bg-[#FF6B00]/20 border border-[#FF6B00]/40 text-[#FF8A00] font-black' 
                        : 'bg-black/40 text-white/90 border border-white/5'
                    }`}
                  >
                    <span className="font-extrabold text-gray-300 mr-1">{msg.userName}:</span>
                    <span className="font-medium">{msg.text}</span>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-[17px] font-black text-white tracking-tight leading-tight select-all">
                  {formattedTitle}
                </h2>
                <p className="text-[10px] text-zinc-300 leading-relaxed font-sans max-w-[80%] mt-0.5 line-clamp-2">
                  {item.description}
                </p>
              </div>
            </div>

            {/* Quick increments & Prominent Place Bid CTA Button */}
            <div className="space-y-2 pointer-events-auto">
              <div className="grid grid-cols-3 gap-2">
                {[25, 50, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => executeBid(item.currentPrice + val)}
                    className="h-9 px-3 rounded-xl bg-white/10 hover:bg-[#FF6B00]/25 hover:border-[#FF6B00]/40 border border-white/10 text-white font-extrabold text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1 shadow-inner active:scale-95"
                  >
                    +{val} <span className="text-[8px] font-normal opacity-70">{isAr ? 'د.أ' : 'JD'}</span>
                  </button>
                ))}
              </div>

              <SwipeToBid
                amount={nextBidAmount}
                onSwipeSuccess={() => executeBid(nextBidAmount)}
                disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
                language={language as 'en' | 'ar'}
              />
            </div>

          </div>

        </div>

      </div>

      {/* ======================================================================
          COLUMN 2: THE PERMANENT SIDEBAR DETAILS, COMMENTS, BIDDING FOR DESKTOP (TikTok Web Layout)
          ====================================================================== */}
      <div 
        className="hidden lg:flex flex-col w-[350px] bg-zinc-900 border-l border-white/5 shrink-0 h-full overflow-hidden" 
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
      >
        
        {/* 1. Header Details section */}
        <div className="p-4 border-b border-white/5 shrink-0 space-y-3 bg-zinc-950/20">
          <div className="flex items-center justify-between">
            <span className="bg-[#FF6B00]/10 text-[#FF6B00] text-[9px] font-black tracking-widest px-2.5 py-1 rounded-md uppercase border border-[#FF6B00]/20 animate-pulse">
              {isAr ? 'مزاد حي نشط 🔴' : 'LIVE AUCTION 🔴'}
            </span>
            <span className="text-[9.5px] font-extrabold uppercase bg-white/5 text-zinc-300 px-2.5 py-1 rounded-md border border-white/10">
              {item.category || (isAr ? 'فاخر' : 'Luxury')}
            </span>
          </div>

          <div>
            <h2 className="text-[16px] font-black text-white tracking-tight leading-snug">
              {formattedTitle}
            </h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-sans mt-1 line-clamp-3">
              {item.description}
            </p>
          </div>

          {/* Price & Time left Stats block */}
          <div className="bg-black/40 border border-white/10 p-3 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[8px] text-zinc-400 font-extrabold uppercase block tracking-wider leading-none">{isAr ? 'السعر الحالي' : 'CURRENT BID'}</span>
              <span className="text-base font-black text-white block mt-1.5 leading-none">
                {item.currentPrice.toLocaleString()} <span className="text-[10px] text-[#FF6B00] font-bold">{isAr ? 'د.أ' : 'JD'}</span>
              </span>
            </div>
            <div className="text-right">
              <span className="text-[8px] text-zinc-400 font-extrabold uppercase block tracking-wider leading-none">{isAr ? 'الوقت المتبقي' : 'TIME REMAINING'}</span>
              <span className="text-sm font-black text-emerald-400 font-mono block mt-1.5 leading-none tracking-wide">
                {timeLeftStr}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Interactive Bidding Controls section */}
        <div className="p-4 border-b border-white/5 bg-black/10 space-y-3 shrink-0">
          <div className="grid grid-cols-3 gap-2">
            {[25, 50, 100].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => executeBid(item.currentPrice + val)}
                className="h-9 px-3 rounded-xl bg-white/5 hover:bg-[#FF6B00]/25 hover:border-[#FF6B00]/40 border border-white/10 text-white font-extrabold text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95"
              >
                +{val} <span className="text-[8.5px] font-normal opacity-60">{isAr ? 'د.أ' : 'JD'}</span>
              </button>
            ))}
          </div>

          <SwipeToBid
            amount={nextBidAmount}
            onSwipeSuccess={() => executeBid(nextBidAmount)}
            disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
            language={language as 'en' | 'ar'}
          />

          {/* Social Interactions bar (Like, Watchlist, Share) */}
          <div className="flex gap-2 pt-1.5">
            <button
              onClick={handleLikeToggle}
              className={`flex-1 h-9 rounded-xl border flex items-center justify-center gap-2 text-[10.5px] font-black transition-all ${
                isLiked ? 'border-red-500/35 bg-red-500/10 text-red-400' : 'border-white/5 bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              <span>{likesCount}</span>
            </button>

            <button
              onClick={handleSaveToggle}
              className={`flex-1 h-9 rounded-xl border flex items-center justify-center gap-2 text-[10.5px] font-black transition-all ${
                isSaved ? 'border-[#FF6B00]/35 bg-[#FF6B00]/10 text-[#FF6B00]' : 'border-white/5 bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#FF6B00] text-[#FF6B00]' : ''}`} />
              <span>{isAr ? 'حفظ' : 'Save'}</span>
            </button>

            <button
              onClick={handleShareClick}
              className="h-9 px-3.5 rounded-xl border border-white/5 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. Live chat feed panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950/40">
          <div className="px-4 py-3 border-b border-white/5 bg-zinc-950 shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">
              {isAr ? 'المحادثة والتعليقات المباشرة 💬' : 'LIVE REEL STREAM FEED 💬'}
            </span>
            <span className="text-[9px] font-black bg-[#FF6B00]/10 text-[#FF6B00] px-2 py-0.5 rounded border border-[#FF6B00]/20 font-mono animate-pulse">
              WS ACTIVE
            </span>
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-3 no-scrollbar">
            {chatMessages.filter(msg => msg.auctionId === item.id).length > 0 ? (
              chatMessages
                .filter(msg => msg.auctionId === item.id)
                .map((msg) => (
                  <div key={msg.id} className="flex gap-2.5 items-start font-sans">
                    <img 
                      src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                      alt="User" 
                      className="w-7 h-7 rounded-full object-cover border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0 bg-white/5 border border-white/5 px-3 py-2 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-zinc-300 truncate block">
                          {msg.userName}
                        </span>
                        <span className="text-[8px] text-zinc-500 shrink-0 block">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-200 leading-normal mt-0.5">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-center h-full">
                <MessageSquare className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-[10px] uppercase font-black tracking-wider text-zinc-400">
                  {isAr ? 'لا توجد تعليقات بعد' : 'No comments yet'}
                </p>
              </div>
            )}
          </div>

          {/* Comment submit form */}
          <form onSubmit={handleCommentSubmit} className="p-3 border-t border-white/5 bg-zinc-950 shrink-0 flex gap-2">
            <input 
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={isAr ? 'اكتب تعليقاً عاماً...' : 'Type a public comment...'}
              className="flex-grow h-10 px-3 bg-white/5 border border-white/10 rounded-xl text-zinc-100 text-[12px] font-medium placeholder-gray-500 outline-none focus:border-[#FF6B00]/70 transition-colors pointer-events-auto"
            />
            <button 
              type="submit"
              className="h-10 px-4 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[12px] rounded-xl transition-all cursor-pointer flex items-center justify-center leading-none"
            >
              {isAr ? 'إرسال' : 'SEND'}
            </button>
          </form>
        </div>

      </div>

      {/* Specs Details slide-up sheet */}
      {selectedLotDetailsId && (
        <AuctionDetailsModal 
          lotId={selectedLotDetailsId} 
          onClose={() => setSelectedLotDetailsId(null)} 
        />
      )}

      {/* Floating Comments overlay sheet (Mobile only modal) */}
      {showCommentsModal && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex lg:hidden flex-col justify-end">
          <div className="bg-[#121318] border-t border-white/10 rounded-t-3xl max-h-[60%] flex flex-col animate-in slide-in-from-bottom duration-250">
            
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <span className="text-xs font-black tracking-wider uppercase text-zinc-300">
                {isAr ? 'التعليقات المباشرة' : 'LIVE FEED CHAT'} ({commentCount})
              </span>
              <button 
                type="button"
                onClick={() => setShowCommentsModal(false)}
                className="p-1 rounded-full hover:bg-white/5 text-zinc-400 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of comments */}
            <div className="flex-grow overflow-y-auto p-4 space-y-3 no-scrollbar min-h-[160px]">
              {chatMessages.filter(msg => msg.auctionId === item.id).length > 0 ? (
                chatMessages
                  .filter(msg => msg.auctionId === item.id)
                  .map((msg) => (
                    <div key={msg.id} className="flex gap-2.5 items-start font-sans">
                      <img 
                        src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                        alt="User" 
                        className="w-7 h-7 rounded-full object-cover border border-white/10"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0 bg-white/5 border border-white/5 px-3 py-2 rounded-2xl">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-zinc-300 truncate block">
                            {msg.userName}
                          </span>
                          <span className="text-[8px] text-zinc-500 shrink-0 block">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-zinc-200 leading-normal mt-0.5">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-500 text-center">
                  <MessageSquare className="w-6 h-6 text-zinc-600 mb-1.5" />
                  <p className="text-[10px] uppercase font-black tracking-wider">
                    {isAr ? 'لا توجد تعليقات بعد' : 'No comments yet'}
                  </p>
                </div>
              )}
            </div>

            {/* Message input */}
            <form onSubmit={handleCommentSubmit} className="p-3.5 border-t border-white/5 flex gap-2 shrink-0 pb-[calc(env(safe-area-inset-bottom)+14px)] bg-black/40">
              <input 
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={isAr ? 'اكتب تعليقاً عاماً...' : 'Type a public comment...'}
                className="flex-grow h-10 px-3 bg-white/5 border border-white/10 rounded-xl text-zinc-100 text-[12px] font-medium placeholder-gray-500 outline-none focus:border-[#FF6B00]/70 transition-colors pointer-events-auto"
                autoFocus
              />
              <button 
                type="submit"
                className="h-10 px-4 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[12px] rounded-xl transition-all cursor-pointer flex items-center justify-center leading-none"
              >
                {isAr ? 'إرسال' : 'SEND'}
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};

