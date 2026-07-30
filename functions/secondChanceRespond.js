/**
 * Second Chance Offer — the accept/decline transaction.
 *
 * The callable in index.js is a thin wrapper (auth, the post-commit notify, the
 * cosmetic order ref); the money and the state machine live here so Vitest can
 * cover them. Same split as orderPaymentSubmit.js / deliveryIssue.js — index.js
 * cannot be imported by a test (firebase-admin at module scope), so anything
 * left inside it is only ever guarded by source greps.
 *
 * Three actions:
 *   seller_accept → pending_seller becomes pending_buyer, and the BUYER gets a
 *                   FRESH 24h (not the residual of the seller's window), exactly
 *                   as acceptBelowReserve does.
 *   buyer_accept  → mints orders/<auctionId>__sc and confirms the offer.
 *   decline       → terminal; unblocks relist.
 *
 * The second-chance order CANNOT reuse the auction id: the defaulted order
 * already owns `orders/{auctionId}`, and that document belongs to the buyer who
 * failed to pay — it is never read or written here. Money is recomputed from
 * the runner-up's own bid, never inherited from the dead order, which was for
 * more.
 *
 * Returns `{ result, notify }`. The notify is DESCRIBED here and SENT by the
 * caller after the transaction commits: Firestore retries a contended callback,
 * so a message sent inside it goes out once per attempt. `pendingNotify` is
 * reset at the top of every attempt for the same reason — without that reset a
 * retry that takes a different branch would still carry the previous attempt's
 * message.
 */
'use strict';

const { belowReserveExpiryMs, resolvePaymentWindowHours } = require('./settlement');
const { secondChanceOrderId, secondChanceOrderMoney, offerIsLive } = require('./secondChance');
const { isEffectivelyBlocked } = require('./banLadder');

const ACTIONS = ['seller_accept', 'buyer_accept', 'decline'];

/**
 * Display fallbacks for a name we could not resolve. Arabic, not 'Buyer' —
 * these reach the order card, the seller's screen and the notification
 * templates verbatim in an Arabic-first product.
 */
