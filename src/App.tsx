import React, { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { DesktopFrame } from './components/DesktopFrame';
import { SubscriptionPromptModal } from './components/SubscriptionPromptModal';

// Named exports require mapping to default in React's lazy
const DiscoveryFeedView = lazy(() => import('./components/DiscoveryFeedView').then(m => ({ default: m.DiscoveryFeedView })));
const LiveStreamView = lazy(() => import('./components/LiveStreamView').then(m => ({ default: m.LiveStreamView })));
const WalletView = lazy(() => import('./components/WalletView').then(m => ({ default: m.WalletView })));
const AdminDashboardView = lazy(() => import('./components/AdminDashboardView').then(m => ({ default: m.AdminDashboardView })));
const ListingWizardView = lazy(() => import('./components/ListingWizardView').then(m => ({ default: m.ListingWizardView })));
const LoginView = lazy(() => import('./components/LoginView').then(m => ({ default: m.LoginView })));
const SubscriptionView = lazy(() => import('./components/SubscriptionView').then(m => ({ default: m.SubscriptionView })));

function ActiveViewRenderer() {
  const { activeView, currentUser } = useApp();

  switch (activeView) {
    case 'discovery':
      return <DiscoveryFeedView />;
    case 'live':
      return <LiveStreamView />;
    case 'wallet':
      return <WalletView />;
    case 'admin':
      const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;
      if (!isStrictAdmin) {
        return <DiscoveryFeedView />;
      }
      return <AdminDashboardView />;
    case 'upload':
      return <ListingWizardView />;
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

function MainAppShell() {
  const { isAuthenticated, showSubscriptionPrompt, setShowSubscriptionPrompt, maintenanceMode, currentUser, setActiveView } = useApp();

  const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;

  // 1. Verify Maintenance Mode
  if (maintenanceMode.enabled && !isStrictAdmin) {
    return <MaintenanceView />;
  }

  // 2. Verify Authentication Status
  if (!isAuthenticated) {
    return <LoginView />;
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
        <ActiveViewRenderer />

        {/* Global Subscription Prompt Modal */}
        {showSubscriptionPrompt && (
          <SubscriptionPromptModal onClose={() => setShowSubscriptionPrompt(false)} />
        )}
      </DesktopFrame>
    </div>
  );
}

export default function App() {
  return (
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
  );
}
