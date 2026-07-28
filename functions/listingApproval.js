/**
 * Auto-activate a seller account when the admin team approves their listing.
 *
 * The rule (MJ, 2026-07-28): listing an item should create a seller account —
 * but only once a human has approved the lot. Approval IS the admin team's
 * judgement gate, so it is the only honest moment to grant seller status.
 * Granting at create time would hand an account to anyone who submitted
 * anything, approved or not.
 *
 * Pure decision function, no Firestore. The trigger in index.js reads the
 * auction and the creator's user doc and calls this; every skip below is
 * therefore unit-testable without an emulator.
 */

function isApprovedState(doc) {
  if (!doc) return false;
  return doc.isApproved === true || doc.approvalStatus === 'approved';
}

/**
 * @param {object} before  auction doc before the write
 * @param {object} after   auction doc after the write
 * @param {object|null} creator  the creator's users/{uid} data, or null if absent
 * @returns {{activate: boolean, uid?: string, reason: string}}
 */
function shouldActivateSellerOnApproval(before, after, creator) {
  // Only the moment of approval counts. Every later edit to an approved lot
  // (price correction, viewing change, a bid landing) re-fires this trigger,
  // and re-running on those would be noise at best.
  if (isApprovedState(before) || !isApprovedState(after)) {
    return { activate: false, reason: 'not_an_approval_transition' };
  }

  // Mazad's own inventory has no user behind it. The admin drop builder stamps
  // createdById with the ADMIN's uid and sets soldByMazad, so activating on
  // that would hand Mazad's lots to a staff account and mint a public
  // sellerProfiles store page for them.
  if (after.soldByMazad === true) {
    return { activate: false, reason: 'sold_by_mazad' };
  }

  const uid = after.createdById;
  if (!uid || typeof uid !== 'string') {
    return { activate: false, reason: 'no_creator' };
  }

  if (!creator) {
    return { activate: false, reason: 'no_creator_doc' };
  }

  // Same reasoning as soldByMazad, for admin-created lots that were not
  // stamped: an admin already sees every order and does not need — and should
  // not silently gain — a public store page.
  if (creator.isAdmin === true || creator.role === 'admin') {
    return { activate: false, reason: 'creator_is_admin' };
  }

  if (creator.isBlocked === true) {
    return { activate: false, reason: 'creator_blocked' };
  }

  if (creator.isSeller === true || creator.role === 'seller') {
    return { activate: false, reason: 'already_seller' };
  }

  return { activate: true, uid, reason: 'approved' };
}

module.exports = { shouldActivateSellerOnApproval, isApprovedState };
