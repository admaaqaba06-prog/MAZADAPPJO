// Wave 1 S3 — approveSubscription core logic tests (mocked Admin SDK).
// The Cloud Function callable in index.js is a thin admin-gated wrapper around
// these functions; the grant math + idempotency live here.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  approveSubscriptionRequest,
  grantSubscriptionDirect,
  rejectSubscriptionRequest,
} from './subscriptionApproval.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = 1750000000000;

// ---- Minimal Firestore Admin SDK mock -------------------------------------

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

function userWrite(db) {
  return db._writes.find((w) => w.path.startsWith('users/'));
}
function requestWrite(db) {
  return db._writes.find((w) => w.path.startsWith('subscriptionRequests/'));
}

// ---- approveSubscriptionRequest --------------------------------------------

describe('approveSubscriptionRequest', () => {
  it('grants the correct duration/expiry for a new-format request (4 JD semiannual)', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-1': {
        id: 'req-1', userId: 'user-9', status: 'pending', subscriptionStatus: 'pending',
        tier: 'semiannual', durationDays: 180, price: 4,
      },
      'users/user-9': { id: 'user-9', subscriptionStatus: 'pending' },
    });

    const result = await approveSubscriptionRequest(deps(db), 'req-1');

    expect(result.alreadyApproved).toBe(false);
    expect(result.userId).toBe('user-9');
    expect(result.tier).toBe('semiannual');
    expect(result.durationDays).toBe(180);

    const uw = userWrite(db);
    expect(uw.path).toBe('users/user-9');
    expect(uw.options).toEqual({ merge: true });
    expect(uw.data.subscriptionStatus).toBe('active');
    expect(uw.data.subscriptionPlan).toBe('semiannual');
    expect(uw.data.subscriptionTier).toBe('semiannual');
    expect(uw.data.subscriptionExpiry).toBe(NOW_MS + 180 * DAY_MS);
    expect(uw.data.subscriptionApprovedAt.toMillis()).toBe(NOW_MS);
    expect(uw.data.subscriptionExpiresAt.toMillis()).toBe(NOW_MS + 180 * DAY_MS);

    const rw = requestWrite(db);
    expect(rw.path).toBe('subscriptionRequests/req-1');
    expect(rw.data.status).toBe('approved');
    expect(rw.data.subscriptionStatus).toBe('approved');
    expect(rw.data.approvedTier).toBe('semiannual');
    expect(rw.data.approvedDurationDays).toBe(180);
  });

  it('recomputes duration from price when the request has no tier (old pending doc)', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-old': {
        id: 'req-old', userId: 'user-old', status: 'pending', price: 7, plan: 'annual',
      },
      'users/user-old': { subscriptionStatus: 'pending' },
    });

    const result = await approveSubscriptionRequest(deps(db), 'req-old');
    expect(result.tier).toBe('annual');
    expect(result.durationDays).toBe(365);
    expect(userWrite(db).data.subscriptionExpiry).toBe(NOW_MS + 365 * DAY_MS);
  });

  it('never grants from a mismatched plan label (price 1 + plan annual -> 30 days)', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-x': {
        id: 'req-x', userId: 'user-x', status: 'pending', price: 1, plan: 'annual',
      },
      'users/user-x': { subscriptionStatus: 'pending' },
    });

    const result = await approveSubscriptionRequest(deps(db), 'req-x');
    expect(result.tier).toBe('monthly');
    expect(result.durationDays).toBe(30);
  });

  it('maps a legacy plan when price is missing (quarterly -> 90 days)', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-q': {
        id: 'req-q', userId: 'user-q', status: 'pending', plan: 'quarterly',
      },
      'users/user-q': { subscriptionStatus: 'pending' },
    });

    const result = await approveSubscriptionRequest(deps(db), 'req-q');
    expect(result.tier).toBe('quarterly');
    expect(result.durationDays).toBe(90);
    expect(userWrite(db).data.subscriptionExpiry).toBe(NOW_MS + 90 * DAY_MS);
  });

  it('is IDEMPOTENT: re-approving an approved request is a no-op, not a double grant', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-done': {
        id: 'req-done', userId: 'user-d', status: 'approved', subscriptionStatus: 'approved',
        tier: 'monthly', price: 1,
      },
      'users/user-d': { subscriptionStatus: 'active' },
    });

    const result = await approveSubscriptionRequest(deps(db), 'req-done');
    expect(result.alreadyApproved).toBe(true);
    expect(db._writes).toHaveLength(0); // no user grant, no request rewrite
  });

  it('treats legacy subscriptionStatus:approved (without status) as already approved', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-legacy-done': {
        id: 'req-legacy-done', userId: 'user-l', subscriptionStatus: 'approved', price: 4,
      },
    });

    const result = await approveSubscriptionRequest(deps(db), 'req-legacy-done');
    expect(result.alreadyApproved).toBe(true);
    expect(db._writes).toHaveLength(0);
  });

  it('rejects a missing request', async () => {
    const db = makeFakeDb({});
    await expect(approveSubscriptionRequest(deps(db), 'nope')).rejects.toThrow(/not found/i);
    expect(db._writes).toHaveLength(0);
  });

  it('REFUSES the forged {price:1, tier:annual} request (tier/price mismatch) without writing', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-forged': {
        id: 'req-forged', userId: 'attacker-1', status: 'pending',
        price: 1, tier: 'annual', plan: 'annual', durationDays: 365,
      },
      'users/attacker-1': { subscriptionStatus: 'pending' },
    });
    await expect(approveSubscriptionRequest(deps(db), 'req-forged')).rejects.toThrow(/mismatch/i);
    expect(db._writes).toHaveLength(0);
  });

  it('rejects a request with an unresolvable price (old ||15 fallback) without writing', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-bad': {
        id: 'req-bad', userId: 'user-b', status: 'pending', price: 15, plan: 'monthly',
      },
    });
    await expect(approveSubscriptionRequest(deps(db), 'req-bad')).rejects.toThrow(/price/i);
    expect(db._writes).toHaveLength(0);
  });

  it('rejects a request without a userId', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-nouser': { id: 'req-nouser', status: 'pending', price: 1 },
    });
    await expect(approveSubscriptionRequest(deps(db), 'req-nouser')).rejects.toThrow(/user/i);
    expect(db._writes).toHaveLength(0);
  });
});

