import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { SellerProfileModal } from './SellerProfileModal';
import { Pressable, CountUp, BidConfirm, WinningPill, useToast, FirstBidCoach, markFirstBidDone } from './feedback';
import { 
  Volume2, 
  VolumeX, 
  Bookmark, 
  Share2, 
  Sparkles, 
  Eye, 
  Send, 
  ShieldCheck,
  Trophy,
  Play,
  Heart,
  Grid,
  Gavel,
  Users,
  Settings,
  HelpCircle,
  MapPin,
  Truck,
  Copy,
  Smile,
  Star
} from 'lucide-react';
import { SwipeToBid } from './SwipeToBid';
import { resolveConfirm } from '../hooks/useBidFlow';
import { resolveAvatarUrl } from '../utils/avatarPlaceholder';
import { isAuctionOpen } from '../utils/auctionPhase';
import { minNextBid, totalWithPremium } from '../utils/bidMath';
import { compactJod } from '../utils/bidFormat';
import { formatAmmanClock } from '../utils/ammanTime';
import { serverNow } from '../utils/serverTime';
import { getAuctionMedia } from '../utils/auctionMedia';
import { MediaGallery } from './feedback/MediaGallery';

interface DesktopLiveAuctionLayoutProps {
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
  isAr: boolean;
  onOpenDetails: (id: string) => void;
  liveAuctions: any[];
  onSelectAuction: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  showToast: string | null;
  recentBids?: any[];
  allActivities?: any[];
}

