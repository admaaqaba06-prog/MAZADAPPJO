import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Share2, CheckCircle2, Bookmark, MapPin } from 'lucide-react';
import { CountUp, markFirstBidDone, useToast } from './feedback';
import { MediaGallery } from './feedback/MediaGallery';
import { BidSheet } from './auction/BidSheet';
import AuctionRulesModal from './AuctionRulesModal';
import { ChatSection } from './auction/ChatSection';
import { getAuctionMedia } from '../utils/auctionMedia';
import { categoryLabel } from '../utils/categoryLabel';
import { conditionLabel } from '../utils/conditionLabel';
import { serverNow } from '../utils/serverTime';
import { isAwaitingFirstBid } from '../utils/auctionPhase';
import { CountdownPill } from './auction/CountdownPill';
import { useBidFlow, resolveConfirm } from '../hooks/useBidFlow';
import { minNextBid, isViewerWinner } from '../utils/bidMath';
import { priceLabel, bidCtaLabel } from '../utils/bidLabels';
import { resolveAvatarUrl } from '../utils/avatarPlaceholder';
import { useChat } from '../context/AppContext';
import { resolveViewing } from '../utils/viewing';
import { cleanTitle } from '../utils/listingTitle';
import { isJunkDescription } from '../utils/listingDescription';

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

