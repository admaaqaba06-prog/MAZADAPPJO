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
      if (currentUser?.role !== 'admin') {
        return <DiscoveryFeedView />;
      }
      return <AdminDashboardView />;
    case 'upload':
      return <ListingWizardView />;
    default:
      return <DiscoveryFeedView />;
  }
}

function MainAppShell() {
  const { isAuthenticated, showSubscriptionPrompt, setShowSubscriptionPrompt } = useApp();

  // 1. Verify Authentication Status
  if (!isAuthenticated) {
    return <LoginView />;
  }

  // 3. Render Desktop Outer viewport wrapper frame
  return (
    <DesktopFrame>
      <ActiveViewRenderer />

      {/* Global Subscription Prompt Modal */}
      {showSubscriptionPrompt && (
        <SubscriptionPromptModal onClose={() => setShowSubscriptionPrompt(false)} />
      )}
    </DesktopFrame>
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
