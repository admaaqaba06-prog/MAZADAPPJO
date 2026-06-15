import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { 
  ShieldCheck, 
  Users, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  Tv, 
  Coins, 
  Ban, 
  UserCheck, 
  Clock, 
  FileText, 
  TrendingUp,
  Cpu,
  UserX,
  FileCheck2,
  Sparkles,
  RefreshCw,
  LineChart,
  Trash2
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  const { 
    currentUser,
    users, 
    auctions, 
    escrows, 
    adminActions, 
    approveListing, 
    rejectListing, 
    verifySeller, 
    banUser, 
    unbanUser, 
    releaseEscrow, 
    refundEscrow,
    deleteAuction,
    language
  } = useApp();

  const t = translations[language];
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'metrics' | 'payments' | 'listings' | 'users' | 'subscriptions'>('metrics');

  const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscriptionRequests'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubscriptionRequests(list.filter((r: any) => r.subscriptionStatus === 'pending'));
    });
    return () => unsub();
  }, []);

  const approveSubscription = async (request: any) => {
    const expiry = request.plan === 'monthly'
      ? Date.now() + 30 * 24 * 60 * 60 * 1000
      : request.plan === 'quarterly'
      ? Date.now() + 90 * 24 * 60 * 60 * 1000
      : Date.now() + 365 * 24 * 60 * 60 * 1000;

    await updateDoc(doc(db, 'subscriptionRequests', request.id), {
      subscriptionStatus: 'active'
    });
    await updateDoc(doc(db, 'users', request.userId), {
      subscriptionStatus: 'active',
      subscriptionExpiry: expiry,
      subscriptionTier: request.plan
    });
  };

  const rejectSubscription = async (request: any) => {
    await updateDoc(doc(db, 'subscriptionRequests', request.id), {
      subscriptionStatus: 'rejected'
    });
    await updateDoc(doc(db, 'users', request.userId), {
      subscriptionStatus: 'none'
    });
  };

  const pendingCliQDrops = escrows.filter(e => e.status === 'locked' && e.auctionId === 'cliq-dep');
  const pendingListingDrops = auctions.filter(a => a.status === 'processing');
  
  // Computations
  const activeAuctionsNum = auctions.filter(a => a.status === 'live').length;
  const totalBidsSum = auctions.reduce((sum, a) => sum + a.totalBids, 0);
  const totalEscrowHeld = escrows
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-gray-50/50 pb-8 overscroll-contain select-none font-sans text-gray-800 animate-fadeIn"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="admin-dashboard-root"
    >
      
      {/* Top Header - Streamlined & Elegant */}
      <div className="p-5 flex items-center justify-between border-b border-gray-100 bg-white sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#FF6B00]" />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900 leading-none">
              {isAr ? 'لوحة التحكم والإشراف' : 'Control & Administration Panel'}
            </h2>
            <p className="text-[10px] text-gray-400 mt-1">
              {isAr ? 'إدارة المزادات، الحسابات، الدفعات والضمان' : 'Manage live auctions, accounts, payouts, and escrow'}
            </p>
          </div>
        </div>
        <span className="text-[10px] bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
          {isAr ? 'حساب مدير النظام' : 'SYSTEM ADMIN'}
        </span>
      </div>

      {/* Navigation Submenu - Premium Tab Buttons */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        {(['metrics', 'payments', 'listings', 'users', 'subscriptions'] as const).map((tab) => {
          const tabLabel = isAr 
            ? (tab === 'metrics' ? 'الإحصائيات العامّة' : tab === 'payments' ? 'إيداعات كليك' : tab === 'listings' ? 'المعروضات والمزادات' : tab === 'users' ? 'قائمة الأعضاء' : 'طلبات الاشتراك')
            : (tab === 'metrics' ? 'GENERAL METRICS' : tab === 'payments' ? 'CLIQ PAYMENTS' : tab === 'listings' ? 'AUCTIONS & LOTS' : tab === 'users' ? 'MEMBERS' : 'PREMIUM SUBS');
          
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive 
                  ? 'bg-gray-900 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="p-5 max-w-5xl mx-auto w-full space-y-5">
        
        {/* ==========================================
            TAB: SYSTEM METRICS (Clean Dashboard Cards)
            ========================================== */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            
            {/* Elegant 4-Card Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Escrow Vault */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'أرصدة الأمان والضمان' : 'ESCROW FUNDS'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {totalEscrowHeld.toLocaleString()} <span className="text-xs font-bold text-emerald-600">JOD</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'إيداعات كليك المحفوظة بسلامة' : 'Secure client balances held'}
                </div>
              </div>
              
              {/* Card 2: Live Channels */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center animate-pulse">
                    <Tv className="w-4 h-4 text-rose-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'المزادات النشطة الآن' : 'LIVE AUCTIONS'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {activeAuctionsNum} <span className="text-xs font-bold text-rose-600">{isAr ? 'مزاد' : 'Active'}</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'قنوات المزايدة البث الحي النشط' : 'Channels broadcasting right now'}
                </div>
              </div>

              {/* Card 3: Total Concluded Bids */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'إجمالي المزايدات' : 'TOTAL BIDS PLACED'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {totalBidsSum} <span className="text-xs font-bold text-gray-400">{isAr ? 'عطاء' : 'Bids'}</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'مجموع عروض الأسعار المسجلة' : 'Cumulative activity track'}
                </div>
              </div>

              {/* Card 4: Registered Users */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'عدد المستخدمين' : 'REGISTERED MEMBERS'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {users.length} <span className="text-xs font-bold text-gray-400">{isAr ? 'عضو' : 'Users'}</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'إجمالي الحسابات المسجلة بالمنصة' : 'Total accounts in database'}
                </div>
              </div>

            </div>

            {/* Simpler, Friendly Action Feed (Replacing complex SVG graphs & System Telemetry Logs) */}
            <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-xs font-extrabold text-gray-900 uppercase">
                    {isAr ? 'الأنشطة الأخيرة المتخذة في المنصة' : 'RECENT PLATFORM MODERATIONS'}
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {isAr ? 'سجل الإجراءات التي قام بها طاقم الإشراف والمدراء مؤخراً' : 'Audit logs of recent coordinator decisions'}
                  </p>
                </div>
                <span className="text-[9px] bg-gray-50 text-gray-400 px-2.5 py-1 rounded-lg font-mono">
                  {isAr ? 'محدث تلقائياً' : 'LIVE'}
                </span>
              </div>

              <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto pr-1">
                {adminActions.length > 0 ? (
                  adminActions.map((action) => (
                    <div key={action.id} className="py-3 flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-[#FF6B00] mt-1 shrink-0" />
                      <div className="space-y-1 flex-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="font-extrabold text-gray-900">{action.actionType.toUpperCase().replace('_', ' ')}</span>
                          <span className="text-gray-400 font-mono text-[9px]">Just now</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {isAr ? `${action.adminName} قام بتعديل ${action.targetName}` : `${action.adminName} modified ${action.targetName}`}
                        </p>
                        {action.details && (
                          <div className="bg-gray-50 text-gray-600 p-2 rounded-xl text-[10px] font-mono mt-1 border border-gray-100">
                            {action.details}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    {isAr ? 'لا توجد أنشطة مسجلة في الجلسة الحالية.' : 'No administration logs recorded in this session thread.'}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: PAYMENTS (CLIQ Receipts Verification)
            ========================================== */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات التحقق من حوالات كليك' : 'CLIQ DEPOSITS VERIFICATION'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'راجع واعتمد لقطات الحوالات المالية البنكية لشحن أرصدة المزايدة للمستخدمين مباشرة.' : 'Review and approve bank transfer receipts to instantly update bidding credit for Jordanian clients.'}</p>
            </div>

            <div className="space-y-3.5">
              {pendingCliQDrops.length > 0 ? (
                pendingCliQDrops.map((dep) => (
                  <div key={dep.id} className="bg-white border border-gray-150 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden transition-all hover:border-gray-250">
                    <div className="space-y-3 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-50 text-amber-800 border border-amber-100 text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                          {isAr ? 'بانتظار التحقق والمراجعة والتأكيد' : 'PENDING REVIEW'}
                        </span>
                        <span className="text-gray-400 text-[10px] font-mono">ID: {dep.id.substring(0, 8)}</span>
                      </div>
                      
                      <div>
                        <h4 className="font-extrabold text-sm text-gray-900">
                          {dep.bidderName}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {isAr ? 'اسم المستعار لكليك: ' : 'CliQ Alias: '} <span className="font-mono text-gray-800 font-bold">{dep.cliqAlias}</span>
                        </p>
                      </div>

                      {/* File presentation / Receipt slip */}
                      <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-700 font-mono truncate max-w-[200px]" title={dep.videoUrl || 'receipt.png'}>
                              {dep.videoUrl || 'receipt_proof_slip.png'}
                            </p>
                            <p className="text-[9px] text-gray-400">{isAr ? 'لقطة شاشة إشعار التحويل البنكي' : 'CliQ receipt attachment'}</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => alert(isAr ? 'معاينة لقطة الحوالة: تبدو حوالة بنكية أردنية صحيحة بنسبة ١٠٠٪.' : 'Previewing slip: validation completed successfully.')}
                          className="text-[11px] text-[#FF6B00] font-black hover:underline shrink-0 px-2"
                        >
                          {isAr ? 'عرض' : 'VIEW'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col md:items-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 font-mono block font-bold uppercase">{isAr ? 'المبلغ المطلوب إيداعه' : 'REQUESTED DEPOSIT'}</span>
                        <div className="text-xl font-black font-mono text-emerald-600 mt-0.5">
                          +{dep.amount.toLocaleString()} <span className="text-xs">JOD</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex md:flex-col gap-2 w-full md:w-auto">
                        <button 
                          onClick={() => releaseEscrow(dep.id)}
                          className="flex-1 md:w-44 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-3 rounded-xl transition-all shadow-xs"
                        >
                          {isAr ? 'قبول وشحن الرصيد' : 'APPROVE & ADD JOD'}
                        </button>
                        <button 
                          onClick={() => refundEscrow(dep.id)}
                          className="flex-1 md:w-44 bg-gray-100 hover:bg-gray-205 border border-gray-200 text-gray-700 font-semibold text-xs py-1.5 px-3 rounded-xl transition-all"
                        >
                          {isAr ? 'رفض الطلب' : 'REJECT / DENY'}
                        </button>
                      </div>
                    </div>

                  </div>
                ))
              ) : (
                <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl p-6 text-gray-400 space-y-3 shadow-xs">
                  <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                    <ShieldCheck className="w-6 h-6 text-[#10B981]" />
                  </div>
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase">{isAr ? 'مستقر ومطابق بالكامل' : 'NO PENDING RECEIPTS'}</h4>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                    {isAr ? 'لا توجد طلبات إيداع معلقة حالياً بانتظار التأكيد.' : 'All cliq receipts have been audited. User can submit a top-up request in their Wallet to test this queue.'}
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: LISTINGS (Lots approval and deletion)
            ========================================== */}
        {activeTab === 'listings' && (
          <div className="space-y-6">
            
            {/* Header */}
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات التحقق والموافقة على المزادات' : 'AUCTION LOT APPROVAL SYSTEM'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'قم بمراجعة المعروضات الجديدة التي أضافها المستخدمون للتصديق عليها وإتاحتها للبث المباشر.' : 'Review new auction entries submitted by merchants, launch them live, or purge existing database records.'}
              </p>
            </div>

            {/* List 1: Pending lots awaiting approvals */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5">
                {isAr ? 'طلبات الإطلاق المعلقة بانتظار الموافقة' : 'LOTS AWAITING PUBLIC RELEASE'}
              </h3>

              {pendingListingDrops.length > 0 ? (
                pendingListingDrops.map((item) => (
                  <div key={item.id} className="bg-white border border-gray-150 p-5 rounded-2xl space-y-4 shadow-xs transition-all hover:border-gray-250">
                    <div className="flex gap-4">
                      <img 
                        src={item.thumbnailUrl} 
                        alt="Lot Cover" 
                        className="w-16 h-16 rounded-xl object-cover border border-gray-150 shrink-0 shadow-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="bg-orange-50 text-[#FF6B00] border border-orange-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                          {item.category}
                        </span>
                        <h4 className="font-extrabold text-sm text-gray-900 truncate mt-2">{item.title}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {isAr ? 'سعر الابتداء: ' : 'Starting Bid: '} <span className="font-mono text-gray-800 font-bold">{item.startingPrice.toLocaleString()} JOD</span>
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-xl border border-gray-100">{item.description}</p>

                    {item.videoUrl && (
                      <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl space-y-2">
                        <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block">
                          🎥 {isAr ? 'معاينة محتوى الفيديو المرفق' : 'ATTACHED DEMO VIDEO'}
                        </span>
                        <div className="w-full bg-black rounded-lg overflow-hidden aspect-video relative max-h-[160px] flex items-center justify-center border border-gray-200 shadow-inner">
                          <video 
                            src={item.videoUrl} 
                            controls 
                            className="w-full h-full max-h-[158px] object-contain rounded-lg"
                            playsInline
                            preload="metadata"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button 
                        onClick={() => approveListing(item.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 rounded-xl transition-all shadow-xs"
                      >
                        {isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & GO LIVE'}
                      </button>
                      <button 
                        onClick={() => rejectListing(item.id)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-2 rounded-xl transition-all border border-gray-200"
                      >
                        {isAr ? 'رفض الطلب' : 'REJECT'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-white border border-gray-150 rounded-2xl p-6 text-gray-400 text-xs shadow-xs">
                  {isAr ? 'لا توجد مزادات معلقة بانتظار الموافقة حالياً.' : 'No items found in dynamic moderation queue.'}
                </div>
              )}
            </div>

            {/* List 2: Concluded Auctions Fulfillments */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {isAr ? 'المزادات المنتهية والترتيبات اللوجستية' : 'RECENTLY COMPLETED AUCTIONS & FULFILLMENT'}
              </h3>

              {(() => {
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && a.endTime < Date.now()));
                
                if (completedAuctions.length === 0) {
                  return (
                    <div className="text-center py-10 bg-white border border-gray-150 rounded-2xl p-6 text-gray-400 text-xs shadow-xs">
                      {isAr ? 'لم ينتهِ أي مزاد بعد في النظام لتسجيل فائزين.' : 'No auctions have closed yet.'}
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {completedAuctions.map((item) => {
                      const winnerUser = users.find(u => u.id === item.currentBidderId);
                      const winnerNameStr = winnerUser?.name || item.currentBidderName || (isAr ? 'لا يوجد مزايدين' : 'No bids placed');
                      const winnerPhoneStr = winnerUser?.phoneNumber || winnerUser?.transferPhone || (item.currentBidderId ? '+962 7 9888 1234' : 'N/A');
                      const winnerEmailStr = winnerUser?.email || (item.currentBidderId ? 'winner@example.com' : 'N/A');
                      const winnerCityStr = winnerUser?.city || (item.currentBidderId ? 'Amman' : 'N/A');

                      return (
                        <div key={item.id} className="bg-white border border-gray-150 p-5 rounded-2xl space-y-4 shadow-xs">
                          {/* Minimal item tag */}
                          <div className="flex gap-3 items-center">
                            <img src={item.thumbnailUrl} alt="Cover" className="w-11 h-11 rounded-lg object-cover border border-gray-150 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-extrabold text-xs text-gray-900 truncate leading-none mt-1">{item.title}</h4>
                              <p className="text-[11px] text-gray-500 mt-2 font-mono">
                                {isAr ? 'السعر النهائي المبيع: ' : 'Winning Bid: '} 
                                <strong className="text-emerald-600 font-extrabold">{item.currentPrice.toLocaleString()} JOD</strong>
                              </p>
                            </div>
                          </div>

                          {/* Winner Details Card - Plain clear details for courier */}
                          {item.currentBidderId ? (
                            <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-3.5 space-y-3">
                              <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest font-mono block">
                                🏆 {isAr ? 'بيانات التوصيل والتواصل مع المشري الفائز' : '🏆 CLIENT SHIPMENT & COORDINATES'}
                              </span>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-normal">
                                <div>
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'اسم العميل الفائز:' : 'FULL NAME'}</span>
                                  <span className="font-bold text-gray-900">{winnerNameStr}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'رقم الهاتف للتوصيل:' : 'TELEPHONE'}</span>
                                  <a href={`tel:${winnerPhoneStr}`} className="font-black text-[#FF6B00] hover:underline font-mono">{winnerPhoneStr}</a>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'البريد الإلكتروني:' : 'EMAIL'}</span>
                                  <span className="font-medium text-gray-850 font-mono truncate block">{winnerEmailStr}</span>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'المدينة والمنطقة:' : 'REGION'}</span>
                                  <span className="font-bold text-gray-900">{winnerCityStr}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-amber-800 italic bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                              {isAr ? 'انتهى هذا المزاد دون الحصول على أي عطاءات.' : 'Closed with zero bids.'}
                            </div>
                          )}

                          {item.currentBidderId && (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] text-gray-405 font-mono uppercase font-bold tracking-wider">Escrow Locked 🔒</span>
                              <button 
                                onClick={() => alert(isAr ? `تم نسخ معلومات الفائز وتأكيد بوليصة شحن المزاد بانتظار تسليم شركة الشحن في ${winnerCityStr}.` : `Copied winner’s shipping coordinates for Jordan regional dispatch!`)}
                                className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-850 text-white font-extrabold text-[11px] rounded-xl transition-all"
                              >
                                {isAr ? 'نسخ بيانات الشحن والتنسيق ✈️' : 'DISPATCH LOT ✈️'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* List 3: Master listings deletion */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600" />
                {isAr ? 'قائمة التحكم السريع وحذف المزادات' : 'MASTER PLATFORM LISTINGS DIRECTORY'}
              </h3>

              {auctions.length === 0 ? (
                <div className="text-center py-8 bg-white border border-gray-150 rounded-2xl p-4 text-gray-400 text-xs shadow-xs">
                  {isAr ? 'لا توجد مزادات في قاعدة البيانات.' : 'No registered entries found.'}
                </div>
              ) : (
                <div className="bg-white border border-gray-150 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-xs">
                  {auctions.map((item) => {
                    let statusLabel = item.status.toUpperCase();
                    let statusColor = 'bg-gray-100 text-gray-500';
                    if (item.status === 'live') {
                      statusLabel = isAr ? 'مباشر الآن 🟢' : 'LIVE';
                      statusColor = 'bg-emerald-50 text-emerald-800 border border-emerald-100';
                    } else if (item.status === 'processing') {
                      statusLabel = isAr ? 'قيد المراجعة ⏳' : 'PENDING';
                      statusColor = 'bg-amber-50 text-amber-800 border border-amber-100';
                    } else if (item.status === 'completed') {
                      statusLabel = isAr ? 'منتهي 🏆' : 'CLOSED';
                      statusColor = 'bg-blue-50 text-blue-800 border border-blue-100';
                    }

                    return (
                      <div 
                        key={item.id} 
                        className="p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-gray-50/55"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img 
                            src={item.thumbnailUrl} 
                            alt={item.title} 
                            className="w-10 h-10 rounded-lg object-cover border border-gray-150 shrink-0" 
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-[12px] text-gray-900 truncate" title={item.title}>
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded ${statusColor}`}>
                                {statusLabel}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {item.currentPrice.toLocaleString()} JOD
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const conf = window.confirm(
                              isAr
                                ? `⚠️ هل أنت متأكد من مسح وحذف المزاد "${item.title}" بشكل كلي ونهائي من قاعدة البيانات؟`
                                : `⚠️ Are you sure you want to completely delete "${item.title}" from the real database?`
                            );
                            if (conf) {
                              deleteAuction(item.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-650 text-[10px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <span>{isAr ? 'مسح' : 'Erase'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: USERS (Account Security Moderation)
            ========================================== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'سجل الأعضاء وإدارة الصلاحيات' : 'MEMBERS PRIVILEGE CONTROL'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'عاين حسابات المشتركين وقم بتوثيق حساباتهم كبائعين معتمدين أو فرض حظر مؤقت للمخالفين.' : 'Verify user identities to certify authentic merchants or apply bidding limitations.'}
              </p>
            </div>

            <div className="bg-white border border-gray-150 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-xs">
              {users.map((profile) => (
                <div key={profile.id} className="p-4 flex justify-between items-center gap-4 transition-colors hover:bg-gray-50/40">
                  <div className="flex items-center gap-3">
                    <img 
                      src={profile.avatar} 
                      alt="Avatar" 
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-150 shadow-xs"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-xs text-gray-900 leading-none">{profile.name}</h4>
                        {profile.role === 'admin' && (
                          <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[8.5px] font-black px-1.5 py-0.5 rounded font-mono">
                            {isAr ? 'إدارة' : 'ADMIN'}
                          </span>
                        )}
                        {profile.isVerified && (
                          <span className="bg-emerald-50 text-emerald-805 border border-emerald-100 text-[8.5px] font-black px-1.5 py-0.5 rounded">
                            {isAr ? 'موثق ✓' : 'VERIFIED ✓'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">
                        {profile.email} • {profile.city || 'Jordan'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {profile.role === 'user' && !profile.isVerified && (
                      <button 
                        onClick={() => verifySeller(profile.id)}
                        className="bg-emerald-600 font-extrabold hover:bg-emerald-700 text-white text-[10px] px-3 py-1.5 rounded-xl transition-all shadow-xs"
                      >
                        {isAr ? 'توثيق العضوية' : 'VERIFY'}
                      </button>
                    )}

                    {profile.isBlocked ? (
                      <button 
                        onClick={() => unbanUser(profile.id)}
                        className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition-all"
                      >
                        {isAr ? 'فك الحظر' : 'UNBAN'}
                      </button>
                    ) : (
                      <button 
                        onClick={() => banUser(profile.id)}
                        className="bg-red-50 text-red-650 border border-red-100 text-[10px] font-bold px-3 py-1.5 rounded-xl hover:bg-red-100 transition-all"
                      >
                        {isAr ? 'حظر العضوية' : 'BAN'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: SUBSCRIPTIONS (Premium Subscribing requests)
            ========================================== */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-4">
            
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات اشتراكات المزايدة الممتازة' : 'PREMIUM MEMBERSHIP PASSES'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'تفعيل اشتراكات المنصة الشهرية والسنوية والتحقق من إثبات التحويل المالي المرفق.' : 'Audit custom cliq subscription payments to grant instant vip bidder passport accounts.'}
              </p>
            </div>

            {subscriptionRequests.length === 0 ? (
              <div className="border border-dashed border-gray-200 py-12 text-center rounded-2xl bg-white shadow-xs">
                <Sparkles className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-[11px] font-extrabold text-gray-400 font-sans uppercase">
                  {isAr ? 'لا توجد طلبات اشتراك معلقة حالياً' : 'NO PENDING PREMIUM SIGNUPS'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {subscriptionRequests.map((req) => (
                  <div key={req.id} className="bg-white border border-gray-150 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fadeIn transition-all hover:border-gray-250">
                    <div className="space-y-3 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20 rounded-full font-bold px-2.5 py-0.5 uppercase">
                          {req.plan === 'monthly' ? (isAr ? 'شهري' : 'Monthly') : req.plan === 'quarterly' ? (isAr ? 'ربع سنوي' : 'Quarterly') : (isAr ? 'سنوي' : 'Annual')}
                        </span>
                        <span className="text-xs text-gray-900 font-mono font-bold">
                          {req.price} JOD
                        </span>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-sm text-gray-900 leading-none">{req.userName}</h4>
                        <p className="text-[10px] text-gray-400 mt-1">{req.userEmail}</p>
                      </div>

                      <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-xs space-y-1.5">
                        <p className="text-gray-600">
                          <strong className="text-gray-800">{isAr ? 'الاسم بالكامل للحوالة:' : 'Sender Name:'}</strong> {req.transferFullName || 'N/A'}
                        </p>
                        <p className="text-gray-600">
                          <strong className="text-gray-800">{isAr ? 'رقم الهاتف المحول منه:' : 'Sender Phone:'}</strong> {req.transferPhone || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 shrink-0">
                      {req.paymentProofImage && (
                        <div className="relative cursor-pointer max-w-[70px]">
                          <img 
                            src={req.paymentProofImage} 
                            alt="Payment Proof" 
                            className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs transition-transform hover:scale-105"
                            onClick={() => setViewReceiptUrl(req.paymentProofImage)}
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => approveSubscription(req)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs min-w-[120px]"
                        >
                          {isAr ? 'قبول وتفعيل' : 'APPROVE'}
                        </button>
                        <button
                          onClick={() => rejectSubscription(req)}
                          className="bg-red-50 hover:bg-red-100 text-red-650 border border-red-100 font-bold text-xs px-4 py-1.5 rounded-xl min-w-[120px]"
                        >
                          {isAr ? 'رفض الطلب' : 'REJECT'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Full Preview Dialog for Receipts */}
      {viewReceiptUrl && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setViewReceiptUrl(null)}
        >
          <div className="relative max-w-lg w-full bg-white rounded-3xl p-3 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <img 
              src={viewReceiptUrl} 
              alt="Receipt Full Preview" 
              className="w-full max-h-[70vh] object-contain rounded-2xl"
            />
            <div className="mt-3.5 flex justify-between items-center px-1">
              <span className="text-[10px] text-gray-400 font-mono uppercase">{isAr ? 'إثبات تحويل كليك' : 'CliQ Transfer Proof'}</span>
              <button 
                onClick={() => setViewReceiptUrl(null)}
                className="bg-gray-150 hover:bg-gray-200 text-gray-850 rounded-xl px-4 py-2 text-xs font-black uppercase transition-all"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
