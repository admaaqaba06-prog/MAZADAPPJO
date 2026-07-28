// Wave 1 — buyer payment-submit core logic tests (mocked Admin SDK).
// submitOrderPayment reserves a unique CliQ transaction reference inside the
// same transaction that stamps the order's payment proof, so two buyers cannot
// claim the same transfer. Firestore mock mirrors orderPaymentVerify.test.js.
import { describe, it, expect } from 'vitest';
import { submitOrderPayment } from './orderPaymentSubmit.js';

const NOW_MS = 1750000000000;

// ---- Minimal Firestore Admin SDK mock -------------------------------------
// Copied from functions/orderPaymentVerify.test.js (test-local by design).

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

function goodArgs(overrides = {}) {
  return {
    orderId: 'o1',
    buyerUid: 'b1',
    proofUrl: 'https://proofs.example/r.png',
    cliqSenderPhone: '0790000000',
    txnRef: 'CLIQ12345',
    deliveryAddress: { governorate: 'Amman', area: 'Abdoun' },
    deliveryPhone: '0791111111',
    ...overrides,
  };
}

const WAITING = { status: 'waiting_payment', paymentStatus: 'unpaid', buyerId: 'b1' };

describe('submitOrderPayment', () => {
  it('(a) fresh submit reserves the ref and stamps proof fields, attempts === 1', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING } });

    const result = await submitOrderPayment(deps(db), goodArgs());

    expect(result).toEqual({ orderId: 'o1', attempts: 1 });
    expect(db._writes).toHaveLength(2);

    // 1) reference reservation
    const refW = db._writes.find((w) => w.path === 'paymentReferences/CLIQ12345');
    expect(refW).toBeTruthy();
    expect(refW.options).toEqual({ merge: true });
    expect(refW.data.orderId).toBe('o1');
    expect(refW.data.buyerId).toBe('b1');
    expect(refW.data.createdAt._ms).toBe(NOW_MS);

    // 2) order write
    const orderW = db._writes.find((w) => w.path === 'orders/o1');
    expect(orderW).toBeTruthy();
    expect(orderW.options).toEqual({ merge: true });
    expect(orderW.data.paymentProofUrl).toBe('https://proofs.example/r.png');
    expect(orderW.data.cliqSenderPhone).toBe('0790000000');
    expect(orderW.data.txnRef).toBe('CLIQ12345');
    expect(orderW.data.txnRefNormalized).toBe('CLIQ12345');
    expect(orderW.data.paymentAttempts).toBe(1);
    expect(orderW.data.deliveryAddress).toEqual({ governorate: 'Amman', area: 'Abdoun' });
    expect(orderW.data.deliveryPhone).toBe('0791111111');
    expect(orderW.data.paymentSubmittedAt._ms).toBe(NOW_MS);
    expect(orderW.data.updatedAt._ms).toBe(NOW_MS);
    // Replicated status semantics from the current submit path (orderWorkflow 'pay').
    expect(orderW.data.status).toBe('paid');
    expect(orderW.data.paymentStatus).toBe('paid');
  });

  it('normalizes a lowercase/spaced ref before reserving it', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING } });

    await submitOrderPayment(deps(db), goodArgs({ txnRef: '  cliq 12345 ' }));

    expect(db._writes.some((w) => w.path === 'paymentReferences/CLIQ12345')).toBe(true);
    const orderW = db._writes.find((w) => w.path === 'orders/o1');
    expect(orderW.data.txnRefNormalized).toBe('CLIQ12345');
    // Raw ref preserved as entered.
    expect(orderW.data.txnRef).toBe('  cliq 12345 ');
  });

  it('(b) ref already reserved by a DIFFERENT order throws already-exists, no order write', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...WAITING },
      'paymentReferences/CLIQ12345': { orderId: 'otherOrder', buyerId: 'someoneElse' },
    });

    await expect(submitOrderPayment(deps(db), goodArgs()))
      .rejects.toMatchObject({ code: 'already-exists' });
    // Neither the ref nor the order may be written.
    expect(db._writes).toHaveLength(0);
  });

  it('(c) ref reserved by the SAME order (resubmit) is allowed; attempts increments 1 -> 2', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...WAITING, paymentAttempts: 1 },
      'paymentReferences/CLIQ12345': { orderId: 'o1', buyerId: 'b1' },
    });

    const result = await submitOrderPayment(deps(db), goodArgs());

    expect(result).toEqual({ orderId: 'o1', attempts: 2 });
    const orderW = db._writes.find((w) => w.path === 'orders/o1');
    expect(orderW.data.paymentAttempts).toBe(2);
  });

  it('(d) paymentAttempts >= 3 throws resource-exhausted, no writes', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING, paymentAttempts: 3 } });

    await expect(submitOrderPayment(deps(db), goodArgs()))
      .rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(db._writes).toHaveLength(0);
  });

  it('(e) invalid ref (len 2) throws invalid-argument', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING } });

    await expect(submitOrderPayment(deps(db), goodArgs({ txnRef: 'ab' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });

  it('(f) buyerId mismatch throws permission-denied', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING, buyerId: 'someoneElse' } });

    await expect(submitOrderPayment(deps(db), goodArgs()))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(db._writes).toHaveLength(0);
  });

  it('(g) missing proofUrl throws invalid-argument', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING } });

    await expect(submitOrderPayment(deps(db), goodArgs({ proofUrl: '' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });

  it('missing cliqSenderPhone throws invalid-argument', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING } });

    await expect(submitOrderPayment(deps(db), goodArgs({ cliqSenderPhone: '   ' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db._writes).toHaveLength(0);
  });

  it('(h) missing order throws not-found', async () => {
    const db = makeFakeDb({});

    await expect(submitOrderPayment(deps(db), goodArgs()))
      .rejects.toMatchObject({ code: 'not-found' });
    expect(db._writes).toHaveLength(0);
  });

  it('non-submittable order status throws failed-precondition', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentStatus: 'paid', buyerId: 'b1' } });

    await expect(submitOrderPayment(deps(db), goodArgs()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('falls back to existing order delivery fields when not supplied', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...WAITING, deliveryAddress: { governorate: 'Irbid' }, deliveryPhone: '0799999999' },
    });

    await submitOrderPayment(deps(db), goodArgs({ deliveryAddress: undefined, deliveryPhone: undefined }));

    const orderW = db._writes.find((w) => w.path === 'orders/o1');
    expect(orderW.data.deliveryAddress).toEqual({ governorate: 'Irbid' });
    expect(orderW.data.deliveryPhone).toBe('0799999999');
  });
});