export const MobileAuctionView: React.FC<MobileAuctionViewProps> = ({
  activeAuction,
  activePrice,
  isMuted,
  isPlaying,
  onPlayPauseToggle,
  onShareClick,
  isAr,
  activeActivities,
  commentText,
  setCommentText,
  onCommentSubmit,
  onBidExecute,
  currentUser,
  videoRef,
  onClose,
  onSaveToggle,
  isSaved,
  showToast: feedbackToast,
}) => {
  const reduce = useReducedMotion();
  // `pushToast` = the global toast host (activity toasts below). The
  // `feedbackToast` prop is the PARENT's error/feedback string channel
  // (rejected bid, blocked, ended, watchlist, share) — rendered as a banner.
  const { showToast: pushToast } = useToast();
  // Persistent chat: the full Firestore-backed list, filtered to the active
  // lot — NOT the reel's ephemeral `activeComments` (capped 5 / fades after 7s),
  // so a posted comment stays in the log instead of vanishing.
  const { chatMessages } = useChat();

  // The per-second HH:MM:SS clock now lives in <CountdownPill> (a leaf that
  // owns its own 1s interval) so a tick no longer re-renders this whole page.
  // `ended` (gates the Place-Bid CTA below) is derived from endTime on render —
  // no per-second state here — flipping when the auction crosses its end.
  const ended = activeAuction?.endTime
    ? Math.floor((activeAuction.endTime - serverNow()) / 1000) <= 0
    : false;

  // ONE-SHOT end-flip: since the per-second parent tick is gone (it moved into
  // <CountdownPill>), a quiet lot that expires with no trailing snapshot would
  // never re-render, leaving `ended` stale-false and the CTA enabled while the
  // pill reads "Ended". This fires a SINGLE re-render exactly at endTime so the
  // on-render `ended` derivation above re-evaluates to true — no 1s interval
  // reintroduced. Uses serverNow() (the same clock `ended` compares against, so
  // the timer lands precisely when the derivation crosses). Keyed on the lot +
  // its end/status: an anti-snipe +15s extension or a status flip reschedules
  // it, and it's torn down on change/unmount.
  const [, bumpEnded] = useState(0);
  useEffect(() => {
    if (!activeAuction?.endTime) return;
    const ms = activeAuction.endTime - serverNow();
    if (ms <= 0) return; // already past end — this render already derives ended=true
    if (ms > 2_147_483_647) return; // beyond setTimeout's 32-bit range; re-runs when endTime changes
    const id = window.setTimeout(() => bumpEnded((n) => n + 1), ms + 50);
    return () => window.clearTimeout(id);
  }, [activeAuction?.id, activeAuction?.endTime, activeAuction?.status]);

  // Memoized so the gallery source is rebuilt only when the media fields
  // change — not on every price/bid tick that re-renders this page.
  const media = useMemo(
    () => getAuctionMedia(activeAuction),
    [
      activeAuction?.id,
      activeAuction?.videoUrl,
      activeAuction?.thumbnailUrl,
      activeAuction?.imageUrl,
      activeAuction?.mediaUrls,
      activeAuction?.conciergePhotos,
    ]
  );

  // Persistent chat for the active lot (full log, not the ephemeral overlay).
  // Memoized so the filter re-runs only when the chat log or lot changes.
  const chatForLot = useMemo(
    () => chatMessages.filter((m) => m.auctionId === activeAuction?.id),
    [chatMessages, activeAuction?.id]
  );

  // Trust / spec chips (real fields only — never fabricated).
  const isInspected = activeAuction?.approvalStatus === 'approved';
  // Shared with the desktop product-info row (utils/conditionLabel) so the two
  // surfaces cannot drift. Null for unset/unknown — the chip is then omitted.
  const conditionChip = conditionLabel(activeAuction?.condition, isAr);
  const categoryChip = activeAuction?.category
    ? categoryLabel(activeAuction.category, isAr)
    : null;
  // Per-lot viewing. Null for private/unset — the row simply omits the chip
  // rather than stating a location this lot never had.
  const viewingChip = resolveViewing(activeAuction, isAr);

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
  const [rulesOpen, setRulesOpen] = useState(false); // E4 — Auction Rules modal
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
    requestSignIn,
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

  // ----- Activity toasts (mockup mini-toasts) -----
  // Transition-detection via refs so we NEVER toast on first render/mount: we
  // seed the refs on the first observation, then fire only when a value crosses
  // a boundary (price up = a new bid; winner→not = outbid; reserve becomes met).
  // A single 2s debounce keeps rapid-fire bids to ~one toast, and outbid /
  // reserve take priority over the generic "new bid" toast in the same tick.
  const viewerId = currentUser?.id;
  const isWinner = isViewerWinner(activeAuction, viewerId);
  const prevPriceRef = useRef<number | null>(null);
  const prevWinnerRef = useRef<boolean | null>(null);
  const reserveToastedRef = useRef(false);
  const lastToastAtRef = useRef(0);
  const toastSeededRef = useRef(false);

  // Reset the per-lot toast transition refs when the active lot changes (e.g.
  // auto-jump when the viewed lot ends, or a deep-link nav). Declared BEFORE the
  // toast effect so on a lot switch it un-seeds first; the toast effect then
  // re-seeds against the new lot instead of firing a false "outbid"/"new bid"
  // from carried-over state. (MediaGallery index/state is reset via its `key`.)
  useEffect(() => {
    toastSeededRef.current = false;
    prevPriceRef.current = null;
    prevWinnerRef.current = null;
    reserveToastedRef.current = false;
    lastToastAtRef.current = 0;
  }, [activeAuction?.id]);

  useEffect(() => {
    const price = activePrice;
    const prevPrice = prevPriceRef.current;
    const prevWinner = prevWinnerRef.current;

    // First observation: seed refs, do NOT toast.
    if (!toastSeededRef.current) {
      toastSeededRef.current = true;
      prevPriceRef.current = price;
      prevWinnerRef.current = isWinner;
      reserveToastedRef.current = activeAuction?.reserveMet === true;
      return;
    }

    const now = Date.now();
    if (now - lastToastAtRef.current >= 2000) {
      const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
      const jod = isAr ? 'د.أ' : 'JOD';
      if (prevWinner === true && !isWinner && viewerId) {
        // Viewer was the top bidder and just lost the lead.
        pushToast({
          title: isAr ? '⚠️ تمت المزايدة عليك' : '⚠️ You were outbid',
          message: isAr
            ? `المزايدة الآن ${fmt(price)} ${jod}`
            : `Bid is now ${fmt(price)} ${jod}`,
          type: 'warn',
        });
        lastToastAtRef.current = now;
      } else if (!reserveToastedRef.current && activeAuction?.reserveMet === true) {
        // Reserve just became met — fire once.
        reserveToastedRef.current = true;
        pushToast({
          title: isAr ? '✅ تم بلوغ السعر الاحتياطي' : '✅ Reserve met',
          type: 'success',
        });
        lastToastAtRef.current = now;
      } else if (
        prevPrice != null &&
        price > prevPrice &&
        activeAuction?.currentBidderId !== viewerId
      ) {
        // A RIVAL bid landed — never toast the viewer's own bid (the optimistic
        // paint raises the price for the viewer too; only OTHER bidders toast).
        const name =
          activeAuction?.currentBidderName || (isAr ? 'مزايد' : 'A bidder');
        pushToast({
          title: isAr
            ? `🔥 ${name} زايد ${fmt(price)} ${jod}`
            : `🔥 ${name} just bid ${fmt(price)} ${jod}`,
          type: 'info',
        });
        lastToastAtRef.current = now;
      }
    }

    prevPriceRef.current = price;
    prevWinnerRef.current = isWinner;
    // activeActivities.length is included so a bid that arrives via the activity
    // stream (without a distinct price object identity) still re-runs the check.
  }, [
    activePrice,
    isWinner,
    activeAuction?.reserveMet,
    activeAuction?.currentBidderName,
    activeAuction?.currentBidderId,
    activeActivities.length,
    isAr,
    viewerId,
    pushToast,
  ]);

  return (
    <div
      className="w-full h-full flex flex-col bg-surface-raised text-fg font-alexandria"
      dir={isAr ? 'rtl' : 'ltr'}
      id="mobile-auction-view"
    >
      {/* Parent feedback banner — the ONLY surface for a rejected/blocked/ended
          bid, watchlist and share messages (parent's showToast string). Without
          it a rejected bid's optimistic price bumps then reverts with no
          explanation. Mirrors DesktopLiveAuctionLayout's banner. */}
      {feedbackToast && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#E85D04] text-white px-5 py-2.5 rounded-xl text-[12px] font-black tracking-wide shadow-lg animate-fade-in text-center border border-white/10 max-w-[90%]"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          role="status"
          aria-live="polite"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {feedbackToast}
        </div>
      )}

      {/* ================= STICKY TOP BAR ================= */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-surface-raised/95 backdrop-blur-md border-b border-line"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-fg active:scale-95 transition-transform cursor-pointer"
          aria-label={isAr ? 'إغلاق' : 'Close'}
        >
          <BackIcon className="w-5 h-5" />
        </button>
        <span className="text-[11.5px] font-extrabold text-fg-muted tracking-wide">
          {isAr ? 'بث مباشر' : 'Live drop'}
        </span>
        <button
          type="button"
          onClick={onShareClick}
          className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-fg active:scale-95 transition-transform cursor-pointer"
          aria-label={isAr ? 'مشاركة' : 'Share'}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* ================= SCROLLABLE BODY ================= */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-28">
        {/* ----- MEDIA ----- */}
        {/* A fixed RATIO, not a fixed pixel height. `h-[300px]` made the stage's
            shape depend on the device: 375/300 = 1.25 on a small phone, 1.43 on
            a large one, wider still on a tablet — so the same lot was framed
            differently on every screen, and with `object-cover` it was also
            cropped by a different amount on each. 3:4 is the ratio the Discover
            cards already use, so a lot keeps its shape from the feed into the
            lot page. Black is kept deliberately: the letterbox bars must not
            flip with the theme, the same reason the desktop stage is black. */}
        {/* `max-h-[62vh]` is the floor under the price, not a style choice. At a
            strict 3:4 the stage is 480px tall on a 360×640 phone — the size this
            app targets — which pushed the price and the countdown 23px BELOW the
            fold. On an auction the price is the one thing that must never need a
            scroll, so on a short viewport the stage clamps and gives that height
            back. Tall phones are unaffected: 375×812 wants 469px and the cap is
            503px, so the ratio holds exactly where nearly all traffic sits.
            A strict single ratio on every screen would need 4:5 instead. */}
        <div className="relative w-full aspect-[3/4] max-h-[62vh] bg-black" id="mobile-auction-media">
          <MediaGallery
            key={activeAuction?.id}
            items={media}
            isActive
            isPlaying={isPlaying && !reduce}
            isMuted={isMuted}
            isAr={isAr}
            videoRef={videoRef}
            onVideoClick={onPlayPauseToggle}
            expandable
            autoAdvancePhotos={!reduce}
            className="absolute inset-0"
          />
          {/* Activity toasts (bid landed / outbid / reserve met) surface via the
              global <ToastProvider> stack, wired in the effect above — not
              overlaid on the media. */}
        </div>

        {/* ----- TITLE + TRUST CHIPS ----- */}
        <div className="px-4 pt-4">
          <h1 className="text-[19px] font-black tracking-tight text-fg leading-tight">
            {cleanTitle(activeAuction?.title)}
          </h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {isInspected && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#12B76A]/12 text-success">
                <CheckCircle2 className="w-3 h-3" />
                {isAr ? 'صور حقيقية ✓' : 'Real photos ✓'}
              </span>
            )}
            {categoryChip && (
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-surface text-fg-muted">
                {categoryChip}
              </span>
            )}
            {conditionChip && (
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-surface text-fg-muted">
                {conditionChip}
              </span>
            )}
            {/* max-w-full + truncate: unlike its siblings (New/Used/category,
                short by construction) this label interpolates an admin-entered
                place, so without a clamp a long one wraps INSIDE the pill and
                rounded-full renders as a multi-line lozenge. title= keeps the
                full text reachable. */}
            {viewingChip && (
              <span
                title={viewingChip.label}
                className="inline-flex items-center gap-1 max-w-full text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-surface text-fg-muted"
              >
                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{viewingChip.label}</span>
              </span>
            )}
          </div>

          {/* ----- BID BLOCK (one card) ----- */}
          <div className="mt-3 border border-line rounded-2xl p-3.5">
            <div className="flex items-end justify-between">
              <div>
                <span className="block text-[10px] font-bold text-fg-muted uppercase tracking-wide">
                  {priceLabel(activeAuction?.totalBids, isAr)}
                </span>
                <div className="text-[24px] font-black text-fg leading-none" dir="ltr">
                  {reduce ? (
                    Math.round(activePrice).toLocaleString('en-US')
                  ) : (
                    <CountUp
                      value={activePrice}
                      format={(n) => Math.round(n).toLocaleString('en-US')}
                    />
                  )}{' '}
                  <small className="text-[12px] font-extrabold text-fg-muted">
                    {isAr ? 'د.أ' : 'JOD'}
                  </small>
                </div>
              </div>
              <div className="text-end">
                {/* E3 first_bid: a clockless lot renders "Awaiting first bid"
                    in the value slot, so the label must NOT say "Ends in" —
                    same Status/الحالة swap DesktopLiveAuctionLayout uses. */}
                <span className="block text-[10px] font-bold text-fg-muted uppercase tracking-wide">
                  {isAwaitingFirstBid(activeAuction)
                    ? (isAr ? 'الحالة' : 'Status')
                    : (isAr ? 'ينتهي خلال' : 'Ends in')}
                </span>
                {/* The value slot is sized for `01:23:45`; the awaiting label
                    is a ~18-char sentence that wraps out of the row at 16px,
                    so ONLY that state gets a smaller size. */}
                <CountdownPill
                  variant="mobile"
                  endTime={activeAuction?.endTime}
                  status={activeAuction?.status}
                  isAr={isAr}
                  awaitingFirstBid={isAwaitingFirstBid(activeAuction)}
                  className={
                    isAwaitingFirstBid(activeAuction)
                      ? 'text-[13px] font-black text-[#F05123] leading-tight'
                      : 'text-[16px] font-black text-[#F05123] tabular-nums'
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-line text-[11px] font-semibold text-fg-muted">
              <span dir="ltr">
                🔥 {activeAuction?.totalBids || 0} {isAr ? 'مزايدة' : 'bids'}
              </span>
              {activeAuction?.reserveMet === true ? (
                <span className="text-success">
                  {isAr ? 'تم بلوغ الاحتياطي ✓' : 'Reserve met ✓'}
                </span>
              ) : activeAuction?.reserveMet === false ? (
                <span className="text-warning">
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
          <div className="mt-3 text-[12px] font-bold text-fg-muted">
            {isAr ? '▾ التفاصيل · البائع · المحادثة' : '▾ Details · Seller · Chat'}
          </div>

          {/* ----- DETAILS / SELLER (real fields only) ----- */}
          <section className="mt-4" id="mobile-auction-details">
            <h2 className="text-[13px] font-black text-fg tracking-tight">
              {isAr ? 'التفاصيل' : 'Details'}
            </h2>

            {(() => {
              // A description that only repeats the title is not a description:
              // 102 live lots carry an exact copy, and `dropPayload.ts` still
              // writes `description: input.productName.trim()` for every admin
              // drop, so this renders the title again directly under the title.
              // Trimmed, so '' (which the concierge form now writes on purpose)
              // and whitespace-only both vanish rather than leaving a blank <p>.
              const text = String(activeAuction?.description || '').trim();
              if (isJunkDescription(text, activeAuction?.title)) return null;
              return (
                <p className="mt-2 text-[13px] leading-relaxed text-fg-muted whitespace-pre-line">
                  {text}
                </p>
              );
            })()}

            <dl className="mt-3 divide-y divide-line border-y border-line text-[12px]">
              {conditionChip && (
                <div className="flex items-center justify-between py-2.5">
                  {/* حالة المنتج, not الحالة: the price row above now labels the
                      awaiting-first-bid STATUS الحالة, and two different rows on
                      one screen reading الحالة is ambiguous in Arabic. Matches
                      SellView's condition field (`حالة المنتج`) and the desktop
                      product row. English is unaffected. */}
                  <dt className="font-bold text-fg-muted">
                    {isAr ? 'حالة المنتج' : 'Condition'}
                  </dt>
                  <dd className="font-bold text-fg">{conditionChip}</dd>
                </div>
              )}
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-bold text-fg-muted">{isAr ? 'المرجع' : 'Ref'}</dt>
                <dd className="font-bold text-fg tabular-nums" dir="ltr">
                  {activeAuction?.auctionNumber
                    ? `#${activeAuction.auctionNumber}`
                    : activeAuction?.id}
                </dd>
              </div>
            </dl>

            {/* Seller card — real auction seller fields. No seller-modal handler
                is passed to this view, so the card is non-interactive (per spec:
                open the modal only via an existing handler, else omit). Save uses
                the shared onSaveToggle/isSaved props. */}
            {activeAuction?.sellerName && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={resolveAvatarUrl(activeAuction.sellerLogo, activeAuction.sellerId)}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover border border-line shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="block text-[12.5px] font-black text-fg truncate leading-tight">
                      {activeAuction.sellerName}
                    </span>
                    <span className="block text-[10px] font-bold text-[#F05123] leading-none mt-1">
                      {isAr ? 'بائع في مزادو' : 'Seller on Mazzado'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSaveToggle}
                  className="w-9 h-9 rounded-full bg-surface flex items-center justify-center shrink-0 active:scale-95 transition-transform cursor-pointer"
                  aria-label={isAr ? 'حفظ' : 'Save'}
                  aria-pressed={isSaved}
                >
                  <Bookmark
                    className={`w-4 h-4 ${
                      isSaved ? 'text-[#F05123] fill-[#F05123]' : 'text-fg'
                    }`}
                  />
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ----- CHAT SECTION (working composer + live messages) ----- */}
        <ChatSection
          messages={chatForLot}
          commentText={commentText}
          setCommentText={setCommentText}
          onCommentSubmit={onCommentSubmit}
          isGuest={isGuest}
          requestSignIn={requestSignIn}
          isAr={isAr}
        />
      </div>

      {/* ================= STICKY PLACE-BID CTA ================= */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 px-4 pt-3 pb-4 bg-gradient-to-t from-[var(--color-surface-raised)] via-[var(--color-surface-raised)] to-transparent"
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
            : bidCtaLabel(activeAuction?.totalBids, isAr)}
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
        onOpenRules={() => setRulesOpen(true)}
      />

      {/* E4 — Auction Rules modal (opened from the bid sheet's "Rules" affordance) */}
      <AuctionRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} isAr={isAr} />
    </div>
  );
};

export default MobileAuctionView;
