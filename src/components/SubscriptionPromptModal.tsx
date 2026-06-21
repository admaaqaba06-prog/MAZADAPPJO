import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { ShieldCheck, Check, Sparkles, RefreshCw, CreditCard, UploadCloud, X } from 'lucide-react';

interface SubscriptionPromptModalProps {
  onClose: () => void;
}

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

export const SubscriptionPromptModal: React.FC<SubscriptionPromptModalProps> = ({ onClose }) => {
  const { subscribeUser, language } = useApp();
  const t = translations[language];
  const isAr = language === 'ar';

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
          compressBase64Image(event.target.result as string).then((compressed) => {
            setPaymentProofImage(compressed);
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePay = () => {
    if (!transferFullName.trim()) {
      alert(isAr ? 'الرجاء إدخال الاسم الثلاثي كما هو في الهوية.' : 'Please enter your full name as on ID.');
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
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative bg-white text-gray-900 w-full max-w-lg rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in scale-in duration-200 p-6 md:p-8 max-h-[90vh] overflow-y-auto"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="subscription-renew-modal"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 text-gray-400 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Head Intro */}
        <div className="text-center space-y-2 mb-6">
          <div className="mx-auto w-11 h-11 rounded-full bg-orange-150 border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-6 h-6 fill-current text-white stroke-[#FF6B00]" />
          </div>
          <h2 className="text-lg md:text-xl font-black text-gray-900 tracking-tight uppercase font-mono">
            {isAr ? 'تجديد اشتراك المزاد الفضي' : 'RENEW YOUR AUCTION PASS'}
          </h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto leading-normal">
            {isAr 
              ? 'انتهى اشتراك المزايدة الخاص بك. يرجى اختيار إحدى الباقات والدفع لتفعيل حسابك ومواصلة المزايدة مباشرة!' 
              : 'Your bidding subscription has ended. Choose a tier, transfer via CliQ, and reactive your pass instantly.'}
          </p>
        </div>

        {/* Plan Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {plans.map((p) => {
            const isSelected = selectedPlan.id === p.id;
            return (
              <div 
                key={p.id}
                onClick={() => setSelectedPlan(p)}
                className={`relative rounded-xl border-2 p-3.5 cursor-pointer hover:bg-gray-50/50 transition-all ${isSelected ? p.color : 'border-gray-100'}`}
                id={`modal-plan-${p.id}-card`}
              >
                {p.badge && (
                  <span className={`absolute -top-2 ${isAr ? 'left-2' : 'right-2'} px-1.5 py-0.5 rounded-full text-[7.5px] font-black tracking-widest uppercase text-white bg-black`}>
                    {p.badge}
                  </span>
                )}

                <div className="flex flex-col justify-between h-full space-y-2">
                  <div>
                    <h3 className="font-black text-[10px] uppercase tracking-wider text-gray-400 font-mono">
                      {p.name}
                    </h3>
                    <div className="flex items-baseline mt-0.5">
                      <span className="text-lg font-black text-gray-900 font-mono">{p.price}</span>
                      <span className="text-[8px] text-gray-500 font-mono font-bold uppercase">{p.period}</span>
                    </div>
                  </div>

                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[#FF6B00] bg-[#FF6B00]' : 'border-gray-200'}`}>
                    {isSelected && <Check className="w-2 h-2 text-white stroke-[4]" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CliQ Bank Details */}
        <div className="bg-[#FFF8F3] border border-[#FF6B00] rounded-xl p-4 mb-5 space-y-2.5 font-sans">
          <div className="text-[10px] font-black text-gray-800 uppercase tracking-tight font-mono">
            {isAr ? 'بيانات المحفظة والإيداع السريع' : 'TRANSFER SEED PAYMENT TO:'}
          </div>
          <div className="space-y-1.5 text-xs text-gray-800">
            <div className="flex justify-between border-b border-orange-100 pb-1">
              <span className="font-bold text-gray-500">{isAr ? 'اسم الحساب' : 'Account'}:</span>
              <span className="font-black text-gray-900 font-mono">MAZAD JO M</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="font-bold text-gray-500">{isAr ? 'البنك' : 'Bank'}:</span>
              <span className="font-black text-[#FF6B00] uppercase font-mono">CAPITAL BANK</span>
            </div>
          </div>
        </div>

        {/* Verification Inputs */}
        <div className="bg-gray-50/50 border border-gray-150 rounded-xl p-4 mb-5 space-y-3">
          <div className="text-[10px] font-black text-gray-800 uppercase tracking-tight font-mono">
            {isAr ? 'معلومات التحقق من التحويل' : 'VERIFICATION DETAILS'}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-600">
              {isAr ? 'الاسم الثلاثي' : 'Your Full Name / الاسم الثلاثي'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={transferFullName}
              onChange={(e) => setTransferFullName(e.target.value)}
              placeholder={isAr ? 'أدخل اسمك الثلاثي للتفعيل' : 'Enter your full name as on ID'}
              className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-600">
              {isAr ? 'رقم الهاتف المحول منه' : 'Sender Phone / رقم المحول منه'} <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={transferPhone}
              onChange={(e) => setTransferPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
            />
          </div>
        </div>

        {/* Slip upload */}
        <div className="bg-gray-50/50 border border-gray-150 rounded-xl p-4 mb-5 space-y-2.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-black text-gray-800 uppercase tracking-tight font-mono">
              {isAr ? 'ارفق إيصال الدفع' : 'Payment Screenshot Proof'}
            </label>
            {paymentProofImage && (
              <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono font-bold px-1.5 py-0.5 rounded uppercase">
                {isAr ? 'تم الإرفاق' : 'Attached'}
              </span>
            )}
          </div>
          
          <div className="relative border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all rounded-lg p-3 flex flex-col items-center justify-center bg-white cursor-pointer group min-h-[90px]">
            <input 
              type="file" 
              accept="image/png, image/jpeg, image/jpg" 
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id="modal-payment-screenshot-input"
            />
            {paymentProofImage ? (
              <div className="w-full relative flex flex-col items-center space-y-2 z-20">
                <img 
                  src={paymentProofImage} 
                  alt="Payment Proof" 
                  className="max-h-24 w-auto object-contain rounded border border-gray-100"
                  referrerPolicy="no-referrer"
                />
                <span className="text-[9px] text-[#FF6B00] font-bold">
                  {isAr ? 'تغيير لقطة الشاشة' : 'Click to replace image'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-1">
                <UploadCloud className="w-6 h-6 text-gray-400 group-hover:text-[#FF6B00]" />
                <span className="text-[10px] text-gray-700 font-bold">{isAr ? 'اضغط هنا لرفع الإيصال' : 'Click to upload receipt'}</span>
                <span className="text-[8px] text-gray-400 font-mono">PNG, JPG</span>
              </div>
            )}
          </div>
        </div>

        {/* CTA Bidding Activation */}
        {loading ? (
          <button 
            disabled
            className="w-full bg-gray-900 text-white font-extrabold text-[11px] py-3 rounded-xl flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
            <span>ACTIVATING PASS...</span>
          </button>
        ) : (
          <button 
            onClick={handlePay}
            className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 transition-all flex items-center justify-center gap-1"
            id="activate-modal-sub-btn"
          >
            <CreditCard className="w-4 h-4" />
            <span>{isAr ? 'تأكيد ودفع' : 'CONFIRM TRANSFER & ACTIVATE'} {selectedPlan.price} JOD</span>
          </button>
        )}
      </div>
    </div>
  );
};
