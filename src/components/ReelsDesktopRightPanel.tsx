import React from 'react';
import { useApp } from '../context/AppContext';
import { Gavel, Store, Info, ShieldCheck, UserCheck, Star, Calendar, Clock, Award } from 'lucide-react';

export const ReelsDesktopRightPanel: React.FC = () => {
  const { activeAuctionId, auctions, bids, sellerProfiles, language } = useApp();
  const isAr = language === 'ar';

  const currentItem = auctions.find(a => a.id === activeAuctionId) || auctions[0];

  if (!currentItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Info className="w-8 h-8 text-zinc-500 mb-2" />
        <p className="text-xs text-zinc-400">
          {isAr ? 'اختر مزاداً لعرض التفاصيل' : 'Select an auction to view details'}
        </p>
      </div>
    );
  }

  // Filter and sort bids
  const activeBids = bids
    .filter(b => b.auctionId === currentItem.id)
    .sort((a, b) => b.amount - a.amount);

  // Seller Lookup
  const seller = sellerProfiles.find(s => s.userId === currentItem.sellerId) || {
    name: currentItem.sellerName || (isAr ? 'شريك رسمي معتمد' : 'Official Verified Partner'),
    companyName: isAr ? 'مجموعة عمان الفاخرة' : 'Amman Luxury Group',
    rating: 4.9,
    isVerified: true
  };

  const isRolex = currentItem.id?.includes('rolex');
  const isPorsche = currentItem.id?.includes('porsche');

  const formattedSubtitle = isRolex
    ? (isAr ? 'اصدار ذهبي عيار ١٨ مع كامل الملحقات المعتمدة والعلبة والشهادات • غير مستخدم' : '18ct Gold Edition • Complete set with warranty papers • Brand New')
    : isPorsche
    ? (isAr ? 'تخصيص كامل للنخبة PTS • لون رمادي مميز مع باقة السباقات الحصرية • جديد كلياً' : 'Elite allocation PTS clearance • Stealth GT3 Gray with track packages • Brand New')
    : (isAr ? 'جديد (غير مستخدم) • مع الضمان الرسمي والعلبة والكتيبات • تيتانيوم طبيعي' : 'Brand New (Unused) • Titanium Natural • Agent Warranty Covered');

  const formatBidTime = (timestamp: number) => {
    if (!timestamp) return isAr ? 'الآن' : 'Just now';
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
    if (secondsAgo < 60) return isAr ? 'الآن' : 'Just now';
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) return isAr ? `قبل ${minutesAgo} د` : `${minutesAgo}m ago`;
    const hoursAgo = Math.floor(minutesAgo / 60);
    return isAr ? `قبل ${hoursAgo} س` : `${hoursAgo}h ago`;
  };

  return (
    <div className="flex flex-col h-full space-y-5 text-zinc-200" id="reels-panel-content">
      {/* 1. AUCTION DETAILS */}
      <div className="space-y-3 bg-zinc-900/60 border border-white/5 p-4.5 rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Info className="w-4.5 h-4.5 text-[#FF6B00]" />
          <h3 className="text-[12.5px] font-black tracking-wider uppercase">
            {isAr ? 'تفاصيل المعروض والمواصفات' : 'LOT SPECIFICATIONS'}
          </h3>
        </div>

        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-black text-white leading-tight">
              {isRolex ? 'Rolex Cosmograph Daytona' : isPorsche ? 'Porsche 911 GT3 RS (992)' : currentItem.title}
            </h4>
            <span className="inline-flex items-center gap-1 mt-1 bg-zinc-800 border border-white/10 text-zinc-400 px-2 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider">
              {currentItem.category || (isAr ? 'فاخر' : 'Luxury')}
            </span>
          </div>

          <p className="text-[10.5px] text-zinc-400 leading-relaxed font-sans">
            {currentItem.description}
          </p>

          <p className="text-[10px] text-[#FF6B00] leading-relaxed font-sans font-medium italic">
            {formattedSubtitle}
          </p>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 font-sans">
            <div className="bg-black/30 p-2 rounded-xl border border-white/5">
              <span className="text-[8px] text-zinc-500 font-bold block uppercase">{isAr ? 'السعر الافتتاحي' : 'STARTING PRICE'}</span>
              <span className="text-xs font-black text-white">{currentItem.startingPrice.toLocaleString()} JOD</span>
            </div>
            <div className="bg-black/30 p-2 rounded-xl border border-white/5">
              <span className="text-[8px] text-zinc-500 font-bold block uppercase">{isAr ? 'الحد الأدنى للزيادة' : 'MIN INCREMENT'}</span>
              <span className="text-xs font-black text-[#FF6B00]">+{(currentItem.minIncrement || 50).toLocaleString()} JOD</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SELLER INFO */}
      <div className="space-y-3 bg-zinc-900/60 border border-white/5 p-4.5 rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Store className="w-4.5 h-4.5 text-[#FF6B00]" />
          <h3 className="text-[12.5px] font-black tracking-wider uppercase">
            {isAr ? 'معلومات البائع الضامن' : 'VERIFIED MERCHANT'}
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <img 
            src={currentItem.sellerLogo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
            alt="Seller" 
            className="w-10 h-10 rounded-full object-cover border-2 border-[#FF6B00]/40 shadow-md"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-black text-white truncate block">{seller.name}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </div>
            <span className="text-[9px] text-zinc-500 font-bold block leading-none mt-0.5 uppercase tracking-wider">
              {isAr ? 'تاجر ذهبي معتمد كليك' : 'CliQ Verified Platinum Merchant'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
          <div className="flex items-center gap-1 text-[10px] text-zinc-400">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
            <span><strong className="text-white">4.9</strong> {isAr ? 'التقييم' : 'Score'}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-400">
            <Award className="w-3 h-3 text-emerald-500 shrink-0" />
            <span><strong className="text-white">100%</strong> {isAr ? 'تسليم مضمون' : 'Secure Delivery'}</span>
          </div>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-500/15 p-2 rounded-xl flex gap-2 items-start">
          <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-[9.5px] text-emerald-400/90 leading-snug">
            {isAr 
              ? 'تم التحقق من هوية هذا البائع وتسجيل حسابه البنكي رسمياً عبر رقم كليك الوطني لضمان حماية المشتري الكاملة.' 
              : 'Merchant profile fully vetted with Central Bank Jordan CliQ credentials for absolute escrow buyer protection.'}
          </p>
        </div>
      </div>

      {/* 3. BID HISTORY */}
      <div className="flex-grow min-h-0 flex flex-col bg-zinc-900/60 border border-white/5 p-4.5 rounded-2xl space-y-3">
        <div className="flex justify-between items-center border-b border-white/5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Gavel className="w-4.5 h-4.5 text-[#FF6B00]" />
            <h3 className="text-[12.5px] font-black tracking-wider uppercase">
              {isAr ? 'سجل المزايدة الفوري' : 'BID HISTORICALS'}
            </h3>
          </div>
          <span className="bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase leading-none">
            {activeBids.length} {isAr ? 'عروض' : 'bids'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-2 no-scrollbar min-h-[140px]">
          {activeBids.length > 0 ? (
            activeBids.map((bid, index) => {
              const isWinning = index === 0;
              return (
                <div 
                  key={bid.id || `${bid.amount}-${index}`} 
                  className={`flex items-center justify-between p-2 rounded-xl transition-all border font-sans ${
                    isWinning 
                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/30 shadow-[0_2px_12px_rgba(255,107,0,0.1)]' 
                      : 'bg-black/25 border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img 
                      src={bid.bidderAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=50&q=80'} 
                      alt="Avatar" 
                      className="w-6.5 h-6.5 rounded-full object-cover shrink-0 border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 leading-tight">
                      <span className="text-[10.5px] font-bold text-white block truncate">
                        {bid.bidderName}
                      </span>
                      <span className="text-[8px] text-zinc-500 block">
                        {formatBidTime(bid.timestamp)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-[12.5px] font-black block font-mono ${isWinning ? 'text-[#FF8A00]' : 'text-zinc-300'}`}>
                      {bid.amount.toLocaleString()} <span className="text-[9px] font-bold text-zinc-500">JD</span>
                    </span>
                    {isWinning && (
                      <span className="inline-block text-[7.5px] font-black text-emerald-400 uppercase tracking-widest leading-none mt-0.5 bg-emerald-950/40 border border-emerald-500/20 px-1 py-0.2 rounded">
                        {isAr ? 'الأعلى حالياً' : 'HIGH BID'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-500">
              <Gavel className="w-6 h-6 text-zinc-600 mb-1.5" />
              <p className="text-[10px] uppercase font-black tracking-widest">
                {isAr ? 'لا توجد عروض بعد' : 'No bids registered'}
              </p>
              <p className="text-[9px] font-sans text-zinc-600 max-w-[150px] mt-0.5 leading-snug">
                {isAr ? 'كن أول من يزايد على هذا المعروض الفريد!' : 'Initiate the bidding using the controls below!'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
