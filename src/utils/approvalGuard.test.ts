import { describe, it, expect } from 'vitest';
import { blockedApprovalReason, approvalClockFields } from './approvalGuard';

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

describe('approvalClockFields', () => {
  const END_MS = 1785000000000;
  const STAMP = { __ts: END_MS };

  it('writes both clock keys for a scheduled lot', () => {
    expect(approvalClockFields({ startMode: 'scheduled' }, END_MS, STAMP))
      .toEqual({ endTime: END_MS, endsAt: STAMP });
  });

  it('writes both clock keys when the lot has no startMode at all', () => {
    // Every seller-wizard / concierge submission is in this shape — no startMode
    // field is written on those paths — so this is the ordinary approval and it
    // must keep behaving exactly as it did before first_bid existed.
    expect(approvalClockFields({}, END_MS, STAMP))
      .toEqual({ endTime: END_MS, endsAt: STAMP });
    expect(approvalClockFields(null, END_MS, STAMP))
      .toEqual({ endTime: END_MS, endsAt: STAMP });
    expect(approvalClockFields(undefined, END_MS, STAMP))
      .toEqual({ endTime: END_MS, endsAt: STAMP });
  });

  it('writes NEITHER clock key for a first_bid lot', () => {
    expect(approvalClockFields({ startMode: 'first_bid' }, END_MS, STAMP)).toEqual({});
  });

  it('omits the keys rather than writing undefined or null', () => {
    // The distinction the spread depends on: Firestore rejects an `undefined`
    // value outright, and a written `null` is a value the two server go-live
    // paths never produce. Only absence leaves the doc's own fields alone.
    const out = approvalClockFields({ startMode: 'first_bid' }, END_MS, STAMP);
    expect(Object.keys(out)).toEqual([]);
    expect('endTime' in out).toBe(false);
    expect('endsAt' in out).toBe(false);
  });

  it('spreads into a payload without contributing the clock on a first_bid lot', () => {
    // The shape the call site actually builds.
    const payload = {
      status: 'live',
      ...approvalClockFields({ startMode: 'first_bid' }, END_MS, STAMP),
    };
    expect(payload).toEqual({ status: 'live' });
  });

  it('only exempts the exact literal the server paths test for', () => {
    // functions/index.js compares `startMode !== 'first_bid'` — no casing or
    // spelling variants — so anything else is a scheduled lot and gets a clock.
    for (const mode of ['first bid', 'firstBid', 'FIRST_BID', 'first_bid ']) {
      expect(approvalClockFields({ startMode: mode }, END_MS, STAMP))
        .toEqual({ endTime: END_MS, endsAt: STAMP });
    }
  });
});
