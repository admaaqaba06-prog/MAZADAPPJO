/**
 * Wave 1 S3 — Server-authoritative subscription grant/reject core.
 *
 * These functions are the ONLY writers of the users/{uid} subscription-grant
 * fields (subscriptionStatus / subscriptionPlan / subscriptionTier /
 * subscriptionExpiry / subscriptionApprovedAt / subscriptionExpiresAt) — the
 * Firestore rules block ALL client writes to them, including the admin client.
 *
 * Kept separate from index.js (dependency-injected db/Timestamp/now) so the
 * grant math + idempotency are unit-testable without the Functions runtime.
 */
'use strict';

const { SUBSCRIPTION_TIERS, resolveGrantForRequest } = require('./subscriptionTiers');

const DAY_MS = 24 * 60 * 60 * 1000;

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function buildGrantFields(Timestamp, tier, durationDays, nowMs) {
  const expiryMs = nowMs + durationDays * DAY_MS;
  return {
    expiryMs,
    fields: {
      subscriptionStatus: 'active',
      subscriptionPlan: tier,
      subscriptionTier: tier,
      subscriptionExpiry: expiryMs, // epoch ms — matches existing client reads
      subscriptionApprovedAt: Timestamp.fromMillis(nowMs),
      subscriptionExpiresAt: Timestamp.fromMillis(expiryMs),
    },
  };
}

const REVOKE_FIELDS = Object.freeze({
  subscriptionStatus: 'rejected',
  subscriptionExpiry: null,
  subscriptionPlan: null,
  subscriptionApprovedAt: null,
  subscriptionExpiresAt: null,
});

/**
 * Approve a subscriptionRequests/{reqId} doc and grant the membership.
 * - Duration is RECOMPUTED server-side from the request's canonical tier/price
 *   (resolveGrantForRequest) — never from a client label or stored duration.
 * - IDEMPOTENT: an already-approved request returns { alreadyApproved: true }
 *   with zero writes (no double grant, no expiry extension).
 * - Transactional: request flip + user grant commit atomically.
 *
 * deps: { db, Timestamp, now? }
 */
async function approveSubscriptionRequest(deps, reqId) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!reqId || typeof reqId !== 'string') {
    throw makeError('invalid-argument', 'A subscription request id (reqId) is required.');
  }

  return db.runTransaction(async (txn) => {
    const reqRef = db.collection('subscriptionRequests').doc(reqId);
    const reqSnap = await txn.get(reqRef);
    if (!reqSnap.exists) {
      throw makeError('not-found', `Subscription request ${reqId} not found.`);
    }
    const reqData = reqSnap.data() || {};

    if (reqData.status === 'approved' || reqData.subscriptionStatus === 'approved') {
      return {
        alreadyApproved: true,
        userId: reqData.userId || null,
        tier: reqData.approvedTier || reqData.tier || null,
        durationDays: reqData.approvedDurationDays || null,
      };
    }

    if (!reqData.userId || typeof reqData.userId !== 'string') {
      throw makeError('failed-precondition', `Subscription request ${reqId} has no userId.`);
    }

    // Throws failed-precondition on unresolvable price/tier/plan.
    const { tier, durationDays } = resolveGrantForRequest(reqData);

    const nowMs = now();
    const { expiryMs, fields } = buildGrantFields(Timestamp, tier, durationDays, nowMs);

    txn.set(
      reqRef,
      {
        status: 'approved',
        subscriptionStatus: 'approved',
        approvedAt: Timestamp.fromMillis(nowMs),
        approvedTier: tier,
        approvedDurationDays: durationDays,
      },
      { merge: true }
    );
    txn.set(db.collection('users').doc(reqData.userId), fields, { merge: true });

    return {
      alreadyApproved: false,
      userId: reqData.userId,
      userEmail: reqData.userEmail || null,
      userName: reqData.userName || null,
      tier,
      durationDays,
      expiryMs,
      price: typeof reqData.price === 'number' ? reqData.price : SUBSCRIPTION_TIERS[tier] ? SUBSCRIPTION_TIERS[tier].price : null,
    };
  });
}

/**
 * Direct (comped) grant without a request doc — the admin "activate user
 * directly" flow. Only OFFERED tiers are grantable (default monthly/30d);
 * duration always comes from the canonical table.
 *
 * deps: { db, Timestamp, now? }
 */
async function grantSubscriptionDirect(deps, { userId, tier = 'monthly' } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  if (!userId || typeof userId !== 'string') {
    throw makeError('invalid-argument', 'A userId is required for a direct grant.');
  }
  const def = SUBSCRIPTION_TIERS[tier];
  if (!def) {
    throw makeError('invalid-argument', `Unknown or non-offered subscription tier "${tier}".`);
  }

  const nowMs = now();
  const { expiryMs, fields } = buildGrantFields(Timestamp, tier, def.durationDays, nowMs);

  return db.runTransaction(async (txn) => {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await txn.get(userRef);
    if (!userSnap.exists) {
      throw makeError('not-found', `User ${userId} not found.`);
    }
    txn.set(userRef, fields, { merge: true });
    return { userId, tier, durationDays: def.durationDays, expiryMs, price: def.price };
  });
}

/**
 * Reject a subscription request (or directly downgrade a user).
 * - { reqId }: marks the request rejected; downgrades the user ONLY if they are
 *   still 'pending' — rejecting a stale/duplicate request must never wipe an
 *   already-active membership (parity with the old client logic).
 * - { userId } (no reqId): unconditional downgrade (admin direct-reject flow).
 *
 * deps: { db, Timestamp, now? }
 */
async function rejectSubscriptionRequest(deps, { reqId, userId, reason } = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  const trimmedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

  if (reqId && typeof reqId === 'string') {
    return db.runTransaction(async (txn) => {
      const reqRef = db.collection('subscriptionRequests').doc(reqId);
      const reqSnap = await txn.get(reqRef);
      if (!reqSnap.exists) {
        throw makeError('not-found', `Subscription request ${reqId} not found.`);
      }
      const reqData = reqSnap.data() || {};

      let downgradeUser = false;
      let userRef = null;
      if (reqData.userId && typeof reqData.userId === 'string') {
        userRef = db.collection('users').doc(reqData.userId);
        const userSnap = await txn.get(userRef);
        const userStatus = userSnap.exists ? (userSnap.data() || {}).subscriptionStatus : null;
        downgradeUser = userSnap.exists && userStatus === 'pending';
      }

      txn.set(
        reqRef,
        {
          status: 'rejected',
          subscriptionStatus: 'rejected',
          rejectedAt: Timestamp.fromMillis(now()),
          ...(trimmedReason ? { rejectionReason: trimmedReason } : {}),
        },
        { merge: true }
      );
      if (downgradeUser && userRef) {
        txn.set(userRef, { ...REVOKE_FIELDS }, { merge: true });
      }
      return { reqId, userId: reqData.userId || null, userDowngraded: downgradeUser, reason: trimmedReason };
    });
  }

  if (userId && typeof userId === 'string') {
    return db.runTransaction(async (txn) => {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await txn.get(userRef);
      if (!userSnap.exists) {
        throw makeError('not-found', `User ${userId} not found.`);
      }
      txn.set(userRef, { ...REVOKE_FIELDS }, { merge: true });
      return { reqId: null, userId, userDowngraded: true, reason: trimmedReason };
    });
  }

  throw makeError('invalid-argument', 'Either reqId or userId is required.');
}

module.exports = {
  approveSubscriptionRequest,
  grantSubscriptionDirect,
  rejectSubscriptionRequest,
};
