import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, ArrowRight, ArrowLeft, X } from 'lucide-react';

interface SubscriptionPromptModalProps {
  onClose: () => void;
}

export const SubscriptionPromptModal: React.FC<SubscriptionPromptModalProps> = ({ onClose }) => {
  const { language, setActiveView } = useApp();
  const isAr = language === 'ar';

  const handleJoin = () => {
    setActiveView('wallet');
    onClose();
  };

  const handleHowItWorks = () => {
    setActiveView('about');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="relative bg-surface-raised text-fg w-full max-w-sm rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in scale-in duration-200 p-6 md:p-8"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="subscription-renew-modal"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-surface-sunken text-fg-muted min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Headline */}
        <div className="text-center space-y-3 mb-6 mt-2">
          <div className="mx-auto w-11 h-11 rounded-full bg-orange-100 border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-6 h-6 fill-current text-white stroke-[#FF6B00]" />
          </div>
          <h2 className="text-lg md:text-xl font-black text-fg tracking-tight leading-snug">
            {isAr ? 'انضم عشان تزايد وتربح 🔨' : 'Join to bid & win 🔨'}
          </h2>
          <p className="text-xs text-fg-muted max-w-xs mx-auto leading-normal">
            {isAr
              ? 'العضوية بتبدأ من دينار بالشهر عبر كليك — بتزايد مجاناً وما بتدفع إلا إذا فزت (+٥٪). بتتفعّل خلال دقائق.'
              : 'Membership from 1 JD/month via CliQ — bid free, pay only if you win (+5%). Activated in minutes.'}
          </p>
        </div>

        {/* Primary CTA: go to the membership page */}
        <button
          onClick={handleJoin}
          className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          id="membership-join-cta"
        >
          <span>{isAr ? 'انضم الآن' : 'Join now'}</span>
          {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
        </button>

        {/* Secondary: how the whole loop works */}
        <button
          onClick={handleHowItWorks}
          className="w-full mt-3 text-[11px] font-semibold text-fg-muted hover:text-fg underline underline-offset-2 decoration-gray-200 hover:decoration-gray-400 transition-colors cursor-pointer"
          id="membership-how-it-works-link"
        >
          {isAr ? 'كيف يعمل؟' : 'How it works'}
        </button>
      </div>
    </div>
  );
};
