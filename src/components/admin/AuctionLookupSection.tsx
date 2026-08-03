import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { AuctionItem } from '../../types';
import { useAdminAuctionSearch } from '../../hooks/useAdminAuctionSearch';
import { buildAuctionUrl } from '../../utils/deepLink';

/**
 * Admin Auction Lookup (closed-auction admin search).
 *
 * An admin-only search over the SAME Algolia index the public Discover box uses,
 * but with NO status filter by default — so admins can find PAST auctions
 * (completed / ended / reserve_not_met), not just biddable ones. Lives inside the
 * already-admin-gated AdminDashboardView; it is never reachable outside admin.
 *
 * Until the backend sync indexes closed lots + the extra fields (auctionNumber,
 * currentBidderName, status, endTime), this only surfaces live/upcoming auctions —
 * which is fine: it lights up the moment the index + backfill land, with NO change
 * here. Every not-yet-indexed field is rendered defensively (missing → hidden).
 *
 * Purely presentational + the search hook; creates NO Firestore listeners and
 * writes nothing (the provider uses the public search-only key).
 */
export interface AuctionLookupSectionProps {
  isAr: boolean;
}

// The three status scopes the toggle offers. `null` = no facet = ALL statuses.
type Scope = 'all' | 'closed' | 'live';
const SCOPE_STATUSES: Record<Scope, string[] | null> = {
  all: null,
  closed: ['completed', 'ended', 'reserve_not_met'],
  live: ['live', 'upcoming'],
};
const SCOPE_META: Record<Scope, { ar: string; en: string }> = {
  all: { ar: 'الكل', en: 'All' },
  closed: { ar: 'المغلقة', en: 'Closed' },
  live: { ar: 'النشطة', en: 'Live' },
};

