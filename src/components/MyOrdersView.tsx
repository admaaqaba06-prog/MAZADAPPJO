import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { OrderDetailsView } from './OrderDetailsView';
import { winTotalDue } from './feedback';
import { isViewerWinner } from '../utils/bidMath';
import { isAuctionFinished, serverNow } from '../utils/serverTime';
import { translations } from '../utils/translations';
import { Order } from '../types';
import { ShoppingBag, Clock, ChevronLeft, ChevronRight, Sparkles, Star } from 'lucide-react';

/** Session guard: auto-open the review prompt at most once per browser session. */
const REVIEW_AUTOPROMPT_KEY = 'mazad_review_autoprompted';

/** Firestore Timestamp | ISO string | ms number → epoch ms (0 when absent). */
const toMillis = (raw: any): number => {
  if (!raw) return 0;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds) return raw.seconds * 1000;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const STATUS_CHIP: Record<string, { ar: string; en: string; cls: string }> = {
  waiting_payment: { ar: 'بانتظار الدفع', en: 'Waiting Payment', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { ar: 'تم الدفع', en: 'Paid', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  preparing_shipment: { ar: 'جاري التجهيز', en: 'Preparing Shipment', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  shipped: { ar: 'تم الشحن', en: 'Shipped', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  delivered: { ar: 'تم التوصيل', en: 'Delivered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  completed: { ar: 'مكتمل', en: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  disputed: { ar: 'متنازع عليه', en: 'Disputed', cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { ar: 'ملغى', en: 'Cancelled', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  refunded: { ar: 'تمت الإعادة', en: 'Refunded', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  defaulted: { ar: 'متخلف عن الدفع', en: 'Defaulted', cls: 'bg-red-100 text-red-800 border-red-300' },
};

/** Live countdown to the 24h CliQ payment deadline. Red under 3 hours. */
const PaymentCountdown: React.FC<{ deadline: any; isAr: boolean }> = ({ deadline, isAr }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const deadlineMs = toMillis(deadline);
  if (!deadlineMs) return null;

  const remaining = deadlineMs - now;
  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-red-600 font-mono">
        <Clock className="w-3.5 h-3.5" />
        <span>{isAr ? 'انتهت مهلة الدفع' : 'Payment window expired'}</span>
      </span>
    );
  }

  const totalMinutes = Math.floor(remaining / 60000);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  const urgent = remaining < 3 * 60 * 60 * 1000;

  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-black font-mono ${urgent ? 'text-red-600' : 'text-amber-600'}`}>
      <Clock className={`w-3.5 h-3.5 ${urgent ? 'animate-pulse' : ''}`} />
      <span>{isAr ? `متبقي للدفع: ${hh}:${mm}` : `Time left to pay: ${hh}:${mm}`}</span>
    </span>
  );
};

export const MyOrdersView: React.FC = () => {
  const { orders, auctions, currentUser, language, setActiveView, globalSelectedOrderId, setGlobalSelectedOrderId, myReviews, setReviewPromptOrderId } = useApp();
  const isAr = language === 'ar';
  const t = translations[isAr ? 'ar' : 'en'];
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Win CTAs deep-link straight into a specific order via the global id.
  useEffect(() => {
    if (globalSelectedOrderId) {
      setSelectedOrderId(globalSelectedOrderId);
      setGlobalSelectedOrderId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSelectedOrderId]);

  const myOrders = (orders || [])
    .filter((o: Order) => o.buyerId === currentUser?.id)
    .sort((a: Order, b: Order) => toMillis(b.createdAt) - toMillis(a.createdAt));

  // Wave 1 settlement-lag hint: the closer cron creates the order up to ~60s
  // after an auction ends, so a winner following "Complete payment" can land
  // here before their order doc exists. Detect a RECENTLY finished auction
  // this user won with no matching order yet — pure derivation from data
  // already in context (no new listeners); the hint clears itself when the
  // order lands. The 10-minute recency window keeps a legacy/edge auction
  // that never settled into an order from pinning a stale hint forever.
  const JUST_WON_WINDOW_MS = 10 * 60 * 1000;
  const nowMs = serverNow();
  const hasUnsettledWin = (auctions || []).some((a: any) =>
    isViewerWinner(a, currentUser?.id) &&
    isAuctionFinished(a, nowMs) &&
    typeof a.endTime === 'number' &&
    nowMs - a.endTime < JUST_WON_WINDOW_MS &&
    !myOrders.some((o: Order) => o.auctionId === a.id)
  );

  // Orders the buyer can still rate: completed/delivered with no buyer review yet.
  const reviewedOrderIds = new Set(
    (myReviews || []).filter(r => r.direction === 'buyer_rates_auction').map(r => r.orderId)
  );
  const isReviewable = (o: Order) =>
    (o.status === 'completed' || o.status === 'delivered') && !reviewedOrderIds.has(o.id);

  // Auto-open the review prompt once per session when an unreviewed
  // completed order first shows up (oldest first — same order the bid gate targets).
  const firstReviewable = myOrders.filter(isReviewable).sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))[0];
  const firstReviewableId = firstReviewable?.id ?? null;
  useEffect(() => {
    if (!firstReviewableId) return;
    try {
      if (sessionStorage.getItem(REVIEW_AUTOPROMPT_KEY)) return;
      sessionStorage.setItem(REVIEW_AUTOPROMPT_KEY, firstReviewableId);
    } catch {
      return; // storage blocked — skip the nudge rather than nag every render
    }
    setReviewPromptOrderId(firstReviewableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstReviewableId]);

  if (selectedOrderId) {
    return (
      <div className="w-full h-full overflow-y-auto bg-[#F7F6F3] p-4 md:p-0" id="my-orders-details-wrap">
        <OrderDetailsView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />
      </div>
    );
  }

  const Chevron = isAr ? ChevronLeft : ChevronRight;

  return (
    <div className="w-full h-full overflow-y-auto bg-[#F7F6F3]" id="my-orders-view-root">
      <div className="max-w-3xl mx-auto w-full p-4 md:p-0 space-y-4 pb-16 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between bg-white px-5 py-4 rounded-3xl border border-gray-150 shadow-[0_2px_8px_rgba(0,0,0,0.01)] mt-2 md:mt-0">
          <h2 className="text-sm font-black text-gray-950 tracking-tight flex items-center gap-2 uppercase font-mono">
            <ShoppingBag className="w-4 h-4 text-[#FF6B00]" />
            <span>{isAr ? 'مشترياتي' : 'My Orders'}</span>
          </h2>
          <span className="text-[10px] bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20 font-mono font-black px-2.5 py-0.5 rounded-full">
            {myOrders.length} {isAr ? 'طلبات' : 'Orders'}
          </span>
        </div>

        {/* Settlement-lag hint: just-won auction whose order the cron (≤60s)
            hasn't created yet — the winner never dead-ends here. */}
        {hasUnsettledWin && (
          <div
            className="flex items-center gap-3 bg-white border border-amber-200 rounded-3xl px-5 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
            id="order-finalizing-hint"
          >
            <Clock className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-black text-gray-950">{t.ordersFinalizingTitle}</p>
              <p className="text-[10.5px] text-gray-400 font-semibold leading-relaxed">{t.ordersFinalizingHint}</p>
            </div>
          </div>
        )}

        {myOrders.length === 0 ? (
          /* Empty state */
          <div className="text-center py-16 bg-white rounded-3xl border border-gray-150 p-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6B00] mx-auto">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <p className="font-black text-gray-950 text-sm">
                {isAr ? 'لا مشتريات بعد — زايد واربح!' : 'No purchases yet — bid and win!'}
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed max-w-[280px] mx-auto">
                {isAr
                  ? 'عند فوزك بمزاد سيظهر طلبك هنا مع تفاصيل الدفع عبر كليك.'
                  : 'When you win an auction, your order appears here with CliQ payment details.'}
              </p>
            </div>
            <button
              onClick={() => setActiveView('discovery')}
              className="mx-auto bg-[#FF6B00] hover:bg-[#FF8000] text-white font-black py-3 px-6 rounded-2xl text-xs transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.98] shadow-md shadow-orange-500/10"
              id="my-orders-empty-cta"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isAr ? 'تصفح المزادات' : 'Discover Auctions'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {myOrders.map((order: Order) => {
              const chip = STATUS_CHIP[order.status] || { ar: order.status, en: order.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
              const totalDue = order.totalDue ?? winTotalDue(order.winningBidAmount);

              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedOrderId(order.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedOrderId(order.id); } }}
                  className="w-full text-left rtl:text-right bg-white border border-gray-150 hover:border-orange-200 rounded-3xl p-4 transition-all cursor-pointer active:scale-[0.995] shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex items-center gap-4"
                  id={`my-order-card-${order.id}`}
                >
                  <img
                    src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=300&q=80'}
                    alt={order.auctionTitle}
                    className="w-16 h-16 rounded-2xl object-cover border border-gray-150 shrink-0"
                    referrerPolicy="no-referrer"
                  />

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-gray-950 text-xs truncate leading-snug max-w-full">
                        {order.auctionTitle}
                      </h4>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase font-mono shrink-0 ${chip.cls}`}>
                        {isAr ? chip.ar : chip.en}
                      </span>
                    </div>

                    <p className="text-sm font-black text-[#FF6B00] font-mono">
                      {isAr
                        ? `المجموع: ${totalDue.toLocaleString()} د.أ شامل العمولة`
                        : `Total: ${totalDue.toLocaleString()} JOD incl. premium`}
                    </p>

                    {order.status === 'waiting_payment' && (
                      <PaymentCountdown deadline={order.paymentDeadlineAt} isAr={isAr} />
                    )}

                    {isReviewable(order) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewPromptOrderId(order.id);
                        }}
                        className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-black text-[10.5px] px-3 py-1.5 rounded-xl transition-all cursor-pointer active:scale-[0.98]"
                        id={`rate-order-btn-${order.id}`}
                      >
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>{isAr ? 'قيّم تجربتك ⭐' : 'Rate your experience ⭐'}</span>
                      </button>
                    )}
                  </div>

                  <Chevron className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
