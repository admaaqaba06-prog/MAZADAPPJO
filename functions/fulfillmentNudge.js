/**
 * Pure fulfillment-nudge core (Slice C). The sendFulfillmentNudge callable in
 * index.js is a thin admin-gated wrapper; bucket re-derivation + idempotent
 * stamping live here so Vitest covers them (same split as orderPaymentVerify.js).
 *
 * NOTE: bucketOrder is re-implemented here (not imported) — this CommonJS
 * module can't import from src/. Kept in sync by mirrored tests (see
 * fulfillmentNudge.test.js, which asserts this copy and src/utils/
 * fulfillmentQueues.ts agree case for case), same intentional duplication as
 * Slice A's nextAuctionNumber/computeNextNumber. That claim was previously
 * unguarded and had already gone stale: the client copy gained
 * waiting_payment -> awaiting_payment and this one never did.
 */
function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bucketOrder(order) {
  if (order.status === 'disputed') return null;
  // Mirrors the client copy. No `kind` maps to 'awaiting_payment' (see
  // KIND_TO_BUCKET), so this line does not make any nudge callable that was not
  // callable before, and nothing new is written: an unpaid order is still
  // rejected with failed-precondition. It only makes the rejection name the
  // bucket the order is actually in instead of reporting 'none'.
  if (order.status === 'waiting_payment') return 'awaiting_payment';
  if (order.status === 'paid' && order.paymentVerified === true) return 'awaiting_shipment';
  if (order.status === 'preparing_shipment') return 'awaiting_shipment';
  // Wave 3 — evidence-gated dispatch queues with legacy shipped.
  if (order.status === 'out_for_delivery') return 'awaiting_delivery';
  if (order.status === 'shipped') return 'awaiting_delivery';
  if (order.status === 'delivered') return 'awaiting_release';
  return null;
}

const KIND_TO_BUCKET = { ship: 'awaiting_shipment', confirm_delivery: 'awaiting_delivery' };

async function sendFulfillmentNudge(deps, { orderId, kind, adminUid } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  if (!KIND_TO_BUCKET[kind]) throw makeError('invalid-argument', "kind must be 'ship' or 'confirm_delivery'.");

  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};

    const actualBucket = bucketOrder(o);
    if (actualBucket !== KIND_TO_BUCKET[kind]) {
      throw makeError('failed-precondition', `Order ${orderId} is not in the '${KIND_TO_BUCKET[kind]}' bucket (actual: ${actualBucket || 'none'}).`);
    }

    txn.set(ref, {
      lastNudgedAt: Timestamp.fromMillis(now()),
      nudgeCount: (o.nudgeCount || 0) + 1,
    }, { merge: true });

    return kind === 'ship'
      ? { orderId, kind, targetUserId: o.sellerId || null, targetUserName: o.sellerName || 'Seller' }
      : { orderId, kind, targetUserId: o.buyerId || null, targetUserName: o.buyerName || 'Buyer' };
  });
}

// bucketOrder is exported for the mirrored test ONLY — index.js uses the
// callable, not the bucketer.
module.exports = { sendFulfillmentNudge, bucketOrder };
