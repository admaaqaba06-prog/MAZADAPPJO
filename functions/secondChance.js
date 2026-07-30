/**
 * Second Chance Offer — the pure decisions.
 *
 * 21 of 31 real orders in production are `defaulted`. Today the enforcer bans
 * the buyer and the lot dies there; the runner-up who bid real money never
 * hears anything. This module decides who gets offered what, at what price, and
 * for how long.
 *
 * Pure by design: the enforcer hook and the accept/decline callable read and
 * write Firestore, and call in here for every judgement. Same split as
 * settlement.js, and the reason each branch below is unit-tested without an
 * emulator.
 *
 * The offer record mirrors `belowReserveOffer` and reuses its window helpers —
 * it is the same bounded-offer machine with a different trigger, so it must not
 * grow a second set of semantics.
 */
const {
  belowReserveExpiryMs,
  isBelowReserveOfferExpired,
  buyerPremiumJod,
  totalDueJod,
  sellerCommissionFils,
  sellerNetFils,
} = require('./settlement');

/**
 * The defaulted order already owns `orders/{auctionId}` — settleAuctionTxn keys
 * orders by auction id and guards on `!orderSnap.exists`. A second order for
 * the same lot therefore needs its own id.
 *
 * ONE-SHOT BY DESIGN. This works precisely because there is exactly one second
 * chance. If a cascade is ever wanted, redesign the id scheme — do NOT add
 * `__sc2`.
 */
const SECOND_CHANCE_ORDER_SUFFIX = '__sc';

function secondChanceOrderId(auctionId) {
  return `${auctionId}${SECOND_CHANCE_ORDER_SUFFIX}`;
}

/**
 * Highest bid not belonging to the defaulter, or null.
 *
 * Deliberately NOT `auction.previousBidderId`: that is the last person outbid,
 * which is the winner themselves whenever the winner bid twice in a row — it
 * would offer the lot straight back to whoever just defaulted.
 *
 * A malformed row is skipped rather than fatal: one bad bid document must not
 * deny the whole lot a second chance.
 */
function pickRunnerUp(bids, defaulterId) {
  if (!Array.isArray(bids)) return null;
  let best = null;
  for (const b of bids) {
    if (!b || typeof b !== 'object') continue;
    const bidderId = b.bidderId;
    const amount = Number(b.amount);
    if (!bidderId || !Number.isFinite(amount) || amount <= 0) continue;
    if (bidderId === defaulterId) continue;
    if (!best || amount > best.amount) {
      // Empty string, NOT a hardcoded label: this product is Arabic-first and
      // the name reaches WhatsApp/email templates verbatim. Choosing a display
      // fallback is the caller's job, in the caller's language.
      best = { bidderId, bidderName: b.bidderName || '', amount };
    }
  }
  return best;
}

/**
 * The reserve fork. A bid at or above the reserve goes straight to the bidder —
 * the seller already agreed to sell at that level. Below it, the seller must
 * consent, because selling under a reserve without asking breaks the promise
 * the reserve makes.
 *
 * ABSENT and UNREADABLE are deliberately NOT the same thing:
 * - ABSENT (`null` / `undefined` / the number `0`) means the auction has no
 *   `auctionSecrets` doc or no reserve set — there is no promise to break, so
 *   anything clears and the bidder is asked directly.
 * - PRESENT BUT UNUSABLE (`NaN`, `''`, `'abc'`, `-5`, `{}`) means a reserve was
 *   stored and we cannot read it. Failing open there would sell the lot under
 *   the seller's reserve with no seller consent — the exact harm this fork
 *   exists to prevent. So we fail SAFE and ask the seller.
 *
 * This also keeps one answer to one question: `settlement.reserveMet(10, 'abc')`
 * already returns false, so clearing the same input here would leave the
 * codebase contradicting itself about whether that lot met its reserve.
 */
function openingStateFor(runnerUpAmount, reserve) {
  // Absence must be explicit — `null`/`undefined`, or the literal number 0,
  // which is how "no reserve" is stored today. A string '' or '0' is a stored
  // value we failed to read, not an absence, and falls through to fail-safe.
  if (reserve === null || reserve === undefined) return 'pending_buyer';
  if (typeof reserve === 'number' && reserve === 0) return 'pending_buyer';
  const r = Number(reserve);
  if (!Number.isFinite(r) || r <= 0) return 'pending_seller';
  return Number(runnerUpAmount) >= r ? 'pending_buyer' : 'pending_seller';
}

