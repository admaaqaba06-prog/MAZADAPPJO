import React from 'react';
import type { AdminAction } from '../../types';
import { normalizeAdminAction, adminActionLabel } from '../../utils/adminAudit';

interface AuditLogSectionProps {
  isAr: boolean;
  actions: AdminAction[];
}

function formatWhen(at: number, isAr: boolean): string {
  if (!at) return '—';
  try {
    return new Date(at).toLocaleString(isAr ? 'ar-JO' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(at).toISOString();
  }
}

/**
 * Read-only viewer for the `adminActions` audit log (already subscribed into
 * context, previously rendered nowhere). Normalizes the two historical row
 * schemas. No writes.
 */
const AuditLogSection: React.FC<AuditLogSectionProps> = ({ isAr, actions }) => {
  const rows = React.useMemo(
    () =>
      (actions || [])
        .map(normalizeAdminAction)
        .sort((a, b) => b.at - a.at),
    [actions]
  );

  return (
    <div className="bg-surface-raised p-5 rounded-3xl border border-line">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-fg">
          {isAr ? 'سجل إجراءات الإدارة' : 'Admin audit log'}
        </h2>
        <span className="text-[11px] font-semibold text-fg-muted">
          {isAr ? `آخر ${rows.length}` : `Last ${rows.length}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-fg-muted font-semibold py-8 text-center">
          {isAr ? 'لا يوجد سجل بعد.' : 'No audit entries yet.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id || `${r.action}-${r.at}`}
              className="border border-line rounded-2xl px-4 py-3 bg-surface-sunken/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">
                  {adminActionLabel(r.action, isAr)}
                </span>
                <span className="text-[11px] text-fg-muted font-medium whitespace-nowrap">
                  {formatWhen(r.at, isAr)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-fg-muted">
                {r.targetId && (
                  <span className="font-mono">
                    #{r.targetId.substring(0, 8).toUpperCase()}
                  </span>
                )}
                <span>·</span>
                <span>{r.adminName}</span>
              </div>
              {r.details && (
                <p className="mt-1.5 text-[11px] text-fg-muted leading-relaxed">
                  {r.details}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AuditLogSection;
