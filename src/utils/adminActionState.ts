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
  // Nothing to settle: this action is not in flight and its row is not hidden.
  // Keeps the module's same-object-when-unchanged contract, makes a double
  // settle a true no-op, and — the real reason — makes it impossible for a
  // stale settle arriving after a RETRY of the same action began to clear the
  // retry's pending flag and un-hide its row mid-flight.
  if (!state.pending.has(actionId) && !(rowId && state.hidden.has(rowId))) return state;

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

/**
 * `readonly` in AND out: the queue this filters is a memoized array upstream, so
 * handing back a mutable reference would let a caller `sort`/`push` it in place.
 *
 * Returns the input array by identity whenever nothing was actually removed —
 * including the case where `hidden` holds ids that match no current row, which
 * happens for the whole window between a successful settle and the next prune.
 * Allocating there would break `React.memo` on every render in that window.
 */
export function visibleRows(rows: readonly ActionRow[], state: AdminActionState): readonly ActionRow[] {
  if (!rows) return [];
  if (state.hidden.size === 0) return rows;
  const filtered = rows.filter(r => !state.hidden.has(r.id));
  return filtered.length === rows.length ? rows : filtered;
}
