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

// Seller commission: Mazad's total take is 10% — a 5% BUYER premium (added to the
// winner's total, computed elsewhere) PLUS a 5% SELLER commission deducted from the
// seller's payout, so a 100 JOD hammer nets the seller 95. Integer fils, matching the
// double-round style used for the buyer premium.
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
  resolvePaymentWindowHours,
  DEFAULT_PAYMENT_WINDOW_HOURS,
  MIN_PAYMENT_WINDOW_HOURS,
  MAX_PAYMENT_WINDOW_HOURS,
  resolveAntiSnipe,
  computeSoftCloseEnd,
  DEFAULT_ANTISNIPE_WINDOW_SEC,
  DEFAULT_ANTISNIPE_EXTEND_SEC,
  MIN_ANTISNIPE_SEC,
  MAX_ANTISNIPE_SEC,
};
