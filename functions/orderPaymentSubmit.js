/**
 * Wave 1 — buyer payment-submit core (CliQ reference uniqueness).
 *
 * Mirrors orderPaymentVerify.js: the callable in index.js is a thin
 * auth-gated wrapper; the state machine + idempotency live here so Vitest
 * covers them.
 *
 * The buyer's current submit path (src/components/OrderDetailsView.tsx
 * handleSubmitCliqPayment + src/utils/orderWorkflow.ts 'pay' transition) does
 * two writes: first the proof/address fields, then the 'pay' transition which
 * flips status -> 'paid' / paymentStatus -> 'paid'. Precondition for that
 * transition is status === 'waiting_payment' (VALID_TRANSITIONS in
 * orderWorkflow.ts). We replicate BOTH the precondition and the resulting
 * status fields here, and additionally reserve a unique payment reference in
 * the SAME transaction so two buyers cannot claim the same CliQ transfer.
 */
const { normalizePaymentRef, isValidPaymentRef } = require('./paymentReference');

const MAX_ATTEMPTS = 3;

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function submitOrderPayment(deps, args = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  const {
    orderId,
    buyerUid,
    proofUrl,
    cliqSenderPhone,
    txnRef,
    deliveryAddress,
    deliveryPhone,
  } = args;

  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');

  return db.runTransaction(async (txn) => {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await txn.get(orderRef);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};

    if (o.buyerId !== buyerUid) throw makeError('permission-denied', 'You are not the buyer on this order.');

    // Submittable-state precondition — mirrors orderWorkflow.ts 'pay' transition,
    // which is only legal from status === 'waiting_payment'.
    if (o.status !== 'waiting_payment') {
      throw makeError('failed-precondition', `Order ${orderId} is not awaiting payment.`);
    }

    const attempts = o.paymentAttempts || 0;
    if (attempts >= MAX_ATTEMPTS) throw makeError('resource-exhausted', 'too many payment attempts');

    if (!isValidPaymentRef(txnRef)) throw makeError('invalid-argument', 'invalid transaction reference');
    if (!proofUrl) throw makeError('invalid-argument', 'missing payment receipt');
    if (!cliqSenderPhone || !String(cliqSenderPhone).trim()) throw makeError('invalid-argument', 'missing sender phone');

    const normRef = normalizePaymentRef(txnRef);
    const refRef = db.collection('paymentReferences').doc(normRef);
    const refSnap = await txn.get(refRef);
    if (refSnap.exists && (refSnap.data() || {}).orderId !== orderId) {
      throw makeError('already-exists', 'this transaction reference has already been used');
    }

    txn.set(refRef, {
      orderId,
      buyerId: buyerUid,
      createdAt: Timestamp.fromMillis(now()),
    }, { merge: true });

    txn.set(orderRef, {
      paymentProofUrl: proofUrl,
      cliqSenderPhone: String(cliqSenderPhone).trim(),
      txnRef,
      txnRefNormalized: normRef,
      paymentAttempts: attempts + 1,
      deliveryAddress: deliveryAddress ?? o.deliveryAddress ?? null,
      deliveryPhone: deliveryPhone ?? o.deliveryPhone ?? null,
      paymentSubmittedAt: Timestamp.fromMillis(now()),
      updatedAt: Timestamp.fromMillis(now()),
      // Status semantics replicated from the current submit path
      // (orderWorkflow.ts 'pay' transition, :204-207): proof pending admin
      // verify but the order flips to paid/paid, exactly as today.
      status: 'paid',
      paymentStatus: 'paid',
    }, { merge: true });

    return { orderId, attempts: attempts + 1 };
  });
}

module.exports = { submitOrderPayment };
