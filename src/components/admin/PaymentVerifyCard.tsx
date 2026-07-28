import React, { useState } from 'react';
import { normalizeReceiptUrl } from '../../utils/paymentReceipt';

/**
 * Shared verify core for the Slice B Verify & Approve queues (subscription
 * requests + order payments). Purely presentational: the caller resolves the
 * record, computes mismatch/duplicate flags, localizes title/labels, and
 * performs the actual writes in its onApprove/onReject callbacks. No
 * Firestore imports here — ever.
 */
export interface PaymentVerifyCardProps {
  record: Record<string, any>;          // sub request or order — receipt resolved via normalizeReceiptUrl
  title: string;                        // e.g. product title or plan label (caller-localized)
  expectedAmountJod: number;            // shown big next to the receipt
  amountMismatch?: boolean;             // caller-computed (e.g. sub price ≠ canonical tier price)
  payerName: string;
  payerPhone?: string;
  cliqSenderPhone?: string;             // E1 — phone the CliQ transfer is coming FROM (match the incoming money)
  isDuplicateReceipt?: boolean;         // caller-computed via findDuplicateFingerprints
  phoneAmountDup?: boolean;             // Wave 1 — SOFT signal: same CliQ phone + amount as another order (does NOT block approve)
  approveLabel: string;                 // caller-localized ('Approve' / 'Mark verified')
  busy?: boolean;
  isAr: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;   // card enforces non-empty reason before calling
}

const QUICK_REJECT_REASONS: { ar: string; en: string }[] = [
  { ar: 'الإيصال غير واضح', en: 'Receipt unclear' },
  { ar: 'المبلغ غير مطابق', en: 'Amount mismatch' },
  { ar: 'حساب غير صحيح', en: 'Wrong account' },
];

