import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import TermsModal from './TermsModal';
import { NotificationCenter } from './NotificationCenter';

const AdminPanel = lazy(() => import('./AdminPanel'));
import { ReelsDesktopRightPanel } from './ReelsDesktopRightPanel';
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
  Bell,
  Home,
  Play
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
    users,
    notifications,
    showNotifications,
    setShowNotifications
  } = useApp();

  const unreadCount = notifications ? notifications.filter(n => !n.read).length : 0;

  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const t = translations[language];
  const isAr = language === 'ar';
  const isStrictAdmin = currentUser && currentUser.email === 'admaaqaba06@gmail.com' && (currentUser.role === 'admin' || currentUser.isAdmin === true);

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
  const baseEvents: any[] = [];

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
        <nav 
          className={`pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 px-4 flex items-center justify-between text-[10px] font-bold tracking-wider select-none h-16 shrink-0 transition-all duration-300 ${
            activeView === 'live' 
              ? 'bg-[#111111]/95 text-zinc-400 border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]' 
              : 'bg-white border-t border-gray-200/80 text-gray-500 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]'
          }`}
          id="mobile-nav-bar"
        >
          <button 
            onClick={() => setActiveView('discovery')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'discovery' 
                ? 'text-[#FF6B00]' 
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'الرئيسية' : 'Home'}</span>
          </button>

          <button 
            onClick={() => {
              const firstLive = auctions.find(a => a.status === 'live') || auctions[0];
              if (firstLive) {
                setActiveAuctionId(firstLive.id);
              }
              setActiveView('live');
            }}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'live' 
                ? 'text-[#FF6B00]' 
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <Play className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'مباشر' : 'Live'}</span>
          </button>

          <button 
            onClick={() => setActiveView('upload')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'upload' 
                ? 'text-[#FF6B00]' 
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'بيع' : 'Sell'}</span>
          </button>

          <button 
            onClick={() => setActiveView('wallet')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'wallet' 
                ? 'text-[#FF6B00]' 
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <WalletIcon className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'المحفظة' : 'Wallet'}</span>
          </button>

          <button 
            onClick={() => setActiveView('wallet')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'حسابي' : 'Profile'}</span>
          </button>
        </nav>
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

            {isStrictAdmin && (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200/60 px-3.5 py-1.5 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider">
                  {isAr ? `احتياطي الضمان: ${activeEscrowSum.toLocaleString()} د.أ` : `ESCROW RESERVES: ${activeEscrowSum.toLocaleString()} JD`}
                </span>
              </div>
            )}
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

            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 text-gray-500 hover:text-[#FF6B00] hover:bg-orange-50 border border-gray-200 rounded-xl transition-all cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px]"
              title={isAr ? 'الإشعارات' : 'Notifications'}
              id="desktop-header-bell"
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#FF6B00] text-white text-[8.5px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                  {unreadCount}
                </span>
              )}
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
                    {isStrictAdmin 
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
        {activeView === 'live' ? (
          <div className="flex flex-1 min-h-0 w-full p-6 gap-6 overflow-hidden bg-[#121318]" id="desktop-premium-reels-layout">
            
            {/* COLUMN 1: LEFT SIDEBAR (260px) */}
            <aside className="w-[260px] flex flex-col gap-4 overflow-y-auto shrink-0 pr-1 select-none text-zinc-300" id="left-sidebar-reels">
              {/* Sidebar Menu items */}
              <nav className="flex flex-col gap-1.5" id="sidebar-nav-reels">
                <button
                  onClick={() => setActiveView('discovery')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-3 transition-all cursor-pointer text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
                >
                  <Home className="w-4 h-4 text-zinc-500" />
                  <span>{isAr ? 'من أجلك' : 'For You'}</span>
                </button>

                <button
                  onClick={() => setActiveView('live')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold tracking-wide flex items-center gap-3 transition-all cursor-pointer bg-[#FF6B00] text-white shadow-[0_3px_10px_rgba(255,107,0,0.2)]"
                >
                  <Play className="w-4 h-4 text-white animate-pulse" />
                  <span>{isAr ? 'مزادات مباشرة' : 'Live Auctions'}</span>
                </button>

                <button
                  onClick={() => setActiveView('discovery')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
                >
                  <TrendingUp className="w-4 h-4 text-zinc-500" />
                  <span>{isAr ? 'الفئات' : 'Categories'}</span>
                </button>

                <button
                  onClick={() => setActiveView('wallet')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
                >
                  <Clock className="w-4 h-4 text-zinc-500" />
                  <span>{isAr ? 'مزايداتي' : 'My Bids'}</span>
                </button>

                <button
                  onClick={() => setActiveView('wallet')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
                >
                  <WalletIcon className="w-4 h-4 text-zinc-500" />
                  <span>{isAr ? 'المحفظة' : 'Wallet'}</span>
                </button>

                <button
                  onClick={() => setActiveView('upload')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-zinc-500" />
                  <span>{isAr ? 'بيع معروض' : 'Sell'}</span>
                </button>

                <button
                  onClick={() => setActiveView('wallet')}
                  className="w-full text-left rtl:text-right px-4 py-3 rounded-xl text-xs font-extrabold text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
                >
                  <User className="w-4 h-4 text-zinc-500" />
                  <span>{isAr ? 'الحساب' : 'Profile'}</span>
                </button>
              </nav>

              {currentUser && (
                <div className="bg-zinc-900 border border-white/5 p-4 mt-auto rounded-2xl select-text text-white">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src={currentUser.avatar} 
                      alt={currentUser.name} 
                      className="w-8 h-8 rounded-xl object-cover border border-white/10"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-white truncate">{currentUser.name}</span>
                      <span className="text-[9px] text-zinc-400 truncate">{currentUser.email}</span>
                    </div>
                  </div>
                </div>
              )}
            </aside>

            {/* COLUMN 2: CENTER REEL (TikTok Web style center reel) */}
            <main className="flex-1 h-full flex flex-col overflow-hidden" id="center-reels-feed-container">
              <Suspense fallback={
                <div className="flex-1 h-full flex items-center justify-center bg-zinc-950">
                  <div className="w-8 h-8 rounded-lg bg-[#FF6B00] animate-spin"></div>
                </div>
              }>
                {children}
              </Suspense>
            </main>

            {/* COLUMN 3: RIGHT DETAILS PANEL (360px) */}
            <aside 
              className="w-[360px] h-full bg-[#121318] border border-white/10 rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shrink-0 text-white select-none shadow-2xl animate-fade-in"
              id="right-details-panel-reels"
            >
              <ReelsDesktopRightPanel />
            </aside>
          </div>
        ) : (
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
                isStrictAdmin ? (
                  <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.015)] flex flex-col gap-3">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        {isAr ? 'مستحقات المحفظة' : 'WALLET ACCRUALS'}
                      </span>
                    </div>

                    <div className="py-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">
                        {isAr ? 'الرصيد المتاح للمزايدة' : 'AVAILABLE CASH TO BID'}
                      </span>
                      <span className="text-2xl font-black text-gray-900 font-mono tracking-tight mt-1 block">
                        {(wallet.availableBalance ?? 0).toLocaleString()} <span className="text-xs font-extrabold text-gray-400">JOD</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-gray-50">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-semibold text-gray-400">
                          {isAr ? 'الضمان المعلق' : 'Locked Escrow Margin'}
                        </span>
                        <span className="text-xs font-black text-orange-600 font-mono mt-0.5">
                          {(wallet.escrowBalance ?? 0).toLocaleString()} JD
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-semibold text-gray-400">
                          {isAr ? 'الرصيد التراكمي' : 'Accrued Ledger'}
                        </span>
                        <span className="text-xs font-black text-gray-900 font-mono mt-0.5">
                          {(wallet.totalBalance ?? 0).toLocaleString()} JD
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
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.015)] flex flex-col gap-3">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        {isAr ? 'رصيد المحفظة' : 'WALLET BALANCE'}
                      </span>
                      <button 
                        onClick={() => setActiveView('wallet')}
                        className="text-[10px] font-bold text-[#FF6B00] hover:underline uppercase tracking-wider"
                      >
                        {isAr ? 'شحن رصيد' : 'TOP UP'}
                      </button>
                    </div>

                    <div className="py-1">
                      <span className="text-3xl font-black text-[#FF6B00] font-mono tracking-tight mt-1 block">
                        {(wallet.availableBalance ?? 0).toLocaleString()} <span className="text-sm font-extrabold text-gray-400">JOD</span>
                      </span>
                      <span className="text-[9px] font-medium text-gray-400 block mt-1.5 leading-snug">
                        {isAr ? 'رصيد كليك الموثق المتاح للمزايدة الفورية والشراء الآمن.' : 'Verified CliQ balance available for instant bidding and secure escrow purchases.'}
                      </span>
                    </div>
                  </div>
                )
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

                {isStrictAdmin && (
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
                COLUMN 2: MAIN CONTENT VIEWPORT (FULL DESKTOP LAYOUT)
                ====================================================================== */}
            <main className="flex-1 h-full bg-white border border-gray-200/80 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] overflow-hidden flex flex-col" id="desktop-content-container">
              <div className="flex-1 w-full h-full overflow-y-auto relative bg-white flex flex-col pt-3" id="desktop-content-viewport">
                <Suspense fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-lg bg-[#FF6B00] animate-spin"></div>
                  </div>
                }>
                  {children}
                </Suspense>
              </div>
            </main>

          </div>
        )}

      </div>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );
};
