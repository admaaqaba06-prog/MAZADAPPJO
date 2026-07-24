import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { SellerProfileModal } from './SellerProfileModal';
import { Pressable, CountUp, BidConfirm, WinningPill, useToast, FirstBidCoach, markFirstBidDone } from './feedback';
import { isAuctionOpen } from '../utils/auctionPhase';
import { minNextBid, totalWithPremium } from '../utils/bidMath';
import { formatMoney } from '../utils/formatMoney';
import { resolveAvatarUrl } from '../utils/avatarPlaceholder';
import { formatAmmanClock } from '../utils/ammanTime';
import { serverNow, isAuctionFinished } from '../utils/serverTime';
import { clampActiveIndex, isReelMounted } from '../utils/reelWindow';
import { translations } from '../utils/translations';
import { useBidFlow, resolveConfirm } from '../hooks/useBidFlow';
import { getAuctionMedia } from '../utils/auctionMedia';
import { MediaGallery } from './feedback/MediaGallery';
import {
  Volume2,
  VolumeX,
  Bookmark,
  Share2,
  Sparkles,
  Eye,
  Send,
  Award,
  X,
  Heart,
  Play,
  MessageSquare,
  ShieldCheck,
  Loader2
} from 'lucide-react';

interface MobileLiveAuctionLayoutProps {
  liveAuctions: any[];
  activeAuctionId: string;
  onSelectAuction: (id: string) => void;
  activeAuction: any;
  activePrice: number;
  isMuted: boolean;
  isPlaying: boolean;
  onMuteToggle: (e: React.MouseEvent) => void;
  onPlayPauseToggle: () => void;
  onShareClick: (e: React.MouseEvent) => void;
  onSaveToggle: (e: React.MouseEvent) => void;
  onLikeToggle: (e: React.MouseEvent) => void;
  isSaved: boolean;
  activeComments: any[];
  activeActivities: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  nextBidAmount: number;
  onBidExecute: (amount: number) => void | Promise<{ success: boolean; message: string } | void>;
  currentUser: any;
  language: string;
  isAr: boolean;
  onOpenDetails: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  showToast: string | null;
  onClose: () => void;
}

