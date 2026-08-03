/**
 * Featured lots — admin merchandising for the Discover feed.
 *
 * Pin up to FEATURED_CAP live lots and drag them into an order. A pinned lot
 * floats to the head of whichever feed section it already appears in
 * (`LIVE NOW` for a clock-running lot, `Be the first` for one awaiting its first
 * bid) — there is no separate "Featured" section on /discover, deliberately:
 * 147 of the live lots are `first_bid` and never render in LIVE NOW at all, so a
 * single featured strip would have missed almost everything worth pinning.
 *
 * The pin PICKER is a search box, not a browse list, because the admin auctions
 * subscription is capped at limit(100) against 241 production auctions
 * (AppContext) — browsing cannot reach most of the inventory, searching can.
 * `useAdminAuctionSearch` creates no Firestore listeners and writes nothing.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Star, Search, X, GripVertical, Loader2, AlertTriangle } from 'lucide-react';
import { Reorder } from 'motion/react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AuctionItem } from '../../types';
import { FEATURED_CAP, canPin, pin, unpin, reorder } from '../../utils/featuredRank';
import { commitFeaturedOrder } from '../../services/featuredService';
import { useAdminAuctionSearch } from '../../hooks/useAdminAuctionSearch';
import { db } from '../../services/firebase';

export interface FeaturedSectionProps {
  isAr: boolean;
}

/** The few fields a featured row renders. Read straight off the doc. */
interface FeaturedRow {
  id: string;
  title: string;
  thumbnailUrl: string;
  status: string;
  featuredRank: number;
}

// Only a LIVE lot can be featured: the feed query filters status == 'live', so
// pinning anything else writes a rank that can never render. Enforced here so
// the picker cannot offer an un-featurable lot in the first place.
function isPinnable(a: AuctionItem): boolean {
  return a?.status === 'live';
}

