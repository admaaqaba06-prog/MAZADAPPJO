import React, { useState, useRef } from 'react';
import { useCountdownSeconds, useIsOnScreen } from '../hooks/useCountdownSeconds';
import { useVisibleAuctionLive } from '../hooks/useVisibleAuctionLive';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useAlgoliaSearch } from '../hooks/useAlgoliaSearch';
import { mergeLiveIntoCard } from '../utils/discoverQuery';
import { useApp, useAuctions } from '../context/AppContext';
import { AuctionItem } from '../types';
import { translations } from '../utils/translations';
import { motion } from 'motion/react';
import { WinCelebration, useWinDetection, useToast } from './feedback';
import { getFirstLiveAuction, getLiveAuctions } from '../utils/auctionPhase';
import { unreadUserFacingCount } from '../utils/notifications';
import { isAdminUser } from '../utils/adminAuth';
import { useSocialProof } from '../hooks/useSocialProof';
import { formatAmmanClock } from '../utils/ammanTime';
import { 
  Flame, 
  Search, 
  Clock, 
  Plus, 
  Car,
  Laptop,
  Building2,
  Smartphone,
  Watch,
  LayoutGrid,
  Calendar,
  ArrowDown,
  Bookmark,
  Bell,
  ShieldCheck,
  Play,
  MessageCircle,
  Trophy,
  Coins
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { AuctionCardSkeleton } from './FeedbackStates';
import { SellerProfileModal } from './SellerProfileModal';

const WHATSAPP_URL = 'https://wa.me/962781444899';

interface PremiumAuctionCardProps {
  item: AuctionItem;
  currentUser: any;
  bids: any[] | null;
  orders: any[] | null;
  sellerProfiles: any[] | null;
  isAr: boolean;
  onJoinLive: (id: string) => void;
  onSelectLot: (id: string) => void;
  setGlobalSelectedOrderId: (id: string) => void;
  setActiveView: (view: string) => void;
  // Discover-pagination (Slice 1): opt this card into a per-card live-on-visible
  // subscription. Only the flag-gated paginated path passes `true`; the legacy
  // path leaves it undefined so the card behaves EXACTLY as before (the hook
  // below is still called unconditionally, but stays inert when disabled).
  liveEnabled?: boolean;
}

const PremiumAuctionCardBase: React.FC<PremiumAuctionCardProps> = ({
  item,
  currentUser,
  bids,
  orders,
  sellerProfiles,
  isAr,
  onJoinLive,
  onSelectLot,
  setGlobalSelectedOrderId,
  setActiveView,
  liveEnabled,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  // Perf Wave 3c (PF8): ONE shared 1s ticker for every card instead of a
  // per-card setInterval (~80 concurrent timers with a full grid). Only
  // ticks while the card is on/near screen (useIsOnScreen); returns null
  // when there's no endTime, in which case we preserve today's frozen
  // 120s placeholder display exactly as before (a separate correctness
  // fix, out of scope for this perf pass).
  const cardRef = useRef<HTMLDivElement>(null);
  const isOnScreen = useIsOnScreen(cardRef);
  // Live-on-visible (Slice 1): only the paginated path (`liveEnabled`) opts in;
  // the subscription is inert (no snapshot) when disabled or off-screen. `d` is
  // the card's DISPLAY item — the paginated snapshot with live fast-fields
  // (price/bids/bidder/status/endTime) overlaid while visible. When `liveEnabled`
  // is falsy, `d === item`, so the legacy path renders byte-identically to today.
  const live = useVisibleAuctionLive(item.id, isOnScreen && !!liveEnabled);
  const d = liveEnabled ? mergeLiveIntoCard(item, live) : item;
  const liveSecondsLeft = useCountdownSeconds(d.endTime, isOnScreen);
  const secondsLeft = liveSecondsLeft ?? 120;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const hasUserBid = bids ? bids.some(b => b.auctionId === item.id && b.bidderId === currentUser?.id) : false;
  const isUserWinner = hasUserBid && d.currentBidderId === currentUser?.id;
  const isCritical = secondsLeft < 60;

  const itemIsEnded = d.status === 'completed' || (d.endTime && d.endTime <= Date.now());

  const handleCardClick = () => {
    if (d.status === 'live') {
      onJoinLive(item.id);
    } else {
      onSelectLot(item.id);
    }
  };

  // Ended-winner: the one state that keeps a real (small) button — it routes
  // to the ORDER, a different destination than the card's own click.
  const isEndedWinner = !!(
    itemIsEnded &&
    currentUser?.id &&
    d.currentBidderId === currentUser.id &&
    bids?.some(b => b.auctionId === item.id && b.bidderId === currentUser.id)
  );

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      role="button"
      aria-label={item.title}
      className="group relative rounded-2xl overflow-hidden bg-zinc-900 shadow-xs hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1"
    >
      {/* Media-first: the image IS the card. Everything else is overlaid. */}
      <div className="aspect-[3/4] w-full relative">
        {/* Image shimmer skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 animate-pulse z-10" />
        )}

        <img
          src={item.thumbnailUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'}
          alt={item.title}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
            !imageLoaded ? 'opacity-0' : itemIsEnded ? 'opacity-60 grayscale-[35%]' : 'opacity-100'
          }`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
            setImageLoaded(true);
          }}
        />

        {/* Single scrim carries all card text — no boxed panels, no button wall */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        {/* Top-left: LIVE badge + (when relevant) your winning/outbid state */}
        <div className="absolute top-2.5 left-2.5 rtl:left-auto rtl:right-2.5 z-10 flex flex-col items-start gap-1.5">
          {d.status === 'live' && (
            <div className="bg-red-600 text-white font-extrabold px-2.5 py-1 rounded-full text-[9px] tracking-wide flex items-center gap-1 shadow-md">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
              <span>{isAr ? 'مباشر' : 'LIVE'}</span>
            </div>
          )}
          {!itemIsEnded && hasUserBid && (
            <div className={`px-2.5 py-1 rounded-full text-[9px] font-black shadow-md border backdrop-blur-xs ${
              isUserWinner
                ? 'bg-emerald-600/90 text-white border-emerald-500'
                : 'bg-rose-600/90 text-white border-rose-500'
            }`}>
              <span>{isUserWinner ? (isAr ? '💚 أنت الأعلى' : '💚 Winning') : (isAr ? '❤️ زايدوا عليك' : '❤️ Outbid')}</span>
            </div>
          )}
        </div>

        {/* Top-right: countdown (or ended flag) */}
        {itemIsEnded ? (
          <div className="absolute top-2.5 right-2.5 rtl:right-auto rtl:left-2.5 z-10 bg-zinc-800/85 text-zinc-300 px-2.5 py-1 rounded-full text-[9px] font-black shadow-md backdrop-blur-xs">
            🏁 {isAr ? 'انتهى' : 'ENDED'}
          </div>
        ) : (
          <div className={`absolute top-2.5 right-2.5 rtl:right-auto rtl:left-2.5 z-10 px-2.5 py-1 rounded-full text-[10px] font-mono font-black flex items-center gap-1 shadow-md border ${
            isCritical
              ? 'bg-red-600 text-white border-red-500 animate-pulse'
              : 'bg-black/75 text-white border-white/10 backdrop-blur-xs'
          }`}>
            <span>⏱️ {formatTime(secondsLeft)}</span>
          </div>
        )}

        {/* Bottom: title + price on the scrim — the merchandise stays the hero */}
        <div className="absolute inset-x-0 bottom-0 p-3 z-10 text-left rtl:text-right">
          <h3 className="font-extrabold text-sm text-white leading-snug line-clamp-1 drop-shadow-sm">
            {item.title}
          </h3>
          <div className="flex items-end justify-between gap-2 mt-1">
            <span className="text-lg font-black text-white leading-none flex items-baseline gap-1 drop-shadow-sm">
              {d.currentPrice.toLocaleString()}
              <span className="text-[11px] text-[#FF8A3D] font-black">{isAr ? 'د.أ' : 'JOD'}</span>
            </span>
            <span className="text-[10px] text-white/70 font-bold shrink-0">
              🔨 {d.totalBids || 0}
            </span>
          </div>
        </div>

        {/* Desktop hover affordance — the card is the button; this just says so */}
        {!itemIsEnded && (
          <div className="absolute inset-0 z-10 hidden lg:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="bg-[#E85D04]/95 backdrop-blur-xs text-white text-xs font-black px-4 py-2 rounded-full shadow-lg">
              {d.status === 'live' ? (isAr ? '🔴 دخول البث' : '🔴 Join live') : (isAr ? '⏱️ زايد الآن' : '⏱️ Bid now')}
            </span>
          </div>
        )}

        {/* Ended-winner: compact functional chip (routes to the order, not the lot) */}
        {isEndedWinner && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const matchingOrder = orders?.find(o => o.auctionId === item.id && o.buyerId === currentUser?.id);
              if (matchingOrder) {
                setGlobalSelectedOrderId(matchingOrder.id);
              }
              setActiveView('orders');
            }}
            className="absolute bottom-14 right-3 rtl:right-auto rtl:left-3 z-20 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            🎉 {isAr ? 'عرض الطلب' : 'View order'}
          </button>
        )}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------
   PERF (Wave 3a): memoize the card.

   Discover renders up to ~80 of these. Without memo, every one re-renders
   on ANY AppContext change (the provider value is a fresh object every
   render), even for cards whose auction/seller/user data didn't change and
   even off-screen ones.

   This comparator re-renders a card ONLY when a value it actually renders
   from changes. It deliberately IGNORES the unstable inline callback props
   (onJoinLive/onSelectLot/setGlobalSelectedOrderId/setActiveView): each one
   only closes over `item.id` (already a value-compared field below) and
   stable context setters, so the card never runs a stale handler.
   Return TRUE to SKIP re-render (props considered equal).
   ---------------------------------------------------------------------- */
const areCardPropsEqual = (
  prev: Readonly<PremiumAuctionCardProps>,
  next: Readonly<PremiumAuctionCardProps>
): boolean => {
  const a = prev.item;
  const b = next.item;
  // Auction fields the card actually renders (see the `item.*` reads above).
  if (
    a.id !== b.id ||
    a.currentPrice !== b.currentPrice ||
    a.endTime !== b.endTime ||
    a.status !== b.status ||
    a.currentBidderId !== b.currentBidderId ||
    a.totalBids !== b.totalBids ||
    a.title !== b.title ||
    a.description !== b.description ||
    a.thumbnailUrl !== b.thumbnailUrl ||
    a.sellerId !== b.sellerId ||
    a.sellerLogo !== b.sellerLogo ||
    a.sellerName !== b.sellerName
  ) {
    return false;
  }

  // bids/orders/sellerProfiles are plain useState arrays in AppContext —
  // their reference only changes when THAT collection's setter actually
  // runs (a new bid/order/profile snapshot), not on unrelated context
  // updates, so a reference check is correct here and avoids walking
  // potentially large arrays on every one of the ~80 cards.
  if (
    prev.bids !== next.bids ||
    prev.orders !== next.orders ||
    prev.sellerProfiles !== next.sellerProfiles
  ) {
    return false;
  }

  if (prev.isAr !== next.isAr) return false;

  // Only currentUser.id is read by the card (see hasUserBid/isUserWinner
  // above); compare that instead of object identity, which can churn on
  // unrelated profile-sync writes.
  const puId = prev.currentUser?.id ?? null;
  const nuId = next.currentUser?.id ?? null;
  if (puId !== nuId) return false;

  return true;
};

export const PremiumAuctionCard = React.memo(PremiumAuctionCardBase, areCardPropsEqual);

export const DiscoveryFeedView: React.FC = () => {
  const {
    setActiveAuctionId,
    setActiveView,
    language,
    setLanguage,
    currentUser,
    notifications,
    setShowNotifications,
    sellerProfiles,
    bids,
    orders,
    setGlobalSelectedOrderId,
    featureFlags
  } = useApp();
  const { auctions, auctionsLoaded } = useAuctions();

  // Discover-pagination (Slice 1) master switch. Default OFF in prod: when false,
  // EVERYTHING below renders exactly as today off the broad `useAuctions()` feed;
  // the paginated hook is still called (hooks must be unconditional) but stays
  // fully inert (no queries, no listener) because we pass `enabled = false`.
  const usePaginated = featureFlags.enablePaginatedDiscover;

  // Algolia-backed search (Slice 2), flag-gated. Default OFF ⇒ the hook is fully
  // inert (no debounce, no provider call) and the search box keeps driving
  // today's client-side `.includes` filter below — byte-identical to today.
  const algoliaEnabled = featureFlags.enableAlgoliaSearch;

  const { showToast } = useToast();
  // Real social proof (spec §4): live bidders from the loaded auctions +
  // recent wins from a one-time cached query. Never fabricated.
  const { biddersNow, recentWins } = useSocialProof();
  // Wave D: the mobile bell badge counts only bidder-relevant notifications
  // for regular users; strict admins keep the full stream (parity with the
  // NotificationCenter drawer + desktop bell).
  const isStrictAdminUser = isAdminUser(currentUser);
  const unreadCount = isStrictAdminUser
    ? (notifications || []).filter(n => !n.read).length
    : unreadUserFacingCount(notifications);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Skeletons only while genuinely waiting on the first auctions snapshot —
  // tab/category/search changes filter in-memory data and render instantly
  // (the old synthetic 550ms delay is gone).
  const isLoading = !auctionsLoaded;

  const t = translations[language];
  const isAr = language === 'ar';

  // Win celebration: fires only when a watched auction *transitions* to
  // 'completed' while this user is the highest bidder (per-id previous-status
  // ref inside the hook — never on mount into already-completed auctions).
  const { win, clearWin } = useWinDetection(auctions, currentUser?.id, currentUser?.email);
  const handleWinPay = () => {
    const wonAuctionId = win?.auctionId;
    clearWin();
    const matchingOrder = orders?.find(o => o.auctionId === wonAuctionId && o.buyerId === currentUser?.id);
    if (matchingOrder) {
      setGlobalSelectedOrderId(matchingOrder.id);
    }
    setActiveView('orders');
  };

  // `match` includes legacy AuctionItem.category values so existing lots keep filtering correctly.
  const categoriesList = React.useMemo(() => [
    { name: 'All', icon: <LayoutGrid className="w-3.5 h-3.5" />, arName: 'الكل', match: null as string[] | null },
    { name: 'Cars', icon: <Car className="w-3.5 h-3.5" />, arName: 'سيارات', match: ['Cars', 'Vehicles'] },
    { name: 'Real Estate', icon: <Building2 className="w-3.5 h-3.5" />, arName: 'عقارات', match: ['Real Estate'] },
    { name: 'Phones', icon: <Smartphone className="w-3.5 h-3.5" />, arName: 'هواتف', match: ['Phones', 'Electronics'] },
    { name: 'Watches', icon: <Watch className="w-3.5 h-3.5" />, arName: 'ساعات', match: ['Watches'] },
    { name: 'Electronics', icon: <Laptop className="w-3.5 h-3.5" />, arName: 'إلكترونيات', match: ['Electronics'] }
  ], []);

  // Sections, not tabs: live and upcoming are NOT equal modes — live is the
  // page, upcoming is anticipation content that should always be visible
  // below it (hiding it behind an unselected tab buried the FOMO driver).
  // One search+category pass, then split by status.
  const { liveAuctionsList, upcomingAuctionsList } = React.useMemo(() => {
    const matchesFilters = (item: AuctionItem) => {
      if (searchTerm) {
        const matchText = (item.title + item.description).toLowerCase();
        if (!matchText.includes(searchTerm.toLowerCase())) return false;
      }
      if (selectedCategory !== 'All') {
        const pill = categoriesList.find(c => c.name === selectedCategory);
        const matches = pill?.match || [selectedCategory];
        if (!matches.includes(item.category)) return false;
      }
      return true;
    };
    return {
      liveAuctionsList: auctions.filter(item =>
        item.status === 'live' &&
        !(item.endTime && item.endTime <= Date.now()) &&
        matchesFilters(item)
      ),
      upcomingAuctionsList: auctions.filter(item =>
        item.status === 'upcoming' && matchesFilters(item)
      ),
    };
  }, [auctions, searchTerm, selectedCategory, categoriesList]);

  // --- Discover-pagination (Slice 1), flag-gated ---------------------------
  // The paginated feed hook is ALWAYS called (React requires unconditional
  // hooks) but only fetches when `usePaginated` is true. Category chips drive
  // the SERVER re-query (`selectedCategory`); search still filters client-side
  // over the loaded page (Slice 2 swaps to Algolia).
  // Translate the selected chip into its CANONICAL stored category value(s)
  // (its `match` alias list) so the server query uses `where('category','in',…)`
  // — a raw chip name like `Cars`/`Phones` would never match the stored
  // `Vehicles`/`Electronics` values and return an empty feed. `All` → null (no
  // category clause). Reference is stable per chip (categoriesList is memoized).
  const categoryMatches = React.useMemo<string[] | null>(() => {
    if (selectedCategory === 'All') return null;
    const pill = categoriesList.find((c) => c.name === selectedCategory);
    return pill?.match ?? [selectedCategory];
  }, [selectedCategory, categoriesList]);

  const feed = useDiscoverFeed(categoryMatches, usePaginated);

  const paginatedLists = React.useMemo(() => {
    if (!usePaginated) return null;
    const matchesSearch = (item: AuctionItem) => {
      if (!searchTerm) return true;
      return (item.title + item.description).toLowerCase().includes(searchTerm.toLowerCase());
    };
    return {
      liveList: feed.liveItems.filter(matchesSearch),
      upcomingList: feed.upcomingItems.filter(matchesSearch),
    };
  }, [usePaginated, feed.liveItems, feed.upcomingItems, searchTerm]);

  // The lists + loading state the grid actually renders. OFF → the untouched
  // `useAuctions()`-derived memos (identical to today). ON → the paginated feed.
  const liveList = usePaginated ? (paginatedLists?.liveList ?? []) : liveAuctionsList;
  const upcomingList = usePaginated ? (paginatedLists?.upcomingList ?? []) : upcomingAuctionsList;
  const showSkeleton = usePaginated ? feed.loading : isLoading;

  // Algolia search results (Slice 2). Called unconditionally (hooks rule); stays
  // INERT while the flag is OFF or the box is empty (`searchMode.active` false ⇒
  // no provider call). When active, the category chips act as the facet filter
  // (`selectedCategory` is passed straight through). When inactive, the feed
  // below renders exactly today's path.
  const searchMode = useAlgoliaSearch(searchTerm, selectedCategory, algoliaEnabled);

  // Infinite-scroll sentinel for the paginated LIVE grid. When it scrolls into
  // view (with headroom) and more pages exist, pull the next page.
  const loadMoreSentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!usePaginated) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && feed.hasMoreLive && !feed.loadingMore) {
          feed.loadMore();
        }
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [usePaginated, feed.hasMoreLive, feed.loadingMore, feed.loadMore, liveList.length]);

  const formatItemTimeLeft = (item?: AuctionItem) => {
    if (!item) return '12:30';
    if (!item.endTime) return '12:30';
    const secondsLeft = Math.max(0, Math.floor((item.endTime - Date.now()) / 1000));
    if (secondsLeft <= 0) return '00:00';
    const mm = Math.floor(secondsLeft / 60);
    const ss = secondsLeft % 60;
    return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  };

  const renderCardCover = (item?: AuctionItem, fallbackIcon?: React.ReactNode, isPriority?: boolean) => {
    if (item && item.thumbnailUrl) {
      return (
        <>
          <img 
            src={item.thumbnailUrl} 
            alt={item.title} 
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            loading={isPriority ? "eager" : "lazy"}
            {...(isPriority ? { fetchPriority: "high" } : {})}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
        </>
      );
    } else if (item && item.videoUrl) {
      return (
        <>
          <video 
            src={item.videoUrl} 
            muted 
            playsInline 
            loop 
            preload="none"
            onMouseEnter={(e) => {
              e.currentTarget.play().catch(() => {});
            }}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
            }}
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
        </>
      );
    } else {
      return (
        <div className="transform group-hover:scale-105 duration-300 transition-transform z-10">
          {fallbackIcon}
        </div>
      );
    }
  };

  const handleJoinLive = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  // Genuinely live right now (status 'live' AND not past endTime) — drives the
  // live-now strip, the primary route into the bidding room from Discover.
  const liveNowAuctions = React.useMemo(
    () => getLiveAuctions<AuctionItem>(auctions),
    [auctions]
  );

  // Hottest live auction for the spotlight strip: the one with the most bids
  // (tie-break soonest-ending). Only "hot" when it actually has bids — otherwise
  // the strip falls back to the generic "Live now — N" count.
  const hottestAuction = React.useMemo(() => {
    if (liveNowAuctions.length === 0) return null;
    const top = [...liveNowAuctions].sort((a, b) => {
      const bd = (b.totalBids || 0) - (a.totalBids || 0);
      if (bd !== 0) return bd;
      return (a.endTime || 0) - (b.endTime || 0);
    })[0];
    return top && (top.totalBids || 0) > 0 ? top : null;
  }, [liveNowAuctions]);

  const watchAuction = (id: string) => { setActiveAuctionId(id); setActiveView('live'); };

  // Next scheduled drops (soonest first, unscheduled last) — previewed inline
  // in the empty state so a quiet feed still shows what's coming.
  const upcomingPreview = React.useMemo(() => {
    return auctions
      .filter(a => a.status === 'upcoming')
      .sort((a, b) => (a.scheduledStartAt ?? Infinity) - (b.scheduledStartAt ?? Infinity))
      .slice(0, 3);
  }, [auctions]);

  const formatUpcomingWhen = (item: AuctionItem) => {
    if (!item.scheduledStartAt) return isAr ? 'قريباً' : 'Soon';
    const weekday = new Date(item.scheduledStartAt).toLocaleDateString(isAr ? 'ar-JO' : 'en-GB', {
      weekday: 'short',
      timeZone: 'Asia/Amman',
    });
    return `${weekday} ${formatAmmanClock(item.scheduledStartAt)}`;
  };

  const isMember = currentUser?.subscriptionStatus === 'active';

  // Stagger only the first grid paint. Later mounts (filter/search changes)
  // get a plain quick fade — no cascade replay on every keystroke.
  const gridStaggerDone = React.useRef(false);
  React.useEffect(() => {
    if (!showSkeleton && (liveList.length > 0 || upcomingList.length > 0)) {
      gridStaggerDone.current = true;
    }
  }, [showSkeleton, liveList.length, upcomingList.length]);

  // Dead-stream guard: only enter the live room when an auction is genuinely
  // live. Otherwise stay on Discover and say so — never fall back to auctions[0].
  const handleWatchLive = () => {
    // Explicit type arg: useApp() is untyped here (circular import), so
    // inference would otherwise collapse to the helper's constraint.
    const firstLive = getFirstLiveAuction<AuctionItem>(auctions);
    if (firstLive) {
      setActiveAuctionId(firstLive.id);
      setActiveView('live');
    } else {
      showToast({
        type: 'info',
        title: isAr ? 'لا توجد مزادات مباشرة حالياً' : 'No live auctions right now',
        message: isAr ? 'تفقد المواعيد القادمة — البث يبدأ قريباً.' : 'Check the upcoming drops — the next stream starts soon.',
      });
    }
  };

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-[#F7F6F3] pb-[calc(6rem+env(safe-area-inset-bottom))] overscroll-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="discovery-feed-root"
    >
      
      {/* Desktop page header — title FIRST (conventional marketplace hierarchy:
          title, then sticky filters). display:none on mobile, so it doesn't
          affect the sticky wrapper being first-in-flow there. Scrolls away;
          only the filter row below pins. */}
      <div className="hidden lg:block mt-2 mb-3" id="discover-desktop-header">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {isAr ? 'اكتشف المزادات الحية والنشطة' : 'Discover Live Drops'}
        </h1>
        <p className="text-xs text-gray-500 font-medium mt-1">
          {isAr
            ? 'تصفح وشارك في مزادات فيديو حية. ادفع عبر كليك ومزاد بيحتفظ بمبلغك حتى تأكيد الاستلام.'
            : 'Browse and bid in real-time video drops. Pay via CliQ — Mazad holds your payment until you confirm receipt.'}
        </p>
      </div>

      {/* Sticky top zone: mobile bar (mobile only) + search/filters (all breakpoints).
          Grouped under ONE sticky wrapper so they stack as a unit on scroll —
          two independent `sticky top-0` siblings would overlap instead of stack.
          Translucent page-bg + blur so it reads as part of the page, not a
          detached white slab; hairline only on the bottom edge. */}
      <div className="sticky top-0 z-40 bg-[#F7F6F3]/90 backdrop-blur-md border-b border-gray-200/60" id="discover-sticky-header">
        {/* Top Mobile Bar Header - hidden on desktop (global header used instead) */}
        <div className="p-4 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2">
            {/* Orange Brand Square M logo */}
            <div className="w-9 h-9 rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base shadow-sm">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-950 font-sans">
                {isAr ? 'مزاد جو' : 'Mazad Jo'}
              </h1>
            </div>
          </div>

          {/* Action Header controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-[11px] font-bold text-gray-700 font-sans transition-all shrink-0"
              id="discover-lang-btn"
            >
              {language === 'en' ? 'العربية' : 'EN'}
            </button>

            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
              title={isAr ? 'الإشعارات' : 'Notifications'}
              id="mobile-header-bell"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E85D04] text-white text-[7.5px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveView('upload')}
              className="px-3 py-1.5 border border-[#E85D04] bg-[#E85D04]/5 hover:bg-[#E85D04]/10 rounded-xl text-[11px] font-bold text-[#E85D04] flex items-center gap-1 transition-all shrink-0"
              id="sell-wizard-btn"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
              <span>{isAr ? 'بيع' : 'Sell'}</span>
            </button>
          </div>
        </div>

        {/* Search + category pills. Mobile: stacked (search over pills), sticks
            together with the bar above via the shared wrapper. Desktop: ONE
            horizontal row (search grows, pills scroll inline) to cut vertical
            bulk — pins alone below the always-visible global header
            (DesktopFrame.tsx), which lives outside this scrollable component. */}
        <div className="px-4 lg:px-0 pt-3 pb-3 lg:py-2.5 space-y-3 lg:space-y-0 lg:flex lg:items-center lg:gap-3">
          <div className="relative lg:w-80 lg:shrink-0">
            <input
              type="text"
              placeholder={isAr ? 'ابحث: سيارات، ساعات، عقارات…' : 'Search: cars, watches, real estate…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full bg-white border border-gray-200/80 shadow-xs rounded-[18px] py-3 ${isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-xs font-medium text-gray-900 placeholder-gray-450 focus:outline-none focus:border-[#E85D04]/40 transition-all font-sans`}
            />
            <Search className={`absolute ${isAr ? 'right-4' : 'left-4'} top-3.5 w-4.5 h-4.5 text-gray-400`} />
          </div>

          {/* Elegant Horizontal Categories Carousel */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 lg:pb-0 lg:min-w-0 font-sans">
            {categoriesList.map(cat => {
              const isSelected = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-xs' : 'bg-white text-gray-700 border-gray-200/80 hover:bg-gray-50'}`}
                >
                  {cat.icon}
                  <span>{isAr ? cat.arName : cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live-now strip. When a live auction is genuinely HOT (has bids), the
          strip spotlights it (thumbnail · title · current bid) as a promo and
          taps straight into it. Otherwise it falls back to the generic count. */}
      {hottestAuction ? (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          onClick={() => watchAuction(hottestAuction.id)}
          className="mx-4 mt-3 mb-3 lg:mx-0 lg:mt-2 lg:mb-2 flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl p-1.5 pr-3 shadow-sm transition-all cursor-pointer active:scale-[0.99] text-left rtl:text-right"
          id="live-now-strip"
          style={{ direction: isAr ? 'rtl' : 'ltr' }}
        >
          <span className="w-11 h-11 rounded-lg overflow-hidden bg-black/20 shrink-0 border border-white/15">
            {(hottestAuction.thumbnailUrl || hottestAuction.mediaUrls?.[0] || hottestAuction.imageUrl) ? (
              <img src={hottestAuction.thumbnailUrl || hottestAuction.mediaUrls?.[0] || hottestAuction.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : null}
          </span>
          <span className="flex flex-col min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-100">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-80" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              🔥 {isAr ? 'الأكثر تفاعلاً الآن' : 'Hottest right now'}
            </span>
            <span className="text-xs font-bold truncate">{hottestAuction.title}</span>
            <span className="text-[11px] font-semibold text-emerald-50/90 tabular-nums">
              {isAr ? 'العطاء الحالي' : 'Current bid'} {(hottestAuction.currentPrice || 0).toLocaleString()} {isAr ? 'د.أ' : 'JOD'} · {hottestAuction.totalBids} {isAr ? 'مزايدة' : 'bids'}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1 transition-colors">
            <Play className="w-3 h-3 fill-white" />
            <span>{isAr ? 'مشاهدة' : 'Watch'}</span>
          </span>
        </motion.button>
      ) : liveNowAuctions.length > 0 ? (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          onClick={handleWatchLive}
          className="mx-4 mt-3 mb-3 lg:mx-0 lg:mt-2 lg:mb-2 flex items-center justify-between gap-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 shadow-sm transition-all cursor-pointer active:scale-[0.99]"
          id="live-now-strip"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="text-xs font-bold tracking-tight truncate">
              {isAr
                ? `مباشر الآن — ${liveNowAuctions.length} ${liveNowAuctions.length === 1 ? 'مزاد' : 'مزادات'}`
                : `Live now — ${liveNowAuctions.length} ${liveNowAuctions.length === 1 ? 'auction' : 'auctions'}`}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-0.5 transition-colors">
            <Play className="w-3 h-3 fill-white" />
            <span>{isAr ? 'مشاهدة' : 'Watch'}</span>
          </span>
        </motion.button>
      ) : null}

      {/* Hero Welcome Banner Card (Black Slate Vibe with Glow Accent) - Mobile only */}
      <div className="px-4 pb-2 lg:hidden">
        <div className="relative rounded-3xl bg-[#111111] p-5 overflow-hidden shadow-sm">
          {/* Circular subtle glowing background shape */}
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-orange-950/40 rounded-full blur-xl"></div>
          
          <div className="relative z-10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-[#E85D04] tracking-wider uppercase block">
                {isAr ? 'مزادات مباشرة' : 'LIVE AUCTIONS'}
              </span>
              <h2 className="text-xl font-black text-white leading-tight font-sans tracking-tight mt-1">
                {isAr ? 'زايد. اشترِ.' : 'Bid. Buy.'} <br/>
                {isAr ? 'بع — مباشر.' : 'Sell — Live.'}
              </h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 font-sans font-medium">
              {isAr ? 'مزادات فورية — مزاد يحتفظ بمبلغك حتى تستلم القطعة وتؤكّد.' : 'Real-time auctions — Mazad holds your payment until you confirm receipt.'}
            </p>

            {/* Real CTA: join (non-members) / browse (members) — the green
                live-now banner above is the sole "watch live" entry point. */}
            {!isMember ? (
              <button
                onClick={() => setActiveView('wallet')}
                className="mt-4 self-start px-4 py-2.5 bg-[#E85D04] hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-orange-900/30 active:scale-95 cursor-pointer"
                id="mobile-hero-join-cta"
              >
                {isAr ? 'انضم من ١ دينار' : 'Join from 1 JD'}
              </button>
            ) : (
              <button
                onClick={() => document.getElementById('discover-feed-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="mt-4 self-start px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                id="mobile-hero-browse-cta"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                {isAr ? 'تصفّح' : 'Browse'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Join Funnel Banner (Non-members only): 3-step money story + join CTA.
          Unrelated to the redesign — left in its normal place in the page flow. */}
      {currentUser?.subscriptionStatus !== 'active' && (
        <div className="p-4">
          <div
            className="bg-orange-50/70 border border-orange-100 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="join-funnel-banner"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-gray-800 leading-snug">
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">①</span>
                  {isAr ? 'انضم من ١ دينار بالشهر' : 'Join from 1 JD/mo'}
                </span>
                <span className="text-orange-200">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">②</span>
                  {isAr ? 'زايد مجاناً' : 'Bid freely'}
                </span>
                <span className="text-orange-200">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">③</span>
                  {isAr ? 'ادفع فقط عند الفوز (+٥٪ عمولة)' : 'Pay only when you win (+5% premium)'}
                </span>
              </div>
              {/* Live social proof — real count of distinct people currently
                  leading live auctions; rendered only when > 0. */}
              {biddersNow > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="text-[10.5px] font-extrabold text-red-600 leading-snug"
                  id="join-banner-live-proof"
                >
                  {isAr
                    ? (biddersNow === 1 ? '🔥 شخص واحد بيزايد الآن' : `🔥 ${biddersNow} أشخاص بيزايدوا الآن`)
                    : `🔥 ${biddersNow} bidding right now`}
                </motion.p>
              )}
            </div>
            <button
              onClick={() => setActiveView('wallet')}
              className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
            >
              {isAr ? 'انضم الآن — ١ د.أ' : 'Join now — 1 JD'}
            </button>
          </div>
        </div>
      )}

      {/* Won Orders Shortcut Banner / Widget */}
      {(() => {
        const wonOrdersAwaiting = orders?.filter(o => o.buyerId === currentUser?.id && o.status === 'waiting_payment') || [];
        if (wonOrdersAwaiting.length === 0) return null;

        return (
          <div className="mx-4 mb-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0 animate-bounce">🎉</div>
              <div className="text-right rtl:text-right">
                <h4 className="font-black text-xs text-white uppercase tracking-wide">
                  {isAr ? 'مبروك 🎉 ربحت المزاد!' : 'CONGRATULATIONS! YOU WON THE AUCTION!'}
                </h4>
                <p className="text-[11px] text-emerald-100 mt-0.5 leading-snug">
                  {isAr ? 'الطلب صار بانتظار الدفع أو التأكيد' : 'The order is pending payment/confirmation.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (wonOrdersAwaiting[0]) {
                  setGlobalSelectedOrderId(wonOrdersAwaiting[0].id);
                }
                setActiveView('orders');
              }}
              className="bg-white text-emerald-800 hover:bg-emerald-50 px-4 py-2 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all shrink-0"
            >
              {isAr ? 'عرض الطلب' : 'View Order'}
            </button>
          </div>
        );
      })()}

      {/* Live + Upcoming as stacked SECTIONS, not tabs. They are not equal
          modes — live is the page; upcoming is anticipation content that
          stays always-visible below it instead of hiding behind an
          unselected tab. */}
      {/* scroll-mt offsets the hero Browse CTA's scrollIntoView target below the
          pinned sticky header (bar+search+pills ≈ 190px mobile / single filter row ≈ 60px desktop). */}
      <div className="flex-grow px-4 pb-12 scroll-mt-48 lg:scroll-mt-24" id="discover-feed-grid">
        {searchMode.active ? (
          /* ---- Algolia search results (Slice 2, flag-gated) ----------------
             Replaces the live/upcoming feed sections while the search box is
             non-empty AND the flag is ON. Reuses the SAME PremiumAuctionCard
             with liveEnabled so each on-screen result gets the live-on-visible
             overlay (fresh price/bids). Category chips above act as the facet
             filter (passed to the hook as `selectedCategory`). */
          <div className="space-y-4" id="discover-search-results">
            {searchMode.loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6" id="discover-search-loading">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <AuctionCardSkeleton key={n} />
                ))}
              </div>
            ) : searchMode.results.length === 0 ? (
              <div className="min-h-[58vh] flex items-center justify-center">
                <div
                  className="w-full text-center py-16 px-6 bg-gradient-to-b from-white to-orange-50/30 border border-gray-200 rounded-2xl shadow-xs flex flex-col items-center justify-center space-y-3 max-w-lg mx-auto"
                  style={{ direction: isAr ? 'rtl' : 'ltr' }}
                  id="discover-search-empty"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">
                    <Search className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 tracking-tight">
                    {isAr
                      ? `لا نتائج لـ "${searchTerm.trim()}"`
                      : `No matches for "${searchTerm.trim()}"`}
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
                    {isAr
                      ? 'جرّب كلمة أبسط أو غيّر الفئة.'
                      : 'Try a simpler word or a different category.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider" id="discover-search-count">
                  {isAr
                    ? `${searchMode.nbHits} ${searchMode.nbHits === 1 ? 'نتيجة' : 'نتيجة'}`
                    : `${searchMode.nbHits} ${searchMode.nbHits === 1 ? 'result' : 'results'}`}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {searchMode.results.map((item) => (
                    <div key={item.id} className="h-full">
                      <PremiumAuctionCard
                        item={item}
                        currentUser={currentUser}
                        bids={bids}
                        orders={orders}
                        sellerProfiles={sellerProfiles}
                        isAr={isAr}
                        onJoinLive={handleJoinLive}
                        onSelectLot={setSelectedLotId}
                        setGlobalSelectedOrderId={setGlobalSelectedOrderId}
                        setActiveView={setActiveView}
                        liveEnabled={true}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : showSkeleton ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <AuctionCardSkeleton key={n} />
            ))}
          </div>
        ) : (liveList.length > 0 || upcomingList.length > 0 || (usePaginated && feed.hasMoreLive)) ? (
          <div className="space-y-10">
            {liveList.length > 0 && (
              <section id="live-now-section">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-[#E85D04] fill-[#E85D04] animate-pulse" />
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    {isAr ? 'مباشر الآن' : 'Live now'}
                  </h2>
                  <span className="text-[10px] font-mono font-black bg-red-600 text-white px-2 py-0.5 rounded-full">
                    {liveList.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {liveList.map((item, index) => (
                    <div
                      key={item.id}
                      className="feed-card-in h-full"
                      style={{
                        animationDelay: `${gridStaggerDone.current ? 0 : Math.min(index * 0.04, 0.32)}s`,
                      }}
                    >
                      <PremiumAuctionCard
                        item={item}
                        currentUser={currentUser}
                        bids={bids}
                        orders={orders}
                        sellerProfiles={sellerProfiles}
                        isAr={isAr}
                        onJoinLive={handleJoinLive}
                        onSelectLot={setSelectedLotId}
                        setGlobalSelectedOrderId={setGlobalSelectedOrderId}
                        setActiveView={setActiveView}
                        liveEnabled={usePaginated}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Infinite-scroll trigger (paginated path only). Mounts whenever
                more live pages exist — even if this filtered page rendered
                empty (e.g. a thin first page) — so the observer can still pull
                the next page instead of stranding hidden live inventory. */}
            {usePaginated && feed.hasMoreLive && (
              <div ref={loadMoreSentinelRef} className="h-8" aria-hidden="true" />
            )}
            {usePaginated && feed.loadingMore && (
              <div className="flex items-center justify-center py-4" id="discover-loading-more">
                <span className="w-5 h-5 rounded-full border-2 border-[#E85D04]/30 border-t-[#E85D04] animate-spin" />
              </div>
            )}

            {upcomingList.length > 0 && (
              <section id="upcoming-drops-section">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    {isAr ? 'مواعيد قادمة' : 'Upcoming drops'}
                  </h2>
                  <span className="text-[10px] font-mono font-black bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    {upcomingList.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {upcomingList.map((item, index) => (
                    <div
                      key={item.id}
                      className="feed-card-in h-full"
                      style={{
                        animationDelay: `${
                          gridStaggerDone.current
                            ? 0
                            : Math.min((liveList.length + index) * 0.04, 0.32)
                        }s`,
                      }}
                    >
                      <PremiumAuctionCard
                        item={item}
                        currentUser={currentUser}
                        bids={bids}
                        orders={orders}
                        sellerProfiles={sellerProfiles}
                        isAr={isAr}
                        onJoinLive={handleJoinLive}
                        onSelectLot={setSelectedLotId}
                        setGlobalSelectedOrderId={setGlobalSelectedOrderId}
                        setActiveView={setActiveView}
                        liveEnabled={usePaginated}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          /* Center the empty state in the available vertical space (drops it
             into the middle of the feed area instead of pinning it to the top). */
          <div className="min-h-[58vh] flex items-center justify-center">
          <div
            className="w-full text-center py-16 px-6 bg-gradient-to-b from-white to-orange-50/30 border border-gray-200 rounded-2xl shadow-xs flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="feedback-empty-state"
          >
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6B00] animate-bounce">
              <Flame className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                {isAr ? 'المزادات القوية جاية 🔥' : 'Strong auctions are coming 🔥'}
              </h3>
              {upcomingPreview.length === 0 && (
                <p className="text-xs text-gray-400 leading-relaxed">
                  {isAr
                    ? 'المزادات تُعلن يومياً — انضم اليوم وكن جاهزاً لأول مزاد.'
                    : 'Auctions are announced daily — join today and be ready for the next drop.'}
                </p>
              )}
            </div>

            {/* Next-drops inline preview: keeps the quiet feed on-platform */}
            {upcomingPreview.length > 0 && (
              <div className="w-full max-w-sm space-y-1.5" id="empty-state-upcoming-preview">
                <span className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                  {isAr ? 'المواعيد القادمة' : 'Next drops'}
                </span>
                {upcomingPreview.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedLotId(item.id)}
                    className="w-full flex items-center justify-between gap-2 bg-gray-50 hover:bg-orange-50/60 border border-gray-100 rounded-xl px-3 py-2 transition-colors cursor-pointer text-start"
                  >
                    <span className="text-xs font-bold text-gray-800 truncate">{item.title}</span>
                    <span className="text-[10px] font-mono font-bold text-[#FF6B00] shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatUpcomingWhen(item)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Social proof (real data only): recent wins strip when we have
                them — proves the room is real even when nothing's live.
                Otherwise 3 qualitative trust chips. Never fabricated. */}
            {recentWins.length > 0 ? (
              <div className="w-full max-w-sm space-y-1.5" id="empty-state-recent-wins">
                <span className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                  {isAr ? 'أحدث الفائزين' : 'Recent wins'}
                </span>
                {recentWins.slice(0, 3).map((w, i) => (
                  <motion.div
                    key={`${w.item}-${i}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut', delay: i * 0.05 }}
                    className="w-full flex items-center justify-between gap-2 bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2 text-start"
                  >
                    <span className="text-xs font-bold text-gray-800 truncate flex items-center gap-1.5 min-w-0">
                      <Trophy className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {isAr
                          ? `${w.winner ?? 'حدا'} ربح ${w.item} 🎉`
                          : `${w.winner ?? 'Someone'} won ${w.item} 🎉`}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-600 shrink-0">
                      {w.when}
                    </span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-1.5" id="empty-state-trust-chips">
                <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9.5px] font-bold px-2 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  {isAr ? 'كليك آمن' : 'Secure CliQ'}
                </span>
                <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9.5px] font-bold px-2 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  {isAr ? 'بائعون موثّقون' : 'Verified sellers'}
                </span>
                <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9.5px] font-bold px-2 py-1 rounded-full">
                  <Coins className="w-3 h-3" />
                  {isAr ? 'ادفع فقط عند الفوز' : 'Pay only if you win'}
                </span>
              </div>
            )}

            {/* Primary CTA: join (non-members) / notify me (members) — on-platform first */}
            {!isMember ? (
              <button
                onClick={() => setActiveView('wallet')}
                className="px-5 py-2.5 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
                id="empty-state-join-cta"
              >
                {isAr ? 'انضم الآن — من ١ دينار' : 'Join now — from 1 JD'}
              </button>
            ) : (
              <button
                onClick={() =>
                  showToast({
                    type: 'success',
                    title: isAr ? 'تابع قناتنا 🔔' : 'Follow our channel 🔔',
                    message: isAr
                      ? 'تابع قناتنا على واتساب ليوصلك كل مزاد جديد أول بأول.'
                      : "Follow our WhatsApp channel to catch every new drop first.",
                    // NOTE: in-app drop-follow alerts land in Wave D; until then we point to the channel.
                  })
                }
                className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                id="empty-state-notify-cta"
              >
                <Bell className="w-3.5 h-3.5" />
                {isAr ? 'ذكّرني بأول مزاد' : 'Notify me of the next drop'}
              </button>
            )}

            {/* WhatsApp demoted to a secondary text link */}
            <button
              onClick={() => window.open(WHATSAPP_URL, '_blank', 'noopener,noreferrer')}
              className="text-[11px] font-semibold text-gray-400 hover:text-emerald-600 underline underline-offset-2 decoration-gray-200 hover:decoration-emerald-400 transition-colors cursor-pointer flex items-center gap-1"
              id="empty-state-whatsapp-link"
            >
              <MessageCircle className="w-3 h-3" />
              {isAr ? 'أو تابع قناتنا' : 'or follow our channel'}
            </button>
          </div>
          </div>
        )}
      </div>

      {/* Render specification details slide modal */}
      {selectedLotId && (
        <AuctionDetailsModal 
          auctionId={selectedLotId} 
          onClose={() => setSelectedLotId(null)} 
        />
      )}

      {/* Render Seller complete profile modal */}
      {selectedProfileId && (
        <SellerProfileModal
          sellerId={selectedProfileId}
          isOpen={true}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

      {/* New-drops pill (paginated path only): a single fresh-live lot arrived
          after the loaded page. Tapping refreshes page 1 (which clears it).
          Fixed + centered below the sticky header; bilingual/RTL. Smooth
          ease-out entrance (no bouncy spring, per motion preference). */}
      {usePaginated && feed.newDropsAvailable && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={() => feed.refresh()}
          className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+7.5rem)] lg:top-24 z-50 flex items-center gap-1.5 bg-[#E85D04] hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-2 rounded-full shadow-lg shadow-orange-900/25 active:scale-95 transition-colors cursor-pointer"
          id="discover-new-drops-pill"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>{isAr ? 'دفعات جديدة' : 'New drops'}</span>
        </motion.button>
      )}

      {/* Win celebration — always mounted; bursts on the win transition */}
      <WinCelebration
        show={win !== null}
        auctionTitle={win?.auctionTitle ?? ''}
        totalDue={win?.totalDue ?? 0}
        isAr={isAr}
        onPay={handleWinPay}
        onClose={clearWin}
      />
    </div>
  );
};
