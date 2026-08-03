import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmActionModalProps {
  open: boolean;
  isAr: boolean;
  title: string;
  /** Human lines describing the irreversible impact, e.g. money that will move. */
  impactLines: string[];
  /** The admin must type this exactly (case/space-insensitive) to enable Confirm. */
  confirmToken: string;
  /** Label shown above the token input, e.g. "Type the order reference". */
  tokenLabel: string;
  requireReason?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');

/**
 * Typed-confirmation guard for irreversible admin actions (force-close,
 * force-open-dispute). Replaces a bare window.confirm(): echoes the money
 * impact and requires the admin to type the order reference before confirming.
 * Smooth ease-out transition (no spring, per house motion preference).
 */
const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  open,
  isAr,
  title,
  impactLines,
  confirmToken,
  tokenLabel,
  requireReason = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = React.useState('');
  const [reason, setReason] = React.useState('');

  // Reset the fields whenever the modal (re)opens.
  React.useEffect(() => {
    if (open) {
      setTyped('');
      setReason('');
    }
  }, [open]);

  if (!open) return null;

  const tokenMatches = norm(typed) === norm(confirmToken);
  const reasonOk = !requireReason || reason.trim().length > 0;
  const canConfirm = tokenMatches && reasonOk && !busy;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      style={{ animation: 'fadeIn 150ms ease-out' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-surface-raised rounded-3xl w-full max-w-sm p-5 shadow-xl"
        style={{ animation: 'popIn 180ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-sm font-bold text-fg">{title}</h3>
        </div>

        <ul className="mb-4 space-y-1.5">
          {impactLines.map((line, i) => (
            <li key={i} className="text-xs text-fg-muted leading-relaxed flex gap-1.5">
              <span className="text-red-400">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <label className="block text-[11px] font-semibold text-fg-muted mb-1">
          {tokenLabel}{' '}
          <span className="font-mono font-bold text-fg">{confirmToken}</span>
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className="w-full border border-line rounded-xl px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-red-200"
          placeholder={confirmToken}
        />

        {requireReason && (
          <>
            <label className="block text-[11px] font-semibold text-fg-muted mb-1">
              {isAr ? 'السبب (مطلوب)' : 'Reason (required)'}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full border border-line rounded-xl px-3 py-2 text-xs mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder={isAr ? 'لماذا يتم هذا الإجراء؟' : 'Why is this action being taken?'}
            />
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-fg-muted bg-surface-sunken hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (isAr ? 'جارٍ…' : 'Working…') : isAr ? 'تأكيد' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmActionModal;
