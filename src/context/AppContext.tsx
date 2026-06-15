import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/firebase';
import { doc, setDoc, onSnapshot, collection, addDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { 
  User, SellerProfile, AuctionItem, Bid, Wallet, 
  EscrowTransaction, ChatMessage, Notification, AdminAction 
} from '../types';

interface AppContextProps {
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  sellerProfile: SellerProfile | null;
  setSellerProfile: React.Dispatch<React.SetStateAction<SellerProfile | null>>;
  
  // Lists
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  sellerProfiles: SellerProfile[];
  setSellerProfiles: React.Dispatch<React.SetStateAction<SellerProfile[]>>;
  auctions: AuctionItem[];
  setAuctions: React.Dispatch<React.SetStateAction<AuctionItem[]>>;
  bids: Bid[];
  setBids: React.Dispatch<React.SetStateAction<Bid[]>>;
  wallet: Wallet;
  setWallet: React.Dispatch<React.SetStateAction<Wallet>>;
  escrows: EscrowTransaction[];
  setEscrows: React.Dispatch<React.SetStateAction<EscrowTransaction[]>>;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  adminActions: AdminAction[];
  setAdminActions: React.Dispatch<React.SetStateAction<AdminAction[]>>;

  // Active View State
  activeAuctionId: string | null;
  setActiveAuctionId: (id: string | null) => void;
  activeView: 'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about';
  setActiveView: (view: 'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about') => void;

  // Real-time Event Actions
  placeBid: (auctionId: string, amount: number) => { success: boolean; message: string };
  triggerCliQTopUp: (amount: number, alias: string, receiptName: string) => void;
  addNotification: (title: string, description: string, type: Notification['type']) => void;
  
  // Admin Operations
  approveListing: (id: string) => void;
  rejectListing: (id: string) => void;
  verifySeller: (userId: string) => void;
  banUser: (userId: string) => void;
  unbanUser: (userId: string) => void;
  releaseEscrow: (escrowId: string) => void;
  refundEscrow: (escrowId: string) => void;
  
  // Seller Listing Creation
  createListing: (
    listingData: Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>,
    videoFile?: File | Blob | null
  ) => void;
  
  // Custom WebSocket Sim control
  isSimulating: boolean;
  setIsSimulating: React.Dispatch<React.SetStateAction<boolean>>;

  // AUTH & MULTILINGUAL & SUBSCRIPTION ADDITIONS
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => { success: boolean; message: string };
  loginWithGoogle: () => void;
  logout: () => void;
  registerUser: (name: string, email: string) => { success: boolean; message: string };
  subscribeUser: (jd: number, paymentProofImage?: string, transferFullName?: string, transferPhone?: string) => void;

  // Watch list & Auto-bid attributes
  watchlist: string[];
  toggleWatchlist: (auctionId: string) => void;
  autoBids: { [auctionId: string]: number };
  setAutoBid: (auctionId: string, maxBid: number) => void;
  removeAutoBid: (auctionId: string) => void;

  // Subscription Renewal Prompt
  showSubscriptionPrompt: boolean;
  setShowSubscriptionPrompt: (show: boolean) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

// Initial Sample Data (Luxury Jordan-centric vibe)
const INITIAL_USERS: User[] = [
  {
    id: 'user-current',
    name: 'Tareq Al-Masri',
    email: 'tareq@masri.jo',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    role: 'user',
    isVerified: true,
    isBlocked: false,
    phoneNumber: '+962 7 9888 1234',
    city: 'Amman',
    subscriptionStatus: 'active',
    subscriptionExpiry: '2026-12-31'
  },
  {
    id: 'user-zain',
    name: 'Zain Al-Fayez',
    email: 'zain@fayez.corp',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    role: 'user',
    isVerified: true,
    isBlocked: false,
    phoneNumber: '+962 7 9111 2222',
    city: 'Amman',
    subscriptionStatus: 'active',
    subscriptionExpiry: '2027-01-15'
  },
  {
    id: 'user-ramy',
    name: 'Ramy Haddad',
    email: 'ramy@haddad.me',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    role: 'user',
    isVerified: false,
    isBlocked: false,
    phoneNumber: '+962 7 8333 4444',
    city: 'Aqaba',
    subscriptionStatus: 'none',
  },
  {
    id: 'user-nour',
    name: 'Nour El-Din',
    email: 'nour@nour.tech',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    role: 'user',
    isVerified: true,
    isBlocked: true, // Blocked user demonstration
    phoneNumber: '+962 7 7555 6666',
    city: 'Irbid',
    subscriptionStatus: 'expired',
  }
];

const INITIAL_SELLERS: SellerProfile[] = [
  {
    id: 'seller-zain-profile',
    userId: 'user-zain',
    storeName: 'Zain Luxury Boutique',
    storeLogo: 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
    bio: 'Direct importer of ultra-premium watches, design luxury collectibles, and top-tier limited edition streetwear in Amman.',
    rating: 4.9,
    totalSales: 142,
    isVerifiedMerchant: true,
    joinedDate: '2025-05-10'
  },
  {
    id: 'seller-ramy-profile',
    userId: 'user-ramy',
    storeName: 'Haddad Auto Club & Tech',
    storeLogo: 'https://images.unsplash.com/photo-1549399542-7eed3385d6de?auto=format&fit=crop&w=150&q=80',
    bio: 'Curator of collectible high-performance vehicles, bespoke tech assemblies, and elite gadgetry in Jordan.',
    rating: 4.2,
    totalSales: 19,
    isVerifiedMerchant: false, // For merchant approval demonstration
    joinedDate: '2026-03-01'
  }
];

const INITIAL_AUCTIONS: AuctionItem[] = [
  {
    id: 'auction-rolex',
    title: 'Rolex Cosmograph Daytona - Black Oyster',
    description: 'Breathtaking 18ct white gold Rolex Daytona under original manufacturer warranty. Features highly coveted black dial with chromatic sub-dials. Flawless ceramic cerachrom bezel. Certified 2025 stamp, complete set of matching box and papers.',
    category: 'Luxury',
    startingPrice: 18500,
    currentPrice: 20200,
    minIncrement: 100,
    currentBidderId: 'user-zain',
    currentBidderName: 'Zain Al-Fayez',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=500&q=80',
    endTime: Date.now() + 450 * 1000, // 7.5 minutes from now
    duration: 600,
    sellerId: 'seller-zain-profile',
    sellerName: 'Zain Luxury Boutique',
    sellerLogo: 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
    status: 'live',
    isFeatured: true,
    totalBids: 18,
    viewersCount: 247
  },
  {
    id: 'auction-macbook',
    title: 'Custom Stealth M4 Pro MacBook Workstation',
    description: 'Pre-production ultra-spec MacBook Pro. Features 16-Core CPU, 40-Core GPU, 128GB Unified Memory, and a bespoke matte carbon anodized chassis. Certified pre-release unit directly sourced for technophile elites.',
    category: 'Electronics',
    startingPrice: 3200,
    currentPrice: 3750,
    minIncrement: 50,
    currentBidderId: null,
    currentBidderName: null,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=500&q=80',
    endTime: Date.now() + 1800 * 1000, // 30 minutes from now
    duration: 3600,
    sellerId: 'seller-zain-profile',
    sellerName: 'Zain Luxury Boutique',
    sellerLogo: 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
    status: 'live',
    isFeatured: false,
    totalBids: 9,
    viewersCount: 89
  },
  {
    id: 'auction-porsche',
    title: 'Porsche 911 GT3 RS (992) Allocation Slot',
    description: 'Fully customizable Jordan dealer allocation slot for the mythical 992 GT3 RS. Includes complete bespoke PTS (Paint to Sample) configuration clearance. Escrow lock on first bid required.',
    category: 'Vehicles',
    startingPrice: 120000,
    currentPrice: 125000,
    minIncrement: 1000,
    currentBidderId: null,
    currentBidderName: null,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=500&q=80',
    endTime: Date.now() + 7200 * 1000, // 2 hours
    duration: 7200,
    sellerId: 'seller-ramy-profile',
    sellerName: 'Haddad Auto Club',
    sellerLogo: 'https://images.unsplash.com/photo-1549399542-7eed3385d6de?auto=format&fit=crop&w=150&q=80',
    status: 'live',
    isFeatured: true,
    totalBids: 5,
    viewersCount: 421
  },
  {
    id: 'auction-villa',
    title: 'Dabouq Contemporary Smart-Penthouse',
    description: 'High-concept architecture facing Jordan’s most prestigious hill. Panoramic sky deck, intelligent glass facade, bespoke biometric vault, and private security grid. 100% verified legal papers.',
    category: 'Real Estate',
    startingPrice: 420000,
    currentPrice: 420000,
    minIncrement: 5000,
    currentBidderId: null,
    currentBidderName: null,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=500&q=80',
    endTime: Date.now() + 86400 * 1000, // 24 hours
    duration: 86400,
    sellerId: 'seller-ramy-profile',
    sellerName: 'Haddad Auto Club',
    sellerLogo: 'https://images.unsplash.com/photo-1549399542-7eed3385d6de?auto=format&fit=crop&w=150&q=80',
    status: 'upcoming',
    isFeatured: false,
    totalBids: 0,
    viewersCount: 15
  },
  {
    id: 'auction-jacket',
    title: 'Vintage Amiri Hand-Painted Silk Bomber',
    description: 'Extremely rare artisan runway custom bomber in pure heavyweight Italian mulberry silk. Intricate hand-painted Jordan desert-falcon design. Worn once by a global designer star at Amman Fashion Week.',
    category: 'Fashion',
    startingPrice: 1200,
    currentPrice: 1450,
    minIncrement: 50,
    currentBidderId: 'user-current',
    currentBidderName: 'Tareq Al-Masri',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=500&q=80',
    endTime: Date.now() + 15 * 60 * 1000, // 15 mins
    duration: 3600,
    sellerId: 'seller-zain-profile',
    sellerName: 'Zain Luxury Boutique',
    sellerLogo: 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
    status: 'live',
    isFeatured: false,
    totalBids: 12,
    viewersCount: 104
  }
];

const INITIAL_CHATS: ChatMessage[] = [
  {
    id: 'chat-1',
    auctionId: 'auction-rolex',
    userId: 'user-zain',
    userName: 'Zain Al-Fayez',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    text: 'A clean bezel, no micro-scratches. Inspected personally in Switzerland.',
    timestamp: Date.now() - 600000,
    isSystem: false,
    isBid: false
  },
  {
    id: 'chat-2',
    auctionId: 'auction-rolex',
    userId: 'system',
    userName: 'MAZAD ESCROW',
    userAvatar: '',
    text: '🔒 Bidding is backed by 100% active CLIQ Escrow. Funds are pre-authorized on bid.',
    timestamp: Date.now() - 400000,
    isSystem: true,
    isBid: false
  },
  {
    id: 'chat-3',
    auctionId: 'auction-rolex',
    userId: 'user-ramy',
    userName: 'Ramy Haddad',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    text: 'Is dynamic shipping insured to Aqaba?',
    timestamp: Date.now() - 300000,
    isSystem: false,
    isBid: false
  },
  {
    id: 'chat-4',
    auctionId: 'auction-rolex',
    userId: 'user-zain',
    userName: 'Zain Luxury Boutique',
    userAvatar: 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
    text: 'Yes! Platinum DHL delivery with secure armoured lock box included.',
    timestamp: Date.now() - 250000,
    isSystem: false,
    isBid: false
  },
  {
    id: 'chat-role-bid',
    auctionId: 'auction-rolex',
    userId: 'user-zain',
    userName: 'Zain Al-Fayez',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    text: 'placed a winning bid of 20,200 JOD',
    timestamp: Date.now() - 100000,
    isSystem: false,
    isBid: true,
    bidAmount: 20200
  }
];

const INITIAL_ESCROWS: EscrowTransaction[] = [
  {
    id: 'escrow-dep-zain-1',
    walletId: 'wallet-zain',
    auctionId: 'cliq-dep',
    auctionTitle: 'CliQ Deposit (Zain Al-Fayez)',
    bidderId: 'user-zain',
    bidderName: 'Zain Al-Fayez',
    sellerId: 'system',
    sellerName: 'MAZADJOM CliQ Gateway',
    amount: 25000,
    status: 'released',
    timestamp: Date.now() - 172800000,
    paymentProofUrl: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=150&q=80',
    cliqAlias: 'zain.fayez@cliq'
  },
  {
    id: 'escrow-dep-ramy-1',
    walletId: 'wallet-ramy',
    auctionId: 'cliq-dep',
    auctionTitle: 'CliQ Deposit (Ramy Haddad)',
    bidderId: 'user-ramy',
    bidderName: 'Ramy Haddad',
    sellerId: 'system',
    sellerName: 'MAZADJOM CliQ Gateway',
    amount: 1500,
    status: 'released',
    timestamp: Date.now() - 86400000,
    paymentProofUrl: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=150&q=80',
    cliqAlias: 'ramy.h@cliq'
  },
  {
    id: 'escrow-dep-nour-1',
    walletId: 'wallet-nour',
    auctionId: 'cliq-dep',
    auctionTitle: 'CliQ Deposit (Nour El-Din)',
    bidderId: 'user-nour',
    bidderName: 'Nour El-Din',
    sellerId: 'system',
    sellerName: 'MAZADJOM CliQ Gateway',
    amount: 850,
    status: 'locked',
    timestamp: Date.now() - 600000,
    paymentProofUrl: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=150&q=80',
    cliqAlias: 'nour.tech@cliq'
  },
  {
    id: 'escrow-sub-zain',
    walletId: 'wallet-zain',
    auctionId: 'cliq-sub',
    auctionTitle: 'Silver Auction Pass Activation (CliQ MAZADJOM)',
    bidderId: 'user-zain',
    bidderName: 'Zain Al-Fayez',
    sellerId: 'system',
    sellerName: 'MAZADJOM Registration',
    amount: 100,
    status: 'released',
    timestamp: Date.now() - 250000000
  },
  {
    id: 'escrow-sub-tareq',
    walletId: 'wallet-current',
    auctionId: 'cliq-sub',
    auctionTitle: 'Silver Auction Pass Activation (CliQ MAZADJOM)',
    bidderId: 'user-current',
    bidderName: 'Tareq Al-Masri',
    sellerId: 'system',
    sellerName: 'MAZADJOM Registration',
    amount: 100,
    status: 'released',
    timestamp: Date.now() - 150000000
  }
];

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-1',
    userId: 'user-current',
    title: 'Elite Seller Account Activated',
    description: 'Welcome to Mazad Jo. Your premium bank billing credentials have been registered.',
    type: 'verify',
    timestamp: Date.now() - 86400000,
    read: false
  }
];

