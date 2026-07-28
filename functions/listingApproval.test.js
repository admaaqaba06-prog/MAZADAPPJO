// Auto-activate a seller when the admin team approves their listing.
//
// MJ's rule: listing an item should create a seller account — but only once a
// human has approved the lot. Approval is the admin team's judgement gate, so
// it is the only honest moment to grant seller status; granting at CREATE time
// would hand an account to anyone who submitted anything.
//
// The decision is a pure function so every skip case is testable without a
// Firestore trigger. The trigger in index.js only reads docs and calls this.
import { describe, it, expect } from 'vitest';
import { shouldActivateSellerOnApproval } from './listingApproval.js';

const pending = (over = {}) => ({ approvalStatus: 'pending', isApproved: false, createdById: 'u1', ...over });
const approved = (over = {}) => ({ approvalStatus: 'approved', isApproved: true, createdById: 'u1', ...over });

describe('shouldActivateSellerOnApproval — when it fires', () => {
  it('fires on the pending -> approved transition', () => {
    const d = shouldActivateSellerOnApproval(pending(), approved(), { isAdmin: false });
    expect(d.activate).toBe(true);
    expect(d.uid).toBe('u1');
  });

  it('fires when only isApproved flips, without approvalStatus', () => {
    const d = shouldActivateSellerOnApproval(
      { isApproved: false, createdById: 'u1' },
      { isApproved: true, createdById: 'u1' },
      { isAdmin: false },
    );
    expect(d.activate).toBe(true);
  });

  it('fires on a rejected -> approved resubmission', () => {
    const d = shouldActivateSellerOnApproval(
      pending({ approvalStatus: 'rejected' }), approved(), { isAdmin: false });
    expect(d.activate).toBe(true);
  });
});

describe('shouldActivateSellerOnApproval — when it must NOT fire', () => {
  it('does not fire when the lot was already approved (any later edit)', () => {
    const d = shouldActivateSellerOnApproval(approved(), approved({ title: 'edited' }), { isAdmin: false });
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('not_an_approval_transition');
  });

  it('does not fire on rejection', () => {
    const d = shouldActivateSellerOnApproval(
      pending(), pending({ approvalStatus: 'rejected' }), { isAdmin: false });
    expect(d.activate).toBe(false);
  });

  it('does not fire while the lot is still pending review', () => {
    const d = shouldActivateSellerOnApproval(pending(), pending({ title: 'edited' }), { isAdmin: false });
    expect(d.activate).toBe(false);
  });

  it('skips Mazad-owned inventory — there is no user behind it', () => {
    // The admin drop builder stamps createdById with the ADMIN's own uid and
    // sets soldByMazad. Activating on that would hand Mazad's own lots to a
    // staff account and mint a public store page for them.
    const d = shouldActivateSellerOnApproval(
      pending({ soldByMazad: true }), approved({ soldByMazad: true }), { isAdmin: true });
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('sold_by_mazad');
  });

  it('skips a lot created by an admin even without soldByMazad', () => {
    const d = shouldActivateSellerOnApproval(pending(), approved(), { isAdmin: true });
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('creator_is_admin');
  });

  it('skips when the creator is already a seller — nothing to grant', () => {
    const d = shouldActivateSellerOnApproval(pending(), approved(), { isAdmin: false, isSeller: true });
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('already_seller');
  });

  it('skips a blocked creator — approval must not launder a ban into an account', () => {
    const d = shouldActivateSellerOnApproval(pending(), approved(), { isAdmin: false, isBlocked: true });
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('creator_blocked');
  });

  it('skips when the lot carries no creator', () => {
    const d = shouldActivateSellerOnApproval(
      { isApproved: false }, { isApproved: true }, { isAdmin: false });
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('no_creator');
  });

  it('skips when the creator has no user doc', () => {
    const d = shouldActivateSellerOnApproval(pending(), approved(), null);
    expect(d.activate).toBe(false);
    expect(d.reason).toBe('no_creator_doc');
  });
});
