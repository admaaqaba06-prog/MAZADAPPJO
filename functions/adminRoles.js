'use strict';
/**
 * Granting and revoking administrative access, as a role rather than a literal.
 *
 * WHY THIS EXISTS. Admin access was granted in part by an email address and a
 * uid compiled into source — in Cloud Functions, in firestore.rules, in
 * storage.rules and in the client. A literal identity cannot be revoked without
 * a deploy, survives the person leaving, and is readable by anyone who can read
 * the repository. Bank al Etihad's production-access review requires role-based
 * access with individual accounts, and a personal address hardcoded as a
 * superuser does not meet it.
 *
 * TWO STORES, AND BOTH ARE NECESSARY:
 *
 *   users/{uid}.role = 'admin'   read by firestore.rules and by the callables
 *   custom claim  admin: true    read by storage.rules
 *
 * storage.rules cannot see Firestore documents as it is written today — its
 * isAdmin() accepts only `request.auth.token.admin == true` or the hardcoded
 * email. Nothing in this codebase has ever called setCustomUserClaims, so that
 * claim has never been set, which means the email literal is currently the ONLY
 * working admin path for Storage. Removing it without setting the claim first
 * would lock every administrator out of payment proofs. Granting both together
 * is what makes the literal safe to delete.
 *
 * THE CLAIM NEEDS A FRESH TOKEN. Custom claims land in the ID token, and an
 * already-signed-in session keeps its old one until it refreshes (about an hour,
 * or immediately on getIdToken(true)). A newly granted admin may therefore need
 * to sign out and back in before Storage lets them through. That is a property
 * of Firebase Auth, not a bug here, and it is why the migration verifies access
 * before any literal is removed.
 */

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Normalised email, or '' when the input is not usable. */
function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Can `actorUid` revoke `targetUid`?
 *
 * NOBODY MAY REVOKE THEMSELVES. It is the classic way an access-control system
 * removes its own last operator: the person testing the revoke flow tries it on
 * the account they are signed in as, and there is then no one left who can grant
 * it back. Revoking someone else always has a second admin to undo it; revoking
 * yourself may not.
 */
function canRevoke(actorUid, targetUid) {
  if (!actorUid || !targetUid) return false;
  return actorUid !== targetUid;
}

/**
 * Grant admin to the account with this email.
 *
 * Both stores are written, and the audit row is written in the same batch as the
 * role so a grant cannot exist without a record of who made it. The custom claim
 * is set outside the batch because it lives in Auth, not Firestore — see the
 * ordering note below.
 */
async function grantAdmin(deps, args = {}) {
  const { db, auth, Timestamp, now = () => Date.now() } = deps;
  const { email, actorUid, actorEmail } = args;

  const target = normalizeEmail(email);
  if (!target) throw makeError('invalid-argument', 'An email address is required.');
  if (!actorUid) throw makeError('unauthenticated', 'Missing the acting administrator.');

  let user;
  try {
    user = await auth.getUserByEmail(target);
  } catch (e) {
    // Deliberately specific: "no such account" is the common case when an admin
    // is being added before they have signed up, and a generic failure here
    // sends someone hunting through logs for a typo that is not there.
    throw makeError('not-found', `No account exists for ${target}. They must sign in once before they can be granted admin.`);
  }

  const ts = Timestamp.fromMillis(now());

  // The CLAIM FIRST, then the role. If the claim succeeds and the role write
  // fails, the account has Storage access but not Firestore admin — visible,
  // recoverable by re-running. The other order would give Firestore admin with
  // no Storage access, which looks like a working grant until someone opens a
  // payment proof.
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });

  const batch = db.batch();
  batch.set(db.collection('users').doc(user.uid), {
    role: 'admin',
    isAdmin: true,
    adminGrantedAt: ts,
    adminGrantedBy: actorEmail || actorUid,
  }, { merge: true });
  batch.set(db.collection('adminRoleAudit').doc(), {
    action: 'grant',
    targetUid: user.uid,
    targetEmail: target,
    actorUid,
    actorEmail: actorEmail || null,
    at: ts,
  });
  await batch.commit();

  return { uid: user.uid, email: target, granted: true };
}

/**
 * Remove admin from the account with this email.
 *
 * Clears both stores. The audit row is kept — an access-control record that
 * deletes its own history answers no question a reviewer will ask.
 */
async function revokeAdmin(deps, args = {}) {
  const { db, auth, Timestamp, now = () => Date.now() } = deps;
  const { email, actorUid, actorEmail } = args;

  const target = normalizeEmail(email);
  if (!target) throw makeError('invalid-argument', 'An email address is required.');
  if (!actorUid) throw makeError('unauthenticated', 'Missing the acting administrator.');

  let user;
  try {
    user = await auth.getUserByEmail(target);
  } catch (e) {
    throw makeError('not-found', `No account exists for ${target}.`);
  }

  if (!canRevoke(actorUid, user.uid)) {
    throw makeError('failed-precondition', 'You cannot revoke your own administrative access. Ask another administrator.');
  }

  const ts = Timestamp.fromMillis(now());

  const claims = { ...(user.customClaims || {}) };
  delete claims.admin;
  await auth.setCustomUserClaims(user.uid, claims);

  const batch = db.batch();
  batch.set(db.collection('users').doc(user.uid), {
    role: 'user',
    isAdmin: false,
    adminRevokedAt: ts,
    adminRevokedBy: actorEmail || actorUid,
  }, { merge: true });
  batch.set(db.collection('adminRoleAudit').doc(), {
    action: 'revoke',
    targetUid: user.uid,
    targetEmail: target,
    actorUid,
    actorEmail: actorEmail || null,
    at: ts,
  });
  await batch.commit();

  return { uid: user.uid, email: target, revoked: true };
}

module.exports = { grantAdmin, revokeAdmin, canRevoke, normalizeEmail };
