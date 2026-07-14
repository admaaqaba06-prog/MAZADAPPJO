import React, { useState } from 'react';
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
  Star,
  Maximize2
} from 'lucide-react';
import { SwipeToBid } from './SwipeToBid';
import { isAuctionOpen } from '../utils/auctionPhase';
import { formatAmmanClock } from '../utils/ammanTime';

interface DesktopLiveAuctionLayoutProps {
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
  isAr: boolean;
  onOpenDetails: (id: string) => void;
  liveAuctions: any[];
  onSelectAuction: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  showToast: string | null;
  toggleFullscreen: () => void;
  recentBids?: any[];
  allActivities?: any[];
}

export const DesktopLiveAuctionLayout: React.FC<DesktopLiveAuctionLayoutProps> = ({
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
  isAr,
  onOpenDetails,
  liveAuctions,
  onSelectAuction,
  videoRef,
  videoContainerRef,
  showToast,
  toggleFullscreen,
  recentBids = [],
  allActivities = [],
}) => {
  const { sellerProfiles, setActiveView, bids, orders, setGlobalWalletSubView, setGlobalSelectedOrderId } = useApp();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const activeSellerProfile = sellerProfiles?.find(
    p => p.userId === activeAuction?.sellerId || p.id === activeAuction?.sellerId
  );

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const trustScore = activeSellerProfile?.trustScore || 98;
  const isEnded = activeAuction?.status === 'completed' || (activeAuction?.endTime ? activeAuction.endTime <= Date.now() : false);

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
            const itemViewerCount = item.viewerCount || 2349;
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
                      {(itemViewerCount >= 1000 ? `${(itemViewerCount / 1000).toFixed(1)}K` : itemViewerCount)}
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
              {activeSellerProfile.storeLogo ? (
                <img
                  src={activeSellerProfile.storeLogo}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#E85D04] text-white flex items-center justify-center font-black text-xs shrink-0">
                  {activeSellerProfile.storeName?.[0] || 'M'}
                </div>
              )}
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
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                setActiveView('discovery');
              }
            }}
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
            className="h-[calc(100vh-64px)] aspect-[9/16] bg-black rounded-2xl border border-white/10 relative overflow-hidden group shadow-2xl shrink-0 mx-auto" 
            id="professional-video-player-canvas"
          >
            {/* Live Video Tag */}
            <video 
              ref={videoRef}
              src={activeAuction.videoUrl} 
              loop 
              muted={isMuted} 
              playsInline 
              autoPlay
              className="w-full h-full object-cover bg-[#010101] cursor-pointer"
              onClick={onPlayPauseToggle}
            />

            {/* 1. TOP LEFT OVERLAYS */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="bg-red-600 text-white text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0" />
                  {isAr ? 'مباشر' : 'LIVE'}
                </span>

                <span className="bg-black/40 backdrop-blur-md text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md border border-white/5">
                  <Eye className="w-3 h-3 text-white/80" />
                  <span>{viewerCount.toLocaleString()} Watching</span>
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
              <button 
                onClick={toggleFullscreen}
                className="p-2 rounded-lg bg-black/40 backdrop-blur-md text-white border border-white/10 hover:bg-[#E85D04] hover:border-transparent transition-all cursor-pointer shadow-md"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* 3. BOTTOM GLASSMORPHISM BID PANEL */}
            <div className="absolute bottom-4 left-4 right-4 bg-black/40 backdrop-blur-md rounded-2xl p-3 border border-white/10 shadow-xl flex flex-col gap-2.5 z-25">
              
              {isEnded ? (
                <div className="w-full bg-black/75 border border-amber-500/30 rounded-2xl p-4 text-center backdrop-blur-md flex flex-col items-center justify-center gap-3.5 shadow-xl animate-in fade-in duration-300">
                  {(() => {
                    const hasUserBid = activeAuction?.id && bids ? bids.some(b => b.auctionId === activeAuction.id && b.bidderId === currentUser?.id) : false;
                    const isUserWinner = hasUserBid && activeAuction?.currentBidderId === currentUser?.id;
                    
                    if (isUserWinner) {
                      return (
                        <>
                          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-2xl animate-bounce">
                            🎉
                          </div>
                          <div className="space-y-1">
                            <span className="text-emerald-400 font-black text-sm block">
                              {isAr ? 'مبروك 🎉 ربحت المزاد' : 'Congratulations! You won the auction'}
                            </span>
                            <span className="text-zinc-300 text-[11px] font-semibold block">
                              {isAr ? 'الطلب صار بانتظار الدفع/التأكيد' : 'The order is pending payment/confirmation'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const matchingOrder = orders?.find(o => o.auctionId === activeAuction?.id && o.buyerId === currentUser?.id);
                              if (matchingOrder) {
                                setGlobalSelectedOrderId(matchingOrder.id);
                              }
                              setGlobalWalletSubView('orders');
                              setActiveView('wallet');
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
                          <div className="w-12 h-12 rounded-full bg-zinc-500/20 flex items-center justify-center text-2xl">
                            🏁
                          </div>
                          <div className="space-y-1">
                            <span className="text-white font-black text-sm block">
                              {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                            </span>
                            <span className="text-zinc-300 text-[11px] block font-bold">
                              {isAr ? 'لم تربح هذه المرة' : 'You did not win this time'}
                            </span>
                            <span className="text-emerald-400 text-[10.5px] font-bold block bg-emerald-500/10 border border-emerald-500/20 py-1 px-2.5 rounded-lg mt-1">
                              {isAr ? 'تم إرجاع المبلغ المحجوز إلى محفظتك' : 'The reserved amount has been returned to your wallet'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setActiveView('discovery');
                            }}
                            className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                          >
                            {isAr ? 'تصفح مزادات أخرى' : 'Browse other auctions'}
                          </button>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <div className="w-12 h-12 rounded-full bg-zinc-500/20 flex items-center justify-center text-xl">
                            🏁
                          </div>
                          <div className="space-y-1">
                            <span className="text-white font-black text-sm block">
                              {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                            </span>
                            {activeAuction?.currentBidderName && (
                              <span className="text-zinc-400 text-[10px] block">
                                {isAr ? `الفائز: ${activeAuction.currentBidderName} بقيمة ${activePrice} د.أ` : `Winner: ${activeAuction.currentBidderName} at ${activePrice} JOD`}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setActiveView('discovery');
                            }}
                            className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
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
                  {isAuctionOpen(activeAuction?.status) && (
                    <div className="flex gap-2 justify-center w-full" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                      {[10, 25, 50].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => onBidExecute(activePrice + val)}
                          className="flex-1 py-1.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 text-xs font-bold text-white transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-0.5 shadow-lg shadow-black/10 hover:bg-white/25"
                        >
                          +{val} <span className="text-[9px] opacity-75 font-medium">{isAr ? 'د.أ' : 'JD'}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 border-b border-white/10 pb-2.5 text-white">
                    {/* Current Bid */}
                    <div className="flex flex-col text-left rtl:text-right">
                      <span className="text-[9px] text-white/60 font-bold uppercase tracking-wider">
                        {isAr ? 'العطاء الحالي' : 'Current Bid'}
                      </span>
                      <span className="text-lg font-black text-[#E85D04] font-mono mt-0.5 leading-none">
                        {activePrice.toLocaleString()} <span className="text-[10px] font-normal text-white/70">JOD</span>
                      </span>
                      <span className="text-[9px] text-emerald-400 font-semibold mt-1 block leading-none">
                        +{(activeAuction.bidIncrement || 25)} JOD
                      </span>
                    </div>

                    {/* Time Remaining */}
                    <div className="flex flex-col items-center justify-center border-x border-white/10 px-2">
                      <span className="text-[9px] text-white/60 font-bold uppercase tracking-wider mb-0.5">
                        {!isAuctionOpen(activeAuction?.status) && activeAuction?.scheduledStartAt
                          ? (isAr ? 'يبدأ خلال' : 'Starts in')
                          : (isAr ? 'الوقت المتبقي' : 'Time Remaining')}
                      </span>
                      <span className="text-sm font-bold font-mono tracking-wider text-emerald-400">
                        {timeLeftStr}
                      </span>
                      <span className="text-[8px] text-white/40 tracking-widest uppercase mt-0.5">
                        HRS : MIN : SEC
                      </span>
                    </div>

                    {/* Top Bidder */}
                    <div className="flex flex-col text-right rtl:text-left">
                      <span className="text-[9px] text-white/60 font-bold uppercase tracking-wider">
                        {isAr ? 'المزايد الأعلى' : 'Top Bidder'}
                      </span>
                      <span className="text-xs font-bold text-white truncate mt-1 leading-none">
                        {recentBids?.[0]?.name || (isAr ? 'لا يوجد عطاء' : 'No bidder')}
                      </span>
                      <span className="text-[9px] text-zinc-400 font-medium mt-1 leading-none flex items-center gap-0.5 justify-end">
                        ★ {trustScore}% <span className="opacity-60">(124)</span>
                      </span>
                    </div>
                  </div>

                  {/* Winning/Losing indicator (hidden until the auction is open) */}
                  {(() => {
                    if (!isAuctionOpen(activeAuction?.status)) return null;
                    const hasUserBid = activeAuction?.id && bids ? bids.some(b => b.auctionId === activeAuction.id && b.bidderId === currentUser?.id) : false;
                    const isUserWinning = hasUserBid && activeAuction?.currentBidderId === currentUser?.id;
                    if (!hasUserBid) return null;
                    return isUserWinning ? (
                      <div className="bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-[10px] font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>{isAr ? 'أنت المزايد الأعلى حالياً! 🎉' : 'You are currently the highest bidder! 🎉'}</span>
                      </div>
                    ) : (
                      <div className="bg-rose-500/15 border border-rose-500/35 text-rose-400 text-[10px] font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 mb-2 text-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                        <span>{isAr ? 'عطاؤك متأخر! شخص آخر زايد أعلى منك ⚠️' : 'Outbid! Place a higher bid now ⚠️'}</span>
                      </div>
                    );
                  })()}

                  {/* SWIPE TO BID Button (hidden until the auction is open) */}
                  <div className="w-full">
                    {!isAuctionOpen(activeAuction?.status) ? (
                      <div className="w-full rounded-xl bg-neutral-800 text-white text-center p-4">
                        <div className="text-sm opacity-80">{isAr ? 'يبدأ المزاد' : 'Auction starts'}</div>
                        <div className="text-lg font-bold">
                          {activeAuction?.scheduledStartAt ? formatAmmanClock(activeAuction.scheduledStartAt) : (isAr ? 'قريباً' : 'Soon')}
                        </div>
                      </div>
                    ) : (
                      <SwipeToBid
                        amount={nextBidAmount}
                        onSwipeSuccess={() => onBidExecute(nextBidAmount)}
                        disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
                        language={isAr ? 'ar' : 'en'}
                      />
                    )}
                  </div>
                </>
              )}

            </div>

          </div>
        </div>

        {/* Product information row underneath video card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-3.5 mt-3 flex items-center justify-between shadow-xs shrink-0 w-[calc((100vh-64px)*9/16)] max-w-full mx-auto" id="desktop-product-info-row" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          
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
              {activeSellerProfile?.storeLogo ? (
                <img 
                  src={activeSellerProfile.storeLogo} 
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
                  <ShieldCheck className="w-4 h-4 text-emerald-500 fill-emerald-50 shrink-0" />
                </h4>
                <span className="text-[10px] text-emerald-500 font-bold block mt-1 leading-none">
                  Verified Merchant Seller
                </span>
              </div>
            </div>
            <button className="px-3.5 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 text-[11px] font-bold text-gray-700 transition-all cursor-pointer">
              {isAr ? 'متابعة' : 'Follow'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-black text-gray-800 flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                4.9 <span className="text-[9px] text-gray-400 font-normal">(124)</span>
              </span>
              <span className="text-[8px] text-gray-400 font-semibold uppercase mt-1">Rating</span>
            </div>
            <div className="flex flex-col items-center border-x border-gray-100">
              <span className="text-[11px] font-black text-gray-800">512</span>
              <span className="text-[8px] text-gray-400 font-semibold uppercase mt-1">Sales</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-black text-gray-800">98%</span>
              <span className="text-[8px] text-gray-400 font-semibold uppercase mt-1">Protection</span>
            </div>
          </div>
        </div>

        {/* Card 2: Current Bid & Time Left Card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm grid grid-cols-2 gap-4 shrink-0" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          <div className="text-left rtl:text-right">
            <span className="text-[9px] text-gray-400 font-extrabold block uppercase tracking-wider leading-none">
              {isAr ? 'العطاء الحالي' : 'CURRENT BID'}
            </span>
            <span className="text-xl font-black text-[#E85D04] font-mono mt-2 block leading-none">
              {activePrice.toLocaleString()} <span className="text-[11px] font-normal text-gray-500">JOD</span>
            </span>
          </div>
          <div className="text-right rtl:text-left border-l rtl:border-r rtl:border-l-0 border-gray-100 pl-4 pr-4">
            <span className="text-[9px] text-gray-400 font-extrabold block uppercase tracking-wider leading-none">
              {isAr ? 'الوقت المتبقي' : 'TIME REMAINING'}
            </span>
            <span className="text-lg font-black text-emerald-500 font-mono mt-2 block leading-none">
              {timeLeftStr}
            </span>
          </div>
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
            {recentBids && recentBids.length > 0 ? (
              recentBids.map((bid, index) => {
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
            )}
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
            <span className="text-[9px] text-gray-400 font-bold">● 2.1K</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-2 flex flex-col justify-end">
            {activeComments && activeComments.length > 0 ? (
              activeComments.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <img 
                    src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
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
                {isAr ? 'أرسل رسالة للبث المباشر...' : 'Send a message to start chatting...'}
              </div>
            )}
          </div>

          {/* Chat Comment Form */}
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
