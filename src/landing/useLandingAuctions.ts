import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { isLiveNow } from '../utils/auctionPhase';
import type { AuctionItem } from '../types';

export interface LandingAuction {
  id: string;
  title: string;
  category: AuctionItem['category'];
  currentPrice: number;
  totalBids: number;
  endTime: number;
  imageUrl: string;
  isFeatured: boolean;
  isVerified: boolean;
}

export interface LandingAuctionsState {
  auctions: LandingAuction[];
  isLoading: boolean;
  isEmpty: boolean;
  isError: boolean;
}

const DISPLAY_CAP = 8;

export function mapToLandingAuction(a: AuctionItem): LandingAuction {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    currentPrice: a.currentPrice,
    totalBids: a.totalBids,
    endTime: a.endTime,
    imageUrl: a.thumbnailUrl || a.mediaUrls?.[0] || '',
    isFeatured: a.isFeatured === true,
    isVerified: a.approvalStatus === 'approved',
  };
}

// Pure curation: live, non-simulated, titled auctions, ordered featured-first
// then soonest-ending, capped. Unit-tested; the hook wrapper is not.
export function curateLandingAuctions(
  auctions: AuctionItem[],
  now: number = Date.now(),
  cap: number = DISPLAY_CAP
): LandingAuction[] {
  return auctions
    .filter(a => a.isSimulated !== true && !!a.title && typeof a.endTime === 'number' && a.endTime > now && isLiveNow(a, now))
    .sort((x, y) => {
      if (x.isFeatured !== y.isFeatured) return x.isFeatured ? -1 : 1;
      return x.endTime - y.endTime;
    })
    .slice(0, cap)
    .map(mapToLandingAuction);
}

// One fetch per session, mirroring useSocialProof's module-level cache.
let landingAuctionsCache: Promise<AuctionItem[]> | null = null;

function fetchLandingAuctions(): Promise<AuctionItem[]> {
  if (landingAuctionsCache) return landingAuctionsCache;
  landingAuctionsCache = getDocs(
    query(
      collection(db, 'auctions'),
      where('status', '==', 'live'),
      limit(24)
    )
  )
    .then(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuctionItem, 'id'>) })))
    .catch(err => { console.warn('[landing] failed to load live auctions', err); landingAuctionsCache = null; throw err; });
  return landingAuctionsCache;
}

export function useLandingAuctions(): LandingAuctionsState {
  const [auctions, setAuctions] = useState<LandingAuction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLandingAuctions()
      .then(raw => {
        if (!active) return;
        setAuctions(curateLandingAuctions(raw));
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsError(true);
        setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  return { auctions, isLoading, isEmpty: !isLoading && !isError && auctions.length === 0, isError };
}
