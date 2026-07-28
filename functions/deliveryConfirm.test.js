// Wave 3 — the buyer's delivery-code attempt gate. A 5-character code from a
// 32-glyph alphabet is ~33.5M combinations, so guessing is not the practical
// threat — but an unbounded typed-code endpoint on a money-releasing action is,
// so attempts are counted, and the counter is committed on FAILURE (a thrown
// transaction would roll it back and make the limit unenforceable).
import { describe, it, expect } from 'vitest';
import { checkDeliveryConfirm, MAX_CODE_ATTEMPTS } from './deliveryConfirm.js';

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
  const writes = [];
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

const READY_ORDER = {
  buyerId: 'b1',
  sellerId: 's1',
  status: 'out_for_delivery',
  sentPhotoUrl: 'https://x/sent.jpg',
};

const args = (over = {}) => ({
  orderId: 'o1',
  buyerUid: 'b1',
  typedCode: 'DC-7K3QP',
  receivedPhotoUrl: 'https://x/got.jpg',
  ...over,
});

const ready = (over = {}) => makeFakeDb({
  'orders/o1': { ...READY_ORDER, ...over },
  'deliveryCodes/o1': { code: 'DC-7K3QP' },
});

describe('checkDeliveryConfirm — the happy path', () => {
  it('matches the stored code and writes nothing', async () => {
    const db = ready();
    const res = await checkDeliveryConfirm(deps(db), args());
    expect(res.matched).toBe(true);
    expect(db._writes).toHaveLength(0);
  });

  it('accepts the code however the buyer types it', async () => {
    for (const typed of ['dc-7k3qp', '  DC 7K3QP ', '7k3qp', 'dc7k3qp']) {
      const res = await checkDeliveryConfirm(deps(ready()), args({ typedCode: typed }));
      expect(res.matched).toBe(true);
    }
  });
});

describe('checkDeliveryConfirm — bounded guessing', () => {
  it('records a failed attempt instead of throwing, so the limit can bite', async () => {
    const db = ready();
    const res = await checkDeliveryConfirm(deps(db), args({ typedCode: 'DC-WRONG' }));
    expect(res.matched).toBe(false);
    expect(res.attempts).toBe(1);
    expect(res.remaining).toBe(MAX_CODE_ATTEMPTS - 1);
    const w = db._writes.find(x => x.path === 'orders/o1');
    expect(w.data.deliveryCodeAttempts).toBe(1);
  });

  it('counts up from an existing attempt tally', async () => {
    const db = ready({ deliveryCodeAttempts: 3 });
    const res = await checkDeliveryConfirm(deps(db), args({ typedCode: 'DC-WRONG' }));
    expect(res.attempts).toBe(4);
    expect(res.remaining).toBe(MAX_CODE_ATTEMPTS - 4);
  });

  it('locks out at MAX_CODE_ATTEMPTS and writes nothing further', async () => {
    const db = ready({ deliveryCodeAttempts: MAX_CODE_ATTEMPTS });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(db._writes).toHaveLength(0);
  });

  it('never touches money or status fields when counting a failure', async () => {
    const db = ready();
    await checkDeliveryConfirm(deps(db), args({ typedCode: 'DC-WRONG' }));
    const w = db._writes.find(x => x.path === 'orders/o1');
    expect(Object.keys(w.data).sort()).toEqual(['deliveryCodeAttempts', 'updatedAt']);
  });
});

describe('checkDeliveryConfirm — preconditions', () => {
  it('refuses a caller who is not the buyer', async () => {
    await expect(checkDeliveryConfirm(deps(ready()), args({ buyerUid: 's1' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses an order that is not out for delivery', async () => {
    for (const status of ['paid', 'preparing_shipment', 'shipped', 'delivered', 'completed']) {
      await expect(checkDeliveryConfirm(deps(ready({ status })), args()))
        .rejects.toMatchObject({ code: 'failed-precondition' });
    }
  });

  it('refuses when the seller dispatch photo is missing — half a chain is no chain', async () => {
    await expect(checkDeliveryConfirm(deps(ready({ sentPhotoUrl: '' })), args()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses when no code was ever issued', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses when the stored code is corrupt — it could never be matched', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER, 'deliveryCodes/o1': { code: 'garbage' } });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('requires an https receipt photo', async () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'http://x/got.jpg', undefined, null, 42]) {
      await expect(checkDeliveryConfirm(deps(ready()), args({ receivedPhotoUrl: bad })))
        .rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });

  it('refuses a missing orderId', async () => {
    await expect(checkDeliveryConfirm(deps(ready()), args({ orderId: undefined })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('refuses an order that does not exist', async () => {
    const db = makeFakeDb({});
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'not-found' });
  });
});
