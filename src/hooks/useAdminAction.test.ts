import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guards for the hook behind all eleven Action Center buttons.
 *
 * HOW IT RUNS UNDER `environment: 'node'`. Same technique as
 * `src/hooks/useMySecondChanceOffers.test.ts`: there is no jsdom and no
 * @testing-library here, so `react` is mocked at the module boundary with a
 * minimal `useState`/`useCallback`/`useRef` and the REAL hook body executes
 * against it. `../utils/adminActionState` is NOT mocked — the state machine
 * under the hook is the real one. Vitest's per-file isolation contains the
 * react mock.
 *
 * `render()` re-runs the hook body with the cursor reset, which is how a
 * re-render is simulated: `useState` hands back the live slot value and
 * `useRef` hands back the SAME ref object, so the in-flight guard survives a
 * render exactly as it does in React.
 *
 * `useCallback` is deps-aware, following `useMySecondChanceOffers.test.ts`,
 * which tracks dependency arrays the same way. That is what lets the identity
 * tests below be real behavioural tests rather than a code-review promise.
 */

let hookState: any[] = [];
let cursor = 0;
vi.mock('react', () => ({
  useState: (init: any) => {
    const i = cursor++;
    if (hookState.length <= i) hookState[i] = typeof init === 'function' ? init() : init;
    return [hookState[i], (v: any) => { hookState[i] = typeof v === 'function' ? v(hookState[i]) : v; }];
  },
  useCallback: (fn: any, deps: any[]) => {
    const i = cursor++;
    const prev = hookState[i];
    if (prev && prev.deps.length === (deps || []).length
        && prev.deps.every((d: any, k: number) => Object.is(d, deps[k]))) return prev.fn;
    hookState[i] = { fn, deps: deps || [] };
    return fn;
  },
  useRef: (init: any) => {
    const i = cursor++;
    if (hookState.length <= i) hookState[i] = { current: init };
    return hookState[i];
  },
}));

const render = async () => {
  cursor = 0;
  const { useAdminAction } = await import('./useAdminAction');
  return useAdminAction();
};

beforeEach(() => { hookState = []; cursor = 0; vi.resetModules(); });

