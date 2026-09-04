import { useApp } from '../../context/AppContext';
import { isActiveMember } from '../../utils/membership';
import { serverNow } from '../../utils/serverTime';

export function useAuth() {
  const { currentUser, wallet } = useApp();
  
  // Return a computed user profile that perfectly matches the fields checked by AuctionCard
  const mappedUser = currentUser ? {
    id: currentUser.id,
    fullName: currentUser.name,
    membershipStatus: isActiveMember(currentUser, serverNow()) ? 'Active' : 'Expired',
    availableBalance: wallet.availableBalance,
    walletBalance: wallet.totalBalance,
  } : null;

  return {
    user: mappedUser
  };
}
