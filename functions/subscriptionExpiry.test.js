// The sweep that makes `subscriptionStatus` stop being a latch.
//
// Before this module, 'active' was written once at approval and never rewritten
// — no scheduled job touched subscriptions and the value 'expired' existed in
// the types while nothing in production ever wrote it. These tests pin the two
// things that made the missing sweep dangerous rather than merely untidy:
// an account we CANNOT read an expiry for must not be expired by guesswork,
// and an account whose two expiry fields disagree must be judged on the later
// one, so a renewal is never swept away by a stale mirror field.
import { describe, it, expect } from 'vitest';
import {
  isActiveMember as clientIsActiveMember,
  effectiveExpiryMs as clientEffectiveExpiryMs,
} from '../src/utils/membership';
const {
  resolveExpirySweepAction,
  expireLapsedSubscriptions,
  effectiveExpiryMs,
  isActiveMember,
} = require('./subscriptionExpiry');

const NOW_MS = 1750000000000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---- Minimal Firestore Admin SDK mock -------------------------------------
// Test-local by design, same convention as functions/fulfillmentNudge.test.js.
// Supports only what the sweep uses: a users collection filtered by one
// inequality, per-doc merge writes, and an append-only system_health log.

const FakeTimestamp = {
  now: () => ({ _ms: NOW_MS, toMillis: () => NOW_MS }),
  fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }),
};

const FakeFieldValue = {
  serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }),
};