export const DesktopLiveAuctionLayout: React.FC<DesktopLiveAuctionLayoutProps> = ({
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
  isAr,
  onOpenDetails,
  liveAuctions,
  onSelectAuction,
  videoRef,
  videoContainerRef,
  showToast,
  recentBids = [],
  allActivities = [],
}) => {
  const { sellerProfiles, setActiveView, bids, orders, setGlobalSelectedOrderId, isAuthenticated, requestSignIn } = useApp();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const { showToast: pushToast } = useToast();

  // PERF (Wave 4): the desktop HH:MM:SS pill owns its OWN 1s clock instead of
  // receiving `timeLeftStr` from LiveStreamView. That way the per-second tick
  // stays confined to this component and never re-renders the parent room.
  const [timeLeftStr, setTimeLeftStr] = useState<string>('00:00:00');
  // PF7: depend on the primitives the timer actually reads, NOT the
  // activeAuction object identity — before PF5, every bid on ANY lot handed
  // this component a fresh object and tore down/rebuilt the interval
  // mid-snipe-window. ⚠️TIMING: `endTime` MUST stay in the deps (anti-snipe
  // +15s extension must restart the countdown), `status` for the
  // live→completed flip, and `scheduledStartAt` because the pre-open branch
  // counts down to it (a reschedule must retarget the timer).
  const activeAuctionId = activeAuction?.id;
  const activeAuctionEndTime = activeAuction?.endTime;
  const activeAuctionStatus = activeAuction?.status;
  const activeAuctionScheduledStartAt = activeAuction?.scheduledStartAt;
  useEffect(() => {
    if (!activeAuctionId) {
      setTimeLeftStr('00:00:00');
      return;
    }
    const updateTimer = () => {
      // Pre-open auctions count down to their scheduled start; open auctions count down to the end.
      const open = isAuctionOpen(activeAuctionStatus);
      const target = !open && activeAuctionScheduledStartAt
        ? activeAuctionScheduledStartAt
        : activeAuctionEndTime;
      const remainingMs = (target ?? 0) - serverNow();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));

      // T-0 dead zone: scheduled start has passed but the opener cron hasn't flipped it live yet.
      if (!open && (activeAuctionScheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
        setTimeLeftStr(isAr ? 'يبدأ الآن…' : 'Starting…');
        return;
      }

      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        // Clamp at zero: the server closer flips the status shortly.
        setTimeLeftStr(isAr ? 'انتهى المزاد' : 'Auction ended');
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeAuctionId, activeAuctionEndTime, activeAuctionStatus, activeAuctionScheduledStartAt, isAr]);

  // --- The bid moment: confirm-then-bid + success rush ---
  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const [showWinPill, setShowWinPill] = useState(false);
  const winPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (winPillTimer.current) clearTimeout(winPillTimer.current);
  }, []);

  // Executes the bid (used by the confirm flow and by a completed SwipeToBid
  // gesture, which stays no-confirm; a plain CLICK on the swipe track routes
  // through the BidConfirm dialog via onTap instead)
  const runBid = async (amount: number) => {
    // Guest browsing: bidding is THE signup moment — a guest never reaches
    // placeBid (whose non-member fallback is the subscription sheet).
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    setPendingBid(null);
    const res = await onBidExecute(amount);
    if (res && res.success) {
      markFirstBidDone(); // first successful bid retires the first-bid coach
      // Success = a rush: the price CountUp animates on its own; pop the winning pill.
      setShowWinPill(true);
      if (winPillTimer.current) clearTimeout(winPillTimer.current);
      winPillTimer.current = setTimeout(() => setShowWinPill(false), 1200);
    }
  };

  // Same price-move protection as mobile (MobileLiveAuctionLayout/AuctionDetailsModal):
  // if a rival outbids during the ≤10s confirm window, re-prompt at the fresh
  // minimum instead of sending the stale amount (which the server would reject
  // with a generic "minimum bid required").
  const [priceMoved, setPriceMoved] = useState(false);

  // Open a fresh confirm (resets any stale "price moved" flag).
  const openConfirm = (amount: number) => {
    // Guest browsing: a bid tap signs the guest up instead of staging a confirm.
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    setPriceMoved(false);
    setPendingBid(amount);
  };

  // At confirm, recompute against the LATEST minimum (nextBidAmount is derived
  // from live auction state every render): re-prompt if it moved, else send.
  const handleConfirm = (amount: number) => {
    const decision = resolveConfirm(amount, nextBidAmount);
    if (decision.action === 'reprompt') {
      setPriceMoved(true);
      setPendingBid(decision.amount); // re-open confirm at the fresh minimum
      return;
    }
    setPriceMoved(false);
    runBid(decision.amount);
  };

  const handleCancel = () => {
    setPriceMoved(false);
    setPendingBid(null);
  };

  // --- Anti-snipe drama: red pulsing countdown under 10s ---
  const msLeft = activeAuction?.endTime ? activeAuction.endTime - Date.now() : Infinity;
  const isSnipeWindow =
    isAuctionOpen(activeAuction?.status) &&
    Number.isFinite(msLeft) &&
    msLeft > 0 &&
    msLeft < 10000;

  // Toast when the end time extends (a late bid pushed the clock)
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

  const activeSellerProfile = sellerProfiles?.find(
    p => p.userId === activeAuction?.sellerId || p.id === activeAuction?.sellerId
  );

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const trustScore = activeSellerProfile?.trustScore;
  const isEnded = activeAuction?.status === 'completed' || (activeAuction?.endTime ? activeAuction.endTime <= Date.now() : false);

  // Gallery source items (video first, then thumbnail/mediaUrls/concierge
  // photos, de-duped) — MediaGallery owns play/pause + muted sync internally.
  const mediaItems = React.useMemo(() => getAuctionMedia(activeAuction), [activeAuction]);

  // Navigation Links for left sidebar
  const navLinks = [
    { id: 'live', labelEn: 'Live Auctions', labelAr: 'المزادات المباشرة', icon: Play, active: true },
    { id: 'categories', labelEn: 'Categories', labelAr: 'الفئات', icon: Grid },
    { id: 'saved', labelEn: 'Saved Items', labelAr: 'العناصر المحفوظة', icon: Bookmark },
    { id: 'my-bids', labelEn: 'My Bids', labelAr: 'مزايداتي', icon: Gavel },
    { id: 'following', labelEn: 'Following', labelAr: 'المتابعة', icon: Users },
    { id: 'settings', labelEn: 'Settings', labelAr: 'الإعدادات', icon: Settings },
    { id: 'help', labelEn: 'Help Center', labelAr: 'مركز المساعدة', icon: HelpCircle },
  ];

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-row overflow-hidden bg-[#fafafa] relative select-none" id="mazad-jo-desktop-live-platform">
      
      {/* Toast Overlay */}
      {showToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-[#E85D04] text-white px-5 py-2.5 rounded-xl text-xs font-black tracking-wide shadow-lg animate-fade-in text-center border border-white/10">
          {showToast}
        </div>
      )}

      {/* ======================================================================
          COLUMN 1: DARK LEFT SIDEBAR (280px)
          ====================================================================== */}
      <aside 
        className="hidden lg:flex flex-col w-[280px] bg-white shrink-0 h-full border-r border-gray-200/80" 
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="desktop-live-auctions-sidebar"
      >
        {/* Header section with count badge */}
        <div className="p-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs font-black tracking-wider text-gray-900 uppercase font-sans">
              {isAr ? 'المزادات المباشرة' : 'Live Auctions'}
            </span>
          </div>
          <span className="bg-[#E85D04]/15 text-[#E85D04] text-[10px] font-black px-2.5 py-0.5 rounded border border-[#E85D04]/25 font-sans">
            {liveAuctions.length}
          </span>
        </div>

        {/* Scrollable Auction cards list */}
        <div className="flex-1 p-3 space-y-2.5 overflow-y-auto no-scrollbar">
          {liveAuctions.map((item) => {
            const isActive = item.id === activeAuction.id;
            const itemPrice = item.currentPrice;
            const itemBidCount = item.totalBids || 0;
            return (
              <button
                key={item.id}
                onClick={() => onSelectAuction(item.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all border text-left cursor-pointer group select-none relative overflow-hidden ${
                  isActive 
                    ? 'bg-orange-50/70 border-[#E85D04] text-gray-900 font-black shadow-[0_0_12px_rgba(232,93,4,0.08)]' 
                    : 'bg-gray-50/50 border-transparent hover:bg-gray-100/80 text-gray-500 hover:text-gray-900'
                }`}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                {/* Thumbnail */}
                <div className="w-12 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200/60 relative">
                  <img 
                    src={item.thumbnailUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    referrerPolicy="no-referrer" 
                  />
                  {isActive ? (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-[#E85D04] animate-ping" />
                    </div>
                  ) : (
                    <div className="absolute top-1 left-1 bg-red-600/90 text-white text-[7px] font-black px-1 py-0.2 rounded uppercase tracking-wider">
                      LIVE
                    </div>
                  )}
                </div>

                {/* Info Block */}
                <div className="min-w-0 flex-grow text-left rtl:text-right">
                  <h4 className="text-[11px] font-bold text-gray-800 truncate group-hover:text-gray-900 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-[#E85D04] font-black mt-1 leading-none font-sans">
                    {itemPrice.toLocaleString()} JOD
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="inline-block text-[8px] font-black uppercase bg-gray-100 border border-gray-200/60 text-gray-500 px-1.5 py-0.5 rounded-md leading-none">
                      {item.category || (isAr ? 'إلكترونيات' : 'ELECTRONICS')}
                    </span>
                    <span className="text-[8px] text-gray-400 font-mono flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5" />
                      {itemBidCount} {isAr ? 'مزايدة' : 'bids'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Middle section Navigation Links */}
        <div className="p-3 border-t border-gray-100 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => {
                  if (link.id === 'live') {
                    setActiveView('live');
                  } else {
                    setActiveView('discovery');
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  link.active 
                    ? 'bg-[#E85D04]/10 text-[#E85D04]' 
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                <Icon className="w-4 h-4 shrink-0 stroke-[2]" />
                <span>{isAr ? link.labelAr : link.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom Seller Card */}
        {activeSellerProfile && (
          <div 
            onClick={() => setSelectedProfileId(activeSellerProfile.userId)}
            className="mt-auto p-3 m-3 bg-gray-50/80 hover:bg-gray-100 border border-gray-100 rounded-xl flex items-center justify-between gap-2.5 transition-colors cursor-pointer"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={resolveAvatarUrl(activeSellerProfile.storeLogo, activeSellerProfile.userId)}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0"
              />
              <div className="min-w-0 text-left rtl:text-right">
                <span className="text-[11px] font-bold text-gray-800 truncate block leading-tight">
                  {activeSellerProfile.storeName || 'MAZAD JO Store'}
                </span>
                <span className="text-[9px] text-[#E85D04] font-semibold block leading-none mt-1">
                  {isAr ? 'حساب بائع موثق' : 'Verified Merchant'}
                </span>
              </div>
            </div>
            <span className="text-gray-400 font-sans text-xs">›</span>
          </div>
        )}
      </aside>

      {/* ======================================================================
          COLUMN 2: MAIN HERO VIDEO AND INFO (Flex-1)
          ====================================================================== */}
      <main className="flex-1 h-full flex flex-col p-4 overflow-y-auto no-scrollbar" id="desktop-live-main-content">
        
        {/* Top Header Row (Back to Live Auctions & Breadcrumbs) */}
        <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-500 select-none shrink-0 animate-fade-in" id="live-top-navigation-bar" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          
          {/* Back button */}
          <button
            onClick={() => setActiveView('discovery')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer font-bold tracking-wide"
          >
            <span className="text-sm font-sans">{isAr ? '←' : '←'}</span>
            <span>{isAr ? 'العودة للمزادات المباشرة' : 'Back to Live Auctions'}</span>
          </button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-semibold" id="live-breadcrumbs">
            <span 
              onClick={() => setActiveView('discovery')}
              className="hover:text-gray-600 cursor-pointer transition-colors"
            >
              {isAr ? 'الرئيسية' : 'Home'}
            </span>
            <span className="text-gray-300 font-mono">/</span>
            <span 
              onClick={() => setActiveView('discovery')}
              className="hover:text-gray-600 cursor-pointer transition-colors"
            >
              {isAr ? 'المزادات المباشرة' : 'Live Auctions'}
            </span>
            <span className="text-gray-300 font-mono">/</span>
            <span className="text-[#E85D04] font-bold truncate max-w-[200px]" title={activeAuction.title}>
              {activeAuction.title}
            </span>
          </div>

        </div>

        {/* Video Card Player Wrapper with empty space background - Sticky top */}
        <div 
          className="sticky top-0 z-30 w-full bg-gradient-to-b from-[#ffffff] via-[#fafafa] to-[#ffffff] border border-gray-200/80 rounded-2xl flex items-center justify-center py-0 shadow-sm shrink-0 overflow-hidden" 
          id="professional-video-wrapper-outer"
        >
          {/* Video Card Player Canvas with overlays */}
          <div 
            ref={videoContainerRef}
            className="h-[calc(100vh-220px)] max-h-[calc(100vh-220px)] aspect-[9/16] bg-black rounded-2xl border border-white/10 relative overflow-hidden group shadow-2xl shrink-0 mx-auto"
            id="professional-video-player-canvas"
          >
            {/* Swipeable media gallery — video first, then photos. Arrows +
                thumbnail strip give desktop a mouse-friendly way to browse
                the lot's other images, without duplicating gallery/swipe
                logic (MediaGallery owns it, shared with the mobile reel). */}
            <MediaGallery
              key={activeAuction?.id}
              items={mediaItems}
              isActive
              isPlaying={isPlaying}
              isMuted={isMuted}
              isAr={isAr}
              showArrows
              showThumbnails
              onVideoClick={onPlayPauseToggle}
              videoRef={videoRef}
              className="absolute inset-0"
            />
            {/* Subtle dark gradient so overlaid text stays legible */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50 pointer-events-none z-[5]" />

            {/* 1. TOP LEFT OVERLAYS */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="bg-red-600 text-white text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0" />
                  {isAr ? 'مباشر' : 'LIVE'}
                </span>

                <span className="bg-black/40 backdrop-blur-md text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md border border-white/5">
                  <Eye className="w-3 h-3 text-white/80" />
                  <span>{activeAuction.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}</span>
                </span>
              </div>

              {/* Auction and seller overlay */}
              <div className="bg-black/30 backdrop-blur-md rounded-xl p-2.5 border border-white/10 text-white max-w-[240px] text-left">
                <h3 className="text-xs font-black truncate leading-tight">{activeAuction.title}</h3>
                <p className="text-[10px] text-white/80 font-bold mt-1 flex items-center gap-1">
                  by {activeSellerProfile?.storeName || 'MAZAD JO Store'}
                  <ShieldCheck className="w-3 h-3 text-emerald-400 fill-emerald-500/20 shrink-0" />
                </p>
              </div>
            </div>

            {/* 2. TOP RIGHT CONTROLS */}
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <button
                onClick={onShareClick}
                className="p-2 rounded-lg bg-black/40 backdrop-blur-md text-white border border-white/10 hover:bg-[#E85D04] hover:border-transparent transition-all cursor-pointer shadow-md"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
            {/* Bid controls (price/timer/top-bidder, quick-bid tiers, swipe-to-bid,
                confirm, coach mark) no longer live here — they moved to Card 2 in
                the right side panel so nothing interactive overlays the media. */}

          </div>
        </div>

        {/* Product information row underneath video card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 mt-3 flex items-center justify-between shadow-xs shrink-0 w-[calc((100vh-220px)*9/16)] max-w-full mx-auto" id="desktop-product-info-row" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          
          {/* Product Condition */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div className="text-left rtl:text-right">
              <span className="text-[9px] text-gray-400 font-bold block uppercase leading-none">{isAr ? 'حالة المنتج' : 'Product Condition'}</span>
              <span className="text-[11px] font-black text-gray-800 mt-1 flex items-center gap-1.5 leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {isAr ? 'جديد ممتاز' : 'NEW'}
              </span>
            </div>
          </div>

          {/* Shipping */}
          <div className="flex items-center gap-2.5 border-l rtl:border-r rtl:border-l-0 border-gray-100 pl-4 pr-4">
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center text-[#E85D04]">
              <Truck className="w-4.5 h-4.5" />
            </div>
            <div className="text-left rtl:text-right">
              <span className="text-[9px] text-gray-400 font-bold block uppercase leading-none">{isAr ? 'الشحن' : 'Shipping'}</span>
              <span className="text-[11px] font-black text-gray-800 mt-1 leading-none">
                {isAr ? 'توصيل مجاني' : 'Free Delivery'}
              </span>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-2.5 border-l rtl:border-r rtl:border-l-0 border-gray-100 pl-4 pr-4">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
              <MapPin className="w-4.5 h-4.5" />
            </div>
            <div className="text-left rtl:text-right">
              <span className="text-[9px] text-gray-400 font-bold block uppercase leading-none">{isAr ? 'الموقع' : 'Location'}</span>
              <span className="text-[11px] font-black text-gray-800 mt-1 leading-none">
                {isAr ? 'عمان، الأردن' : 'Amman, Jordan'}
              </span>
            </div>
          </div>

          {/* Auction ID */}
          <div className="flex items-center gap-2.5 border-l rtl:border-r rtl:border-l-0 border-gray-100 pl-4 pr-4">
            <div className="w-9 h-9 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-500">
              <Trophy className="w-4.5 h-4.5" />
            </div>
            <div className="text-left rtl:text-right">
              <span className="text-[9px] text-gray-400 font-bold block uppercase leading-none">{isAr ? 'رقم المزاد' : 'Auction ID'}</span>
              <span className="text-[11px] font-mono font-bold text-gray-800 mt-1 flex items-center gap-1.5 leading-none">
                <span>#{activeAuction.id?.slice(0, 8).toUpperCase() || 'AUC-78291'}</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(activeAuction.id || 'AUC-78291');
                  }}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="Copy"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          </div>

        </div>

      </main>

      {/* ======================================================================
          COLUMN 3: RIGHT PANEL (360px)
          ====================================================================== */}
      <aside 
        className="hidden lg:flex flex-col w-[360px] bg-white border-l border-gray-200 shrink-0 h-full p-4 gap-4 overflow-y-auto no-scrollbar"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="desktop-live-new-aside-panel"
      >
        
        {/* Card 1: Seller Store Summary */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {activeSellerProfile ? (
                <img
                  src={resolveAvatarUrl(activeSellerProfile.storeLogo, activeSellerProfile.userId)}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover border border-gray-100 shrink-0 animate-fade-in"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#E85D04] to-orange-400 flex items-center justify-center font-black text-white text-base font-sans shrink-0">
                  {activeSellerProfile?.storeName?.[0] || 'M'}
                </div>
              )}
              <div className="text-left rtl:text-right min-w-0 flex-1">
                <h4 className="text-xs font-black text-gray-900 leading-none flex items-center gap-1">
                  <span className="truncate">{activeSellerProfile?.storeName || 'MAZAD JO Store'}</span>
                  {isVerified && <ShieldCheck className="w-4 h-4 text-emerald-500 fill-emerald-50 shrink-0" />}
                </h4>
                {isVerified && (
                  <span className="text-[10px] text-emerald-500 font-bold block mt-1 leading-none">
                    Verified Merchant Seller
                  </span>
                )}
              </div>
            </div>
            <button className="px-3.5 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 text-[11px] font-bold text-gray-700 transition-all cursor-pointer">
              {isAr ? 'متابعة' : 'Follow'}
            </button>
          </div>

          {(!!activeSellerProfile?.rating || !!activeSellerProfile?.totalSales || !!trustScore) && (
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              {!!activeSellerProfile?.rating && (
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-black text-gray-800 flex items-center gap-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    {activeSellerProfile.rating.toFixed(1)}
                  </span>
                  <span className="text-[8px] text-gray-400 font-semibold uppercase mt-1">Rating</span>
                </div>
              )}
              {!!activeSellerProfile?.totalSales && (
                <div className="flex flex-col items-center border-x border-gray-100">
                  <span className="text-[11px] font-black text-gray-800">{activeSellerProfile.totalSales}</span>
                  <span className="text-[8px] text-gray-400 font-semibold uppercase mt-1">Sales</span>
                </div>
              )}
              {!!trustScore && (
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-black text-gray-800">{trustScore}%</span>
                  <span className="text-[8px] text-gray-400 font-semibold uppercase mt-1">Trust</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Bid Panel — price/timer/top-bidder, quick-bid tiers,
            swipe-to-bid, price-moved confirm, first-bid coach. This used to
            float on top of the video; it now lives in the side panel so it
            never obscures the item media (founder feedback from Wave 1).
            Bid-flow wiring below (useBidFlow-equivalent local state:
            pendingBid/priceMoved/openConfirm/handleConfirm/handleCancel/
            runBid) is untouched — only JSX position + light-theme styling
            moved from the dark video-overlay version. */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3 shrink-0" style={{ direction: isAr ? 'rtl' : 'ltr' }} id="desktop-bid-panel">
          {isEnded ? (
            <div className="w-full bg-amber-50/60 border border-amber-200 rounded-2xl p-4 text-center flex flex-col items-center justify-center gap-3.5">
              {(() => {
                const hasUserBid = activeAuction?.id && bids ? bids.some(b => b.auctionId === activeAuction.id && b.bidderId === currentUser?.id) : false;
                const isUserWinner = hasUserBid && activeAuction?.currentBidderId === currentUser?.id;

                if (isUserWinner) {
                  return (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center text-2xl animate-bounce">
                        🎉
                      </div>
                      <div className="space-y-1">
                        <span className="text-emerald-600 font-black text-sm block">
                          {isAr ? 'مبروك 🎉 ربحت المزاد' : 'Congratulations! You won the auction'}
                        </span>
                        <span className="text-gray-500 text-[11px] font-semibold block">
                          {isAr ? 'الطلب صار بانتظار الدفع/التأكيد' : 'The order is pending payment/confirmation'}
                        </span>
                        {activeAuction?.marketPrice && activeAuction.marketPrice > activePrice ? (
                          <span className="text-emerald-600/80 text-[11px] font-bold block">
                            {isAr
                              ? `وفّرت ${activeAuction.marketPrice - activePrice} دينار (السعر ${activeAuction.marketPrice})`
                              : `You saved ${activeAuction.marketPrice - activePrice} JOD (worth ${activeAuction.marketPrice})`}
                          </span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => {
                          const matchingOrder = orders?.find(o => o.auctionId === activeAuction?.id && o.buyerId === currentUser?.id);
                          if (matchingOrder) {
                            setGlobalSelectedOrderId(matchingOrder.id);
                          }
                          setActiveView('orders');
                        }}
                        className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        {isAr ? 'عرض الطلب' : 'View Order'}
                      </button>
                    </>
                  );
                } else if (hasUserBid) {
                  return (
                    <>
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
                        🏁
                      </div>
                      <div className="space-y-1">
                        <span className="text-gray-800 font-black text-sm block">
                          {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                        </span>
                        <span className="text-gray-500 text-[11px] block font-bold">
                          {isAr ? 'لم تربح هذه المرة' : 'You did not win this time'}
                        </span>
                        <span className="text-emerald-600 text-[10.5px] font-bold block bg-emerald-50 border border-emerald-200 py-1 px-2.5 rounded-lg mt-1">
                          {isAr ? 'تم تجاوز مزايدتك — زايد الآن لاستعادة الصدارة' : "You've been outbid — bid again to take the lead"}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setActiveView('discovery');
                        }}
                        className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                      >
                        {isAr ? 'تصفح مزادات أخرى' : 'Browse other auctions'}
                      </button>
                    </>
                  );
                } else {
                  return (
                    <>
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                        🏁
                      </div>
                      <div className="space-y-1">
                        <span className="text-gray-800 font-black text-sm block">
                          {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                        </span>
                        {activeAuction?.currentBidderName && (
                          <span className="text-gray-400 text-[10px] block">
                            {isAr ? `الفائز: ${activeAuction.currentBidderName} بقيمة ${activePrice} د.أ` : `Winner: ${activeAuction.currentBidderName} at ${activePrice} JOD`}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setActiveView('discovery');
                        }}
                        className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                      >
                        {isAr ? 'تصفح مزادات أخرى' : 'Browse other auctions'}
                      </button>
                    </>
                  );
                }
              })()}
            </div>
          ) : (
            <>
              {/* Quick Bid Multipliers (hidden until the auction is open) */}
              {isAuctionOpen(activeAuction?.status) && (() => {
                const inc = activeAuction?.minIncrement || 10;
                // Derive the next-bid tiers from the AUTHORITATIVE doc price, never
                // the optimistic activePrice — an in-flight overlay must not inflate
                // the amounts these chips stage (would cause an overpay if the bid fails).
                const base = minNextBid(activeAuction?.currentPrice ?? activePrice, activeAuction?.minIncrement, activeAuction?.totalBids || 0);
                return (
                  <div className="flex gap-2 justify-center w-full" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                    {[base, base + inc, base + 2 * inc].map((amount) => (
                      <Pressable
                        key={amount}
                        onClick={() => setPendingBid(amount)}
                        className="flex-1 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-xs font-bold text-[#E85D04] transition-colors cursor-pointer flex items-center justify-center gap-1 hover:bg-orange-100"
                      >
                        {isAr ? 'زايد' : 'Bid'} {compactJod(amount)} <span className="text-[9px] opacity-75 font-medium">{isAr ? 'د.أ' : 'JD'}</span>
                      </Pressable>
                    ))}
                  </div>
                );
              })()}

              <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-2.5">
                {/* Current Bid */}
                <div className="flex flex-col text-left rtl:text-right">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                    {isAr ? 'العطاء الحالي' : 'Current Bid'}
                  </span>
                  <span className="text-lg font-black text-[#E85D04] font-mono tabular-nums mt-0.5 leading-none">
                    <CountUp value={activePrice} format={(n) => Math.round(n).toLocaleString()} /> <span className="text-[10px] font-normal text-gray-500">JOD</span>
                  </span>
                  <span className="text-[9px] text-emerald-600 font-semibold mt-1 block leading-none">
                    +{(activeAuction.minIncrement || 10)} JOD
                  </span>
                  {activeAuction.reserveMet === false && (
                    <span className="text-xs font-semibold text-amber-600 mt-1 block leading-none">
                      {isAr ? 'لم يصل السعر الاحتياطي بعد' : 'Reserve not yet met'}
                    </span>
                  )}
                  {activeAuction.reserveMet === true && (
                    <span className="text-xs font-semibold text-emerald-600 mt-1 block leading-none">
                      {isAr ? '✓ تم بلوغ السعر الاحتياطي' : '✓ Reserve met'}
                    </span>
                  )}
                </div>

                {/* Time Remaining */}
                <div className="flex flex-col items-center justify-center border-x border-gray-100 px-2">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                    {!isAuctionOpen(activeAuction?.status) && activeAuction?.scheduledStartAt
                      ? (isAr ? 'يبدأ خلال' : 'Starts in')
                      : (isAr ? 'الوقت المتبقي' : 'Time Remaining')}
                  </span>
                  <motion.span
                    animate={isSnipeWindow ? { scale: [1, 1.1, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                    transition={isSnipeWindow ? { duration: 1, ease: 'easeOut', repeat: Infinity } : { duration: 0.2, ease: 'easeOut' }}
                    className={`text-sm font-bold font-mono tracking-wider ${isSnipeWindow ? 'text-red-500' : 'text-emerald-500'}`}
                  >
                    {timeLeftStr}
                  </motion.span>
                  <span className="text-[8px] text-gray-400 tracking-widest uppercase mt-0.5">
                    HRS : MIN : SEC
                  </span>
                </div>

                {/* Top Bidder */}
                <div className="flex flex-col text-right rtl:text-left">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                    {isAr ? 'المزايد الأعلى' : 'Top Bidder'}
                  </span>
                  <span className="text-xs font-bold text-gray-800 truncate mt-1 leading-none">
                    {recentBids?.[0]?.name || activeAuction.currentBidderName || (isAr ? 'لا يوجد عطاء' : 'No bidder')}
                  </span>
                  {typeof trustScore === 'number' && (
                    <span className="text-[9px] text-gray-400 font-medium mt-1 leading-none flex items-center gap-0.5 justify-end">
                      ★ {trustScore}%
                    </span>
                  )}
                </div>
              </div>

              {/* Winning/Losing indicator (hidden until the auction is open) */}
              {(() => {
                if (!isAuctionOpen(activeAuction?.status)) return null;
                const hasUserBid = activeAuction?.id && bids ? bids.some(b => b.auctionId === activeAuction.id && b.bidderId === currentUser?.id) : false;
                const isUserWinning = hasUserBid && activeAuction?.currentBidderId === currentUser?.id;
                if (!hasUserBid) return null;
                return isUserWinning ? (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>{isAr ? 'أنت المزايد الأعلى حالياً! 🎉' : 'You are currently the highest bidder! 🎉'}</span>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      boxShadow: [
                        '0 0 0 0 rgba(244,63,94,0)',
                        '0 0 0 5px rgba(244,63,94,0.18)',
                        '0 0 0 0 rgba(244,63,94,0)',
                        '0 0 0 5px rgba(244,63,94,0.18)',
                        '0 0 0 0 rgba(244,63,94,0)',
                      ],
                    }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    className="bg-rose-50 border border-rose-200 text-rose-600 text-[10px] font-black py-2 px-3 rounded-xl flex flex-col items-center justify-center gap-2 text-center"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                      <span>{isAr ? 'تم تجاوز مزايدتك ⚠️' : "You've been outbid ⚠️"}</span>
                    </span>
                    <Pressable
                      onClick={() => openConfirm(nextBidAmount)}
                      className="w-full py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black shadow-md cursor-pointer"
                    >
                      {isAr ? `زايد ${nextBidAmount.toLocaleString()} د.أ لاستعادة الصدارة` : `Bid ${nextBidAmount.toLocaleString()} JD to retake the lead`}
                    </Pressable>
                  </motion.div>
                );
              })()}

              {/* SWIPE TO BID Button (hidden until the auction is open) */}
              <div className="w-full">
                {!isAuctionOpen(activeAuction?.status) ? (
                  <div className="w-full rounded-xl bg-gray-100 text-gray-700 text-center p-4">
                    <div className="text-sm opacity-80">{isAr ? 'يبدأ المزاد' : 'Auction starts'}</div>
                    <div className="text-lg font-bold">
                      {activeAuction?.scheduledStartAt ? formatAmmanClock(activeAuction.scheduledStartAt) : (isAr ? 'قريباً' : 'Soon')}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* One-time first-bid coach for active members who have never bid.
                        Hidden while a bid confirm is open so it can never overlap or
                        intercept clicks meant for the confirm dialog. */}
                    <FirstBidCoach
                      show={currentUser?.subscriptionStatus === 'active' && pendingBid == null}
                      isAr={isAr}
                    />
                    <SwipeToBid
                      amount={nextBidAmount}
                      onSwipeSuccess={() => runBid(nextBidAmount)}
                      onTap={() => openConfirm(nextBidAmount)}
                      disabled={currentUser?.isBlocked}
                      language={isAr ? 'ar' : 'en'}
                    />
                    <p className="text-[11px] text-gray-400 text-center mt-1">
                      {isAr
                        ? `المجموع عند الفوز: ${totalWithPremium(nextBidAmount).toLocaleString()} د.أ (شامل عمولة المشتري ٥٪)`
                        : `Total if you win: ${totalWithPremium(nextBidAmount).toLocaleString()} JOD (incl. 5% buyer's premium)`}
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {/* Inline bid confirmation (anchored to the panel, auto-dismisses) */}
          <BidConfirm
            amount={pendingBid}
            isAr={isAr}
            priceMoved={priceMoved}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />

          {/* Winning pill: pops over the panel on a successful bid */}
          <WinningPill show={showWinPill} isAr={isAr} />
        </div>

        {/* Card 3: Bid History Card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col min-h-[180px] max-h-[220px] shrink-0" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-50 shrink-0">
            <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
              {isAr ? 'سجل المزايدات' : 'Bid History'}
            </span>
            <button className="text-[10px] font-bold text-gray-400 hover:text-gray-600">
              {isAr ? 'عرض الكل' : 'See all'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
            {(() => {
              // The bids subcollection feed (recentBids) may be empty/not
              // loaded even when the auction doc says bids exist — fall back
              // to a single synthesized row from the auction doc so a live
              // auction with bids never claims "No bids yet".
              const historyBids = (recentBids && recentBids.length > 0)
                ? recentBids
                : ((activeAuction.totalBids || 0) > 0 && activeAuction.currentBidderName
                  ? [{
                      id: 'current-top-bid',
                      name: activeAuction.currentBidderName,
                      amount: activeAuction.currentPrice,
                      time: isAr ? 'أعلى عطاء' : 'Top bid',
                    }]
                  : []);
              return historyBids.length > 0 ? (
                historyBids.map((bid, index) => {
                const isHighest = index === 0;
                return (
                  <div 
                    key={bid.id || index}
                    className={`flex items-center justify-between p-2 rounded-xl transition-all border ${
                      isHighest 
                        ? 'bg-orange-50/50 border-orange-200/60' 
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200/60 flex items-center justify-center font-bold text-[10px] text-gray-500 shrink-0 uppercase">
                        {bid.name?.[0] || 'U'}
                      </div>
                      <div className="min-w-0 text-left rtl:text-right">
                        <span className="text-[11px] font-bold text-gray-800 block truncate leading-none">{bid.name}</span>
                        <span className="text-[9px] text-gray-400 mt-1 block leading-none">{bid.time || 'Just now'}</span>
                      </div>
                    </div>
                    <span className={`text-xs font-black font-mono ${isHighest ? 'text-[#E85D04]' : 'text-gray-700'}`}>
                      {bid.amount.toLocaleString()} <span className="text-[8.5px] font-normal text-gray-400">JOD</span>
                    </span>
                  </div>
                );
              })
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                  {isAr ? 'لا يوجد عطاءات بعد' : 'No bids yet'}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Card 4: Modern Live Chat */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col h-[280px] shrink-0" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-50 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                {isAr ? 'الدردشة الحية' : 'Live Chat'}
              </span>
            </div>
            {activeComments && activeComments.length > 0 && (
              <span className="text-[9px] text-gray-400 font-bold">● {activeComments.length.toLocaleString()}</span>
            )}
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-2 flex flex-col justify-end">
            {activeComments && activeComments.length > 0 ? (
              activeComments.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <img
                    src={resolveAvatarUrl(msg.userAvatar, msg.userId)}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-gray-100"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0 text-left rtl:text-right">
                    <span className="text-[10px] font-bold text-gray-400 block leading-none mb-1">{msg.userName}</span>
                    <div className={`inline-block px-3 py-1.5 text-xs text-gray-800 bg-gray-50 rounded-2xl border border-gray-100 leading-snug max-w-[90%] break-words ${isAr ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                {!isAuthenticated
                  ? (isAr ? 'سجّل دخولك لعرض الدردشة الحية' : 'Sign in to see the live chat')
                  : (isAr ? 'أرسل رسالة للبث المباشر...' : 'Send a message to start chatting...')}
              </div>
            )}
          </div>

          {/* Chat Comment Form — guests get the signup entry instead of a
              composer (firestore.rules gates chat reads+writes to members). */}
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={requestSignIn}
              className="w-full border border-[#E85D04]/30 bg-[#E85D04]/5 hover:bg-[#E85D04]/10 text-[#E85D04] rounded-xl px-2.5 py-2 text-xs font-black transition-colors cursor-pointer shrink-0"
              id="desktop-chat-signin-cta"
            >
              {isAr ? 'سجّل مجاناً للمشاركة في الدردشة' : 'Sign up free to join the chat'}
            </button>
          ) : (
            <form onSubmit={onCommentSubmit} className="flex items-center gap-2 border border-gray-200 rounded-xl px-2.5 py-1.5 bg-gray-50 shrink-0">
              <Smile className="w-4 h-4 text-gray-400 shrink-0 cursor-pointer hover:text-gray-600" />
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={isAr ? 'اكتب تعليقاً...' : 'Type a message...'}
                className="flex-1 text-xs text-gray-800 placeholder-gray-400 outline-none bg-transparent"
              />
              <button type="submit" className="text-[#E85D04] hover:text-orange-600 shrink-0 transition-colors cursor-pointer">
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

      </aside>

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
