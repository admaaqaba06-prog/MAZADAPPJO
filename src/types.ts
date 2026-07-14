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
  isAdmin?: boolean;
  accountStatus?: 'active' | 'blocked' | string;
  isVerified: boolean;
  verificationStatus?: 'not_verified' | 'pending' | 'verified' | 'premium_verified';
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
  isSeller?: boolean;
  sellerStatus?: 'active' | 'inactive' | string;
  sellerActivatedAt?: any;
  sellerProfile?: {
    storeName: string;
    location: string;
    about: string;
    rating: number;
    completedSales: number;
  };
  onboardingCompleted?: boolean;
  shownHints?: { [key: string]: boolean };
}

export interface SellerProfile {
  id: string;
  userId: string;
  storeName: string;
  storeLogo: string;
  coverImage?: string;
  bio: string;
  rating: number; // average rating
  totalSales: number; // completed sales
  isVerifiedMerchant: boolean;
  joinedDate: string;
  location?: string;
  followers?: number;
  following?: number;
  verificationStatus: 'not_verified' | 'pending' | 'verified' | 'premium_verified';
  responseTime?: string;
  cancellationRate?: number;
  aboutSeller?: string;
  trustScore?: number;
  badges?: string[];
  isSuspended?: boolean;
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
  caption?: string;
  channel?: 'phones' | 'cars' | 'misc';
  scheduledStartAt?: number | null;
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
  pendingWithdrawalBalance?: number;
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
  type: 'info' | 'outbid' | 'win' | 'refund' | 'verify' | 'alert' | 'bid' | 'loss' | 'wallet' | 'order' | 'subscription' | 'admin';
  priority?: 'high' | 'medium' | 'low';
  timestamp: number;
  read: boolean;
  auctionId?: string;
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

export interface Order {
  id: string;
  auctionId: string;
  auctionTitle: string;
  auctionImage: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  winningBidAmount: number;
  status: "waiting_payment" | "paid" | "preparing_shipment" | "shipped" | "delivered" | "completed" | "disputed" | "cancelled" | "refunded";
  paymentStatus: "unpaid" | "paid";
  shippingStatus: "not_started" | "preparing" | "shipped" | "delivered";
  escrowStatus: "pending" | "released" | "refunded";
  createdAt: any;
  updatedAt: any;
}

export interface Review {
  id: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  buyerAvatar: string;
  rating: number;
  comment: string;
  timestamp: number;
  response?: string;
  responseAt?: number;
  auctionTitle: string;
  auctionId: string;
  photos?: string[];
}

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  method: 'bank' | 'cliq';
  status: 'pending' | 'completed' | 'rejected';
  timestamp: number;
  details: {
    bankName?: string;
    iban?: string;
    accountHolderName?: string;
    cliqAlias?: string;
    phone?: string;
  };
  referenceId: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  sellerName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedStatus: 'verified' | 'premium_verified';
  submittedAt: number;
  businessLicenseUrl?: string;
  nationalIdUrl?: string;
  idFrontUrl?: string;
  idBackUrl?: string;
  passportUrl?: string;
  notes?: string;
}

export interface SellerReport {
  id: string;
  reporterId: string;
  reporterName: string;
  sellerId: string;
  sellerName: string;
  reason: 'counterfeit' | 'wrong_desc' | 'damaged' | 'fraud' | 'other';
  description: string;
  timestamp: number;
  status: 'pending' | 'resolved';
}

export interface Dispute {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  description: string;
  photos: string[];
  videos: string[];
  sellerResponse?: string;
  sellerRespondedAt?: number;
  status: 'open' | 'resolved_refunded' | 'resolved_released';
  timestamp: number;
  resolvedAt?: number;
  resolverName?: string;
}


