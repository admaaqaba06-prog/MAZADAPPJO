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
// banLadder is pure too (no Firestore), so importing it keeps this module's
// no-I/O promise intact. The CALLER does the read; this module only judges.
const { isEffectivelyBlocked } = require('./banLadder');

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
 * Should this runner-up be passed over because their account is blocked?
 *
 * `secondChanceRespond` refuses `buyer_accept` from a blocked account with
 * `failed-precondition`, and the payment-default ban MINIMUM is 48h
 * (`resolvePaymentDefaultBan`) against a 24h offer window — so an offer opened to
 * a blocked bidder cannot be accepted before it expires. That is DETERMINISTIC,
 * not a race: the runner-up sees an Accept button the server will always refuse,
 * while the lot is held out of auto-relist for 24h on behalf of someone who can
 * never take it. With 21 of 31 real orders defaulted, a meaningful share of
 * runner-ups are under an active block, very often for defaulting elsewhere.
 *
 * Takes a LOOKUP RESULT, not a uid: reading `users/{uid}` is I/O and this module
 * does none. The caller reads the doc and reports what happened.
 *
 *   { readable: true,  user: {...} } — the doc was read
 *   { readable: true,  user: null  } — no such user doc
 *   { readable: false, user: null  } — the read THREW
 *
 * FAILS OPEN on both `user: null` cases, and the unreadable one is deliberately
 * the opposite call to the reserve lookup in the same caller. Both reads fail in
 * the direction that preserves the option; they simply have different costs. A
 * failed RESERVE read risks selling under a seller's reserve, so it fails safe by
 * asking the seller. A failed BAN read risks only re-creating the behaviour that
 * shipped before this check existed — whereas failing closed would permanently
 * destroy a legitimate runner-up's one and only shot, because a `defaulted` order
 * never re-enters the enforcer's `waiting_payment` query and a second chance is
 * one-shot. The accept-time gate is a complete backstop either way: it reads the
 * bidder doc inside the transaction, so it is atomic rather than TOCTOU.
 *
 * Lives here, in the pure layer, so this decision is testable BEHAVIOURALLY. It
 * was previously inline in index.js, which no test can import (firebase-admin at
 * module scope) — a review mutated that inline check to `!isEffectivelyBlocked`,
 * the exact inverse of the fix, and all 18 source-text tests still passed.
 */
function shouldSkipRunnerUp(lookup, nowMs) {
  if (!lookup || typeof lookup !== 'object') return false;
  if (lookup.readable === false) return false; // the read threw — do not punish the bidder for it
  return isEffectivelyBlocked(lookup.user, nowMs);
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
  shouldSkipRunnerUp,
  openingStateFor,
  buildOfferRecord,
  secondChanceOrderMoney,
  offerIsLive,
  needsNotifyRetry,
  OFFER_STATUSES,
};
