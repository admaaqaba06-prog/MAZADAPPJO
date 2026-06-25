import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db, auth, functions, OperationType, handleFirestoreError } from '../services/firebase';
import { logAnalyticsEvent } from '../services/analyticsService';
import { httpsCallable } from 'firebase/functions';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, addDoc, getDoc, getDocs, serverTimestamp, updateDoc, deleteDoc, Timestamp, query, where, orderBy, limit } from 'firebase/firestore';
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
  adminActionsError?: string;

  // Active View State
  activeAuctionId: string | null;
  setActiveAuctionId: (id: string | null) => void;
  activeView: 'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about';
  setActiveView: (view: 'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about') => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;

  // Real-time Event Actions
  placeBid: (auctionId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  triggerCliQTopUp: (amount: number, alias: string, receiptName: string) => void;
  addNotification: (title: string, description: string, type: Notification['type']) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  
  // Admin Operations
  approveListing: (id: string) => void;
  rejectListing: (id: string) => void;
  verifySeller: (userId: string) => void;
  banUser: (userId: string) => void;
  unbanUser: (userId: string) => void;
  releaseEscrow: (escrowId: string) => void;
  refundEscrow: (escrowId: string) => void;
  deleteAuction: (id: string) => void;
  
  // Seller Listing Creation
  createListing: (
    listingData: Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>,
    videoFile?: File | Blob | null,
    thumbnailFile?: File | Blob | null
  ) => void;
  
  // Custom WebSocket Sim control
  isSimulating: boolean;
  setIsSimulating: React.Dispatch<React.SetStateAction<boolean>>;

  // AUTH & MULTILINGUAL & SUBSCRIPTION ADDITIONS
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  registerUser: (name: string, email: string, password?: string, phone?: string) => Promise<{ success: boolean; message: string }>;
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Core user states
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_UNAUTHENTICATED_USER);
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
    const parsed = saved ? JSON.parse(saved) : INITIAL_AUCTIONS;
    return parsed.map((item: any) => {
      const rawThumbnail = item.thumbnailUrl || item.imageUrl || '';
      if (!rawThumbnail || rawThumbnail === '' || rawThumbnail.startsWith('blob:')) {
        const cat = (item.category || '').toLowerCase();
        const tit = (item.title || '').toLowerCase();
        let finalThumbnail = rawThumbnail;
        if (cat.includes('elect') || tit.includes('iphone') || tit.includes('phone') || tit.includes('macbook') || tit.includes('tech') || tit.includes('workstation')) {
          finalThumbnail = 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&q=80';
        } else if (cat.includes('watch') || tit.includes('watch') || tit.includes('rolex') || tit.includes('submariner')) {
          finalThumbnail = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80';
        } else if (cat.includes('jewel') || tit.includes('jewel') || tit.includes('diamond') || tit.includes('gold') || tit.includes('ring')) {
          finalThumbnail = 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&q=80';
        } else if (cat.includes('fash') || cat.includes('luxur') || tit.includes('jacket') || tit.includes('bag') || cat.includes('cloth')) {
          finalThumbnail = 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80';
        } else {
          finalThumbnail = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80';
        }
        return { ...item, thumbnailUrl: finalThumbnail, imageUrl: finalThumbnail };
      }
      return item;
    });
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
  const [adminActionsError, setAdminActionsError] = useState<string | undefined>(undefined);

  const [deletedAuctionIds, setDeletedAuctionIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mazad_deleted_auctions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

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
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // AUTH, MULTILINGUAL, & SUBSCRIPTION ADDITIONS
  const [language, setLanguageState] = useState<'en' | 'ar'>(() => {
    return (localStorage.getItem('mazad_language') as 'en' | 'ar') || 'en';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // 1. Listen to Firebase Authentication Auth State changes
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
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
            const nameFromEmail = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User';
            const capitalizedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            
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
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(userRef, {
                id: uid,
                uid: uid,
                name: loadedUser.name,
                email: loadedUser.email,
                avatar: loadedUser.avatar,
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
                createdAt: new Date().toISOString()
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
            }
          } else {
            const fbData = userSnap.data();
            let loadedRole: 'admin' | 'user' = isAdminEmail ? 'admin' : 'user';
            
            if (isAdminEmail && fbData.role !== 'admin') {
              loadedRole = 'admin';
              try {
                await updateDoc(userRef, { role: 'admin', isAdmin: true });
              } catch (updateErr) {
                console.warn("Failed to automatically upgrade bootstrapped admin role in Firestore:", updateErr);
              }
            } else if (!isAdminEmail && fbData.role === 'admin') {
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
              isAdmin: isAdminEmail && (hasAdminClaim || fbData.role === 'admin' || fbData.isAdmin === true),
              accountStatus: fbData.accountStatus || 'active',
              isVerified: fbData.isVerified !== undefined ? fbData.isVerified : true,
              isBlocked: fbData.isBlocked !== undefined ? fbData.isBlocked : false,
              subscriptionStatus: fbData.subscriptionStatus || 'none',
              subscriptionExpiry: fbData.subscriptionExpiry || null,
              phoneNumber: fbData.phoneNumber || '',
              phone: fbData.phone || fbData.phoneNumber || '',
              city: fbData.city || '',
              createdAt: fbData.createdAt || new Date().toISOString()
            };
          }
          
          setCurrentUser(loadedUser);
          setIsAuthenticated(true);
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
        }
      } else {
        setCurrentUser(DEFAULT_UNAUTHENTICATED_USER);
        setIsAuthenticated(false);
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
          role: currentUser.role, // Strictly retain the claims-derived role
          isVerified: fbData.isVerified !== undefined ? fbData.isVerified : currentUser.isVerified,
          isBlocked: fbData.isBlocked !== undefined ? fbData.isBlocked : currentUser.isBlocked,
          subscriptionStatus: fbData.subscriptionStatus || currentUser.subscriptionStatus || 'none',
          subscriptionExpiry: fbData.subscriptionExpiry || currentUser.subscriptionExpiry || null,
          phoneNumber: fbData.phoneNumber || currentUser.phoneNumber || '',
          city: fbData.city || currentUser.city || '',
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
            const { httpsCallable } = await import('firebase/functions');
            const initWalletCallable = httpsCallable(functions, 'initializeUserWallet');
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
        // Divide by 1000 dynamically to convert fils (integers) to JOD (decimals) representation for the UI.
        const availableBalance = rawAvail / 1000;
        const escrowBalance = rawEscrow / 1000;
        setWallet({
          userId: data.userId || currentUser.id,
          availableBalance,
          escrowBalance,
          totalBalance: availableBalance + escrowBalance
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

  // Real-time auctions synchronization with Firestore
  useEffect(() => {
    const auctionsRefCol = collection(db, 'auctions');
    const unsub = onSnapshot(auctionsRefCol, (snap) => {
      if (snap.empty) {
        setAuctions([]);
      } else {
        const fetchedList: AuctionItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          let endTimeNum = Date.now() + 3600000;
          if (data.endsAt) {
            endTimeNum = typeof data.endsAt === 'number' ? data.endsAt : (data.endsAt.seconds ? data.endsAt.seconds * 1000 : Date.parse(data.endsAt));
          } else if (data.endTime) {
            endTimeNum = typeof data.endTime === 'number' ? data.endTime : (data.endTime.seconds ? data.endTime.seconds * 1000 : Date.parse(data.endTime));
            // Automatically migrate documents with old format in background to preserve sync integrity
            const docRef = doc(db, 'auctions', docSnap.id);
            updateDoc(docRef, {
              endsAt: Timestamp.fromMillis(endTimeNum)
            }).then(() => {
              console.log(`[Migration] Successfully set endsAt for old auction doc: ${docSnap.id}`);
            }).catch(e => {
              console.warn(`[Migration] Failed to migrate endsAt on ${docSnap.id}:`, e);
            });
          }
          const rawThumbnail = data.thumbnailUrl || data.imageUrl || '';
          let finalThumbnail = rawThumbnail;

          if (!rawThumbnail || rawThumbnail === '' || rawThumbnail.startsWith('blob:')) {
            const cat = (data.category || '').toLowerCase();
            const tit = (data.title || '').toLowerCase();
            if (cat.includes('elect') || tit.includes('iphone') || tit.includes('phone') || tit.includes('macbook') || tit.includes('tech') || tit.includes('workstation')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&q=80';
            } else if (cat.includes('watch') || tit.includes('watch') || tit.includes('rolex') || tit.includes('submariner')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80';
            } else if (cat.includes('jewel') || tit.includes('jewel') || tit.includes('diamond') || tit.includes('gold') || tit.includes('ring')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&q=80';
            } else if (cat.includes('fash') || cat.includes('luxur') || tit.includes('jacket') || tit.includes('bag') || cat.includes('cloth')) {
              finalThumbnail = 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80';
            } else {
              finalThumbnail = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80';
            }
          }

          const startingPrice = (data.startingPriceFils !== undefined ? data.startingPriceFils / 1000 : (data.startingPrice ?? 0));
          const currentPrice = (data.currentPriceFils !== undefined ? data.currentPriceFils / 1000 : (data.currentPrice ?? startingPrice));
          const minIncrement = (data.minIncrementFils !== undefined ? data.minIncrementFils / 1000 : (data.minIncrement ?? 10));

          const itemWithFallback = {
            id: docSnap.id,
            title: data.title || '',
            description: data.description || '',
            category: data.category || 'Luxury',
            startingPrice,
            currentPrice,
            minIncrement,
            currentBidderId: data.currentBidderId || null,
            currentBidderName: data.currentBidderName || null,
            videoUrl: data.videoUrl || '',
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
          } as any;

          itemWithFallback.thumbnailUrl = finalThumbnail;
          itemWithFallback.imageUrl = finalThumbnail;
          fetchedList.push(itemWithFallback as AuctionItem);
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
      console.warn("Firestore 'auctions' collection sync error:", err);
      setAuctions([]);
    });
    return () => unsub();
  }, []);

  // Real-time escrows synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) {
      return;
    }

    const isStrictAdmin = currentUser.email === 'admaaqaba06@gmail.com' && (currentUser.role === 'admin' || currentUser.isAdmin === true);
    if (isStrictAdmin) {
      const escrowsRefCol = collection(db, 'escrows');
      const unsub = onSnapshot(escrowsRefCol, (snap) => {
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
      // Standard user: listen to escrows where bidderId == userId or sellerId == userId
      const bidderEscrowsQuery = query(collection(db, 'escrows'), where('bidderId', '==', currentUser.id));
      const sellerEscrowsQuery = query(collection(db, 'escrows'), where('sellerId', '==', currentUser.id));

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
  }, [isAuthenticated, currentUser?.id, currentUser?.role]);

  // Real-time chats synchronization with Firestore
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const chatsRefCol = collection(db, 'chats');
    const unsub = onSnapshot(chatsRefCol, (snap) => {
      if (!snap.empty) {
        const fetchedChats: ChatMessage[] = [];
        snap.forEach((docSnap) => {
          fetchedChats.push({
            id: docSnap.id,
            ...docSnap.data()
          } as ChatMessage);
        });
        fetchedChats.sort((a, b) => a.timestamp - b.timestamp);
        setChatMessages(fetchedChats);
      } else {
        setChatMessages(INITIAL_CHATS);
      }
    }, (err) => {
      console.warn("Firestore 'chats' collection sync error:", err);
    });
    return () => unsub();
  }, [isAuthenticated]);

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

  const login = useCallback(async (email: string, pass: string) => {
    const cleanEmail = email.toLowerCase().trim();
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, pass);
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
          const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
          const user = userCredential.user;
          
          const nameFromEmail = cleanEmail.split('@')[0];
          const name = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
          await updateProfile(user, { displayName: name });
          
          const userRef = doc(db, 'users', user.uid);
          const isAutoAdmin = cleanEmail === 'admaaqaba06@gmail.com';
          const freshUserDoc = {
            id: user.uid,
            uid: user.uid,
            name: name,
            email: cleanEmail,
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            role: isAutoAdmin ? 'admin' : 'user',
            isVerified: true,
            isBlocked: false,
            subscriptionStatus: 'none',
            subscriptionExpiry: null,
            phoneNumber: '',
            phone: '',
            city: '',
            createdAt: new Date().toISOString()
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
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const isGoogleAdmin = user.email?.toLowerCase().trim() === 'admaaqaba06@gmail.com';
        const freshUserDoc = {
          id: user.uid,
          uid: user.uid,
          name: user.displayName || 'Google User',
          email: user.email || '',
          avatar: user.photoURL || 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
          role: isGoogleAdmin ? 'admin' : 'user',
          isVerified: true,
          isBlocked: false,
          subscriptionStatus: 'none',
          subscriptionExpiry: null,
          phoneNumber: user.phoneNumber || '',
          phone: user.phoneNumber || '',
          city: '',
          createdAt: new Date().toISOString()
        };
        await setDoc(userRef, freshUserDoc);
      }
    } catch (error) {
      console.warn("Google Auth popup failed: ", error);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setCurrentUser(DEFAULT_UNAUTHENTICATED_USER);
      setIsAuthenticated(false);
      setWallet({
        userId: 'user-current',
        totalBalance: 0,
        availableBalance: 0,
        escrowBalance: 0
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, []);

  const registerUser = useCallback(async (name: string, email: string, password = '', phone = '') => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();
    const cleanName = name.trim();
    const isAdminEmail = cleanEmail === 'admaaqaba06@gmail.com';

    // Duplicate Account & Sybil / Fraud Protection Validation via Cloud Function
    try {
      const checkDuplicate = httpsCallable<{ phone: string; name: string }, { phoneExists: boolean; nameExists: boolean; duplicate: boolean }>(
        functions,
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
      console.warn("Skip pre-registration security Cloud Function query fallback: ", dupErr);
    }

    try {
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
        isAdmin: isAdminEmail,
        accountStatus: 'active',
        isVerified: true,
        isBlocked: false,
        subscriptionStatus: 'none',
        subscriptionExpiry: null,
        phoneNumber: cleanPhone || '',
        phone: cleanPhone || '',
        normalizedPhone: cleanPhone.replace(/\D/g, ''),
        city: '',
        createdAt: new Date().toISOString()
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

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
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

  const subscribeUser = useCallback(async (price: number, paymentProofImage?: string, transferFullName?: string, transferPhone?: string) => {
    const plan = price === 1 ? 'monthly' : price === 3 ? 'quarterly' : 'annual';

    if (!currentUser) {
      addNotification('❌ Error', 'User must be logged in.', 'alert');
      return;
    }

    if (!featureFlags.enableSubscriptions) {
      addNotification(
        language === 'ar' ? '⚠️ الاشتراكات معطلة' : '⚠️ Subscriptions Disabled',
        language === 'ar' ? 'عمليات ترقية الاشتراكات معطلة مؤقتاً للصيانة المجدولة.' : 'Subscription upgrades are temporarily disabled for system maintenance.',
        'alert'
      );
      return;
    }

    try {
      let downloadURL = '';

      if (paymentProofImage && paymentProofImage.startsWith('data:')) {
        // Upload payment proof screenshot directly to Firebase Storage inside payment-proofs/{userId}/{timestamp-fileName}
        const { getStorage, ref, uploadString, getDownloadURL } = await import('firebase/storage');
        const storage = getStorage();
        const fileName = `${Date.now()}_proof.png`;
        const proofRef = ref(storage, `payment-proofs/${currentUser.id}/${fileName}`);
        
        const uploadResult = await uploadString(proofRef, paymentProofImage, 'data_url');
        downloadURL = await getDownloadURL(uploadResult.ref);
      } else {
        downloadURL = paymentProofImage || '';
      }

      // Invoke the Callable Cloud Function requestSubscription
      const { httpsCallable } = await import('firebase/functions');
      const requestSubCallable = httpsCallable<{
        price: number;
        plan: string;
        paymentProofUrl: string;
        paymentProofImage: string;
        transferFullName: string;
        transferPhone: string;
      }, { success: boolean; message: string }>(functions, 'requestSubscription');

      await requestSubCallable({
        price,
        plan,
        paymentProofUrl: downloadURL,
        paymentProofImage: downloadURL,
        transferFullName: transferFullName || '',
        transferPhone: transferPhone || ''
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
      addNotification('⏳ Subscription Pending', `شكراً! تم استلام طلب اشتراكك. سيتم مراجعته من الإدارة وتفعيله خلال دقائق.`, 'verify');
    } catch (error: any) {
      console.error("[requestSubscription] Failed. Function: requestSubscription, userId:", currentUser.id, "error:", error);
      await logSystemHealth('payment_fail', 'Subscription Request Error', `Amount: ${price} JOD, Name: ${transferFullName || ''}, Error: ${error.message || String(error)}`);
      addNotification('❌ Subscription Error', error.message || 'Failed to submit subscription request.', 'alert');
    }
  }, [currentUser, addNotification, functions, logSystemHealth, featureFlags, language]);

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
          ? '❌ انتهى مفعول اشتراكك! يرجى تجديد اشتراك المزاد الفضي لمواصلة المزايدة.' 
          : '🎒 Bid rejected: Active subscription pass required. Please renew your subscription to place bids.' 
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
      const placeBidCallable = httpsCallable<{ auctionId: string; amount: number }, { success: boolean; message: string }>(functions, 'placeBid');
      const result = await placeBidCallable({ auctionId, amount });
      if (result.data.success) {
        // Update security refs
        lastBidTimestampRef.current = Date.now();
        bidTimestampsRef.current = [...updatedWindow, Date.now()];

        // Record analytical conversion metric
        await logAnalyticsEvent('bid_placed', currentUser.id, currentUser.email, {
          auctionId,
          amount
        });

        addNotification(
          '🏆 Winning Bid Placed',
          `Locked ${amount.toLocaleString()} JOD securely in Mazad Escrow.`,
          'win'
        );
      } else {
        await logSystemHealth('bid_fail', 'Bid Placement Failed', `Auction: ${auctionId}, Amount: ${amount} JOD, Message: ${result.data.message}`);
      }
      return {
        success: result.data.success,
        message: result.data.message
      };
    } catch (error: any) {
      console.error("Cloud function placeBid error:", error);
      await logSystemHealth('bid_fail', 'Bid Placement Error', `Auction: ${auctionId}, Amount: ${amount} JOD, Error: ${error.message || String(error)}`);
      return {
        success: false,
        message: error.message || 'Bidding failed.'
      };
    }
  }, [currentUser, language, addNotification, logSystemHealth, featureFlags]);

  // CliQ Jordanian instant receipt topup simulation
  const triggerCliQTopUp = useCallback(async (amount: number, alias: string, receiptName: string) => {
    if (!featureFlags.enableWallets) {
      addNotification(
        language === 'ar' ? '⚠️ عمليات المحفظة معطلة' : '⚠️ Wallet Services Disabled',
        language === 'ar' ? 'عمليات التعبئة والتحقق المالي معطلة مؤقتاً للصيانة المجدولة.' : 'Wallet deposits and verifications are temporarily disabled for scheduled maintenance.',
        'alert'
      );
      return;
    }

    try {
      const topUpCallable = httpsCallable<{ amount: number; alias: string; receiptName: string }, { success: boolean; message: string }>(functions, 'requestTopUp');
      const result = await topUpCallable({ amount, alias, receiptName });
      if (result.data.success) {
        addNotification(
          '💸 CliQ Transfer Received',
          `Receipt upload success! Amman operations team will audit payment verification manually within 60 seconds.`,
          'verify'
        );
      } else {
        await logSystemHealth('payment_fail', 'CliQ Payment Failed', `Amount: ${amount} JOD, Alias: ${alias}, Receipt: ${receiptName}, Message: ${result.data.message}`);
      }
    } catch (error: any) {
      console.error("Cloud function requestTopUp error:", error);
      await logSystemHealth('payment_fail', 'CliQ Payment Top-up Error', `Amount: ${amount} JOD, Alias: ${alias}, Receipt: ${receiptName}, Error: ${error.message || String(error)}`);
      addNotification('❌ Top-up Error', error.message || 'Failed to request top-up.', 'alert');
    }
  }, [addNotification, logSystemHealth, featureFlags, language]);

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
    thumbnailFile?: File | Blob | null
  ) => {
    const newListingId = `auction-new-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // رفع الفيديو لـ Firebase Storage أولاً
    let finalVideoUrl = listingData.videoUrl || '';
    let finalThumbnailUrl = listingData.thumbnailUrl || '';

    if (videoFile) {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage();
      const videoName = (videoFile as any).name || `${Date.now()}_video.mp4`;
      const videoRef = ref(storage, `auction-videos/${Date.now()}_${videoName}`);
      await uploadBytes(videoRef, videoFile);
      finalVideoUrl = await getDownloadURL(videoRef);
    }

    if (thumbnailFile) {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage();
      const thumbName = (thumbnailFile as any).name || `${Date.now()}_thumbnail.jpg`;
      const thumbRef = ref(storage, `auction-thumbnails/${Date.now()}_${thumbName}`);
      await uploadBytes(thumbRef, thumbnailFile);
      finalThumbnailUrl = await getDownloadURL(thumbRef);
    }

    const endTimeMs = (listingData as any).endTime || (listingData as any).endsAt || (Date.now() + 3600 * 1000);
    const newListing: any = {
      ...listingData,
      id: newListingId,
      currentPrice: listingData.startingPrice,
      sellerId: currentUser?.id || 'seller-current',
      sellerName: currentUser?.name || sellerProfile?.storeName || 'Custom Merchant',
      sellerLogo: currentUser?.avatar || sellerProfile?.storeLogo || 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=150&q=80',
      status: 'live', // Go live instantly so everyone on any device sees it immediately!
      isFeatured: false,
      totalBids: 0,
      viewersCount: 2,
      createdAt: new Date().getTime(),
      createdById: currentUser?.id || 'guest',
      createdByName: currentUser?.name || 'Seller JO',
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      endTime: endTimeMs,
      endsAt: Timestamp.fromMillis(endTimeMs)
    };

    // Save directly to Firestore for real-time synchronization
    const docRef = doc(db, 'auctions', newListingId);
    setDoc(docRef, newListing)
      .then(() => {
        console.log("Successfully created live listing in Firestore:", newListingId);
        // Log auction created event to Firestore Analytics
        logAnalyticsEvent('auction_created', currentUser?.id || null, currentUser?.email || null, {
          auctionId: newListingId,
          title: listingData.title,
          startingPrice: listingData.startingPrice,
          category: listingData.category
        });
      })
      .catch((err) => {
        console.error("Firestore write failure on direct listing release:", err);
      });

    setAuctions(prev => [newListing, ...prev]);
    
    if (language === 'ar') {
      addNotification(
        '🚀 تم إطلاق المزاد مباشرة للجميع',
        `تم نشر "${listingData.title}" بنجاح وهو الآن نشط ومتاح للمزايدة الحية وبث الفيديو أمام الجميع فورا!`,
        'win'
      );
    } else {
      addNotification(
        '🚀 Live Auction Released Instantly',
        `"${listingData.title}" has been successfully active and went live! Bidding & streaming are now open to all users.`,
        'win'
      );
    }
  }, [sellerProfile, currentUser, addNotification, language]);

  // --- ADMIN ACTIONS ---
  const approveListing = useCallback((id: string) => {
    // Write approval properties directly to Firestore database
    const freshEndTime = Date.now() + 600 * 1000;
    const endsAtTimestamp = Timestamp.fromMillis(freshEndTime);

    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      status: 'live',
      approvedAt: serverTimestamp(),
      approvedBy: currentUser?.id || 'admin-system',
      endTime: freshEndTime, // Fresh 10 Mins live timer
      endsAt: endsAtTimestamp
    }).catch(err => {
      console.error("Firestore approve write failed:", err);
    });

    setAuctions(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, status: 'live', endTime: freshEndTime, endsAt: endsAtTimestamp }; // Give it a fresh 10 Min live clock
      }
      return a;
    }));
    
    const targetA = auctions.find(a => a.id === id);
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
      adminName: currentUser?.name || 'Admin',
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
      adminName: currentUser?.name || 'Admin',
      timestamp: Date.now(),
      details: 'Submited company license validated.'
    };
    setAdminActions(prev => [action, ...prev]);
  }, [users, currentUser]);

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
      const releaseCallable = httpsCallable<{ escrowId: string }, { success: boolean; message: string }>(functions, 'releaseEscrow');
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
      const refundCallable = httpsCallable<{ escrowId: string }, { success: boolean; message: string }>(functions, 'refundEscrow');
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
        const activeUserId = currentUser?.id || 'user-current';
        if (auditAuction.currentBidderId === activeUserId) {
          // Find their active escrow for this auction
          const clientEscrow = escrowsRef.current.find(
            e => e.auctionId === auditAuction.id && e.bidderId === activeUserId && e.status === 'locked'
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

    const activeUserId = currentUser?.id || 'user-current';
    const triggerable = auctions.find(auction => {
      if (auction.status !== 'live') return false;
      if (auction.currentBidderId === activeUserId) return false;
      
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

  const visibleAuctions = auctions.filter(a => !deletedAuctionIds.includes(a.id));

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser,
      sellerProfile, setSellerProfile,
      users, setUsers,
      sellerProfiles, setSellerProfiles,
      auctions: visibleAuctions, setAuctions,
      bids, setBids,
      wallet, setWallet,
      escrows, setEscrows,
      chatMessages, setChatMessages,
      notifications, setNotifications,
      adminActions, setAdminActions,
      adminActionsError,
      activeAuctionId, setActiveAuctionId,
      activeView, setActiveView,
      placeBid,
      triggerCliQTopUp,
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
      setShowSubscriptionPrompt,
      showNotifications,
      setShowNotifications,
      sendChatMessage,
      maintenanceMode,
      featureFlags,
      updateMaintenanceMode,
      updateFeatureFlag,
      systemHealthLogs,
      logSystemHealth
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
