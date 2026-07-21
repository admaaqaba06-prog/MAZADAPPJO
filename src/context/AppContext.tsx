import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db, auth, getCallableFunction, OperationType, handleFirestoreError } from '../services/firebase';
import { logAnalyticsEvent } from '../services/analyticsService';
import { isFirstBidDone, markFirstBidDone } from '../components/feedback/FirstBidCoach';
// Direct file import (not the feedback barrel) to avoid a circular import:
// other feedback components consume useApp from this module.
import { useToast } from '../components/feedback/Toast';
import { resolveVideoUrl } from '../utils/videoDb';
import { minNextBid } from '../utils/bidMath';
import { mapAuthError } from '../utils/authErrors';
import { serializeNav, parseNav, isModalCloseTransition, type NavNode } from '../utils/navUrl';

// Cache of resolved video URLs to prevent excessive IndexedDB reads and performance degradation during rapid real-time updates
const videoUrlCache = new Map<string, { rawUrl: string; resolvedUrl: string }>();

const getFallbackVideoUrl = (category?: string): string => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('vehicle') || cat.includes('car') || cat.includes('سيارات') || cat.includes('مركبات')) {
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';
  } else if (cat.includes('luxury') || cat.includes('watch') || cat.includes('ساعات') || cat.includes('فاخر')) {
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  } else if (cat.includes('electronic') || cat.includes('phone') || cat.includes('هواتف') || cat.includes('أجهزة')) {
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4';
  }
  return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';
};