const DEMO_FALLBACK_AUCTIONS: AuctionItem[] = [
  {
    id: "demo-1",
    title: "iPhone 15 Pro Max 256GB",
    currentPrice: 850,
    startingPrice: 500,
    status: "live",
    videoUrl: "",
    thumbnailUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400",
    totalBids: 12,
    endTime: Date.now() + 3600000,
    sellerName: "Tech Store JO",
    description: "iPhone 15 Pro Max 256GB with dynamic features and pristine design.",
    category: "Electronics",
    minIncrement: 10,
    currentBidderId: null,
    currentBidderName: null,
    duration: 3600,
    sellerId: "seller-tech-store",
    sellerLogo: "https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80",
    isFeatured: true,
    viewersCount: 154,
    // Add custom properties for other consumers
    imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400",
    endsAt: new Date(Date.now() + 3600000),
    createdByName: "Tech Store JO"
  } as unknown as AuctionItem,
  {
    id: "demo-2", 
    title: "Rolex Submariner",
    currentPrice: 4200,
    startingPrice: 3000,
    status: "live",
    videoUrl: "",
    thumbnailUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400",
    totalBids: 28,
    endTime: Date.now() + 7200000,
    sellerName: "Luxury JO",
    description: "Elegant Rolex Submariner luxury timepiece.",
    category: "Luxury",
    minIncrement: 50,
    currentBidderId: null,
    currentBidderName: null,
    duration: 7200,
    sellerId: "seller-luxury-jo",
    sellerLogo: "https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80",
    isFeatured: true,
    viewersCount: 288,
    // Add custom properties for other consumers
    imageUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400",
    endsAt: new Date(Date.now() + 7200000),
    createdByName: "Luxury JO"
  } as unknown as AuctionItem,
  {
    id: "demo-3",
    title: "MacBook Pro M3",
    currentPrice: 1200,
    startingPrice: 900,
    status: "live", 
    videoUrl: "",
    thumbnailUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400",
    totalBids: 7,
    endTime: Date.now() + 5400000,
    sellerName: "Apple Zone JO",
    description: "High-performance MacBook Pro with M3 processor.",
    category: "Electronics",
    minIncrement: 20,
    currentBidderId: null,
    currentBidderName: null,
    duration: 5400,
    sellerId: "seller-apple-zone",
    sellerLogo: "https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80",
    isFeatured: false,
    viewersCount: 95,
    // Add custom properties for other consumers
    imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400",
    endsAt: new Date(Date.now() + 5400000),
    createdByName: "Apple Zone JO"
  } as unknown as AuctionItem,
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Core user states
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('mazad_user_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {}
    }
    return INITIAL_USERS[0];
  });
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(INITIAL_SELLERS[0]);
  
  // Lists persistent initialization
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('mazad_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });
  const [sellerProfiles, setSellerProfiles] = useState<SellerProfile[]>(() => {
    const saved = localStorage.getItem('mazad_seller_profiles');
    return saved ? JSON.parse(saved) : INITIAL_SELLERS;
  });
  const [auctions, setAuctions] = useState<AuctionItem[]>(() => {
    const saved = localStorage.getItem('mazad_auctions');
    return saved ? JSON.parse(saved) : INITIAL_AUCTIONS;
  });
  const [bids, setBids] = useState<Bid[]>(() => {
    const saved = localStorage.getItem('mazad_bids');
    return saved ? JSON.parse(saved) : [];
  });
  const [wallet, setWallet] = useState<Wallet>(() => {
    const saved = localStorage.getItem('mazad_wallet');
    return saved ? JSON.parse(saved) : {
      userId: 'user-current',
      totalBalance: 0,
      availableBalance: 0,
      escrowBalance: 0
    };
  });
  const [escrows, setEscrows] = useState<EscrowTransaction[]>(() => {
    const saved = localStorage.getItem('mazad_escrows');
    return saved ? JSON.parse(saved) : INITIAL_ESCROWS;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('mazad_chat_messages');
    return saved ? JSON.parse(saved) : INITIAL_CHATS;
  });
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('mazad_notifications');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });
  const [adminActions, setAdminActions] = useState<AdminAction[]>(() => {
    const saved = localStorage.getItem('mazad_admin_actions');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync state changes with localStorage
  useEffect(() => {
    localStorage.setItem('mazad_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('mazad_seller_profiles', JSON.stringify(sellerProfiles));
  }, [sellerProfiles]);

  useEffect(() => {
    localStorage.setItem('mazad_auctions', JSON.stringify(auctions));
  }, [auctions]);

  useEffect(() => {
    localStorage.setItem('mazad_bids', JSON.stringify(bids));
  }, [bids]);

  useEffect(() => {
    localStorage.setItem('mazad_wallet', JSON.stringify(wallet));
  }, [wallet]);

  useEffect(() => {
    localStorage.setItem('mazad_escrows', JSON.stringify(escrows));
  }, [escrows]);

  useEffect(() => {
    localStorage.setItem('mazad_chat_messages', JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem('mazad_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('mazad_admin_actions', JSON.stringify(adminActions));
  }, [adminActions]);

  // Revive custom blob videos on load from IndexedDB (Disabled as we use permanent Firebase Storage uploads now)
  /*
  useEffect(() => {
    const reviveCustomVideos = async () => {
      let updatedAny = false;
      const revivedAuctions = await Promise.all(auctions.map(async (auction) => {
        if (auction.videoUrl && auction.videoUrl.startsWith('blob:')) {
          try {
            const { getVideoBlob } = await import('../utils/videoDb');
            const blob = await getVideoBlob(auction.id);
            if (blob) {
              const newBlobUrl = URL.createObjectURL(blob);
              updatedAny = true;
              return {
                ...auction,
                videoUrl: newBlobUrl
              };
            }
          } catch (e) {
            console.error('Failed to revive video blob:', e);
          }
        }
        return auction;
      }));

      if (updatedAny) {
        setAuctions(revivedAuctions);
      }
    };

    reviveCustomVideos();
  }, []);
  */

  // Navigation / views
  const [activeAuctionId, setActiveAuctionId] = useState<string | null>('auction-rolex');
  const [activeView, setActiveView] = useState<'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about'>('discovery');
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState<boolean>(false);

  // Watchlist & Auto-bid state hooks
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mazad_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [autoBids, setAutoBids] = useState<{ [auctionId: string]: number }>(() => {
    try {
      const saved = localStorage.getItem('mazad_autobids');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('mazad_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('mazad_autobids', JSON.stringify(autoBids));
  }, [autoBids]);

  // Simulator controls
  const [isSimulating, setIsSimulating] = useState<boolean>(true);

  // AUTH, MULTILINGUAL, & SUBSCRIPTION ADDITIONS
  const [language, setLanguageState] = useState<'en' | 'ar'>(() => {
    return (localStorage.getItem('mazad_language') as 'en' | 'ar') || 'en';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('mazad_authenticated') === 'true';
  });

  useEffect(() => {
    if (!currentUser?.id) return;
    const walletRef = doc(db, 'wallets', currentUser.id);
    getDoc(walletRef).then(snap => {
      if (!snap.exists()) {
        setDoc(walletRef, wallet).catch(e => {
          console.warn("Failed to set initial wallet on Firestore:", e);
        });
      }
    }).catch(e => {
      console.warn("Failed to fetch wallet from Firestore:", e);
    });
    const unsub = onSnapshot(walletRef, (snap) => {
      if (snap.exists()) {
        setWallet(snap.data() as typeof wallet);
      }
    }, (err) => {
      console.warn("Firestore 'wallets' subscription failure (retaining local state):", err);
    });
    return () => unsub();
  }, [currentUser?.id]);

  // Real-time auctions synchronization with Firestore and demo fallback
  useEffect(() => {
    const auctionsRefCol = collection(db, 'auctions');
    const unsub = onSnapshot(auctionsRefCol, (snap) => {
      if (snap.empty) {
        console.log("Firestore 'auctions' collection is empty. Falling back to demo auctions.");
        setAuctions(DEMO_FALLBACK_AUCTIONS);
      } else {
        const fetchedList: AuctionItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          let endTimeNum = Date.now() + 3600000;
          if (data.endTime) {
            endTimeNum = typeof data.endTime === 'number' ? data.endTime : (data.endTime.seconds ? data.endTime.seconds * 1000 : Date.parse(data.endTime));
          } else if (data.endsAt) {
            endTimeNum = typeof data.endsAt === 'number' ? data.endsAt : (data.endsAt.seconds ? data.endsAt.seconds * 1000 : Date.parse(data.endsAt));
          }
          fetchedList.push({
            id: docSnap.id,
            title: data.title || '',
            description: data.description || '',
            category: data.category || 'Luxury',
            startingPrice: data.startingPrice ?? 0,
            currentPrice: data.currentPrice ?? (data.startingPrice ?? 0),
            minIncrement: data.minIncrement ?? 10,
            currentBidderId: data.currentBidderId || null,
            currentBidderName: data.currentBidderName || null,
            videoUrl: data.videoUrl || '',
            thumbnailUrl: data.thumbnailUrl || data.imageUrl || 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=500&q=80',
            endTime: endTimeNum,
            duration: data.duration ?? 3600,
            sellerId: data.sellerId || 'seller-system',
            sellerName: data.sellerName || data.createdByName || 'Seller JO',
            sellerLogo: data.sellerLogo || 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
            status: data.status || 'live',
            isFeatured: data.isFeatured ?? false,
            totalBids: data.totalBids ?? 0,
            viewersCount: data.viewersCount ?? 15,
            ...data
          } as AuctionItem);
        });

        // Resolve video URLs asynchronously to avoid black screen and preserve IndexedDB custom videos
        import('../utils/videoDb').then(({ resolveVideoUrl }) => {
          Promise.all(fetchedList.map(async (item) => {
            const resolvedUrl = await resolveVideoUrl(item.id, item.videoUrl, item.category);
            return {
              ...item,
              videoUrl: resolvedUrl
            };
          })).then((resolvedList) => {
            setAuctions(resolvedList);
          });
        }).catch((err) => {
          console.error("Failed to import resolveVideoUrl in onSnapshot, setting raw list:", err);
          setAuctions(fetchedList);
        });
      }
    }, (err) => {
      console.warn("Firestore 'auctions' collection sync error, using demo fallbacks:", err);
      setAuctions(DEMO_FALLBACK_AUCTIONS);
    });
    return () => unsub();
  }, []);

  // Keep latest states in refs to completely avoid interval reset
  const auctionsRef = useRef(auctions);
  const escrowsRef = useRef(escrows);
  const walletRef = useRef(wallet);
  const activeAuctionIdRef = useRef(activeAuctionId);

  useEffect(() => {
    auctionsRef.current = auctions;
  }, [auctions]);

  useEffect(() => {
    escrowsRef.current = escrows;
  }, [escrows]);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    activeAuctionIdRef.current = activeAuctionId;
  }, [activeAuctionId]);

  const setLanguage = useCallback((lang: 'en' | 'ar') => {
    setLanguageState(lang);
    localStorage.setItem('mazad_language', lang);
  }, []);

  const login = useCallback((email: string, pass: string) => {
    const matched = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (matched) {
      setCurrentUser(matched);
      setIsAuthenticated(true);
      localStorage.setItem('mazad_user_session', JSON.stringify(matched));
      localStorage.setItem('mazad_authenticated', 'true');
      return { success: true, message: 'Logged in successfully!' };
    } else {
      const cleanName = email.split('@')[0];
      const newUser: User = {
        id: `user-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        email: email,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        role: email.toLowerCase().includes('admin') ? 'admin' : 'user',
        isVerified: true,
        isBlocked: false,
        subscriptionStatus: 'none', // Block initially unless pre-subscribed user
      };
      setUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
      setIsAuthenticated(true);
      localStorage.setItem('mazad_user_session', JSON.stringify(newUser));
      localStorage.setItem('mazad_authenticated', 'true');
      return { success: true, message: 'New user account created & logged in!' };
    }
  }, [users]);

  const loginWithGoogle = useCallback(() => {
    const googleUser: User = {
      id: `google-user-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: 'Google User',
      email: 'gmail-oauth@google.com',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
      role: 'user',
      isVerified: true,
      isBlocked: false,
      subscriptionStatus: 'none',
    };
    setUsers(prev => [...prev, googleUser]);
    setCurrentUser(googleUser);
    setIsAuthenticated(true);
    localStorage.setItem('mazad_user_session', JSON.stringify(googleUser));
    localStorage.setItem('mazad_authenticated', 'true');
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    localStorage.removeItem('mazad_authenticated');
    localStorage.removeItem('mazad_user_session');
  }, []);

  const registerUser = useCallback((name: string, email: string) => {
    const newUser: User = {
      id: `user-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: name,
      email: email,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      role: email.toLowerCase().includes('admin') ? 'admin' : 'user',
      isVerified: true,
      isBlocked: false,
      subscriptionStatus: 'none',
    };
    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    setIsAuthenticated(true);
    localStorage.setItem('mazad_user_session', JSON.stringify(newUser));
    localStorage.setItem('mazad_authenticated', 'true');
    return { success: true, message: 'Account registered successfully!' };
  }, []);

  // General Notification Handler
  const addNotification = useCallback((title: string, description: string, type: Notification['type']) => {
    const newNotif: Notification = {
      id: `notif-${Date.now()}-${Math.random()}`,
      userId: 'user-current',
      title,
      description,
      type,
      timestamp: Date.now(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  }, []);

  const subscribeUser = useCallback((price: number, paymentProofImage?: string, transferFullName?: string, transferPhone?: string) => {
    setCurrentUser(prev => {
      if (!prev) return prev;
      const updated = { 
        ...prev, 
        subscriptionStatus: 'active' as const, 
        subscriptionExpiry: '2027-12-31', 
        paymentProofImage,
        transferFullName,
        transferPhone
      };
      localStorage.setItem('mazad_user_session', JSON.stringify(updated));
      return updated;
    });
    setUsers(prev => prev.map(u => {
      if (currentUser && u.id === currentUser.id) {
        return { 
          ...u, 
          subscriptionStatus: 'active' as const, 
          subscriptionExpiry: '2027-12-31', 
          paymentProofImage,
          transferFullName,
          transferPhone
        };
      }
      return u;
    }));
    setShowSubscriptionPrompt(false);
    addNotification('💳 Subscription Activated', `Thank you! Your payment of ${price} JD was processed securely via CliQ Gateway.`, 'win');
  }, [currentUser, addNotification]);

  // BIDDING ENGINE BUSINESS LOGIC (CRITICAL RULES)
  const placeBid = useCallback((auctionId: string, amount: number): { success: boolean; message: string } => {
    // 1. Double check blocking status
    if (currentUser.isBlocked) {
      return { success: false, message: '🚫 Account restricted. Bidding disabled.' };
    }
    if (currentUser.subscriptionStatus !== 'active') {
      setShowSubscriptionPrompt(true);
      return { 
        success: false, 
        message: language === 'ar' 
          ? '❌ انتهى مفعول اشتراكك! يرجى تجديد اشتراك المزاد الفضي لمواصلة المزايدة.' 
          : '🎒 Bid rejected: Active subscription pass required. Please renew your subscription to place bids.' 
      };
    }

    const auction = auctions.find(a => a.id === auctionId);
    if (!auction) {
      return { success: false, message: 'Auction listing not found.' };
    }
    if (auction.status !== 'live') {
      return { success: false, message: 'This auction is not accepting bids.' };
    }

    // Must exceed current price
    const minRequired = auction.currentPrice + (auction.totalBids > 0 ? auction.minIncrement : 0);
    if (amount < minRequired) {
      return { success: false, message: `Minimum bid of ${minRequired} JOD required.` };
    }

    // Bidder's previous bid on this auction (if any)
    const existingEscrow = escrows.find(e => e.auctionId === auctionId && e.bidderId === currentUser.id && e.status === 'locked');
    const previousCommittedAmount = existingEscrow ? existingEscrow.amount : 0;
    
    // Total budget calculation
    const incrementalDelta = amount - previousCommittedAmount;

    if (wallet.availableBalance < incrementalDelta) {
      return { 
        success: false, 
        message: `Insufficient Wallet Funds! You need ${incrementalDelta} JOD more. Top-up via CliQ instantly.` 
      };
    }

    // Dedut bid difference only, and lock funds to escrow
    setWallet(prev => {
      const newAvail = prev.availableBalance - incrementalDelta;
      const newEscrow = prev.escrowBalance + incrementalDelta;
      return {
        ...prev,
        availableBalance: newAvail,
        escrowBalance: newEscrow,
        totalBalance: newAvail + newEscrow
      };
    });

    const walletRef = doc(db, 'wallets', currentUser.id);
    setDoc(walletRef, {
      userId: currentUser.id,
      availableBalance: wallet.availableBalance - incrementalDelta,
      escrowBalance: wallet.escrowBalance + incrementalDelta,
      totalBalance: wallet.totalBalance
    }).catch(e => {
      console.warn("Firestore wallet update permission warning or error: ", e);
    });
    addDoc(collection(db, 'bids'), {
      auctionId,
      amount,
      bidderId: currentUser.id,
      bidderName: currentUser.name,
      timestamp: Date.now()
    }).catch(e => {
      console.warn("Firestore bid logging permission warning or error: ", e);
    });

    // If outbid other user: Restore their wallet (refund escrow)
    const outbidUserId = auction.currentBidderId;
    const outbidUserAmount = auction.currentPrice;
    
    // We update previous outbid bidder
    if (outbidUserId && outbidUserId !== currentUser.id) {
      // Simulate restoring their wallet if they are in our mock user base
      if (outbidUserId === 'user-current') {
        // Our current user was outbid from background (handled in background tick)
      } else {
        // Background users get refunds silently
      }

      // If we are outbidding a background user, their escrow is updated
      setEscrows(prev => prev.map(e => {
        if (e.auctionId === auctionId && e.bidderId === outbidUserId && e.status === 'locked') {
          return { ...e, status: 'refunded' as const };
        }
        return e;
      }));
    }

    // Set updated state
    setAuctions(prev => prev.map(a => {
      if (a.id === auctionId) {
        let finalEndTime = a.endTime;
        const timeRemaining = finalEndTime - Date.now();
        
        let antiSnipeTriggered = false;
        // ANTI-SNIPING RULE: If placed in the last 10 seconds, extend by 15 seconds
        if (timeRemaining > 0 && timeRemaining < 10000) {
          finalEndTime += 15000;
          antiSnipeTriggered = true;
        }

        return {
          ...a,
          currentPrice: amount,
          currentBidderId: currentUser.id,
          currentBidderName: currentUser.name,
          totalBids: a.totalBids + 1,
          endTime: finalEndTime
        };
      }
      return a;
    }));

    // Update or Create corresponding Escrow transaction
    const newEscrowTransaction: EscrowTransaction = {
      id: `escrow-${Date.now()}-${Math.random()}`,
      walletId: 'wallet-current',
      auctionId: auctionId,
      auctionTitle: auction.title,
      bidderId: currentUser.id,
      bidderName: currentUser.name,
      sellerId: auction.sellerId,
      sellerName: auction.sellerName,
      amount: amount,
      status: 'locked',
      timestamp: Date.now()
    };

    setEscrows(prev => {
      // Filter out older locked escrow for the same user on this item
      const cleanPrev = prev.filter(e => !(e.auctionId === auctionId && e.bidderId === currentUser.id && e.status === 'locked'));
      return [newEscrowTransaction, ...cleanPrev];
    });

    // Append beautiful green system Chat bid indicator
    const newBidChat: ChatMessage = {
      id: `chat-event-${Date.now()}-${Math.random()}`,
      auctionId: auctionId,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      text: `placed a winning bid of ${amount.toLocaleString()} JOD`,
      timestamp: Date.now(),
      isSystem: false,
      isBid: true,
      bidAmount: amount
    };
    setChatMessages(prev => [...prev, newBidChat]);

    // Send successful alert
    addNotification(
      '🏆 Winning Bid Placed',
      `Locked ${amount.toLocaleString()} JOD securely in Mazad Escrow for ${auction.title}`,
      'win'
    );

    return { 
      success: true, 
      message: `Successfully bid ${amount} JOD! You are currently the highest bidder.` 
    };
  }, [currentUser, auctions, escrows, wallet, addNotification]);

  // CliQ Jordanian instant receipt topup simulation
  const triggerCliQTopUp = useCallback((amount: number, alias: string, receiptName: string) => {
    // Standard mock verification transaction
    const newCliQTransaction: EscrowTransaction = {
      id: `cliq-${Date.now()}-${Math.random()}`,
      walletId: 'wallet-current',
      auctionId: 'cliq-dep',
      auctionTitle: `CliQ Fast Top-up request`,
      bidderId: currentUser.id,
      bidderName: currentUser.name,
      sellerId: 'system',
      sellerName: 'Central Reserve Bank',
      amount: amount,
      status: 'locked', // Remains locked as payment verification flow until admin manually approves
      timestamp: Date.now(),
      paymentProofUrl: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=150&q=80', // Simulated screenshot receipt preview
      cliqAlias: alias
    };
    setEscrows(prev => [newCliQTransaction, ...prev]);
    
    addNotification(
      '💸 CliQ Transfer Received',
      `Receipt upload success! Amman operations team will audit payment verification manually within 60 seconds.`,
      'verify'
    );
  }, [currentUser, addNotification]);

  // Seller registration wizard submission
  const createListing = useCallback(async (
    listingData: Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>,
    videoFile?: File | Blob | null
  ) => {
    const newListingId = `auction-new-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // ارفع الفيديو لـ Firebase Storage أولاً
    let finalVideoUrl = listingData.videoUrl;
    if (videoFile) {
      try {
        const { uploadVideoToStorage } = await import('../utils/videoDb');
        const permanentUrl = await uploadVideoToStorage(newListingId, videoFile);
        finalVideoUrl = permanentUrl;
      } catch (err) {
        console.error('Failed to upload custom video to Firebase Storage:', err);
        // Fallback to storing in IndexedDB
        try {
          const { saveVideoBlob } = await import('../utils/videoDb');
          await saveVideoBlob(newListingId, videoFile);
        } catch (idbErr) {
          console.error('IndexedDB backup storage failed:', idbErr);
        }
      }
    }

    const newListing: any = {
      ...listingData,
      id: newListingId,
      currentPrice: listingData.startingPrice,
      sellerId: currentUser?.id || 'seller-current',
      sellerName: currentUser?.name || sellerProfile?.storeName || 'Custom Merchant',
      sellerLogo: currentUser?.avatar || sellerProfile?.storeLogo || 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=150&q=80',
      status: 'processing', // Under review direct!
      isFeatured: false,
      totalBids: 0,
      viewersCount: 2,
      createdAt: new Date().getTime(),
      createdById: currentUser?.id || 'guest',
      createdByName: currentUser?.name || 'Seller JO',
      videoUrl: finalVideoUrl
    };

    // Save directly to Firestore for real-time synchronization
    const docRef = doc(db, 'auctions', newListingId);
    setDoc(docRef, newListing)
      .then(() => {
        console.log("Successfully created pending listing in Firestore:", newListingId);
      })
      .catch((err) => {
        console.error("Firestore write failure on direct listing release:", err);
      });

    setAuctions(prev => [newListing, ...prev]);
    
    if (language === 'ar') {
      addNotification(
        '📦 تم إرسال المزاد للمراجعة',
        `تم رفع "${listingData.title}" بنجاح وهو الآن (قيد المراجعة). سيقوم مدير الموقع بمراجعته وتفعيله قريباً لتبدأ المزايدة المباشرة.`,
        'info'
      );
    } else {
      addNotification(
        '📦 Auction Submitted for Review',
        `"${listingData.title}" has been successfully submitted and is now (In Review). The site manager will audit and approve it soon to go live.`,
        'info'
      );
    }
  }, [sellerProfile, currentUser, addNotification, language]);

  // --- ADMIN ACTIONS ---
  const approveListing = useCallback((id: string) => {
    // Write approval properties directly to Firestore database
    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      status: 'live',
      approvedAt: serverTimestamp(),
      approvedBy: currentUser?.id || 'admin-system',
      endTime: Date.now() + 600 * 1000 // Fresh 10 Mins live timer
    }).catch(err => {
      console.error("Firestore approve write failed:", err);
    });

    setAuctions(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, status: 'live', endTime: Date.now() + 600 * 1000 }; // Give it a fresh 10 Min live clock
      }
      return a;
    }));
    
    const targetA = auctions.find(a => a.id === id);
    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'approve_listing',
      targetId: id,
      targetName: targetA?.title || 'Unknown Item',
      adminName: currentUser?.name || 'Admin Tareq',
      timestamp: Date.now(),
      details: 'Visual stream quality & price guide certified.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [auctions, currentUser]);

  const rejectListing = useCallback((id: string) => {
    // Write reject properties directly to Firestore database
    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectedBy: currentUser?.id || 'admin-system'
    }).catch(err => {
      console.error("Firestore reject write failed:", err);
    });

    setAuctions(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, status: 'rejected' };
      }
      return a;
    }));

    const targetA = auctions.find(a => a.id === id);
    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'reject_listing',
      targetId: id,
      targetName: targetA?.title || 'Unknown Item',
      adminName: currentUser?.name || 'Admin Tareq',
      timestamp: Date.now(),
      details: 'Video did not pass alignment checks.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [auctions, currentUser]);

  const verifySeller = useCallback((userId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, isVerified: true };
      }
      return u;
    }));
    setSellerProfiles(prev => prev.map(p => {
      if (p.userId === userId) {
        return { ...p, isVerifiedMerchant: true };
      }
      return p;
    }));

    const targetU = users.find(u => u.id === userId);
    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'verify_seller',
      targetId: userId,
      targetName: targetU?.name || 'Unknown User',
      adminName: 'Admin Tareq',
      timestamp: Date.now(),
      details: 'Submited company license validated.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [users]);

  const banUser = useCallback((userId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, isBlocked: true };
      }
      return u;
    }));
    // If we blocked the active user themselves
    if (userId === currentUser.id) {
      setCurrentUser(prev => ({ ...prev, isBlocked: true }));
    }

    const targetU = users.find(u => u.id === userId);
    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'ban_user',
      targetId: userId,
      targetName: targetU?.name || 'Unknown User',
      adminName: 'Admin Tareq',
      timestamp: Date.now(),
      details: 'Banned due to bidding spam / non-payment.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [users, currentUser]);

  const unbanUser = useCallback((userId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, isBlocked: false };
      }
      return u;
    }));
    if (userId === currentUser.id) {
      setCurrentUser(prev => ({ ...prev, isBlocked: false }));
    }
  }, [currentUser]);

  // ESCROW RELEASES (CRITICAL MONEY FLOW SYSTEM)
  const releaseEscrow = useCallback((escrowId: string) => {
    setEscrows(prev => prev.map(e => {
      if (e.id === escrowId) {
        return { ...e, status: 'released' as const };
      }
      return e;
    }));

    const targetE = escrows.find(e => e.id === escrowId);
    if (!targetE) return;

    // If it was a CliQ Top-Up transfer approval, add balance to wallet!
    if (targetE.auctionId === 'cliq-dep') {
      setWallet(prev => {
        const added = targetE.amount;
        const newAvail = prev.availableBalance + added;
        return {
          ...prev,
          availableBalance: newAvail,
          totalBalance: newAvail + prev.escrowBalance
        };
      });

      addNotification(
        '💰 Wallet Capitalized!',
        `Admin approved CliQ verification. ${targetE.amount.toLocaleString()} JOD added to your active balance.`,
        'win'
      );
    } else {
      // General item buy release
      addNotification(
        '🤝 Escrow Funds Released',
        `Admin released payment to original merchant. Item shipping underway.`,
        'info'
      );
    }

    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'release_escrow',
      targetId: escrowId,
      targetName: targetE ? `Escrow: ${targetE.auctionTitle}` : 'Escrow Item',
      adminName: 'Admin Tareq',
      timestamp: Date.now(),
      details: 'Audited & validated. Transacted.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [escrows, addNotification]);

  const refundEscrow = useCallback((escrowId: string) => {
    setEscrows(prev => prev.map(e => {
      if (e.id === escrowId) {
        return { ...e, status: 'refunded' as const };
      }
      return e;
    }));

    const targetE = escrows.find(e => e.id === escrowId);
    if (!targetE) return;

    // Refund target balance
    if (targetE.bidderId === currentUser.id && targetE.auctionId !== 'cliq-dep') {
      setWallet(prev => {
        const amt = targetE.amount;
        const newEsc = prev.escrowBalance - amt;
        const newAvail = prev.availableBalance + amt;
        return {
          ...prev,
          availableBalance: newAvail,
          escrowBalance: newEsc,
          totalBalance: newAvail + newEsc
        };
      });

      addNotification(
        '🛡️ Escrow Refunded Successfully',
        `Your bid funds of ${targetE.amount.toLocaleString()} JOD have been securely returned to available wallet.`,
        'refund'
      );
    }

    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'refund_escrow',
      targetId: escrowId,
      targetName: targetE ? `Refund: ${targetE.auctionTitle}` : 'Escrow Item',
      adminName: 'Admin Tareq',
      timestamp: Date.now(),
      details: 'Bidders refunded instantly on request / rejection.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [escrows, currentUser, addNotification]);


  // =========================================================
  // AUTOMATIC OUTBID REFUND CHECKER (GUARANTEES WALLET RETURN)
  // Whenever any live auction is outbid, we refund the user's locked escrow
  // =========================================================
  useEffect(() => {
    auctions.forEach(auction => {
      if (auction.status === 'live' && auction.currentBidderId && auction.currentBidderId !== 'user-current') {
        // Look for the user's locked escrow for this specific auction
        const clientCommittedEscrow = escrows.find(
          e => e.auctionId === auction.id && e.bidderId === 'user-current' && e.status === 'locked'
        );
        if (clientCommittedEscrow) {
          const refundAmount = clientCommittedEscrow.amount;

          // 1. Mark escrow as refunded instantly
          setEscrows(prev => prev.map(e => (e.id === clientCommittedEscrow.id ? { ...e, status: 'refunded' as const } : e)));

          // 2. Refund client user's wallet
          setWallet(prev => {
            const newEsc = Math.max(0, prev.escrowBalance - refundAmount);
            const newAvail = prev.availableBalance + refundAmount;
            return {
              ...prev,
              availableBalance: newAvail,
              escrowBalance: newEsc,
              totalBalance: newAvail + newEsc
            };
          });

          // 3. Show a friendly notification about transaction safety
          addNotification(
            language === 'ar' ? '🚨 تم تجاوز عرضك! تم إرجاع المبلغ' : '🚨 Outbid! Funds Returned Secured',
            language === 'ar'
              ? `تم تجاوز عرضك على "${auction.title}" بقيمة ${auction.currentPrice.toLocaleString()} دينار. تم إرجاع مبلغك ${refundAmount.toLocaleString()} دينار فوراً إلى محفظتك.`
              : `You have been outbid on "${auction.title}" at ${auction.currentPrice.toLocaleString()} JOD. Your escrow locked funds of ${refundAmount.toLocaleString()} JOD have been instantly returned to your available wallet balance.`,
            'outbid'
          );
        }
      }
    });
  }, [auctions, escrows, language, addNotification]);


  // ==========================================
  // REAL-TIME WEBSOCKET SIMULATION WORKFLOWS
  // Spins in background - fuels immersive bid activity, viewer alerts, and random chatter
  // ==========================================
  useEffect(() => {
    if (!isSimulating) return;

    // Simulation Tick interval: Runs every 6 seconds as a stable non-resetting heartbeat!
    const interval = setInterval(() => {
      // Use ref to find the selected live auction without hook resets
      const currentActiveId = activeAuctionIdRef.current;
      const targetAuction = auctionsRef.current.find(a => a.id === (currentActiveId || 'auction-rolex'));
      if (!targetAuction || targetAuction.status !== 'live') return;

      const randomMetric = Math.floor(Math.random() * 10);
      
      // 1. Metric: Fluctuating viewer counts
      setAuctions(prev => prev.map(a => {
        if (a.id === targetAuction.id) {
          const shift = Math.floor(Math.random() * 11) - 5; // -5 to +5
          return { ...a, viewersCount: Math.max(10, a.viewersCount + shift) };
        }
        return a;
      }));

      // Names & content for simulated bidders in Jordan
      const arabBidders = [
        { name: 'Karam Amman', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80' },
        { name: 'Reem_Jabal', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80' },
        { name: 'Faisal_Fayiz', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=80' },
        { name: 'Yasmine_A', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80' },
        { name: 'Majd_Swailiq', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=100&q=80' }
      ];

      const arabChatter = [
        'Is the serial number verified on blockchain? 🔒',
        'Mashallah! Beautiful piece, very clean.',
        'Is there shipping available to North Shouna?',
        'Bid placed! Absolutely not letting this go.',
        'Wow this exceeds boutique prices but worth it.',
        'Does it include international certified warranty? 📜',
        'Insane bidding velocity is happening right now, unbelievable.',
        'Perfect luxury dealer representation. Jordan standard!',
        'Let’s take it up! 🔥',
        'Can I pay with CliQ instantly if I win?',
        'Just topped up 5k JOD. Let’s do this!'
      ];

      // 2. Chat action (60% chance)
      if (randomMetric < 6) {
        const bidderSelection = arabBidders[Math.floor(Math.random() * arabBidders.length)];
        const chatSelection = arabChatter[Math.floor(Math.random() * arabChatter.length)];
        
        const newMsg: ChatMessage = {
          id: `sim-chat-${Date.now()}-${Math.random()}`,
          auctionId: targetAuction.id,
          userId: `sim-user-${Math.random()}`,
          userName: bidderSelection.name,
          userAvatar: bidderSelection.avatar,
          text: chatSelection,
          timestamp: Date.now(),
          isSystem: false,
          isBid: false
        };
        setChatMessages(prev => [...prev, newMsg]);
      }

      // 3. Simulated Bid Action (30% chance)
      // Make background bidders try to bid higher than current price
      if (randomMetric >= 6 && randomMetric < 9) {
        // Re-read fresh state from ref
        const auditAuction = auctionsRef.current.find(a => a.id === targetAuction.id);
        if (!auditAuction || auditAuction.status !== 'live') return;

        // Auto raise bid
        const bidIncrement = auditAuction.minIncrement;
        const newBidAmt = auditAuction.currentPrice + bidIncrement;

        // Randomly picked Arab simulated bidder
        const bidder = arabBidders[Math.floor(Math.random() * arabBidders.length)];
        const mockBidderId = `sim-user-${bidder.name.replace(/\s/g, '')}`;

        // 🚨 OUTBID THE USER: Refund checking!
        // If the current highest bidder is the current client user, and we are outbidding them:
        if (auditAuction.currentBidderId === 'user-current') {
          // Find their active escrow for this auction
          const clientEscrow = escrowsRef.current.find(
            e => e.auctionId === auditAuction.id && e.bidderId === 'user-current' && e.status === 'locked'
          );
          if (clientEscrow) {
            const refundAmount = clientEscrow.amount;

            // Refund client user's wallet immediately
            setWallet(prev => {
              const newEsc = Math.max(0, prev.escrowBalance - refundAmount);
              const newAvail = prev.availableBalance + refundAmount;
              return {
                ...prev,
                availableBalance: newAvail,
                escrowBalance: newEsc,
                totalBalance: newAvail + newEsc
              };
            });

            // Mark escrow as refunded
            setEscrows(prev => prev.map(e => e.id === clientEscrow.id ? { ...e, status: 'refunded' as const } : e));

            // Outbid notification trigger
            addNotification(
              language === 'ar' ? '🚨 تم تجاوز عرضك! تم إرجاع المبلغ' : '🚨 Outbid! Funds Returned Secured',
              language === 'ar'
                ? `تم تجاوز عرضك على "${auditAuction.title}" بقيمة ${newBidAmt.toLocaleString()} دينار. تم إرجاع مبلغك ${refundAmount.toLocaleString()} دينار فوراً إلى محفظتك.`
                : `You have been outbid on "${auditAuction.title}" at ${newBidAmt.toLocaleString()} JOD. Your escrow locked funds of ${refundAmount.toLocaleString()} JOD have returned instantly to your available wallet.`,
              'outbid'
            );
          }
        }

        // Output Simulated Bid Chat
        const newBidChat: ChatMessage = {
          id: `sim-chat-bid-${Date.now()}-${Math.random()}`,
          auctionId: auditAuction.id,
          userId: mockBidderId,
          userName: bidder.name,
          userAvatar: bidder.avatar,
          text: `placed a winning bid of ${newBidAmt.toLocaleString()} JOD`,
          timestamp: Date.now(),
          isSystem: false,
          isBid: true,
          bidAmount: newBidAmt
        };
        
        setChatMessages(ch => [...ch, newBidChat]);

        // Update the auction state
        setAuctions(prev => prev.map(a => {
          if (a.id === auditAuction.id) {
            return {
              ...a,
              currentPrice: newBidAmt,
              currentBidderId: mockBidderId,
              currentBidderName: bidder.name,
              totalBids: a.totalBids + 1
            };
          }
          return a;
        }));
      }
    }, 6000); // 6 seconds is perfect and interactive!

    return () => clearInterval(interval);
  }, [isSimulating, language, addNotification]);

  // 1. Watchlist and Auto-bid callback handles
  const toggleWatchlist = useCallback((auctionId: string) => {
    setWatchlist(prev => {
      const exists = prev.includes(auctionId);
      const updated = exists ? prev.filter(id => id !== auctionId) : [...prev, auctionId];
      return updated;
    });
  }, []);

  const setAutoBid = useCallback((auctionId: string, maxBid: number) => {
    setAutoBids(prev => ({
      ...prev,
      [auctionId]: maxBid
    }));
  }, []);

  const removeAutoBid = useCallback((auctionId: string) => {
    setAutoBids(prev => {
      const copy = { ...prev };
      delete copy[auctionId];
      return copy;
    });
  }, []);

  // 2. Watch list - 5 minutes remaining alerts engine
  const notifiedEndingSoonRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const checkTimer = setInterval(() => {
      const now = Date.now();
      watchlist.forEach(id => {
        const item = auctions.find(a => a.id === id);
        if (item && item.status === 'live') {
          const diff = item.endTime - now;
          if (diff > 0 && diff <= 5 * 60 * 1000) {
            // Check if we already triggered an alert for this specific item cycle
            const alertKey = `${id}-${Math.floor(item.endTime / 60000)}`;
            if (!notifiedEndingSoonRef.current.has(alertKey)) {
              notifiedEndingSoonRef.current.add(alertKey);
              addNotification(
                language === 'ar' ? '⏳ الوقت يداهمك!' : '⏳ Watched Item Closing Soon!',
                language === 'ar'
                  ? `المزاد المتابع "${item.title}" ينتهي في أقل من 5 دقائق! قدم عرضاً الآن لتضمن الصدارة.`
                  : `Your watched item "${item.title}" ends in less than 5 minutes! Place a bid quickly!`,
                'alert'
              );
            }
          }
        }
      });
    }, 12000); // stable 12 sec check

    return () => clearInterval(checkTimer);
  }, [watchlist, auctions, addNotification, language]);

  // 3. Centralized Auto-Bid engine
  const isAutoBiddingRef = useRef<boolean>(false);
  useEffect(() => {
    if (isAutoBiddingRef.current) return;

    const triggerable = auctions.find(auction => {
      if (auction.status !== 'live') return false;
      if (auction.currentBidderId === 'user-current') return false;
      
      const maxBid = autoBids[auction.id];
      if (!maxBid) return false;

      const nextRequiredBid = auction.currentPrice + (auction.totalBids > 0 ? auction.minIncrement : 0);
      return nextRequiredBid <= maxBid;
    });

    if (triggerable) {
      isAutoBiddingRef.current = true;
      const nextBid = triggerable.currentPrice + (triggerable.totalBids > 0 ? triggerable.minIncrement : 0);
      
      const timer = setTimeout(() => {
        const res = placeBid(triggerable.id, nextBid);
        isAutoBiddingRef.current = false;
        if (res.success) {
          addNotification(
            language === 'ar' ? '🤖 نظام المزايد التلقائي' : '🤖 Auto-Bid system',
            language === 'ar'
              ? `تم تقديم مزايدة تلقائية بقيمة ${nextBid} JOD للحفاظ على صدارتك في المزاد "${triggerable.title}".`
              : `Auto-bid placed a counter-bid of ${nextBid} JOD on "${triggerable.title}" to secure your lead.`,
            'info'
          );
        }
      }, 1200);

      return () => {
        clearTimeout(timer);
        isAutoBiddingRef.current = false;
      };
    }
  }, [auctions, autoBids, placeBid, addNotification, language]);

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser,
      sellerProfile, setSellerProfile,
      users, setUsers,
      sellerProfiles, setSellerProfiles,
      auctions, setAuctions,
      bids, setBids,
      wallet, setWallet,
      escrows, setEscrows,
      chatMessages, setChatMessages,
      notifications, setNotifications,
      adminActions, setAdminActions,
      activeAuctionId, setActiveAuctionId,
      activeView, setActiveView,
      placeBid,
      triggerCliQTopUp,
      addNotification,
      approveListing,
      rejectListing,
      verifySeller,
      banUser,
      unbanUser,
      releaseEscrow,
      refundEscrow,
      createListing,
      isSimulating,
      setIsSimulating,
      language,
      setLanguage,
      isAuthenticated,
      login,
      loginWithGoogle,
      logout,
      registerUser,
      subscribeUser,
      watchlist,
      toggleWatchlist,
      autoBids,
      setAutoBid,
      removeAutoBid,
      showSubscriptionPrompt,
      setShowSubscriptionPrompt
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
