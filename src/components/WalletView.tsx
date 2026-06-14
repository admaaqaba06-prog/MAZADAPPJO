import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { 
  User, 
  HelpCircle, 
  ArrowUpRight, 
  BookOpen, 
  Clock, 
  CheckCircle, 
  ShieldCheck, 
  XCircle, 
  DollarSign, 
  UploadCloud, 
  Check, 
  Sparkles,
  RefreshCw,
  Building2,
  Lock,
  LogOut,
  Camera,
  Wallet,
  ArrowDownLeft,
  ChevronRight,
  ShieldAlert,
  Info,
  Copy,
  CreditCard,
  History
} from 'lucide-react';

export const WalletView: React.FC = () => {
  const { wallet, escrows, triggerCliQTopUp, addNotification, language, logout, currentUser, setShowSubscriptionPrompt } = useApp();
  const t = translations[language];
  const isAr = language === 'ar';
  
  // States
  const [amount, setAmount] = useState<string>('500');
  const [alias, setAlias] = useState<string>('zain.cliq');
  const [fileUploaded, setFileUploaded] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedProof, setSubmittedProof] = useState<boolean>(false);
  const [copiedIBAN, setCopiedIBAN] = useState<boolean>(false);

  const presets = [100, 250, 500, 1000, 2500];

  const handleSimulatedFileUpload = () => {
    setFileName(`cliq_receipt_${Math.floor(Math.random() * 90000 + 10000)}_ref_${Math.floor(Date.now() / 1000)}.png`);
    setFileUploaded(true);
    addNotification(
      isAr ? '📎 تم إرفاق الوصل البنكي' : '📎 Receipt Attached', 
      isAr ? 'تم تحميل لقطة شاشة الحوالة بنجاح.' : 'CliQ transaction bank slip reference attached successfully.', 
      'info'
    );
  };

  const handleCopyIBAN = () => {
    navigator.clipboard.writeText('JO83 CAPS 1020 0085 4100 00');
    setCopiedIBAN(true);
    addNotification(
      isAr ? '📋 تم النسخ' : '📋 Copied!',
      isAr ? 'تم نسخ رمز الآيبان (IBAN) إلى الحافظة.' : 'IBAN code copied to clipboard.',
      'info'
    );
    setTimeout(() => setCopiedIBAN(false), 2500);
  };

  const handleTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert(isAr ? 'الرجاء إدخال قيمة مالية صحيحة بالدينار.' : 'Please enter a valid amount in JOD.');
      return;
    }
    if (!alias.trim()) {
      alert(isAr ? 'اسم مستعار كليك مطلوب لتأشير الحوالة.' : 'Your bank CliQ alias is required.');
      return;
    }
    if (!fileUploaded) {
      alert(isAr ? 'الرجاء إرفاق لقطة شاشة لوصل حوالة كليك للتحقق.' : 'Please upload your CliQ receipt screenshot to proceed.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      triggerCliQTopUp(Number(amount), alias, fileName);
      setIsSubmitting(false);
      setSubmittedProof(true);
      // Reset
      setAmount('500');
      setFileUploaded(false);
      setFileName('');
    }, 1500);
  };

  const currentLockedEscrows = escrows.filter(e => e.status === 'locked');
  const historicEscrows = escrows.filter(e => e.status !== 'locked');

  return (
    <div 
      className="flex-1 overflow-y-auto w-full flex flex-col bg-[#F9FBFC] pb-28 overscroll-behavior-y-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="wallet-ledger-root"
    >
      
      {/* Premium Fintech Top Sticky Header */}
      <div className="p-4 px-5 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-[#F9FBFC]/90 backdrop-blur-md z-40">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF6B00]"></div>
          <h2 className="text-[12px] font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
            {isAr ? 'التدقيق والذمم المالية' : 'FINANCIAL BALANCE & AUDIT'}
          </h2>
        </div>
        <span className="text-[9px] bg-gray-900 text-white font-mono font-bold tracking-wider px-2 py-0.5 rounded-md uppercase">
          {isAr ? 'ممتثل للبنك المركزي الأردني' : 'CBJ COMPLIANT'}
        </span>
      </div>

      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto w-full">
        
        {/* 1. ULTRA-POLISHED USER CARD */}
        {currentUser && (
          <div className="bg-white rounded-3xl p-6 shadow-[0_5px_15px_rgba(0,0,0,0.02)] border border-gray-100/80 relative flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300">
            
            <div className="flex items-center gap-4">
              {/* Picture with premium active ring */}
              <div className="relative">
                {currentUser.avatar ? (
                  <img 
                    src={currentUser.avatar} 
                    alt={currentUser.name} 
                    className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-2 ring-gray-150"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF6B00]/20 to-[#FF6B00]/5 text-[#FF6B00] flex items-center justify-center font-black text-xl border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-2 ring-orange-200">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Micro Verified Overlay badge */}
                <div className="absolute -bottom-1 -right-1 bg-[#FF6B00] text-white p-0.5 rounded-full border-2 border-white shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-lg font-black text-gray-900 leading-tight">
                    {currentUser.name}
                  </h3>
                  {currentUser.role === 'admin' && (
                    <span className="text-[8px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                      {isAr ? 'مسؤول' : 'ADMIN'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 font-mono font-medium lowercase">
                  {currentUser.email}
                </p>
                
                {/* Subscription Status Tag */}
                <div className="pt-0.5 select-none flex items-center gap-2 flex-wrap">
                  {currentUser.subscriptionStatus === 'active' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-150 uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      {isAr ? 'عضو نشط في المزاد' : 'ACTIVE BIDDING PASS'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider bg-rose-50 text-rose-700 border border-rose-150 uppercase animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        {isAr ? 'الاشتراك منتهي' : 'PASS EXPIRED'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSubscriptionPrompt(true)}
                        className="px-2.5 py-1 rounded-md bg-[#FF6B00] hover:bg-orange-600 active:scale-95 text-white font-extrabold text-[9.5px] leading-tight transition-all cursor-pointer shadow-sm flex items-center gap-1"
                      >
                        <CreditCard className="w-2.5 h-2.5 text-white stroke-[3]" />
                        <span>{isAr ? 'تجديد الآن 💳' : 'RENEW NOW 💳'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Logout Option */}
            <button
              onClick={() => logout()}
              type="button"
              className="md:self-start flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-gray-150 text-gray-400 hover:text-rose-600 hover:border-rose-100 hover:bg-rose-50/50 transition-all cursor-pointer text-xs font-bold active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isAr ? 'تسجيل الخروج' : 'LOG OUT'}</span>
            </button>

          </div>
        )}

        {/* 2. THE OBSIDIAN-STEEL FINTECH WALLET CARD */}
        <div className="bg-[#121318] text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-white/5 bg-gradient-to-br from-[#121318] to-[#1c1d24]">
          {/* Neon laser design ornaments */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-[#FF6B00]/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-5 -left-5 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="space-y-5 relative z-10">
            <div className="flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-[9px] text-[#FF6B00] font-mono tracking-widest block uppercase font-black">
                  {isAr ? 'الرصيد الإجمالي للمحفظة' : 'TOTAL LEDGER BALANCE'}
                </span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[44px] font-black font-mono tracking-tight leading-none text-white">
                    {wallet.totalBalance.toLocaleString()}
                  </span>
                  <span className="text-xs font-black text-[#FF6B00] font-mono uppercase tracking-widest">JOD</span>
                </div>
              </div>
              
              {/* Premium chip-like logo */}
              <div className="w-10 h-8 rounded-md bg-white/5 border border-white/10 flex flex-col justify-between p-1.5">
                <div className="flex gap-0.5">
                  <span className="w-2.5 h-1.5 rounded-xs bg-[#FF6B00]"></span>
                  <span className="w-1.5 h-1.5 rounded-xs bg-white/30"></span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-xs"></div>
              </div>
            </div>

            {/* Dash border separating */}
            <div className="border-t border-white/10 border-dashed" />

            {/* Split layout: AVAILABLE vs ESCROW */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column: AVAILABLE */}
              <div className={isAr ? 'border-l border-white/5 pl-2' : 'border-r border-white/5 pr-2'}>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Wallet className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] font-black tracking-wider uppercase font-mono">
                    {isAr ? 'المتاح للمزايدة' : 'AVAILABLE BID FUND'}
                  </span>
                </div>
                <p className="text-xl font-bold text-white font-mono tracking-tight mt-1">
                  {wallet.availableBalance.toLocaleString()} <span className="text-xs text-emerald-400 font-mono font-medium">JOD</span>
                </p>
              </div>
              
              {/* Right Column: ESCROWED */}
              <div className={isAr ? 'pr-2' : 'pl-2'}>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span className="text-[9px] font-black tracking-wider uppercase font-mono">
                    {isAr ? 'مأمن كعربون معلّق' : 'LOCKED ESCROWED'}
                  </span>
                </div>
                <p className="text-xl font-bold text-white font-mono tracking-tight mt-1">
                  {wallet.escrowBalance.toLocaleString()} <span className="text-xs text-amber-400 font-mono font-medium">JOD</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. CLIQ PARAMS REFERENCE BOARD */}
        <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-50 rounded-lg text-[#FF6B00]">
                <Building2 className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-black text-gray-800 uppercase tracking-tight font-mono">
                {isAr ? 'بيانات الإيداع الفوري عبر كليك' : 'CLIQ DEPOSIT BANKING DETAILS'}
              </span>
            </div>
            <span className="text-[8px] font-black bg-orange-100 text-[#FF6B00] px-1.5 py-0.5 rounded font-mono uppercase">
              {isAr ? 'فوري' : 'INSTANT'}
            </span>
          </div>

          <div className="p-3.5 bg-[#FFF9F5] border border-[#FF6B00]/15 rounded-2xl space-y-2.5 font-sans text-xs">
            <div className="flex justify-between items-center border-b border-orange-100 pb-2">
              <span className="text-gray-500 font-bold">{isAr ? 'البنك المستقبل' : 'Recipient Bank'}:</span>
              <span className="font-extrabold text-[#FF6B00] uppercase font-mono">CAPITAL BANK</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-orange-100 pb-2">
              <span className="text-gray-500 font-bold">{isAr ? 'اسم الحساب المستلم' : 'Account Name'}:</span>
              <span className="font-black text-gray-900">{isAr ? 'مؤسسة مزاد الأردن' : 'MAZAD JO M'}</span>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-gray-500 font-bold">{isAr ? 'رمز الحساب البنكي الدولي (IBAN)' : 'International IBAN Account'}</span>
              <div className="flex items-center justify-between bg-white border border-orange-200/50 rounded-xl p-2.5 font-mono text-xs font-black text-gray-905 shadow-2xs">
                <span className="tracking-wide">JO83 CAPS 1020 0085 4100 00</span>
                <button
                  type="button"
                  onClick={handleCopyIBAN}
                  className="bg-[#FF6B00] hover:bg-orange-600 active:scale-95 text-white font-black text-[10px] px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <Copy className="w-3 h-3 text-white" />
                  <span>{copiedIBAN ? (isAr ? 'نسخ!' : 'Copied!') : (isAr ? 'نسخ' : 'Copy')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. DEPOSIT AND COMPLIANCE UPLOAD SECTION */}
        <div className="space-y-3">
          <h3 className="text-sm font-black text-gray-900 tracking-tight px-1 flex items-center gap-1.5 uppercase font-mono">
            <span>{isAr ? 'طلب شحن الرصيد' : 'DEPOSIT REQUEST FORM'}</span>
          </h3>
          
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_5px_15px_rgba(0,0,0,0.015)] space-y-4">
            {submittedProof ? (
              <div className="bg-emerald-50/50 border border-emerald-150 rounded-2xl p-6 text-center space-y-4" id="submitted-slip-alert">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-sm">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-emerald-800 uppercase font-mono">{isAr ? 'تم رفع طلب الشحن بنجاح!' : 'PROOF UPLOAD COMPLETED'}</h4>
                  <p className="text-xs text-gray-650 leading-relaxed max-w-sm mx-auto">
                    {isAr 
                      ? 'تم رفع إشعار الحوالة والبيانات للقسم المالي. لاعتماده فورا والبدء بالمزايدة، تفضل بزيارة لوحة تحكم المدير ومراجعة الحوالات الواردة لاعتماده في ثوانٍ معدودة!' 
                      : 'The financial operations desk has received your payload. To credit it instantly in this simulated sandbox, head over to the Admin Panel top segment (CliQ list) and approve is!'}
                  </p>
                </div>
                <button 
                  onClick={() => setSubmittedProof(false)}
                  className="px-4 py-2 bg-emerald-600 text-white font-black text-[10.5px] rounded-lg tracking-wider hover:bg-emerald-700 transition-all cursor-pointer shadow-xs uppercase font-mono"
                >
                  {isAr ? 'إرسال حوالة أخرى 💳' : 'TRIGGER ANOTHER CLIQ DEPOSIT'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleTopUpSubmit} className="space-y-4" id="topup-compliance-form">
                
                {/* Step 1: Input amount with quick presets */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-gray-500 uppercase font-mono block font-black">
                      {isAr ? '1. حدد أو اكتب مبلغ الإيداع (دينار أردني)' : '1. CHOOSE & WRITE DEPOSIT JOD AMOUNT'} <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] font-mono text-gray-400">JOD CURRENCY</span>
                  </div>
                  
                  {/* Amount Large Input */}
                  <div className="relative flex items-center shadow-2xs">
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="500"
                      className="w-full bg-[#FAF9F6] border border-gray-200/80 rounded-2xl py-4 px-6 font-black font-mono text-3xl text-center text-gray-900 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] transition-all"
                    />
                    <span className={`absolute ${isAr ? 'left-5' : 'right-5'} text-sm font-black text-[#FF6B00] tracking-widest pointer-events-none select-none font-sans`}>JOD</span>
                  </div>

                  {/* Jordanian Presets Grid */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {presets.map((val) => {
                      const isActive = parseInt(amount, 10) === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAmount(val.toString())}
                          className={`py-2 px-1 rounded-xl text-[10.5px] font-black tracking-tight transition-all active:scale-95 text-center cursor-pointer font-mono border ${
                            isActive
                              ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-sm'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          +{val.toLocaleString()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: CliQ Alias */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] text-gray-500 uppercase font-mono block font-black">
                    {isAr ? '2. اسم مستعار كليك الخاص بحسابك (المرسل)' : '2. SENDER BANK CLIQ ALIAS'} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      placeholder="zain.cliq"
                      className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-gray-900 text-xs font-black focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
                    />
                    <div className={`absolute top-3 ${isAr ? 'left-3' : 'right-3'} text-gray-300`}>
                      <User className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Step 3: Screenshot Box */}
                <div className="space-y-2 pt-1">
                  <label className="text-[11px] text-gray-500 uppercase font-mono block font-black">
                    {isAr ? '3. لقطة شاشة لإثبات التحويل (إلزامي)' : '3. CLIQ RECEIPT SCREENSHOT ATTACHMENT'} <span className="text-red-500">*</span>
                  </label>
                  
                  <div 
                    onClick={handleSimulatedFileUpload}
                    className="border-2 border-dashed border-gray-200 hover:border-[#FF6B00] rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 bg-[#FAF9F6] shadow-2xs group"
                    id="screenshot-uploader-box"
                  >
                    {fileUploaded ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-emerald-600">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-150">
                          <CheckCircle className="w-5 h-5 shrink-0 stroke-[3]" />
                        </div>
                        <span className="font-mono text-[10.5px] text-gray-700 font-extrabold max-w-full truncate px-3 bg-white border border-gray-150 py-1 rounded-md">
                          {fileName}
                        </span>
                        <span className="text-[9px] text-[#FF6B00] font-black uppercase mt-1">
                          {isAr ? 'انقر لتغيير الإرفاق' : 'Click to replace document'}
                        </span>
                      </div>
                    ) : (
                      <div className="text-gray-400 space-y-2">
                        <Camera className="w-8 h-8 mx-auto text-gray-400 group-hover:text-[#FF6B00] transition-colors" />
                        <div>
                          <p className="font-extrabold text-[11px] text-[#FF6B00] uppercase tracking-wider">
                            {isAr ? 'اضغط هنا لرفع الوصل المالي للتحويل' : 'UPLOAD TRANSFER RECEIPT SCREENSHOT'}
                          </p>
                          <p className="text-[9.5px] text-gray-400 uppercase tracking-tight mt-0.5">
                            {isAr ? 'دعم صيغ الصور PNG، JPEG محاكاة' : 'SUPPORTED FORMATS: PNG, JPG'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Submit Buttons */}
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-[#FF6B00] hover:bg-[#FF8000] text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.99] disabled:opacity-40 uppercase text-xs cursor-pointer select-none"
                  id="submit-deposit-proof-btn"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>{isAr ? 'جاري تدوير وتسجيل طلب الإيداع...' : 'TRANSMITTING RECEIPT FOR SYSTEM AUDIT...'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'تأكيد التسجيل وإرسال إشعار الدفع' : 'Submit Deposit Notification for Audit'}</span>
                  )}
                </button>

              </form>
            )}
          </div>
        </div>

        {/* 5. CURRENT LOCKED MARGINS */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-1.5 px-1">
            <Lock className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span className="text-[10px] font-black font-mono tracking-widest text-gray-500 uppercase">
              {isAr ? 'مبالغ الضمان المحجوزة للمزادات' : 'ACTIVE ESCROW MUTUAL MARGINS'}
            </span>
          </div>
          
          <div className="space-y-3">
            {currentLockedEscrows.length > 0 ? (
              currentLockedEscrows.map((escrow) => (
                <div 
                  key={escrow.id} 
                  className="bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:border-gray-200 transition-all"
                  id={`locked-escrow-row-${escrow.id}`}
                >
                  <div className="min-w-0 flex-1 pr-3 pl-3">
                    <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-amber-55/10 border border-amber-300/30 text-amber-700 font-mono font-black uppercase block w-max leading-none">
                      {escrow.auctionId === 'cliq-dep' ? (isAr ? 'مراجعة الحوالة البنكية' : 'BANKING PROCESS') : (isAr ? 'عربون مزاد مجمّد' : 'AUCTION ESCROW')}
                    </span>
                    <h5 className="font-extrabold text-[12.5px] text-gray-950 truncate mt-2">{escrow.auctionTitle}</h5>
                    <p className="text-[9.5px] text-gray-400 mt-0.5 flex items-center gap-1">
                      <span>{isAr ? 'الطرف المستفيد' : 'Beneficiary Node'}:</span>
                      <span className="font-mono text-gray-600 font-black">{escrow.cliqAlias || escrow.sellerName}</span>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black font-mono text-amber-600">
                      -{escrow.amount.toLocaleString()} JOD
                    </div>
                    <span className="text-[9px] text-gray-450 font-mono uppercase font-black block mt-1.5 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 animate-spin text-amber-500" /> 
                      <span>{isAr ? 'محجوز مؤقتاً' : 'LOCKED'}</span>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-7 bg-white rounded-2xl border border-gray-100 text-xs text-gray-400">
                <BoxNoneIcon isAr={isAr} />
              </div>
            )}
          </div>
        </div>

        {/* 6. HISTORY LOGS */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-1.5 px-1">
            <History className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span className="text-[10px] font-black font-mono tracking-widest text-gray-500 uppercase">
              {isAr ? 'أرشيف المعاملات الدفترية' : 'TRANSFERS & SETTLEMENTS LEDGER'}
            </span>
          </div>

          <div className="space-y-2.5">
            {historicEscrows.length > 0 ? (
              historicEscrows.map((escrow) => {
                const isDeposit = escrow.status === 'released' || escrow.auctionId === 'cliq-dep';
                return (
                  <div 
                    key={escrow.id} 
                    className="bg-white border border-gray-100 p-4 rounded-2xl flex justify-between items-center hover:border-gray-150 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
                  >
                    <div className="space-y-1">
                      <h5 className="font-black text-gray-900 text-xs leading-none">
                        {escrow.auctionTitle}
                      </h5>
                      <p className="text-[9px] text-gray-400 font-mono">
                        REF_ID: {escrow.id.substring(0, 12).toUpperCase()}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      {/* Standard Jordan notation and beautiful colored signs */}
                      <div className={`font-mono font-black text-xs ${escrow.status === 'released' ? 'text-[#FF6B00]' : 'text-emerald-600'}`}>
                        {escrow.status === 'released' ? '-' : '+'}{escrow.amount.toLocaleString()} JOD
                      </div>
                      <span className={`text-[8px] font-mono inline-block px-2 py-0.5 rounded-md font-black uppercase mt-1.5 ${
                        escrow.status === 'released' 
                          ? 'bg-orange-50 text-orange-650 border border-orange-100' 
                          : 'bg-emerald-50 text-emerald-650 border border-emerald-100'
                      }`}>
                        {escrow.status === 'released' ? (isAr ? 'عربون مسحوب' : 'RELEASED TO WIN') : (isAr ? 'تم الشحن' : 'CREDITED')}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-7 bg-white rounded-2xl border border-gray-100 text-xs text-gray-400">
                {isAr ? 'سجل المعاملات السابقة خالٍ حالياً.' : 'Your CBJ audit ledger is empty.'}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

// Help empty state graphics
const BoxNoneIcon: React.FC<{ isAr: boolean }> = ({ isAr }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-2 p-1">
      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 border border-gray-100 mb-1">
        <Lock className="w-4 h-4 text-gray-400" />
      </div>
      <p className="font-bold text-gray-500 text-[11px] uppercase tracking-wide">
        {isAr ? 'لا يوجد مبالغ ضمان معلّقة' : 'No Active Locked Margins'}
      </p>
      <p className="text-[9.5px] text-gray-450 leading-normal max-w-[250px] mx-auto">
        {isAr 
          ? 'عربون المزايدة يتم تجميده فقط عندما تكون المزايد الأعلى في مزاد مباشر لحين رسوّ الصفقة.'
          : 'Bidding assurance is locked only when you are the premium bidder on an active live listing.'}
      </p>
    </div>
  );
};