const BUYER_FALLBACK = 'مشتري';
const SELLER_FALLBACK = 'بائع';

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function respondToSecondChance(deps, args = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  const { auctionId, action, callerUserId } = args;

  if (!callerUserId) throw makeError('unauthenticated', 'يجب تسجيل الدخول لتنفيذ هذه العملية.');
  if (!auctionId || typeof auctionId !== 'string') throw makeError('invalid-argument', 'معرّف المزاد مطلوب.');
  if (!ACTIONS.includes(action)) throw makeError('invalid-argument', 'إجراء غير معروف.');

  let pendingNotify = null;
  const result = await db.runTransaction(async (transaction) => {
    pendingNotify = null; // a retried txn must not re-emit a prior attempt's notify
    const nowMs = now();

    const auctionRef = db.collection('auctions').doc(auctionId);
    // NOT orders/{auctionId} — that is the DEFAULTED buyer's order.
    const orderRef = db.collection('orders').doc(secondChanceOrderId(auctionId));
    const [auctionSnap, orderSnap] = await Promise.all([
      transaction.get(auctionRef),
      transaction.get(orderRef),
    ]);
    if (!auctionSnap.exists) throw makeError('not-found', 'المزاد غير موجود.');

    const auction = auctionSnap.data() || {};
    const offer = auction.secondChanceOffer;
    if (!offer) throw makeError('failed-precondition', 'لا يوجد عرض فرصة ثانية على هذا المزاد.');

    const isSeller = !!auction.sellerId && auction.sellerId === callerUserId;
    const isBidder = !!offer.bidderId && offer.bidderId === callerUserId;

    // AUTHORISATION FIRST — before any idempotent short-circuit. An "already
    // created" answer tells the caller a sale happened on this lot, which is
    // not a stranger's business to know.
    if (action === 'seller_accept' && !isSeller) {
      throw makeError('permission-denied', 'البائع فقط يمكنه قبول هذا العرض.');
    }
    if (action === 'buyer_accept' && !isBidder) {
      throw makeError('permission-denied', 'صاحب العرض فقط يمكنه القبول.');
    }
    if (action === 'decline' && !isSeller && !isBidder) {
      throw makeError('permission-denied', 'لا تملك صلاحية على هذا العرض.');
    }

    // Idempotency BEFORE the liveness gate: a confirmed offer is no longer
    // "live", so a double-tap from the buyer would otherwise be answered with
    // "the offer expired" for a purchase that in fact succeeded.
    if (action === 'buyer_accept' && offer.status === 'confirmed' && orderSnap.exists) {
      return { success: true, message: 'تم إنشاء الطلب سابقاً.', alreadyCreated: true };
    }

    if (!offerIsLive(offer, nowMs)) {
      throw makeError('failed-precondition', 'انتهت صلاحية العرض أو تم إغلاقه.');
    }

    if (action === 'seller_accept') {
      if (offer.status !== 'pending_seller') {
        throw makeError('failed-precondition', 'العرض ليس بانتظار موافقة البائع.');
      }
      transaction.update(auctionRef, {
        'secondChanceOffer.status': 'pending_buyer',
        'secondChanceOffer.sellerAcceptedAt': Timestamp.fromMillis(nowMs),
        // Fresh window for the buyer — see acceptBelowReserve for the same reasoning.
        'secondChanceOffer.expiresAt': Timestamp.fromMillis(belowReserveExpiryMs(nowMs)),
      });
      pendingNotify = {
        uid: offer.bidderId,
        event: 'below_reserve_seller_accepted',
        data: {
          auctionId,
          auctionTitle: auction.title || '',
          topBid: offer.amount,
          secondChance: true,
          offerStatus: 'pending_buyer',
        },
      };
      return { success: true, message: 'تم قبول العرض. بانتظار تأكيد المشتري.' };
    }

    if (action === 'decline') {
      transaction.update(auctionRef, {
        'secondChanceOffer.status': 'declined',
        'secondChanceOffer.declinedAt': Timestamp.fromMillis(nowMs),
        'secondChanceOffer.declinedBy': callerUserId,
      });
      // Whoever did NOT decline is the one who needs telling. When the seller
      // declines, the runner-up learns their offer is closed; when the
      // runner-up declines, the SELLER learns the lot is free again — without
      // that the lot silently becomes relist-eligible with nobody informed.
      // `declinedBy` picks the wording (see notify.js copyFor).
      pendingNotify = isBidder
        ? {
          uid: auction.sellerId,
          event: 'below_reserve_declined',
          data: { auctionId, auctionTitle: auction.title || '', secondChance: true, declinedBy: 'buyer' },
        }
        : {
          uid: offer.bidderId,
          event: 'below_reserve_declined',
          data: { auctionId, auctionTitle: auction.title || '', secondChance: true, declinedBy: 'seller' },
        };
      if (!pendingNotify.uid) pendingNotify = null;
      return { success: true, message: 'تم إغلاق العرض.' };
    }

    // ---- buyer_accept: mint the order --------------------------------------
    if (offer.status !== 'pending_buyer') {
      throw makeError('failed-precondition', 'العرض بانتظار موافقة البائع.');
    }
    if (orderSnap.exists) {
      return { success: true, message: 'تم إنشاء الطلب سابقاً.', alreadyCreated: true };
    }

    // The offer amount is re-validated rather than trusted. It has been sitting
    // on the auction document since the default; a corrupt value would sail
    // through Math.round and mint an order whose every money field is NaN —
    // Firestore stores NaN doubles happily, and the buyer would owe "NaN د.أ".
    const bid = Number(offer.amount);
    if (!Number.isFinite(bid) || bid <= 0) {
      throw makeError('failed-precondition', 'قيمة العرض غير صالحة. يرجى التواصل مع الدعم.');
    }

    // `offer.bidderName` comes off the bid document and may be the MASKED
    // public label — or, by design, an empty string (secondChance.pickRunnerUp
    // refuses to pick a display fallback in English for an Arabic-first
    // product). The PRIVATE order needs a real, non-empty name, so resolve it
    // from the user doc. This read must precede every write below (Firestore:
    // all reads first); it could not join the Promise.all above because
    // bidderId is only known after reading the auction.
    const bidderSnap = await transaction.get(db.collection('users').doc(offer.bidderId));
    const bidder = bidderSnap.exists ? (bidderSnap.data() || {}) : {};

    // Ban gate. Everyone in this flow bid days ago and may have been banned
    // since — very plausibly for defaulting on another lot. Minting a fresh
    // payment obligation for a restricted account would hand them exactly what
    // the ban withholds. Same helper placeBid uses, so there is one answer to
    // "is this account restricted".
    //
    // NO membership check, deliberately: this accepts a bid the user already
    // legitimately placed, which is closer to paying for a win (no membership
    // gate anywhere on that path) than to placing a new bid. Killing a real
    // sale — and stranding the lot for good, since a second chance is one-shot
    // — over a lapsed subscription would cost more than it protects.
    if (isEffectivelyBlocked(bidder, nowMs)) {
      throw makeError('failed-precondition', 'حسابك مقيّد حالياً ولا يمكنك قبول هذا العرض. يرجى التواصل مع الدعم.');
    }

    const buyerName = bidder.name || offer.bidderName || BUYER_FALLBACK;
    const money = secondChanceOrderMoney(bid);
    const paymentWindowHours = resolvePaymentWindowHours(auction.paymentWindowHours);
    const paymentDeadlineAt = Timestamp.fromMillis(nowMs + paymentWindowHours * 60 * 60 * 1000);

    transaction.set(orderRef, {
      id: orderRef.id,
      auctionId,
      auctionTitle: auction.title || '',
      auctionImage: auction.thumbnailUrl || auction.imageUrl || '',
      sellerId: auction.sellerId || '',
      sellerName: auction.sellerName || SELLER_FALLBACK,
      buyerId: offer.bidderId,
      buyerName,
      ...money,
      paymentDeadlineAt,
      paymentWindowHours,
      status: 'waiting_payment',
      paymentStatus: 'unpaid',
      shippingStatus: 'not_started',
      escrowStatus: 'locked',
      // Provenance: this order exists because another one died.
      secondChanceFor: offer.defaultedOrderId || auctionId,
      ...(auction.isSimulated === true ? { isSimulated: true } : {}),
      createdAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
    });
    transaction.update(auctionRef, {
      // MUST be the literal 'confirmed' — belowReserveBlocksRelist blocks a
      // relist forever on that exact string, and nothing else. A near-synonym
      // would not error anywhere; the lot would simply relist under a live sale.
      'secondChanceOffer.status': 'confirmed',
      'secondChanceOffer.confirmedAt': Timestamp.fromMillis(nowMs),
    });

    pendingNotify = {
      uid: offer.bidderId,
      event: 'payment_due',
      data: {
        auctionId,
        auctionTitle: auction.title || '',
        orderId: orderRef.id,
        totalDue: money.totalDue,
        paymentHours: paymentWindowHours,
        paymentDeadlineAt,
        secondChance: true,
      },
    };
    return { success: true, message: 'تم تأكيد الشراء. أكمل الدفع خلال المهلة.', orderId: orderRef.id };
  });

  return { result, notify: pendingNotify };
}

module.exports = { respondToSecondChance, ACTIONS, BUYER_FALLBACK, SELLER_FALLBACK };
