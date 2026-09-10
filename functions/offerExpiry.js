/**
 * Offers that nobody answered.
 *
 * WHY THIS FILE EXISTS. A lot that closes under its reserve — but inside the
 * tolerance band — stamps a bounded offer and asks the seller. The window is 24
 * hours (`BELOW_RESERVE_WINDOW_HOURS`), and every callable that acts on an
 * offer checks it: `acceptBelowReserve`, `confirmBelowReserve`,
 * `rejectBelowReserve` and `declineBelowReserve` all refuse a lapsed one.
 *
 * Nothing ever marks one lapsed. The window is enforced when somebody ACTS; it
 * is not enforced when nobody does, which is the case it was written for. So an
 * ignored offer sits at `pending_seller` permanently:
 *
 *   - The seller's UI keeps showing a decision that can no longer be made, and
 *     the bidder's shows an offer that will never be answered.
 *   - Neither party is ever told the window closed. The seller who missed it
 *     hears nothing; the bidder whose bid was put to the seller hears nothing.
 *   - `belowReserveOffer.status` never reaches a terminal value, so the lot's
 *     own record of what happened stays wrong forever.
 *
 * `autoRelistSweep` does expire offers — but only in passing, on lots being
 * relisted, and `shouldAutoRelist` requires `autoRelist === true`. Every lot
 * whose seller did not opt into auto-relisting is left out entirely, which is
 * most of them.
 *
 * BOTH OFFER FIELDS. `secondChanceOffer` (opened for the runner-up when a
 * winner defaults) is not a similar feature, it is the SAME one: same status
 * vocabulary, same `expiresAt`, same helpers — `belowReserveBlocksRelist` is
 * deliberately reused for it, with a comment saying so. It has the same hole.
 * Sweeping one and not the other would be arbitrary.
 *
 * The decisions are pure and live here; the sweep that reads and writes
 * Firestore is a thin loop in index.js.
 */

const { tsToMillis, BELOW_RESERVE_WINDOW_HOURS } = require('./settlement');

/** Offer statuses that are still waiting on somebody. */
const PENDING_STATUSES = ['pending_seller', 'pending_buyer'];

/** The two fields carrying the bounded-offer machine, in sweep order. */
const OFFER_FIELDS = ['belowReserveOffer', 'secondChanceOffer'];

/**
 * When did / does this offer run out, in ms?
 *
 * `expiresAt` is the answer whenever it is usable. When it is not — missing,
 * malformed, a string that never became a Timestamp — the offer is in the worst
 * state available: `isBelowReserveOfferExpired` returns FALSE for an unreadable
 * deadline, so such an offer never expires, blocks auto-relist forever, and
 * stays acceptable forever. Treating it as "no deadline, leave it alone" would
 * preserve exactly that.
 *
 * So fall back to when the lot settled. `settledAt` is written in the same
 * transaction that stamps a below-reserve offer, and a second-chance offer is
 * opened after a default on an already-settled lot, so it is present and it is
 * never LATER than the offer. Deriving the deadline from it can only produce a
 * deadline at or before the real one — it can retire a stale offer, never a
 * fresh one.
 *
 * Returns `{ ms, derived }`, or null when nothing datable is available.
 */
function offerDeadlineMs(offer, auction, windowHours = BELOW_RESERVE_WINDOW_HOURS) {
  const direct = tsToMillis(offer && offer.expiresAt);
  if (Number.isFinite(direct)) return { ms: direct, derived: false };

  // `sellerAcceptedAt` first: on a pending_buyer offer it restarted the window,
  // so it is nearer the truth than the lot's original settlement.
  for (const key of ['sellerAcceptedAt', 'offeredAt', 'createdAt']) {
    const t = tsToMillis(offer && offer[key]);
    if (Number.isFinite(t)) return { ms: t + windowHours * 3600 * 1000, derived: true };
  }
  const settled = tsToMillis(auction && auction.settledAt);
  if (Number.isFinite(settled)) return { ms: settled + windowHours * 3600 * 1000, derived: true };

  return null;
}

