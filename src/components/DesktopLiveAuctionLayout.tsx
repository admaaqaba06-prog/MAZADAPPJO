import React from 'react';
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
  Play
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
}) => {
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
      <main className="flex-grow lg:flex-1 min-w-0 h-full flex flex-col overflow-y-auto p-6" id="desktop-live-main-content">
        
        {/* THE IMMERSIVE TIKTOK-STYLE PLAYER CONTAINER */}
        <div 
          ref={videoContainerRef}
          className="w-full h-[620px] bg-black rounded-2xl border border-white/10 relative overflow-hidden shrink-0 group shadow-2xl" 
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

            <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-lg border border-white/10 uppercase font-mono">
              {activeAuction.category || (isAr ? 'أجهزة وإلكترونيات' : 'Electronics')}
            </span>

            <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-lg border border-white/10">
              <Eye className="w-3.5 h-3.5 text-zinc-400" />
              <span>{viewerCount.toLocaleString()} {isAr ? 'مشاهدة' : 'Watching'}</span>
            </span>
          </div>

          {/* 2. TOP RIGHT: TRANSFUSED INTERACTION BUTTONS */}
          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <button 
              onClick={onMuteToggle}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-[#FF6B00] hover:border-transparent hover:scale-105 transition-all cursor-pointer shadow-lg"
              title={isAr ? 'كتم/تشغيل الصوت' : 'Mute/Unmute'}
            >
              {isMuted ? <VolumeX className="w-4.5 h-4.5 text-red-400" /> : <Volume2 className="w-4.5 h-4.5 text-emerald-400" />}
            </button>
            <button 
              onClick={onShareClick}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-[#FF6B00] hover:border-transparent hover:scale-105 transition-all cursor-pointer shadow-lg"
              title={isAr ? 'مشاركة رابط البث' : 'Share stream'}
            >
              <Share2 className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={onSaveToggle}
              className={`p-2.5 rounded-xl bg-black/60 backdrop-blur-md border hover:scale-105 transition-all cursor-pointer shadow-lg ${
                isSaved ? 'border-[#FF6B00] text-[#FF6B00] bg-[#FF6B00]/10' : 'border-white/10 text-white hover:bg-[#FF6B00]'
              }`}
              title={isAr ? 'حفظ المزاد' : 'Save lot'}
            >
              <Bookmark className={`w-4.5 h-4.5 ${isSaved ? 'fill-[#FF6B00]' : ''}`} />
            </button>
            <button 
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-[#FF6B00] hover:border-transparent hover:scale-105 transition-all cursor-pointer shadow-lg"
              title={isAr ? 'ملء الشاشة' : 'Fullscreen'}
            >
              <Maximize2 className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* 3. RIGHT SIDE: FLOATING VERTICAL ACTIVITY FEED */}
          <div className="absolute right-4 top-20 bottom-36 w-64 z-20 pointer-events-none flex flex-col justify-end gap-1.5 overflow-hidden">
            {activeActivities.map((act) => (
              <div 
                key={act.id} 
                className="self-end max-w-full bg-black/50 backdrop-blur-md border border-white/10 px-3.5 py-2 rounded-xl text-white flex items-center gap-2 shadow-lg animate-fade-in-up"
              >
                <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  act.type === 'join' ? 'bg-zinc-800' :
                  act.type === 'like' ? 'bg-red-500/20 text-red-400' :
                  act.type === 'save' ? 'bg-orange-500/20 text-orange-400' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {act.type === 'join' ? '👤' :
                   act.type === 'like' ? '❤️' :
                   act.type === 'save' ? '🔖' : '⭐'}
                </div>
                <span className="text-[10.5px] font-bold truncate">
                  <span className="font-extrabold text-[#FF8A00] mr-1">{act.name}</span>
                  {isAr ? act.textAr : act.textEn}
                </span>
              </div>
            ))}
          </div>

          {/* 4. LIVE CHAT FEED (Fading comments, bottom left) */}
          <div className="absolute left-4 bottom-[240px] w-[320px] h-[180px] z-20 pointer-events-none flex flex-col justify-end overflow-hidden">
            <div className="space-y-1.5 p-2 overflow-y-auto no-scrollbar max-h-full flex flex-col justify-end">
              {activeComments.map((msg) => (
                <div 
                  key={msg.id} 
                  className="bg-black/45 backdrop-blur-sm border border-white/5 rounded-xl p-2.5 flex items-start gap-2 max-w-[95%] animate-fade-in pointer-events-auto"
                >
                  <img 
                    src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                    alt="User" 
                    className="w-5.5 h-5.5 rounded-full object-cover border border-white/10 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <span className="text-[9.5px] font-black text-orange-400 truncate block">
                      {msg.userName}
                    </span>
                    <p className="text-[11px] text-zinc-100 font-medium leading-normal mt-0.5">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4.5 CHAT INPUT BOX (Floating directly below live chat) */}
          <form 
            onSubmit={onCommentSubmit} 
            className="absolute left-4 bottom-[188px] w-[320px] z-20 pointer-events-auto flex gap-1.5 bg-black/45 backdrop-blur-md border border-white/10 p-1.5 rounded-xl shadow-lg"
          >
            <input 
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={isAr ? 'اكتب تعليقاً عاماً...' : 'Send live message...'}
              className="flex-grow h-8 px-2.5 bg-white/5 border border-white/5 rounded-lg text-zinc-200 text-[10.5px] placeholder-zinc-500 outline-none focus:border-[#FF6B00]/40 transition-colors"
            />
            <button 
              type="submit"
              className="h-8 w-8 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* 5. BOTTOM LEFT GLASS PANEL: ACTIVE LISTING DETAILS */}
          <div 
            className="absolute bottom-4 left-4 z-20 w-[320px] bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl" 
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
          >
            <div className="flex items-center gap-1.5 text-[9.5px] font-black text-[#FF6B00] tracking-wider uppercase mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAr ? 'المعروض المباشر' : 'ACTIVE LOT'}</span>
            </div>
            <h3 className="text-xs font-black text-white truncate leading-tight">
              {activeAuction.title}
            </h3>
            
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
              <div>
                <span className="text-[8.5px] text-zinc-400 block uppercase font-extrabold tracking-wider leading-none">{isAr ? 'العطاء الحالي' : 'CURRENT BID'}</span>
                <span className="text-lg font-black text-[#FF6B00] font-mono leading-none block mt-1.5">
                  {activePrice.toLocaleString()} <span className="text-[9.5px] font-normal text-white/50">{isAr ? 'د.أ' : 'JOD'}</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[8.5px] text-zinc-400 block uppercase font-extrabold tracking-wider leading-none">{isAr ? 'متبقي' : 'TIME LEFT'}</span>
                <span className="text-xs font-black text-emerald-400 font-mono leading-none block mt-1.5 tracking-wider">
                  {timeLeftStr}
                </span>
              </div>
            </div>

            <div className="mt-2.5 border-t border-white/10 pt-2 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[9.5px] text-zinc-300 font-bold truncate">
                {isAr ? 'بائع موثق: مزاد الأردن' : 'Verified Seller: MAZAD JO'}
              </span>
            </div>
          </div>

          {/* 6. BOTTOM CENTER: SWIPE TO BID & FLOATING MULTIPLIERS */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[360px] flex flex-col items-center gap-2 bg-black/65 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl">
            {/* Multipliers row */}
            <div className="flex items-center gap-1.5 w-full justify-center">
              {[25, 50, 100, 250].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onBidExecute(activePrice + val)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-white/10 hover:border-[#FF6B00]/60 text-white font-black text-[10.5px] transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-0.5 shadow-md"
                >
                  +{val} <span className="text-[8px] opacity-60 font-medium">{isAr ? 'د.أ' : 'JD'}</span>
                </button>
              ))}
            </div>

            {/* Swipe handle container */}
            <div className="w-full">
              <SwipeToBid
                amount={nextBidAmount}
                onSwipeSuccess={() => onBidExecute(nextBidAmount)}
                disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}
                language={isAr ? 'ar' : 'en'}
              />
            </div>
          </div>

          {/* Pause overlay option */}
          {!isPlaying && (
            <div 
              onClick={onPlayPauseToggle}
              className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer z-10"
            >
              <div className="w-16 h-16 rounded-full bg-[#FF6B00] text-white flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform">
                <Play className="w-8 h-8 ml-1 fill-white" />
              </div>
            </div>
          )}

        </div>

        {/* ======================================================================
            BOTTOM SECTION (Below Video): BENTO GRID DETAILS
            ====================================================================== */}
        <div className="mt-8 grid grid-cols-1 xl:grid-cols-3 gap-6 shrink-0 font-sans" id="below-video-details-grid">
          
          {/* Left/Center: Specifications & Description & Related (Takes 2 columns) */}
          <div className="xl:col-span-2 flex flex-col gap-6">
            
            {/* Box 1: Lot Information */}
            <div className="bg-[#0f0f13] border border-white/5 p-6 rounded-2xl shadow-lg">
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

            {/* Box 2: Related Auctions Slider */}
            <div className="bg-[#0f0f13] border border-white/5 p-6 rounded-2xl shadow-lg">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3.5 mb-4">
                <Trophy className="w-4.5 h-4.5 text-orange-400 animate-pulse" />
                <h3 className="text-[13px] font-black tracking-wider text-zinc-200 uppercase">
                  {isAr ? 'مزادات أخرى قد تهمك' : 'RELATED LIVE & UPCOMING AUCTIONS'}
                </h3>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                {liveAuctions.filter(a => a.id !== activeAuction.id).slice(0, 6).map((item) => {
                  const itemPrice = item.currentPrice;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectAuction(item.id)}
                      className="flex-shrink-0 w-44 bg-[#141419] hover:bg-[#1a1a23] border border-white/5 hover:border-[#FF6B00]/40 p-3 rounded-xl text-left cursor-pointer transition-all duration-300 group flex flex-col"
                      style={{ direction: isAr ? 'rtl' : 'ltr' }}
                    >
                      <div className="w-full h-24 rounded-lg overflow-hidden border border-white/10 relative shrink-0 bg-zinc-900">
                        <img 
                          src={item.thumbnailUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          referrerPolicy="no-referrer" 
                        />
                        <span className="absolute top-1.5 left-1.5 bg-red-600/90 text-white text-[7px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase">
                          {item.status === 'live' ? 'LIVE' : 'UPCOMING'}
                        </span>
                      </div>
                      <h4 className="text-[11.5px] font-bold text-zinc-200 mt-2 truncate text-left rtl:text-right w-full group-hover:text-white">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-[#FF6B00] font-black mt-1 font-mono text-left rtl:text-right w-full">
                        {itemPrice.toLocaleString()} JD
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right side: Seller Info & Protection Badging */}
          <div className="flex flex-col gap-6 font-sans">
            
            {/* Card A: Verified Seller Trust Badge */}
            <div className="bg-[#0f0f13] border border-white/5 p-6 rounded-2xl shadow-lg flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <Award className="w-4.5 h-4.5 text-orange-400" />
                <h3 className="text-[12px] font-black tracking-wider text-zinc-300 uppercase">
                  {isAr ? 'عن البائع المعتمد' : 'VERIFIED MERCHANT SELLER'}
                </h3>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#FF6B00] to-orange-400 flex items-center justify-center font-black text-white text-xl font-mono shrink-0 shadow-lg">
                  M
                </div>
                <div className="text-left rtl:text-right">
                  <span className="text-[13.5px] font-black text-white block leading-none">
                    {isAr ? 'شركة مزاد الأردن الرسمية' : 'MAZAD JO Merchant'}
                  </span>
                  <span className="text-[10.5px] text-zinc-400 mt-1.5 block leading-normal">
                    {isAr ? 'حاصل على رخصة مزادات حكومية رقم MJ-894' : 'Government Licensed Escrow ID: MJ-894'}
                  </span>
                </div>
              </div>

              <p className="text-zinc-400 text-[11.5px] leading-relaxed text-left rtl:text-right font-sans font-medium">
                {isAr 
                  ? 'بائع موثق وحاصل على أعلى تقييم أداء لمطابقة المنتجات بنسبة 99.8% بموجب قوانين حماية المستهلك الأردنية.' 
                  : 'Highly verified merchant seller with a 99.8% item condition matching score under Jordan trade policies.'}
              </p>
            </div>

            {/* Card B: Escrow CliQ Guarantee Info */}
            <div className="bg-[#0f0f13] border border-white/5 p-6 rounded-2xl shadow-lg flex flex-col gap-3.5">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span className="text-[12.5px] font-black tracking-wider uppercase">
                  {isAr ? 'نظام الضمان كليك (Escrow)' : 'CliQ Escrow Assurance'}
                </span>
              </div>
              <p className="text-[11.5px] text-zinc-400 leading-relaxed font-medium text-left rtl:text-right font-sans">
                {isAr 
                  ? 'رصيدك مؤمن بالكامل. بمجرد الفوز بالمزاد، يتم حجز القيمة في حساب ضمان رسمي لدى البنك المركزي. لا يتم الإفراج عن المبلغ للبائع إلا بعد تأكيد استلامك للمنتج ومطابقته للمواصفات.' 
                  : 'Your funds are 100% secure. Upon winning, funds are locked in official central bank escrow and only released to the seller after physical delivery and verification.'}
              </p>
              <div className="flex items-center gap-2 mt-1.5 bg-black/30 p-2.5 rounded-lg border border-white/5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">
                  {isAr ? 'حماية مشتري فعالة على مدار الساعة' : 'Active buyer protection 24/7'}
                </span>
              </div>
            </div>

          </div>

        </div>

      </main>

    </div>
  );
};
