import React, { useState } from 'react';
/** Shown on the button that is waiting. A greyed-out button is indistinguishable
 * from one still gated on its checklist — the label is what says "it registered". */
const BUSY_LABEL = { ar: 'جارٍ التنفيذ…', en: 'Working…' };


/**
 * Wave 4 — the body of a `dispute` row.
 *
 * Extracted from DisputesSection's per-dispute card.
 *
 * TWO CONTROLS THAT MUST SURVIVE (the audit lists both as already-working):
 *  - The resolution note is MANDATORY. Confirm stays disabled until it is
 *    non-empty. A money decision with no recorded reason is unauditable.
 *  - Resolution is TWO-STEP: pick an outcome, then confirm. Release and refund
 *    both move real money through server callables.
 *
 * Return-claim evidence photos are shown when present — the buyer's side of a
 * damaged/not-as-described claim.
 */
export interface DisputeCardProps {
  order: Record<string, any>;
  isAr: boolean;
  busy?: boolean;
  onResolve: (orderId: string, resolutionType: 'release' | 'refund' | 'resume', notes: string) => Promise<void>;
}

type ResolutionType = 'release' | 'refund' | 'resume';

export const DisputeCard: React.FC<DisputeCardProps> = ({ order, isAr, busy, onResolve }) => {
  const [picked, setPicked] = useState<ResolutionType | null>(null);
  const [notes, setNotes] = useState('');

  const canConfirm = !!picked && notes.trim().length > 0 && !busy;
  const claim = order.returnClaim;

  const options: { value: ResolutionType; ar: string; en: string; tone: string }[] = [
    { value: 'release', ar: 'تحرير المبلغ للبائع', en: 'Release to seller', tone: 'bg-emerald-600 hover:bg-emerald-700' },
    { value: 'refund', ar: 'استرداد المبلغ للمشتري', en: 'Refund the buyer', tone: 'bg-rose-600 hover:bg-rose-700' },
    { value: 'resume', ar: 'إغلاق النزاع ومتابعة الطلب', en: 'Close and resume order', tone: 'bg-gray-800 hover:bg-gray-900' },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-black text-fg truncate">{order.auctionTitle || order.id}</p>
        <p className="text-[11px] text-fg-muted">
          {isAr ? 'المبلغ' : 'Amount'}:{' '}
          <span dir="ltr">{Number(order.winningBidAmount || 0).toLocaleString('en-US')} {isAr ? 'د.أ' : 'JOD'}</span>
        </p>
        {order.disputeReason && (
          <p className="text-xs text-fg leading-relaxed whitespace-pre-wrap pt-1">{order.disputeReason}</p>
        )}
      </div>

      {claim && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-extrabold uppercase font-mono text-amber-800">
            {isAr ? 'طلب إرجاع من المشتري' : 'Buyer return claim'}
          </p>
          <p className="text-[11px] font-bold text-fg">
            {claim.reason === 'damaged'
              ? (isAr ? 'وصل تالفاً' : 'Arrived damaged')
              : (isAr ? 'مخالف للوصف' : 'Not as described')}
          </p>
          {claim.description && (
            <p className="text-xs text-fg leading-relaxed whitespace-pre-wrap">{claim.description}</p>
          )}
          {Array.isArray(claim.photoUrls) && claim.photoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {claim.photoUrls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-amber-200 block">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {claim.sellerResponse && (
            <div className="pt-1 border-t border-amber-200">
              <p className="text-[10px] font-bold uppercase font-mono text-fg-muted">{isAr ? 'رد البائع' : "Seller's response"}</p>
              <p className="text-xs text-fg leading-relaxed whitespace-pre-wrap">{claim.sellerResponse}</p>
            </div>
          )}
        </div>
      )}

      {/* Wave 3 evidence chain — the seller's dispatch photo against the
          buyer's receipt photo is exactly what a delivery dispute turns on. */}
      {(order.sentPhotoUrl || order.receivedPhotoUrl) && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase font-mono text-fg-muted">
            {isAr ? 'سلسلة إثبات التسليم' : 'Delivery evidence chain'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { url: order.prepPhotoUrl, ar: 'التجهيز', en: 'Prep' },
              { url: order.sentPhotoUrl, ar: 'الإرسال', en: 'Sent' },
              { url: order.receivedPhotoUrl, ar: 'الاستلام', en: 'Received' },
            ].filter(p => p.url).map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={p.url} alt="" className="w-full aspect-square rounded-lg object-cover border border-line" />
                <span className="block text-[9px] font-mono uppercase text-fg-muted mt-0.5">{isAr ? p.ar : p.en}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => setPicked(o.value)}
              className={`text-[10px] font-extrabold py-2 rounded-xl border transition-all ${picked === o.value ? 'border-[#FF6B00] bg-orange-50 text-fg' : 'border-line bg-surface-raised text-fg-muted hover:bg-surface-sunken'}`}
            >
              {isAr ? o.ar : o.en}
            </button>
          ))}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={isAr ? 'سبب القرار (إلزامي)...' : 'Reason for this decision (required)...'}
          className="w-full text-xs border border-line rounded-xl p-3 focus:outline-none focus:border-[#FF6B00] resize-none"
        />

        <button
          disabled={!canConfirm}
          onClick={() => { if (canConfirm && picked) onResolve(order.id, picked, notes.trim()); }}
          className={`w-full font-extrabold text-xs py-2.5 rounded-xl text-white transition-all ${canConfirm ? (options.find(o => o.value === picked)?.tone || 'bg-gray-800') : 'bg-gray-300 cursor-not-allowed'}`}
        >
          {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? 'تأكيد القرار' : 'Confirm decision')}
        </button>
      </div>
    </div>
  );
};

export default DisputeCard;
