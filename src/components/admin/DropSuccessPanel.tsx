import React from 'react';
import { canEditDrop, canCancelDrop, cancelWarnsAboutBids, bidCountOf } from '../../utils/dropEditability';

/**
 * Replaces the form after a successful create.
 *
 * The previous build left the whole form populated and reported success as one
 * small green line in the *other* column — on a phone, off screen entirely.
 * This panel takes the form's place so the confirmation lands where the admin
 * is already looking, and carries every next action they might want.
 *
 * Whether a lot is still editable or cancellable is NOT re-derived here: both
 * questions go through `dropEditability`, which knows that settlement writes
 * three closing statuses ('completed', 'reserve_not_met', 'ended'), not two.
 */
export interface DropSuccessPanelProps {
  isAr: boolean;
  auctionNumber: number | string | undefined;
  title: string;
  startingPrice: number;
  coverUrl: string;
  opensLabel: string;
  durationLabel: string;
  finalLink: string;
  caption: string;
  status?: string | null;
  totalBids?: number | null;
  hasCopyableMedia: boolean;
  /** Result of the last Copy image attempt. Rendered here rather than in the
   *  preview column — a confirmation the admin cannot see is not one. */
  copyMessage?: string;
  onCopyLink: () => void;
  onCopyCaption: () => void;
  onCopyImage: () => void;
  onDownloadMedia: () => void;
  onCreateAnother: () => void;
  /** A button with no handler is a dead button, so each renders only once it has
   *  one. Both are supplied by AuctionDropBuilderView (handleSaveEdit's `editing`
   *  flag and handleCancelDrop); they stay optional so the panel can still be
   *  rendered read-only. With both wired the action row below always has at
   *  least one child — Edit-or-the-locked-line plus Cancel while the lot is
   *  open, the locked line alone once it has closed — so it can no longer
   *  render as an empty `flex gap-2` strip. */
  onEdit?: () => void;
  onCancel?: () => void;
}

const action =
  'flex-1 border border-gray-300 rounded-xl py-2.5 text-xs font-bold text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export const DropSuccessPanel: React.FC<DropSuccessPanelProps> = ({
  isAr, auctionNumber, title, startingPrice, coverUrl, opensLabel, durationLabel,
  finalLink, caption, status, totalBids, hasCopyableMedia, copyMessage,
  onCopyLink, onCopyCaption, onCopyImage, onDownloadMedia,
  onCreateAnother, onEdit, onCancel,
}) => {
  const lot = { status, totalBids };
  const bids = bidCountOf(lot);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-black text-emerald-700">
          ✅ {isAr ? `تم إنشاء المزاد رقم ${auctionNumber ?? '—'}` : `Auction #${auctionNumber ?? '—'} created`}
        </h2>
        <p className="mt-1 text-xs font-bold text-gray-500">{opensLabel} · {durationLabel}</p>
      </div>

      <div className="flex items-center gap-3">
        {coverUrl && <img src={coverUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />}
        <div className="min-w-0">
          <p className="font-extrabold text-sm text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-500 font-mono">
            {isAr ? 'يبدأ من ' : 'Starting at '}{startingPrice.toLocaleString('en-US')} JOD
          </p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-2.5 text-xs break-all font-mono text-gray-700">{finalLink}</div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCopyLink} className={action}>{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
        <button type="button" onClick={onCopyCaption} className={action}>{isAr ? 'نسخ النص' : 'Copy caption'}</button>
        <button type="button" onClick={onCopyImage} disabled={!hasCopyableMedia} className={action}>{isAr ? 'نسخ الصورة' : 'Copy image'}</button>
        <button type="button" onClick={onDownloadMedia} disabled={!hasCopyableMedia} className={action}>{isAr ? 'تنزيل الوسائط' : 'Download media'}</button>
      </div>
      {!hasCopyableMedia && (
        <p className="text-[11px] text-gray-400">
          {isAr ? 'لا توجد وسائط لنسخها — أضف صورة غلاف أو فيديو.' : 'Nothing to copy — this drop has no cover image or video.'}
        </p>
      )}
      {copyMessage && <p className="text-[11px] text-gray-500">{copyMessage}</p>}

      <pre className="whitespace-pre-wrap border border-gray-200 rounded-xl p-3 text-xs bg-gray-50 max-h-64 overflow-y-auto" style={{ direction: 'rtl' }}>{caption}</pre>

      <div className="pt-2 border-t border-gray-100 space-y-2">
        <button
          type="button"
          onClick={onCreateAnother}
          className="w-full bg-[#FF6B00] hover:bg-orange-500 text-white font-black text-sm py-3 rounded-2xl transition-all cursor-pointer"
        >
          {isAr ? '＋ إنشاء مزاد آخر' : '＋ Create another'}
        </button>

        <div className="flex gap-2">
          {canEditDrop(lot) ? (
            onEdit && (
              <button type="button" onClick={onEdit} className={action}>{isAr ? 'تعديل' : 'Edit'}</button>
            )
          ) : (
            // Not a button: the lock is the point. Shown whether or not an edit
            // handler exists, because "why is Edit gone" is the question it answers.
            <p className="flex-1 text-[11px] font-bold text-gray-500 self-center">
              {isAr
                ? `عليه ${bids} مزايدة — لم يعد قابلاً للتعديل`
                : `${bids} bid${bids === 1 ? '' : 's'} placed — no longer editable`}
            </p>
          )}
          {canCancelDrop(lot) && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء المزاد' : 'Cancel drop'}
              {cancelWarnsAboutBids(lot) ? ' ⚠️' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DropSuccessPanel;
