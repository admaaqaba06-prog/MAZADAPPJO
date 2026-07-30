/**
 * Second Chance Offer — the "who sees which buttons" decision, as one pure
 * function.
 *
 * When an auction winner fails to pay, the payment-default enforcer stamps a
 * `secondChanceOffer` onto the AUCTION document offering the lot to the
 * runner-up. Two different screens render that offer (the seller sees it on
 * their listing in Seller Center, the runner-up sees it above their purchases
 * in My Orders), and both must agree exactly with what
 * `functions/secondChanceRespond.js` will actually permit — a button the server
 * answers with `permission-denied` is a bug, not a guard.
 *
 * Vitest here is `environment: 'node'` with no jsdom, so the card itself cannot
 * be render-tested. The branching therefore lives here, where it can be, and
 * the component is a dumb reader of this result (same split as
 * `deliveryEvidence.ts`).
 *
 * THE PERMISSION TABLE — human-owner ruling, enforced server-side:
 *
 *   status          | seller                     | runner-up
 *   ----------------|----------------------------|---------------------------
 *   pending_seller  | may accept, may decline    | may decline
 *   pending_buyer   | NOTHING — no buttons       | may accept, may decline
 *
 * The seller's decline is deliberately absent on `pending_buyer`. There, the
 * seller has ALREADY consented — either implicitly, because the runner-up's bid
 * cleared the reserve they themselves set, or explicitly via `seller_accept`.
 * Letting them decline would let them renege on their own price, or undo their
 * own acceptance after the runner-up was told the lot was theirs. The server
 * throws `permission-denied` for exactly this; the UI must not offer the action
 * in the first place. Do NOT "simplify" `canDecline` back to `isSeller ||
 * isBidder`.
 */

import { sellerNet, totalWithPremium } from './bidMath';
import { formatMoney } from './formatMoney';

/**
 * The status vocabulary, pinned to `secondChance.OFFER_STATUSES`. `'expired'` is
 * real — functions/index.js writes it when a relist reclaims a lot whose offer
 * was still `pending_*` — so it must be part of the union even though nothing
 * about it is live.
 */
export type SecondChanceStatus =
  | 'pending_seller'
  | 'pending_buyer'
  | 'confirmed'
  | 'declined'
  | 'expired';

/**
 * The statuses an offer can be in while it is still actionable.
 *
 * Frozen and typed `readonly`: this array is passed BY REFERENCE straight into
 * the `where(..., 'in', ...)` of `useMySecondChanceOffers`, so a push or splice
 * anywhere would silently change what that query returns — which is the one
 * failure mode of that hook (a live offer that never renders and never errors).
 */
export const SECOND_CHANCE_PENDING_STATUSES: readonly SecondChanceStatus[] =
  Object.freeze(['pending_seller', 'pending_buyer'] as const);

/** The offer as it sits on the auction doc (see functions/secondChance.js buildOfferRecord). */
export interface SecondChanceOffer {
  status: SecondChanceStatus;
  bidderId: string;
  /** MAY BE AN EMPTY STRING — see `secondChanceBidderLabel`. */
  bidderName?: string;
  amount: number;
  defaultedOrderId?: string;
  openedAt?: any;
  expiresAt?: any;
  notifiedAt?: any;
  sellerAcceptedAt?: any;
  confirmedAt?: any;
  declinedAt?: any;
  declinedBy?: string;
}

export type SecondChanceAction = 'seller_accept' | 'buyer_accept' | 'decline';
export type SecondChanceRole = 'seller' | 'bidder' | 'none';

export interface SecondChanceViewState {
  /** Render nothing at all when false. */
  visible: boolean;
  role: SecondChanceRole;
  canAccept: boolean;
  canDecline: boolean;
  /** Which callable action the accept button sends; null when there is no accept. */
  acceptAction: Extract<SecondChanceAction, 'seller_accept' | 'buyer_accept'> | null;
  /** Visible, but this viewer has no accept to make — the other party is deciding. */
  awaitingOther: boolean;
}

