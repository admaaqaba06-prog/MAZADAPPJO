import { describe, it, expect } from 'vitest';
import { normalizeAdminAction, adminActionLabel } from './adminAudit';

describe('normalizeAdminAction', () => {
  it('normalizes an OLD-schema row (actionType/targetId, numeric timestamp)', () => {
    const n = normalizeAdminAction({
      id: 'a1',
      actionType: 'release_escrow',
      targetId: 'order-9',
      targetName: 'Widget',
      adminName: 'MJ',
      timestamp: 1690000000000,
      details: 'released 250 JOD',
    });
    expect(n).toEqual({
      id: 'a1',
      action: 'release_escrow',
      targetId: 'order-9',
      adminName: 'MJ',
      at: 1690000000000,
      details: 'released 250 JOD',
    });
  });

  it('normalizes a NEW-schema row (action/orderId, Firestore Timestamp)', () => {
    const n = normalizeAdminAction({
      id: 'a2',
      action: 'force_close',
      orderId: 'order-42',
      adminId: 'uid-admin',
      adminName: 'Admin',
      timestamp: { toMillis: () => 123 },
    });
    expect(n.action).toBe('force_close');
    expect(n.targetId).toBe('order-42');
    expect(n.adminName).toBe('Admin');
    expect(n.at).toBe(123);
  });

  it('coerces a {seconds} timestamp to ms', () => {
    expect(normalizeAdminAction({ id: 'x', timestamp: { seconds: 5 } }).at).toBe(5000);
  });

  it('falls back for missing fields', () => {
    const n = normalizeAdminAction({ id: 'x' });
    expect(n.action).toBe('unknown');
    expect(n.adminName).toBe('—');
    expect(n.at).toBe(0);
    expect(n.targetId).toBeUndefined();
  });

  it('prefers auctionId when orderId absent', () => {
    expect(normalizeAdminAction({ id: 'y', auctionId: 'auc-1' }).targetId).toBe('auc-1');
  });
});

describe('adminActionLabel', () => {
  it('maps known actions bilingually', () => {
    expect(adminActionLabel('release_escrow', false)).toBe('Release escrow');
    expect(adminActionLabel('release_escrow', true)).toBe('تحرير الضمان');
  });
  it('falls back to the raw action for unknown', () => {
    expect(adminActionLabel('some_new_action', false)).toBe('some_new_action');
  });
});
