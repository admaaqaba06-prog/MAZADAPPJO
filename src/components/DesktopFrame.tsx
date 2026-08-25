import React, { useState, useEffect, lazy, Suspense } from 'react';
import ThemeToggle from './ui/ThemeToggle';
import { useApp } from '../context/AppContext';
import { useSocialProof, formatRelativeTime } from '../hooks/useSocialProof';
import { DESKTOP_MIN_WIDTH, isDesktopWidth } from '../utils/shellBreakpoint';
import { useOwnsListing } from '../hooks/useOwnsListing';
import { unreadUserFacingCount, userFacingNotifications } from '../utils/notifications';
import { isAdminUser, isAdminOrSeller } from '../utils/adminAuth';
import { resolveAvatarUrl } from '../utils/avatarPlaceholder';
import type { Notification } from '../types';
import { translations } from '../utils/translations';
import TermsModal from './TermsModal';
import { NotificationCenter } from './NotificationCenter';
import { InstallPrompt } from './InstallPrompt';

const AdminPanel = lazy(() => import('./AdminPanel'));
import { ReelsDesktopRightPanel } from './ReelsDesktopRightPanel';
import { BrandMark } from './BrandMark';
import { 
  User,
  TrendingUp, 
  Tv, 
  ShieldAlert,
  PlusCircle,
  Plus,
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
  ShoppingBag,
  Gavel,
  Trophy,
  XCircle,
  Package,
  Crown
} from 'lucide-react';

// Wave D (spec §5): per-type icon styling for the curated "Your activity"
// rail — outbid / won / refund-loss / order-payment / subscription.
const activityIconFor = (type: Notification['type']) => {
  switch (type) {
    case 'outbid':
      return { Icon: Gavel, wrap: 'bg-[#E85D04]/10 text-[#E85D04]' };
    case 'win':
      return { Icon: Trophy, wrap: 'bg-emerald-500/10 text-emerald-600' };
    case 'loss':
    case 'refund':
      return { Icon: XCircle, wrap: 'bg-rose-500/10 text-rose-500' };
    case 'order':
      return { Icon: Package, wrap: 'bg-indigo-500/10 text-indigo-600' };
    case 'subscription':
      return { Icon: Crown, wrap: 'bg-purple-500/10 text-purple-600' };
    default:
      return { Icon: Bell, wrap: 'bg-gray-500/10 text-fg-muted' };
  }
};

interface DesktopFrameProps {
  children: React.ReactNode;
}

