import React, { useState } from 'react';
import { nextAdvance } from '../../../utils/orderAdvance';
import type { ActionReason } from '../../../utils/actionQueue';
/** Shown on the button that is waiting. A greyed-out button is indistinguishable
 * from one still gated on its checklist — the label is what says "it registered". */
const BUSY_LABEL = { ar: 'جارٍ التنفيذ…', en: 'Working…' };


/**
 * Wave 4 — the body of a `delivery_stalled` row.
 *
 * Extracted from FulfillmentSection. The four-bucket queue chrome around it is
 * GONE, deliberately: that structure described the phone relay — call the
 * seller, hand-advance the order — which Wave 3 replaced with a self-service
 * photo chain. What survives is the exception handling the relay was also good
 * for: nudge the party who has stalled, or hand-advance when they cannot act.
 *
 * `nextAdvance()` deliberately offers nothing at `delivered`: the next step
 * there releases money and stays the guarded escrow action.
 */
export interface StalledDeliveryCardProps {
  order: Record<string, any>;
  /** Why the queue raised this row — drives the explanation line. */
  reason: ActionReason;
  isAr: boolean;
  busy?: boolean;
  onNudge: (orderId: string, kind: 'ship' | 'confirm_delivery') => Promise<void>;
  onAdvance: (order: any, note: string) => Promise<{ success: boolean; message?: string }>;
  onOpenOrder: (orderId: string) => void;
}

const ADVANCE_LABEL: Record<string, { ar: string; en: string }> = {
  prepare_shipment: { ar: 'البائع بدأ التجهيز', en: 'Seller started preparing' },
  mark_shipped: { ar: 'خرج للتوصيل', en: 'Out for delivery' },
  mark_delivered: { ar: 'تم التسليم للمشتري', en: 'Delivered to buyer' },
};

const EXPLANATION: Record<string, { ar: string; en: string }> = {
  seller_hasnt_prepped: {
    ar: 'مرّ أكثر من ٢٤ ساعة على تأكيد الدفع ولم يبدأ البائع التجهيز.',
    en: 'More than 24h since payment cleared and the seller has not started preparing.',
  },
  buyer_hasnt_confirmed: {
    ar: 'مرّ أكثر من ٢٤ ساعة على خروج الطلب ولم يؤكد المشتري الاستلام — مبلغ البائع ما زال محجوزاً.',
    en: "More than 24h since dispatch and the buyer has not confirmed — the seller's money is still held.",
  },
  code_attempts_exhausted: {
    ar: 'استنفد المشتري كل محاولات رمز التسليم ولا يستطيع تأكيد الاستلام بنفسه.',
    en: 'The buyer has used every delivery-code attempt and cannot confirm receipt unaided.',
  },
};

export const StalledDeliveryCard: React.FC<StalledDeliveryCardProps> = ({
  order, reason, isAr, busy, onNudge, onAdvance, onOpenOrder,
}) => {
  const [note, setNote] = useState('');
  const advance = nextAdvance(order.status);
  const explanation = EXPLANATION[reason];
  const nudgeKind: 'ship' | 'confirm_delivery' = reason === 'seller_hasnt_prepped' ? 'ship' : 'confirm_delivery';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-black text-gray-900 truncate">{order.auctionTitle || order.id}</p>
        <p className="text-[11px] text-gray-500">
          <span dir="ltr">{Number(order.winningBidAmount || 0).toLocaleString('en-US')} {isAr ? 'د.أ' : 'JOD'}</span>
          {' · '}
          {isAr ? 'المشتري' : 'Buyer'}: {order.buyerName || '—'}
          {' · '}
          {isAr ? 'البائع' : 'Seller'}: {order.sellerName || '—'}
        </p>
      </div>

      {explanation && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3">
          <p className="text-[11px] text-amber-900 leading-relaxed">{isAr ? explanation.ar : explanation.en}</p>
        </div>
      )}

      {reason === 'code_attempts_exhausted' && (
        // The buyer is locked out by design (5 failed attempts). Nudging them
        // achieves nothing — the team has to look at the order itself.
        <button
          onClick={() => onOpenOrder(order.id)}
          className="w-full bg-[#121318] hover:bg-gray-900 text-white font-extrabold text-xs py-2.5 rounded-xl"
        >
          {isAr ? 'افتح الطلب وتحقق من رمز التسليم' : 'Open the order and check the delivery code'}
        </button>
      )}

      {reason !== 'code_attempts_exhausted' && (
        <>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isAr ? 'ملاحظة داخلية (اتصلنا بالبائع، المندوب يستلم الثلاثاء…)' : 'Internal note (called the seller, courier collects Tuesday…)'}
            className="w-full text-[11px] border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF6B00]"
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => onNudge(order.id, nudgeKind)}
              className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-bold text-xs py-2 rounded-xl disabled:opacity-50"
            >
              {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? 'تذكير' : 'Nudge')}
            </button>
            {advance && (
              <button
                disabled={busy}
                onClick={() => onAdvance(order, note.trim())}
                className="flex-1 bg-[#FF6B00] hover:bg-[#FF8000] text-white font-extrabold text-xs py-2 rounded-xl disabled:opacity-50"
              >
                {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? ADVANCE_LABEL[advance.action]?.ar : ADVANCE_LABEL[advance.action]?.en)}
              </button>
            )}
          </div>
        </>
      )}

      <button
        onClick={() => onOpenOrder(order.id)}
        className="w-full text-[11px] font-bold text-gray-500 hover:text-gray-800 underline"
      >
        {isAr ? 'فتح تفاصيل الطلب' : 'Open order details'}
      </button>
    </div>
  );
};

export default StalledDeliveryCard;
