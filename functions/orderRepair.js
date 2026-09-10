/**
 * May an admin's "repair" create the order for an ended auction?
 *
 * WHY THIS FILE EXISTS. `repairEndedAuctionOrder` is the manual escape hatch for
 * the case where the per-minute closer did not run, or ran and failed: an
 * auction has ended, it has a winner, and no order exists. An admin clicks
 * repair and the order is written.
 *
 * It wrote that order having read nothing about the reserve. Not the amount in
 * `auctionSecrets`, not the `reserveMet` marker on the auction, not even the
 * auction's own `status`. So every guarantee bought by #289 and #290 — settle
 * only through `resolveSettlement`, never award a lot whose reserve cannot be
 * proven cleared — stopped at the edge of the cron and did not extend here.
 *
 * The concrete failure: a lot closes correctly as `reserve_not_met`. No order
 * is created, and the seller is offered the top bid to accept or refuse. The
 * absence of an order is the CORRECT state — and it is indistinguishable, to
 * an admin looking at a list of ended auctions with no orders, from the
 * cron-failure this tool exists to fix. One click then created the order at
 * `waiting_payment` and sent the buyer `auction_won` + `payment_due`: the lot
 * sold below its reserve, the seller's pending decision silently bypassed, and
 * the buyer told to pay for it.
 *
 * The fix is not new reserve logic. `resolveSettlement` already decides this,
 * and a second implementation would be a second thing to get wrong. The repair
 * path now runs the SAME decision and this file says what to do with it.
 */

/**
 * Decide whether the repair may proceed.
 *
 * `decision` is the return value of `resolveSettlement` for this auction, run
 * against the reserve read from `auctionSecrets` — the caller does the reads,
 * this function does the judging, so every branch below is reachable from a
 * unit test without the Admin SDK.
 *
 * Returns `{ ok: true }`, or `{ ok: false, code, message }` where `message` is
 * safe to hand back to the admin caller.
 */
function authorizeOrderRepair({ auction, decision, orderExists }) {
  // Cheapest check first, and the only one that is not about the reserve: the
  // tool is for a MISSING order. An existing one is not ours to overwrite.
  if (orderExists) {
    return {
      ok: false,
      code: 'order_exists',
      message: 'An order already exists for this auction.',
    };
  }

  if (!decision) {
    return {
      ok: false,
      code: 'no_decision',
      message: 'Could not determine the settlement outcome for this auction. Nothing was written.',
    };
  }

  /**
   * THE HOLE THIS FILE WAS WRITTEN TO CLOSE.
   *
   * `sold` is the ONLY outcome that earns an order. The other two are:
   *
   *   'unsold'           — no bids, or no winner. Never had a buyer.
   *   'reserve_not_met'  — there IS a top bid and it did not clear the bar.
   *
   * The second is the dangerous one, because it looks exactly like a lot the
   * cron failed on: ended, has a winner, has no order. Creating the order here
   * is precisely the below-reserve sale that #289/#290 exist to prevent.
   *
   * `reserveUnverifiable` lands here too, and must. A lot recording a reserve
   * whose amount was never stored cannot be proven to have cleared it — an
   * admin repairing it by hand does not make the missing amount readable, and
   * "an admin clicked the button" is not evidence about the price.
   */
  if (decision.outcome !== 'sold') {
    return {
      ok: false,
      code: decision.reserveUnverifiable ? 'reserve_unverifiable' : decision.outcome,
      message: decision.reserveUnverifiable
        ? 'This auction records a reserve whose amount is missing from auctionSecrets. ' +
          'Restore the reserve amount before repairing; no order was created.'
        : decision.outcome === 'reserve_not_met'
          ? 'The winning bid did not meet the reserve. No order was created. ' +
            'Use the below-reserve offer to put the bid to the seller instead.'
          : 'This auction has no winning bid. No order was created.',
    };
  }

  /**
   * A decided-`sold` lot can still be mid-negotiation.
   *
   * `belowReserveOffer` is stamped when a lot closes under its reserve and the
   * seller is asked. While it sits at `pending_seller` or `pending_buyer` the
   * answer is genuinely not known yet, and `acceptBelowReserve` /
   * `confirmBelowReserve` are the paths that create the order — transactionally,
   * at the negotiated price, with the offer moved out of pending.
   *
   * Writing an order here instead would create it at the AUCTION's price rather
   * than the offer's, leave the offer pending forever, and race the callable
   * that is about to write the same document. Refuse and let the offer resolve.
   *
   * (Reached when a stale offer sits on a lot that later resolves to `sold` —
   * an admin restoring a missing reserve amount is the realistic way there.)
   */
  const offer = auction && auction.belowReserveOffer;
  if (offer && (offer.status === 'pending_seller' || offer.status === 'pending_buyer')) {
    return {
      ok: false,
      code: 'offer_pending',
      message: 'A below-reserve offer on this auction is still awaiting a decision. ' +
        'Resolve the offer instead of repairing; no order was created.',
    };
  }

  return { ok: true };
}

/**
 * Does this auction record that a reserve was set on it?
 *
 * PRESENCE, NOT TRUTHINESS — the same rule `settleAuctionTxn` applies, kept in
 * one place so the two paths cannot drift. `createListing` writes
 * `reserveMet: false` next to the secret amount, and `onBidCreated` flips it to
 * `true` once a qualifying bid lands. Testing the VALUE would therefore read
 * every already-cleared lot as having no reserve.
 */
function auctionRecordsReserve(auction) {
  return Object.prototype.hasOwnProperty.call(auction || {}, 'reserveMet');
}

module.exports = { authorizeOrderRepair, auctionRecordsReserve };