// Bilingual, color-coded status badge metadata. Defensive: an unknown/absent
// status falls back to a neutral chip rather than crashing or mislabelling.
const STATUS_META: Record<string, { ar: string; en: string; cls: string }> = {
  live: { ar: 'نشط', en: 'Live', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  upcoming: { ar: 'قادم', en: 'Upcoming', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed: { ar: 'مكتمل', en: 'Completed', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ended: { ar: 'منتهٍ', en: 'Ended', cls: 'bg-surface-sunken text-fg-muted border-line' },
  reserve_not_met: { ar: 'لم يبلغ الحد', en: 'Reserve not met', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  processing: { ar: 'قيد المراجعة', en: 'Processing', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected: { ar: 'مرفوض', en: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const StatusBadge: React.FC<{ status?: string; isAr: boolean }> = ({ status, isAr }) => {
  if (!status) return null;
  const meta = STATUS_META[status];
  const label = meta ? (isAr ? meta.ar : meta.en) : status;
  const cls = meta ? meta.cls : 'bg-surface-sunken text-fg-muted border-line';
  return (
    <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
};

const AuctionRow: React.FC<{ auction: AuctionItem; isAr: boolean }> = ({ auction, isAr }) => {
  const jod = isAr ? 'د.أ' : 'JOD';
  const price = typeof auction.currentPrice === 'number' ? auction.currentPrice : null;
  // auctionNumber / currentBidderName are absent until the backend indexes them.
  const hasNumber = typeof auction.auctionNumber === 'number';
  const winner = auction.currentBidderName && String(auction.currentBidderName).trim()
    ? String(auction.currentBidderName).trim()
    : null;
  const endMs = typeof auction.endTime === 'number' && auction.endTime > 0 ? auction.endTime : null;
  const endLabel = endMs
    ? new Date(endMs).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const href = auction.id ? buildAuctionUrl(auction.id, window.location.origin) : undefined;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-surface-raised border border-line rounded-2xl p-4 shadow-sm hover:border-line hover:shadow-md transition-all animate-fadeIn"
    >
      {/* Header: #number + title + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {hasNumber && (
              <span className="text-[11px] font-black text-[#E85D04] font-mono whitespace-nowrap">
                #{auction.auctionNumber}
              </span>
            )}
            <h4 className="font-extrabold text-sm text-fg leading-snug min-w-0 truncate">
              {auction.title || (isAr ? 'بدون عنوان' : 'Untitled')}
            </h4>
          </div>
        </div>
        <StatusBadge status={auction.status} isAr={isAr} />
      </div>

      {/* Price */}
      {price !== null && (
        <div className="mt-2">
          <span dir="ltr" className="font-black text-fg font-mono text-base">
            {price.toLocaleString('en-US')}
          </span>{' '}
          <span className="text-[11px] font-black text-[#FF8A3D]">{jod}</span>
        </div>
      )}

      {/* Parties + end date */}
      <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] font-bold">
        {auction.sellerName ? (
          <p className="text-fg-muted">
            {isAr ? 'البائع' : 'Seller'}:{' '}
            <span className="text-fg">{auction.sellerName}</span>
          </p>
        ) : null}
        {winner && (
          <p className="text-fg-muted">
            {isAr ? 'الفائز' : 'Winner'}:{' '}
            <span className="text-fg">{winner}</span>
          </p>
        )}
        {endLabel && (
          <p className="text-fg-muted">
            {isAr ? 'ينتهي' : 'Ends'}:{' '}
            <span className="text-fg-muted">{endLabel}</span>
          </p>
        )}
      </div>
    </a>
  );
};

export const AuctionLookupSection: React.FC<AuctionLookupSectionProps> = ({ isAr }) => {
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Scope>('all');

  const { results, nbHits, loading, loadingMore, error, hasMore, loadMore, active } =
    useAdminAuctionSearch(term, SCOPE_STATUSES[scope]);

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-4">
      {/* Header + search box + scope toggle */}
      <div className="bg-surface-raised p-5 rounded-3xl border border-line space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-black text-fg">
            {isAr ? 'بحث المزادات' : 'Auction Lookup'}
          </h3>
          <p className="text-xs text-fg-muted">
            {isAr
              ? 'ابحث في كل المزادات — بما فيها المغلقة والمنتهية — بالعنوان أو البائع أو رقم المزاد.'
              : 'Search every auction — including closed and ended — by item, seller, or auction number.'}
          </p>
        </div>

        {/* Search box */}
        <div className="relative">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted ${isAr ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={isAr ? 'ابحث عن سلعة أو بائع أو رقم مزاد…' : 'Search item, seller, or auction #…'}
            className={`w-full text-sm border border-line rounded-xl py-2.5 bg-surface-sunken focus:bg-surface-raised focus:outline-none focus:border-gray-400 transition-colors ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
          />
        </div>

        {/* Scope toggle: All / Closed / Live */}
        <div className="flex items-center gap-1.5">
          {(['all', 'closed', 'live'] as Scope[]).map((s) => {
            const isActive = scope === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-sunken bg-surface-sunken'
                }`}
              >
                {isAr ? SCOPE_META[s].ar : SCOPE_META[s].en}
              </button>
            );
          })}
          {active && !loading && !error && (
            <span className="ms-auto text-xs font-black text-fg-muted font-mono">
              {nbHits}
            </span>
          )}
        </div>
      </div>

      {/* Results / states */}
      {!active ? (
        <div className="bg-surface-raised border border-dashed border-line rounded-2xl p-8 text-center text-sm text-fg-muted font-bold">
          {isAr ? 'اكتب للبدء في البحث' : 'Type to start searching'}
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-sm text-rose-600 font-bold">
          {isAr ? 'تعذّر البحث مؤقتًا — أعد المحاولة.' : 'Search is temporarily unavailable — try again.'}
        </div>
      ) : loading ? (
        <div className="bg-surface-raised border border-line rounded-2xl p-8 text-center text-sm text-fg-muted font-bold">
          {isAr ? 'جاري البحث…' : 'Searching…'}
        </div>
      ) : results.length === 0 ? (
        <div className="bg-surface-raised border border-dashed border-line rounded-2xl p-8 text-center text-sm text-fg-muted font-bold">
          {isAr ? 'لا توجد مزادات مطابقة' : 'No auctions found'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {results.map((a) => (
            <AuctionRow key={a.id} auction={a} isAr={isAr} />
          ))}

          {hasMore && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={loadMore}
              className={`w-full py-3 rounded-2xl text-xs font-black transition-all ${
                loadingMore
                  ? 'bg-surface-sunken text-fg-muted cursor-wait'
                  : 'bg-surface-raised border border-line text-fg hover:border-line hover:bg-surface-sunken cursor-pointer'
              }`}
            >
              {loadingMore
                ? (isAr ? 'جاري التحميل…' : 'Loading…')
                : (isAr ? 'تحميل المزيد' : 'Load more')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AuctionLookupSection;
