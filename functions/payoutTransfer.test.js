// Payout transfer-reference capture.
//
// The audit's remaining B5 item: approving a payout recorded WHO approved it and
// WHEN, but nothing about the transfer actually going out. A seller asking "you
// approved it three days ago, where is my money?" had no answer in the system.
//
// Money coming IN is already gated on the admin confirming it landed (the
// bankVerified checkbox in PaymentVerifyCard, Wave 1). This is the same
// discipline for money going OUT.
import { describe, it, expect } from 'vitest';
import { buildPayoutTransferStamp } from './payoutTransfer.js';

const NOW_MS = 1750000000000;
const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };
const deps = { Timestamp: FakeTimestamp, now: () => NOW_MS };

describe('buildPayoutTransferStamp', () => {
  it('records the normalized reference and marks the transfer sent', () => {
    const stamp = buildPayoutTransferStamp(deps, { transferRef: ' cliq-8891 ', adminUid: 'a1' });
    expect(stamp.transferRef).toBe('CLIQ-8891');
    expect(stamp.sentViaCliq).toBe(true);
    expect(stamp.transferRecordedBy).toBe('a1');
    expect(stamp.transferRecordedAt.toMillis()).toBe(NOW_MS);
  });

  it('keeps the admin-typed reference verbatim as well as normalized', () => {
    // The normalized form is for matching; the raw form is what the admin can
    // compare against their banking app without wondering what we changed.
    const stamp = buildPayoutTransferStamp(deps, { transferRef: 'cliq 8891', adminUid: 'a1' });
    expect(stamp.transferRefRaw).toBe('cliq 8891');
    expect(stamp.transferRef).toBe('CLIQ8891');
  });

  it('rejects a missing or too-short reference — an unrecorded payout is the bug', () => {
    for (const bad of ['', '   ', 'ab', undefined, null, 42]) {
      expect(() => buildPayoutTransferStamp(deps, { transferRef: bad, adminUid: 'a1' }))
        .toThrowError(/reference/i);
    }
  });

  it('throws with an invalid-argument code the callable can map', () => {
    try {
      buildPayoutTransferStamp(deps, { transferRef: '', adminUid: 'a1' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('invalid-argument');
    }
  });
});
