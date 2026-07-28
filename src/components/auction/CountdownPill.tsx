import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { serverNow } from '../../utils/serverTime';
import { isAuctionOpen } from '../../utils/auctionPhase';
import { formatCountdown } from '../../utils/bidFormat';

/* ======================================================================
   CountdownPill — the always-visible HH:MM:SS pill, isolated into a LEAF
   (Wave 4 / render perf). It owns its OWN 1s interval computing timeLeft
   from the auction's endTime (relative to server time), so a per-second
   tick re-renders ONLY this tiny component — the parent auction layouts no
   longer re-render every second. This does NOT replace the final-countdown
   full-screen overlay (AuctionCountdownLayer) — only the inline pill.

   Two variants, byte-identical to the markup they replace:
   - 'mobile'  : plain orange HH:MM:SS (or "Ended"), no pulse. Only counts
                 down to endTime.
   - 'desktop' : red-pulsing snipe animation under 10s (else emerald), plus
                 the pre-open branch that counts down to scheduledStartAt and
                 the T-0 "Starting…" dead-zone string.

   PF7: the interval is keyed on the PRIMITIVES it actually reads (endTime /
   status / scheduledStartAt), NOT the auction object identity — a bid on any
   lot must not tear down / rebuild the interval mid-snipe-window. ⚠️TIMING:
   endTime MUST stay in the key (anti-snipe +15s extension restarts the clock),
   status for the live→completed flip, scheduledStartAt for a reschedule.
   ====================================================================== */

interface CountdownPillProps {
  endTime: number;
  status: string;
  isAr: boolean;
  className?: string;
  variant: 'mobile' | 'desktop';
  /** Desktop pre-open lots count down to their scheduled start instead of endTime. */
  scheduledStartAt?: number;
  /**
   * E3 Slice A — a live 'first_bid' lot whose clock hasn't started (no endTime,
   * no bids yet): show "Awaiting first bid" instead of a timer. See
   * utils/auctionPhase.isAwaitingFirstBid.
   */
  awaitingFirstBid?: boolean;
}

export const CountdownPill: React.FC<CountdownPillProps> = ({
  endTime,
  status,
  isAr,
  className,
  variant,
  scheduledStartAt,
  awaitingFirstBid = false,
}) => {
  // A single per-second `now` drives every derived value below; this leaf
  // re-renders once per second (by design), the parent layout does not.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    setNow(serverNow()); // resync immediately when the target/status changes
    const id = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(id);
    // Primitive deps only (PF7) — no teardown on unrelated re-renders.
  }, [endTime, status, scheduledStartAt]);

  if (awaitingFirstBid) {
    // E3 first_bid: the clock hasn't started — no timer, just the awaiting label.
    return (
      <span className={className} dir={isAr ? 'rtl' : 'ltr'}>
        {isAr ? 'بانتظار أول مزايدة' : 'Awaiting first bid'}
      </span>
    );
  }

  if (variant === 'mobile') {
    // Mobile counts down to endTime only. When there is no endTime, show
    // 00:00:00 (not "Ended"), matching the previous layout behavior.
    const hasEnd = !!endTime;
    const remaining = hasEnd ? Math.floor((endTime - now) / 1000) : 0;
    const ended = hasEnd && remaining <= 0;
    return (
      <div className={className} dir="ltr">
        {ended ? (isAr ? 'انتهى' : 'Ended') : formatCountdown(remaining, isAr)}
      </div>
    );
  }

  // Desktop: pre-open auctions count down to their scheduled start; open
  // auctions count down to the end.
  const open = isAuctionOpen(status);
  const target = !open && scheduledStartAt ? scheduledStartAt : endTime;
  const remainingMs = (target ?? 0) - now;
  const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000));

  let display: string;
  if (!open && (scheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
    // T-0 dead zone: scheduled start has passed but the opener cron hasn't flipped it live yet.
    display = isAr ? 'يبدأ الآن…' : 'Starting…';
  } else if (remainingSecs > 0) {
    display = formatCountdown(remainingSecs, isAr);
  } else {
    // Clamp at zero: the server closer flips the status shortly.
    display = isAr ? 'انتهى المزاد' : 'Auction ended';
  }

  // Anti-snipe drama: red pulsing countdown under 10s (uses Date.now() +
  // endTime exactly as the desktop layout did, so the pulse threshold is
  // unchanged). Recomputed each tick because this leaf re-renders every second.
  const msLeft = endTime ? endTime - Date.now() : Infinity;
  const isSnipeWindow =
    open && Number.isFinite(msLeft) && msLeft > 0 && msLeft < 10000;

  return (
    <motion.span
      animate={isSnipeWindow ? { scale: [1, 1.1, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
      transition={isSnipeWindow ? { duration: 1, ease: 'easeOut', repeat: Infinity } : { duration: 0.2, ease: 'easeOut' }}
      className={`${className ?? ''}${className ? ' ' : ''}${isSnipeWindow ? 'text-red-500' : 'text-emerald-500'}`}
    >
      {display}
    </motion.span>
  );
};

export default CountdownPill;