export const DesktopFrame: React.FC<DesktopFrameProps> = ({ children }) => {
  const {
    currentUser,
    activeView,
    setActiveView,
    language,
    setLanguage,
    logout,
    setActiveAuctionId,
    users,
    notifications,
    showNotifications,
    setShowNotifications,
    isGuest,
    requestSignIn
  } = useApp();

  // Real social proof for the new-user right rail (spec §4): live bidders
  // from the loaded auctions + recent wins (one-time cached query).
  const { biddersNow, recentWins } = useSocialProof();

  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const t = translations[language];
  const isAr = language === 'ar';
  const isStrictAdmin = isAdminUser(currentUser);

  // Wave D: the bell badge counts only bidder-relevant notifications for
  // regular users; admins keep the full unfiltered stream.
  const unreadCount = isStrictAdmin
    ? (notifications || []).filter(n => !n.read).length
    : unreadUserFacingCount(notifications);
  // Seller Center nav shows for the formal seller role OR anyone who owns a
  // listing.
  //
  // The `|| ownsListing` half predates seller activation existing at all: when
  // this was written, NOTHING could grant isSeller (WalletView's granting code
  // was both uncalled and blocked by the firestore.rules self-write denylist),
  // so without it a first-time seller had no route to the Pending status tab —
  // the Discover pending-box that used to cover that gap was removed in the
  // Discover redesign. PR #186 added the activateSeller callable, so isSeller
  // is now grantable; `ownsListing` is kept because listing an item still does
  // not activate a seller account, and someone who has listed should reach
  // their own listing's status without activating first.
  //
  // Scoped per-user listener (Slice 1b) so this no longer scans the broad
  // `auctions` array.
  const ownsListing = useOwnsListing(currentUser?.id);
  const isSeller = isAdminOrSeller(currentUser) || ownsListing;

  // Wave D (spec §5): the right rail shows the user's OWN relevant alerts —
  // outbid / won / payment / subscription — not the raw escrow ledger.
  const activityFeed = userFacingNotifications(notifications).slice(0, 6);

  // Which shell gets `children`. The two shells below are toggled by
  // `lg:hidden` / `hidden lg:flex`, but Tailwind's `hidden` is only
  // display:none — React MOUNTS BOTH. Rendering {children} in each therefore
  // mounted every view TWICE: duplicate DOM ids, two copies of every effect,
  // interval and Firestore listener, and two <video> elements pulling the same
  // media, with the invisible copy doing all of it forever. Gating on the same
  // 1024px threshold in JS leaves exactly one live mount.
  //
  // Seeded from the real width so the first paint already targets the right
  // shell (client-only SPA — `window` exists), then kept in sync via matchMedia.
  const [isDesktop, setIsDesktop] = useState(() => isDesktopWidth(window.innerWidth));
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const sync = () => setIsDesktop(mq.matches);
    sync(); // width may have changed between the initial render and this effect
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <div 
      className="w-full h-[100dvh] overflow-hidden text-fg bg-surface-sunken/50 font-sans selection:bg-[#FF6B00]/20"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="desktop-frame-root"
    >
      {/* ======================================================================
          1. MOBILE EMULATOR LAYOUT (Presented on screens below 1024px / lg)
          ====================================================================== */}
      <div 
        className="lg:hidden h-[100dvh] max-h-[100dvh] w-full bg-surface flex flex-col overflow-hidden"
        id="mobile-layout-root"
      >
        {/* Main Application active view fills standard mobile viewport exactly.
            Gated on !isDesktop so the desktop shell below is the only mount at
            lg+ — see the isDesktop comment above. */}
        <div className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
          {!isDesktop && children}
        </div>

        {/* Global Bottom Navigation bar strictly at foot of phone screens.
            Native 4-slot IA: Discover · Orders · [elevated Sell "+" FAB] · Profile.
            Sell is a raised center FAB (Instagram/TikTok create pattern); the
            former Home/Sell/How-it-works flat tabs are gone. Seller/Admin remain
            as role-gated slots so those destinations aren't orphaned on mobile.
            Order is source-order so RTL mirrors it correctly. */}
        <nav
          className={`relative z-20 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 px-4 flex items-center justify-between text-[10px] font-bold tracking-wider select-none h-16 shrink-0 transition-all duration-300 ${
            activeView === 'live'
              ? 'bg-[#111111]/95 text-zinc-400 border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]'
              : 'bg-surface-raised border-t border-line/80 text-fg-muted shadow-[0_-5px_20px_rgba(0,0,0,0.03)]'
          }`}
          id="mobile-nav-bar"
        >
          {/* Discover — same 'discovery' route, relabeled from "Home" */}
          <button
            onClick={() => setActiveView('discovery')}
            aria-current={activeView === 'discovery' ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 transition-colors flex-1 ${
              activeView === 'discovery'
                ? 'text-[#FF6B00]'
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'اكتشف' : 'Discover'}</span>
          </button>

          <button
            onClick={() => setActiveView('orders')}
            aria-current={activeView === 'orders' ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 transition-colors flex-1 ${
              activeView === 'orders'
                ? 'text-[#FF6B00]'
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-fg-muted hover:text-fg'
            }`}
            id="mobile-my-orders-tab-btn"
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'مشترياتي' : 'Orders'}</span>
          </button>

          {/* Sell — elevated center FAB (raised orange circle). Same 'upload'
              route/handler; only the presentation changed. */}
          <button
            // A guest tapping Sell used to be bounced to a sign-in screen whose
            // only contextual line read "Sign in to join the live auction" —
            // the exact bug a partner review reported. 'upload' is not a
            // guest-allowed view, so the routing is unchanged; only the ASK is.
            onClick={() => (isGuest ? requestSignIn('sell') : setActiveView('upload'))}
            aria-label={isAr ? 'بيع' : 'Sell'}
            aria-current={activeView === 'upload' ? 'page' : undefined}
            className="flex flex-col items-center flex-1 transition-colors"
          >
            <span
              className={`flex items-center justify-center w-14 h-14 -mt-8 rounded-full bg-[#FF6B00] text-white shadow-lg shadow-[#FF6B00]/40 border-4 transition-transform active:scale-95 ${
                activeView === 'live' ? 'border-[#111111]' : 'border-white'
              } ${activeView === 'upload' ? 'ring-2 ring-[#FF6B00]/40 ring-offset-0' : ''}`}
            >
              <Plus className="w-7 h-7" strokeWidth={2.75} />
            </span>
            <span
              className={`text-[9px] font-extrabold tracking-normal mt-0.5 ${
                activeView === 'upload'
                  ? 'text-[#FF6B00]'
                  : activeView === 'live' ? 'text-zinc-500' : 'text-fg-muted'
              }`}
            >
              {isAr ? 'بيع' : 'Sell'}
            </span>
          </button>

          <button
            onClick={() => (isGuest ? requestSignIn('account') : setActiveView('profile'))}
            aria-current={activeView === 'profile' ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 transition-colors flex-1 ${
              activeView === 'profile'
                ? 'text-[#FF6B00]'
                : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] font-extrabold tracking-normal">
              {isGuest ? (isAr ? 'دخول' : 'Sign in') : (isAr ? 'حسابي' : 'Profile')}
            </span>
          </button>

          {isSeller && (
            <button
              onClick={() => setActiveView('seller-center')}
              aria-current={activeView === 'seller-center' ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 transition-colors flex-1 ${
                activeView === 'seller-center'
                  ? 'text-[#FF6B00]'
                  : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Store className="w-5 h-5" />
              <span className="text-[9px] font-extrabold tracking-normal">{isAr ? 'المتجر' : 'Seller'}</span>
            </button>
          )}

          {isStrictAdmin && (
            <button
              onClick={() => setActiveView('admin')}
              aria-current={activeView === 'admin' ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 transition-colors flex-1 ${
                activeView === 'admin'
                  ? 'text-[#FF6B00]'
                  : activeView === 'live' ? 'text-zinc-500 hover:text-zinc-300' : 'text-fg-muted hover:text-fg'
              }`}
              id="mobile-admin-tab-btn"
            >
              <ShieldAlert className="w-5 h-5 text-amber-500 animate-pulse" />
              <span className="text-[9px] font-extrabold tracking-normal text-amber-600">{isAr ? 'المشرف' : 'Admin'}</span>
            </button>
          )}
        </nav>

        {/* Dismissible "Add to Home Screen" install hint (mobile only). Lives
            inside the lg:hidden shell so it never appears on desktop, and is
            suppressed on the immersive live/reels view. */}
        <InstallPrompt suppressed={activeView === 'live'} />
      </div>

      {/* ======================================================================
          2. THE PREMIUM THREE-COLUMN MOCKUP LAYOUT (Presented strictly on screens lg and above)
          ====================================================================== */}
      <div className="hidden lg:flex flex-col h-[100dvh] overflow-hidden bg-surface" id="desktop-premium-layout-root">
        
        {/* ======================================================================
            GLOBAL DESKTOP HEADER (Standard height, clean white, like the reference)
            ====================================================================== */}
        <header className="w-full h-16 border-b border-line/80 flex items-center justify-between px-6 shrink-0 z-40 bg-surface-raised text-fg shadow-sm" id="global-desktop-header">
          
          {/* 1. Logo & App Name (Left) — routes to the landing page (path `/`). */}
          <div
            onClick={() => setActiveView('landing')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <BrandMark className="w-8 h-8 group-hover:scale-105 transition-all" />
            <div className="flex flex-col text-left rtl:text-right">
              <span className="text-xs font-black font-sans leading-none tracking-tight uppercase text-fg">
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
                  : 'text-fg-muted hover:bg-surface-sunken hover:text-fg'
              }`}
            >
              <Home className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'تصفح المزادات' : 'Discover'}</span>
            </button>

            <button
              onClick={() => (isGuest ? requestSignIn('sell') : setActiveView('upload'))}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'upload'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-fg-muted hover:bg-surface-sunken hover:text-fg'
              }`}
            >
              <PlusCircle className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'بيع منتجك' : 'Sell'}</span>
            </button>

            <button
              onClick={() => setActiveView('orders')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'orders'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-fg-muted hover:bg-surface-sunken hover:text-fg'
              }`}
              id="top-nav-my-orders-btn"
            >
              <ShoppingBag className="w-4 h-4 shrink-0 stroke-[2]" />
              <span>{isAr ? 'مشترياتي' : 'My Orders'}</span>
            </button>

            <button
              onClick={() => setActiveView('about')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeView === 'about'
                  ? 'bg-[#E85D04]/10 text-[#E85D04]'
                  : 'text-fg-muted hover:bg-surface-sunken hover:text-fg'
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
                    : 'text-fg-muted hover:bg-surface-sunken hover:text-fg'
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
                    : 'text-fg-muted hover:bg-surface-sunken hover:text-[#E85D04]'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 stroke-[2]" />
                <span>{isAr ? 'المشرف' : 'Admin'}</span>
              </button>
            )}
          </nav>

          {/* 3. Actions: Wallet balance, Language switcher, Notifications bell, User Profile (Right) */}
          <div className="flex items-center gap-3 xl:gap-4" id="global-header-actions">
            
            {/* Member/Join pill */}
            {currentUser && (
              <div
                onClick={() => setActiveView('wallet')}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold font-mono cursor-pointer transition-colors bg-surface border-line/80 text-fg hover:border-line"
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
              className="p-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold text-fg-muted hover:text-fg hover:bg-surface-sunken"
              title={language === 'en' ? 'العربية' : 'English'}
            >
              <Globe className="w-4 h-4 shrink-0 stroke-[2]" />
              <span className="hidden xl:inline">{language === 'en' ? 'العربية' : 'English'}</span>
            </button>

            {/* Theme switch — same shared control as the landing page */}
            <ThemeToggle isAr={language !== 'en'} />

            {/* Notifications */}
            <button 
              onClick={() => setShowNotifications(true)}
              className="p-2 rounded-xl transition-colors cursor-pointer relative text-fg-muted hover:text-fg hover:bg-surface-sunken"
              title={isAr ? 'الإشعارات' : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#E85D04] rounded-full border border-white"></span>
              )}
            </button>

            {/* Guest browsing: explicit sign-in entry instead of the user menu */}
            {isGuest && (
              <button
                onClick={() => requestSignIn('account')}
                className="px-3.5 py-1.5 rounded-full bg-[#E85D04] hover:bg-orange-600 text-white text-xs font-black transition-colors cursor-pointer shadow-sm"
                id="header-guest-signin-btn"
              >
                {isAr ? 'تسجيل الدخول' : 'Sign in'}
              </button>
            )}

            {/* Profile Avatar + user menu (Profile / Terms / Log Out) */}
            {!isGuest && currentUser && (
              <div className="relative" id="header-user-menu-root">
                <button
                  onClick={() => setIsUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 cursor-pointer select-none group"
                  title={currentUser.name}
                  id="header-user-menu-btn"
                >
                  <img
                    src={resolveAvatarUrl(currentUser.avatar, currentUser.id)}
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover border border-line/85 shadow-xs shrink-0 group-hover:border-[#E85D04] transition-colors"
                  />
                  <span className="hidden xl:inline text-xs font-bold text-fg group-hover:text-fg">
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
                      className="absolute end-0 top-full mt-2 w-52 bg-surface-raised border border-line/80 rounded-2xl shadow-lg py-1.5 z-50"
                      id="header-user-menu-dropdown"
                    >
                      <button
                        onClick={() => { setIsUserMenuOpen(false); setActiveView('profile'); }}
                        className="w-full text-left rtl:text-right px-4 py-2.5 text-xs font-bold text-fg hover:bg-surface-sunken flex items-center gap-2.5 cursor-pointer"
                      >
                        <User className="w-4 h-4 text-fg-muted shrink-0 stroke-[1.75]" />
                        <span>{isAr ? 'حسابي' : 'My Profile'}</span>
                      </button>
                      <button
                        onClick={() => { setIsUserMenuOpen(false); setIsTermsOpen(true); }}
                        className="w-full text-left rtl:text-right px-4 py-2.5 text-xs font-bold text-fg hover:bg-surface-sunken flex items-center gap-2.5 cursor-pointer"
                      >
                        <HelpCircle className="w-4 h-4 text-fg-muted shrink-0 stroke-[1.75]" />
                        <span>{isAr ? 'الشروط والأحكام' : 'Terms & Policies'}</span>
                      </button>
                      <div className="my-1 border-t border-line" />
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          if (window.confirm(isAr ? 'هل تريد تسجيل الخروج؟' : 'Log out of your account?')) {
                            logout();
                          }
                        }}
                        className="w-full text-left rtl:text-right px-4 py-2.5 text-xs font-bold text-fg-muted hover:text-red-600 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer"
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
            <div className="flex flex-1 min-h-0 w-full overflow-hidden bg-surface transition-all duration-300" id="desktop-premium-reels-layout">
              <Suspense fallback={
                <div className="flex-1 h-full flex items-center justify-center bg-surface">
                  <div className="w-8 h-8 rounded-lg bg-[#E85D04] animate-spin"></div>
                </div>
              }>
                {isDesktop && children}
              </Suspense>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 w-full overflow-hidden bg-surface" id="desktop-three-column-root">
              
              {/* ======================================================================
                  COLUMN 2: CENTER / MAIN CONTENT VIEWPORT (MAX-W-1100PX)
                  ====================================================================== */}
              <main className="flex-1 h-full bg-surface overflow-y-auto flex justify-center py-8 px-8 md:px-12" id="desktop-content-container">
                <div className="max-w-[1100px] w-full flex flex-col gap-8" id="desktop-content-viewport">
                  <Suspense fallback={
                    <div className="flex-1 flex items-center justify-center h-full min-h-[300px]">
                      <div className="w-8 h-8 rounded-lg bg-[#E85D04] animate-spin"></div>
                    </div>
                  }>
                    {isDesktop && children}
                  </Suspense>
                </div>
              </main>

            {/* ======================================================================
                COLUMN 3: RIGHT PANEL (CONTEXT & LIVE METRICS / ALERTS)
                ====================================================================== */}
            <aside className="w-[320px] h-full bg-surface-raised border-l border-line/80 p-6 shrink-0 overflow-y-auto flex flex-col gap-6 select-none" id="right-context-panel">
              
              {/* Context Profile Block (hidden for guests — they have no profile) */}
              {!isGuest && currentUser && (
                <div className="flex items-center gap-3 pb-5 border-b border-line">
                  <img
                    src={resolveAvatarUrl(currentUser.avatar, currentUser.id)}
                    alt={currentUser.name}
                    className="w-10 h-10 rounded-full object-cover border border-line/80 shadow-xs shrink-0"
                  />
                  <div className="flex flex-col text-left rtl:text-right min-w-0">
                    <span className="text-xs font-bold text-fg truncate leading-tight">
                      {currentUser.name}
                    </span>
                  </div>
                </div>
              )}

              {/* Rail body (Wave D, spec §5): members WITH relevant activity get
                  a curated "Your activity" feed of their own allowlisted alerts
                  (outbid / won / payment / subscription); everyone else gets the
                  compact How-it-works + trust card. */}
              {activityFeed.length > 0 ? (
                <div className="flex flex-col gap-3" id="rail-your-activity">
                  <div className="flex items-center justify-between pb-1">
                    <h4 className="text-[10px] font-bold text-fg-muted uppercase tracking-wider">
                      {isAr ? 'نشاطك' : 'YOUR ACTIVITY'}
                    </h4>
                    <button
                      onClick={() => setShowNotifications(true)}
                      className="text-fg-muted hover:text-fg cursor-pointer relative"
                      title={isAr ? 'الإشعارات' : 'Notifications'}
                    >
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#E85D04] rounded-full border border-white"></span>
                      )}
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                    {activityFeed.map((notif) => {
                      const { Icon, wrap } = activityIconFor(notif.type);
                      return (
                        <div
                          key={notif.id}
                          className="flex items-start gap-2.5 border-b border-line pb-3 last:border-0 last:pb-0"
                        >
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${wrap}`}>
                            <Icon className="w-3.5 h-3.5 stroke-[2]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-fg leading-snug truncate">
                              {notif.title}
                            </p>
                            <span className="text-[9px] text-fg-muted font-mono mt-0.5 block">
                              {formatRelativeTime(notif.timestamp, isAr)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4" id="rail-how-it-works">
                  <div className="flex items-center justify-between pb-1">
                    <h4 className="text-[10px] font-bold text-fg-muted uppercase tracking-wider">
                      {isAr ? 'كيف يعمل مزادو' : 'HOW MAZAD WORKS'}
                    </h4>
                    <button
                      onClick={() => setShowNotifications(true)}
                      className="text-fg-muted hover:text-fg cursor-pointer relative"
                      title={isAr ? 'الإشعارات' : 'Notifications'}
                    >
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#E85D04] rounded-full border border-white"></span>
                      )}
                    </button>
                  </div>

                  {/* Compact 3-step card */}
                  <div className="bg-surface border border-line/60 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#E85D04] font-black text-sm leading-none mt-0.5 shrink-0">①</span>
                      <p className="text-[11px] font-bold text-fg leading-snug">
                        {isAr ? 'انضم من ١ د.أ شهرياً' : 'Join from 1 JD/mo'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#E85D04] font-black text-sm leading-none mt-0.5 shrink-0">②</span>
                      <p className="text-[11px] font-bold text-fg leading-snug">
                        {isAr ? 'زايد مجاناً — تدفع فقط عند الفوز' : 'Bid free — pay only if you win'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="text-[#E85D04] font-black text-sm leading-none mt-0.5 shrink-0">③</span>
                      <p className="text-[11px] font-bold text-fg leading-snug">
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
              <div className="mt-auto bg-surface rounded-xl p-3 flex gap-2 items-start border border-line/50">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[9.5px] text-fg-muted font-medium leading-relaxed">
                  {isAr
                    ? 'مدفوعاتك عبر كليك إلى حساب مزادو في البنك العربي.'
                    : "Payments via CliQ to Mazzado's Arab Bank account."}
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
