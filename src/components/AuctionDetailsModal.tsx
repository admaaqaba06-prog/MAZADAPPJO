import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { ContextualHint } from './ContextualHint';
import { 
  X, 
  ShieldCheck, 
  MapPin, 
  Clock, 
  ThumbsUp, 
  Eye, 
  Coins, 
  ChevronRight, 
  Gavel, 
  Tv,
  CheckCircle,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { placeAuctionBid } from '../services/auctionService';

interface AuctionDetailsModalProps {
  auctionId: string | null;
  onClose: () => void;
}

export const AuctionDetailsModal: React.FC<AuctionDetailsModalProps> = ({ auctionId, onClose }) => {
  const { auctions, currentUser, placeBid, wallet, activeView, setActiveView, language, setActiveAuctionId } = useApp();
  const isAr = language === 'ar';
  const t = translations[language];

  const auction = auctions.find(a => a.id === auctionId);
  const [biddingAmount, setBiddingAmount] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'err'; msg: string } | null>(null);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('00:00:00');

  // Multi-step custom details derived from lot id helper
  const isRolex = auction?.id?.includes('rolex');
  const isPorsche = auction?.id?.includes('porsche');

  const customCondition = isAr ? 'جديد (غير مستخدم) - ممتاز' : 'Brand New (Unused) - Pristine Box Set';
  const customColor = isRolex 
    ? (isAr ? 'ذهبي عيار ١٨' : '18ct Oyster Oystersteel & Gold') 
    : isPorsche 
    ? (isAr ? 'رمادي مميز غير لامع' : 'Paint to Sample PTS Crayon Gray') 
    : (isAr ? 'تيتانيوم طبيعي' : 'Natural Space Titanium');

  useEffect(() => {
    if (!auction) return;
    const interval = setInterval(() => {
      const remainingSecs = Math.max(0, Math.floor((auction.endTime - Date.now()) / 1000));
      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        setTimeLeftStr(isAr ? 'منتهي' : 'Ended');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [auction, isAr]);

  if (!auction) return null;

  const handlePlaceBidAmt = async (amt: number) => {
    setFeedback(null);
    const result = await placeBid(auction.id, amt);
    if (result.success) {
       setFeedback({ type: 'success', msg: isAr ? `🚀 تم تقديم مزايدتكم بقيمة ${amt.toLocaleString()} د.أ بنجاح!` : `🚀 Bid of ${amt.toLocaleString()} JOD logged successfully!` });
    } else {
      setFeedback({ type: 'err', msg: result.message });
    }
  };

  const currentBidCTA = auction.currentPrice + (auction.totalBids > 0 ? auction.minIncrement : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-zinc-950/65 backdrop-blur-xs">
      <div 
        onClick={onClose} 
        className="absolute inset-0 cursor-pointer"
      />
      
      <div 
        className="relative bg-white text-gray-800 w-full max-w-md h-[100dvh] md:h-auto md:max-h-[85vh] md:rounded-[24px] overflow-hidden flex flex-col shadow-2xl z-10 animate-in slide-in-from-bottom duration-300"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
      >
        
        {/* Modal Top Header with Lot title & category */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/70 shrink-0">
          <div>
            <span className="text-[9px] bg-[#FF6B00]/10 text-[#FF6B00] px-2 py-0.5 rounded-full font-black uppercase font-mono">
              {isAr ? 'تفاصيل المزاد والضمان' : `LOT DETAILS • ${auction.category.toUpperCase()}`}
            </span>
            <h3 className="text-xs font-black text-gray-900 mt-1 uppercase tracking-tight">
              {isAr ? 'مواصفات المعروض القانونية' : 'OFFICIAL SECURED CHARACTERISTICS'}
            </h3>
          </div>
          
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scroll Body content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Main visuals */}
          <div className="aspect-[16/10] bg-[#1a1a1a] rounded-xl overflow-hidden relative shadow-inner">
            <img 
              src={auction.thumbnailUrl} 
              alt={auction.title} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            
            {/* Countdown floating badge */}
            <div className={`absolute bottom-3 ${isAr ? 'right-3' : 'left-3'} bg-black/55 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2`}>
              <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span className="text-xs font-black text-white font-mono tracking-tight">{timeLeftStr}</span>
            </div>
          </div>

          <div>
            <h1 className="text-base font-black text-gray-900 leading-tight">
              {auction.title}
            </h1>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed bg-zinc-50 border border-zinc-100 p-3 rounded-xl">
              {auction.description}
            </p>
          </div>

          {/* Condition indicators grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-left" style={{ textAlign: isAr ? 'right' : 'left' }}>
              <span className="text-[9px] text-gray-400 font-bold uppercase block">{isAr ? 'حالة السلعة' : 'CONDITION'}</span>
              <span className="text-xs font-black text-gray-800 font-mono mt-0.5 block">{customCondition}</span>
            </div>
            
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-left" style={{ textAlign: isAr ? 'right' : 'left' }}>
              <span className="text-[9px] text-gray-400 font-bold uppercase block">{isAr ? 'اللون / اللون الخاص' : 'CHASSIS / COLOR'}</span>
              <span className="text-xs font-black text-gray-800 font-mono mt-0.5 block truncate">{customColor}</span>
            </div>
          </div>

          {/* Secure Trust Alert banner */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 flex gap-2.5 items-start">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[10px] leading-relaxed text-gray-600">
              <span className="text-emerald-800 font-black uppercase text-[10px] block mb-0.5">
                {isAr ? 'درع الأمان والضمان' : 'CLIQ DEPOSIT PROTECTION PASS'}
              </span>
              {isAr 
                ? 'مضمون ١٠٠٪. رصيدك مجمد في حساب كليك حتى استلام وفحص المبيع يدا بيد وبموافقتك الشخصية.' 
                : 'Double insulated. Escrow funds stay suspended until delivery compliance is personally confirmed by you.'}
            </div>
          </div>

          {/* Bid values pricing table */}
          <div className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-bold">{isAr ? 'السعر التجاري الحالي' : 'CURRENT HIGH BID'}</span>
              <span className="text-sm font-black text-[#FF6B00] font-mono">{auction.currentPrice.toLocaleString()} JOD</span>
            </div>
            <div className="flex justify-between items-center text-xs border-t border-zinc-200/50 pt-2">
              <span className="text-gray-500">{isAr ? 'صاحب العرض القيادي' : 'LEADING BIDDER'}</span>
              <span className="text-[11px] font-bold text-gray-800">{auction.currentBidderName || (isAr ? 'لا مزايدات حتى الآن' : 'No offers yet')}</span>
            </div>
            <div className="flex justify-between items-center text-[10.5px] border-t border-zinc-200/50 pt-2 text-zinc-500">
              <span>{isAr ? 'الحد الأدنى للزيادة' : 'MIN INCREMENTAL'}</span>
              <span className="font-mono">{auction.minIncrement} JOD</span>
            </div>
          </div>

          <ContextualHint
            hintKey="current_price"
            titleAr="مفهوم السعر الحالي 🔨"
            titleEn="Understanding Current Price 🔨"
            descAr="هذا هو السعر الحالي للسلعة في المزاد. لتقديم مزايدة قيادية جديدة، يجب أن تزيد عن هذا الرقم بقيمة الحد الأدنى للزيادة على الأقل."
            descEn="This is the current price of the item. To place a new leading bid, your offer must exceed this price by at least the minimum increment."
          />

          {/* Feedback alerts */}
          {feedback && (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl text-xs font-bold leading-normal text-left ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                {feedback.msg}
              </div>
              {feedback.type === 'success' && (
                <ContextualHint
                  hintKey="first_bid"
                  titleAr="ماذا يحدث بعد المزايدة؟ 🔒"
                  titleEn="What Happens After Bidding? 🔒"
                  descAr="رائع! تم حجز قيمة العطاء مؤقتاً في كليك لحماية البائع والمشتري. إذا خسرت، يعود رصيدك فوراً ومحفظتك آمنة. وإذا فزت، يُستخدم للدفع."
                  descEn="Awesome! Your bid amount is temporarily reserved in CliQ escrow to protect both parties. If you lose, it returns instantly and your wallet is secure. If you win, it goes towards payment."
                />
              )}
            </div>
          )}

          {/* Interactive instant bidding triggers */}
          {auction.status === 'live' && (
            <div className="space-y-2">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                {isAr ? 'تقديم مزايدة فورية بلمسة واحدة' : 'ONE-TOUCH INSTANT ESCROW BID'}
              </span>
              
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map(inc => (
                  <button
                    key={inc}
                    onClick={() => handlePlaceBidAmt(auction.currentPrice + inc)}
                    className="py-2.5 bg-white hover:bg-[#FF6B00] hover:text-white border border-gray-200 text-gray-800 font-black rounded-lg text-xs font-mono transition-all text-center flex flex-col items-center justify-center cursor-pointer active:scale-95"
                  >
                    <span className="text-[10.5px]">+{inc} JD</span>
                    <span className="text-[8.5px] opacity-60 font-medium">{(auction.currentPrice + inc).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal sticky bottom action - join live rooms */}
        <div className="p-4 border-t border-gray-100 bg-white flex gap-3 shrink-0">
          <button
            onClick={() => {
              setActiveAuctionId(auction.id);
              setActiveView('live');
              onClose();
            }}
            className="flex-1 bg-[#FF6B00] hover:bg-orange-600 text-white font-black py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md uppercase cursor-pointer"
          >
            <Tv className="w-4 h-4" />
            <span>{isAr ? 'الانضمام لغرفة البث المباشر' : 'JOIN LIVE BROADCAST'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-3 border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold uppercase cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'CLOSE'}
          </button>
        </div>

      </div>
    </div>
  );
};
