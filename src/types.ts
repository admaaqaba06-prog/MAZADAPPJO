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
  /**
   * Reserved for future seller KYC (Wave 4 groundwork) — NOT captured or
   * enforced anywhere yet. Jordanian national number (الرقم الوطني).
   */
  nationalNumber?: string;
  /** Reserved for future seller KYC — legal name as on official ID. Unenforced. */
  legalName?: string;
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
  /**
   * Reserved for future seller KYC (Wave 4 groundwork) — NOT captured or
   * enforced anywhere yet. Jordanian national number (الرقم الوطني).
   */
  nationalNumber?: string;
  /** Reserved for future seller KYC — legal name as on official ID. Unenforced. */
  legalName?: string;
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
  /**
   * Wave 2 (media gallery): ordered extra gallery images (excludes the video).
   * Rendered after videoUrl + thumbnailUrl — see utils/auctionMedia.ts.
   */
  mediaUrls?: string[];
  endTime: number; // Unix timestamp
  duration: number; // in seconds
  sellerId: string;
  sellerName: string;
  sellerLogo: string;
  status: 'upcoming' | 'live' | 'processing' | 'rejected' | 'completed' | 'ended' | 'reserve_not_met';
  /** Mazad review gate verdict ('processing' listings are 'pending'). */
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  /** Admin-entered reason shown to the seller when a listing is rejected. */
  rejectionReason?: string;
  isFeatured: boolean;
  totalBids: number;
  viewersCount: number;
  caption?: string;
  marketPrice?: number; // retail/market reference for the "you saved X" reveal
  /** Sequential internal auction number assigned at create from the atomic counter. */
  auctionNumber?: number;
  /**
   * Reserve gate: true when there is no reserve OR the price has reached it.
   * The reserve AMOUNT never lives on this (world-readable) doc — only this boolean.
   * Maintained by onBidCreated; authoritative sale decision re-checks in settleAuctionTxn.
   */
  reserveMet?: boolean;
  channel?: 'phones' | 'cars' | 'misc';
  scheduledStartAt?: number | null;
  /** Internal vendor tracking (set in drop-builder, never shown to buyers in v1). */
  vendorId?: string | null;
  vendorName?: string;
  /**
   * Concierge submission ("Let Mazad list it for me"): the seller sent item
   * details and the Mazad team completes the listing before approving.
   * a.k.a. listedByMazad — the admin queue badges these. Default false.
   */
  isConcierge?: boolean;
  /**
   * Wave 4 (seller-KYC groundwork): seller checked the required listing-time
   * "I own this item and it is legal to sell in Jordan" attestation.
   * createListing stamps both onto every auction doc it writes.
   */
  ownershipAttested?: boolean;
  /** Firestore serverTimestamp of when the ownership/legality attestation was made. */
  attestedAt?: any;
  /** Seller-declared item condition (concierge submit form). */
  condition?: 'new' | 'used';
  /** Seller contact (phone/WhatsApp) for the concierge team to follow up. */
  conciergeContact?: string;
  /** Extra concierge photos beyond the thumbnail (up to 2 more). */
  conciergePhotos?: string[];
  /**
   * Wave 3 (simulator): created by the admin auction simulator. NEVER shown to
   * real users; admins see it only while the simulator toggle is ON. Enforced
   * client-side by utils/simVisibility at the AppContext source.
   */
  isSimulated?: boolean;
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
  /** Simulator-created (bid bot) — see AuctionItem.isSimulated. */
  isSimulated?: boolean;
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
  status: "waiting_payment" | "paid" | "preparing_shipment" | "shipped" | "delivered" | "completed" | "disputed" | "cancelled" | "refunded" | "defaulted";
  paymentStatus: "unpaid" | "paid";
  shippingStatus: "not_started" | "preparing" | "shipped" | "delivered";
  escrowStatus: "pending" | "released" | "refunded";
  createdAt: any;
  updatedAt: any;
  // Money model (set by Cloud Functions on order creation):
  // winner pays totalDue = winningBidAmount + 5% buyer's premium via CliQ
  // bank transfer within paymentDeadlineAt (24h), then uploads a receipt.
  buyersPremium?: number;
  totalDue?: number;
  paymentDeadlineAt?: any;
  paymentProofUrl?: string;
  trackingNumber?: string;
  defaultedAt?: any;
  /** Internal vendor slug copied from the auction (never buyer-facing). */
  vendorId?: string | null;
  /** Simulator-created (simulateSettleNow) — see AuctionItem.isSimulated. */
  isSimulated?: boolean;
}

/**
 * Order-level review (v1 investment loop).
 * Two directions share the `reviews` collection:
 *  - buyer_rates_auction: buyer rates their won auction (buyerId == author uid, per firestore.rules)
 *  - mazad_rates_buyer:   admin one-tap buyer trust rating (buyerId = the rated buyer, ratedBy = admin uid)
 */
export interface OrderReview {
  id: string;
  orderId: string;
  auctionId: string;
  buyerId: string;
  stars: number;
  text: string;
  direction: 'buyer_rates_auction' | 'mazad_rates_buyer';
  vendorId?: string | null;
  ratedBy?: string;
  createdAt: any;
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


