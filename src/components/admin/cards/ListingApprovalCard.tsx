import React, { useState } from 'react';
import { ViewingSelector } from '../ViewingSelector';
import type { ViewingMode } from '../../../utils/viewing';
/** Shown on the button that is waiting. A greyed-out button is indistinguishable
 * from one still gated on its checklist — the label is what says "it registered". */
const BUSY_LABEL = { ar: 'جارٍ التنفيذ…', en: 'Working…' };


/**
 * Wave 4 — the body of an `approve_listing` row.
 *
 * Extracted from LaunchSection's per-lot approval card. The list, filters and
 * headers around it are gone: the Action Center supplies the list, this card
 * supplies one lot.
 *
 * THE GATES ARE NOT DECORATION and must survive any refactor of this file
 * (they came from PR #176):
 *  - `hasMedia` is HARD. A lot with no photo or video cannot go live at all,
 *    however many boxes are ticked.
 *  - The three checkboxes are the admin's explicit quality confirmation. All
 *    three plus media unlock APPROVE.
 *  - The test-title match is a SOFT warning — it never blocks.
 *
 * Purely presentational, like PaymentVerifyCard: no Firestore imports, every
 * write arrives as a callback.
 */
export interface ListingApprovalCardProps {
  auction: Record<string, any>;
  isAr: boolean;
  busy?: boolean;
  onApprove: (auctionId: string, viewing?: ViewingMode, viewingPlace?: string) => void | Promise<any>;
  onReject: (auctionId: string, reason?: string) => void | Promise<any>;
}

interface LotChecklist { photo: boolean; category: boolean; name: boolean }

const EMPTY_CHECKLIST: LotChecklist = { photo: false, category: false, name: false };

export const ListingApprovalCard: React.FC<ListingApprovalCardProps> = ({
  auction, isAr, busy, onApprove, onReject,
}) => {
  const [checklist, setChecklist] = useState<LotChecklist>(EMPTY_CHECKLIST);
  const [viewing, setViewing] = useState<ViewingMode | ''>('');
  const [viewingPlace, setViewingPlace] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const hasMedia = !!(auction.thumbnailUrl || auction.videoUrl || (auction.mediaUrls && auction.mediaUrls.length));
  const allChecked = checklist.photo && checklist.category && checklist.name;
  const canApprove = allChecked && hasMedia && !busy;
  const looksLikeTest = /test|tset|اختبار|dummy|sample/i.test(String(auction.title || ''));

  const items: { key: keyof LotChecklist; en: string; ar: string }[] = [
    { key: 'photo', en: 'Real product photo (not a poster/branding slide)', ar: 'صورة منتج حقيقية (وليست بوستر أو تصميم دعائي)' },
    { key: 'category', en: 'Category is correct', ar: 'التصنيف صحيح' },
    { key: 'name', en: 'Descriptive name, not a test', ar: 'اسم وصفي وليس تجريبياً' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {auction.thumbnailUrl && (
          // Click through to full size — a small crop hides both detail and
          // framing, so an approver could not inspect what they were approving.
          <a href={auction.thumbnailUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img src={auction.thumbnailUrl} alt="" className="w-20 h-20 rounded-xl object-cover border border-line" />
          </a>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-black text-fg truncate">{auction.title || (isAr ? 'بدون عنوان' : 'Untitled')}</p>
          <p className="text-[11px] text-fg-muted">
            {isAr ? 'السعر الابتدائي' : 'Starting price'}: <span dir="ltr">{Number(auction.startingPrice || 0).toLocaleString('en-US')} {isAr ? 'د.أ' : 'JOD'}</span>
          </p>
        </div>
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={isAr ? 'سبب الرفض...' : 'Reason for rejection...'}
            className="w-full text-xs border border-line rounded-xl p-3 focus:outline-none focus:border-[#FF6B00] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setRejecting(false); setReason(''); }}
              className="flex-1 bg-surface-sunken hover:bg-gray-200 text-fg font-semibold text-xs py-2 rounded-xl border border-line"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              disabled={!reason.trim() || busy}
              onClick={() => onReject(auction.id, reason.trim())}
              className="flex-1 bg-[#121318] hover:bg-gray-900 text-white font-extrabold text-xs py-2 rounded-xl disabled:opacity-50"
            >
              {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? 'تأكيد الرفض' : 'Confirm reject')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ViewingSelector
            value={viewing}
            onChange={(next) => setViewing(next || '')}
            place={viewingPlace}
            onPlaceChange={setViewingPlace}
            isAr={isAr}
          />

          <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 space-y-2.5">
            <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
              ✅ {isAr ? 'تأكيد الجودة قبل النشر' : 'PRE-LAUNCH QUALITY CHECK'}
            </span>

            {!hasMedia && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5">
                <span>⛔</span>
                <span>{isAr ? 'لا توجد صورة/فيديو — لا يمكن الموافقة' : 'No photo/video — cannot approve'}</span>
              </div>
            )}

            {looksLikeTest && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{isAr ? 'يبدو أنه إعلان تجريبي' : 'Looks like a test listing'}</span>
              </div>
            )}

            <div className="space-y-1.5">
              {items.map(({ key, en, ar }) => (
                <label key={key} className="flex items-start gap-2 text-[11px] text-fg font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checklist[key]}
                    onChange={() => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="mt-0.5 w-3.5 h-3.5 rounded accent-[#FF6B00] shrink-0 cursor-pointer"
                  />
                  <span>{isAr ? ar : en}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              disabled={!canApprove}
              onClick={() => {
                if (!canApprove) return;   // hard gate, never fire without media + ticks
                onApprove(auction.id, viewing || undefined, viewingPlace || undefined);
              }}
              className={`flex-1 font-extrabold text-xs py-2 rounded-xl transition-all text-white ${canApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-300 cursor-not-allowed'}`}
            >
              {busy ? (isAr ? BUSY_LABEL.ar : BUSY_LABEL.en) : (isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & GO LIVE')}
            </button>
            <button
              onClick={() => { setRejecting(true); setReason(''); }}
              className="flex-1 bg-surface-sunken hover:bg-gray-200 text-fg font-semibold text-xs py-2 rounded-xl border border-line"
            >
              {isAr ? 'رفض الطلب' : 'REJECT'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListingApprovalCard;