describe('useAdminAction.run', () => {
  it('marks pending immediately, before the async fn settles', async () => {
    const h = await render();
    let seenDuring = false;
    const p = h.run({
      actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible',
      fn: async () => { seenDuring = (await render()).isPending('a1'); return { success: true }; },
    });
    await p;
    expect(seenDuring).toBe(true);
  });

  it('treats a thrown error as failure', async () => {
    const h = await render();
    const r = await h.run({
      actionId: 'a1', rowId: 'r', optimism: 'reversible',
      fn: async () => { throw new Error('boom'); },
    });
    expect(r.ok).toBe(false);
  });

  it('treats a returned {success:false} as failure — the wrappers do NOT throw', async () => {
    // AppContext callables return {success:false, message} instead of throwing.
    // The Second Chance card shipped a bug in exactly this gap.
    const h = await render();
    const r = await h.run({
      actionId: 'a1', rowId: 'r', optimism: 'reversible',
      fn: async () => ({ success: false, message: 'nope' }),
    });
    expect(r.ok).toBe(false);
  });

  it('treats undefined (a void handler) as success', async () => {
    const h = await render();
    const r = await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: async () => undefined });
    expect(r.ok).toBe(true);
  });

  it('ignores a second call while the first is in flight', async () => {
    const h = await render();
    let calls = 0;
    const fn = async () => { calls++; return { success: true }; };
    await Promise.all([
      h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn }),
      h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn }),
    ]);
    expect(calls).toBe(1);
  });

  it('clears pending even when the fn throws', async () => {
    const h = await render();
    await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: async () => { throw new Error('x'); } });
    expect((await render()).isPending('a1')).toBe(false);
  });

  /**
   * MUTANT GUARD — dropping `inFlight.current.delete` from the `finally` leaves
   * the ref permanently occupied, which is a button that works exactly once and
   * is dead for the rest of the session. Nothing above catches it: the state
   * pending flag still clears, so `isPending` reads false while the gate stays
   * shut. Only a SECOND sequential call proves the gate reopened.
   */
  it('allows the same action to run again once the first has settled', async () => {
    const h = await render();
    let calls = 0;
    const fn = async () => { calls++; return { success: true }; };
    await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn });
    await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn });
    expect(calls).toBe(2);
  });

  it('reopens the gate after a failure too, so a failed action can be retried', async () => {
    const h = await render();
    let calls = 0;
    const fn = async () => { calls++; throw new Error('cold start'); };
    await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn });
    await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn });
    expect(calls).toBe(2);
  });

  it('reports the failure message from a {success:false} return', async () => {
    const h = await render();
    const r = await h.run({
      actionId: 'a1', rowId: 'r', optimism: 'reversible',
      fn: async () => ({ success: false, message: 'nope' }),
    });
    expect(r.error).toBe('nope');
  });

  it('a truthy non-object return is a success, not a failure', async () => {
    const h = await render();
    const r = await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: async () => 'done' });
    expect(r.ok).toBe(true);
  });

  /**
   * MUTANT GUARD — the spinner itself. `pending` must live in RENDER STATE, not
   * in the ref. Move it into `inFlight.current` and every other test in this
   * file still passes, because `render()` here is driven manually and cannot
   * observe "React re-rendered". In real React that mutant makes a `confirmed`
   * action call `setState(prev => prev)` — no state change, no re-render, and
   * therefore NO SPINNER on any of the six money buttons, which is the entire
   * regression this feature exists to fix. Asserting the state object directly
   * is what closes the gap; going through `isPending` cannot.
   */
  it('puts pending in RENDER STATE for a confirmed action (so React re-renders)', async () => {
    const h = await render();
    h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: () => new Promise(() => {}) });
    expect((await render()).state.pending.has('a1')).toBe(true);
  });

  it('puts pending in RENDER STATE for a reversible action too', async () => {
    const h = await render();
    h.run({ actionId: 'a1', rowId: 'r', optimism: 'reversible', fn: () => new Promise(() => {}) });
    expect((await render()).state.pending.has('a1')).toBe(true);
  });

  /**
   * MUTANT GUARD — a suppressed double-click is NOT a failure. The obvious Task
   * 4 call site is `if (!r.ok) toast(r.error)`, which would show an
   * Arabic-speaking admin the literal string `already-in-flight`. `suppressed`
   * is the structural discriminator so the call site branches on shape, never
   * on a magic string.
   */
  it('flags a suppressed double-click with suppressed:true, not a bare failure', async () => {
    const h = await render();
    const first = h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: () => new Promise(() => {}) });
    void first;
    const second = await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: async () => ({ success: true }) });
    expect(second.ok).toBe(false);
    expect(second.suppressed).toBe(true);
  });

  it('does NOT flag a real failure as suppressed', async () => {
    const h = await render();
    for (const fn of [async () => { throw new Error('boom'); }, async () => ({ success: false, message: 'nope' })]) {
      const r = await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn });
      expect(r.ok).toBe(false);
      expect(r.suppressed).toBeFalsy();
    }
  });

  it('does NOT flag a success as suppressed', async () => {
    const h = await render();
    const r = await h.run({ actionId: 'a1', rowId: 'r', optimism: 'confirmed', fn: async () => ({ success: true }) });
    expect(r.suppressed).toBeFalsy();
  });
});

/**
 * Task 4 puts `prune` in a snapshot effect's dependency list. An unstable
 * identity re-fires that effect on every render. Task 1's same-object contract
 * means `pruneHidden` returns `prev` when nothing changed, so React's Object.is
 * bailout converges it — wasteful, not an infinite loop. But that is TWO
 * modules holding ONE invariant between them: if `pruneHidden` ever regressed
 * to always allocating, an unstable `prune` would become unbounded. Pin the
 * identity here so the coupling does not rest on a promise.
 */
