/**
 * Can this auction be approved (put live)?
 *
 * "Approve & go live" recalculates `endTime` and flips `status` to `live`. On a
 * lot that has ALREADY SETTLED that is always wrong, and it is an easy mistake to
 * make: a winner defaults, an admin sees the dead lot in the queue, and hits the
 * obvious green button to re-run it.
 *
 * What that actually produces (observed in production on
 * `auction-new-1784771726248-7597`): the lot goes live again with `settledAt`
 * still set, `currentPrice` still at the old winning bid and `currentBidderId`
 * still pointing at the buyer who defaulted — so new bidders must outbid a
 * defaulter's phantom bid.
 *
 * The worse half is invisible: orders are keyed by the AUCTION ID
 * (`orders/{auctionId}`), and `settleAuctionTxn` only creates one
 * `if (!orderSnap.exists)`. The defaulted order still occupies that id, so when
 * the re-opened auction settles again the settler logs "order already exists,
 * skipping creation" and the new winner gets NO order — no payment request, no
 * fulfillment, no record. The lot sells and nothing happens.
 *
 * That collision is structural: a re-run on the same document can never produce a
 * second order. Re-running has to mean a NEW auction document, which is exactly
 * what the relist paths already do (the admin drop-builder's relist and Seller
 * Center's duplicate both mint a fresh id). So approval must simply refuse here
 * and point at relisting.
 */

/** Statuses that mean the auction has already reached an end state. */
const SETTLED_STATUSES = ['completed', 'ended', 'reserve_not_met'];

export interface ApprovableAuction {
  status?: string | null;
  settledAt?: unknown;
}

/**
 * `null` when approval may proceed; otherwise the reason it must not.
 *
 * `settledAt` is checked as well as `status` because re-approval OVERWRITES the
 * status back to `live` — so after one bad approval the status no longer records
 * that the lot ever settled, and only `settledAt` still does. Checking both means
 * a lot that has already been re-opened once cannot be re-opened again.
 */
export function blockedApprovalReason(
  auction: ApprovableAuction | null | undefined,
): 'already_settled' | null {
  if (!auction) return null; // nothing known — let the caller's own lookup decide
  if (auction.settledAt != null) return 'already_settled';
  if (typeof auction.status === 'string' && SETTLED_STATUSES.includes(auction.status)) {
    return 'already_settled';
  }
  return null;
}

/**
 * The clock half of an approval write: both `endTime` and `endsAt`, or NEITHER.
 *
 * "Approve & go live" re-baselines the countdown from `duration` at approval
 * time, which is right for a scheduled lot — its end is a fixed window that must
 * start when the lot actually opens, not when it was created. A `first_bid` lot
 * is the opposite: it opens with no end at all and the server stamps `endsAt` on
 * the FIRST BID (`applyBidWrites` in functions/index.js). Writing a clock at
 * approval time therefore starts a countdown nobody bid to start —
 * `isAwaitingFirstBidDoc` stops matching (it requires both fields absent), so the
 * lot renders a fabricated countdown instead of "Awaiting first bid", and
 * `scheduledAuctionCloser` settles it unsold when that countdown runs out.
 *
 * So this returns `{}` for a first_bid lot. Spread into the `updateDoc` payload
 * that means the two keys are ABSENT from the write — not `undefined` (Firestore
 * rejects that value) and not `null` (a written value, which is not what the two
 * server go-live paths produce). Because updateDoc merges by key, an absent key
 * leaves whatever the document already stores untouched: this omits a clock, it
 * does not clear one. Nothing on the approval path erases a pre-existing
 * `endTime`/`endsAt`.
 *
 * The same rule, expressed the same way, as the two server-side go-live paths:
 * `scheduledAuctionOpener` (`if (fd.startMode !== 'first_bid')`) and the
 * `autoRelistSweep` child (`if (startMode !== 'first_bid')`), both in
 * functions/index.js.
 *
 * `endsAt` is passed in rather than built here so this stays a pure function the
 * node test environment can run — the call site passes the `Timestamp` it
 * already constructed.
 */
export function approvalClockFields<T>(
  auction: { startMode?: string | null } | null | undefined,
  endTimeMs: number,
  endsAt: T,
): { endTime: number; endsAt: T } | Record<string, never> {
  if (auction?.startMode === 'first_bid') return {};
  return { endTime: endTimeMs, endsAt };
}
