import React from 'react';
import { RefreshCw, HelpCircle, AlertTriangle, Inbox } from 'lucide-react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      // `bg-gray-200/80` before this: a near-white slab, correct in light and a
      // glowing block in dark. The theme guard did not catch it because its
      // ratchets cover text-/border-gray, not bg-gray.
      className={`animate-pulse bg-surface-sunken rounded-xl ${className}`}
      id="skeleton-shimmer"
    />
  );
};

/**
 * The cold-boot splash: Firebase restoring a session, or the app shell itself
 * still loading.
 *
 * Unlike a route change, this really is a whole-app wait with no shape to
 * preview, so a brand mark is the right answer — but it said "Loading Mazad..."
 * in English to an Arabic-first audience.
 *
 * The language is read from localStorage rather than context on purpose: one of
 * the two call sites is the Suspense fallback for `MainAppShell` itself, which
 * renders OUTSIDE the provider, so `useApp()` is not available there. Same key
 * and same 'ar' default as AppContext, so the splash and the app that follows
 * it never disagree.
 */
export const BootSplash: React.FC = () => {
  let isAr = true;
  try {
    isAr = (localStorage.getItem('mazad_language') || 'ar') !== 'en';
  } catch {
    // Private mode / storage disabled. The default is the majority language.
  }
  return (
    <div className="min-h-screen bg-surface-raised flex items-center justify-center font-sans" id="boot-splash">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FF6B00] animate-spin flex items-center justify-center font-bold text-white text-lg font-mono shadow-[0_4px_12px_rgba(255,107,0,0.3)]">
          M
        </div>
        <span className="text-xs text-fg-muted font-mono tracking-widest uppercase">
          {isAr ? 'جارٍ فتح مزاد…' : 'Loading Mazad…'}
        </span>
      </div>
    </div>
  );
};

/**
 * The route-level Suspense fallback — what fills the shell while a lazily
 * loaded view arrives.
 *
 * It replaces a spinner over the words "Loading view...", which was both the
 * app's most-seen piece of untranslated English and its least informative
 * state: a spinner says "wait", a skeleton says "here is the shape of what is
 * coming". Deliberately generic — this stands in for ANY route, so it lays out
 * a header and a few rows rather than mimicking one view and being wrong for
 * the rest.
 */
export const ViewSkeleton: React.FC = () => {
  return (
    <div className="flex-1 w-full p-4 space-y-4 min-h-[400px]" id="view-skeleton" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="space-y-2">
            <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const AuctionCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col space-y-3 p-3 bg-surface-raised border border-line rounded-3xl shadow-xs" id="auction-card-skeleton">
      <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
      <div className="space-y-2 px-1">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex justify-between items-center pt-1">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
};

export const WalletRowSkeleton: React.FC = () => {
  return (
    <div className="flex items-center justify-between p-4 bg-surface-raised border border-line rounded-2xl shadow-xs" id="wallet-row-skeleton">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
};

export const AdminListSkeleton: React.FC = () => {
  return (
    <div className="space-y-3" id="admin-list-skeleton">
      {[1, 2, 3].map((n) => (
        <div key={n} className="p-4 bg-surface-raised border border-line rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="w-16 h-8 rounded-lg" />
            <Skeleton className="w-16 h-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  language?: 'en' | 'ar';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionText,
  onAction,
  language = 'en',
}) => {
  const isAr = language === 'ar';
  return (
    <div 
      className="text-center py-16 px-4 bg-surface-raised border border-dashed border-line rounded-3xl shadow-xs flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="feedback-empty-state"
    >
      <div className="w-12 h-12 rounded-2xl bg-accent-weak border border-orange-100 flex items-center justify-center text-[#FF6B00] animate-bounce">
        {icon || <Inbox className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-sm font-black text-fg uppercase tracking-tight">{title}</h3>
        <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
      </div>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-xs uppercase cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  language?: 'en' | 'ar';
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  language = 'en',
}) => {
  const isAr = language === 'ar';
  return (
    <div 
      className="p-5 bg-red-50/50 border border-red-100 rounded-3xl flex flex-col items-center justify-center text-center space-y-3.5 max-w-md mx-auto"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="feedback-error-state"
    >
      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h4 className="text-xs font-black text-red-800 uppercase tracking-wider">
          {isAr ? 'عذراً! حدث خطأ ما' : 'Oops! Something went wrong'}
        </h4>
        <p className="text-[11px] text-red-600 max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer shadow-sm"
        >
          <RefreshCw className="w-3 h-3" />
          <span>{isAr ? 'إعادة المحاولة' : 'RETRY'}</span>
        </button>
      )}
    </div>
  );
};
