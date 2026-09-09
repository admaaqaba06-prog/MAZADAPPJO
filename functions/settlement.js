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

// ---------------------------------------------------------------------------
// Reserve tolerance ("near miss" band)
// ---------------------------------------------------------------------------
// A top bid that lands just under the reserve is worth putting to the seller; a
// top bid that is nowhere near it is not, and pestering the seller about it just
// trains them to ignore the prompt. The tolerance is the width of that band,
// as a PERCENTAGE OF THE RESERVE: 10% on a 1,000 JOD reserve puts the floor at
// 900 JOD.
//
// WHERE THIS IS ENFORCED — and where it deliberately is NOT. This is a
// SETTLEMENT-TIME gate. It decides whether an ended, reserve-not-met auction
// opens a belowReserveOffer. It is NOT a bid-time gate: rejecting live bids
// under the floor would make it impossible to bid a lot UP to its reserve (a
// lot opening at 50 with a 1,000 reserve would refuse every bid under 900), and
// the rejection itself would tell the bidder the reserve to within the
// tolerance band. The floor is never sent to a client, at any point.
const DEFAULT_RESERVE_TOLERANCE_PCT = 10;
const MIN_RESERVE_TOLERANCE_PCT = 0;
const MAX_RESERVE_TOLERANCE_PCT = 50;

/**
 * Per-auction tolerance override (`reserveTolerancePct`), clamped, defaulting to
 * 10%. Clamped rather than trusted because the field sits on the auction doc,
 * which admins write from a browser: 0 disables the band (only an exact-reserve
 * bid qualifies... which means nothing does, since that is 'reserve met'), and
 * anything past 50% would offer the seller half their reserve.
 */
function resolveReserveTolerancePct(auctionData) {
  // `?? undefined` matters: without it a null/absent auction doc reaches
  // Number(null) === 0, which is finite and non-negative, so the guard below
  // accepts it and returns a 0% band. That silently means "only a bid at the
  // exact reserve is a near miss" — i.e. no offer ever opens — which is the
  // opposite of the default, and it would fail silently.
  const raw = Number(auctionData?.reserveTolerancePct ?? undefined);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_RESERVE_TOLERANCE_PCT;
  return Math.min(MAX_RESERVE_TOLERANCE_PCT, Math.max(MIN_RESERVE_TOLERANCE_PCT, Math.round(raw)));
}

/**
 * The lowest bid, in integer fils, that still counts as a near miss.
 *
 * MONEY SAFETY: `reserveFils * (100 - pct)` is exact integer arithmetic (a
 * 10,000,000 JOD reserve is 1e10 fils, times 100 is 1e12 — three orders of
 * magnitude inside Number.MAX_SAFE_INTEGER), and the single division is rounded
 * ONCE with ceil. No JOD-denominated float ever enters the comparison. Ceil, not
 * round or floor, so the floor is never a fraction of a fil BELOW the true
 * percentage — the band errs toward the seller, never against them.
 */
function toleranceFloorFils(reserveFils, tolerancePct) {
  const r = Math.round(Number(reserveFils) || 0);
  if (r <= 0) return 0;
  const pct = Math.min(MAX_RESERVE_TOLERANCE_PCT, Math.max(MIN_RESERVE_TOLERANCE_PCT, Math.round(Number(tolerancePct) || 0)));
  return Math.ceil((r * (100 - pct)) / 100);
}

/**
 * Classify a final price against a hidden reserve. The ONE place the band is
 * decided, so the settlement branch and its tests cannot drift apart.
 *
 * Boundaries, stated explicitly because the task asked for them:
 *   price >= reserve        -> 'reserve_met'      (bid EXACTLY the reserve qualifies)
 *   price == floor          -> 'within_tolerance' (the floor is INCLUSIVE)
 *   price == floor + 1 fil  -> 'within_tolerance'
 *   price == floor - 1 fil  -> 'below_tolerance'
 *   no reserve set          -> 'reserve_met'      (nothing to miss)
 */
function classifyAgainstReserve({ finalPriceFils, reserveFils, tolerancePct }) {
  const price = Math.round(Number(finalPriceFils) || 0);
  const reserve = Math.round(Number(reserveFils) || 0);
  if (reserve <= 0) return 'reserve_met';
  if (price >= reserve) return 'reserve_met';
  return price >= toleranceFloorFils(reserve, tolerancePct) ? 'within_tolerance' : 'below_tolerance';
}

