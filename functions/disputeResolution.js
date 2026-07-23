/**
 * Pure dispute-resolution metadata stamp (Slice D). This is NOT a money
 * transition — the real resolution (release/refund/resume) already ran
 * through the existing, untouched executeOrderTransition('resolve_dispute')
 * path BEFORE this is ever called. This module only records the admin's
 * note for the record. Mirrors the deps-injection + fake-db test pattern
 * from orderPaymentVerify.js / fulfillmentNudge.js.
 */
const VALID_RESOLUTION_TYPES = ['release', 'refund', 'resume'];

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

    txn.set(ref, {
      resolutionNotes: trimmedNotes,
      disputeResolvedBy: adminUid || null,
      disputeResolvedAt: Timestamp.fromMillis(now()),
      disputeResolutionType: resolutionType,
    }, { merge: true });

    return { orderId, resolutionType, notes: trimmedNotes };
  });
}

module.exports = { stampDisputeResolution };
