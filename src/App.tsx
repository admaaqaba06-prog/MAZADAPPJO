import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { DesktopFrame } from './components/DesktopFrame';
import { DiscoveryFeedView } from './components/DiscoveryFeedView';
import { LiveStreamView } from './components/LiveStreamView';
import { WalletView } from './components/WalletView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { ListingWizardView } from './components/ListingWizardView';
import { LoginView } from './components/LoginView';
import { SubscriptionView } from './components/SubscriptionView';

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
  const { isAuthenticated, currentUser } = useApp();

  // 1. Verify Authentication Status
  if (!isAuthenticated) {
    return <LoginView />;
  }

  // 2. Verify Active Subscription Paywall Status (Admins are immune)
  if (currentUser?.subscriptionStatus !== 'active' && currentUser?.role !== 'admin') {
    return <SubscriptionView />;
  }

  // 3. Render Desktop Outer viewport wrapper frame
  return (
    <DesktopFrame>
      <ActiveViewRenderer />
    </DesktopFrame>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppShell />
    </AppProvider>
  );
}
