/**
 * Pure order-payment verification core (Slice B). The verifyOrderPayment
 * callable in index.js is a thin admin-gated wrapper; the state machine and
 * idempotency live here so Vitest covers them (same split as
 * subscriptionApproval.js).
 */
const RECEIPT_FIELDS = ['receiptUrl', 'paymentProofUrl', 'paymentProofImage', 'proofUrl', 'paymentImageUrl'];

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function hasReceipt(orderData) {
  return RECEIPT_FIELDS.some((f) => typeof orderData[f] === 'string' && /^https?:\/\//i.test(orderData[f].trim()));
}

async function verifyOrderPayment(deps, { orderId, adminUid } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};
    if (o.paymentVerified === true) {
      return { orderId, buyerId: o.buyerId || null, buyerName: o.buyerName || 'Buyer', alreadyVerified: true };
    }
    if (!hasReceipt(o)) throw makeError('failed-precondition', `Order ${orderId} has no payment receipt to verify.`);
    txn.set(ref, {
      paymentVerified: true,
      paymentVerifiedBy: adminUid || null,
      paymentVerifiedAt: Timestamp.fromMillis(now()),
      ...(o.status === 'waiting_payment' ? { status: 'paid', paymentStatus: 'paid' } : {}),
    }, { merge: true });
    return { orderId, buyerId: o.buyerId || null, buyerName: o.buyerName || 'Buyer', alreadyVerified: false };
  });
}

async function rejectOrderPayment(deps, { orderId, adminUid, reason } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed) throw makeError('invalid-argument', 'A rejection reason is required.');
  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};
    if (o.paymentVerified === true) {
      throw makeError('failed-precondition', `Order ${orderId} is already verified; un-verifying is not supported.`);
    }
    txn.set(ref, {
      paymentStatus: 'unpaid',
      status: 'waiting_payment',
      paymentRejectionReason: trimmed,
      paymentRejectedBy: adminUid || null,
      paymentRejectedAt: Timestamp.fromMillis(now()),
    }, { merge: true });
    return { orderId, buyerId: o.buyerId || null, buyerName: o.buyerName || 'Buyer', reason: trimmed };
  });
}

module.exports = { verifyOrderPayment, rejectOrderPayment };
