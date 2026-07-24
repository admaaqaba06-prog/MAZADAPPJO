import React from 'react';
import { useApp, useAuctions, useChat } from '../context/AppContext';
import { Gavel, Info, ShieldCheck, UserCheck, Calendar, Clock } from 'lucide-react';
import { SwipeToBid } from './SwipeToBid';
import { BidConfirm } from './feedback';
import { isAuctionOpen } from '../utils/auctionPhase';
import { minNextBid } from '../utils/bidMath';
import { resolveConfirm } from '../hooks/useBidFlow';
import { formatAmmanClock } from '../utils/ammanTime';

export const ReelsDesktopRightPanel: React.FC = () => {
  const {
    activeAuctionId,
    bids,
    sellerProfiles,
    language,
    sendChatMessage,
    currentUser,
    placeBid,
    isAuthenticated,
    requestSignIn
  } = useApp();
  const { auctions } = useAuctions();
  const { chatMessages } = useChat();
  const isAr = language === 'ar';

  const currentItem = auctions.find(a => a.id === activeAuctionId) || auctions[0];

  const [timeLeftStr, setTimeLeftStr] = React.useState<string>('00:00:00');

  // Click-fallback confirm for SwipeToBid: a completed swipe gesture still
  // bids directly; a plain click/Enter stages the amount here and goes
  // through BidConfirm (same confirm UX as the live reel).
  const [pendingBid, setPendingBid] = React.useState<number | null>(null);

  // Same price-move protection as mobile: if a rival outbids during the ≤10s
  // confirm window, re-prompt at the fresh minimum instead of sending the stale
  // amount (which the server would reject with a generic error).
  const [priceMoved, setPriceMoved] = React.useState(false);

  // Never carry a staged confirm across auctions.
  React.useEffect(() => {
    setPendingBid(null);
    setPriceMoved(false);
  }, [activeAuctionId]);

  React.useEffect(() => {
    if (!currentItem) return;
    const interval = setInterval(() => {
      // Pre-open auctions count down to their scheduled start; open auctions count down to the end.
      const open = isAuctionOpen(currentItem.status);
      const target = !open && currentItem.scheduledStartAt ? currentItem.scheduledStartAt : currentItem.endTime;
      const remainingMs = target - Date.now();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));
      // T-0 dead zone: scheduled start has passed but the opener cron hasn't flipped it live yet.
      if (!open && (currentItem.scheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
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
        // Clamp at zero: the auction is over — never tick into a phantom
        // "next window" clock. The server closer flips the status shortly.
        setTimeLeftStr(isAr ? 'انتهى المزاد' : 'Auction ended');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentItem, isAr]);

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

  // Seller Lookup — real profile only; no synthesized name/company/verification.
  const seller = sellerProfiles.find(s => s.userId === currentItem.sellerId) || {
    name: currentItem.sellerName || (isAr ? 'بائع مزاد' : 'Mazad Seller'),
    companyName: '',
    isVerified: false
  };

  // Condition subtitle from the REAL auction field only; hidden when absent.
  const formattedSubtitle = currentItem.condition === 'new'
    ? (isAr ? 'جديد (غير مستخدم)' : 'Brand New (Unused)')
    : currentItem.condition === 'used'
    ? (isAr ? 'مستعمل' : 'Used')
    : '';

  const formatBidTime = (timestamp: number) => {
    if (!timestamp) return isAr ? 'الآن' : 'Just now';
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
    if (secondsAgo < 60) return isAr ? 'الآن' : 'Just now';
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) return isAr ? `قبل ${minutesAgo} د` : `${minutesAgo}m ago`;
    const hoursAgo = Math.floor(minutesAgo / 60);
    return isAr ? `قبل ${hoursAgo} س` : `${hoursAgo}h ago`;
  };

  const nextBidAmount = minNextBid(currentItem.currentPrice, currentItem.minIncrement, currentItem.totalBids || 0);

  return (
    <div className="flex flex-col h-full space-y-4 text-zinc-200 overflow-y-auto pr-1 no-scrollbar" id="reels-panel-content">
      
      {/* 1. CURRENT PRICE & TIME LEFT */}
      <div className="grid grid-cols-2 gap-3 bg-zinc-900/85 border border-white/5 p-4 rounded-2xl shrink-0">
        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
          <span className="text-[8px] text-zinc-500 font-bold block uppercase">{isAr ? 'السعر الحالي' : 'CURRENT PRICE'}</span>
          <span className="text-base font-black text-[#FF6B00]">{currentItem.currentPrice.toLocaleString()} JOD</span>
        </div>
        <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
          <span className="text-[8px] text-zinc-500 font-bold block uppercase">
            {!isAuctionOpen(currentItem.status) && currentItem.scheduledStartAt
              ? (isAr ? 'يبدأ خلال' : 'STARTS IN')
              : (isAr ? 'الوقت المتبقي' : 'TIME LEFT')}
          </span>
          <span className="text-xs font-black text-emerald-400 font-mono mt-0.5 block">
            {timeLeftStr}
          </span>
        </div>
      </div>

      {/* 2. SLIDE TO BID */}
      <div className="relative space-y-2 bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
        <span className="text-[8px] text-zinc-500 font-bold block uppercase mb-1.5">
          {isAr ? 'المزايدة السريعة' : 'QUICK BIDDING'}
        </span>
        <SwipeToBid
          amount={nextBidAmount}
          onSwipeSuccess={async () => {
            // Guest browsing: bidding is the signup moment.
            if (!isAuthenticated) {
              requestSignIn();
              return;
            }
            if (currentUser.isBlocked) {
              alert(isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!');
              return;
            }
            await placeBid(currentItem.id, nextBidAmount);
          }}
          onTap={() => {
            // Guest browsing: bidding is the signup moment.
            if (!isAuthenticated) {
              requestSignIn();
              return;
            }
            if (currentUser.isBlocked) {
              alert(isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!');
              return;
            }
            setPriceMoved(false); // fresh confirm: no stale "price moved" copy
            setPendingBid(nextBidAmount);
          }}
          disabled={currentUser.isBlocked || (currentUser.subscriptionStatus !== 'active' && !isAr) || !isAuctionOpen(currentItem?.status)}
          language={language as 'en' | 'ar'}
        />
        {/* Inline confirm for the click fallback (anchored to this card).
            At confirm, recompute against the LATEST minimum (nextBidAmount is
            derived from live auction state every render): if a rival outbid us
            during the confirm window, re-prompt at the new min instead of
            sending the stale amount — same resolveConfirm pattern as mobile. */}
        <BidConfirm
          amount={pendingBid}
          isAr={isAr}
          priceMoved={priceMoved}
          onConfirm={async (amt) => {
            const decision = resolveConfirm(amt, nextBidAmount);
            if (decision.action === 'reprompt') {
              setPriceMoved(true);
              setPendingBid(decision.amount); // re-open confirm at the fresh minimum
              return;
            }
            setPriceMoved(false);
            setPendingBid(null);
            await placeBid(currentItem.id, decision.amount);
          }}
          onCancel={() => {
            setPriceMoved(false);
            setPendingBid(null);
          }}
        />
        {!isAuctionOpen(currentItem?.status) && (
          <p className="text-[9px] text-amber-400 font-bold text-center pt-1">
            {currentItem?.scheduledStartAt
              ? (isAr ? `يبدأ المزاد ${formatAmmanClock(currentItem.scheduledStartAt)}` : `Auction starts at ${formatAmmanClock(currentItem.scheduledStartAt)}`)
              : (isAr ? 'يبدأ المزاد قريباً' : 'Auction starts soon')}
          </p>
        )}
      </div>

      {/* 3. AUCTION DETAILS */}
      <div className="space-y-3 bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 pb-1.5">
          <Info className="w-4 h-4 text-[#FF6B00]" />
          <h3 className="text-[11px] font-black tracking-wider uppercase">
            {isAr ? 'تفاصيل المعروض والمواصفات' : 'LOT SPECIFICATIONS'}
          </h3>
        </div>

        <div className="space-y-2">
          <div>
            <h4 className="text-xs font-black text-white leading-tight">
              {currentItem.title}
            </h4>
            <span className="inline-flex items-center gap-1 mt-1 bg-zinc-800 border border-white/10 text-zinc-400 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
              {currentItem.category || (isAr ? 'فاخر' : 'Luxury')}
            </span>
          </div>

          <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
            {currentItem.description}
          </p>

          {formattedSubtitle && (
            <p className="text-[9px] text-[#FF6B00] leading-relaxed font-sans font-medium italic">
              {formattedSubtitle}
            </p>
          )}
        </div>
      </div>

      {/* 4. SELLER INFO */}
      <div className="space-y-3 bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-2.5">
          <img 
            src={currentItem.sellerLogo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
            alt="Seller" 
            className="w-8 h-8 rounded-full object-cover border-2 border-[#FF6B00]/40 shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-black text-white truncate block">{seller.name}</span>
          </div>
        </div>
      </div>

      {/* 5. SHIPPING INFO */}
      <div className="space-y-2 bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-1.5 border-b border-white/5 pb-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <h3 className="text-[11px] font-black tracking-wider uppercase">
            {isAr ? 'الشحن وحماية المشتري' : 'SHIPPING & BUYER PROTECTION'}
          </h3>
        </div>
        <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
          {isAr
            ? 'الشحن داخل الأردن ينسّق مع البائع بعد الدفع. مزاد بيحتفظ بمبلغك وما بيحوّله للبائع إلا بعد ما تعاين القطعة وتأكّد الاستلام.'
            : 'Shipping inside Jordan is arranged with the seller after payment. Mazad holds your payment and only releases it to the seller after you inspect the item and confirm receipt.'}
        </p>
      </div>

      {/* 6. COMMENTS SECTION */}
      <div className="flex flex-col bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 border-b border-white/5 pb-1.5">
          <h3 className="text-[11px] font-black tracking-wider uppercase">
            {isAr ? 'التعليقات المباشرة' : 'LIVE COMMENTS'}
          </h3>
        </div>
        
        <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
          {chatMessages && chatMessages.filter(msg => msg.auctionId === currentItem.id).length > 0 ? (
            chatMessages
              .filter(msg => msg.auctionId === currentItem.id)
              .map((msg) => (
                <div key={msg.id} className="flex gap-2 items-start text-[10px] font-sans">
                  <img 
                    src={msg.userAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=40&q=80'} 
                    alt="Avatar" 
                    className="w-5 h-5 rounded-full object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5">
                    <span className="font-extrabold text-zinc-300 block truncate">{msg.userName}</span>
                    <p className="text-zinc-200 mt-0.5 leading-snug">{msg.text}</p>
                  </div>
                </div>
              ))
          ) : (
            <p className="text-[9px] text-zinc-500 text-center py-2 uppercase font-black tracking-wider">
              {isAr ? 'لا توجد تعليقات بعد' : 'No comments yet'}
            </p>
          )}
        </div>

        {/* Comment input form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Guest browsing: chatting is the signup moment.
            if (!isAuthenticated) {
              requestSignIn();
              return;
            }
            const form = e.currentTarget;
            const input = form.elements.namedItem('commentText') as HTMLInputElement;
            if (!input || !input.value.trim()) return;
            sendChatMessage(input.value.trim());
            input.value = '';
          }}
          className="flex gap-1.5 pt-1"
        >
          <input 
            name="commentText"
            type="text"
            placeholder={isAr ? 'أضف تعليقاً...' : 'Add comment...'}
            className="flex-grow h-7 px-2 bg-white/5 border border-white/10 rounded-lg text-zinc-100 text-[10px] outline-none focus:border-[#FF6B00]/70"
          />
          <button 
            type="submit"
            className="h-7 px-3 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[9px] rounded-lg"
          >
            {isAr ? 'إرسال' : 'Send'}
          </button>
        </form>
      </div>

      {/* 7. BID HISTORY */}
      <div className="flex-grow min-h-0 flex flex-col bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-2">
        <div className="flex justify-between items-center border-b border-white/5 pb-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <Gavel className="w-4 h-4 text-[#FF6B00]" />
            <h3 className="text-[11px] font-black tracking-wider uppercase">
              {isAr ? 'سجل المزايدة الفوري' : 'BID HISTORICALS'}
            </h3>
          </div>
          <span className="bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase leading-none">
            {activeBids.length} {isAr ? 'عروض' : 'bids'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 no-scrollbar min-h-[120px]">
          {activeBids.length > 0 ? (
            activeBids.map((bid, index) => {
              const isWinning = index === 0;
              return (
                <div 
                  key={bid.id || `${bid.amount}-${index}`} 
                  className={`flex items-center justify-between p-1.5 rounded-xl transition-all border font-sans ${
                    isWinning 
                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/30 shadow-sm' 
                      : 'bg-black/25 border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <img 
                      src={bid.bidderAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=50&q=80'} 
                      alt="Avatar" 
                      className="w-5.5 h-5.5 rounded-full object-cover shrink-0 border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 leading-tight">
                      <span className="text-[9.5px] font-bold text-white block truncate">
                        {bid.bidderName}
                      </span>
                      <span className="text-[7.5px] text-zinc-500 block">
                        {formatBidTime(bid.timestamp)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-[11.5px] font-black block font-mono ${isWinning ? 'text-[#FF8A00]' : 'text-zinc-300'}`}>
                      {bid.amount.toLocaleString()} <span className="text-[8px] font-bold text-zinc-500">JD</span>
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center text-zinc-500">
              <Gavel className="w-5 h-5 text-zinc-600 mb-1" />
              <p className="text-[9px] uppercase font-black tracking-widest">
                {isAr ? 'لا توجد عروض بعد' : 'No bids registered'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