function makeFakeDb(users) {
  // users: { docId: {...data} }
  const writes = []; // { path, data, options }
  const added = []; // { collection, data }

  function makeUserDoc(id, data) {
    return {
      id,
      data: () => data,
      ref: {
        _path: `users/${id}`,
        async set(patch, options) {
          writes.push({ path: `users/${id}`, data: patch, options });
        },
      },
    };
  }

  const db = {
    _writes: writes,
    _added: added,
    collection(name) {
      if (name === 'system_health') {
        return {
          async add(data) {
            added.push({ collection: name, data });
          },
        };
      }
      const build = (filters) => ({
        where(field, op, value) {
          return build(filters.concat([{ field, op, value }]));
        },
        async get() {
          const docs = Object.entries(users)
            .filter(([, data]) =>
              filters.every(({ field, op, value }) => {
                const raw = data[field];
                if (op === '==') return raw === value;
                if (op === '<=') {
                  if (raw === undefined || raw === null) return false;
                  // Firestore orders by type: a string-stored expiry is NEVER
                  // returned by a numeric or Timestamp inequality. The fake
                  // mirrors that rather than being conveniently lenient.
                  const cmp = typeof value === 'object' ? value.toMillis() : value;
                  if (typeof raw === 'string') return false;
                  const rawMs = typeof raw === 'object' ? raw.toMillis() : raw;
                  return typeof rawMs === 'number' && rawMs <= cmp;
                }
                throw new Error(`fake db: unsupported op ${op}`);
              }),
            )
            .map(([id, data]) => makeUserDoc(id, data));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
      });
      return build([]);
    },
  };
  return db;
}

function deps(db) {
  return { db, Timestamp: FakeTimestamp, FieldValue: FakeFieldValue, now: () => NOW_MS };
}

// ---- The decision, in isolation -------------------------------------------

describe('resolveExpirySweepAction', () => {
  it('expires an active membership whose expiry has passed', () => {
    const user = { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY };
    expect(resolveExpirySweepAction(user, NOW_MS)).toBe('expire');
  });

  it('leaves an active membership with time remaining', () => {
    const user = { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + DAY };
    expect(resolveExpirySweepAction(user, NOW_MS)).toBe('active');
  });

  it('treats an expiry landing exactly on now as spent, matching the placeBid boundary', () => {
    const user = { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS };
    expect(resolveExpirySweepAction(user, NOW_MS)).toBe('expire');
  });

  it('does NOT expire an active account with no readable expiry — absence is not evidence of a lapse', () => {
    expect(resolveExpirySweepAction({ subscriptionStatus: 'active' }, NOW_MS)).toBe('needs_support');
    expect(resolveExpirySweepAction({ subscriptionStatus: 'active', subscriptionExpiry: null }, NOW_MS)).toBe('needs_support');
    expect(resolveExpirySweepAction({ subscriptionStatus: 'active', subscriptionExpiry: 'not-a-date' }, NOW_MS)).toBe('needs_support');
  });

  it('never expires an explicit lifetime grant, which has no date by design', () => {
    const lifetime = { subscriptionStatus: 'active', subscriptionTier: 'lifetime' };
    expect(resolveExpirySweepAction(lifetime, NOW_MS)).toBe('active');
    const permanent = { subscriptionStatus: 'active', subscriptionPlan: 'Permanent', subscriptionExpiry: NOW_MS - DAY };
    expect(resolveExpirySweepAction(permanent, NOW_MS)).toBe('active');
  });

  it('ignores accounts that are not active — the sweep only ever demotes from active', () => {
    for (const status of ['pending', 'rejected', 'expired', 'none', undefined]) {
      const user = { subscriptionStatus: status, subscriptionExpiry: NOW_MS - DAY };
      expect(resolveExpirySweepAction(user, NOW_MS), String(status)).toBe('not_active');
    }
  });

  it('judges on the LATER of the two expiry fields, so a renewal is not swept by a stale mirror', () => {
    // subscriptionExpiresAt lagged behind the renewal; subscriptionExpiry has it.
    const renewed = {
      subscriptionStatus: 'active',
      subscriptionExpiresAt: FakeTimestamp.fromMillis(NOW_MS - DAY),
      subscriptionExpiry: NOW_MS + 30 * DAY,
    };
    expect(resolveExpirySweepAction(renewed, NOW_MS)).toBe('active');
  });

  it('expires only when BOTH expiry fields are in the past', () => {
    const lapsed = {
      subscriptionStatus: 'active',
      subscriptionExpiresAt: FakeTimestamp.fromMillis(NOW_MS - 2 * DAY),
      subscriptionExpiry: NOW_MS - DAY,
    };
    expect(resolveExpirySweepAction(lapsed, NOW_MS)).toBe('expire');
  });
});

// ---- The sweep ------------------------------------------------------------

describe('expireLapsedSubscriptions', () => {
  it('writes expired status on a lapsed member and leaves the expiry date in place', async () => {
    const db = makeFakeDb({
      'user-lapsed': { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY },
    });
    const res = await expireLapsedSubscriptions(deps(db));

    const write = db._writes.find((w) => w.path === 'users/user-lapsed');
    expect(write).toBeTruthy();
    expect(write.data.subscriptionStatus).toBe('expired');
    expect(write.options).toEqual({ merge: true });
    // The date must survive: the account screen shows "Expired" ABOVE the date
    // it lapsed on, and a badge with no date tells the member nothing.
    expect(write.data.subscriptionExpiry).toBeUndefined();
    expect(res.expired).toBe(1);
  });

  it('does not touch a member with time remaining', async () => {
    const db = makeFakeDb({
      'user-ok': { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + 10 * DAY },
    });
    const res = await expireLapsedSubscriptions(deps(db));
    expect(db._writes).toEqual([]);
    expect(res.expired).toBe(0);
  });

  it('is idempotent — a second run rewrites nothing, because expired no longer matches', async () => {
    const users = {
      'user-lapsed': { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY },
    };
    const db = makeFakeDb(users);
    await expireLapsedSubscriptions(deps(db));
    expect(db._writes).toHaveLength(1);

    // Apply the sweep's own write back, as Firestore would, then re-run.
    users['user-lapsed'].subscriptionStatus = 'expired';
    const db2 = makeFakeDb(users);
    await expireLapsedSubscriptions(deps(db2));
    expect(db2._writes).toEqual([]);
  });

  it('finds a lapsed member stored only in subscriptionExpiresAt (the Timestamp field)', async () => {
    const db = makeFakeDb({
      'user-ts': {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: FakeTimestamp.fromMillis(NOW_MS - HOUR),
      },
    });
    const res = await expireLapsedSubscriptions(deps(db));
    expect(res.expired).toBe(1);
    expect(db._writes[0].data.subscriptionStatus).toBe('expired');
  });

  // A corrupt epoch is the shape that actually REACHES the needs_support branch:
  // Firestore's index happily returns 0 (it is <= now as a number), but it
  // carries no real date, so the sweep must refuse to call it a lapse.
  it('never expires an account whose stored expiry is a corrupt epoch, and counts it for support', async () => {
    const db = makeFakeDb({
      'user-zero': { subscriptionStatus: 'active', subscriptionExpiry: 0 },
      'user-negative': { subscriptionStatus: 'active', subscriptionExpiry: -1 },
    });
    const res = await expireLapsedSubscriptions(deps(db));
    expect(db._writes).toEqual([]);
    expect(res.needsSupport).toBe(2);
    expect(res.expired).toBe(0);
  });

  // Documents the sweep's REACH, not a wish. An account with no expiry field at
  // all is missing from both inequality indexes, so no query can return it and
  // its stale 'active' flag survives this sweep. That is not a hole: placeBid
  // fails closed on an unreadable expiry and the client badge derives from the
  // same absent date, so nothing is granted — only the stored flag stays wrong.
  it('cannot see an active account with no expiry field at all (Firestore index semantics)', async () => {
    const db = makeFakeDb({
      'user-nodate': { subscriptionStatus: 'active' },
    });
    const res = await expireLapsedSubscriptions(deps(db));
    expect(res.scanned).toBe(0);
    expect(db._writes).toEqual([]);
  });

  it('writes one audit row summarising the run', async () => {
    const db = makeFakeDb({
      a: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY },
      b: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - 2 * DAY },
      c: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + DAY },
    });
    const res = await expireLapsedSubscriptions(deps(db));
    expect(res.expired).toBe(2);
    const row = db._added.find((a) => a.collection === 'system_health');
    expect(row.data.type).toBe('subscription_expiry_sweep');
    expect(row.data.source).toBe('subscriptionExpirySweep');
  });

  it('does not write an audit row on a run that changed nothing (no health-log noise)', async () => {
    const db = makeFakeDb({
      c: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + DAY },
    });
    await expireLapsedSubscriptions(deps(db));
    expect(db._added).toEqual([]);
  });

  it('one failing write does not abort the rest of the sweep', async () => {
    const db = makeFakeDb({
      'user-bad': { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY },
      'user-good': { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY },
    });
    const original = db.collection;
    // Make the first user's write reject, leaving the second to succeed.
    const patched = {
      ...db,
      collection(name) {
        const col = original.call(db, name);
        if (name !== 'users') return col;
        const wrap = (q) => ({
          where: (...a) => wrap(q.where(...a)),
          get: async () => {
            const snap = await q.get();
            return {
              ...snap,
              docs: snap.docs.map((d) =>
                d.id === 'user-bad'
                  ? { ...d, ref: { ...d.ref, set: async () => { throw new Error('permission denied'); } } }
                  : d,
              ),
            };
          },
        });
        return wrap(col);
      },
    };
    const res = await expireLapsedSubscriptions(deps(patched));
    expect(res.expired).toBe(1);
    expect(res.failed).toBe(1);
  });
});

