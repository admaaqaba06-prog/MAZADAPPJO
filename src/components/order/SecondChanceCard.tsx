/**
 * Second Chance Offer — the card both parties act on.
 *
 * When an auction winner fails to pay, the payment-default enforcer stamps a
 * `secondChanceOffer` onto the auction doc offering the lot to the runner-up.
 * Without this card the offer is invisible and expires unseen after 24h.
 *
 * ONE component, TWO surfaces — deliberately, so the seller's screen and the
 * runner-up's screen can never disagree about the state of the same offer:
 *   - Seller Center (listings list), beside the below-reserve offer card whose
 *     layout this copies.
 *   - My Orders, above the order list, where the below-reserve buyer-confirm
 *     step already lives.
 *
 * ALL branching about who may press what lives in
 * `src/utils/secondChanceOffer.ts` (`secondChanceViewState`) — Vitest here is
 * `environment: 'node'` with no jsdom, so this component cannot be
 * render-tested and must therefore hold no decisions of its own. In particular
 * the seller gets NO decline button on `pending_buyer`: above the reserve they
 * already consented, and the server answers that action with
 * `permission-denied`.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { AuctionItem } from '../../types';
import {
  offerMillis,
  secondChanceBidderLabel,
  secondChanceTimeLeftLabel,
  secondChanceTotalDue,
  secondChanceViewState,
  SecondChanceAction,
} from '../../utils/secondChanceOffer';

interface SecondChanceCardProps {
  auction: Pick<AuctionItem, 'id' | 'title' | 'sellerId' | 'thumbnailUrl' | 'secondChanceOffer'> & { [k: string]: any };
  currentUserId: string | null | undefined;
  isAr: boolean;
  onRespond: (auctionId: string, action: SecondChanceAction) => Promise<unknown> | void;
  /** Compact variant for the Seller Center row (no lot thumbnail — the row already has one). */
  compact?: boolean;
  /** Placement classes from the host surface. Kept on the card's own root so an
   *  offer that dies mid-render leaves no ghost margin behind. */
  className?: string;
}