/**
 * Decide how an expired auction settles.
 * - sold: real bids + a winner + reserve met  -> status 'completed' (create order)
 * - reserve_not_met: real bids + winner but under reserve -> 'reserve_not_met' (NO order)
 * - unsold: no bids / no winner -> 'ended'
 *
 * On a reserve_not_met outcome, `offerBelowReserve` says whether the top bid
 * landed inside the tolerance band and so is worth offering to the seller. When
 * it is false the lot simply closes reserve_not_met with no offer stamped — the
 * bidder is told nothing, which is what keeps the floor secret.
 */
function resolveSettlement({ totalBids, winnerId, finalPrice, reservePrice, reserveIntended = false, tolerancePct = DEFAULT_RESERVE_TOLERANCE_PCT }) {
  if (totalBids > 0 && winnerId) {
    /**
     * A RESERVE WAS SET ON THIS LOT BUT ITS AMOUNT IS NOT READABLE.
     *
     * This is the hole that awarded lots below their reserve. The amount lives
     * in `auctionSecrets/{auctionId}`, whose rules are `allow write: if
     * isAdmin()` — so the browser write in createListing was DENIED for every
     * non-admin seller, the error was swallowed to a console.warn, the seller
     * was told the auction had been created, and the lot went live with no
     * retrievable reserve. Settlement then read an ABSENT document, which is
     * not a read error, so the existing fail-closed guard above did not fire:
     * `reservePrice` stayed null, `reserveMet(price, null)` returned true, and
     * the lot sold at whatever the top bid happened to be.
     *
     * `reserveIntended` closes it. The public auction doc records that a reserve
     * exists — createListing writes `reserveMet: false` alongside it — so the
     * INTENT survives even when the amount does not. When the intent is there
     * and the amount is not, we cannot prove the top bid cleared the bar, so we
     * must not award.
     *
     * `reserve_not_met` rather than aborting the run: aborting would make the
     * per-minute cron retry this lot forever and it would never resolve. This
     * outcome creates no order, leaves the money untouched, and opens the
     * below-reserve offer so the SELLER decides whether to accept the top bid.
     * Safe and recoverable, which is the pair we want — selling below an
     * unknown reserve is neither.
     */
    if (reserveIntended && (reservePrice === null || reservePrice === undefined)) {
      // THE TOLERANCE BAND DOES NOT APPLY HERE, and must not be allowed to.
      // The band is a percentage OF THE RESERVE; with no readable amount there
      // is no floor to compute, and `classifyAgainstReserve` would read the
      // missing reserve as 0 and answer 'reserve_met' — which would suppress
      // the offer entirely. That would strip the seller's recourse on exactly
      // the lots this branch exists to rescue. `offerBelowReserve: true` keeps
      // the behaviour this branch was written for: no sale, no order, and the
      // seller is asked.
      return {
        outcome: 'reserve_not_met',
        status: 'reserve_not_met',
        reserveUnverifiable: true,
        offerBelowReserve: true,
        reserveClass: 'unverifiable',
      };
    }
    if (reserveMet(finalPrice, reservePrice)) {
      return { outcome: 'sold', status: 'completed', offerBelowReserve: false, reserveClass: 'reserve_met' };
    }
    const reserveClass = classifyAgainstReserve({
      finalPriceFils: Math.round(Number(finalPrice) * 1000),
      reserveFils: Math.round(Number(reservePrice) * 1000),
      tolerancePct,
    });
    return {
      outcome: 'reserve_not_met',
      status: 'reserve_not_met',
      offerBelowReserve: reserveClass === 'within_tolerance',
      reserveClass,
    };
  }
  return { outcome: 'unsold', status: 'ended', offerBelowReserve: false, reserveClass: 'unsold' };
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

// Auto-relist (E3 Slice B): a seller can opt a listing in to being automatically
// relisted if it ends unsold / reserve-not-met. Capped so a chronically-unsold
// lot can't loop forever. `relisted` marks the ORIGINAL once its replacement has
// been created (idempotency — the sweep fires exactly once per original).
const MAX_AUTO_RELISTS = 2;

// Below-reserve near-miss (E3 Slice C): when an auction ends with real bids but
// the top bid is under the hidden reserve, the seller gets a bounded window to
// accept that top bid; the top bidder must then confirm before it becomes a
// real purchase. The offer state machine lives on the auction doc as
// `belowReserveOffer` and moves:
//   pending_seller -> pending_buyer -> confirmed   (the sale happens)
//   pending_seller | pending_buyer -> declined     (dead; relist can proceed)
// The seller-decision window is 24h from settlement.
const BELOW_RESERVE_WINDOW_HOURS = 24;

/**
 * PUBLIC (API-contract) vocabulary for a below-reserve offer.
 *
 * The stored vocabulary above is NOT renamed, on purpose. `secondChanceOffer`
 * shares it verbatim (both are read by belowReserveBlocksRelist), live auction
 * documents already carry it, and the four callables branch on it — renaming
 * would be a data migration across two features to gain nothing but different
 * spelling. Instead the stored value is MAPPED to the contract vocabulary at
 * the response boundary, which is the only place a client ever sees it:
 *
 *   pending_seller           -> pending_seller_decision
 *   pending_buyer, confirmed -> accepted_below_reserve   (seller said yes)
 *   declined, expired        -> rejected_below_reserve   (offer is dead)
 *
 * `pending_buyer` and `confirmed` collapse because both mean "the seller
 * accepted"; the buyer-confirmation step after that is order state, and lives on
 * the order's own status, not here.
 */
const BELOW_RESERVE_PUBLIC_STATUS = {
  pending_seller: 'pending_seller_decision',
  pending_buyer: 'accepted_below_reserve',
  confirmed: 'accepted_below_reserve',
  declined: 'rejected_below_reserve',
  expired: 'rejected_below_reserve',
};

/** Map a stored offer status to the client-facing one. Unknown -> null. */
function belowReservePublicStatus(status) {
  return BELOW_RESERVE_PUBLIC_STATUS[status] || null;
}

/** Milliseconds at which a below-reserve offer opened at `nowMs` expires. */
function belowReserveExpiryMs(nowMs, hours = BELOW_RESERVE_WINDOW_HOURS) {
  return nowMs + hours * 3600 * 1000;
}

/**
 * Normalize a Firestore Timestamp | {seconds}/{_seconds} | epoch-ms number to
 * epoch ms. Pure (no firebase dep) so the guards below stay unit-testable.
 * Returns NaN when it can't derive a millis value.
 */
function tsToMillis(ts) {
  if (ts == null) return NaN;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (Number(ts.nanoseconds) || 0) / 1e6;
  if (typeof ts._seconds === 'number') return ts._seconds * 1000;
  return NaN;
}

/**
 * A below-reserve offer is "expired" once now has passed its expiresAt. An
 * offer with no/undecodable expiresAt is treated as NOT expired (never block a
 * legitimate accept/confirm on a malformed timestamp — fail open on the guard,
 * the caller's status check still gates it).
 */
function isBelowReserveOfferExpired(offer, nowMs) {
  if (!offer) return false;
  const expMs = tsToMillis(offer.expiresAt);
  if (!Number.isFinite(expMs)) return false;
  return nowMs >= expMs;
}

/**
 * Does an in-flight below-reserve offer BLOCK auto-relist of the original?
 * - confirmed: a real sale happened / is happening — never relist.
 * - pending_seller / pending_buyer AND still within the window: wait, the seller
 *   or buyer may still turn it into a sale — don't relist yet.
 * - pending_* but EXPIRED, or declined, or no offer: does not block (relist ok).
 */
function belowReserveBlocksRelist(offer, nowMs) {
  if (!offer || !offer.status) return false;
  if (offer.status === 'confirmed') return true;
  if (offer.status === 'pending_seller' || offer.status === 'pending_buyer') {
    return !isBelowReserveOfferExpired(offer, nowMs);
  }
  return false; // 'declined' or anything terminal
}

function shouldAutoRelist(auction, nowMs) {
  if (!auction) return false;
  return (
    auction.autoRelist === true &&
    (auction.autoRelistCount || 0) < MAX_AUTO_RELISTS &&
    auction.relisted !== true &&
    !belowReserveBlocksRelist(auction.belowReserveOffer, nowMs) &&
    // A live second-chance offer blocks a relist for the same reason a
    // below-reserve one does: the lot may still become a sale. Without this the
    // item goes live while the runner-up holds an offer on it, and two people
    // can buy the same thing. `belowReserveBlocksRelist` is reused rather than
    // duplicated — both are the same bounded-offer machine.
    !belowReserveBlocksRelist(auction.secondChanceOffer, nowMs)
  );
}

module.exports = {
  reserveMet,
  resolveSettlement,
  DEFAULT_RESERVE_TOLERANCE_PCT,
  MIN_RESERVE_TOLERANCE_PCT,
  MAX_RESERVE_TOLERANCE_PCT,
  resolveReserveTolerancePct,
  toleranceFloorFils,
  classifyAgainstReserve,
  BELOW_RESERVE_PUBLIC_STATUS,
  belowReservePublicStatus,
  MAX_AUTO_RELISTS,
  shouldAutoRelist,
  BELOW_RESERVE_WINDOW_HOURS,
  belowReserveExpiryMs,
  tsToMillis,
  isBelowReserveOfferExpired,
  belowReserveBlocksRelist,
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
