/**
 * One hook behind every Action Center button, so eleven call sites cannot
 * drift into eleven behaviours.
 *
 * The `optimism` argument is the safety property: `'reversible'` is permitted
 * at exactly two call sites (listing approve/reject). See the design spec.
 *
 * NOT retry-safe by construction. `actionId` identifies an ACTION, not an
 * ATTEMPT, so a late settle from an abandoned attempt will clear a retry's
 * pending flag and (on failure) un-hide its row. `settleAction`'s source
 * comment spells this out. Adding a per-attempt id is the prerequisite for any
 * retry path; do not build one on top of this as it stands.
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

export interface AdminActionResult {
  ok: boolean;
  error?: any;
  /**
   * True ONLY for a double-click the guard swallowed: nothing was sent, nothing
   * failed. Call sites must branch on this before showing an error, because the
   * naive `if (!r.ok) toast(r.error)` would put an untranslated internal string
   * in front of an Arabic-speaking admin. Failure toasts carry the server's
   * Arabic message; a suppressed click carries no message at all.
   */
  suppressed?: boolean;
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

  const run = useCallback(async (input: RunAdminAction): Promise<AdminActionResult> => {
    const { actionId, rowId, optimism, fn } = input;

    // A swallowed double-click. `suppressed` is the discriminator the call site
    // branches on — never the `error` string, which is a debugging aid only.
    if (inFlight.current.has(actionId)) return { ok: false, suppressed: true, error: 'already-in-flight' };
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
      // Both lines MUST stay in the `finally`. Dropping the delete leaves the
      // gate shut forever — a button that works exactly once and then looks
      // dead, with `isPending` reading false the whole time.
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
