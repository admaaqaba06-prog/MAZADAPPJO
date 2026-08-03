import React from 'react';
import { 
  LogOut, 
  Sparkles, 
  Clock, 
  Building2, 
  Check, 
  X, 
  Eye, 
  UserCheck, 
  Lock, 
  ShieldCheck, 
  CheckCircle2, 
  CheckCircle, 
  XCircle 
} from 'lucide-react';
import { EscrowTransaction } from '../types';

interface AdminWalletConsoleProps {
  isAr: boolean;
  currentUser: any;
  logout: () => void;
  totalMazadJomCapital: number;
  approvedDepositsSum: number;
  subscriptionRevenueSum: number;
  activeSubscribers: any[];
  pendingDepositsSum: number;
  pendingDepositsCount: number;
  activeBiddingLocksSum: number;
  adminFilter: 'all' | 'pending' | 'approved' | 'rejected';
  setAdminFilter: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
  filteredAdminDeposits: EscrowTransaction[];
  selectedProofEscrow: EscrowTransaction | null;
  setSelectedProofEscrow: (escrow: EscrowTransaction | null) => void;
  handleAdminRejectDeposit: (id: string) => void;
  handleAdminApproveDeposit: (id: string) => void;
  currentLockedEscrows: EscrowTransaction[];
  historicEscrows: EscrowTransaction[];
  users: any[];
  language: string;
}

