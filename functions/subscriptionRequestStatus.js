/**
 * Decide what to write to the USER doc's subscriptionStatus when a
 * subscription request is created.
 *
 * The request doc itself is always 'pending' (it needs admin review). But an
 * already-ACTIVE member submitting an upgrade must NOT be downgraded to
 * 'pending' on their user doc — bidding is gated on subscriptionStatus ===
 * 'active', so downgrading would revoke the very membership they're paying to
 * upgrade. Keep them active; the grant (new tier + fresh term) applies on
 * approval. Everyone else keeps today's behavior (flip to pending).
 */
function userStatusForSubscriptionRequest(currentStatus) {
  return currentStatus === 'active' ? 'active' : 'pending';
}

module.exports = { userStatusForSubscriptionRequest };
