import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import TermsModal from './TermsModal';

const AdminPanel = lazy(() => import('./AdminPanel'));
import { 
  Wallet as WalletIcon, 
  User,
  TrendingUp, 
  Tv, 
  ShieldAlert, 
  PlusCircle, 
  Activity, 
  Clock, 
  ShieldCheck, 
  Coins,
  Globe,
  LogOut,
  HelpCircle,
  Search,
  Bell
} from 'lucide-react';

interface DesktopFrameProps {
  children: React.ReactNode;
}

export const DesktopFrame: React.FC<DesktopFrameProps> = ({ children }) => {
  const { 
    currentUser, 
    activeView, 
    setActiveView, 
    auctions,
    isSimulating,
    setIsSimulating,
    language,
    setLanguage,
    logout,
    setActiveAuctionId,
    wallet,
    escrows,
    users
  } = useApp();

  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const t = translations[language];
  const isAr = language === 'ar';

  const liveAuctions = auctions.filter(a => a.status === 'live');

  const handleAuctionClick = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  // Dynamic calculations for outer header
  const liveCount = liveAuctions.length;
  const activeEscrowSum = escrows
    ? escrows.filter(e => e.status === 'locked').reduce((acc, curr) => acc + (curr.amount || 0), 0)
    : 0;

  // Recent Hot Ledger Stream events (dynamic + realistic fallback)
  const baseEvents = [
    {
      id: 'e1',
      user: 'Tareq Al-Masri',
      action: isAr ? 'أغلق ضماناً بقيمة 100 د.أ لتفعيل اشتراك المزاد الفضي' : 'locked 100 JOD in escrow for Silver Auction Pass Activation',
      extra: '(CliQ MAZADJOM)',
      time: isAr ? 'قبل قليل' : 'Just now',
    },
    {
      id: 'e2',
      user: 'Ramy Haddad',
      action: isAr ? 'أغلق ضماناً بقيمة 1,500 د.أ لحساب إيداع كليك' : 'locked 1,500 JOD in escrow for CliQ Deposit',
      extra: '(Ramy Haddad)',
      time: isAr ? 'قبل قليل' : 'Just now',
    },
    {
      id: 'e3',
      user: 'Nour El-Din',
      action: isAr ? 'أغلق ضماناً بقيمة 850 د.أ لحساب إيداع كليك' : 'locked 850 JOD in escrow for CliQ Deposit',
      extra: '(Nour El-Din)',
      time: isAr ? 'قبل قليل' : 'Just now',
    },
    {
      id: 'e4',
      user: 'Admin Tareq',
      action: isAr ? 'قام بالإفراج عن الضمان للمعاملة: إيداع كليك' : 'executed RELEASE ESCROW on Escrow: CliQ Deposit',
      extra: '(Nour El-Din)',
      time: isAr ? 'قبل قليل' : 'Just now',
      isAdmin: true,
    }
  ];

  // Merge actual dynamic escrows into the ledger stream for real-time reactivity
  const dynamicEvents = (escrows || []).slice(0, 10).map((escrow, index) => {
    const amountStr = `${escrow.amount?.toLocaleString()} JOD`;
    const actionText = escrow.status === 'released'
      ? (isAr ? `أفرج عن الضمان بقيمة ${amountStr}` : `released ${amountStr} from escrow`)
      : escrow.status === 'refunded'
      ? (isAr ? `أعاد ضمان بقيمة ${amountStr}` : `refunded ${amountStr} from escrow`)
      : (isAr ? `أغلق ضماناً بقيمة ${amountStr}` : `locked ${amountStr} in escrow`);

    return {
      id: `dyn-${escrow.id}-${index}`,
      user: escrow.bidderName || escrow.buyerName || (isAr ? 'عضو' : 'Member'),
      action: `${actionText} ${isAr ? 'للمزاد' : 'for'} ${escrow.auctionTitle || escrow.title || (isAr ? 'صفقة' : 'deal')}`,
      extra: `(${escrow.bidderId?.slice(0, 5) || 'CliQ'})`,
      time: isAr ? 'الآن' : 'Just now',
      isAdmin: escrow.status === 'released' || escrow.status === 'refunded'
    };
  });

  const allLedgerEvents = [...dynamicEvents, ...baseEvents].slice(0, 8);

  return (
    <div 
      className="w-full h-screen overflow-hidden text-gray-900 bg-gray-50/50 font-sans selection:bg-[#FF6B00]/20"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="desktop-frame-root"
    >
      {/* ======================================================================
          1. MOBILE EMULATOR LAYOUT (Presented on screens below 1024px / lg)
          ====================================================================== */}
      <div 
        className="lg:hidden h-[100dvh] max-h-[100dvh] w-full bg-white flex flex-col overflow-hidden"
        id="mobile-layout-root"
      >
        {/* Main Application active view fills standard mobile viewport exactly */}
        <div className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
          {children}
        </div>

        {/* Global Bottom Navigation bar strictly at foot of phone screens */}
        {activeView !== 'live' && (
          <nav 
            className="bg-white border-t border-gray-200/80 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 px-6 flex items-center justify-between text-[11px] font-bold tracking-wider text-gray-500 select-none h-16 shrink-0 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]"
            id="mobile-nav-bar"
          >
            <button 
              onClick={() => setActiveView('discovery')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'discovery' ? 'text-[#FF6B00]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <Tv className="w-5 h-5" />
              <span className="text-[9px] font-bold tracking-normal">{t.navDiscover}</span>
            </button>
            <button 
              onClick={() => setActiveView('wallet')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'wallet' ? 'text-[#FF6B00]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[9px] font-bold tracking-normal">{t.navWallet}</span>
            </button>
            <button 
              onClick={() => setActiveView('upload')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'upload' ? 'text-[#FF6B00]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <PlusCircle className="w-5 h-5" />
              <span className="text-[9px] font-bold tracking-normal">{t.navAddListing}</span>
            </button>
            {currentUser && currentUser.role === 'admin' && (
              <button 
                onClick={() => {
                  setActiveView('admin');
                  setIsSimulating(true);
                }}
                className={`flex flex-col items-center gap-1 transition-all ${activeView === 'admin' ? 'text-black font-black' : 'text-gray-400 hover:text-gray-700'}`}
              >
                <ShieldAlert className="w-5 h-5 text-orange-500" />
                <span className="text-[9px] font-bold tracking-normal">{t.navAdmin}</span>
              </button>
            )}
          </nav>
        )}
      </div>

      {/* ======================================================================
          2. THE PREMIUM THREE-COLUMN MOCKUP LAYOUT (Presented strictly on screens lg and above)
          ====================================================================== */}
      <div className="hidden lg:flex flex-col h-screen overflow-hidden bg-[#F8F9FA]" id="desktop-premium-layout-root">
        
        {/* TOP OUTER HEADER */}
        <header className="flex h-20 shrink-0 items-center justify-between px-8 bg-white border-b border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          {/* Brand Box with Logo & Name */}
          <div 
            className="flex items-center gap-3.5 cursor-pointer select-none"
            onClick={() => setActiveView('discovery')}
          >
            <div className="w-10 h-10 rounded-xl bg-[#FF6B00] flex items-center justify-center font-black text-white text-lg tracking-wider shadow-[0_4px_12px_rgba(255,107,0,0.25)]">
              M
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-gray-950 font-sans">
                  {t.appName}
                </span>
                <span className="bg-gray-100/90 text-gray-600 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border border-gray-200/50 select-none">
                  {isAr ? 'نسخة تجريبية V3' : 'V3 PILOT'}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 font-medium tracking-normal mt-0.5">
                {language === 'en' ? 'The Premium MENA Live Auction & Escrow Network' : 'الشبكة الأولى للمزادات الحية والضمان الآمن في الأردن'}
              </span>
            </div>
          </div>

          {/* Center: Live Metrics Indicators */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200/60 px-3.5 py-1.5 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider">
                {isAr ? 'حالة البث: متصل' : 'LIVE STATE: CONNECTED'}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200/60 px-3.5 py-1.5 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
              <Tv className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider">
                {isAr ? `المزادات النشطة: ${liveCount}` : `LIVE AUCTIONS: ${liveCount}`}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200/60 px-3.5 py-1.5 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider">
                {isAr ? `احتياطي الضمان: ${activeEscrowSum.toLocaleString()} د.أ` : `ESCROW RESERVES: ${activeEscrowSum.toLocaleString()} JD`}
              </span>
            </div>
          </div>

          {/* Right: Language switch, Profile status, and signout */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-gray-400" />
              <span>{language === 'en' ? 'العربية' : 'English'}</span>
            </button>

            {currentUser && (
              <div className="flex items-center gap-3 pl-3 border-l border-gray-200 rtl:pl-0 rtl:pr-3 rtl:border-l-0 rtl:border-r">
                <img 
                  src={currentUser.avatar} 
                  alt={currentUser.name} 
                  className="w-9 h-9 rounded-xl object-cover border border-gray-200 shadow-sm"
                />
                <div className="flex flex-col text-left rtl:text-right select-none">
                  <span className="text-xs font-bold text-gray-800 leading-tight">
                    {currentUser.name}
                  </span>
                  <span className="text-[9px] font-black text-red-500 tracking-wider uppercase mt-0.5">
                    {currentUser.role === 'admin' 
                      ? (isAr ? 'مستشار النظام' : 'SYSTEM CRITICAL') 
                      : (isAr ? 'عضو موثق' : 'VERIFIED USER')}
                  </span>
                </div>
                
                <button 
                  onClick={logout}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all ml-1.5 cursor-pointer"
                  title={isAr ? 'تسجيل الخروج' : 'Log Out'}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* THREE COLUMN GRID LAYOUT BODY */}
        <div className="flex flex-1 min-h-0 w-full p-6 gap-6 overflow-hidden">
          
          {/* ======================================================================
              COLUMN 1: LEFT SIDEBAR (PROFILE, WALLET ACCRUALS, SIDE NAV)
              ====================================================================== */}
          <aside className="w-[290px] flex flex-col gap-4 overflow-y-auto shrink-0 pr-1 select-none" id="left-sidebar-panel">
            
            {/* Widget A: User/Admin Profile Details Card */}
            {currentUser && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.015)]">
                <div className="flex items-center gap-3.5">
                  <img 
                    src={currentUser.avatar} 
                    alt={currentUser.name} 
                    className="w-12 h-12 rounded-xl object-cover border border-gray-200"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900">{currentUser.name}</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">{isAr ? 'عمان، الأردن' : 'Amman, Jordan'}</span>
                    <div className="mt-1.5">
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-200 text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase leading-none">
                        ✓ {isAr ? 'عضو موثق بضمان كليك' : 'VERIFIED USER'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Widget B: Wallet Accruals Financial Indicator Card */}
            {wallet && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.015)] flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    {isAr ? 'مستحقات المحفظة' : 'WALLET ACCRUALS'}
                  </span>
                  <button 
                    onClick={() => setActiveView('wallet')}
                    className="text-[10px] font-bold text-[#FF6B00] hover:underline uppercase tracking-wider"
                  >
                    {isAr ? 'شحن رصيد' : 'TOP UP'}
                  </button>
                </div>

                <div className="py-1">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">
                    {isAr ? 'الرصيد المتاح للمزايدة' : 'AVAILABLE CASH TO BID'}
                  </span>
                  <span className="text-2xl font-black text-gray-900 font-mono tracking-tight mt-1 block">
                    {(wallet.availableBalance ?? 3350).toLocaleString()} <span className="text-xs font-extrabold text-gray-400">JOD</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-gray-50">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-semibold text-gray-400">
                      {isAr ? 'الضمان المعلق' : 'Locked Escrow Margin'}
                    </span>
                    <span className="text-xs font-black text-orange-600 font-mono mt-0.5">
                      {(wallet.lockedMargin ?? 1450).toLocaleString()} JD
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-semibold text-gray-400">
                      {isAr ? 'الرصيد التراكمي' : 'Accrued Ledger'}
                    </span>
                    <span className="text-xs font-black text-gray-900 font-mono mt-0.5">
                      {(wallet.totalBalance ?? 4800).toLocaleString()} JD
                    </span>
                  </div>
                </div>

                <div className="mt-1 bg-gray-50 border border-gray-100 rounded-xl p-3 flex gap-2 items-start">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-[9px] text-gray-400 font-medium leading-relaxed">
                    {isAr 
                      ? 'تتم جميع المعاملات المالية من خلال بروتوكولات نظام كليك التابع للبنك المركزي الأردني.' 
                      : 'Transactions processed through Central Bank of Jordan CliQ protocols.'}
                  </p>
                </div>
              </div>
            )}

            {/* Widget C: High-Fidelity Custom Navigation Sidebar Menu */}
            <nav className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.015)] flex flex-col gap-1.5" id="sidebar-nav-container">
              <button
                onClick={() => setActiveView('discovery')}
                className={`w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-3 transition-all cursor-pointer ${
                  activeView === 'discovery' 
                    ? 'bg-[#FF6B00] text-white shadow-[0_3px_10px_rgba(255,107,0,0.2)]' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Tv className="w-4 h-4" />
                <span>{isAr ? 'تصفح المزادات' : 'Discover'}</span>
              </button>

              <button
                onClick={() => setActiveView('wallet')}
                className={`w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-3 transition-all cursor-pointer ${
                  activeView === 'wallet' 
                    ? 'bg-[#FF6B00] text-white shadow-[0_3px_10px_rgba(255,107,0,0.2)]' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <User className="w-4 h-4" />
                <span>{isAr ? 'الملف الشخصي والمحفظة' : 'Profile'}</span>
              </button>

              <button
                onClick={() => setActiveView('upload')}
                className={`w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-3 transition-all cursor-pointer ${
                  activeView === 'upload' 
                    ? 'bg-[#FF6B00] text-white shadow-[0_3px_10px_rgba(255,107,0,0.2)]' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isAr ? 'إنشاء إدراج بائع' : 'Sell'}</span>
              </button>

              {currentUser && currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    setActiveView('admin');
                    setIsSimulating(true);
                  }}
                  className={`w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-3 transition-all cursor-pointer ${
                    activeView === 'admin' 
                      ? 'bg-zinc-950 text-white shadow-[0_3px_10px_rgba(0,0,0,0.25)]' 
                      : 'text-orange-600 hover:bg-orange-50'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{isAr ? 'لوحة تحكم المشرف' : 'Admin'}</span>
                </button>
              )}

              <button
                onClick={() => setIsTermsOpen(true)}
                className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all flex items-center gap-3 cursor-pointer mt-1"
              >
                <HelpCircle className="w-4 h-4" />
                <span>{isAr ? 'الشروط والأحكام' : 'Terms & Policies'}</span>
              </button>
            </nav>

          </aside>

          {/* ======================================================================
              COLUMN 2: CENTER AREA (THE HANDSET EMULATOR SCREEN FRAME)
              ====================================================================== */}
          <main className="flex-1 flex items-center justify-center overflow-hidden" id="center-handset-emulator-panel">
            
            {/* The simulated visual bezel layout of an iOS / Android Smartphone */}
            <div 
              className="relative w-[400px] h-full max-h-[790px] rounded-[48px] border-[12px] border-zinc-200 bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden select-none"
              style={{ direction: isAr ? 'rtl' : 'ltr' }}
              id="simulated-handset-device"
            >
              {/* Device Upper Dynamic Island camera notch bar */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5.5 bg-black rounded-full z-50 flex items-center justify-center">
                {/* Simulated Lens */}
                <span className="absolute right-4 w-1.5 h-1.5 bg-[#090c15] rounded-full ring-1 ring-zinc-800"></span>
              </div>

              {/* Handset Screen Display viewport where the actual mobile UI views render exactly */}
              <div className="flex-1 w-full h-full overflow-y-auto relative bg-white flex flex-col pt-3" id="simulated-device-screen">
                <Suspense fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-lg bg-[#FF6B00] animate-spin"></div>
                  </div>
                }>
                  {children}
                </Suspense>
              </div>
            </div>

          </main>

          {/* ======================================================================
              COLUMN 3: RIGHT SIDEBAR (SUBSCRIPTIONS & HOT LEDGER TRANSACTION FEED)
              ====================================================================== */}
          <aside className="w-[320px] flex flex-col gap-4 overflow-y-auto shrink-0 pl-1 select-none" id="right-sidebar-panel">
            
            {/* Widget A: Subscription Status Summary Card */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.015)]">
              <div className="flex justify-between items-center pb-2.5 border-b border-gray-100 mb-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  {isAr ? 'نظرة عامة على الاشتراكات' : 'SUBSCRIPTIONS & POOLS'}
                </span>
                <span className="bg-orange-50 text-[#FF6B00] text-[8px] font-black tracking-widest px-2 py-0.5 rounded border border-orange-200">
                  {isAr ? 'نشط' : 'ACTIVE'}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">{isAr ? 'الأعضاء المشتركين' : 'Active Subscribers'}</span>
                  <span className="font-extrabold text-gray-900 font-mono bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">
                    {users ? users.filter(u => u.subscriptionStatus === 'active').length : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">{isAr ? 'نسبة حماية كليك' : 'CliQ Sec Protection'}</span>
                  <span className="font-extrabold text-emerald-600 font-mono bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                    100%
                  </span>
                </div>
              </div>
            </div>

            {/* Widget B: Real-Time Audit Ledger Streams Row Logger (WS Active Simulator) */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.015)] flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                  {isAr ? 'بث العمليات المالي الفوري' : 'HOT LEDGER STREAM'}
                </span>
                <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>{isAr ? 'مباشر WS' : 'WS ACTIVE'}</span>
                </span>
              </div>

              {/* Scrollable list containing events feed rows */}
              <div className="overflow-y-auto pr-1 flex-1 space-y-3.5 mt-4 text-[10px] scrollbar-thin" id="ledger-stream-feed">
                {allLedgerEvents.map((ev) => (
                  <div key={ev.id} className="flex gap-2.5 items-start bg-gray-50/50 hover:bg-gray-50 border border-gray-100/70 hover:border-gray-200/80 p-3 rounded-xl transition-all">
                    <div className="mt-0.5">
                      {ev.isAdmin ? (
                        <div className="w-5 h-5 rounded-md bg-zinc-900 flex items-center justify-center text-white font-mono text-[9px] font-bold">
                          ★
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 text-left rtl:text-right">
                      <p className="text-gray-900 font-medium leading-relaxed">
                        <span className="font-extrabold text-gray-950 block mb-0.5">{ev.user}</span>
                        <span className="text-gray-600">{ev.action}</span>{' '}
                        {ev.extra && <span className="text-gray-400 font-mono font-bold text-[9px] block mt-0.5">{ev.extra}</span>}
                      </p>
                      <span className="text-[8px] text-gray-400 font-bold block mt-1 uppercase font-mono tracking-wide">
                        🕒 {ev.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </aside>

        </div>

      </div>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
};
