// Slice B Task 2 — order-payment verify/reject core logic tests (mocked Admin SDK).
// The verifyOrderPayment/rejectOrderPayment callables in index.js are thin
// admin-gated wrappers around these functions; the state machine and
// idempotency live here (same split as subscriptionApproval.js).
import { describe, it, expect } from 'vitest';
import { verifyOrderPayment, rejectOrderPayment } from './orderPaymentVerify.js';

const NOW_MS = 1750000000000;

// ---- Minimal Firestore Admin SDK mock -------------------------------------
// Copied from functions/subscriptionApproval.test.js (test-local by design).

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

// ---- verifyOrderPayment ----------------------------------------------------

describe('verifyOrderPayment', () => {
  it('stamps paymentVerified/By/At on a self-claimed paid order with proof', async () => {
    const db = makeFakeDb({
      'orders/o1': {
        status: 'paid', paymentStatus: 'paid',
        paymentProofUrl: 'https://x', buyerId: 'b1', buyerName: 'B',
      },
    });

    const result = await verifyOrderPayment(deps(db), { orderId: 'o1', adminUid: 'admin1' });

    expect(result).toEqual({ orderId: 'o1', buyerId: 'b1', buyerName: 'B', alreadyVerified: false });

    expect(db._writes).toHaveLength(1);
    const w = db._writes[0];
    expect(w.path).toBe('orders/o1');
    expect(w.options).toEqual({ merge: true });
    expect(w.data.paymentVerified).toBe(true);
    expect(w.data.paymentVerifiedBy).toBe('admin1');
    expect(w.data.paymentVerifiedAt._ms).toBe(NOW_MS);
    // Already-paid order: NO status fields in the write.
    expect(w.data).not.toHaveProperty('status');
    expect(w.data).not.toHaveProperty('paymentStatus');
  });

  it('normalizes a waiting_payment straggler with proof to paid while stamping', async () => {
    const db = makeFakeDb({
      'orders/o2': {
        status: 'waiting_payment', paymentStatus: 'pending_verification',
        receiptUrl: 'https://receipt.example/r.jpg', buyerId: 'b2', buyerName: 'Buyer Two',
      },
    });

    const result = await verifyOrderPayment(deps(db), { orderId: 'o2', adminUid: 'admin1' });

    expect(result.alreadyVerified).toBe(false);
    expect(db._writes).toHaveLength(1);
    const w = db._writes[0];
    expect(w.path).toBe('orders/o2');
    expect(w.options).toEqual({ merge: true });
    // Normalization happens in the SAME write as the verification stamp.
    expect(w.data.status).toBe('paid');
    expect(w.data.paymentStatus).toBe('paid');
    expect(w.data.paymentVerified).toBe(true);
    expect(w.data.paymentVerifiedBy).toBe('admin1');
    expect(w.data.paymentVerifiedAt._ms).toBe(NOW_MS);
  });

  it('is idempotent: already-verified returns alreadyVerified:true with zero writes', async () => {
    const db = makeFakeDb({
      'orders/o3': {
        status: 'paid', paymentStatus: 'paid', paymentVerified: true,
        paymentProofUrl: 'https://x', buyerId: 'b3', buyerName: 'B3',
      },
    });

    const result = await verifyOrderPayment(deps(db), { orderId: 'o3', adminUid: 'admin1' });

    expect(result).toEqual({ orderId: 'o3', buyerId: 'b3', buyerName: 'B3', alreadyVerified: true });
    expect(db._writes).toHaveLength(0);
  });

  it('throws failed-precondition when the order has no receipt on any legacy field', async () => {
    const db = makeFakeDb({
      'orders/o4': { status: 'paid', paymentStatus: 'paid', buyerId: 'b4', buyerName: 'B4' },
    });

    await expect(verifyOrderPayment(deps(db), { orderId: 'o4', adminUid: 'admin1' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('throws not-found for a missing order', async () => {
    const db = makeFakeDb({});

    await expect(verifyOrderPayment(deps(db), { orderId: 'ghost', adminUid: 'admin1' }))
      .rejects.toMatchObject({ code: 'not-found' });
    expect(db._writes).toHaveLength(0);
  });
});

// ---- rejectOrderPayment ----------------------------------------------------

describe('rejectOrderPayment', () => {
  it('resets to waiting_payment/unpaid and stamps reason + rejectedBy/At', async () => {
    const db = makeFakeDb({
      'orders/o5': {
        status: 'paid', paymentStatus: 'paid',
        paymentProofUrl: 'https://blurry', buyerId: 'b5', buyerName: 'B5',
      },
    });

    const result = await rejectOrderPayment(deps(db), {
      orderId: 'o5', adminUid: 'admin1', reason: 'Receipt is unreadable',
    });

    expect(result).toEqual({
      orderId: 'o5', buyerId: 'b5', buyerName: 'B5', reason: 'Receipt is unreadable',
    });

    expect(db._writes).toHaveLength(1);
    const w = db._writes[0];
    expect(w.path).toBe('orders/o5');
    expect(w.options).toEqual({ merge: true });
    expect(w.data.paymentStatus).toBe('unpaid');
    expect(w.data.status).toBe('waiting_payment');
    expect(w.data.paymentRejectionReason).toBe('Receipt is unreadable');
    expect(w.data.paymentRejectedBy).toBe('admin1');
    expect(w.data.paymentRejectedAt._ms).toBe(NOW_MS);
  });

  it('requires a non-empty reason (invalid-argument, whitespace-only rejected)', async () => {
    const db = makeFakeDb({
      'orders/o6': { status: 'paid', paymentStatus: 'paid', buyerId: 'b6' },
    });

    await expect(rejectOrderPayment(deps(db), { orderId: 'o6', adminUid: 'admin1' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(rejectOrderPayment(deps(db), { orderId: 'o6', adminUid: 'admin1', reason: '' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(rejectOrderPayment(deps(db), { orderId: 'o6', adminUid: 'admin1', reason: '   ' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });

  it('refuses to reject an already-verified order (failed-precondition)', async () => {
    const db = makeFakeDb({
      'orders/o7': {
        status: 'paid', paymentStatus: 'paid', paymentVerified: true,
        paymentProofUrl: 'https://x', buyerId: 'b7', buyerName: 'B7',
      },
    });

    await expect(rejectOrderPayment(deps(db), {
      orderId: 'o7', adminUid: 'admin1', reason: 'changed my mind',
    })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('throws not-found for a missing order', async () => {
    const db = makeFakeDb({});

    await expect(rejectOrderPayment(deps(db), {
      orderId: 'ghost', adminUid: 'admin1', reason: 'no such order',
    })).rejects.toMatchObject({ code: 'not-found' });
    expect(db._writes).toHaveLength(0);
  });
});
