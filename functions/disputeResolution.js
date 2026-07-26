/**
 * Pure dispute-resolution metadata stamp (Slice D). This is NOT a money
 * transition — the real resolution (release/refund/resume) already ran
 * through the existing, untouched executeOrderTransition('resolve_dispute')
 * path BEFORE this is ever called. This module only records the admin's
 * note for the record. Mirrors the deps-injection + fake-db test pattern
 * from orderPaymentVerify.js / fulfillmentNudge.js.
 */
const VALID_RESOLUTION_TYPES = ['release', 'refund', 'resume'];

/**
 * Pure mapper: admin resolutionType → the terminal returnClaim.status for a
 * return-type dispute. Refund approves the return (money already refunded);
 * release denies it (money already released to seller). Anything else (resume,
 * unknown) leaves the claim untouched → null. NO money movement implied here.
 */
function returnStatusFor(resolutionType) {
  if (resolutionType === 'refund') return 'resolved_refunded';
  if (resolutionType === 'release') return 'resolved_denied';
  return null;
}

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function stampDisputeResolution(deps, { orderId, resolutionType, adminUid, notes } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  if (!VALID_RESOLUTION_TYPES.includes(resolutionType)) {
    throw makeError('invalid-argument', "resolutionType must be 'release', 'refund', or 'resume'.");
  }
  const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';
  if (!trimmedNotes) throw makeError('invalid-argument', 'A resolution note is required.');

  return db.runTransaction(async (txn) => {
    const ref = db.collection('orders').doc(orderId);
    const snap = await txn.get(ref);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const order = snap.data() || {};

    const write = {
      resolutionNotes: trimmedNotes,
      disputeResolvedBy: adminUid || null,
      disputeResolvedAt: Timestamp.fromMillis(now()),
      disputeResolutionType: resolutionType,
    };

    // Return-type dispute: ALSO close out the return claim (advisory status
    // stamp only — the money move already happened via refund/releaseOrderEscrow
    // BEFORE this stamp). Surface the info the caller needs to notify the buyer.
    const returnStatus = order.disputeType === 'return' ? returnStatusFor(resolutionType) : null;
    if (returnStatus) {
      write['returnClaim.status'] = returnStatus;
    }

    txn.set(ref, write, { merge: true });

    const base = { orderId, resolutionType, notes: trimmedNotes };
    if (returnStatus) {
      return {
        ...base,
        isReturn: true,
        outcome: resolutionType === 'refund' ? 'refunded' : 'denied',
        buyerId: order.buyerId || null,
        auctionId: order.auctionId || null,
        auctionTitle: order.auctionTitle || null,
      };
    }
    return { ...base, isReturn: false };
  });
}

module.exports = { stampDisputeResolution, returnStatusFor };
