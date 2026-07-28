/**
 * Wave 2 — assign a globally-unique, human-readable MZ order reference.
 *
 * DECOUPLED FROM SETTLEMENT ON PURPOSE. Ref allocation runs in its own
 * transaction, AFTER the order doc has already been committed by the money
 * path (settleAuctionTxn / repairEndedAuctionOrder). Callers wrap this in
 * try/catch so a ref failure (all codes collided, contention, etc.) can NEVER
 * throw out of settlement — the order still exists and stays valid; it just
 * lacks a pretty ref until the next assignment attempt.
 *
 * Uniqueness is enforced by reserving orderRefs/{code} the same way Wave 1
 * reserves paymentReferences/{ref}: read-before-write inside a transaction,
 * retry on collision with a freshly drawn code. Idempotent: an order that
 * already carries a valid orderRef is returned untouched.
 */
const { generateOrderRef, isValidOrderRef } = require('./orderRef');

const MAX_TRIES = 6;

// Loop-local sentinel: a reserved-code collision inside the transaction. Thrown
// to abort THIS transaction, caught by the retry loop to draw the next code.
// Distinct from a real error so we never swallow genuine failures.
const COLLISION = Symbol('orderRef-collision');

async function assignOrderRef(deps, orderId) {
  const {
    db,
    Timestamp,
    now = () => Date.now(),
    generate = generateOrderRef,
  } = deps;

  if (!orderId || typeof orderId !== 'string') {
    throw new Error('assignOrderRef: orderId is required.');
  }

  // Idempotency: if the order already has a valid ref, return it and allocate
  // nothing. Cheap read outside any transaction.
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  const existing = orderSnap.exists ? (orderSnap.data() || {}).orderRef : undefined;
  if (isValidOrderRef(existing)) {
    return existing;
  }

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const code = generate();
    try {
      await db.runTransaction(async (txn) => {
        // Reads before writes: check the reservation slot first.
        const refDoc = db.collection('orderRefs').doc(code);
        const refSnap = await txn.get(refDoc);
        if (refSnap.exists) {
          throw COLLISION; // code already taken — retry with a new one
        }
        txn.set(refDoc, {
          orderId,
          createdAt: Timestamp.fromMillis(now()),
        });
        txn.set(
          db.collection('orders').doc(orderId),
          {
            orderRef: code,
            updatedAt: Timestamp.fromMillis(now()),
          },
          { merge: true }
        );
      });
      return code;
    } catch (e) {
      if (e === COLLISION) continue;
      throw e; // genuine transaction failure — propagate (caller catches)
    }
  }

  throw new Error(
    `assignOrderRef: could not allocate a unique order ref for ${orderId} after ${MAX_TRIES} tries.`
  );
}

module.exports = { assignOrderRef };
