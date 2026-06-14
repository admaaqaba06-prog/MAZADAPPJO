import { useApp } from '../../context/AppContext';

export function useAuth() {
  const { currentUser, wallet } = useApp();
  
  // Return a computed user profile that perfectly matches the fields checked by AuctionCard
  const mappedUser = currentUser ? {
    id: currentUser.id,
    fullName: currentUser.name,
    membershipStatus: currentUser.subscriptionStatus === 'active' ? 'Active' : 'Expired',
    availableBalance: wallet.availableBalance,
    walletBalance: wallet.totalBalance,
  } : null;

  return {
    user: mappedUser
  };
}
