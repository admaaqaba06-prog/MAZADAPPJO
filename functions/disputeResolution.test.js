// Slice D Task 1 — pure dispute-resolution metadata stamp tests (mocked Admin SDK).
// This module only records an admin's note AFTER the real resolution has already
// succeeded via the untouched executeOrderTransition('resolve_dispute') path.
import { describe, it, expect } from 'vitest';
const { stampDisputeResolution, returnStatusFor } = require('./disputeResolution');

const NOW_MS = 1750000000000;

// ---- copy makeSnapshot/makeFakeDb/FakeTimestamp/deps/makeError from
// functions/fulfillmentNudge.test.js verbatim here (test-local by design) ----

function makeSnapshot(data) {
  return {
    exists: data !== undefined && data !== null,
    data: () => data,
  };
}

function makeFakeDb(fixtures) {
  // fixtures: { 'collection/docId': {...data} }
  const writes = []; // { path, data, options }
  const db = {
    _writes: writes,
    collection(name) {
      return {
        doc(id) {
          return { _path: `${name}/${id}` };
        },
      };
    },
    async runTransaction(fn) {
      const txn = {
        async get(ref) {
          // reads see the ORIGINAL fixtures (single txn, reads-before-writes)
          return makeSnapshot(fixtures[ref._path]);
        },
        set(ref, data, options) {
          writes.push({ path: ref._path, data, options });
        },
      };
      return fn(txn);
    },
  };
  return db;
}

const FakeTimestamp = {
  fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }),
};

function deps(db) {
  return { db, Timestamp: FakeTimestamp, now: () => NOW_MS };
}

describe('returnStatusFor', () => {
  it('maps refund → resolved_refunded', () => {
    expect(returnStatusFor('refund')).toBe('resolved_refunded');
  });
  it('maps release → resolved_denied', () => {
    expect(returnStatusFor('release')).toBe('resolved_denied');
  });
  it('maps resume (and anything else) → null', () => {
    expect(returnStatusFor('resume')).toBe(null);
    expect(returnStatusFor('bogus')).toBe(null);
    expect(returnStatusFor(undefined)).toBe(null);
  });
});

describe('stampDisputeResolution return-type stamping', () => {
  it('stamps returnClaim.status + returns notify info for a return refund', async () => {
    const db = makeFakeDb({ 'orders/r1': {
      status: 'disputed', disputeType: 'return',
      buyerId: 'buyer1', auctionId: 'auc1', auctionTitle: 'ساعة',
      returnClaim: { status: 'open' },
    } });
    const res = await stampDisputeResolution(deps(db), { orderId: 'r1', resolutionType: 'refund', adminUid: 'a', notes: 'Approved return.' });
    const write = db._writes.find((w) => w.path === 'orders/r1');
    expect(write.data['returnClaim.status']).toBe('resolved_refunded');
    expect(res).toMatchObject({ isReturn: true, outcome: 'refunded', buyerId: 'buyer1', auctionId: 'auc1', auctionTitle: 'ساعة' });
  });
  it('stamps resolved_denied + outcome denied for a return release', async () => {
    const db = makeFakeDb({ 'orders/r2': {
      status: 'disputed', disputeType: 'return',
      buyerId: 'buyer2', auctionId: 'auc2', auctionTitle: 'خاتم',
      returnClaim: { status: 'open' },
    } });
    const res = await stampDisputeResolution(deps(db), { orderId: 'r2', resolutionType: 'release', adminUid: 'a', notes: 'Denied.' });
    expect(db._writes[0].data['returnClaim.status']).toBe('resolved_denied');
    expect(res).toMatchObject({ isReturn: true, outcome: 'denied', buyerId: 'buyer2' });
  });
  it('does NOT stamp returnClaim.status for a return resume (null mapping)', async () => {
    const db = makeFakeDb({ 'orders/r3': {
      status: 'disputed', disputeType: 'return', buyerId: 'b', returnClaim: { status: 'open' },
    } });
    const res = await stampDisputeResolution(deps(db), { orderId: 'r3', resolutionType: 'resume', adminUid: 'a', notes: 'Proceed.' });
    expect(db._writes[0].data['returnClaim.status']).toBeUndefined();
    expect(res.isReturn).toBe(false);
  });
  it('does NOT stamp returnClaim.status for a non-return dispute', async () => {
    const db = makeFakeDb({ 'orders/n1': { status: 'disputed', buyerId: 'b' } });
    const res = await stampDisputeResolution(deps(db), { orderId: 'n1', resolutionType: 'refund', adminUid: 'a', notes: 'x' });
    expect(db._writes[0].data['returnClaim.status']).toBeUndefined();
    expect(res.isReturn).toBe(false);
  });
});

describe('stampDisputeResolution', () => {
  it('stamps all four fields on a successful release resolution', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'completed' } });
    const res = await stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'release', adminUid: 'admin1', notes: '  Seller shipped correct item, buyer confirmed in chat.  ' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.resolutionNotes).toBe('Seller shipped correct item, buyer confirmed in chat.');
    expect(write.data.disputeResolvedBy).toBe('admin1');
    expect(write.data.disputeResolvedAt._ms).toBe(NOW_MS);
    expect(write.data.disputeResolutionType).toBe('release');
    expect(res).toMatchObject({ orderId: 'o1', resolutionType: 'release', notes: 'Seller shipped correct item, buyer confirmed in chat.', isReturn: false });
  });
  it('accepts refund and resume as valid resolutionTypes', async () => {
    const db1 = makeFakeDb({ 'orders/o2': { status: 'refunded' } });
    await stampDisputeResolution(deps(db1), { orderId: 'o2', resolutionType: 'refund', adminUid: 'a', notes: 'Item not as described.' });
    expect(db1._writes[0].data.disputeResolutionType).toBe('refund');

    const db2 = makeFakeDb({ 'orders/o3': { status: 'paid' } });
    await stampDisputeResolution(deps(db2), { orderId: 'o3', resolutionType: 'resume', adminUid: 'a', notes: 'Misunderstanding resolved, order proceeds.' });
    expect(db2._writes[0].data.disputeResolutionType).toBe('resume');
  });
  it('rejects an invalid resolutionType (invalid-argument, zero writes)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'completed' } });
    await expect(stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'bogus', adminUid: 'a', notes: 'x' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });
  it('rejects missing or whitespace-only notes (invalid-argument, zero writes)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'completed' } });
    await expect(stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'release', adminUid: 'a', notes: '   ' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(stampDisputeResolution(deps(db), { orderId: 'o1', resolutionType: 'release', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });
  it('throws not-found for a missing order', async () => {
    const db = makeFakeDb({});
    await expect(stampDisputeResolution(deps(db), { orderId: 'missing', resolutionType: 'release', adminUid: 'a', notes: 'x' }))
      .rejects.toMatchObject({ code: 'not-found' });
  });
  it('rejects a missing orderId (invalid-argument)', async () => {
    const db = makeFakeDb({});
    await expect(stampDisputeResolution(deps(db), { resolutionType: 'release', adminUid: 'a', notes: 'x' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
