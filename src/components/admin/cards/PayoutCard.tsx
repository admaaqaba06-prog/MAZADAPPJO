import React, { useState } from 'react';
/** Shown on the button that is waiting. A greyed-out button is indistinguishable
 * from one still gated on its checklist — the label is what says "it registered". */
const BUSY_LABEL = { ar: 'جارٍ التنفيذ…', en: 'Working…' };


/**
 * Wave 4 — the body of a `payout` row.
 *
 * Extracted from PayoutsSection's per-withdrawal card. Reject requires a
 * reason, matching every other money decision in the panel: a seller told only
 * "rejected" has nothing to act on.
 */
export interface PayoutCardProps {
  withdrawal: Record<string, any>;
  /** Display name for the requesting user — the caller resolves it. */
  userName: string;
  isAr: boolean;
  busy?: boolean;
  /** transferRef is required — the server refuses an approval without it. */
  onApprove: (withdrawalId: string, transferRef: string) => Promise<any>;
  onReject: (withdrawalId: string, reason: string) => Promise<any>;
}

export const PayoutCard: React.FC<PayoutCardProps> = ({
  withdrawal, userName, isAr, busy, onApprove, onReject,
}) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // Recording the transfer is the gate on approving, mirroring the bankVerified
  // checkbox on money coming in. The server rejects an approval without it, so
  // this only stops the admin firing a call that would fail.
  const [transferRef, setTransferRef] = useState('');
  const canApprove = transferRef.trim().length >= 4 && !busy;

  const details = withdrawal.details || {};
  const method = withdrawal.method === 'cliq' ? (isAr ? 'كليك' : 'CliQ') : (isAr ? 'حوالة بنكية' : 'Bank transfer');
  const destination = details.cliqAlias || details.iban || details.phone || '—';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-black text-gray-900">{userName}</p>
        <p className="text-2xl font-black text-gray-950" dir="ltr">
          {Number(withdrawal.amount || 0).toLocaleString('en-US')} {isAr ? 'د.أ' : 'JOD'}
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500 font-bold uppercase font-mono">{isAr ? 'الطريقة' : 'Method'}</span>
          <span className="font-bold text-gray-800">{method}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] gap-3">
          <span className="text-gray-500 font-bold uppercase font-mono shrink-0">{isAr ? 'الوجهة' : 'Destination'}</span>
          <span className="font-mono text-gray-800 truncate" dir="ltr">{destination}</span>
        </div>
        {details.accountHolderName && (
          <div className="flex items-center justify-between text-[11px] gap-3">
            <span className="text-gray-500 font-bold uppercase font-mono shrink-0">{isAr ? 'اسم صاحب الحساب' : 'Account holder'}</span>
            <span className="font-bold text-gray-800 truncate">{details.accountHolderName}</span>
          </div>
        )}
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={isAr ? 'سبب الرفض...' : 'Reason for rejection...'}
            className="w-full text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-[#FF6B00] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setRejecting(false); setReason(''); }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-2 rounded-xl border border-gray-200"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              disabled={!reason.trim() || busy}
              onClick={() => onReject(withdrawal.id, reason.trim())}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2 rounded-xl disabled:opacity-50"
            >
              {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? 'تأكيد الرفض' : 'Confirm reject')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase font-mono text-gray-500">
              {isAr ? 'رقم عملية التحويل عبر كليك' : 'CliQ transfer reference'}
            </p>
            <input
              type="text"
              dir="ltr"
              value={transferRef}
              onChange={(e) => setTransferRef(e.target.value)}
              placeholder={isAr ? 'من إشعار التحويل' : 'From your transfer confirmation'}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#FF6B00]"
            />
            <p className="text-[10px] text-gray-400 leading-snug">
              {isAr
                ? 'أرسل المبلغ أولاً، ثم سجّل رقم العملية هنا. لا يمكن اعتماد السحب بدونه.'
                : 'Send the money first, then record its reference here. A payout cannot be approved without it.'}
            </p>
          </div>
          <div className="flex gap-2">
          <button
            disabled={!canApprove}
            onClick={() => { if (canApprove) onApprove(withdrawal.id, transferRef.trim()); }}
            className={`flex-1 font-extrabold text-xs py-2 rounded-xl text-white transition-all ${canApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? 'تم التحويل — اعتمد السحب' : 'Transfer sent — approve payout')}
          </button>
          <button
            onClick={() => { setRejecting(true); setReason(''); }}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-2 rounded-xl border border-gray-200"
          >
            {isAr ? 'رفض' : 'Reject'}
          </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayoutCard;
