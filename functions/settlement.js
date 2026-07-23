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

module.exports = { reserveMet, resolveSettlement, nextAuctionNumber };
