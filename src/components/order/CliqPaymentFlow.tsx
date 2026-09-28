/**
 * Embedded CliQ checkout (Bank al Etihad / Staq) — the buyer-facing screens.
 *
 * This is a PAYMENT METHOD added to the existing won-auction checkout, not a
 * new checkout. The order, its total, its state machine and the manual-transfer
 * path are all unchanged; picking CliQ here swaps which panel renders inside
 * the same `waiting_payment` block in OrderDetailsView.
 *
 * SCREEN ORDER, as BAE specified it:
 *   2  amount, non-editable
 *   3  breakdown + the payer's CliQ identifier
 *   4  confirmation, including which bank the request will reach
 *   5  the up-to-2-hours processing disclaimer, which must be acknowledged
 *   6  how to approve it from their own banking app
 *   7  live status: pending -> paid / rejected / expired
 *
 * WHAT THIS COMPONENT IS NOT ALLOWED TO DO. It never computes money — the
 * amount comes from `order.totalDue`, which the settler wrote — and it never
 * decides whether a request may be raised. The 90-minute duplicate lock is
 * enforced in functions/cliqPayment.js inside a transaction; what the lock does
 * HERE is decide what to draw, because a refresh must not be able to mint a
 * second request and a browser cannot be trusted to prevent one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark, ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle,
  ChevronLeft, Loader2, Smartphone,
} from 'lucide-react';
import { Order } from '../../types';
import { getCallableFunction } from '../../services/firebase';
import { logAnalyticsEvent, type AnalyticsEventType } from '../../services/analyticsService';
import { serverNow } from '../../utils/serverTime';
import { subscribeToSharedTicker } from '../../utils/sharedTicker';
import {
  cliqRequestState, formatCliqCountdown, isCliqSettled, type CliqPaymentStatus,
} from '../../utils/cliqRequest';
import {
  type CliqIdentifierType, isValidCliqIdentifier, normalizeCliqIdentifier,
  JO_MOBILE_PLACEHOLDER,
} from '../../utils/cliqIdentifier';
import { getBankNameFromIban, isKnownBank } from '../../utils/cliqIban';
import { CLIQ_PROCESSING_MAX_HOURS, arabicHours } from '../../constants/cliqGateway';
import { validateDeliveryAddress } from '../../utils/deliveryAddress';

type Step = 'amount' | 'details' | 'confirm' | 'submitted';

/** Narrowed so a typo cannot invent a funnel event that reports on nothing. */
type CliqAnalyticsEvent = Extract<AnalyticsEventType, `cliq_${string}`>;

interface Props {
  order: Order;
  isAr: boolean;
  /** Back to the payment-method choice (SCREEN 1 lives in OrderDetailsView). */
  onBack: () => void;
}

const jod = (n: number) => Number(n.toFixed(3)).toLocaleString('en-US', { minimumFractionDigits: 2 });

