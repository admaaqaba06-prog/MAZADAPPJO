import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warn';

export type ToastOptions = {
  title: string;
  message?: string;
  type: ToastType;
};

type ToastItem = ToastOptions & { id: number };

type ToastContextValue = {
  showToast: (opts: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 2600;

const TYPE_STYLES: Record<
  ToastType,
  { icon: React.ReactNode; ring: string; iconWrap: string }
> = {
  success: {
    icon: <CheckCircle2 size={18} strokeWidth={2.5} />,
    ring: 'border-green-200',
    iconWrap: 'bg-green-100 text-green-600',
  },
  info: {
    icon: <Info size={18} strokeWidth={2.5} />,
    ring: 'border-orange-200',
    iconWrap: 'bg-accent-weak text-[#F05123]',
  },
  warn: {
    icon: <AlertTriangle size={18} strokeWidth={2.5} />,
    ring: 'border-amber-200',
    iconWrap: 'bg-amber-100 text-amber-600',
  },
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...opts, id }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Top-center stack; layout is symmetric so it works in RTL and LTR. */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9990] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4"
        role="region"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const style = TYPE_STYLES[toast.type];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className={`pointer-events-auto w-full bg-surface-raised rounded-2xl shadow-lg border ${style.ring} px-4 py-3 flex items-start gap-3`}
                dir="auto"
              >
                <span
                  className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${style.iconWrap}`}
                >
                  {style.icon}
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-bold text-fg leading-snug">
                    {toast.title}
                  </p>
                  {toast.message && (
                    <p className="text-xs text-fg-muted mt-0.5 leading-snug">
                      {toast.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss"
                  className="shrink-0 text-gray-300 hover:text-fg-muted transition-colors mt-0.5"
                >
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
