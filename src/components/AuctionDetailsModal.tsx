import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AuctionItem } from '../types';
import { useVisibleAuctionLive } from '../hooks/useVisibleAuctionLive';
import { mergeLiveIntoCard } from '../utils/discoverQuery';
import { translations } from '../utils/translations';
import { ContextualHint } from './ContextualHint';
import { 
  X, 
  ShieldCheck, 
  MapPin, 
  Clock,
  Hourglass,
  ThumbsUp,
  Eye, 
  Coins, 
  ChevronRight, 
  Gavel, 
  Tv,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { minNextBid, totalWithPremium } from '../utils/bidMath';
import { priceLabel } from '../utils/bidLabels';
import { serverNow } from '../utils/serverTime';
import { useBidFlow, resolveConfirm } from '../hooks/useBidFlow';
import { BidConfirm } from './feedback';
import { cleanTitle } from '../utils/listingTitle';
import { isJunkDescription } from '../utils/listingDescription';

interface AuctionDetailsModalProps {
  auction: AuctionItem;
  onClose: () => void;
}

export const AuctionDetailsModal: React.FC<AuctionDetailsModalProps> = ({ auction: auctionProp, onClose }) => {
  const { currentUser, placeBid, wallet, activeView, setActiveView, language, setActiveAuctionId } = useApp();
  const isAr = language === 'ar';
  const t = translations[language];

  // Re-sourced off the broad `useAuctions()` array (1b Task 4): the opener passes
  // the full lot in hand and we keep its live fields (price/status/endTime/
  // bidder/totalBids/reserveMet) fresh via ONE shared single-doc subscription —
  // the same infra the paginated Discover cards use. `mergeLiveIntoCard` overlays
  // only defined live fields, so static lot fields are always preserved. Shadowed
  // as `auction` so every downstream read below is unchanged.
  const liveOverlay = useVisibleAuctionLive(auctionProp.id, true);
  const auction = useMemo(
    () => mergeLiveIntoCard(auctionProp, liveOverlay),
    [auctionProp, liveOverlay],
  );
  const [biddingAmount, setBiddingAmount] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'err'; msg: string } | null>(null);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('00:00:00');

  // Route bids through the SAME shared flow as the live reel: membership gate
  // (non-members are invited to join, never single-tap a bid) + confirm step +
  // submitting guard. (Hooks must run before the `!auction` early return.)
  const executeBidAmt = async (amt: number) => {
    if (!auction) return;
    setFeedback(null);
    const result = await placeBid(auction.id, amt);
    if (result.success) {
      setFeedback({ type: 'success', msg: isAr ? `🚀 تم تقديم مزايدتكم بقيمة ${amt.toLocaleString()} د.أ بنجاح!` : `🚀 Bid of ${amt.toLocaleString()} JOD logged successfully!` });
    } else {
      setFeedback({ type: 'err', msg: result.message });
    }
    return result;
  };
  const { pendingBid, submitting, startBid, confirmBid, cancelBid } = useBidFlow(executeBidAmt);

  // Same price-move protection as the reel: if a rival outbids during the confirm
  // window, re-prompt at the fresh minimum instead of sending the stale amount
  // (which the server would reject with a generic "minimum bid required").
  const [priceMoved, setPriceMoved] = useState(false);

  const openConfirm = (amount: number) => {
    setPriceMoved(false);
    startBid(amount);
  };

  const handleConfirm = (amount: number) => {
    if (!auction) return;
    const latestMin = minNextBid(auction.currentPrice, auction.minIncrement, auction.totalBids || 0);
    const decision = resolveConfirm(amount, latestMin);
    if (decision.action === 'reprompt') {
      setPriceMoved(true);
      startBid(decision.amount); // re-open confirm at the fresh minimum
      return;
    }
    setPriceMoved(false);
    confirmBid(decision.amount);
  };

  const handleCancel = () => {
    setPriceMoved(false);
    cancelBid();
  };

  // Item condition — shown ONLY when the seller/admin actually set it on the
  // auction doc (no fabricated specs). `condition` is the sole structured spec
  // field the data model carries today; when absent, the spec tile is hidden.
  const conditionLabel = auction?.condition === 'new'
    ? (isAr ? 'جديد' : 'New')
    : auction?.condition === 'used'
      ? (isAr ? 'مستعمل' : 'Used')
      : null;

  // Clockless (awaiting-first-bid) lot. Deliberately the SAME condition the
  // timer effect below uses to write the awaiting copy into `timeLeftStr`,
  // rather than `isAwaitingFirstBid(auction)`: the badge only needs to know
  // which STRING it is rendering, and keying it off a second, stricter
  // predicate (which also requires `startMode === 'first_bid'` and no bids)
  // could put the clock icon back next to the awaiting sentence whenever the
  // two disagree.
  const awaitingFirstBid = auction?.endTime == null;

  useEffect(() => {
    if (!auction) return;
    // No clock yet (awaiting first bid): show the awaiting copy and start no
    // interval. Without this, `null - serverNow()` clamps to 0 and the modal
    // reads "Ended" on a lot that has not started.
    if (auction.endTime == null) {
      setTimeLeftStr(isAr ? 'بانتظار أول مزايدة' : 'Awaiting first bid');
      return;
    }
    const endsAtMs = auction.endTime;
    // Ticked ONCE up front as well as on the interval (same idiom as
    // ReelsDesktopRightPanel): `timeLeftStr` is state that persists across the
    // awaiting→started flip. When the first bid lands with the modal open, the
    // badge swaps to the Clock icon + `font-mono` on that render while
    // `timeLeftStr` still holds "Awaiting first bid"; the leading tick
    // overwrites it in the same commit's effect pass instead of up to a second
    // later, so the mismatch lasts one frame rather than one tick. Same reason
    // a freshly opened lot no longer paints the '00:00:00' initial state for
    // that second.
    const tick = () => {
      const remainingSecs = Math.max(0, Math.floor((endsAtMs - serverNow()) / 1000));
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
    };
    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [auction, isAr]);

  if (!auction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-zinc-950/65 backdrop-blur-xs">
      <div 
        onClick={onClose} 
        className="absolute inset-0 cursor-pointer"
      />
      
      <div 
        className="relative bg-surface-raised text-fg w-full max-w-md h-[100dvh] md:h-auto md:max-h-[85vh] md:rounded-[24px] overflow-hidden flex flex-col shadow-2xl z-10 animate-in slide-in-from-bottom duration-300"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
      >
        
        {/* Modal Top Header with Lot title & category */}
        <div className="p-4 border-b border-line flex justify-between items-center bg-surface-sunken/70 shrink-0">
          <div>
            <span className="text-[9px] bg-[#FF6B00]/10 text-[#FF6B00] px-2 py-0.5 rounded-full font-black uppercase font-mono">
              {isAr ? 'تفاصيل المزاد والضمان' : `LOT DETAILS • ${auction.category.toUpperCase()}`}
            </span>
            <h3 className="text-xs font-black text-fg mt-1 uppercase tracking-tight">
              {isAr ? 'مواصفات المعروض القانونية' : 'OFFICIAL SECURED CHARACTERISTICS'}
            </h3>
          </div>
          
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-sunken hover:bg-surface-sunken text-fg flex items-center justify-center transition-all cursor-pointer"
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
            
            {/* Countdown floating badge — or, for a clockless (awaiting-first-bid)
                lot, the awaiting badge. `timeLeftStr` is set to "Awaiting first
                bid" / "بانتظار أول مزايدة" by the effect above for that state, so
                a Clock icon beside it would label a no-clock sentence with a
                clock, and `font-mono` would set an ~18-char sentence in digit
                type (especially wide in Arabic). The swap is awaiting-ONLY —
                the countdown branch below keeps its Clock icon and class
                strings byte-for-byte. The Hourglass is local to THIS surface;
                the other first_bid surfaces avoid the clock their own way
                (DiscoveryFeedView: a `Zap` "BE THE FIRST" badge plus a `⏳`
                emoji pill; auction/CountdownPill: a bare label, no icon). */}
            <div className={`absolute bottom-3 ${isAr ? 'right-3' : 'left-3'} bg-black/55 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2`}>
              {awaitingFirstBid ? (
                <>
                  <Hourglass className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-black text-white leading-tight tracking-tight">{timeLeftStr}</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span className="text-xs font-black text-white font-mono tracking-tight">{timeLeftStr}</span>
                </>
              )}
            </div>
          </div>

          <div>
            <h1 className="text-base font-black text-fg leading-tight">
              {cleanTitle(auction.title)}
            </h1>
            {(() => {
              // This box carries its own background, border and padding, so an
              // unguarded empty description renders a ~30px empty grey card
              // under the title. Production had zero empty descriptions until
              // the concierge form started writing '' deliberately; that state
              // is live now, on Discovery, LiveStream and the Seller Center.
              //
              // The title-echo case is suppressed for the same reason it is on
              // the bidding screens: 102 live lots copy the title into the
              // description, and this box sits directly under the title, so it
              // would print the same string twice.
              const text = String(auction.description || '').trim();
              if (isJunkDescription(text, auction.title)) return null;
              return (
                <p className="text-xs text-fg-muted mt-1.5 leading-relaxed bg-surface-sunken border border-line p-3 rounded-xl">
                  {text}
                </p>
              );
            })()}
          </div>

          {/* Condition tile — real seller-provided field only; hidden when absent. */}
          {conditionLabel && (
            <div className="grid grid-cols-1 gap-2.5">
              <div className="bg-surface-sunken p-3 rounded-xl border border-line" style={{ textAlign: isAr ? 'right' : 'left' }}>
                <span className="text-[9px] text-fg-muted font-bold uppercase block">{isAr ? 'حالة السلعة' : 'CONDITION'}</span>
                <span className="text-xs font-black text-fg font-mono mt-0.5 block">{conditionLabel}</span>
              </div>
            </div>
          )}

          {/* Buyer-protection banner — honest Mazad-holds-funds model (no regulated/audited claim). */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 flex gap-2.5 items-start">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[10px] leading-relaxed text-fg-muted">
              <span className="text-emerald-800 font-black uppercase text-[10px] block mb-0.5">
                {isAr ? 'حماية المشتري' : 'BUYER PROTECTION'}
              </span>
              {isAr
                ? 'إذا فزت، بتدفع لمزاد مش للبائع مباشرة. مزاد بيحتفظ بمبلغك وما بيحوّله للبائع إلا بعد ما تستلم القطعة وتتأكد إنها مطابقة. إذا صار أي إشكال، افتح نزاع ومزاد بيتوسّط.'
                : 'If you win, you pay Mazad — not the seller directly. Mazad holds your payment and only releases it to the seller after you receive the item and confirm it matches. If anything is wrong, open a dispute and Mazad mediates.'}
            </div>
          </div>

          {/* Bid values pricing table */}
          <div className="bg-surface-sunken border border-line/60 rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-fg-muted font-bold">{priceLabel(auction.totalBids, isAr)}</span>
              <span className="text-sm font-black text-[#FF6B00] font-mono">{auction.currentPrice.toLocaleString()} JOD</span>
            </div>
            <div className="flex justify-between items-center text-xs border-t border-line/50 pt-2">
              <span className="text-fg-muted">{isAr ? 'صاحب العرض القيادي' : 'LEADING BIDDER'}</span>
              <span className="text-[11px] font-bold text-fg">{auction.currentBidderName || (isAr ? 'لا مزايدات حتى الآن' : 'No offers yet')}</span>
            </div>
            <div className="flex justify-between items-center text-[10.5px] border-t border-line/50 pt-2 text-zinc-500">
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
                  titleAr="ماذا يحدث بعد المزايدة؟ 🔨"
                  titleEn="What Happens After Bidding? 🔨"
                  descAr="رائع! أنت الآن في المنافسة. إذا فزت، تدفع سعر الفوز + عمولة المشتري ٥٪ عبر كليك خلال ٢٤ ساعة. إذا خسرت، لا تدفع شيئاً."
                  descEn="Awesome! You're in the running. If you win, you pay the final price + 5% buyer's premium via CliQ within 24 hours. If you lose, you pay nothing."
                />
              )}
            </div>
          )}

          {/* Interactive instant bidding triggers */}
          {auction.status === 'live' && (
            <div className="space-y-2">
              <span className="text-[10px] text-fg-muted font-bold uppercase tracking-wider block">
                {isAr ? 'مزايدة فورية بلمسة واحدة' : 'ONE-TOUCH INSTANT BID'}
              </span>
              
              {(() => {
                const inc = auction.minIncrement || 10;
                const base = minNextBid(auction.currentPrice, auction.minIncrement, auction.totalBids || 0);
                return (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {[base, base + inc, base + 2 * inc, base + 3 * inc].map(amount => (
                        <button
                          key={amount}
                          disabled={submitting}
                          onClick={() => openConfirm(amount)}
                          className="py-2.5 bg-surface-raised hover:bg-[#FF6B00] hover:text-white border border-line text-fg font-black rounded-xl text-xs font-mono transition-all text-center flex flex-col items-center justify-center cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="text-[10.5px]">
                            {amount > auction.currentPrice
                              ? `+${(amount - auction.currentPrice).toLocaleString()} ${isAr ? 'د.أ' : 'JOD'}`
                              : (isAr ? 'الحد الأدنى' : 'MIN BID')}
                          </span>
                          <span className="text-[8.5px] opacity-60 font-medium">{amount.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-fg-muted text-center mt-1">
                      {isAr
                        ? `المجموع عند الفوز: ${totalWithPremium(base).toLocaleString()} د.أ (شامل عمولة المشتري ٥٪)`
                        : `Total if you win: ${totalWithPremium(base).toLocaleString()} JOD (incl. 5% buyer's premium)`}
                    </p>

                    {/* Confirm step (same as the reel) — non-members never reach here;
                        they are sent to the subscription sheet by startBid. */}
                    <div className="relative min-h-0">
                      <BidConfirm
                        amount={pendingBid}
                        isAr={isAr}
                        priceMoved={priceMoved}
                        onConfirm={handleConfirm}
                        onCancel={handleCancel}
                        className="relative z-10 mt-2 rounded-xl bg-zinc-900 border border-white/10 shadow-xl flex flex-col items-center justify-center gap-2 p-3"
                      />
                    </div>

                    {submitting && (
                      <p className="flex items-center justify-center gap-2 text-[11px] text-[#FF6B00] font-bold mt-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {isAr ? 'جارٍ إرسال المزايدة…' : 'Placing your bid…'}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </div>

        {/* Modal sticky bottom action - join live rooms */}
        <div className="p-4 border-t border-line bg-surface-raised flex gap-3 shrink-0">
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
            className="px-4 py-3 border border-line hover:bg-surface-sunken text-fg-muted rounded-xl text-xs font-bold uppercase cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'CLOSE'}
          </button>
        </div>

      </div>
    </div>
  );
};
