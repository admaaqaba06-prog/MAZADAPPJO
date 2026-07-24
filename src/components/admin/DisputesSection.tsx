import React, { useMemo, useState } from 'react';
import { hoursBetween, daysBetween } from '../../utils/fulfillmentQueues';

/**
 * Slice D — Disputes (Job 4): the admin's queue of orders in `disputed` status,
 * oldest-first, each resolvable one of three ways with a required note. Purely
 * presentational + per-row local busy/feedback state: ALL data and the write
 * handler are injected by AdminDashboardView. This section creates NO Firestore
 * listeners.
 */
export interface DisputesSectionProps {
  isAr: boolean;
  orders: any[];                                        // realOrders (sim-excluded)
  onResolve: (orderId: string, resolutionType: 'release' | 'refund' | 'resume', notes: string) => Promise<void>;
}

type ResolutionType = 'release' | 'refund' | 'resume';

// Mirror AdminDashboardView / FulfillmentSection's normalization: Firestore
// Timestamp ({seconds}) → ms, else pass-through epoch ms, else fall back.
// updatedAt reflects when the order entered the disputed state.
function disputeOpenedAtMs(order: any, now: number): number {
  return order?.updatedAt?.seconds
    ? order.updatedAt.seconds * 1000
    : (order?.updatedAt || order?.createdAt || now);
}

// Bilingual age label: whole days once ≥ 1d, else hours. Mirrors FulfillmentSection.
function ageLabel(fromMs: number, now: number, isAr: boolean): string {
  const d = daysBetween(fromMs, now);
  if (d >= 1) return isAr ? `${d}ي` : `${d}d`;
  const h = Math.max(0, hoursBetween(fromMs, now));
  return isAr ? `${h}س` : `${h}h`;
}

interface DerivedDispute {
  order: any;
  openedAtMs: number;
}

const RESOLUTIONS: { id: ResolutionType; ar: string; en: string; tone: 'emerald' | 'red' | 'gray' }[] = [
  { id: 'release', ar: 'تحرير للبائع', en: 'Release to seller', tone: 'emerald' },
  { id: 'refund', ar: 'استرداد للمشتري', en: 'Refund buyer', tone: 'red' },
  { id: 'resume', ar: 'استئناف كمدفوع', en: 'Resume as paid', tone: 'gray' },
];

const TONE_CLASSES: Record<'emerald' | 'red' | 'gray', string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  red: 'bg-red-600 hover:bg-red-700 text-white',
  gray: 'bg-gray-900 hover:bg-black text-white',
};

/**
 * One dispute row. Owns its own selected-resolution + note + busy + feedback
 * state — mirrors FulfillmentSection's per-row busy/feedback idiom and
 * PaymentVerifyCard's inline required-reason box.
 */
