/**
 * F1, second half — the optimistic hide must actually roll back.
 *
 * `listingDecisionResult.test.tsx` pins what the context functions RESOLVE TO.
 * This pins what `useAdminAction` DOES with that, closing the loop: a write that
 * reports failure has to put the row back on screen.
 *
 * The second test is a characterisation of the bug itself. The old context
 * shape — `updateDoc(...).then().catch()`, unreturned — resolved `undefined`
 * on a rejected write, which `run` reads as success. The row then stayed hidden
 * for the rest of the session and `pruneHidden` kept it that way, because the
 * lot was still live in the queue. Nothing about the state machine was wrong;
 * it was being told the write had succeeded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal synchronous hook runtime. `useAdminAction` uses only useState,
// useRef and useCallback, so re-invoking it with the cursor reset is a faithful
// re-render — which is how a node-only suite (no jsdom, no @testing-library)
// can still exercise the REAL hook rather than a copy of its logic.
const slots: any[] = [];
let cursor = 0;

vi.mock('react', () => ({
  useState: (init: any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init;
    return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
  },
  useRef: (init: any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  useCallback: (fn: any) => fn,
}));

import { useAdminAction } from './useAdminAction';

const render = () => { cursor = 0; return useAdminAction(); };
const ROW = 'approve_listing:lot-1';

describe('a listing write that reports failure un-hides its row', () => {
  beforeEach(() => { slots.length = 0; cursor = 0; });

  it('hides on click and puts the row back on { success: false }', async () => {
    const hook = render();
    let settle!: (v: any) => void;
    const inFlight = hook.run({
      actionId: ROW, rowId: ROW, optimism: 'reversible',
      fn: () => new Promise((res) => { settle = res; }),
    });

    // Optimistic: gone from the queue before the server answers.
    expect(render().state.hidden.has(ROW)).toBe(true);
    expect(render().isPending(ROW)).toBe(true);

    settle({ success: false });     // exactly what the fixed context resolves to
    const result = await inFlight;

    expect(result.ok).toBe(false);
    expect(result.suppressed).toBeUndefined();
    expect(render().state.hidden.has(ROW)).toBe(false);   // the lot is back
    expect(render().isPending(ROW)).toBe(false);
  });

  it('keeps the hide on success, for pruneHidden to clear', async () => {
    const hook = render();
    const result = await hook.run({
      actionId: ROW, rowId: ROW, optimism: 'reversible', fn: async () => ({ success: true }),
    });
    expect(result.ok).toBe(true);
    // Deliberate: clearing here would flash the row back for one frame.
    expect(render().state.hidden.has(ROW)).toBe(true);
    expect(render().isPending(ROW)).toBe(false);
  });

  it('CHARACTERISATION — resolving `undefined` reads as success and strands the row', async () => {
    const hook = render();
    // The pre-fix context shape: the rejection was caught and logged inside, and
    // the promise resolved to undefined regardless.
    const result = await hook.run({
      actionId: ROW, rowId: ROW, optimism: 'reversible',
      fn: async () => { try { throw new Error('permission-denied'); } catch { /* swallowed */ } },
    });
    expect(result.ok).toBe(true);                          // the lie
    expect(render().state.hidden.has(ROW)).toBe(true);     // and the lot is gone
  });
});
