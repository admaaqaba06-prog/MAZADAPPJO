import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { CLIQ_ALIAS, CLIQ_RECIPIENT_NAME_EN } from '../constants/cliq';
import { SUBSCRIPTION_TIERS } from '../constants/subscriptionTiers';
import { translations } from '../utils/translations';
import { Confetti, useToast } from './feedback';
import AuctionRulesModal from './AuctionRulesModal';
import { ShieldCheck, Check, Copy, Sparkles, RefreshCw, CreditCard, ExternalLink, UploadCloud, Hourglass } from 'lucide-react';

// Helper to compress base64 images to stay under the 1MB Firestore limit
const compressBase64Image = (base64Str: string, maxWidth = 600, maxHeight = 600, quality = 0.65): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export const SubscriptionView: React.FC = () => {
  const { subscribeUser, language, setLanguage, logout, currentUser } = useApp();
  const t = translations[language];

  const plans = [
    {
      id: 'monthly',
      name: language === 'en' ? 'Starter Bidder' : 'المزايد المبتدئ',
      price: SUBSCRIPTION_TIERS.monthly.price,
      period: t.planMonthlyUnit,
      badge: null,
      color: 'border-line'
    },
    {
      id: 'semiannual', // 4 JD / 6 months (see translations planQuarterlyUnit) — was mislabeled 'quarterly'
      name: language === 'en' ? 'Professional Elite' : 'النخبة الاحترافية',
      price: SUBSCRIPTION_TIERS.semiannual.price,
      period: t.planQuarterlyUnit,
      badge: t.mostPopular,
      color: 'border-[#FF6B00] shadow-[0_8px_20px_rgba(255,107,0,0.08)]'
    },
    {
      id: 'annual',
      name: language === 'en' ? 'Supreme Investor' : 'المستثمر السيادي',
      price: SUBSCRIPTION_TIERS.annual.price,
      period: t.planAnnualUnit,
      badge: t.bestValue,
      color: 'border-black'
    }
  ];

  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0]>(plans[1]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [paymentProofImage, setPaymentProofImage] = useState<string>('');
  const [transferFullName, setTransferFullName] = useState('');
  const [transferPhone, setTransferPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedAlias, setCopiedAlias] = useState(false);
  // E4 — pay-to-bid acceptance gate for the Auction Rules.
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showAcceptError, setShowAcceptError] = useState(false);
  const isAr = language === 'ar';

  // Tier rank for "show only higher tiers" upgrade logic.
  const TIER_RANK: Record<string, number> = { monthly: 0, semiannual: 1, annual: 2 };
  const currentTierId = (currentUser?.subscriptionTier || currentUser?.subscriptionPlan || 'monthly') as string;
  const currentRank = TIER_RANK[currentTierId] ?? 0;
  const isTopTier = currentRank >= 2;

  const memberBenefits = isAr
    ? [
        'زايد مجاناً — لا رسوم على كل مزايدة',
        'ادفع فقط عند الفوز (+٥٪ عمولة المشتري)',
        'الدفع عند الاستلام: متاح لمشتركي VIP',
        'حماية المشتري: مزاد يحتفظ بمبلغك حتى تأكيد الاستلام',
      ]
    : [
        'Bid freely — no per-bid fees',
        'Pay only when you win (+5% buyer premium)',
        'VIP pay-on-delivery',
        'Buyer protection — Mazad holds your payment until you confirm receipt',
      ];

  const formatExpiry = (v?: string | number | null): string | null => {
    if (!v) return null;
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (!ms || Number.isNaN(ms)) return null;
    return new Date(ms).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Show the pending state after a successful submit AND on refresh while the
  // request is still under review — kills the silent-success → duplicate-click loop.
  const isPendingReview = (submitted && currentUser?.subscriptionStatus !== 'active' && currentUser?.subscriptionStatus !== 'rejected') || currentUser?.subscriptionStatus === 'pending';

  // --- Approval celebration: fire ONLY on the live transition to 'active' ---
  // (previous-value ref: no burst when mounting into an already-active account)
  const { showToast } = useToast();
  const [celebrate, setCelebrate] = useState(false);
  const prevStatusRef = useRef<string | undefined>(currentUser?.subscriptionStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = currentUser?.subscriptionStatus;
    if (prev !== 'active' && curr === 'active' && prev !== curr) {
      setCelebrate(true);
      showToast({
        type: 'success',
        title: isAr ? '🎉 أهلاً بك عضواً في مزاد جو!' : '🎉 Welcome — you are a MAZAD JO member!',
      });
    }
    prevStatusRef.current = curr;
  }, [currentUser?.subscriptionStatus, isAr, showToast]);

  const handleCopy = () => {
    navigator.clipboard.writeText('JO83 CAPS 1020 0085 4100 00');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAlias = () => {
    navigator.clipboard.writeText(CLIQ_ALIAS);
    setCopiedAlias(true);
    setTimeout(() => setCopiedAlias(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.match('image.*')) {
        alert(isAr ? 'الرجاء اختيار صورة فقط (jpg أو png).' : 'Please select an image file only (jpg, png).');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          compressBase64Image(event.target.result as string).then((compressed) => {
            setPaymentProofImage(compressed);
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePay = async () => {
    if (loading || isPendingReview) return;
    if (!transferFullName.trim()) {
      alert(isAr ? 'الرجاء إدخال الاسم الثلاثي.' : 'Please enter your full name as on ID.');
      return;
    }
    if (!transferPhone.trim()) {
      alert(isAr ? 'الرجاء إدخال رقم الهاتف المحول منه.' : 'Please enter the phone number used for transfer.');
      return;
    }
    if (!paymentProofImage) {
      alert(isAr ? 'معذرة! يرجى رفع لقطة الشاشة/الإيصال لإثبات الدفع.' : 'Please upload payment screenshot proof to activate your executive bidding pass.');
      return;
    }
    // E4 — must accept the Auction Rules before paying to bid.
    if (!acceptedRules) {
      setShowAcceptError(true);
      alert(isAr ? 'الرجاء قراءة قواعد المزاد والموافقة عليها للمتابعة.' : 'Please read and accept the Auction Rules to continue.');
      return;
    }
    setLoading(true);
    try {
      const ok = await subscribeUser(selectedPlan.price, paymentProofImage || undefined, transferFullName, transferPhone, selectedPlan.id);
      // Reset `upgrading` on success so an active member returns to the dashboard
      // (where the 'upgrade under review' banner then renders) instead of being
      // stranded on the pricing form — also closes the double-submit window.
      if (ok) { setSubmitted(true); setUpgrading(false); }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-full w-full overflow-y-auto bg-surface-raised text-fg flex flex-col justify-between p-6 md:p-12 pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans select-none"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="subscription-view-root"
    >
      {/* Always mounted — bursts only on the fire=false→true toggle (approval transition) */}
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />

      {/* Top Header */}
      <header className="flex justify-between items-center w-full max-w-2xl mx-auto border-b border-line pb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded bg-[#FF6B00] text-white flex items-center justify-center font-bold text-xs" />
          <span className="font-mono text-xs font-black tracking-wider text-fg-muted uppercase">{t.appName} EXECUTIVE GATE</span>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="text-[10px] font-black tracking-wider font-mono border border-line px-2.5 py-1.5 rounded-lg hover:bg-surface-sunken uppercase"
          >
            {t.langLabel}
          </button>
          
          <button 
            onClick={logout}
            className="text-[10.5px] font-extrabold text-fg-muted hover:text-red-500 hover:underline"
          >
            {t.logout}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="w-full max-w-2xl mx-auto my-auto py-8">
        {currentUser?.subscriptionStatus === 'active' && !upgrading ? (
          /* ACTIVE MEMBER DASHBOARD — replaces the pricing form for paid members. */
          <div className="space-y-6" id="member-dashboard">
            {/* Your membership */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h1 className="text-xl md:text-2xl font-black text-fg tracking-tight">
                {isAr ? 'عضويتك فعّالة' : "You're a member"}
              </h1>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-fg-muted font-mono">
                  {plans.find(p => p.id === currentTierId)?.name || currentTierId}
                </span>
                <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                  {isAr ? 'فعّال' : 'ACTIVE'}
                </span>
              </div>
              {formatExpiry(currentUser?.subscriptionExpiry) && (
                <p className="text-xs text-fg-muted">
                  {isAr ? 'يتجدد / ينتهي في ' : 'Renews / expires '}{formatExpiry(currentUser?.subscriptionExpiry)}
                </p>
              )}
            </div>

            {/* Upgrade-under-review (this session only) */}
            {submitted && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center" id="upgrade-under-review">
                <p className="text-xs font-bold text-amber-700">
                  {isAr ? '⏳ ترقيتك قيد المراجعة — تبقى عضويتك فعّالة حتى الاعتماد.' : '⏳ Your upgrade is under review — your membership stays active until it\'s approved.'}
                </p>
              </div>
            )}

            {/* Member benefits */}
            <div className="bg-surface-sunken border border-line rounded-2xl p-4">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-fg-muted mb-3">
                {isAr ? 'مزايا العضوية' : 'Member benefits'}
              </h2>
              <ul className="space-y-2">
                {memberBenefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs font-medium text-fg">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Upgrade options (only tiers above the current one) */}
            {isTopTier ? (
              <div className="text-center text-xs text-fg-muted font-semibold py-2">
                {isAr ? '👑 أنت على أعلى باقة.' : "👑 You're on the top plan."}
              </div>
            ) : (
              <div>
                <h2 className="text-[11px] font-black uppercase tracking-wider text-fg-muted mb-3">
                  {isAr ? 'ترقية العضوية' : 'Upgrade'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {plans.filter(p => (TIER_RANK[p.id] ?? 0) > currentRank).map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPlan(p); setUpgrading(true); }}
                      className={`relative rounded-2xl border-2 p-4 text-start hover:bg-surface-sunken/50 transition-all cursor-pointer ${p.color}`}
                    >
                      <h3 className="font-black text-xs uppercase tracking-wider text-fg-muted font-mono">{p.name}</h3>
                      <div className="flex items-baseline mt-1">
                        <span className="text-2xl font-black text-fg font-mono">{p.price}</span>
                        <span className="text-[10px] text-fg-muted font-mono font-bold uppercase ms-1">{p.period}</span>
                      </div>
                      <span className="mt-2 inline-block text-[10px] font-black text-[#E85D04]">
                        {isAr ? 'ترقية ←' : 'Upgrade →'}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-fg-muted text-center mt-3">
                  {isAr ? 'الترقية = باقة جديدة كاملة بالسعر الأعلى؛ تبقى عضويتك فعّالة أثناء المراجعة.' : 'Upgrade = a fresh full term at the higher tier; your membership stays active during review.'}
                </p>
              </div>
            )}
          </div>
        ) : isPendingReview ? (
          /* PENDING REVIEW STATE — replaces the form entirely (also shown on refresh
             while subscriptionStatus === 'pending') so users can't double-submit. */
          <div className="text-center space-y-5 py-10" id="subscription-pending-state">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Hourglass className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="text-lg md:text-xl font-black text-fg tracking-tight leading-snug">
              {isAr
                ? '✅ استلمنا طلبك — قيد المراجعة'
                : '✅ We got your request — under review'}
            </h1>
            <p className="text-xs text-fg-muted max-w-sm mx-auto leading-relaxed">
              {isAr
                ? 'سنفعّل عضويتك خلال دقائق. لا حاجة لإعادة الإرسال — ستصلك إشعار فور التفعيل.'
                : 'We will activate your membership within minutes. No need to resubmit — you will be notified the moment it goes live.'}
            </p>
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold px-4 py-2 rounded-full">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              <span>{isAr ? 'قيد المراجعة من الإدارة' : 'Being reviewed by our team'}</span>
            </div>
          </div>
        ) : (
        <>
        {/* An active member who tapped Upgrade can bail out of the pricing form
            back to their still-active membership dashboard (upgrading = false). */}
        {currentUser?.subscriptionStatus === 'active' && upgrading && (
          <button
            onClick={() => setUpgrading(false)}
            className="mb-4 text-xs font-bold text-fg-muted hover:text-fg flex items-center gap-1 cursor-pointer"
          >
            ← {isAr ? 'رجوع للعضوية' : 'Back to membership'}
          </button>
        )}
        <div className="text-center space-y-3 mb-8">
          <div className="mx-auto w-10 h-10 rounded-full bg-orange-100/60 border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-5 h-5 fill-current text-white stroke-[#FF6B00]" />
          </div>
          <h1 className="text-xl md:text-2xl font-black text-fg tracking-tight leading-tight uppercase font-mono">
            {t.paywallTitle}
          </h1>
          <p className="text-xs text-fg-muted max-w-lg mx-auto leading-relaxed">
            {t.paywallSub}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {plans.map((p) => {
            const isSelected = selectedPlan.id === p.id;
            return (
              <div 
                key={p.id}
                onClick={() => setSelectedPlan(p)}
                className={`relative rounded-2xl border-2 p-5 cursor-pointer hover:bg-surface-sunken/50 transition-all ${isSelected ? p.color : 'border-line'}`}
                id={`plan-${p.id}-card`}
              >
                {p.badge && (
                  <span className={`absolute -top-2.5 ${isAr ? 'left-3' : 'right-3'} px-2 py-0.5 rounded-full text-[8.5px] font-black tracking-widest uppercase text-white bg-black`}>
                    {p.badge}
                  </span>
                )}

                <div className="flex flex-col h-full justify-between space-y-4">
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-wider text-fg-muted font-mono">
                      {p.name}
                    </h3>
                    <div className="flex items-baseline mt-1">
                      <span className="text-2xl font-black text-fg font-mono">{p.price}</span>
                      <span className="text-[10px] text-fg-muted font-mono font-bold uppercase">{p.period}</span>
                    </div>
                  </div>

                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[#FF6B00] bg-[#FF6B00]' : 'border-line'}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* BANK TRANSFER INFO BOX */}
        <div className="bg-[#FFF8F3] border border-[#FF6B00] rounded-2xl p-5 mb-6 space-y-3 font-sans">
          <div className="text-xs font-black text-fg uppercase tracking-tight font-mono">
            {isAr ? 'بيانات التحويل المصرفي / Bank Transfer Info' : 'Transfer Payment To:'}
          </div>
          <div className="space-y-1.5 text-xs text-fg">
            {/* CliQ alias — PRIMARY transfer target (IBAN stays as fallback) */}
            <div className="border-b border-orange-100 pb-1.5 space-y-0.5">
              <div className="flex justify-between items-center gap-2">
                <span className="font-bold text-fg-muted">{isAr ? 'اسم مستعار كليك (CliQ Alias)' : 'CliQ Alias'}:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-black text-fg select-all">{CLIQ_ALIAS}</span>
                  <button
                    type="button"
                    onClick={handleCopyAlias}
                    className="p-1 bg-surface-raised border border-line rounded-lg text-fg-muted hover:text-[#FF6B00] transition-colors cursor-pointer shrink-0"
                  >
                    {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <p className="text-[9.5px] text-fg-muted font-bold">
                {isAr ? 'حوّل عبر كليك إلى هذا الاسم المستعار' : 'Send via CliQ to this alias'}
              </p>
            </div>
            <div className="flex justify-between border-b border-orange-100 pb-1.5">
              <span className="font-bold text-fg-muted">{isAr ? 'اسم الحساب' : 'Account Name'}:</span>
              <span className="font-black text-fg font-mono">{CLIQ_RECIPIENT_NAME_EN}</span>
            </div>
            <div className="flex justify-between pb-1.5">
              <span className="font-bold text-fg-muted">{isAr ? 'البنك' : 'Bank'}:</span>
              <span className="font-black text-[#FF6B00] uppercase font-mono">ARAB BANK</span>
            </div>
          </div>
        </div>

        {/* TWO NEW INPUT FIELDS */}
        <div className="bg-surface-sunken/50 border border-line rounded-2xl p-5 mb-6 space-y-4">
          <div className="text-xs font-black text-fg uppercase tracking-tight font-mono">
            {isAr ? 'معلومات التحقق من التحويل' : 'VERIFICATION DETAILS'}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-fg-muted">
              {isAr ? 'الاسم الثلاثي / Your Full Name' : 'Your Full Name / الاسم الثلاثي'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={transferFullName}
              onChange={(e) => setTransferFullName(e.target.value)}
              placeholder={isAr ? 'أدخل اسمك الثلاثي كما هو في الهوية' : 'Enter your full name as on your ID'}
              className="w-full bg-surface-raised border border-line rounded-xl py-2.5 px-3.5 text-fg text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-fg-muted">
              {isAr ? 'رقم الهاتف المحول منه / Phone Number Used' : 'Phone Number Used for Transfer / رقم الهاتف المحول منه'} <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={transferPhone}
              onChange={(e) => setTransferPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              className="w-full bg-surface-raised border border-line rounded-xl py-2.5 px-3.5 text-fg text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
            />
          </div>
        </div>

        {/* Upload field for payment screenshot / ارفع إيصال الدفع */}
        <div className="bg-surface-sunken/50 border border-line rounded-2xl p-5 mb-6 space-y-3.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-black text-fg uppercase tracking-tight font-mono">
              {isAr ? 'ارفع إيصال الدفع / Upload Payment Screenshot' : 'Upload Payment Screenshot / ارفع إيصال الدفع'}
            </label>
            {paymentProofImage && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono font-bold px-2 py-0.5 rounded-md uppercase">
                {isAr ? 'تم الرفع' : 'Uploaded'}
              </span>
            )}
          </div>
          
          <div className="relative border-2 border-dashed border-line hover:border-gray-400 transition-all rounded-xl p-5 flex flex-col items-center justify-center bg-surface-raised cursor-pointer group min-h-[140px]">
            <input 
              type="file" 
              accept="image/png, image/jpeg, image/jpg" 
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id="payment-screenshot-input"
            />
            {paymentProofImage ? (
              <div className="w-full relative flex flex-col items-center space-y-3 z-20">
                <img 
                  src={paymentProofImage} 
                  alt="Payment Proof" 
                  className="max-h-56 w-auto object-contain rounded-lg border border-line shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  className="text-[10px] text-fg-muted font-bold hover:text-[#FF6B00] transition-colors"
                >
                  {isAr ? 'تغيير لقطة الشاشة' : 'Click to change screenshot'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-2">
                <UploadCloud className="w-8 h-8 text-fg-muted group-hover:text-[#FF6B00] transition-colors" />
                <p className="text-xs text-fg font-extrabold">{isAr ? 'اضغط هنا لرفع إيصال الدفعة' : 'Click here to upload payment screenshot'}</p>
                <p className="text-[9.5px] text-fg-muted font-mono">PNG, JPG format images only</p>
              </div>
            )}
          </div>
        </div>

        {/* Feature Checks */}
        <div className="bg-surface-sunken/50 p-4 rounded-2xl border border-line/50 mb-6 space-y-2.5">
          {t.plansFeatures.map((feat, index) => (
            <div key={index} className="flex gap-2 items-start text-xs text-fg-muted leading-normal">
              <Check className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5" />
              <span>{feat}</span>
            </div>
          ))}
        </div>

        {/* E4 — Auction Rules acceptance gate (required before paying to bid) */}
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 mb-4 transition-colors ${
            showAcceptError && !acceptedRules
              ? 'border-red-400 bg-red-50/60'
              : acceptedRules
                ? 'border-[#FF6B00]/40 bg-[#FFF8F3]'
                : 'border-line bg-surface-sunken/50'
          }`}
          id="auction-rules-accept-gate"
        >
          <input
            type="checkbox"
            id="accept-auction-rules"
            checked={acceptedRules}
            onChange={(e) => {
              setAcceptedRules(e.target.checked);
              if (e.target.checked) setShowAcceptError(false);
            }}
            className="mt-0.5 w-4 h-4 shrink-0 accent-[#FF6B00] cursor-pointer"
          />
          <label htmlFor="accept-auction-rules" className="text-[11px] font-bold text-fg leading-relaxed cursor-pointer">
            {isAr ? 'لقد قرأت وأوافق على ' : 'I have read and accept the '}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setRulesOpen(true); }}
              className="text-[#FF6B00] font-black underline underline-offset-2 hover:text-[#e05e00] cursor-pointer"
              id="open-auction-rules-link"
            >
              {isAr ? 'قواعد المزاد' : 'Auction Rules'}
            </button>
            {isAr ? '.' : '.'}
            <span className="text-red-500"> *</span>
            <span className="block mt-1 text-[10px] font-semibold text-fg-muted">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setRulesOpen(true); }}
                className="underline underline-offset-2 hover:text-[#FF6B00] cursor-pointer"
              >
                {isAr ? 'اقرأ القواعد' : 'read the rules'}
              </button>
            </span>
          </label>
        </div>

        {/* Action Button */}
        {loading ? (
          <button
            disabled
            className="w-full bg-gray-900 text-white font-extrabold text-xs py-4 rounded-xl flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
            <span>CONNECTING SECURE BANK ROUTE... (CliQ Jordan)</span>
          </button>
        ) : (
          <button
            onClick={handlePay}
            disabled={!acceptedRules}
            className={`w-full font-black text-xs py-4 rounded-xl transition-all flex items-center justify-center gap-1 border border-transparent ${
              acceptedRules
                ? 'bg-[#FF6B00] text-white shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:brightness-105 cursor-pointer'
                : 'bg-gray-200 text-fg-muted cursor-not-allowed'
            }`}
            id="activate-paywall-sub-btn"
          >
            <CreditCard className="w-4 h-4" />
            <span>{t.secureCheckoutBtn} {selectedPlan.price} JOD</span>
          </button>
        )}

        <p className="text-[9.5px] text-fg-muted leading-relaxed text-center mt-4">
          {t.subLockText}
        </p>
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-fg-muted font-mono tracking-wide max-w-sm mx-auto pt-6 border-t border-line w-full mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="text-fg-muted hover:text-[#FF6B00] transition-colors cursor-pointer underline underline-offset-2 uppercase"
        >
          {isAr ? 'قواعد المزاد' : 'Auction Rules'}
        </button>
        <span>{isAr ? 'الدفع عبر كليك • حماية المشتري من مزاد' : 'PAY VIA CLIQ • BUYER PROTECTION BY MAZAD'}</span>
      </footer>

      <AuctionRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} isAr={isAr} />
    </div>
  );
};