const DisputeRow: React.FC<{
  entry: DerivedDispute;
  isAr: boolean;
  now: number;
  onResolve: (resolutionType: ResolutionType, notes: string) => Promise<void>;
}> = ({ entry, isAr, now, onResolve }) => {
  const { order, openedAtMs } = entry;
  const [selected, setSelected] = useState<ResolutionType | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'ok' | 'error' | null>(null);

  const canConfirm = notes.trim().length > 0 && !busy;

  const pick = (id: ResolutionType) => {
    if (busy) return;
    setFeedback(null);
    setSelected((cur) => (cur === id ? null : id));
  };

  const confirm = async () => {
    if (!selected || !canConfirm) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onResolve(selected, notes.trim());
      setFeedback('ok');
    } catch {
      setFeedback('error');
    } finally {
      setBusy(false);
    }
  };

  const reason = order.disputeReason && String(order.disputeReason).trim()
    ? order.disputeReason
    : (isAr ? 'لم يُسجَّل سبب' : 'No reason recorded');
  const selectedConfig = RESOLUTIONS.find((r) => r.id === selected);

  return (
    <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm space-y-3 animate-fadeIn">
      {/* Header: title + age */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h4 className="font-extrabold text-sm text-gray-900 leading-snug min-w-0">
          {order.auctionTitle || (isAr ? 'طلب' : 'Order')}
        </h4>
        <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
          {isAr ? 'مفتوح منذ ' : 'Open '}{ageLabel(openedAtMs, now, isAr)}
        </span>
      </div>

      {/* Parties */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] font-bold">
        <p className="text-gray-500">
          {isAr ? 'المشتري' : 'Buyer'}:{' '}
          <span className="text-gray-800">{order.buyerName || '—'}</span>
        </p>
        <p className="text-gray-500">
          {isAr ? 'البائع' : 'Seller'}:{' '}
          <span className="text-gray-800">{order.sellerName || '—'}</span>
        </p>
      </div>

      {/* Dispute reason */}
      <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3">
        <p className="text-[10px] font-bold text-rose-600 uppercase mb-0.5">
          {isAr ? 'سبب النزاع' : 'Dispute reason'}
        </p>
        <p className="text-xs text-gray-800 leading-relaxed">{reason}</p>
      </div>

      {/* Resolution buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {RESOLUTIONS.map((r) => {
          const active = selected === r.id;
          return (
            <button
              key={r.id}
              type="button"
              disabled={busy}
              onClick={() => pick(r.id)}
              className={`font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs transition-all ${
                busy
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : active
                    ? `${TONE_CLASSES[r.tone]} ring-2 ring-offset-1 ring-gray-300 cursor-pointer`
                    : `${TONE_CLASSES[r.tone]} opacity-80 hover:opacity-100 cursor-pointer`
              }`}
            >
              {isAr ? r.ar : r.en}
            </button>
          );
        })}
        {feedback === 'ok' && (
          <span className="text-[11px] font-bold text-emerald-600 whitespace-nowrap">
            {isAr ? 'تم الحل ✅' : '✅ resolved'}
          </span>
        )}
        {feedback === 'error' && (
          <span className="text-[11px] font-bold text-red-650 whitespace-nowrap">
            {isAr ? 'فشل — أعد المحاولة' : 'Failed — retry'}
          </span>
        )}
      </div>

      {/* Inline required-note box for the chosen resolution */}
      {selected && (
        <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 space-y-2.5 animate-fadeIn">
          <p className="text-[10px] font-bold text-gray-500 uppercase">
            {isAr ? 'ملاحظة الحل (مطلوبة)' : 'Resolution note (required)'}
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder={
              isAr
                ? 'اشرح سبب هذا القرار…'
                : 'Explain why this resolution…'
            }
            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-gray-400 resize-none disabled:bg-gray-100 disabled:text-gray-400"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={confirm}
              className={`font-extrabold text-xs px-4 py-2 rounded-xl transition-all ${
                canConfirm
                  ? `${selectedConfig ? TONE_CLASSES[selectedConfig.tone] : 'bg-gray-900 hover:bg-black text-white'} cursor-pointer`
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {busy
                ? (isAr ? '…' : '…')
                : (isAr
                    ? `تأكيد: ${selectedConfig ? selectedConfig.ar : ''}`
                    : `Confirm: ${selectedConfig ? selectedConfig.en : ''}`)}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setSelected(null); setNotes(''); }}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2 py-2 cursor-pointer disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const DisputesSection: React.FC<DisputesSectionProps> = ({
  isAr,
  orders,
  onResolve,
}) => {
  const now = Date.now();

  // Filter to disputed + sort oldest-first once per render.
  const disputes = useMemo(() => {
    const list: DerivedDispute[] = [];
    for (const order of orders || []) {
      if (order?.status !== 'disputed') continue;
      list.push({ order, openedAtMs: disputeOpenedAtMs(order, now) });
    }
    list.sort((a, b) => a.openedAtMs - b.openedAtMs); // oldest / most stuck first
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-4">
      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-gray-900">
            {isAr ? 'النزاعات' : 'Disputes'}
          </h3>
          <span className="text-xs font-black text-gray-500 font-mono">{disputes.length}</span>
        </div>
        <p className="text-xs text-gray-500">
          {isAr
            ? 'الطلبات المتنازع عليها — راجع السبب واختر الحل مع ملاحظة موثّقة.'
            : 'Orders in dispute — review the reason and pick a resolution with a documented note.'}
        </p>
      </div>

      {disputes.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400 font-bold">
          {isAr ? 'لا توجد نزاعات مفتوحة ✅' : 'No open disputes ✅'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {disputes.map((entry) => (
            <DisputeRow
              key={entry.order.id}
              entry={entry}
              isAr={isAr}
              now={now}
              onResolve={(resolutionType, notes) => onResolve(entry.order.id, resolutionType, notes)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DisputesSection;