const FeaturedSection: React.FC<FeaturedSectionProps> = ({ isAr }) => {
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [featured, setFeatured] = useState<FeaturedRow[]>([]);
  // Holds the dragged order for the moment between drop and the subscription
  // catching up, so a row does not snap back mid-write.
  const [pending, setPending] = useState<string[] | null>(null);

  // Its OWN subscription, deliberately not the `auctions` array the rest of the
  // dashboard uses: that one is capped at limit(100) against 241 production
  // auctions, so a lot pinned via search from outside the newest-100 window
  // would be invisible here — the counter would under-report, the cap could be
  // exceeded, and two lots would end up claiming the same rank.
  //
  // NO status filter: a lot that ended while pinned must still be listed, or
  // there is no way to unpin it. Ordering by a single field needs only the
  // automatic index, so this adds no composite index.
  useEffect(() => {
    const q = query(
      collection(db, 'auctions'),
      where('featuredRank', '>', 0),
      orderBy('featuredRank', 'asc'),
      limit(FEATURED_CAP * 2),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: FeaturedRow[] = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            title: x.title || '',
            thumbnailUrl: x.thumbnailUrl || x.imageUrl || '',
            status: x.status || '',
            featuredRank: x.featuredRank,
          };
        });
        setFeatured(rows);
      },
      (e) => setError(e.message),
    );
    return unsub;
  }, []);

  const currentIds = useMemo(() => featured.map((a) => a.id), [featured]);
  const shown = pending ?? currentIds;
  const byId = useMemo(() => {
    const m: Record<string, FeaturedRow> = {};
    for (const a of featured) m[a.id] = a;
    return m;
  }, [featured]);

  const sameOrder = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  const applyOrder = async (nextIds: string[]) => {
    // Nothing to write. Reached when `reorder` rejected a stale drag, or when a
    // pin was refused at the cap — both would otherwise rewrite every rank to
    // the value it already holds.
    if (sameOrder(currentIds, nextIds)) {
      setPending(null);
      return;
    }
    setError(null);
    setPending(nextIds);
    setSaving(true);
    try {
      await commitFeaturedOrder(db, currentIds, nextIds);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      // Clearing `pending` hands the order back to the subscription: on success
      // it already matches, on failure it reverts to what is actually stored.
      setPending(null);
      setSaving(false);
    }
  };

  const onReorder = (nextIds: string[]) => {
    // `reorder` rejects anything that is not a permutation of the current set —
    // a drag racing an unpin in another tab must not write a stale order.
    const next = reorder(currentIds, nextIds);
    setPending(next);
    void applyOrder(next);
  };

  const atCap = !canPin(currentIds);

  // Search, NOT a filter over `auctions`: that array is the admin subscription,
  // capped at limit(100) against 241 production auctions, so most inventory is
  // simply not in it. `null` statuses = the admin default (all), then filtered
  // client-side — searchMap guarantees every hit carries a status, so this does
  // not depend on how Algolia facets are configured.
  const search = useAdminAuctionSearch(term, null);
  const pinnedSet = new Set(currentIds);
  const searchResults = search.results
    .filter((a) => isPinnable(a) && !pinnedSet.has(a.id))
    .slice(0, 8);

  return (
    <div className="bg-surface-raised p-4 md:p-5 rounded-3xl border border-line space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
        <h3 className="text-[13px] font-black text-fg">
          {isAr ? 'المزادات المميزة' : 'Featured lots'}
        </h3>
        <span className="text-[10px] font-mono font-black bg-amber-400 text-zinc-900 px-2 py-0.5 rounded-full">
          {currentIds.length}/{FEATURED_CAP}
        </span>
        {saving && <Loader2 className="w-3.5 h-3.5 text-fg-muted animate-spin" />}
      </div>

      <p className="text-[11px] text-fg-muted font-medium leading-relaxed">
        {isAr
          ? 'المزاد المميز يظهر أول قسمه في صفحة الاستكشاف. اسحب لإعادة الترتيب.'
          : 'A featured lot leads its section on Discover. Drag to reorder.'}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-2.5 text-[11px] font-semibold">
          {error}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-line rounded-2xl text-fg-muted text-[11px] font-semibold">
          {isAr ? 'لا توجد مزادات مميزة بعد.' : 'Nothing featured yet.'}
        </div>
      ) : (
        /* No scroll container here on purpose: DesktopFrame is overflow-hidden and
           a nested scroller is what breaks touch drag. The list is capped at 6. */
        <Reorder.Group axis="y" values={shown} onReorder={onReorder} className="space-y-2">
          {shown.map((id) => {
            const lot = byId[id];
            if (!lot) return null;
            return (
              <Reorder.Item
                key={id}
                value={id}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-2.5 bg-surface-raised border border-line rounded-xl p-2.5 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4 text-gray-300 shrink-0" aria-hidden="true" />
                <img
                  src={lot.thumbnailUrl}
                  alt={lot.title}
                  className="w-9 h-9 rounded-lg object-cover border border-line shrink-0"
                />
                <span className="flex-1 min-w-0 truncate text-[12px] font-extrabold text-fg" title={lot.title}>
                  {lot.title}
                </span>
                {/* A pin outlives nothing quietly: the feed filters status ==
                    'live', so a lot that ended while pinned simply stops
                    appearing. Flag it here so it can be cleared deliberately
                    rather than sitting in the list looking active. */}
                {lot.status !== 'live' && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md"
                    title={isAr ? 'لم يعد مباشراً — لا يظهر في الاستكشاف' : 'No longer live — not shown on Discover'}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {lot.status || (isAr ? 'غير معروف' : 'unknown')}
                  </span>
                )}
                <button
                  onClick={() => void applyOrder(unpin(currentIds, id))}
                  disabled={saving}
                  className="shrink-0 p-1.5 rounded-lg text-fg-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={isAr ? 'إزالة من المميزة' : 'Unpin'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}

      <div className="pt-3 border-t border-line space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-fg-muted absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            disabled={atCap}
            placeholder={
              atCap
                ? isAr
                  ? `وصلت الحد: ${FEATURED_CAP} مزادات`
                  : `Cap reached — ${FEATURED_CAP} lots`
                : isAr
                  ? 'ابحث عن مزاد لتمييزه…'
                  : 'Search a live lot to feature…'
            }
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-line text-[12px] font-semibold outline-none focus:border-amber-400 disabled:bg-surface-sunken disabled:text-fg-muted"
          />
        </div>

        {!atCap && search.active && search.loading && (
          <div className="text-[11px] text-fg-muted font-semibold px-1">
            {isAr ? 'جاري البحث…' : 'Searching…'}
          </div>
        )}

        {!atCap && search.active && !search.loading && search.error && (
          <div className="text-[11px] text-red-600 font-semibold px-1">
            {isAr ? 'تعذّر البحث. حاول مرة أخرى.' : 'Search is unavailable. Try again.'}
          </div>
        )}

        {!atCap && search.active && !search.loading && !search.error && searchResults.length === 0 && (
          <div className="text-[11px] text-fg-muted font-semibold px-1">
            {isAr ? 'لا توجد مزادات مباشرة مطابقة.' : 'No live lots match.'}
          </div>
        )}

        {!atCap && searchResults.length > 0 && (
          <div className="border border-line rounded-xl divide-y divide-line overflow-hidden">
            {searchResults.map((lot) => (
              <div key={lot.id} className="flex items-center gap-2.5 p-2.5">
                <img
                  src={lot.thumbnailUrl}
                  alt={lot.title}
                  className="w-8 h-8 rounded-lg object-cover border border-line shrink-0"
                />
                <span className="flex-1 min-w-0 truncate text-[11.5px] font-bold text-fg" title={lot.title}>
                  {lot.title}
                </span>
                <button
                  onClick={() => {
                    setTerm('');
                    void applyOrder(pin(currentIds, lot.id));
                  }}
                  disabled={saving}
                  className="shrink-0 text-[11px] font-black text-[#E85D04] hover:text-[#c94d03] px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAr ? 'تمييز' : 'Pin'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeaturedSection;
