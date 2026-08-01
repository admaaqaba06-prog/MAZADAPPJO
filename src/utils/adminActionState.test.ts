import { describe, it, expect } from 'vitest';
import type { ActionKind, ActionReason, ActionRow } from './actionQueue';
import {
  EMPTY_ADMIN_ACTION_STATE, beginAction, settleAction, pruneHidden,
  isActionPending, visibleRows,
} from './adminActionState';

/**
 * A real `ActionRow`, not a cast. `kind` is derived from the id so the fixture
 * honours the `id === `${kind}:${entityId}`` invariant the optimistic hide
 * depends on — a fixture whose kind contradicted its id would be testing a
 * shape that `buildActionQueue` can never produce.
 */
const row = (id: string): ActionRow => {
  const [kind, entityId] = id.split(':');
  const k = (kind ?? 'approve_listing') as ActionKind;
  const reason: ActionReason = k === 'payout' ? 'payout_to_approve' : 'lot_awaiting_review';
  return {
    id, kind: k, entityId: entityId ?? id,
    reason, waitingSinceMs: 0, severity: 'new',
    label: { ar: '', en: '' },
  };
};

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

  it('clears pending for a confirmed action either way, and NEVER hides its row', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'p1', rowId: 'payout:y', optimism: 'confirmed' });
    for (const ok of [true, false]) {
      const s2 = settleAction(s1, { actionId: 'p1', rowId: 'payout:y', ok });
      expect(isActionPending(s2, 'p1')).toBe(false);
      // The safety property, asserted on the SETTLE and not only on the begin:
      // a payout must never disappear from the queue because the callable
      // resolved. Only the Firestore listener may remove it. If it vanished
      // here, the next pruneHidden would forget it and the admin would be
      // looking at a queue that says money moved when it may not have.
      expect(s2.hidden.size).toBe(0);
    }
  });

  it('is a no-op for an action that is not in flight, so a stale settle cannot cancel a retry', () => {
    // Same object in, same object out — nothing was pending and nothing hidden.
    expect(settleAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'ghost', rowId: 'approve_listing:x', ok: true }))
      .toBe(EMPTY_ADMIN_ACTION_STATE);

    // A second settle of the same action must not disturb the state either.
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'confirmed' });
    const s2 = settleAction(s1, { actionId: 'a1', rowId: 'approve_listing:x', ok: true });
    expect(settleAction(s2, { actionId: 'a1', rowId: 'approve_listing:x', ok: true })).toBe(s2);
  });

  it('is NOT identity for a reversible double settle — the surviving hide keeps the guard open', () => {
    // Documents the ONE combination where the no-op claim does not hold, and it
    // is the one the two permitted call sites use. After a successful settle the
    // hide deliberately outlives it, so the guard's second conjunct is still
    // true and a fresh but content-identical object comes back. One wasted
    // render, no behaviour change — asserted so nobody later "fixes" it into a
    // clear of `hidden`, which is the money-safety bug.
    //
    // This is also the only place the guard's second conjunct is exercised in
    // isolation: not pending, but still hidden.
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = settleAction(s1, { actionId: 'a1', rowId: 'approve_listing:x', ok: true });
    const s3 = settleAction(s2, { actionId: 'a1', rowId: 'approve_listing:x', ok: true });
    expect(s3).not.toBe(s2);
    expect(isActionPending(s3, 'a1')).toBe(false);
    expect(s3.hidden.has('approve_listing:x')).toBe(true);
  });
});