export const AdminWalletConsole: React.FC<AdminWalletConsoleProps> = ({
  isAr,
  currentUser,
  logout,
  totalMazadJomCapital,
  approvedDepositsSum,
  subscriptionRevenueSum,
  activeSubscribers,
  pendingDepositsSum,
  pendingDepositsCount,
  activeBiddingLocksSum,
  adminFilter,
  setAdminFilter,
  filteredAdminDeposits,
  selectedProofEscrow,
  setSelectedProofEscrow,
  handleAdminRejectDeposit,
  handleAdminApproveDeposit,
  currentLockedEscrows,
  historicEscrows,
  users,
  language
}) => {
  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-surface-sunken pb-4 overscroll-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="admin-treasury-root"
    >
      {/* Admin Fintech Header Banner */}
      <div className="p-4 px-5 flex items-center justify-between border-b border-line/80 sticky top-0 bg-surface-sunken/90 backdrop-blur-md z-40">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#FF6B00]"></div>
          <h2 className="text-[12px] font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
            {isAr ? 'لوحة التدقيق المالي ومراقبة كليك 🏦' : 'MAZADJOM CLIQ gateway financial board 🏦'}
          </h2>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
        
        {/* Welcome Admin Row */}
        <div className="bg-surface-raised rounded-3xl p-5 shadow-xs border border-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-weak text-[#FF6B00] flex items-center justify-center font-black text-lg border border-orange-100">
              A
            </div>
            <div>
              <h3 className="font-black text-fg text-base flex items-center gap-1.5">
                <span>{currentUser?.name}</span>
                <span className="text-[8px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 rounded leading-none">
                  {isAr ? 'المسؤول المالي' : 'TREASURY AUDITOR'}
                </span>
              </h3>
              <p className="text-[11px] text-fg-muted font-mono mt-0.5">
                {isAr ? 'مستودع المراقبة النقدية لـ مازادكوم' : 'Corporate CliQ balance tracker & escrow reconciler'}
              </p>
            </div>
          </div>
          
          <button
            onClick={() => logout()}
            type="button"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-line text-fg-muted hover:text-rose-600 hover:bg-rose-50/50 transition-all text-xs font-bold cursor-pointer"
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
              <p className="text-[10px] text-fg-muted leading-normal pt-1 border-t border-white/5">
                {isAr ? 'مجموع أرصدة المستخدمين والاشتراكات' : 'Cumulative users assets & passes'}
              </p>
            </div>
          </div>

          {/* Card 2: Approved deposits */}
          <div className="bg-surface-raised rounded-3xl p-5 border border-line shadow-xs">
            <div className="space-y-1.5">
              <span className="text-[9px] text-emerald-600 font-mono tracking-widest block uppercase font-black">
                {isAr ? 'الإيداعات المعتمدة للعملاء' : 'APPROVED CREDITED JOD'}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tight text-fg">
                  {approvedDepositsSum.toLocaleString()}
                </span>
                <span className="text-[9px] font-bold text-fg-muted font-mono">JOD</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {isAr ? 'مشحونة ومكتملة' : 'Reconciled & active'}
              </span>
            </div>
          </div>

          {/* Card 3: Subscription Passes Revenue */}
          <div className="bg-surface-raised rounded-3xl p-5 border border-line shadow-xs">
            <div className="space-y-1.5">
              <span className="text-[9px] text-violet-600 font-mono tracking-widest block uppercase font-black">
                {isAr ? 'إيرادات اشتراكات كليك' : 'CLIQ REGISTRATION FEES'}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono tracking-tight text-fg">
                  {subscriptionRevenueSum.toLocaleString()}
                </span>
                <span className="text-[9px] font-bold text-fg-muted font-mono">JOD</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] text-violet-600 font-bold bg-violet-50 px-2 py-0.5 rounded-md mt-2">
                <Sparkles className="w-2.5 h-2.5 text-violet-500" />
                {isAr ? `${activeSubscribers.length} مشترك نشط` : `${activeSubscribers.length} subscribers list`}
              </span>
            </div>
          </div>

          {/* Card 4: Pending Audits */}
          <div className="bg-surface-raised rounded-3xl p-5 border border-line shadow-xs relative">
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
                <span className="text-2xl font-black font-mono tracking-tight text-fg">
                  {pendingDepositsSum.toLocaleString()}
                </span>
                <span className="text-[9px] font-bold text-fg-muted font-mono">JOD</span>
              </div>
              <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md mt-2 ${pendingDepositsCount > 0 ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-surface-sunken text-fg-muted'}`}>
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
              <h3 className="text-sm font-black text-fg uppercase font-mono tracking-tight flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#FF6B00]" />
                <span>{isAr ? 'سجل المراقبة ومضاهاة حوالات كليك' : 'CliQ Deposits Verification Queue'}</span>
              </h3>
              <p className="text-[10px] text-fg-muted mt-0.5">
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
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-surface-raised text-fg font-black shadow-xs' 
                        : 'text-fg-muted hover:text-fg'
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
                  className="bg-surface-raised border border-line rounded-3xl p-5 hover:border-line transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  id={`admin-escrow-row-${escrow.id}`}
                >
                  
                  {/* User and amount summary */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-line text-fg-muted flex items-center justify-center font-black text-sm">
                        {escrow.bidderName.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border-2 border-white text-white ${
                        escrow.status === 'locked' ? 'bg-amber-500' : escrow.status === 'released' ? 'bg-emerald-500' : 'bg-gray-400'
                      }`}>
                        {escrow.status === 'locked' ? <Clock className="w-2.5 h-2.5" /> : escrow.status === 'released' ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : <X className="w-2.5 h-2.5" />}
                      </div>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-xs text-fg truncate">{escrow.bidderName}</h4>
                        <span className="text-[8px] font-mono font-bold bg-surface-sunken text-fg-muted px-1.5 py-0.5 rounded">
                          {escrow.cliqAlias || 'no_alias'}
                        </span>
                      </div>
                      
                      <div className="text-[10px] text-fg-muted font-mono space-x-1.5 flex flex-wrap items-center">
                        <span>REF: {escrow.id.substring(0, 8).toUpperCase()}</span>
                        <span>•</span>
                        <span>{new Date(escrow.timestamp).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US', {hour: '2-digit', minute: '2-digit'})}</span>
                      </div>
                    </div>
                  </div>

                  {/* Amount & action row */}
                  <div className="flex flex-col md:flex-row md:items-center gap-4 shrink-0 justify-between">
                    <div className="text-right">
                      <div className="text-base font-black font-mono text-fg">
                        {escrow.amount.toLocaleString()} <span className="text-[9px] font-bold text-[#FF6B00]">JOD</span>
                      </div>
                      <span className={`text-[8px] font-mono font-black uppercase mt-0.5 inline-block ${
                        escrow.status === 'locked' ? 'text-amber-600' : escrow.status === 'released' ? 'text-emerald-600' : 'text-fg-muted'
                      }`}>
                        {escrow.status === 'locked' ? (isAr ? 'معلّق قيد التحقق' : 'PENDING AUDIT') : escrow.status === 'released' ? (isAr ? 'تم الشحن والاعتماد' : 'CREDITED') : (isAr ? 'مرفوض ومسترجع' : 'REFUSED/CANCELLED')}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProofEscrow(escrow)}
                        className="px-3.5 py-2.5 text-[10.5px] font-bold rounded-xl border border-line text-fg-muted hover:bg-surface-sunken flex items-center gap-1 shadow-2xs cursor-pointer bg-surface-raised"
                      >
                        <Eye className="w-3.5 h-3.5 text-fg-muted" />
                        <span>{isAr ? 'عرض الإيصال' : 'View Slip'}</span>
                      </button>

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
              <div className="text-center py-10 bg-surface-raised rounded-3xl border border-line text-xs text-fg-muted font-bold uppercase font-mono">
                {isAr ? 'لا يوجد حوالات تطابق الفلتر المختار.' : 'Empty Ledger matching criteria.'}
              </div>
            )}
          </div>
        </div>

        {/* 4. ACTIVE MEMBERS WITH SILVER PASS */}
        <div className="bg-surface-raised border border-line rounded-3xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-black text-fg tracking-wider uppercase font-mono flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'سجل اشتراكات مزادكوم الفضية النشطة' : 'MAZADJOM Registered Member Subs'}</span>
            </h3>
            <p className="text-[10px] text-fg-muted mt-0.5">
              {isAr ? 'قائمة المستخدمين الذين حوّلوا قيمة الاشتراك لتنشيط وتعبئة حسابات المزايدات' : 'Users who cleared registration requirements via corporate CliQ'}
            </p>
          </div>

          <div className="divide-y divide-line">
            {activeSubscribers.map((user) => (
              <div key={user.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  {user.avatar ? (
                    <img src={user.avatar} className="w-8 h-8 rounded-full object-cover border border-line" alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent-weak text-[#FF6B00] flex items-center justify-center font-bold text-xs">{user.name.charAt(0)}</div>
                  )}
                  <div>
                    <h4 className="text-xs font-extrabold text-fg leading-none">{user.name}</h4>
                    <p className="text-[9px] text-fg-muted mt-1 font-mono">{user.email} • {user.phoneNumber || '+962 7 9XXX XXXX'}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] font-mono font-bold text-fg-muted block">
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
        <div className="p-4 bg-accent-weak/50 border border-orange-100 rounded-3xl flex items-center justify-between gap-4 flex-wrap text-xs text-fg leading-normal">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#FF6B00]" />
            <div>
              <strong className="font-extrabold block text-[#FF6B00]">{isAr ? 'الضمانات النشطة للمزايدات المعلقة' : 'Active Secured Mutual Bid Margins'}</strong>
              <span className="text-[10px] text-fg-muted">{isAr ? 'تم تجميدها من حسابات العملاء لصالح المزادات النشطة' : 'Currently locked from bidders to guarantee physical items'}</span>
            </div>
          </div>
          <div className="font-mono font-black text-fg">
            {activeBiddingLocksSum.toLocaleString()} JOD
          </div>
        </div>

      </div>

      {/* CLIQ RECEIPT PREVIEW MODAL */}
      {selectedProofEscrow && (() => {
        const selectedRequest = selectedProofEscrow;
        const isRealUrl = (url?: string) => {
          if (!url) return false;
          const clean = url.trim();
          return clean.startsWith('http://') || 
                 clean.startsWith('https://') || 
                 clean.startsWith('data:') || 
                 (clean.length > 30 && /^[A-Za-z0-9+/=]+$/.test(clean.substring(0, 30)));
        };
        const getReceiptImageSrc = (url?: string): string => {
          if (!url) return '';
          const clean = url.trim();
          if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
            return clean;
          }
          return `data:image/png;base64,${clean}`;
        };
        const rawUrl =
          selectedRequest.receiptUrl ??
          selectedRequest.paymentProofUrl ??
          selectedRequest.paymentProofImage ??
          selectedRequest.proofUrl ??
          selectedRequest.paymentImageUrl ??
          null;
        const receiptImageUrl = isRealUrl(rawUrl) ? getReceiptImageSrc(rawUrl) : null;

        return (
          <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-surface-raised rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col border border-line max-h-[90vh]">
              
              <div className="p-4 border-b border-line flex items-center justify-between">
                <h3 className="font-black text-xs text-fg uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#FF6B00]" />
                  <span>{isAr ? 'تدقيق إيصال كليك البنكي' : 'Verify CliQ Deposit Receipt'}</span>
                </h3>
                <button 
                  onClick={() => setSelectedProofEscrow(null)}
                  className="p-1 px-1.5 hover:bg-surface-sunken rounded-lg text-fg-muted hover:text-fg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto">
                <div className="p-3 bg-accent-weak border border-[#FF6B00]/10 rounded-2xl space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{isAr ? 'اسم مرسل الحوالة' : 'Sender User'}:</span>
                    <strong className="font-black text-fg">{selectedProofEscrow.bidderName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{isAr ? 'معرف حساب كليك' : 'Sender CliQ Alias'}:</span>
                    <strong className="font-mono font-black text-[#FF6B00]">{selectedProofEscrow.cliqAlias || 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between border-t border-orange-100/40 pt-2">
                    <span className="text-fg-muted">{isAr ? 'مبلغ الحوالة المطلوب' : 'Requested Top-Up'}:</span>
                    <strong className="font-mono font-black text-lg text-[#FF6B00]">{selectedProofEscrow.amount.toLocaleString()} JOD</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{isAr ? 'البنك المستلم' : 'Deposit Bank'}:</span>
                    <span className="font-mono uppercase font-black text-fg-muted">Arab Bank - MAZADJOM</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-fg-muted uppercase font-mono block">
                    {isAr ? 'لقطة الشاشة لإشعار التحويل البنكي' : 'Attached Bank Receipt Reference'}
                  </label>
                  {receiptImageUrl ? (
                    <img
                      src={receiptImageUrl}
                      alt="CliQ transfer receipt"
                      className="w-full rounded-xl border border-orange-100 object-contain max-h-[520px] bg-surface-raised"
                    />
                  ) : (
                    <div className="text-center p-6 bg-surface-sunken rounded-2xl border border-dashed border-line text-fg-muted text-xs">
                      No receipt image attached
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-surface-sunken border-t border-line flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedProofEscrow(null)}
                  className="px-4 py-2.5 rounded-xl border border-line text-fg-muted hover:bg-surface-sunken cursor-pointer text-xs font-bold"
                >
                  {isAr ? 'رجوع' : 'Back'}
                </button>

                {selectedProofEscrow.status === 'locked' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAdminRejectDeposit(selectedProofEscrow.id)}
                      className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold cursor-pointer"
                    >
                      {isAr ? 'رفض الطلب ❌' : 'Reject & Void ❌'}
                    </button>

                    <button
                      type="button"
                      disabled={!receiptImageUrl}
                      onClick={() => handleAdminApproveDeposit(selectedProofEscrow.id)}
                      className={`px-5 py-2.5 rounded-xl text-white font-black text-xs cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 ${
                        !receiptImageUrl 
                          ? 'bg-gray-300 text-fg-muted cursor-not-allowed shadow-none' 
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>{isAr ? 'قبول واعتماد فوري 💳' : 'Approve & Credit 💳'}</span>
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
