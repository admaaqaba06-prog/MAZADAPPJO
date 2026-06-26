import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { WalletRowSkeleton, EmptyState } from './FeedbackStates';
import { 
  User as UserIcon, 
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
  History,
  X,
  Eye,
  ArrowRight,
  UserCheck,
  CheckCircle2
} from 'lucide-react';
import { EscrowTransaction } from '../types';

export const WalletView: React.FC = () => {
  const { 
    wallet, 
    escrows, 
    setEscrows,
    triggerCliQTopUp, 
    addNotification, 
    language, 
    logout, 
    currentUser, 
    setShowSubscriptionPrompt,
    users,
    releaseEscrow,
    refundEscrow,
    setWallet
  } = useApp();
  
  const t = translations[language];
  const isAr = language === 'ar';

  const isStrictAdmin = currentUser && (currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true);

  // Filter escrows strictly for the current user if they are not admin
  const myEscrows = isStrictAdmin 
    ? escrows 
    : (currentUser ? escrows.filter(e => e.bidderId === currentUser.id || e.sellerId === currentUser.id) : []);

  const myPendingDeposits = myEscrows.filter(e => e.auctionId === 'cliq-dep' && e.status === 'locked');
  const myWonAuctionsPayments = myEscrows.filter(e => e.auctionId !== 'cliq-dep' && e.auctionId !== 'cliq-sub');
  
  // Normal Bidder Wallet States
  const [amount, setAmount] = useState<string>('500');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);
  const [alias, setAlias] = useState<string>('');
  const [fileUploaded, setFileUploaded] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedProof, setSubmittedProof] = useState<boolean>(false);
  const [copiedIBAN, setCopiedIBAN] = useState<boolean>(false);

  // Admin Ledger States
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedProofEscrow, setSelectedProofEscrow] = useState<EscrowTransaction | null>(null);

  const presets = [100, 250, 500, 1000, 2500];

  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleRealFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setFileUploaded(true);
      addNotification(
        isAr ? '📎 تم إرفاق الوصل البنكي' : '📎 Receipt Attached', 
        isAr ? `تم إرفاق الملف "${file.name}" بنجاح.` : `File "${file.name}" attached successfully.`, 
        'info'
      );
    }
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

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert(isAr ? 'الرجاء إدخال قيمة مالية صحيحة بالدينار.' : 'Please enter a valid amount in JOD.');
      return;
    }
    if (!alias.trim()) {
      alert(isAr ? 'اسم مستعار كليك مطلوب لتأشير الحوالة.' : 'Your bank CliQ alias is required.');
      return;
    }
    if (!fileUploaded || !selectedFile) {
      alert(isAr ? 'الرجاء إرفاق لقطة شاشة لوصل حوالة كليك للتحقق.' : 'Please upload your CliQ receipt screenshot to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('../services/firebase');
      
      const storagePath = `payment-proofs/${currentUser?.id || 'anonymous'}/${Date.now()}_${selectedFile.name}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, selectedFile);
      const downloadURL = await getDownloadURL(fileRef);

      await triggerCliQTopUp(Number(amount), alias, downloadURL);
      
      setIsSubmitting(false);
      setSubmittedProof(true);
      // Reset
      setAmount('500');
      setFileUploaded(false);
      setFileName('');
      setSelectedFile(null);
    } catch (error: any) {
      console.error("Firebase Storage write failure during CliQ receipt upload:", error);
      addNotification(
        isAr ? '❌ فشل رفع الإثبات' : '❌ Storage Upload Failed',
        isAr ? `تعذر رفع صورة إيصال التحويل. الرجاء المحاولة مرة أخرى.` : `Failed to upload payment receipt. Please try again.`,
        'alert'
      );
      setIsSubmitting(false);
    }
  };

  const handleAdminApproveDeposit = (escrowId: string) => {
    // Approve
    releaseEscrow(escrowId);
    
    // Find the item to see details
    const item = escrows.find(e => e.id === escrowId);
    if (item) {
      // Find beneficiary user and physically credit their wallet locally if it mimics active user
      addNotification(
        isAr ? '✅ تم الموافقة والاعتماد' : '✅ CliQ Deposit Credited',
        isAr 
          ? `تم اعتماد الحوالة بقيمة ${item.amount} د.أ وشحن محفظة ${item.bidderName} بنجاح.`
          : `Approved ${item.amount} JOD CliQ and successfully credited user ${item.bidderName}'s wallet balance.`,
        'win'
      );
    }
    if (selectedProofEscrow?.id === escrowId) {
      setSelectedProofEscrow(null);
    }
  };

  const handleAdminRejectDeposit = (escrowId: string) => {
    // Reject
    refundEscrow(escrowId);
    
    const item = escrows.find(e => e.id === escrowId);
    if (item) {
      addNotification(
        isAr ? '❌ تم رفض وإلغاء الحوالة' : '❌ CliQ Deposit Rejected',
        isAr 
          ? `تم رفض الحوالة البنكية بقيمة ${item.amount} د.أ الخاصة بـ ${item.bidderName}.` 
          : `Rejected CliQ verification request for ${item.amount} JOD of user ${item.bidderName}.`,
        'refund'
      );
    }
    if (selectedProofEscrow?.id === escrowId) {
      setSelectedProofEscrow(null);
    }
  };

  // -------------------------------------------------------------
  // CALCULATE BALANCES FOR ADMIN PLATFORM TREASURY (MAZADJOM CLIQ)
  // -------------------------------------------------------------
  const userCliqDeposits = escrows.filter(e => e.auctionId === 'cliq-dep');
  const subscriptionTransfers = escrows.filter(e => e.auctionId === 'cliq-sub');

  // Sum of all approved deposits across all users
  const approvedDepositsSum = userCliqDeposits
    .filter(e => e.status === 'released')
    .reduce((sum, e) => sum + e.amount, 0);

  // Sum of all pending deposits waiting on admin manual audit
  const pendingDepositsSum = userCliqDeposits
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingDepositsCount = userCliqDeposits.filter(e => e.status === 'locked').length;

  // Sum of subscription passthrough fees
  const subscriptionRevenueSum = subscriptionTransfers
    .filter(e => e.status === 'released')
    .reduce((sum, e) => sum + e.amount, 0);

  // Active user bidding locks (how much user bidding power is secured currently inside live items)
  const activeBiddingLocksSum = escrows
    .filter(e => e.auctionId !== 'cliq-dep' && e.auctionId !== 'cliq-sub' && e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  // Grand total received in MAZADJOM bank account (approved + pending + subscriptions)
  const totalMazadJomCapital = approvedDepositsSum + pendingDepositsSum + subscriptionRevenueSum;

  const currentLockedEscrows = escrows.filter(e => e.status === 'locked');
  const historicEscrows = escrows.filter(e => e.status !== 'locked');

  // Filter cliq deposit list for the admin view
  const filteredAdminDeposits = userCliqDeposits.filter(e => {
    if (adminFilter === 'all') return true;
    if (adminFilter === 'pending') return e.status === 'locked';
    if (adminFilter === 'approved') return e.status === 'released';
    if (adminFilter === 'rejected') return e.status === 'refunded';
    return true;
  });

  const activeSubscribers = users.filter(u => u.subscriptionStatus === 'active');

  // 1. ADMIN USER CONSOLE DESIGN (THE CORE CASH FLOW & AUDIT LEDGER)
  if (isStrictAdmin) {
    return (
      <div 
        className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-[#F3F6F8] pb-4 overscroll-contain select-none font-sans"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="admin-treasury-root"
      >
        {/* Admin Fintech Header Banner */}
        <div className="p-4 px-5 flex items-center justify-between border-b border-gray-200/80 sticky top-0 bg-[#F3F6F8]/90 backdrop-blur-md z-40">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF6B00]"></div>
            <h2 className="text-[12px] font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
              {isAr ? 'لوحة التدقيق المالي ومراقبة كليك 🏦' : 'MAZADJOM CLIQ gateway financial board 🏦'}
            </h2>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
          
          {/* Welcome Admin Row */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-150 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF6B00] flex items-center justify-center font-black text-lg border border-orange-100">
                A
              </div>
              <div>
                <h3 className="font-black text-gray-950 text-base flex items-center gap-1.5">
                  <span>{currentUser.name}</span>
                  <span className="text-[8px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 rounded leading-none">
                    {isAr ? 'المسؤول المالي' : 'TREASURY AUDITOR'}
                  </span>
                </h3>
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                  {isAr ? 'مستودع المراقبة النقدية لـ مازادكوم' : 'Corporate CliQ balance tracker & escrow reconciler'}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => logout()}
              type="button"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 text-gray-400 hover:text-rose-600 hover:bg-rose-50/50 transition-all text-xs font-bold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isAr ? 'خروج' : 'Exit'}</span>
            </button>
          </div>

          {/* 2. CORPORATE TREASURY DASHBOARD GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Grand balance */}
            <div className="bg-[#121318] text-white rounded-3xl p-5 border border-white/5 bg-gradient-to-br from-[#121318] to-[#1e2029] shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF6B00]/10 rounded-full blur-2xl pointer-events-none"></div>
              <div className="space-y-2 relative z-10">
                <span className="text-[9px] text-[#FF6B00] font-mono tracking-widest block uppercase font-black">
                  {isAr ? 'إجمالي المقبوضات كليك' : 'TOTAL TRANSFERRED FLOW'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-black font-mono tracking-tight text-white">
                    {totalMazadJomCapital.toLocaleString()}
                  </span>
                  <span className="text-[9px] font-black text-[#FF6B00] font-mono">JOD</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal pt-1 border-t border-white/5">
                  {isAr ? 'مجموع أرصدة المستخدمين والاشتراكات' : 'Cumulative users assets & passes'}
                </p>
              </div>
            </div>

            {/* Card 2: Approved deposits */}
            <div className="bg-white rounded-3xl p-5 border border-gray-255 shadow-xs">
              <div className="space-y-1.5">
                <span className="text-[9px] text-emerald-600 font-mono tracking-widest block uppercase font-black">
                  {isAr ? 'الإيداعات المعتمدة للعملاء' : 'APPROVED CREDITED JOD'}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono tracking-tight text-gray-900">
                    {approvedDepositsSum.toLocaleString()}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 font-mono">JOD</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {isAr ? 'مشحونة ومكتملة' : 'Reconciled & active'}
                </span>
              </div>
            </div>

            {/* Card 3: Subscription Passes Revenue */}
            <div className="bg-white rounded-3xl p-5 border border-gray-255 shadow-xs">
              <div className="space-y-1.5">
                <span className="text-[9px] text-violet-600 font-mono tracking-widest block uppercase font-black">
                  {isAr ? 'إيرادات اشتراكات كليك' : 'CLIQ REGISTRATION FEES'}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono tracking-tight text-gray-900">
                    {subscriptionRevenueSum.toLocaleString()}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 font-mono">JOD</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[9px] text-violet-600 font-bold bg-violet-50 px-2 py-0.5 rounded-md mt-2">
                  <Sparkles className="w-2.5 h-2.5 text-violet-500" />
                  {isAr ? `${activeSubscribers.length} مشترك نشط` : `${activeSubscribers.length} subscribers list`}
                </span>
              </div>
            </div>

            {/* Card 4: Pending Audits */}
            <div className="bg-white rounded-3xl p-5 border border-gray-255 shadow-xs relative">
              {pendingDepositsCount > 0 && (
                <span className="absolute top-4 right-4 bg-amber-500 text-white w-4 h-4 rounded-full text-[8.5px] font-mono font-bold flex items-center justify-center animate-bounce">
                  {pendingDepositsCount}
                </span>
              )}
              <div className="space-y-1.5">
                <span className="text-[9px] text-amber-600 font-mono tracking-widest block uppercase font-black">
                  {isAr ? 'حوالات معلّقة تحت التدقيق' : 'PENDING DESK AUDITS'}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono tracking-tight text-gray-900">
                    {pendingDepositsSum.toLocaleString()}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 font-mono">JOD</span>
                </div>
                <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md mt-2 ${pendingDepositsCount > 0 ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                  <Clock className="w-2.5 h-2.5" />
                  {isAr ? 'بانتظار مراجعة الوصل' : 'Awaiting receipt match'}
                </span>
              </div>
            </div>

          </div>

          {/* 3. USER CLIQ DEPOSITS LEDGER MANAGER */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
              <div>
                <h3 className="text-sm font-black text-gray-950 uppercase font-mono tracking-tight flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#FF6B00]" />
                  <span>{isAr ? 'سجل المراقبة ومضاهاة حوالات كليك' : 'CliQ Deposits Verification Queue'}</span>
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {isAr ? 'اضغط على تفاصيل الحوالة لعرض الإيصال والموافقة على التعبئة فورياً لعضو المزاد' : 'Approve user receipts instantly to credit their bidding wallets'}
                </p>
              </div>

              {/* Status Tab Filters */}
              <div className="flex bg-gray-200/50 p-1 rounded-xl gap-1 text-[10px] font-bold font-mono">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => {
                  const isActive = adminFilter === tab;
                  const labelAr = tab === 'all' ? 'الكل' : tab === 'pending' ? 'المعلقة' : tab === 'approved' ? 'المعتمدة' : 'المرفوضة';
                  const labelEn = tab.toUpperCase();
                  return (
                    <button
                      key={tab}
                      onClick={() => setAdminFilter(tab)}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        isActive 
                          ? 'bg-white text-gray-950 font-black shadow-xs' 
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {isAr ? labelAr : labelEn}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deposits list */}
            <div className="space-y-3">
              {filteredAdminDeposits.length > 0 ? (
                filteredAdminDeposits.map((escrow) => (
                  <div 
                    key={escrow.id} 
                    className="bg-white border border-gray-150 rounded-3xl p-5 hover:border-gray-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    id={`admin-escrow-row-${escrow.id}`}
                  >
                    
                    {/* User and amount summary */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Circle styled like bank receipt */}
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 text-gray-500 flex items-center justify-center font-black text-sm">
                          {escrow.bidderName.charAt(0).toUpperCase()}
                        </div>
                        {/* Status micro icon */}
                        <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border-2 border-white text-white ${
                          escrow.status === 'locked' ? 'bg-amber-500' : escrow.status === 'released' ? 'bg-emerald-500' : 'bg-gray-400'
                        }`}>
                          {escrow.status === 'locked' ? <Clock className="w-2.5 h-2.5" /> : escrow.status === 'released' ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : <X className="w-2.5 h-2.5" />}
                        </div>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-xs text-gray-950 truncate">{escrow.bidderName}</h4>
                          <span className="text-[8px] font-mono font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {escrow.cliqAlias || 'no_alias'}
                          </span>
                        </div>
                        
                        <div className="text-[10px] text-gray-450 font-mono space-x-1.5 flex flex-wrap items-center">
                          <span>REF: {escrow.id.substring(0, 8).toUpperCase()}</span>
                          <span>•</span>
                          <span>{new Date(escrow.timestamp).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US', {hour: '2-digit', minute: '2-digit'})}</span>
                        </div>
                      </div>
                    </div>

                    {/* Amount & action row */}
                    <div className="flex flex-col md:flex-row md:items-center gap-4 shrink-0 justify-between">
                      {/* Large JOD tag */}
                      <div className="text-right">
                        <div className="text-base font-black font-mono text-gray-950">
                          {escrow.amount.toLocaleString()} <span className="text-[9px] font-bold text-[#FF6B00]">JOD</span>
                        </div>
                        <span className={`text-[8px] font-mono font-black uppercase mt-0.5 inline-block ${
                          escrow.status === 'locked' ? 'text-amber-650' : escrow.status === 'released' ? 'text-emerald-600' : 'text-gray-400'
                        }`}>
                          {escrow.status === 'locked' ? (isAr ? 'معلّق قيد التحقق' : 'PENDING AUDIT') : escrow.status === 'released' ? (isAr ? 'تم الشحن والاعتماد' : 'CREDITED') : (isAr ? 'مرفوض ومسترجع' : 'REFUSED/CANCELLED')}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {/* View receipt screenshot always */}
                        <button
                          type="button"
                          onClick={() => setSelectedProofEscrow(escrow)}
                          className="px-3.5 py-2.5 text-[10.5px] font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1 shadow-2xs cursor-pointer bg-white"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                          <span>{isAr ? 'عرض الإيصال' : 'View Slip'}</span>
                        </button>

                        {/* If pending, permit approving and rejecting */}
                        {escrow.status === 'locked' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAdminApproveDeposit(escrow.id)}
                              className="px-3.5 py-2.5 text-[10.5px] font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
                              <span>{isAr ? 'شحن المحفظة' : 'Credit Wallet'}</span>
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleAdminRejectDeposit(escrow.id)}
                              className="p-2.5 text-[10.5px] font-bold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 active:scale-95 cursor-pointer"
                              title={isAr ? 'رفض الحوالة' : 'Reject Slip'}
                            >
                              <X className="w-3.5 h-3.5 text-red-600" />
                            </button>
                          </>
                        )}
                      </div>

                    </div>

                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-white rounded-3xl border border-gray-200 text-xs text-gray-400 font-bold uppercase font-mono">
                  {isAr ? 'لا يوجد حوالات تطابق الفلتر المختار.' : 'Empty Ledger matching criteria.'}
                </div>
              )}
            </div>
          </div>

          {/* 4. ACTIVE MEMBERS WITH SILVER PASS (REGISTRATION FEES) */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-xs font-black text-gray-900 tracking-wider uppercase font-mono flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#FF6B00]" />
                <span>{isAr ? 'سجل اشتراكات مزادكوم الفضية النشطة' : 'MAZADJOM Registered Member Subs'}</span>
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {isAr ? 'قائمة المستخدمين الذين حوّلوا قيمة الاشتراك لتنشيط وتعبئة حسابات المزايدات' : 'Users who cleared registration requirements via corporate CliQ'}
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {activeSubscribers.map((user) => (
                <div key={user.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {user.avatar ? (
                      <img src={user.avatar} className="w-8 h-8 rounded-full object-cover border border-gray-100" alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-[#FF6B00] flex items-center justify-center font-bold text-xs">{user.name.charAt(0)}</div>
                    )}
                    <div>
                      <h4 className="text-xs font-extrabold text-gray-900 leading-none">{user.name}</h4>
                      <p className="text-[9px] text-gray-450 mt-1 font-mono">{user.email} • {user.phoneNumber || '+962 7 9XXX XXXX'}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] font-mono font-bold text-gray-500 block">
                      {isAr ? 'رسوم التسجيل' : 'Register Fee'}
                    </span>
                    <span className="text-xs font-black text-[#FF6B00] font-mono block mt-0.5">
                      100 JOD
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bidding escrows stats overview */}
          <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-3xl flex items-center justify-between gap-4 flex-wrap text-xs text-gray-700 leading-normal">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#FF6B00]" />
              <div>
                <strong className="font-extrabold block text-[#FF6B00]">{isAr ? 'الضمانات النشطة للمزايدات المعلقة' : 'Active Secured Mutual Bid Margins'}</strong>
                <span className="text-[10px] text-gray-400">{isAr ? 'تم تجميدها من حسابات العملاء لصالح المزادات النشطة' : 'Currently locked from bidders to guarantee physical items'}</span>
              </div>
            </div>
            <div className="font-mono font-black text-gray-900">
              {activeBiddingLocksSum.toLocaleString()} JOD
            </div>
          </div>

        </div>

        {/* -------------------------------------------------------------
            CLIQ RECEIPT PREVIEW MODAL / DIALOG (FOR ADMIN AUDIT SCREEN)
            ------------------------------------------------------------- */}
        {selectedProofEscrow && (
          <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col border border-gray-100 max-h-[90vh]">
              
              {/* Modal sticky top */}
              <div className="p-4 border-b border-gray-150 flex items-center justify-between">
                <h3 className="font-black text-xs text-gray-800 uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#FF6B00]" />
                  <span>{isAr ? 'تدقيق إيصال كليك البنكي' : 'Verify CliQ Deposit Receipt'}</span>
                </h3>
                <button 
                  onClick={() => setSelectedProofEscrow(null)}
                  className="p-1 px-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Receipt Form Details */}
              <div className="p-5 space-y-4 overflow-y-auto">
                <div className="p-3 bg-[#FFF9F5] border border-[#FF6B00]/10 rounded-2xl space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{isAr ? 'اسم مرسل الحوالة' : 'Sender User'}:</span>
                    <strong className="font-black text-gray-900">{selectedProofEscrow.bidderName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{isAr ? 'معرف حساب كليك' : 'Sender CliQ Alias'}:</span>
                    <strong className="font-mono font-black text-[#FF6B00]">{selectedProofEscrow.cliqAlias || 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between border-t border-orange-100/40 pt-2">
                    <span className="text-gray-400">{isAr ? 'مبلغ الحوالة المطلوب' : 'Requested Top-Up'}:</span>
                    <strong className="font-mono font-black text-lg text-[#FF6B00]">{selectedProofEscrow.amount.toLocaleString()} JOD</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{isAr ? 'البنك المستلم' : 'Deposit Bank'}:</span>
                    <span className="font-mono uppercase font-black text-gray-500">Capital Bank - MAZADJOM</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase font-mono block">
                    {isAr ? 'لقطة الشاشة لإشعار التحويل البنكي' : 'Attached Bank Receipt Reference'}
                  </label>
                  {selectedProofEscrow.paymentProofUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-2 group shadow-2xs">
                      {/* Premium canvas representation of CliQ Receipt with real-time text block inside */}
                      <div className="w-full h-44 bg-[#E7F3FF] border border-blue-100 rounded-xl p-4 flex flex-col justify-between text-blue-900 font-sans relative">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[8px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded uppercase">CliQ Jordan</span>
                            <div className="text-[13px] font-black text-blue-900 mt-1">{isAr ? 'حوالة ناجحة' : 'CliQ Transfer Successful'}</div>
                          </div>
                          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white font-mono text-[9px] font-black">
                            Q
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[8px] text-blue-500 uppercase font-mono font-bold">{isAr ? 'المستقبل' : 'To Recipient'}</div>
                          <div className="text-[10.5px] font-black text-blue-950">MAZADJOM (Jordan Auctions LLC)</div>
                          <div className="text-[9px] font-mono text-blue-800">JO83 CAPS 1020 0085 4100 00</div>
                        </div>

                        <div className="flex justify-between items-end pt-2 border-t border-blue-200">
                          <div>
                            <div className="text-[8px] text-blue-500 uppercase font-mono font-black">{isAr ? 'تأشيرة الحوالة' : 'Bank Reference'}</div>
                            <div className="text-[9px] font-mono text-blue-950 font-black">TXN_{selectedProofEscrow.id.substring(0,8).toUpperCase()}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-blue-550 font-mono font-bold">JOD Amount</div>
                            <div className="text-[20px] font-black font-mono leading-none mt-1">{selectedProofEscrow.amount.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="absolute inset-0 bg-gray-900/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                        <span className="text-[10px] bg-white text-gray-900 font-black px-3 py-1.5 rounded-xl uppercase">
                          {isAr ? 'لقطة شاشة موالاة معتمدة' : 'Valid SliQ slip screenshot'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6 bg-gray-50 rounded-2xl border text-gray-400 text-xs">
                      {isAr ? 'لم يرفق إثبات صورة' : 'No visual proof attached'}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal footer actions */}
              <div className="p-4 bg-gray-50 border-t border-gray-150 flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedProofEscrow(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer text-xs font-bold"
                >
                  {isAr ? 'رجوع' : 'Back'}
                </button>

                {selectedProofEscrow.status === 'locked' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAdminRejectDeposit(selectedProofEscrow.id)}
                      className="px-4 py-2.5 rounded-xl border border-red-200 text-red-650 hover:bg-red-50 text-xs font-bold cursor-pointer"
                    >
                      {isAr ? 'رفض الطلب ❌' : 'Reject & Void ❌'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAdminApproveDeposit(selectedProofEscrow.id)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>{isAr ? 'قبول واعتماد فوري 💳' : 'Approve & Credit 💳'}</span>
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    );
  }

  // 2. NORMAL BIDDER WALLET REPRESENTATION
  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-[#F9FBFC] pb-4 overscroll-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="wallet-ledger-root"
    >
      
      {/* Premium Fintech Top Sticky Header */}
      <div className="p-4 px-5 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-[#F9FBFC]/90 backdrop-blur-md z-40">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF6B00]"></div>
          <h2 className="text-[12px] font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
            {isAr ? 'محفظتي ورصيدي' : 'MY WALLET & BALANCE'}
          </h2>
        </div>
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
                  {isStrictAdmin && (
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
                  {isAr ? 'رصيد المحفظة' : 'WALLET BALANCE'}
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
 
            {/* Split layout: AVAILABLE only */}
            <div className="grid grid-cols-1 gap-4">
              {/* AVAILABLE Column stretched */}
              <div>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[9.5px] font-black tracking-wider uppercase font-mono">
                    {isAr ? 'الرصيد المتاح للمزايدة' : 'AVAILABLE BALANCE'}
                  </span>
                </div>
                <p className="text-2xl font-black text-white font-mono tracking-tight mt-1">
                  {wallet.availableBalance.toLocaleString()} <span className="text-xs text-emerald-400 font-mono font-medium">JOD</span>
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
            
            <div className="flex justify-between items-center pb-1">
              <span className="text-gray-500 font-bold">{isAr ? 'اسم الحساب المستلم' : 'Account Name'}:</span>
              <span className="font-black text-gray-900">{isAr ? 'مؤسسة مزاد الأردن' : 'MAZAD JO M'}</span>
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
                      : 'The financial operations desk has received your payload. To credit it instantly in this simulated sandbox, head over to the Admin Panel top segment (CliQ list) and approve it!'}
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
                              : 'bg-white border-gray-200 text-gray-650 hover:bg-gray-50'
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
                      placeholder={isAr ? "مثال: name@cliq" : "e.g. name@cliq"}
                      className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-gray-900 text-xs font-black focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
                    />
                    <div className={`absolute top-3 ${isAr ? 'left-3' : 'right-3'} text-gray-300`}>
                      <UserIcon className="w-4 h-4" />
                    </div>
                  </div>
                </div>
 
                {/* Step 3: Screenshot Box */}
                <div className="space-y-2 pt-1">
                  <label className="text-[11px] text-gray-500 uppercase font-mono block font-black">
                    {isAr ? '3. لقطة شاشة لإثبات التحويل (إلزامي)' : '3. CLIQ RECEIPT SCREENSHOT ATTACHMENT'} <span className="text-red-500">*</span>
                  </label>
                  
                  {/* Real hidden file input */}
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleRealFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  <div 
                    onClick={handleTriggerFileInput}
                    className="border-2 border-dashed border-gray-200 hover:border-[#FF6B00] rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 bg-[#FAF9F6] shadow-2xs group"
                    id="screenshot-uploader-box"
                  >
                    {fileUploaded && selectedFile ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-emerald-650">
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
                            {isAr ? 'دعم صيغ الصور PNG، JPEG' : 'SUPPORTED FORMATS: PNG, JPG'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
 
                {/* Step 4: Submit Buttons */}
                <button 
                  type="submit" 
                  disabled={isSubmitting || !fileUploaded || !selectedFile}
                  className={`w-full font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md uppercase text-xs cursor-pointer select-none ${
                    isSubmitting || !fileUploaded || !selectedFile
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none border border-gray-200' 
                      : 'bg-[#FF6B00] hover:bg-[#FF8000] text-white hover:shadow-lg active:scale-[0.99]'
                  }`}
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
 
        {/* 5. MY PENDING DEPOSITS */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-1.5 px-1">
            <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span className="text-[10px] font-black font-mono tracking-widest text-gray-500 uppercase">
              {isAr ? 'طلبات الإيداع المعلقة الخاصة بي' : 'MY PENDING DEPOSITS'}
            </span>
          </div>
          
          <div className="space-y-3">
            {isLoading ? (
              <>
                <WalletRowSkeleton />
                <WalletRowSkeleton />
              </>
            ) : myPendingDeposits.length > 0 ? (
              myPendingDeposits.map((escrow) => (
                <div 
                  key={escrow.id} 
                  className="bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:border-gray-200 transition-all"
                  id={`my-pending-deposit-row-${escrow.id}`}
                >
                  <div className="min-w-0 flex-1 pr-3 pl-3">
                    <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-mono font-black uppercase block w-max leading-none">
                      {isAr ? 'قيد التدقيق والتحقق' : 'UNDER SYSTEM AUDIT'}
                    </span>
                    <h5 className="font-extrabold text-[12.5px] text-gray-950 truncate mt-2">
                      {isAr ? 'شحن رصيد المحفظة عبر كليك' : 'Wallet Top-Up via CliQ'}
                    </h5>
                    <p className="text-[9.5px] text-gray-400 mt-0.5 flex items-center gap-1">
                      <span>{isAr ? 'الاسم المستعار:' : 'CliQ Alias:'}</span>
                      <span className="font-mono text-gray-600 font-black">{escrow.cliqAlias}</span>
                    </p>
                  </div>
 
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black font-mono text-amber-600">
                      +{escrow.amount.toLocaleString()} JOD
                    </div>
                    <span className="text-[9px] text-gray-450 font-mono uppercase font-black block mt-1.5 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 animate-pulse text-amber-500" /> 
                      <span>{isAr ? 'بانتظار التأكيد' : 'PENDING'}</span>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-7 bg-white rounded-2xl border border-gray-100 text-xs text-gray-400">
                <div className="flex flex-col items-center justify-center space-y-2 p-1">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 border border-gray-100 mb-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="font-bold text-gray-500 text-[11px] uppercase tracking-wide">
                    {isAr ? 'لا يوجد طلبات إيداع معلقة' : 'No Pending Deposits'}
                  </p>
                  <p className="text-[9.5px] text-gray-450 leading-normal max-w-[250px] mx-auto">
                    {isAr 
                      ? 'تظهر طلبات التعبئة هنا فور رفع إشعار التحويل البنكي بانتظار موافقة الإدارة.'
                      : 'Pending cliq top-ups will be listed here after submitting the bank slip receipt.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
 
        {/* 6. MY WON AUCTIONS PAYMENTS */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-1.5 px-1">
            <CheckCircle className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span className="text-[10px] font-black font-mono tracking-widest text-gray-500 uppercase">
              {isAr ? 'دفعات وضمانات مزاداتي' : 'MY WON AUCTIONS PAYMENTS'}
            </span>
          </div>
 
          <div className="space-y-2.5">
            {isLoading ? (
              <>
                <WalletRowSkeleton />
                <WalletRowSkeleton />
                <WalletRowSkeleton />
              </>
            ) : myWonAuctionsPayments.length > 0 ? (
              myWonAuctionsPayments.map((escrow) => {
                const isReleased = escrow.status === 'released';
                return (
                  <div 
                    key={escrow.id} 
                    className="bg-white border border-gray-100 p-4 rounded-2xl flex justify-between items-center hover:border-gray-150 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
                    id={`my-won-auction-row-${escrow.id}`}
                  >
                    <div className="space-y-1">
                      <span className={`text-[8px] font-mono inline-block px-1.5 py-0.5 rounded-md font-black uppercase mt-1 ${
                        isReleased 
                          ? 'bg-emerald-50 text-emerald-650 border border-emerald-100' 
                          : 'bg-amber-50 text-amber-600 border border-amber-100'
                      }`}>
                        {isReleased ? (isAr ? 'تم تحرير الدفع' : 'RELEASED / WON') : (isAr ? 'ضمان معلّق' : 'LOCKED IN ESCROW')}
                      </span>
                      <h5 className="font-black text-gray-900 text-xs mt-1">
                        {escrow.auctionTitle}
                      </h5>
                      <p className="text-[9px] text-gray-400 font-mono">
                        REF_ID: {escrow.id.substring(0, 12).toUpperCase()}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <div className={`font-mono font-black text-xs ${isReleased ? 'text-[#FF6B00]' : 'text-amber-600'}`}>
                        -{escrow.amount.toLocaleString()} JOD
                      </div>
                      <span className="text-[9px] text-gray-450 font-mono mt-1 block">
                        {new Date(escrow.timestamp).toLocaleDateString(isAr ? 'ar-JO' : 'en-US')}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState 
                title={isAr ? 'لا توجد دفعات مزادات بعد' : 'No won auctions payments'}
                description={isAr ? 'تظهر دفعات وضمانات المزادات التي شاركت بها أو فزت بها هنا.' : 'Secure deposits and released payments for your bids will be recorded here.'}
                language={isAr ? 'ar' : 'en'}
              />
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
