/**
 * Admin audit-log normalization.
 *
 * `adminActions` rows were written with two different shapes over time:
 *   OLD: { id, actionType, targetId, targetName, adminName, timestamp:<ms number>, details? }
 *   NEW: { id, action, orderId|auctionId, adminId, adminName, timestamp:<Firestore Timestamp>, details? }
 * The viewer normalizes both into one shape.
 */

export interface NormalizedAdminAction {
  id: string;
  action: string;
  targetId?: string;
  adminName: string;
  at: number; // epoch ms
  details?: string;
}

// Coerce the divergent timestamp representations to epoch ms.
function toMillis(ts: any): number {
  if (typeof ts === 'number') return ts;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

export function normalizeAdminAction(raw: any): NormalizedAdminAction {
  const r = raw || {};
  return {
    id: String(r.id ?? ''),
    action: r.action || r.actionType || 'unknown',
    targetId: r.orderId || r.auctionId || r.targetId || undefined,
    adminName: r.adminName || r.adminId || '—',
    at: toMillis(r.timestamp),
    details: typeof r.details === 'string' ? r.details : undefined,
  };
}

export const ADMIN_ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  release_escrow: { ar: 'تحرير الضمان', en: 'Release escrow' },
  refund_order_escrow: { ar: 'استرجاع الضمان', en: 'Refund escrow' },
  refund: { ar: 'استرجاع', en: 'Refund' },
  approve_withdrawal: { ar: 'اعتماد سحب', en: 'Approve withdrawal' },
  force_close: { ar: 'إغلاق قسري للطلب', en: 'Force close order' },
  open_dispute: { ar: 'فتح نزاع', en: 'Open dispute' },
  resolve_dispute: { ar: 'حسم نزاع', en: 'Resolve dispute' },
  repair_stuck_escrows: { ar: 'إصلاح ضمانات عالقة', en: 'Repair stuck escrows' },
  reset_test_auctions_escrows: { ar: 'تصفير ضمانات تجريبية', en: 'Reset test escrows' },
};

export function adminActionLabel(action: string, isAr: boolean): string {
  const entry = ADMIN_ACTION_LABELS[action];
  if (!entry) return action;
  return isAr ? entry.ar : entry.en;
}
