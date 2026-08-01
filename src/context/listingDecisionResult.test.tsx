/**
 * F1 — a failed listing write MUST be reported, or the Action Center's
 * optimistic hide can never be rolled back.
 *
 * `approveListing`/`rejectListing` used to call `updateDoc(...).then().catch()`
 * without returning it: the catch swallowed the rejection and the function
 * resolved to `undefined` whether the write landed or not. `useAdminAction`
 * then recorded `ok: true` on a failed write, `settleAction` never un-hid the
 * row, and `pruneHidden` KEPT it hidden precisely because the lot was still
 * live. The lot disappeared from the queue for the rest of the session and the
 * badge under-counted.
 *
 * This drives the REAL AppProvider through react-dom/server (vitest here is
 * environment: 'node', so there is no jsdom and no @testing-library) and calls
 * the real context function with `updateDoc` rejecting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const updateDoc = vi.fn();
const getDoc = vi.fn();

// vitest runs in `environment: 'node'`, so the Web Storage the provider reads
// during render does not exist. AppContext is imported dynamically inside the
// tests, after these are in place.
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as any;
}
// The provider's notification path touches `window` (feature-flagged off, but
// the guard itself dereferences it).
(globalThis as any).location = {
  pathname: '/', href: 'http://localhost/', search: '', hash: '', origin: 'http://localhost',
};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = memoryStorage();
(globalThis as any).sessionStorage = memoryStorage();

vi.mock('lucide-react', () => new Proxy({}, {
  // A bare Proxy would answer `then` with a function, making the module
  // namespace a thenable — `import()` would never resolve and the run hangs.
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}), doc: () => ({ id: 'lot-1' }), query: () => ({}), where: () => ({}),
  limit: () => ({}), orderBy: () => ({}), startAfter: () => ({}), endBefore: () => ({}),
  onSnapshot: () => () => {},
  getDoc: (...args: any[]) => getDoc(...args),
  getDocs: async () => ({ empty: true, docs: [], size: 0, forEach: () => {} }),
  setDoc: async () => {}, addDoc: async () => ({ id: 'x' }), deleteDoc: async () => {},
  updateDoc: (...args: any[]) => updateDoc(...args),
  writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async () => {},
  serverTimestamp: () => ({}), increment: (n: number) => n, arrayUnion: () => [], arrayRemove: () => [],
  Timestamp: {
    now: () => ({ seconds: 0, toMillis: () => 0 }),
    fromMillis: (m: number) => ({ seconds: Math.floor(m / 1000), toMillis: () => m }),
    fromDate: (d: Date) => ({ seconds: 0, toMillis: () => d.getTime() }),
  },
}));

vi.mock('../services/firebase', () => ({
  db: {}, auth: {}, storage: {},
  getCallableFunction: async () => async () => ({ data: { success: true } }),
}));

vi.mock('../components/feedback/Toast', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
  ToastProvider: ({ children }: any) => children,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  signInWithEmailAndPassword: async () => ({}), createUserWithEmailAndPassword: async () => ({}),
  signOut: async () => {}, updateProfile: async () => {}, GoogleAuthProvider: class {},
  signInWithPopup: async () => ({}), RecaptchaVerifier: class {}, signInWithPhoneNumber: async () => ({}),
}));

describe('a failed listing write is reported, not swallowed', () => {
  beforeEach(() => {
    updateDoc.mockReset();
    getDoc.mockReset();
    getDoc.mockResolvedValue({ exists: () => false });
  });

  async function withContext(fn: (ctx: any) => Promise<void>) {
    const { AppProvider } = await import('./AppContext');
    const mod = await import('./AppContext');
    let ctx: any = null;
    const Probe: React.FC = () => { ctx = (mod as any).useApp(); return null; };
    renderToStaticMarkup(
      React.createElement(AppProvider, null, React.createElement(Probe)),
    );
    expect(ctx, 'context was not captured — the provider did not render').toBeTruthy();
    await fn(ctx);
  }

  it('approveListing resolves { success: false } when the write is rejected', async () => {
    updateDoc.mockRejectedValue(Object.assign(new Error('PERMISSION_DENIED'), { code: 'permission-denied' }));
    await withContext(async (ctx) => {
      const result = await ctx.approveListing('lot-1');
      expect(result).toEqual({ success: false });
    });
  });

  it('approveListing resolves { success: true } when the write lands', async () => {
    updateDoc.mockResolvedValue(undefined);
    await withContext(async (ctx) => {
      const result = await ctx.approveListing('lot-1');
      expect(result).toEqual({ success: true });
    });
  });

  it('rejectListing resolves { success: false } when the write is rejected', async () => {
    updateDoc.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await withContext(async (ctx) => {
      const result = await ctx.rejectListing('lot-1', 'blurry photo');
      expect(result).toEqual({ success: false });
    });
  });

  it('rejectListing resolves { success: true } when the write lands', async () => {
    updateDoc.mockResolvedValue(undefined);
    await withContext(async (ctx) => {
      const result = await ctx.rejectListing('lot-1', 'blurry photo');
      expect(result).toEqual({ success: true });
    });
  });

  it('never resolves undefined — the shape that caused the bug', async () => {
    updateDoc.mockRejectedValue(new Error('nope'));
    await withContext(async (ctx) => {
      for (const r of [await ctx.approveListing('lot-1'), await ctx.rejectListing('lot-1')]) {
        expect(r).toBeDefined();
        expect(typeof r.success).toBe('boolean');
      }
    });
  });

  it('refuses an already-settled lot AND reports the refusal', async () => {
    // The guard returns before any write. It has to report failure too, or the
    // dead lot is optimistically hidden and never comes back — the same
    // vanishing act as a rejected write, on the path most likely to hit it
    // (a defaulted winner leaves exactly this row in the queue).
    getDoc.mockResolvedValue({
      exists: () => true,
      id: 'lot-1',
      data: () => ({ status: 'completed', settledAt: 1, title: 'Dead lot' }),
    });
    await withContext(async (ctx) => {
      const result = await ctx.approveListing('lot-1');
      expect(result).toEqual({ success: false });
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });
});