/**
 * The offer stamped onto the auction as `secondChanceOffer`.
 *
 * `notifiedAt: null` is written EXPLICITLY, not omitted. Stamping the offer and
 * telling the recipient about it are two writes and cannot be made atomic; if
 * the second fails, the offer is live, it blocks auto-relist for 24h, and
 * nobody knows. That state is otherwise unrecoverable — the defaulted order
 * never re-enters the enforcer's `waiting_payment` query, and the
 * already-has-an-offer guard would skip the lot anyway. The explicit null is
 * what makes the un-notified offer FINDABLE (a missing field does not match a
 * Firestore `== null` query) so `needsNotifyRetry` can re-drive it.
 */
function buildOfferRecord(deps, { runnerUp, defaultedOrderId, openingState }) {
  const { Timestamp, now = () => Date.now() } = deps;
  const nowMs = now();
  return {
    status: openingState,
    bidderId: runnerUp.bidderId,
    bidderName: runnerUp.bidderName,
    amount: runnerUp.amount,
    defaultedOrderId,
    openedAt: Timestamp.fromMillis(nowMs),
    expiresAt: Timestamp.fromMillis(belowReserveExpiryMs(nowMs)),
    notifiedAt: null,
  };
}

/**
 * Money for the second-chance order, computed from the RUNNER-UP's bid.
 * Never inherited from the defaulted order — that order was for a different,
 * higher amount, and copying it would overcharge the runner-up.
 */
function secondChanceOrderMoney(amount) {
  const bid = Number(amount);
  const fils = Math.round(bid * 1000);
  return {
    winningBidAmount: bid,
    buyersPremium: buyerPremiumJod(bid),
    totalDue: totalDueJod(bid),
    sellerCommission: sellerCommissionFils(fils) / 1000,
    sellerNet: sellerNetFils(fils) / 1000,
  };
}

/** Pending and unexpired. Reuses the below-reserve expiry semantics exactly. */
function offerIsLive(offer, nowMs) {
  if (!offer) return false;
  if (offer.status !== 'pending_seller' && offer.status !== 'pending_buyer') return false;
  return !isBelowReserveOfferExpired(offer, nowMs);
}

/**
 * Was this offer opened but never announced?
 *
 * The offer write and the notification are separate round-trips. When the
 * second one fails the lot is worse off than if nothing had happened: it is
 * held out of auto-relist for a full 24h on behalf of someone who was never
 * told they had an offer. Nothing re-drives it on its own — the defaulted order
 * has left the enforcer's `waiting_payment` query for good — so this predicate
 * exists to let a sweep find and finish the job.
 *
 * Only LIVE offers qualify. Re-announcing an expired or already-decided offer
 * would be worse than silence.
 */
function needsNotifyRetry(offer, nowMs) {
  if (!offerIsLive(offer, nowMs)) return false;
  return offer.notifiedAt === null || offer.notifiedAt === undefined;
}

/**
 * THE STATUS VOCABULARY, PINNED.
 *
 * A second-chance offer is stored in the same shape as a below-reserve one and
 * is read by the same helpers — `settlement.belowReserveBlocksRelist` decides
 * whether it blocks an auto-relist, and it recognises these literals and no
 * others. A near-synonym ('accepted' for 'confirmed', 'open' for 'pending_*')
 * would not error anywhere; it would silently fall through to "does not block",
 * the lot would relist while a live offer stood on it, and two people could buy
 * the same item. That is precisely the failure Task 2a exists to prevent.
 *
 * Each status maps to what it means for a relist:
 *   live   — undecided and inside its window: block, the sale may still happen.
 *   sold   — a sale exists: block forever.
 *   closed — dead end: release the lot.
 *
 * `secondChance.test.js` walks this map against both helpers, so ADDING a
 * status here without teaching `belowReserveBlocksRelist` about it fails the
 * suite loudly instead of quietly unblocking a relist.
 */
const OFFER_STATUSES = {
  pending_seller: 'live',
  pending_buyer: 'live',
  confirmed: 'sold',
  declined: 'closed',
  expired: 'closed',
};

module.exports = {
  SECOND_CHANCE_ORDER_SUFFIX,
  secondChanceOrderId,
  pickRunnerUp,
  openingStateFor,
  buildOfferRecord,
  secondChanceOrderMoney,
  offerIsLive,
  needsNotifyRetry,
  OFFER_STATUSES,
};