/**
 * Which offers on this auction have lapsed and should be retired?
 *
 * Returns one entry per lapsed offer: `{ field, offer, deadlineMs, derived }`.
 * `derived: true` flags a deadline the sweep had to reconstruct — worth logging,
 * because it means an offer was written without a usable `expiresAt`.
 *
 * An offer with no datable timestamp at all is reported separately by
 * `undatableOffers` rather than silently retired: with nothing to reconstruct
 * from, expiring it would be a guess, and a guess here cancels a real offer.
 */
function lapsedOffers(auction, nowMs, windowHours = BELOW_RESERVE_WINDOW_HOURS) {
  const out = [];
  for (const field of OFFER_FIELDS) {
    const offer = auction && auction[field];
    if (!offer || !PENDING_STATUSES.includes(offer.status)) continue;
    const deadline = offerDeadlineMs(offer, auction, windowHours);
    if (!deadline) continue;
    if (nowMs >= deadline.ms) {
      out.push({ field, offer, deadlineMs: deadline.ms, derived: deadline.derived });
    }
  }
  return out;
}

/**
 * Pending offers whose deadline cannot be established at all.
 *
 * These are the permanently-stuck ones — unexpirable, un-relistable, and
 * acceptable forever. The sweep cannot fix them without inventing a date, so it
 * surfaces them for a human instead of quietly deciding.
 */
function undatableOffers(auction, windowHours = BELOW_RESERVE_WINDOW_HOURS) {
  const out = [];
  for (const field of OFFER_FIELDS) {
    const offer = auction && auction[field];
    if (!offer || !PENDING_STATUSES.includes(offer.status)) continue;
    if (!offerDeadlineMs(offer, auction, windowHours)) out.push({ field, offer });
  }
  return out;
}

/**
 * Who should be TOLD that this offer lapsed, and with which existing event?
 *
 * The person who let the window pass and the person who needs the outcome are
 * not the same person, and it is the second one that matters here.
 *
 * `pending_seller` lapsed — the seller was asked and never answered. The BIDDER
 * is the one left waiting on a result, and `below_reserve_declined` already
 * says exactly the true thing to them: "the seller did not accept your bid."
 * Silence and refusal look identical from the bidder's side and have the same
 * consequence, so no new wording is needed or wanted. The event is already
 * INAPP_ONLY, so this adds no WhatsApp, no email, and no n8n change.
 *
 * `pending_buyer` lapsed — the seller ACCEPTED and the buyer never confirmed,
 * so the seller loses a sale they had agreed to. They should be told, but no
 * existing string says that: `below_reserve_declined`'s seller-facing variant
 * is gated on `sc` (second chance) and would render the BIDDER's wording on a
 * below-reserve lot. Rather than notify someone with copy that describes the
 * wrong event, this returns `null` and the sweep records `needsCopy` — the
 * offer is still retired, which is the part that was broken.
 *
 * Returns `{ uid, event, data }` or null.
 */
function expiryNotification(auction, field, offer) {
  const status = offer && offer.status;
  const bidderId = (offer && (offer.topBidderId || offer.bidderId)) || null;

  if (status === 'pending_seller') {
    if (!bidderId) return null;
    return {
      uid: bidderId,
      event: 'below_reserve_declined',
      // `declinedBy` selects the copy variant. Anything other than 'buyer'
      // renders "the seller did not accept your bid", which is what happened.
      data: { declinedBy: 'seller_timeout', offerField: field },
    };
  }

  return null;
}

/**
 * Did this lapse leave someone uninformed for want of a string?
 *
 * True only for `pending_buyer`, and it is reported rather than papered over so
 * the gap is visible in the logs instead of being discovered by a seller
 * wondering where their sale went.
 */
function expiryNeedsCopy(offer) {
  return !!(offer && offer.status === 'pending_buyer');
}

module.exports = {
  PENDING_STATUSES,
  OFFER_FIELDS,
  offerDeadlineMs,
  lapsedOffers,
  undatableOffers,
  expiryNotification,
  expiryNeedsCopy,
};
