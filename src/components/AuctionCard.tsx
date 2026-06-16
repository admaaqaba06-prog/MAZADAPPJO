import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Volume2, 
  VolumeX, 
  Gavel, 
  Clock 
} from 'lucide-react';
import { useAuth } from './auth/useAuth';
import { placeAuctionBid, FirebaseAuction } from '../services/auctionService';

interface AuctionCardProps {
  key?: string | number;
  auction: FirebaseAuction;
  showToast?: (msg: string, type: 'success' | 'warning' | 'info') => void;
}

export default function AuctionCard({ auction, showToast }: AuctionCardProps) {
  const { user } = useAuth();
  
  // Keep ALL original state variables intact as requested
  const [videoMuted, setVideoMuted] = useState(true);
  const [biddingAmount, setBiddingAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [showBidDrawer, setShowBidDrawer] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const lang = localStorage.getItem('mjo_lang') || 'ar';

  // IntersectionObserver to lazy-load video src when intersecting (BUG #4)
  const [videoSrc, setVideoSrc] = useState<string>('');
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVideoSrc(auction.videoUrl || '');
          } else {
            setVideoSrc('');
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(videoElement);
    return () => {
      observer.unobserve(videoElement);
    };
  }, [auction.videoUrl]);

  // Handle play/pause when videoSrc changes
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    if (videoSrc) {
      videoElement.load();
      videoElement.play().catch(() => {});
    } else {
      videoElement.pause();
    }
  }, [videoSrc]);

  const triggerToast = (msg: string, type: 'success' | 'warning' | 'info') => {
    if (showToast) {
      showToast(msg, type);
    } else {
      alert(msg);
    }
  };

  // 1. Dynamic Countdown System (Original logic fully preserved)
  useEffect(() => {
    const calculateTime = () => {
      if (!auction.endsAt) return;
      
      let endsAtMs = 0;
      if (typeof auction.endsAt.toMillis === 'function') {
        endsAtMs = auction.endsAt.toMillis();
      } else if ((auction.endsAt as any).seconds) {
        endsAtMs = (auction.endsAt as any).seconds * 1000;
      } else {
        endsAtMs = new Date(auction.endsAt as any).getTime();
      }

      const diff = endsAtMs - Date.now();
      if (diff <= 0) {
          setTimeRemaining(lang === 'ar' ? 'منتهي' : 'Ended');
          setIsExpired(true);
          return;
      }

      const totalSecs = Math.floor(diff / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      const pad = (n: number) => String(n).padStart(2, '0');
      
      if (hours > 0) {
        setTimeRemaining(`${pad(hours)}:${pad(mins)}:${pad(secs)}`);
      } else {
        setTimeRemaining(`${pad(mins)}:${pad(secs)}`);
      }
      setIsExpired(false);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [auction.endsAt, lang]);

  // Video loop stability checks
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = videoMuted;
    }
  }, [videoMuted]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoMuted(!videoMuted);
  };

  // Original bidding logic perfectly retained
  const handlePlaceBid = async (amount: number) => {
    if (!user) {
      triggerToast(
        lang === 'ar' ? '⚠️ يرجى تسجيل الدخول أولاً للمزايدة!' : '⚠️ Please login first to bid!',
        'warning'
      );
      return;
    }

    if (user.membershipStatus !== 'Active') {
      triggerToast(
        lang === 'ar' 
          ? '❌ غير مسموح بالمزايدة: حسابك غير نشط في الباقة المميزة' 
          : '❌ Bidding denied: Your premium profile status is currently inactive',
        'warning'
      );
      return;
    }

    if (amount <= auction.currentPrice) {
      triggerToast(
        lang === 'ar' 
          ? `⚠️ يجب أن تزيد مزايدتك عن المزايدة الحالية (${auction.currentPrice} JOD)`
          : `⚠️ Your bid must exceed the leading high bid of (${auction.currentPrice} JOD)`,
        'warning'
      );
      return;
    }

    const userWasLeader = (auction.winnerId === user.id);
    const previousHeldAmount = userWasLeader ? auction.currentPrice : 0;
    const netRequired = amount - previousHeldAmount;

    const userAvailable = user.availableBalance ?? user.walletBalance ?? 0;
    const totalAffordablePower = userAvailable + previousHeldAmount;

    if (totalAffordablePower < amount) {
      triggerToast(
        lang === 'ar'
          ? `⚠️ رصيدك غير كافٍ، يرجى شحن المحفظة! (المتاح: ${userAvailable} JOD)`
          : `⚠️ Insufficient balance! Please recharge your wallet. (Available: ${userAvailable} JOD)`,
        'warning'
      );
      return;
    }

    setIsBidding(true);
    try {
      await placeAuctionBid(auction.id, amount, user.id, user.fullName);
      triggerToast(
        lang === 'ar' ? `🎉 تم تسجيل مزايدتك بقيمة ${amount} JOD بنجاح!` : `🎉 Bid of ${amount} JOD submitted successfully!`,
        'success'
      );
      setBiddingAmount('');
      setShowBidDrawer(false);
    } catch (err: any) {
      console.error('[BID_ERROR]', err);
      triggerToast(
        lang === 'ar' ? `❌ فشل المزايدة: ${err.message}` : `❌ Bidding failed: ${err.message}`,
        'warning'
      );
    } finally {
      setIsBidding(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(biddingAmount);
    if (isNaN(parsed) || parsed <= auction.currentPrice) {
      triggerToast(
        lang === 'ar' ? '⚠️ يرجى إدخال مبلغ مزايدة أكبر من السعر الحالي' : '⚠️ Please input a bid higher than current price',
        'warning'
      );
      return;
    }
    handlePlaceBid(parsed);
  };

  // Constants
  const incrementChoices = [5, 10, 25, 50];
  const sellerDisplayName = auction.sellerName || 'Zain Boutique';

  return (
    <div 
      className="w-full h-[100dvh] overflow-hidden flex flex-col relative bg-black text-white select-none font-sans" 
      id={`auction-card-${auction.id}`}
    >
      
      {/* ================= TOP 65% VIEWPORT (VIDEO CONTENT AREA) ================= */}
      <div className="h-[65%] w-full relative overflow-hidden bg-black flex items-center justify-center">
        {auction.videoUrl ? (
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            muted={videoMuted}
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <img 
            src={auction.thumbnailUrl || "https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=800&q=80"} 
            alt={auction.title} 
            className="w-full h-full object-cover"
          />
        )}

        {/* TOP LEFT OVERLAY: Seller Info + LIVE badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none z-20">
          <div className="flex items-center gap-1.5 bg-red-600/90 border border-red-500/30 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow-md animate-pulse">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            <span>{lang === 'ar' ? 'مباشر' : 'Live'}</span>
          </div>
          <span className="text-sm font-black text-white tracking-wide truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {sellerDisplayName}
          </span>
        </div>

        {/* TOP RIGHT OVERLAY: Mute button only (Download button removed completely) */}
        <div className="absolute top-4 right-4 pointer-events-auto z-20">
          <button
            onClick={toggleMute}
            className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/15 hover:bg-black/70 flex items-center justify-center text-white transition-all cursor-pointer shadow-md min-h-[44px] min-w-[44px] active:scale-95"
            title={videoMuted ? 'Unmute' : 'Mute'}
          >
            {videoMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-[#FF6B00]" />}
          </button>
        </div>

        {/* BOTTOM VIDEO OVERLAY: Countdown Timer (Original logic fully preserved) */}
        <div className="absolute bottom-4 inset-x-4 bg-black/50 backdrop-blur-md border border-white/10 p-2.5 rounded-xl flex items-center justify-between pointer-events-none shadow-md z-20">
          <div className="flex items-center gap-1.5 text-[#FF6B00] font-mono text-[10px] font-black uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
            <span>{lang === 'ar' ? 'الوقت المتبقي' : 'Time Remaining'}</span>
          </div>
          <span className="text-sm font-black text-white font-mono tracking-tight underline decoration-[#FF6B00] decoration-2">
            {timeRemaining}
          </span>
        </div>
      </div>

      {/* ================= BOTTOM 35% VIEWPORT (WHITE BID PANEL - ALWAYS VISIBLE) ================= */}
      <div 
        className="h-[35%] w-full bg-white text-black flex flex-col justify-between p-4 border-t border-gray-100 shrink-0 z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        id="bid-persistent-panel"
      >
        {/* ROW 1: Auction Title (One line, bold, black) */}
        <div className="w-full">
          <h3 className="text-sm font-bold text-zinc-900 leading-tight truncate">
            {auction.title}
          </h3>
        </div>

        {/* ROW 2: Current Bid (Large text, #FF6B00, "JOD" small) */}
        <div className="flex items-center gap-1.5 my-1">
          <span className="text-3xl font-black text-[#FF6B00] font-mono tracking-tight leading-none">
            {auction.currentPrice.toLocaleString()}
          </span>
          <span className="text-xs text-zinc-500 font-extrabold tracking-wider uppercase">
            {auction.currency || 'JOD'}
          </span>
        </div>

        {/* ROW 3: 4 Quick bid buttons in one row */}
        <div className="grid grid-cols-4 gap-2">
          {incrementChoices.map((inc) => {
            const targetVal = auction.currentPrice + inc;
            return (
              <button
                key={inc}
                type="button"
                onClick={() => handlePlaceBid(targetVal)}
                disabled={isBidding || isExpired}
                className="h-11 bg-zinc-50 border border-zinc-200/80 hover:bg-[#FF6B00]/5 hover:border-[#FF6B00] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-40 min-h-[44px]"
              >
                <span className="text-xs text-[#FF6B00] font-black">+{inc} JOD</span>
                <span className="text-[9px] font-mono text-zinc-400 mt-0.5">{targetVal}</span>
              </button>
            );
          })}
        </div>

        {/* ROW 4: Full-width solid orange call-to-action bid button (currentPrice + 10) */}
        <div className="w-full">
          <button
            onClick={() => handlePlaceBid(auction.currentPrice + 10)}
            disabled={isBidding || isExpired}
            className="w-full h-11 text-white font-extrabold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-2 hover:brightness-105 active:scale-98 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
            style={{
              background: isExpired 
                ? '#e5e7eb' 
                : 'linear-gradient(135deg, #FF6B00 0%, #e05e00 100%)'
            }}
          >
            <Gavel className={`w-4 h-4 shrink-0 ${isExpired ? 'text-zinc-400' : 'text-white'}`} />
            <span className={isExpired ? 'text-zinc-400' : 'text-white font-black'}>
              {isExpired 
                ? (lang === 'ar' ? 'انتهى المزاد' : 'AUCTION COMPLETED') 
                : (lang === 'ar' ? `تقديم عرض: ${auction.currentPrice + 10} د.أ` : `PLACE BID: ${auction.currentPrice + 10} JOD`)}
            </span>
          </button>
        </div>

      </div>

    </div>
  );
}
