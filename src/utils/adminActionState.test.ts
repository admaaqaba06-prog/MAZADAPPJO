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
