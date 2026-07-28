/**
 * Wave 3 — issue the delivery code for an order.
 *
 * Called by the SELLER when they take their first evidence photo, because they
 * must be able to write the code onto the parcel before they photograph it
 * leaving. Idempotent by construction: the code ends up handwritten on a
 * physical box, so a re-issue that returned a different string would invalidate
 * a parcel already in transit and strand a genuine delivery in a code mismatch.
 *
 * Deliberately NOT globally reserved, unlike Wave 1's paymentReferences and
 * Wave 2's orderRefs. Those two are uniqueness claims across all orders (one
 * CliQ transfer; one human-quotable ref). A delivery code is only ever compared
 * against its OWN order's stored code, so a collision between two unrelated
 * orders means nothing and a reservation collection would be dead weight.
 *
 * Written to deliveryCodes/{orderId}, which firestore.rules exposes to the
 * seller and admins only — never the buyer, who must learn it from the parcel.
 */
const { generateDeliveryCode, isValidDeliveryCode } = require('./deliveryCode');

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function issueDeliveryCode(deps, args = {}) {
  const {
    db,
    Timestamp,
    now = () => Date.now(),
    generate = generateDeliveryCode,
  } = deps;
  const { orderId, actorUid, isAdmin = false } = args;

  if (!orderId || typeof orderId !== 'string') {
    throw makeError('invalid-argument', 'orderId is required.');
  }

  return db.runTransaction(async (txn) => {
    // Reads before writes.
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = orderSnap.data() || {};

    if (!isAdmin && o.sellerId !== actorUid) {
      throw makeError('permission-denied', 'Only the seller on this order may issue its delivery code.');
    }

    const codeRef = db.collection('deliveryCodes').doc(orderId);
    const codeSnap = await txn.get(codeRef);
    const existing = codeSnap.exists ? (codeSnap.data() || {}).code : undefined;
    // A stored value that is not a well-formed code is treated as absent: it can
    // never match what a buyer types, so handing it back would guarantee a
    // permanently unconfirmable order.
    if (isValidDeliveryCode(existing)) {
      return { code: existing, created: false };
    }

    const code = generate();
    txn.set(codeRef, {
      orderId,
      sellerId: o.sellerId,
      buyerId: o.buyerId,
      code,
      createdAt: Timestamp.fromMillis(now()),
    });
    return { code, created: true };
  });
}

module.exports = { issueDeliveryCode };
