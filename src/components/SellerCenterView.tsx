import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp, useAuctions } from '../context/AppContext';
import { db, getFirebaseStorage } from '../services/firebase';
import { translations } from '../utils/translations';
import { OrderDetailsView } from './OrderDetailsView';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  setDoc,
  Timestamp 
} from 'firebase/firestore';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  Wallet, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Store, 
  ChevronRight, 
  Star, 
  MessageSquare, 
  Calendar, 
  ArrowUpRight, 
  DollarSign, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Edit, 
  Copy, 
  PlusCircle, 
  Eye, 
  Activity, 
  Bell, 
  Users, 
  BarChart3,
  Package,
  ShoppingBag,
  Send,
  X,
  CreditCard,
  Building2,
  RefreshCw,
  UserCheck,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AuctionItem, Order, Review, Withdrawal } from '../types';

// Extend local translations for Seller Center Specific text
const sellerTranslations: Record<string, Record<string, string>> = {
  ar: {
    seller_center: 'مركز البائع',
    active_auctions: 'المزادات النشطة',
    completed_sales: 'المبيعات المكتملة',
    pending_orders: 'الطلبات المعلقة',
    total_revenue: 'إجمالي الإيرادات',
    wallet_balance: 'رصيد المحفظة المتاح',
    escrow_locked: 'المحجوز في الضمان',
    monthly_sales: 'مبيعات الشهر الحالي',
    avg_rating: 'متوسط التقييم',
    dashboard: 'لوحة التحكم',
    my_auctions: 'مزاداتي',
    orders: 'الطلبات والمبيعات',
    payouts: 'السحوبات والمالية',
    analytics: 'التحليلات والأداء',
    reviews: 'تقييمات المشترين',
    notifications: 'الإشعارات',
    upcoming: 'قادم',
    live: 'مباشر الآن',
    pending_approval: 'بانتظار الموافقة',
    completed: 'مكتمل',
    rejected: 'مرفوض',
    edit: 'تعديل',
    duplicate: 'نسخ مكرر',
    delete: 'حذف',
    view: 'عرض المزاد',
    no_bids_delete: 'يمكن الحذف فقط في حال عدم وجود مزايدات',
    buyer: 'المشتري',
    price: 'السعر',
    status: 'الحالة',
    payment: 'الدفع',
    shipping: 'الشحن',
    escrow: 'الضمان',
    open_details: 'فتح التفاصيل',
    withdraw_bank: 'طلب سحب مالي للبنك',
    withdraw_cliq: 'طلب سحب عبر كليك',
    available_balance: 'الرصيد المتاح',
    escrow_pending: 'الضمان المعلق',
    funds_released: 'الأموال المحررة',
    withdrawal_history: 'سجل طلبات السحب المالي',
    withdraw_placeholder: 'سيتم تقديم طلب السحب للمراجعة والتدقيق المالي من قبل الإدارة، وسيتم التواصل معك بعد مراجعة الطلب.',
    amount_jod: 'المبلغ بالدينار الأردني (JOD)',
    bank_name: 'اسم البنك',
    iban: 'رقم الآيبان الدولي (IBAN)',
    account_holder: 'اسم صاحب الحساب بالكامل',
    cliq_alias: 'اسم مستعار كليك / رقم الهاتف لـ كليك',
    submit_withdrawal: 'تقديم طلب السحب المالي',
    daily_sales: 'المبيعات اليومية',
    monthly_rev: 'الإيرادات الشهرية',
    conv_rate: 'معدل التحويل (Views vs Bids)',
    avg_selling_price: 'متوسط سعر البيع للمزادات المكتملة',
    top_categories: 'أعلى الفئات مبيعاً',
    views_vs_bids: 'المشاهدات مقابل المزايدات',
    buyer_feedback: 'تعليقات المشترين والمزايدين',
    respond: 'الرد على التقييم',
    save_response: 'حفظ الرد',
    response_placeholder: 'اكتب ردك المهني هنا...',
    no_auctions: 'لا يوجد مزادات في هذا القسم حالياً.',
    no_orders: 'لا يوجد طلبات مبيعات مسجلة بعد.',
    no_reviews: 'لا يوجد تقييمات مكتوبة بعد.',
    no_notifications: 'لا توجد إشعارات جديدة للبائع.',
    all_notifs: 'جميع إشعارات البائع',
    resubmit: 'أعد الإرسال',
    no_listings_yet: 'ما عندك مزادات بعد — أضف أول منتج',
    start_selling: 'ابدأ البيع'
  },
  en: {
    seller_center: 'Seller Center',
    active_auctions: 'Active Auctions',
    completed_sales: 'Completed Sales',
    pending_orders: 'Pending Orders',
    total_revenue: 'Total Revenue',
    wallet_balance: 'Available Wallet Balance',
    escrow_locked: 'Escrow Locked',
    monthly_sales: 'Monthly Sales',
    avg_rating: 'Average Rating',
    dashboard: 'Dashboard',
    my_auctions: 'My Auctions',
    orders: 'Orders & Sales',
    payouts: 'Payouts & Balance',
    analytics: 'Analytics & Performance',
    reviews: 'Buyer Reviews',
    notifications: 'Notifications',
    upcoming: 'Upcoming',
    live: 'Live Now',
    pending_approval: 'Pending Approval',
    completed: 'Completed',
    rejected: 'Rejected',
    edit: 'Edit',
    duplicate: 'Duplicate',
    delete: 'Delete',
    view: 'View Auction',
    no_bids_delete: 'Can only delete if there are no bids',
    buyer: 'Buyer',
    price: 'Price',
    status: 'Status',
    payment: 'Payment',
    shipping: 'Shipping',
    escrow: 'Escrow',
    open_details: 'Open Details',
    withdraw_bank: 'Request Bank Withdrawal',
    withdraw_cliq: 'Request CliQ Withdrawal',
    available_balance: 'Available Balance',
    escrow_pending: 'Pending Escrow',
    funds_released: 'Released Funds',
    withdrawal_history: 'Withdrawal Request History',
    withdraw_placeholder: 'Your withdrawal request will be submitted to our finance desk for review. We will contact you after reviewing the request.',
    amount_jod: 'Amount in JOD',
    bank_name: 'Bank Name',
    iban: 'IBAN Code',
    account_holder: 'Full Account Holder Name',
    cliq_alias: 'CliQ Alias / Phone Number',
    submit_withdrawal: 'Submit Withdrawal Request',
    daily_sales: 'Daily Sales',
    monthly_rev: 'Monthly Revenue',
    conv_rate: 'Conversion Rate (Views vs Bids)',
    avg_selling_price: 'Average Selling Price (Completed)',
    top_categories: 'Top Categories',
    views_vs_bids: 'Views vs Bids',
    buyer_feedback: 'Buyer Feedback & Ratings',
    respond: 'Respond',
    save_response: 'Save Response',
    response_placeholder: 'Write your professional reply...',
    no_auctions: 'No auctions found in this category.',
    no_orders: 'No orders logged yet.',
    no_reviews: 'No reviews found yet.',
    no_notifications: 'No seller notifications found.',
    all_notifs: 'All Seller Notifications',
    resubmit: 'Resubmit',
    no_listings_yet: 'No listings yet — add your first',
    start_selling: 'Start selling'
  }
};