describe('concurrent actions', () => {
  // Every other test in this file runs with at most ONE action in flight, which
  // cannot distinguish "remove my entry" from "wipe the whole set".
  it('keeps unrelated actions pending through settle and prune', () => {
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = beginAction(s1, { actionId: 'a2', rowId: 'approve_listing:y', optimism: 'reversible' });
    expect(isActionPending(s2, 'a1')).toBe(true);
    expect(isActionPending(s2, 'a2')).toBe(true);
    expect(s2.hidden.has('approve_listing:x')).toBe(true);
    expect(s2.hidden.has('approve_listing:y')).toBe(true);

    // Settling a2 must not touch a1's busy state.
    const s3 = settleAction(s2, { actionId: 'a2', rowId: 'approve_listing:y', ok: true });
    expect(isActionPending(s3, 'a1')).toBe(true);
    expect(isActionPending(s3, 'a2')).toBe(false);

    // A snapshot where nothing has been dropped yet: identity, and a1 still busy.
    const stable = pruneHidden(s3, [row('approve_listing:x'), row('approve_listing:y')]);
    expect(stable).toBe(s3);
    expect(isActionPending(stable, 'a1')).toBe(true);

    // Now the listener drops y. Task 2 runs this on EVERY snapshot, so if prune
    // rebuilt `pending` instead of carrying it over, a1's button would silently
    // lose its spinner while its callable is still in flight.
    const s4 = pruneHidden(s3, [row('approve_listing:x')]);
    expect(s4).not.toBe(s3);
    expect(isActionPending(s4, 'a1')).toBe(true);
    expect(s4.hidden.has('approve_listing:x')).toBe(true);
    expect(s4.hidden.has('approve_listing:y')).toBe(false);
  });

  it('rolls back ONLY the failing action, leaving a concurrent action hidden and pending', () => {
    // The rollback branch is the one place a settle writes to `hidden`, so a
    // too-wide delete there un-hides somebody else's row: an admin rejects two
    // lots, one call fails, and the OTHER lot flashes back into the queue while
    // its own callable is still in flight.
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = beginAction(s1, { actionId: 'a2', rowId: 'approve_listing:y', optimism: 'reversible' });
    const s3 = settleAction(s2, { actionId: 'a2', rowId: 'approve_listing:y', ok: false });

    expect(s3.hidden.has('approve_listing:y')).toBe(false);  // the failure rolled back
    expect(s3.hidden.has('approve_listing:x')).toBe(true);   // the bystander did NOT
    expect(s3.hidden.size).toBe(1);
    expect(isActionPending(s3, 'a1')).toBe(true);
    expect(isActionPending(s3, 'a2')).toBe(false);
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

  it('prunes ONLY the stale ids, not every hidden id', () => {
    // Two lots approved back to back; the first write lands before the second.
    // Dropping both hides here would flash the second row back into the queue.
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = beginAction(s1, { actionId: 'a2', rowId: 'approve_listing:y', optimism: 'reversible' });
    const s3 = pruneHidden(s2, [row('approve_listing:y')]);
    expect(s3.hidden.has('approve_listing:x')).toBe(false);
    expect(s3.hidden.has('approve_listing:y')).toBe(true);
    expect(s3.hidden.size).toBe(1);
  });

  it('does not mutate the state it was handed', () => {
    // Purity is not decoration here. Task 2 holds these objects in React state,
    // and an in-place prune would change the contents of an already-committed
    // value without scheduling a re-render — invisible until StrictMode's
    // double-invoke or a concurrent render made it visible as a stale queue.
    const s1 = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'a1', rowId: 'approve_listing:x', optimism: 'reversible' });
    const s2 = beginAction(s1, { actionId: 'a2', rowId: 'approve_listing:y', optimism: 'reversible' });
    const sizeBefore = s2.hidden.size;
    const contentsBefore = [...s2.hidden].sort();

    const s3 = pruneHidden(s2, [row('approve_listing:y')]);

    expect(s2.hidden.size).toBe(sizeBefore);
    expect([...s2.hidden].sort()).toEqual(contentsBefore);
    expect(s3.hidden.size).toBe(1);          // the copy really did change
    expect(s3.hidden).not.toBe(s2.hidden);
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

  it('returns the SAME array when the hidden ids match no row', () => {
    // The window between a successful settle and the next prune: `hidden` is
    // non-empty but the listener already dropped the row, so nothing is
    // filtered. Allocating here would defeat React.memo on every render.
    const rows = [row('approve_listing:a')];
    const s = beginAction(EMPTY_ADMIN_ACTION_STATE, { actionId: 'x', rowId: 'approve_listing:gone', optimism: 'reversible' });
    expect(visibleRows(rows, s)).toBe(rows);
  });

  it('never throws on junk', () => {
    expect(visibleRows([], EMPTY_ADMIN_ACTION_STATE)).toEqual([]);
    expect(visibleRows(undefined as any, EMPTY_ADMIN_ACTION_STATE)).toEqual([]);
  });
});
