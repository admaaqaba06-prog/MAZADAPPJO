import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from './feedback';
import { translations } from '../utils/translations';
import { isAdminUser, isAdminOrSeller } from '../utils/adminAuth';
import { WalletRowSkeleton, EmptyState } from './FeedbackStates';
import { db, getCallableFunction } from '../services/firebase';
import { doc, updateDoc, setDoc, getDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { OrderDetailsView } from './OrderDetailsView';
import { AdminWalletConsole } from './AdminWalletConsole';
import { MyOrdersList } from './MyOrdersList';
import { SoldOrdersList } from './SoldOrdersList';
import {
  HelpCircle,
  ArrowUpRight,
  BookOpen,
  Clock,
  ShieldCheck,
  XCircle,
  DollarSign,
  UploadCloud,
  Sparkles,
  Lock,
  LogOut,
  Wallet,
  ChevronRight,
  ShieldAlert,
  CreditCard,
  History,
  X,
  Eye,
  ArrowRight,
  UserCheck,
  ShoppingBag,
  Package,
  Truck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  Store
} from 'lucide-react';
import { EscrowTransaction } from '../types';

export const WalletView: React.FC = () => {
  const { 
    wallet, 
    escrows, 
    orders,
    setEscrows,
    addNotification,
    language, 
    logout, 
    currentUser, 
    setShowSubscriptionPrompt,
    users,
    releaseEscrow,
    refundEscrow,
    setWallet,
    setActiveView,
    setCurrentUser,
    globalWalletSubView,
    setGlobalWalletSubView,
    globalSelectedOrderId,
    setGlobalSelectedOrderId
  } = useApp();
  const { showToast } = useToast();

  useEffect(() => {
    if (globalWalletSubView) {
      setWalletSubView(globalWalletSubView);
      // Reset after consuming
      setGlobalWalletSubView('wallet-home');
    }
  }, [globalWalletSubView]);

  useEffect(() => {
    if (globalSelectedOrderId) {
      setSelectedOrderId(globalSelectedOrderId);
      // Reset after consuming
      setGlobalSelectedOrderId(null);
    }
  }, [globalSelectedOrderId]);
  
  const t = translations[language];
  const isAr = language === 'ar';

  const localT = {
    totalBalance: isAr ? 'إجمالي رصيد المحفظة' : 'Total Wallet Balance',
    availableBalance: isAr ? 'الرصيد المتاح' : 'Available Balance',
    pendingBalance: isAr ? 'قيد المراجعة' : 'Pending Verification',
    escrowBalance: isAr ? 'مبالغ محفوظة بالضمان' : 'Held in Escrow',
    transactions: isAr ? 'سجل العمليات' : 'Transactions Ledger',
    orders: isAr ? 'المشتريات والمبيعات' : 'My Orders & Sales',
    myWallet: isAr ? 'رصيدي ومحفظتي' : 'My Wallet',
    recentActivity: isAr ? 'النشاطات المالية الأخيرة' : 'Recent Wallet Activity',
    back: isAr ? 'رجوع للمحفظة' : 'Back to Wallet',
    all: isAr ? 'الكل' : 'All',
    moneyIn: isAr ? 'المبالغ الواردة' : 'Money In',
    moneyOut: isAr ? 'المبالغ الصادرة' : 'Money Out',
    buying: isAr ? 'مشترياتي وعقودي' : 'My Purchases',
    selling: isAr ? 'مبيعاتي المعلقة' : 'My Sales',
    emptyActivity: isAr ? 'لا يوجد حركات مسجلة حالياً' : 'No recorded operations yet.',
    emptyActivityDesc: isAr ? 'ستظهر هنا دفعات مزاداتك الفائزة وسجل عملياتك المالية.' : 'Payments for auctions you win will appear here as your financial record.',
    howMuchYouHave: isAr ? 'سجل أرصدتك ودفعاتك' : 'Your balances & payments record',
    secureSummary: isAr ? 'حماية وأمان المعاملات' : 'Secure Trust Assurance',
    helpSupport: isAr ? 'الدعم المالي المباشر' : 'Finance Support Desk',
    helpDesc: isAr ? 'فريق الدعم في عمّان متاح يومياً من ٩ صباحاً حتى ١١ مساءً.' : 'Our Amman support team is available daily 9:00–23:00.',
    allTx: isAr ? 'كل العمليات' : 'All Transactions',
    moneyInTx: isAr ? 'الوارد' : 'Money In',
    moneyOutTx: isAr ? 'الصادر والضمان' : 'Payments & Escrow',
  };

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isActivatingSeller, setIsActivatingSeller] = useState(false);

  // Seller activation goes through the `activateSeller` callable.
  //
  // It CANNOT be done from here. This function used to write `isSeller` (plus a
  // sellerProfiles doc) directly to Firestore as the user themselves —
  // firestore.rules denylists `isSeller` for self-writes, so that write always
  // returned PERMISSION_DENIED. Nothing ever called this function, so the
  // failure stayed invisible while, in production, no user could become a
  // seller at all. The grant now lives in functions/sellerActivation.js.
  const handleActivateSeller = async () => {
    if (!currentUser) return;
    setIsActivatingSeller(true);
    try {
      const activate = await getCallableFunction<
        { lang: 'ar' | 'en' },
        { success: boolean; activated: boolean; alreadySeller: boolean }
      >('activateSeller');
      await activate({ lang: isAr ? 'ar' : 'en' });

      // The user doc is live-subscribed in AppContext, so isSeller/role arrive
      // on their own. Reflect it immediately so the Seller Center nav appears
      // without waiting for the snapshot.
      setCurrentUser(prev => prev ? ({
        ...prev,
        role: 'seller',
        isSeller: true,
        sellerStatus: 'active',
      }) : null);

      const sellerOkTitle = isAr ? '✅ تم تفعيل حساب البائع' : '✅ Seller Account Activated';
      const sellerOkMsg = isAr
        ? 'تهانينا! تم تفعيل حساب البائع الخاص بك بنجاح. يمكنك الآن الانتقال إلى مركز البائع وعرض منتجاتك للمزاد.'
        : 'Congratulations! Your seller account is active. You can now visit the Seller Center to manage your business.';
      addNotification(sellerOkTitle, sellerOkMsg, 'info');
      // 'info' is hidden from the user bell (Wave D) — confirm transiently.
      showToast({ title: sellerOkTitle, message: sellerOkMsg, type: 'success' });
    } catch (err: any) {
      console.error("Failed to activate seller:", err);
      alert(isAr 
        ? `فشل تفعيل حساب البائع. التفاصيل: ${err.message || err}` 
        : `Failed to activate seller account. Details: ${err.message || err}`
      );
    } finally {
      setIsActivatingSeller(false);
    }
  };

  const isStrictAdmin = isAdminUser(currentUser);

  const myEscrows = isStrictAdmin 
    ? escrows 
    : (currentUser ? escrows.filter(e => e.bidderId === currentUser.id || e.sellerId === currentUser.id) : []);

  const myPendingDeposits = myEscrows.filter(e => e.auctionId === 'cliq-dep' && e.status === 'locked');
  const myWonAuctionsPayments = myEscrows.filter(e => e.auctionId !== 'cliq-dep' && e.auctionId !== 'cliq-sub');
  
  const myBuyerOrders = currentUser ? orders.filter(o => o.buyerId === currentUser.id) : [];
  const mySellerOrders = currentUser ? orders.filter(o => o.sellerId === currentUser.id) : [];
  
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Wallet screens state: read-only record — balances, ledger, orders.
  // Top-up and withdrawal flows were removed (Wave 2b): bidding is free
  // (pay-after-win) and seller payouts happen off-platform via CliQ.
  const [walletSubView, setWalletSubView] = useState<'wallet-home' | 'transactions' | 'orders'>('wallet-home');
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');
  const [ordersTab, setOrdersTab] = useState<'buying' | 'selling'>('buying');

  // Fetch real-time withdrawals ledger (historic record only — no new
  // withdrawal requests can be created from this view)
  const [myWithdrawals, setMyWithdrawals] = useState<any[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'withdrawals'), where('userId', '==', currentUser.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyWithdrawals(list);
    }, (err) => {
      console.warn("Withdrawal collection read permissions warning: ", err);
    });
    return () => unsub();
  }, [currentUser?.id]);

  // Admin Ledger States
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedProofEscrow, setSelectedProofEscrow] = useState<EscrowTransaction | null>(null);

  const handleAdminApproveDeposit = (escrowId: string) => {
    releaseEscrow(escrowId);
    const item = escrows.find(e => e.id === escrowId);
    if (item) {
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
  // CALCULATE BALANCES FOR ADMIN PLATFORM TREASURY
  // -------------------------------------------------------------
  const userCliqDeposits = escrows.filter(e => e.auctionId === 'cliq-dep');
  const subscriptionTransfers = escrows.filter(e => e.auctionId === 'cliq-sub');

  const approvedDepositsSum = userCliqDeposits
    .filter(e => e.status === 'released')
    .reduce((sum, e) => sum + e.amount, 0);

  const pendingDepositsSum = userCliqDeposits
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingDepositsCount = userCliqDeposits.filter(e => e.status === 'locked').length;

  const subscriptionRevenueSum = subscriptionTransfers
    .filter(e => e.status === 'released')
    .reduce((sum, e) => sum + e.amount, 0);

  const activeBiddingLocksSum = escrows
    .filter(e => e.auctionId !== 'cliq-dep' && e.auctionId !== 'cliq-sub' && e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalMazzadomCapital = approvedDepositsSum + pendingDepositsSum + subscriptionRevenueSum;

  const currentLockedEscrows = escrows.filter(e => e.status === 'locked');
  const historicEscrows = escrows.filter(e => e.status !== 'locked');

  const filteredAdminDeposits = userCliqDeposits.filter(e => {
    if (adminFilter === 'all') return true;
    if (adminFilter === 'pending') return e.status === 'locked';
    if (adminFilter === 'approved') return e.status === 'released';
    if (adminFilter === 'rejected') return e.status === 'refunded';
    return true;
  });

  const activeSubscribers = users.filter(u => u.subscriptionStatus === 'active');

  // Sum of local pending cliq deposits
  const myPendingDepositsSum = myPendingDeposits.reduce((sum, e) => sum + e.amount, 0);

  // Consolidated Recent Activity logs
  const combinedRecentActivity = [
    ...myPendingDeposits.map(d => ({
      id: d.id,
      type: 'deposit' as const,
      title: isAr ? 'تمويل معلق عبر كليك' : 'Pending CliQ Top-Up',
      subtitle: `${isAr ? 'الاسم المستعار:' : 'Alias:'} ${d.cliqAlias}`,
      amount: d.amount,
      status: 'pending' as const,
      timestamp: d.timestamp,
    })),
    ...myWonAuctionsPayments.map(p => ({
      id: p.id,
      type: 'payment' as const,
      title: p.auctionTitle,
      subtitle: `REF_ID: ${p.id.substring(0, 8).toUpperCase()}`,
      amount: -p.amount,
      status: p.status, // 'locked' | 'released'
      timestamp: p.timestamp,
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  // Consolidated Full Ledger
  const combinedTransactions = [
    ...userCliqDeposits.filter(e => isStrictAdmin ? true : e.bidderId === currentUser?.id).map(d => ({
      id: d.id,
      type: 'deposit' as const,
      title: isAr ? 'تمويل محفظة كليك' : 'CliQ Wallet Top-Up',
      subtitle: `${isAr ? 'الاسم المستعار:' : 'Alias:'} ${d.cliqAlias}`,
      amount: d.amount,
      status: d.status, // 'locked' | 'released' | 'refunded'
      timestamp: d.timestamp,
    })),
    ...myWonAuctionsPayments.map(p => ({
      id: p.id,
      type: 'payment' as const,
      title: p.auctionTitle,
      subtitle: `REF_ID: ${p.id.substring(0, 8).toUpperCase()}`,
      amount: -p.amount,
      status: p.status, // 'locked' | 'released'
      timestamp: p.timestamp,
    })),
    ...myWithdrawals.map(w => ({
      id: w.id,
      type: 'withdrawal' as const,
      title: w.type === 'cliq' ? (isAr ? 'طلب سحب كليك' : 'CliQ Withdrawal Request') : (isAr ? 'طلب سحب حوالة بنكية' : 'Bank Withdrawal Request'),
      subtitle: w.type === 'cliq' ? `CliQ Alias: ${w.details?.cliqAlias}` : `${w.details?.bankName} - IBAN: ...${w.details?.iban?.substring(Math.max(0, w.details.iban.length - 6))}`,
      amount: -w.amount,
      status: w.status, // 'pending' | 'approved' | 'rejected'
      timestamp: w.timestamp,
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  const filteredTransactions = combinedTransactions.filter(tx => {
    if (txFilter === 'all') return true;
    if (txFilter === 'in') return tx.amount > 0;
    if (txFilter === 'out') return tx.amount < 0;
    return true;
  });

  // Admin bypass
  if (isStrictAdmin) {
    return (
      <AdminWalletConsole
        isAr={isAr}
        currentUser={currentUser}
        logout={logout}
        totalMazzadomCapital={totalMazzadomCapital}
        approvedDepositsSum={approvedDepositsSum}
        subscriptionRevenueSum={subscriptionRevenueSum}
        activeSubscribers={activeSubscribers}
        pendingDepositsSum={pendingDepositsSum}
        pendingDepositsCount={pendingDepositsCount}
        activeBiddingLocksSum={activeBiddingLocksSum}
        adminFilter={adminFilter}
        setAdminFilter={setAdminFilter}
        filteredAdminDeposits={filteredAdminDeposits}
        selectedProofEscrow={selectedProofEscrow}
        setSelectedProofEscrow={setSelectedProofEscrow}
        handleAdminRejectDeposit={handleAdminRejectDeposit}
        handleAdminApproveDeposit={handleAdminApproveDeposit}
        currentLockedEscrows={currentLockedEscrows}
        historicEscrows={historicEscrows}
        users={users}
        language={language}
      />
    );
  }

  // If a single order is being inspected, overlay order details screen (keeps dark background unified)
  if (selectedOrderId) {
    return (
      <div 
        className="flex-1 bg-surface text-fg p-4 md:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] overflow-y-auto"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="order-details-pane-rebuilt"
      >
        <div className="max-w-4xl mx-auto">
          <OrderDetailsView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />
        </div>
      </div>
    );
  }

  // Helper render method for center column or mobile screen switcher
  const renderActiveScreen = () => {
    switch (walletSubView) {
      case 'wallet-home':
        return (
          <div className="space-y-6">
            {/* Desktop Only header */}
            <div className="hidden lg:block space-y-1">
              <h1 className="text-2xl font-black tracking-tight">{localT.myWallet}</h1>
              <p className="text-fg-muted text-sm">{localT.howMuchYouHave}</p>
            </div>

            {/* Premium Balance display */}
            <div className="bg-[#111111] border border-white/10 rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-44 h-44 bg-[#FF6B00]/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-[#FF6B00] font-mono font-black block">
                  {localT.totalBalance}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl md:text-5xl font-black font-mono tracking-tight text-white">
                    {wallet.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-black text-zinc-400 font-mono">JOD</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono font-extrabold uppercase block leading-none">{localT.availableBalance}</span>
                  <p className="text-lg font-mono font-black text-[#10B981]">{wallet.availableBalance.toLocaleString()} <span className="text-[10px]">JOD</span></p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono font-extrabold uppercase block leading-none">{localT.pendingBalance}</span>
                  <p className="text-lg font-mono font-black text-amber-500">{myPendingDepositsSum.toLocaleString()} <span className="text-[10px]">JOD</span></p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono font-extrabold uppercase block leading-none">{localT.escrowBalance}</span>
                  <p className="text-lg font-mono font-black text-rose-500">{wallet.escrowBalance.toLocaleString()} <span className="text-[10px]">JOD</span></p>
                </div>
              </div>
            </div>

            {/* Detailed Held-in-Escrow Explanation Card */}
            <div className="bg-surface-raised border border-line rounded-3xl p-5 md:p-6 space-y-4" id="locked-amount-details-card">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="text-left rtl:text-right">
                  <h3 className="font-extrabold text-sm text-fg">
                    {isAr ? 'تفاصيل المبالغ المحفوظة بالضمان' : 'Held-in-Escrow Details'}
                  </h3>
                  <p className="text-[10px] text-fg-muted mt-0.5">
                    {isAr ? 'دفعات مزاداتك الفائزة المحفوظة حتى تأكيد الاستلام' : 'Payments for won auctions, held until you confirm delivery'}
                  </p>
                </div>
              </div>

              {wallet.escrowBalance > 0 ? (
                <div className="space-y-4 text-left rtl:text-right">
                  <p className="text-xs text-fg-muted leading-relaxed">
                    {isAr
                      ? 'هذه دفعاتك عن مزادات فزت بها. يحتفظ مزاد بالمبلغ ولا يحوّله للبائع إلا بعد استلامك القطعة وتأكيدك أنها مطابقة.'
                      : 'These are your payments for auctions you won. Mazad holds each amount and only releases it to the seller after you receive the item and confirm it matches.'}
                  </p>

                  <div className="space-y-2.5">
                    {currentLockedEscrows.map((escrow) => (
                      <div key={escrow.id} className="bg-surface-sunken border border-line p-4 rounded-2xl space-y-2">
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-extrabold text-xs text-fg truncate max-w-[70%]">
                            {escrow.auctionTitle}
                          </span>
                          <span className="font-mono font-black text-xs text-rose-600 shrink-0">
                            {escrow.amount.toLocaleString()} JOD
                          </span>
                        </div>
                        <div className="text-[11px] text-fg-muted space-y-1.5 pt-2 border-t border-line text-left rtl:text-right">
                          <div>
                            <span className="text-[#FF6B00] font-bold">● {isAr ? 'سبب الحفظ:' : 'Why Held:'}</span>{' '}
                            {isAr
                              ? `دفعتك بقيمة ${escrow.amount} د.أ عن فوزك بمزاد "${escrow.auctionTitle}".`
                              : `Your ${escrow.amount} JOD payment for winning lot "${escrow.auctionTitle}".`}
                          </div>
                          <div>
                            <span className="text-[#10B981] font-bold">● {isAr ? 'متى يُحرَّر؟' : 'When is it released?'}</span>{' '}
                            {isAr
                              ? 'يُحوَّل للبائع بعد استلامك القطعة ومعاينتها وتأكيد رضاك. وإذا أُلغي الطلب، يُعاد المبلغ إليك.'
                              : 'Released to the seller after you receive, inspect, and confirm the item. If the order is cancelled, it is returned to you.'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-5 bg-surface-sunken rounded-2xl border border-dashed border-line p-4">
                  <p className="text-xs text-fg font-extrabold">
                    {isAr ? 'لا يوجد أي مبالغ محفوظة بالضمان حالياً' : 'No payments held in escrow currently'}
                  </p>
                  <p className="text-[10px] text-fg-muted mt-1 px-4 leading-relaxed max-w-sm mx-auto">
                    {isAr
                      ? 'المزايدة مجانية — تدفع فقط عند الفوز. عند فوزك بمزاد ودفعك عبر كليك، يظهر المبلغ هنا محفوظاً حتى تأكيد الاستلام.'
                      : 'Bidding is free — you only pay when you win. When you win and pay via CliQ, your payment appears here, held until you confirm delivery.'}
                  </p>
                </div>
              )}
            </div>

            {/* Quick Navigation grid */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-mono font-black tracking-widest text-fg-muted">{isAr ? 'الوصول السريع للمهام' : 'Quick Actions'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setWalletSubView('transactions')}
                  className="bg-surface-raised border border-line hover:border-[#FF6B00]/30 rounded-3xl p-5 text-left flex flex-col justify-between h-32 transition-all cursor-pointer group"
                  id="action-transactions-home"
                >
                  <div className="w-10 h-10 rounded-2xl bg-surface-sunken flex items-center justify-center text-fg-muted group-hover:scale-105 transition-transform">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-fg">{localT.transactions}</h4>
                    <p className="text-[11px] text-fg-muted mt-0.5">{isAr ? 'عرض عملياتك المالية بالتفصيل' : 'View financial entries log'}</p>
                  </div>
                </button>

                <button 
                  onClick={() => setWalletSubView('orders')}
                  className="bg-surface-raised border border-line hover:border-[#FF6B00]/30 rounded-3xl p-5 text-left flex flex-col justify-between h-32 transition-all cursor-pointer group"
                  id="action-orders-home"
                >
                  <div className="w-10 h-10 rounded-2xl bg-surface-sunken flex items-center justify-center text-amber-500 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-fg">{localT.orders}</h4>
                    <p className="text-[11px] text-fg-muted mt-0.5">{isAr ? 'متابعة بضائعك المباعة والمشتراة' : 'Track won listings & sales'}</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Recent Activity lists */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase font-mono font-black tracking-widest text-fg-muted">{localT.recentActivity}</h3>
                <button 
                  onClick={() => setWalletSubView('transactions')}
                  className="text-xs text-[#FF6B00] font-black hover:underline cursor-pointer"
                >
                  {isAr ? 'مشاهدة الكل ←' : 'View All ←'}
                </button>
              </div>

              <div className="space-y-3.5">
                {isLoading ? (
                  <>
                    <WalletRowSkeleton />
                    <WalletRowSkeleton />
                  </>
                ) : combinedRecentActivity.length > 0 ? (
                  combinedRecentActivity.slice(0, 5).map((act) => {
                    const isPositive = act.amount > 0;
                    return (
                      <div 
                        key={act.id} 
                        className="bg-surface-raised border border-line p-4 rounded-3xl flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-3.5">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isPositive ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-rose-500/10 text-rose-500'
                          }`}>
                            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-sm text-fg truncate">{act.title}</h5>
                            <p className="text-xs text-fg-muted mt-0.5 truncate font-mono">{act.subtitle}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 font-mono">
                          <span className={`font-black text-sm block ${isPositive ? 'text-[#10B981]' : 'text-fg'}`}>
                            {isPositive ? '+' : ''}{act.amount.toLocaleString()} JOD
                          </span>
                          <span className="text-[10px] text-fg-muted uppercase font-black block mt-1">
                            {new Date(act.timestamp).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {month: 'short', day: 'numeric'})}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 bg-surface-raised border border-line rounded-3xl p-6">
                    <HelpCircle className="w-8 h-8 text-fg-muted mx-auto mb-2" />
                    <p className="font-extrabold text-sm text-fg-muted uppercase tracking-wider">{localT.emptyActivity}</p>
                    <p className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">{localT.emptyActivityDesc}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'transactions':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setWalletSubView('wallet-home')}
                className="w-10 h-10 rounded-2xl bg-surface-raised border border-line flex items-center justify-center text-fg-muted hover:text-fg cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <div>
                <h1 className="text-xl font-black">{localT.transactions}</h1>
                <p className="text-xs text-fg-muted">{isAr ? 'مستندات العمليات والتدفقات النقدية' : 'Financial transactions ledger'}</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-surface-raised border border-line p-1 rounded-2xl gap-1">
              {(['all', 'in', 'out'] as const).map((filter) => {
                const label = filter === 'all' ? localT.allTx : filter === 'in' ? localT.moneyInTx : localT.moneyOutTx;
                return (
                  <button
                    key={filter}
                    onClick={() => setTxFilter(filter)}
                    className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
                      txFilter === filter
                        ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                        : 'text-fg-muted hover:text-fg hover:bg-surface-sunken'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* List */}
            <div className="space-y-3">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <div 
                      key={tx.id} 
                      className="bg-surface-raised border border-line p-4.5 rounded-3xl flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isPositive ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-extrabold text-sm text-fg truncate">{tx.title}</h5>
                          <p className="text-xs text-fg-muted mt-0.5 truncate font-mono">{tx.subtitle}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono">
                        <span className={`font-black text-sm block ${isPositive ? 'text-[#10B981]' : 'text-fg'}`}>
                          {isPositive ? '+' : ''}{tx.amount.toLocaleString()} JOD
                        </span>
                        
                        <div className="flex items-center gap-1.5 justify-end mt-1">
                          {tx.status === 'locked' || tx.status === 'pending' ? (
                            <span className="text-[9px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase font-mono animate-pulse">{isAr ? 'قيد المراجعة' : 'PENDING'}</span>
                          ) : tx.status === 'released' || tx.status === 'approved' ? (
                            <span className="text-[9px] font-black text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full uppercase font-mono">{isAr ? 'مكتمل' : 'APPROVED'}</span>
                          ) : (
                            <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full uppercase font-mono">{isAr ? 'ملغي' : 'REJECTED'}</span>
                          )}
                          <span className="text-[10px] text-fg-muted font-bold block">
                            {new Date(tx.timestamp).toLocaleDateString(isAr ? 'ar-JO' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-surface-raised border border-line rounded-3xl p-6">
                  <History className="w-10 h-10 text-fg-muted mx-auto mb-3" />
                  <p className="font-extrabold text-sm text-fg-muted uppercase tracking-wider">{isAr ? 'لا يوجد عمليات ضمن هذا الفلتر' : 'No transactions found'}</p>
                  <p className="text-xs text-fg-muted mt-1">{isAr ? 'جرب تغيير خيار التصفية — دفعات مزاداتك الفائزة ستظهر هنا.' : 'Try changing your filter — payments for auctions you win will appear here.'}</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'orders':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setWalletSubView('wallet-home')}
                className="w-10 h-10 rounded-2xl bg-surface-raised border border-line flex items-center justify-center text-fg-muted hover:text-fg cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <div>
                <h1 className="text-xl font-black">{localT.orders}</h1>
                <p className="text-xs text-fg-muted">{isAr ? 'إدارة العقود والمبيعات والمشتريات' : 'Fulfillment operations & shipping tracking'}</p>
              </div>
            </div>

            {/* Buying/Selling tabs */}
            <div className="flex bg-surface-raised border border-line p-1 rounded-2xl gap-1">
              <button
                onClick={() => setOrdersTab('buying')}
                className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all cursor-pointer uppercase flex items-center justify-center gap-2 ${
                  ordersTab === 'buying'
                    ? 'bg-[#FF6B00] text-white'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-sunken'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{localT.buying}</span>
              </button>
              <button
                onClick={() => setOrdersTab('selling')}
                className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all cursor-pointer uppercase flex items-center justify-center gap-2 ${
                  ordersTab === 'selling'
                    ? 'bg-[#FF6B00] text-white'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-sunken'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>{localT.selling}</span>
              </button>
            </div>

            <div className="bg-surface-raised border border-line rounded-3xl p-5 md:p-6 space-y-4 text-fg">
              {ordersTab === 'buying' ? (
                <MyOrdersList
                  isAr={isAr}
                  myBuyerOrders={myBuyerOrders}
                  setSelectedOrderId={setSelectedOrderId}
                />
              ) : (
                <SoldOrdersList
                  isAr={isAr}
                  mySellerOrders={mySellerOrders}
                  setSelectedOrderId={setSelectedOrderId}
                />
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="flex-1 bg-surface text-fg overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))]"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="wallet-rebuild-root-container"
    >
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        
        {/* DESKTOP 3-COLUMN LAYOUT (lg:grid) */}
        <div className="hidden lg:grid grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Navigation Sidebar */}
          <div className="col-span-3 space-y-4 sticky top-6">
            <div className="bg-surface-raised border border-line rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-3 border-b border-line pb-4">
                <div className="w-10 h-10 rounded-2xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-mono font-black text-xs tracking-widest text-[#FF6B00]">{isAr ? 'محفظة المزاد' : 'MAZAD WALLET'}</h2>
                  <p className="text-[10px] text-fg-muted uppercase font-bold">{isAr ? 'تحكم مالي شامل' : 'Instant Secure FinTech'}</p>
                </div>
              </div>

              <nav className="flex flex-col gap-1.5 font-sans">
                <button
                  onClick={() => setWalletSubView('wallet-home')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'wallet-home'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-fg-muted hover:text-fg hover:bg-surface-sunken'
                  }`}
                  id="side-nav-home"
                >
                  <Wallet className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'الرئيسية والمحفظة' : 'My Wallet Home'}</span>
                </button>

                <button
                  onClick={() => setWalletSubView('transactions')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'transactions'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-fg-muted hover:text-fg hover:bg-surface-sunken'
                  }`}
                  id="side-nav-transactions"
                >
                  <History className="w-4 h-4 shrink-0" />
                  <span>{localT.transactions}</span>
                </button>

                <button
                  onClick={() => setWalletSubView('orders')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'orders'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-fg-muted hover:text-fg hover:bg-surface-sunken'
                  }`}
                  id="side-nav-orders"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>{localT.orders}</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Center Column: Main Wallet Content */}
          <div className="col-span-6 space-y-6">
            {renderActiveScreen()}
          </div>

          {/* Right Column: Secure Wallet Summary */}
          <div className="col-span-3 space-y-6 sticky top-6">
            
            {/* Security Trust card */}
            <div className="bg-surface-raised border border-line rounded-3xl p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-[#FF6B00]">
                <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                <h4 className="font-extrabold text-sm text-fg">{localT.secureSummary}</h4>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                {isAr
                  ? 'تُحوَّل الأموال عبر كليك إلى حساب مزادو في البنك الأهلي وتبقى محفوظة حتى اكتمال طلبك.'
                  : "Funds are transferred via CliQ to Mazzado's account at Al Ahli Bank and held until your order completes."}
              </p>
            </div>

            {/* Support / Help card */}
            <div className="bg-surface-raised border border-line rounded-3xl p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-amber-500">
                <HelpCircle className="w-5 h-5" />
                <h4 className="font-extrabold text-sm text-fg">{localT.helpSupport}</h4>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                {localT.helpDesc}
              </p>
            </div>
          </div>
        </div>

        {/* MOBILE SINGLE-COLUMN LAYOUT (lg:hidden) */}
        <div className="block lg:hidden">
          {walletSubView === 'wallet-home' ? (
            <div className="space-y-6">
              
              {/* Mobile Title */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black">{isAr ? 'رصيدي ومحفظتي' : 'My Wallet'}</h1>
                  <p className="text-xs text-fg-muted mt-0.5">{currentUser?.name}</p>
                </div>
                <div className="w-9 h-9 rounded-2xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>

              {/* Balance Card */}
              <div className="bg-[#111111] border border-white/10 rounded-3xl p-6 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/5 rounded-full blur-2xl pointer-events-none"></div>
                
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#FF6B00] font-mono font-black block">
                    {localT.totalBalance}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black font-mono tracking-tight text-white">
                      {wallet.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-black text-zinc-400 font-mono">JOD</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 font-mono font-bold uppercase block leading-none">{localT.availableBalance}</span>
                    <p className="text-sm font-mono font-black text-[#10B981]">{wallet.availableBalance.toLocaleString()} <span className="text-[8px]">JOD</span></p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 font-mono font-bold uppercase block leading-none">{localT.pendingBalance}</span>
                    <p className="text-sm font-mono font-black text-amber-500">{myPendingDepositsSum.toLocaleString()} <span className="text-[8px]">JOD</span></p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 font-mono font-bold uppercase block leading-none">{localT.escrowBalance}</span>
                    <p className="text-sm font-mono font-black text-rose-500">{wallet.escrowBalance.toLocaleString()} <span className="text-[8px]">JOD</span></p>
                  </div>
                </div>
              </div>

              {/* Quick Actions List (Compact) */}
              <div className="space-y-2.5">
                <h3 className="text-xs uppercase font-mono font-black tracking-widest text-fg-muted">{isAr ? 'الوصول السريع' : 'Quick Actions'}</h3>
                
                <button 
                  onClick={() => setWalletSubView('transactions')}
                  className="w-full bg-surface-raised border border-line rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-99 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center text-fg-muted">
                      <History className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-fg">{localT.transactions}</h4>
                      <p className="text-[10px] text-fg-muted mt-0.5">{isAr ? 'مستندات وكشوفات الحساب' : 'Review your transaction entries'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-fg-muted" />
                </button>

                <button 
                  onClick={() => setWalletSubView('orders')}
                  className="w-full bg-surface-raised border border-line rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-99 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center text-fg-muted">
                      <ShoppingBag className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-fg">{localT.orders}</h4>
                      <p className="text-[10px] text-fg-muted mt-0.5">{isAr ? 'تتبع فوز ومبيعات مزاداتك' : 'Manage buyer & seller orders'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-fg-muted" />
                </button>

                {/*
                  Become a seller. Hidden once the account already is one.

                  This is the ONLY entry point to a seller account in the app.
                  handleActivateSeller existed for months with no caller and a
                  client-side write that firestore.rules would have rejected, so
                  in production nobody could self-activate: sellers only existed
                  if someone set the flag by hand. It now calls the
                  `activateSeller` callable.
                */}
                {!isAdminOrSeller(currentUser) && (
                  <button
                    onClick={handleActivateSeller}
                    disabled={isActivatingSeller}
                    className="w-full bg-surface-raised border border-[#FF6B00]/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-99 transition-all text-left disabled:opacity-50"
                    id="activate-seller-btn"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent-weak flex items-center justify-center text-[#FF6B00]">
                        <Store className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-fg">
                          {isActivatingSeller
                            ? (isAr ? 'جارٍ التفعيل…' : 'Activating…')
                            : (isAr ? 'ابدأ البيع على مزاد' : 'Start selling on Mazad')}
                        </h4>
                        <p className="text-[10px] text-fg-muted mt-0.5">
                          {isAr ? 'فعّل حساب البائع وتابع مبيعاتك وطلباتك' : 'Activate your seller account to manage sales & orders'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-fg-muted" />
                  </button>
                )}
              </div>

              {/* Recent Activity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase font-mono font-black tracking-widest text-fg-muted">{localT.recentActivity}</h3>
                  <button 
                    onClick={() => setWalletSubView('transactions')}
                    className="text-xs text-[#FF6B00] font-black hover:underline cursor-pointer"
                  >
                    {isAr ? 'عرض الكل' : 'View All'}
                  </button>
                </div>

                <div className="space-y-3">
                  {combinedRecentActivity.length > 0 ? (
                    combinedRecentActivity.slice(0, 3).map((act) => {
                      const isPositive = act.amount > 0;
                      return (
                        <div 
                          key={act.id} 
                          className="bg-surface-raised border border-line p-4 rounded-2xl flex items-center justify-between"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isPositive ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-rose-500/10 text-rose-500'
                            }`}>
                              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <h5 className="font-extrabold text-xs text-fg truncate">{act.title}</h5>
                              <p className="text-[10px] text-fg-muted mt-0.5 truncate font-mono">{act.subtitle}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0 font-mono">
                            <span className={`font-black text-xs block ${isPositive ? 'text-[#10B981]' : 'text-fg'}`}>
                              {isPositive ? '+' : ''}{act.amount.toLocaleString()} JOD
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-7 bg-surface-raised border border-line rounded-2xl p-5">
                      <p className="font-bold text-xs text-fg-muted uppercase tracking-wide">{localT.emptyActivity}</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div>
              {renderActiveScreen()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
