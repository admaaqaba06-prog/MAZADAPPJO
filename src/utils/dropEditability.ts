/**
 * What an admin may still do to a drop they just created.
 *
 * The rule agreed in the spec: edit freely until the first bid, then editing
 * locks because changing an item's terms under someone who has already
 * committed money is not something a UI should make easy. Cancelling stays
 * available while the lot is running, but the caller must confirm loudly once
 * bids exist. Nothing is editable or cancellable after close — settlement has
 * run and orders exist.
 */

export interface DropEditabilitySource {
  status?: string | null;
  totalBids?: number | null;
}

/**
 * Every status settlement can leave behind. `functions/settlement.js` writes
 * exactly three: 'completed' (sold), 'reserve_not_met' (real bids and a winner
 * but under reserve, no order created) and 'ended' (unsold). All three are
 * closed — `DropsListPanel` groups all three under "Recently ended".
 *
 * 'processing' and 'rejected' are deliberately absent: those are pre-live
 * review states and a rejected listing is still editable by its seller.
 */
const FINISHED = new Set(['completed', 'reserve_not_met', 'ended']);

/** Non-numeric counts read as zero; only a real positive number counts as bids. */
export function bidCountOf(a: DropEditabilitySource): number {
  const n = a.totalBids;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

const isFinished = (a: DropEditabilitySource): boolean =>
  FINISHED.has(String(a.status ?? ''));

export function canEditDrop(a: DropEditabilitySource): boolean {
  return !isFinished(a) && bidCountOf(a) === 0;
}

export function canCancelDrop(a: DropEditabilitySource): boolean {
  return !isFinished(a);
}

export function cancelWarnsAboutBids(a: DropEditabilitySource): boolean {
  return bidCountOf(a) > 0;
}

/**
 * The confirm text shown before a cancel. Cancelling deletes the auction doc,
 * so any bids on it go with it — the count has to be in the sentence, not
 * implied by a warning triangle, and in both languages because the ops team is
 * mixed and neither is a fallback.
 */
export function cancelConfirmMessage(a: DropEditabilitySource, isAr: boolean): string {
  const bids = bidCountOf(a);
  if (!cancelWarnsAboutBids(a)) {
    return isAr ? 'هل تريد إلغاء هذا المزاد وحذفه؟' : 'Cancel this drop and delete it?';
  }
  return isAr
    ? `${bids} شخص زايد على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم. هل أنت متأكد؟`
    : `${bids} ${bids === 1 ? 'person has' : 'people have'} bid on this. Cancelling removes the auction and their bids. Are you sure?`;
}

/**
 * Keys a drop EDIT must never carry, even though `buildDropPayload` emits them.
 *
 * That builder produces a full *creation* payload. An edit is built from a form
 * that holds File objects, not uploaded URLs, so `videoUrl`/`thumbnailUrl` come
 * back as '' and `mediaUrls` as absent — writing those over a created lot blanks
 * media that uploaded fine. `reservePrice` is worse: it lives in the admin-only
 * `auctionSecrets` doc, which the builder cannot read, so a blank reserve field
 * here is "unknown", never "none" — writing it would erase a stored reserve with
 * no way to recover the number. `currentBidderId`/`currentBidderName` are
 * creation-time nulls that would wipe a live lot's leading bidder.
 *
 * Dropping keys is what protects them: Firestore's updateDoc merges by key, so
 * an omitted key is left exactly as it was.
 */
export const NON_EDITABLE_KEYS = [
  'mediaUrls',
  'videoUrl',
  'thumbnailUrl',
  'reservePrice',
  'currentBidderId',
  'currentBidderName',
] as const;

/** A copy of `payload` with every NON_EDITABLE_KEYS entry removed. Never mutates its input. */
export function stripNonEditableKeys(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  for (const key of NON_EDITABLE_KEYS) delete out[key];
  return out;
}