export const SecondChanceCard: React.FC<SecondChanceCardProps> = ({
  auction,
  currentUserId,
  isAr,
  onRespond,
  compact = false,
  className = '',
}) => {
  // Ticks the countdown AND re-evaluates liveness, so the card removes itself
  // the moment the window closes instead of offering a button the server will
  // reject.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [busy, setBusy] = useState<SecondChanceAction | null>(null);

  const offer = auction?.secondChanceOffer;
  const state = secondChanceViewState(auction, currentUserId, now);
  if (!state.visible || !offer) return null;

  const expMs = offerMillis(offer.expiresAt);
  const timeLeft = Number.isFinite(expMs) ? secondChanceTimeLeftLabel(expMs - now, isAr) : '';
  const bidderLabel = secondChanceBidderLabel(offer.bidderName, isAr);
  const bid = Number(offer.amount) || 0;
  const totalDue = secondChanceTotalDue(offer.amount);
  const isSeller = state.role === 'seller';

  const run = async (action: SecondChanceAction) => {
    if (busy) return;
    setBusy(action);
    try {
      await onRespond(auction.id, action);
    } finally {
      setBusy(null);
    }
  };

  // Headline — who is being asked, and for what.
  const headline = isSeller
    ? (state.canAccept
      // pending_seller: the runner-up's bid is UNDER the reserve.
      ? (isAr
        ? `تخلّف الفائز عن الدفع. ${bidderLabel} زايد ${bid.toLocaleString()} د.أ — أقل من سعرك المطلوب. تقبلها؟`
        : `The winner failed to pay. ${bidderLabel} bid ${bid.toLocaleString()} JOD — below your reserve. Accept it?`)
      // pending_buyer: already the seller's price; the ball is the bidder's.
      : (isAr
        ? `عُرض هذا المزاد على ${bidderLabel} بقيمة ${bid.toLocaleString()} د.أ بعد تخلّف الفائز عن الدفع. بانتظار رده.`
        : `This lot was offered to ${bidderLabel} at ${bid.toLocaleString()} JOD after the winner failed to pay. Awaiting their answer.`))
    : (state.canAccept
      ? (isAr
        ? `فرصة ثانية! تخلّف الفائز عن الدفع، والقطعة معروضة عليك بمزايدتك ${bid.toLocaleString()} د.أ.`
        : `Second chance! The winner failed to pay — this lot is offered to you at your bid of ${bid.toLocaleString()} JOD.`)
      : (isAr
        ? `تخلّف الفائز عن الدفع. عرضنا مزايدتك ${bid.toLocaleString()} د.أ على البائع — بانتظار موافقته.`
        : `The winner failed to pay. We offered your bid of ${bid.toLocaleString()} JOD to the seller — awaiting their decision.`));

  // The amount MUST be on screen before Accept is pressed.
  const acceptNote = state.acceptAction === 'buyer_accept'
    ? (isAr
      ? `سيتم إنشاء طلب بقيمة ${totalDue.toLocaleString()} د.أ (شامل عمولة المشتري) وتبدأ مهلة الدفع.`
      : `An order for ${totalDue.toLocaleString()} JOD (incl. buyer's premium) will be created and the payment window starts.`)
    : (isAr
      ? `عند القبول، سيتم إنشاء طلب بقيمة ${totalDue.toLocaleString()} د.أ للمزايد ليؤكد الشراء.`
      : `If you accept, an order for ${totalDue.toLocaleString()} JOD goes to the bidder to confirm.`);

  const acceptLabel = state.acceptAction === 'buyer_accept'
    ? (isAr ? `اقبل العرض — ${totalDue.toLocaleString()} د.أ` : `Accept — ${totalDue.toLocaleString()} JOD`)
    : (isAr ? `اقبل — ${totalDue.toLocaleString()} د.أ` : `Accept — ${totalDue.toLocaleString()} JOD`);

  return (
    <div
      className={`rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-2.5 ${compact ? '' : 'shadow-xs'} ${className}`}
      id={`second-chance-offer-${auction.id}`}
    >
      <div className="flex items-start gap-2">
        {!compact && auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt={auction.title}
            className="w-11 h-11 rounded-xl object-cover border border-amber-200 bg-white shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 space-y-0.5 flex-1">
          <p className="text-[9px] font-black uppercase tracking-wider text-amber-600 font-mono">
            {isAr ? 'فرصة ثانية' : 'Second chance'}
          </p>
          {!compact && (
            <p className="text-[11.5px] font-black text-amber-900 truncate">{auction.title}</p>
          )}
          <p className="text-[11.5px] font-black text-amber-900 leading-snug">{headline}</p>
          {timeLeft && (
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 font-mono pt-0.5">
              <Clock className="w-3 h-3" />
              <span>{timeLeft}</span>
            </span>
          )}
        </div>
      </div>

      {state.canAccept && (
        <p className="text-[10px] text-amber-700/90 font-semibold leading-relaxed" id={`second-chance-amount-${auction.id}`}>
          {acceptNote}
        </p>
      )}

      {state.awaitingOther && !state.canDecline && (
        <p className="text-[10px] text-amber-700/90 font-semibold leading-relaxed">
          {isAr
            ? 'لا إجراء مطلوب منك الآن — القرار للمزايد.'
            : 'Nothing for you to do — the decision is the bidder’s.'}
        </p>
      )}

      {(state.canAccept || state.canDecline) && (
        <div className="flex items-center gap-2">
          {state.canAccept && state.acceptAction && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); run(state.acceptAction!); }}
              disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black text-[11px] px-3.5 py-2.5 rounded-xl transition-all cursor-pointer active:scale-[0.98]"
              id={`second-chance-accept-${auction.id}`}
            >
              {busy === state.acceptAction ? (isAr ? 'جارٍ...' : 'Working...') : acceptLabel}
            </button>
          )}
          {state.canDecline && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); run('decline'); }}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-700 border border-gray-200 font-black text-[11px] px-3.5 py-2.5 rounded-xl transition-all cursor-pointer active:scale-[0.98]"
              id={`second-chance-decline-${auction.id}`}
            >
              {busy === 'decline' ? (isAr ? 'جارٍ...' : 'Working...') : (isAr ? 'ارفض' : 'Decline')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