export const MobileLiveAuctionLayout: React.FC<MobileLiveAuctionLayoutProps> = ({
  liveAuctions,
  activeAuctionId,
  onSelectAuction,
  activeAuction,
  activePrice,
  isMuted,
  isPlaying,
  onMuteToggle,
  onPlayPauseToggle,
  onShareClick,
  onSaveToggle,
  onLikeToggle,
  isSaved,
  activeComments,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  nextBidAmount,
  onBidExecute,
  currentUser,
  language,
  isAr,
  onOpenDetails,
  showToast,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Perf Wave 3c (PF2 part 1): ALL AppContext reads the reels need are hoisted
  // HERE (the un-memoized list parent) and passed down as per-reel derived
  // props, so the memo comparator below governs every reel re-render. The reel
  // itself no longer calls useApp() — a context commit that used to bypass the
  // memo and re-render all mounted reels now stops at this parent.
  const { sellerProfiles, bids, orders, setActiveView, setGlobalSelectedOrderId } = useApp();
  const { showToast: pushToast } = useToast();

  // Anti-snipe drama: toast when the end time extends (a late bid pushed the clock)
  const prevEndRef = useRef<{ id: string; end: number } | null>(null);
  useEffect(() => {
    const id = activeAuction?.id;
    const end = activeAuction?.endTime;
    if (!id || !end) return;
    const prev = prevEndRef.current;
    if (prev && prev.id === id && end > prev.end && isAuctionOpen(activeAuction?.status)) {
      pushToast({
        type: 'info',
        title: isAr ? '⏱️ تمديد ١٥ ثانية — مزايدة جديدة!' : '⏱️ +15s — new bid!',
      });
    }
    prevEndRef.current = { id, end };
  }, [activeAuction?.id, activeAuction?.endTime, activeAuction?.status, isAr, pushToast]);

  // Handle scroll snap to detect current active reel
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const height = container.clientHeight;
    
    if (height === 0) return;
    
    const index = Math.round(scrollTop / height);
    if (index >= 0 && index < liveAuctions.length) {
      const targetAuction = liveAuctions[index];
      if (targetAuction && targetAuction.id !== activeAuctionId) {
        onSelectAuction(targetAuction.id);
      }
    }
  };

  // Sync scroll position when activeAuctionId changes externally
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const activeIndex = liveAuctions.findIndex(a => a.id === activeAuctionId);
    if (activeIndex !== -1) {
      const height = container.clientHeight;
      const targetScrollTop = activeIndex * height;
      
      if (Math.abs(container.scrollTop - targetScrollTop) > 5) {
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [activeAuctionId, liveAuctions]);

  return (
    <div 
      className="w-full h-full relative bg-black select-none overflow-hidden"
      id="mobile-live-layout-wrapper"
    >
      {/* Global Toast Overlay */}
      {showToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#FF6B00] text-white px-4 py-2 rounded-xl text-[10.5px] font-black tracking-wide shadow-xl animate-fade-in text-center border border-orange-400/20">
          {showToast}
        </div>
      )}

      {/* Snap-Scrolling Reels Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-scroll snap-y snap-mandatory overscroll-contain no-scrollbar"
        id="mobile-reels-snap-container"
      >
        {(() => {
          // Computed ONCE per render (was a findIndex per reel = O(n²)).
          // `rawActiveIndex` keeps the historical shouldLoad semantics
          // (-1 allowed → only index 0 preloads); `anchorIndex` clamps it for
          // the mounted window so {active, active+1} is always a subset of
          // the mounted reels (guarded by reelWindow tests).
          const rawActiveIndex = liveAuctions.findIndex(a => a.id === activeAuctionId);
          const anchorIndex = clampActiveIndex(rawActiveIndex, liveAuctions.length);

          return liveAuctions.map((auction, index) => {
            // Perf Wave 3c (PF2 part 3) — reel virtualization: only
            // anchorIndex ±1 mount as real components. Every other slot is an
            // inert spacer with IDENTICAL geometry (h-full + snap-start) and
            // the same spinner visuals the unloaded skeleton always had, so
            // scroll-snap positions, the handleScroll index math above and
            // deep-link scrollTo(activeIndex * height) are unchanged. The
            // active reel and both neighbours can never unmount mid-swipe:
            // a one-step swipe keeps the previous active inside the window.
            if (!isReelMounted(index, anchorIndex, liveAuctions.length)) {
              return (
                <div
                  key={auction.id}
                  className="w-full h-full snap-start snap-always shrink-0 relative flex flex-col items-center justify-center bg-zinc-950"
                  style={{ height: '100%' }}
                  aria-hidden="true"
                  id={`reel-spacer-${auction.id}`}
                >
                  <div className="w-10 h-10 border-4 border-t-orange-500 border-zinc-800 rounded-full animate-spin"></div>
                </div>
              );
            }

            const isActive = auction.id === activeAuctionId;
            // Performance protection: load only current and next auction to preserve memory & networking
            const shouldLoad = index === rawActiveIndex || index === rawActiveIndex + 1;
            const currentReelPrice = isActive ? activePrice : (auction.currentPrice || 0);

            // PF2 part 1 — per-reel derived values, computed here so the reel
            // has no context subscription of its own and the memo comparator
            // sees plain value props (cheap: at most 3 reels are mounted).
            const sellerProfile = sellerProfiles?.find(
              p => p.userId === auction.sellerId || p.id === auction.sellerId
            ) ?? null;
            const hasUserBid = bids
              ? bids.some(b => b.auctionId === auction.id && b.bidderId === currentUser?.id)
              : false;
            const winnerOrderId = orders?.find(
              o => o.auctionId === auction.id && o.buyerId === currentUser?.id
            )?.id ?? null;

            return (
              <MobileAuctionReel
                key={auction.id}
                auction={auction}
                isActive={isActive}
                shouldLoad={shouldLoad}
                isMuted={isMuted}
                isPlaying={isPlaying}
                onPlayPauseToggle={onPlayPauseToggle}
                activePrice={currentReelPrice}
                isSaved={isSaved}
                activeComments={activeComments}
                activeActivities={activeActivities}
                commentText={commentText}
                setCommentText={setCommentText}
                onCommentSubmit={onCommentSubmit}
                nextBidAmount={isActive ? nextBidAmount : minNextBid(currentReelPrice, auction.minIncrement, auction.totalBids || 0)}
                onBidExecute={onBidExecute}
                currentUser={currentUser}
                language={language}
                isAr={isAr}
                onOpenDetails={onOpenDetails}
                onMuteToggle={onMuteToggle}
                onShareClick={onShareClick}
                onSaveToggle={onSaveToggle}
                onLikeToggle={onLikeToggle}
                onClose={onClose}
                sellerProfile={sellerProfile}
                hasUserBid={hasUserBid}
                winnerOrderId={winnerOrderId}
                setActiveView={setActiveView}
                setGlobalSelectedOrderId={setGlobalSelectedOrderId}
              />
            );
          });
        })()}
      </div>
    </div>
  );
};

/* ======================================================================
   INDIVIDUAL MOBILE REEL COMPONENT
   ====================================================================== */
interface MobileAuctionReelProps {
  auction: any;
  isActive: boolean;
  shouldLoad: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  onPlayPauseToggle: () => void;
  activePrice: number;
  isSaved: boolean;
  activeComments: any[];
  activeActivities: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  nextBidAmount: number;
  onBidExecute: (amount: number) => void | Promise<{ success: boolean; message: string } | void>;
  currentUser: any;
  language: string;
  isAr: boolean;
  onOpenDetails: (id: string) => void;
  onMuteToggle: (e: React.MouseEvent) => void;
  onShareClick: (e: React.MouseEvent) => void;
  onSaveToggle: (e: React.MouseEvent) => void;
  onLikeToggle: (e: React.MouseEvent) => void;
  onClose: () => void;
  // Perf Wave 3c (PF2 part 1): context reads hoisted to the list parent.
  // These are per-reel DERIVED values (this lot's seller profile, whether THIS
  // user bid on THIS lot, this user's order id for THIS lot) — never the raw
  // context arrays, whose identity churns on every snapshot.
  sellerProfile: any | null;
  hasUserBid: boolean;
  winnerOrderId: string | null;
  setActiveView: (view: any) => void;
  setGlobalSelectedOrderId: (id: string | null) => void;
}

const MobileAuctionReelBase: React.FC<MobileAuctionReelProps> = ({
  auction,
  isActive,
  shouldLoad,
  isMuted,
  isPlaying,
  onPlayPauseToggle,
  activePrice,
  isSaved,
  activeComments,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  nextBidAmount,
  onBidExecute,
  currentUser,
  language,
  isAr,
  onOpenDetails,
  onMuteToggle,
  onShareClick,
  onSaveToggle,
  onLikeToggle,
  onClose,
  sellerProfile,
  hasUserBid,
  winnerOrderId,
  setActiveView,
  setGlobalSelectedOrderId,
}) => {
  // Perf Wave 3c (PF2 part 1): NO useApp() here anymore. Every context-sourced
  // value arrives as a derived prop from the list parent, so re-renders are
  // fully governed by the memo comparator (areReelPropsEqual). The only
  // context-shaped subscription left is useBidFlow's useApp (currentUser
  // membership + subscription-prompt setter) — and after the Wave 3c
  // AuctionsContext split, the main AppContext value no longer changes on a
  // bid, so that subscription stays quiet during bid wars.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const t = translations[language as 'en' | 'ar'];

  const activeSellerProfile = sellerProfile;

  const isPremium = activeSellerProfile?.verificationStatus === 'premium_verified';
  const isVerified = activeSellerProfile?.verificationStatus === 'verified' || isPremium;
  const isEnded = isAuctionFinished(auction, serverNow());

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showChatInput, setShowChatInput] = useState(false);
  const [isChatHidden, setIsChatHidden] = useState(false);
  // Prominent first-play "tap for sound" affordance: video autoplays muted
  // (browser policy), so surface a big one-tap unmute over the video. Latches
  // dismissed the moment the viewer unmutes so it never nags again.
  const [unmutePromptDismissed, setUnmutePromptDismissed] = useState(false);

  // Once the stream is unmuted, retire the prompt for good.
  useEffect(() => {
    if (!isMuted) setUnmutePromptDismissed(true);
  }, [isMuted]);

  // States for micro-animations and feedback
  const [priceAnimate, setPriceAnimate] = useState(false);
  const [justBidded, setJustBidded] = useState(false);
  // Optimistic price override (submitting/pending live in useBidFlow below).
  const [optimisticPrice, setOptimisticPrice] = useState<number | null>(null);
  const [toastQueue, setToastQueue] = useState<{ id: string; text: string; icon: string }[]>([]);
  const [activeToast, setActiveToast] = useState<{ id: string; text: string; icon: string } | null>(null);

  // Optimistic price: show the just-placed bid instantly; never dip below the
  // real echo (a higher outbid overtakes it). Reconciled when the subscription
  // catches up — CountUp smooths any correction.
  const displayPrice = optimisticPrice != null ? Math.max(optimisticPrice, activePrice) : activePrice;

  // Reconcile: once the real (subscription) price reaches our optimistic value,
  // drop the override so live updates flow through unmodified.
  useEffect(() => {
    if (optimisticPrice != null && activePrice >= optimisticPrice) {
      setOptimisticPrice(null);
    }
  }, [activePrice, optimisticPrice]);

  // Trigger price micro-animation
  useEffect(() => {
    if (displayPrice > 0) {
      setPriceAnimate(true);
      const timer = setTimeout(() => setPriceAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [displayPrice]);

  // Per-reel countdown: each reel derives its OWN clock from its own endTime
  // (or scheduledStartAt before it opens) via serverNow(), so a swiped reel
  // never shows the active lot's time. Ticks only while loaded (2 reels max).
  const [reelTimeLeft, setReelTimeLeft] = useState<string>('00:00:00');
  useEffect(() => {
    if (!shouldLoad) return;
    const compute = () => {
      const open = isAuctionOpen(auction?.status);
      const target = !open && auction?.scheduledStartAt ? auction.scheduledStartAt : auction?.endTime;
      const remainingMs = (target ?? 0) - serverNow();
      const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));

      // T-0 dead zone: scheduled start passed but the opener cron hasn't flipped it live.
      if (!open && (auction?.scheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
        setReelTimeLeft(isAr ? 'يبدأ الآن…' : 'Starting…');
        return;
      }
      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setReelTimeLeft(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      } else {
        setReelTimeLeft(isAr ? 'انتهى المزاد' : 'Auction ended');
      }
    };
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [shouldLoad, auction?.endTime, auction?.scheduledStartAt, auction?.status, isAr]);

  // Queue joined, liked, saved notifications
  useEffect(() => {
    if (activeActivities.length === 0) return;
    const latestAct = activeActivities[activeActivities.length - 1];
    if (!latestAct) return;

    let icon = '⭐';
    let text = '';
    if (latestAct.type === 'join') {
      icon = '⭐';
      text = isAr ? `${latestAct.name} انضم للبث` : `${latestAct.name} joined`;
    } else if (latestAct.type === 'like') {
      icon = '❤️';
      text = isAr ? `${latestAct.name} أعجب بالبث` : `${latestAct.name} liked the stream`;
    } else if (latestAct.type === 'save') {
      icon = '🔖';
      text = isAr ? `${latestAct.name} حفظ المعروض` : `${latestAct.name} bookmarked the lot`;
    } else {
      icon = '✨';
      text = isAr ? `${latestAct.name} ${latestAct.textAr}` : `${latestAct.name} ${latestAct.textEn}`;
    }

    setToastQueue((prev) => {
      if (prev.some((t) => t.id === latestAct.id)) return prev;
      return [...prev, { id: latestAct.id, text, icon }];
    });
  }, [activeActivities, isAr]);

  // Queue bid notifications from comments list
  useEffect(() => {
    if (activeComments.length === 0) return;
    const latestComment = activeComments[activeComments.length - 1];
    if (!latestComment) return;

    if (latestComment.isBid || latestComment.text.toLowerCase().includes('bid') || latestComment.text.toLowerCase().includes('عطاء') || latestComment.text.toLowerCase().includes('عطائه')) {
      const icon = '🔥';
      const text = latestComment.text;
      setToastQueue((prev) => {
        if (prev.some((t) => t.id === latestComment.id)) return prev;
        return [...prev, { id: latestComment.id, text, icon }];
      });
    }
  }, [activeComments]);

  // Handle single Toast execution loop
  useEffect(() => {
    if (activeToast || toastQueue.length === 0) return;

    const [nextToast, ...remaining] = toastQueue;
    setActiveToast(nextToast);
    setToastQueue(remaining);

    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 2500);

    return () => clearTimeout(timer);
  }, [toastQueue, activeToast]);

  // Filter normal comments to keep the chat feed extremely minimal
  const normalComments = useMemo(() => {
    return activeComments.filter(
      (msg) => !msg.isBid && !msg.text.toLowerCase().includes('bid') && !msg.text.toLowerCase().includes('عطاء')
    );
  }, [activeComments]);

  // Gallery source items (video first, then thumbnail/mediaUrls/concierge photos,
  // de-duped) — MediaGallery below owns play/pause + muted sync internally
  // (it knows which slide is actually visible), so no manual video effects here.
  const mediaItems = useMemo(() => getAuctionMedia(auction), [auction]);

  // Bid logic status selectors (`hasUserBid` is a hoisted prop — PF2 part 1)
  const isUserWinner = hasUserBid && auction?.currentBidderId === currentUser?.id;

  // --- The bid moment: confirm-then-bid + success rush ---
  const [showWinPill, setShowWinPill] = useState(false);
  const winPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justBiddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (winPillTimer.current) clearTimeout(winPillTimer.current);
    if (justBiddedTimer.current) clearTimeout(justBiddedTimer.current);
  }, []);

  // Execute wraps the callable with the reel's optimistic paint: reflect the bid
  // + "you're winning" instantly, then await. The subscription echo reconciles
  // the real price/winner; a rejection rolls the optimism back.
  const executeWithOptimism = async (amount: number) => {
    setOptimisticPrice(amount);
    setJustBidded(true);
    setShowWinPill(true);
    if (winPillTimer.current) clearTimeout(winPillTimer.current);
    winPillTimer.current = setTimeout(() => setShowWinPill(false), 1200);

    const res = await onBidExecute(amount);
    if (res && res.success) {
      markFirstBidDone(); // first successful bid retires the first-bid coach
      if (justBiddedTimer.current) clearTimeout(justBiddedTimer.current);
      justBiddedTimer.current = setTimeout(() => setJustBidded(false), 2500);
    } else {
      // Rejected (outbid, ended, membership, spam): roll back the optimism —
      // the real state (outbid banner + toast) governs from here.
      setOptimisticPrice(null);
      setJustBidded(false);
      setShowWinPill(false);
    }
    return res;
  };

  // Shared bid flow: membership gate (non-members never reach confirm) +
  // confirm step + in-flight submitting guard. Same handler the details modal uses.
  const { isMember, isGuest, requestSignIn, pendingBid, submitting, startBid, confirmBid, cancelBid } = useBidFlow(executeWithOptimism);

  // Was the staged amount bumped by a rival bid during the ≤10s confirm window?
  const [priceMoved, setPriceMoved] = useState(false);

  // Custom bid amount (bottom-dock secondary action). Local-only UI state; the
  // actual bid still flows through the shared openConfirm/useBidFlow gate.
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  // Open a fresh confirm (resets any stale "price moved" flag).
  const openConfirm = (amount: number) => {
    setPriceMoved(false);
    startBid(amount);
  };

  // At confirm, recompute against the LATEST minimum: if a rival outbid us during
  // the confirm window, re-prompt at the new min instead of sending the stale
  // amount (which the server would reject). Otherwise send.
  const handleConfirm = (amount: number) => {
    const decision = resolveConfirm(amount, nextBidAmount);
    if (decision.action === 'reprompt') {
      setPriceMoved(true);
      startBid(decision.amount); // re-open confirm at the fresh minimum
      return;
    }
    setPriceMoved(false);
    confirmBid(decision.amount);
  };

  const handleCancel = () => {
    setPriceMoved(false);
    cancelBid();
  };

  // Tapping the bid button routes through the shared gate (invite → confirm).
  const handleLocalBid = () => {
    openConfirm(nextBidAmount);
  };

  // Reveal / prefill the inline custom-amount input.
  const toggleCustom = () => {
    setShowCustom((prev) => {
      const nextOpen = !prev;
      if (nextOpen) setCustomValue(String(nextBidAmount));
      return nextOpen;
    });
  };

  // Stage a custom amount through the EXISTING confirm path (no new bid route).
  // Ignore anything below the current minimum next bid.
  const submitCustom = () => {
    const amount = Number(customValue);
    if (!Number.isFinite(amount) || amount < nextBidAmount) return;
    setShowCustom(false);
    openConfirm(amount);
  };

  // Condition chip label (structured spec field; static per lot).
  const conditionChip =
    auction?.condition === 'new'
      ? (isAr ? 'جديد' : 'New')
      : auction?.condition === 'used'
        ? (isAr ? 'مستعمل' : 'Used')
        : null;

  // Anti-snipe drama: red pulsing countdown under 10s (active reel only)
  const msLeft = auction?.endTime ? auction.endTime - serverNow() : Infinity;
  const isSnipeWindow =
    isActive &&
    !isEnded &&
    isAuctionOpen(auction?.status) &&
    Number.isFinite(msLeft) &&
    msLeft > 0 &&
    msLeft < 10000;

  const getBidButtonText = () => {
    if (isUserWinner) {
      return isAr ? "أنت الأعلى حالياً" : "You are highest";
    }
    if (hasUserBid && !isUserWinner) {
      return isAr ? "زايد مرة أخرى" : "Bid Again";
    }
    return isAr ? "زايد الآن" : "Bid Now";
  };

  const getStatusMessage = () => {
    if (justBidded) {
      return isAr ? "تمت المزايدة 🎉" : "Bid placed successfully! 🎉";
    }
    if (hasUserBid) {
      if (isUserWinner) {
        return isAr ? "أنت الأعلى حالياً 🎉" : "You are currently the highest bidder 🎉";
      } else {
        return isAr ? "شخص آخر زايد أعلى منك ⚠️" : "Someone else bid higher than you ⚠️";
      }
    }
    return isAr ? "ابدأ المزايدة الآن لتفوز بالقطعة!" : "Place your first bid to win this lot!";
  };

  // If this reel is not selected to be loaded, return lightweight skeleton to save performance
  if (!shouldLoad) {
    return (
      <div 
        className="w-full h-full snap-start snap-always shrink-0 relative flex flex-col items-center justify-center bg-zinc-950"
        style={{ height: '100%' }}
      >
        <div className="w-10 h-10 border-4 border-t-orange-500 border-zinc-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full snap-start snap-always shrink-0 relative flex flex-col overflow-hidden bg-black"
      style={{ height: '100%' }}
    >
      <style>{`
        @keyframes slideDownFade {
          0% {
            opacity: 0;
            transform: translate(-50%, -15px);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          85% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -10px);
          }
        }
        .animate-slide-down-fade {
          animation: slideDownFade 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* ======================================================================
          MEDIA PANE — full-bleed swipeable gallery. The compact bid dock now
          overlays the bottom of this same pane (Whatnot / TikTok Shop pattern)
          instead of taking a 42% split below it.
          ====================================================================== */}
      <div
        className="relative w-full h-full overflow-hidden bg-black"
        style={{ height: '100%' }}
        id={`reel-media-pane-${auction.id}`}
      >
        <MediaGallery
          items={mediaItems}
          isActive={isActive}
          isPlaying={isPlaying}
          isMuted={isMuted}
          isAr={isAr}
          onVideoClick={onPlayPauseToggle}
          videoRef={localVideoRef}
          className="absolute inset-0"
        />

      {/* Gradient overlays for contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none z-10" />

      {/* Play/Pause standby overlay */}
      {!isPlaying && isActive && (
        <div
          onClick={onPlayPauseToggle}
          className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer z-10 backdrop-blur-[1px]"
        >
          <div className="w-12 h-12 rounded-full bg-[#FF6B00] text-white flex items-center justify-center shadow-lg transition-transform active:scale-90">
            <Play className="w-5 h-5 ml-0.5 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Prominent one-tap unmute affordance — shown over the video on first
          play while muted, dismissed permanently once the viewer unmutes. */}
      {isActive && isPlaying && isMuted && !unmutePromptDismissed && (
        <button
          onClick={(e) => {
            onMuteToggle(e);
            setUnmutePromptDismissed(true);
          }}
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-center animate-fade-in pointer-events-none"
          aria-label={isAr ? 'اضغط للصوت' : 'Tap for sound'}
        >
          <span className="pointer-events-auto inline-flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/20 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-black active:scale-95 transition-transform cursor-pointer">
            <Volume2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{isAr ? '🔊 اضغط للصوت' : '🔊 Tap for sound'}</span>
          </span>
        </button>
      )}

      {isActive && (
        <>
          {/* ======================================================================
              1. COMPACT TOP BAR (Seller & Stream Info)
              ====================================================================== */}
          <div 
            className="absolute left-4 right-4 z-30 flex items-center justify-between animate-fade-in" 
            style={{ 
              top: 'calc(env(safe-area-inset-top, 16px) + 12px)',
              direction: isAr ? 'rtl' : 'ltr' 
            }}
          >
            <div className="flex items-center gap-1.5">
              {/* Seller pill */}
              <div 
                onClick={() => {
                  if (activeSellerProfile) {
                    setSelectedProfileId(activeSellerProfile.userId);
                  }
                }}
                className="bg-black/35 backdrop-blur-xl border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-all"
              >
                {activeSellerProfile ? (
                  <img
                    src={resolveAvatarUrl(activeSellerProfile.storeLogo, activeSellerProfile.userId)}
                    alt="Logo"
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#FF6B00] to-orange-400 flex items-center justify-center font-black text-white text-[9px] shrink-0">
                    {activeSellerProfile?.storeName?.[0] || 'M'}
                  </div>
                )}
                <div className="flex flex-col text-left rtl:text-right">
                  <span className="text-[9px] font-black text-white leading-none flex items-center gap-0.5">
                    {activeSellerProfile?.storeName || (isAr ? 'مزاد الأردن' : 'MAZAD JO')}
                    {isVerified && (
                      <ShieldCheck className={`w-2.5 h-2.5 ${isPremium ? 'text-amber-400' : 'text-emerald-400'}`} />
                    )}
                  </span>
                  <span className="text-[6.5px] text-orange-400 font-extrabold leading-none mt-0.5 uppercase tracking-wider">
                    🔴 LIVE
                  </span>
                </div>
              </div>

              {/* Bid count pill */}
              <div className="bg-black/20 backdrop-blur-xl border border-white/10 px-2 py-1 rounded-full flex items-center gap-1 shadow-md text-[9px] text-white font-bold leading-none h-7">
                <Eye className="w-3 h-3 text-zinc-300" />
                <span>{auction.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}</span>
              </div>
            </div>

            {/* Mute and Exit Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onMuteToggle}
                className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-xl flex items-center justify-center text-white border border-white/10 shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-xl flex items-center justify-center text-white border border-white/10 shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ======================================================================
              2. SINGLE FLOATING TOAST NOTIFICATION
              ====================================================================== */}
          {activeToast && (
            <div 
              style={{ top: 'calc(env(safe-area-inset-top, 16px) + 64px)' }}
              className="absolute left-1/2 -translate-x-1/2 z-40 bg-black/35 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-lg text-white pointer-events-none text-center max-w-[85%] animate-slide-down-fade"
            >
              <span className="text-xs shrink-0">{activeToast.icon}</span>
              <span className="text-[10px] font-extrabold tracking-wide text-zinc-100 whitespace-nowrap overflow-hidden text-ellipsis">
                {activeToast.text}
              </span>
            </div>
          )}

          {/* ======================================================================
              3. FLOATING ACTION PANEL (TikTok Side Actions)
              ====================================================================== */}
          <div
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 264px)', direction: isAr ? 'rtl' : 'ltr' }}
            className="absolute right-4 z-20 flex flex-col gap-3.5 items-center select-none animate-fade-in"
          >
            {/* Like appreciation button */}
            <button
              onClick={onLikeToggle}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Heart className="w-4.5 h-4.5" />
            </button>

            {/* Save Bookmark button */}
            <button
              onClick={onSaveToggle}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Bookmark className={`w-4.5 h-4.5 ${isSaved ? 'text-[#FF6B00] fill-[#FF6B00]' : 'text-white'}`} />
            </button>

            {/* Share link button */}
            <button
              onClick={onShareClick}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Share2 className="w-4.5 h-4.5" />
            </button>

            {/* Specifications trigger */}
            <button
              onClick={() => onOpenDetails(auction.id)}
              className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-amber-400 opacity-75 active:scale-90 transition-all hover:opacity-100 cursor-pointer shadow-md"
            >
              <Award className="w-4.5 h-4.5" />
            </button>

            {/* Hide/Show Chat button */}
            <button
              onClick={() => setIsChatHidden(!isChatHidden)}
              className={`w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center shadow-md active:scale-90 transition-all cursor-pointer ${!isChatHidden ? 'bg-[#FF6B00] border-orange-400 text-white opacity-100' : 'bg-black/30 border-white/10 text-white opacity-75 hover:opacity-100'}`}
              title={isAr ? "إظهار/إخفاء المحادثة" : "Show/Hide Chat"}
            >
              <MessageSquare className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* ======================================================================
              4. COMPACT CHAT FEED (Tucked at bottom-left, avoids covering product)
              ====================================================================== */}
          {!isChatHidden && (
            <div
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 264px)', direction: isAr ? 'rtl' : 'ltr' }}
              className="absolute left-4 right-20 max-h-[85px] z-20 pointer-events-none flex flex-col justify-end overflow-hidden animate-fade-in"
            >
              <div className="space-y-1 p-1 flex flex-col justify-end">
                {normalComments.slice(-2).map((msg) => (
                  <div 
                    key={`chat-reel-${auction.id}-${msg.id}`} 
                    className="bg-black/25 backdrop-blur-md border border-white/5 rounded-xl px-2.5 py-1.5 flex items-start gap-2 max-w-[95%] animate-fade-in pointer-events-auto shadow-sm"
                  >
                    <img
                      src={resolveAvatarUrl(msg.userAvatar, msg.userId)}
                      alt="User"
                      width={16}
                      height={16}
                      loading="lazy"
                      className="w-4 h-4 rounded-full object-cover border border-white/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <span className="text-[8.5px] font-black text-orange-400 leading-none block">
                        {msg.userName}
                      </span>
                      <p className="text-[9.5px] text-zinc-100 font-medium leading-tight mt-0.5">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat text box trigger */}
          <div
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 196px)' }}
            className="absolute left-4 z-20"
          >
            <button
              onClick={() => {
                // Guest browsing: chatting is an account action — signup moment.
                if (isGuest) {
                  requestSignIn();
                  return;
                }
                setShowChatInput(!showChatInput);
              }}
              className="bg-black/30 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] font-black text-white hover:bg-black/50 transition-colors"
            >
              {isGuest
                ? (isAr ? '💬 سجّل للتعليق' : '💬 Sign up to chat')
                : (isAr ? '💬 اكتب تعليقاً...' : '💬 Send a message...')}
            </button>
          </div>

          {/* Floating Chat Input form */}
          {showChatInput && (
            <div
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 196px)' }}
              className="absolute left-4 right-4 z-30 animate-fade-in"
            >
              <form 
                onSubmit={(e) => {
                  onCommentSubmit(e);
                  setShowChatInput(false);
                }}
                className="flex gap-2 bg-black/75 backdrop-blur-xl border border-white/10 p-1.5 rounded-xl shadow-lg w-full"
                style={{ direction: isAr ? 'rtl' : 'ltr' }}
              >
                <input 
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={isAr ? 'اكتب تعليقاً عاماً...' : 'Send live message...'}
                  className="flex-grow h-8 px-2.5 bg-white/5 border border-white/10 rounded-lg text-zinc-100 text-[11px] placeholder-zinc-500 outline-none focus:border-[#FF6B00]/40 transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-8 w-8 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg transition-all flex items-center justify-center shrink-0 shadow-md cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </>
      )}
      </div>
      {/* END MEDIA PANE */}

      {/* ======================================================================
          BID DOCK — compact translucent dock overlaid on the FULL-BLEED media
          (Whatnot / TikTok Shop pattern). Replaces the old 42% below-media
          panel. All bid-flow wiring (useBidFlow/executeWithOptimism/confirm/
          cancel/openConfirm) is untouched — only JSX position + styling moved.
          ====================================================================== */}
      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
          id={`reel-bid-dock-${auction.id}`}
        >
          <div
            style={{
              direction: isAr ? 'rtl' : 'ltr',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
            }}
            className="pointer-events-auto w-full px-4 pt-16 pb-3 flex flex-col gap-2 select-none animate-fade-in bg-gradient-to-t from-black/95 via-black/80 to-transparent"
            id={`bidding-card-${auction.id}`}
          >
            {isEnded ? (
              <div className="relative w-full bg-black/70 border border-amber-500/30 rounded-2xl p-3 text-center backdrop-blur-md flex flex-col items-center justify-center gap-2 shadow-xl">
                {(() => {
                  // hasUserBid / isUserWinner come from the component scope
                  // (hoisted prop + derivation above) — the old inline
                  // recomputation from context `bids` was byte-identical.
                  if (isUserWinner) {
                    return (
                      <>
                        <span className="text-emerald-400 font-black text-xs block">
                          {isAr ? 'مبروك 🎉 ربحت المزاد' : 'Congratulations! You won'}
                        </span>
                        {auction?.marketPrice && auction.marketPrice > activePrice ? (
                          <span className="text-emerald-300/80 text-[10.5px] font-bold block">
                            {isAr
                              ? `وفّرت ${formatMoney(auction.marketPrice - activePrice, 'ar')} (السعر ${formatMoney(auction.marketPrice, 'ar')})`
                              : `You saved ${formatMoney(auction.marketPrice - activePrice, 'en')} (worth ${formatMoney(auction.marketPrice, 'en')})`}
                          </span>
                        ) : null}
                        <button
                          onClick={() => {
                            if (winnerOrderId) {
                              setGlobalSelectedOrderId(winnerOrderId);
                            }
                            setActiveView('orders');
                          }}
                          className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-black shadow-md cursor-pointer"
                        >
                          {isAr ? 'عرض الطلب' : 'View Order'}
                        </button>
                      </>
                    );
                  } else {
                    return (
                      <span className="text-zinc-300 text-xs font-bold block">
                        {isAr ? 'انتهى المزاد' : 'Auction Ended'}
                      </span>
                    );
                  }
                })()}
              </div>
            ) : !isAuctionOpen(auction?.status) ? (
              <div className="relative w-full rounded-2xl bg-black/70 border border-white/10 backdrop-blur-md text-white text-center p-4">
                <div className="text-sm opacity-80">{isAr ? 'يبدأ المزاد' : 'Auction starts'}</div>
                <div className="text-lg font-bold">
                  {auction?.scheduledStartAt ? formatAmmanClock(auction.scheduledStartAt) : (isAr ? 'قريباً' : 'Soon')}
                </div>
              </div>
            ) : (
              <>
                {/* STATUS LINE — winning / outbid feed with instant feedback +
                    inline "retake the lead" CTA for the losing state. */}
                {(() => {
                  const isLosing = hasUserBid && !isUserWinner && !justBidded;
                  return (
                    <motion.div
                      key={isLosing ? 'outbid' : 'status'}
                      initial={{ boxShadow: '0 0 0 0 rgba(244,63,94,0)' }}
                      animate={
                        isLosing
                          ? {
                              boxShadow: [
                                '0 0 0 0 rgba(244,63,94,0)',
                                '0 0 0 5px rgba(244,63,94,0.25)',
                                '0 0 0 0 rgba(244,63,94,0)',
                                '0 0 0 5px rgba(244,63,94,0.25)',
                                '0 0 0 0 rgba(244,63,94,0)',
                              ],
                            }
                          : { boxShadow: '0 0 0 0 rgba(244,63,94,0)' }
                      }
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className={`py-1.5 px-3 rounded-xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-black tracking-wide border backdrop-blur-md transition-all duration-300 ${
                        justBidded
                          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400 animate-pulse"
                          : isUserWinner
                          ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
                          : isLosing
                          ? "bg-rose-500/15 border-rose-500/25 text-rose-400"
                          : "bg-white/5 border-white/10 text-zinc-300"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {justBidded && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                        <span>{getStatusMessage()}</span>
                      </span>
                      {isLosing && (
                        <Pressable
                          disabled={submitting}
                          onClick={() => openConfirm(nextBidAmount)}
                          className="w-full py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white text-[10px] font-black shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>{isAr ? `زايد ${formatMoney(nextBidAmount, 'ar')} لاستعادة الصدارة` : `Bid ${formatMoney(nextBidAmount, 'en')} to retake the lead`}</span>
                        </Pressable>
                      )}
                    </motion.div>
                  );
                })()}

                {/* PRODUCT ROW — thumbnail · title + condition/category chip ·
                    big current price + urgency countdown on the trailing side. */}
                <div className="flex items-center gap-3">
                  {mediaItems[0] && (
                    <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/15 bg-black/40 shrink-0 shadow-md">
                      <img
                        src={mediaItems[0].url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-white truncate leading-tight">
                      {auction.title}
                    </h3>
                    {(conditionChip || auction?.category) && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {conditionChip && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-[8.5px] font-black uppercase tracking-wider text-zinc-200 leading-none">
                            {conditionChip}
                          </span>
                        )}
                        {auction?.category && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8.5px] font-black uppercase tracking-wider text-zinc-300 leading-none">
                            {auction.category}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-black text-[#FF6B00] tabular-nums font-mono leading-none transition-all duration-300 ${priceAnimate ? 'scale-110 text-amber-400' : 'scale-100'}`}>
                        <CountUp value={displayPrice} format={(n) => Math.round(n).toLocaleString('en-US')} />
                      </span>
                      <span className="text-[11px] font-bold text-white/70">{isAr ? 'د.أ' : 'JOD'}</span>
                    </div>
                    <motion.div
                      animate={isSnipeWindow ? { scale: [1, 1.08, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                      transition={isSnipeWindow ? { duration: 1, ease: 'easeOut', repeat: Infinity } : { duration: 0.2, ease: 'easeOut' }}
                      className={`inline-flex items-center gap-1 bg-black/50 border border-white/10 px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono ${isSnipeWindow ? 'text-red-400' : 'text-emerald-400'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${isSnipeWindow ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                      <span>{reelTimeLeft}</span>
                    </motion.div>
                  </div>
                </div>

                {auction.reserveMet === false && (
                  <span className="text-[10px] font-bold text-amber-500 text-right rtl:text-left -mt-1">
                    {isAr ? 'لم يصل السعر الاحتياطي بعد' : 'Reserve not yet met'}
                  </span>
                )}
                {auction.reserveMet === true && (
                  <span className="text-[10px] font-bold text-emerald-500 text-right rtl:text-left -mt-1">
                    {isAr ? '✓ تم بلوغ السعر الاحتياطي' : '✓ Reserve met'}
                  </span>
                )}

                {/* One-time first-bid coach for active members who have never bid.
                    Hidden while a bid confirm is open so it can never overlap or
                    intercept clicks meant for the confirm dialog. */}
                <FirstBidCoach
                  show={isActive && currentUser?.subscriptionStatus === 'active' && pendingBid == null}
                  isAr={isAr}
                />

                {/* Custom amount reveal — stages via the EXISTING openConfirm gate. */}
                {showCustom && (
                  <div className="flex gap-2" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={customValue}
                      min={nextBidAmount}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitCustom();
                      }}
                      placeholder={String(nextBidAmount)}
                      autoFocus
                      className="flex-grow h-11 px-3 bg-white/5 border border-white/15 rounded-xl text-white text-sm font-black font-mono tabular-nums placeholder-zinc-500 outline-none focus:border-[#FF6B00]/50 transition-colors"
                    />
                    <button
                      onClick={submitCustom}
                      className="h-11 px-4 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-xl text-xs font-black shrink-0 shadow-md cursor-pointer"
                    >
                      {isAr ? 'زايد' : 'Set'}
                    </button>
                  </div>
                )}

                {/* ACTION ROW — secondary Custom + primary Bid button. */}
                <div className="flex items-stretch gap-2">
                  <button
                    onClick={toggleCustom}
                    className={`h-14 px-4 rounded-2xl border text-xs font-black tracking-wide shrink-0 backdrop-blur-md active:scale-95 transition-all cursor-pointer ${
                      showCustom
                        ? 'bg-[#FF6B00]/20 border-[#FF6B00]/50 text-[#FF6B00]'
                        : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
                    }`}
                  >
                    {isAr ? 'مبلغ' : 'Custom'}
                  </button>
                  <Pressable
                    disabled={currentUser?.isBlocked || submitting}
                    onClick={handleLocalBid}
                    className="flex-1 h-14 bg-[#FF6B00] hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700/50 text-white border border-orange-400/20 font-black rounded-2xl flex flex-col items-center justify-center transition-colors shadow-[0_4px_20px_rgba(255,107,0,0.3)] cursor-pointer"
                  >
                    {isGuest ? (
                      <span className="text-sm tracking-wide font-black">
                        {isAr ? 'سجّل مجاناً وزايد' : 'Sign up to bid — free'}
                      </span>
                    ) : !isMember ? (
                      <span className="text-sm tracking-wide font-black">
                        {t.joinToBid}
                      </span>
                    ) : submitting ? (
                      <span className="flex items-center gap-2 text-sm tracking-wide font-black">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isAr ? 'جارٍ الإرسال…' : 'Placing bid…'}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm tracking-wide font-black">
                          {getBidButtonText()}
                        </span>
                        <span className="text-[10px] opacity-80 font-bold font-mono mt-0.5">
                          {isAr ? `زايد ${formatMoney(nextBidAmount, 'ar')}` : `Bid ${formatMoney(nextBidAmount, 'en')}`}
                        </span>
                      </>
                    )}
                  </Pressable>
                </div>
                <p className="text-[10px] text-gray-400 text-center">
                  {isAr
                    ? `المجموع عند الفوز: ${formatMoney(totalWithPremium(nextBidAmount), 'ar')} (شامل عمولة المشتري ٥٪)`
                    : `Total if you win: ${formatMoney(totalWithPremium(nextBidAmount), 'en')} (incl. 5% buyer's premium)`}
                </p>
              </>
            )}

            {/* Inline bid confirmation (anchored to the dock, auto-dismisses) */}
            <BidConfirm
              amount={pendingBid}
              isAr={isAr}
              priceMoved={priceMoved}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />

            {/* Winning pill: pops over the dock on a successful bid */}
            <WinningPill show={showWinPill} isAr={isAr} />
          </div>
        </div>
      )}
      {/* END BID DOCK */}

      {/* Complete Seller Profile Modal */}
      {selectedProfileId && (
        <SellerProfileModal
          sellerId={selectedProfileId}
          isOpen={true}
          onClose={() => setSelectedProfileId(null)}
        />
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------
   PERF (Wave 4): memoize the reel.

   Every auctions snapshot rebuilds the whole `auctions` array in AppContext, so
   each reel receives a BRAND-NEW `auction` object reference on every write, and
   the parent also passes fresh inline callbacks each render. Without memo, all
   loaded reels (incl. the off-screen next lot) re-render on every write and —
   before the countdown was isolated — every second.

   This comparator re-renders a reel ONLY when a value it actually renders from
   changes. It deliberately IGNORES the unstable inline callback props
   (onBidExecute, onMuteToggle, onCommentSubmit, …): whenever a value one of them
   closes over matters, a corresponding scalar prop below also changes and forces
   the re-render, so the reel never runs a stale handler. Perf Wave 3c hoisted
   sellerProfile/hasUserBid/winnerOrderId out of the reel's own useApp() reads
   into derived props from the list parent — this comparator MUST compare all
   three explicitly below, or a change (e.g. the winner's order arriving after
   the reel goes quiescent) is silently dropped by memo.
   Return TRUE to SKIP re-render (props considered equal).
   ---------------------------------------------------------------------- */
// Shallow string-array compare — mediaUrls/conciergePhotos get a fresh array
// reference on every snapshot rebuild even when the contents didn't change,
// so a reference check would always force a re-render; compare by value instead.
const sameStringArray = (
  x: (string | null | undefined)[] | null | undefined,
  y: (string | null | undefined)[] | null | undefined
): boolean => {
  if (x === y) return true;
  const xa = x ?? [];
  const ya = y ?? [];
  if (xa.length !== ya.length) return false;
  return xa.every((v, i) => v === ya[i]);
};

export const areReelPropsEqual = (
  prev: Readonly<MobileAuctionReelProps>,
  next: Readonly<MobileAuctionReelProps>
): boolean => {
  const a = prev.auction ?? {};
  const b = next.auction ?? {};
  // Auction fields the reel renders from (compared by value, since the object
  // ref changes on every snapshot even when the content is identical).
  // Includes every field getAuctionMedia() reads (mediaUrls/conciergePhotos
  // added for Wave 2) so a gallery update always triggers a re-render.
  if (
    a.id !== b.id ||
    a.currentPrice !== b.currentPrice ||
    a.endTime !== b.endTime ||
    a.status !== b.status ||
    a.scheduledStartAt !== b.scheduledStartAt ||
    a.currentBidderId !== b.currentBidderId ||
    a.totalBids !== b.totalBids ||
    a.title !== b.title ||
    a.videoUrl !== b.videoUrl ||
    a.thumbnailUrl !== b.thumbnailUrl ||
    a.imageUrl !== b.imageUrl ||
    a.marketPrice !== b.marketPrice ||
    a.minIncrement !== b.minIncrement ||
    a.sellerId !== b.sellerId ||
    !sameStringArray(a.mediaUrls, b.mediaUrls) ||
    !sameStringArray(a.conciergePhotos, b.conciergePhotos)
  ) {
    return false;
  }

  // Scalar props that drive layout / behaviour on this reel.
  if (
    prev.isActive !== next.isActive ||
    prev.shouldLoad !== next.shouldLoad ||
    prev.isMuted !== next.isMuted ||
    prev.isPlaying !== next.isPlaying ||
    prev.activePrice !== next.activePrice ||
    prev.isSaved !== next.isSaved ||
    prev.nextBidAmount !== next.nextBidAmount ||
    prev.language !== next.language ||
    prev.isAr !== next.isAr ||
    prev.hasUserBid !== next.hasUserBid ||
    prev.winnerOrderId !== next.winnerOrderId
  ) {
    return false;
  }

  // sellerProfile is a derived prop (list parent looks it up per-render), so
  // its object reference churns even when nothing the reel actually shows
  // (verification badge, store logo, seller id for the tap target) changed.
  // Compare by the fields read, not by reference.
  const ps = prev.sellerProfile ?? null;
  const ns = next.sellerProfile ?? null;
  if (
    ps?.verificationStatus !== ns?.verificationStatus ||
    ps?.storeLogo !== ns?.storeLogo ||
    ps?.userId !== ns?.userId
  ) {
    return false;
  }

  // Fields of currentUser the reel reads (object ref may churn on profile sync).
  const pu = prev.currentUser ?? {};
  const nu = next.currentUser ?? {};
  if (
    pu.id !== nu.id ||
    pu.isBlocked !== nu.isBlocked ||
    pu.subscriptionStatus !== nu.subscriptionStatus
  ) {
    return false;
  }

  // The chat feed, floating toasts and comment input only render on the ACTIVE
  // reel, so only it needs to react to comment/activity/input churn. Off-screen
  // reels ignore these (their toast-queue effects are irrelevant while hidden).
  if (next.isActive) {
    if (
      prev.activeComments !== next.activeComments ||
      prev.activeActivities !== next.activeActivities ||
      prev.commentText !== next.commentText
    ) {
      return false;
    }
  }

  return true;
};

const MobileAuctionReel = React.memo(MobileAuctionReelBase, areReelPropsEqual);
