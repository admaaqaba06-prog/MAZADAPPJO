import React, { useState, useRef } from 'react';
import { useCountdownSeconds, useIsOnScreen } from '../hooks/useCountdownSeconds';
import { useVisibleAuctionLive } from '../hooks/useVisibleAuctionLive';
import { useMyAuctionLots } from '../hooks/useMyAuctionLots';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useAlgoliaSearch } from '../hooks/useAlgoliaSearch';
import { mergeLiveIntoCard } from '../utils/discoverQuery';
import { useApp } from '../context/AppContext';
import { AuctionItem } from '../types';
import { translations } from '../utils/translations';
import { motion, AnimatePresence } from 'motion/react';
import { WinCelebration, useWinDetection, useToast } from './feedback';
import { getFirstLiveAuction, getLiveAuctions, isAwaitingFirstBid } from '../utils/auctionPhase';
import { unreadUserFacingCount } from '../utils/notifications';
import { isAdminUser } from '../utils/adminAuth';
import { useSocialProof } from '../hooks/useSocialProof';
import { formatAmmanClock } from '../utils/ammanTime';
import { CATEGORIES, matchValues } from '../utils/categories';
import { auctionTimeStatus, startsInLabel } from '../utils/auctionTimeStatus';
import { 
  Flame, 
  Search, 
  Clock, 
  Plus, 
  Car,
  Laptop,
  Package,
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
  Coins,
  Refrigerator,
  Sofa,
  Zap,
  Heart,
  Gavel,
  ArrowRight
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { AuctionCardSkeleton } from './FeedbackStates';
import { SellerProfileModal } from './SellerProfileModal';
import { matchesAuctionSearch } from '../utils/auctionSearch';
import { formatCountdown } from '../utils/bidFormat';
import AuctionRulesModal from './AuctionRulesModal';
import ListingImage from './ui/ListingImage';
import { cleanTitle } from '../utils/listingTitle';
import { BrandMark } from './BrandMark';
import { SUPPORT_WHATSAPP_URL } from '../constants/support';
import { isActiveMember } from '../utils/membership';
import { serverNow } from '../utils/serverTime';

const WHATSAPP_URL = SUPPORT_WHATSAPP_URL;

/**
 * Chip icon per canonical category value. Presentation only — it lives here
 * rather than in `utils/categories.ts` so that module stays a pure data table
 * the node test environment and the backfill script can both import without
 * pulling in React or lucide.
 *
 * A category with no entry falls back to the generic package icon, so adding a
 * category to the taxonomy can never render a chip with a missing icon.
 */
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Vehicles': <Car className="w-4 h-4" />,
  'Phones': <Smartphone className="w-4 h-4" />,
  'Electronics': <Laptop className="w-4 h-4" />,
  'Watches': <Watch className="w-4 h-4" />,
  'Appliances': <Refrigerator className="w-4 h-4" />,
  'Home & Furniture': <Sofa className="w-4 h-4" />,
  'Real Estate': <Building2 className="w-4 h-4" />,
  'Fashion': <Package className="w-4 h-4" />,
};

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
  /**
   * Watchlist state, passed IN rather than read from context.
   *
   * The card is memoised precisely because a context read re-renders every
   * one of the ~80 cards on any AppContext change. useApp() in here would
   * undo that for the whole grid, so the parent — which already re-renders
   * when the watchlist changes — resolves the boolean per card and
   * areCardPropsEqual compares it.
   */
  isWatched: boolean;
  onToggleWatch: (id: string) => void;
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
  isWatched,
  onToggleWatch,
}) => {
  // Seeded true for a lot with no image. The shimmer below is gated on this
  // flag, and ListingImage's placeholder branch renders no <img> — so a lot
  // with no thumbnail would sit under a shimmer that never resolves, which is
  // exactly the lots this change is about.
  const [imageLoaded, setImageLoaded] = useState(() => !item.thumbnailUrl);
  // Perf Wave 3c (PF8): ONE shared 1s ticker for every card instead of a
  // per-card setInterval (~80 concurrent timers with a full grid). Only
  // ticks while the card is on/near screen (useIsOnScreen); returns null when
  // there's no endTime. A clockless lot therefore never shows a fabricated
  // countdown: an awaiting-first-bid lot is caught earlier by the `⏳ Awaiting
  // first bid` badge (which pre-empts the countdown badge entirely), and any
  // other null case falls through to the countdown badge, which renders `—`.
  const cardRef = useRef<HTMLDivElement>(null);
  const isOnScreen = useIsOnScreen(cardRef);
  // Live-on-visible (Slice 1): only the paginated path (`liveEnabled`) opts in;
  // the subscription is inert (no snapshot) when disabled or off-screen. `d` is
  // the card's DISPLAY item — the paginated snapshot with live fast-fields
  // (price/bids/bidder/status/endTime) overlaid while visible. When `liveEnabled`
  // is falsy, `d === item`, so the legacy path renders byte-identically to today.
  const live = useVisibleAuctionLive(item.id, isOnScreen && !!liveEnabled);
  const d = liveEnabled ? mergeLiveIntoCard(item, live) : item;
  // `null` when there's no real endTime/seconds-left — the card renders "—"
  // rather than a fabricated placeholder countdown.
  const secondsLeft = useCountdownSeconds(d.endTime, isOnScreen);

  const hasUserBid = bids ? bids.some(b => b.auctionId === item.id && b.bidderId === currentUser?.id) : false;
  const isUserWinner = hasUserBid && d.currentBidderId === currentUser?.id;
  const isCritical = secondsLeft !== null && secondsLeft < 60;

  const itemIsEnded = d.status === 'completed' || (d.endTime && d.endTime <= Date.now());
  const awaitingFirstBid = isAwaitingFirstBid(d);

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
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line/70 bg-surface-raised shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] cursor-pointer"
    >
      {/* MEDIA. Was "the image IS the card, everything else is overlaid": title
          and price sat on a black gradient over the photo, which made every card
          read dark and busy and put text on top of the merchandise. The image
          now owns only the top of the card and the words live below it on a plain
          surface, so the photo is never obscured and the text never depends on
          what colour the photo happens to be underneath.

          object-contain on a neutral panel, not cover: sellers upload whatever
          aspect they have, and cropping a watch to fill a square hides the
          strap. Letterboxing on surface-sunken shows the whole product. Square,
          so a two-column grid keeps one rhythm. */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-surface-sunken">
        {/* The shimmer sits BEHIND the photo, not over it.
            It used to be `z-10` — above the image — while the image itself was
            held at `opacity-0` until `onLoad` fired. That made a decorative
            animation the gate on whether the product was visible at all, and
            when the callback was missed (see ListingImage: a cached image never
            re-fires `load`) the card rendered as a black square. Measured on
            production: eight of eight thumbnails fully loaded and invisible.
            Now the photo is always opaque and paints over this as soon as it
            has pixels; the shimmer only fills the gap underneath. A failure of
            the load callback can no longer hide inventory. */}
        {!imageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-surface-sunken" />
        )}

        <ListingImage
          src={item.thumbnailUrl}
          alt={item.title}
          isAr={isAr}
          className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
            itemIsEnded ? 'opacity-60 grayscale-[35%]' : 'opacity-100'
          }`}
          imgClassName="object-contain p-2"
          onLoad={() => setImageLoaded(true)}
        />

        {/* Leading corner: the lot's ONE state. Mutually exclusive by
            construction — ended, or live-awaiting-first-bid, or live-with-a-clock
            — so this corner never stacks. */}
        <div className="absolute top-2 right-2 rtl:right-auto rtl:left-2 z-20">
          {itemIsEnded ? (
            <span className="flex items-center gap-1 rounded-full bg-surface-raised/95 px-2 py-1 text-[9px] font-extrabold text-fg-muted shadow-xs backdrop-blur-xs">
              {isAr ? 'انتهى' : 'ENDED'}
            </span>
          ) : awaitingFirstBid ? (
            <span className="flex items-center gap-1 rounded-full bg-[#FF6B00] px-2 py-1 text-[9px] font-extrabold text-white shadow-xs">
              <Zap className="h-2.5 w-2.5 fill-white" />
              {isAr ? 'كن أول مزايد' : 'BE FIRST'}
            </span>
          ) : d.status === 'live' ? (
            <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[9px] font-extrabold text-white shadow-xs">
              {/* on-accent, not surface-raised: this dot sits on a FILLED red
                  badge, so it must be light in BOTH themes. The previous
                  bg-surface-raised rendered it near-black on red in dark. */}
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-accent" />
              {isAr ? 'مباشر' : 'LIVE'}
            </span>
          ) : null}
        </div>

        {/* Watchlist. Wired to the REAL watchlist in AppContext (persisted to
            localStorage), passed in as a prop rather than read from context so
            the card stays memoised — a context read here would re-render all
            ~80 cards on every unrelated context change, which is the whole
            reason areCardPropsEqual exists. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatch(item.id);
          }}
          aria-pressed={isWatched}
          aria-label={
            isWatched
              ? (isAr ? 'إزالة من المفضلة' : 'Remove from watchlist')
              : (isAr ? 'إضافة إلى المفضلة' : 'Add to watchlist')
          }
          className="absolute top-2 left-2 rtl:left-auto rtl:right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised/90 shadow-xs backdrop-blur-xs transition-transform active:scale-90 cursor-pointer"
        >
          <Heart
            className={`h-[15px] w-[15px] ${isWatched ? 'fill-[#FF6B00] text-[#FF6B00]' : 'text-fg-muted'}`}
          />
        </button>

        {/* Your standing in this lot. On the image rather than in the body
            because it is state, not product data, and it must not push the
            price row around when it appears mid-auction. */}
        {!itemIsEnded && hasUserBid && (
          <span
            className={`absolute bottom-2 left-2 rtl:left-auto rtl:right-2 z-20 rounded-full px-2 py-0.5 text-[9px] font-extrabold text-white shadow-xs ${
              isUserWinner ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {isUserWinner ? (isAr ? 'أنت الأعلى' : 'Winning') : (isAr ? 'زايدوا عليك' : 'Outbid')}
          </span>
        )}
      </div>

      {/* BODY. Fixed spacing rhythm; mt-auto on the price pins it to the bottom
          so cards in a row end on the same line even when one title wraps to two
          lines and another does not. */}
      <div className="flex flex-1 flex-col gap-2 p-3 text-left rtl:text-right">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg">
          {cleanTitle(item.title)}
        </h3>

        {/* Metadata: the countdown moved off the image and down here, next to
            the bid count, so the two facts a bidder compares sit together. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-fg-muted">
          {!itemIsEnded && !awaitingFirstBid && (
            <span className={`flex items-center gap-1 ${isCritical ? 'font-bold text-danger' : ''}`}>
              <Clock className="h-3 w-3 shrink-0" />
              {secondsLeft === null ? '—' : formatCountdown(secondsLeft, isAr)}
            </span>
          )}
          {/* A lot awaiting its first bid has NO countdown to show, and this
              slot used to render nothing at all — so the card showed a price,
              «0 مزايدة», and a conspicuous hole where every other lot shows
              time. With the whole catalogue currently at zero bids, a visitor
              arriving from an ad meets a grid of clockless items and reads it
              as broken or abandoned. The explanation belongs in the slot where
              the absence is felt, not in a paragraph elsewhere on the page. */}
          {!itemIsEnded && awaitingFirstBid && (
            <span className="flex items-center gap-1 font-semibold text-fg">
              <Clock className="h-3 w-3 shrink-0" />
              {isAr ? 'العدّاد بيبدأ مع أول مزايدة' : 'Timer starts at first bid'}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Gavel className="h-3 w-3 shrink-0" />
            {d.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}
          </span>
        </div>

        <div className="mt-auto flex items-baseline gap-1">
          <span className="text-lg font-bold leading-none text-fg">
            {d.currentPrice.toLocaleString()}
          </span>
          <span className="text-[11px] font-bold text-[#FF6B00]">
            {isAr ? 'د.أ' : 'JOD'}
          </span>
        </div>

        {/* Ended-winner: routes to the ORDER, a different destination from the
            card's own click, so it stays a real button. */}
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
            className="w-full rounded-xl bg-emerald-600 py-1.5 text-[10px] font-extrabold text-white transition-transform active:scale-95 hover:bg-emerald-700 cursor-pointer"
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
   only closes over item.id (already a value-compared field below) and
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

  // The heart. Without this the card skips the re-render and the icon does
  // not fill until something unrelated invalidates the card — the tap looks
  // dead.
  if (prev.isWatched !== next.isWatched) return false;

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
    watchlist,
    toggleWatchlist,
    language,
    setLanguage,
    currentUser,
    notifications,
    setShowNotifications,
    sellerProfiles,
    bids,
    orders,
    setGlobalSelectedOrderId,
    featureFlags,
    isAuthenticated,
    isGuest,
    requestSignIn
  } = useApp();
  // Discover is now ALWAYS the paginated feed (`useDiscoverFeed`) — the broad
  // `useAuctions()` array + its `enablePaginatedDiscover` OFF fallback were
  // removed (1b Task 5b) so realtime read-cost scales with attention, not
  // inventory. Live/upcoming lists, the live-now strip and the empty-state
  // preview all source off the paginated feed below.

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
  const [rulesOpen, setRulesOpen] = useState(false); // E4 — Auction Rules modal

  const t = translations[language];
  const isAr = language === 'ar';

  // Win celebration: fires only when a watched auction *transitions* to
  // 'completed' while this user is the highest bidder (per-id previous-status
  // ref inside the hook — never on mount into already-completed auctions).
  // Slice 1b Task 2: fed the SCOPED per-user `myWinLots` (not the broad
  // `auctions` array, which drops a won lot as `removed` before any `completed`
  // snapshot). The broad array is fully removed in Task 5b — the feed grid now
  // sources exclusively off `useDiscoverFeed`.
  const myWinLots = useMyAuctionLots(currentUser?.id);
  const { win, clearWin } = useWinDetection(myWinLots, currentUser?.id, currentUser?.email);
  const handleWinPay = () => {
    const wonAuctionId = win?.auctionId;
    clearWin();
    const matchingOrder = orders?.find(o => o.auctionId === wonAuctionId && o.buyerId === currentUser?.id);
    if (matchingOrder) {
      setGlobalSelectedOrderId(matchingOrder.id);
    }
    setActiveView('orders');
  };

  // Generated from the one taxonomy (utils/categories.ts) rather than a literal
  // list, because a hand-maintained copy is exactly how the chips came to
  // disagree with the seller picker: a seller-listed watch stored 'Luxury',
  // which no chip matched, so it was unfindable under every filter but 'All'.
  // `matchValues` supplies each chip's legacy aliases, so existing lots keep
  // filtering correctly whether or not the backfill has run.
  const categoriesList = React.useMemo(() => [
    { name: 'All', icon: <LayoutGrid className="w-4 h-4" />, arName: 'الكل', match: null as string[] | null },
    // Special filter: live 'first_bid' lots awaiting their first bid (see feedMode).
    // `match: null` — the hook switches to a dedicated query, so no category clause.
    { name: 'Be the First', icon: <Zap className="w-4 h-4" />, arName: 'كن أول مزايد', match: null },
    ...CATEGORIES.map(c => ({
      name: c.labelEn,
      icon: CATEGORY_ICONS[c.value] ?? <Package className="w-4 h-4" />,
      arName: c.labelAr,
      match: matchValues(c.value) as string[] | null,
    })),
  ], []);

  // --- Discover-pagination (Slice 1), the sole feed path -------------------
  // Category chips drive the SERVER re-query (`selectedCategory`); search still
  // filters client-side over the loaded page (Slice 2 swaps to Algolia).
  // Translate the selected chip into its CANONICAL stored category value(s)
  // (its `match` alias list) so the server query uses `where('category','in',…)`
  // — a raw chip name like `Cars`/`Phones` would never match the stored
  // `Vehicles`/`Electronics` values and return an empty feed. `All` → null (no
  // category clause). Reference is stable per chip (categoriesList is memoized).
  const categoryMatches = React.useMemo<string[] | null>(() => {
    if (selectedCategory === 'All') return null;
    const pill = categoriesList.find((c) => c.name === selectedCategory);
    // A chip may declare `match: null` DELIBERATELY ('Be the First') meaning
    // "no category clause". `??` would collapse that to `['Be the First']` — a
    // category value nothing is stored under. Only a chip with no entry at all
    // falls back to its own name.
    if (!pill) return [selectedCategory];
    return pill.match;
  }, [selectedCategory, categoriesList]);

  // "Be the First" is a special chip: it switches the hook to a dedicated query
  // for live first_bid lots awaiting their first bid (categoryMatches ignored).
  const feedMode: 'default' | 'first_bid' =
    selectedCategory === 'Be the First' ? 'first_bid' : 'default';

  const feed = useDiscoverFeed(categoryMatches, true, feedMode);

  const paginatedLists = React.useMemo(() => {
    // Covers the auction NUMBER as well as title/description — "#2002" and
    // "2002" both land on that lot. See utils/auctionSearch.
    const matchesSearch = (item: AuctionItem) => matchesAuctionSearch(item, searchTerm);
    return {
      liveList: feed.liveItems.filter(matchesSearch),
      firstBidList: feed.firstBidItems.filter(matchesSearch),
      upcomingList: feed.upcomingItems.filter(matchesSearch),
    };
  }, [feed.liveItems, feed.firstBidItems, feed.upcomingItems, searchTerm]);

  // The lists + loading state the grid actually renders — the paginated feed is
  // now the only source (category chips drive the server re-query; search
  // filters the loaded page).
  const liveList = paginatedLists.liveList;
  const upcomingList = paginatedLists.upcomingList;
  const firstBidList = paginatedLists.firstBidList;
  const showSkeleton = feed.loading;

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
    // Both grid lengths are here as the "grid grew, re-observe" trigger: in
    // first_bid mode liveList.length is permanently 0, so on its own it is a
    // dead signal for the mode that carries all the inventory.
  }, [feed.hasMoreLive, feed.loadingMore, feed.loadMore, liveList.length, firstBidList.length]);

  // Infinite-scroll sentinel for the Algolia SEARCH results (Slice 2). Same
  // IntersectionObserver pattern as the paginated feed above: when the sentinel
  // scrolls into view (with headroom) and more pages of results exist, append
  // the next page so every one of `nbHits` results is reachable.
  const searchLoadMoreSentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!searchMode.active) return;
    const el = searchLoadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && searchMode.hasMore && !searchMode.loadingMore) {
          searchMode.loadMore();
        }
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [searchMode.active, searchMode.hasMore, searchMode.loadingMore, searchMode.loadMore, searchMode.results.length]);

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

  /**
   * Saving is a MEMBER action, not a guest one.
   *
   * guestGate.ts states the rule outright — for a logged-out visitor "every
   * ACTION (bid, chat, save, sell, account surfaces) is the signup moment" —
   * and signInIntent already ships copy for it: «سجّل دخولك لحفظ القطعة /
   * بتلاقيها بالمحفوظات بعد الدخول». Letting a guest toggle the heart wrote to
   * localStorage under a promise the app could not keep: 'watchlist' is not a
   * guest-allowed view, so they could never open the list they had just added
   * to. Gate it here, once, rather than teaching the card about auth.
   */
  const handleToggleWatch = (id: string) => {
    if (isGuest) {
      requestSignIn('save');
      return;
    }
    toggleWatchlist(id);
  };

  const handleJoinLive = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  // Genuinely live right now (status 'live' AND not past endTime) — drives the
  // live-now strip, the primary route into the bidding room from Discover.
  // Sourced off the paginated feed's live page (1b Task 5b): the broad
  // `useAuctions()` array is gone, so this now reflects the currently-loaded
  // live lots (category-scoped when a chip is active — the 'All' chip is the
  // unfiltered set). `getLiveAuctions` re-applies the dead-stream guard.
  const liveNowAuctions = React.useMemo(
    () => getLiveAuctions<AuctionItem>(feed.liveItems),
    [feed.liveItems]
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
    return feed.upcomingItems
      .filter(a => a.status === 'upcoming')
      .sort((a, b) => (a.scheduledStartAt ?? Infinity) - (b.scheduledStartAt ?? Infinity))
      .slice(0, 3);
  }, [feed.upcomingItems]);

  const formatUpcomingWhen = (item: AuctionItem) => {
    // Relative, not absolute. This rendered "Tue 20:00" — a clock reading the
    // viewer has to convert into "how long do I have", and one that says
    // nothing at all if today is Tuesday. The desktop live layout already said
    // "Starts in"; the two surfaces now answer the same question the same way.
    const { msUntilStart } = auctionTimeStatus(item, Date.now());
    const relative = startsInLabel(msUntilStart, isAr);
    if (!item.scheduledStartAt) return relative;
    // The exact clock time is kept alongside it — a relative label alone is
    // hard to plan around for a drop several days out.
    return `${relative} · ${formatAmmanClock(item.scheduledStartAt)}`;
  };

  const isMember = isActiveMember(currentUser, serverNow());

  // Stagger only the first grid paint. Later mounts (filter/search changes)
  // get a plain quick fade — no cascade replay on every keystroke.
  const gridStaggerDone = React.useRef(false);
  React.useEffect(() => {
    // firstBidList MUST be in this condition: on the "Be the First" chip
    // useDiscoverFeed deliberately leaves liveList/upcomingList empty, so
    // without it the flag could never latch there and every repaint (e.g. a
    // search keystroke re-filtering the grid) would replay the cascade.
    if (!showSkeleton && (liveList.length > 0 || firstBidList.length > 0 || upcomingList.length > 0)) {
      gridStaggerDone.current = true;
    }
  }, [showSkeleton, liveList.length, firstBidList.length, upcomingList.length]);

  // Dead-stream guard: only enter the live room when an auction is genuinely
  // live. Otherwise stay on Discover and say so — never fall back to auctions[0].
  const handleWatchLive = () => {
    // Explicit type arg: useApp() is untyped here (circular import), so
    // inference would otherwise collapse to the helper's constraint.
    const firstLive = getFirstLiveAuction<AuctionItem>(feed.liveItems);
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
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] overscroll-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="discovery-feed-root"
    >
      
      {/* Desktop page header — title FIRST (conventional marketplace hierarchy:
          title, then sticky filters). display:none on mobile, so it doesn't
          affect the sticky wrapper being first-in-flow there. Scrolls away;
          only the filter row below pins. */}
      <div className="hidden lg:block mt-2 mb-3" id="discover-desktop-header">
        <h1 className="text-2xl font-black text-fg tracking-tight">
          {isAr ? 'اكتشف المزادات الحية والنشطة' : 'Discover Live Drops'}
        </h1>
        <p className="text-xs text-fg-muted font-medium mt-1">
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
      <div className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-line/60" id="discover-sticky-header">
        {/* Top Mobile Bar Header - hidden on desktop (global header used instead)
            The controls share ONE visual system: identical 44px square touch
            target — the WCAG 2.5.5 / iOS HIG minimum, which the old 28px-tall
            buttons missed — same radius, same hairline, same hover. They used to
            be three different sizes and two different border colours.

            The `بيع +` button is GONE from here. The bottom nav's centre FAB is
            the primary Sell action, and two entry points to one route in a single
            mobile viewport is duplicated weight, not extra affordance. The FAB
            keeps the guest `requestSignIn('sell')` intent, so nothing regresses
            for a logged-out seller — signInIntent.wiring.test.ts asserts it. */}
        <div className="px-4 py-3 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2.5">
            <BrandMark className="w-9 h-9" />
            <h1 className="text-[17px] font-bold tracking-tight text-fg font-sans">
              {isAr ? 'مزادو' : 'Mazzado'}
            </h1>
          </div>

          {/* Action Header controls */}
          <div className="flex items-center gap-2">
            {/* Saved. THE guest-reachable route to the watchlist, and the reason
                it has to live here: the hearts on these cards work logged OUT
                (the list is localStorage), but the only other entry point is in
                ProfileView, which a guest cannot open — tapping Profile asks
                them to sign in. So a guest could save lots and never see them,
                which is the same closed-drawer problem the watchlist screen was
                built to fix, just narrower.

                It also fills the third header control the brief asked for. That
                slot was meant to be a Menu button; there is still no menu in this
                app, and this is a real destination rather than a stub. */}
            <button
              onClick={() => (isGuest ? requestSignIn('save') : setActiveView('watchlist'))}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line/70 bg-surface-raised text-fg-muted shadow-xs transition-colors hover:bg-surface-sunken cursor-pointer"
              title={isAr ? 'المفضلة' : 'Saved'}
              aria-label={isAr ? 'المفضلة' : 'Saved'}
              id="discover-saved-btn"
            >
              <Heart className={`w-[18px] h-[18px] ${watchlist.length > 0 ? 'fill-[#FF6B00] text-[#FF6B00]' : ''}`} />
              {watchlist.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[8px] font-black text-white">
                  {watchlist.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowNotifications(true)}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line/70 bg-surface-raised text-fg-muted shadow-xs transition-colors hover:bg-surface-sunken cursor-pointer"
              title={isAr ? 'الإشعارات' : 'Notifications'}
              aria-label={isAr ? 'الإشعارات' : 'Notifications'}
              id="mobile-header-bell"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[8px] font-black text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-2xl border border-line/70 bg-surface-raised px-3 text-xs font-bold text-fg shadow-xs transition-colors hover:bg-surface-sunken font-sans cursor-pointer"
              aria-label={isAr ? 'تغيير اللغة' : 'Change language'}
              id="discover-lang-btn"
            >
              {language === 'en' ? 'ع' : 'EN'}
            </button>
          </div>
        </div>

        {/* Search + category pills. Mobile: stacked (search over pills), sticks
            together with the bar above via the shared wrapper. Desktop: ONE
            horizontal row (search grows, pills scroll inline) to cut vertical
            bulk — pins alone below the always-visible global header
            (DesktopFrame.tsx), which lives outside this scrollable component. */}
        <div className="px-4 lg:px-0 pt-3 pb-3 lg:py-2.5 space-y-3 lg:space-y-0 lg:flex lg:items-center lg:gap-3">
          {/* Search. 56px tall with a 20px radius on mobile — the old 42px box
              read as a form field on a settings page rather than the primary way
              into the catalogue. `lg:h-11` keeps the desktop row compact, since
              search and the categories share one line there.

              The magnifier follows DIRECTION, not a fixed side: it belongs on
              the side the caret starts from, which is the right in Arabic. */}
          <div className="relative lg:w-80 lg:shrink-0">
            <input
              type="text"
              placeholder={
                isAr
                  ? 'ابحث عن سيارات، ساعات، عقارات والمزيد…'
                  : 'Search cars, watches, real estate and more…'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`h-14 lg:h-11 w-full rounded-[20px] lg:rounded-2xl border border-line/70 bg-surface-raised ${
                isAr ? 'pr-12 pl-4' : 'pl-12 pr-4'
              } text-sm font-medium text-fg shadow-xs transition-colors placeholder:text-fg-muted/60 focus:border-[#FF6B00]/50 focus:outline-none font-sans`}
            />
            <Search
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-fg-muted/70 ${
                isAr ? 'right-4' : 'left-4'
              }`}
            />
          </div>

          {/* Categories. Compact CARDS rather than auto-width pills: one fixed
              height and a min-width, so the row keeps a single rhythm instead of
              every chip being as wide as its label happens to be. Horizontal
              scroll is already how this copes with more categories than fit. */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5 lg:pb-0 lg:min-w-0 font-sans">
            {categoriesList.map(cat => {
              const isSelected = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  aria-pressed={isSelected}
                  className={`flex h-11 min-w-[84px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#FF6B00] bg-[#FF6B00] text-white'
                      : 'border-line/70 bg-surface-raised text-fg shadow-xs hover:bg-surface-sunken'
                  }`}
                >
                  {cat.icon}
                  <span className="whitespace-nowrap">{isAr ? cat.arName : cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* New-drops pill (paginated path only): a fresh live lot arrived after the
          loaded page. Tapping refreshes page 1, which clears it.

          IN NORMAL FLOW, directly under the sticky header — deliberately. It was
          `fixed` with a guessed offset (top-[calc(env(safe-area-inset-top)+7.5rem)]),
          which lands on top of the category chips at viewport heights the guess
          did not anticipate. A pill covering the filters is worse than one that
          pushes the grid down ~40px, and no fixed offset is right for every
          screen. Reserving no space WAS the bug, so it now reserves space.

          AnimatePresence + height so it collapses out rather than vanishing. */}
      <AnimatePresence>
        {feed.newDropsAvailable && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden flex justify-center"
          >
            <button
              type="button"
              onClick={() => feed.refresh()}
              className="my-2 flex items-center gap-1.5 bg-[#E85D04] hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-2 rounded-full shadow-lg shadow-orange-900/25 active:scale-95 transition-colors cursor-pointer"
              id="discover-new-drops-pill"
            >
              <ArrowDown className="w-4 h-4" />
              <span>{isAr ? 'دفعات جديدة' : 'New drops'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live-now strip. When a live auction is genuinely HOT (has bids), the
          strip spotlights it (thumbnail · title · current bid) as a promo and
          taps straight into it. Otherwise it falls back to the generic count. */}
      {hottestAuction ? (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          onClick={() => watchAuction(hottestAuction.id)}
          className="mx-4 mt-3 mb-3 lg:mx-0 lg:mt-2 lg:mb-2 flex items-center gap-3 bg-[#FF6B00] hover:bg-[#e66000] text-white rounded-xl p-1.5 pr-3 shadow-sm transition-all cursor-pointer active:scale-[0.99] text-left rtl:text-right"
          id="live-now-strip"
          style={{ direction: isAr ? 'rtl' : 'ltr' }}
        >
          <span className="w-11 h-11 rounded-lg overflow-hidden bg-black/20 shrink-0 border border-white/15">
            {(hottestAuction.thumbnailUrl || hottestAuction.mediaUrls?.[0] || hottestAuction.imageUrl) ? (
              <img src={hottestAuction.thumbnailUrl || hottestAuction.mediaUrls?.[0] || hottestAuction.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : null}
          </span>
          <span className="flex flex-col min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-orange-100">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-200 opacity-80" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-surface-raised" />
              </span>
              🔥 {isAr ? 'الأكثر تفاعلاً الآن' : 'Hottest right now'}
            </span>
            <span className="text-xs font-bold truncate">{hottestAuction.title}</span>
            <span className="text-[11px] font-semibold text-orange-50/90 tabular-nums">
              {isAr ? 'العطاء الحالي' : 'Current bid'} {(hottestAuction.currentPrice || 0).toLocaleString()} {isAr ? 'د.أ' : 'JOD'} · {hottestAuction.totalBids} {isAr ? 'مزايدة' : 'bids'}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold shrink-0 bg-surface-raised/20 hover:bg-surface-raised/30 rounded-lg px-2.5 py-1 transition-colors">
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
          className="mx-4 mt-3 mb-3 lg:mx-0 lg:mt-2 lg:mb-2 flex items-center justify-between gap-3 bg-[#FF6B00] hover:bg-[#e66000] text-white rounded-xl px-4 py-2 shadow-sm transition-all cursor-pointer active:scale-[0.99]"
          id="live-now-strip"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-200 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-surface-raised"></span>
            </span>
            <span className="text-xs font-bold tracking-tight truncate">
              {isAr
                ? `مباشر الآن — ${liveNowAuctions.length} ${liveNowAuctions.length === 1 ? 'مزاد' : 'مزادات'}`
                : `Live now — ${liveNowAuctions.length} ${liveNowAuctions.length === 1 ? 'auction' : 'auctions'}`}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold shrink-0 bg-surface-raised/20 hover:bg-surface-raised/30 rounded-lg px-2.5 py-0.5 transition-colors">
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
            <p className="text-[11px] text-fg-muted mt-2 font-sans font-medium">
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
                className="mt-4 self-start px-4 py-2.5 bg-surface-raised/10 hover:bg-surface-raised/15 border border-white/15 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                id="mobile-hero-browse-cta"
              >
                <ArrowDown className="w-4 h-4" />
                {isAr ? 'تصفّح' : 'Browse'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Join Funnel Banner (Non-members only): 3-step money story + join CTA.
          Unrelated to the redesign — left in its normal place in the page flow. */}
      {!isMember && (
        <div className="p-4">
          <div
            className="bg-accent-weak/70 border border-orange-100 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="join-funnel-banner"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-fg leading-snug">
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
              <div className="w-10 h-10 rounded-full bg-surface-raised/20 flex items-center justify-center text-xl shrink-0 animate-bounce">🎉</div>
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
              className="bg-surface-raised text-emerald-800 hover:bg-emerald-50 px-4 py-2 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all shrink-0"
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
            ) : searchMode.error ? (
              /* Distinct from "no matches": a real search outage. The provider
                 re-throws and the hook catches it into `error`, so we can tell
                 an outage apart from a legitimate empty result set. Calm + on
                 brand; bilingual/RTL. */
              <div className="min-h-[58vh] flex items-center justify-center">
                <div
                  className="w-full text-center py-16 px-6 bg-gradient-to-b from-[var(--color-surface-raised)] to-orange-50/30 border border-line rounded-2xl shadow-xs flex flex-col items-center justify-center space-y-3 max-w-lg mx-auto"
                  style={{ direction: isAr ? 'rtl' : 'ltr' }}
                  id="discover-search-error"
                >
                  <div className="w-12 h-12 rounded-2xl bg-surface-sunken border border-line flex items-center justify-center text-fg-muted">
                    <Search className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <h3 className="text-sm font-black text-fg tracking-tight">
                    {isAr ? 'البحث غير متاح مؤقتاً' : 'Search is temporarily unavailable'}
                  </h3>
                  <p className="text-xs text-fg-muted leading-relaxed max-w-sm">
                    {isAr
                      ? 'صار خلل بسيط بالبحث. جرّب مرة ثانية بعد لحظات.'
                      : 'Something went wrong with search. Please try again in a moment.'}
                  </p>
                </div>
              </div>
            ) : searchMode.results.length === 0 ? (
              <div className="min-h-[58vh] flex items-center justify-center">
                <div
                  className="w-full text-center py-16 px-6 bg-gradient-to-b from-[var(--color-surface-raised)] to-orange-50/30 border border-line rounded-2xl shadow-xs flex flex-col items-center justify-center space-y-3 max-w-lg mx-auto"
                  style={{ direction: isAr ? 'rtl' : 'ltr' }}
                  id="discover-search-empty"
                >
                  <div className="w-12 h-12 rounded-2xl bg-surface-sunken border border-line flex items-center justify-center text-fg-muted">
                    <Search className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <h3 className="text-sm font-black text-fg tracking-tight">
                    {isAr
                      ? `لا نتائج لـ "${searchTerm.trim()}"`
                      : `No matches for "${searchTerm.trim()}"`}
                  </h3>
                  <p className="text-xs text-fg-muted leading-relaxed max-w-sm">
                    {isAr
                      ? 'جرّب كلمة أبسط أو غيّر الفئة.'
                      : 'Try a simpler word or a different category.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[11px] font-extrabold text-fg-muted uppercase tracking-wider" id="discover-search-count">
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
                        isWatched={watchlist.includes(item.id)}
                        onToggleWatch={handleToggleWatch}
                      />
                    </div>
                  ))}
                </div>

                {/* Infinite-scroll trigger: appends the next page while more
                    results remain, so the honest `nbHits` count above stays
                    fully reachable (not just the first page of cards). */}
                {searchMode.hasMore && (
                  <div ref={searchLoadMoreSentinelRef} className="h-8" aria-hidden="true" />
                )}
                {searchMode.loadingMore && (
                  <div className="flex items-center justify-center py-4" id="discover-search-loading-more">
                    <span className="w-5 h-5 rounded-full border-2 border-[#E85D04]/30 border-t-[#E85D04] animate-spin" />
                  </div>
                )}
              </>
            )}
          </div>
        ) : showSkeleton ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <AuctionCardSkeleton key={n} />
            ))}
          </div>
        ) : (liveList.length > 0 || firstBidList.length > 0 || upcomingList.length > 0 || feed.hasMoreLive) ? (
          <div className="space-y-10">
            {liveList.length > 0 && (
              <section id="live-now-section">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-[#E85D04] fill-[#E85D04] animate-pulse" />
                  <h2 className="text-sm font-black text-fg uppercase tracking-tight">
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
                        liveEnabled={true}
                        isWatched={watchlist.includes(item.id)}
                        onToggleWatch={handleToggleWatch}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Awaiting-first-bid lots. Their own section rather than mixed into
                the grid above: they have no endsAt, so any position in an
                ending-soon ordering would be arbitrary. On the All chip this is
                a capped preview (see ALL_TAB_FIRST_BID_LIMIT) with a link to
                the full paged view; on the Be the First chip it IS the feed. */}
            {firstBidList.length > 0 && (
              <section id="be-the-first-section">
                {/* Section header. The count badge moved off amber onto the
                    brand's light-orange tint, and the "see all" arrow is now an
                    ICON with rtl:rotate-180 rather than a literal "←" — a bare
                    arrow glyph inside an RTL run is re-ordered by the bidi
                    algorithm and can end up pointing the wrong way. */}
                <div className="flex items-center gap-2 mb-4 mt-1">
                  <Zap className="w-4 h-4 shrink-0 text-[#FF6B00] fill-[#FF6B00]" />
                  <h2 className="text-[15px] font-bold tracking-tight text-fg">
                    {isAr ? 'كن أول مزايد' : 'Be the first'}
                  </h2>
                  <span className="rounded-full bg-[#FF6B00]/10 px-2 py-0.5 text-[11px] font-bold text-[#FF6B00]">
                    {firstBidList.length}
                  </span>
                  {selectedCategory === 'All' && (
                    <button
                      onClick={() => setSelectedCategory('Be the First')}
                      className="ms-auto flex items-center gap-1 text-xs font-semibold text-[#FF6B00] transition-opacity hover:opacity-70 cursor-pointer"
                    >
                      {isAr ? 'عرض الكل' : 'See all'}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {firstBidList.map((item, index) => (
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
                        liveEnabled={true}
                        isWatched={watchlist.includes(item.id)}
                        onToggleWatch={handleToggleWatch}
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
            {feed.hasMoreLive && (
              <div ref={loadMoreSentinelRef} className="h-8" aria-hidden="true" />
            )}
            {feed.loadingMore && (
              <div className="flex items-center justify-center py-4" id="discover-loading-more">
                <span className="w-5 h-5 rounded-full border-2 border-[#E85D04]/30 border-t-[#E85D04] animate-spin" />
              </div>
            )}

            {upcomingList.length > 0 && (
              <section id="upcoming-drops-section">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-fg-muted" />
                  <h2 className="text-sm font-black text-fg uppercase tracking-tight">
                    {isAr ? 'مواعيد قادمة' : 'Upcoming drops'}
                  </h2>
                  <span className="text-[10px] font-mono font-black bg-gray-200 text-fg-muted px-2 py-0.5 rounded-full">
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
                        liveEnabled={true}
                        isWatched={watchlist.includes(item.id)}
                        onToggleWatch={handleToggleWatch}
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
            className="w-full text-center py-16 px-6 bg-gradient-to-b from-[var(--color-surface-raised)] to-orange-50/30 border border-line rounded-2xl shadow-xs flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="feedback-empty-state"
          >
            <div className="w-12 h-12 rounded-2xl bg-accent-weak border border-orange-100 flex items-center justify-center text-[#FF6B00] animate-bounce">
              <Flame className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-sm font-black text-fg uppercase tracking-tight">
                {isAr ? 'المزادات القوية جاية 🔥' : 'Strong auctions are coming 🔥'}
              </h3>
              {upcomingPreview.length === 0 && (
                <p className="text-xs text-fg-muted leading-relaxed">
                  {isAr
                    ? 'المزادات تُعلن يومياً — انضم اليوم وكن جاهزاً لأول مزاد.'
                    : 'Auctions are announced daily — join today and be ready for the next drop.'}
                </p>
              )}
            </div>

            {/* Next-drops inline preview: keeps the quiet feed on-platform */}
            {upcomingPreview.length > 0 && (
              <div className="w-full max-w-sm space-y-1.5" id="empty-state-upcoming-preview">
                <span className="block text-[10px] font-extrabold text-fg-muted uppercase tracking-wider">
                  {isAr ? 'المواعيد القادمة' : 'Next drops'}
                </span>
                {upcomingPreview.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedLotId(item.id)}
                    className="w-full flex items-center justify-between gap-2 bg-surface-sunken hover:bg-accent-weak/60 border border-line rounded-xl px-3 py-2 transition-colors cursor-pointer text-start"
                  >
                    <span className="text-xs font-bold text-fg truncate">{item.title}</span>
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
                <span className="block text-[10px] font-extrabold text-fg-muted uppercase tracking-wider">
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
                    <span className="text-xs font-bold text-fg truncate flex items-center gap-1.5 min-w-0">
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
                <Bell className="w-4 h-4" />
                {isAr ? 'ذكّرني بأول مزاد' : 'Notify me of the next drop'}
              </button>
            )}

            {/* WhatsApp demoted to a secondary text link */}
            <button
              onClick={() => window.open(WHATSAPP_URL, '_blank', 'noopener,noreferrer')}
              className="text-[11px] font-semibold text-fg-muted hover:text-emerald-600 underline underline-offset-2 decoration-gray-200 hover:decoration-emerald-400 transition-colors cursor-pointer flex items-center gap-1"
              id="empty-state-whatsapp-link"
            >
              <MessageCircle className="w-3 h-3" />
              {isAr ? 'أو تابع قناتنا' : 'or follow our channel'}
            </button>
          </div>
          </div>
        )}
      </div>

      {/* E4 — app footer: always-reachable Auction Rules entry point */}
      <footer className="px-4 pt-2 pb-6 text-center">
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="text-[11px] font-bold text-fg-muted hover:text-[#FF6B00] underline underline-offset-2 decoration-gray-200 hover:decoration-[#FF6B00] transition-colors cursor-pointer"
          id="discover-footer-auction-rules-link"
        >
          {isAr ? 'قواعد المزاد' : 'Auction Rules'}
        </button>
      </footer>

      {/* Render specification details slide modal — resolve the lot from the
          feed's own displayed lists (paginated or OFF path), off the broad
          array (1b Task 4). Mount only when the lot is in hand. */}
      {(() => {
        if (!selectedLotId) return null;
        // Resolve from every displayed source, incl. the empty-state
        // `upcomingPreview` slice — a "Next drops" tap sets `selectedLotId` from
        // it while liveList/upcomingList are empty, so without it the modal
        // would silently never open (dead click).
        const detailsLot = liveList.find(a => a.id === selectedLotId)
          ?? upcomingList.find(a => a.id === selectedLotId)
          ?? upcomingPreview.find(a => a.id === selectedLotId);
        if (!detailsLot) return null;
        return (
          <AuctionDetailsModal
            auction={detailsLot}
            onClose={() => setSelectedLotId(null)}
          />
        );
      })()}

      {/* E4 — Auction Rules modal (opened from the footer link) */}
      <AuctionRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} isAr={isAr} />

      {/* Render Seller complete profile modal */}
      {selectedProfileId && (
        <SellerProfileModal
          sellerId={selectedProfileId}
          isOpen={true}
          onClose={() => setSelectedProfileId(null)}
        />
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
