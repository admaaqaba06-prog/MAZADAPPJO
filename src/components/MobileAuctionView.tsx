import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Share2, CheckCircle2 } from 'lucide-react';
import { CountUp, markFirstBidDone } from './feedback';
import { MediaGallery } from './feedback/MediaGallery';
import { BidSheet } from './auction/BidSheet';
import { getAuctionMedia } from '../utils/auctionMedia';
import { categoryLabel } from '../utils/categoryLabel';
import { serverNow } from '../utils/serverTime';
import { useBidFlow, resolveConfirm } from '../hooks/useBidFlow';
import { minNextBid } from '../utils/bidMath';

/* ======================================================================
   MobileAuctionView — the mobile product-drop PAGE (replaces the TikTok-
   Live reel). A vertically scrollable page, NOT a snap-scroll reel:
   sticky top bar → autoplaying media → title + trust chips → one
   price/time/bids block → (Task 5) Place-Bid sheet → (Task 6) chat.

   This task (Task 4) builds the scaffold: page structure, media, header,
   and the info/bid-summary block driven by REAL auction fields. The
   Place-Bid sheet and the working chat section are STUBBED here (a
   placeholder sticky CTA + a "chat below" anchor) and land in Tasks 5/6.

   Drop-in contract: the prop interface is byte-identical to
   MobileLiveAuctionLayoutProps so it swaps 1:1 in LiveStreamView's
   `isMobile ?` switch. Unused props (Task 5/6 wiring) are accepted now.
   ====================================================================== */

interface MobileAuctionViewProps {
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

/** Format a remaining-seconds count as HH:MM:SS (LTR numerals). */
const formatCountdown = (totalSecs: number): string => {
  const s = Math.max(0, totalSecs);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const MobileAuctionView: React.FC<MobileAuctionViewProps> = ({
  activeAuction,
  activePrice,
  isMuted,
  isPlaying,
  onPlayPauseToggle,
  onShareClick,
  isAr,
  onBidExecute,
  currentUser,
  videoRef,
  onClose,
}) => {
  const reduce = useReducedMotion();

  // ----- Single per-page countdown (ONE setInterval, cleaned up) -----
  // Today's reel screen runs ~4 timers; the product page runs exactly one.
  const [timeLeft, setTimeLeft] = useState<string>(() =>
    activeAuction?.endTime
      ? formatCountdown(Math.floor((activeAuction.endTime - serverNow()) / 1000))
      : '00:00:00'
  );
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const end = activeAuction?.endTime;
    if (!end) {
      setTimeLeft('00:00:00');
      setEnded(false);
      return;
    }
    const tick = () => {
      const remaining = Math.floor((end - serverNow()) / 1000);
      if (remaining <= 0) {
        setTimeLeft('00:00:00');
        setEnded(true);
      } else {
        setTimeLeft(formatCountdown(remaining));
        setEnded(false);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeAuction?.endTime]);

  const media = getAuctionMedia(activeAuction);

  // Trust / spec chips (real fields only — never fabricated).
  const isInspected = activeAuction?.approvalStatus === 'approved';
  const conditionChip =
    activeAuction?.condition === 'new'
      ? isAr
        ? 'جديد'
        : 'New'
      : activeAuction?.condition === 'used'
        ? isAr
          ? 'مستعمل'
          : 'Used'
        : null;
  const categoryChip = activeAuction?.category
    ? categoryLabel(activeAuction.category, isAr)
    : null;

  const BackIcon = isAr ? ChevronRight : ChevronLeft;

  // ----- Place-Bid flow (mockup frame 2) -----
  // Minimum next bid + increment, recomputed each render from the LIVE auction
  // fields (currentPrice/totalBids update via the Firestore subscription), so
  // `minNext` is always the latest minimum — the confirm step re-prompts against
  // it if a rival outbids during the confirm window (resolveConfirm below).
  const minNext = minNextBid(
    activeAuction?.currentPrice ?? 0,
    activeAuction?.minIncrement,
    activeAuction?.totalBids ?? 0
  );
  const inc = activeAuction?.minIncrement && activeAuction.minIncrement > 0
    ? activeAuction.minIncrement
    : 10;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [priceMoved, setPriceMoved] = useState(false);
  const [showWinPill, setShowWinPill] = useState(false);
  const winPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (winPillTimer.current) clearTimeout(winPillTimer.current);
  }, []);

