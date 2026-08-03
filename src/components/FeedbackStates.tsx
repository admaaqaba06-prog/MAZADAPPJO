import React from 'react';
import { RefreshCw, HelpCircle, AlertTriangle, Inbox } from 'lucide-react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div 
      className={`animate-pulse bg-gray-200/80 rounded-xl ${className}`} 
      id="skeleton-shimmer"
    />
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
      <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6B00] animate-bounce">
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
