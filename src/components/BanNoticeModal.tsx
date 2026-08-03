import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { blockLiftsAt } from '../utils/banStatus';

interface BanNoticeModalProps {
  onClose: () => void;
}

/**
 * E2 ban-ladder notice. Shown when an effectively-blocked member taps a bid
 * action (instead of the terse toast/alert). Explains WHY the account is
 * restricted (reason line, keyed off blockedReason) and WHEN it lifts (a
 * localized date/time for a cooldown/suspension, or "permanent" copy when
 * blockedUntil is null).
 *
 * Bilingual AR/EN, on the app's orange/cream theme. Mobile-safe: no min-h-screen
 * (renders inside the overflow-hidden app frame); the panel scrolls internally
 * and honors safe areas.
 */
export const BanNoticeModal: React.FC<BanNoticeModalProps> = ({ onClose }) => {
  const { currentUser, language } = useApp();
  const isAr = language === 'ar';

  const title = isAr ? 'الحساب مقيّد' : 'Account restricted';

  const reason = ((): string => {
    switch (currentUser?.blockedReason) {
      case 'payment_default':
        return isAr ? 'تم تفويت دفعة.' : 'A payment was missed.';
      case 'payment_default_repeat':
        return isAr ? 'تكرار تفويت الدفعات.' : 'Repeated missed payments.';
      case 'admin_ban':
        return isAr ? 'تم التقييد من قِبل مزاد جو.' : 'Restricted by Mazad JO.';
      default:
        return isAr ? 'حسابك مقيّد حالياً.' : 'Your account is currently restricted.';
    }
  })();

  const liftsAt = blockLiftsAt(currentUser);
  const isPermanent = liftsAt == null;
  const isFuture = liftsAt != null && liftsAt > Date.now();

  const liftLine = ((): string => {
    if (isPermanent) {
      return isAr
        ? 'هذا التقييد دائم — تواصل مع الدعم.'
        : 'This restriction is permanent — contact support.';
    }
    if (isFuture) {
      const when = new Intl.DateTimeFormat(isAr ? 'ar-JO' : 'en-JO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(liftsAt as number));
      return isAr
        ? `يمكنك المزايدة مجدداً في ${when}`
        : `You can bid again on ${when}`;
    }
    // Edge: lift time already passed (shouldn't normally open the modal).
    return isAr ? 'يمكنك المزايدة الآن.' : 'You can bid again now.';
  })();

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="bg-surface-raised border border-line rounded-[24px] w-full max-w-sm shadow-[0_24px_50px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col my-auto max-h-[85vh] font-sans"
        style={{ textAlign: isAr ? 'right' : 'left' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        id="ban-notice-modal"
      >
        {/* Header */}
        <div className="bg-[#FFF8F3] p-5 border-b border-[#F0E4D8] shrink-0 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-[#FF6B00]/10 p-2 rounded-xl border border-[#FF6B00]/20 shrink-0">
              <ShieldAlert className="w-5 h-5 text-[#FF6B00]" />
            </div>
            <h2 className="text-sm font-black text-zinc-900 min-w-0">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto scrollbar-thin space-y-3">
          <div className="bg-[#FBFAF8] border border-[#EFEAE3] rounded-2xl p-4">
            <p className="text-xs font-bold text-zinc-800 leading-relaxed">{reason}</p>
          </div>
          <div className="bg-[#FBFAF8] border border-[#EFEAE3] rounded-2xl p-4">
            <p className="text-xs text-zinc-700 leading-relaxed font-medium">{liftLine}</p>
          </div>
        </div>

        {/* Footer action */}
        <div className="bg-zinc-50 p-4 border-t border-line shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-[#FF6B00] text-white hover:bg-[#e05e00] font-black py-3 rounded-2xl text-center text-xs transition-all active:scale-95 cursor-pointer shadow-md select-none"
          >
            {isAr ? 'حسناً' : 'Got it'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BanNoticeModal;
