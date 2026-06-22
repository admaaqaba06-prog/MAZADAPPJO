import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { 
  Gavel, 
  Volume2, 
  VolumeX, 
  Bell, 
  Heart, 
  MessageSquare, 
  Share2, 
  Bookmark, 
  MapPin, 
  Home, 
  Search, 
  Plus, 
  User, 
  ChevronUp, 
  ChevronDown,
  FolderLock,
  X,
  Sparkles,
  Check,
  Trash2
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { placeAuctionBid } from '../services/auctionService';
import { SwipeToBid } from './SwipeToBid';


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
    autoBids,
    setAutoBid,
    removeAutoBid,
    chatMessages,
    sendChatMessage,
    deleteAuction
  } = useApp();

  const isAr = language === 'ar';
  
  // Comment custom input states
  const [showCommentInput, setShowCommentInput] = useState<boolean>(false);
  const [newCommentVal, setNewCommentVal] = useState<string>('');
  
  const handleSendComment = () => {
    if (!newCommentVal.trim()) return;
    sendChatMessage(newCommentVal);
    setNewCommentVal('');
    setShowCommentInput(false);
    setCommentCount(prev => prev + 1);
    triggerToast(isAr ? '💬 تم إرسال تعليقك للجميع!' : '💬 Your comment was broadcast live!');
  };

  const liveAuctions = React.useMemo(() => {
    const filtered = auctions.filter(a => a.status === 'live');
    return [...filtered].sort((a, b) => {
      const tA = a.approvedAt ? (a.approvedAt.seconds ? a.approvedAt.seconds * 1000 : Number(a.approvedAt)) : (a.createdAt || 0);
      const tB = b.approvedAt ? (b.approvedAt.seconds ? b.approvedAt.seconds * 1000 : Number(b.approvedAt)) : (b.createdAt || 0);
      return tB - tA;
    });
  }, [auctions]);

  const currentItem = liveAuctions.find(a => a.id === activeAuctionId) || liveAuctions[0] || auctions[0];

  // UI Interactive States
  const [selectedIncrement, setSelectedIncrement] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Synchronize dynamic muted property directly to DOM element to override React's muted attribute mount bug
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Force automatic video loading and playback on change, avoiding iOS / Android black screens
  useEffect(() => {
    let active = true;
    const video = videoRef.current;
    if (!video) return;

    // Force muted property to match state before initiating playback to satisfy iOS Safari dynamic rules
    video.muted = isMuted;

    // Reset video player stream and trigger playback programmatically safely
    video.load();
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (!active) return;
        if (err && (err.name === 'AbortError' || err.message?.includes('interrupted'))) {
          console.log("Muted autoplay video play request was interrupted (safe/expected on navigation or source change).");
          return;
        }
        console.warn("Muted autoplay auto-triggered fallback on mobile device:", err);
        // Fall back to explicit mute which mobile environments always authorize
        video.muted = true;
        setIsMuted(true);
        video.play().catch((playError) => {
          if (!active) return;
          if (playError && (playError.name === 'AbortError' || playError.message?.includes('interrupted'))) {
            return;
          }
          console.warn("Forced mobile video playback authorization completely failed or was interrupted:", playError);
        });
      });
    }

    return () => {
      active = false;
    };
  }, [currentItem?.id, currentItem?.videoUrl]);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(1520);
  const isSaved = watchlist.includes(currentItem?.id || '');
  const [commentCount, setCommentCount] = useState<number>(77);

  const [showToast, setShowToast] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customBidVal, setCustomBidVal] = useState<string>('150');
  const [startY, setStartY] = useState<number | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [activeQuickBidVal, setActiveQuickBidVal] = useState<number | null>(null);
  const [isMainBidClicked, setIsMainBidClicked] = useState<boolean>(false);

  // Real-time dynamic bid bubble state
  const [lastBidderName, setLastBidderName] = useState<string>('');
  const [lastBidderAvatar, setLastBidderAvatar] = useState<string>('');
  const [showBidBubble, setShowBidBubble] = useState<boolean>(false);
  const [prevPrice, setPrevPrice] = useState<number>(currentItem?.currentPrice || 0);

  // Sync price reference and handle active/reset trigger on channel change
  useEffect(() => {
    if (!currentItem) return;
    setPrevPrice(currentItem.currentPrice);
    setShowBidBubble(false);
  }, [currentItem?.id]);

  // Sync and display bubble dynamically when bids are placed
  useEffect(() => {
    if (!currentItem) return;
    if (currentItem.currentPrice > prevPrice) {
      const bName = currentItem.currentBidderName || (isAr ? 'مزايد مجهول' : 'Anonymous Bidder');
      setLastBidderName(bName);

      let avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80';
      const isClientUser = currentItem.currentBidderId === 'user-current' || bName === currentUser.name;
      if (isClientUser) {
        avatar = currentUser.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80';
      } else {
        const name = bName.toLowerCase();
        if (name.includes('karam')) {
          avatar = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80';
        } else if (name.includes('reem')) {
          avatar = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80';
        } else if (name.includes('faisal')) {
          avatar = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=80';
        } else if (name.includes('yasmin') || name.includes('yasmine')) {
          avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80';
        } else if (name.includes('majd')) {
          avatar = 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=100&q=80';
        }
      }

      setLastBidderAvatar(avatar);
      setShowBidBubble(true);
      setPrevPrice(currentItem.currentPrice);

      const timer = setTimeout(() => {
        setShowBidBubble(false);
      }, 3500);
      return () => clearTimeout(timer);
    } else if (currentItem.currentPrice < prevPrice) {
      setPrevPrice(currentItem.currentPrice);
    }
  }, [currentItem?.currentPrice, prevPrice, isAr, currentUser]);

  // Time remaining dynamic state
  const [timeLeftStr, setTimeLeftStr] = useState<string>('23:28:51');

  useEffect(() => {
    if (!currentItem) return;
    const interval = setInterval(() => {
      const remainingSecs = Math.max(0, Math.floor((currentItem.endTime - Date.now()) / 1000));
      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        const now = new Date();
        const hrs = 10 - (now.getHours() % 12);
        const mins = 59 - now.getMinutes();
        const secs = 59 - now.getSeconds();
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentItem]);

  if (!currentItem) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center bg-[#111111] p-6 text-gray-400 font-sans h-[100dvh]" id="no-live-stream-fallback">
        <FolderLock className="w-12 h-12 text-[#FF6B00] mb-3 animate-bounce" />
        <h3 className="font-extrabold text-sm uppercase text-white">{isAr ? 'لا يوجد بثوث نشطة حالياً' : 'No channels active'}</h3>
        <p className="text-xs text-gray-500 max-w-xs mt-1">
          {isAr ? 'يرجى تقديم مزاد جديد عبر زر الإنشاء ومن ثم اعتماده في الصفحة الإدارية لفتحه فوراً!' : 'Submit a lot from the creator wizard and approve it in the admin dashboard!'}
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

  const executeBid = async (amount: number) => {
    const res = await placeBid(currentItem.id, amount);
    if (!res.success) {
      triggerToast(res.message);
    } else {
      triggerToast(isAr ? '🚀 تم تقديم المزايدة بنجاح!' : '🚀 Bid Placed Successfully!');
      setCommentCount(prev => prev + 1);
    }
  };

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3050);
  };

  const handleCustomBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customBidVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setSelectedIncrement(parsed);
      setShowCustomModal(false);
      triggerToast(isAr ? `تم تحديد زيادة مخصصة: +${parsed} د.أ` : `Custom increment set: +${parsed} JOD`);
    }
  };

  const shiftChannel = (direction: 'next' | 'prev') => {
    if (liveAuctions.length <= 1) return;
    const currentIndex = liveAuctions.findIndex(a => a.id === currentItem.id);
    let nextIndex = currentIndex;

    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % liveAuctions.length;
    } else {
      nextIndex = (currentIndex - 1 + liveAuctions.length) % liveAuctions.length;
    }

    const nextId = liveAuctions[nextIndex]?.id;
    if (nextId) {
      setActiveAuctionId(nextId);
      triggerToast(isAr ? 'تم الانتقال لقناة البث الأخرى' : 'Swiped to next lot');
    }
  };

  // Support desktop wheel and keyboard events for shifting channels (REELS scrolling on desktop/laptop)
  useEffect(() => {
    let lastScrollTime = 0;
    const scrollCooldown = 800; // ms cooldown to avoid rapid skips

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in the comment box or another input field
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        shiftChannel('prev');
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        shiftChannel('next');
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Ignore wheel events if scrolling some scrollable element inside like comments stream or modal
      const target = e.target as HTMLElement;
      if (target && target.closest('.overflow-y-auto, .overflow-auto')) {
        return;
      }

      // Throttle wheel scroll
      const now = Date.now();
      if (now - lastScrollTime < scrollCooldown) return;

      if (Math.abs(e.deltaY) > 30) {
        e.preventDefault();
        if (e.deltaY > 0) {
          shiftChannel('next');
          lastScrollTime = now;
        } else {
          shiftChannel('prev');
          lastScrollTime = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Listen with passive: false to allow e.preventDefault()
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [liveAuctions, currentItem, showCommentInput]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startY === null) return;
    const endY = e.changedTouches[0].clientY;
    const diffY = startY - endY;

    if (Math.abs(diffY) > 50) {
      if (diffY > 0) {
        shiftChannel('next');
      } else {
        shiftChannel('prev');
      }
    }
    setStartY(null);
  };

  const handleLikeToggle = () => {
    if (!isLiked) {
      setLikesCount(prev => prev + 1);
      setIsLiked(true);
      triggerToast('Liked! ❤️');
    } else {
      setLikesCount(prev => prev - 1);
      setIsLiked(false);
    }
  };

  const handleSaveToggle = () => {
    if (!currentItem) return;
    toggleWatchlist(currentItem.id);
    if (isSaved) {
      triggerToast(isAr ? 'تمت الإزالة من قائمة المتابعة' : 'Removed from watchlist 🔖');
    } else {
      triggerToast(isAr ? 'تمت الإضافة لقائمة المتابعة!' : 'Saved to watchlist! 🔖');
    }
  };

  const isRolex = currentItem.id?.includes('rolex');
  const isPorsche = currentItem.id?.includes('porsche');

  const formattedTitle = isRolex 
    ? 'Rolex Cosmograph Daytona' 
    : isPorsche 
    ? 'Porsche 911 GT3 RS (992)' 
    : currentItem.title;

  const formattedSubtitle = isRolex
    ? (isAr ? 'اصدار ذهبي عيار ١٨ مع كامل الملحقات المعتمدة والعلبة والشهادات • غير مستخدم' : '18ct Gold Edition • Complete set with warranty papers • Brand New')
    : isPorsche
    ? (isAr ? 'تخصيص كامل للنخبة PTS • لون رمادي مميز مع باقة السباقات الحصرية • جديد كلياً' : 'Elite allocation PTS clearance • Stealth GT3 Gray with track packages • Brand New')
    : (isAr ? 'جديد (غير مستخدم) • مع الضمان الرسمي والعلبة والكتيبات • تيتانيوم طبيعي' : 'Brand New (Unused) • Titanium Natural • Agent Warranty Covered');

  const bidCTAAmount = currentItem.currentPrice + selectedIncrement;

  return (
    <div 
      className="flex flex-col h-[100dvh] w-full bg-[#111111] overflow-hidden relative select-none touch-pan-y font-sans text-white pb-[env(safe-area-inset-bottom)]"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      id="live-tiktok-swipe-container"
    >
      <style>{`
        .bid-btn-glass {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 50px;
          color: white;
          font-weight: bold;
          transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease, transform 0.15s ease;
        }
        .bid-btn-glass:active {
          transform: scale(0.95);
          box-shadow: 0 0 20px rgba(255, 107, 0, 0.7);
          border-color: #FF6B00;
          background: rgba(255, 107, 0, 0.3);
        }
        .bid-btn-active {
          background: rgba(255, 107, 0, 0.35) !important;
          border-color: rgba(255, 107, 0, 0.8) !important;
          box-shadow: 0 0 24px rgba(255, 107, 0, 0.6),
                      inset 0 0 12px rgba(255, 107, 0, 0.1) !important;
          transform: scale(0.96) !important;
        }
        
        @keyframes main-btn-scale {
          0% { transform: scale(1); }
          20% { transform: scale(0.97); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }

        @keyframes orange-ripple {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 107, 0, 0.7), 0 0 0 0 rgba(255, 107, 0, 0.4);
          }
          100% {
            box-shadow: 0 0 0 15px rgba(255, 107, 0, 0), 0 0 25px rgba(255, 107, 0, 0);
          }
        }

        .main-bid-glow {
          box-shadow: 0 0 30px rgba(255, 107, 0, 0.8) !important;
        }

        .main-bid-clicked-anim {
          animation: main-btn-scale 0.4s ease-out, orange-ripple 0.6s ease-out;
        }
      `}</style>
      
      {/* 1. PRODUCT IMAGE / VIDEO FULL-SCREEN BACKGROUND (z-index 0) */}
      <div className="absolute inset-0 w-full h-[100dvh] z-0 overflow-hidden bg-[#111111]">
        {currentItem.videoUrl ? (
          <video
            ref={videoRef}
            src={currentItem.videoUrl}
            poster={currentItem.thumbnailUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            webkit-playsinline="true"
            x5-playsinline="true"
            className="w-full h-full object-cover opacity-100 cursor-pointer"
            onClick={() => {
              const video = videoRef.current;
              if (video) {
                if (video.paused) {
                  video.play().catch(e => {
                    if (e && (e.name === 'AbortError' || e.message?.includes('interrupted'))) return;
                    console.warn("Tap-to-play manually triggered error:", e);
                  });
                  triggerToast(isAr ? '▶️ تم تشغيل الفيديو' : '▶️ Streaming Video');
                } else {
                  video.pause();
                  triggerToast(isAr ? '⏸️ تم إيقاف الفيديو مؤقتاً' : '⏸️ Video Paused');
                }
              }
            }}
          />
        ) : (
          <img 
            src={currentItem.thumbnailUrl} 
            alt={currentItem.title} 
            className="w-full h-full object-cover opacity-100 animate-fade-in"
          />
        )}
      </div>
      
      {/* 1.5 Laptop/Desktop keyboard/wheel navigation widget (left side) */}
      <div 
        className="absolute left-4 top-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col items-center gap-2.5 bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl scale-100 transition-all hover:border-white/20 select-none"
        id="desktop-reel-scroller-widget"
      >
        <button
          type="button"
          onClick={() => shiftChannel('prev')}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#FF6B00] hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer text-zinc-300 active:scale-95"
          title={isAr ? "البث السابق (سهم للأعلى)" : "Previous stream (Arrow Up)"}
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        
        <div className="flex flex-col items-center justify-center text-center font-mono py-1">
          <span className="text-xs font-black text-white leading-none">
            {liveAuctions.findIndex(a => a.id === currentItem?.id) !== -1 
              ? liveAuctions.findIndex(a => a.id === currentItem?.id) + 1 
              : 1}
          </span>
          <div className="w-5 h-[1.5px] bg-white/15 my-1" />
          <span className="text-[9px] font-black text-zinc-500 leading-none">
            {liveAuctions.length || 1}
          </span>
        </div>

        <button
          type="button"
          onClick={() => shiftChannel('next')}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#FF6B00] hover:text-white border border-white/10 transition-all flex items-center justify-center cursor-pointer text-zinc-300 active:scale-95"
          title={isAr ? "البث التالي (سهم للأسفل / مسافة)" : "Next stream (Arrow Down / Space)"}
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <span className="text-[7.5px] text-zinc-400 font-extrabold uppercase tracking-wider text-center max-w-[70px] leading-tight mt-1">
          {isAr ? "تصفح بالأسهم أو العجلة" : "Scroll Wheel / Arrow Keys"}
        </span>
      </div>

      {/* 2. Light Toast alerts on action triggers (z-index 50) */}
      {showToast && (
        <div className="absolute top-22 left-1/2 -translate-x-1/2 z-50 bg-[#FF6B00] text-white px-4 py-2.5 rounded-2xl text-[11px] font-black tracking-wide shadow-[0_8px_32px_rgba(255,107,0,0.35)] animate-bounce text-center">
          {showToast}
        </div>
      )}

      {/* 3. TOP BAR (z-index 25) */}
      <div 
        className="absolute top-0 inset-x-0 z-25 px-4 pt-4 pb-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 25%)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#FF6B00] flex items-center justify-center shadow-md">
            <Gavel className="w-4 h-4 text-white stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-black tracking-tight text-white drop-shadow-md leading-none">
              {isAr ? 'مزاد جو' : 'Mazad Jo'}
            </span>
            <span className="text-[10px] font-black text-emerald-400 font-sans mt-1 bg-black/40 px-2 py-0.5 rounded-full border border-white/5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {isAr ? 'المحفظة:' : 'Wallet:'} {wallet.availableBalance.toLocaleString()} JOD
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            type="button"
            onClick={() => {
              setIsMuted(!isMuted);
              triggerToast(isMuted ? (isAr ? '🔊 تم تشغيل الصوت' : '🔊 Audio Enabled') : (isAr ? '🔇 كتم الصوت' : '🔇 Audio Muted'));
            }}
            className="text-white hover:text-[#FF6B00] transition-colors p-2 rounded-full bg-black/45 hover:bg-black/60 border border-white/10 flex items-center justify-center cursor-pointer min-w-[44px] min-h-[44px]"
            aria-label="Toggle Audio"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-zinc-300" /> : <Volume2 className="w-5 h-5 text-[#FF6B00]" />}
          </button>
          
          <button 
            type="button"
            onClick={() => {
              setActiveView('discovery');
              triggerToast(isAr ? 'العودة لقائمة الاكتشاف' : 'Navigated back to Main Discovery Catalog');
            }}
            className="relative text-white hover:text-[#FF6B00] transition-colors p-2 rounded-full bg-black/45 hover:bg-black/60 border border-white/10 flex items-center justify-center cursor-pointer min-w-[44px] min-h-[44px]"
            aria-label="Open Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#FF6B00] text-white rounded-full flex items-center justify-center text-[9px] font-black leading-none animate-pulse">
              3
            </span>
          </button>
        </div>
      </div>

      {/* 4. CURRENT BID & COUNTDOWN BOX (z-index 20) */}
      <div className="absolute top-[72px] left-4 z-20 flex flex-col items-start space-y-1.5 max-w-[260px]" style={{ direction: 'ltr' }}>
        
        {/* Bid and Timer compact semi-transparent panel */}
        <div className="grid grid-cols-2 gap-3 items-center bg-black/70 backdrop-blur-md py-2 px-3 rounded-xl border border-white/10 shadow-lg">
          {/* Current Bid with left orange highlight border */}
          <div className="border-l-2 border-[#FF6B00] pl-2">
            <span className="text-[8px] text-zinc-400 font-extrabold uppercase tracking-wider block leading-none">CURRENT BID</span>
            <span className="text-base font-black text-white leading-none font-sans block mt-0.5">
              {currentItem.currentPrice.toLocaleString()}{' '}
              <span className="text-[9px] text-[#FF6B00] font-black">JOD</span>
            </span>
          </div>

          {/* Time left countdown */}
          <div className="space-y-0.5 pl-1.5 border-l border-white/5">
            <span className="text-[8px] text-zinc-400 font-extrabold uppercase tracking-wider block leading-none">TIME LEFT</span>
            <span className="text-[13px] font-black text-white font-mono tracking-wide block mt-0.5 leading-none">
              {timeLeftStr}
            </span>
          </div>
        </div>

        {/* Watching orange pill */}
        <div className="flex">
          <span className="inline-flex items-center gap-1 bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#FF6B00] px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shadow-[0_2px_10px_rgba(255,107,0,0.15)]">
            <span className="w-1 h-1 bg-[#FF6B00] rounded-full animate-pulse" />
            <span>342 WATCHING</span>
          </span>
        </div>
      </div>

      {/* 5. RIGHT SIDE ACTIONS (z-index 20) */}
      <div 
        className="absolute z-20 flex flex-col items-center"
        style={{
          right: '12px',
          bottom: '140px',
          gap: '16px'
        }}
      >
        
        {/* Heart/Like */}
        <div className="flex flex-col items-center gap-0.5 font-sans">
          <button 
            type="button"
            onClick={handleLikeToggle}
            className="flex items-center justify-center transition-all active:scale-95 cursor-pointer duration-150"
            style={{
              width: '36px',
              height: '36px',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: isLiked ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              color: 'white'
            }}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
          </button>
          <span 
            className="font-black drop-shadow-md leading-none mt-1"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.8)' }}
          >
            {likesCount}
          </span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center gap-0.5 font-sans">
          <button 
            type="button"
            onClick={() => setShowCommentInput(!showCommentInput)}
            className="flex items-center justify-center transition-all active:scale-95 cursor-pointer duration-150"
            style={{
              width: '36px',
              height: '36px',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              color: 'white'
            }}
          >
            <MessageSquare className="w-4 h-4 text-white" />
          </button>
          <span 
            className="font-black drop-shadow-md leading-none mt-1"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.8)' }}
          >
            {commentCount}
          </span>
        </div>

        {/* HISTORY Orange Circle */}
        <div className="flex flex-col items-center gap-0.5 font-sans">
          <button 
            type="button"
            onClick={() => {
              setSelectedLotId(currentItem.id);
              triggerToast(isAr ? 'عرض سجل عروض المزايدة التاريخية' : 'Opening Bid Ledger History logs');
            }}
            className="flex items-center justify-center transition-all active:scale-95 cursor-pointer duration-150 shadow-[0_4px_16px_rgba(255,107,0,0.35)] hover:brightness-110"
            style={{
              width: '36px',
              height: '36px',
              background: '#FF6B00',
              borderRadius: '50%',
              color: 'white',
              border: 'none',
              outline: 'none'
            }}
          >
            <Gavel className="w-4 h-4 text-white" />
          </button>
          <span 
            className="font-black uppercase tracking-widest leading-none mt-1 drop-shadow-md"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.8)' }}
          >
            {isAr ? 'السجل' : 'HISTORY'}
          </span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center gap-0.5 font-sans">
          <button 
            type="button"
            onClick={() => triggerToast(isAr ? 'تم نسخ الرابط لمشاركة المزاد!' : 'Auction link copied to clipboard!')}
            className="flex items-center justify-center transition-all active:scale-95 cursor-pointer duration-150"
            style={{
              width: '36px',
              height: '36px',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              color: 'white'
            }}
          >
            <Share2 className="w-4 h-4 text-white" />
          </button>
          <span 
            className="font-extrabold uppercase tracking-widest leading-none mt-1 drop-shadow-md"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.8)' }}
          >
            {isAr ? 'مشاركة' : 'SHARE'}
          </span>
        </div>

        {/* Bookmark */}
        <div className="flex flex-col items-center gap-0.5 font-sans">
          <button 
            type="button"
            onClick={handleSaveToggle}
            className="flex items-center justify-center transition-all active:scale-95 cursor-pointer duration-150"
            style={{
              width: '36px',
              height: '36px',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: isSaved ? '1px solid #FF6B00' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              color: 'white'
            }}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'text-[#FF6B00] fill-[#FF6B00]' : 'text-white'}`} style={{ width: '16px', height: '16px' }} />
          </button>
          <span 
            className="font-extrabold uppercase tracking-widest leading-none mt-1 drop-shadow-md"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.8)' }}
          >
            {isAr ? 'حفظ' : 'SAVE'}
          </span>
        </div>



      </div>

      {/* 6. BOTTOM GRADIENT OVERLAY WRAPPER (z-index 20) */}
      <div 
        className="absolute bottom-0 inset-x-0 z-20 flex flex-col pt-16 pb-1 px-3.5 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 40%)' }}
      >
        
        {/* Clickable contents need pointer-events-auto */}
        <div className="pointer-events-auto space-y-1">
          
          {/* Real-time Live Comments Stream */}
          <div 
            className="w-full max-h-[140px] overflow-y-auto mb-2.5 space-y-1.5 pr-4 no-scrollbar flex flex-col justify-end pointer-events-auto"
            style={{ 
              maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 100%)'
            }}
          >
            {chatMessages
              .filter(msg => msg.auctionId === currentItem?.id)
              .slice(-5) // Only display last 5 messages for responsive render performance
              .map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex items-start gap-1.5 px-2.5 py-1 rounded-xl w-max max-w-[85%] text-xs backdrop-blur-md select-none animate-in slide-in-from-bottom duration-300 font-sans ${
                    msg.isBid 
                      ? 'bg-[#FF6B00]/25 border border-[#FF6B00]/45 text-[#FF8A00] font-black shadow-[0_2px_10px_rgba(255,107,0,0.2)]' 
                      : 'bg-black/45 text-white/95 border border-white/5 shadow-xs'
                  }`}
                >
                  <img 
                    src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=50&q=80'} 
                    alt="avatar" 
                    className="w-4.5 h-4.5 rounded-full object-cover shrink-0 border border-white/15"
                    referrerPolicy="no-referrer"
                  />
                  <div className="leading-tight">
                    <span className="font-extrabold text-gray-300 mr-1 text-[11px] font-sans">
                      {msg.userName}:
                    </span>
                    <span className="text-[11.5px] font-sans font-medium">{msg.text}</span>
                  </div>
                </div>
              ))}
          </div>
          
          {/* Product Header Title & Meta */}
          <div className="space-y-0.5">
            <h2 className="text-[19px] font-black text-white tracking-tight leading-tight select-all drop-shadow-lg">
              {formattedTitle}
            </h2>
          </div>

          {/* Real-time Bid simulated bubble - only shown when showBidBubble is active */}
          <div 
            className={`transition-all duration-500 ease-in-out transform ${
              showBidBubble 
                ? 'opacity-100 scale-100 translate-y-[-2px] max-h-[80px] p-2 border border-white/10 mt-1 mb-2 shadow-xl' 
                : 'opacity-0 scale-95 -translate-y-2 max-h-0 p-0 m-0 border-transparent overflow-hidden pointer-events-none'
            } flex items-center justify-between backdrop-blur-md rounded-2xl`}
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          >
            <div className="flex items-center gap-2">
              <img 
                src={lastBidderAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"} 
                alt="Bidder" 
                className="w-7 h-7 rounded-full object-cover border border-white/20 shadow-sm" 
              />
              <div className="flex flex-col">
                <span className="text-[7px] bg-[#FF6B00]/25 text-[#FF6B00] border border-[#FF6B00]/40 px-1.5 py-0.2 rounded font-black uppercase tracking-wider block w-max leading-none">
                  NEW BID
                </span>
                <span className="text-[11px] text-white font-extrabold block mt-0.5 leading-none">
                  {lastBidderName}
                </span>
              </div>
            </div>
            <span className="text-xs font-black text-white font-sans bg-white/10 px-2 rounded-xl border border-white/5 shadow-inner">
              {currentItem.currentPrice.toLocaleString()} JOD
            </span>
          </div>

          {/* Overall bottom area (No solid black background: floating directly on video) */}
          <div className="space-y-1.5 py-1.5 pointer-events-auto">
            {/* Quick bid buttons row */}
            <div className="grid grid-cols-3 gap-2">
              {[25, 50, 100].map((val) => {
                const isActive = activeQuickBidVal === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setSelectedIncrement(val);
                      setActiveQuickBidVal(val);
                      // Instantly trigger bidding and deduct from wallet!
                      const requestedBidAmount = currentItem.currentPrice + val;
                      executeBid(requestedBidAmount);
                      setTimeout(() => {
                        setActiveQuickBidVal(null);
                      }, 400);
                    }}
                    className={`bid-btn-glass text-white font-bold text-[13px] h-[38px] px-4 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isActive ? 'bid-btn-active' : ''
                    }`}
                  >
                    +{val} {isAr ? 'د.أ' : 'JD'}
                  </button>
                );
              })}
            </div>

            {/* Gesture-Based Swipe To Bid Slider */}
            <div className="w-full shrink-0 relative z-30" id="main-lot-bid-submit-cta">
              <SwipeToBid
                amount={bidCTAAmount}
                onSwipeSuccess={() => executeBid(bidCTAAmount)}
                disabled={currentUser.isBlocked || wallet.availableBalance < (bidCTAAmount - (currentItem?.currentBidderId === currentUser.id ? currentItem.currentPrice : 0))}
                language={language}
              />
            </div>
          </div>

          {/* Bottom Nav Bar aligned inside gradient area */}
          <nav 
            className="bg-black/85 backdrop-blur-md border border-white/10 px-4 flex items-center justify-between text-[11px] font-bold tracking-wider text-gray-400 select-none h-[60px] rounded-xl relative z-40"
            id="live-tiktok-bottom-nav"
          >
            <button 
              type="button"
              onClick={() => {
                setActiveView('discovery');
                triggerToast(isAr ? 'الانتقال للرئيسية' : 'Swapped to Main Feed View');
              }}
              className="flex flex-col items-center justify-center gap-1 hover:text-white transition-colors cursor-pointer min-w-[44px]"
            >
              <Home className="w-4.5 h-4.5 text-gray-400" />
              <span className="text-[8px] font-black uppercase tracking-widest">{isAr ? 'الرئيسية' : 'HOME'}</span>
            </button>

            <button 
              type="button"
              onClick={() => {
                setActiveView('discovery');
                triggerToast(isAr ? 'استكشاف لوتات المزاد المتاحة' : 'Opening Explore Listing Filters');
              }}
              className="flex flex-col items-center justify-center gap-1 hover:text-white transition-colors cursor-pointer min-w-[44px]"
            >
              <Search className="w-4.5 h-4.5 text-gray-400" />
              <span className="text-[8px] font-black uppercase tracking-widest">{isAr ? 'استكشاف' : 'EXPLORE'}</span>
            </button>

            {/* Large Floating Glowing Plus Center Action Button */}
            <div className="relative -top-3">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#FF6B00] to-[#FF8A00] rounded-full blur-md opacity-35" />
              <button 
                type="button"
                onClick={() => {
                  setActiveView('upload');
                  triggerToast(isAr ? 'إنشاء إعلان مزاد جديد للموافقة السريعة' : 'Launching studio listing wizard');
                }}
                className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#FF6B00] to-[#FF8A00] flex items-center justify-center text-white active:scale-95 transition-all shadow-lg border border-[#FF6B00]/15 font-black relative z-10 hover:brightness-105 cursor-pointer min-w-[44px] min-h-[44px]"
              >
                <Plus className="w-5.5 h-5.5 text-white stroke-[3.5]" />
              </button>
            </div>

            <button 
              type="button"
              onClick={() => triggerToast(isAr ? 'البث المباشر المفتوح حالياً!' : 'You are inside the active Live Auction room!')}
              className="flex flex-col items-center justify-center gap-1 text-[#FF6B00] relative cursor-pointer min-w-[44px]"
            >
              <Gavel className="w-4.5 h-4.5 text-[#FF6B00]" />
              <span className="text-[8px] font-black uppercase tracking-widest text-[#FF6B00]">{isAr ? 'مباشر' : 'LIVE'}</span>
              <span className="absolute -top-0.5 w-1 h-1 bg-[#FF6B00] rounded-full shadow-[0_0_4px_#FF6B00] animate-pulse"></span>
            </button>

            <button 
              type="button"
              onClick={() => {
                setActiveView('wallet');
                triggerToast(isAr ? 'تصفح محفظة الحساب والضمانات المعتمدة' : 'Direct secure financial wallet');
              }}
              className="flex flex-col items-center justify-center gap-1 hover:text-white transition-colors cursor-pointer min-w-[44px]"
            >
              <User className="w-4.5 h-4.5 text-gray-400" />
              <span className="text-[8px] font-black uppercase tracking-widest">{isAr ? 'حسابي' : 'PROFILE'}</span>
            </button>
          </nav>

        </div>

        {/* COMPACT REAL-TIME COMMENTS TYPING SHEET */}
        {showCommentInput && (
          <div 
            className="absolute inset-x-0 bottom-0 z-[45] p-3.5 pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-250 flex items-center gap-2 border-t border-white/10 rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.6)]"
            style={{ backgroundColor: 'rgba(18,19,24,0.95)', backdropFilter: 'blur(20px)', pointerEvents: 'auto' }}
          >
            <input 
              type="text"
              value={newCommentVal}
              onChange={(e) => setNewCommentVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSendComment();
                }
              }}
              placeholder={isAr ? 'اكتب تعليقاً عاماً للجميع...' : 'Type a public comment...'}
              className="flex-grow h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-white text-[12px] font-medium placeholder-gray-500 outline-hidden focus:border-[#FF6B00]/70 transition-colors pointer-events-auto"
              autoFocus
            />
            <button 
              type="button"
              onClick={handleSendComment}
              className="h-11 px-5 bg-[#FF6B00] hover:bg-orange-600 active:scale-95 text-white font-extrabold text-[12px] uppercase rounded-xl transition-all cursor-pointer min-w-[70px] flex items-center justify-center leading-none pointer-events-auto"
            >
              {isAr ? 'إرسال' : 'SEND'}
            </button>
            <button 
              type="button"
              onClick={() => setShowCommentInput(false)}
              className="w-11 h-11 bg-white/5 rounded-xl border border-[#ffffff10] text-gray-400 flex items-center justify-center hover:text-white cursor-pointer pointer-events-auto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>

      {/* Render specification details slide modal (z-index 40) */}
      {selectedLotId && (
        <AuctionDetailsModal 
          lotId={selectedLotId} 
          onClose={() => setSelectedLotId(null)} 
        />
      )}

      {/* Custom Bid Increment Dialog Modal (z-index 50) */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121318] border border-white/10 rounded-3xl p-5.5 w-full max-w-sm space-y-4 shadow-[0_16px_48px_rgba(0,0,0,0.6)] animate-in fade-in duration-200">
            
            <div className="flex justify-between items-center">
              <h3 className="text-[13px] font-black text-white tracking-wide uppercase flex items-center gap-1.5 font-sans">
                <Sparkles className="w-4 h-4 text-[#FF6B00]" /> {isAr ? 'تحديد زيادة مخصصة للمزايدة' : 'SET CUSTOM INCREMENT'}
              </h3>
              <button 
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="p-1 rounded-full hover:bg-white/10 text-gray-400 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCustomBidSubmit} className="space-y-4">
              <div className="bg-[#0A0B0D] p-3 rounded-2xl flex items-center justify-between border border-white/5">
                <input 
                  type="number" 
                  value={customBidVal} 
                  onChange={(e) => setCustomBidVal(e.target.value)}
                  placeholder="e.g. 150"
                  className="bg-transparent text-lg font-sans font-black text-white focus:outline-none w-full text-center"
                  autoFocus
                />
                <span className="text-xs font-black text-[#FF6B00] font-sans ml-2">JOD</span>
              </div>

              <div className="text-[10.5px] text-gray-400 leading-relaxed text-center font-sans uppercase">
                {isAr ? 'جميع المزايدات مضمونة بخدمة كليك للتحويل المالي المباشر' : 'All bids committed are backed by escrow credit balances'}
              </div>

              <button 
                type="submit" 
                className="w-full bg-[#FF6B00] text-white font-black py-3 rounded-2xl shadow-lg transition-all hover:scale-[1.01] cursor-pointer min-h-[44px]"
              >
                {isAr ? 'حفظ وتأكيد الزيادة لزر المزايدة السريع' : 'CONFIRM AND SAVE'}
              </button>
            </form>

          </div>
        </div>
      )}



    </div>
  );
};