  // Execute wraps the parent's onBidExecute (=executeBid → placeBid) ONLY to
  // surface UI feedback (win pill + retire the first-bid coach) on success. It
  // adds NO optimistic price layer — the parent already owns the optimistic
  // paint + server round-trip; the bid still calls onBidExecute(amount) exactly
  // as it does today.
  const executeBid = async (amount: number) => {
    const res = await onBidExecute(amount);
    if (res && res.success) {
      markFirstBidDone();
      setShowWinPill(true);
      if (winPillTimer.current) clearTimeout(winPillTimer.current);
      winPillTimer.current = setTimeout(() => setShowWinPill(false), 1200);
    }
    return res;
  };

  const {
    isGuest,
    pendingBid,
    submitting,
    startBid,
    confirmBid,
    cancelBid,
  } = useBidFlow(executeBid);

  // Stage a chosen amount through the shared gate (guest→signup / membership /
  // photo), resetting any stale "price moved" flag first.
  const stageBid = (amount: number) => {
    setPriceMoved(false);
    startBid(amount);
  };

  // At confirm, recompute against the LATEST minimum: a rival outbid during the
  // ≤10s confirm window bumps minNext above the staged amount, so re-prompt at
  // the fresh minimum instead of sending a stale amount the server would reject.
  const handleConfirm = (amount: number) => {
    const decision = resolveConfirm(amount, minNext);
    if (decision.action === 'reprompt') {
      setPriceMoved(true);
      startBid(decision.amount);
      return;
    }
    setPriceMoved(false);
    confirmBid(decision.amount);
    setSheetOpen(false);
  };

  const handleCancel = () => {
    setPriceMoved(false);
    cancelBid();
  };

  // Sticky CTA: a guest taps straight into the signup gate (startBid routes it);
  // a signed-in viewer opens the bid sheet.
  const onPlaceBidTap = () => {
    if (ended) return;
    if (isGuest) {
      stageBid(minNext);
      return;
    }
    setSheetOpen(true);
  };

  const showCoach =
    currentUser?.subscriptionStatus === 'active' && sheetOpen;

