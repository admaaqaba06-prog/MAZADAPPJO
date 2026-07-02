import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { Info, X } from 'lucide-react';

interface ContextualHintProps {
  hintKey: string;
  descAr: string;
  descEn: string;
  titleAr?: string;
  titleEn?: string;
  className?: string;
}

export const ContextualHint: React.FC<ContextualHintProps> = ({
  hintKey,
  descAr,
  descEn,
  titleAr,
  titleEn,
  className = ''
}) => {
  const { currentUser, markHintAsShown, language } = useApp();

  // If hints are already shown, do not render anything
  const hasBeenShown = currentUser?.shownHints?.[hintKey] === true;
  if (hasBeenShown) {
    return null;
  }

  const isAr = language === 'ar';
  const displayTitle = isAr ? titleAr : titleEn;
  const displayDesc = isAr ? descAr : descEn;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    markHintAsShown(hintKey);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        className={`relative overflow-hidden p-4 rounded-2xl bg-slate-50 border border-slate-100/80 shadow-sm flex gap-3 text-slate-700 leading-relaxed ${className}`}
        id={`contextual-hint-${hintKey}`}
      >
        {/* Glow pulsing beacon effect to guide first-time users */}
        <div className="relative flex shrink-0 items-start pt-0.5">
          <span className="absolute inline-flex h-3 w-3 rounded-full bg-[#FF6B00]/40 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF6B00]" />
        </div>

        {/* Text */}
        <div className="flex-1 flex flex-col gap-0.5 text-xs text-right rtl:text-right ltr:text-left">
          {displayTitle && (
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 mb-1 text-sm leading-tight">
              <span>{displayTitle}</span>
            </h4>
          )}
          <p className="text-slate-600 leading-normal">{displayDesc}</p>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer self-start"
          aria-label="Dismiss hint"
          id={`dismiss-${hintKey}-btn`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
