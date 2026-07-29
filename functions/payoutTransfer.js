/**
 * Payout transfer-reference capture.
 *
 * Approving a payout used to record who approved it and when, and nothing about
 * the transfer actually going out — so a seller asking "you approved it three
 * days ago, where is my money?" had no answer in the system, and no way to tell
 * an approved-but-unsent payout from a sent one.
 *
 * Money coming IN is already gated on the admin confirming it landed (the
 * bankVerified checkbox in PaymentVerifyCard, Wave 1). This is that discipline
 * applied to money going OUT: you cannot mark a payout complete without
 * recording the reference of the transfer you actually made.
 *
 * Reuses the CliQ reference normalizer so an outgoing reference is stored in the
 * same shape as every incoming one.
 */
const { normalizePaymentRef, isValidPaymentRef } = require('./paymentReference');

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * The fields to merge onto the withdrawal when an admin approves it.
 * Throws `invalid-argument` if the reference is missing or implausible.
 */
function buildPayoutTransferStamp(deps, args = {}) {
  const { Timestamp, now = () => Date.now() } = deps;
  const { transferRef, adminUid } = args;

  if (!isValidPaymentRef(transferRef)) {
    throw makeError('invalid-argument', 'A CliQ transfer reference is required to approve a payout.');
  }

  return {
    // Normalized for matching; raw so the admin can compare it against their
    // banking app without wondering what we changed.
    transferRef: normalizePaymentRef(transferRef),
    transferRefRaw: String(transferRef),
    sentViaCliq: true,
    transferRecordedBy: adminUid,
    transferRecordedAt: Timestamp.fromMillis(now()),
  };
}

module.exports = { buildPayoutTransferStamp };
