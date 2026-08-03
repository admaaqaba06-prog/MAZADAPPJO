import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { resolveMissingContact } from '../utils/guestGate';
import { DEFAULT_COUNTRY } from '../utils/phoneNumber';
import type { CountryCode } from 'libphonenumber-js';
import { mapAuthError } from '../utils/authErrors';
import { PhoneInput } from './ui/PhoneInput';
import { Phone, Mail, ShieldCheck, Loader2, ArrowRight, ArrowLeft, MessageCircle } from 'lucide-react';
import { useResendCooldown } from '../hooks/useResendCooldown';
import { auth } from '../services/firebase';

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
  const {
    currentUser, language, requestWhatsappOtp, attachWhatsappPhone, saveEmail,
    // The SMS fallback. These have existed on the context since E5 — written for
    // THIS modal (see their comment in AppContext) and consumed by nothing until
    // now. They link the credential to the current uid rather than signing into
    // a new phone account, so the wallet and history survive.
    linkPhoneSendCode, linkPhoneToAccount,
  } = useApp();
  const isAr = language === 'ar';

  // Live missing-contact evaluation — mirrors of currentUser (written by the
  // attach/saveEmail actions) flip these to false as each channel is satisfied.
  const { needsPhone, needsEmail } = resolveMissingContact(currentUser);

  // Phone flow (send WhatsApp code -> verify + attach) state
  const [phone, setPhone] = useState<{ country: CountryCode; national: string; e164: string | null }>({
    country: DEFAULT_COUNTRY,
    national: '',
    e164: null,
  });
  const [smsCode, setSmsCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');

  // WhatsApp is the DEFAULT, not merely the first option: Firebase's SMS routing
  // to Jordanian carriers is the slow, lossy path this product deliberately
  // moved off (docs/superpowers/specs/2026-07-23-local-sms-otp-provider-design.md).
  // SMS exists here for people who do not use WhatsApp.
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  // Set by the SMS branch only; the confirm step needs it to build the credential.
  const verificationIdRef = useRef<string | null>(null);
  const recaptchaRef = useRef<any>(null);
  const { cooldown, start: startCooldown, clear: clearCooldown } = useResendCooldown();

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
    const e164 = phone.e164;
    if (!e164) {
      setPhoneErr(isAr ? 'أدخل رقم هاتف صالح' : 'Enter a valid phone number');
      return;
    }
    setPhoneBusy(true);
    try {
      if (channel === 'sms') {
        // Firebase phone auth needs an invisible reCAPTCHA. Built lazily and
        // reused, mirroring LoginView — constructing a second verifier against
        // the same container throws.
        if (!recaptchaRef.current) {
          const { RecaptchaVerifier } = await import('firebase/auth');
          const verifier = new RecaptchaVerifier(auth, 'contact-recaptcha-container', { size: 'invisible' });
          await verifier.render();
          recaptchaRef.current = verifier;
        }
        verificationIdRef.current = await linkPhoneSendCode(e164, recaptchaRef.current);
        setCodeSent(true);
        startCooldown();
      } else {
        // Sends a 6-digit code over WhatsApp (no reCAPTCHA). ok:false means the
        // server-side cooldown/rate-limit is active — surface the wait, not an error.
        const res = await requestWhatsappOtp(e164);
        if (res.ok) {
          setCodeSent(true);
          startCooldown();
        } else {
          // Honour the SERVER's wait in the resend UI rather than starting a
          // fresh 60s that would let the button re-enable before it is allowed.
          const secs = res.retryAfterSec ?? 60;
          setCodeSent(true);
          startCooldown(secs);
          setPhoneErr(isAr
            ? `الرجاء الانتظار ${secs} ثانية قبل إعادة إرسال الرمز.`
            : `Please wait ${secs}s before requesting another code.`);
        }
      }
    } catch (e: any) {
      console.warn(`Contact phone OTP (send, ${channel}) failed:`, e);
      setPhoneErr(mapAuthError(e, isAr));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (phoneBusy) return; // ignore rapid double-clicks
    setPhoneErr('');
    const e164 = phone.e164;
    if (!e164) {
      setPhoneErr(isAr ? 'أدخل رقم هاتف صالح' : 'Enter a valid phone number');
      return;
    }
    if (!codeSent || smsCode.trim().length < 4) {
      setPhoneErr(isAr ? 'أدخل رمز التحقق.' : 'Enter the verification code.');
      return;
    }
    setPhoneBusy(true);
    try {
      if (channel === 'sms') {
        if (!verificationIdRef.current) {
          setPhoneErr(isAr ? 'أعد إرسال الرمز.' : 'Request a new code.');
          return;
        }
        // Links the credential to THIS uid (never signs into a separate phone
        // account), then mirrors currentUser so the completion effect proceeds.
        // Throws on a bad code, so reaching the next line means it worked.
        await linkPhoneToAccount(verificationIdRef.current, smsCode.trim());
        clearCooldown();
        setCodeSent(false);
        setSmsCode('');
        verificationIdRef.current = null;
        return;
      }
      // Verifies the code + attaches the number to THIS uid server-side. On success
      // the wrapper writes the phone to the user doc and mirrors currentUser, so the
      // completion effect proceeds (or the email field renders if still missing).
      const res = await attachWhatsappPhone(e164, smsCode.trim());
      if (res.ok) {
        clearCooldown();
        setCodeSent(false);
        setSmsCode('');
      } else {
        setPhoneErr(isAr ? 'رمز غير صحيح أو منتهي الصلاحية.' : 'Incorrect or expired code.');
      }
    } catch (e: any) {
      console.warn(`Contact phone OTP (verify, ${channel}) failed:`, e);
      // The SMS path throws this when the number is already on another Firebase
      // account. Same meaning as the callable's already-exists — never merge or
      // orphan this user's wallet by linking it anyway.
      if (e?.code === 'auth/credential-already-in-use' || e?.code === 'auth/account-exists-with-different-credential') {
        setPhoneErr(isAr
          ? 'هذا الرقم مسجّل على حساب آخر. استخدم رقماً مختلفاً.'
          : 'This number is already on another account. Use a different number.');
        return;
      }
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
    // MUST invalidate: a verificationId belongs to the number it was issued for.
    // Kept across a number change, the SMS branch would link the OLD number to
    // this account while the UI showed the new one.
    verificationIdRef.current = null;
    // The cooldown belongs to the previous number too — a fresh number should
    // not inherit its wait.
    clearCooldown();
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
        className="relative bg-surface-raised text-fg w-full max-w-sm rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in scale-in duration-200 p-6 md:p-8"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="contact-completion-modal"
        role="dialog"
        aria-modal="true"
      >
        {/* Headline */}
        <div className="text-center space-y-3 mb-6">
          <div className="mx-auto w-11 h-11 rounded-full bg-accent-weak border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-lg md:text-xl font-black text-fg tracking-tight leading-snug">
            {isAr ? 'أكمل معلومات التواصل' : 'Complete your contact info'}
          </h2>
          <p className="text-xs text-fg-muted max-w-xs mx-auto leading-normal">
            {isAr
              ? 'نحتاج طريقة للتواصل معك حول مزايداتك وطلباتك قبل المتابعة.'
              : 'We need a way to reach you about your bids and orders before you continue.'}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Phone — only when missing */}
          {needsPhone && (
            <div className="flex flex-col gap-2">
              {/* The label used to sit OUTSIDE this branch, so after sending it
                  still read "Phone number" above a code box — and the number the
                  code went to was nowhere on screen. */}
              <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {!codeSent
                  ? (isAr ? 'رقم الهاتف' : 'Phone number')
                  : (isAr ? 'رمز التحقق' : 'Verification code')}
              </span>

              {codeSent && phone.e164 && (
                <p className="text-[11px] text-fg-muted font-medium" dir="ltr">
                  {channel === 'sms'
                    ? (isAr ? `أُرسل برسالة نصية إلى ${phone.e164}` : `Sent by SMS to ${phone.e164}`)
                    : (isAr ? `أُرسل عبر واتساب إلى ${phone.e164}` : `Sent on WhatsApp to ${phone.e164}`)}
                </p>
              )}

              {!codeSent ? (
                <>
                  {/* Channel choice, same two options as sign-in. WhatsApp is
                      pre-selected because Firebase's SMS route to Jordanian
                      carriers is the slow one. */}
                  <div className="flex gap-2">
                    {(['whatsapp', 'sms'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setChannel(c)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black border transition-colors cursor-pointer ${
                          channel === c
                            ? 'bg-[#FF6B00]/10 border-[#FF6B00] text-[#FF6B00]'
                            : 'bg-surface-raised border-line text-fg-muted hover:border-line'
                        }`}
                      >
                        {c === 'whatsapp'
                          ? <><MessageCircle className="w-3.5 h-3.5" />{isAr ? 'واتساب' : 'WhatsApp'}</>
                          : <><Phone className="w-3.5 h-3.5" />{isAr ? 'رسالة نصية' : 'SMS'}</>}
                      </button>
                    ))}
                  </div>
                  <PhoneInput
                    value={{ country: phone.country, national: phone.national }}
                    onChange={setPhone}
                    lang={language}
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
                  <p className="text-[11px] text-fg-muted font-medium text-center">
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
                    className="w-full border border-line rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-surface-sunken tracking-widest text-center"
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
                  {/* Resend. Disabled for the whole cooldown so a second tap
                      cannot outrun the server's own rate limit — when the server
                      reports a wait, that wait is what counts down here. */}
                  <button
                    type="button"
                    disabled={cooldown > 0 || phoneBusy}
                    onClick={handleSendCode}
                    className="w-full text-xs font-bold text-[#FF6B00] hover:text-[#c94d03] transition-colors cursor-pointer disabled:text-fg-muted disabled:cursor-not-allowed"
                    id="contact-resend-btn"
                  >
                    {cooldown > 0
                      ? (isAr ? `إعادة الإرسال خلال ${cooldown} ثانية` : `Resend in ${cooldown}s`)
                      : (isAr ? 'إعادة إرسال الرمز' : 'Resend code')}
                  </button>
                  <button
                    type="button"
                    onClick={handlePhoneBack}
                    className="w-full text-xs text-fg-muted hover:text-fg font-semibold transition-colors"
                    id="contact-phone-back-btn"
                  >
                    {isAr ? 'تغيير الرقم' : 'Change number'}
                  </button>
                </>
              )}

              {/* Invisible reCAPTCHA host for the SMS branch. Must exist in the
                  DOM before RecaptchaVerifier renders into it. */}
              <div id="contact-recaptcha-container" />

              {phoneErr && (
                <p className="text-xs font-bold text-red-500" role="alert" id="contact-phone-error">{phoneErr}</p>
              )}
            </div>
          )}

          {/* Email — only when missing */}
          {needsEmail && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
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
                className="w-full border border-line rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-surface-sunken text-left"
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
            className="w-full text-xs text-fg-muted hover:text-fg font-bold transition-colors cursor-pointer"
            id="contact-completion-dismiss"
          >
            {isAr ? 'لاحقاً' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  );
};
