import { describe, it, expect } from 'vitest';
import { blockedApprovalReason } from './approvalGuard';

describe('blockedApprovalReason', () => {
  it('allows a normal pending listing through', () => {
    expect(blockedApprovalReason({ status: 'processing' })).toBeNull();
    expect(blockedApprovalReason({ status: 'pending' })).toBeNull();
    expect(blockedApprovalReason({ status: 'rejected' })).toBeNull();
    expect(blockedApprovalReason({ status: 'upcoming' })).toBeNull();
  });

  it('blocks every end state', () => {
    expect(blockedApprovalReason({ status: 'completed' })).toBe('already_settled');
    expect(blockedApprovalReason({ status: 'ended' })).toBe('already_settled');
    expect(blockedApprovalReason({ status: 'reserve_not_met' })).toBe('already_settled');
  });

  it('blocks on settledAt even when the status says live — the real production shape', () => {
    // A lot that was already wrongly re-approved has status:'live' again, and
    // ONLY settledAt still records that it ever settled. Without this check the
    // same lot could be re-opened over and over.
    expect(blockedApprovalReason({ status: 'live', settledAt: { seconds: 1785000000 } }))
      .toBe('already_settled');
    expect(blockedApprovalReason({ status: 'live', settledAt: 1785000000000 }))
      .toBe('already_settled');
  });

  it('does not block a live lot that never settled', () => {
    // Approving a live auction is pointless but harmless — it is not the bug
    // this guard exists for, and blocking it would be a behaviour change.
    expect(blockedApprovalReason({ status: 'live' })).toBeNull();
    expect(blockedApprovalReason({ status: 'live', settledAt: null })).toBeNull();
    expect(blockedApprovalReason({ status: 'live', settledAt: undefined })).toBeNull();
  });

  it('returns null for an unknown auction so the caller can do its own lookup', () => {
    expect(blockedApprovalReason(null)).toBeNull();
    expect(blockedApprovalReason(undefined)).toBeNull();
  });

  it('ignores a non-string status rather than throwing', () => {
    expect(blockedApprovalReason({ status: null })).toBeNull();
    expect(blockedApprovalReason({} as any)).toBeNull();
  });
});
