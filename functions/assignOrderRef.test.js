// Wave 2 — decoupled MZ order-reference assignment tests (mocked Admin SDK).
// assignOrderRef reserves a globally-unique human-readable ref on
// orderRefs/{code} and stamps it on the order, in a transaction SEPARATE from
// settlement so it can never fail the money path. Firestore mock mirrors
// functions/orderPaymentSubmit.test.js / orderPaymentVerify.test.js.
import { describe, it, expect } from 'vitest';
import { assignOrderRef } from './assignOrderRef.js';
import { isValidOrderRef } from './orderRef.js';

const NOW_MS = 1750000000000;

// ---- Minimal Firestore Admin SDK mock -------------------------------------
// Copied from functions/orderPaymentSubmit.test.js (test-local by design), but
// reads must reflect PRIOR in-run writes so the collision-retry test can see a
// freshly reserved ref on the next transaction.

function makeSnapshot(data) {
  return {
    exists: data !== undefined && data !== null,
    data: () => data,
  };
}

function makeFakeDb(fixtures) {
  // fixtures: { 'collection/docId': {...data} } — mutated by writes so a later
  // transaction's get() sees an earlier reservation (collision simulation).
  const store = { ...fixtures };
  const writes = []; // { path, data, options }
  const db = {
    _store: store,
    _writes: writes,
    collection(name) {
      return {
        doc(id) {
          const path = `${name}/${id}`;
          // Real DocumentReference supports a non-transactional .get() — used by
          // assignOrderRef's idempotency check before any transaction.
          return {
            _path: path,
            async get() {
              return makeSnapshot(store[path]);
            },
          };
        },
      };
    },
    async runTransaction(fn) {
      const txn = {
        async get(ref) {
          return makeSnapshot(store[ref._path]);
        },
        set(ref, data, options) {
          writes.push({ path: ref._path, data, options });
          store[ref._path] = { ...(store[ref._path] || {}), ...data };
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

function deps(db, generate) {
  const d = { db, Timestamp: FakeTimestamp, now: () => NOW_MS };
  if (generate) d.generate = generate;
  return d;
}

describe('assignOrderRef', () => {
  it('(a) fresh order → reserves a valid ref on orderRefs/{code} + stamps the order, returns code', async () => {
    const db = makeFakeDb({ 'orders/o1': { buyerId: 'b1', status: 'waiting_payment' } });

    const code = await assignOrderRef(deps(db), 'o1');

    expect(isValidOrderRef(code)).toBe(true);
    expect(db._writes).toHaveLength(2);

    // 1) reference reservation
    const refW = db._writes.find((w) => w.path === `orderRefs/${code}`);
    expect(refW).toBeTruthy();
    expect(refW.data.orderId).toBe('o1');
    expect(refW.data.createdAt._ms).toBe(NOW_MS);

    // 2) order stamp
    const orderW = db._writes.find((w) => w.path === 'orders/o1');
    expect(orderW).toBeTruthy();
    expect(orderW.options).toEqual({ merge: true });
    expect(orderW.data.orderRef).toBe(code);
    expect(orderW.data.updatedAt._ms).toBe(NOW_MS);
  });

  it('(b) first code collides, second is free → retries, succeeds on 2nd, reserves the 2nd', async () => {
    // COLLIDER is already reserved; FREE is not. generate() returns COLLIDER
    // first, then FREE.
    const COLLIDER = 'MZ-ABCDE';
    const FREE = 'MZ-FGHJK';
    const db = makeFakeDb({
      'orders/o1': { buyerId: 'b1' },
      [`orderRefs/${COLLIDER}`]: { orderId: 'someoneElse' },
    });

    let call = 0;
    const generate = () => (call++ === 0 ? COLLIDER : FREE);

    const code = await assignOrderRef(deps(db, generate), 'o1');

    expect(code).toBe(FREE);
    expect(call).toBe(2); // exactly two codes drawn
    // Only the FREE ref was written (COLLIDER left untouched).
    expect(db._writes.some((w) => w.path === `orderRefs/${FREE}`)).toBe(true);
    expect(db._writes.some((w) => w.path === `orderRefs/${COLLIDER}`)).toBe(false);
    const orderW = db._writes.find((w) => w.path === 'orders/o1');
    expect(orderW.data.orderRef).toBe(FREE);
  });

  it('(c) order already has a valid orderRef → returns it, no new reservation write', async () => {
    const db = makeFakeDb({ 'orders/o1': { buyerId: 'b1', orderRef: 'MZ-7K3QP' } });

    const code = await assignOrderRef(deps(db), 'o1');

    expect(code).toBe('MZ-7K3QP');
    expect(db._writes).toHaveLength(0);
  });

  it('(d) all tries collide → throws', async () => {
    const COLLIDER = 'MZ-ABCDE';
    const db = makeFakeDb({
      'orders/o1': { buyerId: 'b1' },
      [`orderRefs/${COLLIDER}`]: { orderId: 'someoneElse' },
    });
    const generate = () => COLLIDER; // always collides

    await expect(assignOrderRef(deps(db, generate), 'o1')).rejects.toThrow();
    // Nothing was reserved or stamped.
    expect(db._writes).toHaveLength(0);
  });

  it('an invalid existing orderRef is ignored → a fresh valid ref is allocated', async () => {
    const db = makeFakeDb({ 'orders/o1': { buyerId: 'b1', orderRef: 'garbage' } });

    const code = await assignOrderRef(deps(db), 'o1');

    expect(isValidOrderRef(code)).toBe(true);
    expect(db._writes.some((w) => w.path === `orderRefs/${code}`)).toBe(true);
  });
});
