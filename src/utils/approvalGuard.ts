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
