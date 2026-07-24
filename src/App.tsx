import React, { lazy, Suspense, useEffect, useState } from 'react';
import { AppProvider, useApp, useAuctions } from './context/AppContext';
import { parseAuctionIdFromSearch } from './utils/deepLink';
import { resolveUnauthenticatedScreen, canGuestAccessView } from './utils/guestGate';
import { isAdminUser } from './utils/adminAuth';
import { canSeeSimulated } from './utils/simVisibility';
import { useSimulatorEnabled } from './hooks/useSimulatorEnabled';
import { DesktopFrame } from './components/DesktopFrame';
import { SubscriptionPromptModal } from './components/SubscriptionPromptModal';
import { OnboardingModal } from './components/OnboardingModal';
import { ProfileCompletionModal } from './components/ProfileCompletionModal';
import { isProfileComplete } from './utils/jordanCities';
import { ToastProvider, ReviewPrompt } from './components/feedback';

// Named exports require mapping to default in React's lazy
const DiscoveryFeedView = lazy(() => import('./components/DiscoveryFeedView').then(m => ({ default: m.DiscoveryFeedView })));
const LiveStreamView = lazy(() => import('./components/LiveStreamView').then(m => ({ default: m.LiveStreamView })));
const AdminDashboardView = lazy(() => import('./components/AdminDashboardView').then(m => ({ default: m.AdminDashboardView })));
const LoginView = lazy(() => import('./components/LoginView').then(m => ({ default: m.LoginView })));
const SubscriptionView = lazy(() => import('./components/SubscriptionView').then(m => ({ default: m.SubscriptionView })));
const SellerCenterView = lazy(() => import('./components/SellerCenterView').then(m => ({ default: m.SellerCenterView })));
const ProfileView = lazy(() => import('./components/ProfileView').then(m => ({ default: m.ProfileView })));
const DropBuilderView = lazy(() => import('./components/DropBuilderView').then(m => ({ default: m.DropBuilderView })));
const AuctionDropBuilderView = lazy(() => import('./components/AuctionDropBuilderView'));
const LandingView = lazy(() => import('./landing/LandingView'));
const SellView = lazy(() => import('./components/SellView').then(m => ({ default: m.SellView })));
const MyOrdersView = lazy(() => import('./components/MyOrdersView').then(m => ({ default: m.MyOrdersView })));
const HowItWorksView = lazy(() => import('./components/HowItWorksView').then(m => ({ default: m.HowItWorksView })));
const ProhibitedItemsView = lazy(() => import('./components/ProhibitedItemsView').then(m => ({ default: m.ProhibitedItemsView })));

function ActiveViewRenderer() {
  const { activeView, currentUser } = useApp();

  switch (activeView) {
    case 'discovery':
      return <DiscoveryFeedView />;
    case 'live':
      return <LiveStreamView />;
    case 'wallet':
      return <SubscriptionView />;
    case 'orders':
      return <MyOrdersView />;
    case 'about':
      return <HowItWorksView />;
    case 'prohibited-items':
      return <ProhibitedItemsView />;
    case 'profile':
      return <ProfileView />;
    case 'seller-center':
      return <SellerCenterView />;
    case 'drop-builder':
      return <DropBuilderView />;
    case 'auction-drop-builder': {
      const isStrictAdmin = isAdminUser(currentUser);
      return isStrictAdmin ? <AuctionDropBuilderView /> : <DiscoveryFeedView />;
    }
    case 'admin':
      const isStrictAdmin = isAdminUser(currentUser);
      if (!isStrictAdmin) {
        return <DiscoveryFeedView />;
      }
      return <AdminDashboardView />;
    case 'upload':
      // Wave E2: selling is open to every authenticated member (self-serve
      // wizard + concierge, both behind the mandatory Mazad approval gate).
      // Selling does NOT require the bidding membership.
      return <SellView />;
    default:
      return <DiscoveryFeedView />;
  }
}

