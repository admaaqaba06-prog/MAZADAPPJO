/**
 * Pure settlement + numbering helpers. No firebase deps so they are unit-testable
 * under Vitest (node env) and shared by functions/index.js — one source of truth
 * for the reserve rule (avoids the divergent-formula bug class).
 */

/** A reserve is "met" when unset (null/0/undefined) or the price reaches it. */
function reserveMet(finalPrice, reservePrice) {
  if (!reservePrice) return true;
  return finalPrice >= reservePrice;
}

/**
 * Decide how an expired auction settles.
 * - sold: real bids + a winner + reserve met  -> status 'completed' (create order)
 * - reserve_not_met: real bids + winner but under reserve -> 'reserve_not_met' (NO order)
 * - unsold: no bids / no winner -> 'ended'
 */
function resolveSettlement({ totalBids, winnerId, finalPrice, reservePrice }) {
  if (totalBids > 0 && winnerId) {
    if (reserveMet(finalPrice, reservePrice)) {
      return { outcome: 'sold', status: 'completed' };
    }
    return { outcome: 'reserve_not_met', status: 'reserve_not_met' };
  }
  return { outcome: 'unsold', status: 'ended' };
}

/**
 * Allocate the next auction number from a counter's stored value.
 * `current` = counters/auctionNumber.value (the NEXT number to assign).
 * Missing counter -> seed (default 2000).
 */
function nextAuctionNumber(current, seed = 2000) {
  const base = (typeof current === 'number' && Number.isFinite(current)) ? current : seed;
  return { assigned: base, next: base + 1 };
}

// Payment window: hours the winner has to pay before the payment-default
// enforcer blocks them. Set per-auction at creation; falls back to 24h when
// unset (existing auctions, seller self-serve, simulator). Clamped so a
// bad/forged value can never produce an absurd deadline.
const DEFAULT_PAYMENT_WINDOW_HOURS = 24;
const MIN_PAYMENT_WINDOW_HOURS = 1;
const MAX_PAYMENT_WINDOW_HOURS = 168; // 7 days
function resolvePaymentWindowHours(paymentWindowHours) {
  const raw = Number(paymentWindowHours);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PAYMENT_WINDOW_HOURS;
  return Math.min(MAX_PAYMENT_WINDOW_HOURS, Math.max(MIN_PAYMENT_WINDOW_HOURS, Math.round(raw)));
}

// Anti-snipe soft-close: a bid inside the final `window` seconds resets the
// clock to `extend` seconds remaining (reset-to-window, NOT additive), so a
// last-instant snipe can't steal a lot without giving others a fair chance to
// respond. Per-auction (antiSnipeWindowSec/antiSnipeExtendSec), default 30/30,
// clamped so a bad/forged value can't set an absurd window. One source of truth.
const DEFAULT_ANTISNIPE_WINDOW_SEC = 30;
const DEFAULT_ANTISNIPE_EXTEND_SEC = 30;
const MIN_ANTISNIPE_SEC = 5;
const MAX_ANTISNIPE_SEC = 120;
function clampSec(v, def) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(MAX_ANTISNIPE_SEC, Math.max(MIN_ANTISNIPE_SEC, Math.round(n)));
}
function resolveAntiSnipe(auctionData) {
  const d = auctionData || {};
  return {
    windowMs: clampSec(d.antiSnipeWindowSec, DEFAULT_ANTISNIPE_WINDOW_SEC) * 1000,
    extendMs: clampSec(d.antiSnipeExtendSec, DEFAULT_ANTISNIPE_EXTEND_SEC) * 1000,
  };
}
function computeSoftCloseEnd(currentEndMs, nowMs, windowMs, extendMs) {
  const remaining = currentEndMs - nowMs;
  // Soft close only ever EXTENDS. Under an asymmetric config (extend < window)
  // a naive `now + extend` could land before the current end and shorten the
  // auction — never do that; take the later of the two.
  if (remaining > 0 && remaining < windowMs) return Math.max(currentEndMs, nowMs + extendMs);
  return currentEndMs;
}

