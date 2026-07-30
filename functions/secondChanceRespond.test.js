// Second-chance accept/decline core — behaviour, with an injected Firestore.
//
// This is the money path of the feature: it mints a real `waiting_payment`
// obligation for a bid that was placed days earlier by someone who may since
// have been banned, on a lot whose ORIGINAL order still exists and belongs to
// somebody else. Authorisation, expiry, idempotency, the ban gate and every
// field of the minted document are covered here rather than by reading the
// source, because none of those are placement questions.
//
// Firestore mock mirrors orderPaymentSubmit.test.js (test-local by design),
// extended with `update` and read tracking.
import { describe, it, expect } from 'vitest';
import { respondToSecondChance } from './secondChanceRespond.js';
import {
  buyerPremiumJod, totalDueJod, sellerCommissionFils, sellerNetFils, belowReserveExpiryMs,
} from './settlement.js';

const NOW_MS = 1750000000000;
const HOUR = 3600 * 1000;

// The runner-up's own bid. The DEFAULTED order was for far more (150) — money
// must never be inherited from it.
const RUNNER_UP_BID = 90;
const DEFAULTED_BID = 150;

function makeSnapshot(data) {
  return { exists: data !== undefined && data !== null, data: () => data };
}

/**
 * @param fixtures  { 'collection/docId': data }
 * @param opts.retryWith  fixtures for a SECOND attempt. Present = simulate the
 *        contention retry Firestore does for real: run the callback, throw the
 *        first attempt's writes away, swap the fixtures, run it again.
 */
function makeFakeDb(fixtures, opts = {}) {
  const writes = [];
  const reads = [];
  const db = {
    _writes: writes,
    _reads: reads,
    collection(name) {
      // `id` mirrors a real DocumentReference — the core stamps it onto the
      // order document and into the notification.
      return { doc: (id) => ({ _path: `${name}/${id}`, id }) };
    },
    async runTransaction(fn) {
      const run = async (state) => {
        writes.length = 0; // a retried attempt starts from a clean slate
        const txn = {
          async get(ref) {
            reads.push(ref._path);
            return makeSnapshot(state[ref._path]);
          },
          set(ref, data) { writes.push({ path: ref._path, type: 'set', data }); },
          update(ref, data) { writes.push({ path: ref._path, type: 'update', data }); },
        };
        return fn(txn);
      };
      if (opts.retryWith) {
        await run(fixtures);
        return run(opts.retryWith);
      }
      return run(fixtures);
    },
  };
  return db;
}

const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };
const deps = (db) => ({ db, Timestamp: FakeTimestamp, now: () => NOW_MS });

const SELLER = 's1';
const BIDDER = 'b2';
const DEFAULTER = 'b1';
const STRANGER = 'x9';

function offer(over = {}) {
  return {
    status: 'pending_buyer',
    bidderId: BIDDER,
    bidderName: '', // pickRunnerUp writes '' rather than an English label
    amount: RUNNER_UP_BID,
    defaultedOrderId: 'a1',
    openedAt: FakeTimestamp.fromMillis(NOW_MS - HOUR),
    expiresAt: FakeTimestamp.fromMillis(NOW_MS + 23 * HOUR),
    notifiedAt: FakeTimestamp.fromMillis(NOW_MS - HOUR),
    ...over,
  };
}

function auction(over = {}) {
  // The offer partial merges into the DEFAULT offer, so a test can override one
  // field of it without rebuilding the whole record.
  const { secondChanceOffer: offerOver, ...rest } = over;
  return {
    sellerId: SELLER,
    sellerName: 'متجر الساعات',
    title: 'ساعة رولكس',
    thumbnailUrl: 'https://img.example/w.jpg',
    paymentWindowHours: 24,
    ...rest,
    secondChanceOffer: offer(offerOver),
  };
}

function world(over = {}) {
  return {
    'auctions/a1': auction(over.auction),
    'users/b2': { name: 'سامي', ...(over.bidder || {}) },
    // The DEFAULTED order. It exists, it is somebody else's, and nothing in
    // this flow may read or write it.
    'orders/a1': { id: 'a1', buyerId: DEFAULTER, winningBidAmount: DEFAULTED_BID, status: 'defaulted' },
    ...(over.extra || {}),
  };
}

const call = (db, args) => respondToSecondChance(deps(db), { auctionId: 'a1', ...args });

