import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { resolveMissingContact } from '../utils/guestGate';
import { toE164Jordan } from '../utils/phoneNumber';
import { mapAuthError } from '../utils/authErrors';
import { Phone, Mail, ShieldCheck, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';

// Deliberately loose email check — email is UNVERIFIED in E5 (receipts only), so
// this only catches typos/blanks. Matches guestGate.EMAIL_RE.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactCompletionModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired once every REQUIRED contact field (per resolveMissingContact) is satisfied. */
  onComplete: () => void;
}

/**
 * E5 contact completion gate. A member with a real photo who taps bid/sell but is
 * missing a contact channel is shown this modal (mounted by A4). It ATTACHES the
 * missing channel to the CURRENT signed-in account:
 *  - Phone: E.164 input -> "Send code" (requestWhatsappOtp, code over WhatsApp) ->
 *    6-digit OTP -> "Verify" (attachWhatsappPhone, which attaches the number to THIS
 *    uid server-side so the uid — and the user's wallet/history — is preserved; it
 *    NEVER signs into a separate phone account).
 *  - Email: validated input -> "Save" (saveEmail).
 * Only the field(s) resolveMissingContact(currentUser) reports as missing render.
 */
export const ContactCompletionModal: React.FC<ContactCompletionModalProps> = ({ open, onClose, onComplete }) => {
  const { currentUser, language, requestWhatsappOtp, attachWhatsappPhone, saveEmail } = useApp();
  const isAr = language === 'ar';

  // Live missing-contact evaluation — mirrors of currentUser (written by the
  // attach/saveEmail actions) flip these to false as each channel is satisfied.
  const { needsPhone, needsEmail } = resolveMissingContact(currentUser);

  // Phone flow (send WhatsApp code -> verify + attach) state
  const [phoneInput, setPhoneInput] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');

  // Email flow state
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState('');

  // Completion: once every required field is satisfied, hand control back so the
  // gate can proceed (A4). Fires when the mirrored currentUser clears the last need.
  useEffect(() => {
    if (!open) return;
    if (!needsPhone && !needsEmail) onComplete();
  }, [open, needsPhone, needsEmail, onComplete]);

  if (!open) return null;

  const handleSendCode = async () => {
    if (phoneBusy) return; // ignore rapid double-clicks
    setPhoneErr('');
    const e164 = toE164Jordan(phoneInput);
    if (!e164) {
      setPhoneErr(isAr ? 'أدخل رقم هاتف أردني صالح (07xxxxxxxx)' : 'Enter a valid Jordanian mobile number (07xxxxxxxx)');
      return;
    }
    setPhoneBusy(true);
    try {
      // Sends a 6-digit code over WhatsApp (no reCAPTCHA). ok:false means the
      // server-side cooldown/rate-limit is active — surface the wait, not an error.
      const res = await requestWhatsappOtp(phoneInput);
      if (res.ok) {
        setCodeSent(true);
      } else {
        const secs = res.retryAfterSec ?? 60;
        setPhoneErr(isAr
          ? `الرجاء الانتظار ${secs} ثانية قبل إعادة إرسال الرمز.`
          : `Please wait ${secs}s before requesting another code.`);
      }
    } catch (e: any) {
      console.warn('Contact phone WhatsApp OTP (send code) failed:', e);
      setPhoneErr(mapAuthError(e, isAr));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (phoneBusy) return; // ignore rapid double-clicks
    setPhoneErr('');
    if (!codeSent || smsCode.trim().length < 4) {
      setPhoneErr(isAr ? 'أدخل رمز التحقق.' : 'Enter the verification code.');
      return;
    }
    setPhoneBusy(true);
    try {
      // Verifies the code + attaches the number to THIS uid server-side. On success
      // the wrapper writes the phone to the user doc and mirrors currentUser, so the
      // completion effect proceeds (or the email field renders if still missing).
      const res = await attachWhatsappPhone(phoneInput, smsCode.trim());
      if (res.ok) {
        setCodeSent(false);
        setSmsCode('');
      } else {
        setPhoneErr(isAr ? 'رمز غير صحيح أو منتهي الصلاحية.' : 'Incorrect or expired code.');
      }
    } catch (e: any) {
      console.warn('Contact phone WhatsApp OTP (verify) failed:', e);
      // The number already belongs to a different account — do NOT merge/orphan
      // this user's wallet/history. Tell them plainly.
      if (e?.code === 'functions/already-exists') {
        setPhoneErr(isAr
          ? 'هذا الرقم مسجّل على حساب آخر. استخدم رقماً مختلفاً.'
          : 'This number is already on another account. Use a different number.');
      } else {
        setPhoneErr(mapAuthError(e, isAr));
      }
    } finally {
      setPhoneBusy(false);
    }
  };

  const handlePhoneBack = () => {
    setCodeSent(false);
    setSmsCode('');
    setPhoneErr('');
  };

  const handleSaveEmail = async () => {
    if (emailBusy) return;
    setEmailErr('');
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailErr(isAr ? 'أدخل بريداً إلكترونياً صالحاً.' : 'Enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    try {
      await saveEmail(trimmed);
      // Mirrored currentUser clears needsEmail; the completion effect proceeds.
    } catch (e: any) {
      console.warn('Contact email save failed:', e);
      setEmailErr(isAr ? 'تعذّر حفظ البريد الإلكتروني. حاول مرة أخرى.' : 'Could not save your email. Please try again.');
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="relative bg-white text-gray-900 w-full max-w-sm rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in scale-in duration-200 p-6 md:p-8"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="contact-completion-modal"
        role="dialog"
        aria-modal="true"
      >
        {/* Headline */}
        <div className="text-center space-y-3 mb-6">
          <div className="mx-auto w-11 h-11 rounded-full bg-orange-50 border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-lg md:text-xl font-black text-gray-900 tracking-tight leading-snug">
            {isAr ? 'أكمل معلومات التواصل' : 'Complete your contact info'}
          </h2>
          <p className="text-xs text-gray-500 max-w-xs mx-auto leading-normal">
            {isAr
              ? 'نحتاج طريقة للتواصل معك حول مزايداتك وطلباتك قبل المتابعة.'
              : 'We need a way to reach you about your bids and orders before you continue.'}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Phone — only when missing */}
          {needsPhone && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {isAr ? 'رقم الهاتف' : 'Phone number'}
              </span>

              {!codeSent ? (
                <>
                  <input
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="07xxxxxxxx"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-gray-50 text-left"
                    id="contact-completion-phone"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={handleSendCode}
                    className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    id="contact-send-code-btn"
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
                  <p className="text-[11px] text-gray-400 font-medium text-center">
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
                    onChange={e => setSmsCode(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-gray-50 tracking-widest text-center"
                    id="contact-code-input"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={handleVerifyCode}
                    className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    id="contact-verify-code-btn"
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
                  <button
                    type="button"
                    onClick={handlePhoneBack}
                    className="w-full text-xs text-gray-500 hover:text-gray-700 font-semibold transition-colors"
                    id="contact-phone-back-btn"
                  >
                    {isAr ? 'تغيير الرقم' : 'Change number'}
                  </button>
                </>
              )}

              {phoneErr && (
                <p className="text-xs font-bold text-red-500" role="alert" id="contact-phone-error">{phoneErr}</p>
              )}
            </div>
          )}

          {/* Email — only when missing */}
          {needsEmail && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {isAr ? 'البريد الإلكتروني' : 'Email address'}
              </span>
              <input
                type="email"
                dir="ltr"
                placeholder={isAr ? 'name@example.com' : 'name@example.com'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-gray-50 text-left"
                id="contact-completion-email"
              />
              <button
                type="button"
                disabled={emailBusy}
                onClick={handleSaveEmail}
                className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                id="contact-save-email-btn"
              >
                {emailBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{isAr ? 'جاري الحفظ…' : 'Saving…'}</span>
                  </>
                ) : (
                  <>
                    <span>{isAr ? 'حفظ' : 'Save'}</span>
                    {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>
              {emailErr && (
                <p className="text-xs font-bold text-red-500" role="alert" id="contact-email-error">{emailErr}</p>
              )}
            </div>
          )}

          {/* Dismiss — the gate re-opens this on the next bid/sell tap if still incomplete */}
          <button
            type="button"
            onClick={onClose}
            className="w-full text-xs text-gray-500 hover:text-gray-800 font-bold transition-colors cursor-pointer"
            id="contact-completion-dismiss"
          >
            {isAr ? 'لاحقاً' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  );
};