// Start modes (E3): 'scheduled' (default) runs a fixed window; 'first_bid' goes
// live immediately with NO end time and starts the clock on the FIRST bid
// (endsAt = now + duration). `duration` is in seconds.
const DEFAULT_DURATION_SEC = 1800;
function firstBidStartEndMs(auctionData, nowMs) {
  const raw = Number(auctionData && auctionData.duration);
  const durSec = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEFAULT_DURATION_SEC;
  return nowMs + durSec * 1000;
}

/**
 * The auction's end time AFTER a bid. First bid on a 'first_bid' listing starts
 * the clock (now + duration, no anti-snipe on that opening bid); every other bid
 * applies the anti-snipe soft close to the existing end.
 */
function computeBidEndTime(auctionData, totalBidsBefore, currentEndMs, nowMs) {
  if (auctionData && auctionData.startMode === 'first_bid' && (totalBidsBefore === 0 || !currentEndMs)) {
    return firstBidStartEndMs(auctionData, nowMs);
  }
  const { windowMs, extendMs } = resolveAntiSnipe(auctionData);
  return computeSoftCloseEnd(currentEndMs || nowMs, nowMs, windowMs, extendMs);
}

// Buyer's premium: 5% ADDED on top of the hammer, so a 100 JOD win costs 105.
// Integer fils, rounded once — the money math never touches floats twice.
//
// This used to be inlined as `Math.round(Math.round(price*1000)*0.05)/1000` at
// twelve call sites in index.js (six premium/total pairs). One source of truth
// so the next rate change is a one-line edit, not a twelve-site sweep that
// silently leaves a couple behind.
const BUYER_PREMIUM_RATE = 0.05;
function premiumFils(hammerFils) {
  const h = Math.round(Number(hammerFils) || 0);
  if (h <= 0) return 0;
  return Math.round(h * BUYER_PREMIUM_RATE);
}
function totalDueFils(hammerFils) {
  const h = Math.round(Number(hammerFils) || 0);
  if (h <= 0) return 0;
  return h + premiumFils(h);
}

// JOD-denominated wrappers — orders and n8n payloads carry JOD, not fils. These
// reproduce the old inlined double-round exactly (JOD -> fils -> round -> JOD).
function buyerPremiumJod(hammerJod) {
  return premiumFils(Math.round(Number(hammerJod) * 1000)) / 1000;
}
function totalDueJod(hammerJod) {
  return totalDueFils(Math.round(Number(hammerJod) * 1000)) / 1000;
}

// Seller commission: Mazad's total take is 10% — the 5% BUYER premium above PLUS
// a 5% SELLER commission deducted from the seller's payout, so a 100 JOD hammer
// nets the seller 95. Integer fils, matching the buyer-premium style.
const SELLER_COMMISSION_RATE = 0.05;
function sellerCommissionFils(hammerFils) {
  const h = Math.round(Number(hammerFils) || 0);
  if (h <= 0) return 0;
  return Math.round(h * SELLER_COMMISSION_RATE);
}
function sellerNetFils(hammerFils) {
  const h = Math.round(Number(hammerFils) || 0);
  if (h <= 0) return 0;
  return h - sellerCommissionFils(h);
}

module.exports = {
  reserveMet,
  resolveSettlement,
  nextAuctionNumber,
  SELLER_COMMISSION_RATE,
  sellerCommissionFils,
  sellerNetFils,
  BUYER_PREMIUM_RATE,
  premiumFils,
  totalDueFils,
  buyerPremiumJod,
  totalDueJod,
  resolvePaymentWindowHours,
  DEFAULT_PAYMENT_WINDOW_HOURS,
  MIN_PAYMENT_WINDOW_HOURS,
  MAX_PAYMENT_WINDOW_HOURS,
  resolveAntiSnipe,
  computeSoftCloseEnd,
  firstBidStartEndMs,
  computeBidEndTime,
  DEFAULT_DURATION_SEC,
  DEFAULT_ANTISNIPE_WINDOW_SEC,
  DEFAULT_ANTISNIPE_EXTEND_SEC,
  MIN_ANTISNIPE_SEC,
  MAX_ANTISNIPE_SEC,
};