describe('useAdminAction — referential stability', () => {
  it('keeps the same `prune` identity across renders', async () => {
    const a = await render();
    const b = await render();
    expect(b.prune).toBe(a.prune);
  });

  it('keeps the same `run` identity across renders', async () => {
    const a = await render();
    const b = await render();
    expect(b.run).toBe(a.run);
  });

  it('keeps both stable across a render caused by a real state change', async () => {
    const a = await render();
    await a.run({ actionId: 'a1', rowId: 'row-1', optimism: 'reversible', fn: async () => ({ success: true }) });
    const b = await render();
    expect(b.state).not.toBe(a.state);   // state really did change
    expect(b.run).toBe(a.run);
    expect(b.prune).toBe(a.prune);
  });
});

describe('useAdminAction — optimistic hide', () => {
  it('hides the row for a reversible action and keeps it hidden on success', async () => {
    const h = await render();
    await h.run({ actionId: 'a1', rowId: 'row-1', optimism: 'reversible', fn: async () => ({ success: true }) });
    // The hide OUTLIVES the settle on purpose — clearing it here would flash the
    // row back until the next Firestore snapshot arrives.
    expect((await render()).state.hidden.has('row-1')).toBe(true);
  });

  it('does NOT hide the row for a confirmed action', async () => {
    const h = await render();
    await h.run({ actionId: 'a1', rowId: 'row-1', optimism: 'confirmed', fn: async () => ({ success: true }) });
    expect((await render()).state.hidden.has('row-1')).toBe(false);
  });

  it('rolls the hide back when the fn returns {success:false}', async () => {
    const h = await render();
    await h.run({
      actionId: 'a1', rowId: 'row-1', optimism: 'reversible',
      fn: async () => ({ success: false, message: 'denied' }),
    });
    expect((await render()).state.hidden.has('row-1')).toBe(false);
  });

  it('rolls the hide back when the fn throws', async () => {
    const h = await render();
    await h.run({
      actionId: 'a1', rowId: 'row-1', optimism: 'reversible',
      fn: async () => { throw new Error('boom'); },
    });
    expect((await render()).state.hidden.has('row-1')).toBe(false);
  });
});

describe('useAdminAction.prune', () => {
  it('drops a hidden id once the live queue no longer contains it', async () => {
    const h = await render();
    await h.run({ actionId: 'a1', rowId: 'row-1', optimism: 'reversible', fn: async () => ({ success: true }) });
    expect((await render()).state.hidden.has('row-1')).toBe(true);
    h.prune([]);
    expect((await render()).state.hidden.size).toBe(0);
  });

  it('keeps a hidden id that is still in the live queue', async () => {
    const h = await render();
    await h.run({ actionId: 'a1', rowId: 'row-1', optimism: 'reversible', fn: async () => ({ success: true }) });
    h.prune([{ id: 'row-1' } as any]);
    expect((await render()).state.hidden.has('row-1')).toBe(true);
  });

  /**
   * Task 4 calls `prune` on EVERY Firestore snapshot, including snapshots that
   * land while a button is mid-flight. If prune touched `pending` the spinner
   * would blink off under the user's finger.
   */
  it('leaves an in-flight action pending', async () => {
    const h = await render();
    let release: (v: any) => void = () => {};
    const gate = new Promise((res) => { release = res; });
    const p = h.run({ actionId: 'a1', rowId: 'row-1', optimism: 'reversible', fn: () => gate });
    expect((await render()).isPending('a1')).toBe(true);
    h.prune([]);
    expect((await render()).isPending('a1')).toBe(true);
    release({ success: true });
    await p;
    expect((await render()).isPending('a1')).toBe(false);
  });
});