const orderWrite = (db) => db._writes.find(w => w.path === 'orders/a1__sc');
const auctionWrite = (db) => db._writes.find(w => w.path === 'auctions/a1');

// ---------------------------------------------------------------------------

describe('buyer_accept — the minted order', () => {
  it('mints orders/<auctionId>__sc, never the auction id', async () => {
    const db = makeFakeDb(world());
    const { result } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    expect(result.success).toBe(true);
    const w = orderWrite(db);
    expect(w).toBeTruthy();
    expect(w.type).toBe('set');
    expect(w.data.id).toBe('a1__sc');
    expect(w.data.auctionId).toBe('a1');
  });

  it('prices the order from the RUNNER-UP bid, with the shared settlement helpers', async () => {
    const db = makeFakeDb(world());
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    const d = orderWrite(db).data;
    expect(d.winningBidAmount).toBe(RUNNER_UP_BID);
    expect(d.winningBidAmount).not.toBe(DEFAULTED_BID);
    expect(d.buyersPremium).toBe(buyerPremiumJod(RUNNER_UP_BID));
    expect(d.totalDue).toBe(totalDueJod(RUNNER_UP_BID));
    expect(d.sellerCommission).toBe(sellerCommissionFils(RUNNER_UP_BID * 1000) / 1000);
    expect(d.sellerNet).toBe(sellerNetFils(RUNNER_UP_BID * 1000) / 1000);
  });

  it('never reads or writes the defaulted order', async () => {
    const db = makeFakeDb(world());
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    expect(db._reads).not.toContain('orders/a1');
    expect(db._writes.some(w => w.path === 'orders/a1')).toBe(false);
  });

  it('carries the obligation fields a payable order needs', async () => {
    const db = makeFakeDb(world());
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    const d = orderWrite(db).data;
    expect(d.status).toBe('waiting_payment');
    expect(d.paymentStatus).toBe('unpaid');
    expect(d.escrowStatus).toBe('locked');
    expect(d.shippingStatus).toBe('not_started');
    expect(d.paymentWindowHours).toBe(24);
    expect(d.paymentDeadlineAt.toMillis()).toBe(NOW_MS + 24 * HOUR);
    expect(d.buyerId).toBe(BIDDER);
    expect(d.sellerId).toBe(SELLER);
    // Provenance — this order exists because another one died.
    expect(d.secondChanceFor).toBe('a1');
  });

  it('honours a per-auction payment window', async () => {
    const db = makeFakeDb(world({ auction: { paymentWindowHours: 48 } }));
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    const d = orderWrite(db).data;
    expect(d.paymentWindowHours).toBe(48);
    expect(d.paymentDeadlineAt.toMillis()).toBe(NOW_MS + 48 * HOUR);
  });

  it('resolves the real buyer name, and falls back in Arabic, never "Buyer"', async () => {
    const withName = makeFakeDb(world());
    await call(withName, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(orderWrite(withName).data.buyerName).toBe('سامي');

    // pickRunnerUp stores '' on purpose; no user doc name either.
    const noName = makeFakeDb(world({ bidder: { name: '' } }));
    await call(noName, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(orderWrite(noName).data.buyerName).toBe('مشتري');
    expect(orderWrite(noName).data.buyerName).not.toMatch(/[A-Za-z]/);
  });

  it('falls back to an Arabic seller name too', async () => {
    const db = makeFakeDb(world({ auction: { sellerName: '' } }));
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(orderWrite(db).data.sellerName).toBe('بائع');
  });

  it('propagates the simulation flag only when the auction is simulated', async () => {
    const real = makeFakeDb(world());
    await call(real, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(orderWrite(real).data.isSimulated).toBeUndefined();

    const sim = makeFakeDb(world({ auction: { isSimulated: true } }));
    await call(sim, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(orderWrite(sim).data.isSimulated).toBe(true);
  });

  it("confirms the offer with the literal 'confirmed' that blocks relist forever", async () => {
    const db = makeFakeDb(world());
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    const w = auctionWrite(db);
    expect(w.type).toBe('update');
    expect(w.data['secondChanceOffer.status']).toBe('confirmed');
    expect(w.data['secondChanceOffer.confirmedAt'].toMillis()).toBe(NOW_MS);
  });

  it('describes a payment_due notify for the buyer, pointing at the NEW order', async () => {
    const db = makeFakeDb(world());
    const { notify } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    expect(notify.uid).toBe(BIDDER);
    expect(notify.event).toBe('payment_due');
    expect(notify.data.orderId).toBe('a1__sc');
    expect(notify.data.totalDue).toBe(totalDueJod(RUNNER_UP_BID));
    expect(notify.data.secondChance).toBe(true);
  });
});

describe('authorisation', () => {
  it('only the seller may seller_accept', async () => {
    const fx = world({ auction: { secondChanceOffer: { status: 'pending_seller' } } });
    for (const uid of [BIDDER, STRANGER, DEFAULTER]) {
      const db = makeFakeDb(fx);
      await expect(call(db, { action: 'seller_accept', callerUserId: uid }))
        .rejects.toMatchObject({ code: 'permission-denied' });
      expect(db._writes).toHaveLength(0);
    }
    const ok = makeFakeDb(fx);
    await expect(call(ok, { action: 'seller_accept', callerUserId: SELLER })).resolves.toBeTruthy();
  });

  it('only the offer’s bidder may buyer_accept', async () => {
    for (const uid of [SELLER, STRANGER, DEFAULTER]) {
      const db = makeFakeDb(world());
      await expect(call(db, { action: 'buyer_accept', callerUserId: uid }))
        .rejects.toMatchObject({ code: 'permission-denied' });
      expect(db._writes).toHaveLength(0);
    }
  });

  it('a stranger is not told that the lot already sold', async () => {
    // The idempotent "already created" answer reveals a sale on this lot. It
    // must sit BELOW the authorisation check, not above it.
    const db = makeFakeDb(world({
      auction: { secondChanceOffer: { status: 'confirmed' } },
      extra: { 'orders/a1__sc': { id: 'a1__sc', buyerId: BIDDER } },
    }));
    await expect(call(db, { action: 'buyer_accept', callerUserId: STRANGER }))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('a stranger may not decline', async () => {
    const db = makeFakeDb(world());
    await expect(call(db, { action: 'decline', callerUserId: STRANGER }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(db._writes).toHaveLength(0);
  });
});

describe('who may decline is decided PER STATUS', () => {
  // pending_seller: the bid is UNDER the reserve and we are asking the seller —
  // their refusal IS the consent decision.
  // pending_buyer: the seller already consented, implicitly (the bid cleared
  // the reserve they set) or explicitly (seller_accept). Declining there would
  // let them renege on their own price, or undo their own acceptance.
  const underReserve = { auction: { secondChanceOffer: { status: 'pending_seller' } } };

  it('seller declines pending_seller → allowed', async () => {
    const db = makeFakeDb(world(underReserve));
    const { result, notify } = await call(db, { action: 'decline', callerUserId: SELLER });

    expect(result.success).toBe(true);
    expect(auctionWrite(db).data['secondChanceOffer.status']).toBe('declined');
    expect(auctionWrite(db).data['secondChanceOffer.declinedBy']).toBe(SELLER);
    // The runner-up hears that their under-reserve offer was refused.
    expect(notify.uid).toBe(BIDDER);
    expect(notify.data.declinedBy).toBe('seller');
  });

  it('bidder declines pending_seller → allowed', async () => {
    const db = makeFakeDb(world(underReserve));
    const { result, notify } = await call(db, { action: 'decline', callerUserId: BIDDER });

    expect(result.success).toBe(true);
    expect(auctionWrite(db).data['secondChanceOffer.declinedBy']).toBe(BIDDER);
    expect(notify.uid).toBe(SELLER);
    expect(notify.data.declinedBy).toBe('buyer');
  });

  it('seller declines pending_buyer → DENIED, and nothing is written', async () => {
    const db = makeFakeDb(world()); // default offer is pending_buyer
    await expect(call(db, { action: 'decline', callerUserId: SELLER }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(db._writes).toHaveLength(0);
  });

  it('a seller cannot undo their OWN seller_accept', async () => {
    // seller_accept is what moves the offer to pending_buyer, after the
    // runner-up has been told the lot is theirs to confirm.
    const db = makeFakeDb(world({ auction: { secondChanceOffer: {
      status: 'pending_buyer',
      sellerAcceptedAt: FakeTimestamp.fromMillis(NOW_MS - HOUR),
    } } }));
    await expect(call(db, { action: 'decline', callerUserId: SELLER }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(db._writes).toHaveLength(0);
  });

  it('bidder declines pending_buyer → allowed (withdrawing their own offer)', async () => {
    const db = makeFakeDb(world());
    const { result, notify } = await call(db, { action: 'decline', callerUserId: BIDDER });

    expect(result.success).toBe(true);
    const w = auctionWrite(db);
    expect(w.data['secondChanceOffer.status']).toBe('declined');
    expect(w.data['secondChanceOffer.declinedBy']).toBe(BIDDER);
    expect(w.data['secondChanceOffer.declinedAt'].toMillis()).toBe(NOW_MS);
    // The SELLER must hear it, or the lot silently becomes relist-eligible
    // with nobody informed.
    expect(notify.uid).toBe(SELLER);
    expect(notify.data.declinedBy).toBe('buyer');
    expect(notify.data.secondChance).toBe(true);
  });

  it('a closed offer still reads as closed to the seller, not as a permission problem', async () => {
    // The status gate keys on pending_buyer specifically, so a dead offer falls
    // through to the liveness check and gets the accurate message.
    for (const status of ['declined', 'confirmed']) {
      const db = makeFakeDb(world({ auction: { secondChanceOffer: { status } } }));
      await expect(call(db, { action: 'decline', callerUserId: SELLER }))
        .rejects.toMatchObject({ code: 'failed-precondition' });
    }
  });
});

describe('the offer window and status', () => {
  it('an expired offer cannot be accepted by either party', async () => {
    const expired = { expiresAt: FakeTimestamp.fromMillis(NOW_MS - 1) };

    const buyer = makeFakeDb(world({ auction: { secondChanceOffer: expired } }));
    await expect(call(buyer, { action: 'buyer_accept', callerUserId: BIDDER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(buyer._writes).toHaveLength(0);

    const seller = makeFakeDb(world({ auction: { secondChanceOffer: { ...expired, status: 'pending_seller' } } }));
    await expect(call(seller, { action: 'seller_accept', callerUserId: SELLER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(seller._writes).toHaveLength(0);
  });

  it('a declined offer is terminal', async () => {
    const db = makeFakeDb(world({ auction: { secondChanceOffer: { status: 'declined' } } }));
    await expect(call(db, { action: 'buyer_accept', callerUserId: BIDDER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('the buyer cannot accept before the seller has', async () => {
    const db = makeFakeDb(world({ auction: { secondChanceOffer: { status: 'pending_seller' } } }));
    await expect(call(db, { action: 'buyer_accept', callerUserId: BIDDER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('the seller cannot accept an offer that already moved to the buyer', async () => {
    const db = makeFakeDb(world());
    await expect(call(db, { action: 'seller_accept', callerUserId: SELLER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });
});

describe('idempotency', () => {
  it('a second buyer_accept does not mint a second order', async () => {
    const db = makeFakeDb(world({
      auction: { secondChanceOffer: { status: 'confirmed' } },
      extra: { 'orders/a1__sc': { id: 'a1__sc', buyerId: BIDDER } },
    }));
    const { result, notify } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    expect(result).toMatchObject({ success: true, alreadyCreated: true });
    expect(db._writes).toHaveLength(0);
    expect(notify).toBeNull();
  });

  it('an existing order stops a still-pending offer from minting again', async () => {
    const db = makeFakeDb(world({ extra: { 'orders/a1__sc': { id: 'a1__sc', buyerId: BIDDER } } }));
    const { result } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    expect(result.alreadyCreated).toBe(true);
    expect(db._writes).toHaveLength(0);
  });
});

describe('seller_accept', () => {
  it('moves pending_seller → pending_buyer with a FRESH window', async () => {
    const db = makeFakeDb(world({ auction: { secondChanceOffer: {
      status: 'pending_seller',
      // Nearly lapsed: the buyer must not inherit the residue.
      expiresAt: FakeTimestamp.fromMillis(NOW_MS + 60 * 1000),
    } } }));
    const { result, notify } = await call(db, { action: 'seller_accept', callerUserId: SELLER });

    expect(result.success).toBe(true);
    const w = auctionWrite(db);
    expect(w.data['secondChanceOffer.status']).toBe('pending_buyer');
    expect(w.data['secondChanceOffer.expiresAt'].toMillis()).toBe(belowReserveExpiryMs(NOW_MS));
    expect(w.data['secondChanceOffer.expiresAt'].toMillis()).toBeGreaterThan(NOW_MS + 60 * 1000);
    expect(w.data['secondChanceOffer.sellerAcceptedAt'].toMillis()).toBe(NOW_MS);

    // No order yet — the buyer still has to accept.
    expect(orderWrite(db)).toBeUndefined();
    expect(notify.uid).toBe(BIDDER);
    expect(notify.event).toBe('below_reserve_seller_accepted');
    expect(notify.data.secondChance).toBe(true);
  });
});

describe('the ban gate on buyer_accept', () => {
  it('refuses to mint an obligation for a restricted account', async () => {
    const db = makeFakeDb(world({ bidder: { isBlocked: true, blockedUntil: NOW_MS + 24 * HOUR } }));
    await expect(call(db, { action: 'buyer_accept', callerUserId: BIDDER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('refuses a permanent ban (no expiry)', async () => {
    const db = makeFakeDb(world({ bidder: { isBlocked: true, blockedUntil: null } }));
    await expect(call(db, { action: 'buyer_accept', callerUserId: BIDDER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db._writes).toHaveLength(0);
  });

  it('lets an ELAPSED cooldown through — the ban ladder auto-expires', async () => {
    const db = makeFakeDb(world({ bidder: { isBlocked: true, blockedUntil: NOW_MS - 1 } }));
    const { result } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(result.success).toBe(true);
  });

  it('does not gate on membership — a lapsed subscription still gets the lot', async () => {
    // Accepting a bid already placed is closer to paying for a win (no
    // membership gate on that path) than to placing a new bid; a second chance
    // is one-shot, so refusing here strands the lot for good.
    const db = makeFakeDb(world({ bidder: { subscriptionStatus: 'expired', subscriptionExpiry: NOW_MS - HOUR } }));
    const { result } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(result.success).toBe(true);
  });
});

describe('a corrupt offer amount cannot mint NaN money', () => {
  // Firestore stores NaN doubles happily; the buyer would owe "NaN د.أ".
  for (const amount of [undefined, null, NaN, 'abc', '', 0, -5]) {
    it(`rejects amount ${JSON.stringify(amount)}`, async () => {
      const db = makeFakeDb(world({ auction: { secondChanceOffer: { amount } } }));
      await expect(call(db, { action: 'buyer_accept', callerUserId: BIDDER }))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(db._writes).toHaveLength(0);
    });
  }

  it('accepts a numeric string bid rather than failing a real sale', async () => {
    const db = makeFakeDb(world({ auction: { secondChanceOffer: { amount: '90' } } }));
    await call(db, { action: 'buyer_accept', callerUserId: BIDDER });
    expect(orderWrite(db).data.winningBidAmount).toBe(90);
    expect(orderWrite(db).data.totalDue).toBe(totalDueJod(90));
  });
});

describe('arguments and missing documents', () => {
  it('rejects an unknown action', async () => {
    const db = makeFakeDb(world());
    for (const action of ['seller_decline', '', undefined, 'BUYER_ACCEPT']) {
      await expect(call(db, { action, callerUserId: BIDDER }))
        .rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });

  it('rejects a missing auction id and a missing caller', async () => {
    const db = makeFakeDb(world());
    await expect(respondToSecondChance(deps(db), { action: 'decline', callerUserId: BIDDER }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(db, { action: 'decline' }))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('reports a missing auction and a missing offer distinctly', async () => {
    const noAuction = makeFakeDb({});
    await expect(call(noAuction, { action: 'decline', callerUserId: SELLER }))
      .rejects.toMatchObject({ code: 'not-found' });

    const noOffer = makeFakeDb({ 'auctions/a1': { sellerId: SELLER, title: 'x' } });
    await expect(call(noOffer, { action: 'decline', callerUserId: SELLER }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('a retried transaction', () => {
  it('does not carry the previous attempt’s notify', async () => {
    // Firestore retries a contended callback. Attempt 1 mints the order and
    // captures a payment_due for the buyer; by attempt 2 the write has landed,
    // so the callback short-circuits — and must NOT still be holding attempt
    // one's message.
    const db = makeFakeDb(world(), {
      retryWith: world({
        auction: { secondChanceOffer: { status: 'confirmed' } },
        extra: { 'orders/a1__sc': { id: 'a1__sc', buyerId: BIDDER } },
      }),
    });
    const { result, notify } = await call(db, { action: 'buyer_accept', callerUserId: BIDDER });

    expect(result.alreadyCreated).toBe(true);
    expect(notify).toBeNull();
  });
});
