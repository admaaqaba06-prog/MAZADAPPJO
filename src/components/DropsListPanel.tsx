import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { AuctionItem } from '../types';
import { buildAuctionUrl } from '../utils/deepLink';
import { buildAuctionCaption } from '../utils/dropCaption';
import { captionInputFromAuction } from '../utils/captionFromAuction';
import { copyImageToClipboard } from '../utils/dropMedia';

const GROUPS: { key: string; ar: string; en: string; match: (a: AuctionItem) => boolean }[] = [
  { key: 'live', ar: 'مباشر الآن', en: 'Live now', match: (a) => a.status === 'live' },
  { key: 'upcoming', ar: 'قادمة', en: 'Upcoming', match: (a) => a.status === 'upcoming' },
  {
    key: 'ended', ar: 'انتهت مؤخراً', en: 'Recently ended',
    match: (a) => ['completed', 'ended', 'reserve_not_met'].includes(a.status),
  },
];

/**
 * Read-only grouped list of the team's drops (Live / Upcoming / Recently
 * ended). Never writes to Firestore — it only reads `auctions` from context.
 * Relist hands the auction back to the builder via `onRelist` to prefill the
 * form; the reserve is intentionally NOT carried over (it lives in the
 * admin-only secrets doc and isn't readable here).
 */
export default function DropsListPanel({ onRelist }: { onRelist?: (a: AuctionItem) => void }) {
  const { auctions, language } = useApp();
  const isAr = language === 'ar';
  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});
  // Per-row transient feedback keyed by auction id (e.g. "✅ نُسخ").
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const flash = (id: string, msg: string) => {
    setRowMsg((prev) => ({ ...prev, [id]: msg }));
    window.setTimeout(() => setRowMsg((prev) => ({ ...prev, [id]: '' })), 2500);
  };

  const copyCaption = (a: AuctionItem) => {
    copy(buildAuctionCaption(captionInputFromAuction(a, window.location.origin)));
    flash(a.id, isAr ? '✅ نُسخ النص' : '✅ Caption copied');
  };
  const copyCover = async (a: AuctionItem) => {
    const ok = a.thumbnailUrl ? await copyImageToClipboard(a.thumbnailUrl) : false;
    flash(a.id, ok ? (isAr ? '✅ نُسخت الصورة' : '✅ Image copied') : (isAr ? 'تعذّر النسخ' : "Couldn't copy"));
  };

  const grouped = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: auctions.filter(g.match).slice(0, 15) })),
    [auctions],
  );

  return (
    <div className="space-y-4" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <h2 className="text-lg font-semibold">{isAr ? 'مزاداتك' : 'Your drops'}</h2>
      {grouped.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="text-xs font-bold text-neutral-400 uppercase">
            {isAr ? g.ar : g.en} ({g.items.length})
          </h3>
          {g.items.length === 0 && <p className="text-xs text-neutral-400">—</p>}
          {g.items.map((a) => (
            <div key={a.id} className="border rounded p-2 text-sm flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {a.auctionNumber ? `#${a.auctionNumber} · ` : ''}{a.title}
                </div>
                <div className="text-xs text-neutral-500">
                  {a.status}{a.status === 'reserve_not_met' ? (isAr ? ' (لم يصل الاحتياطي)' : ' (reserve not met)') : ''}
                  {rowMsg[a.id] ? <span className="ms-2 text-emerald-600">{rowMsg[a.id]}</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                <button className="border rounded px-2 py-1 text-xs"
                  onClick={() => copy(buildAuctionUrl(a.id, window.location.origin))}>
                  {isAr ? 'رابط' : 'Link'}
                </button>
                <button className="border rounded px-2 py-1 text-xs" onClick={() => copyCaption(a)}>
                  {isAr ? 'النص' : 'Caption'}
                </button>
                <button className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                  disabled={!a.thumbnailUrl} onClick={() => copyCover(a)}>
                  {isAr ? 'الصورة' : 'Image'}
                </button>
                {onRelist && ['reserve_not_met', 'ended'].includes(a.status) && (
                  <button className="border rounded px-2 py-1 text-xs" onClick={() => onRelist(a)}>
                    {isAr ? 'إعادة' : 'Relist'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
