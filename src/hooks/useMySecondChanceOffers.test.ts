import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Guards for the hook that feeds the runner-up's second-chance card.
 *
 * WHY THIS FILE EXISTS. The bug this hook was fixed for is SILENT: a live offer
 * that never renders, never errors, and expires unseen in 24h. A review ran
 * mutants against the fix and three of them SURVIVED the suite — deleting the
 * `orderBy`, deleting the status filter, and reverting the thumbnail mapping.
 * `SECOND_CHANCE_PENDING_STATUSES` was pinned, but nothing asserted the HOOK
 * used it. An unpinned fix to a silent bug is one refactor away from being a
 * silent bug again.
 *
 * HOW IT RUNS UNDER `environment: 'node'`. Same technique as
 * `src/utils/orderWorkflow.test.ts`: `../services/firebase` and
 * `firebase/firestore` are mocked at the module boundary, so the real hook body
 * executes against fake primitives. React is mocked too — with a ~40-line
 * useState/useEffect harness — because there is no jsdom and no
 * @testing-library here, and the effect's subscribe/cleanup behaviour is
 * precisely what needs proving.
 *
 * Two layers:
 *  - STRUCTURAL, over the recorded query constraints. Weaker (it echoes the
 *    builder's arguments) but it is what stops a refactor from silently
 *    deleting the orderBy or the status filter.
 *  - BEHAVIOURAL, over the snapshot mapper, driven by a fake `snap.docs`. Real
 *    input→output coverage of the thumbnail fallbacks.
 */

// ---------------------------------------------------------------------------
// Fake React: just enough useState/useEffect to drive one hook.
// ---------------------------------------------------------------------------
type Harness = {
  stateSlots: any[];
  stateIdx: number;
  effectSlots: { deps?: any[]; cleanup?: (() => void) | void }[];
  effectIdx: number;
  pending: { idx: number; fn: () => any; deps?: any[] }[];
  result: any;
  flush: () => void;
  busy: boolean;
  dirty: boolean;
};

let current: Harness | null = null;

const fakeUseState = (init: any) => {
  const h = current!;
  const i = h.stateIdx++;
  if (!(i in h.stateSlots)) h.stateSlots[i] = typeof init === 'function' ? init() : init;
  const setter = (next: any) => {
    const prev = h.stateSlots[i];
    h.stateSlots[i] = typeof next === 'function' ? next(prev) : next;
    if (h.busy) h.dirty = true;
    else h.flush();
  };
  return [h.stateSlots[i], setter];
};

const fakeUseEffect = (fn: () => any, deps?: any[]) => {
  const h = current!;
  h.pending.push({ idx: h.effectIdx++, fn, deps });
};

vi.mock('react', () => ({
  useState: (init: any) => fakeUseState(init),
  useEffect: (fn: any, deps?: any[]) => fakeUseEffect(fn, deps),
}));

const sameDeps = (a?: any[], b?: any[]) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Mount a hook; returns a handle that can re-render with new args or unmount. */
function renderHook<A, R>(hook: (arg: A) => R, initialArg: A) {
  const h: Harness = {
    stateSlots: [], stateIdx: 0, effectSlots: [], effectIdx: 0,
    pending: [], result: undefined, flush: () => {}, busy: false, dirty: false,
  };
  let arg = initialArg;

  h.flush = () => {
    h.busy = true;
    do {
      h.dirty = false;
      h.stateIdx = 0;
      h.effectIdx = 0;
      h.pending = [];
      const prev = current;
      current = h;
      h.result = hook(arg);
      current = prev;
      for (const p of h.pending) {
        const slot = h.effectSlots[p.idx];
        if (slot && sameDeps(slot.deps, p.deps)) continue;
        if (slot && typeof slot.cleanup === 'function') slot.cleanup();
        h.effectSlots[p.idx] = { deps: p.deps, cleanup: p.fn() };
      }
    } while (h.dirty);
    h.busy = false;
  };

  h.flush();
  return {
    get result() { return h.result as R; },
    rerender(next: A) { arg = next; h.flush(); },
    unmount() {
      for (const slot of h.effectSlots) {
        if (slot && typeof slot.cleanup === 'function') slot.cleanup();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fake Firestore: records every constraint so the query can be asserted.
// ---------------------------------------------------------------------------
type Constraint =
  | { kind: 'where'; field: string; op: string; value: any }
  | { kind: 'orderBy'; field: string; dir: string }
  | { kind: 'limit'; n: number };

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
}));

let lastQueryArgs: any[] = [];

vi.mock('../services/firebase', () => ({ db: { __fakeDb: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (db: any, name: string) => ({ kind: 'collection', db, name }),
  where: (field: string, op: string, value: any) => ({ kind: 'where', field, op, value }),
  orderBy: (field: string, dir: string) => ({ kind: 'orderBy', field, dir }),
  limit: (n: number) => ({ kind: 'limit', n }),
  query: (...args: any[]) => {
    lastQueryArgs = args;
    return { kind: 'query', args };
  },
  onSnapshot: (...args: any[]) => mocks.onSnapshot(...args),
}));

import { useMySecondChanceOffers } from './useMySecondChanceOffers';
import { SECOND_CHANCE_PENDING_STATUSES } from '../utils/secondChanceOffer';
import { PLACEHOLDER_MEDIA } from '../utils/auctionDocMap';

const UID = 'runner-up-7';

/** The doc shape Firestore hands the mapper. */
const fakeDoc = (id: string, data: any) => ({ id, data: () => data });

const constraints = (): Constraint[] => lastQueryArgs.filter((a) => a && a.kind !== 'collection');
const collectionArg = () => lastQueryArgs.find((a) => a && a.kind === 'collection');
const wheres = () => constraints().filter((c): c is Extract<Constraint, { kind: 'where' }> => c.kind === 'where');

/** Push a snapshot through the listener the hook registered. */
const emit = (docs: any[]) => {
  const next = mocks.onSnapshot.mock.calls[mocks.onSnapshot.mock.calls.length - 1][1];
  next({ docs });
};

beforeEach(() => {
  lastQueryArgs = [];
  mocks.onSnapshot.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.onSnapshot.mockImplementation(() => mocks.unsubscribe);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMySecondChanceOffers — the query', () => {
  it('reads the auctions collection', () => {
    renderHook(useMySecondChanceOffers, UID);
    expect(collectionArg()).toMatchObject({ name: 'auctions', db: { __fakeDb: true } });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('filters on the signed-in user as the OFFER\'s bidder', () => {
    renderHook(useMySecondChanceOffers, UID);
    expect(wheres()).toContainEqual({
      kind: 'where', field: 'secondChanceOffer.bidderId', op: '==', value: UID,
    });
  });

  /**
   * MUTANT GUARD — deleting this filter lets terminal offers occupy the 20-doc
   * cap forever, so a user with 20 historical offers never sees their 21st.
   * Asserted against the shared constant, never a re-typed literal, so the
   * query and `secondChanceOfferIsLive` cannot drift apart.
   */
  it('constrains status to the pending set, using the shared constant', () => {
    renderHook(useMySecondChanceOffers, UID);
    const statusFilter = wheres().find((w) => w.field === 'secondChanceOffer.status');
    expect(statusFilter).toBeDefined();
    expect(statusFilter!.op).toBe('in');
    // `toBe`, not `toEqual`: a re-typed literal ['pending_seller','pending_buyer']
    // is structurally identical and would pass toEqual, which is exactly the
    // drift this test is named for. Identity is what makes the claim true.
    expect(statusFilter!.value).toBe(SECOND_CHANCE_PENDING_STATUSES);
    // Terminal statuses must never be queryable through this hook.
    for (const dead of ['confirmed', 'declined', 'expired']) {
      expect(statusFilter!.value).not.toContain(dead);
    }
  });

  /**
   * MUTANT GUARD — the load-bearing one. An EXPIRED offer keeps its `pending_*`
   * status forever (nothing sweeps it; only a relist rewrites it to 'expired'),
   * so the status filter alone does not stop 20 stale offers from pushing out a
   * live one. Newest-first is what guarantees a fresh offer is inside the cap.
   */
  it('orders by the offer\'s openedAt, newest first', () => {
    renderHook(useMySecondChanceOffers, UID);
    expect(constraints()).toContainEqual({
      kind: 'orderBy', field: 'secondChanceOffer.openedAt', dir: 'desc',
    });
  });

  it('caps the read', () => {
    renderHook(useMySecondChanceOffers, UID);
    expect(constraints()).toContainEqual({ kind: 'limit', n: 20 });
  });
});

describe('useMySecondChanceOffers — the snapshot mapper', () => {
  it('carries the offer through with the fields the card reads', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    const offer = { status: 'pending_buyer', bidderId: UID, amount: 100 };
    emit([fakeDoc('lot-1', {
      title: 'ساعة', sellerId: 'seller-1', thumbnailUrl: 'https://cdn/x.jpg',
      secondChanceOffer: offer,
    })]);
    expect(h.result).toEqual([{
      id: 'lot-1',
      title: 'ساعة',
      sellerId: 'seller-1',
      thumbnailUrl: 'https://cdn/x.jpg',
      secondChanceOffer: offer,
      isSimulated: false,
    }]);
  });

  /**
   * MUTANT GUARD — `??` does not fall through on an empty string, so a doc with
   * `thumbnailUrl: ''` and a real `imageUrl` would render nothing.
   */
  it('falls through an EMPTY thumbnailUrl to imageUrl', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-2', { thumbnailUrl: '', imageUrl: 'https://cdn/fallback.jpg' })]);
    expect(h.result[0].thumbnailUrl).toBe('https://cdn/fallback.jpg');
  });

  /**
   * MUTANT GUARD — a stale `blob:` URL renders a broken <img> on a
   * customer-facing card. `mapAuctionDocFull` guards against it and so must this.
   */
  it('replaces a stale blob: URL with the bundled poster', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-3', { thumbnailUrl: 'blob:http://localhost/abc-123' })]);
    expect(h.result[0].thumbnailUrl).toBe(PLACEHOLDER_MEDIA);
    expect(h.result[0].thumbnailUrl).not.toContain('blob:');
  });

  it('replaces a blob: imageUrl too, not just a blob: thumbnailUrl', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-4', { thumbnailUrl: '', imageUrl: 'blob:http://localhost/def' })]);
    expect(h.result[0].thumbnailUrl).toBe(PLACEHOLDER_MEDIA);
  });

  it('gives an imageless doc the bundled poster', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-5', { title: 'no media' })]);
    expect(h.result[0].thumbnailUrl).toBe(PLACEHOLDER_MEDIA);
  });

  it('defaults a missing title and sellerId to empty strings, never undefined', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-6', {})]);
    expect(h.result[0].title).toBe('');
    expect(h.result[0].sellerId).toBe('');
  });

  it('marks simulated lots so the caller can filter them', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('sim', { isSimulated: true }), fakeDoc('real', { isSimulated: false })]);
    expect(h.result.map((l: any) => l.isSimulated)).toEqual([true, false]);
  });

  it('an empty snapshot yields an empty list', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-7', {})]);
    expect(h.result).toHaveLength(1);
    emit([]);
    expect(h.result).toEqual([]);
  });
});

