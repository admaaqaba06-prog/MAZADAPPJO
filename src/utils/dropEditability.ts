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

import { formatNumeral } from './arabicNumerals';

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
 * "N people bid on this", in Arabic.
 *
 * Arabic does not have English's one/many split. The counted noun changes form
 * across FOUR ranges, and the verb and the possessive have to agree with it, so
 * the old single `${bids} شخص زايد` was wrong for every count it was used for:
 *
 *   1      شخص واحد زايد     singular; the word "واحد" carries the count, so the
 *                            numeral is not repeated in front of it
 *   2      شخصان زايدا       dual — a distinct grammatical number, with its own
 *                            dual verb ending, not a plural
 *   3–10   N أشخاص زايدوا    plural of paucity, with the plural verb
 *   11+    N شخصاً زايد      singular in the accusative (تمييز), verb back to
 *                            singular — the form that looks most "wrong" to an
 *                            English reader and is the one MSA requires
 *
 * The possessive on "their bids" follows the same three-way split (his / their
 * two / their), because a sentence reading "شخص واحد زايد … ومزايداتهم" mixes a
 * singular subject with a plural pronoun in its own second clause.
 *
 * Written out as branches rather than an Intl.PluralRules lookup on purpose:
 * `Intl.PluralRules('ar')` gives the CATEGORY (one/two/few/many/other) but not
 * the noun, verb and pronoun forms, so the table would still have to live here.
 */
function arabicBidderClause(n: number): string {
  const count = formatNumeral(n, true);
  if (n === 1) return 'شخص واحد زايد على هذا المزاد. الإلغاء سيحذف المزاد ومزايداته.';
  if (n === 2) return 'شخصان زايدا على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهما.';
  if (n <= 10) return `${count} أشخاص زايدوا على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم.`;
  return `${count} شخصاً زايد على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم.`;
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
    ? `${arabicBidderClause(bids)} هل أنت متأكد؟`
    : `${formatNumeral(bids, false)} ${bids === 1 ? 'person has' : 'people have'} bid on this. Cancelling removes the auction and their bids. Are you sure?`;
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
