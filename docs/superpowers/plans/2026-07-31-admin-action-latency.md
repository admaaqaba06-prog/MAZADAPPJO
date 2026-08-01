# Admin Action Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Action Center button respond instantly, and stop the six admin callables cold-starting at ~2s.

**Architecture:** A scheduled `warmAdminCallables` pings six callables every 5 minutes through a `__warm` short-circuit placed above each function's auth check. On the client, one `useAdminAction` hook gives all eleven handlers an immediate pending state; only listing approve/reject additionally hide their row optimistically. All branching lives in a pure `src/utils/adminActionState.ts`.

**Tech Stack:** Firebase Cloud Functions v1 (CommonJS, firebase-functions v4), React 19 + TypeScript, Vitest (`environment: 'node'`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-31-admin-action-latency-design.md`. Read it before Task 1.
- **Vitest is `environment: 'node'` — no jsdom, no `@testing-library`.** Component rendering tests are impossible. Extract logic to `src/utils/*` and test that. Source-text assertions are the house idiom for wiring (`functions/secondChanceCallable.test.js`, `src/components/order/SecondChanceCard.wiring.test.ts`).
- **`vi.mock` cannot intercept `require()` inside `functions/*.js` from an ESM test.** Use dependency injection, as `functions/secondChanceRespond.js` does.
- **`npm run lint` is `tsc --noEmit` and currently exits 0 with NO output.** CI fails on new errors. Note it is weak here: `@types/react` is absent and `tsconfig` sets no `strict`, so `useApp()` is `any` and call-site mistakes do NOT typecheck. Rely on wiring tests, not the compiler.
- **Money actions are never optimistic.** `'reversible'` is permitted at exactly two call sites: `onApproveListing` and `onRejectListing`. Everything else is `'confirmed'`.
- **Never push to main.** Branch → PR → squash-merge. Merging to main IS the functions deploy.
- **Arabic-primary UI**, existing `isAr ? 'ar' : 'en'` idiom. Western digits via `formatNumeral`.
- Baseline before starting: `npx vitest run` → **1726 passing / 124 files**.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/adminActionState.ts` **(new)** | Pure state machine: pending set, optimistic-hide set, double-click suppression, rollback. No React. |
| `src/utils/adminActionState.test.ts` **(new)** | Every branch above. |
| `src/hooks/useAdminAction.ts` **(new)** | Thin React wrapper holding the pure state and running the async fn. |
| `src/hooks/useAdminAction.test.ts` **(new)** | Behavioural, via the module-boundary + `react` harness idiom from `src/hooks/useMySecondChanceOffers.test.ts`. |
| `functions/warmTargets.js` **(new)** | The six target names + URL builder. Pure. |
| `functions/warmTargets.test.js` **(new)** | Pins the list AND that each target's `__warm` line sits above its auth check. |
| `functions/index.js` | Six one-line `__warm` short-circuits + the `warmAdminCallables` scheduled function. |
| `src/components/AdminDashboardView.tsx` | Wire the hook; filter the queue through `hidden`. |
| `src/components/admin/ActionCenterSection.tsx` | Pass `pending` down to the cards. |

---

### Task 1: Pure action state

**Files:**
- Create: `src/utils/adminActionState.ts`
- Test: `src/utils/adminActionState.test.ts`

**Interfaces:**
- Consumes: `ActionRow` from `src/utils/actionQueue.ts` (`{ id: string; kind: ActionKind; entityId: string; … }`, where `id` is `` `${kind}:${entityId}` ``).
- Produces: `AdminActionState`, `EMPTY_ADMIN_ACTION_STATE`, `beginAction`, `settleAction`, `pruneHidden`, `isActionPending`, `visibleRows`, `ActionOptimism`.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/adminActionState.test.ts
import { describe, it, expect } from 'vitest';
import {
  EMPTY_ADMIN_ACTION_STATE, beginAction, settleAction, pruneHidden,
  isActionPending, visibleRows,
} from './adminActionState';

const row = (id: string) => ({
  id, kind: 'approve_listing' as const, entityId: id.split(':')[1] ?? id,
  reason: 'listing_pending' as any, waitingSinceMs: 0, severity: 'new' as const,
  label: { ar: '', en: '' },
});

describe('beginAction', () => {
  it('marks the action pending', () => {
    const s = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'confirmed' });
    expect(isActionPending(s, 'a1')).toBe(true);
  });

  it('hides the row only for reversible actions', () => {
    const rev = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    expect(rev.hidden.has('approve_listing:x')).toBe(true);

    const conf = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a2', rowId: 'payout:y', optimism: 'confirmed' });
    expect(conf.hidden.has('payout:y')).toBe(false);
  });

  it('returns the SAME object when already pending, so a double click is a no-op', () => {
    const first = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'r', optimism: 'reversible' });
    expect(beginAction(first, { actionId: 'a1', rowId: 'r', optimism: 'reversible' })).toBe(first);
  });
});

describe('settleAction', () => {
  it('clears pending on success and KEEPS the row hidden until the listener catches up', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = settleAction(s1, { actionId: 'a1', rowId: 'approve_listing:x', ok: true });
    expect(isActionPending(s2, 'a1')).toBe(false);
    expect(s2.hidden.has('approve_listing:x')).toBe(true);
  });

  it('ROLLS BACK the hide on failure — the row must come back', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = settleAction(s1, { actionId: 'a1', rowId: 'approve_listing:x', ok: false });
    expect(isActionPending(s2, 'a1')).toBe(false);
    expect(s2.hidden.has('approve_listing:x')).toBe(false);
  });

  it('clears pending for a confirmed action either way', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'p1', rowId: 'payout:y', optimism: 'confirmed' });
    for (const ok of [true, false]) {
      expect(isActionPending(settleAction(s1, { actionId: 'p1', rowId: 'payout:y', ok }), 'p1')).toBe(false);
    }
  });
});

describe('pruneHidden', () => {
  it('forgets a hidden id once the real queue no longer contains it', () => {
    // The write landed and the listener dropped the row: the hide has done its
    // job and must not linger, or a re-created row would be invisible.
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = pruneHidden(s1, []);
    expect(s2.hidden.size).toBe(0);
  });

  it('keeps a hidden id while the row is still present', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    expect(pruneHidden(s1, [row('approve_listing:x')]).hidden.has('approve_listing:x')).toBe(true);
  });

  it('returns the SAME object when nothing changed, so React does not re-render', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    expect(pruneHidden(s1, [row('approve_listing:x')])).toBe(s1);
    expect(pruneHidden(EMPTY_ADMIN_ACTION_STATE, [])).toBe(EMPTY_ADMIN_ACTION_STATE);
  });
});

describe('visibleRows', () => {
  it('drops hidden rows and keeps the rest in order', () => {
    const rows = [row('approve_listing:a'), row('payout:b'), row('approve_listing:c')];
    const s = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'x', rowId: 'payout:b', optimism: 'reversible' });
    expect(visibleRows(rows, s).map(r => r.id)).toEqual(['approve_listing:a', 'approve_listing:c']);
  });

  it('returns the SAME array when nothing is hidden', () => {
    const rows = [row('approve_listing:a')];
    expect(visibleRows(rows, EMPTY_ADMIN_ACTION_STATE)).toBe(rows);
  });

  it('never throws on junk', () => {
    expect(visibleRows([], EMPTY_ADMIN_ACTION_STATE)).toEqual([]);
    expect(visibleRows(undefined as any, EMPTY_ADMIN_ACTION_STATE)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/adminActionState.test.ts`
Expected: FAIL — `Failed to resolve import "./adminActionState"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/adminActionState.ts
/**
 * In-flight state for Action Center buttons.
 *
 * Two problems, one store. `pending` answers "did my click register?" — the
 * complaint that started this, since AdminDashboardView had no busy state at
 * all and a callable can cold-start for ~2s. `hidden` is the optimistic half,
 * and it is deliberately narrow: only listing approve/reject may use it,
 * because they are the only actions that move no money AND have no server
 * round-trip to warm. See the design spec's classification section.
 *
 * Pure and immutable: every mutator returns a NEW object when something
 * changed and the SAME object when nothing did, so React re-renders exactly
 * when it should.
 */
import type { ActionRow } from './actionQueue';

/** `'reversible'` is permitted at exactly two call sites. Everything else waits. */
export type ActionOptimism = 'reversible' | 'confirmed';

export interface AdminActionState {
  /** Action ids currently in flight. */
  pending: ReadonlySet<string>;
  /** `ActionRow.id`s optimistically removed from the queue. */
  hidden: ReadonlySet<string>;
}

export const EMPTY_ADMIN_ACTION_STATE: AdminActionState = Object.freeze({
  pending: new Set<string>(),
  hidden: new Set<string>(),
});

export function isActionPending(state: AdminActionState, actionId: string): boolean {
  return state.pending.has(actionId);
}

export function beginAction(
  state: AdminActionState,
  input: { actionId: string; rowId: string; optimism: ActionOptimism },
): AdminActionState {
  const { actionId, rowId, optimism } = input;
  // Double-click suppression lives HERE, not on the button's disabled prop —
  // a disabled attribute is a race, a state check is not.
  if (state.pending.has(actionId)) return state;

  const pending = new Set(state.pending);
  pending.add(actionId);

  const hidden = optimism === 'reversible' && rowId
    ? new Set(state.hidden).add(rowId)
    : state.hidden;

  return { pending, hidden };
}

export function settleAction(
  state: AdminActionState,
  input: { actionId: string; rowId: string; ok: boolean },
): AdminActionState {
  const { actionId, rowId, ok } = input;
  const pending = new Set(state.pending);
  pending.delete(actionId);

  let hidden = state.hidden;
  if (!ok && rowId && hidden.has(rowId)) {
    // Rollback: the write failed, so the row must reappear.
    const next = new Set(hidden);
    next.delete(rowId);
    hidden = next;
  }
  // On success the hide STAYS until pruneHidden sees the listener drop the row.
  // Clearing it here would flash the row back for one frame.
  return { pending, hidden };
}

export function pruneHidden(state: AdminActionState, rows: readonly ActionRow[]): AdminActionState {
  if (state.hidden.size === 0) return state;
  const live = new Set((rows || []).map(r => r.id));
  let changed = false;
  const hidden = new Set<string>();
  for (const id of state.hidden) {
    if (live.has(id)) hidden.add(id); else changed = true;
  }
  return changed ? { pending: state.pending, hidden } : state;
}

export function visibleRows(rows: readonly ActionRow[], state: AdminActionState): ActionRow[] {
  if (!rows) return [];
  if (state.hidden.size === 0) return rows as ActionRow[];
  return rows.filter(r => !state.hidden.has(r.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/adminActionState.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Verify the tests are not vacuous**

Break each of these, confirm a test fails, restore. Report the table in your report file.

| mutant | expected |
|---|---|
| `beginAction` hides on `'confirmed'` too | FAIL |
| `beginAction` drops the already-pending guard | FAIL |
| `settleAction` clears `hidden` on `ok: true` | FAIL |
| `settleAction` does NOT roll back on `ok: false` | FAIL |
| `pruneHidden` returns a new object when unchanged | FAIL |
| `visibleRows` ignores `hidden` | FAIL |

- [ ] **Step 6: Commit**

```bash
git add src/utils/adminActionState.ts src/utils/adminActionState.test.ts
git commit -m "feat(admin): pure in-flight state for action buttons"
```

---

### Task 2: The `useAdminAction` hook

**Files:**
- Create: `src/hooks/useAdminAction.ts`
- Test: `src/hooks/useAdminAction.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `useAdminAction()` returning `{ run, isPending, state, prune }` where
  `run(input: { actionId: string; rowId: string; optimism: ActionOptimism; fn: () => Promise<any> }) => Promise<{ ok: boolean; error?: any }>`.

- [ ] **Step 1: Write the failing test**

Follow `src/hooks/useMySecondChanceOffers.test.ts` exactly for the harness: mock `react` at the module boundary with a minimal `useState`/`useCallback`/`useRef` so the REAL hook body executes. Vitest's per-file isolation contains the mock.

```ts
// src/hooks/useAdminAction.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let hookState: any[] = [];
let cursor = 0;
vi.mock('react', () => ({
  useState: (init: any) => {
    const i = cursor++;
    if (hookState.length <= i) hookState[i] = typeof init === 'function' ? init() : init;
    return [hookState[i], (v: any) => { hookState[i] = typeof v === 'function' ? v(hookState[i]) : v; }];
  },
  useCallback: (fn: any) => fn,
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useAdminAction.test.ts`
Expected: FAIL — cannot resolve `./useAdminAction`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useAdminAction.ts
/**
 * One hook behind every Action Center button, so eleven call sites cannot
 * drift into eleven behaviours.
 *
 * The `optimism` argument is the safety property: `'reversible'` is permitted
 * at exactly two call sites (listing approve/reject). See the design spec.
 */
import { useState, useCallback, useRef } from 'react';
import {
  EMPTY_ADMIN_ACTION_STATE, beginAction, settleAction, pruneHidden,
  isActionPending, type AdminActionState, type ActionOptimism,
} from '../utils/adminActionState';
import type { ActionRow } from '../utils/actionQueue';

export interface RunAdminAction {
  actionId: string;
  rowId: string;
  optimism: ActionOptimism;
  fn: () => Promise<any> | any;
}

export function useAdminAction() {
  const [state, setState] = useState<AdminActionState>(EMPTY_ADMIN_ACTION_STATE);

  // The double-click guard has to be SYNCHRONOUS. React 18 gives no guarantee
  // that a functional setState updater has run by the time the next statement
  // executes, so a flag assigned inside the updater can still read stale — two
  // fast clicks would both pass the check and fire the callable twice. A ref is
  // written and read in the same tick, so it cannot. `state` remains the render
  // source; the ref is only the gate.
  const inFlight = useRef<Set<string>>(new Set());

  const run = useCallback(async (input: RunAdminAction): Promise<{ ok: boolean; error?: any }> => {
    const { actionId, rowId, optimism, fn } = input;

    if (inFlight.current.has(actionId)) return { ok: false, error: 'already-in-flight' };
    inFlight.current.add(actionId);
    setState(prev => beginAction(prev, { actionId, rowId, optimism }));

    let ok = true;
    let error: any;
    try {
      const res = await fn();
      // The callable wrappers RETURN {success:false} rather than throwing.
      if (res && typeof res === 'object' && (res as any).success === false) {
        ok = false;
        error = (res as any).message;
      }
    } catch (e) {
      ok = false;
      error = e;
    } finally {
      inFlight.current.delete(actionId);
      setState(prev => settleAction(prev, { actionId, rowId, ok }));
    }
    return ok ? { ok } : { ok, error };
  }, []);

  const prune = useCallback((rows: readonly ActionRow[]) => {
    setState(prev => pruneHidden(prev, rows));
  }, []);

  return {
    run,
    prune,
    state,
    isPending: (actionId: string) => isActionPending(state, actionId),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useAdminAction.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify with mutants**

Break, run, restore. Report the table.

| mutant | expected |
|---|---|
| `run` sets pending AFTER awaiting `fn` | FAIL |
| the `{success:false}` branch removed | FAIL |
| the `inFlight` ref guard removed | FAIL |
| the guard reads `state.pending` instead of the ref (the React 18 race) | FAIL under concurrent clicks |
| `settleAction` moved out of `finally` | FAIL (the throw case) |

- [ ] **Step 6: Run the full suite and commit**

```bash
npx vitest run && npm run build && npm run lint
git add src/hooks/useAdminAction.ts src/hooks/useAdminAction.test.ts
git commit -m "feat(admin): useAdminAction — one in-flight hook for every action button"
```

---

### Task 3: The server warmer

**Files:**
- Create: `functions/warmTargets.js`, `functions/warmTargets.test.js`
- Modify: `functions/index.js` — six `__warm` short-circuits + the scheduled function

**Interfaces:**
- Produces: `WARM_TARGETS` (string[]), `warmUrl(name, projectId, region)`.

- [ ] **Step 1: Write the failing test**

```js
// functions/warmTargets.test.js
// The warmer is invisible when it breaks: a function silently dropped from the
// target list just goes back to 2-second cold starts with nothing failing. So
// the list and the short-circuit placement are both pinned.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WARM_TARGETS, warmUrl } from './warmTargets.js';

const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

describe('WARM_TARGETS', () => {
  it('lists exactly the six admin callables behind Action Center buttons', () => {
    expect([...WARM_TARGETS].sort()).toEqual([
      'approveSubscription', 'approveWithdrawal', 'rejectSubscription',
      'rejectWithdrawal', 'sendFulfillmentNudge', 'verifyOrderPayment',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(WARM_TARGETS)).toBe(true);
  });

  it('names only functions that actually exist', () => {
    for (const name of WARM_TARGETS) {
      expect(SRC.includes(`exports.${name} =`), name).toBe(true);
    }
  });
});

describe('every target short-circuits ABOVE its auth check', () => {
  // Below the auth check the line is useless: the ping would throw
  // `unauthenticated` and flood Cloud Logging, destroying the only signal that
  // would reveal a real unauthorised attempt.
  for (const name of WARM_TARGETS) {
    it(`${name} returns on __warm before touching context.auth`, () => {
      const start = SRC.indexOf(`exports.${name} =`);
      expect(start, `${name} not found`).toBeGreaterThan(-1);
      const next = SRC.indexOf('\nexports.', start + 1);
      const body = SRC.slice(start, next === -1 ? SRC.length : next);

      const warmAt = body.indexOf('__warm');
      const authAt = body.indexOf('context.auth');
      expect(warmAt, `${name} has no __warm short-circuit`).toBeGreaterThan(-1);
      expect(authAt, `${name} has no auth check`).toBeGreaterThan(-1);
      expect(warmAt, `${name}'s __warm sits BELOW its auth check`).toBeLessThan(authAt);
    });

    it(`${name}'s short-circuit reads and writes nothing`, () => {
      const start = SRC.indexOf(`exports.${name} =`);
      const body = SRC.slice(start, start + 400);
      const line = body.split('\n').find(l => l.includes('__warm')) || '';
      expect(line).toMatch(/return \{ warm: true \};/);
      expect(line).not.toMatch(/db\.|collection\(|transaction/);
    });
  }
});

describe('warmUrl', () => {
  it('builds the callable endpoint from project and region', () => {
    expect(warmUrl('approveWithdrawal', 'mazadjoapp', 'us-central1'))
      .toBe('https://us-central1-mazadjoapp.cloudfunctions.net/approveWithdrawal');
  });

  it('throws on an unknown target rather than pinging a typo forever', () => {
    expect(() => warmUrl('nopeNotReal', 'mazadjoapp', 'us-central1')).toThrowError(/target/i);
  });
});

describe('the scheduled warmer is wired', () => {
  it('exists, runs every 5 minutes, and iterates the shared list', () => {
    const start = SRC.indexOf('exports.warmAdminCallables');
    expect(start).toBeGreaterThan(-1);
    const body = SRC.slice(start, start + 1200);
    expect(body).toMatch(/\.schedule\('every 5 minutes'\)/);
    expect(body).toMatch(/WARM_TARGETS/);
    // A re-typed literal here would silently drift from the pinned list.
    expect(body).not.toMatch(/\['approveWithdrawal'/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/warmTargets.test.js`
Expected: FAIL — cannot resolve `./warmTargets.js`.

- [ ] **Step 3: Write `functions/warmTargets.js`**

```js
// The admin callables kept warm by `warmAdminCallables`.
//
// Measured 2026-07-31 against production: a cold admin callable takes ~2021ms
// to reject an unauthenticated call — i.e. before doing any work at all —
// against ~450ms warm. `placeBid` already carries minInstances:1 for the same
// reason (index.js:1699, load-tested 2026-07-24); this buys the same effect for
// the admin surface at roughly 1% of the cost, at the price of no guarantee.
//
// Pure: no Firestore, no network. Separate from index.js so the list is
// testable and so a target cannot be dropped without a test noticing.
const WARM_TARGETS = Object.freeze([
  'verifyOrderPayment',
  'approveSubscription',
  'rejectSubscription',
  'approveWithdrawal',
  'rejectWithdrawal',
  'sendFulfillmentNudge',
]);

function warmUrl(name, projectId, region) {
  if (!WARM_TARGETS.includes(name)) {
    throw new Error(`[warmTargets] unknown target "${name}" — add it to WARM_TARGETS or fix the typo`);
  }
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
}

module.exports = { WARM_TARGETS, warmUrl };
```

- [ ] **Step 4: Add the six short-circuits to `functions/index.js`**

For EACH of the six, insert this as the first statement inside `onCall`, immediately above the existing `if (!context.auth)` block:

```js
  // Warm-up ping from `warmAdminCallables`. Deliberately ABOVE the auth check:
  // below it the ping throws `unauthenticated` and buries real auth failures
  // under ~1,700 log lines a day. Reads nothing, writes nothing, returns
  // nothing — reachable unauthenticated by design, same amplification the
  // existing auth-rejection path already offers.
  if (data && data.__warm === true) return { warm: true };
```

Targets and their current first lines (verify each before editing — line numbers drift):
- `exports.verifyOrderPayment` (~2448)
- `exports.approveSubscription` (~2214)
- `exports.rejectSubscription` (~2274)
- `exports.approveWithdrawal` (~4908)
- `exports.rejectWithdrawal` (~5082)
- `exports.sendFulfillmentNudge` (~2481)

- [ ] **Step 5: Add the scheduled warmer to `functions/index.js`**

Place it directly after the `paymentDefaultEnforcer` block. Follow that function's declaration idiom exactly.

```js
/**
 * Keep the admin callables warm.
 *
 * The Action Center's buttons sit behind callables that cold-start at ~2s
 * (measured 2026-07-31). Admins work in bursts after idle periods, which is
 * precisely when a cold start lands. Five minutes is comfortably inside
 * Google's idle-eviction window without being chatty.
 *
 * Never throws: a warmer that breaks the function log is worse than a cold
 * start. Failures are counted and logged once, not raised.
 */
exports.warmAdminCallables = functions
  .runWith({ timeoutSeconds: 60 })
  .pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      console.warn('[warmAdminCallables] no project id in env — skipping');
      return null;
    }
    const results = await Promise.all(WARM_TARGETS.map(async (name) => {
      try {
        const res = await fetch(warmUrl(name, projectId, 'us-central1'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { __warm: true } }),
        });
        return res.ok;
      } catch (e) {
        console.warn(`[warmAdminCallables] ${name} ping failed: ${e.message}`);
        return false;
      }
    }));
    const failed = results.filter(ok => !ok).length;
    if (failed) console.warn(`[warmAdminCallables] ${failed}/${WARM_TARGETS.length} pings failed`);
    return null;
  });
```

Add the require at the top of `functions/index.js`, beside the other local requires:

```js
const { WARM_TARGETS, warmUrl } = require('./warmTargets');
```

- [ ] **Step 6: Run tests and the syntax check**

Run: `npx vitest run functions/warmTargets.test.js && node --check functions/index.js`
Expected: PASS (17 tests), syntax OK.

- [ ] **Step 7: Verify with mutants**

| mutant | expected |
|---|---|
| drop `sendFulfillmentNudge` from `WARM_TARGETS` | FAIL |
| move one `__warm` line below its auth check | FAIL |
| change the schedule to `every 30 minutes` | FAIL |
| re-type the target list inline in `warmAdminCallables` | FAIL |
| make a `__warm` line read Firestore | FAIL |

- [ ] **Step 8: Commit**

```bash
git add functions/warmTargets.js functions/warmTargets.test.js functions/index.js
git commit -m "feat(admin): warm the six admin callables on a 5-minute schedule"
```

---

### Task 4: Wire the hook into the Action Center

**Files:**
- Modify: `src/components/AdminDashboardView.tsx`, `src/components/admin/ActionCenterSection.tsx`
- Test: `src/components/admin/actionCenter.wiring.test.ts` **(new)**

**Interfaces:**
- Consumes: `useAdminAction` (Task 2), `visibleRows` (Task 1).

- [ ] **Step 1: Write the failing wiring test**

```ts
// src/components/admin/actionCenter.wiring.test.ts
// Vitest here is environment: 'node' — the component cannot be rendered, and
// `tsc` cannot help either (@types/react is absent, so useApp() is `any` and a
// wrong argument compiles). The classification is the safety property of this
// whole feature, so it is asserted against the source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const DASH = readFileSync(new URL('../AdminDashboardView.tsx', import.meta.url), 'utf8');

describe('optimism classification', () => {
  it("uses 'reversible' at EXACTLY two call sites", () => {
    // Allowlist, not denylist: a newly-added money action is 'confirmed' by
    // omission — the safe default — and widening optimism fails loudly here.
    expect((DASH.match(/optimism: *'reversible'/g) || []).length).toBe(2);
  });

  it('both of them are the listing handlers', () => {
    for (const handler of ['onApproveListing', 'onRejectListing']) {
      const at = DASH.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      expect(DASH.slice(at, at + 400)).toMatch(/optimism: *'reversible'/);
    }
  });

  it('the money handlers are never reversible', () => {
    for (const handler of [
      'onApprovePayout', 'onRejectPayout', 'onApproveOrderPayment', 'onRejectOrderPayment',
      'onApproveMembership', 'onRejectMembership', 'onResolveDispute', 'onNudge', 'onAdvance',
    ]) {
      const at = DASH.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      expect(DASH.slice(at, at + 400), handler).not.toMatch(/optimism: *'reversible'/);
    }
  });
});

describe('the queue is filtered through the optimistic state', () => {
  it('renders visibleRows, not the raw queue', () => {
    expect(DASH).toMatch(/visibleRows\(/);
  });

  it('prunes hidden ids against the live queue', () => {
    expect(DASH).toMatch(/\bprune\(/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/actionCenter.wiring.test.ts`
Expected: FAIL — `optimism: 'reversible'` appears 0 times.

- [ ] **Step 3: Wire `AdminDashboardView.tsx`**

First, the imports (add beside the existing `buildActionQueue` import at the top):

```tsx
import { useAdminAction } from '../hooks/useAdminAction';
import { visibleRows } from '../utils/adminActionState';
```

`useEffect` and `useMemo` are already imported in this file — confirm before adding.

Then, AFTER `actionQueue` is defined (a `useMemo` referencing a later `const` is a TDZ crash Vite compiles happily — this file has been bitten before):

```tsx
  const adminAction = useAdminAction();

  // Forget optimistic hides once the listener has actually dropped the row.
  useEffect(() => { adminAction.prune(actionQueue); }, [actionQueue]);

  const visibleActionQueue = useMemo(
    () => visibleRows(actionQueue, adminAction.state),
    [actionQueue, adminAction.state],
  );
```

Wrap each handler. Listing (the only two reversible):

```tsx
  onApproveListing: (auctionId: string, viewing?: ViewingMode, viewingPlace?: string) =>
    adminAction.run({
      actionId: `approve_listing:${auctionId}`,
      rowId: `approve_listing:${auctionId}`,
      optimism: 'reversible',
      fn: () => approveListing(auctionId, viewing, viewingPlace),
    }),
```

Every other handler takes the identical shape with `optimism: 'confirmed'` and its own `actionId`/`rowId` built as `` `${kind}:${entityId}` `` to match `ActionRow.id`.

Pass `visibleActionQueue` (not `actionQueue`) into `ActionCenterSection`, and pass `isPending`.

- [ ] **Step 4: Thread `pending` through `ActionCenterSection.tsx`**

Give each card `busy={isPending(rowId)}`. `ListingApprovalCard` already accepts `busy?: boolean` and gates `canApprove` on it; the other cards need the same prop added and applied to their buttons' `disabled` and label.

- [ ] **Step 5: Run tests, build, lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all pass; `tsc --noEmit` exits 0 with no output.

- [ ] **Step 6: Verify with mutants**

| mutant | expected |
|---|---|
| change one listing handler to `'confirmed'` | FAIL |
| change `onApprovePayout` to `'reversible'` | FAIL |
| render `actionQueue` instead of `visibleActionQueue` | FAIL |
| delete the `prune` effect | FAIL |

- [ ] **Step 7: Commit**

```bash
git add src/components/AdminDashboardView.tsx src/components/admin/ActionCenterSection.tsx src/components/admin/actionCenter.wiring.test.ts
git commit -m "feat(admin): instant feedback on every action button; optimistic listing approve/reject"
```

---

### Task 5: Docs, verification, PR

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Record the behaviour change in the backlog**

Note that admin callables are kept warm on a 5-minute schedule, that `__warm` is an unauthenticated no-op short-circuit by design, and that optimistic hiding is restricted to listing approve/reject.

- [ ] **Step 2: Full verification — paste the real output into the PR**

```bash
npx vitest run
npm run build
npm run lint
node --check functions/index.js
```

- [ ] **Step 3: Open the PR (do NOT merge)**

The PR body must carry the four outputs above, the mutant tables from Tasks 1–4, and this deploy note: **merging to main IS the functions deploy**; do not also deploy by hand, it collides with CI on Google's function-update quota. A large functions deploy can drop individual functions on "Quota Exceeded" while still printing `Deploy complete` — re-list and retry by name.

- [ ] **Step 4: Post-deploy measurement (MJ)**

1. After deploy, wait 10 minutes, then click an admin action cold — it should land in ~450ms, not ~2s.
2. Check Cloud Logging for `warmAdminCallables` warnings; a persistent `n/6 pings failed` means a target name is wrong.
3. Confirm NO new `unauthenticated` errors appear for the six targets — if they do, a `__warm` line is below its auth check.
4. Observe for one week. If actions still land cold, buy `minInstances: 1` for the specific offender.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Warmer, not `minInstances` | 3 |
| `__warm` above the auth check, no log flooding | 3 |
| Pending state on all eleven actions | 2, 4 |
| Optimistic hide restricted to listing approve/reject | 1, 4 |
| Money actions never optimistic (incl. nudge, dispute, advance) | 4 (allowlist assertion) |
| Handles both `{success:false}` and a throw | 2 |
| Double-click ignored at the hook | 1, 2 |
| Queue builder stays pure and untouched | 1 (filtering happens in the view) |
| Reconciliation via the listener | 1 (`pruneHidden`), 4 (effect) |
| Warmer target list pinned | 3 |

**Notes for the implementer**

- Task 1 is pure and independently reviewable. Task 3 is server-only and touches no client code — it can land before or after Task 2 without conflict.
- The riskiest step is Task 4's TDZ hazard: `useMemo`/`useEffect` referencing `actionQueue` must sit BELOW its declaration. This file has crashed on exactly that before, and Vite compiles it happily.
- Do not add `maxInstances` to the six callables. Admin actions are single-operator; bounding a burst that does not exist would cargo-cult `placeBid`'s load-test conclusion.
