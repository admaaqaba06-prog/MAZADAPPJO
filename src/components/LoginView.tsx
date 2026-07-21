import React, { useState, useRef } from 'react';
import type { ConfirmationResult, RecaptchaVerifier as RecaptchaVerifierType } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { toE164Jordan } from '../utils/phoneNumber';
import { mapAuthError } from '../utils/authErrors';
import { parseAuctionIdFromSearch } from '../utils/deepLink';
import { Globe, CheckCircle2, Phone, Loader2 } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.77z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.08 1.16-3.14 0-5.8-2.11-6.75-4.96H1.31v3.15C3.29 21.35 7.37 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.25 14.24A7.18 7.18 0 0 1 4.88 12c0-.79.13-1.57.37-2.31V6.54H1.31A11.94 11.94 0 0 0 0 12c0 1.92.45 3.74 1.25 5.37l3.9-3.13z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.29 2.65 1.31 6.54l3.94 3.12c.95-2.85 3.61-4.91 6.75-4.91z"
    />
  </svg>
);

export const LoginView: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithPhone,
    confirmPhoneCode,
    language,
    setLanguage
  } = useApp();

  const t = translations[language];
  const isAr = language === 'ar';

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Phone auth (send SMS code -> verify) state
  const [phoneMode, setPhoneMode] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');
  const recaptchaRef = useRef<RecaptchaVerifierType | null>(null);

  // Visitor arrived via a WhatsApp auction deep link (?auction=...) — after auth,
  // App.tsx routes them straight into that live room. Tell them why they're here.
  const cameFromAuctionLink = !!parseAuctionIdFromSearch(window.location.search);

  const clearRecaptcha = () => {
    // A consumed/errored verifier can't be reused — clear + null AND wipe the
    // container DOM so no stale widget lingers (avoids "reCAPTCHA has already
    // been rendered", incl. after a retry or the Enterprise->v2 fallback).
    try { recaptchaRef.current?.clear(); } catch { /* container may be gone */ }
    recaptchaRef.current = null;
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';
  };

  const handleSendCode = async () => {
    if (phoneBusy) return; // ignore rapid double-clicks (belt-and-suspenders with the disabled button)
    setPhoneErr('');
    const e164 = toE164Jordan(phoneInput);
    if (!e164) {
      setPhoneErr(isAr ? 'أدخل رقم هاتف أردني صالح (07xxxxxxxx)' : 'Enter a valid Jordanian mobile number (07xxxxxxxx)');
      return;
    }
    setPhoneBusy(true);
    try {
      const { RecaptchaVerifier } = await import('firebase/auth');
      const { auth } = await import('../services/firebase');
      // Always start from a clean slate: tear down any prior verifier + wipe the
      // container, then create a fresh one. Prevents "reCAPTCHA has already been
      // rendered in this element" on retries and the Enterprise->v2 fallback.
      clearRecaptcha();
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      const result = await loginWithPhone(e164, recaptchaRef.current);
      setConfirmation(result);
    } catch (e: any) {
      console.warn('Phone sign-in (send code) failed:', e);
      // Never show raw Firebase strings — map to a friendly AR/EN message.
      setPhoneErr(mapAuthError(e, isAr));
      clearRecaptcha();
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (phoneBusy) return; // ignore rapid double-clicks (belt-and-suspenders with the disabled button)
    setPhoneErr('');
    if (!confirmation || smsCode.trim().length < 4) {
      setPhoneErr(isAr ? 'أدخل رمز التحقق.' : 'Enter the verification code.');
      return;
    }
    setPhoneBusy(true);
    const res = await confirmPhoneCode(confirmation, smsCode.trim());
    setPhoneBusy(false);
    if (!res.success) setPhoneErr(res.message);
    // On success, onAuthStateChanged flips isAuthenticated and the app renders the main shell.
  };

  const handlePhoneBack = () => {
    setPhoneMode(false);
    setConfirmation(null);
    setSmsCode('');
    setPhoneErr('');
    clearRecaptcha();
  };

  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const handleGoogleClick = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await loginWithGoogle();
      setSuccessMsg(isAr ? 'تم الدخول بنجاح عبر Google' : 'Logged in through Google successfully.');
    } catch (err) {
      console.warn("Google Sign-In failed:", err);
      setErrorMsg(isAr ? 'فشل تسجيل الدخول عبر Google' : 'Google Sign-In failed.');
    }
  };

  return (
    <div 
      className="min-h-screen w-full bg-neutral-50 text-gray-900 flex flex-col justify-center items-center p-4 md:p-8 font-sans select-none relative"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="login-view-root"
    >
      {/* Top Absolute Header with Logo & Language Toggle */}
      <header className="absolute top-6 left-6 right-6 flex justify-between items-center max-w-7xl w-full mx-auto px-4 pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B00] flex items-center justify-center text-white font-mono font-black text-sm shadow-[0_3px_8px_rgba(255,107,0,0.3)]">
            M
          </div>
          <div>
            <span className="font-mono font-black text-base text-gray-900 tracking-tight">{t.appName}</span>
          </div>
        </div>

        <button 
          onClick={handleLanguageToggle}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          id="lang-toggle-btn"
        >
          <Globe className="w-3.5 h-3.5 text-gray-400" />
          <span>{t.langLabel}</span>
        </button>
      </header>

      {/* Deep-link context: the visitor followed a live-auction link — say so */}
      {cameFromAuctionLink && (
        <div
          className="w-full max-w-md bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-[#C2410C] rounded-2xl px-4 py-2.5 text-xs font-bold text-center z-10 mt-16"
          id="deep-link-auction-banner"
        >
          {isAr ? '⚡ سجّل دخولك للمشاركة في المزاد المباشر' : '⚡ Sign in to join the live auction'}
        </div>
      )}

      {/* Center White Modal Box */}
      <div className={`w-full max-w-md bg-white rounded-3xl p-6 md:p-8 border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] z-10 ${cameFromAuctionLink ? 'mt-4 mb-16' : 'my-16'}`}>

        {/* Title */}
        <h1 className="text-2xl font-black text-gray-900 tracking-tight text-center mb-6">
          {isAr ? 'يا هلا فيك — سجّل دخولك' : 'Welcome — sign in'}
        </h1>

        {/* Alert Notifications */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold" id="login-error-alert">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold flex items-center gap-1.5" id="login-success-alert">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Social Logins Block */}
        <div className="flex flex-col gap-3 mb-5">
          {/* Invisible reCAPTCHA anchor for phone auth */}
          <div id="recaptcha-container" />

          {/* Continue with Phone (promoted) */}
          {!phoneMode ? (
            <button
              type="button"
              onClick={() => setPhoneMode(true)}
              className="w-full h-11 flex items-center justify-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-sm font-bold rounded-full shadow-sm transition-all"
              id="phone-login-btn"
            >
              <Phone className="w-5 h-5 shrink-0" />
              <span>{isAr ? 'المتابعة برقم الهاتف' : 'Continue with phone number'}</span>
            </button>
          ) : (
            <div className="space-y-2" id="phone-login-panel">
              {!confirmation ? (
                <>
                  <input
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="07xxxxxxxx"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all"
                    id="phone-number-input"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={handleSendCode}
                    className="w-full h-11 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-sm font-bold rounded-full shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    id="phone-send-code-btn"
                  >
                    {phoneBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{isAr ? 'جاري الإرسال…' : 'Sending…'}</span>
                      </>
                    ) : (
                      <span>{isAr ? 'إرسال الرمز' : 'Send code'}</span>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder={isAr ? 'رمز التحقق' : 'Verification code'}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all tracking-widest text-center"
                    id="phone-code-input"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={handleVerifyCode}
                    className="w-full h-11 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-sm font-bold rounded-full shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    id="phone-verify-code-btn"
                  >
                    {phoneBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{isAr ? 'جاري التحقق…' : 'Verifying…'}</span>
                      </>
                    ) : (
                      <span>{isAr ? 'تأكيد' : 'Verify'}</span>
                    )}
                  </button>
                </>
              )}
              {phoneErr && (
                <p className="text-red-600 text-xs font-semibold" id="phone-login-error">{phoneErr}</p>
              )}
              <button
                type="button"
                onClick={handlePhoneBack}
                className="w-full text-xs text-gray-500 hover:text-gray-700 font-semibold transition-colors"
                id="phone-back-btn"
              >
                {isAr ? 'رجوع' : 'Back'}
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400 font-semibold">{isAr ? 'أو' : 'or'}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Continue with Google (secondary) */}
          <button
            type="button"
            onClick={handleGoogleClick}
            className="w-full h-11 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 text-sm font-bold rounded-full shadow-sm transition-all"
            id="google-login-btn"
          >
            <GoogleIcon />
            <span>{isAr ? 'المتابعة بـ Google' : 'Continue with Google'}</span>
          </button>
        </div>

      </div>

      {/* Policy Footer */}
      <footer className="text-center text-[11px] text-gray-400 font-medium tracking-wide max-w-xs mx-auto pt-4 border-t border-gray-100 w-full mt-auto">
        {t.tagline}
      </footer>
    </div>
  );
};