export const PaymentVerifyCard: React.FC<PaymentVerifyCardProps> = ({
  record,
  title,
  expectedAmountJod,
  amountMismatch,
  payerName,
  payerPhone,
  cliqSenderPhone,
  isDuplicateReceipt,
  phoneAmountDup,
  approveLabel,
  busy,
  isAr,
  onApprove,
  onReject,
}) => {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // Wave 1 — admin must confirm the money actually landed in the bank account
  // before Approve is enabled. Local per-card state, defaults unchecked.
  const [bankVerified, setBankVerified] = useState(false);

  const receiptUrl = normalizeReceiptUrl(record);
  const txnRef = typeof record.txnRef === 'string' ? record.txnRef.trim() : '';
  const canApprove = !!receiptUrl && !busy && bankVerified;
  const canConfirmReject = reason.trim().length > 0 && !busy;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fadeIn"
    >
      {/* Header: title + warning chips */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h4 className="font-extrabold text-sm text-gray-900 leading-snug min-w-0">{title}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {amountMismatch && (
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold px-2.5 py-0.5 whitespace-nowrap">
              ⚠ {isAr ? 'المبلغ غير مطابق' : 'Amount mismatch'}
            </span>
          )}
          {isDuplicateReceipt && (
            <span className="text-[10px] bg-red-50 text-red-650 border border-red-100 rounded-full font-bold px-2.5 py-0.5 whitespace-nowrap">
              ⚠ {isAr ? 'إيصال مكرر' : 'Duplicate receipt'}
            </span>
          )}
          {phoneAmountDup && (
            <span className="text-[10px] bg-red-50 text-red-650 border border-red-100 rounded-full font-bold px-2.5 py-0.5 whitespace-nowrap">
              ⚠ {isAr ? 'نفس الهاتف والمبلغ لطلب آخر' : 'Same phone + amount as another order'}
            </span>
          )}
        </div>
      </div>

      {/* Receipt */}
      {receiptUrl ? (
        <img
          src={receiptUrl}
          alt={isAr ? 'إيصال الدفع' : 'Payment receipt'}
          className="w-full max-h-72 object-contain rounded-xl border border-gray-200 bg-gray-50 cursor-zoom-in transition-transform hover:scale-[1.01]"
          onClick={() => setZoomOpen(true)}
        />
      ) : (
        <div className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center">
          {isAr ? 'لا يوجد إيصال مرفق' : 'No receipt attached'}
        </div>
      )}

      {/* Amount + payer */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase">
            {isAr ? 'المبلغ المتوقع' : 'Expected amount'}
          </p>
          <p className="text-2xl font-mono font-black text-gray-900 leading-tight">
            {expectedAmountJod}
            <span className="text-xs font-bold text-gray-500 mx-1">{isAr ? 'د.أ' : 'JOD'}</span>
          </p>
        </div>
        <div className={isAr ? 'text-left' : 'text-right'}>
          <p className="text-xs font-bold text-gray-800">{payerName}</p>
          {payerPhone && <p className="text-[11px] text-gray-500 font-mono mt-0.5" dir="ltr">{payerPhone}</p>}
          {/* E1 — the number the CliQ money is coming FROM (may differ from the
              account/delivery phone; used to match the incoming transfer). */}
          {cliqSenderPhone && (
            <p className="text-[10px] text-[#FF6B00] font-mono font-bold mt-1">
              <span className="text-gray-400 font-semibold">{isAr ? 'مُرسِل كليك:' : 'CliQ from:'}</span>{' '}
              <span dir="ltr">{cliqSenderPhone}</span>
            </p>
          )}
          {/* Wave 1 — CliQ transaction reference (server-written). Muted dash
              for legacy orders that predate the reference. */}
          <p className="text-[10px] font-mono font-bold mt-1">
            <span className="text-gray-400 font-semibold">{isAr ? 'المرجع / رقم العملية:' : 'Reference:'}</span>{' '}
            {txnRef ? (
              <span className="text-gray-800" dir="ltr">{txnRef}</span>
            ) : (
              <span className="text-gray-300 font-semibold">{isAr ? '—' : 'not provided'}</span>
            )}
          </p>
        </div>
      </div>

      {/* Wave 1 — required bank-verified gate: Approve stays disabled until the
          admin confirms the payment actually landed in the bank account. */}
      <label className="flex items-start gap-2 cursor-pointer select-none bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
        <input
          type="checkbox"
          checked={bankVerified}
          onChange={e => setBankVerified(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
        />
        <span className="text-[11px] font-bold text-emerald-800 leading-snug">
          {isAr
            ? 'تأكدت من وصول الدفعة إلى الحساب البنكي'
            : 'I verified this payment arrived in the bank account'}
        </span>
      </label>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          disabled={!canApprove}
          onClick={onApprove}
          className={`font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs min-w-[120px] transition-all ${
            canApprove
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {approveLabel}
        </button>
        <button
          disabled={busy}
          onClick={() => setRejecting(r => !r)}
          className={`font-bold text-xs px-4 py-2 rounded-xl min-w-[100px] border transition-all ${
            busy
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-red-50 hover:bg-red-100 text-red-650 border-red-100 cursor-pointer'
          }`}
        >
          {isAr ? 'رفض' : 'Reject'}
        </button>
      </div>

      {/* Inline reject reason box */}
      {rejecting && (
        <div className="bg-red-50/50 border border-red-100 rounded-xl p-3 space-y-2.5 animate-fadeIn">
          <p className="text-[10px] font-bold text-red-650 uppercase">
            {isAr ? 'سبب الرفض' : 'Rejection reason'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REJECT_REASONS.map(r => {
              const label = isAr ? r.ar : r.en;
              return (
                <button
                  key={r.en}
                  type="button"
                  onClick={() => setReason(label)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                    reason === label
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-red-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isAr ? 'أو اكتب سبباً آخر…' : 'Or type another reason…'}
            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-red-300"
          />
          <div className="flex items-center gap-2">
            <button
              disabled={!canConfirmReject}
              onClick={() => onReject(reason.trim())}
              className={`font-extrabold text-xs px-4 py-2 rounded-xl transition-all ${
                canConfirmReject
                  ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isAr ? 'تأكيد الرفض' : 'Confirm reject'}
            </button>
            <button
              type="button"
              onClick={() => { setRejecting(false); setReason(''); }}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2 py-2 cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Full-screen receipt zoom (mirrors AdminDashboardView's viewer, component-local) */}
      {zoomOpen && receiptUrl && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
          onClick={() => setZoomOpen(false)}
        >
          <img
            src={receiptUrl}
            alt={isAr ? 'إيصال الدفع بالحجم الكامل' : 'Receipt full preview'}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl"
          />
        </div>
      )}
    </div>
  );
};
