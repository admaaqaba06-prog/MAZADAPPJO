// Who is the auction's real buyer, for the purposes of releasing stuck escrows.
//
// `repairStuckEscrowsForEndedAuction` refunds the locked bid escrows of losing
// bidders and keeps the winner's. To do that it has to answer one question —
// whose escrow is NOT a loser's — and it answered it by reading
// `orders/{auctionId}`.
//
// That is wrong in two ways once an order can die:
//
//  1. SECOND CHANCE. When the winner defaults, the lot is re-offered to the
//     runner-up and the new order is minted at `orders/{auctionId}__sc` — the
//     defaulted order keeps the base id as the audit trail. So on a
//     second-chanced lot the base doc names the DEFAULTER, and the repair would
//     keep the defaulter's escrow locked while refunding the runner-up who
//     actually paid. Exactly backwards, on money.
//
//  2. DEFAULT ALONE. The old "is this bidder still the active buyer" test
//     excluded only `cancelled` and `rejected`. A `defaulted` order means the
//     buyer never paid, yet it kept their escrow locked forever.
//
// The rule this module encodes: **the newest order that has not died is the
// truth.** A second-chance order supersedes the base order entirely, because it
// can only exist after the base one defaulted. If the governing order is dead,
// NOBODY's escrow is protected — the sale did not happen, so every bidder gets
// their money back, the defaulter included.
//
// The auction document's own `currentBidderId` is only a fallback for a lot
// that has no order at all (never settled, or settlement is still in flight).
// It must never win over an order, because it always names the original winner
// and is never rewritten when that winner defaults.
//
// Pure: no Firestore. The caller does the reads; this decides what they mean.

const { offerIsLive } = require('./secondChance');

// A buyer in one of these is out. Their claim on the lot is over, so their bid
// escrow is a loser's escrow.
//
// Deliberately NOT here: `refunded` and `completed`. Both mean money already
// moved through the proper path, and a repair tool that is unsure should keep
// an escrow locked (recoverable by a human) rather than release it twice.
// `rejected` is not in the canonical status list but the original code tested
// for it, so it is kept rather than silently dropped.
const TERMINAL_BUYER_STATUSES = Object.freeze([
  'cancelled',
  'rejected',
  'defaulted',
]);

function isTerminalForBuyer(status) {
  return TERMINAL_BUYER_STATUSES.includes(String(status || ''));
}

/**
 * @param {object} input
 * @param {object|null} input.auction        the auction doc's data
 * @param {object|null} input.baseOrder      data at orders/{auctionId}, or null
 * @param {object|null} input.secondChanceOrder data at orders/{auctionId}__sc, or null
 * @param {number} [nowMs] clock, for judging whether a second-chance offer is still live
 * @returns {{winnerId: string|null, activeBuyerId: string|null, source: string}}
 *   `winnerId` — whose escrow to KEEP locked, or null to protect nobody.
 *   `activeBuyerId` — the buyer of the governing live order, or null.
 *   `source` — which input decided it, for the audit log.
 */
function resolveEscrowWinner(input, nowMs) {
  const { auction, baseOrder, secondChanceOrder } = input || {};
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();

  // A second-chance order can only exist after the base order defaulted, so
  // whenever it is present it is the later — and therefore the governing —
  // truth about who owns this lot.
  const governing = secondChanceOrder ? secondChanceOrder : (baseOrder || null);
  const source = secondChanceOrder ? 'second_chance_order' : (baseOrder ? 'base_order' : 'auction');

  if (!governing) {
    // No order at all: the lot may not have settled yet. Protect the standing
    // winner so a repair run cannot release the escrow of someone who is about
    // to be handed an order.
    const a = auction || {};
    const fallback = a.currentBidderId || a.highestBidderId || a.winnerId || a.winningBidderId || null;
    return { winnerId: fallback || null, activeBuyerId: null, source: 'auction' };
  }

  if (isTerminalForBuyer(governing.status)) {
    // The sale died — but it may be MID-RESCUE. A live second-chance offer
    // names the runner-up on the auction doc for up to 24h before their order
    // exists, so refunding here would release the escrow of the one person
    // about to be handed the lot. Worse, their order is minted without an
    // `escrowId`, so releaseOrderEscrow's fallback query would find nothing
    // and complete the sale without ever paying the seller.
    //
    // This is the same principle as the no-order fallback below — protect
    // whoever is about to receive an order — applied to a stronger signal.
    const offer = (auction || {}).secondChanceOffer;
    if (offer && offerIsLive(offer, now) && offer.bidderId) {
      return { winnerId: offer.bidderId, activeBuyerId: null, source: 'pending_second_chance_offer' };
    }
    // Nobody holds this lot, so nobody's escrow is protected — including the
    // defaulter's, which is the case the old code got wrong.
    return { winnerId: null, activeBuyerId: null, source };
  }

  const buyerId = governing.buyerId || null;
  if (!buyerId) {
    // A live order with no buyer is corrupt. Fall back to the auction rather
    // than releasing everything: refunding a real winner's escrow is the more
    // expensive mistake, and a human can still unstick the other direction.
    const a = auction || {};
    const fallback = a.currentBidderId || a.highestBidderId || a.winnerId || a.winningBidderId || null;
    return { winnerId: fallback || null, activeBuyerId: null, source: `${source}_no_buyer` };
  }

  return { winnerId: buyerId, activeBuyerId: buyerId, source };
}

/**
 * Should THIS bidder's locked escrow be refunded as a loser's?
 *
 * Extracted because the caller's version of this line lives inside a 260-line
 * Cloud Function that vitest cannot import, so it could only ever be asserted
 * by regex over the source. A review inverted that line — keeping every loser
 * locked and refunding the actual winner, on every auction — and all 19 tests
 * stayed green. Behaviour belongs somewhere a test can execute it.
 */
function shouldRefundEscrow(input) {
  const { bidderId, winnerId, activeBuyerId } = input || {};
  if (!bidderId) return false;                    // corrupt row: never touch money
  if (winnerId && bidderId === winnerId) return false;
  if (activeBuyerId && bidderId === activeBuyerId) return false;
  return true;
}

module.exports = {
  resolveEscrowWinner,
  shouldRefundEscrow,
  isTerminalForBuyer,
  TERMINAL_BUYER_STATUSES,
};
