// Wave 3 — delivery-code issuance. Idempotency is the whole point: the code
// gets handwritten on a physical parcel, so a second issue that returned a
// DIFFERENT code would invalidate a box already in transit and strand a genuine
// delivery in a permanent code mismatch.
import { describe, it, expect } from 'vitest';
import { issueDeliveryCode } from './deliveryIssue.js';

const NOW_MS = 1750000000000;

// ---- Minimal Firestore Admin SDK mock -------------------------------------
// Copied from functions/orderPaymentSubmit.test.js (test-local by design).

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

// ---------------------------------------------------------------------------

const ORDER = { sellerId: 's1', buyerId: 'b1', status: 'paid' };

describe('issueDeliveryCode', () => {
  it('creates deliveryCodes/{orderId} for the seller and returns the code', async () => {
    const db = makeFakeDb({ 'orders/o1': ORDER });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(res).toEqual({ code: 'DC-7K3QP', created: true });
    const write = db._writes.find(w => w.path === 'deliveryCodes/o1');
    expect(write.data.code).toBe('DC-7K3QP');
    expect(write.data.sellerId).toBe('s1');
    expect(write.data.buyerId).toBe('b1');
  });

  it('writes the code NOWHERE near the order doc — the buyer can read that one', async () => {
    const db = makeFakeDb({ 'orders/o1': ORDER });
    await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(db._writes.find(w => w.path === 'orders/o1')).toBeUndefined();
  });

  it('is idempotent — an existing valid code is returned, never rotated', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...ORDER, status: 'preparing_shipment' },
      'deliveryCodes/o1': { code: 'DC-ABCDE', sellerId: 's1' },
    });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-ZZZZZ' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(res).toEqual({ code: 'DC-ABCDE', created: false });
    expect(db._writes).toHaveLength(0);
  });

  it('replaces a corrupt stored code rather than handing back something unmatchable', async () => {
    const db = makeFakeDb({
      'orders/o1': ORDER,
      'deliveryCodes/o1': { code: 'garbage', sellerId: 's1' },
    });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(res).toEqual({ code: 'DC-7K3QP', created: true });
  });

  it('refuses a caller who is not the seller — including the buyer', async () => {
    const db = makeFakeDb({ 'orders/o1': ORDER });
    await expect(
      issueDeliveryCode(deps(db), { orderId: 'o1', actorUid: 'b1' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db._writes).toHaveLength(0);
  });

  it('lets an admin issue on the seller behalf', async () => {
    const db = makeFakeDb({ 'orders/o1': ORDER });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 'admin1', isAdmin: true }
    );
    expect(res.code).toBe('DC-7K3QP');
  });

  it('refuses an order that does not exist', async () => {
    const db = makeFakeDb({});
    await expect(
      issueDeliveryCode(deps(db), { orderId: 'nope', actorUid: 's1' })
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a missing orderId', async () => {
    const db = makeFakeDb({});
    await expect(
      issueDeliveryCode(deps(db), { actorUid: 's1' })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
