import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AuctionItem } from '../types';
import { translations } from '../utils/translations';
import { motion } from 'motion/react';
import { WinCelebration, useWinDetection, useToast } from './feedback';
import { getFirstLiveAuction, getLiveAuctions } from '../utils/auctionPhase';
import { 
  Flame, 
  Search, 
  Clock, 
  Plus, 
  Car,
  Laptop,
  Building2,
  Smartphone,
  Watch,
  LayoutGrid,
  Calendar,
  ArrowDown,
  Bookmark,
  Bell,
  ShieldCheck,
  Play,
  MessageCircle
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { CountdownStoriesBar } from './CountdownStoriesBar';
import { AuctionCardSkeleton } from './FeedbackStates';
import { SellerProfileModal } from './SellerProfileModal';

const WHATSAPP_URL = 'https://wa.me/962781444899';

interface PremiumAuctionCardProps {
  item: AuctionItem;
  currentUser: any;
  bids: any[] | null;
  orders: any[] | null;
  sellerProfiles: any[] | null;
  isAr: boolean;
  onJoinLive: (id: string) => void;
  onSelectLot: (id: string) => void;
  setGlobalSelectedOrderId: (id: string) => void;
  setActiveView: (view: string) => void;
}

export const PremiumAuctionCard: React.FC<PremiumAuctionCardProps> = ({
  item,
  currentUser,
  bids,
  orders,
  sellerProfiles,
  isAr,
  onJoinLive,
  onSelectLot,
  setGlobalSelectedOrderId,
  setActiveView,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (!item.endTime) return 120;
    return Math.max(0, Math.floor((item.endTime - Date.now()) / 1000));
  });

  React.useEffect(() => {
    if (!item.endTime || secondsLeft <= 0) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((item.endTime! - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [item.endTime, secondsLeft]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const p = sellerProfiles?.find(profile => profile.userId === item.sellerId || profile.id === item.sellerId);
  const isPremium = p?.verificationStatus === 'premium_verified';
  const isVerified = p?.verificationStatus === 'verified' || isPremium;

  const hasUserBid = bids ? bids.some(b => b.auctionId === item.id && b.bidderId === currentUser?.id) : false;
  const isUserWinner = hasUserBid && item.currentBidderId === currentUser?.id;
  const isCritical = secondsLeft < 60;

  const itemIsEnded = item.status === 'completed' || (item.endTime && item.endTime <= Date.now());

  const handleCardClick = () => {
    if (item.status === 'live') {
      onJoinLive(item.id);
    } else {
      onSelectLot(item.id);
    }
  };

  return (
    <div 
      onClick={handleCardClick}
      className="group relative bg-white border border-gray-100/80 rounded-2xl p-4 shadow-xs hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between h-full hover:-translate-y-1"
      style={{ minHeight: '380px' }}
    >
      {/* 1. Top: Seller Bar */}
      <div className="flex items-center justify-between mb-3 w-full">
        <div className="flex items-center gap-2 max-w-[75%]">
          <img 
            src={p?.storeLogo || item.sellerLogo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'} 
            alt="seller avatar" 
            className="w-8 h-8 rounded-full object-cover border border-zinc-100 shadow-xs shrink-0"
            onError={(e) => {
              e.currentTarget.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';
            }}
          />
          <div className="flex flex-col min-w-0">
            <span className="font-sans font-extrabold text-xs text-zinc-800 truncate leading-none flex items-center gap-1">
              {p?.storeName || item.sellerName}
              {isVerified && (
                <ShieldCheck className={`w-3.5 h-3.5 ${isPremium ? 'text-amber-500' : 'text-emerald-500'} shrink-0`} />
              )}
            </span>
          </div>
        </div>
        
        {/* Live bid count (real signal; card body also shows 👥 total bids) */}
        {item.status === 'live' && (
          <span className="bg-zinc-100 text-zinc-600 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs shrink-0">
            🔨 {item.totalBids || 0}
          </span>
        )}
      </div>

      {/* 2. Center: Large Product Image & Elegant Overlays */}
      <div className="aspect-[4/3] w-full relative overflow-hidden bg-zinc-50 rounded-xl flex items-center justify-center border border-zinc-100/50">
        {/* Image Shimmer Skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 animate-pulse rounded-xl z-10" />
        )}

        <img 
          src={item.thumbnailUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'} 
          alt={item.title} 
          className={`absolute inset-0 w-full h-full object-cover z-0 transition-all duration-500 group-hover:scale-105 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
            setImageLoaded(true);
          }}
        />
        
        {/* Soft elegant shadow overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/5 z-5" />

        {/* Top-Right: Live Badge */}
        {item.status === 'live' && (
          <div className="absolute top-2.5 right-2.5 z-10 bg-red-600 text-white font-extrabold px-2.5 py-1 rounded-full text-[9px] tracking-wide flex items-center gap-1 shadow-md">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
            <span>{isAr ? '🔴 مباشر' : '🔴 LIVE'}</span>
          </div>
        )}

        {/* Bottom-Right: Time remaining pill */}
        {!itemIsEnded && (
          <div className={`absolute bottom-2.5 right-2.5 z-10 px-2.5 py-1 rounded-full text-[10px] font-mono font-black flex items-center gap-1 shadow-md border ${
            isCritical 
              ? 'bg-red-600 text-white border-red-500 animate-pulse' 
              : 'bg-black/75 text-white border-white/10 backdrop-blur-xs'
          }`}>
            <span>⏱️ {formatTime(secondsLeft)}</span>
          </div>
        )}

        {/* Bottom-Left: Winner / Outbid status overlay */}
        {!itemIsEnded && hasUserBid && (
          <div className={`absolute bottom-2.5 left-2.5 z-10 px-2.5 py-1 rounded-full text-[9px] font-black shadow-md border backdrop-blur-xs ${
            isUserWinner 
              ? 'bg-emerald-600/90 text-white border-emerald-500' 
              : 'bg-rose-600/90 text-white border-rose-500'
          }`}>
            <span>{isUserWinner ? (isAr ? '💚 أنت المزايد الأعلى' : '💚 Winning') : (isAr ? '❤️ شخص آخر زايد عليك' : '❤️ Outbid')}</span>
          </div>
        )}
      </div>

      {/* 3. Bottom: Metadata, Current Bid, & Unified Premium Button */}
      <div className="flex flex-col flex-grow mt-3 text-left rtl:text-right">
        {/* Title & Bidders count */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold text-sm text-zinc-900 group-hover:text-[#E85D04] transition-all leading-snug line-clamp-1">
            {item.title}
          </h3>
          <span className="text-[10px] text-zinc-400 font-bold shrink-0 mt-0.5">
            👥 {item.totalBids || 0} {isAr ? 'مزايدات' : 'bids'}
          </span>
        </div>

        {/* Description line to fill space and look elegant */}
        {item.description && (
          <p className="text-[10.5px] text-zinc-400 mt-1 line-clamp-1">
            {item.description}
          </p>
        )}

        {/* Current Bid Card (largest visual footprint) */}
        <div className="mt-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100 flex flex-col justify-center">
          <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-extrabold block">
            {isAr ? 'المزايدة الحالية' : 'CURRENT BID'}
          </span>
          <span className="text-xl font-black text-zinc-950 mt-1 font-sans leading-none flex items-baseline gap-1">
            {item.currentPrice.toLocaleString()} 
            <span className="text-xs text-[#E85D04] font-black">{isAr ? 'د.أ' : 'JOD'}</span>
          </span>
        </div>

        {/* ONE and only primary action button */}
        {(() => {
          if (itemIsEnded) {
            const itemBids = bids?.filter(b => b.auctionId === item.id) || [];
            const userIsWinner = currentUser?.id && item.currentBidderId === currentUser.id && itemBids.some(b => b.bidderId === currentUser.id);

            if (userIsWinner) {
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const matchingOrder = orders?.find(o => o.auctionId === item.id && o.buyerId === currentUser?.id);
                    if (matchingOrder) {
                      setGlobalSelectedOrderId(matchingOrder.id);
                    }
                    setActiveView('orders');
                  }}
                  className="w-full h-12 mt-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  🎉 {isAr ? 'عرض الطلب' : 'VIEW ORDER'}
                </button>
              );
            }

            return (
              <button
                disabled
                className="w-full h-12 mt-3 bg-zinc-100 text-zinc-400 rounded-xl text-xs font-black transition-all cursor-not-allowed flex items-center justify-center gap-1"
              >
                🏁 {isAr ? 'انتهى المزاد' : 'AUCTION ENDED'}
              </button>
            );
          }

          if (item.status === 'live') {
            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onJoinLive(item.id);
                }}
                className="w-full h-12 mt-3 bg-[#E85D04] hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                🔴 {isAr ? 'دخول البث المباشر' : 'JOIN LIVE'}
              </button>
            );
          }

          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectLot(item.id);
              }}
              className="w-full h-12 mt-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              ⏱️ {isAr ? 'زايد الآن' : 'BID NOW'}
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export const DiscoveryFeedView: React.FC = () => {
  const {
    auctions,
    auctionsLoaded,
    setActiveAuctionId,
    setActiveView, 
    language, 
    setLanguage, 
    approveListing, 
    currentUser,
    notifications,
    setShowNotifications,
    sellerProfiles,
    bids,
    orders,
    setGlobalSelectedOrderId
  } = useApp();
  
  const { showToast } = useToast();
  const unreadCount = notifications ? notifications.filter(n => !n.read).length : 0;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming'>('live');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Skeletons only while genuinely waiting on the first auctions snapshot —
  // tab/category/search changes filter in-memory data and render instantly
  // (the old synthetic 550ms delay is gone).
  const isLoading = !auctionsLoaded;

  const t = translations[language];
  const isAr = language === 'ar';

  // Win celebration: fires only when a watched auction *transitions* to
  // 'completed' while this user is the highest bidder (per-id previous-status
  // ref inside the hook — never on mount into already-completed auctions).
  const { win, clearWin } = useWinDetection(auctions, currentUser?.id, currentUser?.email);
  const handleWinPay = () => {
    const wonAuctionId = win?.auctionId;
    clearWin();
    const matchingOrder = orders?.find(o => o.auctionId === wonAuctionId && o.buyerId === currentUser?.id);
    if (matchingOrder) {
      setGlobalSelectedOrderId(matchingOrder.id);
    }
    setActiveView('orders');
  };

  // `match` includes legacy AuctionItem.category values so existing lots keep filtering correctly.
  const categoriesList = React.useMemo(() => [
    { name: 'All', icon: <LayoutGrid className="w-3.5 h-3.5" />, arName: 'الكل', match: null as string[] | null },
    { name: 'Cars', icon: <Car className="w-3.5 h-3.5" />, arName: 'سيارات', match: ['Cars', 'Vehicles'] },
    { name: 'Real Estate', icon: <Building2 className="w-3.5 h-3.5" />, arName: 'عقارات', match: ['Real Estate'] },
    { name: 'Phones', icon: <Smartphone className="w-3.5 h-3.5" />, arName: 'هواتف', match: ['Phones', 'Electronics'] },
    { name: 'Watches', icon: <Watch className="w-3.5 h-3.5" />, arName: 'ساعات', match: ['Watches'] },
    { name: 'Electronics', icon: <Laptop className="w-3.5 h-3.5" />, arName: 'إلكترونيات', match: ['Electronics'] }
  ], []);

  const filteredAuctions = React.useMemo(() => {
    return auctions.filter(item => {
      if (activeTab === 'live') {
        if (item.status !== 'live') return false;
        if (item.endTime && item.endTime <= Date.now()) return false;
      }
      if (activeTab === 'upcoming' && item.status !== 'upcoming') return false;

      if (searchTerm) {
        const matchText = (item.title + item.description).toLowerCase();
        if (!matchText.includes(searchTerm.toLowerCase())) return false;
      }

      if (selectedCategory !== 'All') {
        const pill = categoriesList.find(c => c.name === selectedCategory);
        const matches = pill?.match || [selectedCategory];
        if (!matches.includes(item.category)) return false;
      }

      return true;
    });
  }, [auctions, activeTab, searchTerm, selectedCategory, categoriesList]);

  const pendingListingsToDisplay = React.useMemo(() => {
    const isStrictAdmin = currentUser && (currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true || currentUser.role === 'admin');
    return auctions.filter(a => {
      if (a.status !== 'processing' && a.status !== 'pending') return false;
      if (isStrictAdmin) return true; // Admins can see all pending lots to approve on-the-fly
      return a.sellerId === currentUser?.id; // Regular merchants see their own under-review lots
    });
  }, [auctions, currentUser]);

  const formatItemTimeLeft = (item?: AuctionItem) => {
    if (!item) return '12:30';
    if (!item.endTime) return '12:30';
    const secondsLeft = Math.max(0, Math.floor((item.endTime - Date.now()) / 1000));
    if (secondsLeft <= 0) return '00:00';
    const mm = Math.floor(secondsLeft / 60);
    const ss = secondsLeft % 60;
    return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  };

  const renderCardCover = (item?: AuctionItem, fallbackIcon?: React.ReactNode, isPriority?: boolean) => {
    if (item && item.thumbnailUrl) {
      return (
        <>
          <img 
            src={item.thumbnailUrl} 
            alt={item.title} 
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            loading={isPriority ? "eager" : "lazy"}
            {...(isPriority ? { fetchPriority: "high" } : {})}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
        </>
      );
    } else if (item && item.videoUrl) {
      return (
        <>
          <video 
            src={item.videoUrl} 
            muted 
            playsInline 
            loop 
            preload="none"
            onMouseEnter={(e) => {
              e.currentTarget.play().catch(() => {});
            }}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
            }}
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
        </>
      );
    } else {
      return (
        <div className="transform group-hover:scale-105 duration-300 transition-transform z-10">
          {fallbackIcon}
        </div>
      );
    }
  };

  const handleJoinLive = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  // Genuinely live right now (status 'live' AND not past endTime) — drives the
  // live-now strip, the primary route into the bidding room from Discover.
  const liveNowAuctions = getLiveAuctions<AuctionItem>(auctions);

  // Dead-stream guard: only enter the live room when an auction is genuinely
  // live. Otherwise stay on Discover and say so — never fall back to auctions[0].
  const handleWatchLive = () => {
    // Explicit type arg: useApp() is untyped here (circular import), so
    // inference would otherwise collapse to the helper's constraint.
    const firstLive = getFirstLiveAuction<AuctionItem>(auctions);
    if (firstLive) {
      setActiveAuctionId(firstLive.id);
      setActiveView('live');
    } else {
      showToast({
        type: 'info',
        title: isAr ? 'لا توجد مزادات مباشرة حالياً' : 'No live auctions right now',
        message: isAr ? 'تفقد المواعيد القادمة — البث يبدأ قريباً.' : 'Check the upcoming drops — the next stream starts soon.',
      });
    }
  };

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-[#F7F6F3] pb-4 overscroll-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="discovery-feed-root"
    >
      
      {/* Top Mobile Bar Header - Exactly like the Screenshot, hidden on desktop */}
      <div className="p-4 flex items-center justify-between sticky top-0 bg-white z-40 lg:hidden">
        <div className="flex items-center gap-2">
          {/* Orange Brand Square M logo */}
          <div className="w-9 h-9 rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base shadow-sm">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gray-950 font-sans">
              {isAr ? 'مزاد جو' : 'Mazad Jo'}
            </h1>
          </div>
        </div>

        {/* Action Header controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-[11px] font-bold text-gray-700 font-sans transition-all shrink-0"
            id="discover-lang-btn"
          >
            {language === 'en' ? 'العربية' : 'EN'}
          </button>

          <button
            onClick={() => setShowNotifications(true)}
            className="relative p-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
            title={isAr ? 'الإشعارات' : 'Notifications'}
            id="mobile-header-bell"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#E85D04] text-white text-[7.5px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveView('upload')}
            className="px-3 py-1.5 border border-[#E85D04] bg-[#E85D04]/5 hover:bg-[#E85D04]/10 rounded-xl text-[11px] font-bold text-[#E85D04] flex items-center gap-1 transition-all shrink-0"
            id="sell-wizard-btn"
          >
            <Plus className="w-3 h-3 stroke-[3]" /> 
            <span>{isAr ? 'بيع' : 'Sell'}</span>
          </button>
        </div>
      </div>

      {/* Live-now strip: the primary route into the bidding room from Discover.
          Hidden when nothing is genuinely live. */}
      {liveNowAuctions.length > 0 && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          onClick={handleWatchLive}
          className="mx-4 mt-3 mb-1 lg:mx-0 lg:mt-2 lg:mb-2 flex items-center justify-between gap-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl px-4 py-2.5 shadow-md shadow-red-600/20 transition-colors cursor-pointer active:scale-[0.99]"
          id="live-now-strip"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <span className="text-xs font-black tracking-tight truncate">
              {isAr
                ? `🔴 مباشر الآن — ${liveNowAuctions.length} ${liveNowAuctions.length === 1 ? 'مزاد' : 'مزادات'}`
                : `🔴 Live now — ${liveNowAuctions.length} ${liveNowAuctions.length === 1 ? 'auction' : 'auctions'}`}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider shrink-0 bg-white/15 rounded-full px-2.5 py-1">
            <Play className="w-3 h-3 fill-white" />
            <span>{isAr ? 'ادخل البث' : 'Watch'}</span>
          </span>
        </motion.button>
      )}

      {/* Premium Desktop Page Header (Apple / Stripe Dashboard style) */}
      <div className="hidden lg:flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 mt-2" id="discover-desktop-header">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {isAr ? 'اكتشف المزادات الحية والنشطة' : 'Discover Live Drops'}
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            {isAr 
              ? 'تصفح وشارك في مزادات الفيديو الفورية والمؤمنة بالكامل لحمايتك وضمان أموالك.' 
              : 'Browse and bid in real-time verified video stream drops with secure Jordan CliQ escrow.'}
          </p>
        </div>
        <div>
          <button
            onClick={handleWatchLive}
            className="px-4 py-2 bg-[#E85D04] hover:bg-[#D05303] text-white font-bold text-xs rounded-xl flex items-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isAr ? 'شاهد البث الآن' : 'Watch Live Drops'}</span>
          </button>
        </div>
      </div>

      {/* Hero Welcome Banner Card (Black Slate Vibe with Glow Accent) - Mobile only */}
      <div className="px-4 pb-2 lg:hidden">
        <div className="relative rounded-3xl bg-[#111111] p-5 overflow-hidden shadow-sm">
          {/* Circular subtle glowing background shape */}
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-orange-950/40 rounded-full blur-xl"></div>
          
          <div className="relative z-10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-[#E85D04] tracking-wider uppercase block">
                {isAr ? 'مزادات مباشرة' : 'LIVE AUCTIONS'}
              </span>
              <h2 className="text-xl font-black text-white leading-tight font-sans tracking-tight mt-1">
                {isAr ? 'زايد. اشترِ.' : 'Bid. Buy.'} <br/>
                {isAr ? 'بع — مباشر.' : 'Sell — Live.'}
              </h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 font-sans font-medium">
              {isAr ? 'مزادات فورية بالوقت الحقيقي مع حماية وضمان أموال المشترين.' : 'Real-time auctions with secure escrow payments.'}
            </p>
          </div>
        </div>
      </div>

      {/* Countdown Stories Bar - Horizontally Scrollable rectangular cards */}
      <CountdownStoriesBar />

      {/* Search Input bar with soft beige/gray layout bg */}
      <div className="p-4 space-y-4">
        {/* Join Funnel Banner (Non-members only): 3-step money story + join CTA */}
        {currentUser?.subscriptionStatus !== 'active' && (
          <div
            className="bg-orange-50/70 border border-orange-100 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="join-funnel-banner"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-gray-800 leading-snug">
              <span className="flex items-center gap-1">
                <span className="text-[#FF6B00] font-black">①</span>
                {isAr ? 'انضم بدينار واحد' : 'Join for 1 JD'}
              </span>
              <span className="text-orange-200">•</span>
              <span className="flex items-center gap-1">
                <span className="text-[#FF6B00] font-black">②</span>
                {isAr ? 'زايد مجاناً' : 'Bid freely'}
              </span>
              <span className="text-orange-200">•</span>
              <span className="flex items-center gap-1">
                <span className="text-[#FF6B00] font-black">③</span>
                {isAr ? 'ادفع فقط عند الفوز (+٥٪ عمولة)' : 'Pay only when you win (+5% premium)'}
              </span>
            </div>
            <button
              onClick={() => setActiveView('wallet')}
              className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
            >
              {isAr ? 'انضم الآن — ١ د.أ' : 'Join now — 1 JD'}
            </button>
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            placeholder={isAr ? 'ابحث: سيارات، ساعات، عقارات…' : 'Search: cars, watches, real estate…'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full bg-[#F2F2EF] border border-transparent rounded-[18px] py-3.5 ${isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-xs font-medium text-gray-900 placeholder-gray-450 focus:outline-none focus:bg-white focus:border-gray-250 transition-all font-sans`}
          />
          <Search className={`absolute ${isAr ? 'right-4' : 'left-4'} top-4 w-4.5 h-4.5 text-gray-400`} />
        </div>

        {/* Elegant Horizontal Categories Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 font-sans">
          {categoriesList.map(cat => {
            const isSelected = selectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-xs' : 'bg-white text-gray-700 border-gray-200/80 hover:bg-gray-50'}`}
              >
                {cat.icon}
                <span>{isAr ? cat.arName : cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Won Orders Shortcut Banner / Widget */}
      {(() => {
        const wonOrdersAwaiting = orders?.filter(o => o.buyerId === currentUser?.id && o.status === 'waiting_payment') || [];
        if (wonOrdersAwaiting.length === 0) return null;

        return (
          <div className="mx-4 mb-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0 animate-bounce">🎉</div>
              <div className="text-right rtl:text-right">
                <h4 className="font-black text-xs text-white uppercase tracking-wide">
                  {isAr ? 'مبروك 🎉 ربحت المزاد!' : 'CONGRATULATIONS! YOU WON THE AUCTION!'}
                </h4>
                <p className="text-[11px] text-emerald-100 mt-0.5 leading-snug">
                  {isAr ? 'الطلب صار بانتظار الدفع أو التأكيد' : 'The order is pending payment/confirmation.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (wonOrdersAwaiting[0]) {
                  setGlobalSelectedOrderId(wonOrdersAwaiting[0].id);
                }
                setActiveView('orders');
              }}
              className="bg-white text-emerald-800 hover:bg-emerald-50 px-4 py-2 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all shrink-0"
            >
              {isAr ? 'عرض الطلب' : 'View Order'}
            </button>
          </div>
        );
      })()}

      {/* Pending Listings Banner (For Admins & Merchants) */}
      {pendingListingsToDisplay.length > 0 && (() => {
        const isStrictAdmin = currentUser && (currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true || currentUser.role === 'admin');
        return (
          <div className="mx-4 mb-4 p-4 bg-orange-50/70 border border-orange-100 rounded-2xl space-y-2.5">
            <div className="flex gap-2 items-start">
              <span className="w-2 h-2 bg-[#FF6B00] rounded-full mt-1.5 animate-ping shrink-0 animate-pulse"></span>
              <div>
                <h4 className="text-xs font-extrabold text-[#FF6B00] uppercase font-sans tracking-wide">
                  {isStrictAdmin 
                    ? (isAr ? '🛡️ مراجعة واعتماد المزادات المعلقة' : '🛡️ PENDING AUCTIONS RELEASES')
                    : (isAr ? '⏳ مزادك قيد المراجعة والتحقق' : '⏳ YOUR UNDER REVIEW AUCTION')
                  }
                </h4>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                  {isStrictAdmin
                    ? (isAr ? 'بصفتك مديراً للمنصة، يمكنك اعتماد وتفعيل هذه المزادات مباشرة لتظهر لجميع المزايدين:' : 'As an Administrator, you can instantly approve and launch these lots to the public live feed:')
                    : (isAr ? 'تم رفع معروضك بنجاح وهو قيد المراجعة الأمنية وسيظهر للمزايدين فور اعتماده:' : 'Your listing was successfully uploaded. It will appear on the active live feed once approved:')
                  }
                </p>
              </div>
            </div>
            
            <div className="space-y-2 pt-1 border-t border-orange-100">
              {pendingListingsToDisplay.map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-gray-150 p-2.5 rounded-xl gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={item.thumbnailUrl} alt="Cover" className="w-8 h-8 rounded-lg object-cover border border-gray-150 shrink-0" loading="lazy" width="32" height="32" />
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-gray-900 block truncate leading-tight">{item.title}</span>
                      <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                        {item.startingPrice.toLocaleString()} JOD
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-1.5 shrink-0">
                    {isStrictAdmin ? (
                      <button
                        onClick={() => {
                          if (window.confirm(isAr ? `هل أنت متأكد من رغبتك في تفعيل المزاد "${item.title}" فوراً؟` : `Are you sure you want to approve "${item.title}" and go live now?`)) {
                            approveListing(item.id);
                          }
                        }}
                        className="text-[10px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1"
                      >
                        ✅ {isAr ? 'موافقة وتفعيل البث' : 'Approve & Go Live'}
                      </button>
                    ) : (
                      <span className="text-[9.5px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg">
                        {isAr ? '⏳ قيد المراجعة' : '⏳ IN REVIEW'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Tabs active live feed & upcoming drops with Fire & Calendar icon */}
      <div className="px-4 flex border-b border-gray-100 mb-3">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-3 text-center text-xs font-bold relative transition-all ${activeTab === 'live' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Flame className={`w-4 h-4 ${activeTab === 'live' ? 'text-[#E85D04] fill-[#E85D04] animate-pulse' : 'text-gray-400'}`} /> 
            {isAr ? 'بث مباشر نشط' : 'Active live feed'}
          </span>
          {activeTab === 'live' && (
            <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#E85D04] rounded-full"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-3 text-center text-xs font-bold relative transition-all ${activeTab === 'upcoming' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400" /> 
            {isAr ? 'مواعيد قادمة' : 'Upcoming drops'}
          </span>
          {activeTab === 'upcoming' && (
            <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#E85D04] rounded-full"></span>
          )}
        </button>
      </div>

      {/* Dual-Column High Fidelity grid list of live streams preview */}
      <div className="flex-grow px-4 pb-12">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <AuctionCardSkeleton key={n} />
            ))}
          </div>
        ) : filteredAuctions.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {filteredAuctions.map(item => (
              <PremiumAuctionCard
                key={item.id}
                item={item}
                currentUser={currentUser}
                bids={bids}
                orders={orders}
                sellerProfiles={sellerProfiles}
                isAr={isAr}
                onJoinLive={handleJoinLive}
                onSelectLot={setSelectedLotId}
                setGlobalSelectedOrderId={setGlobalSelectedOrderId}
                setActiveView={setActiveView}
              />
            ))}
          </div>
        ) : (
          <div
            className="text-center py-16 px-4 bg-white border border-dashed border-gray-200 rounded-3xl shadow-xs flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="feedback-empty-state"
          >
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6B00] animate-bounce">
              <Calendar className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                {isAr ? 'المزادات تُعلن يومياً 📢' : 'Auctions are announced daily 📢'}
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr
                  ? 'تابع قناتنا على واتساب ليوصلك موعد كل مزاد أول بأول — أو تفقد المواعيد القادمة.'
                  : 'Follow our WhatsApp channel to catch every drop — or check the upcoming schedule.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <button
                onClick={() => window.open(WHATSAPP_URL, '_blank', 'noopener,noreferrer')}
                className="px-4 py-2 bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-extrabold text-[11px] rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {isAr ? 'تابعنا على واتساب' : 'Follow on WhatsApp'}
              </button>
              <button
                onClick={() => setActiveTab('upcoming')}
                className="px-4 py-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 font-bold text-[11px] rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                {isAr ? 'المواعيد القادمة' : 'Upcoming drops'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Render specification details slide modal */}
      {selectedLotId && (
        <AuctionDetailsModal 
          auctionId={selectedLotId} 
          onClose={() => setSelectedLotId(null)} 
        />
      )}

      {/* Render Seller complete profile modal */}
      {selectedProfileId && (
        <SellerProfileModal
          sellerId={selectedProfileId}
          isOpen={true}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

      {/* Win celebration — always mounted; bursts on the win transition */}
      <WinCelebration
        show={win !== null}
        auctionTitle={win?.auctionTitle ?? ''}
        totalDue={win?.totalDue ?? 0}
        isAr={isAr}
        onPay={handleWinPay}
        onClose={clearWin}
      />
    </div>
  );
};