// ---- The bid gate ---------------------------------------------------------
// THE TEST THAT STOPS THIS COMING BACK. placeBid calls isActiveMember and
// answers MEMBERSHIP_REQUIRED when it is false, so these cases are the bid
// gate itself rather than a restatement of it. The gate was already correct
// before this change; what it lacked was anything pinning it down.

describe('isActiveMember — the server bid gate', () => {
  it('REFUSES an expired member', () => {
    expect(isActiveMember({ subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY }, NOW_MS)).toBe(false);
  });

  it('refuses a member whose expiry lands exactly on now', () => {
    expect(isActiveMember({ subscriptionStatus: 'active', subscriptionExpiry: NOW_MS }, NOW_MS)).toBe(false);
  });

  it('refuses an account the sweep has already written to expired', () => {
    expect(isActiveMember({ subscriptionStatus: 'expired', subscriptionExpiry: NOW_MS - DAY }, NOW_MS)).toBe(false);
  });

  it('admits a member with time left', () => {
    expect(isActiveMember({ subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + 1 }, NOW_MS)).toBe(true);
  });

  it('FAILS CLOSED on an active account with no readable expiry', () => {
    expect(isActiveMember({ subscriptionStatus: 'active' }, NOW_MS)).toBe(false);
    expect(isActiveMember({ subscriptionStatus: 'active', subscriptionExpiry: 0 }, NOW_MS)).toBe(false);
    expect(isActiveMember({ subscriptionStatus: 'active', subscriptionExpiry: 'gibberish' }, NOW_MS)).toBe(false);
  });

  it('refuses pending and rejected accounts, however live their date looks', () => {
    for (const status of ['pending', 'rejected', 'none', undefined]) {
      const user = { subscriptionStatus: status, subscriptionExpiry: NOW_MS + 30 * DAY };
      expect(isActiveMember(user, NOW_MS), String(status)).toBe(false);
    }
  });

  it('honours a legacy expiry stored as a date STRING — the case that once never expired anyone', () => {
    const lapsed = { subscriptionStatus: 'active', subscriptionExpiry: new Date(NOW_MS - DAY).toISOString() };
    expect(isActiveMember(lapsed, NOW_MS)).toBe(false);
    const live = { subscriptionStatus: 'active', subscriptionExpiry: new Date(NOW_MS + DAY).toISOString() };
    expect(isActiveMember(live, NOW_MS)).toBe(true);
  });

  it('admits a member renewed in only one of the two expiry fields', () => {
    const renewed = {
      subscriptionStatus: 'active',
      subscriptionExpiresAt: FakeTimestamp.fromMillis(NOW_MS - DAY),
      subscriptionExpiry: NOW_MS + 30 * DAY,
    };
    expect(isActiveMember(renewed, NOW_MS)).toBe(true);
  });

  it('agrees with the client gate on every shape, so the UI never promises what the server refuses', () => {
    const shapes = [
      { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY },
      { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS },
      { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + DAY },
      { subscriptionStatus: 'active' },
      { subscriptionStatus: 'active', subscriptionExpiry: 0 },
      { subscriptionStatus: 'active', subscriptionTier: 'lifetime' },
      { subscriptionStatus: 'active', subscriptionTier: 'lifetime', subscriptionExpiry: NOW_MS - DAY },
      { subscriptionStatus: 'pending', subscriptionExpiry: NOW_MS + DAY },
      { subscriptionStatus: 'expired', subscriptionExpiry: NOW_MS - DAY },
      { subscriptionStatus: 'active', subscriptionExpiry: new Date(NOW_MS - DAY).toISOString() },
      null,
    ];
    for (const user of shapes) {
      expect(isActiveMember(user, NOW_MS), JSON.stringify(user)).toBe(
        clientIsActiveMember(user, NOW_MS),
      );
    }
  });
});

