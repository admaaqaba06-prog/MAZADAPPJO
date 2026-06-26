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
  Award,
  Maximize2,
  ShieldCheck,
  Trophy,
  Play,
  Heart
} from 'lucide-react';
import { SwipeToBid } from './SwipeToBid';

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
  const { sellerProfiles, setActiveView } = useApp();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const activeSellerProfile = sellerProfiles?.find(
    p => p.userId === activeAuction?.sellerId || p.id === activeAuction?.sellerId
  );

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const trustScore = activeSellerProfile?.trustScore || 85;

  return (
    <div className="w-full h-full flex flex-row overflow-hidden bg-[#070709] relative select-none" id="mazad-jo-desktop-live-platform">
      
      {/* Toast Overlay */}
      {showToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-[#FF6B00] text-white px-5 py-2.5 rounded-xl text-xs font-black tracking-wide shadow-[0_8px_32px_rgba(255,107,0,0.45)] animate-fade-in text-center border border-orange-400/20">
          {showToast}
        </div>
      )}

      {/* ======================================================================
          COLUMN 1: AUCTIONS LIST (320px)
          ====================================================================== */}
      <aside 
        className="hidden lg:flex flex-col w-[320px] bg-[#0c0c0f] border-r border-white/5 shrink-0 overflow-y-auto no-scrollbar" 
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="desktop-live-auctions-sidebar"
      >
        <div className="p-4 border-b border-white/5 bg-black/20 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs font-black tracking-widest text-zinc-300 uppercase font-mono">
              {isAr ? 'البث المباشر النشط' : 'LIVE AUCTIONS'}
            </span>
          </div>
          <span className="bg-[#FF6B00]/10 text-[#FF6B00] text-[10px] font-black px-2 py-0.5 rounded border border-[#FF6B00]/20 font-mono font-sans">
            {liveAuctions.length}
          </span>
        </div>

        <div className="flex-1 p-3 space-y-2 overflow-y-auto no-scrollbar">
          {liveAuctions.map((item) => {
            const isActive = item.id === activeAuction.id;
            const itemPrice = item.currentPrice;
            return (
              <button
                key={item.id}
                onClick={() => onSelectAuction(item.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all border text-left cursor-pointer group select-none relative overflow-hidden ${
                  isActive 
                    ? 'bg-zinc-900/90 border-[#FF6B00]/40 text-white font-black shadow-[0_4px_12px_rgba(255,107,0,0.15)]' 
                    : 'bg-[#121216]/40 border-transparent hover:bg-zinc-900/30 text-zinc-400 hover:text-zinc-200'
                }`}
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                {/* Image */}
                <div className="w-12 h-16 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-white/15 relative">
                  <img 
                    src={item.thumbnailUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    referrerPolicy="no-referrer" 
                  />
                  {isActive ? (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B00] animate-ping" />
                    </div>
                  ) : (
                    <div className="absolute top-1 left-1 bg-red-600/90 text-white text-[7px] font-black px-1 py-0.2 rounded uppercase tracking-wider">
                      LIVE
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div className="min-w-0 flex-grow text-left rtl:text-right">
                  <h4 className="text-[12px] font-bold text-zinc-100 truncate group-hover:text-white transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-[#FF6B00] font-black mt-1 leading-none font-mono">
                    {itemPrice.toLocaleString()} JD
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="inline-block text-[8px] font-black uppercase bg-white/5 border border-white/10 text-zinc-400 px-1.5 py-0.5 rounded-md leading-none">
                      {item.category || (isAr ? 'مزاد' : 'Auction')}
                    </span>
                    <span className="text-[8px] text-zinc-500 font-mono">
                      {isAr ? 'نشط' : 'Active'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ======================================================================
          COLUMN 2: IMMERSIVE VIDEO (Flex Largest Area)
          ====================================================================== */}
      <main className="flex-grow lg:flex-1 min-w-[800px] h-full flex flex-col overflow-y-auto p-6" id="desktop-live-main-content">
        
        {/* Navigation improvements bar (Back button & Breadcrumbs) */}
        <div className="flex items-center justify-between mb-4 text-xs font-medium select-none text-zinc-400 shrink-0 animate-fade-in" id="live-top-navigation-bar" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
          
          {/* Back button */}
          <button 
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                setActiveView('discovery');
              }
            }}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors cursor-pointer font-bold tracking-wide"
          >
            <span className="text-sm font-sans">{isAr ? '←' : '←'}</span>
            <span>{isAr ? 'العودة للمزادات المباشرة' : 'Back to Live Auctions'}</span>
          </button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-semibold" id="live-breadcrumbs">
            <span 
              onClick={() => setActiveView('discovery')}
              className="hover:text-zinc-200 cursor-pointer transition-colors"
            >
              {isAr ? 'الرئيسية' : 'Home'}
            </span>
            <span className="text-zinc-600 font-mono">/</span>
            <span 
              onClick={() => setActiveView('discovery')}
              className="hover:text-zinc-200 cursor-pointer transition-colors"
            >
              {isAr ? 'المزادات المباشرة' : 'Live Auctions'}
            </span>
            <span className="text-zinc-600 font-mono">/</span>
            <span className="text-[#E85D04] font-bold truncate max-w-[200px]" title={activeAuction.title}>
              {activeAuction.title}
            </span>
          </div>

        </div>

        {/* THE IMMERSIVE CLEAN PLAYER CONTAINER */}
        <div 
          ref={videoContainerRef}
          className="w-full h-[620px] bg-black rounded-2xl border border-white/10 relative overflow-hidden group shadow-2xl shrink-0" 
          id="professional-video-player-canvas"
        >
          {/* Real HTML5 Live Video Element */}
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

          {/* 1. TOP LEFT: LIVE STATUS OVERLAYS */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <span className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-lg border border-red-500/20">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0" />
              {isAr ? 'مباشر' : 'LIVE'}
            </span>

            <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-lg border border-white/10">
              <Eye className="w-3.5 h-3.5 text-zinc-400" />
              <span>{viewerCount.toLocaleString()} {isAr ? 'مشاهدة' : 'Watching'}</span>
            </span>
          </div>

          {/* 2. TOP RIGHT: TRANSFUSED PLAY/MUTE CONTROLS */}
          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <button 
              onClick={onPlayPauseToggle}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-[#FF6B00] hover:border-transparent hover:scale-105 transition-all cursor-pointer shadow-lg"
              title={isPlaying ? (isAr ? 'إيقاف مؤقت' : 'Pause') : (isAr ? 'تشغيل' : 'Play')}
            >
              <Play className={`w-4.5 h-4.5 ${isPlaying ? 'fill-white text-white' : 'text-zinc-300'}`} />
            </button>
            <button 
              onClick={onMuteToggle}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-[#FF6B00] hover:border-transparent hover:scale-105 transition-all cursor-pointer shadow-lg"
              title={isAr ? 'كتم/تشغيل الصوت' : 'Mute/Unmute'}
            >
              {isMuted ? <VolumeX className="w-4.5 h-4.5 text-red-400" /> : <Volume2 className="w-4.5 h-4.5 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* GRID BELOW VIDEO: 3 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6" id="below-video-details-grid">
          
          {/* Column 1: Live Chat */}
          <div className="bg-[#0c0c0f] border border-white/5 p-4 rounded-2xl flex flex-col h-[320px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-xs font-black text-zinc-300 uppercase tracking-widest font-mono">
                  {isAr ? 'الدردشة الحية' : 'LIVE CHAT'}
                </span>
              </div>
              <span className="bg-red-500/10 text-red-500 text-[9px] font-black px-2 py-0.5 rounded border border-red-500/20 font-mono tracking-wider">
                {isAr ? 'مباشر' : 'LIVE'}
              </span>
            </div>

            {/* Scrollable messages area */}
            <div className="flex-grow overflow-y-auto no-scrollbar space-y-2 pr-1 flex flex-col justify-end">
              {activeComments.map((msg) => (
                <div 
                  key={msg.id} 
                  className="bg-white/5 border border-white/5 rounded-xl p-2 flex items-start gap-2 shadow-sm shrink-0"
                >
                  <img 
                    src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                    alt="User" 
                    className="w-5 h-5 rounded-full object-cover border border-white/10 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-grow text-left rtl:text-right">
                    <span className="text-[9px] font-black text-orange-400 truncate block leading-none">
                      {msg.userName}
                    </span>
                    <p className="text-[10.5px] text-zinc-200 font-medium leading-normal mt-1">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* COMMENT INPUT FORM */}
            <form 
              onSubmit={onCommentSubmit} 
              className="mt-2 flex gap-1.5 bg-[#121216]/50 border border-white/5 p-1 rounded-xl shrink-0"
            >
              <input 
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={isAr ? 'اكتب تعليقاً...' : 'Send live message...'}
                className="flex-grow h-8 px-2.5 bg-white/5 border border-white/5 rounded-lg text-zinc-100 text-[10.5px] placeholder-zinc-500 outline-none focus:border-[#FF6B00]/40 transition-colors"
              />
              <button 
                type="submit"
                className="h-8 w-8 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-md"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>

          {/* Column 2: Recent Bids */}
          <div className="bg-[#0c0c0f] border border-white/5 p-4 rounded-2xl flex flex-col h-[320px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 shrink-0">
              <span className="text-xs font-black text-zinc-300 uppercase tracking-widest font-mono">
                {isAr ? 'المزايدات الأخيرة' : 'RECENT BIDS'}
              </span>
              <span className="bg-[#FF6B00]/10 text-[#FF6B00] text-[9px] font-black px-2 py-0.5 rounded border border-[#FF6B00]/20 font-mono tracking-wider">
                {isAr ? 'خلاصة المزايدات' : 'BID FEED'}
              </span>
            </div>

            <div className="flex-grow overflow-y-auto no-scrollbar space-y-2 pr-1">
              {recentBids && recentBids.length > 0 ? (
                recentBids.map((bid) => (
                  <div 
                    key={bid.id} 
                    className="bg-white/5 border border-white/5 rounded-xl p-2.5 flex items-center justify-between shadow-sm"
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] font-black text-zinc-200 block truncate leading-none">
                        {bid.name}
                      </span>
                      <span className="text-[8px] text-zinc-500 mt-1 block">
                        {bid.time}
                      </span>
                    </div>
                    <span className="text-[11.5px] font-black text-emerald-400 font-mono">
                      {bid.amount.toLocaleString()} <span className="text-[8.5px] font-normal text-zinc-400">{isAr ? 'د.أ' : 'JD'}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-[10.5px]">
                  {isAr ? 'لا يوجد مزايدات بعد' : 'No bids yet'}
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Activity Feed */}
          <div className="bg-[#0c0c0f] border border-white/5 p-4 rounded-2xl flex flex-col h-[320px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 shrink-0">
              <span className="text-xs font-black text-zinc-300 uppercase tracking-widest font-mono">
                {isAr ? 'خلاصة الأنشطة الحية' : 'ACTIVITY FEED'}
              </span>
              <span className="bg-sky-500/10 text-sky-400 text-[9px] font-black px-2 py-0.5 rounded border border-sky-500/20 font-mono tracking-wider">
                {isAr ? 'خلاصة تقنية' : 'TELEMETRY'}
              </span>
            </div>

            <div className="flex-grow overflow-y-auto no-scrollbar space-y-2 pr-1">
              {allActivities && allActivities.length > 0 ? (
                allActivities.map((act) => {
                  let badgeColor = "bg-sky-500/10 text-sky-400 border-sky-500/20";
                  if (act.type === 'like') {
                    badgeColor = "bg-red-500/10 text-red-400 border-red-500/20";
                  } else if (act.type === 'join') {
                    badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  } else if (act.type === 'follow') {
                    badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                  }

                  return (
                    <div 
                      key={act.id} 
                      className="bg-white/5 border border-white/5 rounded-xl p-2 flex items-center justify-between shadow-sm gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-zinc-200 block truncate leading-none">
                          {act.name}
                        </span>
                        <span className="text-[9px] text-zinc-400 mt-1 block">
                          {isAr ? act.textAr : act.textEn}
                        </span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={`text-[7.5px] font-black uppercase px-1.5 py-0.5 rounded border ${badgeColor}`}>
                          {act.type}
                        </span>
                        <span className="text-[7.5px] text-zinc-500 mt-1">
                          {act.time}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-[10.5px]">
                  {isAr ? 'لا يوجد تفاعل بعد' : 'No activities yet'}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* DESCRIPTION & RELATED AUCTIONS BELOW THE 3 COLUMNS */}
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4" id="description-and-related-row">
          {/* Description (Spans 2 cols) */}
          <div className="xl:col-span-2 bg-[#0c0c0f] border border-white/5 p-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3.5 mb-4">
              <Sparkles className="w-4.5 h-4.5 text-amber-400" />
              <h3 className="text-[13px] font-black tracking-wider text-zinc-200 uppercase">
                {isAr ? 'تفاصيل ومواصفات المعروض' : 'LOT SPECIFICATIONS & DESCRIPTION'}
              </h3>
            </div>
            <p className="text-zinc-300 text-[13px] leading-relaxed font-sans font-medium whitespace-pre-wrap text-left rtl:text-right">
              {activeAuction.description}
            </p>

            {/* Specs parameters grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col">
                <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider text-left rtl:text-right">{isAr ? 'حالة المنتج' : 'LOT CONDITION'}</span>
                <span className="text-[11.5px] font-black text-emerald-400 mt-1 leading-none text-left rtl:text-right">{isAr ? 'ممتاز (غير مستخدم)' : 'Pristine (New)'}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col">
                <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider text-left rtl:text-right">{isAr ? 'أمان الضمان المالي' : 'ESCROW ASSURED'}</span>
                <span className="text-[11.5px] font-black text-[#FF6B00] mt-1 leading-none text-left rtl:text-right">{isAr ? 'مشمول بالكامل' : '100% Secured'}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col">
                <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider text-left rtl:text-right">{isAr ? 'الضمان والنوع' : 'WARRANTY'}</span>
                <span className="text-[11.5px] font-black text-zinc-300 mt-1 leading-none text-left rtl:text-right">{isAr ? 'ضمان رسمي 12 شهر' : '12 Month Covered'}</span>
              </div>
            </div>
          </div>

          {/* Related Auctions (Spans 1 col) */}
          <div className="bg-[#0c0c0f] border border-white/5 p-5 rounded-2xl shadow-lg flex flex-col h-full min-h-[220px]">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2.5 mb-4 shrink-0">
              <Trophy className="w-4 h-4 text-orange-400" />
              <h3 className="text-xs font-black tracking-wider text-zinc-200 uppercase">
                {isAr ? 'مزادات أخرى قد تهمك' : 'RELATED LIVE & UPCOMING'}
              </h3>
            </div>
            
            <div className="flex-grow overflow-y-auto no-scrollbar pr-1 space-y-2.5 max-h-[180px]">
              {liveAuctions.filter(a => a.id !== activeAuction.id).slice(0, 6).map((item) => {
                const itemPrice = item.currentPrice;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectAuction(item.id)}
                    className="w-full bg-[#141419] hover:bg-[#1a1a23] border border-white/5 hover:border-[#FF6B00]/40 p-2.5 rounded-xl text-left cursor-pointer transition-all duration-300 group flex items-center gap-3"
                    style={{ direction: isAr ? 'rtl' : 'ltr' }}
                  >
                    <div className="w-16 h-12 rounded-lg overflow-hidden border border-white/10 relative shrink-0 bg-zinc-900">
                      <img 
                        src={item.thumbnailUrl} 
                        alt={item.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        referrerPolicy="no-referrer" 
                      />
                      <span className="absolute top-1 left-1 bg-red-600/90 text-[6.5px] text-white font-black px-1 py-0.2 rounded uppercase tracking-wider">
                        {item.status === 'live' ? 'LIVE' : 'UPCOMING'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-grow text-left rtl:text-right">
                      <h4 className="text-[11.5px] font-bold text-zinc-200 truncate group-hover:text-white">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-[#FF6B00] font-black mt-1 font-mono">
                        {itemPrice.toLocaleString()} JD
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </main>

      {/* ======================================================================
          COLUMN 3: PREMIUM INTERACTION SIDEBAR (420px)
          ====================================================================== */}
      <aside 
        className="hidden lg:flex flex-col w-[420px] bg-[#0c0c0f] border-l border-white/5 shrink-0 overflow-y-auto p-4 gap-4"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="desktop-live-new-aside-panel"
      >
        
        {/* Card 1: Current Bid & Time Left */}
        <div className="bg-[#141419] rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#FF6B00] tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAr ? 'المعروض الحالي' : 'ACTIVE LOT'}</span>
            </div>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-mono font-black tracking-wider">
              {timeLeftStr}
            </span>
          </div>

          <h3 className="text-xs font-black text-white truncate leading-tight">
            {activeAuction.title}
          </h3>

          <div className="grid grid-cols-2 gap-2 bg-white/5 p-2.5 rounded-xl border border-white/5">
            <div>
              <span className="text-[9px] text-zinc-400 block uppercase font-extrabold tracking-wider leading-none">{isAr ? 'العطاء الحالي' : 'CURRENT BID'}</span>
              <span className="text-2xl font-black text-[#FF6B00] font-mono leading-none block mt-1.5">
                {activePrice.toLocaleString()} <span className="text-[11px] font-normal text-white/50">{isAr ? 'د.أ' : 'JOD'}</span>
              </span>
            </div>
            <div className="text-right border-l rtl:border-r rtl:border-l-0 border-white/5 pl-2.5 pr-2.5 flex flex-col justify-center">
              <span className="text-[9px] text-zinc-400 block uppercase font-extrabold tracking-wider leading-none">{isAr ? 'متبقي من الوقت' : 'TIME REMAINING'}</span>
              <span className="text-xs font-bold text-emerald-400 mt-1.5 font-mono">
                {timeLeftStr}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Quick Bid Multipliers & Swipe to Bid */}
        <div className="bg-[#141419] rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
          <span className="text-[9px] text-zinc-400 block uppercase font-extrabold tracking-wider leading-none">
            {isAr ? 'مضاعفات العطاء السريع' : 'QUICK BID MULTIPLIERS'}
          </span>
          <div className="flex items-center gap-2 w-full justify-center">
            {[25, 50, 100, 250].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onBidExecute(activePrice + val)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:border-[#FF6B00]/40 text-white font-black text-[11px] transition-all cursor-pointer hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-0.5"
              >
                +{val} <span className="text-[8px] opacity-60 font-medium">{isAr ? 'د.أ' : 'JD'}</span>
              </button>
            ))}
          </div>

          <div className="w-full mt-1">
            <SwipeToBid
              amount={nextBidAmount}
              onSwipeSuccess={() => onBidExecute(nextBidAmount)}
              disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
              language={isAr ? 'ar' : 'en'}
            />
          </div>
        </div>

        {/* Card 3: Horizontal Actions Row */}
        <div className="bg-[#141419] rounded-2xl p-4 border border-white/5 flex items-center justify-around gap-3">
          {/* Like Appreciation */}
          <button 
            onClick={onLikeToggle}
            className="flex-1 py-2 rounded-xl bg-zinc-900 border border-white/5 text-white flex items-center justify-center gap-2 hover:bg-red-500/10 hover:border-red-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span className="text-[11px] font-black">{isAr ? 'أعجبني' : 'Like'}</span>
          </button>

          {/* Save Lot */}
          <button 
            onClick={onSaveToggle}
            className={`flex-1 py-2 rounded-xl bg-zinc-900 border text-white flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
              isSaved ? 'border-[#FF6B00] text-[#FF6B00] bg-[#FF6B00]/5' : 'border-white/5 hover:bg-zinc-800'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[#FF6B00]' : ''}`} />
            <span className="text-[11px] font-black">{isAr ? 'حفظ' : 'Save'}</span>
          </button>

          {/* Share Link */}
          <button 
            onClick={onShareClick}
            className="flex-1 py-2 rounded-xl bg-zinc-900 border border-white/5 text-white flex items-center justify-center gap-2 hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-sky-400" />
            <span className="text-[11px] font-black">{isAr ? 'مشاركة' : 'Share'}</span>
          </button>
        </div>

        {/* Card 4: Verified Seller & Escrow Protection */}
        <div 
          onClick={() => {
            if (activeSellerProfile) {
              setSelectedProfileId(activeSellerProfile.userId);
            }
          }}
          className="bg-[#141419] rounded-2xl p-4 border border-white/5 flex flex-col gap-4 hover:border-orange-500/20 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            {activeSellerProfile?.storeLogo ? (
              <img 
                src={activeSellerProfile.storeLogo} 
                alt="Logo" 
                className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-md border border-white/10" 
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6B00] to-orange-400 flex items-center justify-center font-black text-white text-lg font-mono shrink-0 shadow-md">
                {activeSellerProfile?.storeName?.[0] || 'M'}
              </div>
            )}
            <div className="text-left rtl:text-right min-w-0 flex-grow">
              <span className="text-[12.5px] font-black text-white block leading-none truncate">
                {activeSellerProfile?.storeName || (isAr ? 'شركة مزاد الأردن الرسمية' : 'MAZAD JO Merchant')}
              </span>
              <span className="text-[9.5px] text-orange-400 font-extrabold mt-1.5 block leading-none flex items-center gap-1 flex-wrap">
                {isVerified ? (
                  <>
                    <ShieldCheck className={`w-3.5 h-3.5 ${isPremium ? 'text-amber-400' : 'text-emerald-400'}`} />
                    <span>{isPremium ? (isAr ? 'بائع متميز موثق' : 'PREMIUM VERIFIED SELLER') : (isAr ? 'بائع معتمد موثق' : 'VERIFIED MERCHANT SELLER')}</span>
                  </>
                ) : (
                  <span>✓ {isAr ? 'بائع معتمد مرخص' : 'VERIFIED MERCHANT SELLER'}</span>
                )}
              </span>
            </div>
            {activeSellerProfile && (
              <div className="bg-orange-600/10 px-2 py-1 rounded-lg text-orange-400 text-[10px] font-black flex flex-col items-center shrink-0">
                <span className="text-[7.5px] text-zinc-500 uppercase">TRUST</span>
                <span>{trustScore}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 bg-[#121216]/50 p-2.5 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-4.5 h-4.5 shrink-0" />
              <span className="text-[10px] font-black tracking-wider uppercase">
                {isAr ? 'نظام الضمان كليك (Escrow)' : 'CliQ Escrow Assurance'}
              </span>
            </div>
            <p className="text-[10.5px] text-zinc-400 leading-relaxed font-sans font-medium text-left rtl:text-right">
              {isAr 
                ? 'رصيدك مؤمن بالكامل في حساب ضمان رسمي لدى البنك المركزي. لا يتم الإفراج عن المبلغ للبائع إلا بعد تأكيد استلامك للمنتج.' 
                : 'Funds are secured in central bank escrow and only released to the seller after delivery and confirmation.'}
            </p>
          </div>
        </div>

        {/* Card 5: Specifications & Description */}
        <div className="bg-[#141419] rounded-2xl p-4 border border-white/5 flex flex-col gap-3.5">
          <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-[11px] font-black tracking-wider text-zinc-300 uppercase">
              {isAr ? 'تفاصيل ومواصفات المعروض' : 'LOT SPECIFICATIONS'}
            </h3>
          </div>

          <p className="text-zinc-300 text-[11.5px] leading-relaxed font-sans font-medium whitespace-pre-wrap text-left rtl:text-right">
            {activeAuction.description}
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-2">
            <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col">
              <span className="text-[7.5px] text-zinc-500 font-black uppercase tracking-wider text-left rtl:text-right">{isAr ? 'حالة المنتج' : 'LOT CONDITION'}</span>
              <span className="text-[10px] font-black text-emerald-400 mt-1 leading-none text-left rtl:text-right">{isAr ? 'ممتاز (غير مستخدم)' : 'Pristine (New)'}</span>
            </div>
            <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col">
              <span className="text-[7.5px] text-zinc-500 font-black uppercase tracking-wider text-left rtl:text-right">{isAr ? 'الضمان والنوع' : 'WARRANTY'}</span>
              <span className="text-[10px] font-black text-zinc-300 mt-1 leading-none text-left rtl:text-right">{isAr ? 'ضمان رسمي 12 شهر' : '12 Month Covered'}</span>
            </div>
          </div>
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
