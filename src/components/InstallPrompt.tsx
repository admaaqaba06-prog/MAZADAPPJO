import React, { useEffect, useRef, useState } from 'react';
import { Share, Download, X, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  isStandalone,
  isIOSSafari,
  isDismissed,
  persistDismissal,
  resolveInstallMode,
  type InstallMode,
  type BeforeInstallPromptEvent,
} from '../utils/installPrompt';

/** How long to wait before offering the hint — showing it on first paint feels aggressive. */
const SHOW_DELAY_MS = 3500;

interface InstallPromptProps {
  /**
   * Hide the banner even when otherwise eligible — used by the immersive
   * live/reels view, which is a full-screen surface the hint must not cover.
   */
  suppressed?: boolean;
}

/**
 * Dismissible "Add to Home Screen" install hint (mobile only).
 *
 * iOS Safari cannot trigger an install programmatically (no
 * `beforeinstallprompt`), so it gets an INSTRUCTIONAL hint pointing at the
 * Share → Add to Home Screen flow. Android/Chromium fire
 * `beforeinstallprompt`, which we capture and replay via a real one-tap
 * Install button. All gating (standalone / dismissed / platform) lives in
 * ../utils/installPrompt so it is unit-tested without a DOM.
 *
 * This renders inside the mobile shell (lg:hidden), so it is automatically
 * absent on desktop; it is purely presentational and never touches bid/auth
 * data.
 */
export const InstallPrompt: React.FC<InstallPromptProps> = ({ suppressed = false }) => {
  const { language } = useApp();
  const isAr = language === 'ar';

  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());
  const [ready, setReady] = useState(false); // delay gate
  const [entered, setEntered] = useState(false); // slide-in transition

  // Static, per-session facts (SSR-guarded inside the helpers).
  const iosSafari =
    typeof navigator !== 'undefined' &&
    isIOSSafari(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const standalone = isStandalone();

  // Capture Android/Chromium's install event, and self-dismiss once installed.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's default mini-infobar; we replay it
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setHasDeferredPrompt(true);
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      setHasDeferredPrompt(false);
      persistDismissal();
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Short delay before the banner is allowed to appear.
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const mode: InstallMode = resolveInstallMode({
    standalone,
    dismissed,
    hasDeferredPrompt,
    iosSafari,
  });

  const shouldRender = ready && !suppressed && mode !== null;

  // Trigger the slide-in on the frame after we start rendering.
  useEffect(() => {
    if (!shouldRender) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [shouldRender]);

  if (!shouldRender) return null;

  const handleDismiss = () => {
    persistDismissal();
    setDismissed(true);
  };

  const handleInstall = async () => {
    const evt = deferredPrompt.current;
    if (!evt) return;
    try {
      await evt.prompt();
      await evt.userChoice; // 'accepted' | 'dismissed' — either way we retire the banner
    } catch {
      /* user gesture expired or double-prompt — just close */
    } finally {
      deferredPrompt.current = null;
      setHasDeferredPrompt(false);
      persistDismissal();
      setDismissed(true);
    }
  };

  const title = isAr ? 'أضِف مزاد جو إلى شاشتك الرئيسية' : 'Add Mazad Jo to your Home Screen';

  return (
    <div
      // Floating bottom banner, clearing the bottom nav (h-16) + its safe-area
      // padding + the raised Sell FAB. Not modal — it never blocks the app.
      className="lg:hidden fixed inset-x-0 z-[19] flex justify-center px-3 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`pointer-events-auto w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-md p-4 flex items-start gap-3 transition-all duration-300 ease-out ${
          entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        {/* Orange-M app mark */}
        <div className="w-10 h-10 rounded-xl bg-[#FF6B00] flex items-center justify-center font-black text-white text-lg font-mono shadow-sm shadow-orange-500/30 shrink-0">
          M
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-gray-900 leading-tight">{title}</p>

          {mode === 'ios' ? (
            <p className="text-[11px] font-medium text-gray-500 leading-snug mt-1 flex items-center gap-1 flex-wrap">
              {isAr ? (
                <>
                  <span>اضغط زر المشاركة</span>
                  <Share className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
                  <span>ثم &laquo;إضافة إلى الشاشة الرئيسية&raquo;</span>
                </>
              ) : (
                <>
                  <span>Tap the Share button</span>
                  <Share className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
                  <span>then &lsquo;Add to Home Screen&rsquo;</span>
                  <Plus className="w-3 h-3 text-[#FF6B00] shrink-0" />
                </>
              )}
            </p>
          ) : (
            <>
              <p className="text-[11px] font-medium text-gray-500 leading-snug mt-0.5">
                {isAr ? 'ثبّت التطبيق للوصول السريع بلمسة واحدة.' : 'Install for instant one-tap access.'}
              </p>
              <button
                onClick={handleInstall}
                className="mt-2 inline-flex items-center gap-1.5 bg-[#FF6B00] hover:bg-orange-600 active:scale-[0.98] text-white text-[12px] font-black px-3.5 py-1.5 rounded-full shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isAr ? 'تثبيت' : 'Install'}</span>
              </button>
            </>
          )}
        </div>

        <button
          onClick={handleDismiss}
          aria-label={isAr ? 'إغلاق' : 'Dismiss'}
          className="shrink-0 -mt-1 -me-1 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