describe('useMySecondChanceOffers — lifecycle', () => {
  it('subscribes nothing and returns empty when signed out', () => {
    for (const uid of [null, undefined, '']) {
      lastQueryArgs = [];
      mocks.onSnapshot.mockClear();
      const h = renderHook(useMySecondChanceOffers, uid as any);
      expect(h.result).toEqual([]);
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    }
  });

  it('unsubscribes on unmount', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    h.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and re-subscribes when the uid changes', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
    h.rerender('someone-else');
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
    expect(wheres()).toContainEqual({
      kind: 'where', field: 'secondChanceOffer.bidderId', op: '==', value: 'someone-else',
    });
  });

  it('does not re-subscribe on a re-render with the same uid', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    h.rerender(UID);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it('clears the list when the user signs out', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-8', {})]);
    expect(h.result).toHaveLength(1);
    h.rerender(null as any);
    expect(h.result).toEqual([]);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('drops a snapshot that lands after unmount', () => {
    const h = renderHook(useMySecondChanceOffers, UID);
    const next = mocks.onSnapshot.mock.calls[0][1];
    h.unmount();
    next({ docs: [fakeDoc('late', {})] });
    expect(h.result).toEqual([]);
  });

  it('keeps the previous list when the listener errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = renderHook(useMySecondChanceOffers, UID);
    emit([fakeDoc('lot-9', {})]);
    expect(h.result).toHaveLength(1);
    mocks.onSnapshot.mock.calls[0][2](new Error('permission denied'));
    expect(h.result).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
  });
});
