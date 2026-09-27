// Embedded CliQ server core — the 90-minute lock, the amount check, and who is
// allowed to mark a payment paid.
//
// These are the three things BAE evaluates and the three things a browser must
// never be trusted with, so each is tested from the server's side with the
// client's cooperation withdrawn: a refresh, a second tab, a patched total.
//
// Firestore mock mirrors orderPaymentSubmit.test.js (test-local by design).

import { describe, it, expect } from 'vitest';
import {
  createCliqRequest,
  applyCliqWebhook,
  resolveCliqAmount,
  CLIQ_REQUEST_TTL_MS,
} from './cliqPayment.js';

const NOW_MS = 1750000000000;

function makeSnapshot(data) {
  return { exists: data !== undefined && data !== null, data: () => data };
}

function makeFakeDb(fixtures) {
  const writes = [];
  return {
    _writes: writes,
    collection(name) {
      return { doc: (id) => ({ _path: `${name}/${id}` }) };
    },
    async runTransaction(fn) {
      return fn({
        async get(ref) {
          return makeSnapshot(fixtures[ref._path]);
        },
        set(ref, data, options) {
          writes.push({ path: ref._path, data, options });
        },
      });
    },
  };
}

const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };

function deps(db, now = () => NOW_MS) {
  return { db, Timestamp: FakeTimestamp, now };
}

// A settled, unpaid order: 12.00 hammer + 0.600 premium = 12.600 total.
const WAITING = {
  status: 'waiting_payment',
  buyerId: 'b1',
  winningBidAmount: 12,
  buyersPremium: 0.6,
  totalDue: 12.6,
};

function args(overrides = {}) {
  return {
    orderId: 'o1',
    buyerUid: 'b1',
    identifierType: 'mobile',
    identifier: '0790000000',
    expectedTotal: 12.6,
    ...overrides,
  };
}

const orderWrite = (db) => db._writes.filter((w) => w.path.startsWith('orders/')).pop().data;
const lastWrite = orderWrite;

describe('createCliqRequest — the happy path', () => {
  it('opens a pending request with a 90-minute window and the normalized identifier', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    const out = await createCliqRequest(deps(db), args());

    expect(out.total).toBe(12.6);
    expect(out.expiresAtMs).toBe(NOW_MS + CLIQ_REQUEST_TTL_MS);

    const w = lastWrite(db);
    expect(w.cliqPaymentStatus).toBe('pending');
    expect(w.cliqPayerIdentifierMasked).toBe('••••000'); // masked, never the raw handle
    expect(w.cliqRequestExpiresAt.toMillis()).toBe(NOW_MS + CLIQ_REQUEST_TTL_MS);
  });

  it('writes a breakdown that sums to the total actually charged', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await createCliqRequest(deps(db), args());
    const w = lastWrite(db);
    expect(w.cliqAmount + w.cliqFees).toBeCloseTo(w.cliqTotal, 6);
  });

  it('NEVER puts the payer identifier on the seller-readable order doc', async () => {
    // orders grant  to the SELLER and Firestore has no field-level
    // read denylist, so an identifier here is the buyer's phone number handed
    // to the seller before any payment — defeating contactReveal's
    // paymentVerified gate. This is the regression test for that.
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await createCliqRequest(deps(db), args());

    const orderWrite = db._writes.find((w) => w.path === 'orders/o1').data;
    expect(orderWrite.cliqPayerIdentifier).toBeUndefined();
    expect(orderWrite.cliqPayerIdentifierMasked).toBe('••••000');
    expect(JSON.stringify(orderWrite)).not.toContain('+962790000000');
    expect(JSON.stringify(orderWrite)).not.toContain('790000000');
  });

  it('keeps the full identifier in the admin-only cliqPayerIdentifiers doc', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await createCliqRequest(deps(db), args());

    const secret = db._writes.find((w) => w.path === 'cliqPayerIdentifiers/o1');
    expect(secret, 'the full identifier was not persisted anywhere').toBeTruthy();
    expect(secret.data.identifier).toBe('+962790000000');
    expect(secret.data.buyerId).toBe('b1');
  });

  it('does NOT advance the order status — raising a request is not paying', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await createCliqRequest(deps(db), args());
    const w = lastWrite(db);
    expect(w.status).toBeUndefined();
    expect(w.paymentStatus).toBeUndefined();
  });
});

