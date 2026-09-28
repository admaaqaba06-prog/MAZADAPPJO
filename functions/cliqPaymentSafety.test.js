// Three ways the CliQ gateway could hurt a real buyer, and the guards that stop
// them. All three were found by an adversarial review of the merged code.
//
// They share a shape: the gateway rail reached a state the MANUAL rail cannot,
// because the manual rail's protections live in UI that the gateway path never
// renders. The fixes are all server-side for the same reason.

import { describe, it, expect } from 'vitest';
import { createCliqRequest, applyCliqWebhook, isCliqRequestLive } from './cliqPayment.js';

const NOW_MS = 1750000000000;

function makeSnapshot(data) {
  return { exists: data !== undefined && data !== null, data: () => data };
}

function makeFakeDb(fixtures) {
  const writes = [];
  return {
    _writes: writes,
    collection(name) {
      return {
        doc: (id) => ({ _path: id ? `${name}/${id}` : `${name}/auto` }),
      };
    },
    async runTransaction(fn) {
      return fn({
        async get(ref) { return makeSnapshot(fixtures[ref._path]); },
        set(ref, data, options) { writes.push({ path: ref._path, data, options }); },
      });
    },
  };
}

const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };
const deps = (db) => ({ db, Timestamp: FakeTimestamp, now: () => NOW_MS });

const WAITING = {
  status: 'waiting_payment',
  buyerId: 'b1',
  winningBidAmount: 12,
  buyersPremium: 0.6,
  totalDue: 12.6,
  deliveryAddress: { governorate: 'amman', area: 'Abdoun' },
  deliveryPhone: '0791111111',
};

const args = (o = {}) => ({
  orderId: 'o1', buyerUid: 'b1', identifierType: 'mobile',
  identifier: '0790000000', expectedTotal: 12.6, ...o,
});

// ---------------------------------------------------------------------------
describe('a gateway payment can never produce an undeliverable order', () => {
  it('refuses a request when the order has no delivery address', async () => {
    // The address form lives inside the MANUAL panel, which only renders while
    // status === 'waiting_payment'. A gateway payment flips that to 'paid' and
    // unmounts it — so if we let the request through, the buyer would never get
    // another surface on which to supply an address.
    const { deliveryAddress, ...noAddress } = WAITING;
    const db = makeFakeDb({ 'orders/o1': noAddress });
    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db._writes).toHaveLength(0);
  });

  it('refuses when the address exists but carries no governorate', async () => {
    const db = makeFakeDb({ 'orders/o1': { ...WAITING, deliveryAddress: { area: 'Abdoun' } } });
    await expect(createCliqRequest(deps(db), args())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses when the delivery phone is missing or blank', async () => {
    for (const deliveryPhone of [undefined, '', '   ']) {
      const db = makeFakeDb({ 'orders/o1': { ...WAITING, deliveryPhone } });
      await expect(
        createCliqRequest(deps(db), args()),
        `accepted a blank phone: ${JSON.stringify(deliveryPhone)}`
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    }
  });

  it('allows the request once both are present', async () => {
    const db = makeFakeDb({ 'orders/o1': WAITING });
    await expect(createCliqRequest(deps(db), args())).resolves.toMatchObject({ total: 12.6 });
  });
});

// ---------------------------------------------------------------------------
describe('money that arrived is never lost, even on a defaulted order', () => {
  const DEFAULTED = {
    ...WAITING,
    status: 'defaulted',
    cliqPaymentStatus: 'pending',
    cliqRequestId: 'req_1',
    cliqTotal: 12.6,
    cliqRequestExpiresAt: FakeTimestamp.fromMillis(NOW_MS + 600_000),
  };

  it('does NOT throw when the paid webhook lands on a defaulted order', async () => {
    // A throw aborts the whole transaction: cliqPaymentStatus stays 'pending',
    // nothing records the payment, and every BAE retry throws identically. The
    // bank would have moved the buyer's money with no trace on our side.
    const db = makeFakeDb({ 'orders/o1': DEFAULTED });
    await expect(
      applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' })
    ).resolves.toMatchObject({ needsReconciliation: true, orderStatus: 'defaulted' });
  });

  it('records the payment on the order and flags it for a human', async () => {
    const db = makeFakeDb({ 'orders/o1': DEFAULTED });
    await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });

    const order = db._writes.find((w) => w.path === 'orders/o1').data;
    expect(order.cliqPaymentStatus).toBe('paid');
    expect(order.cliqSettledAt).toBeTruthy();
    expect(order.cliqPaidOutOfBand).toBe(true);
    expect(order.cliqPaidOutOfBandStatus).toBe('defaulted');

    const alert = db._writes.find((w) => w.path.startsWith('system_health/'));
    expect(alert, 'nobody would ever find out about this payment').toBeTruthy();
    expect(alert.data.source).toBe('applyCliqWebhook');
  });

  it('does NOT silently revive a defaulted order to paid', async () => {
    // The lot may already be with the runner-up; forcing it back to 'paid'
    // would sell one item twice. A human decides: refund or reinstate.
    const db = makeFakeDb({ 'orders/o1': DEFAULTED });
    await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });
    const order = db._writes.find((w) => w.path === 'orders/o1').data;
    expect(order.status).toBeUndefined();
  });

  it('still advances a normal waiting_payment order the usual way', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...WAITING, cliqPaymentStatus: 'pending', cliqRequestId: 'req_1' },
    });
    const out = await applyCliqWebhook(deps(db), { orderId: 'o1', requestId: 'req_1', outcome: 'paid' });
    expect(out.needsReconciliation).toBeUndefined();
    const order = db._writes.find((w) => w.path === 'orders/o1').data;
    expect(order.status).toBe('paid');
    expect(order.cliqPaidOutOfBand).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('isCliqRequestLive — who paymentDefaultEnforcer must skip', () => {
  it('is true only while a request is pending AND inside its window', () => {
    expect(isCliqRequestLive({
      cliqPaymentStatus: 'pending',
      cliqRequestExpiresAt: FakeTimestamp.fromMillis(NOW_MS + 1),
    }, NOW_MS)).toBe(true);
  });

  it('is FALSE once the window has lapsed, so the deadline is not deferred forever', () => {
    // A bare `cliqPaymentStatus === 'pending'` check would let one stale flag
    // postpone a buyer's payment deadline indefinitely.
    expect(isCliqRequestLive({
      cliqPaymentStatus: 'pending',
      cliqRequestExpiresAt: FakeTimestamp.fromMillis(NOW_MS - 1),
    }, NOW_MS)).toBe(false);
  });

  it('is false for an order that never used the gateway', () => {
    expect(isCliqRequestLive({}, NOW_MS)).toBe(false);
    expect(isCliqRequestLive({ cliqPaymentStatus: 'none' }, NOW_MS)).toBe(false);
    expect(isCliqRequestLive(null, NOW_MS)).toBe(false);
  });

  it('is false for settled outcomes', () => {
    for (const cliqPaymentStatus of ['paid', 'rejected', 'expired']) {
      expect(isCliqRequestLive({ cliqPaymentStatus }, NOW_MS)).toBe(false);
    }
  });
});