import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, addDoc, getDoc, getDocs, serverTimestamp, updateDoc, deleteDoc, Timestamp, query, where, orderBy, limit, getDocFromServer } from 'firebase/firestore';
import { 
  User, SellerProfile, AuctionItem, Bid, Wallet, 
  EscrowTransaction, ChatMessage, Notification, AdminAction, Order,
  Review, VerificationRequest, SellerReport, Dispute, OrderReview
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
  /** True once the first auctions snapshot (or an error) has arrived for the current view. */
  auctionsLoaded: boolean;
  bids: Bid[];
  setBids: React.Dispatch<React.SetStateAction<Bid[]>>;
  wallet: Wallet;
  setWallet: React.Dispatch<React.SetStateAction<Wallet>>;
  escrows: EscrowTransaction[];
  setEscrows: React.Dispatch<React.SetStateAction<EscrowTransaction[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  adminActions: AdminAction[];
  setAdminActions: React.Dispatch<React.SetStateAction<AdminAction[]>>;
  adminActionsError?: string;

  // Trust System Lists
  reviews: Review[];
  verificationRequests: VerificationRequest[];
  sellerReports: SellerReport[];
  disputes: Dispute[];

  // Post-win review loop (Track C2)
  myReviews: OrderReview[];
  pendingReviewOrder: Order | null;
  reviewPromptOrderId: string | null;
  setReviewPromptOrderId: (id: string | null) => void;

  // Active View State
  activeAuctionId: string | null;
  setActiveAuctionId: (id: string | null) => void;
  activeView: 'discovery' | 'live' | 'wallet' | 'orders' | 'admin' | 'upload' | 'about' | 'seller-center' | 'profile' | 'drop-builder' | 'auction-drop-builder';
  setActiveView: (view: 'discovery' | 'live' | 'wallet' | 'orders' | 'admin' | 'upload' | 'about' | 'seller-center' | 'profile' | 'drop-builder' | 'auction-drop-builder') => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  globalWalletSubView: 'wallet-home' | 'add-funds' | 'withdraw' | 'transactions' | 'orders';
  setGlobalWalletSubView: (subView: 'wallet-home' | 'add-funds' | 'withdraw' | 'transactions' | 'orders') => void;
  globalSelectedOrderId: string | null;
  setGlobalSelectedOrderId: (id: string | null) => void;

  // Real-time Event Actions
  placeBid: (auctionId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  triggerCliQTopUp: (amount: number, alias: string, paymentProofUrl: string) => void;
  requestWithdrawal: (amount: number, method: string, accountDetails: any) => Promise<{ success: boolean; message: string }>;
  addNotification: (title: string, description: string, type: Notification['type'], priority?: 'high' | 'medium' | 'low', auctionId?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  
  // Admin Operations
  approveListing: (id: string) => Promise<void>;
  rejectListing: (id: string, reason?: string) => Promise<void>;
  verifySeller: (userId: string) => void;
  banUser: (userId: string) => void;
  unbanUser: (userId: string) => void;
  releaseEscrow: (escrowId: string) => void;
  refundEscrow: (escrowId: string) => void;
  deleteAuction: (id: string) => void;
  repairEndedAuctionOrder: (auctionId: string) => Promise<{ success: boolean; message: string }>;
  repairStuckEscrowsForEndedAuction: (auctionId: string) => Promise<{ success: boolean; message: string; refundedCount?: number; totalRefundedAmount?: number; keptWinnerEscrow?: boolean }>;
  approveWithdrawal: (withdrawalId: string) => Promise<{ success: boolean; message: string }>;
  rejectWithdrawal: (withdrawalId: string, reason?: string) => Promise<{ success: boolean; message: string }>;

  // Trust System Operations
  submitVerificationRequest: (
    requestedStatus: 'verified' | 'premium_verified', 
    notes?: string,
    idFrontUrl?: string,
    idBackUrl?: string,
    passportUrl?: string
  ) => Promise<{ success: boolean; message: string }>;
  submitSellerReview: (sellerId: string, auctionId: string, auctionTitle: string, rating: number, comment: string, photos?: string[]) => Promise<{ success: boolean; message: string }>;
  submitSellerReport: (sellerId: string, sellerName: string, reason: SellerReport['reason'], description: string) => Promise<{ success: boolean; message: string }>;
  submitDispute: (orderId: string, description: string, photos: string[], videos: string[]) => Promise<{ success: boolean; message: string }>;
  respondToDispute: (disputeId: string, response: string) => Promise<{ success: boolean; message: string }>;
  respondToReview: (reviewId: string, response: string) => Promise<{ success: boolean; message: string }>;
  resolveDispute: (disputeId: string, resolution: 'refund' | 'release') => Promise<{ success: boolean; message: string }>;
  approveVerificationRequest: (requestId: string) => Promise<{ success: boolean; message: string }>;
  rejectVerificationRequest: (requestId: string) => Promise<{ success: boolean; message: string }>;
  suspendSeller: (userId: string, suspend: boolean) => Promise<{ success: boolean; message: string }>;
  removeSellerBadge: (userId: string, badgeName: string) => Promise<{ success: boolean; message: string }>;
  resetSellerTrustScore: (userId: string) => Promise<{ success: boolean; message: string }>;
  
  // Seller Listing Creation
  createListing: (
    listingData: Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>,
    videoFile?: File | Blob | null,
    thumbnailFile?: File | Blob | null,
    onProgress?: (progress: number, stage: 'video' | 'thumbnail' | 'saving') => void,
    initialStatus?: string,
  ) => Promise<string>;

  // AUTH & MULTILINGUAL & SUBSCRIPTION ADDITIONS
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  registerUser: (name: string, email: string, password?: string, phone?: string) => Promise<{ success: boolean; message: string }>;
  loginWithPhone: (phoneE164: string, appVerifier: import('firebase/auth').ApplicationVerifier) => Promise<import('firebase/auth').ConfirmationResult>;
  confirmPhoneCode: (confirmation: import('firebase/auth').ConfirmationResult, code: string) => Promise<{ success: boolean; message: string }>;
  subscribeUser: (jd: number, paymentProofImage?: string, transferFullName?: string, transferPhone?: string, planId?: string) => Promise<boolean>;
  
  // Onboarding Additions
  completeOnboarding: () => Promise<void>;
  resetOnboarding: (userId?: string) => Promise<void>;
  markHintAsShown: (hintKey: string) => Promise<void>;

  // Watch list & Auto-bid attributes
  watchlist: string[];
  toggleWatchlist: (auctionId: string) => void;
  autoBids: { [auctionId: string]: number };
  setAutoBid: (auctionId: string, maxBid: number) => void;
  removeAutoBid: (auctionId: string) => void;

  // Subscription Renewal Prompt
  showSubscriptionPrompt: boolean;
  setShowSubscriptionPrompt: (show: boolean) => void;

  // Live Chat Comments System
  sendChatMessage: (text: string) => void;

  // Maintenance & Operational Flags & Health logs
  maintenanceMode: {
    enabled: boolean;
    messageAr?: string;
    messageEn?: string;
    expectedDuration?: string;
  };
  featureFlags: {
    enableLiveAuctions: boolean;
    enableSubscriptions: boolean;
    enableWallets: boolean;
    enablePushNotifications: boolean;
  };
  updateMaintenanceMode: (enabled: boolean, messageAr?: string, messageEn?: string, expectedDuration?: string) => Promise<void>;
  updateFeatureFlag: (flag: string, value: boolean) => Promise<void>;
  systemHealthLogs: any[];
  logSystemHealth: (type: 'error' | 'payment_fail' | 'bid_fail' | 'wallet_fail', title: string, details: string) => Promise<void>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

// Clean Initial Production States (No Demo/Mock Data)
const DEFAULT_UNAUTHENTICATED_USER: User = {
  id: 'unauthenticated',
  name: 'User',
  email: '',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
  role: 'user',
  isVerified: false,
  isBlocked: false,
  subscriptionStatus: 'none',
  createdAt: ''
};

const INITIAL_USERS: User[] = [];
const INITIAL_SELLERS: SellerProfile[] = [];
const INITIAL_AUCTIONS: AuctionItem[] = [];
const INITIAL_CHATS: ChatMessage[] = [];
const INITIAL_ESCROWS: EscrowTransaction[] = [];
const INITIAL_NOTIFICATIONS: Notification[] = [];

// Bell state contains PRIVATE, cross-user Firestore verdicts (incl. rejection
// reasons), so it is persisted PER-USER — never under a shared key a later
// account on the same device could read (Wave E1 review fix).
const NOTIF_STORE_PREFIX = 'mazad_notifications_';
const DISMISSED_STORE_PREFIX = 'mazad_dismissed_notif_ids_';
// Pre-fix shared keys — purged on boot and on logout.
const LEGACY_NOTIF_KEY = 'mazad_notifications';
const LEGACY_DISMISSED_KEY = 'mazad_dismissed_notif_ids';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Transient error feedback: the bell only shows the bidder-relevant
  // allowlist (Wave D), so user-facing failures must ALSO toast.
  const { showToast } = useToast();
  // Core user states
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const localCompleted = localStorage.getItem('mazad_local_onboarding_completed') === 'true';
    let localHints = {};
    try {
      const stored = localStorage.getItem('mazad_local_shown_hints');
      if (stored) localHints = JSON.parse(stored);
    } catch (_) {}
    return {
      ...DEFAULT_UNAUTHENTICATED_USER,
      onboardingCompleted: localCompleted,
      shownHints: localHints
    };
  });
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);

  // Maintenance & Operations States
  const [maintenanceMode, setMaintenanceMode] = useState({
    enabled: false,
    messageAr: 'المنصة خاضعة للصيانة المجدولة حالياً لتحديث أنظمة التشفير وحسابات الضمان بنظام كليك.',
    messageEn: 'The platform is currently undergoing scheduled maintenance to upgrade security protocols and CliQ escrow systems.',
    expectedDuration: '1 hr'
  });

  const [featureFlags, setFeatureFlags] = useState({
    enableLiveAuctions: true,
    enableSubscriptions: true,
    enableWallets: true,
    enablePushNotifications: true
  });

  const [systemHealthLogs, setSystemHealthLogs] = useState<any[]>([]);

  // Sliding window rate limiters for fraud prevention
  const lastBidTimestampRef = useRef<number>(0);
  const bidTimestampsRef = useRef<number[]>([]);
  
  // Single Session check tracking refs
  const sessionCheckInProgressRef = useRef<boolean>(false);
  const lastSessionCheckTimeRef = useRef<number>(0);
  const redirectResultProcessingRef = useRef<boolean>(true);
  
  // Lists persistent initialization
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [sellerProfiles, setSellerProfiles] = useState<SellerProfile[]>(() => {
    const saved = localStorage.getItem('mazad_seller_profiles');
    return saved ? JSON.parse(saved) : INITIAL_SELLERS;
  });
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  // Real loading signal for the first auctions fetch — replaces the old
  // synthetic 550ms skeleton delay in the Discover feed.
  const [auctionsLoaded, setAuctionsLoaded] = useState(false);
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
      escrowBalance: 0,
      pendingWithdrawalBalance: 0
    };
  });
  const [escrows, setEscrows] = useState<EscrowTransaction[]>(() => {
    const saved = localStorage.getItem('mazad_escrows');
    return saved ? JSON.parse(saved) : INITIAL_ESCROWS;
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  // The signed-in user's own order reviews (lightweight listener) + the
  // "please rate this before bidding again" modal target.
  const [myReviews, setMyReviews] = useState<OrderReview[]>([]);
  const [myReviewsLoaded, setMyReviewsLoaded] = useState(false);
  const [reviewPromptOrderId, setReviewPromptOrderId] = useState<string | null>(null);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [sellerReports, setSellerReports] = useState<SellerReport[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('mazad_chat_messages');
    return saved ? JSON.parse(saved) : INITIAL_CHATS;
  });
  // Starts empty; the signed-in user's persisted bell is loaded from the
  // uid-keyed localStorage entry once auth resolves (see effect below).
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  // Which uid the keyed bell store has been hydrated for — guards the persist
  // effect from clobbering another user's entry before hydration.
  const notifStoreUidRef = useRef<string | null>(null);
  // IDs of bell entries that were merged from the Firestore /notifications
  // collection (vs session-local addNotification). Declared here so logout()
  // can purge it on shared devices.
  const firestoreNotifIdsRef = useRef<Set<string>>(new Set());
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [adminActionsError, setAdminActionsError] = useState<string | undefined>(undefined);

  const [deletedAuctionIds, setDeletedAuctionIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mazad_deleted_auctions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isDeferredReady, setIsDeferredReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDeferredReady(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('mazad_deleted_auctions', JSON.stringify(deletedAuctionIds));
  }, [deletedAuctionIds]);

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

  // One-time purge of the pre-fix SHARED bell keys: they leaked one user's
  // private verdicts (incl. rejection reasons) to the next account on the
  // same device. Per-user persistence lives further down (uid-keyed).
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_NOTIF_KEY);
      localStorage.removeItem(LEGACY_DISMISSED_KEY);
    } catch { /* storage unavailable — nothing leaked then */ }
  }, []);

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
  //
  // Seed the initial nav node from the entry URL so a deep-link / refresh lands
  // on the right view in the FIRST render — the History-API sync effect below
  // then replaceState()s it (no phantom entry). parseNav normalizes a Firebase
  // auth-redirect callback to a neutral discovery so OAuth is never routed.
  const initialNav = parseNav(typeof window !== 'undefined' ? window.location.search : '');
  const [activeAuctionId, setActiveAuctionId] = useState<string | null>(initialNav.auctionId ?? 'auction-rolex');
  const [activeView, setActiveView] = useState<'discovery' | 'live' | 'wallet' | 'orders' | 'admin' | 'upload' | 'about' | 'seller-center' | 'profile' | 'drop-builder' | 'auction-drop-builder'>(initialNav.view);
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [globalWalletSubView, setGlobalWalletSubView] = useState<'wallet-home' | 'add-funds' | 'withdraw' | 'transactions' | 'orders'>('wallet-home');
  const [globalSelectedOrderId, setGlobalSelectedOrderId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // History-API sync layer
  // ---------------------------------------------------------------------------
  // The router is state-based (activeView / activeAuctionId + overlay flags), so
  // the browser never had more than one history entry and hardware/gesture Back
  // exited the app. This mirrors the nav node into window.history:
  //   - a real in-app navigation -> pushState (adds a Back target)
  //   - initial mount / deep-link entry -> replaceState (no phantom entry)
  //   - Back/Forward (popstate) -> apply the popped node WITHOUT re-pushing
  //
  // Overlays wired to Back (each pushes its own entry so Back closes it first
  // instead of leaving the app): post-win review prompt, subscription prompt,
  // notifications panel, and the global order-details modal.

  // Serialized search string currently reflected in the top history entry. The
  // sync effect only pushes when the derived node differs from this; the popstate
  // handler pre-sets it to the popped node so applying that node never re-pushes
  // (breaks the push<->pop loop).
  const historyNodeRef = useRef<string | null>(null);
  const historyInitRef = useRef<boolean>(false);

  const deriveNavNode = useCallback((): NavNode => {
    const node: NavNode = { view: activeView };
    if (activeView === 'live' && activeAuctionId) node.auctionId = activeAuctionId;

    // Top-most overlay (only one is meaningfully open at a time; priority order
    // is a blocking review gate, then subscription, notifications, order).
    if (reviewPromptOrderId) {
      node.modal = 'review';
      node.modalParam = { key: 'order', value: reviewPromptOrderId };
    } else if (showSubscriptionPrompt) {
      node.modal = 'subscription';
    } else if (showNotifications) {
      node.modal = 'notifications';
    } else if (globalSelectedOrderId) {
      node.modal = 'order';
      node.modalParam = { key: 'order', value: globalSelectedOrderId };
    }
    return node;
  }, [activeView, activeAuctionId, reviewPromptOrderId, showSubscriptionPrompt, showNotifications, globalSelectedOrderId]);

  // Apply a nav node coming from Back/Forward to app state. auctionId is only set
  // when present so a discovery pop doesn't nuke the live-view default.
  const applyNavNode = useCallback((node: NavNode) => {
    setActiveView(node.view);
    if (node.auctionId) setActiveAuctionId(node.auctionId);
    setShowNotifications(node.modal === 'notifications');
    setShowSubscriptionPrompt(node.modal === 'subscription');
    setReviewPromptOrderId(node.modal === 'review' ? (node.modalParam?.value ?? null) : null);
    setGlobalSelectedOrderId(node.modal === 'order' ? (node.modalParam?.value ?? null) : null);
  }, []);

  // Push/replace on real navigation (skips no-op / popstate-applied changes).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const node = deriveNavNode();
    const search = serializeNav(node);
    const prevSearch = historyNodeRef.current;
    if (prevSearch === search) return; // already in history (e.g. from a pop)
    const url = search || window.location.pathname;
    if (!historyInitRef.current) {
      // Initial mount / deep-link entry: seed the top entry, no phantom push.
      historyInitRef.current = true;
      window.history.replaceState(node, '', url);
    } else if (prevSearch !== null && isModalCloseTransition(parseNav(prevSearch), node)) {
      // A wired modal was closed by its X/close button (view/auction unchanged).
      // Collapse the modal entry in place instead of pushing a new clean one —
      // otherwise history becomes [view, modal, view'] and Back reopens the modal.
      window.history.replaceState(node, '', url);
    } else {
      // Real in-app navigation (view change, or opening a modal): add a Back target.
      window.history.pushState(node, '', url);
    }
    historyNodeRef.current = search;
  }, [deriveNavNode]);

  // Single popstate listener (mounted once). Reads the popped node from
  // event.state (fallback: parse the current URL) and applies it. Pre-setting
  // historyNodeRef guards the sync effect above from re-pushing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = (event: PopStateEvent) => {
      const raw = event.state as NavNode | null;
      const node: NavNode = raw && raw.view ? raw : parseNav(window.location.search);
      historyNodeRef.current = serializeNav(node);
      applyNavNode(node);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyNavNode]);

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

  // AUTH, MULTILINGUAL, & SUBSCRIPTION ADDITIONS
  const [language, setLanguageState] = useState<'en' | 'ar'>(() => {
    return (localStorage.getItem('mazad_language') as 'en' | 'ar') || 'ar';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // authReady gates the app boot: it flips true only once the async
  // onAuthStateChanged chain (token + Firestore doc load) has resolved in
  // EITHER direction. Until then App.tsx shows the loading splash instead of
  // flashing Login while a valid session is still restoring.
  const [authReady, setAuthReady] = useState<boolean>(false);

  // Session Heartbeat - updates lastSeen, deviceInfo, and appVersion every 5 minutes
  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.id === 'user-current') return;

    const interval = setInterval(async () => {
      try {
        const userRef = doc(db, 'users', currentUser.id);
        const dev = getDeviceInfo();
        await updateDoc(userRef, {
          lastSeen: new Date().toISOString(),
          deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
          appVersion: dev.appVersion
        });
        console.log("Session heartbeat updated for user:", currentUser.id);
      } catch (error) {
        console.error("Heartbeat error:", error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, currentUser?.id]);

  const addNotificationRef = useRef<any>(null);
  useEffect(() => {
    addNotificationRef.current = addNotification;
  });

  // Handle Auth Redirect Results (e.g. Google/Facebook redirects) on app mount
  useEffect(() => {
    const handleRedirectResultFlow = async () => {
      redirectResultProcessingRef.current = true;
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const user = result.user;
          console.log("[Auth Redirect] Redirect login success for user:", user.email);
          
          const newSessionId = generateSessionId();
          localStorage.setItem('mazad_session_id', newSessionId);
          localStorage.setItem('mazad_last_login_time', String(Date.now()));
          
          const dev = getDeviceInfo();
          const ip = await fetchIP();
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          let fbData: any = {};
          const isGoogleAdmin = user.email?.toLowerCase().trim() === 'admaaqaba06@gmail.com';
          if (!userSnap.exists()) {
            const freshUserDoc = {
              id: user.uid,
              uid: user.uid,
              name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
              email: user.email || '', // phone/email-less providers: write '' (never a fabricated email) so the users create rule passes
              avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
              role: isGoogleAdmin ? 'admin' : 'user',
              phoneNumber: user.phoneNumber || '',
              phone: user.phoneNumber || '',
              city: '',
              createdAt: new Date().toISOString(),
              sessionId: newSessionId,
              lastLoginAt: new Date().toISOString(),
              deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
              platform: dev.platform,
              browser: dev.browser,
              deviceType: dev.deviceType,
              appVersion: dev.appVersion,
              lastLoginIP: ip,
              lastSeen: new Date().toISOString()
            };
            await setDoc(userRef, freshUserDoc);
            fbData = freshUserDoc;
          } else {
            const updates = {
              sessionId: newSessionId,
              lastLoginAt: new Date().toISOString(),
              deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
              platform: dev.platform,
              browser: dev.browser,
              deviceType: dev.deviceType,
              appVersion: dev.appVersion,
              lastLoginIP: ip,
              lastSeen: new Date().toISOString()
            };
            await updateDoc(userRef, updates);
            fbData = { ...userSnap.data(), ...updates };
          }

          // Build user state object mimicking post-login steps exactly
          const idTokenResult = await user.getIdTokenResult();
          const hasAdminClaim = !!idTokenResult.claims.admin;
          const userEmail = user.email ? user.email.toLowerCase().trim() : '';
          const isAdminEmail = userEmail === 'admaaqaba06@gmail.com';
          let loadedRole: 'admin' | 'user' | 'seller' = isAdminEmail ? 'admin' : ((fbData.role === 'seller' || fbData.isSeller === true) ? 'seller' : 'user');

          const loadedUser: User = {
            id: user.uid,
            uid: user.uid,
            name: fbData.name || user.displayName || 'User',
            email: fbData.email || user.email || '',
            avatar: fbData.avatar || user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            role: loadedRole,
            isAdmin: fbData.isAdmin === true || (isAdminEmail && (hasAdminClaim || fbData.role === 'admin')),
            accountStatus: fbData.accountStatus || 'active',
            isVerified: fbData.isVerified !== undefined ? fbData.isVerified : true,
            isBlocked: fbData.isBlocked !== undefined ? fbData.isBlocked : false,
            subscriptionStatus: fbData.subscriptionStatus || 'none',
            subscriptionExpiry: fbData.subscriptionExpiry || null,
            phoneNumber: fbData.phoneNumber || '',
            phone: fbData.phone || fbData.phoneNumber || '',
            city: fbData.city || '',
            createdAt: fbData.createdAt || new Date().toISOString(),
            isSeller: fbData.isSeller || false,
            sellerStatus: fbData.sellerStatus || '',
            sellerActivatedAt: fbData.sellerActivatedAt || null,
            sellerProfile: fbData.sellerProfile || null,
            onboardingCompleted: fbData.onboardingCompleted !== undefined ? fbData.onboardingCompleted : false,
            shownHints: fbData.shownHints || {}
          };

          setCurrentUser(loadedUser);
          setIsAuthenticated(true);
          setActiveView('discovery');
          if (addNotificationRef.current) {
            addNotificationRef.current(
              language === 'ar' ? 'تسجيل الدخول' : 'Sign In',
              language === 'ar' ? 'تم تسجيل الدخول بنجاح عبر جوجل!' : 'Successfully signed in via Google!',
              'admin'
            );
          }
        }
      } catch (err) {
        console.warn("[Auth Redirect] Handle redirect result error:", err);
        // Surface via toast — the 'alert' notification below is now filtered from the
        // user bell (Wave D), so without this the sign-in failure would be silent.
        showToast({
          title: language === 'ar' ? 'فشل تسجيل الدخول' : 'Sign In Failed',
          message: language === 'ar' ? 'ما زبط تسجيل الدخول عبر جوجل أو فيسبوك — جرّب مرة ثانية.' : 'Google/Facebook sign-in failed — please try again.',
          type: 'warn',
        });
        if (addNotificationRef.current) {
          addNotificationRef.current(
            language === 'ar' ? 'فشل تسجيل الدخول' : 'Sign In Failed',
            language === 'ar' ? 'فشل تسجيل الدخول عبر جوجل أو فيسبوك.' : 'Sign-In via Google or Facebook failed.',
            'alert'
          );
        }
      } finally {
        redirectResultProcessingRef.current = false;
      }
    };
    handleRedirectResultFlow();
  }, [language]);

  // 1. Listen to Firebase Authentication Auth State changes
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Wait for redirect handler to finish resolving if active
      while (redirectResultProcessingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (firebaseUser) {
        const uid = firebaseUser.uid;
        const userRef = doc(db, 'users', uid);
        const userEmail = firebaseUser.email ? firebaseUser.email.toLowerCase().trim() : '';
        const isAdminEmail = userEmail === 'admaaqaba06@gmail.com';
        
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const hasAdminClaim = !!idTokenResult.claims.admin;
          // Admin Dashboard must appear only if:
          // (Firebase custom claim admin == true OR users/{uid}.role == "admin") WITH THE STRICT CONDITION that the email is admaaqaba06@gmail.com
          let currentRole: 'admin' | 'user' = isAdminEmail ? 'admin' : 'user';
          let isAdminField = isAdminEmail;
 
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `users/${uid}`);
          }
          
          let loadedUser: User;
          
          if (!userSnap.exists()) {
            const nameFromEmail = firebaseUser.email ? firebaseUser.email.split('@')[0] : (firebaseUser.phoneNumber || 'User');
            const capitalizedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            
            const newSessionId = generateSessionId();
            localStorage.setItem('mazad_session_id', newSessionId);
            const dev = getDeviceInfo();
            const ip = await fetchIP();

            loadedUser = {
              id: uid,
              uid: uid,
              name: firebaseUser.displayName || capitalizedName,
              email: firebaseUser.email || '',
              avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
              role: currentRole,
              isAdmin: isAdminField,
              accountStatus: 'active',
              isVerified: true,
              isBlocked: false,
              subscriptionStatus: 'none',
              subscriptionExpiry: null,
              phoneNumber: firebaseUser.phoneNumber || '',
              phone: firebaseUser.phoneNumber || '',
              city: '',
              createdAt: new Date().toISOString(),
              onboardingCompleted: false,
              shownHints: {}
            };
            try {
              await setDoc(userRef, {
                id: uid,
                uid: uid,
                name: loadedUser.name,
                email: loadedUser.email,
                avatar: loadedUser.avatar,
                role: currentRole,
                accountStatus: 'active',
                phoneNumber: firebaseUser.phoneNumber || '',
                phone: firebaseUser.phoneNumber || '',
                normalizedPhone: (firebaseUser.phoneNumber || '').replace(/\D/g, ''),
                city: '',
                createdAt: new Date().toISOString(),
                onboardingCompleted: false,
                shownHints: {},
                sessionId: newSessionId,
                lastLoginAt: new Date().toISOString(),
                deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
                platform: dev.platform,
                browser: dev.browser,
                deviceType: dev.deviceType,
                appVersion: dev.appVersion,
                lastLoginIP: ip,
                lastSeen: new Date().toISOString()
              }, { merge: true }); // (review SF1) server onUserCreated trigger also creates this doc; merge avoids clobbering server-set fields
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
            }
          } else {
            const fbData = userSnap.data();

            // SECURITY CHECK: Duplicate Session Protection
            const localSessionId = localStorage.getItem('mazad_session_id');
            const firestoreSessionId = fbData.sessionId;

            const lastLoginTime = localStorage.getItem('mazad_last_login_time');
            const lastLoginTimestamp = lastLoginTime ? parseInt(lastLoginTime, 10) : 0;
            const now = Date.now();
            const isGracePeriod = (now - lastLoginTimestamp) < 10000;

            if (isGracePeriod) {
              console.log("[Single Session Check] Skipping verification check during login grace period.");
            } else if (firestoreSessionId && localSessionId && localSessionId !== firestoreSessionId) {
              if (sessionCheckInProgressRef.current) {
                console.log("[Single Session Check] Session verification check already in progress. Skipping.");
              } else {
                const lastCheckTime = lastSessionCheckTimeRef.current;
                const timeSinceLastCheck = now - lastCheckTime;
                if (timeSinceLastCheck < 30000) {
                  console.log(`[Single Session Check] Verification check rate-limited. Skipping (last check was ${Math.round(timeSinceLastCheck / 1000)}s ago).`);
                } else {
                  console.warn("Potential session conflict detected (cache read). Verifying with server...");
                  sessionCheckInProgressRef.current = true;
                  lastSessionCheckTimeRef.current = now;

                  (async () => {
                    let freshSessionId: string | null = null;
                    try {
                      const freshSnap = await getDocFromServer(userRef);
                      if (freshSnap.exists()) {
                        freshSessionId = freshSnap.data()?.sessionId || null;
                      } else {
                        // Fail-open if server document doesn't exist
                        freshSessionId = localSessionId;
                      }
                    } catch (serverErr) {
                      console.warn("Failed to read user document from server for session verification (Fail-Open):", serverErr);
                      // Fail-Open: Ignore check for this cycle and let user proceed
                      freshSessionId = localSessionId; // simulate match to bypass logout
                    } finally {
                      sessionCheckInProgressRef.current = false;
                    }

                    if (freshSessionId && freshSessionId !== localSessionId) {
                      console.warn("Session conflict confirmed by server: local session ID", localSessionId, "does not match Firestore session ID", freshSessionId);
                      // SOFT notice: this audience hops between WhatsApp/mobile
                      // devices constantly, so we no longer force-logout on a
                      // duplicate session. Adopt the server's session id locally
                      // so the check stops re-firing every cycle, keep the user
                      // signed in on THIS device, and surface a dismissible heads-up.
                      localStorage.setItem('mazad_session_id', freshSessionId);
                      const dupTitle = language === 'ar' ? 'تنبيه' : 'Notice';
                      const dupMsg = language === 'ar' ? 'تم تسجيل دخولك من جهاز آخر' : "You're signed in on another device.";
                      if (addNotificationRef.current) {
                        addNotificationRef.current(dupTitle, dupMsg, 'admin');
                      }
                      showToast({ title: dupTitle, message: dupMsg, type: 'info' });
                    }
                  })();
                }
              }
            }

            // If local session ID is empty, generate a new one and bootstrap
            if (!localSessionId) {
              const newSessionId = generateSessionId();
              localStorage.setItem('mazad_session_id', newSessionId);
              const dev = getDeviceInfo();
              const ip = await fetchIP();
              try {
                await updateDoc(userRef, {
                  sessionId: newSessionId,
                  lastLoginAt: new Date().toISOString(),
                  deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
                  platform: dev.platform,
                  browser: dev.browser,
                  deviceType: dev.deviceType,
                  appVersion: dev.appVersion,
                  lastLoginIP: ip,
                  lastSeen: new Date().toISOString()
                });
              } catch (err) {
                console.warn("Failed to bootstrap session in firestore:", err);
              }
              fbData.sessionId = newSessionId;
            }

            let loadedRole: 'admin' | 'user' | 'seller' = isAdminEmail ? 'admin' : ((fbData.role === 'seller' || fbData.isSeller === true) ? 'seller' : 'user');
            
            if (isAdminEmail && fbData.role !== 'admin') {
              loadedRole = 'admin';
              try {
                await updateDoc(userRef, { role: 'admin', isAdmin: true });
              } catch (updateErr) {
                console.warn("Failed to automatically upgrade bootstrapped admin role in Firestore:", updateErr);
              }
            } else if (!isAdminEmail && fbData.role === 'admin' && fbData.isAdmin !== true) {
              loadedRole = 'user';
              try {
                await updateDoc(userRef, { role: 'user', isAdmin: false });
              } catch (downgradeErr) {
                console.warn("Failed to automatically downgrade unauthorized admin role in Firestore:", downgradeErr);
              }
            }
            
            loadedUser = {
              id: uid,
              uid: uid,
              name: fbData.name || firebaseUser.displayName || 'User',
              email: fbData.email || firebaseUser.email || '',
              avatar: fbData.avatar || firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
              role: loadedRole,
              isAdmin: fbData.isAdmin === true || (isAdminEmail && (hasAdminClaim || fbData.role === 'admin')),
              accountStatus: fbData.accountStatus || 'active',
              isVerified: fbData.isVerified !== undefined ? fbData.isVerified : true,
              isBlocked: fbData.isBlocked !== undefined ? fbData.isBlocked : false,
              subscriptionStatus: fbData.subscriptionStatus || 'none',
              subscriptionExpiry: fbData.subscriptionExpiry || null,
              phoneNumber: fbData.phoneNumber || '',
              phone: fbData.phone || fbData.phoneNumber || '',
              city: fbData.city || '',
              createdAt: fbData.createdAt || new Date().toISOString(),
              isSeller: fbData.isSeller || false,
              sellerStatus: fbData.sellerStatus || '',
              sellerActivatedAt: fbData.sellerActivatedAt || null,
              sellerProfile: fbData.sellerProfile || null,
              onboardingCompleted: fbData.onboardingCompleted !== undefined ? fbData.onboardingCompleted : false,
              shownHints: fbData.shownHints || {}
            };
          }
          
          setCurrentUser(loadedUser);
          setIsAuthenticated(true);
          setAuthReady(true);
        } catch (error) {
          console.error("Error setting up user profile in auth change:", error);
          const fallbackUser: User = {
            id: uid,
            uid: uid,
            name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            role: isAdminEmail ? 'admin' : 'user',
            isAdmin: isAdminEmail,
            accountStatus: 'active',
            isVerified: true,
            isBlocked: false,
            subscriptionStatus: 'none',
            subscriptionExpiry: null,
            phoneNumber: '',
            phone: '',
            city: '',
          };
          setCurrentUser(fallbackUser);
          setIsAuthenticated(true);
          // Resolve the boot gate even when the Firestore doc load failed —
          // a fallback session is still authenticated, and the splash must
          // never hang forever on an error path.
          setAuthReady(true);
        }
      } else {
        setCurrentUser(DEFAULT_UNAUTHENTICATED_USER);
        setIsAuthenticated(false);
        setAuthReady(true);
      }
    });

    return () => unsubAuth();
  }, []);

  // 1.5. Real-time site settings, maintenance mode, and feature flags syncing
  useEffect(() => {
    const maintenanceRef = doc(db, 'siteSettings', 'maintenanceMode');
    const flagsRef = doc(db, 'siteSettings', 'featureFlags');

    const unsubMaint = onSnapshot(maintenanceRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode({
          enabled: data.enabled === true,
          messageAr: data.messageAr || 'المنصة خاضعة للصيانة المجدولة حالياً لتحديث أنظمة التشفير وحسابات الضمان بنظام كليك.',
          messageEn: data.messageEn || 'The platform is currently undergoing scheduled maintenance to upgrade security protocols and CliQ escrow systems.',
          expectedDuration: data.expectedDuration || '1 hr'
        });
      } else {
        setMaintenanceMode({
          enabled: false,
          messageAr: 'المنصة خاضعة للصيانة المجدولة حالياً لتحديث أنظمة التشفير وحسابات الضمان بنظام كليك.',
          messageEn: 'The platform is currently undergoing scheduled maintenance to upgrade security protocols and CliQ escrow systems.',
          expectedDuration: '1 hr'
        });
      }
    }, (err) => {
      console.warn("Error subscribing to maintenanceMode:", err);
    });

    const unsubFlags = onSnapshot(flagsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setFeatureFlags({
          enableLiveAuctions: data.enableLiveAuctions !== false,
          enableSubscriptions: data.enableSubscriptions !== false,
          enableWallets: data.enableWallets !== false,
          enablePushNotifications: data.enablePushNotifications !== false,
        });
      } else {
        setFeatureFlags({
          enableLiveAuctions: true,
          enableSubscriptions: true,
          enableWallets: true,
          enablePushNotifications: true,
        });
      }
    }, (err) => {
      console.warn("Error subscribing to featureFlags:", err);
    });

    return () => {
      unsubMaint();
      unsubFlags();
    };
  }, []);

  // Sync System Health logs (For admins)
  useEffect(() => {
    const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' && (currentUser?.role === 'admin' || currentUser?.isAdmin === true);
    if (!isStrictAdmin) {
      setSystemHealthLogs([]);
      return;
    }

    const q = query(
      collection(db, 'system_health'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubHealth = onSnapshot(q, (snap) => {
      const logs: any[] = [];
      snap.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      setSystemHealthLogs(logs);
    }, (err) => {
      console.warn("Error subscribing to system_health logs:", err);
    });

    return () => unsubHealth();
  }, [currentUser]);

  // Sync adminActions collection in real-time (For admins)
  useEffect(() => {
    const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;
    if (!isStrictAdmin) {
      setAdminActions([]);
      setAdminActionsError(undefined);
      return;
    }

    const q = query(
      collection(db, 'adminActions'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubAdminActions = onSnapshot(q, (snap) => {
      const actions: AdminAction[] = [];
      snap.forEach((doc) => {
        actions.push({ id: doc.id, ...doc.data() } as AdminAction);
      });
      setAdminActions(actions);
      setAdminActionsError(undefined);
    }, (err) => {
      console.error("Error subscribing to adminActions logs:", err);
      setAdminActions([]);
      setAdminActionsError("Unable to load admin actions");
    });

    return () => unsubAdminActions();
  }, [currentUser]);

  // 2. Real-time synchronizations of logged-in User profile and Wallet with Firestore
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || currentUser.id === 'user-current') return;

    // A. Real-time user profile sync
    const userRef = doc(db, 'users', currentUser.id);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const fbData = snap.data();
        const mergedUser: User = {
          id: currentUser.id,
          name: fbData.name || currentUser.name,
          email: fbData.email || currentUser.email,
          avatar: fbData.avatar || currentUser.avatar,
          role: (fbData.isSeller === true || fbData.role === 'seller') ? 'seller' : (fbData.role || currentUser.role),
          isVerified: fbData.isVerified !== undefined ? fbData.isVerified : currentUser.isVerified,
          isBlocked: fbData.isBlocked !== undefined ? fbData.isBlocked : currentUser.isBlocked,
          subscriptionStatus: fbData.subscriptionStatus || currentUser.subscriptionStatus || 'none',
          subscriptionExpiry: fbData.subscriptionExpiry || currentUser.subscriptionExpiry || null,
          phoneNumber: fbData.phoneNumber || currentUser.phoneNumber || '',
          city: fbData.city || currentUser.city || '',
          isSeller: fbData.isSeller !== undefined ? fbData.isSeller : currentUser.isSeller,
          sellerStatus: fbData.sellerStatus || currentUser.sellerStatus || '',
          sellerActivatedAt: fbData.sellerActivatedAt || currentUser.sellerActivatedAt || null,
          sellerProfile: fbData.sellerProfile || currentUser.sellerProfile || null,
          // Carry admin + onboarding flags through live sync — omitting them
          // silently stripped console-granted admins and resurrected onboarding
          isAdmin: fbData.isAdmin !== undefined ? fbData.isAdmin === true : currentUser.isAdmin,
          onboardingCompleted: fbData.onboardingCompleted !== undefined ? fbData.onboardingCompleted : currentUser.onboardingCompleted,
        };
        if (JSON.stringify(mergedUser) !== JSON.stringify(currentUser)) {
          setCurrentUser(mergedUser);
        }
      }
    }, (err) => {
      console.warn("Firestore 'users' snapshot subscription error:", err);
    });

    // B. Real-time wallet sync with self-healing check and retries to avoid race conditions with Auth trigger
    const walletRef = doc(db, 'wallets', currentUser.id);
    const checkAndInitWallet = async (attempt = 1) => {
      try {
        const snap = await getDoc(walletRef);
        if (!snap.exists()) {
          if (attempt < 3) {
            // Wait 1.5 seconds and retry to let the server Auth trigger finish writing
            setTimeout(() => {
              checkAndInitWallet(attempt + 1);
            }, 1500);
          } else {
            // If still doesn't exist after retries, trigger the cloud function
            const initWalletCallable = await getCallableFunction('initializeUserWallet');
            await initWalletCallable();
            console.log("Wallet successfully initialized via Cloud Function on fallback.");
          }
        }
      } catch (e: any) {
        console.warn("Wallet init check attempt " + attempt + " failed:", e);
      }
    };
    checkAndInitWallet();

    const unsubWallet = onSnapshot(walletRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rawAvail = data.availableBalance ?? 0;
        const rawEscrow = data.escrowBalance ?? 0;
        const rawPending = data.pendingWithdrawalBalance ?? 0;
        // Divide by 1000 dynamically to convert fils (integers) to JOD (decimals) representation for the UI.
        const availableBalance = rawAvail / 1000;
        const escrowBalance = rawEscrow / 1000;
        const pendingWithdrawalBalance = rawPending / 1000;
        setWallet({
          userId: data.userId || currentUser.id,
          availableBalance,
          escrowBalance,
          pendingWithdrawalBalance,
          totalBalance: availableBalance + escrowBalance + pendingWithdrawalBalance
        });
      }
    }, (err) => {
      console.warn("Firestore 'wallets' subscription failure:", err);
    });

    return () => {
      unsubUser();
      unsubWallet();
    };
  }, [isAuthenticated, currentUser?.id]);

  // Real-time auctions synchronization with Firestore.
  //
  // PERF (Wave 4): this effect keys off a derived SUBSCRIPTION MODE, not the raw
  // activeView. The two buyer surfaces — 'discovery' and 'live' — share the exact
  // same query, so swiping between them must NOT tear down and rebuild the
  // Firestore listener (which also re-ran every video-URL resolution for all 80
  // lots). By collapsing them to a single 'buyer' mode the subscription stays
  // MOUNTED across the whole live room; the effect only re-subscribes when the
  // mode genuinely changes (buyer ↔ admin ↔ none). Because the query is chosen
  // from the stable `mode` (not the exact activeView), there is no stale-closure
  // hazard: every view inside a mode maps to the identical query.
  //
  // 'about' now renders its own HowItWorksView (Wave C) — it no longer needs
  // the auctions subscription, so it maps to 'none'.
  // 'admin' IS required ('admin' mode): the AdminDashboardView approval queue
  // (pendingListingDrops) filters this context state — without the
  // subscription the queue is always empty and the reject-with-reason
  // gate UI never renders.
  const auctionSubMode: 'buyer' | 'admin' | 'none' =
    activeView === 'discovery' || activeView === 'live'
      ? 'buyer'
      : activeView === 'seller-center' || activeView === 'drop-builder' || activeView === 'admin'
        ? 'admin'
        : 'none';

  useEffect(() => {
    if (auctionSubMode === 'none') {
      setAuctions([]);
      setAuctionsLoaded(false);
      return;
    }

    const auctionsRefCol = collection(db, 'auctions');
    let q;
    if (auctionSubMode === 'admin') {
      // In Seller Center, Drop Builder & Admin dashboard, fetch auctions of
      // EVERY status (incl. 'processing'/'rejected'/'completed') capped at 100 —
      // the admin approval queue and winners panel need the full set.
      q = query(auctionsRefCol, limit(100));
    } else {
      // On Discovery / Live views, subscribe ONLY to active/non-ended auctions
      q = query(
        auctionsRefCol,
        where('status', 'in', ['live', 'upcoming', 'processing']),
        limit(80)
      );
    }
    const unsub = onSnapshot(q, (snap) => {
      setAuctionsLoaded(true);
      if (snap.empty) {
        setAuctions([]);
      } else {
        const fetchedList: AuctionItem[] = [];
        const itemsToResolve: { id: string; rawUrl: string; category: string }[] = [];

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const parseTimestamp = (val: any): number => {
            if (!val) return Date.now() + 3600000;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
              const parsed = Date.parse(val);
              return isNaN(parsed) ? Date.now() + 3600000 : parsed;
            }
            if (typeof val.toDate === 'function') {
              return val.toDate().getTime();
            }
            if (val.seconds !== undefined) {
              return val.seconds * 1000;
            }
            return Date.now() + 3600000;
          };

          let endTimeNum = Date.now() + 3600000;
          if (data.endsAt) {
            endTimeNum = parseTimestamp(data.endsAt);
          } else if (data.endTime) {
            endTimeNum = parseTimestamp(data.endTime);
          }
          if (isNaN(endTimeNum)) {
            endTimeNum = Date.now() + 3600000;
          }
          const rawThumbnail = data.thumbnailUrl || data.imageUrl || '';
          let finalThumbnail = rawThumbnail;

          if (!rawThumbnail || rawThumbnail === '' || rawThumbnail.startsWith('blob:')) {
            const cat = (data.category || '').toLowerCase();
            const tit = (data.title || '').toLowerCase();
            if (cat.includes('elect') || tit.includes('iphone') || tit.includes('phone') || tit.includes('macbook') || tit.includes('tech') || tit.includes('workstation')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=400&q=80';
            } else if (cat.includes('watch') || tit.includes('watch') || tit.includes('rolex') || tit.includes('submariner')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80';
            } else if (cat.includes('jewel') || tit.includes('jewel') || tit.includes('diamond') || tit.includes('gold') || tit.includes('ring')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80';
            } else if (cat.includes('fash') || cat.includes('luxur') || tit.includes('jacket') || tit.includes('bag') || cat.includes('cloth')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=400&q=80';
            } else {
              finalThumbnail = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=80';
            }
          }

          const startingPrice = (data.startingPriceFils !== undefined ? data.startingPriceFils / 1000 : (data.startingPrice ?? 0));
          const currentPrice = (data.currentPriceFils !== undefined ? data.currentPriceFils / 1000 : (data.currentPrice ?? startingPrice));
          const minIncrement = (data.minIncrementFils !== undefined ? data.minIncrementFils / 1000 : (data.minIncrement ?? 10));

          const rawVideoUrl = data.videoUrl || '';
          const itemId = docSnap.id;
          let finalVideoUrl = rawVideoUrl;

          const cached = videoUrlCache.get(itemId);
          if (cached && cached.rawUrl === rawVideoUrl) {
            finalVideoUrl = cached.resolvedUrl;
          } else if (rawVideoUrl && !rawVideoUrl.startsWith('blob:')) {
            // It's a direct network URL, resolve synchronously
            finalVideoUrl = rawVideoUrl;
            videoUrlCache.set(itemId, { rawUrl: rawVideoUrl, resolvedUrl: rawVideoUrl });
          } else {
            // Use instant synchronous fallback while loading
            finalVideoUrl = getFallbackVideoUrl(data.category || 'Luxury');
            itemsToResolve.push({ id: itemId, rawUrl: rawVideoUrl, category: data.category || 'Luxury' });
          }

          const itemWithFallback = {
            id: itemId,
            title: data.title || '',
            description: data.description || '',
            category: data.category || 'Luxury',
            startingPrice,
            currentPrice,
            minIncrement,
            currentBidderId: data.currentBidderId || null,
            currentBidderName: data.currentBidderName || null,
            videoUrl: finalVideoUrl,
            endTime: endTimeNum,
            duration: data.duration ?? 3600,
            sellerId: data.sellerId || 'seller-system',
            sellerName: data.sellerName || data.createdByName || 'Seller JO',
            sellerLogo: data.sellerLogo || 'https://images.unsplash.com/photo-1581557991964-125469da3b8a?auto=format&fit=crop&w=150&q=80',
            status: data.status || 'live',
            isFeatured: data.isFeatured ?? false,
            totalBids: data.totalBids ?? 0,
            viewersCount: data.viewersCount ?? 0,
            ...data
          } as any;

          itemWithFallback.thumbnailUrl = finalThumbnail;
          itemWithFallback.imageUrl = finalThumbnail;
          fetchedList.push(itemWithFallback as AuctionItem);
        });

        // Set the auctions synchronously so viewer counts, bids and clock ticks feel butter-smooth!
        setAuctions(fetchedList);

        // Resolve unresolved or new custom blob videos in the background
        if (itemsToResolve.length > 0) {
          Promise.all(
            itemsToResolve.map(async ({ id, rawUrl, category }) => {
              const resolvedUrl = await resolveVideoUrl(id, rawUrl, category);
              videoUrlCache.set(id, { rawUrl, resolvedUrl });
              return { id, resolvedUrl };
            })
          ).then((results) => {
            // Smoothly swap fallback video URLs with the resolved custom blob URLs
            setAuctions((prev) =>
              prev.map((item) => {
                const matched = results.find((r) => r.id === item.id);
                if (matched) {
                  return { ...item, videoUrl: matched.resolvedUrl };
                }
                return item;
              })
            );
          }).catch((err) => {
            console.error("Async video resolution background task failed:", err);
          });
        }
      }
    }, (err) => {
      console.warn("Firestore 'auctions' collection sync error:", err);
      setAuctions([]);
      setAuctionsLoaded(true);
    });
    return () => unsub();
  }, [auctionSubMode]);

  // Real-time escrows synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !isDeferredReady) {
      return;
    }

    const isStrictAdmin = currentUser.email === 'admaaqaba06@gmail.com' && (currentUser.role === 'admin' || currentUser.isAdmin === true);
    if (isStrictAdmin) {
      const escrowsRefCol = collection(db, 'escrows');
      const q = query(escrowsRefCol, orderBy('timestamp', 'desc'), limit(100));
      const unsub = onSnapshot(q, (snap) => {
        const fetchedEscrows: EscrowTransaction[] = [];
        snap.forEach((docSnap) => {
          const rawData = docSnap.data();
          const amount = (rawData.amountFils !== undefined ? rawData.amountFils / 1000 : (rawData.amount ?? 0));
          fetchedEscrows.push({
            id: docSnap.id,
            ...rawData,
            amount
          } as EscrowTransaction);
        });
        fetchedEscrows.sort((a, b) => b.timestamp - a.timestamp);
        setEscrows(fetchedEscrows.length > 0 ? fetchedEscrows : INITIAL_ESCROWS);
      }, (err) => {
        console.warn("Firestore 'escrows' collection sync error:", err);
      });
      return () => unsub();
    } else {
      // Standard user: listen to escrows where bidderId == userId or sellerId == userId (limit 100)
      const bidderEscrowsQuery = query(collection(db, 'escrows'), where('bidderId', '==', currentUser.id), limit(100));
      const sellerEscrowsQuery = query(collection(db, 'escrows'), where('sellerId', '==', currentUser.id), limit(100));

      let bidderEscrows: EscrowTransaction[] = [];
      let sellerEscrows: EscrowTransaction[] = [];

      const updateMergedEscrows = () => {
        const mergedMap = new Map<string, EscrowTransaction>();
        bidderEscrows.forEach(e => mergedMap.set(e.id, e));
        sellerEscrows.forEach(e => mergedMap.set(e.id, e));
        const mergedList = Array.from(mergedMap.values());
        mergedList.sort((a, b) => b.timestamp - a.timestamp);
        setEscrows(mergedList.length > 0 ? mergedList : INITIAL_ESCROWS);
      };

      const unsubBidder = onSnapshot(bidderEscrowsQuery, (snap) => {
        const list: EscrowTransaction[] = [];
        snap.forEach((docSnap) => {
          const rawData = docSnap.data();
          const amount = (rawData.amountFils !== undefined ? rawData.amountFils / 1000 : (rawData.amount ?? 0));
          list.push({
            id: docSnap.id,
            ...rawData,
            amount
          } as EscrowTransaction);
        });
        bidderEscrows = list;
        updateMergedEscrows();
      }, (err) => {
        console.warn("Firestore 'escrows' (bidder) sync error:", err);
      });

      const unsubSeller = onSnapshot(sellerEscrowsQuery, (snap) => {
        const list: EscrowTransaction[] = [];
        snap.forEach((docSnap) => {
          const rawData = docSnap.data();
          const amount = (rawData.amountFils !== undefined ? rawData.amountFils / 1000 : (rawData.amount ?? 0));
          list.push({
            id: docSnap.id,
            ...rawData,
            amount
          } as EscrowTransaction);
        });
        sellerEscrows = list;
        updateMergedEscrows();
      }, (err) => {
        console.warn("Firestore 'escrows' (seller) sync error:", err);
      });

      return () => {
        unsubBidder();
        unsubSeller();
      };
    }
  }, [isAuthenticated, currentUser?.id, currentUser?.role, isDeferredReady]);

  // Real-time chats synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated || !isDeferredReady) {
      return;
    }
    const targetAuctionId = activeAuctionId || 'auction-rolex';
    const chatsRefCol = collection(db, 'chats');
    // Query chats filtered by the active auction ID, limiting to 100
    const q = query(chatsRefCol, where('auctionId', '==', targetAuctionId), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const fetchedChats: ChatMessage[] = [];
        snap.forEach((docSnap) => {
          fetchedChats.push({
            id: docSnap.id,
            ...docSnap.data()
          } as ChatMessage);
        });
        // Sort in-memory to prevent requiring compound indexes
        fetchedChats.sort((a, b) => a.timestamp - b.timestamp);
        setChatMessages(fetchedChats);
      } else {
        setChatMessages([]);
      }
    }, (err) => {
      console.warn("Firestore 'chats' collection sync error:", err);
    });
    return () => unsub();
  }, [isAuthenticated, isDeferredReady, activeAuctionId]);

  // Real-time all users database synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated || currentUser?.role !== 'admin') {
      return;
    }
    const usersRefCol = collection(db, 'users');
    const unsub = onSnapshot(usersRefCol, (snap) => {
      if (!snap.empty) {
        const fetchedUsers: User[] = [];
        snap.forEach((docSnap) => {
          fetchedUsers.push({
            id: docSnap.id,
            ...docSnap.data()
          } as User);
        });
        setUsers(prev => {
          // Merge lists, preferring Firestore data
          const merged = [...prev];
          fetchedUsers.forEach(fu => {
            const idx = merged.findIndex(u => u.id === fu.id);
            if (idx > -1) {
              merged[idx] = { ...merged[idx], ...fu };
            } else {
              merged.push(fu);
            }
          });
          return merged;
        });
      }
    }, (err) => {
      console.warn("Firestore 'users' collection sync error:", err);
    });
    return () => unsub();
  }, [isAuthenticated, currentUser?.role]);

  // Real-time sellerProfiles synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated || !isDeferredReady || !currentUser?.id) return;

    const isStrictAdmin = currentUser.email === 'admaaqaba06@gmail.com' || currentUser.role === 'admin' || currentUser.isAdmin === true;

    if (isStrictAdmin) {
      // Admins get up to 100 profiles
      const q = query(collection(db, 'sellerProfiles'), limit(100));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const fetchedProfiles: SellerProfile[] = [];
          snap.forEach((docSnap) => {
            fetchedProfiles.push({
              id: docSnap.id,
              ...docSnap.data()
            } as SellerProfile);
          });
          setSellerProfiles(prev => {
            const merged = [...prev];
            fetchedProfiles.forEach(fp => {
              const idx = merged.findIndex(p => p.id === fp.id || p.userId === fp.userId);
              if (idx > -1) {
                merged[idx] = { ...merged[idx], ...fp };
              } else {
                merged.push(fp);
              }
            });
            return merged;
          });
        }
      }, (err) => {
        console.warn("Firestore 'sellerProfiles' collection sync error:", err);
      });
      return () => unsub();
    } else {
      // Normal user: ONLY subscribe to their own seller profile
      const q = query(collection(db, 'sellerProfiles'), where('userId', '==', currentUser.id), limit(1));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const fetchedProfiles: SellerProfile[] = [];
          snap.forEach((docSnap) => {
            fetchedProfiles.push({
              id: docSnap.id,
              ...docSnap.data()
            } as SellerProfile);
          });
          setSellerProfiles(prev => {
            const merged = [...prev];
            fetchedProfiles.forEach(fp => {
              const idx = merged.findIndex(p => p.id === fp.id || p.userId === fp.userId);
              if (idx > -1) {
                merged[idx] = { ...merged[idx], ...fp };
              } else {
                merged.push(fp);
              }
            });
            return merged;
          });
        }
      }, (err) => {
        console.warn("Firestore 'sellerProfiles' (own) sync error:", err);
      });
      return () => unsub();
    }
  }, [isAuthenticated, isDeferredReady, currentUser?.id, currentUser?.role, currentUser?.isAdmin, currentUser?.email]);

  // Lightweight listener on the user's OWN reviews (buyerId == uid) — powers the
  // post-win review prompt and the unreviewed-order bid gate without a global reviews sync.
  useEffect(() => {
    if (!isAuthenticated || !isDeferredReady || !currentUser?.id || currentUser.id === 'unauthenticated') {
      setMyReviews([]);
      return;
    }
    const q = query(collection(db, 'reviews'), where('buyerId', '==', currentUser.id), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const list: OrderReview[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as OrderReview);
      });
      setMyReviews(list);
        setMyReviewsLoaded(true);
    }, (err) => {
      console.warn("Firestore 'reviews' (own) sync error:", err);
    });
    return () => unsub();
  }, [isAuthenticated, isDeferredReady, currentUser?.id]);

  // Oldest completed buyer order this user has NOT rated yet — gates the next bid (client-side v1).
  const pendingReviewOrder = useMemo<Order | null>(() => {
    // Never gate bidding before the user's reviews have actually loaded —
    // an empty-but-unloaded list would false-positive on reviewed orders.
    if (!myReviewsLoaded) return null;
    if (!currentUser?.id || currentUser.id === 'unauthenticated') return null;
    const toMs = (raw: any): number => {
      if (!raw) return 0;
      if (typeof raw?.toMillis === 'function') return raw.toMillis();
      if (raw?.seconds) return raw.seconds * 1000;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const reviewedOrderIds = new Set(
      myReviews.filter(r => r.direction === 'buyer_rates_auction').map(r => r.orderId)
    );
    const candidates = (orders || []).filter(o =>
      o.buyerId === currentUser.id &&
      o.status === 'completed' &&
      !reviewedOrderIds.has(o.id)
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))[0];
  }, [orders, myReviews, myReviewsLoaded, currentUser?.id]);

  // Automated pre-fetching of seller profiles of all active/upcoming auctions
  useEffect(() => {
    if (auctions.length === 0) return;
    
    // Get unique seller IDs from current auctions
    const sellerIds = Array.from(new Set(auctions.map(a => a.sellerId).filter(Boolean)));
    
    // Find which ones we don't have yet
    const missingIds = sellerIds.filter(id => !sellerProfiles.some(p => p.userId === id || p.id === id));
    
    if (missingIds.length === 0) return;
    
    const fetchMissing = async () => {
      const fetched: SellerProfile[] = [];
      for (const id of missingIds) {
        try {
          const q = query(collection(db, 'sellerProfiles'), where('userId', '==', id), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            fetched.push({ id: snap.docs[0].id, ...snap.docs[0].data() } as SellerProfile);
          } else {
            const docSnap = await getDoc(doc(db, 'sellerProfiles', id as string));
            if (docSnap.exists()) {
              fetched.push({ id: docSnap.id, ...docSnap.data() } as SellerProfile);
            }
          }
        } catch (e) {
          console.warn(`Error pre-fetching profile for seller ${id}:`, e);
        }
      }
      if (fetched.length > 0) {
        setSellerProfiles(prev => {
          const merged = [...prev];
          fetched.forEach(fp => {
            if (!merged.some(p => p.id === fp.id || p.userId === fp.userId)) {
              merged.push(fp);
            }
          });
          return merged;
        });
      }
    };
    
    fetchMissing();
  }, [auctions]);

  // Sync singular current user's sellerProfile whenever sellerProfiles list or current user changes
  useEffect(() => {
    if (currentUser?.id && sellerProfiles.length > 0) {
      const profile = sellerProfiles.find(p => p.userId === currentUser.id);
      if (profile) {
        setSellerProfile(profile);
      }
    } else {
      setSellerProfile(null);
    }
  }, [currentUser?.id, sellerProfiles]);

  // Real-time orders synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !isDeferredReady) {
      setOrders([]);
      return;
    }

    const isStrictAdmin = currentUser.email === 'admaaqaba06@gmail.com' || currentUser.role === 'admin' || currentUser.isAdmin === true;
    if (isStrictAdmin) {
      const ordersRefCol = collection(db, 'orders');
      const q = query(ordersRefCol, orderBy('createdAt', 'desc'), limit(100));
      const unsub = onSnapshot(q, (snap) => {
        const fetchedOrders: Order[] = [];
        snap.forEach((docSnap) => {
          fetchedOrders.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Order);
        });
        fetchedOrders.sort((a, b) => {
          const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return bTime - aTime;
        });
        setOrders(fetchedOrders);
      }, (err) => {
        console.warn("Firestore 'orders' collection sync error:", err);
      });
      return () => unsub();
    } else {
      // Standard user: listen to orders where buyerId == userId or sellerId == userId (limit 100)
      const buyerQuery = query(collection(db, 'orders'), where('buyerId', '==', currentUser.id), limit(100));
      const sellerQuery = query(collection(db, 'orders'), where('sellerId', '==', currentUser.id), limit(100));

      let buyerOrders: Order[] = [];
      let sellerOrders: Order[] = [];

      const updateMergedOrders = () => {
        const mergedMap = new Map<string, Order>();
        buyerOrders.forEach(o => mergedMap.set(o.id, o));
        sellerOrders.forEach(o => mergedMap.set(o.id, o));
        const mergedList = Array.from(mergedMap.values());
        mergedList.sort((a, b) => {
          const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return bTime - aTime;
        });
        setOrders(mergedList);
      };

      const unsubBuyer = onSnapshot(buyerQuery, (snap) => {
        const list: Order[] = [];
        snap.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Order);
        });
        buyerOrders = list;
        updateMergedOrders();
      }, (err) => {
        console.warn("Firestore 'orders' (buyer) sync error:", err);
      });

      const unsubSeller = onSnapshot(sellerQuery, (snap) => {
        const list: Order[] = [];
        snap.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Order);
        });
        sellerOrders = list;
        updateMergedOrders();
      }, (err) => {
        console.warn("Firestore 'orders' (seller) sync error:", err);
      });

      return () => {
        unsubBuyer();
        unsubSeller();
      };
    }
  }, [isAuthenticated, currentUser?.id, currentUser?.isAdmin, currentUser?.email, currentUser?.role, isDeferredReady]);

  // Real-time synchronization for trust system collections
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || !isDeferredReady) {
      setReviews([]);
      setVerificationRequests([]);
      setSellerReports([]);
      setDisputes([]);
      return;
    }

    const isStrictAdmin = currentUser.email === 'admaaqaba06@gmail.com' || currentUser.role === 'admin' || currentUser.isAdmin === true;

    // 1. Reviews (Removed global real-time listener to optimize read cost. Loaded on-demand instead)
    const unsubReviews = () => {};

    // 2. Verification Requests
    let unsubVerifications = () => {};
    if (isStrictAdmin) {
      const q = query(collection(db, 'sellerVerificationRequests'), orderBy('submittedAt', 'desc'), limit(100));
      unsubVerifications = onSnapshot(q, (snap) => {
        const list: VerificationRequest[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as VerificationRequest);
        });
        setVerificationRequests(list.sort((a, b) => b.submittedAt - a.submittedAt));
      }, (err) => console.warn("Verification requests sync error:", err));
    } else {
      const qVer = query(collection(db, 'sellerVerificationRequests'), where('userId', '==', currentUser.id), limit(10));
      unsubVerifications = onSnapshot(qVer, (snap) => {
        const list: VerificationRequest[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as VerificationRequest);
        });
        setVerificationRequests(list.sort((a, b) => b.submittedAt - a.submittedAt));
      }, (err) => console.warn("Verification requests sync error:", err));
    }

    // 3. Reports
    let unsubReports = () => {};
    if (isStrictAdmin) {
      const q = query(collection(db, 'sellerReports'), orderBy('timestamp', 'desc'), limit(100));
      unsubReports = onSnapshot(q, (snap) => {
        const list: SellerReport[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as SellerReport);
        });
        setSellerReports(list.sort((a, b) => b.timestamp - a.timestamp));
      }, (err) => console.warn("Seller reports sync error:", err));
    }

    // 4. Disputes
    let unsubDisputes = () => {};
    if (isStrictAdmin) {
      const q = query(collection(db, 'disputes'), orderBy('timestamp', 'desc'), limit(100));
      unsubDisputes = onSnapshot(q, (snap) => {
        const list: Dispute[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Dispute);
        });
        setDisputes(list.sort((a, b) => b.timestamp - a.timestamp));
      }, (err) => console.warn("Disputes sync error:", err));
    } else {
      // Buyer/Seller: Merge disputes where buyerId == currentUser.id OR sellerId == currentUser.id (limit 50)
      const qBuyerDisp = query(collection(db, 'disputes'), where('buyerId', '==', currentUser.id), limit(50));
      const qSellerDisp = query(collection(db, 'disputes'), where('sellerId', '==', currentUser.id), limit(50));
      
      let bDisps: Dispute[] = [];
      let sDisps: Dispute[] = [];
      
      const updateDisputes = () => {
        const merged = new Map<string, Dispute>();
        bDisps.forEach(d => merged.set(d.id, d));
        sDisps.forEach(d => merged.set(d.id, d));
        setDisputes(Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp));
      };

      const unsubBuyerDisp = onSnapshot(qBuyerDisp, (snap) => {
        const list: Dispute[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Dispute));
        bDisps = list;
        updateDisputes();
      }, (err) => console.warn("Buyer disputes sync error:", err));

      const unsubSellerDisp = onSnapshot(qSellerDisp, (snap) => {
        const list: Dispute[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Dispute));
        sDisps = list;
        updateDisputes();
      }, (err) => console.warn("Seller disputes sync error:", err));

      unsubDisputes = () => {
        unsubBuyerDisp();
        unsubSellerDisp();
      };
    }

    return () => {
      unsubReviews();
      unsubVerifications();
      unsubReports();
      unsubDisputes();
    };
  }, [isAuthenticated, currentUser?.id, currentUser?.isAdmin, currentUser?.email, currentUser?.role, isDeferredReady]);