function MaintenanceView() {
  const { maintenanceMode, language, setLanguage } = useApp();
  const isAr = language === 'ar';

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">
        {/* Logo Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#FF6B00] to-orange-400 flex items-center justify-center font-black text-white text-3xl font-mono shadow-[0_0_30px_rgba(255,107,0,0.4)]">
              M
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
            </span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-2xl font-black tracking-tight text-white uppercase font-sans">
            {isAr ? 'منصة مزاد الأردن | صيانة طارئة' : 'MAZAD JO | System Maintenance'}
          </h1>
          <p className="text-gray-400 text-sm font-medium">
            {isAr 
              ? 'تحديثات أمنية وتعديلات في البنية التحتية جارية الآن.' 
              : 'Security updates and infrastructure enhancements are currently in progress.'}
          </p>
        </div>

        {/* Message Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-sm leading-relaxed text-gray-300 shadow-xl space-y-4">
          <p className="text-center font-medium text-amber-400 font-mono">
            {isAr ? `الوقت المتوقع المتبقي: ~${maintenanceMode.expectedDuration || '1 hr'}` : `Estimated Time: ~${maintenanceMode.expectedDuration || '1 hr'}`}
          </p>
          <hr className="border-slate-800" />
          <p className={isAr ? 'text-right' : 'text-left'}>
            {isAr ? maintenanceMode.messageAr : maintenanceMode.messageEn}
          </p>
        </div>

        {/* Footer info */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <button
            onClick={() => setLanguage(isAr ? 'en' : 'ar')}
            className="text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest font-mono"
          >
            {isAr ? 'Switch to English' : 'التحويل إلى العربية'}
          </button>
          <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
            MAZAD JO CO. AMMAN, JORDAN
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Global post-win review modal host: any view (live bidding, orders, …) can open
 * it by setting reviewPromptOrderId in context — e.g. the unreviewed-order bid gate.
 */
function ReviewPromptHost() {
  const { reviewPromptOrderId, setReviewPromptOrderId, orders, currentUser, language } = useApp();
  const { auctions } = useAuctions();

  const order = reviewPromptOrderId ? orders.find(o => o.id === reviewPromptOrderId) : undefined;
  if (!order || !currentUser?.id || order.buyerId !== currentUser.id) return null;

  const vendorId = order.vendorId ?? auctions.find(a => a.id === order.auctionId)?.vendorId ?? null;

  return (
    <ReviewPrompt
      order={order}
      buyerId={currentUser.id}
      vendorId={vendorId}
      language={language}
      onClose={() => setReviewPromptOrderId(null)}
    />
  );
}

/**
 * Wave 3: app-wide "simulator is ON" strip. Rendered ONLY while simulated
 * data is actually visible (admin + master toggle ON — the same
 * canSeeSimulated gate the AppContext source filter uses), so an admin can
 * never mistake a feed with test lots for the real one. Real users never
 * satisfy the gate, so they never see it. pointer-events-none: it must never
 * block a tap, on any view. English-only — internal tool.
 */
function SimulatorOnBanner() {
  const { currentUser } = useApp();
  const [simEnabled] = useSimulatorEnabled();
  if (!canSeeSimulated(currentUser, simEnabled)) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-[200] pointer-events-none flex justify-center pb-2">
      <div className="bg-violet-600/95 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg font-mono">
        🧪 Simulator ON — test data visible
      </div>
    </div>
  );
}

function MainAppShell() {
  const { isAuthenticated, authReady, showSubscriptionPrompt, setShowSubscriptionPrompt, maintenanceMode, currentUser, setActiveView, setActiveAuctionId, activeView, featureFlags, signInRequested, dismissSignIn } = useApp();

  const isStrictAdmin = isAdminUser(currentUser);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = parseAuctionIdFromSearch(window.location.search);
    if (id) {
      setActiveAuctionId(id);
      setActiveView('live');
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 0. Boot gate: while Firebase is still restoring a persisted session
  // (onAuthStateChanged + Firestore doc load), show the loading splash rather
  // than flashing Landing/Login for a user who is actually still signed in.
  if (!authReady) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF6B00] animate-spin flex items-center justify-center font-bold text-white text-lg font-mono shadow-[0_4px_12px_rgba(255,107,0,0.3)]">
            M
          </div>
          <span className="text-xs text-gray-400 font-mono tracking-widest uppercase">Loading Mazad...</span>
        </div>
      </div>
    );
  }

  // 1. Verify Maintenance Mode
  if (maintenanceMode.enabled && !isStrictAdmin) {
    return <MaintenanceView />;
  }

  // 2. Unauthenticated (guest browsing — Whatnot/eBay pattern): the landing
  // page stays the front door for a cold visitor; once they "Enter" (or arrive
  // via an auction deep link) they get the REAL browse shell (Discover + the
  // listing/live views) read-only. Every gated action (bid / chat / save / a
  // members-only nav item) swaps this shell for the login flow — with
  // activeView/activeAuctionId latched, so after signup they land back on the
  // exact listing they were watching. The siteSettings featureFlags kill
  // switch (enableGuestBrowsing:false) restores the old login-gated behavior.
  // Reached only once authReady is true, so this is a real logged-out state.
  if (!isAuthenticated) {
    const hasDeepLink = !!parseAuctionIdFromSearch(window.location.search);
    const screen = resolveUnauthenticatedScreen({
      entered,
      hasDeepLink,
      guestBrowsingEnabled: featureFlags.enableGuestBrowsing,
      signInRequested,
      activeView,
    });

    if (screen === 'landing') {
      return (
        <div className="landing-root min-h-screen">
          <LandingView onEnter={() => setEntered(true)} />
        </div>
      );
    }

    if (screen === 'login') {
      return (
        <LoginView
          // "Continue browsing" escape hatch — only when guest browsing is on
          // (with the flag off there is nothing to go back to, exactly like today).
          onBack={
            featureFlags.enableGuestBrowsing
              ? () => {
                  dismissSignIn();
                  setEntered(true); // landing's Enter is moot mid-session
                  // Only reset the view when it was the gate (a members-only nav
                  // tap) — an action tap on a watchable listing goes back to it.
                  if (!canGuestAccessView(activeView)) setActiveView('discovery');
                }
              : undefined
          }
        />
      );
    }

    // 'browse' — the guest shell. Same DesktopFrame + view renderer as members,
    // WITHOUT the member-only overlays: no SubscriptionPromptModal (guest bid
    // taps go to signup, never the membership sheet), no OnboardingModal, no
    // ReviewPromptHost (both need a signed-in profile), no profile-completion
    // gate (guests have no profile yet — it applies only AFTER signup).
    return (
      <div className="relative min-h-screen flex flex-col w-full">
        <DesktopFrame>
          <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-white p-12 min-h-[400px] font-sans">
              <div className="w-8 h-8 rounded-xl bg-[#E85D04] animate-spin flex items-center justify-center font-bold text-white text-sm font-mono shadow-sm">
                M
              </div>
              <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-3">Loading view...</span>
            </div>
          }>
            <ActiveViewRenderer />
          </Suspense>
        </DesktopFrame>
      </div>
    );
  }

  // 2.5. Profile-completion gate (Auth/KYC Wave 2): authenticated but the
  // profile is missing name and/or city (phone signups arrive as 'User' with
  // no city; Google/FB signups have no city). Full-screen, non-dismissable —
  // the marketplace stays closed until name + city exist. The deep-link
  // capture above has already run, so activeAuctionId/activeView are latched
  // and the user lands on the captured auction right after completing.
  if (!isProfileComplete(currentUser)) {
    return (
      <div className="min-h-screen bg-white">
        <ProfileCompletionModal />
      </div>
    );
  }

  // 3. Render Desktop Outer viewport wrapper frame
  return (
    <div className="relative min-h-screen flex flex-col w-full">
      {/* Maintenance Admin Alert Bar */}
      {maintenanceMode.enabled && isStrictAdmin && (
        <div 
          onClick={() => setActiveView('admin')}
          className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-black tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer hover:bg-amber-400 transition-colors shrink-0 z-50 text-center w-full"
        >
          <span className="inline-block animate-pulse">⚠️</span>
          <span>MAINTENANCE MODE IS ACTIVE FOR PUBLIC USERS — CLICK HERE TO OPEN OPERATIONAL HEALTH CONTROL PANEL</span>
          <span className="inline-block animate-pulse">⚠️</span>
        </div>
      )}

      <DesktopFrame>
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center bg-white p-12 min-h-[400px] font-sans">
            <div className="w-8 h-8 rounded-xl bg-[#E85D04] animate-spin flex items-center justify-center font-bold text-white text-sm font-mono shadow-sm">
              M
            </div>
            <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-3">Loading view...</span>
          </div>
        }>
          <ActiveViewRenderer />
        </Suspense>

        {/* Global Subscription Prompt Modal */}
        {showSubscriptionPrompt && (
          <SubscriptionPromptModal onClose={() => setShowSubscriptionPrompt(false)} />
        )}

        {/* Global Post-win Review Prompt */}
        <ReviewPromptHost />
      </DesktopFrame>

      {/* Onboarding Flow Overlay */}
      <OnboardingModal />

      {/* Wave 3: admin-only "simulator is ON" strip across the whole app */}
      <SimulatorOnBanner />
    </div>
  );
}

export default function App() {
  return (
    // ToastProvider wraps AppProvider (it has no app-state dependency) so
    // AppContext flows can raise transient error toasts for users — the bell
    // no longer surfaces internal 'alert' errors (Wave D allowlist).
    <ToastProvider>
      <AppProvider>
      <Suspense fallback={
        <div className="min-h-screen bg-white flex items-center justify-center font-sans">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF6B00] animate-spin flex items-center justify-center font-bold text-white text-lg font-mono shadow-[0_4px_12px_rgba(255,107,0,0.3)]">
              M
            </div>
            <span className="text-xs text-gray-400 font-mono tracking-widest uppercase">Loading Mazad...</span>
          </div>
        </div>
      }>
        <MainAppShell />
      </Suspense>
      </AppProvider>
    </ToastProvider>
  );
}
