import React, { useState, useRef, useEffect } from 'react';
import type { ConfirmationResult, RecaptchaVerifier as RecaptchaVerifierType } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { DEFAULT_COUNTRY } from '../utils/phoneNumber';
import type { CountryCode } from 'libphonenumber-js';
import { mapAuthError } from '../utils/authErrors';
import { parseAuctionIdFromSearch, parseAuctionIdFromPath } from '../utils/deepLink';
import { PhoneInput } from './ui/PhoneInput';
import { Globe, CheckCircle2, Phone, Loader2, MessageCircle } from 'lucide-react';
import { SignInMarketingPanel } from './SignInMarketingPanel';
import { useLandingAuctions } from '../landing/useLandingAuctions';
import { signInPrompt } from '../utils/signInIntent';
import { BrandMark } from './BrandMark';

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

interface LoginViewProps {
  /** Guest browsing: "continue browsing" escape hatch back to the read-only
   *  shell. Absent (default) renders the exact pre-guest-browse screen. */
  onBack?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onBack }) => {
  const {
    loginWithGoogle,
    loginWithPhone,
    confirmPhoneCode,
    requestWhatsappOtp,
    verifyWhatsappOtp,
    signInWhatsapp,
    language,
    setLanguage,
    signInIntent
  } = useApp();

  const t = translations[language];
  const isAr = language === 'ar';
  // What this visitor was trying to do when they were stopped. Captured at the
  // tap (see AppContext.requestSignIn) — by the time this screen renders the
  // only clue left is the URL, which is why every entry point used to be asked
  // to sign in to bid.
  const prompt = signInPrompt(signInIntent, isAr);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Phone auth (send SMS code -> verify) state
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState<{ country: CountryCode; national: string; e164: string | null }>({
    country: DEFAULT_COUNTRY,
    national: '',
    e164: null,
  });
  const [smsCode, setSmsCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');
  const recaptchaRef = useRef<RecaptchaVerifierType | null>(null);

  // WhatsApp OTP is the PRIMARY phone channel; the Firebase reCAPTCHA/SMS flow above is
  // the fallback. `phoneChannel` picks which one the phone panel renders. `phone`
  // (country + national + derived e164) is shared across both channels (same number, different delivery).
  const [phoneChannel, setPhoneChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [waSent, setWaSent] = useState(false); // code has been requested → show code entry
  const [waCode, setWaCode] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  const [waErr, setWaErr] = useState('');

  // Resend cooldown: after a successful send, block re-sending for RESEND_COOLDOWN_S
  // seconds (Jordanian carrier SMS can lag 10-60s, so give it room before a retry).
  // `cooldown` is the seconds remaining (0 = ready to resend). The interval id lives
  // in a ref so re-renders never spawn a second timer, and the tick uses a functional
  // setState — the ticking value is NOT a dependency of anything, so there is no
  // stale-closure countdown bug.
  const RESEND_COOLDOWN_S = 60;
  const [cooldown, setCooldown] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCooldownTimer = () => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  };

  const startCooldown = (seconds: number = RESEND_COOLDOWN_S) => {
    clearCooldownTimer(); // never run two intervals at once
    setCooldown(seconds);
    cooldownIntervalRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearCooldownTimer();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // Leak safety: tear the interval down when the component unmounts.
  useEffect(() => clearCooldownTimer, []);

  // Visitor arrived via a WhatsApp auction deep link — after auth, App.tsx routes
  // them straight into that live room. Tell them why they're here. Check the new
  // `/auction/:id` path AND the legacy `?auction=` query (old shared links).
  const cameFromAuctionLink =
    !!parseAuctionIdFromPath(window.location.pathname) ||
    !!parseAuctionIdFromSearch(window.location.search);

  // Live inventory for the marketing panel. `useLandingAuctions` is a
  // module-level cached single getDocs (limit 60) — a visitor who touched the
  // landing page pays nothing and a direct arrival pays one read. No new query,
  // no index, no listener. The panel renders nothing until it resolves, and the
  // sign-in form never waits on it.
  const landingAuctions = useLandingAuctions();
  const panelLang: 'ar' | 'en' = isAr ? 'ar' : 'en';

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
    const e164 = phone.e164;
    if (!e164) {
      setPhoneErr(isAr ? 'أدخل رقم هاتف صالح' : 'Enter a valid phone number');
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
      // Force grecaptcha to load + register the widget BEFORE signInWithPhoneNumber
      // triggers verify(). Without this, an invisible reCAPTCHA can be verify()'d
      // before the script/widget is ready and the challenge silently never fires —
      // the intermittent "reCAPTCHA doesn't fire" bug (worse cold / on slow networks).
      await recaptchaRef.current.render();
      const result = await loginWithPhone(e164, recaptchaRef.current);
      setConfirmation(result);
      startCooldown(); // (re)start the 60s resend window on every successful send
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
    else { clearCooldownTimer(); setCooldown(0); } // verified — no more resend timer
    // On success, onAuthStateChanged flips isAuthenticated and the app renders the main shell.
  };

  // --- WhatsApp OTP (primary phone channel) ------------------------------------
  const handleWaSendCode = async () => {
    if (waBusy) return; // ignore rapid double-clicks (belt-and-suspenders with the disabled button)
    setWaErr('');
    const e164 = phone.e164;
    if (!e164) {
      setWaErr(isAr ? 'أدخل رقم هاتف صالح' : 'Enter a valid phone number');
      return;
    }
    setWaBusy(true);
    try {
      const res = await requestWhatsappOtp(e164);
      if (!res.ok) {
        const wait = res.retryAfterSec;
        setWaErr(
          wait
            ? (isAr ? `الرجاء الانتظار ${wait} ثانية قبل إعادة إرسال الرمز` : `Please wait ${wait}s before requesting another code`)
            : (isAr ? 'تعذّر إرسال الرمز، حاول مرة أخرى' : 'Could not send the code, please try again.')
        );
        if (wait) startCooldown(wait); // reflect the server-imposed wait in the resend UI
        return;
      }
      setWaSent(true);
      startCooldown(); // (re)start the 60s resend window on every successful send
    } catch (e) {
      console.warn('WhatsApp OTP (send code) failed:', e);
      setWaErr(isAr ? 'تعذّر إرسال الرمز، حاول مرة أخرى' : 'Could not send the code, please try again.');
    } finally {
      setWaBusy(false);
    }
  };

  const handleWaVerify = async () => {
    if (waBusy) return; // ignore rapid double-clicks (belt-and-suspenders with the disabled button)
    setWaErr('');
    const e164 = phone.e164;
    if (!e164) {
      setWaErr(isAr ? 'أدخل رقم هاتف صالح' : 'Enter a valid phone number');
      return;
    }
    if (waCode.trim().length < 4) {
      setWaErr(isAr ? 'أدخل رمز التحقق.' : 'Enter the verification code.');
      return;
    }
    setWaBusy(true);
    try {
      const res = await verifyWhatsappOtp(e164, waCode.trim());
      if (res.ok && res.token) {
        clearCooldownTimer(); // verified — no more resend timer
        setCooldown(0);
        await signInWhatsapp(res.token);
        // On success, onAuthStateChanged flips isAuthenticated and the app renders the main shell.
      } else {
        setWaErr(isAr ? 'الرمز غير صحيح أو منتهي' : 'Wrong or expired code');
      }
    } catch (e) {
      console.warn('WhatsApp OTP (verify) failed:', e);
      setWaErr(isAr ? 'الرمز غير صحيح أو منتهي' : 'Wrong or expired code');
    } finally {
      setWaBusy(false);
    }
  };

  // Switch to the Firebase reCAPTCHA/SMS fallback, clearing any WhatsApp progress.
  const switchToSms = () => {
    setPhoneChannel('sms');
    setWaErr('');
    setWaSent(false);
    setWaCode('');
    clearCooldownTimer();
    setCooldown(0);
  };

  // Switch back to the WhatsApp primary channel, tearing down the reCAPTCHA verifier.
  const switchToWhatsapp = () => {
    setPhoneChannel('whatsapp');
    setPhoneErr('');
    setConfirmation(null);
    setSmsCode('');
    clearCooldownTimer();
    setCooldown(0);
    clearRecaptcha();
  };

  const handlePhoneBack = () => {
    setPhoneMode(false);
    setConfirmation(null);
    setSmsCode('');
    setPhoneErr('');
    // reset WhatsApp channel state too, and default back to the primary channel
    setPhoneChannel('whatsapp');
    setWaSent(false);
    setWaCode('');
    setWaErr('');
    clearCooldownTimer(); // going back to edit the number resets the resend window
    setCooldown(0);
    clearRecaptcha();
    // Without these, tapping Back while a send/resend is still in flight
    // leaves the NEXT attempt's "Send code" button stuck disabled (both
    // panels gate on these flags) until the abandoned request happens to
    // resolve — with no indication to the user why they can't send a code.
    setPhoneBusy(false);
    setWaBusy(false);
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
      className="min-h-screen w-full bg-surface-sunken text-fg flex flex-col justify-center items-center p-4 md:p-8 font-sans select-none relative"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="login-view-root"
    >
      {/* Top Absolute Header with Logo & Language Toggle */}
      <header className="absolute top-6 left-6 right-6 flex justify-between items-center max-w-7xl w-full mx-auto px-4 pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto">
          <BrandMark className="w-8 h-8" />
          <div>
            <span className="font-mono font-black text-base text-fg tracking-tight">{t.appName}</span>
          </div>
        </div>

        <button 
          onClick={handleLanguageToggle}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line bg-surface-raised text-xs font-semibold hover:bg-surface-sunken transition-colors shadow-sm"
          id="lang-toggle-btn"
        >
          <Globe className="w-3.5 h-3.5 text-fg-muted" />
          <span>{t.langLabel}</span>
        </button>
      </header>

      {/*
        Two columns on lg: marketing left, the sign-in card right. Below lg it is
        one column, ordered message → card → steps. That mobile ordering is the
        deliberate trade recorded in the spec, and the compact block above is
        kept short so the buttons stay reachable without scrolling.
      */}
      {/*
        lg:pt-20 clears the ABSOLUTE header (top-6, 32px tall — its box ends at
        56px). Without it the first line of the panel renders underneath the
        logo: on desktop the activity count sat at y=32 and "8 lots live right
        now" collided with "MAZZADO". Padding on the wrapper rather than on
        either column, so lg:items-center keeps the two aligned to each other.
        Mobile needs none — the compact block carries its own mt-16.
      */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row lg:items-start lg:justify-center lg:gap-12 lg:pt-24 z-10">

        {/* Desktop left column: everything — the lots, then trust, then how it
            works. There is room beside the card here, so the inventory leads.
            On MOBILE the same lots move under the card instead (see below), so
            the form is the first thing on a small screen. */}
        <div className="hidden lg:block lg:flex-1">
          <SignInMarketingPanel state={landingAuctions} lang={panelLang} variant="full" />
        </div>

        <div className="w-full lg:flex-1 lg:max-w-md flex flex-col items-center">

      {/* Deep-link context: the visitor followed a live-auction link — say so */}
      {cameFromAuctionLink && !signInIntent && (
        <div
          className="w-full max-w-md bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-[#C2410C] rounded-2xl px-4 py-2.5 text-xs font-bold text-center z-10 lg:mt-16"
          id="deep-link-auction-banner"
        >
          {isAr ? '⚡ سجّل دخولك للمشاركة في المزاد المباشر' : '⚡ Sign in to join the live auction'}
        </div>
      )}

      {/* Center White Modal Box */}
      <div className={`w-full max-w-md bg-surface-raised rounded-3xl p-6 md:p-8 border border-line shadow-[0_8px_30px_rgb(0,0,0,0.04)] z-10 ${cameFromAuctionLink ? 'mt-4 mb-2' : 'mt-16 mb-2 lg:mt-0'}`}>

        {/* Title */}
        <h1 className="text-2xl font-black text-fg tracking-tight text-center mb-1.5">
          {prompt.headline}
        </h1>
        <p className="text-xs text-fg-muted font-semibold text-center mb-6">
          {prompt.subline}
        </p>

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
          ) : phoneChannel === 'whatsapp' ? (
            <div className="space-y-2" id="whatsapp-login-panel">
              {!waSent ? (
                <>
                  <PhoneInput
                    value={{ country: phone.country, national: phone.national }}
                    onChange={setPhone}
                    lang={language}
                    id="wa-phone-number-input"
                  />
                  <button
                    type="button"
                    disabled={waBusy}
                    onClick={handleWaSendCode}
                    className="w-full h-11 bg-[#25D366] hover:bg-[#1EBE5B] text-white text-sm font-bold rounded-full shadow-sm transition-all duration-200 ease-out disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    id="wa-send-code-btn"
                  >
                    {waBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{isAr ? 'جاري الإرسال…' : 'Sending…'}</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-5 h-5 shrink-0" />
                        <span>{isAr ? 'إرسال الرمز عبر واتساب' : 'Send code on WhatsApp'}</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-fg-muted font-medium text-center" id="wa-delivery-hint">
                    {isAr ? 'سنرسل الرمز إلى رقمك على واتساب' : "We'll send the code to your number on WhatsApp."}
                  </p>
                </>
              ) : (
                <>
                  <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder={isAr ? 'رمز التحقق' : 'Verification code'}
                    value={waCode}
                    onChange={(e) => setWaCode(e.target.value)}
                    className="w-full h-11 bg-surface-raised border border-line rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-fg placeholder-gray-400 transition-all tracking-widest text-center"
                    id="wa-code-input"
                  />
                  <button
                    type="button"
                    disabled={waBusy}
                    onClick={handleWaVerify}
                    className="w-full h-11 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-sm font-bold rounded-full shadow-sm transition-all duration-200 ease-out disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    id="wa-verify-code-btn"
                  >
                    {waBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{isAr ? 'جاري التحقق…' : 'Verifying…'}</span>
                      </>
                    ) : (
                      <span>{isAr ? 'تأكيد' : 'Verify'}</span>
                    )}
                  </button>
                  <div className="text-center space-y-1 pt-1" id="wa-resend-block">
                    <p className="text-[11px] text-fg-muted font-medium">
                      {isAr
                        ? `أرسلنا رمزاً عبر واتساب إلى ${phone.e164 ?? ''}. لم يصلك؟`
                        : `We sent a code on WhatsApp to ${phone.e164 ?? ''}. Didn't get it?`}
                    </p>
                    {cooldown > 0 ? (
                      <span className="text-xs text-fg-muted font-semibold" id="wa-resend-cooldown">
                        {isAr ? `أعد الإرسال خلال ${cooldown} ث` : `Resend in ${cooldown}s`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={waBusy}
                        onClick={handleWaSendCode}
                        className="text-xs text-[#FF6B00] hover:text-[#E05E00] font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        id="wa-resend-btn"
                      >
                        {isAr ? 'إعادة إرسال الرمز' : 'Resend code'}
                      </button>
                    )}
                  </div>
                </>
              )}
              {waErr && (
                <p className="text-red-600 text-xs font-semibold" id="wa-login-error">{waErr}</p>
              )}
              {/* Fallback: switch to the Firebase reCAPTCHA/SMS path */}
              <button
                type="button"
                onClick={switchToSms}
                className="w-full text-xs text-[#FF6B00] hover:text-[#E05E00] font-bold transition-colors pt-1"
                id="wa-sms-fallback-link"
              >
                {isAr ? 'ما عندك واتساب؟ أرسل SMS' : 'No WhatsApp? Send SMS instead'}
              </button>
              <button
                type="button"
                onClick={handlePhoneBack}
                className="w-full text-xs text-fg-muted hover:text-fg font-semibold transition-colors"
                id="phone-back-btn"
              >
                {isAr ? 'رجوع' : 'Back'}
              </button>
            </div>
          ) : (
            <div className="space-y-2" id="phone-login-panel">
              {!confirmation ? (
                <>
                  <PhoneInput
                    value={{ country: phone.country, national: phone.national }}
                    onChange={setPhone}
                    lang={language}
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
                  <p className="text-[11px] text-fg-muted font-medium text-center" id="phone-delivery-hint">
                    {isAr ? 'قد يستغرق وصول الرمز حتى دقيقة' : 'The code can take up to a minute to arrive.'}
                  </p>
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
                    className="w-full h-11 bg-surface-raised border border-line rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-fg placeholder-gray-400 transition-all tracking-widest text-center"
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
                  <div className="text-center space-y-1 pt-1" id="phone-resend-block">
                    <p className="text-[11px] text-fg-muted font-medium">
                      {isAr
                        ? `أرسلنا رمزاً إلى ${phone.e164 ?? ''}. لم يصلك؟`
                        : `We sent a code to ${phone.e164 ?? ''}. Didn't get it?`}
                    </p>
                    {cooldown > 0 ? (
                      <span className="text-xs text-fg-muted font-semibold" id="phone-resend-cooldown">
                        {isAr ? `أعد الإرسال خلال ${cooldown} ث` : `Resend in ${cooldown}s`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={phoneBusy}
                        onClick={handleSendCode}
                        className="text-xs text-[#FF6B00] hover:text-[#E05E00] font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        id="phone-resend-btn"
                      >
                        {isAr ? 'إعادة إرسال الرمز' : 'Resend code'}
                      </button>
                    )}
                  </div>
                </>
              )}
              {phoneErr && (
                <p className="text-red-600 text-xs font-semibold" id="phone-login-error">{phoneErr}</p>
              )}
              {/* Back to the WhatsApp primary channel */}
              <button
                type="button"
                onClick={switchToWhatsapp}
                className="w-full text-xs text-[#25D366] hover:text-[#1EBE5B] font-bold transition-colors pt-1"
                id="wa-switch-back-link"
              >
                {isAr ? 'استخدم واتساب بدلاً من ذلك' : 'Use WhatsApp instead'}
              </button>
              <button
                type="button"
                onClick={handlePhoneBack}
                className="w-full text-xs text-fg-muted hover:text-fg font-semibold transition-colors"
                id="phone-back-btn"
              >
                {isAr ? 'رجوع' : 'Back'}
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="flex-1 h-px bg-surface-sunken" />
            <span className="text-[11px] text-fg-muted font-semibold">{isAr ? 'أو' : 'or'}</span>
            <div className="flex-1 h-px bg-surface-sunken" />
          </div>

          {/* Continue with Google (secondary) */}
          <button
            type="button"
            onClick={handleGoogleClick}
            className="w-full h-11 flex items-center justify-center gap-3 bg-surface-raised hover:bg-surface-sunken border border-line text-fg text-sm font-bold rounded-full shadow-sm transition-all"
            id="google-login-btn"
          >
            <GoogleIcon />
            <span>{isAr ? 'المتابعة بـ Google' : 'Continue with Google'}</span>
          </button>
        </div>

        {/* Guest browsing: back to the read-only browse shell */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full mt-4 text-xs text-fg-muted hover:text-fg font-bold transition-colors cursor-pointer"
            id="login-continue-browsing-btn"
          >
            {isAr ? '← متابعة التصفح بدون تسجيل' : '← Continue browsing without an account'}
          </button>
        )}

      </div>

        {/* MOBILE ONLY: the live lots sit under the card, so the form leads on
            a small screen. Desktop shows them in the left column instead — the
            markup carries both and CSS picks one. */}
        <div className="lg:hidden w-full max-w-md mt-6">
          <SignInMarketingPanel state={landingAuctions} lang={panelLang} variant="activity" />
        </div>

        {/* Mobile only: the story follows the lots. On desktop it is the left
            column instead. */}
        <div className="lg:hidden w-full max-w-md mt-8 mb-8">
          <SignInMarketingPanel state={landingAuctions} lang={panelLang} variant="story" />
        </div>

        </div>
      </div>

      {/* Policy Footer */}
      <footer className="text-center text-[11px] text-fg-muted font-medium tracking-wide max-w-xs mx-auto pt-4 border-t border-line w-full mt-auto">
        {t.tagline}
      </footer>
    </div>
  );
};