const HIDDEN: SecondChanceViewState = {
  visible: false,
  role: 'none',
  canAccept: false,
  canDecline: false,
  acceptAction: null,
  awaitingOther: false,
};

/**
 * Firestore Timestamp | {seconds}/{_seconds} | epoch-ms | ISO string → epoch ms.
 * Returns NaN when it cannot derive one. Mirrors `settlement.tsToMillis`.
 */
export function offerMillis(raw: any): number {
  if (raw == null) return NaN;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000 + (Number(raw.nanoseconds) || 0) / 1e6;
  if (typeof raw?._seconds === 'number') return raw._seconds * 1000;
  if (typeof raw === 'string') {
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

/**
 * Pending and unexpired — the client mirror of `secondChance.offerIsLive`.
 * An offer with no decodable `expiresAt` is treated as NOT expired, matching
 * `settlement.isBelowReserveOfferExpired`: the server would still accept it, so
 * hiding the button would strand a real offer behind a malformed timestamp.
 */
export function secondChanceOfferIsLive(
  offer: SecondChanceOffer | null | undefined,
  nowMs: number,
): boolean {
  if (!offer) return false;
  if (offer.status !== 'pending_seller' && offer.status !== 'pending_buyer') return false;
  const expMs = offerMillis(offer.expiresAt);
  if (!Number.isFinite(expMs)) return true;
  return nowMs < expMs;
}

/**
 * What this viewer may do with this auction's second-chance offer.
 * `visible: false` means render nothing — offer absent, decided, expired, or
 * the viewer is neither the seller nor the runner-up.
 */
export function secondChanceViewState(
  auction: { sellerId?: string | null; secondChanceOffer?: SecondChanceOffer | null } | null | undefined,
  viewerId: string | null | undefined,
  nowMs: number,
): SecondChanceViewState {
  const offer = auction?.secondChanceOffer;
  if (!secondChanceOfferIsLive(offer, nowMs)) return HIDDEN;

  const isSeller = !!viewerId && !!auction?.sellerId && auction.sellerId === viewerId;
  const isBidder = !!viewerId && !!offer!.bidderId && offer!.bidderId === viewerId;
  if (!isSeller && !isBidder) return HIDDEN;

  if (offer!.status === 'pending_seller') {
    // The bid is UNDER the reserve and the SELLER is being asked. Their refusal
    // is the whole point of asking, and the runner-up may equally withdraw.
    return {
      visible: true,
      role: isSeller ? 'seller' : 'bidder',
      canAccept: isSeller,
      canDecline: true,
      acceptAction: isSeller ? 'seller_accept' : null,
      awaitingOther: !isSeller,
    };
  }

  // pending_buyer — the seller already consented; only the runner-up decides.
  return {
    visible: true,
    role: isBidder ? 'bidder' : 'seller',
    canAccept: isBidder,
    canDecline: isBidder,
    acceptAction: isBidder ? 'buyer_accept' : null,
    awaitingOther: !isBidder,
  };
}

/**
 * Display name for the runner-up.
 *
 * `offer.bidderName` may be an EMPTY STRING by design: `secondChance.pickRunnerUp`
 * deliberately does not substitute an English `'Bidder'` server-side, because
 * that value reaches WhatsApp and email verbatim in an Arabic-first product. The
 * display fallback belongs here, on the surface that knows the viewer's language.
 */
export function secondChanceBidderLabel(name: string | null | undefined, isAr: boolean): string {
  const trimmed = (name || '').trim();
  if (trimmed) return trimmed;
  return isAr ? 'مزايد' : 'Bidder';
}

/** Total the runner-up will owe: hammer + 5% buyer's premium — same rule as `secondChanceOrderMoney`. */
export function secondChanceTotalDue(amount: number | null | undefined): number {
  const bid = Number(amount);
  if (!Number.isFinite(bid) || bid <= 0) return 0;
  return totalWithPremium(bid);
}

/**
 * The line that must be on screen before Accept can be pressed, so nobody
 * accepts without seeing the number.
 *
 * Money goes through `formatMoney`, which pins `en-US` digits and owns the
 * د.أ / JOD label — a bare `toLocaleString()` follows the DEVICE locale, so on
 * an Arabic-set Jordanian phone it would render «١٠٥» next to a Western-digit
 * countdown on the same card.
 *
 * The two branches say different things because the server does different
 * things: `buyer_accept` mints the order (secondChanceRespond.js:222), while
 * `seller_accept` creates NOTHING — it moves the offer to `pending_buyer` with a
 * fresh 24h and the runner-up still has to confirm (secondChanceRespond.js:128).
 */
export function secondChanceAcceptNote(
  acceptAction: 'seller_accept' | 'buyer_accept',
  totalDue: number,
  isAr: boolean,
): string {
  const money = formatMoney(totalDue, isAr ? 'ar' : 'en');
  if (acceptAction === 'buyer_accept') {
    return isAr
      ? `سيتم إنشاء طلب بقيمة ${money} (شامل عمولة المشتري) وتبدأ مهلة الدفع.`
      : `An order for ${money} (incl. buyer's premium) will be created and the payment window starts.`;
  }
  return isAr
    ? `سيُعرض على المزايد لتأكيد الشراء بقيمة ${money}. لا يُنشأ طلب قبل تأكيده.`
    : `The lot goes to the bidder to confirm at ${money}. No order is created until they do.`;
}

/**
 * What the SELLER actually receives — hammer minus Mazad's 5% seller commission.
 *
 * Shown only on `pending_seller`, where the seller is deciding whether to sell
 * UNDER their own reserve. The buyer's total (105 on a 100 hammer) is the only
 * other number on the card, and it is not the number the seller is paid (95).
 */
export function secondChanceSellerNetNote(amount: number | null | undefined, isAr: boolean): string {
  const money = formatMoney(secondChanceSellerNet(amount), isAr ? 'ar' : 'en');
  return isAr
    ? `صافي ما تستلمه: ${money} (بعد عمولة البيع 5%).`
    : `You receive: ${money} (after the 5% seller commission).`;
}

/** Seller payout on a hammer price; 0 rather than NaN on a corrupt amount. */
export function secondChanceSellerNet(amount: number | null | undefined): number {
  const bid = Number(amount);
  return Number.isFinite(bid) && bid > 0 ? sellerNet(bid) : 0;
}

/**
 * The Accept button's label.
 *
 * The button is the LAST thing read before committing, so the number on it must
 * be the number that party actually transacts — otherwise the seller reads
 * «صافي ما تستلمه: 95 د.أ» and then taps «اقبل — 105 د.أ», and the two numbers
 * contradict each other at the moment of the tap.
 *
 *   buyer_accept  → the buyer's TOTAL (hammer + 5% premium). That is what they pay.
 *   seller_accept → the seller's NET (hammer − 5% commission). That is what they receive.
 *
 * Takes the raw hammer amount, not a pre-computed total, so the label and
 * `secondChanceSellerNetNote` can never be derived from different inputs.
 */
export function secondChanceAcceptLabel(
  acceptAction: 'seller_accept' | 'buyer_accept',
  amount: number | null | undefined,
  isAr: boolean,
): string {
  const lang = isAr ? 'ar' : 'en';
  if (acceptAction === 'buyer_accept') {
    const money = formatMoney(secondChanceTotalDue(amount), lang);
    return isAr ? `اقبل — ${money}` : `Accept — ${money}`;
  }
  const money = formatMoney(secondChanceSellerNet(amount), lang);
  return isAr ? `اقبل — تستلم ${money}` : `Accept — you receive ${money}`;
}

/** `hh:mm` remaining, or the expired wording. Bilingual, Arabic-primary. */
export function secondChanceTimeLeftLabel(remainingMs: number, isAr: boolean): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return isAr ? 'انتهت مهلة العرض' : 'Offer window expired';
  }
  const totalMinutes = Math.floor(remainingMs / 60000);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return isAr ? `متبقي ${hh}:${mm}` : `${hh}:${mm} left`;
}
