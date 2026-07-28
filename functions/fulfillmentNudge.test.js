// Slice C Task 2 — pure fulfillment-nudge core tests (mocked Admin SDK).
// The sendFulfillmentNudge callable in index.js is a thin admin-gated wrapper
// around this function; bucket re-derivation + idempotent stamping live here
// (same split as orderPaymentVerify.js).
import { describe, it, expect } from 'vitest';
import { bucketOrder as clientBucketOrder } from '../src/utils/fulfillmentQueues';
const { sendFulfillmentNudge, bucketOrder: serverBucketOrder } = require('./fulfillmentNudge');

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

describe('sendFulfillmentNudge', () => {
  it('ship nudge on an awaiting_shipment order stamps lastNudgedAt/nudgeCount and targets the seller', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentVerified: true, sellerId: 's1', sellerName: 'Seller One' } });
    const res = await sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'ship', adminUid: 'admin1' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.lastNudgedAt._ms).toBe(NOW_MS);
    expect(write.data.nudgeCount).toBe(1);
    expect(res).toEqual({ orderId: 'o1', kind: 'ship', targetUserId: 's1', targetUserName: 'Seller One' });
  });

  it('ship nudge on a preparing_shipment order succeeds (seller acknowledged but not yet shipped)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'preparing_shipment', sellerId: 's1', sellerName: 'Seller One' } });
    const res = await sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'ship', adminUid: 'admin1' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.lastNudgedAt._ms).toBe(NOW_MS);
    expect(write.data.nudgeCount).toBe(1);
    expect(res).toEqual({ orderId: 'o1', kind: 'ship', targetUserId: 's1', targetUserName: 'Seller One' });
  });

  it('increments nudgeCount on a repeat nudge (no rate limit)', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentVerified: true, sellerId: 's1', sellerName: 'Seller One', nudgeCount: 2 } });
    await sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'ship', adminUid: 'admin1' });
    const write = db._writes.find((w) => w.path === 'orders/o1');
    expect(write.data.nudgeCount).toBe(3);
  });

  it('confirm_delivery nudge on an awaiting_delivery order targets the buyer', async () => {
    const db = makeFakeDb({ 'orders/o2': { status: 'shipped', buyerId: 'b1', buyerName: 'Buyer One' } });
    const res = await sendFulfillmentNudge(deps(db), { orderId: 'o2', kind: 'confirm_delivery', adminUid: 'admin1' });
    expect(res).toEqual({ orderId: 'o2', kind: 'confirm_delivery', targetUserId: 'b1', targetUserName: 'Buyer One' });
  });

  it('rejects a ship nudge on an order that is not awaiting_shipment (failed-precondition)', async () => {
    const db = makeFakeDb({ 'orders/o3': { status: 'shipped', sellerId: 's1', sellerName: 'S' } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o3', kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('rejects a confirm_delivery nudge on a disputed order even if it was shipped', async () => {
    const db = makeFakeDb({ 'orders/o4': { status: 'disputed', buyerId: 'b1', buyerName: 'B' } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o4', kind: 'confirm_delivery', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('throws not-found for a missing order', async () => {
    const db = makeFakeDb({});
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'missing', kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a ship nudge on an unpaid (waiting_payment) order — no kind maps to awaiting_payment', async () => {
    const db = makeFakeDb({ 'orders/o5': { status: 'waiting_payment', buyerId: 'b1', sellerId: 's1' } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o5', kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o5', kind: 'confirm_delivery', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('throws invalid-argument for a bad kind or missing orderId', async () => {
    const db = makeFakeDb({ 'orders/o1': { status: 'paid', paymentVerified: true } });
    await expect(sendFulfillmentNudge(deps(db), { orderId: 'o1', kind: 'bogus', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(sendFulfillmentNudge(deps(db), { kind: 'ship', adminUid: 'a' }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

// ---- The "kept in sync by mirrored tests" claim, actually enforced ----------
// fulfillmentNudge.js re-implements bucketOrder because a CommonJS function
// module cannot import from src/. Its header says the two copies are kept in
// sync by mirrored tests; until this block existed, nothing checked, and the
// server copy had already missed the client's waiting_payment case. Add a case
// to src/utils/fulfillmentQueues.ts and this table fails until the server copy
// learns it too.
describe('bucketOrder — server copy mirrors src/utils/fulfillmentQueues.ts', () => {
  const CASES = [
    { status: 'waiting_payment' },
    { status: 'paid' },                              // unverified: not yet a shipment problem
    { status: 'paid', paymentVerified: true },
    { status: 'paid', paymentVerified: false },
    { status: 'preparing_shipment' },
    { status: 'shipped' },
    { status: 'delivered' },
    { status: 'completed' },
    { status: 'cancelled' },
    { status: 'refunded' },
    { status: 'disputed' },
    { status: 'disputed', paymentVerified: true },   // disputed wins over everything
    { status: 'nonsense_status' },
  ];

  it.each(CASES)('agrees on %o', (order) => {
    expect(serverBucketOrder(order)).toBe(clientBucketOrder(order));
  });
});

describe('Wave 3 — out_for_delivery bucket parity with the client', () => {
  it('buckets as awaiting_delivery on both sides', () => {
    const order = { status: 'out_for_delivery' };
    expect(serverBucketOrder(order)).toBe('awaiting_delivery');
    expect(serverBucketOrder(order)).toBe(clientBucketOrder(order));
  });
});
