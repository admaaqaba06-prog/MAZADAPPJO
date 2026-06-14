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
  Camera
} from 'lucide-react';

export const WalletView: React.FC = () => {
  const { wallet, escrows, triggerCliQTopUp, addNotification, language, logout, currentUser } = useApp();
  const t = translations[language];
  const isAr = language === 'ar';
  
  // States
  const [amount, setAmount] = useState<string>('500');
  const [alias, setAlias] = useState<string>('zain.cliq');
  const [fileUploaded, setFileUploaded] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedProof, setSubmittedProof] = useState<boolean>(false);

  const handleSimulatedFileUpload = () => {
    setFileName(`cliq_receipt_jordan_ref_${Math.floor(Date.now() / 1000)}.png`);
    setFileUploaded(true);
    addNotification(isAr ? '📎 تم إرفاق الوصل البنكي' : '📎 Receipt Attached', isAr ? 'تم تحميل لقطة شاشة الحوالة بنجاح.' : 'Simulated CliQ transaction slip image attached successfully.', 'info');
  };

  const handleTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert(isAr ? 'الرجاء إدخال قيمة مالية صحيحة بالدينار.' : 'Please enter correct amount.');
      return;
    }
    if (!alias.trim()) {
      alert(isAr ? 'مستعار كليك مطلوب لتأشير الحوالة.' : 'Your bank cliq alias is required.');
      return;
    }
    if (!fileUploaded) {
      alert(isAr ? 'الرجاء إرفاق لقطة شاشة لوصل حوالة كليك لإرساله للتدقيق.' : 'Please attach your cliq receipt screenshot proof first.');
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
      className="flex-1 overflow-y-auto w-full flex flex-col bg-[#F8F8F8] pb-24 overscroll-behavior-y-contain select-none font-sans text-gray-800"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="wallet-ledger-root"
    >
      
      {/* Top Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-150 sticky top-0 bg-[#F8F8F8]/90 backdrop-blur-md z-45">
        <h2 className="text-xs font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
          {isAr ? 'الملف الشخصي والمحفظة' : 'USER PROFILE & WALLET'}
        </h2>
        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold font-mono">
          {isAr ? 'تدقيق بنك الأردن المركزي' : 'CBJ COMPLIANT'}
        </span>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        
        {/* 1. TOP USER CARD */}
        {currentUser && (
          <div className="bg-white rounded-[20px] p-5 shadow-xs border border-gray-100 relative flex items-center gap-4">
            {/* Logout button: small, top right, gray border */}
            <button
              onClick={() => logout()}
              type="button"
              className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all cursor-pointer text-[10.5px] font-bold active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isAr ? 'خروج' : 'LOG OUT'}</span>
            </button>

            <div className="flex items-center gap-4">
              {currentUser.avatar ? (
                <img 
                  src={currentUser.avatar} 
                  alt={currentUser.name} 
                  className="w-[56px] h-[56px] rounded-full object-cover border-2 border-gray-100 shadow-xs"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-[56px] h-[56px] rounded-full bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center font-bold text-lg border border-[#FF6B00]/20">
                  {currentUser.name.charAt(0)}
                </div>
              )}
              
              <div className="space-y-0.5">
                <h3 className="text-[18px] font-bold text-gray-900 leading-tight">
                  {currentUser.name}
                </h3>
                <p className="text-[12px] text-gray-400">
                  {currentUser.email}
                </p>
                
                {/* Membership badge below name: "ACTIVE MEMBER" green pill OR "EXPIRED" red pill */}
                <div className="pt-1 select-none">
                  {currentUser.subscriptionStatus === 'active' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-150 uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      {isAr ? 'عضو نشط' : 'ACTIVE MEMBER'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider bg-red-50 text-red-700 border border-red-150 uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                      {isAr ? 'منتهي الصلاحية' : 'EXPIRED'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. WALLET BALANCE CARD */}
        <div className="bg-white border border-[#FF6B00]/20 rounded-[20px] p-6 shadow-sm relative overflow-hidden bg-gradient-to-br from-white to-orange-50/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="space-y-4 relative z-10">
            <div>
              <span className="text-[10px] text-gray-400 font-mono tracking-widest block uppercase font-bold">
                {isAr ? 'إجمالي الرصيد' : 'TOTAL BALANCE'}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-[48px] font-black font-sans text-gray-900 leading-none tracking-tight">
                  {wallet.totalBalance.toLocaleString()}
                </span>
                <span className="text-sm font-sans font-black text-[#FF6B00] uppercase tracking-wide">JOD</span>
              </div>
            </div>

            {/* Divider line */}
            <div className="border-t border-gray-100" />

            <div className="grid grid-cols-2 gap-4 pt-1">
              {/* Left Column: Available */}
              <div className="border-r border-gray-100 pl-1 pr-2">
                <span className="text-[10px] text-emerald-600 uppercase font-mono block font-bold tracking-wider">
                  {isAr ? 'المتاح للمزايدات' : 'AVAILABLE'}
                </span>
                <p className="text-xl font-bold text-gray-900 tracking-tight mt-1">
                  {wallet.availableBalance.toLocaleString()} <span className="text-xs text-emerald-600 font-mono font-bold">JOD</span>
                </p>
              </div>
              
              {/* Right Column: In Escrow */}
              <div className="pl-2">
                <span className="text-[10px] text-[#FF6B00] uppercase font-mono block font-bold tracking-wider">
                  {isAr ? 'المعلق بالضمان' : 'IN ESCROW'}
                </span>
                <p className="text-xl font-bold text-gray-900 tracking-tight mt-1">
                  {wallet.escrowBalance.toLocaleString()} <span className="text-xs text-[#FF6B00] font-mono font-bold">JOD</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. DEPOSIT SECTION */}
        <div className="space-y-2.5">
          <h3 className="text-[16px] font-bold text-gray-900 tracking-tight px-1">
            {isAr ? 'إضافة أموال' : 'Add Funds'}
          </h3>
          
          <div className="bg-white border border-gray-150 rounded-[20px] p-5 shadow-sm space-y-4">
            {submittedProof ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center space-y-3" id="submitted-slip-alert">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 mx-auto">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
                <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
                  {isAr ? 'تم رفع إشعار الحوالة لتأكيدها إدارياً. يرجى التوجه للوحة تحكم المدير (قسم الإيداعات المالية) لاعتماده فوراً وتحشييد رصيدك في الحال!' : 'Screenshot receipt uploaded to system audits. Instantly approve your deposit inside the Administrative Hub (CliQ list) to credit funds!'}
                </p>
                <button 
                  onClick={() => setSubmittedProof(false)}
                  className="text-xs text-[#FF6B00] font-black hover:underline uppercase cursor-pointer"
                >
                  {isAr ? 'إجراء عملية إيداع أخرى' : 'Trigger another cliq deposit'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleTopUpSubmit} className="space-y-4" id="topup-compliance-form">
                
                {/* Amount input block with large centered number & JOD inside */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-gray-500 uppercase font-mono block font-bold">
                    {isAr ? 'قيمة مبلغ التحويل (دينار)' : 'TRANSFER AMOUNT (JOD)'} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="500"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3.5 px-6 font-bold text-2xl text-center text-gray-950 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
                    />
                    <span className="absolute right-5 text-sm font-black text-[#FF6B00] tracking-wide pointer-events-none select-none">JOD</span>
                  </div>
                </div>

                {/* CliQ alias input below */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-gray-500 uppercase font-mono block font-bold">
                    {isAr ? 'اسم مستعار كليك الخاص بحسابك' : 'YOUR ACCOUNT BANK CLIQ ALIAS'} <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="zain.cliq"
                    className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-4 text-gray-850 text-xs focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
                  />
                </div>

                {/* Upload screenshot button (dashed border, camera icon) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-gray-500 uppercase font-mono block font-bold">
                    {isAr ? 'صورة إيصال التحويل (إلزامي)' : 'CLIQ TRANSACTION SLIP SCREENSHOT'} <span className="text-red-500">*</span>
                  </label>
                  
                  <div 
                    onClick={handleSimulatedFileUpload}
                    className="border border-dashed border-gray-200 hover:border-[#FF6B00] rounded-xl p-5 text-center cursor-pointer transition-colors space-y-2 bg-gray-50/50 shadow-xs"
                    id="screenshot-uploader-box"
                  >
                    {fileUploaded ? (
                      <div className="flex items-center justify-center gap-2 text-emerald-600 font-medium">
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        <span className="font-mono text-[10.5px] text-gray-500 truncate max-w-[210px]">{fileName}</span>
                      </div>
                    ) : (
                      <div className="text-gray-400 space-y-1.5">
                        <Camera className="w-7 h-7 mx-auto text-gray-400" />
                        <p className="font-extrabold text-[11px] text-[#FF6B00] uppercase">
                          {isAr ? 'اضغط لإرفاق لقطة شاشة إيصال الحوالة' : 'CLICK TO UPLOAD RECEIPT SCREENSHOT'}
                        </p>
                        <p className="text-[9px] text-gray-400 uppercase tracking-tight">
                          {isAr ? 'صيغ PNG، JPG المتوفرة محلياً' : 'SUPPORTED FORMATS: PNG, JPG'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit button: full width orange */}
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-[#FF6B00] hover:bg-[#FF8A00] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 uppercase text-xs cursor-pointer select-none"
                  id="submit-deposit-proof-btn"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>{isAr ? 'جاري تسجيل وإرسال الإشعار...' : 'SUBMITTING DEPOSIT REQUEST...'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'تقديم طلب الإيداع' : 'Submit Deposit Request'}</span>
                  )}
                </button>

              </form>
            )}
          </div>
        </div>

        {/* Active systems escrows list - Designed cleanly to match fintech mood */}
        <div className="space-y-2.5 pt-2">
          <h4 className="text-[10px] font-black font-mono tracking-widest text-[#FF6B00] uppercase px-1">
            {isAr ? 'الضمانات النشطة المحجوزة' : 'ACTIVE SYSTEM ESCROW LOCKED MARGINS'}
          </h4>
          
          <div className="space-y-2.5">
            {currentLockedEscrows.length > 0 ? (
              currentLockedEscrows.map((escrow) => (
                <div key={escrow.id} className="bg-white border border-gray-100 p-4 rounded-[20px] flex items-center justify-between shadow-xs">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-600 font-mono font-bold uppercase block w-max leading-none">
                      {escrow.auctionId === 'cliq-dep' ? (isAr ? 'قيد التدقيق والترحيل' : 'AUDIT PROCESSING') : (isAr ? 'مزاد نشط مجمد' : 'ACTIVE BID LOCK')}
                    </span>
                    <h5 className="font-extrabold text-xs text-gray-900 truncate mt-2">{escrow.auctionTitle}</h5>
                    <p className="text-[9px] text-gray-400 mt-0.5">{isAr ? 'حساب التدقيق المستهدف' : 'Audited Node alias'}: <span className="font-mono text-gray-500 font-bold">{escrow.cliqAlias || escrow.sellerName}</span></p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black font-mono text-amber-600">
                      -{escrow.amount.toLocaleString()} <span className="text-[8px] text-gray-400">JOD</span>
                    </div>
                    <span className="text-[8.5px] text-gray-400 font-mono uppercase block mt-1 flex items-center justify-end gap-1">
                      <Clock className="w-2.5 h-2.5 animate-spin text-amber-500" /> {isAr ? 'مؤمن مجمد' : 'LOCKED'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 bg-white rounded-[20px] border border-gray-100 text-[11px] text-gray-400 max-w-none">
                {isAr ? 'لا يوجد ضمانات نشطة حالياً.' : 'You have no assets locked in current escrows.'}
              </div>
            )}
          </div>
        </div>

        {/* Historic logs - Desigend cleanly to match fintech mood */}
        <div className="space-y-2.5 pt-2">
          <h4 className="text-[10px] font-black font-mono tracking-widest text-[#FF6B00] uppercase px-1">
            {isAr ? 'سجل المعاملات والتحقق' : 'CBJ COMPLIANCE HISTORIC AUDITS'}
          </h4>
          <div className="space-y-2">
            {historicEscrows.length > 0 ? (
              historicEscrows.map((escrow) => (
                <div key={escrow.id} className="bg-white border border-gray-100 p-4 rounded-[20px] flex justify-between text-xs items-center hover:bg-gray-50/50 transition-colors shadow-xs">
                  <div>
                    <h5 className="font-extrabold text-gray-900 text-[11.5px] leading-tight">{escrow.auctionTitle}</h5>
                    <p className="text-[9px] text-gray-400 mt-0.5 font-mono">ID: {escrow.id.substring(0, 10)}</p>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-black text-xs ${escrow.status === 'released' ? 'text-[#FF6B00]' : 'text-emerald-600'}`}>
                      {escrow.status === 'released' ? '-' : '+'}{escrow.amount.toLocaleString()} JOD
                    </div>
                    <span className={`text-[8.5px] font-mono inline-block px-2 py-0.5 rounded-full font-black uppercase mt-1 ${escrow.status === 'released' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                      {escrow.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 bg-white rounded-[20px] border border-gray-100 text-[11px] text-gray-400 max-w-none">
                {isAr ? 'سجل المعاملات فارغ حالياً.' : 'No historic ledger audits found.'}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