/** A money row in the breakdown. Bilingual label, exactly as BAE laid it out. */
function MoneyRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline gap-3 ${strong ? 'pt-2 border-t border-orange-100' : ''}`}>
      <span className={`text-[11px] ${strong ? 'font-black text-fg' : 'font-bold text-fg-muted'}`}>{label}</span>
      <span className={`font-mono tabular-nums ${strong ? 'text-lg font-black text-[#FF6B00]' : 'text-sm font-bold text-fg'}`}>
        {jod(value)}<span className="text-[10px] font-sans text-fg-muted"> JOD</span>
      </span>
    </div>
  );
}

export default function CliqPaymentFlow({ order, isAr, onBack }: Props) {
  const [step, setStep] = useState<Step>('amount');
  const [identifierType, setIdentifierType] = useState<CliqIdentifierType>('mobile');
  const [identifier, setIdentifier] = useState('');
  const [touched, setTouched] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A shared 1s tick drives the retry countdown. `serverNow()` rather than
  // Date.now() so a device with a wrong clock cannot appear to be outside the
  // 90-minute window — the same correction the auction countdowns use.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => subscribeToSharedTicker(() => setNow(serverNow())), []);

  const lock = useMemo(() => cliqRequestState(order, now), [order, now]);

  // The amount is the settled total the server persisted. Never recomputed
  // here — see the file header.
  const total = Number(order.totalDue ?? 0);
  const amount = Number(order.winningBidAmount ?? 0);
  const fees = Number.isFinite(Number(order.buyersPremium))
    ? Number(order.buyersPremium)
    : Math.max(0, total - amount);

  const valid = isValidCliqIdentifier(identifierType, identifier);

  // Mirrors the server precondition in functions/cliqPayment.js. Deliberately
  // the same shape as the manual rail's gate, so neither rail is the cheaper
  // door into a paid-but-undeliverable order.
  const hasDeliveryDetails = validateDeliveryAddress(order.deliveryAddress, order.deliveryPhone).valid;
  const bankName = getBankNameFromIban(order.cliqPayerIbanPrefix, isAr);

  // Analytics carry the bank NAME and never the identifier or the IBAN.
  const track = useCallback((event: CliqAnalyticsEvent, extra: Record<string, unknown> = {}) => {
    if (order.isSimulated === true) return; // admin test runs are not funnel data
    logAnalyticsEvent(event, order.buyerId ?? null, null, {
      orderId: order.id,
      auctionId: order.auctionId,
      amount: total,
      payerBankName: isKnownBank(order.cliqPayerIbanPrefix) ? bankName : 'unknown',
      ...extra,
    });
  }, [order.id, order.auctionId, order.buyerId, order.isSimulated, order.cliqPayerIbanPrefix, total, bankName]);

  useEffect(() => { track('cliq_payment_selected'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A pending request that survived a reload drops the buyer straight onto the
  // status screen — the flow they were in is the one still running.
  useEffect(() => {
    if (lock.status === 'pending' || isCliqSettled(lock.status)) setStep('submitted');
  }, [lock.status]);

  const submit = async () => {
    if (submitting || !valid || !acknowledged) return;
    setSubmitting(true);
    setError(null);
    try {
      const fn = await getCallableFunction('createCliqPaymentRequest');
      await fn({
        orderId: order.id,
        identifierType,
        identifier: normalizeCliqIdentifier(identifierType, identifier),
        // Sent so the SERVER can refuse a mismatch — never so it can use it.
        expectedTotal: total,
      });
      track('cliq_request_submitted');
      setStep('submitted');
    } catch (e: any) {
      if (e?.code === 'functions/resource-exhausted') {
        // The lock caught a request this browser thought it could raise —
        // the order snapshot will land in a moment and draw the countdown.
        track('cliq_duplicate_blocked');
        setStep('submitted');
      } else {
        setError(
          e?.message || (isAr ? 'تعذّر إنشاء طلب الدفع. حاول مرة أخرى.' : 'Could not create the payment request. Please try again.')
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Terminal outcomes are reported once each, when they land.
  useEffect(() => {
    if (lock.status === 'paid') track('cliq_payment_paid');
    else if (lock.status === 'rejected') track('cliq_payment_rejected');
    else if (lock.status === 'expired') track('cliq_payment_expired');
  }, [lock.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const Header = ({ title, onPrev }: { title: string; onPrev?: () => void }) => (
    <div className="flex items-center gap-2 pb-3 border-b border-orange-100">
      <button
        type="button"
        onClick={onPrev || onBack}
        className="p-1.5 -ms-1.5 rounded-xl text-fg-muted hover:text-[#FF6B00] transition-colors cursor-pointer"
        aria-label={isAr ? 'رجوع' : 'Back'}
      >
        <ChevronLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
      </button>
      <Landmark className="w-4 h-4 text-[#FF6B00] shrink-0" />
      <h3 className="text-sm font-black text-fg">{title}</h3>
    </div>
  );

  const shell = 'bg-accent-weak border border-[#FF6B00] rounded-2xl p-4 space-y-4';

  // ---- Precondition: somewhere to deliver ----------------------------------
  //
  // createCliqRequest refuses without a delivery address + phone, because a
  // gateway payment flips the order to 'paid' and unmounts the only form that
  // collects them — leaving a paid order nobody can ship. That refusal is the
  // real guard; this screen exists so the buyer meets an explanation rather
  // than a server error, and has a route to the form that takes it.
  if (!hasDeliveryDetails) {
    return (
      <div className={shell} id="cliq-screen-needs-address">
        <Header title={isAr ? 'الدفع عبر كليك (CliQ)' : 'Pay with CliQ'} />
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-amber-900 font-bold leading-relaxed">
            {isAr
              ? 'قبل الدفع لازم نعرف وين نوصّل القطعة. أضف عنوان التوصيل ورقم هاتفك من شاشة التحويل اليدوي، وبعدها ارجع لكليك.'
              : 'Before paying we need to know where to deliver. Add your delivery address and phone on the manual transfer screen, then come back to CliQ.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full bg-[#FF6B00] text-white rounded-xl py-3.5 text-sm font-black cursor-pointer hover:brightness-110 transition-all"
        >
          {isAr ? 'أضف عنوان التوصيل' : 'Add delivery address'}
        </button>
      </div>
    );
  }

  // ---- SCREEN 2 — amount, non-editable -------------------------------------
  if (step === 'amount') {
    return (
      <div className={shell} id="cliq-screen-amount">
        <Header title={isAr ? 'الدفع عبر كليك (CliQ)' : 'Pay with CliQ'} />
        <div className="space-y-2">
          <label htmlFor="cliq-amount-display" className="text-[10px] font-black text-fg-muted uppercase font-mono block">
            {isAr ? 'المبلغ المطلوب' : 'Amount due'}
          </label>
          {/* Non-editable by construction: readOnly AND disabled, so neither a
              tap nor a focus-and-type can change what is about to be charged. */}
          <input
            id="cliq-amount-display"
            type="text"
            readOnly
            disabled
            value={`${jod(total)} ${isAr ? 'د.أ' : 'JOD'}`}
            aria-describedby="cliq-amount-fixed-note"
            className="w-full bg-surface-raised border border-line rounded-xl px-4 py-3 text-xl font-black font-mono tabular-nums text-[#FF6B00] text-center disabled:opacity-100 cursor-not-allowed"
          />
          <p id="cliq-amount-fixed-note" className="text-[10.5px] text-fg-muted font-bold text-center">
            {isAr ? 'غير قابل للتعديل — هذا هو المبلغ النهائي للقطعة التي فزت بها.' : 'Not editable — this is the final amount for the lot you won.'}
          </p>
        </div>

        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[10.5px] text-emerald-800 font-bold leading-snug">
            {isAr
              ? 'مبلغك محمي: إذا لم تستلم القطعة كما وُصفت، افتح نزاعاً وسنسترجع لك المبلغ وفق سياسة حماية المشتري.'
              : 'Your payment is protected: if the item does not arrive as described, open a dispute and you are refunded under our buyer-protection policy.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStep('details')}
          className="w-full bg-[#FF6B00] text-white rounded-xl py-3.5 text-sm font-black cursor-pointer hover:brightness-110 transition-all"
        >
          {isAr ? 'متابعة' : 'Continue'}
        </button>
      </div>
    );
  }

  // ---- SCREEN 3 — breakdown + identifier -----------------------------------
  if (step === 'details') {
    return (
      <div className={shell} id="cliq-screen-details">
        <Header title={isAr ? 'تفاصيل الدفعة' : 'Payment details'} onPrev={() => setStep('amount')} />

        <div className="bg-surface-raised border border-line rounded-xl p-3 space-y-2">
          <MoneyRow label={isAr ? 'مبلغ الدفعة' : 'Payment amount'} value={amount} />
          {/* Shown even at 0.00, for transparency — BAE asked for the line to
              always be present rather than collapsing when there is no fee. */}
          <MoneyRow label={isAr ? 'الرسوم' : 'Fees'} value={fees} />
          <MoneyRow label={isAr ? 'الإجمالي' : 'Total'} value={total} strong />
        </div>

        <div className="space-y-2">
          <label htmlFor="cliq-id-type" className="text-[10px] font-black text-fg-muted uppercase font-mono block">
            {isAr ? 'نوع المُعرّف' : 'Identifier type'}
          </label>
          <select
            id="cliq-id-type"
            value={identifierType}
            onChange={(e) => {
              setIdentifierType(e.target.value as CliqIdentifierType);
              setIdentifier('');
              setTouched(false);
            }}
            className="w-full bg-surface-raised border border-line rounded-xl px-4 py-3 text-sm font-bold text-fg cursor-pointer"
          >
            <option value="mobile">{isAr ? 'رقم الهاتف (Mobile Number)' : 'Mobile Number'}</option>
            <option value="alias">{isAr ? 'الاسم المستعار (Alias)' : 'Alias'}</option>
          </select>
          <p className="text-[10px] text-fg-muted font-bold leading-snug">
            {identifierType === 'alias'
              ? (isAr ? 'الاسم المستعار المسجّل لدى بنكك لخدمة كليك.' : 'The alias you registered with your bank for CliQ.')
              : (isAr ? 'رقم الهاتف المرتبط بحسابك البنكي.' : 'The mobile number linked to your bank account.')}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cliq-id-value" className="text-[10px] font-black text-fg-muted uppercase font-mono block">
            {identifierType === 'alias'
              ? (isAr ? 'أدخل الاسم المستعار' : 'Enter alias')
              : (isAr ? 'أدخل رقم الهاتف' : 'Enter mobile number')}
          </label>
          <input
            id="cliq-id-value"
            type={identifierType === 'mobile' ? 'tel' : 'text'}
            inputMode={identifierType === 'mobile' ? 'tel' : 'text'}
            dir="ltr"
            autoComplete="off"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={identifierType === 'mobile' ? JO_MOBILE_PLACEHOLDER : 'MAZZADO123'}
            aria-invalid={touched && !valid}
            className={`w-full bg-surface-raised border rounded-xl px-4 py-3 text-base font-bold font-mono text-fg text-start ${
              touched && !valid ? 'border-red-400' : 'border-line'
            }`}
          />
          {touched && !valid && identifier.trim() !== '' && (
            <p className="text-[10.5px] text-red-600 font-bold">
              {identifierType === 'alias'
                ? (isAr ? 'الاسم المستعار يتكوّن من أحرف وأرقام إنجليزية فقط (3 خانات فأكثر).' : 'An alias is Latin letters and digits only, 3 characters or more.')
                : (isAr ? 'أدخل رقم أردني صحيح يبدأ بـ 77 أو 78 أو 79.' : 'Enter a valid Jordanian mobile starting 77, 78 or 79.')}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!valid}
          onClick={() => { track('cliq_details_entered'); setStep('confirm'); }}
          className="w-full bg-[#FF6B00] text-white rounded-xl py-3.5 text-sm font-black cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isAr ? 'متابعة' : 'Continue'}
        </button>
      </div>
    );
  }

  // ---- SCREENS 4 + 5 — confirmation and the processing disclaimer ----------
  if (step === 'confirm') {
    return (
      <div className={shell} id="cliq-screen-confirm">
        <Header title={isAr ? 'راجع وأكّد' : 'Review and confirm'} onPrev={() => setStep('details')} />

        <div className="bg-surface-raised border border-line rounded-xl p-3 space-y-2.5">
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-[11px] font-bold text-fg-muted">
              {identifierType === 'alias' ? (isAr ? 'الاسم المستعار' : 'Alias') : (isAr ? 'رقم الهاتف' : 'Mobile number')}
            </span>
            <span className="text-sm font-black font-mono text-fg" dir="ltr">
              {normalizeCliqIdentifier(identifierType, identifier)}
            </span>
          </div>
          <MoneyRow label={isAr ? 'مبلغ الدفعة' : 'Payment amount'} value={amount} />
          <MoneyRow label={isAr ? 'الرسوم' : 'Fees'} value={fees} />
          <MoneyRow label={isAr ? 'الإجمالي' : 'Total'} value={total} strong />
        </div>

        {/* SCREEN 4 — the bank. The same alias can exist at more than one bank,
            so naming it here is what removes the ambiguity before submission. */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Landmark className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900 font-bold leading-snug">
            {isAr
              ? `تأكد أنك تدفع من حساب كليك الخاص بك لدى: ${bankName}`
              : `Make sure to pay from your CliQ account at: ${bankName}`}
          </p>
        </div>

        {/* SCREEN 5 — must be acknowledged before Confirm & Pay enables. */}
        <label
          htmlFor="cliq-disclaimer"
          className="flex items-start gap-3 bg-surface-raised border border-line rounded-xl p-3 cursor-pointer"
        >
          <input
            id="cliq-disclaimer"
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => {
              setAcknowledged(e.target.checked);
              if (e.target.checked) track('cliq_disclaimer_acknowledged');
            }}
            className="w-5 h-5 mt-0.5 shrink-0 accent-[#FF6B00] cursor-pointer"
          />
          <span className="text-[11.5px] text-fg font-bold leading-relaxed">
            {isAr
              ? `عادةً تتم معالجة الدفعات فورياً، لكن في بعض الحالات قد تستغرق حتى ${arabicHours(CLIQ_PROCESSING_MAX_HOURS)}.`
              : `Payments are usually processed in real time. However, in some cases, processing may take up to ${CLIQ_PROCESSING_MAX_HOURS} hours.`}
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-800 font-bold leading-snug">{error}</p>
          </div>
        )}

        <button
          type="button"
          disabled={!acknowledged || submitting || !valid}
          onClick={() => { track('cliq_confirmation_viewed'); submit(); }}
          className="w-full bg-[#FF6B00] text-white rounded-xl py-4 text-sm font-black cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {/* Never icon-only: this is the irreversible control on this screen. */}
          <span>{isAr ? 'أكّد وادفع' : 'Confirm & Pay'}</span>
        </button>
        {!acknowledged && (
          <p className="text-[10px] text-fg-muted font-bold text-center -mt-2">
            {isAr ? 'أقرّ بالملاحظة أعلاه لتفعيل الزر.' : 'Acknowledge the note above to enable the button.'}
          </p>
        )}
      </div>
    );
  }

  // ---- SCREENS 6 + 7 — how to approve, and live status ---------------------
  return (
    <div className={shell} id="cliq-screen-status">
      <Header title={isAr ? 'طلب الدفع' : 'Payment request'} />
      <StatusBlock status={lock.status} isAr={isAr} total={total} />

      {lock.status === 'pending' && (
        <>
          {/* SCREEN 6 — plain numbered Arabic, large type: many buyers here are
              older and are being asked to open a banking app mid-flow. */}
          <div className="bg-surface-raised border border-line rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#FF6B00] shrink-0" />
              <h4 className="text-[13px] font-black text-fg">{isAr ? 'لإتمام الدفع:' : 'To complete your payment:'}</h4>
            </div>
            <ol className="space-y-2.5">
              {(isAr
                ? [
                    'افتح تطبيق البنك الخاص بك.',
                    'اذهب إلى إشعارات / طلبات كليك (CliQ).',
                    `ستجد طلب دفع بقيمة ${jod(total)} د.أ.`,
                    'راجع التفاصيل ثم اضغط "موافقة".',
                  ]
                : [
                    'Open your bank app.',
                    'Go to CliQ notifications / requests.',
                    `You will find a payment request for ${jod(total)} JOD.`,
                    'Review the details, then tap "Approve".',
                  ]
              ).map((line, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-[#FF6B00] text-white text-[12px] font-black flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-[13.5px] font-bold text-fg leading-relaxed pt-0.5">{line}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* The duplicate-request rule, stated as a countdown rather than a
              dead button with no explanation. */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 font-bold leading-snug">
              {isAr
                // The countdown is MM:SS, so it cannot carry the word «دقيقة»
                // after it — «خلال 72:37 دقيقة» states a unit the number does
                // not use. Labelled as remaining time instead.
                ? `لديك طلب دفع قيد الانتظار. لا يمكنك إنشاء طلب جديد لنفس الدفعة حتى تتم الموافقة عليه أو تنتهي صلاحيته — الوقت المتبقي ${formatCliqCountdown(lock.remainingMs)}.`
                : `You have a pending payment request. You cannot create a new request for this payment until it is approved or expires, in ${formatCliqCountdown(lock.remainingMs)}.`}
            </p>
          </div>

          {/* The server masks this before it is written. The full identifier
              never reaches the order doc, because the SELLER can read that doc
              — see the split in functions/cliqPayment.js. */}
          {order.cliqPayerIdentifierMasked && (
            <p className="text-[10px] text-fg-muted font-bold text-center">
              {isAr ? 'أُرسل إلى: ' : 'Sent to: '}
              <span dir="ltr" className="font-mono">{order.cliqPayerIdentifierMasked}</span>
            </p>
          )}
        </>
      )}

      {(lock.status === 'rejected' || lock.status === 'expired') && (
        <button
          type="button"
          onClick={() => { setStep('amount'); setAcknowledged(false); setIdentifier(''); setTouched(false); }}
          className="w-full bg-[#FF6B00] text-white rounded-xl py-3.5 text-sm font-black cursor-pointer hover:brightness-110 transition-all"
        >
          {isAr ? 'حاول مرة أخرى' : 'Try again'}
        </button>
      )}
    </div>
  );
}

/** SCREEN 7 — the live status, reflected from Firestore. Never set here. */
function StatusBlock({ status, isAr, total }: { status: CliqPaymentStatus; isAr: boolean; total: number }) {
  const map: Record<CliqPaymentStatus, { icon: React.ReactNode; title: string; body: string; cls: string }> = {
    none: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      title: isAr ? 'جارٍ التحضير…' : 'Preparing…',
      body: '',
      cls: 'bg-surface-raised border-line text-fg',
    },
    pending: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      title: isAr ? 'بانتظار موافقتك' : 'Awaiting your approval',
      body: isAr
        ? 'أرسلنا الطلب إلى بنكك. وافق عليه من تطبيق البنك لإتمام الدفع.'
        : 'We sent the request to your bank. Approve it in your bank app to complete the payment.',
      cls: 'bg-amber-50 border-amber-200 text-amber-900',
    },
    paid: {
      icon: <CheckCircle2 className="w-5 h-5" />,
      title: isAr ? 'تم الدفع بنجاح' : 'Payment completed',
      body: isAr
        ? `استلمنا ${Number(total.toFixed(3)).toLocaleString('en-US', { minimumFractionDigits: 2 })} د.أ. بنجهّز القطعة للتوصيل.`
        : `We received ${Number(total.toFixed(3)).toLocaleString('en-US', { minimumFractionDigits: 2 })} JOD. We are preparing your item for delivery.`,
      cls: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    },
    rejected: {
      icon: <XCircle className="w-5 h-5" />,
      title: isAr ? 'رُفض الطلب' : 'Request rejected',
      body: isAr
        ? 'لم تتم الموافقة على الطلب من تطبيق البنك. تقدر تعيد المحاولة.'
        : 'The request was not approved in your bank app. You can try again.',
      cls: 'bg-red-50 border-red-200 text-red-900',
    },
    expired: {
      icon: <Clock className="w-5 h-5" />,
      title: isAr ? 'انتهت صلاحية الطلب' : 'Request expired',
      body: isAr
        ? 'انتهت مهلة الطلب قبل الموافقة عليه. تقدر تنشئ طلباً جديداً.'
        : 'The request expired before it was approved. You can create a new one.',
      cls: 'bg-surface-raised border-line text-fg',
    },
  };
  const s = map[status];
  return (
    <div className={`flex items-start gap-3 border rounded-xl p-3.5 ${s.cls}`} role="status" aria-live="polite">
      <span className="shrink-0 mt-0.5">{s.icon}</span>
      <div className="space-y-1">
        <p className="text-[13px] font-black leading-tight">{s.title}</p>
        {s.body && <p className="text-[11px] font-bold leading-snug opacity-90">{s.body}</p>}
      </div>
    </div>
  );
}
