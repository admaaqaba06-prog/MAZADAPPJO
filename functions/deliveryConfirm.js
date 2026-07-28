/**
 * Wave 3 — the buyer's delivery-code attempt gate.
 *
 * This is the RATE LIMITER, not the authority. The authoritative code check
 * lives inside releaseOrderEscrow's money transaction (functions/index.js), so
 * a caller who somehow skipped this gate still cannot release funds on a wrong
 * code. This function exists because that transaction cannot count failures: a
 * mismatch there throws, the transaction rolls back, and the counter increment
 * rolls back with it — leaving an unbounded number of free guesses at a
 * money-releasing endpoint.
 *
 * So on a mismatch this RETURNS `{ matched: false }` after committing the
 * increment, rather than throwing. The caller turns that into the user-facing
 * error. Do not "tidy" this into a throw — that re-opens the hole.
 */
const { isValidDeliveryCode, normalizeDeliveryCodeInput } = require('./deliveryCode');

const MAX_CODE_ATTEMPTS = 5;

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * https only. The receipt photo is uploaded to Firebase Storage and its download
 * URL is always https; anything else is either a caller mistake or an attempt to
 * park a non-image scheme on an order doc that admins later open from a dispute
 * queue.
 */
function isHttpsUrl(v) {
  return typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim());
}

async function checkDeliveryConfirm(deps, args = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  const { orderId, buyerUid, typedCode, receivedPhotoUrl } = args;

  if (!orderId || typeof orderId !== 'string') {
    throw makeError('invalid-argument', 'orderId is required.');
  }
  if (!isHttpsUrl(receivedPhotoUrl)) {
    throw makeError('invalid-argument', 'A photo of the item received is required.');
  }

  return db.runTransaction(async (txn) => {
    // Reads before writes.
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = orderSnap.data() || {};

    if (o.buyerId !== buyerUid) {
      throw makeError('permission-denied', 'Only the buyer on this order may confirm receipt.');
    }
    if (o.status !== 'out_for_delivery') {
      throw makeError('failed-precondition', `Order ${orderId} is not out for delivery.`);
    }
    // Half a chain is no chain: without the seller's dispatch photo there is
    // nothing for the buyer's photo to be matched against in a dispute.
    if (!o.sentPhotoUrl) {
      throw makeError('failed-precondition', 'The seller has not uploaded a dispatch photo for this order.');
    }

    const attempts = o.deliveryCodeAttempts || 0;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      throw makeError('resource-exhausted', 'Too many delivery-code attempts on this order. Contact support.');
    }

    const codeSnap = await txn.get(db.collection('deliveryCodes').doc(orderId));
    const stored = codeSnap.exists ? (codeSnap.data() || {}).code : null;
    if (!isValidDeliveryCode(stored)) {
      throw makeError('failed-precondition', 'No delivery code has been issued for this order.');
    }

    if (normalizeDeliveryCodeInput(typedCode) !== stored) {
      const next = attempts + 1;
      txn.set(orderRef, {
        deliveryCodeAttempts: next,
        updatedAt: Timestamp.fromMillis(now()),
      }, { merge: true });
      return { matched: false, attempts: next, remaining: MAX_CODE_ATTEMPTS - next };
    }

    return { matched: true, attempts, remaining: MAX_CODE_ATTEMPTS - attempts };
  });
}

module.exports = { checkDeliveryConfirm, MAX_CODE_ATTEMPTS, isHttpsUrl };