// ---- grantSubscriptionDirect ------------------------------------------------

describe('grantSubscriptionDirect', () => {
  it('grants a 30-day monthly membership by default', async () => {
    const db = makeFakeDb({ 'users/user-v': { subscriptionStatus: 'pending' } });
    const result = await grantSubscriptionDirect(deps(db), { userId: 'user-v' });

    expect(result.tier).toBe('monthly');
    expect(result.durationDays).toBe(30);
    const uw = userWrite(db);
    expect(uw.data.subscriptionStatus).toBe('active');
    expect(uw.data.subscriptionExpiry).toBe(NOW_MS + 30 * DAY_MS);
    expect(uw.data.subscriptionExpiresAt.toMillis()).toBe(NOW_MS + 30 * DAY_MS);
  });

  it('accepts only OFFERED tiers (no legacy quarterly, no unknown labels)', async () => {
    const db = makeFakeDb({ 'users/user-v': {} });
    await expect(grantSubscriptionDirect(deps(db), { userId: 'user-v', tier: 'quarterly' }))
      .rejects.toThrow(/tier/i);
    await expect(grantSubscriptionDirect(deps(db), { userId: 'user-v', tier: 'lifetime' }))
      .rejects.toThrow(/tier/i);
    expect(db._writes).toHaveLength(0);
  });

  it('requires a userId', async () => {
    const db = makeFakeDb({});
    await expect(grantSubscriptionDirect(deps(db), {})).rejects.toThrow(/user/i);
  });
});

// ---- rejectSubscriptionRequest ----------------------------------------------

describe('rejectSubscriptionRequest', () => {
  it('marks the request rejected and downgrades a still-pending user', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-r': { id: 'req-r', userId: 'user-r', status: 'pending', price: 1 },
      'users/user-r': { subscriptionStatus: 'pending' },
    });

    await rejectSubscriptionRequest(deps(db), { reqId: 'req-r' });

    const rw = requestWrite(db);
    expect(rw.data.status).toBe('rejected');
    expect(rw.data.subscriptionStatus).toBe('rejected');

    const uw = userWrite(db);
    expect(uw.data.subscriptionStatus).toBe('rejected');
    expect(uw.data.subscriptionExpiry).toBeNull();
    expect(uw.data.subscriptionPlan).toBeNull();
    expect(uw.data.subscriptionApprovedAt).toBeNull();
    expect(uw.data.subscriptionExpiresAt).toBeNull();
  });

  it('NEVER downgrades an already-active user when rejecting a stale request', async () => {
    const db = makeFakeDb({
      'subscriptionRequests/req-stale': { id: 'req-stale', userId: 'user-a', status: 'pending', price: 1 },
      'users/user-a': { subscriptionStatus: 'active' },
    });

    await rejectSubscriptionRequest(deps(db), { reqId: 'req-stale' });

    expect(requestWrite(db).data.status).toBe('rejected');
    expect(userWrite(db)).toBeUndefined();
  });

  it('direct user reject downgrades the user without a request doc', async () => {
    const db = makeFakeDb({ 'users/user-z': { subscriptionStatus: 'pending' } });
    await rejectSubscriptionRequest(deps(db), { userId: 'user-z' });
    const uw = userWrite(db);
    expect(uw.path).toBe('users/user-z');
    expect(uw.data.subscriptionStatus).toBe('rejected');
  });

  it('throws when the request does not exist', async () => {
    const db = makeFakeDb({});
    await expect(rejectSubscriptionRequest(deps(db), { reqId: 'ghost' })).rejects.toThrow(/not found/i);
  });

  it('requires reqId or userId', async () => {
    const db = makeFakeDb({});
    await expect(rejectSubscriptionRequest(deps(db), {})).rejects.toThrow();
  });
});