const generateSessionId = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const getDeviceInfo = () => {
  if (typeof navigator === 'undefined') {
    return { browser: 'Unknown', platform: 'Unknown', deviceType: 'Unknown', userAgent: '', appVersion: '1.13.0' };
  }
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.indexOf("Firefox") > -1) browser = "Firefox";
  else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
  else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
  else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
  else if (ua.indexOf("Edge") > -1) browser = "Edge";
  else if (ua.indexOf("Chrome") > -1) browser = "Chrome";
  else if (ua.indexOf("Safari") > -1) browser = "Safari";

  let platform = "Web";
  if (ua.indexOf("Windows") > -1) platform = "Windows";
  else if (ua.indexOf("Macintosh") > -1) platform = "macOS";
  else if (ua.indexOf("Linux") > -1) platform = "Linux";
  else if (ua.indexOf("Android") > -1) platform = "Android";
  else if (ua.indexOf("iPhone") > -1 || ua.indexOf("iPad") > -1) platform = "iOS";

  const isMobile = /Mobi|Android/i.test(ua);

  return {
    browser,
    platform,
    deviceType: isMobile ? "Mobile" : "Desktop",
    userAgent: ua,
    appVersion: "1.13.0"
  };
};

const fetchIP = async () => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(id);
    const data = await res.json();
    return data.ip || 'not_available';
  } catch (err) {
    return 'not_available';
  }
};

  const setLanguage = useCallback((lang: 'en' | 'ar') => {
    setLanguageState(lang);
    localStorage.setItem('mazad_language', lang);
  }, []);

  const login = useCallback(async (email: string, pass: string) => {
    const cleanEmail = email.toLowerCase().trim();
    try {
      const newSessionId = generateSessionId();
      localStorage.setItem('mazad_session_id', newSessionId);
      localStorage.setItem('mazad_last_login_time', String(Date.now()));
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const user = userCredential.user;

      const userRef = doc(db, 'users', user.uid);
      const dev = getDeviceInfo();
      const ip = await fetchIP();
      await updateDoc(userRef, {
        sessionId: newSessionId,
        lastLoginAt: new Date().toISOString(),
        deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
        platform: dev.platform,
        browser: dev.browser,
        deviceType: dev.deviceType,
        appVersion: dev.appVersion,
        lastLoginIP: ip,
        lastSeen: new Date().toISOString()
      });

      return { 
        success: true, 
        message: language === 'ar' ? 'تم تسجيل الدخول بنجاح!' : 'Logged in successfully!' 
      };
    } catch (error: any) {
      console.error("Firebase auth login error:", error);

      // Attempt self-healing auto-registration if user is not found or credential was wrong (likely unregistered)
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        try {
          console.log("[Auto-register] Email not found or invalid credential in clear environment; attempting fallback auto-registration...", cleanEmail);
          const newSessionId = generateSessionId();
          localStorage.setItem('mazad_session_id', newSessionId);
          localStorage.setItem('mazad_last_login_time', String(Date.now()));
          const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
          const user = userCredential.user;
          
          const nameFromEmail = cleanEmail.split('@')[0];
          const name = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
          await updateProfile(user, { displayName: name });
          
          const userRef = doc(db, 'users', user.uid);
          const isAutoAdmin = cleanEmail === 'admaaqaba06@gmail.com';
          const dev = getDeviceInfo();
          const ip = await fetchIP();
          const freshUserDoc = {
            id: user.uid,
            uid: user.uid,
            name: name,
            email: cleanEmail,
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            role: isAutoAdmin ? 'admin' : 'user',
            phoneNumber: '',
            phone: '',
            city: '',
            createdAt: new Date().toISOString(),
            sessionId: newSessionId,
            lastLoginAt: new Date().toISOString(),
            deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
            platform: dev.platform,
            browser: dev.browser,
            deviceType: dev.deviceType,
            appVersion: dev.appVersion,
            lastLoginIP: ip,
            lastSeen: new Date().toISOString()
          };
          await setDoc(userRef, freshUserDoc);
          
          return { 
            success: true, 
            message: language === 'ar' 
              ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح!' 
              : 'Account auto-registered and logged in successfully!' 
          };
        } catch (regError: any) {
          console.warn("[Auto-register] Fail fallback:", regError);
          // If already in use, it was indeed a wrong password
          if (regError.code === 'auth/email-already-in-use') {
            let errorMsg = language === 'ar' 
              ? 'خطأ في البريد الإلكتروني أو كلمة المرور، يرجى المحاولة مرة أخرى.' 
              : 'Incorrect email or password, please try again.';
            return { success: false, message: errorMsg };
          }
        }
      }

      let errorMsg = error.message;
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        errorMsg = language === 'ar' 
          ? 'خطأ في البريد الإلكتروني أو كلمة المرور، يرجى المحاولة مرة أخرى.' 
          : 'Incorrect email or password, please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = language === 'ar' 
          ? 'البريد الإلكتروني المكتوب غير صالح.' 
          : 'The email address is invalid.';
      } else {
        errorMsg = error.message || errorMsg;
      }
      return { success: false, message: errorMsg };
    }
  }, [language]);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    
    const newSessionId = generateSessionId();
    localStorage.setItem('mazad_session_id', newSessionId);
    localStorage.setItem('mazad_last_login_time', String(Date.now()));
    
    try {
      console.log("Attempting Google Auth via signInWithPopup first...");
      await signInWithPopup(auth, provider);
    } catch (popupError: any) {
      console.warn("Google Auth popup failed, falling back to redirect:", popupError);
      // Fallback to redirect
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError: any) {
        console.error("Google Auth completely failed:", redirectError);
        throw redirectError;
      }
    }
  }, []);

  const loginWithPhone = useCallback(async (phoneE164: string, appVerifier: import('firebase/auth').ApplicationVerifier) => {
    const { signInWithPhoneNumber } = await import('firebase/auth');
    const newSessionId = generateSessionId();
    localStorage.setItem('mazad_session_id', newSessionId);
    localStorage.setItem('mazad_last_login_time', String(Date.now()));
    // Returns a ConfirmationResult; the UI then calls confirmPhoneCode with the SMS code.
    return signInWithPhoneNumber(auth, phoneE164, appVerifier);
  }, []);

  const confirmPhoneCode = useCallback(async (confirmation: import('firebase/auth').ConfirmationResult, code: string) => {
    try {
      // (review B2) OTP entry takes longer than the 10s session grace window used by the
      // onAuthStateChanged session-conflict check (~:674-680). Refresh the timestamp
      // IMMEDIATELY before confirm() so a returning phone user isn't force-logged-out.
      localStorage.setItem('mazad_last_login_time', String(Date.now()));
      const cred = await confirmation.confirm(code); // signs the user in
      // (review B2) Mirror email login(): persist the new sessionId onto the EXISTING user
      // doc so the session-conflict check passes. New users get their sessionId written by
      // the onAuthStateChanged new-user path.
      const uid = cred?.user?.uid;
      if (uid) {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const dev = getDeviceInfo();
          const ip = await fetchIP();
          await updateDoc(userRef, {
            sessionId: localStorage.getItem('mazad_session_id') || '',
            lastLoginAt: new Date().toISOString(),
            deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
            platform: dev.platform,
            browser: dev.browser,
            deviceType: dev.deviceType,
            appVersion: dev.appVersion,
            lastLoginIP: ip,
            lastSeen: new Date().toISOString()
          });
        }
      }
      return { success: true, message: '' };
    } catch (e: any) {
      // Never surface raw Firebase strings — map to a friendly AR/EN message.
      return { success: false, message: mapAuthError(e, language === 'ar') };
    }
  }, [language]);

  const logout = useCallback(async () => {
    try {
      const uid = currentUser?.id;
      await signOut(auth);
      setCurrentUser(DEFAULT_UNAUTHENTICATED_USER);
      setIsAuthenticated(false);
      // Shared-device privacy (Wave E1 review fix): the bell holds PRIVATE
      // cross-user verdicts (incl. rejection reasons) — purge the in-memory
      // list, the persisted per-user entries, the dismissed-ids cache and the
      // Firestore-merge bookkeeping so the next account sees nothing.
      setNotifications([]);
      firestoreNotifIdsRef.current = new Set();
      notifStoreUidRef.current = null;
      try {
        if (uid) {
          localStorage.removeItem(`${NOTIF_STORE_PREFIX}${uid}`);
          localStorage.removeItem(`${DISMISSED_STORE_PREFIX}${uid}`);
        }
        localStorage.removeItem(LEGACY_NOTIF_KEY);
        localStorage.removeItem(LEGACY_DISMISSED_KEY);
      } catch { /* storage unavailable — nothing persisted then */ }
      setWallet({
        userId: 'user-current',
        totalBalance: 0,
        availableBalance: 0,
        escrowBalance: 0
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, [currentUser?.id]);

  const registerUser = useCallback(async (name: string, email: string, password = '', phone = '') => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();
    const cleanName = name.trim();
    const isAdminEmail = cleanEmail === 'admaaqaba06@gmail.com';

    // Duplicate Account & Sybil / Fraud Protection Validation via Cloud Function
    try {
      const checkDuplicate = await getCallableFunction<{ phone: string; name: string }, { phoneExists: boolean; nameExists: boolean; duplicate: boolean }>(
        'checkDuplicateAccount'
      );
      const dupResult = await checkDuplicate({ phone: cleanPhone, name: cleanName });
      
      if (dupResult.data && dupResult.data.duplicate) {
        await logAnalyticsEvent('rate_limit_triggered', null, cleanEmail, { 
          reason: 'duplicate_account_blocked', 
          attemptedPhone: cleanPhone,
          attemptedName: cleanName 
        });
        return {
          success: false,
          message: language === 'ar'
            ? 'يوجد حساب مسجل مسبقاً بنفس رقم الهاتف أو الاسم. تواصل مع الدعم.'
            : 'An account with the same phone number or name already exists. Please contact support.'
        };
      }
    } catch (dupErr) {
      console.error("Duplicate verification check failed: ", dupErr);
      return {
        success: false,
        message: language === 'ar'
          ? 'تعذر التحقق من صحة الحساب حالياً، يرجى المحاولة مرة أخرى بعد قليل'
          : 'Could not validate account security at this time, please try again shortly.'
      };
    }

    try {
      const newSessionId = generateSessionId();
      localStorage.setItem('mazad_session_id', newSessionId);
      localStorage.setItem('mazad_last_login_time', String(Date.now()));
      const dev = getDeviceInfo();
      const ip = await fetchIP();

      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;
      
      await updateProfile(user, { displayName: cleanName });
      
      const userRef = doc(db, 'users', user.uid);
      const freshUserDoc = {
        id: user.uid,
        uid: user.uid,
        name: cleanName,
        normalizedName: cleanName.toLowerCase().trim(),
        email: cleanEmail,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        role: isAdminEmail ? 'admin' : 'user',
        accountStatus: 'active',
        phoneNumber: cleanPhone || '',
        phone: cleanPhone || '',
        normalizedPhone: cleanPhone.replace(/\D/g, ''),
        city: '',
        createdAt: new Date().toISOString(),
        onboardingCompleted: false,
        shownHints: {},
        sessionId: newSessionId,
        lastLoginAt: new Date().toISOString(),
        deviceInfo: `${dev.browser} on ${dev.platform} (${dev.deviceType})`,
        platform: dev.platform,
        browser: dev.browser,
        deviceType: dev.deviceType,
        appVersion: dev.appVersion,
        lastLoginIP: ip,
        lastSeen: new Date().toISOString()
      };
      await setDoc(userRef, freshUserDoc);

      // Track successful registration in Analytics
      await logAnalyticsEvent('user_registration', user.uid, cleanEmail, {
        method: 'email_password',
        name: cleanName,
        isAdmin: isAdminEmail
      });

      return { 
        success: true, 
        message: language === 'ar' 
          ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح!' 
          : 'Account registered successfully!' 
      };
    } catch (error: any) {
      console.error("Firebase auth registration error:", error);
      let errorMsg = error.message;
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = language === 'ar' 
          ? 'عذراً، هذا البريد الإلكتروني مسجل بالفعل.' 
          : 'Sorry, this email is already registered.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = language === 'ar' 
          ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.' 
          : 'Password must be at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = language === 'ar' 
          ? 'البريد الإلكتروني المكتوب غير صالح.' 
          : 'The email address is invalid.';
      } else {
        errorMsg = error.message || errorMsg;
      }
      return { success: false, message: errorMsg };
    }
  }, [language]);

  // General Notification Handler
  const addNotification = useCallback((
    title: string,
    description: string,
    type: Notification['type'],
    priority?: 'high' | 'medium' | 'low',
    auctionId?: string
  ) => {
    // 1. Determine group/type mapping
    let inferredType: Notification['type'] = type;
    
    // Explicit map standard legacy types to the 7 clean groups.
    // 'outbid' intentionally survives as-is: it is one of the four
    // bidder-relevant alert kinds (Wave D, spec §5) and must stay
    // distinguishable from generic 'bid' chatter at display time.
    if (type === 'refund') inferredType = 'loss';
    if (type === 'verify') inferredType = 'subscription';
    if (type === 'alert') inferredType = 'admin';

    const lowerTitle = title.toLowerCase();
    const lowerDesc = description.toLowerCase();

    // Contextual type mapping — outbid first so it never collapses into 'bid'
    if (
      lowerTitle.includes('outbid') ||
      lowerTitle.includes('تجاوز عرضك')
    ) {
      inferredType = 'outbid';
    } else if (
      lowerTitle.includes('مزايدة مضادة') ||
      lowerTitle.includes('خسارة مزايدة') ||
      lowerTitle.includes('winning') ||
      lowerTitle.includes('متقدم') ||
      lowerTitle.includes('bid') ||
      lowerTitle.includes('مزايدة')
    ) {
      inferredType = 'bid';
    } else if (
      lowerTitle.includes('won') || 
      lowerTitle.includes('فوز') || 
      lowerTitle.includes('ربحت')
    ) {
      inferredType = 'win';
    } else if (
      lowerTitle.includes('lost') || 
      lowerTitle.includes('خسارة') || 
      lowerTitle.includes('لم تفز') ||
      lowerTitle.includes('refund') ||
      lowerTitle.includes('استرداد')
    ) {
      inferredType = 'loss';
    } else if (
      lowerTitle.includes('wallet') || 
      lowerTitle.includes('محفظة') || 
      lowerTitle.includes('top-up') || 
      lowerTitle.includes('شحن') ||
      lowerTitle.includes('cliq') || 
      lowerTitle.includes('كليك') ||
      lowerTitle.includes('deposit') || 
      lowerTitle.includes('إيداع') ||
      lowerTitle.includes('withdrawal') || 
      lowerTitle.includes('سحب')
    ) {
      inferredType = 'wallet';
    } else if (
      lowerTitle.includes('order') || 
      lowerTitle.includes('طلب') || 
      lowerTitle.includes('shipment') || 
      lowerTitle.includes('شحن') ||
      lowerTitle.includes('waybill') || 
      lowerTitle.includes('بوليصة') ||
      lowerTitle.includes('delivery') || 
      lowerTitle.includes('توصيل')
    ) {
      inferredType = 'order';
    } else if (
      lowerTitle.includes('subscription') || 
      lowerTitle.includes('اشتراك') || 
      lowerTitle.includes('pass') || 
      lowerTitle.includes('بطاقة')
    ) {
      inferredType = 'subscription';
    } else if (
      lowerTitle.includes('admin') || 
      lowerTitle.includes('إدارة') || 
      lowerTitle.includes('system') || 
      lowerTitle.includes('نظام') ||
      lowerTitle.includes('maintenance') || 
      lowerTitle.includes('صيانة')
    ) {
      inferredType = 'admin';
    }

    // 2. Set default priority levels based on requirement
    let inferredPriority: 'high' | 'medium' | 'low' = priority || 'low';
    
    // Someone outbid you -> High
    if (lowerTitle.includes('outbid') || lowerTitle.includes('تجاوز عرضك')) {
      inferredPriority = 'high';
    }
    // You are winning -> Medium
    else if (lowerTitle.includes('winning') || lowerTitle.includes('متقدم')) {
      inferredPriority = 'medium';
    }
    // Auction ended -> Medium
    else if (lowerTitle.includes('ended') || lowerTitle.includes('انتهى المزاد') || lowerTitle.includes('انتهاء')) {
      inferredPriority = 'medium';
    }
    // You won -> High
    else if (lowerTitle.includes('won') || lowerTitle.includes('فوز') || lowerTitle.includes('مبروك')) {
      inferredPriority = 'high';
    }
    // You lost and money returned -> High
    else if (lowerTitle.includes('lost') || (lowerTitle.includes('outbid') && (lowerTitle.includes('returned') || lowerTitle.includes('إرجاع')))) {
      inferredPriority = 'high';
    }
    // Wallet top-up approved -> High
    else if (lowerTitle.includes('top-up approved') || lowerTitle.includes('تمت الموافقة على الشحن') || (lowerTitle.includes('deposit') && lowerTitle.includes('approved'))) {
      inferredPriority = 'high';
    }
    // Withdrawal request under review -> Medium
    else if (lowerTitle.includes('withdrawal') || lowerTitle.includes('سحب')) {
      inferredPriority = 'medium';
    }
    // Subscription approved / expired -> High
    else if (lowerTitle.includes('subscription') || lowerTitle.includes('اشتراك')) {
      if (lowerTitle.includes('approved') || lowerTitle.includes('مقبول') || lowerTitle.includes('expired') || lowerTitle.includes('منتهي') || lowerTitle.includes('تفعيل')) {
        inferredPriority = 'high';
      } else {
        inferredPriority = 'medium';
      }
    }
    // Default fallback based on type
    else if (inferredType === 'win' || inferredType === 'loss' || inferredType === 'outbid') {
      inferredPriority = 'high';
    } else if (inferredType === 'bid' || inferredType === 'order' || inferredType === 'wallet') {
      inferredPriority = 'medium';
    }

    const newNotif: Notification = {
      id: `notif-${Date.now()}-${Math.random()}`,
      userId: 'user-current',
      title,
      description,
      type: inferredType,
      priority: inferredPriority,
      timestamp: Date.now(),
      read: false,
      auctionId
    };

    // Duplicate Prevention: Keep only the latest outbid alert for the same auction title
    let auctionTitle: string | null = null;
    const match = description.match(/"([^"]+)"/);
    if (match) {
      auctionTitle = match[1];
    }

    setNotifications(prev => {
      let filtered = prev;
      if ((inferredType === 'bid' || inferredType === 'outbid') && auctionTitle) {
        filtered = prev.filter(n => {
          if (n.type !== inferredType) return true;
          const prevMatch = n.description.match(/"([^"]+)"/);
          const prevTitle = prevMatch ? prevMatch[1] : null;
          return prevTitle !== auctionTitle;
        });
      }
      return [newNotif, ...filtered];
    });

    // Native HTML5 Web Push Notification Fallback
    if (featureFlags.enablePushNotifications && 'Notification' in window && window.Notification.permission === 'granted') {
      try {
        new window.Notification(title, {
          body: description,
          icon: '/icon.svg',
          tag: newNotif.id,
          silent: false
        });
      } catch (e) {
        console.warn('Native push notification error: ', e);
      }
    }
  }, [featureFlags.enablePushNotifications]);

  // --- Cross-user notification delivery (bell) ---
  // Notifications written to /notifications by ANOTHER session — e.g. the
  // admin approving/rejecting a seller's listing — must reach THIS user's
  // bell. addNotification is session-local (localStorage), so we merge the
  // user's Firestore notification docs into the bell state, mapped to the
  // device language. Locally-removed ones are remembered in localStorage so
  // the live subscription doesn't resurrect them.
  // (firestoreNotifIdsRef is declared next to the notifications state so
  // logout() can purge it — shared-device privacy.)
  const notificationsStateRef = useRef<Notification[]>(notifications);
  useEffect(() => {
    notificationsStateRef.current = notifications;
  }, [notifications]);

  // Hydrate the bell from the CURRENT user's uid-keyed store on sign-in.
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || currentUser.id === DEFAULT_UNAUTHENTICATED_USER.id) {
      notifStoreUidRef.current = null;
      return;
    }
    if (notifStoreUidRef.current === currentUser.id) return;
    let hydrated: Notification[] = INITIAL_NOTIFICATIONS;
    try {
      const saved = localStorage.getItem(`${NOTIF_STORE_PREFIX}${currentUser.id}`);
      if (saved) hydrated = JSON.parse(saved);
    } catch { /* corrupted entry — start clean */ }
    notifStoreUidRef.current = currentUser.id;
    setNotifications(hydrated);
  }, [isAuthenticated, currentUser?.id]);

  // Persist the bell PER-USER (uid-keyed) — never under a shared key.
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id || notifStoreUidRef.current !== currentUser.id) return;
    try {
      localStorage.setItem(`${NOTIF_STORE_PREFIX}${currentUser.id}`, JSON.stringify(notifications));
    } catch { /* storage full/unavailable — bell simply won't persist */ }
  }, [notifications, isAuthenticated, currentUser?.id]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;

    // uid-keyed for the same reason as the bell store: dismissals must not
    // bleed across accounts on a shared device.
    const DISMISSED_KEY = `${DISMISSED_STORE_PREFIX}${currentUser.id}`;
    const readDismissed = (): Set<string> => {
      try {
        return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'));
      } catch {
        return new Set();
      }
    };
    const persistDismissed = (s: Set<string>) => {
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(s).slice(-300)));
      } catch { /* storage full/unavailable — resurrection is tolerable */ }
    };

    // Same index-free pattern as SellerCenterView: where-only + client sort.
    const q = query(collection(db, 'notifications'), where('userId', '==', currentUser.id));
    const unsub = onSnapshot(q, (snap) => {
      const dismissed = readDismissed();
      const currentIds = new Set(notificationsStateRef.current.map(n => n.id));
      let dismissedChanged = false;
      const incoming: Notification[] = [];

      snap.forEach(d => {
        if (dismissed.has(d.id)) return;
        if (firestoreNotifIdsRef.current.has(d.id) && !currentIds.has(d.id)) {
          // Was merged earlier this session and the user removed it — don't resurrect.
          dismissed.add(d.id);
          dismissedChanged = true;
          return;
        }
        const data: any = d.data();
        firestoreNotifIdsRef.current.add(d.id);
        const ts = typeof data.timestamp === 'number'
          ? data.timestamp
          : (data.timestamp?.seconds ? data.timestamp.seconds * 1000 : Date.now());
        incoming.push({
          id: d.id,
          userId: data.userId,
          title: (language === 'ar' ? data.titleAr : data.titleEn) || data.title || '',
          description: (language === 'ar' ? data.descriptionAr : data.descriptionEn) || data.description || '',
          type: data.type || 'info',
          priority: data.priority || 'medium',
          timestamp: ts,
          read: !!data.read,
          auctionId: data.auctionId
        });
      });

      if (dismissedChanged) persistDismissed(dismissed);
      if (incoming.length === 0) return;

      setNotifications(prev => {
        const incomingIds = new Set(incoming.map(n => n.id));
        const rest = prev.filter(n => !incomingIds.has(n.id));
        return [...incoming, ...rest].sort((a, b) => b.timestamp - a.timestamp);
      });
    }, (err: any) => {
      console.warn('Bell notifications subscription failed:', err?.code, err?.message);
    });

    return () => unsub();
  }, [isAuthenticated, currentUser?.id, language]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    // Firestore-delivered notifications keep read-state on the server so the
    // live subscription (and other devices) don't flip them back to unread.
    if (firestoreNotifIdsRef.current.has(id)) {
      updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => { /* non-fatal */ });
    }
  }, []);

  const markAllAsRead = useCallback(() => {
    notificationsStateRef.current.forEach(n => {
      if (!n.read && firestoreNotifIdsRef.current.has(n.id)) {
        updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => { /* non-fatal */ });
      }
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const logSystemHealth = useCallback(async (type: 'error' | 'payment_fail' | 'bid_fail' | 'wallet_fail', title: string, details: string) => {
    try {
      await addDoc(collection(db, 'system_health'), {
        type,
        title,
        details,
        userId: currentUser?.id || 'anonymous',
        userEmail: currentUser?.email || 'anonymous',
        timestamp: new Date().toISOString(),
        browser: navigator.userAgent
      });
    } catch (err) {
      console.warn("Failed to write to system_health collection:", err);
    }
  }, [currentUser]);

  const subscribeUser = useCallback(async (price: number, paymentProofImage?: string, transferFullName?: string, transferPhone?: string, planId?: string): Promise<boolean> => {
    // Prefer the explicit plan id from the UI. The price-based fallback is a
    // safety net only — and it must NOT re-introduce the Wave C bug where the
    // 4 JD tier fell through to 'annual' (365 days). Tiers: 1 JD/mo · 4 JD/6mo · 7 JD/yr.
    const plan = planId || (price === 1 ? 'monthly' : price === 7 ? 'annual' : 'semiannual');

    if (!currentUser) {
      const loginTitle = language === 'ar' ? '❌ خطأ' : '❌ Error';
      const loginMsg = language === 'ar' ? 'يجب تسجيل الدخول أولاً.' : 'You must be logged in first.';
      addNotification(loginTitle, loginMsg, 'alert');
      showToast({ title: loginTitle, message: loginMsg, type: 'warn' });
      return false;
    }

    if (!featureFlags.enableSubscriptions) {
      const disabledTitle = language === 'ar' ? '⚠️ الاشتراكات معطلة' : '⚠️ Subscriptions Disabled';
      const disabledMsg = language === 'ar' ? 'عمليات ترقية الاشتراكات معطلة مؤقتاً للصيانة المجدولة.' : 'Subscription upgrades are temporarily disabled for system maintenance.';
      addNotification(disabledTitle, disabledMsg, 'alert');
      showToast({ title: disabledTitle, message: disabledMsg, type: 'warn' });
      return false;
    }

    try {
      let downloadURL = '';

      if (paymentProofImage && paymentProofImage.startsWith('data:')) {
        try {
          // Upload payment proof screenshot directly to Firebase Storage inside payment-proofs/{userId}/{timestamp-fileName}
          const { getStorage, ref, uploadString, getDownloadURL } = await import('firebase/storage');
          const storage = getStorage();
          const fileName = `${Date.now()}_proof.png`;
          const proofRef = ref(storage, `payment-proofs/${currentUser.id}/${fileName}`);
          
          const uploadResult = await uploadString(proofRef, paymentProofImage, 'data_url');
          downloadURL = await getDownloadURL(uploadResult.ref);
        } catch (storageErr: any) {
          console.error("Firebase Storage write failure during payment proof upload. Code:", storageErr.code, "Message:", storageErr.message);
          const proofFailTitle = language === 'ar' ? '❌ فشل رفع الإثبات' : '❌ Storage Upload Failed';
          const proofFailMsg = language === 'ar' ? `لم نتمكن من رفع صورة إثبات الدفع. رمز الخطأ: ${storageErr.code || 'unknown'}` : `Failed to upload payment proof. Code: ${storageErr.code || 'unknown'}`;
          addNotification(proofFailTitle, proofFailMsg, 'alert');
          showToast({ title: proofFailTitle, message: proofFailMsg, type: 'warn' });
          await logSystemHealth('payment_fail', 'Subscription Proof Upload Error', `Amount: ${price} JOD, Name: ${transferFullName || ''}, Error: ${storageErr.message || String(storageErr)}`);
          return false;
        }
      } else {
        downloadURL = paymentProofImage || '';
      }

      // Single write path: the `requestSubscription` callable is the sole creator of the
      // subscriptionRequests doc (server-authoritative; it also sets the user to pending).
      // A failure here is a REAL failure — surface it, don't swallow it.
      const requestSubCallable = await getCallableFunction<{
        price: number;
        plan: string;
        paymentProofUrl: string;
        paymentProofImage: string;
        transferFullName: string;
        transferPhone: string;
       }, { success: boolean; message: string }>('requestSubscription');

      await requestSubCallable({
        price,
        plan,
        paymentProofUrl: downloadURL,
        paymentProofImage: downloadURL,
        transferFullName: transferFullName || '',
        transferPhone: transferPhone || ''
      });

      // Funnel metric — fire-and-forget (service handles its own errors)
      logAnalyticsEvent('membership_submitted', currentUser.id, currentUser.email, {
        plan,
        price
      });

      setCurrentUser(prev => {
        if (!prev) return prev;
        return { 
          ...prev, 
          subscriptionStatus: 'pending' as const, 
          subscriptionExpiry: null, 
          paymentProofImage: downloadURL,
          transferFullName,
          transferPhone
        };
      });

      setUsers(prev => prev.map(u => {
        if (currentUser && u.id === currentUser.id) {
          return { 
            ...u, 
            subscriptionStatus: 'pending' as const, 
            subscriptionExpiry: null, 
            paymentProofImage: downloadURL,
            transferFullName,
            transferPhone
          };
        }
        return u;
      }));

      setShowSubscriptionPrompt(false);
      addNotification(
        language === 'ar' ? '⏳ الاشتراك قيد المراجعة' : '⏳ Subscription Pending',
        language === 'ar'
          ? 'شكراً! تم استلام طلب اشتراكك. سيتم مراجعته من الإدارة وتفعيله خلال دقائق.'
          : 'Thanks! We received your subscription request. It will be reviewed and activated within minutes.',
        'verify'
      );
      return true;
    } catch (error: any) {
      console.error("[requestSubscription] Overall process failure. Code:", error.code, "Message:", error.message, "error:", error);
      await logSystemHealth('payment_fail', 'Subscription Request Error', `Amount: ${price} JOD, Name: ${transferFullName || ''}, Error: ${error.message || String(error)}`);
      const subFailTitle = language === 'ar' ? '❌ لم يتم إرسال الطلب' : '❌ Request Not Sent';
      const subFailMsg = language === 'ar'
        ? 'تعذّر إرسال طلب الاشتراك — تحقق من اتصالك وحاول مرة أخرى.'
        : 'We could not submit your subscription request — check your connection and try again.';
      addNotification(subFailTitle, subFailMsg, 'alert');
      showToast({ title: subFailTitle, message: subFailMsg, type: 'warn' });
      return false;
    }
  }, [currentUser, addNotification, showToast, logSystemHealth, featureFlags, language]);

  // BIDDING ENGINE BUSINESS LOGIC (CRITICAL RULES)
  const placeBid = useCallback(async (auctionId: string, amount: number): Promise<{ success: boolean; message: string }> => {
    // 0. Feature flag check
    if (!featureFlags.enableLiveAuctions) {
      return { 
        success: false, 
        message: language === 'ar' 
          ? '⚠️ المزايدة على المعروضات معطلة مؤقتاً للصيانة المجدولة.' 
          : '🚫 Live Bidding is temporarily disabled for scheduled maintenance.' 
      };
    }

    const now = Date.now();

    // 1. Double check blocking status
    if (currentUser.isBlocked) {
      return { success: false, message: '🚫 Account restricted. Bidding disabled.' };
    }
    if (currentUser.subscriptionStatus !== 'active') {
      setShowSubscriptionPrompt(true);
      return {
        success: false,
        message: language === 'ar'
          ? 'المزايدة تتطلب عضوية — انضم بـ ١ دينار فقط'
          : 'Membership required to bid — join for 1 JD'
      };
    }

    // 1.5. Unreviewed-order bid gate (client-side v1): an unreviewed completed
    // order blocks the next bid — open the review prompt instead of calling the server.
    if (pendingReviewOrder) {
      addNotification(
        language === 'ar' ? '⭐ قيّم مشترياتك السابقة للمتابعة' : '⭐ Rate your previous purchases to continue',
        language === 'ar'
          ? 'لديك طلب مكتمل بانتظار تقييمك — قيّمه (١٠ ثوانٍ) ثم تابع المزايدة.'
          : 'A completed order is waiting for your rating — rate it (10 seconds), then keep bidding.',
        'info'
      );
      setReviewPromptOrderId(pendingReviewOrder.id);
      return {
        success: false,
        message: language === 'ar'
          ? 'قيّم مشترياتك السابقة للمتابعة'
          : 'Rate your previous purchases to continue'
      };
    }

    // 2. Bid Spam & Timing Protection (Min 1.5 seconds cooldown between bids)
    const lastBidTime = lastBidTimestampRef.current;
    if (now - lastBidTime < 1500) {
      await logAnalyticsEvent('bid_spam_blocked', currentUser.id, currentUser.email, {
        auctionId,
        bidAmount: amount,
        timeSinceLastBidMs: now - lastBidTime,
        type: 'bot_spam_protection'
      });
      return {
        success: false,
        message: language === 'ar'
          ? '⚠️ تم حظر المزايدة السريعة! يرجى الانتظار 1.5 ثانية بين المزايدات لحماية استقرار المزاد.'
          : '🚫 Spam Protection: Please wait at least 1.5 seconds between bids.'
      };
    }

    // 3. Sliding Window Rate Limiting (Max 10 bids per 60 seconds)
    const updatedWindow = bidTimestampsRef.current.filter(ts => now - ts < 60000);
    if (updatedWindow.length >= 10) {
      await logAnalyticsEvent('rate_limit_triggered', currentUser.id, currentUser.email, {
        auctionId,
        windowSizeSec: 60,
        requestCount: updatedWindow.length,
        type: 'bidding_rate_limit'
      });
      return {
        success: false,
        message: language === 'ar'
          ? '⚠️ تم تجاوز حد المزايدات المسموح به (10 مزايدات في الدقيقة). يرجى الانتظار دقيقة واحدة.'
          : '🚫 Rate Limit Exceeded: Max 10 bids per minute. Please pause for a moment.'
      };
    }

    try {
      const placeBidCallable = await getCallableFunction<{ auctionId: string; amount: number }, { success: boolean; message: string }>('placeBid');
      const result = await placeBidCallable({ auctionId, amount });
      if (result.data.success) {
        // Update security refs
        lastBidTimestampRef.current = Date.now();
        bidTimestampsRef.current = [...updatedWindow, Date.now()];

        // Record analytical conversion metrics — fire-and-forget (service handles its own errors)
        logAnalyticsEvent('bid_placed', currentUser.id, currentUser.email, {
          auctionId,
          amount
        });
        if (!isFirstBidDone()) {
          logAnalyticsEvent('first_bid', currentUser.id, currentUser.email, {
            auctionId,
            amount
          });
          markFirstBidDone(); // idempotent — layouts also call this after a successful bid
        }

        addNotification(
          '🏆 Winning Bid Placed',
          language === 'ar'
            ? 'تم تسجيل مزايدتك بنجاح — أنت الأعلى الآن!'
            : "Bid placed — you're the highest bidder!",
          'win'
        );
      } else {
        await logSystemHealth('bid_fail', 'Bid Placement Failed', `Auction: ${auctionId}, Amount: ${amount} JOD, Message: ${result.data.message}`);
        if (result.data.message === 'MEMBERSHIP_REQUIRED') {
          setShowSubscriptionPrompt(true);
          return {
            success: false,
            message: language === 'ar'
              ? 'المزايدة تتطلب عضوية — انضم بـ ١ دينار فقط'
              : 'Membership required to bid — join for 1 JD'
          };
        }
      }
      return {
        success: result.data.success,
        message: result.data.message
      };
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const isExpectedError = 
        errorMsg.includes('ended') || 
        errorMsg.includes('Minimum') || 
        errorMsg.includes('Funds') || 
        errorMsg.includes('subscription') || 
        errorMsg.includes('restricted') || 
        errorMsg.includes('not accepting');
        
      if (isExpectedError) {
        console.warn("Cloud function placeBid expected warning:", errorMsg);
      } else {
        console.error("Cloud function placeBid error:", error);
      }
      await logSystemHealth('bid_fail', 'Bid Placement Error', `Auction: ${auctionId}, Amount: ${amount} JOD, Error: ${errorMsg}`);
      return {
        success: false,
        message: errorMsg || 'Bidding failed.'
      };
    }
  }, [currentUser, language, addNotification, logSystemHealth, featureFlags, pendingReviewOrder]);

  // CliQ Jordanian instant receipt topup via Cloud Function
  const triggerCliQTopUp = useCallback(async (amount: number, alias: string, paymentProofUrl: string) => {
    if (!featureFlags.enableWallets) {
      const walletsOffTitle = language === 'ar' ? '⚠️ عمليات المحفظة معطلة' : '⚠️ Wallet Services Disabled';
      const walletsOffMsg = language === 'ar' ? 'عمليات التعبئة والتحقق المالي معطلة مؤقتاً للصيانة المجدولة.' : 'Wallet deposits and verifications are temporarily disabled for scheduled maintenance.';
      addNotification(walletsOffTitle, walletsOffMsg, 'alert');
      showToast({ title: walletsOffTitle, message: walletsOffMsg, type: 'warn' });
      return;
    }

    try {
      const topUpCallable = await getCallableFunction<{ amount: number; alias: string; paymentProofUrl: string }, { success: boolean; message: string }>('requestTopUp');
      const result = await topUpCallable({ amount, alias, paymentProofUrl });

      if (result.data.success) {
        addNotification(
          language === 'ar' ? '💸 تم استلام طلب التعبئة' : '💸 CliQ Transfer Received',
          language === 'ar' 
            ? 'تم رفع الإيصال بنجاح! سيقوم فريق العمليات بمراجعة وتدقيق حوالتك خلال دقيقة.' 
            : 'Receipt upload success! Amman operations team will audit payment verification manually within 60 seconds.',
          'verify'
        );
      } else {
        throw new Error(result.data.message || 'Operation failed on server.');
      }
    } catch (error: any) {
      console.error("Cloud function requestTopUp failed:", error);
      await logSystemHealth('payment_fail', 'CliQ Payment Top-up Error', `Amount: ${amount} JOD, Alias: ${alias}, Proof: ${paymentProofUrl}, Error: ${error.message || String(error)}`);
      const topUpFailTitle = language === 'ar' ? '❌ خطأ في تعبئة الرصيد' : '❌ Top-up Error';
      const topUpFailMsg = error.message || (language === 'ar' ? 'فشل تقديم طلب التعبئة. الرجاء المحاولة مجدداً.' : 'Failed to request top-up.');
      addNotification(topUpFailTitle, topUpFailMsg, 'alert');
      showToast({ title: topUpFailTitle, message: topUpFailMsg, type: 'warn' });
    }
  }, [currentUser, addNotification, showToast, logSystemHealth, featureFlags, language]);

  const requestWithdrawal = useCallback(async (amount: number, method: string, accountDetails: any) => {
    try {
      const withdrawalCallable = await getCallableFunction<
        { amount: number; method: string; accountDetails: any },
        { success: boolean; message: string }
      >('requestWithdrawal');
      const result = await withdrawalCallable({ amount, method, accountDetails });
      if (result.data.success) {
        addNotification(
          language === 'ar' ? '💸 تم تقديم طلب السحب' : '💸 Withdrawal Request Logged',
          result.data.message || (language === 'ar' ? 'تم تسجيل طلب السحب بنجاح وهو قيد المراجعة.' : 'Withdrawal request registered successfully. Pending review.'),
          'info'
        );
        return { success: true, message: result.data.message };
      }
      return { success: false, message: result.data.message || 'Failed to request withdrawal.' };
    } catch (error: any) {
      console.error("Cloud function requestWithdrawal failed:", error);
      const withdrawFailTitle = language === 'ar' ? '❌ خطأ في تقديم طلب السحب' : '❌ Withdrawal Error';
      const withdrawFailMsg = error.message || (language === 'ar' ? 'فشل تقديم طلب السحب.' : 'Failed to request withdrawal.');
      addNotification(withdrawFailTitle, withdrawFailMsg, 'alert');
      showToast({ title: withdrawFailTitle, message: withdrawFailMsg, type: 'warn' });
      return { success: false, message: error.message || 'Failed to request withdrawal.' };
    }
  }, [currentUser, addNotification, showToast, language]);

  const sendChatMessage = useCallback(async (text: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random()}`,
      auctionId: activeAuctionId || 'auction-rolex',
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      text: text,
      timestamp: Date.now(),
      isSystem: false,
      isBid: false
    };

    // Save to Firestore
    try {
      await setDoc(doc(db, 'chats', newMsg.id), newMsg);
    } catch (e) {
      console.warn("Firestore chat write error, saving locally:", e);
      setChatMessages(prev => [...prev, newMsg]);
    }
  }, [currentUser, activeAuctionId]);

  // Seller registration wizard submission
  const createListing = useCallback(async (
    listingData: Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>,
    videoFile?: File | Blob | null,
    thumbnailFile?: File | Blob | null,
    onProgress?: (progress: number, stage: 'video' | 'thumbnail' | 'saving') => void,
    initialStatus: string = 'processing'
  ) => {
    if (!currentUser) {
      const errMsg = language === 'ar' ? 'يجب تسجيل الدخول لرفع المزاد.' : 'User must be logged in to upload a listing.';
      addNotification(language === 'ar' ? '❌ خطأ' : '❌ Error', errMsg, 'alert');
      // No toast here: the thrown error is displayed by the listing UIs.
      throw new Error(errMsg);
    }

    const newListingId = `auction-new-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // رفع الفيديو لـ Firebase Storage أولاً
    let finalVideoUrl = listingData.videoUrl || '';
    let finalThumbnailUrl = listingData.thumbnailUrl || '';

    // Helper to upload files with robust self-healing fallback retry
    const uploadWithFallback = async (
      file: File | Blob,
      pathPrefix: 'auction-videos' | 'auction-thumbnails',
      defaultName: string,
      contentTypeDefault: string,
      onProgressLocal?: (progress: number) => void
    ): Promise<string> => {
      const { ref, uploadBytesResumable, getDownloadURL, getStorage } = await import('firebase/storage');
      const { getFirebaseStorage } = await import('../services/firebase');
      
      const storage = await getFirebaseStorage();
      const fileName = (file as any).name || defaultName;
      const cleanPath = `${pathPrefix}/${Date.now()}_${fileName}`;
      const metadata = {
        contentType: (file as any).type && (file as any).type.trim() !== ''
          ? (file as any).type
          : contentTypeDefault
      };

      // Try primary bucket first
      try {
        console.log(`Attempting upload to primary bucket at path: ${cleanPath}...`);
        const primaryRef = ref(storage, cleanPath);
        const uploadTask = uploadBytesResumable(primaryRef, file, metadata);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              if (onProgressLocal) onProgressLocal(progress);
            },
            (error) => reject(error),
            () => resolve()
          );
        });
        return await getDownloadURL(uploadTask.snapshot.ref);
      } catch (primaryErr: any) {
        console.warn(`Primary storage bucket upload failed (Code: ${primaryErr.code || 'unknown'}). Retrying with older fallback bucket gs://mazadjoapp.appspot.com...`);
        
        try {
          // Initialize storage instance with fallback bucket
          const fallbackStorage = getStorage(storage.app, "gs://mazadjoapp.appspot.com");
          const fallbackRef = ref(fallbackStorage, cleanPath);
          const uploadTaskFallback = uploadBytesResumable(fallbackRef, file, metadata);
          
          if (onProgressLocal) onProgressLocal(0); // Reset progress for retry
          
          await new Promise<void>((resolve, reject) => {
            uploadTaskFallback.on('state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (onProgressLocal) onProgressLocal(progress);
              },
              (error) => reject(error),
              () => resolve()
            );
          });
          return await getDownloadURL(uploadTaskFallback.snapshot.ref);
        } catch (fallbackErr: any) {
          console.error("Firebase Storage write failure during upload retry:", fallbackErr.code, fallbackErr.message);
          throw fallbackErr;
        }
      }
    };

    if (videoFile) {
      try {
        if (onProgress) onProgress(0, 'video');
        finalVideoUrl = await uploadWithFallback(
          videoFile,
          'auction-videos',
          `${Date.now()}_video.mp4`,
          'video/mp4',
          (progress) => {
            if (onProgress) onProgress(progress, 'video');
          }
        );
      } catch (videoErr: any) {
        console.error("Final Firebase Storage write failure during video upload. Code:", videoErr.code, "Message:", videoErr.message);
        const code = videoErr.code || 'storage/unknown';
        const errorMsg = language === 'ar'
          ? `فشل رفع الفيديو (${code}). لم يُنشر المزاد — حاول مجدداً.`
          : `Video upload failed (${code}). Auction not published — please try again.`;

        addNotification(
          language === 'ar' ? '❌ فشل الرفع' : '❌ Upload Failed',
          errorMsg,
          'alert'
        );
        throw new Error(errorMsg);
      }
    }

    if (thumbnailFile) {
      try {
        if (onProgress) onProgress(0, 'thumbnail');
        finalThumbnailUrl = await uploadWithFallback(
          thumbnailFile,
          'auction-thumbnails',
          `${Date.now()}_thumbnail.jpg`,
          'image/jpeg',
          (progress) => {
            if (onProgress) onProgress(progress, 'thumbnail');
          }
        );
      } catch (thumbErr: any) {
        console.error("Final Firebase Storage write failure during thumbnail upload. Code:", thumbErr.code, "Message:", thumbErr.message);
        const code = thumbErr.code || 'storage/unknown';
        const errorMsg = language === 'ar'
          ? `فشل رفع الصورة المصغرة (${code}). لم يُنشر المزاد — حاول مجدداً.`
          : `Thumbnail upload failed (${code}). Auction not published — please try again.`;

        addNotification(
          language === 'ar' ? '❌ فشل الرفع' : '❌ Upload Failed',
          errorMsg,
          'alert'
        );
        throw new Error(errorMsg);
      }
    }

    if (!finalThumbnailUrl) {
      const cat = (listingData.category || '').toLowerCase();
      if (cat.includes('vehicle') || cat.includes('car') || cat.includes('سيارات') || cat.includes('مركبات')) {
        finalThumbnailUrl = 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=500&auto=format&fit=crop&q=60';
      } else if (cat.includes('luxury') || cat.includes('watch') || cat.includes('ساعات') || cat.includes('فاخر')) {
        finalThumbnailUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60';
      } else if (cat.includes('electronic') || cat.includes('phone') || cat.includes('هواتف') || cat.includes('أجهزة')) {
        finalThumbnailUrl = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=60';
      } else {
        finalThumbnailUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=60';
      }
    }

    if (onProgress) onProgress(100, 'saving');

    const endTimeMs = (listingData as any).endTime || (listingData as any).endsAt || (Date.now() + 3600 * 1000);
    const newListing: any = {
      ...listingData,
      id: newListingId,
      currentPrice: listingData.startingPrice,
      sellerId: currentUser.id,
      sellerName: currentUser.name || sellerProfile?.storeName || 'Custom Merchant',
      sellerLogo: currentUser.avatar || sellerProfile?.storeLogo || 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=150&q=80',
      status: initialStatus, // Save under the requested status (default 'processing' = awaiting Mazad review) so Admin can approve/reject
      // Concierge flag (a.k.a. listedByMazad): true only when the seller asked
      // Mazad to build the listing — the admin queue badges these so the team
      // completes details before approving. Defaults to false.
      isConcierge: (listingData as any).isConcierge === true,
      channel: listingData.channel ?? 'misc',
      scheduledStartAt: listingData.scheduledStartAt ?? null,
      approvalStatus: 'pending',
      isApproved: false,
      isFeatured: false,
      totalBids: 0,
      viewersCount: 0,
      createdAt: new Date().getTime(),
      createdById: currentUser.id, // Strictly match currentUser.id to comply with firestore.rules
      createdByName: currentUser.name || 'Seller JO',
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      endTime: endTimeMs,
      endsAt: Timestamp.fromMillis(endTimeMs)
    };

    // Save directly to Firestore for real-time synchronization
    const docRef = doc(db, 'auctions', newListingId);
    try {
      await setDoc(docRef, newListing);
      console.log("Auction created", newListing);
      // Log auction created event to Firestore Analytics
      logAnalyticsEvent('auction_created', currentUser.id, currentUser.email || null, {
        auctionId: newListingId,
        title: listingData.title,
        startingPrice: listingData.startingPrice,
        category: listingData.category
      });
    } catch (dbErr: any) {
      console.error("Direct auction write to Firestore failed. Code:", dbErr.code, "Message:", dbErr.message);
      const saveFailTitle = language === 'ar' ? '❌ فشل حفظ المزاد' : '❌ Auction Save Failed';
      const saveFailMsg = language === 'ar' ? `فشل تسجيل المزاد الجديد بقاعدة البيانات. رمز الخطأ: ${dbErr.code || 'unknown'}` : `Failed to create auction. Code: ${dbErr.code || 'unknown'}`;
      addNotification(saveFailTitle, saveFailMsg, 'alert');
      showToast({ title: saveFailTitle, message: saveFailMsg, type: 'warn' });
      handleFirestoreError(dbErr, OperationType.CREATE, `auctions/${newListingId}`);
    }

    setAuctions(prev => [newListing, ...prev]);
    
    if (language === 'ar') {
      addNotification(
        '⏳ المزاد بانتظار موافقة الإدارة',
        `تم رفع "${listingData.title}" بنجاح وهو الآن بانتظار مراجعة الإدارة والموافقة عليه قبل البث العام.`,
        'win'
      );
    } else {
      addNotification(
        '⏳ Auction Awaiting Review',
        `"${listingData.title}" has been successfully uploaded and is pending admin approval before public release.`,
        'win'
      );
    }

    return newListingId;
  }, [sellerProfile, currentUser, addNotification, showToast, language]);

  // --- ADMIN ACTIONS ---

  // Approval-gate verdicts must reach the SELLER, not the admin who clicked.
  // Local addNotification only feeds the current session's bell, so verdicts
  // are written to the cross-user /notifications collection (the same
  // mechanism orderWorkflow uses; Seller Center + the bell subscribe to it).
  // Bilingual fields are stored so the seller's device renders its own language.
  const notifySellerOfListingDecision = useCallback((
    sellerId: string | undefined,
    auctionId: string,
    strings: { titleAr: string; titleEn: string; descAr: string; descEn: string }
  ) => {
    if (!sellerId) return;
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    // firestore.rules caps notification titles at 300 and descriptions at 500
    // chars (anti-phishing) — clamp defensively so an extreme title/reason
    // combination can never make the verdict write bounce off the rules.
    const clampT = (s: string) => s.slice(0, 300);
    const clampD = (s: string) => s.slice(0, 500);
    // Type 'order' — a user-facing type from the Wave D allowlist, so the
    // verdict actually reaches the seller's bell ('admin'/'alert' are filtered).
    setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: sellerId,
      title: clampT(strings.titleAr),
      titleAr: clampT(strings.titleAr),
      titleEn: clampT(strings.titleEn),
      description: clampD(strings.descAr),
      descriptionAr: clampD(strings.descAr),
      descriptionEn: clampD(strings.descEn),
      type: 'order',
      priority: 'high',
      timestamp: Date.now(),
      read: false,
      auctionId
    }).catch(err => {
      console.warn('Failed to write seller listing-decision notification:', err?.code, err?.message);
    });
  }, []);

  const approveListing = useCallback(async (id: string) => {
    // Find the target auction to respect its duration (e.g. 6 hours / 10 minutes etc.)
    // Fall back to a direct Firestore read for admin surfaces (e.g. AdminPanel)
    // that render outside the context auctions subscription.
    let targetA: any = auctions.find(a => a.id === id);
    if (!targetA) {
      try {
        const snap = await getDoc(doc(db, 'auctions', id));
        if (snap.exists()) targetA = { id: snap.id, ...snap.data() };
      } catch { /* defaults below still apply */ }
    }
    const durationSec = targetA?.duration ? Number(targetA.duration) : 600; // fallback to 10 minutes (600s)
    const freshEndTime = Date.now() + durationSec * 1000;
    const endsAtTimestamp = Timestamp.fromMillis(freshEndTime);

    // Re-baseline the live price to the (possibly corrected) starting price.
    // A seller who resubmits a rejected item with a fixed price only changes
    // startingPrice — currentPrice is frozen by the rules for non-admins — so
    // without this the auction would go live showing the stale old price.
    // Only the admin path can write currentPrice, and only before any bids exist.
    const startBaseline = Number(targetA?.startingPrice);
    const priceReset =
      Number.isFinite(startBaseline) && Number(targetA?.totalBids || 0) === 0
        ? { currentPrice: startBaseline }
        : {};

    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      status: 'live',
      approvalStatus: 'approved',
      isApproved: true,
      approvedAt: serverTimestamp(),
      approvedBy: currentUser?.id || 'admin-system',
      endTime: freshEndTime, // Respect the real duration (e.g. 6 hours)
      endsAt: endsAtTimestamp,
      ...priceReset
    }).then(() => {
      // Tell the seller their listing passed the gate — ONLY once the status
      // write actually settled (a failed write must not claim "now live").
      notifySellerOfListingDecision(targetA?.sellerId || targetA?.createdById, id, {
        titleAr: 'تمت الموافقة على مزادك ✅',
        titleEn: 'Your auction is approved ✅',
        descAr: `مزادك "${targetA?.title || ''}" صار مباشر الآن — بالتوفيق!`,
        descEn: `Your auction "${targetA?.title || ''}" is now live — good luck!`
      });
    }).catch(err => {
      console.error("Firestore approve write failed. Code:", err.code, "Message:", err.message, err);
      addNotification(
        language === 'ar' ? '❌ فشل اعتماد المزاد' : '❌ Approve Listing Failed',
        `Code: ${err.code || 'unknown'}. Message: ${err.message || 'unknown'}`,
        'alert'
      );
    });

    setAuctions(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, status: 'live', approvalStatus: 'approved', isApproved: true, endTime: freshEndTime, endsAt: endsAtTimestamp, ...priceReset };
      }
      return a;
    }));

    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'approve_listing',
      targetId: id,
      targetName: targetA?.title || 'Unknown Item',
      adminName: currentUser?.name || 'Admin',
      timestamp: Date.now(),
      details: 'Visual stream quality & price guide certified.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [auctions, currentUser, addNotification, language, notifySellerOfListingDecision]);

  const rejectListing = useCallback(async (id: string, reason?: string) => {
    const trimmedReason = (reason || '').trim();
    // Resolve the target for the seller notification — direct read fallback
    // for admin surfaces rendered outside the context auctions subscription.
    let targetA: any = auctions.find(a => a.id === id);
    if (!targetA) {
      try {
        const snap = await getDoc(doc(db, 'auctions', id));
        if (snap.exists()) targetA = { id: snap.id, ...snap.data() };
      } catch { /* notification falls back to empty title */ }
    }

    // Write reject properties directly to Firestore database
    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      status: 'rejected',
      approvalStatus: 'rejected',
      isApproved: false,
      rejectionReason: trimmedReason,
      rejectedAt: serverTimestamp(),
      rejectedBy: currentUser?.id || 'admin-system'
    }).then(() => {
      // Tell the seller their listing was declined — including why — ONLY
      // after the status write settled (no verdict on a failed write).
      notifySellerOfListingDecision(targetA?.sellerId || targetA?.createdById, id, {
        titleAr: 'مزادك ما تم قبوله',
        titleEn: "Your listing wasn't approved",
        descAr: `للأسف ما تمت الموافقة على "${targetA?.title || ''}".${trimmedReason ? ` السبب: ${trimmedReason}` : ''}`,
        descEn: `Unfortunately "${targetA?.title || ''}" wasn't approved.${trimmedReason ? ` Reason: ${trimmedReason}` : ''}`
      });
    }).catch(err => {
      console.error("Firestore reject write failed. Code:", err.code, "Message:", err.message, err);
      addNotification(
        language === 'ar' ? '❌ فشل رفض المزاد' : '❌ Reject Listing Failed',
        `Code: ${err.code || 'unknown'}. Message: ${err.message || 'unknown'}`,
        'alert'
      );
    });

    setAuctions(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, status: 'rejected', approvalStatus: 'rejected', isApproved: false, rejectionReason: trimmedReason };
      }
      return a;
    }));

    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'reject_listing',
      targetId: id,
      targetName: targetA?.title || 'Unknown Item',
      adminName: currentUser?.name || 'Admin',
      timestamp: Date.now(),
      details: trimmedReason ? `Rejected: ${trimmedReason}` : 'Rejected without a stated reason.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [auctions, currentUser, addNotification, language, notifySellerOfListingDecision]);

  const verifySeller = useCallback(async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isVerified: true });
      
      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', userId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, { isVerifiedMerchant: true });
      }
    } catch (err: any) {
      console.error("Failed to persist seller verification:", err.code, err.message);
      addNotification('❌ Error', 'Failed to verify seller. Please try again.', 'alert');
      return;
    }

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
      adminName: currentUser?.name || 'Admin',
      timestamp: Date.now(),
      details: 'Submited company license validated.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [users, currentUser, addNotification]);

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
      adminName: currentUser?.name || 'Admin',
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
  const releaseEscrow = useCallback(async (escrowId: string) => {
    try {
      const releaseCallable = await getCallableFunction<{ escrowId: string }, { success: boolean; message: string }>('releaseEscrow');
      const result = await releaseCallable({ escrowId });
      if (result.data.success) {
        addNotification(
          '🤝 Escrow Funds Released',
          `The escrow transaction has been approved and settled successfully.`,
          'info'
        );
      }
    } catch (error: any) {
      console.error("Cloud function releaseEscrow failed:", error);
      addNotification('❌ Release Error', error.message || 'Failed to release escrow.', 'alert');
    }
  }, [addNotification]);

  const refundEscrow = useCallback(async (escrowId: string) => {
    try {
      const refundCallable = await getCallableFunction<{ escrowId: string }, { success: boolean; message: string }>('refundEscrow');
      const result = await refundCallable({ escrowId });
      if (result.data.success) {
        addNotification(
          '🛡️ Escrow Refunded Successfully',
          `Secured funds have been returned to user's available balance.`,
          'refund'
        );
      }
    } catch (error: any) {
      console.error("Cloud function refundEscrow failed:", error);
      addNotification('❌ Refund Error', error.message || 'Failed to refund escrow.', 'alert');
    }
  }, [addNotification]);

  const repairEndedAuctionOrder = useCallback(async (auctionId: string) => {
    try {
      const repairCallable = await getCallableFunction<{ auctionId: string }, { success: boolean; message: string }>('repairEndedAuctionOrder');
      const result = await repairCallable({ auctionId });
      if (result.data.success) {
        addNotification(
          '🔧 Order Repaired Successfully',
          result.data.message || `Order created for auction ${auctionId}.`,
          'info'
        );
        return { success: true, message: result.data.message };
      }
      return { success: false, message: result.data.message || 'Failed to repair order.' };
    } catch (error: any) {
      console.error("Cloud function repairEndedAuctionOrder failed:", error);
      addNotification('❌ Repair Error', error.message || 'Failed to repair ended auction order.', 'alert');
      return { success: false, message: error.message || 'Failed to repair order.' };
    }
  }, [addNotification]);

  const repairStuckEscrowsForEndedAuction = useCallback(async (auctionId: string) => {
    try {
      const repairCallable = await getCallableFunction<{ auctionId: string }, { success: boolean; message: string; refundedCount?: number; totalRefundedAmount?: number; keptWinnerEscrow?: boolean }>('repairStuckEscrowsForEndedAuction');
      const result = await repairCallable({ auctionId });
      if (result.data.success) {
        addNotification(
          '🔒 Escrows Repaired Successfully',
          result.data.message || `Stuck escrows processed for auction ${auctionId}.`,
          'info'
        );
        return { 
          success: true, 
          message: result.data.message,
          refundedCount: result.data.refundedCount,
          totalRefundedAmount: result.data.totalRefundedAmount,
          keptWinnerEscrow: result.data.keptWinnerEscrow
        };
      }
      return { success: false, message: result.data.message || 'تعذر تنفيذ العملية حالياً، حاول مرة أخرى لاحقاً' };
    } catch (error: any) {
      console.error("Cloud function repairStuckEscrowsForEndedAuction failed:", error);
      addNotification('❌ Escrow Repair Error', 'تعذر تنفيذ العملية حالياً، حاول مرة أخرى لاحقاً', 'alert');
      return { success: false, message: 'تعذر تنفيذ العملية حالياً، حاول مرة أخرى لاحقاً' };
    }
  }, [addNotification]);

  const approveWithdrawal = useCallback(async (withdrawalId: string) => {
    try {
      const approveCallable = await getCallableFunction<{ withdrawalId: string }, { success: boolean; message: string }>('approveWithdrawal');
      const result = await approveCallable({ withdrawalId });
      if (result.data.success) {
        addNotification(
          language === 'ar' ? '💸 تم قبول طلب السحب' : '💸 Withdrawal Approved',
          result.data.message || (language === 'ar' ? 'تمت الموافقة على طلب السحب بنجاح.' : 'Withdrawal approved successfully.'),
          'info'
        );
        return { success: true, message: result.data.message };
      }
      return { success: false, message: result.data.message || 'Failed to approve withdrawal.' };
    } catch (error: any) {
      console.error("Cloud function approveWithdrawal failed:", error);
      addNotification(
        language === 'ar' ? '❌ خطأ في الموافقة على طلب السحب' : '❌ Approval Error',
        error.message || 'Failed to approve withdrawal.',
        'alert'
      );
      return { success: false, message: error.message || 'Failed to approve withdrawal.' };
    }
  }, [addNotification, language]);

  const rejectWithdrawal = useCallback(async (withdrawalId: string, reason?: string) => {
    try {
      const rejectCallable = await getCallableFunction<{ withdrawalId: string; reason?: string }, { success: boolean; message: string }>('rejectWithdrawal');
      const result = await rejectCallable({ withdrawalId, reason });
      if (result.data.success) {
        addNotification(
          language === 'ar' ? '❌ تم رفض طلب السحب' : '❌ Withdrawal Rejected',
          result.data.message || (language === 'ar' ? 'تم رفض طلب السحب.' : 'Withdrawal rejected successfully.'),
          'info'
        );
        return { success: true, message: result.data.message };
      }
      return { success: false, message: result.data.message || 'Failed to reject withdrawal.' };
    } catch (error: any) {
      console.error("Cloud function rejectWithdrawal failed:", error);
      addNotification(
        language === 'ar' ? '❌ خطأ في رفض طلب السحب' : '❌ Rejection Error',
        error.message || 'Failed to reject withdrawal.',
        'alert'
      );
      return { success: false, message: error.message || 'Failed to reject withdrawal.' };
    }
  }, [addNotification, language]);

  const deleteAuction = useCallback(async (id: string) => {
    const targetA = auctions.find(a => a.id === id);
    
    // Optimistic instant local-only hiding to guarantee immediate disappearance
    setDeletedAuctionIds(prev => prev.includes(id) ? prev : [...prev, id]);

    try {
      await deleteDoc(doc(db, 'auctions', id));
    } catch (e) {
      console.warn("Firestore delete auction error:", e);
    }
    
    setAuctions(prev => prev.filter(a => a.id !== id));

    const action: AdminAction = {
      id: `admin-act-${Date.now()}-${Math.random()}`,
      actionType: 'delete_auction',
      targetId: id,
      targetName: targetA?.title || 'Unknown Item',
      adminName: currentUser?.name || 'Admin',
      timestamp: Date.now(),
      details: 'Administrator permanently removed listing from system.'
    };
    setAdminActions(prev => [action, ...prev]);

    addNotification(
      language === 'ar' ? '🗑️ تم مسح المزاد' : '🗑️ Auction Deleted',
      language === 'ar' 
        ? `قام المسؤول بمسح المزاد "${targetA?.title || ''}" نهائياً من المنصة.` 
        : `Administrator permanently deleted "${targetA?.title || ''}".`,
      'info'
    );
  }, [auctions, currentUser, language, addNotification, setDeletedAuctionIds]);


  // =========================================================
  // AUTOMATIC OUTBID REFUND CHECKER (GUARANTEES WALLET RETURN)
  // Whenever any live auction is outbid, we refund the user's locked escrow
  // =========================================================
  useEffect(() => {
    const activeUserId = currentUser?.id || 'user-current';
    auctions.forEach(auction => {
      if (auction.status === 'live' && auction.currentBidderId && auction.currentBidderId !== activeUserId) {
        // Look for the user's locked escrow for this specific auction
        const clientCommittedEscrow = escrows.find(
          e => e.auctionId === auction.id && e.bidderId === activeUserId && e.status === 'locked'
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
              // Typed 'outbid' (not 'alert'): a followed drop needing action is
              // one of the four bidder-relevant alert kinds (Wave D, spec §5) —
              // 'alert' collapses into the hidden internal 'admin' bucket.
              addNotification(
                language === 'ar' ? '⏳ الوقت يداهمك!' : '⏳ Watched Item Closing Soon!',
                language === 'ar'
                  ? `المزاد المتابع "${item.title}" ينتهي في أقل من 5 دقائق! قدم عرضاً الآن لتضمن الصدارة.`
                  : `Your watched item "${item.title}" ends in less than 5 minutes! Place a bid quickly!`,
                'outbid'
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

    const activeUserId = currentUser?.id || 'user-current';
    const triggerable = auctions.find(auction => {
      if (auction.status !== 'live') return false;
      if (auction.currentBidderId === activeUserId) return false;
      
      const maxBid = autoBids[auction.id];
      if (!maxBid) return false;

      const nextRequiredBid = minNextBid(auction.currentPrice, auction.minIncrement, auction.totalBids);
      return nextRequiredBid <= maxBid;
    });

    if (triggerable) {
      isAutoBiddingRef.current = true;
      const nextBid = minNextBid(triggerable.currentPrice, triggerable.minIncrement, triggerable.totalBids);
      
      const timer = setTimeout(() => {
        const res = placeBid(triggerable.id, nextBid);
        isAutoBiddingRef.current = false;
        if (res) {
          res.then(result => {
            if (result.success) {
              addNotification(
                language === 'ar' ? '🤖 نظام المزايد التلقائي' : '🤖 Auto-Bid system',
                language === 'ar'
                  ? `تم تقديم مزايدة تلقائية بقيمة ${nextBid} JOD للحفاظ على صدارتك في المزاد "${triggerable.title}".`
                  : `Auto-bid placed a counter-bid of ${nextBid} JOD on "${triggerable.title}" to secure your lead.`,
                'info'
              );
            }
          });
        }
      }, 1200);

      return () => {
        clearTimeout(timer);
        isAutoBiddingRef.current = false;
      };
    }
  }, [auctions, autoBids, placeBid, addNotification, language, currentUser]);

  const updateMaintenanceMode = useCallback(async (enabled: boolean, messageAr?: string, messageEn?: string, expectedDuration?: string) => {
    const maintenanceRef = doc(db, 'siteSettings', 'maintenanceMode');
    try {
      await setDoc(maintenanceRef, {
        enabled,
        messageAr: messageAr || 'المنصة خاضعة للصيانة المجدولة حالياً لتحديث أنظمة التشفير وحسابات الضمان بنظام كليك.',
        messageEn: messageEn || 'The platform is currently undergoing scheduled maintenance to upgrade security protocols and CliQ escrow systems.',
        expectedDuration: expectedDuration || '1 hr',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin'
      }, { merge: true });

      addNotification(
        '🔧 Maintenance Status Updated',
        `Maintenance mode is now ${enabled ? 'ENABLED' : 'DISABLED'}.`,
        'success'
      );
    } catch (err) {
      console.error("Error updating maintenance mode:", err);
      logSystemHealth('error', 'Failed to update Maintenance Mode', err instanceof Error ? err.message : String(err));
    }
  }, [currentUser, addNotification, logSystemHealth]);

  const updateFeatureFlag = useCallback(async (flag: string, value: boolean) => {
    const flagsRef = doc(db, 'siteSettings', 'featureFlags');
    try {
      await setDoc(flagsRef, {
        [flag]: value,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin'
      }, { merge: true });

      addNotification(
        '⚙️ Feature Flag Updated',
        `${flag} has been set to ${value ? 'ENABLED' : 'DISABLED'}.`,
        'success'
      );
    } catch (err) {
      console.error("Error updating feature flag:", err);
      logSystemHealth('error', `Failed to update Feature Flag: ${flag}`, err instanceof Error ? err.message : String(err));
    }
  }, [currentUser, addNotification, logSystemHealth]);

  const completeOnboarding = useCallback(async () => {
    if (currentUser && currentUser.id !== 'unauthenticated') {
      const userRef = doc(db, 'users', currentUser.id);
      try {
        await updateDoc(userRef, { onboardingCompleted: true });
        setCurrentUser(prev => ({ ...prev, onboardingCompleted: true }));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.id}`);
      }
    } else {
      localStorage.setItem('mazad_local_onboarding_completed', 'true');
      setCurrentUser(prev => ({ ...prev, onboardingCompleted: true }));
    }
  }, [currentUser]);

  const resetOnboarding = useCallback(async (userId?: string) => {
    const targetUserId = userId || (currentUser && currentUser.id !== 'unauthenticated' ? currentUser.id : null);
    if (targetUserId) {
      const userRef = doc(db, 'users', targetUserId);
      try {
        await updateDoc(userRef, { onboardingCompleted: false });
        if (currentUser && currentUser.id === targetUserId) {
          // Clear the session latch so the modal can re-show immediately after a reset
          sessionStorage.removeItem('mazad_onboarding_dismissed');
          setCurrentUser(prev => ({ ...prev, onboardingCompleted: false }));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${targetUserId}`);
      }
    } else {
      localStorage.removeItem('mazad_local_onboarding_completed');
      sessionStorage.removeItem('mazad_onboarding_dismissed');
      setCurrentUser(prev => ({ ...prev, onboardingCompleted: false }));
    }
  }, [currentUser]);

  const markHintAsShown = useCallback(async (hintKey: string) => {
    const updatedHints = {
      ...(currentUser?.shownHints || {}),
      [hintKey]: true
    };

    if (currentUser && currentUser.id !== 'unauthenticated') {
      const userRef = doc(db, 'users', currentUser.id);
      try {
        await updateDoc(userRef, { shownHints: updatedHints });
        setCurrentUser(prev => ({ ...prev, shownHints: updatedHints }));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.id}`);
      }
    } else {
      localStorage.setItem('mazad_local_shown_hints', JSON.stringify(updatedHints));
      setCurrentUser(prev => ({ ...prev, shownHints: updatedHints }));
    }
  }, [currentUser]);

  // Trust System Operations Implementation
  const submitVerificationRequest = useCallback(async (
    requestedStatus: 'verified' | 'premium_verified', 
    notes?: string,
    idFrontUrl?: string,
    idBackUrl?: string,
    passportUrl?: string
  ) => {
    try {
      const id = `ver-req-${Date.now()}`;
      const reqData: VerificationRequest = {
        id,
        userId: currentUser.id,
        sellerName: currentUser.name,
        status: 'pending',
        requestedStatus,
        submittedAt: Date.now(),
        notes: notes || '',
        idFrontUrl: idFrontUrl || '',
        idBackUrl: idBackUrl || '',
        passportUrl: passportUrl || '',
        businessLicenseUrl: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500',
        nationalIdUrl: 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?w=500'
      };
      
      await setDoc(doc(db, 'sellerVerificationRequests', id), reqData);

      // Update the user document to pending in firestore
      await updateDoc(doc(db, 'users', currentUser.id), {
        verificationStatus: 'pending'
      });

      // Update seller profile status to pending
      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', currentUser.id), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, {
          verificationStatus: 'pending'
        });
      }
      
      addNotification(
        language === 'ar' ? '📨 تم تقديم طلب التوثيق' : '📨 Verification Request Submitted',
        language === 'ar' ? 'طلبك قيد المراجعة الآن من قبل إدارة المنصة.' : 'Your request is now pending review by platform moderators.',
        'success'
      );
      return { success: true, message: 'Submitted successfully' };
    } catch (err: any) {
      console.error("Verification submit error:", err);
      return { success: false, message: err.message };
    }
  }, [currentUser, language, addNotification]);

  const submitSellerReview = useCallback(async (sellerId: string, auctionId: string, auctionTitle: string, rating: number, comment: string, photos?: string[]) => {
    try {
      const id = `rev-${Date.now()}`;
      const revData: Review = {
        id,
        sellerId,
        buyerId: currentUser.id,
        buyerName: currentUser.name,
        buyerAvatar: currentUser.avatar,
        rating,
        comment,
        timestamp: Date.now(),
        auctionTitle,
        auctionId,
        photos: photos || []
      };

      await setDoc(doc(db, 'reviews', id), revData);

      // Recalculate average rating for seller
      const allReviewsSnap = await getDocs(query(collection(db, 'reviews'), where('sellerId', '==', sellerId)));
      const reviewsList: Review[] = [];
      allReviewsSnap.forEach(d => reviewsList.push(d.data() as Review));
      if (!reviewsList.find(r => r.id === id)) {
        reviewsList.push(revData);
      }
      const averageRating = reviewsList.reduce((sum, r) => sum + r.rating, 0) / reviewsList.length;

      // Update the seller profile in Firestore
      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', sellerId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, {
          rating: parseFloat(averageRating.toFixed(1)),
          reviewCount: reviewsList.length
        });
      }

      addNotification(
        language === 'ar' ? '⭐ شكراً لتقييمك!' : '⭐ Thanks for your review!',
        language === 'ar' ? 'تمت إضافة تقييمك بنجاح إلى ملف البائع.' : 'Your rating was successfully added to the seller profile.',
        'success'
      );
      return { success: true, message: 'Review added successfully' };
    } catch (err: any) {
      console.error("Review submit error:", err);
      return { success: false, message: err.message };
    }
  }, [currentUser, language, addNotification]);

  const submitSellerReport = useCallback(async (sellerId: string, sellerName: string, reason: SellerReport['reason'], description: string) => {
    try {
      const id = `rep-${Date.now()}`;
      const repData: SellerReport = {
        id,
        reporterId: currentUser.id,
        reporterName: currentUser.name,
        sellerId,
        sellerName,
        reason,
        description,
        timestamp: Date.now(),
        status: 'pending'
      };

      await setDoc(doc(db, 'sellerReports', id), repData);

      addNotification(
        language === 'ar' ? '🚨 تم تقديم البلاغ' : '🚨 Report Submitted',
        language === 'ar' ? 'شكرًا لمساعدتنا في الحفاظ على أمان المنصة. ستقوم الإدارة بمراجعته.' : 'Thank you for helping keep our platform safe. Admins will review this report.',
        'info'
      );
      return { success: true, message: 'Report submitted' };
    } catch (err: any) {
      console.error("Report submit error:", err);
      return { success: false, message: err.message };
    }
  }, [currentUser, language, addNotification]);

  const submitDispute = useCallback(async (orderId: string, description: string, photos: string[], videos: string[]) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error("Order not found");

      const id = `disp-${Date.now()}`;
      const disputeData: Dispute = {
        id,
        orderId,
        buyerId: currentUser.id,
        buyerName: currentUser.name,
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        amount: order.winningBidAmount,
        description,
        photos,
        videos,
        status: 'open',
        timestamp: Date.now()
      };

      await setDoc(doc(db, 'disputes', id), disputeData);
      
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'disputed'
      });

      const disputeTitle = language === 'ar' ? '⚠️ تم فتح نزاع' : '⚠️ Dispute Opened';
      const disputeMsg = language === 'ar' ? 'تم تسجيل النزاع بنجاح. سيقوم المشرف بمراجعته والبت فيه.' : 'The dispute has been registered. An admin will review and resolve it.';
      addNotification(disputeTitle, disputeMsg, 'alert');
      // The 'alert' bucket is hidden from the user bell (Wave D) — confirm transiently.
      showToast({ title: disputeTitle, message: disputeMsg, type: 'success' });
      return { success: true, message: 'Dispute opened' };
    } catch (err: any) {
      console.error("Dispute submit error:", err);
      return { success: false, message: err.message };
    }
  }, [currentUser, orders, language, addNotification, showToast]);

  const respondToDispute = useCallback(async (disputeId: string, response: string) => {
    try {
      await updateDoc(doc(db, 'disputes', disputeId), {
        sellerResponse: response,
        sellerRespondedAt: Date.now()
      });

      addNotification(
        language === 'ar' ? '💬 تم تقديم الرد' : '💬 Response Submitted',
        language === 'ar' ? 'تم إرسال ردك على النزاع بنجاح إلى الإدارة.' : 'Your dispute response has been sent to the admins.',
        'success'
      );
      return { success: true, message: 'Responded successfully' };
    } catch (err: any) {
      console.error("Dispute respond error:", err);
      return { success: false, message: err.message };
    }
  }, [language, addNotification]);

  const respondToReview = useCallback(async (reviewId: string, response: string) => {
    try {
      await updateDoc(doc(db, 'reviews', reviewId), {
        response,
        responseAt: Date.now()
      });

      addNotification(
        language === 'ar' ? '💬 تم الرد على التقييم' : '💬 Review Replied',
        language === 'ar' ? 'تم نشر ردك على التقييم.' : 'Your response to the review has been posted.',
        'success'
      );
      return { success: true, message: 'Review response submitted' };
    } catch (err: any) {
      console.error("Review respond error:", err);
      return { success: false, message: err.message };
    }
  }, [language, addNotification]);

  const resolveDispute = useCallback(async (disputeId: string, resolution: 'refund' | 'release') => {
    try {
      const dispute = disputes.find(d => d.id === disputeId);
      if (!dispute) throw new Error("Dispute not found");

      const resolvedStatus = resolution === 'refund' ? 'resolved_refunded' : 'resolved_released';
      
      await updateDoc(doc(db, 'disputes', disputeId), {
        status: resolvedStatus,
        resolvedAt: Date.now(),
        resolverName: currentUser?.name || 'Admin'
      });

      await updateDoc(doc(db, 'orders', dispute.orderId), {
        status: resolution === 'refund' ? 'refunded' : 'completed',
        escrowStatus: resolution === 'refund' ? 'refunded' : 'released'
      });

      addNotification(
        '⚖️ Dispute Resolved',
        `Dispute resolved with resolution: ${resolution === 'refund' ? 'REFUND BUYER' : 'RELEASE TO SELLER'}.`,
        'success'
      );
      return { success: true, message: 'Dispute resolved successfully' };
    } catch (err: any) {
      console.error("Resolve dispute error:", err);
      return { success: false, message: err.message };
    }
  }, [currentUser, disputes, addNotification]);

  const approveVerificationRequest = useCallback(async (requestId: string) => {
    try {
      const req = verificationRequests.find(r => r.id === requestId);
      if (!req) throw new Error("Verification request not found");

      await updateDoc(doc(db, 'sellerVerificationRequests', requestId), {
        status: 'approved'
      });

      await updateDoc(doc(db, 'users', req.userId), {
        isVerified: true,
        verificationStatus: req.requestedStatus
      });

      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', req.userId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, {
          isVerifiedMerchant: true,
          verificationStatus: req.requestedStatus,
          badges: ['Verified', req.requestedStatus === 'premium_verified' ? 'Premium Seller' : 'Verified']
        });
      }

      addNotification(
        '✅ Seller Verification Approved',
        `Approved seller ${req.sellerName} as ${req.requestedStatus.toUpperCase()}.`,
        'success'
      );
      return { success: true, message: 'Approved successfully' };
    } catch (err: any) {
      console.error("Approve verification request error:", err);
      return { success: false, message: err.message };
    }
  }, [verificationRequests, addNotification]);

  const rejectVerificationRequest = useCallback(async (requestId: string) => {
    try {
      const req = verificationRequests.find(r => r.id === requestId);
      if (!req) throw new Error("Verification request not found");

      await updateDoc(doc(db, 'sellerVerificationRequests', requestId), {
        status: 'rejected'
      });

      await updateDoc(doc(db, 'users', req.userId), {
        verificationStatus: 'not_verified'
      });

      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', req.userId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, {
          verificationStatus: 'not_verified'
        });
      }

      addNotification(
        '❌ Seller Verification Rejected',
        `Rejected verification request for seller ${req.sellerName}.`,
        'info'
      );
      return { success: true, message: 'Rejected successfully' };
    } catch (err: any) {
      console.error("Reject verification request error:", err);
      return { success: false, message: err.message };
    }
  }, [verificationRequests, addNotification]);

  const suspendSeller = useCallback(async (userId: string, suspend: boolean) => {
    try {
      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', userId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, {
          isSuspended: suspend
        });
      }

      await updateDoc(doc(db, 'users', userId), {
        isBlocked: suspend,
        accountStatus: suspend ? 'blocked' : 'active'
      });

      addNotification(
        '🚫 Seller Status Updated',
        `Seller ${suspend ? 'SUSPENDED' : 'ACTIVATED'} successfully.`,
        'success'
      );
      return { success: true, message: 'Seller status updated successfully' };
    } catch (err: any) {
      console.error("Suspend seller error:", err);
      return { success: false, message: err.message };
    }
  }, [addNotification]);

  const removeSellerBadge = useCallback(async (userId: string, badgeName: string) => {
    try {
      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', userId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        const profileData = profileSnap.docs[0].data() as SellerProfile;
        const currentBadges = profileData.badges || [];
        const updatedBadges = currentBadges.filter(b => b !== badgeName);
        await updateDoc(profileSnap.docs[0].ref, {
          badges: updatedBadges
        });
      }

      addNotification(
        '🏅 Badge Removed',
        `Badge "${badgeName}" removed from seller profile.`,
        'info'
      );
      return { success: true, message: 'Badge removed' };
    } catch (err: any) {
      console.error("Remove badge error:", err);
      return { success: false, message: err.message };
    }
  }, [addNotification]);

  const resetSellerTrustScore = useCallback(async (userId: string) => {
    try {
      const profileQuery = query(collection(db, 'sellerProfiles'), where('userId', '==', userId), limit(1));
      const profileSnap = await getDocs(profileQuery);
      if (!profileSnap.empty) {
        await updateDoc(profileSnap.docs[0].ref, {
          trustScore: 50
        });
      }

      addNotification(
        '♻️ Trust Score Reset',
        `Reset seller trust score to 50 (baseline).`,
        'success'
      );
      return { success: true, message: 'Trust score reset' };
    } catch (err: any) {
      console.error("Reset trust score error:", err);
      return { success: false, message: err.message };
    }
  }, [addNotification]);

  const visibleAuctions = auctions.filter(a => !deletedAuctionIds.includes(a.id));

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser,
      sellerProfile, setSellerProfile,
      users, setUsers,
      sellerProfiles, setSellerProfiles,
      auctions: visibleAuctions, setAuctions,
      auctionsLoaded,
      bids, setBids,
      wallet, setWallet,
      escrows, setEscrows,
      orders, setOrders,
      chatMessages, setChatMessages,
      notifications, setNotifications,
      adminActions, setAdminActions,
      adminActionsError,
      reviews,
      verificationRequests,
      sellerReports,
      disputes,
      myReviews,
      pendingReviewOrder,
      reviewPromptOrderId,
      setReviewPromptOrderId,
      activeAuctionId, setActiveAuctionId,
      activeView, setActiveView,
      globalWalletSubView, setGlobalWalletSubView,
      globalSelectedOrderId, setGlobalSelectedOrderId,
      placeBid,
      triggerCliQTopUp,
      requestWithdrawal,
      addNotification,
      markAsRead,
      markAllAsRead,
      approveListing,
      rejectListing,
      verifySeller,
      banUser,
      unbanUser,
      releaseEscrow,
      refundEscrow,
      deleteAuction,
      repairEndedAuctionOrder,
      repairStuckEscrowsForEndedAuction,
      approveWithdrawal,
      rejectWithdrawal,
      createListing,
      language,
      setLanguage,
      isAuthenticated,
      authReady,
      login,
      loginWithGoogle,
      loginWithPhone,
      confirmPhoneCode,
      logout,
      registerUser,
      subscribeUser,
      completeOnboarding,
      resetOnboarding,
      markHintAsShown,
      watchlist,
      toggleWatchlist,
      autoBids,
      setAutoBid,
      removeAutoBid,
      showSubscriptionPrompt,
      setShowSubscriptionPrompt,
      showNotifications,
      setShowNotifications,
      sendChatMessage,
      maintenanceMode,
      featureFlags,
      updateMaintenanceMode,
      updateFeatureFlag,
      systemHealthLogs,
      logSystemHealth,
      submitVerificationRequest,
      submitSellerReview,
      submitSellerReport,
      submitDispute,
      respondToDispute,
      respondToReview,
      resolveDispute,
      approveVerificationRequest,
      rejectVerificationRequest,
      suspendSeller,
      removeSellerBadge,
      resetSellerTrustScore
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
