import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useApp, useAuctions } from '../context/AppContext';
import { getLiveAuctions } from '../utils/auctionPhase';
import type { AuctionItem } from '../types';

/**
 * Real social proof from real data — never fabricated (spec §4).
 *
 * `liveBiddersNow` — derived from the auctions already loaded in AppContext
 * (zero extra Firestore reads, reactive to the live subscription):
 *   - `liveCount`: auctions genuinely live right now (status 'live' AND not
 *     past endTime — same dead-stream rule as auctionPhase).
 *   - `biddersNow`: the number of DISTINCT people currently leading a live
 *     auction (unique `currentBidderId`s across live auctions).
 *     Why this and not `totalBids`: totalBids counts *bids*, not people —
 *     one person tapping five times would read as "5 bidding now", which is
 *     inflated. Distinct current bidders is an exact, defensible claim
 *     ("N people are bidding right now" — each one placed a real bid on an
 *     auction that is still running), and a floor rather than an
 *     exaggeration. Honest beats impressive.
 *
 * `recentWins` — a one-time, cheap query of recently COMPLETED auctions.
 *   NOTE (deliberate deviation): the natural source is the `orders`
 *   collection, but firestore.rules restricts order reads to the buyer,
 *   seller, or an admin — a public "recent wins" query on orders would be
 *   permission-denied for exactly the new users this feature targets.
 *   Completed auctions are publicly readable (`allow read: if true`) and
 *   carry the same truth: item title + winner + end time. Each completed
 *   auction with a winner IS a real win (Cloud Functions mark ended auctions
 *   'completed'/'ended' and create the order from the same data). No city
 *   field exists on auctions or orders today, so `city` stays undefined.
 *   Winners are anonymized to first name only.
 */

export interface RecentWin {
  /** Auction/item title. */
  item: string;
  /** Winner's first name only (anonymized); null → caller says "someone". */
  winner: string | null;
  /** No city data exists in the schema yet — always undefined for now. */
  city?: string;
  /** Localized relative time ("قبل ٣ ساعات" / "3h ago"). */
  when: string;
  /** Raw timestamp the relative time was computed from. */
  whenTs: number;
}

export interface SocialProof {
  /** Auctions genuinely live right now. */
  liveCount: number;
  /** Distinct people currently leading a live auction (see doc above). */
  biddersNow: number;
  /** Up to 6 real recent wins, newest first. */
  recentWins: RecentWin[];
  /** True when there is at least one live signal or recent win to show. */
  hasProof: boolean;
}

// ---------------------------------------------------------------------------

/** Firestore timestamp | number | ISO string → millis (0 when unparseable). */
function toMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  const obj = val as { toDate?: () => Date; seconds?: number };
  if (typeof obj.toDate === 'function') return obj.toDate().getTime();
  if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  return 0;
}

export function formatRelativeTime(ts: number, isAr: boolean, now: number = Date.now()): string {
  const mins = Math.max(1, Math.round((now - ts) / 60000));
  if (mins < 60) return isAr ? `قبل ${mins} د` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return isAr ? `قبل ${hours} س` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return isAr ? `قبل ${days} يوم` : `${days}d ago`;
}

/** "Mohammad Al-Khatib" → "Mohammad" (anonymized first name). */
function firstNameOnly(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

// One fetch per session, shared across the three surfaces that mount the hook
// (banner, empty state, right rail) — keeps it cheap.
let recentWinsCache: Promise<Omit<RecentWin, 'when'>[]> | null = null;

function fetchRecentWins(): Promise<Omit<RecentWin, 'when'>[]> {
  if (!recentWinsCache) {
    // where-in + client-side sort avoids needing a composite index; capped
    // small so the read cost stays trivial.
    const q = query(
      collection(db, 'auctions'),
      where('status', 'in', ['completed', 'ended', 'closed']),
      limit(24)
    );
    recentWinsCache = getDocs(q)
      .then(snap => {
        const wins: (Omit<RecentWin, 'when'> & { whenTs: number })[] = [];
        snap.forEach(docSnap => {
          const data = docSnap.data();
          // Wave 3: simulated wins NEVER count as social proof — not even for
          // admins with the simulator on. This is a real-user trust surface
          // ("real social proof, never fabricated"), and this one-time query
          // bypasses the AppContext source filter, so it filters here itself.
          if (data.isSimulated === true) return;
          const title = typeof data.title === 'string' ? data.title.trim() : '';
          if (!title) return; // no title → skip gracefully
          if (!data.currentBidderId) return; // ended with no winner → not a win
          const whenTs = toMillis(data.endTime ?? data.endsAt);
          if (!whenTs || whenTs <= 0) return; // no timestamp → skip (avoids "~20000d ago")
          wins.push({
            item: title,
            winner: firstNameOnly(data.currentBidderName),
            city: undefined,
            whenTs,
          });
        });
        return wins.sort((a, b) => b.whenTs - a.whenTs).slice(0, 6);
      })
      .catch(err => {
        // Thin/absent data or a transient error must never break a surface —
        // callers fall back to qualitative trust chips.
        console.warn('useSocialProof: recent wins fetch failed:', err);
        recentWinsCache = null; // allow a retry on next mount
        return [];
      });
  }
  return recentWinsCache;
}

// ---------------------------------------------------------------------------

export function useSocialProof(): SocialProof {
  const { language } = useApp();
  const { auctions } = useAuctions();
  const isAr = language === 'ar';

  const [rawWins, setRawWins] = useState<Omit<RecentWin, 'when'>[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRecentWins().then(wins => {
      if (!cancelled) setRawWins(wins);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { liveCount, biddersNow } = useMemo(() => {
    // Context `auctions` is already source-filtered for non-admins (Wave 3),
    // but an admin with the simulator ON still receives simulated lots there —
    // social proof must stay honest even then, so exclude them unconditionally.
    const live = getLiveAuctions<AuctionItem>(
      (auctions ?? []).filter(a => a.isSimulated !== true)
    );
    const distinctBidders = new Set(
      live.map(a => a.currentBidderId).filter((id): id is string => !!id)
    );
    return { liveCount: live.length, biddersNow: distinctBidders.size };
  }, [auctions]);

  const recentWins = useMemo<RecentWin[]>(
    () => rawWins.map(w => ({ ...w, when: formatRelativeTime(w.whenTs, isAr) })),
    [rawWins, isAr]
  );

  return {
    liveCount,
    biddersNow,
    recentWins,
    hasProof: biddersNow > 0 || liveCount > 0 || recentWins.length > 0,
  };
}
