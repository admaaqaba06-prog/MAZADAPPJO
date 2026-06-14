import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { ShieldCheck, Check, Sparkles, RefreshCw, CreditCard, ExternalLink, UploadCloud } from 'lucide-react';

export const SubscriptionView: React.FC = () => {
  const { subscribeUser, language, setLanguage, logout } = useApp();
  const t = translations[language];

  const plans = [
    {
      id: 'monthly',
      name: language === 'en' ? 'Starter Bidder' : 'المزايد المبتدئ',
      price: 1,
      period: t.planMonthlyUnit,
      badge: null,
      color: 'border-gray-200'
    },
    {
      id: 'quarterly',
      name: language === 'en' ? 'Professional Elite' : 'النخبة الاحترافية',
      price: 3,
      period: t.planQuarterlyUnit,
      badge: t.mostPopular,
      color: 'border-[#FF6B00] shadow-[0_8px_20px_rgba(255,107,0,0.08)]'
    },
    {
      id: 'annual',
      name: language === 'en' ? 'Supreme Investor' : 'المستثمر السيادي',
      price: 7,
      period: t.planAnnualUnit,
      badge: t.bestValue,
      color: 'border-black'
    }
  ];

  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0]>(plans[1]);
  const [loading, setLoading] = useState(false);
  const [paymentProofImage, setPaymentProofImage] = useState<string>('');
  const [transferFullName, setTransferFullName] = useState('');
  const [transferPhone, setTransferPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const isAr = language === 'ar';

  const handleCopy = () => {
    navigator.clipboard.writeText('JO83 CAPS 1020 0085 4100 00');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          setPaymentProofImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePay = () => {
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
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      subscribeUser(selectedPlan.price, paymentProofImage || undefined, transferFullName, transferPhone);
    }, 1200);
  };

  return (
    <div 
      className="min-h-screen w-full bg-white text-gray-900 flex flex-col justify-between p-6 md:p-12 font-sans select-none"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="subscription-view-root"
    >
      {/* Top Header */}
      <header className="flex justify-between items-center w-full max-w-2xl mx-auto border-b border-gray-100 pb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded bg-[#FF6B00] text-white flex items-center justify-center font-bold text-xs" />
          <span className="font-mono text-xs font-black tracking-wider text-gray-400 uppercase">{t.appName} EXECUTIVE GATE</span>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="text-[10px] font-black tracking-wider font-mono border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 uppercase"
          >
            {t.langLabel}
          </button>
          
          <button 
            onClick={logout}
            className="text-[10.5px] font-extrabold text-gray-400 hover:text-red-500 hover:underline"
          >
            {t.logout}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="w-full max-w-2xl mx-auto my-auto py-8">
        <div className="text-center space-y-3 mb-8">
          <div className="mx-auto w-10 h-10 rounded-full bg-orange-100/60 border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-5 h-5 fill-current text-white stroke-[#FF6B00]" />
          </div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight leading-tight uppercase font-mono">
            {t.paywallTitle}
          </h1>
          <p className="text-xs text-gray-500 max-w-lg mx-auto leading-relaxed">
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
                className={`relative rounded-2xl border-2 p-5 cursor-pointer hover:bg-gray-50/50 transition-all ${isSelected ? p.color : 'border-gray-100'}`}
                id={`plan-${p.id}-card`}
              >
                {p.badge && (
                  <span className={`absolute -top-2.5 ${isAr ? 'left-3' : 'right-3'} px-2 py-0.5 rounded-full text-[8.5px] font-black tracking-widest uppercase text-white bg-black`}>
                    {p.badge}
                  </span>
                )}

                <div className="flex flex-col h-full justify-between space-y-4">
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-wider text-gray-400 font-mono">
                      {p.name}
                    </h3>
                    <div className="flex items-baseline mt-1">
                      <span className="text-2xl font-black text-gray-900 font-mono">{p.price}</span>
                      <span className="text-[10px] text-gray-500 font-mono font-bold uppercase">{p.period}</span>
                    </div>
                  </div>

                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[#FF6B00] bg-[#FF6B00]' : 'border-gray-200'}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* BANK TRANSFER INFO BOX */}
        <div className="bg-[#FFF8F3] border border-[#FF6B00] rounded-2xl p-5 mb-6 space-y-3 font-sans">
          <div className="text-xs font-black text-gray-800 uppercase tracking-tight font-mono">
            {isAr ? 'بيانات التحويل المصرفي / Bank Transfer Info' : 'Transfer Payment To:'}
          </div>
          <div className="space-y-1.5 text-xs text-gray-800">
            <div className="flex justify-between border-b border-orange-100 pb-1.5">
              <span className="font-bold text-gray-500">{isAr ? 'اسم الحساب' : 'Account Name'}:</span>
              <span className="font-black text-gray-900">MAZAD JO M</span>
            </div>
            <div className="flex justify-between border-b border-orange-100 pb-1.5">
              <span className="font-bold text-gray-500">{isAr ? 'البنك' : 'Bank'}:</span>
              <span className="font-black text-[#FF6B00] uppercase font-mono">CAPITAL BANK</span>
            </div>
            <div className="flex flex-col gap-1.5 pt-1.5">
              <span className="font-bold text-gray-500">{isAr ? 'رقم الحساب / الآيبان (IBAN)' : 'Account Number / IBAN'}:</span>
              <div className="flex items-center justify-between bg-white border border-orange-200 rounded-xl p-2.5 font-mono text-xs font-black text-gray-900">
                <span>JO83 CAPS 1020 0085 4100 00</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-[10px] px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer ml-2"
                >
                  {copied ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ' : 'Copy')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* TWO NEW INPUT FIELDS */}
        <div className="bg-gray-50/50 border border-gray-150 rounded-2xl p-5 mb-6 space-y-4">
          <div className="text-xs font-black text-gray-800 uppercase tracking-tight font-mono">
            {isAr ? 'معلومات التحقق من التحويل' : 'VERIFICATION DETAILS'}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-600">
              {isAr ? 'الاسم الثلاثي / Your Full Name' : 'Your Full Name / الاسم الثلاثي'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={transferFullName}
              onChange={(e) => setTransferFullName(e.target.value)}
              placeholder={isAr ? 'أدخل اسمك الثلاثي كما هو في الهوية' : 'Enter your full name as on your ID'}
              className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3.5 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-600">
              {isAr ? 'رقم الهاتف المحول منه / Phone Number Used' : 'Phone Number Used for Transfer / رقم الهاتف المحول منه'} <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={transferPhone}
              onChange={(e) => setTransferPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3.5 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
            />
          </div>
        </div>

        {/* Upload field for payment screenshot / ارفع إيصال الدفع */}
        <div className="bg-gray-50/50 border border-gray-150 rounded-2xl p-5 mb-6 space-y-3.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-black text-gray-800 uppercase tracking-tight font-mono">
              {isAr ? 'ارفع إيصال الدفع / Upload Payment Screenshot' : 'Upload Payment Screenshot / ارفع إيصال الدفع'}
            </label>
            {paymentProofImage && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono font-bold px-2 py-0.5 rounded-md uppercase">
                {isAr ? 'تم الرفع' : 'Uploaded'}
              </span>
            )}
          </div>
          
          <div className="relative border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all rounded-xl p-5 flex flex-col items-center justify-center bg-white cursor-pointer group min-h-[140px]">
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
                  className="max-h-56 w-auto object-contain rounded-lg border border-gray-200 shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  className="text-[10px] text-gray-400 font-bold hover:text-[#FF6B00] transition-colors"
                >
                  {isAr ? 'تغيير لقطة الشاشة' : 'Click to change screenshot'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-2">
                <UploadCloud className="w-8 h-8 text-gray-400 group-hover:text-[#FF6B00] transition-colors" />
                <p className="text-xs text-gray-700 font-extrabold">{isAr ? 'اضغط هنا لرفع إيصال الدفعة' : 'Click here to upload payment screenshot'}</p>
                <p className="text-[9.5px] text-gray-400 font-mono">PNG, JPG format images only</p>
              </div>
            )}
          </div>
        </div>

        {/* Feature Checks */}
        <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/50 mb-6 space-y-2.5">
          {t.plansFeatures.map((feat, index) => (
            <div key={index} className="flex gap-2 items-start text-xs text-gray-600 leading-normal">
              <Check className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5" />
              <span>{feat}</span>
            </div>
          ))}
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
            className="w-full bg-[#FF6B00] text-white font-black text-xs py-4 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:brightness-105 transition-all flex items-center justify-center gap-1 border border-transparent"
            id="activate-paywall-sub-btn"
          >
            <CreditCard className="w-4 h-4" />
            <span>{t.secureCheckoutBtn} {selectedPlan.price} JOD</span>
          </button>
        )}

        <p className="text-[9.5px] text-gray-400 leading-relaxed text-center mt-4">
          {t.subLockText}
        </p>
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-gray-400 font-mono tracking-wide max-w-sm mx-auto pt-6 border-t border-gray-100 w-full mt-auto">
        CENTRAL BANK OF JORDAN AUDITED GATEWAYS
      </footer>
    </div>
  );
};
