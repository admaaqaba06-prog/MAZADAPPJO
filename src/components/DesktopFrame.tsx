import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { useSocialProof } from '../hooks/useSocialProof';
import { unreadUserFacingCount } from '../utils/notifications';
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
  Store,
  ShoppingBag
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
    escrows,
    users,
    notifications,
    showNotifications,
    setShowNotifications
  } = useApp();

  // Real social proof for the new-user right rail (spec §4): live bidders
  // from the loaded auctions + recent wins (one-time cached query).
  const { biddersNow, recentWins } = useSocialProof();

  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const t = translations[language];
  const isAr = language === 'ar';
  const isStrictAdmin = currentUser && (currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true);

  // Wave D: the bell badge counts only bidder-relevant notifications for
  // regular users; admins keep the full unfiltered stream.
  const unreadCount = isStrictAdmin
    ? (notifications || []).filter(n => !n.read).length
    : unreadUserFacingCount(notifications);
  const isSeller = currentUser && (currentUser.role === 'seller' || currentUser.role === 'admin' || currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true);

  // Dynamic calculations for outer header
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
            onClick={() => setActiveView('orders')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'orders'
                ? 'text-[#FF6B00]'
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
            id="mobile-my-orders-tab-btn"
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'مشترياتي' : 'Orders'}</span>
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
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'العضوية' : 'Membership'}</span>
          </button>

          <button
            onClick={() => setActiveView('about')}
            className={`flex flex-col items-center gap-1 transition-all flex-1 ${
              activeView === 'about'
                ? 'text-[#FF6B00]'
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'
            }`}
            id="mobile-how-it-works-tab-btn"
          >
            <HelpCircle className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal whitespace-nowrap">{isAr ? 'كيف يعمل' : 'How it works'}</span>
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
              onClick={() => setActiveView('orders')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'orders'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
              id="top-nav-my-orders-btn"
            >
              <ShoppingBag className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'مشترياتي' : 'My Orders'}</span>
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

            <button
              onClick={() => setActiveView('about')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'about'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
              id="top-nav-how-it-works-btn"
            >
              <HelpCircle className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'كيف يعمل' : 'How it works'}</span>
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

            {/* Profile Avatar + user menu (Profile / Terms / Log Out) */}
            {currentUser && (
              <div className="relative" id="header-user-menu-root">
                <button
                  onClick={() => setIsUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 cursor-pointer select-none group"
                  title={currentUser.name}
                  id="header-user-menu-btn"
                >
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover border border-gray-200/85 shadow-xs shrink-0 group-hover:border-[#E85D04] transition-colors"
                  />
                  <span className="hidden xl:inline text-xs font-bold text-gray-700 group-hover:text-gray-900">
                    {currentUser.name.split(' ')[0]}
                  </span>
                </button>

                {isUserMenuOpen && (
                  <>
                    {/* Click-away overlay */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsUserMenuOpen(false)}
                    />
                    <div
                      className="absolute end-0 top-full mt-2 w-52 bg-white border border-gray-200/80 rounded-2xl shadow-lg py-1.5 z-50"
                      id="header-user-menu-dropdown"
                    >
                      <button
                        onClick={() => { setIsUserMenuOpen(false); setActiveView('profile'); }}
                        className="w-full text-left rtl:text-right px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 cursor-pointer"
                      >
                        <User className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.75]" />
                        <span>{isAr ? 'حسابي' : 'My Profile'}</span>
                      </button>
                      <button
                        onClick={() => { setIsUserMenuOpen(false); setIsTermsOpen(true); }}
                        className="w-full text-left rtl:text-right px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 cursor-pointer"
                      >
                        <HelpCircle className="w-4 h-4 text-gray-400 shrink-0 stroke-[1.75]" />
                        <span>{isAr ? 'الشروط والأحكام' : 'Terms & Policies'}</span>
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          if (window.confirm(isAr ? 'هل تريد تسجيل الخروج؟' : 'Log out of your account?')) {
                            logout();
                          }
                        }}
                        className="w-full text-left rtl:text-right px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer"
                        id="header-logout-btn"
                      >
                        <LogOut className="w-4 h-4 shrink-0 stroke-[1.75]" />
                        <span>{isAr ? 'تسجيل الخروج' : 'Log Out'}</span>
                      </button>
                    </div>
                  </>
                )}
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
                  </div>
                </div>
              )}

              {/* Rail body: active members WITH activity keep their alert/ledger
                  stream; everyone else gets a compact How-it-works + trust card
                  instead of an empty 'No recent transactions' ledger. */}
              {allLedgerEvents.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-1">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {isAr ? 'الطلبات والتنبيهات' : 'ORDERS & ALERTS'}
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
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4" id="rail-how-it-works">
                  <div className="flex items-center justify-between pb-1">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {isAr ? 'كيف يعمل مزاد جو' : 'HOW MAZAD WORKS'}
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

                  {/* Compact 3-step card */}
                  <div className="bg-[#FAF9F6] border border-gray-200/60 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#E85D04] font-black text-sm leading-none mt-0.5 shrink-0">①</span>
                      <p className="text-[11px] font-bold text-gray-800 leading-snug">
                        {isAr ? 'انضم من ١ د.أ شهرياً' : 'Join from 1 JD/mo'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#E85D04] font-black text-sm leading-none mt-0.5 shrink-0">②</span>
                      <p className="text-[11px] font-bold text-gray-800 leading-snug">
                        {isAr ? 'زايد مجاناً — تدفع فقط عند الفوز' : 'Bid free — pay only if you win'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#E85D04] font-black text-sm leading-none mt-0.5 shrink-0">③</span>
                      <p className="text-[11px] font-bold text-gray-800 leading-snug">
                        {isAr ? 'ادفع عبر كليك (+٥٪) — استلام أو توصيل' : 'Pay via CliQ (+5%) — pickup or delivery'}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveView('about')}
                      className="text-[10px] font-extrabold text-[#E85D04] hover:text-orange-700 cursor-pointer flex items-center gap-1 pt-0.5"
                      id="rail-how-it-works-link"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>{isAr ? 'اعرف المزيد — كيف يعمل' : 'Learn more — How it works'}</span>
                    </button>
                  </div>

                  {/* Live social proof (real data only): people bidding right
                      now, else the latest real win. Nothing when data is thin —
                      the qualitative trust chips below carry the fallback. */}
                  {biddersNow > 0 ? (
                    <p className="text-[10.5px] font-extrabold text-red-600 leading-snug px-1" id="rail-live-proof">
                      {isAr
                        ? (biddersNow === 1 ? '🔥 شخص واحد بيزايد الآن' : `🔥 ${biddersNow} أشخاص بيزايدوا الآن`)
                        : `🔥 ${biddersNow} bidding right now`}
                    </p>
                  ) : recentWins.length > 0 ? (
                    <p className="text-[10.5px] font-bold text-emerald-700 leading-snug px-1 truncate" id="rail-recent-win">
                      {isAr
                        ? `🏆 آخر فوز: ${recentWins[0].winner ?? 'حدا'} ربح ${recentWins[0].item} — ${recentWins[0].when}`
                        : `🏆 Latest win: ${recentWins[0].winner ?? 'someone'} won ${recentWins[0].item} — ${recentWins[0].when}`}
                    </p>
                  ) : null}

                  {/* Trust chips */}
                  <div className="flex flex-wrap gap-1.5" id="rail-trust-chips">
                    <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9.5px] font-bold px-2 py-1 rounded-full">
                      <ShieldCheck className="w-3 h-3" />
                      {isAr ? 'كليك آمن' : 'Secure CliQ'}
                    </span>
                    <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9.5px] font-bold px-2 py-1 rounded-full">
                      <ShieldCheck className="w-3 h-3" />
                      {isAr ? 'بائعون موثّقون' : 'Verified sellers'}
                    </span>
                    <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9.5px] font-bold px-2 py-1 rounded-full">
                      <Coins className="w-3 h-3" />
                      {isAr ? 'ادفع فقط عند الفوز' : 'Pay only if you win'}
                    </span>
                  </div>
                </div>
              )}

              {/* Security Banner footer */}
              <div className="mt-auto bg-[#F7F6F3] rounded-xl p-3 flex gap-2 items-start border border-gray-200/50">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[9.5px] text-gray-500 font-medium leading-relaxed">
                  {isAr
                    ? 'مدفوعاتك عبر كليك إلى حساب مزاد جو في كابيتال بنك.'
                    : "Payments via CliQ to Mazad JO's Capital Bank account."}
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
