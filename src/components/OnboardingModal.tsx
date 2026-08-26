import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { Sparkles, BadgeCheck, Gavel, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { isActiveMember } from '../utils/membership';
import { serverNow } from '../utils/serverTime';

export const OnboardingModal: React.FC = () => {
  const { currentUser, completeOnboarding, setActiveView, language } = useApp();
  const [step, setStep] = useState(1);
  // Honour the language the user already chose globally instead of forcing
  // Arabic; the in-modal toggle can still flip it locally.
  const [onboardingLang, setOnboardingLang] = useState<'ar' | 'en'>(language === 'en' ? 'en' : 'ar');

  // Show ONLY when we positively know onboarding is incomplete.
  // The session latch is the real fix: it prevents resurrection when a later
  // snapshot re-emits without the flag (listener races made the modal reappear).
  // resetOnboarding() clears the latch so admin re-tests work within a session.
  if (
    !currentUser ||
    currentUser.onboardingCompleted ||
    sessionStorage.getItem('mazad_onboarding_dismissed') === '1'
  ) {
    return null;
  }

  const dismissForSession = () => {
    sessionStorage.setItem('mazad_onboarding_dismissed', '1');
  };

  // Non-members get a converting final CTA (→ join flow); active members just
  // close onto Discover and start bidding.
  const isMember = isActiveMember(currentUser, serverNow());

  const finishOnboarding = () => {
    dismissForSession();
    completeOnboarding();
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      finishOnboarding();
      if (!isMember) {
        setActiveView('wallet'); // join flow
      }
    }
  };

  const handleSkip = () => {
    finishOnboarding();
  };

  const handleHowItWorks = () => {
    finishOnboarding();
    setActiveView('about');
  };

  const isAr = onboardingLang === 'ar';

  const stepsData = [
    {
      titleAr: 'يا هلا بيك في مزادو 👋',
      titleEn: 'Welcome to MAZZADO 👋',
      descAr: 'تصفح المزادات المباشرة وزايد على المنتجات بالوقت الفعلي بكل سهولة.',
      descEn: 'Browse live auctions and bid on products in real time.',
      buttonAr: 'ابدأ',
      buttonEn: 'Start',
      icon: <Sparkles className="w-12 h-12 text-amber-500" />,
      color: 'from-amber-500/10 to-orange-500/10 border-amber-200/50'
    },
    {
      titleAr: 'انضم من ١ دينار بالشهر 🎯',
      titleEn: 'Join from 1 JD/month 🎯',
      descAr: 'عضوية شهرية تبدأ من دينار عبر كليك — اشترك وزايد على كل المزادات.',
      descEn: 'Monthly membership from 1 JD via CliQ — bid freely on every auction.',
      buttonAr: 'فهمت',
      buttonEn: 'Got it',
      icon: <BadgeCheck className="w-12 h-12 text-emerald-500" />,
      color: 'from-emerald-500/10 to-teal-500/10 border-emerald-200/50'
    },
    {
      titleAr: 'زايد وأنت مطمن 🔨',
      titleEn: 'Bid Safely 🔨',
      descAr: 'المزايدة مجانية — ما بتدفع إلا إذا فزت. عند الفوز بتدفع سعر الفوز + عمولة المشتري ٥٪ عبر كليك خلال ٢٤ ساعة. إذا خسرت، ما عليك شي.',
      descEn: 'Bidding is free — you only pay if you win: the final price + 5% buyer\'s premium via CliQ within 24 hours. If you lose, you owe nothing.',
      buttonAr: isMember ? 'ابدأ المزايدة' : 'انضم الآن — من ١ دينار',
      buttonEn: isMember ? 'Start Bidding' : 'Join now — from 1 JD',
      icon: <Gavel className="w-12 h-12 text-blue-500" />,
      color: 'from-blue-500/10 to-indigo-500/10 border-blue-200/50'
    }
  ];

  const currentStepData = stepsData[step - 1];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden bg-surface-raised rounded-3xl border border-line shadow-2xl flex flex-col"
          id="onboarding-card"
        >
          {/* Header Progress and Skip / Language toggle */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex space-x-1.5 rtl:space-x-reverse">
                {[1, 2, 3].map((num) => (
                  <div
                    key={num}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      num === step 
                        ? 'w-6 bg-slate-800' 
                        : num < step 
                          ? 'w-2 bg-slate-400' 
                          : 'w-2 bg-surface-sunken'
                    }`}
                  />
                ))}
              </div>

              {/* Language Switcher */}
              <button
                onClick={() => setOnboardingLang(prev => prev === 'ar' ? 'en' : 'ar')}
                className="text-[10px] font-black text-slate-400 hover:text-fg bg-surface-sunken/60 hover:bg-surface-sunken px-2 py-1 rounded-md transition-all cursor-pointer uppercase"
                id="onboarding-lang-toggle"
              >
                {onboardingLang === 'ar' ? 'English' : 'عربي'}
              </button>
            </div>
            
            <button
              onClick={handleSkip}
              className="text-xs font-semibold text-slate-500 hover:text-fg transition-colors flex items-center gap-1 bg-surface-sunken hover:bg-surface-sunken px-3 py-1.5 rounded-full"
              id="onboarding-skip-btn"
            >
              {isAr ? 'تخطي' : 'Skip'}
              {isAr ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Core Content */}
          <div className="p-6 flex flex-col items-center text-center">
            {/* Visual Illustration Plate */}
            <div className={`p-6 rounded-2xl bg-gradient-to-br ${currentStepData.color} border mb-6 flex items-center justify-center w-24 h-24 shadow-sm`}>
              {currentStepData.icon}
            </div>

            <h3 className="text-xl font-bold text-fg mb-3 leading-snug">
              {isAr ? currentStepData.titleAr : currentStepData.titleEn}
            </h3>

            <p className="text-slate-600 text-sm leading-relaxed mb-8 max-w-sm">
              {isAr ? currentStepData.descAr : currentStepData.descEn}
            </p>

            {/* Actions */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={handleNext}
                className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
                id="onboarding-next-btn"
              >
                <span>{isAr ? currentStepData.buttonAr : currentStepData.buttonEn}</span>
                {step < 3 ? (
                  isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />
                ) : null}
              </button>

              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-fg transition-colors"
                  id="onboarding-back-btn"
                >
                  {isAr ? 'السابق' : 'Back'}
                </button>
              )}

              {/* Footer: How-it-works link (marks onboarding done, opens explainer) */}
              <button
                onClick={handleHowItWorks}
                className="w-full py-1.5 text-xs font-semibold text-slate-400 hover:text-fg underline underline-offset-2 decoration-slate-200 hover:decoration-slate-400 transition-colors cursor-pointer"
                id="onboarding-how-it-works-link"
              >
                {isAr ? 'كيف يعمل مزادو؟' : 'How does Mazzado work?'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
