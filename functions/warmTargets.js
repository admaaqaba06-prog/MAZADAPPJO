// The admin callables kept warm by `warmAdminCallables`.
//
// Measured 2026-07-31 against production: a cold admin callable takes ~2021ms
// to reject an unauthenticated call — i.e. before doing any work at all —
// against ~450ms warm. `placeBid` already carries minInstances:1 for the same
// reason (index.js:1710, load-tested 2026-07-24); this buys the same effect for
// the admin surface at roughly 1% of the cost, at the price of no guarantee.
//
// Pure: no Firestore, no network. Separate from index.js so the list is
// testable and so a target cannot be dropped without a test noticing.
//
// Each target carries a `__warm` short-circuit as the FIRST statement of its
// onCall, deliberately ABOVE its auth check. The obvious alternative — ping
// with no credentials and let the existing `unauthenticated` throw spin the
// container — works, but six pings every five minutes is ~1,700 auth errors a
// day in Cloud Logging, burying the only signal that would reveal a real
// unauthorised attempt on these functions. Below the auth check the line is
// unreachable and pointless; above it, it is reachable unauthenticated by
// design (an accepted risk: it reads nothing, writes nothing, and returns
// nothing — the same amplification the existing auth-rejection path offers).
const WARM_TARGETS = Object.freeze([
  'verifyOrderPayment',
  'approveSubscription',
  'rejectSubscription',
  'approveWithdrawal',
  'rejectWithdrawal',
  'sendFulfillmentNudge',
]);

function warmUrl(name, projectId, region) {
  if (!WARM_TARGETS.includes(name)) {
    throw new Error(`[warmTargets] unknown target "${name}" — add it to WARM_TARGETS or fix the typo`);
  }
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
}

module.exports = { WARM_TARGETS, warmUrl };
