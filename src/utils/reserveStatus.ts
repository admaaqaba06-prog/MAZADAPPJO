/**
 * The client-side half of the reserve contract.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: a public client never receives, derives or
 * displays the reserve AMOUNT, the tolerance FLOOR, or the gap between the
 * current price and either of them. It receives a two-state label and nothing
 * else. The amount lives in `auctionSecrets/{auctionId}` (firestore.rules:
 * admin-only read) and is evaluated exclusively in Cloud Functions.
 *
 * `reserveMet` on the auction doc is the whole public surface: a boolean the
 * server maintains (onBidCreated flips it false -> true; settleAuctionTxn
 * re-derives the authoritative answer). Deliberately tri-state on the client,
 * because UNSET and FALSE mean different things — see reserveStatusOf.
 */

/** What a public viewer may be told about the reserve. */
export type ReserveStatus = 'met' | 'not_met' | 'none';

/**
 * Map an auction doc to its public reserve status.
 *
 *   true      -> 'met'
 *   false     -> 'not_met'
 *   undefined -> 'none'  — NO reserve on this lot. `createListing` writes
 *                `reserveMet: false` only when a reserve was actually set, so an
 *                absent field means there is nothing to meet. Rendering "Reserve
 *                not met" here would invent a reserve that does not exist and
 *                suppress bids on a lot that is already sellable.
 */
export function reserveStatusOf(auction: { reserveMet?: boolean } | null | undefined): ReserveStatus {
  if (!auction || auction.reserveMet === undefined || auction.reserveMet === null) return 'none';
  return auction.reserveMet ? 'met' : 'not_met';
}

/** Should the room show a reserve badge at all? Never for a no-reserve lot. */
export function showsReserveBadge(auction: { reserveMet?: boolean } | null | undefined): boolean {
  return reserveStatusOf(auction) !== 'none';
}

/**
 * The API/client vocabulary for a below-reserve offer. Mirrors
 * `BELOW_RESERVE_PUBLIC_STATUS` in functions/settlement.js — the stored status
 * on the auction doc uses the older internal names, which are NOT renamed
 * because `secondChanceOffer` shares them verbatim and live documents carry
 * them. reserveStatus.test.ts pins the two tables together.
 */
export type BelowReserveOfferPublicStatus =
  | 'pending_seller_decision'
  | 'accepted_below_reserve'
  | 'rejected_below_reserve';

const PUBLIC_STATUS: Record<string, BelowReserveOfferPublicStatus> = {
  pending_seller: 'pending_seller_decision',
  pending_buyer: 'accepted_below_reserve',
  confirmed: 'accepted_below_reserve',
  declined: 'rejected_below_reserve',
  expired: 'rejected_below_reserve',
};

/** Stored status -> contract status. Unknown/absent -> null. */
export function belowReserveOfferPublicStatus(
  status: string | null | undefined,
): BelowReserveOfferPublicStatus | null {
  if (!status) return null;
  return PUBLIC_STATUS[status] ?? null;
}

/**
 * Is this offer still waiting on the seller, and still inside its window?
 *
 * The expiry is read defensively because `expiresAt` arrives as a Firestore
 * Timestamp from a live snapshot but as a `{seconds}` shape from cached/serialised
 * data. A missing or undecodable expiry is treated as NOT expired: the server
 * re-checks it in acceptBelowReserve/rejectBelowReserve anyway, so failing open
 * here shows a button the server may refuse, while failing closed would hide the
 * seller's only decision surface on a perfectly live offer.
 */
export function offerAwaitsSeller(
  offer: { status?: string; expiresAt?: any } | null | undefined,
  nowMs: number,
): boolean {
  if (!offer || offer.status !== 'pending_seller') return false;
  const raw = offer.expiresAt;
  let expMs = NaN;
  if (raw != null) {
    if (typeof raw === 'number') expMs = raw;
    else if (typeof raw.toMillis === 'function') expMs = raw.toMillis();
    else if (typeof raw.seconds === 'number') expMs = raw.seconds * 1000;
    else if (typeof raw._seconds === 'number') expMs = raw._seconds * 1000;
  }
  if (!Number.isFinite(expMs)) return true;
  return expMs > nowMs;
}