export const SellerCenterView: React.FC = () => {
  const {
    currentUser,
    language,
    orders,
    wallet,
    addNotification,
    sellerProfiles,
    submitVerificationRequest,
    requestWithdrawal,
    setActiveView
  } = useApp();
  const { auctions, setAuctions } = useAuctions();

  const isAr = language === 'ar';
  const st = isAr ? sellerTranslations.ar : sellerTranslations.en;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'auctions' | 'orders' | 'payouts' | 'analytics' | 'reviews' | 'notifications'>('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [viewAuctionId, setViewAuctionId] = useState<string | null>(null);

  // Verification states
  const [isVerRequestOpen, setIsVerRequestOpen] = useState(false);
  const [requestedStatus, setRequestedStatus] = useState<'verified' | 'premium_verified'>('verified');
  const [verNotes, setVerNotes] = useState('');
  const [isVerSubmitting, setIsVerSubmitting] = useState(false);
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);

  // States for sub-collections / seeding
  const [reviews, setReviews] = useState<Review[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [sellerNotifications, setSellerNotifications] = useState<any[]>([]);

  // Modals / Modifiers
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAuction, setEditingAuction] = useState<AuctionItem | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState<'bank' | 'cliq' | null>(null);

  // Form Fields for Editing
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartingPrice, setEditStartingPrice] = useState(0);
  const [editCategory, setEditCategory] = useState('');
  const [editDuration, setEditDuration] = useState(3600);

  // Form Fields for Withdrawal
  const [wAmount, setWAmount] = useState('');
  const [wBankName, setWBankName] = useState('');
  const [wIban, setWIban] = useState('');
  const [wHolderName, setWHolderName] = useState('');
  const [wCliqAlias, setWCliqAlias] = useState('');

  // Seller-specific listings (where createdById === currentUser.id OR sellerId === currentUser.id)
  const myAuctions = useMemo(() => {
    if (!currentUser) return [];
    return auctions.filter(a => a.createdById === currentUser.id || a.sellerId === currentUser.id);
  }, [auctions, currentUser]);

  // Seller-specific orders
  const myOrders = useMemo(() => {
    if (!currentUser) return [];
    return orders.filter(o => o.sellerId === currentUser.id);
  }, [orders, currentUser]);

  // 1. Load / Seed Reviews
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'reviews'), where('sellerId', '==', currentUser.id));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        // Seed default beautiful reviews into Firestore to make it feel rich and genuine
        const defaultReviews: Review[] = [
          {
            id: `rev-seed-1-${currentUser.id}`,
            sellerId: currentUser.id,
            buyerId: 'buyer-seed-abc',
            buyerName: isAr ? 'أحمد الشمري' : 'Ahmad Shammari',
            buyerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
            rating: 5,
            comment: isAr 
              ? 'بائع ممتاز ومحترف جداً! المنتج بحالة رائعة والشحن كان أسرع مما توقعت. التغليف متين وممتاز.' 
              : 'Excellent and highly professional seller! The item is in pristine condition and shipping was ultra-fast. Safe packaging.',
            timestamp: Date.now() - 3 * 24 * 3600 * 1000,
            auctionTitle: isAr ? 'ساعة رولكس صبمارينر كلاسيك' : 'Rolex Submariner Classic',
            auctionId: 'rolex-sub-1'
          },
          {
            id: `rev-seed-2-${currentUser.id}`,
            sellerId: currentUser.id,
            buyerId: 'buyer-seed-xyz',
            buyerName: isAr ? 'رنا حداد' : 'Rana Haddad',
            buyerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
            rating: 4,
            comment: isAr 
              ? 'المنتج ممتاز ومطابق للوصف تماماً. كان هناك تأخير بسيط ليلة واحدة في التسليم لكن التواصل كان رائعاً.' 
              : 'Product matches the description perfectly. Just a minor one-day delay in delivery, but overall outstanding communication.',
            timestamp: Date.now() - 7 * 24 * 3600 * 1000,
            auctionTitle: isAr ? 'هاتف آيفون 15 برو ماكس' : 'iPhone 15 Pro Max',
            auctionId: 'iphone15-2'
          },
          {
            id: `rev-seed-3-${currentUser.id}`,
            sellerId: currentUser.id,
            buyerId: 'buyer-seed-mno',
            buyerName: isAr ? 'سامر الكردي' : 'Samer Kordi',
            buyerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
            rating: 5,
            comment: isAr 
              ? 'خدمة رائعة وجهاز نظيف وممتاز كما وُصف في الفيديو المرفق بالمزاد. أنصح بشدة بالتعامل مع هذا التاجر!' 
              : 'Amazing service and pristine hardware exactly as detailed in the live video demo. High-trust merchant!',
            timestamp: Date.now() - 15 * 24 * 3600 * 1000,
            auctionTitle: isAr ? 'جهاز ماك بوك برو M3 Max' : 'MacBook Pro M3 Max 16"',
            auctionId: 'macbook-3'
          }
        ];

        for (const rev of defaultReviews) {
          await setDoc(doc(db, 'reviews', rev.id), rev);
        }
      } else {
        const fetched: Review[] = [];
        snap.forEach((d) => {
          fetched.push({ id: d.id, ...d.data() } as Review);
        });
        // Sort by timestamp descending
        fetched.sort((a, b) => b.timestamp - a.timestamp);
        setReviews(fetched);
      }
    }, (err) => {
      console.warn("SellerCenter reviews subscription failed:", err);
    });

    return () => unsub();
  }, [currentUser, isAr]);

  // 2. Load / Seed Withdrawals
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'withdrawals'), where('userId', '==', currentUser.id));
    const unsub = onSnapshot(q, (snap) => {
      const fetched: Withdrawal[] = [];
      snap.forEach((d) => {
        fetched.push({ id: d.id, ...d.data() } as Withdrawal);
      });
      fetched.sort((a, b) => b.timestamp - a.timestamp);
      setWithdrawals(fetched);
    }, (err) => {
      console.warn("SellerCenter withdrawals subscription failed:", err);
    });

    return () => unsub();
  }, [currentUser]);

  // 3. Load / Filter real-time Seller Notifications only
  useEffect(() => {
    if (!currentUser) return;

    // Load from general /notifications collection where userId === currentUser.id
    const q = query(collection(db, 'notifications'), where('userId', '==', currentUser.id));
    const unsub = onSnapshot(q, (snap) => {
      const fetched: any[] = [];
      snap.forEach((d) => {
        fetched.push({ id: d.id, ...d.data() });
      });
      // Sort newest first
      fetched.sort((a, b) => b.timestamp - a.timestamp);
      setSellerNotifications(fetched);
    }, (err) => {
      console.warn("SellerCenter notifications subscription failed:", err);
    });

    return () => unsub();
  }, [currentUser]);

  // Calculates Key KPIs
  const kpis = useMemo(() => {
    const liveCount = myAuctions.filter(a => a.status === 'live').length;
    
    // Completed Sales: auctions with status 'completed' OR orders with status 'completed'
    const completedSalesCount = myOrders.filter(o => o.status === 'completed').length;
    
    // Pending Orders: waiting_payment, paid, preparing_shipment, shipped, delivered
    const pendingOrdersCount = myOrders.filter(o => 
      ['waiting_payment', 'paid', 'preparing_shipment', 'shipped', 'delivered', 'disputed'].includes(o.status)
    ).length;

    // Total Revenue: sum of winningBidAmount of completed or paid orders
    const totalRev = myOrders
      .filter(o => o.status === 'completed' || o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.winningBidAmount || 0), 0);

    // Wallet balance
    const availableBalance = wallet?.availableBalance || 0;

    // Escrow Locked: orders with escrowStatus 'pending'
    const escrowLocked = myOrders
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'refunded' && o.escrowStatus === 'pending')
      .reduce((sum, o) => sum + (o.winningBidAmount || 0), 0);

    // Monthly Sales: sales inside the current calendar month
    const now = new Date();
    const currentMonthSales = myOrders
      .filter(o => {
        if (!o.createdAt) return false;
        const date = new Date(typeof o.createdAt === 'number' ? o.createdAt : (o.createdAt.seconds ? o.createdAt.seconds * 1000 : o.createdAt));
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      })
      .reduce((sum, o) => sum + (o.winningBidAmount || 0), 0);

    // Average Rating
    const avgRating = reviews.length > 0
      ? parseFloat((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
      : 4.8;

    return {
      liveCount,
      completedSalesCount,
      pendingOrdersCount,
      totalRev,
      availableBalance,
      escrowLocked,
      currentMonthSales,
      avgRating
    };
  }, [myAuctions, myOrders, wallet, reviews]);

  // My Auctions categorized — mutually exclusive status buckets, newest first.
  // A resubmitted listing (status back to 'processing', approvalStatus stuck on
  // 'rejected' — the rules deny sellers touching approvalStatus) must land in
  // Pending review, not Rejected: status wins over approvalStatus.
  const categorizedAuctions = useMemo(() => {
    const newestFirst = [...myAuctions].sort(
      (a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0)
    );
    const isPendingReview = (a: AuctionItem) =>
      a.status === 'processing' || (a.status as string) === 'pending' ||
      (a.status === 'upcoming' && a.approvalStatus === 'pending'); // legacy scheduled-but-unreviewed docs
    return {
      pending: newestFirst.filter(isPendingReview),
      live: newestFirst.filter(a => a.status === 'live'),
      upcoming: newestFirst.filter(a =>
        a.status === 'upcoming' && a.approvalStatus !== 'rejected' && a.approvalStatus !== 'pending'
      ),
      completed: newestFirst.filter(a => a.status === 'completed'),
      rejected: newestFirst.filter(a =>
        a.status === 'rejected' || (a.status === 'upcoming' && a.approvalStatus === 'rejected')
      )
    };
  }, [myAuctions]);

  // Chart Data Generation
  const chartData = useMemo(() => {
    // 1. Daily Sales of the last 7 days
    const dailyMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      dailyMap[d.toDateString()] = 0;
    }

    myOrders.forEach(o => {
      if (o.status === 'completed' || o.paymentStatus === 'paid') {
        const oDate = new Date(typeof o.createdAt === 'number' ? o.createdAt : (o.createdAt.seconds ? o.createdAt.seconds * 1000 : o.createdAt));
        const key = oDate.toDateString();
        if (dailyMap[key] !== undefined) {
          dailyMap[key] += o.winningBidAmount;
        }
      }
    });

    const dailyData = Object.keys(dailyMap).map(key => {
      const d = new Date(key);
      return {
        name: d.toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { weekday: 'short' }),
        sales: dailyMap[key]
      };
    });

    // 2. Monthly Revenue
    const months = isAr 
      ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const monthlyMap: Record<number, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const targetM = (now.getMonth() - i + 12) % 12;
      monthlyMap[targetM] = 0;
    }

    myOrders.forEach(o => {
      if (o.status === 'completed' || o.paymentStatus === 'paid') {
        const oDate = new Date(typeof o.createdAt === 'number' ? o.createdAt : (o.createdAt.seconds ? o.createdAt.seconds * 1000 : o.createdAt));
        const m = oDate.getMonth();
        if (monthlyMap[m] !== undefined) {
          monthlyMap[m] += o.winningBidAmount;
        }
      }
    });

    const monthlyData = Object.keys(monthlyMap).map(mKey => {
      const mIdx = parseInt(mKey);
      return {
        name: months[mIdx],
        revenue: monthlyMap[mIdx]
      };
    });

    // 3. Top Categories
    const categoryMap: Record<string, number> = {};
    myAuctions.forEach(a => {
      const cat = a.category || (isAr ? 'عام' : 'General');
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const categoryData = Object.keys(categoryMap).map(key => ({
      name: key,
      value: categoryMap[key]
    }));

    const COLORS = ['#FF6B00', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

    // 4. Views vs Bids
    const viewsVsBidsData = myAuctions.slice(0, 5).map(a => ({
      name: a.title.length > 15 ? a.title.substring(0, 15) + '...' : a.title,
      views: a.viewersCount || 0,
      bids: a.totalBids || 0
    }));

    return {
      dailyData,
      monthlyData,
      categoryData,
      viewsVsBidsData,
      COLORS
    };
  }, [myOrders, myAuctions, isAr]);

  // Actions
  const handleEditClick = (auction: AuctionItem) => {
    setEditingAuction(auction);
    setEditTitle(auction.title);
    setEditDesc(auction.description || '');
    setEditStartingPrice(auction.startingPrice);
    setEditCategory(auction.category || '');
    setEditDuration(auction.duration || 3600);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAuction) return;

    // Resubmit path: editing a rejected listing sends it straight back into the
    // Mazad review queue ('processing') and clears the old rejection reason.
    // (firestore.rules allow the creator rejected→processing; approvalStatus is
    // admin-only and stays untouched.)
    const isResubmit = editingAuction.status === 'rejected';

    try {
      const docRef = doc(db, 'auctions', editingAuction.id);
      const patch: any = {
        title: editTitle,
        description: editDesc,
        startingPrice: editStartingPrice,
        category: editCategory,
        duration: editDuration,
        endsAt: Timestamp.fromMillis(Date.now() + editDuration * 1000),
        ...(isResubmit ? { status: 'processing', rejectionReason: '' } : {})
      };
      await updateDoc(docRef, patch);

      // Update locally
      setAuctions(prev => prev.map(a => a.id === editingAuction.id ? {
        ...a,
        ...patch
      } : a));

      if (isResubmit) {
        addNotification(
          isAr ? '🔄 تمت إعادة الإرسال للمراجعة' : '🔄 Resubmitted for Review',
          isAr ? `تمت إعادة إرسال "${editTitle}" لفريق مزاد جو للمراجعة والموافقة.` : `"${editTitle}" was resubmitted to the Mazad JO team for review & approval.`,
          'info'
        );
      } else {
        addNotification(
          isAr ? '✅ تم تحديث المزاد' : '✅ Auction Updated',
          isAr ? `تم تعديل بيانات المزاد "${editTitle}" بنجاح.` : `Auction "${editTitle}" successfully updated.`,
          'info'
        );
      }
      setIsEditModalOpen(false);
      setEditingAuction(null);
    } catch (err: any) {
      console.error(err);
      alert(isAr ? 'فشل تعديل المزاد.' : 'Failed to update auction.');
    }
  };

  const handleDuplicate = async (auction: AuctionItem) => {
    try {
      const newId = `auction-dup-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      // Strip the source's review-gate artifacts — a copy is a fresh submission.
      const { id, rejectionReason, rejectedAt, rejectedBy, approvedAt, approvedBy,
        scheduledStartAt, winnerId, winnerName, winnerEmail, winnerPhone, winnerCity,
        ...dataToCopy } = auction as any;
      
      const endsAtMillis = Date.now() + (auction.duration || 3600) * 1000;
      const duplicated: any = {
        ...dataToCopy,
        id: newId,
        title: isAr ? `${auction.title} (نسخة مكررة)` : `${auction.title} (Copy)`,
        currentPrice: auction.startingPrice,
        currentBidderId: null,
        currentBidderName: null,
        totalBids: 0,
        viewersCount: 0,
        // A duplicate is a NEW unapproved listing: it must re-enter the Mazad
        // review gate ('processing'), never land on a buyer surface as
        // 'upcoming'. Also matches firestore.rules for non-admin creates.
        status: 'processing',
        approvalStatus: 'pending',
        isApproved: false,
        createdAt: Date.now(),
        endsAt: Timestamp.fromMillis(endsAtMillis),
        endTime: endsAtMillis
      };

      await setDoc(doc(db, 'auctions', newId), duplicated);
      
      addNotification(
        isAr ? '📋 تم تكرار المزاد' : '📋 Auction Duplicated',
        isAr 
          ? `تم إنشاء نسخة مكررة باسم "${duplicated.title}" بانتظار الموافقة.` 
          : `Duplicated "${duplicated.title}" successfully. Awaiting approval.`,
        'info'
      );
    } catch (err) {
      console.error(err);
      alert('Failed to duplicate.');
    }
  };

  const handleDelete = async (auction: AuctionItem) => {
    if ((auction.totalBids || 0) > 0) {
      alert(st.no_bids_delete);
      return;
    }

    if (!confirm(isAr ? 'هل أنت متأكد من رغبتك في مسح هذا المزاد نهائياً؟' : 'Are you sure you want to permanently delete this listing?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'auctions', auction.id));
      setAuctions(prev => prev.filter(a => a.id !== auction.id));

      addNotification(
        isAr ? '🗑️ تم حذف المزاد' : '🗑️ Auction Deleted',
        isAr ? `تم مسح المزاد "${auction.title}" نهائياً من حسابك.` : `Permanently deleted auction "${auction.title}".`,
        'info'
      );
    } catch (err) {
      console.error(err);
      alert('Failed to delete.');
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const amountNum = parseFloat(wAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert(isAr ? 'الرجاء إدخال مبلغ صحيح.' : 'Please enter a valid amount.');
      return;
    }

    if (amountNum > kpis.availableBalance) {
      alert(isAr ? 'المبلغ المطلوب أكبر من رصيدك المتاح!' : 'Requested amount exceeds your available balance!');
      return;
    }

    try {
      const details = isWithdrawModalOpen === 'bank' ? {
        bankName: wBankName,
        iban: wIban,
        accountHolderName: wHolderName
      } : {
        cliqAlias: wCliqAlias,
        phone: currentUser.phone || '0791234567'
      };

      const result = await requestWithdrawal(amountNum, isWithdrawModalOpen!, details);

      if (result.success) {
        // Reset
        setWAmount('');
        setWBankName('');
        setWIban('');
        setWHolderName('');
        setWCliqAlias('');
        setIsWithdrawModalOpen(null);
      } else {
        alert(result.message);
      }
    } catch (err: any) {
      console.error(err);
      alert(isAr ? 'فشل تسجيل طلب السحب.' : 'Failed to log withdrawal.');
    }
  };

  const handleReviewReply = async (reviewId: string, replyText: string) => {
    if (!replyText.trim()) return;

    try {
      const ref = doc(db, 'reviews', reviewId);
      await updateDoc(ref, {
        response: replyText,
        responseAt: Date.now()
      });

      addNotification(
        isAr ? '💬 تم حفظ ردك' : '💬 Reply Posted',
        isAr ? 'تم إرسال ردك بنجاح ونشره تحت تقييم المشتري.' : 'Your professional response was saved and published.',
        'info'
      );
    } catch (err) {
      console.error(err);
      alert('Failed to reply.');
    }
  };

  const [activeAuctionTab, setActiveAuctionTab] = useState<'upcoming' | 'live' | 'pending' | 'completed' | 'rejected'>('live');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full bg-[#fafafa] min-h-screen text-gray-900" id="seller-center-root">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5" id="seller-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-50 text-[#FF6B00] rounded-2xl">
            <Store className="w-7 h-7" />
          </div>
          <div className="text-left rtl:text-right">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-gray-900 leading-tight">
                {st.seller_center}
              </h1>
              {(() => {
                const myProfile = sellerProfiles?.find(p => p.userId === currentUser?.id);
                const vStatus = myProfile?.verificationStatus || currentUser?.verificationStatus || 'not_verified';
                
                const vBadgeLabels = {
                  premium_verified: isAr ? 'توثيق متميز بلس' : 'Premium Verified +',
                  verified: isAr ? 'حساب بائع موثق' : 'Verified Seller Account',
                  pending: isAr ? 'طلب التوثيق قيد المراجعة' : 'Verification Under Review',
                  not_verified: isAr ? 'بائع غير موثق' : 'Unverified Seller Account'
                };
                
                const vBadgeColors = {
                  premium_verified: 'bg-amber-100 text-amber-800 border-amber-300',
                  verified: 'bg-emerald-100 text-[#107A48] border-emerald-300',
                  pending: 'bg-blue-100 text-blue-800 border-blue-300',
                  not_verified: 'bg-gray-100 text-gray-700 border-gray-300'
                };

                return (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${vBadgeColors[vStatus]}`}>
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    {vBadgeLabels[vStatus]}
                  </span>
                );
              })()}
            </div>
            <p className="text-xs text-gray-500 font-medium mt-1">
              {isAr ? 'إدارة أعمالك، المزادات والطلبات، الأرباح والمبيعات بكل سهولة.' : 'Manage listings, sales orders, payouts, reviews, and analytics.'}
            </p>
            
            {(() => {
              const myProfile = sellerProfiles?.find(p => p.userId === currentUser?.id);
              const vStatus = myProfile?.verificationStatus || currentUser?.verificationStatus || 'not_verified';
              if (vStatus !== 'not_verified') return null;
              return (
                <button 
                  onClick={() => setIsVerRequestOpen(true)}
                  className="mt-2 text-[10px] text-white bg-[#FF6B00] hover:bg-orange-600 px-3 py-1 rounded-full font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm shadow-[#FF6B00]/10"
                >
                  <Sparkles className="w-3 h-3" />
                  {isAr ? 'تقديم طلب توثيق الحساب الآن' : 'Apply for Official Verification'}
                </button>
              );
            })()}
          </div>
        </div>

        {/* RE-USE ACTIVE STATE AND WALLET INDICATOR */}
        <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-gray-200 shadow-sm">
          <Wallet className="w-4 h-4 text-[#FF6B00]" />
          <div className="text-right">
            <p className="text-[10px] text-gray-400 font-black tracking-wide uppercase leading-none">
              {st.wallet_balance}
            </p>
            <p className="text-base font-black text-gray-900 leading-tight">
              {kpis.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD
            </p>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN WORKSPACE FOR DESKTOP (LG+), VERTICAL FOR MOBILE (< LG) */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* SIDEBAR FOR LG+ */}
        <aside className="hidden lg:flex flex-col gap-1 w-[240px] shrink-0 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm h-fit sticky top-20">
          {[
            { id: 'dashboard', label: st.dashboard, icon: Activity },
            { id: 'auctions', label: st.my_auctions, icon: Store },
            { id: 'orders', label: st.orders, icon: ShoppingBag },
            { id: 'payouts', label: st.payouts, icon: Wallet },
            { id: 'analytics', label: st.analytics, icon: BarChart3 },
            { id: 'reviews', label: st.reviews, icon: Star },
            { id: 'notifications', label: st.notifications, icon: Bell, badge: sellerNotifications.filter(n => !n.read).length }
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedOrderId(null);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black tracking-wide transition-all cursor-pointer w-full text-left rtl:text-right ${
                  isActive 
                    ? 'bg-orange-50 text-[#FF6B00] border border-orange-100 shadow-xs' 
                    : 'text-gray-500 hover:text-gray-950 hover:bg-gray-50'
                }`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF6B00]' : 'text-gray-400'}`} />
                <span className="flex-1">{tab.label}</span>
                {!!tab.badge && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-red-500 text-white`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* TOP SCROLLABLE NAVIGATION TABS FOR MOBILE/TABLET */}
        <div className="flex lg:hidden overflow-x-auto bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm scrollbar-none gap-1 w-full" id="seller-center-tabs">
          {[
            { id: 'dashboard', label: st.dashboard, icon: Activity },
            { id: 'auctions', label: st.my_auctions, icon: Store },
            { id: 'orders', label: st.orders, icon: ShoppingBag },
            { id: 'payouts', label: st.payouts, icon: Wallet },
            { id: 'analytics', label: st.analytics, icon: BarChart3 },
            { id: 'reviews', label: st.reviews, icon: Star },
            { id: 'notifications', label: st.notifications, icon: Bell, badge: sellerNotifications.filter(n => !n.read).length }
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedOrderId(null);
                }}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black tracking-wide shrink-0 transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-orange-50 text-[#FF6B00] border border-orange-100 shadow-xs' 
                    : 'text-gray-500 hover:text-gray-950 hover:bg-gray-50'
                }`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF6B00]' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
                {!!tab.badge && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-red-500 text-white`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* RENDER ACTIVE TAB MAIN PANE */}
        <div className="flex-1 min-w-0 min-h-[400px]">
          {/* ======================= TAB 1: DASHBOARD ======================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6" id="tab-dashboard">
              {/* KPI CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="kpi-grid">
                {[
                  { title: st.active_auctions, value: kpis.liveCount, icon: Store },
                  { title: st.completed_sales, value: kpis.completedSalesCount, icon: CheckCircle },
                  { title: st.pending_orders, value: kpis.pendingOrdersCount, icon: Clock },
                  { title: st.total_revenue, value: `${kpis.totalRev.toLocaleString()} JOD`, icon: DollarSign },
                  { title: st.wallet_balance, value: `${kpis.availableBalance.toLocaleString()} JOD`, icon: Wallet },
                  { title: st.escrow_locked, value: `${kpis.escrowLocked.toLocaleString()} JOD`, icon: AlertTriangle },
                  { title: st.monthly_sales, value: `${kpis.currentMonthSales.toLocaleString()} JOD`, icon: TrendingUp },
                  { title: st.avg_rating, value: `${kpis.avgRating} / 5.0`, icon: Star }
                ].map((kpi, idx) => {
                  const KpiIcon = kpi.icon;
                  return (
                    <div key={idx} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-500 font-bold tracking-wider uppercase leading-none">
                          {kpi.title}
                        </p>
                        <p className="text-lg md:text-xl font-black text-gray-900 leading-tight">
                          {kpi.value}
                        </p>
                      </div>
                      <div className="p-2 rounded-xl bg-orange-50 text-[#FF6B00] shrink-0">
                        <KpiIcon className="w-5 h-5 text-[#FF6B00]" />
                      </div>
                    </div>
                  );
                })}
              </div>

            {/* DASHBOARD GRID: RECENT ACTIONS, NOTIFICATIONS, RECENT REVIEWS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Recent Orders Overview */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.01)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#FF6B00]" />
                    <span>{isAr ? 'الطلبات والمبيعات الحديثة' : 'Recent Orders & Sales'}</span>
                  </h3>
                  <button onClick={() => setActiveTab('orders')} className="text-xs text-[#FF6B00] font-bold hover:underline flex items-center gap-1 cursor-pointer">
                    <span>{isAr ? 'عرض الكل' : 'View All'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {myOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    {st.no_orders}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {myOrders.slice(0, 4).map((order) => (
                      <div key={order.id} className="py-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                            <img src={order.auctionImage || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&q=80'} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="font-extrabold text-gray-900 truncate max-w-[150px] md:max-w-[200px]">{order.auctionTitle}</p>
                            <p className="text-[10px] text-gray-400 font-mono">#{order.id.substring(0, 8)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-black text-gray-900">{order.winningBidAmount} JOD</p>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-wide uppercase ${
                            order.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                            order.status === 'disputed' ? 'bg-rose-50 text-rose-700' :
                            'bg-orange-50 text-orange-700'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Seller Notifications */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.01)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#FF6B00]" />
                    <span>{isAr ? 'آخر إشعارات المبيعات' : 'Latest Sales Notifications'}</span>
                  </h3>
                  <button onClick={() => setActiveTab('notifications')} className="text-xs text-[#FF6B00] font-bold hover:underline flex items-center gap-1 cursor-pointer">
                    <span>{isAr ? 'عرض الكل' : 'View All'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {sellerNotifications.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    {st.no_notifications}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {sellerNotifications.slice(0, 4).map((notif) => (
                      <div key={notif.id} className="py-2.5 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-gray-900">{isAr ? notif.titleAr : notif.titleEn}</p>
                          <span className="text-[8px] text-gray-400 font-mono">
                            {new Date(notif.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500">{isAr ? notif.descriptionAr : notif.descriptionEn}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ======================= TAB 2: MY AUCTIONS ======================= */}
        {activeTab === 'auctions' && (
          <div className="space-y-6" id="tab-auctions">
            {/* SUB-TABS CATEGORY FILTER */}
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 gap-1 overflow-x-auto">
              {[
                { id: 'upcoming', label: st.upcoming, count: categorizedAuctions.upcoming.length },
                { id: 'live', label: st.live, count: categorizedAuctions.live.length },
                { id: 'pending', label: st.pending_approval, count: categorizedAuctions.pending.length },
                { id: 'completed', label: st.completed, count: categorizedAuctions.completed.length },
                { id: 'rejected', label: st.rejected, count: categorizedAuctions.rejected.length }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveAuctionTab(sub.id as any)}
                  className={`flex-1 py-2 text-center rounded-lg text-xs font-bold shrink-0 px-3 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeAuctionTab === sub.id 
                      ? 'bg-white text-gray-950 shadow-xs border border-gray-200' 
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span>{sub.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeAuctionTab === sub.id ? 'bg-[#FF6B00]/10 text-[#FF6B00]' : 'bg-gray-150 text-gray-600'}`}>
                    {sub.count}
                  </span>
                </button>
              ))}
            </div>

            {/* AUCTION LISTINGS */}
            {myAuctions.length === 0 ? (
              /* No listings at all: point the seller at the unified Sell entry */
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 space-y-4" id="seller-empty-state">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center">
                  <PlusCircle className="w-7 h-7 text-[#FF6B00]" />
                </div>
                <p className="text-sm font-black text-gray-900">{st.no_listings_yet}</p>
                <button
                  onClick={() => setActiveView('upload')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-xs rounded-2xl transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{st.start_selling}</span>
                </button>
              </div>
            ) : categorizedAuctions[activeAuctionTab].length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-gray-400 text-sm">
                {st.no_auctions}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categorizedAuctions[activeAuctionTab].map((auction) => (
                  <div key={auction.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.015)] flex flex-col justify-between">
                    <div>
                      {/* Image Preview & Status Badge */}
                      <div className="relative h-40 bg-zinc-100 overflow-hidden">
                        <img 
                          src={auction.thumbnailUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80'} 
                          alt={auction.title} 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2.5 right-2.5 rtl:right-auto rtl:left-2.5">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-wider uppercase shadow-xs ${
                            auction.status === 'live' ? 'bg-red-500 text-white' :
                            auction.status === 'upcoming' ? 'bg-blue-500 text-white' :
                            auction.status === 'completed' ? 'bg-emerald-500 text-white' :
                            'bg-zinc-500 text-white'
                          }`}>
                            {auction.status}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4 space-y-2">
                        <p className="text-[10px] text-gray-400 font-black tracking-wider uppercase font-mono">{auction.category}</p>
                        <h4 className="text-sm font-black text-gray-900 line-clamp-1">{auction.title}</h4>
                        <p className="text-xs text-gray-500 line-clamp-2 min-h-[32px]">{auction.description}</p>

                        {/* Rejection reason back to the seller (spec §6) + resubmit affordance */}
                        {(auction.status === 'rejected' || auction.approvalStatus === 'rejected') && auction.rejectionReason && (
                          <div className="text-[11px] text-rose-600 font-bold bg-rose-50 border border-rose-100 p-2 rounded-lg space-y-1.5">
                            <p>{isAr ? 'سبب الرفض: ' : 'Rejection reason: '}{auction.rejectionReason}</p>
                            {auction.status === 'rejected' && (
                              <button
                                onClick={() => handleEditClick(auction)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>{st.resubmit}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs font-semibold text-gray-500">
                          <div>
                            <p className="text-[10px] text-gray-400">{isAr ? 'السعر الحالي / الابتدائي' : 'Starting / Current Price'}</p>
                            <p className="font-black text-gray-900 text-sm">{auction.currentPrice || auction.startingPrice} JOD</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">{isAr ? 'عدد المزايدات' : 'Total Bids'}</p>
                            <p className="font-black text-gray-900 text-sm">{auction.totalBids || 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => setViewAuctionId(auction.id)}
                        className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase text-center bg-[#FF6B00]/10 text-[#FF6B00] hover:bg-[#FF6B00]/20 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{st.view}</span>
                      </button>

                      {/* Edit only while the seller still owns the doc per firestore.rules:
                          under review ('processing'/legacy 'pending') or 'rejected' (resubmit
                          path). Once approved ('live'/'upcoming') the rules DENY non-admin
                          edits — the button would just error, so it's hidden. */}
                      {(auction.status === 'processing' || (auction.status as string) === 'pending' || auction.status === 'rejected') && (
                        <button
                          onClick={() => handleEditClick(auction)}
                          className="p-2 rounded-xl text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer active:scale-95 transition-all"
                          title={auction.status === 'rejected' ? st.resubmit : st.edit}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}

                      {/* Duplicate hidden on approved surfaces ('live'/'upcoming'). */}
                      {auction.status !== 'live' && auction.status !== 'upcoming' && (
                        <button
                          onClick={() => handleDuplicate(auction)}
                          className="p-2 rounded-xl text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer active:scale-95 transition-all"
                          title={st.duplicate}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(auction)}
                        className={`p-2 rounded-xl cursor-pointer active:scale-95 transition-all border ${
                          (auction.totalBids || 0) > 0 
                            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed' 
                            : 'bg-white border-rose-100 text-rose-500 hover:bg-rose-50'
                        }`}
                        disabled={(auction.totalBids || 0) > 0}
                        title={st.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 3: ORDERS ======================= */}
        {activeTab === 'orders' && (
          <div className="space-y-6" id="tab-orders">
            {selectedOrderId ? (
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-[0_3px_15px_rgba(0,0,0,0.01)] relative">
                <button 
                  onClick={() => setSelectedOrderId(null)}
                  className="absolute top-4 left-4 rtl:left-auto rtl:right-4 p-2 bg-gray-50 hover:bg-gray-150 rounded-xl cursor-pointer text-gray-500 transition-all z-10"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="pt-8">
                  <OrderDetailsView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-[0_3px_12px_rgba(0,0,0,0.01)]">
                {myOrders.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    {st.no_orders}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left rtl:text-right border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-black tracking-wider uppercase">
                          <th className="p-4">{isAr ? 'المنتج والمزاد' : 'Auction / Item'}</th>
                          <th className="p-4">{st.buyer}</th>
                          <th className="p-4">{st.price}</th>
                          <th className="p-4">{st.status}</th>
                          <th className="p-4">{st.payment}</th>
                          <th className="p-4">{st.shipping}</th>
                          <th className="p-4">{st.escrow}</th>
                          <th className="p-4 text-center">{isAr ? 'الإجراء' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                        {myOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                            {/* Auction Name */}
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-gray-200 bg-gray-50">
                                  <img src={order.auctionImage || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&q=80'} className="w-full h-full object-cover" />
                                </div>
                                <div className="max-w-[150px] lg:max-w-[200px]">
                                  <p className="font-extrabold text-gray-900 truncate">{order.auctionTitle}</p>
                                  <p className="text-[10px] text-gray-400 font-mono">#{order.id.substring(0, 8)}</p>
                                </div>
                              </div>
                            </td>

                            {/* Buyer info */}
                            <td className="p-4">
                              <p className="text-gray-900 font-extrabold">{order.buyerName}</p>
                              <p className="text-[10px] text-gray-400 font-mono">ID: {order.buyerId.substring(0, 8)}</p>
                            </td>

                            {/* Winning price */}
                            <td className="p-4 font-black text-gray-900">
                              {order.winningBidAmount} JOD
                            </td>

                            {/* Order Status */}
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase ${
                                order.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                order.status === 'disputed' ? 'bg-rose-50 text-rose-700 border border-rose-100 animate-pulse' :
                                order.status === 'cancelled' ? 'bg-zinc-100 text-zinc-500' :
                                'bg-orange-50 text-orange-700 border border-orange-100'
                              }`}>
                                {order.status}
                              </span>
                            </td>

                            {/* Payment Status */}
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                order.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {order.paymentStatus}
                              </span>
                            </td>

                            {/* Shipping Status */}
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                order.shippingStatus === 'delivered' ? 'bg-emerald-50 text-emerald-700' :
                                order.shippingStatus === 'shipped' ? 'bg-blue-50 text-blue-700' :
                                'bg-zinc-100 text-zinc-500'
                              }`}>
                                {order.shippingStatus}
                              </span>
                            </td>

                            {/* Escrow Status */}
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                order.escrowStatus === 'released' ? 'bg-emerald-50 text-emerald-700' :
                                order.escrowStatus === 'refunded' ? 'bg-rose-50 text-rose-700' :
                                'bg-amber-50 text-amber-700'
                              }`}>
                                {order.escrowStatus}
                              </span>
                            </td>

                            {/* Open button */}
                            <td className="p-4 text-center">
                              <button
                                onClick={() => setSelectedOrderId(order.id)}
                                className="px-3.5 py-2 bg-gradient-to-r from-[#FF6B00] to-orange-500 text-white rounded-xl font-bold hover:shadow-md hover:shadow-orange-500/10 active:scale-95 transition-all text-[11px] cursor-pointer"
                              >
                                {st.open_details}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 4: PAYOUTS ======================= */}
        {activeTab === 'payouts' && (
          <div className="space-y-6" id="tab-payouts">
            {/* PAYOUT CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Available balance card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-[0_3px_10px_rgba(0,0,0,0.015)] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 text-emerald-50/40 transform translate-x-2 -translate-y-2">
                  <Wallet className="w-24 h-24 stroke-[1]" />
                </div>
                <div className="space-y-4">
                  <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl inline-block">
                    <Wallet className="w-6 h-6" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black tracking-wider uppercase leading-none">{st.available_balance}</p>
                    <p className="text-2xl font-black text-gray-900">{kpis.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} JOD</p>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setIsWithdrawModalOpen('bank')}
                      className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black hover:bg-black active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-black/10"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{st.withdraw_bank}</span>
                    </button>
                    <button
                      onClick={() => setIsWithdrawModalOpen('cliq')}
                      className="flex-1 py-2.5 bg-[#FF6B00] text-white rounded-xl text-xs font-black hover:bg-orange-600 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-[#FF6B00]/10"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{st.withdraw_cliq}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Escrow pending balance card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-[0_3px_10px_rgba(0,0,0,0.015)] space-y-4">
                <span className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl inline-block">
                  <Clock className="w-6 h-6" />
                </span>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 font-black tracking-wider uppercase leading-none">{st.escrow_pending}</p>
                  <p className="text-2xl font-black text-gray-900">{kpis.escrowLocked.toLocaleString(undefined, { minimumFractionDigits: 2 })} JOD</p>
                  <p className="text-[10px] text-gray-400">
                    {isAr ? 'أموال مبيعاتك المحتجزة بأمان في حساب الضمان لحين تأكيد التسليم.' : 'Funds held securely in Escrow until buyer inspection completed.'}
                  </p>
                </div>
              </div>

              {/* Released funds card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-[0_3px_10px_rgba(0,0,0,0.015)] space-y-4">
                <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl inline-block">
                  <CheckCircle className="w-6 h-6" />
                </span>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 font-black tracking-wider uppercase leading-none">{st.funds_released}</p>
                  <p className="text-2xl font-black text-gray-900">
                    {myOrders.filter(o => o.escrowStatus === 'released').reduce((sum, o) => sum + o.winningBidAmount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} JOD
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {isAr ? 'إجمالي الأموال التي تم تحريرها بالكامل من الضمان وإيداعها بنجاح.' : 'Total historical assets released and deposited successfully.'}
                  </p>
                </div>
              </div>
            </div>

            {/* WITHDRAWAL HISTORY TABLE */}
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-[0_3px_12px_rgba(0,0,0,0.01)] space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#FF6B00]" />
                  <span>{st.withdrawal_history}</span>
                </h3>
              </div>

              {withdrawals.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  {isAr ? 'لا يوجد عمليات سحب مالي مسجلة بعد.' : 'No withdrawals recorded yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left rtl:text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-black uppercase tracking-wider">
                        <th className="p-4">{isAr ? 'رقم المعاملة' : 'Reference ID'}</th>
                        <th className="p-4">{isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
                        <th className="p-4">{isAr ? 'المبلغ' : 'Amount'}</th>
                        <th className="p-4">{isAr ? 'وسيلة السحب' : 'Method'}</th>
                        <th className="p-4">{isAr ? 'التفاصيل والوجهة' : 'Recipient Details'}</th>
                        <th className="p-4">{isAr ? 'حالة الطلب' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                      {withdrawals.map((w) => (
                        <tr key={w.id} className="hover:bg-gray-50/30 transition-colors">
                          <td className="p-4 font-mono font-black text-gray-900">{w.referenceId}</td>
                          <td className="p-4 text-gray-500">
                            {new Date(w.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4 font-black text-gray-900">{w.amount} JOD</td>
                          <td className="p-4">
                            <span className="capitalize font-extrabold">{w.method === 'bank' ? (isAr ? 'تحويل بنكي' : 'Bank Wire') : 'CliQ'}</span>
                          </td>
                          <td className="p-4 text-gray-500 font-mono text-[11px] max-w-[200px] truncate">
                            {w.method === 'bank' ? (
                              <span>{w.details?.bankName} - {w.details?.iban}</span>
                            ) : (
                              <span>CliQ: {w.details?.cliqAlias || w.details?.phone}</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                              w.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                              w.status === 'rejected' ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {w.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= TAB 5: ANALYTICS ======================= */}
        {activeTab === 'analytics' && (
          <div className="space-y-6" id="tab-analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Daily Sales Chart */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.015)] space-y-4">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">{st.daily_sales}</h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.dailyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontStyle="bold" />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip formatter={(value) => [`${value} JOD`, isAr ? 'المبيعات' : 'Sales']} />
                      <Bar dataKey="sales" fill="#FF6B00" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Revenue Chart */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.015)] space-y-4">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">{st.monthly_rev}</h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData.monthlyData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontStyle="bold" />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip formatter={(value) => [`${value} JOD`, isAr ? 'الإيرادات' : 'Revenue']} />
                      <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Views vs Bids */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.015)] space-y-4">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">{st.views_vs_bids}</h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.viewsVsBidsData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="views" name={isAr ? 'المشاهدات' : 'Views'} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="bids" name={isAr ? 'المزايدات' : 'Bids'} fill="#FF6B00" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Categories Pie Chart */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.015)] space-y-4">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">{st.top_categories}</h4>
                <div className="h-64 w-full flex items-center justify-center">
                  {chartData.categoryData.length === 0 ? (
                    <p className="text-xs text-gray-400">{isAr ? 'لا يوجد بيانات كافية للفئات.' : 'No categories data.'}</p>
                  ) : (
                    <div className="flex flex-col md:flex-row items-center justify-around w-full">
                      <div className="h-48 w-48 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData.categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {chartData.categoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={chartData.COLORS[index % chartData.COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value} ${isAr ? 'مزاد' : 'Auctions'}`, 'Count']} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-500 font-bold max-w-[200px] py-4">
                        {chartData.categoryData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded" style={{ backgroundColor: chartData.COLORS[index % chartData.COLORS.length] }}></span>
                            <span className="truncate max-w-[80px]">{entry.name}: {entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ======================= TAB 6: REVIEWS ======================= */}
        {activeTab === 'reviews' && (
          <div className="space-y-6" id="tab-reviews">
            <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.01)]">
              <h3 className="text-sm font-black text-gray-900 border-b border-gray-100 pb-4 mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-[#FF6B00]" />
                <span>{st.buyer_feedback}</span>
              </h3>

              {reviews.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {st.no_reviews}
                </div>
              ) : (
                <div className="space-y-5">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/30 flex flex-col gap-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        {/* Reviewer Profile */}
                        <div className="flex items-center gap-3">
                          <img src={rev.buyerAvatar} alt={rev.buyerName} className="w-10 h-10 rounded-full border border-gray-200" />
                          <div>
                            <p className="font-extrabold text-xs text-gray-900">{rev.buyerName}</p>
                            <p className="text-[10px] text-gray-400 font-mono">
                              {new Date(rev.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>

                        {/* Stars & Auction Reference */}
                        <div className="flex flex-col items-start md:items-end gap-1">
                          <div className="flex items-center gap-1 text-yellow-500">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-3.5 h-3.5 ${i < rev.rating ? 'fill-current' : 'text-gray-200'}`} />
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-400 font-medium">
                            {isAr ? 'المعاملة:' : 'Item:'} <span className="font-bold text-gray-600 font-mono">{rev.auctionTitle}</span>
                          </p>
                        </div>
                      </div>

                      {/* Comment text */}
                      <p className="text-xs text-gray-700 leading-relaxed font-semibold italic bg-white p-3 rounded-xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.005)]">
                        "{rev.comment}"
                      </p>

                      {/* Reply / Response Section */}
                      {rev.response ? (
                        <div className="ml-6 rtl:ml-0 rtl:mr-6 p-3 bg-[#FF6B00]/5 rounded-xl border border-[#FF6B00]/10 space-y-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-[#FF6B00] font-black tracking-wider uppercase">
                            <Store className="w-3.5 h-3.5" />
                            <span>{isAr ? 'ردك المهني:' : 'Your Response:'}</span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed font-semibold">{rev.response}</p>
                        </div>
                      ) : (
                        <ReviewResponseForm reviewId={rev.id} onReply={(text) => handleReviewReply(rev.id, text)} isAr={isAr} st={st} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= TAB 7: NOTIFICATIONS ======================= */}
        {activeTab === 'notifications' && (
          <div className="space-y-6" id="tab-notifications">
            <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-[0_3px_10px_rgba(0,0,0,0.01)]">
              <h3 className="text-sm font-black text-gray-900 border-b border-gray-100 pb-4 mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FF6B00]" />
                <span>{st.all_notifs}</span>
              </h3>

              {sellerNotifications.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {st.no_notifications}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sellerNotifications.map((notif) => (
                    <div key={notif.id} className="py-4 flex items-start gap-3">
                      <span className="p-2 bg-[#FF6B00]/10 text-[#FF6B00] rounded-xl inline-block mt-0.5">
                        <Bell className="w-4 h-4" />
                      </span>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-gray-900">{isAr ? notif.titleAr : notif.titleEn}</h4>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {new Date(notif.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                          {isAr ? notif.descriptionAr : notif.descriptionEn}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* RENDER DYNAMIC REUSABLE VIEW MODALS */}
      {viewAuctionId && (
        <AuctionDetailsModal auctionId={viewAuctionId} onClose={() => setViewAuctionId(null)} />
      )}

      {/* WITHDRAWAL FORM MODAL */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="withdrawal-modal">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-gray-200 shadow-2xl relative space-y-4">
            <button 
              onClick={() => setIsWithdrawModalOpen(null)}
              className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-xl cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Wallet className="w-5 h-5 text-[#FF6B00]" />
              <h3 className="text-sm font-black text-gray-900">
                {isWithdrawModalOpen === 'bank' ? st.withdraw_bank : st.withdraw_cliq}
              </h3>
            </div>

            <p className="text-[11px] text-gray-500 font-bold bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-100 leading-normal">
              {st.withdraw_placeholder}
            </p>

            <form onSubmit={handleWithdrawalSubmit} className="space-y-4 text-xs font-bold text-gray-700">
              <div>
                <label className="block mb-1 text-gray-600">{st.amount_jod}</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="1"
                  max={kpis.availableBalance}
                  value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                  placeholder={`Max: ${kpis.availableBalance} JOD`}
                />
              </div>

              {isWithdrawModalOpen === 'bank' ? (
                <>
                  <div>
                    <label className="block mb-1 text-gray-600">{st.bank_name}</label>
                    <input
                      type="text"
                      required
                      value={wBankName}
                      onChange={(e) => setWBankName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                      placeholder={isAr ? 'مثال: البنك العربي' : 'e.g. Arab Bank'}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-gray-600">{st.iban}</label>
                    <input
                      type="text"
                      required
                      value={wIban}
                      onChange={(e) => setWIban(e.target.value)}
                      className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00] font-mono"
                      placeholder="JO83 ARAB 1020 ..."
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-gray-600">{st.account_holder}</label>
                    <input
                      type="text"
                      required
                      value={wHolderName}
                      onChange={(e) => setWHolderName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                      placeholder={currentUser?.name}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block mb-1 text-gray-600">{st.cliq_alias}</label>
                    <input
                      type="text"
                      required
                      value={wCliqAlias}
                      onChange={(e) => setWCliqAlias(e.target.value)}
                      className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00] font-mono"
                      placeholder={isAr ? 'اسم مستعار كليك أو رقم الموبايل' : 'CliQ Alias or Mobile'}
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-[#FF6B00] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-black rounded-xl cursor-pointer active:scale-95 transition-all shadow-md shadow-orange-500/15 text-center mt-2"
              >
                {st.submit_withdrawal}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT LISTING MODAL */}
      {isEditModalOpen && editingAuction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="edit-listing-modal">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-gray-200 shadow-2xl relative space-y-4">
            <button 
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingAuction(null);
              }}
              className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-xl cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Edit className="w-5 h-5 text-[#FF6B00]" />
              <h3 className="text-sm font-black text-gray-900">
                {editingAuction.status === 'rejected'
                  ? (isAr ? 'عدّل وأعد الإرسال للمراجعة' : 'Edit & Resubmit for Review')
                  : (isAr ? 'تعديل بيانات المزاد' : 'Edit Auction Details')}
              </h3>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-bold text-gray-700">
              <div>
                <label className="block mb-1 text-gray-600">{isAr ? 'عنوان المزاد' : 'Auction Title'}</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                />
              </div>

              <div>
                <label className="block mb-1 text-gray-600">{isAr ? 'الوصف' : 'Description'}</label>
                <textarea
                  required
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-gray-600">{isAr ? 'السعر الابتدائي' : 'Starting Price'}</label>
                  <input
                    type="number"
                    required
                    value={editStartingPrice}
                    onChange={(e) => setEditStartingPrice(parseFloat(e.target.value))}
                    className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-gray-600">{isAr ? 'المدة الزمنية (بالثواني)' : 'Duration (seconds)'}</label>
                  <input
                    type="number"
                    required
                    value={editDuration}
                    onChange={(e) => setEditDuration(parseInt(e.target.value))}
                    className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-gray-600">{isAr ? 'الفئة' : 'Category'}</label>
                <input
                  type="text"
                  required
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-[#FF6B00]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-[#FF6B00] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-black rounded-xl cursor-pointer active:scale-95 transition-all shadow-md shadow-orange-500/15 text-center mt-2"
              >
                {editingAuction.status === 'rejected'
                  ? (isAr ? 'أعد الإرسال للمراجعة' : 'Resubmit for Review')
                  : (isAr ? 'حفظ التعديلات' : 'Save Modifications')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VERIFICATION APPLY MODAL */}
      {isVerRequestOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="ver-apply-modal">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-gray-200 shadow-2xl relative space-y-4 text-left rtl:text-right">
            <button 
              onClick={() => setIsVerRequestOpen(false)}
              className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-xl cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-[#FF6B00]" />
              <h3 className="text-sm font-black text-gray-900">
                {isAr ? 'توثيق حساب التاجر الرسمي' : 'Apply for Merchant Verification'}
              </h3>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!idFrontFile || !idBackFile) return;
              setIsVerSubmitting(true);
              try {
                const userId = currentUser?.id || 'unknown';
                const timestamp = Date.now();
                
                // Dynamic import of firebase/storage
                const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                const storageInstance = await getFirebaseStorage();
                
                // 1. Upload ID Front file
                const frontRef = ref(storageInstance, `verification-documents/${userId}/${timestamp}_front_${idFrontFile.name}`);
                const frontSnap = await uploadBytes(frontRef, idFrontFile);
                const idFrontUrl = await getDownloadURL(frontSnap.ref);
                
                // 2. Upload ID Back file
                const backRef = ref(storageInstance, `verification-documents/${userId}/${timestamp}_back_${idBackFile.name}`);
                const backSnap = await uploadBytes(backRef, idBackFile);
                const idBackUrl = await getDownloadURL(backSnap.ref);
                
                // 3. Upload Passport file if selected
                let passportUrl = '';
                if (passportFile) {
                  const passRef = ref(storageInstance, `verification-documents/${userId}/${timestamp}_passport_${passportFile.name}`);
                  const passSnap = await uploadBytes(passRef, passportFile);
                  passportUrl = await getDownloadURL(passSnap.ref);
                }
                
                const res = await submitVerificationRequest(
                  requestedStatus, 
                  verNotes, 
                  idFrontUrl, 
                  idBackUrl, 
                  passportUrl
                );
                
                setIsVerSubmitting(false);
                if (res.success) {
                  setIsVerRequestOpen(false);
                  setVerNotes('');
                  setIdFrontFile(null);
                  setIdBackFile(null);
                  setPassportFile(null);
                }
              } catch (err: any) {
                console.error("Error submitting verification documents:", err);
                setIsVerSubmitting(false);
                alert(isAr ? `حدث خطأ أثناء رفع المستندات: ${err.message}` : `An error occurred while uploading documents: ${err.message}`);
              }
            }} className="space-y-4">
              
              <div>
                <label className="block text-gray-700 text-xs font-black uppercase tracking-wider mb-2">
                  {isAr ? 'رتبة التوثيق المطلوبة' : 'Requested Status Rank'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setRequestedStatus('verified')}
                    className={`p-3.5 rounded-2xl border text-center flex flex-col items-center justify-center cursor-pointer transition-all ${
                      requestedStatus === 'verified' 
                        ? 'border-[#FF6B00] bg-orange-500/5 text-[#FF6B00]' 
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <ShieldCheck className="w-6 h-6 mb-1" />
                    <span className="text-xs font-black">{isAr ? 'بائع موثق' : 'Verified'}</span>
                    <span className="text-[9px] opacity-75 font-semibold mt-0.5">{isAr ? 'شارات ورتبة قياسية' : 'Standard verified badge'}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setRequestedStatus('premium_verified')}
                    className={`p-3.5 rounded-2xl border text-center flex flex-col items-center justify-center cursor-pointer transition-all ${
                      requestedStatus === 'premium_verified' 
                        ? 'border-[#FF6B00] bg-orange-500/5 text-[#FF6B00]' 
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Sparkles className="w-6 h-6 mb-1" />
                    <span className="text-xs font-black">{isAr ? 'موثق متميز' : 'Premium'}</span>
                    <span className="text-[9px] opacity-75 font-semibold mt-0.5">{isAr ? 'حساب بائع VIP ذهبي' : 'Exclusive Gold VIP status'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-gray-700 text-xs font-black uppercase tracking-wider">
                  {isAr ? 'مستندات التحقق من الهوية الوطنية' : 'Identity Verification Documents'}
                </label>
                
                {/* ID FRONT */}
                <div className="space-y-1">
                  <span className="block text-[11px] text-gray-500 font-bold">
                    {isAr ? 'صورة الوجه الأمامي للهوية الوطنية (مطلوب)' : 'National ID - Front Image (Required)'}
                  </span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    id="id-front-upload" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setIdFrontFile(e.target.files[0]);
                      }
                    }} 
                  />
                  <label 
                    htmlFor="id-front-upload"
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all text-xs"
                  >
                    <span className="text-gray-500 font-medium truncate max-w-[200px]">
                      {idFrontFile ? idFrontFile.name : (isAr ? 'اختر صورة الوجه الأمامي...' : 'Select front side image...')}
                    </span>
                    {idFrontFile ? (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        ✅ {isAr ? 'جاهز' : 'Ready'}
                      </span>
                    ) : (
                      <span className="text-[#FF6B00] font-bold">
                        {isAr ? 'رفع ملف' : 'Upload File'}
                      </span>
                    )}
                  </label>
                </div>

                {/* ID BACK */}
                <div className="space-y-1">
                  <span className="block text-[11px] text-gray-500 font-bold">
                    {isAr ? 'صورة الوجه الخلفي للهوية الوطنية (مطلوب)' : 'National ID - Back Image (Required)'}
                  </span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    id="id-back-upload" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setIdBackFile(e.target.files[0]);
                      }
                    }} 
                  />
                  <label 
                    htmlFor="id-back-upload"
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all text-xs"
                  >
                    <span className="text-gray-500 font-medium truncate max-w-[200px]">
                      {idBackFile ? idBackFile.name : (isAr ? 'اختر صورة الوجه الخلفي...' : 'Select back side image...')}
                    </span>
                    {idBackFile ? (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        ✅ {isAr ? 'جاهز' : 'Ready'}
                      </span>
                    ) : (
                      <span className="text-[#FF6B00] font-bold">
                        {isAr ? 'رفع ملف' : 'Upload File'}
                      </span>
                    )}
                  </label>
                </div>

                {/* PASSPORT (OPTIONAL) */}
                <div className="space-y-1">
                  <span className="block text-[11px] text-gray-500 font-bold">
                    {isAr ? 'صورة جواز السفر (اختياري كبديل)' : 'Passport Image (Optional)'}
                  </span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    id="passport-upload" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setPassportFile(e.target.files[0]);
                      }
                    }} 
                  />
                  <label 
                    htmlFor="passport-upload"
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all text-xs"
                  >
                    <span className="text-gray-500 font-medium truncate max-w-[200px]">
                      {passportFile ? passportFile.name : (isAr ? 'اختر صورة جواز السفر...' : 'Select passport image...')}
                    </span>
                    {passportFile ? (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        ✅ {isAr ? 'جاهز' : 'Ready'}
                      </span>
                    ) : (
                      <span className="text-gray-400 font-bold">
                        {isAr ? 'رفع ملف' : 'Upload File'}
                      </span>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-gray-600 text-xs font-black mb-1.5">
                  {isAr ? 'ملاحظات إضافية لإدارة المنصة' : 'Additional Remarks'}
                </label>
                <textarea 
                  rows={3}
                  value={verNotes}
                  onChange={(e) => setVerNotes(e.target.value)}
                  placeholder={isAr ? 'يرجى تقديم نبذة قصيرة عن طبيعة أعمالك أو أي روابط لتوثيق جودة معروضاتك...' : 'Brief description of your business activity...'}
                  className="w-full p-3 text-xs border border-gray-200 rounded-xl outline-none focus:border-[#FF6B00] font-sans font-medium text-gray-700"
                />
              </div>

              <button 
                type="submit"
                disabled={isVerSubmitting || !idFrontFile || !idBackFile}
                className="w-full py-3.5 bg-gradient-to-r from-[#FF6B00] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-black rounded-xl cursor-pointer active:scale-95 transition-all shadow-md shadow-orange-500/15 text-center flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:from-gray-300 disabled:to-gray-400"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isVerSubmitting ? (isAr ? 'جاري الرفع والإرسال...' : 'Uploading & Submitting...') : (isAr ? 'إرسال طلب التوثيق الرسمي' : 'Submit Official Request')}</span>
              </button>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// Subcomponent helper for writing review response professionally
interface ReviewResponseProps {
  reviewId: string;
  onReply: (text: string) => Promise<void>;
  isAr: boolean;
  st: any;
}

const ReviewResponseForm: React.FC<ReviewResponseProps> = ({ onReply, isAr, st }) => {
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setIsSubmitting(true);
    await onReply(replyText);
    setIsSubmitting(false);
    setReplyText('');
    setIsReplying(false);
  };

  if (!isReplying) {
    return (
      <button
        onClick={() => setIsReplying(true)}
        className="self-start px-3.5 py-1.5 rounded-xl border border-gray-200 hover:border-[#FF6B00] text-gray-500 hover:text-[#FF6B00] transition-colors flex items-center gap-1 text-[11px] font-black cursor-pointer"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        <span>{st.respond}</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2" id={`reply-form-${Math.random()}`}>
      <textarea
        required
        rows={2}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder={st.response_placeholder}
        className="w-full p-3 text-xs border border-gray-200 rounded-xl outline-none focus:border-[#FF6B00] font-semibold text-gray-700"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-[#FF6B00] text-white text-[11px] font-black rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSubmitting ? '...' : st.save_response}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsReplying(false)}
          className="px-4 py-2 bg-gray-100 text-gray-600 text-[11px] font-black rounded-xl hover:bg-gray-100 transition-colors cursor-pointer active:scale-95"
        >
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
    </form>
  );
};