describe('createCliqRequest — the 90-minute duplicate lock', () => {
  it('refuses a second request while one is pending, and reports the remaining time', async () => {
    const db = makeFakeDb({
      'orders/o1': {
        ...WAITING,
        cliqPaymentStatus: 'pending',
        cliqRequestExpiresAt: FakeTimestamp.fromMillis(NOW_MS + 600_000),
      },
    });
    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { remainingMs: 600_000 },
    });
    expect(db._writes).toHaveLength(0);
  });

  it('A BROWSER REFRESH DOES NOT MINT A SECOND REQUEST', async () => {
    // BAE tests exactly this. The first call writes pending; the fixture is
    // then updated the way Firestore would be, and the identical second call —
    // a reload, a second tab, a replayed request — must be refused.
    const fixtures = { 'orders/o1': { ...WAITING } };
    const db = makeFakeDb(fixtures);

    await createCliqRequest(deps(db), args());
    fixtures['orders/o1'] = { ...WAITING, ...orderWrite(db) };

    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });

  it('allows a retry once the window has passed, even with no webhook back', async () => {
    const db = makeFakeDb({
      'orders/o1': {
        ...WAITING,
        cliqPaymentStatus: 'pending',
        cliqRequestExpiresAt: FakeTimestamp.fromMillis(NOW_MS - 1),
      },
    });
    await expect(createCliqRequest(deps(db), args())).resolves.toMatchObject({ total: 12.6 });
  });

  it('allows a retry after rejected or expired', async () => {
    for (const cliqPaymentStatus of ['rejected', 'expired']) {
      const db = makeFakeDb({ 'orders/o1': { ...WAITING, cliqPaymentStatus } });
      await expect(createCliqRequest(deps(db), args())).resolves.toBeTruthy();
    }
  });

  it('refuses once already paid, with a different code than the pending lock', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING, cliqPaymentStatus: 'paid' } });
    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('createCliqRequest — money is never taken from the client', () => {
  it('charges the settled total even when the client sends nothing', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    const out = await createCliqRequest(deps(db), args({ expectedTotal: undefined }));
    expect(out.total).toBe(12.6);
  });

  it('REJECTS a client total that disagrees with the order', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await expect(createCliqRequest(deps(db), args({ expectedTotal: 1 }))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db._writes).toHaveLength(0);
  });

  it('tolerates float representation but not a real difference', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    // A tenth of a fil apart: representation, not a different price.
    await expect(createCliqRequest(deps(db), args({ expectedTotal: 12.60001 }))).resolves.toBeTruthy();

    const db2 = makeFakeDb({ 'orders/o1': WAITING });
    // One fil apart: a different price.
    await expect(createCliqRequest(deps(db2), args({ expectedTotal: 12.601 }))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses an order with no settled total rather than charging zero', async () => {
    const db = makeFakeDb({
      'orders/o1': { status: 'waiting_payment', buyerId: 'b1', winningBidAmount: 12 },
    });
    await expect(
      createCliqRequest(deps(db), args({ expectedTotal: undefined }))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('createCliqRequest — access and preconditions', () => {
  it('refuses someone who is not the buyer', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await expect(createCliqRequest(deps(db), args({ buyerUid: 'someone-else' }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses an order that is not awaiting payment', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING, status: 'paid' } });
    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses a missing order', async () => {
    const db = makeFakeDb({});
    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a malformed identifier before touching the order', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await expect(createCliqRequest(deps(db), args({ identifier: '0760000000' }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(createCliqRequest(deps(db), args({ identifierType: 'iban' }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(db._writes).toHaveLength(0);
  });
});

describe('applyCliqWebhook — the only path to paid', () => {
  const PENDING = {
    ...WAITING,
    cliqPaymentStatus: 'pending',
    cliqRequestId: 'req_1',
    cliqRequestExpiresAt: FakeTimestamp.fromMillis(NOW_MS + 600_000),
  };

  it('advances the existing order machine on paid — no parallel status system', async () => {
    const db = makeFakeDb({ 'orders/o1': PENDING });
    await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });
    const w = lastWrite(db);
    expect(w.cliqPaymentStatus).toBe('paid');
    expect(w.status).toBe('paid');
    expect(w.paymentStatus).toBe('paid');
  });

  it('does NOT stamp admin verification — that human step still exists', async () => {
    const db = makeFakeDb({ 'orders/o1': PENDING });
    await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });
    expect(lastWrite(db).paymentVerified).toBeUndefined();
  });

  it('leaves the order awaiting payment on rejected or expired, so a retry is possible', async () => {
    for (const outcome of ['rejected', 'expired']) {
      const db = makeFakeDb({ 'orders/o1': PENDING });
      await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome });
      const w = lastWrite(db);
      expect(w.cliqPaymentStatus).toBe(outcome);
      expect(w.status).toBeUndefined();
    }
  });

  it('is idempotent — webhooks are retried', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...PENDING, cliqPaymentStatus: 'paid' } });
    const out = await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });
    expect(out.ignored).toBe('duplicate');
    expect(db._writes).toHaveLength(0);
  });

  it('ignores a late webhook for a superseded request', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...PENDING, cliqRequestId: 'req_2' } });
    const out = await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });
    expect(out.ignored).toBe('stale_request');
    expect(db._writes).toHaveLength(0);
  });

  it('never un-pays an order that a later rejection arrives for', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...PENDING, cliqPaymentStatus: 'paid' } });
    const out = await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'rejected' });
    expect(out.ignored).toBe('already_paid');
    expect(db._writes).toHaveLength(0);
  });

  it('refuses an outcome it does not recognise', async () => {
    const db = makeFakeDb({ 'orders/o1': PENDING });
    for (const outcome of ['pending', 'none', 'PAID', undefined]) {
      await expect(
        applyCliqWebhook(deps(db), { orderId: 'o1', outcome })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });
});

describe('resolveCliqAmount', () => {
  it('uses the persisted premium rather than re-deriving the rate', () => {
    // A hand-adjusted order (admin correction) must charge what it says, not
    // what 5% of the hammer would be.
    const out = resolveCliqAmount({ winningBidAmount: 100, buyersPremium: 3, totalDue: 103 });
    expect(out).toEqual({ amount: 100, fees: 3, total: 103 });
  });

  it('derives the fee from the total when the premium field is missing', () => {
    const out = resolveCliqAmount({ winningBidAmount: 100, totalDue: 105 });
    expect(out.fees).toBe(5);
  });

  it('returns null for an unsettled order instead of a zero charge', () => {
    expect(resolveCliqAmount({ winningBidAmount: 100 })).toBeNull();
    expect(resolveCliqAmount({ totalDue: 0 })).toBeNull();
    expect(resolveCliqAmount(null)).toBeNull();
  });
});