// ---- Parity with the client -----------------------------------------------
// The whole bug was two halves disagreeing. These assert the server sweep and
// the client predicate answer the same question the same way, across the
// CJS/ESM boundary — the same technique as healthThresholds.parity.test.ts.

describe('server/client parity', () => {
  const cases = [
    { label: 'lapsed yesterday', user: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS - DAY } },
    { label: 'valid for 10 more days', user: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS + 10 * DAY } },
    { label: 'exactly on the boundary', user: { subscriptionStatus: 'active', subscriptionExpiry: NOW_MS } },
    { label: 'active with no date', user: { subscriptionStatus: 'active' } },
    { label: 'lifetime grant', user: { subscriptionStatus: 'active', subscriptionTier: 'lifetime' } },
    { label: 'pending renewal', user: { subscriptionStatus: 'pending', subscriptionExpiry: NOW_MS + DAY } },
    { label: 'already expired', user: { subscriptionStatus: 'expired', subscriptionExpiry: NOW_MS - DAY } },
  ];

  it('effectiveExpiryMs agrees with the client on every shape', () => {
    for (const { label, user } of cases) {
      expect(effectiveExpiryMs(user), label).toBe(clientEffectiveExpiryMs(user));
    }
  });

  it('an account the sweep expires is one the client already refuses to call a member', () => {
    for (const { label, user } of cases) {
      const action = resolveExpirySweepAction(user, NOW_MS);
      if (action === 'expire') {
        expect(clientIsActiveMember(user, NOW_MS), label).toBe(false);
      }
    }
  });

  it('an account the sweep keeps active is one the client also honours', () => {
    for (const { label, user } of cases) {
      if (resolveExpirySweepAction(user, NOW_MS) === 'active') {
        expect(clientIsActiveMember(user, NOW_MS), label).toBe(true);
      }
    }
  });
});
