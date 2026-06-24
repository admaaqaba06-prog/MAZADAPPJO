/**
 * Core Data Models for MAZAD JO
 * Production-ready TypeScript Interfaces
 */

export interface User {
  id: string;
  uid?: string;
  name: string;
  email: string;
  avatar: string;
  role: 'user' | 'seller' | 'admin';
  isVerified: boolean;
  isBlocked: boolean;
  phoneNumber?: string;
  phone?: string;
  city?: string;
  subscriptionStatus: 'active' | 'pending' | 'rejected' | 'expired' | 'none';
  subscriptionExpiry?: string | number | null;
  subscriptionPlan?: string;
  subscriptionTier?: string;
  subscriptionApprovedAt?: string;
  subscriptionExpiresAt?: string;
  paymentProofImage?: string;
  transferFullName?: string;
  transferPhone?: string;
  createdAt?: string;
}

export interface SellerProfile {
  id: string;
  userId: string;
  storeName: string;
  storeLogo: string;
  bio: string;
  rating: number;
  totalSales: number;
  isVerifiedMerchant: boolean;
  joinedDate: string;
}

export interface AuctionItem {
  id: string;
  title: string;
  description: string;
  category: 'Electronics' | 'Luxury' | 'Vehicles' | 'Fashion' | 'Real Estate';
  startingPrice: number;
  currentPrice: number;
  minIncrement: number;
  currentBidderId: string | null;
  currentBidderName: string | null;
  videoUrl: string;
  thumbnailUrl: string;
  endTime: number; // Unix timestamp
  duration: number; // in seconds
  sellerId: string;
  sellerName: string;
  sellerLogo: string;
  status: 'upcoming' | 'live' | 'processing' | 'rejected' | 'completed';
  isFeatured: boolean;
  totalBids: number;
  viewersCount: number;
}

export interface Bid {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  bidderAvatar: string;
  amount: number;
  timestamp: number; // Unix timestamp
  status: 'winning' | 'outbid' | 'escrowed' | 'completed' | 'refunded';
}

export interface Wallet {
  userId: string;
  totalBalance: number;
  availableBalance: number;
  escrowBalance: number;
}

export interface EscrowTransaction {
  id: string;
  walletId: string;
  auctionId: string;
  auctionTitle: string;
  bidderId: string;
  bidderName: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  status: 'locked' | 'released' | 'refunded';
  timestamp: number;
  paymentProofUrl?: string; // For CliQ receipt upload preview
  cliqAlias?: string;
}

export interface ChatMessage {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: number;
  isSystem: boolean; // System log/announcements
  isBid: boolean; // Bid announcements
  bidAmount?: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: 'info' | 'outbid' | 'win' | 'refund' | 'verify' | 'alert';
  timestamp: number;
  read: boolean;
}

export interface AdminAction {
  id: string;
  actionType: 'approve_listing' | 'reject_listing' | 'ban_user' | 'verify_seller' | 'release_escrow' | 'refund_escrow' | 'delete_auction';
  targetId: string;
  targetName: string;
  adminName: string;
  timestamp: number;
  details?: string;
}
