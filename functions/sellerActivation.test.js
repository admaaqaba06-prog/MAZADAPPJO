// Seller activation — the server half.
//
// `isSeller` is denylisted for self-writes in firestore.rules (alongside role /
// isAdmin / isBlocked / isVerified), so the client CANNOT grant it. WalletView
// used to try exactly that and would have failed with PERMISSION_DENIED had
// anything actually called it. Granting therefore belongs here, behind the
// Admin SDK, the same shape subscription grants already use.
import { describe, it, expect } from 'vitest';
import { activateSeller } from './sellerActivation.js';

const NOW_MS = 1750000000000;

// ---- Minimal Firestore Admin SDK mock -------------------------------------
// Copied from functions/orderPaymentSubmit.test.js (test-local by design).

function makeSnapshot(data) {
  return { exists: data !== undefined && data !== null, data: () => data };
}

function makeFakeDb(fixtures) {
  const writes = [];
  const db = {
    _writes: writes,
    collection(name) {
      return { doc(id) { return { _path: `${name}/${id}` }; } };
    },
    async runTransaction(fn) {
      const txn = {
        async get(ref) { return makeSnapshot(fixtures[ref._path]); },
        set(ref, data, options) { writes.push({ path: ref._path, data, options }); },
      };
      return fn(txn);
    },
  };
  return db;
}

const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };

function deps(db) {
  return { db, Timestamp: FakeTimestamp, now: () => NOW_MS };
}

const write = (db, path) => db._writes.find(w => w.path === path);

// ---------------------------------------------------------------------------

describe('activateSeller', () => {
  it('grants isSeller and stamps the activation on the user doc', async () => {
    const db = makeFakeDb({ 'users/u1': { name: 'Sami' } });
    const res = await activateSeller(deps(db), { uid: 'u1' });

    expect(res.activated).toBe(true);
    const u = write(db, 'users/u1');
    expect(u.data.isSeller).toBe(true);
    expect(u.data.sellerStatus).toBe('active');
    // Compare the millis, not the object: the mock mints a fresh Timestamp per
    // call and toEqual would compare its `toMillis` function by reference.
    expect(u.data.sellerActivatedAt.toMillis()).toBe(NOW_MS);
    // merge, never overwrite — the user doc holds everything else about them.
    expect(u.options).toEqual({ merge: true });
  });

  it('never touches role, isAdmin or any other privileged flag', async () => {
    const db = makeFakeDb({ 'users/u1': { name: 'Sami', role: 'user' } });
    await activateSeller(deps(db), { uid: 'u1' });

    const u = write(db, 'users/u1');
    for (const k of ['role', 'isAdmin', 'isBlocked', 'isVerified', 'wonCount',
                     'subscriptionStatus', 'subscriptionTier']) {
      expect(u.data).not.toHaveProperty(k);
    }
  });

  it('creates a sellerProfiles doc when the user has none', async () => {
    const db = makeFakeDb({ 'users/u1': { name: 'Sami' } });
    await activateSeller(deps(db), { uid: 'u1' });

    const p = write(db, 'sellerProfiles/u1');
    expect(p.data.userId).toBe('u1');
    expect(typeof p.data.storeName).toBe('string');
    expect(p.data.storeName.length).toBeGreaterThan(0);
    // A brand-new seller has sold nothing and is not verified. Seeding either
    // would be a fabricated reputation on a public profile.
    expect(p.data.totalSales).toBe(0);
    expect(p.data.isVerifiedMerchant).toBe(false);
    expect(p.data.verificationStatus).toBe('not_verified');
  });

  it('leaves an existing sellerProfiles doc untouched', async () => {
    const db = makeFakeDb({
      'users/u1': { name: 'Sami' },
      'sellerProfiles/u1': { userId: 'u1', storeName: 'Established Store', totalSales: 42 },
    });
    await activateSeller(deps(db), { uid: 'u1' });

    expect(write(db, 'sellerProfiles/u1')).toBeUndefined();
  });

  it('is idempotent — re-activating an active seller writes nothing', async () => {
    const db = makeFakeDb({
      'users/u1': { name: 'Sami', isSeller: true, sellerStatus: 'active' },
      'sellerProfiles/u1': { userId: 'u1', storeName: 'Shop' },
    });
    const res = await activateSeller(deps(db), { uid: 'u1' });

    expect(res).toEqual({ activated: false, alreadySeller: true });
    expect(db._writes).toHaveLength(0);
  });

  it('uses the localized store-name fallback when the user has no name', async () => {
    const db = makeFakeDb({ 'users/u1': {} });
    await activateSeller({ ...deps(db), lang: 'ar' }, { uid: 'u1' });
    expect(write(db, 'sellerProfiles/u1').data.storeName).toBe('متجري الخاص');

    const db2 = makeFakeDb({ 'users/u2': {} });
    await activateSeller({ ...deps(db2), lang: 'en' }, { uid: 'u2' });
    expect(write(db2, 'sellerProfiles/u2').data.storeName).toBe('My Store');
  });

  it('refuses a blocked user — a ban must not be a route to a seller account', async () => {
    const db = makeFakeDb({ 'users/u1': { name: 'Sami', isBlocked: true } });
    await expect(activateSeller(deps(db), { uid: 'u1' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(db._writes).toHaveLength(0);
  });

  it('refuses a user that does not exist', async () => {
    const db = makeFakeDb({});
    await expect(activateSeller(deps(db), { uid: 'nope' }))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a missing uid', async () => {
    const db = makeFakeDb({});
    await expect(activateSeller(deps(db), {}))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
