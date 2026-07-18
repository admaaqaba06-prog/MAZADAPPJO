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
  Play,
  Store
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
  const isStrictAdmin = currentUser && (currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true);
  const isSeller = currentUser && (currentUser.role === 'seller' || currentUser.role === 'admin' || currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true);

  const liveAuctions = auctions.filter(a => a.status === 'live' && (!a.endTime || a.endTime > Date.now()));

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

          {isSeller && (
            <button 
              onClick={() => setActiveView('seller-center')}
              className={`flex flex-col items-center gap-1 transition-all flex-1 ${
                activeView === 'seller-center' 
                  ? 'text-[#FF6B00]' 
                  : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              <Store className="w-5 h-5" />
              <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'المتجر' : 'Seller'}</span>
            </button>
          )}

          <button 
            onClick={() => setActiveView('wallet')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'wallet' 
                ? 'text-[#FF6B00]' 
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <WalletIcon className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'العضوية' : 'Membership'}</span>
          </button>

          <button 
            onClick={() => setActiveView('profile')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'profile'
                ? 'text-[#FF6B00]' 
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'حسابي' : 'Profile'}</span>
          </button>

          {isStrictAdmin && (
            <button 
              onClick={() => setActiveView('admin')}
              className={`flex flex-col items-center gap-1 transition-all flex-1 ${
                activeView === 'admin' 
                  ? 'text-[#FF6B00]' 
                  : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
              }`}
              id="mobile-admin-tab-btn"
            >
              <ShieldAlert className="w-5 h-5 text-amber-500 animate-pulse" />
              <span className="text-[9px] font-extrabold tracking-normal text-amber-600">{isAr ? 'المشرف' : 'Admin'}</span>
            </button>
          )}
        </nav>
      </div>

      {/* ======================================================================
          2. THE PREMIUM THREE-COLUMN MOCKUP LAYOUT (Presented strictly on screens lg and above)
          ====================================================================== */}
      <div className="hidden lg:flex flex-col h-screen overflow-hidden bg-[#F7F6F3]" id="desktop-premium-layout-root">
        
        {/* ======================================================================
            GLOBAL DESKTOP HEADER (Standard height, clean white, like the reference)
            ====================================================================== */}
        <header className="w-full h-16 border-b border-gray-200/80 flex items-center justify-between px-6 shrink-0 z-40 bg-white text-gray-900 shadow-sm" id="global-desktop-header">
          
          {/* 1. Logo & App Name (Left) */}
          <div 
            onClick={() => setActiveView('discovery')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="w-8 h-8 rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base tracking-wider shadow-md shadow-orange-500/10 group-hover:scale-105 transition-all">
              M
            </div>
            <div className="flex flex-col text-left rtl:text-right">
              <span className="text-xs font-black font-sans leading-none tracking-tight uppercase text-gray-950">
                {t.appName}
              </span>
              <span className="text-[8.5px] text-gray-400 font-bold tracking-widest mt-1 leading-none font-mono">
                {isAr ? 'تجريبي V3' : 'V3 PILOT'}
              </span>
            </div>
          </div>

          {/* 2. Top Navigation Links (Center) */}
          <nav className="flex items-center gap-1 xl:gap-2" id="global-top-navigation">
            <button
              onClick={() => setActiveView('discovery')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'discovery'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <Home className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'تصفح المزادات' : 'Discover'}</span>
            </button>

            <button
              onClick={() => {
                const firstLive = auctions.filter(a => a.status === 'live')[0] || auctions[0];
                if (firstLive) setActiveAuctionId(firstLive.id);
                setActiveView('live');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'live'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <Play className="w-4 h-4 shrink-0 stroke-[2] text-[#E85D04]" />
              <span>{isAr ? 'البث المباشر' : 'Live Stream'}</span>
            </button>

            <button
              onClick={() => setActiveView('upload')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'upload'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <PlusCircle className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'إنشاء إدراج' : 'Sell'}</span>
            </button>

            <button
              onClick={() => setActiveView('wallet')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'wallet'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <WalletIcon className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'العضوية' : 'Membership'}</span>
            </button>

            {isSeller && (
              <button
                onClick={() => setActiveView('seller-center')}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeView === 'seller-center'
                    ? 'bg-[#E85D04]/10 text-[#E85D04]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                }`}
              >
                <Store className="w-4 h-4 shrink-0 stroke-[2]" />
                <span>{isAr ? 'مركز البائع' : 'Seller Center'}</span>
              </button>
            )}

            {isStrictAdmin && (
              <button
                onClick={() => setActiveView('admin')}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeView === 'admin'
                    ? 'bg-[#E85D04]/10 text-[#E85D04]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-[#E85D04]'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 stroke-[2]" />
                <span>{isAr ? 'المشرف' : 'Admin'}</span>
              </button>
            )}
          </nav>

          {/* 3. Actions: Wallet balance, Language switcher, Notifications bell, User Profile (Right) */}
          <div className="flex items-center gap-3 xl:gap-4" id="global-header-actions">
            
            {/* Membership pill */}
            {currentUser && (
              <div
                onClick={() => setActiveView('wallet')}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold font-mono cursor-pointer transition-colors bg-[#FAF9F6] border-gray-200/80 text-gray-800 hover:border-gray-300"
              >
                <Coins className="w-3.5 h-3.5 text-[#E85D04]" />
                <span>
                  {currentUser?.subscriptionStatus === 'active'
                    ? (isAr ? 'عضو ✓' : 'Member ✓')
                    : (isAr ? 'انضم بـ ١ د.أ' : 'Join — 1 JD')}
                </span>
              </div>
            )}

            {/* Language switch */}
            <button 
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="p-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              title={language === 'en' ? 'العربية' : 'English'}
            >
              <Globe className="w-4 h-4 shrink-0 stroke-[2]" />
              <span className="hidden xl:inline">{language === 'en' ? 'العربية' : 'English'}</span>
            </button>

            {/* Notifications */}
            <button 
              onClick={() => setShowNotifications(true)}
              className="p-2 rounded-xl transition-colors cursor-pointer relative text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              title={isAr ? 'الإشعارات' : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#E85D04] rounded-full border border-white"></span>
              )}
            </button>

            {/* Profile Avatar */}
            {currentUser && (
              <div 
                onClick={() => setActiveView('profile')}
                className="flex items-center gap-2 cursor-pointer select-none group"
              >
                <img 
                  src={currentUser.avatar} 
                  alt={currentUser.name} 
                  className="w-8 h-8 rounded-full object-cover border border-gray-200/85 shadow-xs shrink-0 group-hover:border-[#E85D04] transition-colors"
                />
                <span className="hidden xl:inline text-xs font-bold text-gray-700 group-hover:text-gray-900">
                  {currentUser.name.split(' ')[0]}
                </span>
              </div>
            )}

          </div>

        </header>

        {/* WORKSPACE UNDERNEATH HEADER */}
        <div className="flex flex-1 min-h-0 w-full overflow-hidden" id="global-desktop-body">
          {activeView === 'live' ? (
            <div className="flex flex-1 min-h-0 w-full overflow-hidden bg-[#F7F6F3] transition-all duration-300" id="desktop-premium-reels-layout">
              <Suspense fallback={
                <div className="flex-1 h-full flex items-center justify-center bg-[#F7F6F3]">
                  <div className="w-8 h-8 rounded-lg bg-[#E85D04] animate-spin"></div>
                </div>
              }>
                {children}
              </Suspense>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 w-full overflow-hidden bg-[#F7F6F3]" id="desktop-three-column-root">
              
              {/* Left Sidebar stays inside but logo section removed/reduced as it's now in the Top Header */}
              <aside className="w-[260px] h-full bg-white border-r border-gray-200/80 flex flex-col p-5 shrink-0 select-none justify-between" id="left-sidebar-panel">
                <div className="space-y-4">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3">
                    {isAr ? 'القائمة الرئيسية' : 'NAVIGATION'}
                  </div>
                  <nav className="flex flex-col gap-1" id="sidebar-nav-container">
                    <button
                      onClick={() => setActiveView('discovery')}
                      className={`w-full text-left rtl:text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                        activeView === 'discovery' 
                          ? 'bg-[#E85D04]/10 text-[#E85D04]' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                      }`}
                    >
                      <Home className="w-4.5 h-4.5 shrink-0 stroke-[1.75]" />
                      <span>{isAr ? 'تصفح المزادات' : 'Discover'}</span>
                    </button>

                    <button
                      onClick={() => {
                        const firstLive = auctions.filter(a => a.status === 'live')[0] || auctions[0];
                        if (firstLive) setActiveAuctionId(firstLive.id);
                        setActiveView('live');
                      }}
                      className={`w-full text-left rtl:text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                        activeView === 'live' 
                          ? 'bg-[#E85D04]/10 text-[#E85D04]' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                      }`}
                    >
                      <Play className="w-4.5 h-4.5 shrink-0 stroke-[1.75] animate-pulse text-[#E85D04]" />
                      <span>{isAr ? 'البث المباشر' : 'Live Stream'}</span>
                    </button>

                    <button
                      onClick={() => setActiveView('upload')}
                      className={`w-full text-left rtl:text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                        activeView === 'upload' 
                          ? 'bg-[#E85D04]/10 text-[#E85D04]' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                      }`}
                    >
                      <PlusCircle className="w-4.5 h-4.5 shrink-0 stroke-[1.75]" />
                      <span>{isAr ? 'إنشاء إدراج بائع' : 'Sell'}</span>
                    </button>

                    <button
                      onClick={() => setActiveView('wallet')}
                      className={`w-full text-left rtl:text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                        activeView === 'wallet' 
                          ? 'bg-[#E85D04]/10 text-[#E85D04]' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                      }`}
                    >
                      <WalletIcon className="w-4.5 h-4.5 shrink-0 stroke-[1.75]" />
                      <span>{isAr ? 'العضوية' : 'Membership'}</span>
                    </button>

                    {isSeller && (
                      <button
                        onClick={() => setActiveView('seller-center')}
                        className={`w-full text-left rtl:text-right px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                          activeView === 'seller-center' 
                            ? 'bg-[#E85D04]/10 text-[#E85D04]' 
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                        }`}
                      >
                        <Store className="w-4.5 h-4.5 shrink-0 stroke-[1.75]" />
                        <span>{isAr ? 'مركز البائع' : 'Seller Center'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setIsTermsOpen(true)}
                      className="w-full text-left rtl:text-right px-3 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-950 transition-colors flex items-center gap-3 cursor-pointer mt-2"
                    >
                      <HelpCircle className="w-4.5 h-4.5 shrink-0 stroke-[1.75]" />
                      <span>{isAr ? 'الشروط والأحكام' : 'Terms & Policies'}</span>
                    </button>
                  </nav>
                </div>

                {/* Sidebar bottom footer: Log Out only */}
                <div className="pt-4 border-t border-gray-100 flex flex-col gap-2.5">
                  <button 
                    onClick={logout}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors cursor-pointer rounded-lg hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.75]" />
                    <span>{isAr ? 'تسجيل الخروج' : 'Log Out'}</span>
                  </button>
                </div>

              </aside>

              {/* ======================================================================
                  COLUMN 2: CENTER / MAIN CONTENT VIEWPORT (MAX-W-1100PX)
                  ====================================================================== */}
              <main className="flex-1 h-full bg-[#F7F6F3] overflow-y-auto flex justify-center py-8 px-8 md:px-12" id="desktop-content-container">
                <div className="max-w-[1100px] w-full flex flex-col gap-8" id="desktop-content-viewport">
                  <Suspense fallback={
                    <div className="flex-1 flex items-center justify-center h-full min-h-[300px]">
                      <div className="w-8 h-8 rounded-lg bg-[#E85D04] animate-spin"></div>
                    </div>
                  }>
                    {children}
                  </Suspense>
                </div>
              </main>

            {/* ======================================================================
                COLUMN 3: RIGHT PANEL (CONTEXT & LIVE METRICS / ALERTS)
                ====================================================================== */}
            <aside className="w-[320px] h-full bg-white border-l border-gray-200/80 p-6 shrink-0 overflow-y-auto flex flex-col gap-6 select-none" id="right-context-panel">
              
              {/* Context Profile Block */}
              {currentUser && (
                <div className="flex items-center gap-3 pb-5 border-b border-gray-100">
                  <img 
                    src={currentUser.avatar} 
                    alt={currentUser.name} 
                    className="w-10 h-10 rounded-full object-cover border border-gray-200/80 shadow-xs shrink-0"
                  />
                  <div className="flex flex-col text-left rtl:text-right min-w-0">
                    <span className="text-xs font-bold text-gray-950 truncate leading-tight">
                      {currentUser.name}
                    </span>
                    <span className="text-[9px] font-black text-[#E85D04] tracking-wider uppercase mt-1">
                      {isStrictAdmin 
                        ? (isAr ? 'مستشار النظام' : 'SYSTEM CRITICAL') 
                        : (isAr ? 'عضو موثق بضمان' : 'VERIFIED MERCHANT')}
                    </span>
                  </div>
                </div>
              )}

              {/* Wallet Financial Overview (Revolut Business style) */}
              {wallet && (
                <div className="p-5 bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.01)] flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {isAr ? 'رصيد المحفظة الآمن' : 'SECURE WALLET'}
                    </span>
                    <button 
                      onClick={() => setActiveView('wallet')}
                      className="text-[10px] font-bold text-[#E85D04] hover:underline uppercase tracking-wider cursor-pointer"
                    >
                      {isAr ? 'شحن' : 'TOP UP'}
                    </button>
                  </div>

                  <div className="py-1">
                    <span className="text-2xl font-black text-gray-900 font-mono tracking-tight block">
                      {(wallet.availableBalance ?? 0).toLocaleString()} <span className="text-xs font-bold text-gray-400">JOD</span>
                    </span>
                    <span className="text-[9.5px] text-gray-400 font-medium block mt-1.5 leading-snug">
                      {isAr ? 'رصيد كليك الموثق لعمليات الضمان الفورية.' : 'Verified CliQ balance available for secure escrow transactions.'}
                    </span>
                  </div>

                  {wallet.escrowBalance > 0 && (
                    <div className="flex justify-between items-center pt-2.5 border-t border-gray-100 mt-1">
                      <span className="text-[10px] font-semibold text-gray-400">
                        {isAr ? 'الضمان المعلق' : 'Escrow Balance'}
                      </span>
                      <span className="text-xs font-black text-[#E85D04] font-mono">
                        {(wallet.escrowBalance ?? 0).toLocaleString()} JD
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Ledger Stream / Live Alerts */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-1">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {isAr ? 'تنبيهات ومعاملات الضمان' : 'ESCROW LEDGER & ALERTS'}
                  </h4>
                  <button 
                    onClick={() => setShowNotifications(true)}
                    className="text-gray-400 hover:text-gray-900 cursor-pointer relative"
                    title={isAr ? 'الإشعارات' : 'Notifications'}
                  >
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#E85D04] rounded-full border border-white"></span>
                    )}
                  </button>
                </div>
                
                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                  {allLedgerEvents.map((event) => (
                    <div 
                      key={event.id} 
                      className="text-[11px] leading-relaxed font-medium text-gray-600 border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                    >
                      <span className="font-bold text-gray-950 block">{event.user}</span>
                      <p className="text-gray-500 mt-0.5">{event.action}</p>
                      <span className="text-[9px] text-gray-400 font-mono mt-1 block">{event.time}</span>
                    </div>
                  ))}
                  {allLedgerEvents.length === 0 && (
                    <p className="text-center text-xs text-gray-400 font-medium py-4">
                      {isAr ? 'لا توجد معاملات حالية' : 'No recent transactions'}
                    </p>
                  )}
                </div>
              </div>

              {/* Security Banner footer */}
              <div className="mt-auto bg-[#F7F6F3] rounded-xl p-3 flex gap-2 items-start border border-gray-200/50">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[9.5px] text-gray-500 font-medium leading-relaxed">
                  {isAr 
                    ? 'جميع المعاملات مؤمنة بضمان منصة كليك التابع للبنك المركزي الأردني.' 
                    : 'Transactions secure under Jordan CliQ escrow protection.'}
                </p>
              </div>

            </aside>

          </div>
        )}
      </div>

      </div>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </div>
  );
};