  return (
    <div
      className="w-full h-full flex flex-col bg-white text-[#0A0A0A] font-alexandria"
      dir={isAr ? 'rtl' : 'ltr'}
      id="mobile-auction-view"
    >
      {/* ================= STICKY TOP BAR ================= */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-[#ECECEA]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#F7F7F7] flex items-center justify-center text-[#333] active:scale-95 transition-transform cursor-pointer"
          aria-label={isAr ? 'إغلاق' : 'Close'}
        >
          <BackIcon className="w-5 h-5" />
        </button>
        <span className="text-[11.5px] font-extrabold text-[#999] tracking-wide">
          {isAr ? 'بث مباشر' : 'Live drop'}
        </span>
        <button
          type="button"
          onClick={onShareClick}
          className="w-9 h-9 rounded-full bg-[#F7F7F7] flex items-center justify-center text-[#333] active:scale-95 transition-transform cursor-pointer"
          aria-label={isAr ? 'مشاركة' : 'Share'}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* ================= SCROLLABLE BODY ================= */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-28">
        {/* ----- MEDIA ----- */}
        <div className="relative w-full h-[300px] bg-black" id="mobile-auction-media">
          <MediaGallery
            items={media}
            isActive
            isPlaying={isPlaying}
            isMuted={isMuted}
            isAr={isAr}
            videoRef={videoRef}
            onVideoClick={onPlayPauseToggle}
            expandable
            autoAdvancePhotos={!reduce}
            className="absolute inset-0"
          />
          {/* Small activity-toast spot over the media. Full activity toasts
              (bid landed / outbid / reserve met) arrive in Task 6 — this is a
              simple, motion-free placeholder anchor for now. */}
          <div
            className="pointer-events-none absolute bottom-3 z-20"
            style={{ insetInlineStart: '12px' }}
            id="mobile-auction-activity-toast"
          />
        </div>

        {/* ----- TITLE + TRUST CHIPS ----- */}
        <div className="px-4 pt-4">
          <h1 className="text-[19px] font-black tracking-tight text-[#0A0A0A] leading-tight">
            {activeAuction?.title}
          </h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {isInspected && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#12B76A]/12 text-[#0a7a48]">
                <CheckCircle2 className="w-3 h-3" />
                {isAr ? 'مفحوص من مزادو ✓' : 'Inspected by Mazad ✓'}
              </span>
            )}
            {categoryChip && (
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#F7F7F7] text-[#444]">
                {categoryChip}
              </span>
            )}
            {conditionChip && (
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#F7F7F7] text-[#444]">
                {conditionChip}
              </span>
            )}
          </div>

          {/* ----- BID BLOCK (one card) ----- */}
          <div className="mt-3 border border-[#ECECEA] rounded-2xl p-3.5">
            <div className="flex items-end justify-between">
              <div>
                <span className="block text-[10px] font-bold text-[#999] uppercase tracking-wide">
                  {isAr ? 'المزايدة الحالية' : 'Current bid'}
                </span>
                <div className="text-[24px] font-black text-[#0A0A0A] leading-none" dir="ltr">
                  {reduce ? (
                    Math.round(activePrice).toLocaleString('en-US')
                  ) : (
                    <CountUp
                      value={activePrice}
                      format={(n) => Math.round(n).toLocaleString('en-US')}
                    />
                  )}{' '}
                  <small className="text-[12px] font-extrabold text-[#666]">
                    {isAr ? 'د.أ' : 'JOD'}
                  </small>
                </div>
              </div>
              <div className="text-end">
                <span className="block text-[10px] font-bold text-[#999] uppercase tracking-wide">
                  {isAr ? 'ينتهي خلال' : 'Ends in'}
                </span>
                <div
                  className="text-[16px] font-black text-[#F05123] tabular-nums"
                  dir="ltr"
                >
                  {ended ? (isAr ? 'انتهى' : 'Ended') : timeLeft}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#ECECEA] text-[11px] font-semibold text-[#666]">
              <span dir="ltr">
                🔥 {activeAuction?.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}
              </span>
              {activeAuction?.reserveMet === true ? (
                <span className="text-[#0a7a48]">
                  {isAr ? 'تم بلوغ الاحتياطي ✓' : 'Reserve met ✓'}
                </span>
              ) : activeAuction?.reserveMet === false ? (
                <span className="text-[#F0A500]">
                  {isAr ? 'لم يُبلغ الاحتياطي' : 'Reserve not met'}
                </span>
              ) : (
                <span />
              )}
              {activeAuction?.currentBidderName && (
                <span>
                  {isAr ? 'الأعلى: ' : 'Top: '}
                  {activeAuction.currentBidderName}
                </span>
              )}
            </div>
          </div>

          {/* Scroll cue toward the details/seller/chat sections below. */}
          <div className="mt-3 text-[12px] font-bold text-[#999]">
            {isAr ? '▾ التفاصيل · البائع · المحادثة' : '▾ Details · Seller · Chat'}
          </div>
        </div>

        {/* ----- CHAT SECTION STUB (real composer + messages = Task 6) ----- */}
        <div
          className="mt-4 mx-4 border-t border-[#ECECEA] pt-4"
          id="mobile-auction-chat"
        >
          <h2 className="text-[15px] font-black text-[#0A0A0A]">
            {isAr ? 'المحادثة' : 'Chat'}
          </h2>
          <p className="text-[11.5px] text-[#999] font-medium mt-1">
            {isAr ? 'المحادثة قريباً' : 'Chat coming below'}
          </p>
        </div>
      </div>

      {/* ================= STICKY PLACE-BID CTA ================= */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 px-4 pt-3 pb-4 bg-gradient-to-t from-white via-white to-transparent"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
      >
        <button
          type="button"
          disabled={ended}
          onClick={onPlaceBidTap}
          className="w-full py-3.5 rounded-2xl bg-[#F05123] text-white font-black text-[15px] flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(240,81,35,0.32)] disabled:opacity-50 active:scale-[0.99] transition-transform cursor-pointer"
        >
          {isGuest
            ? (isAr ? 'سجّل مجاناً وزايد' : 'Sign up to bid')
            : (isAr ? 'قدّم مزايدة' : 'Place Bid')}
          {!isGuest && (
            <small className="font-bold opacity-85 text-[12px]" dir="ltr">
              · {Math.round(minNext).toLocaleString('en-US')} {isAr ? 'د.أ' : 'JOD'} ›
            </small>
          )}
        </button>
      </div>

      {/* ================= PLACE-BID SHEET (mockup frame 2) ================= */}
      <BidSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          if (pendingBid != null) cancelBid();
        }}
        isAr={isAr}
        reduce={!!reduce}
        currentPrice={activePrice}
        minNext={minNext}
        inc={inc}
        submitting={submitting}
        onStage={stageBid}
        pendingBid={pendingBid}
        priceMoved={priceMoved}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        showCoach={showCoach}
        showWinPill={showWinPill}
      />
    </div>
  );
};

export default MobileAuctionView;
