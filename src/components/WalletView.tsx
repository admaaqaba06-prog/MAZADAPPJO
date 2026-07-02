import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { WalletRowSkeleton, EmptyState } from './FeedbackStates';
import { db } from '../services/firebase';
import { doc, updateDoc, setDoc, getDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { OrderDetailsView } from './OrderDetailsView';
import { AdminWalletConsole } from './AdminWalletConsole';
import { MyOrdersList } from './MyOrdersList';
import { SoldOrdersList } from './SoldOrdersList';
import { 
  User as UserIcon, 
  HelpCircle, 
  ArrowUpRight, 
  BookOpen, 
  Clock, 
  CheckCircle, 
  ShieldCheck, 
  XCircle, 
  DollarSign, 
  UploadCloud, 
  Check, 
  Sparkles,
  RefreshCw,
  Building2,
  Lock,
  LogOut,
  Camera,
  Wallet,
  ArrowDownLeft,
  ChevronRight,
  ShieldAlert,
  Info,
  Copy,
  CreditCard,
  History,
  X,
  Eye,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  ShoppingBag,
  Package,
  Truck,
  AlertTriangle,
  Plus,
  TrendingUp,
  TrendingDown,
  ChevronLeft
} from 'lucide-react';
import { EscrowTransaction } from '../types';

export const WalletView: React.FC = () => {
  const { 
    wallet, 
    escrows, 
    orders,
    setEscrows,
    triggerCliQTopUp, 
    addNotification, 
    language, 
    logout, 
    currentUser, 
    setShowSubscriptionPrompt,
    users,
    releaseEscrow,
    refundEscrow,
    setWallet,
    setActiveView,
    setCurrentUser
  } = useApp();
  
  const t = translations[language];
  const isAr = language === 'ar';

  const localT = {
    totalBalance: isAr ? 'إجمالي رصيد المحفظة' : 'Total Wallet Balance',
    availableBalance: isAr ? 'الرصيد المتاح للمزايدة' : 'Available to Bid',
    availableToWithdraw: isAr ? 'المتاح للسحب' : 'Available to Withdraw',
    pendingBalance: isAr ? 'إيداعات قيد التدقيق' : 'Pending Verification',
    escrowBalance: isAr ? 'ضمانات المزادات النشطة' : 'Bidding Escrow',
    addFunds: isAr ? 'شحن رصيد المحفظة' : 'Add Funds',
    withdraw: isAr ? 'سحب الرصيد البنكي' : 'Withdraw Funds',
    transactions: isAr ? 'سجل الحركات المالية' : 'Transactions Ledger',
    orders: isAr ? 'المشتريات والمبيعات' : 'My Orders & Sales',
    myWallet: isAr ? 'رصيدي ومحفظتي' : 'My Wallet',
    recentActivity: isAr ? 'النشاطات المالية الأخيرة' : 'Recent Wallet Activity',
    back: isAr ? 'رجوع للمحفظة' : 'Back to Wallet',
    customAmount: isAr ? 'قيمة إيداع مخصصة' : 'Custom Amount Input',
    submit: isAr ? 'إرسال طلب الإيداع للتدقيق' : 'Submit Deposit Proof',
    cliqAlias: isAr ? 'اسم مستعار كليك (المرسل)' : 'Sender CliQ Alias',
    chooseAmount: isAr ? 'حدد أو اكتب قيمة الشحن (JOD)' : 'Choose JOD Deposit Amount',
    receiptAttachment: isAr ? 'لقطة شاشة لوصل التحويل (إلزامي)' : 'CliQ Receipt Screenshot',
    aliasPlaceholder: isAr ? 'مثال: name@cliq' : 'e.g. name@cliq',
    bankDetails: isAr ? 'بيانات الإيداع الفوري عبر كليك' : 'CliQ Deposit Banking Details',
    recipientBank: isAr ? 'البنك المستقبل' : 'Recipient Bank',
    accountName: isAr ? 'اسم المستفيد' : 'Account Name',
    copied: isAr ? 'تم نسخ الحساب!' : 'Copied!',
    uploadReceipt: isAr ? 'اضغط لرفع لقطة شاشة لوصل كليك المالي' : 'Click to Upload CliQ Receipt Screenshot',
    supportedFormats: isAr ? 'صيغ المدعومة: PNG، JPEG' : 'Supports PNG, JPG',
    all: isAr ? 'الكل' : 'All',
    moneyIn: isAr ? 'المبالغ الواردة' : 'Money In',
    moneyOut: isAr ? 'المبالغ الصادرة' : 'Money Out',
    buying: isAr ? 'مشترياتي وعقودي' : 'My Purchases',
    selling: isAr ? 'مبيعاتي المعلقة' : 'My Sales',
    recentDesc: isAr ? 'العمليات المعلقة ودفعات المزادات الأخيرة' : 'Your pending cliq deposits & active auction payments.',
    emptyActivity: isAr ? 'لا يوجد حركات مسجلة حالياً' : 'No recorded operations yet.',
    emptyActivityDesc: isAr ? 'ستظهر هنا حركات شحن رصيدك أو تجميد ضمانات بيدك مباشرة.' : 'Deposits and escrow updates will appear here instantly.',
    howMuchYouHave: isAr ? 'كم تملك من المال' : 'How much money you have',
    whereToAdd: isAr ? 'كيفية شحن رصيدك' : 'Where to add funds',
    secureSummary: isAr ? 'حماية وأمان المعاملات' : 'Secure Trust Assurance',
    pendingDeposits: isAr ? 'الإيداعات قيد التحقق' : 'Pending Verification Desk',
    helpSupport: isAr ? 'الدعم المالي المباشر' : 'Finance Support Desk',
    helpDesc: isAr ? 'فريق العمليات المالية المباشر في عمان متاح طوال اليوم لمساعدتك وتدقيق حوالتك وتأكيد الشحن.' : 'Our 24/7 Amman Finance Desk is ready to assist you. Contact us for instant top-up approvals.',
    bankName: isAr ? 'اسم البنك المستقبل' : 'Bank Name',
    accountHolder: isAr ? 'اسم صاحب الحساب' : 'Account Holder Name',
    withdrawMethod: isAr ? 'طريقة السحب المفضلة' : 'Withdrawal Method',
    cliqInstant: isAr ? 'كليك (فوري)' : 'CliQ (Instant)',
    bankTransfer: isAr ? 'تحويل بنكي تقليدي' : 'Classic Bank Transfer',
    withdrawSuccess: isAr ? 'تم تقديم طلب السحب بنجاح!' : 'Withdrawal Requested Successfully!',
    withdrawSuccessDesc: isAr ? 'تم تقديم مستند طلب السحب المالي للأقسام المعنية للتأكيد والمراجعة خلال 24 ساعة.' : 'Your request is submitted to the audit desk. Settlements occur within 24 hours.',
    withdrawBtn: isAr ? 'تأكيد تقديم طلب السحب' : 'Submit Withdrawal',
    amountLabel: isAr ? 'المبلغ المطلوب سحبه (JOD)' : 'Withdraw Amount (JOD)',
    bankInputLabel: isAr ? 'اسم البنك المستهدف' : 'Target Bank Name',
    ibanInputLabel: isAr ? 'رقم الحساب أو الآيبان (IBAN)' : 'IBAN / Account Number',
    holderInputLabel: isAr ? 'اسم صاحب الحساب المستفيد' : 'Beneficiary Holder Name',
    phoneLabel: isAr ? 'رقم الهاتف المرتبط بالتحويل' : 'Phone Number',
    withdrawDetailsTitle: isAr ? 'حدد بيانات الحساب البنكي للسحب' : 'Enter Withdrawal Bank Account Details',
    allTx: isAr ? 'كل العمليات' : 'All Transactions',
    moneyInTx: isAr ? 'الوارد والتمويل' : 'Deposits & In',
    moneyOutTx: isAr ? 'الصادر والضمان' : 'Withdrawals & Escrow',
  };

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isActivatingSeller, setIsActivatingSeller] = useState(false);

  const handleActivateSeller = async () => {
    if (!currentUser) return;
    setIsActivatingSeller(true);
    try {
      const storeName = currentUser.name ? (isAr ? `متجر ${currentUser.name}` : `${currentUser.name}'s Store`) : (isAr ? 'متجري الخاص' : 'My Store');
      const location = isAr ? 'عمان، الأردن' : 'Amman, Jordan';
      const about = isAr ? 'أهلاً بكم في متجري الخاص على مزاد الأردن.' : 'Welcome to my official store on MAZAD JO.';

      const sellerPayload = {
        isSeller: true,
        sellerStatus: 'active',
        sellerActivatedAt: serverTimestamp(),
        sellerProfile: {
          storeName,
          location,
          about,
          rating: 0,
          completedSales: 0
        }
      };

      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        isSeller: sellerPayload.isSeller,
        sellerStatus: sellerPayload.sellerStatus,
        sellerActivatedAt: sellerPayload.sellerActivatedAt,
        sellerProfile: sellerPayload.sellerProfile
      });

      const profileId = currentUser.id;
      const profileRef = doc(db, 'sellerProfiles', profileId);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        await setDoc(profileRef, {
          id: profileId,
          userId: currentUser.id,
          storeName,
          storeLogo: currentUser.avatar || 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=150&q=80',
          coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
          bio: about,
          rating: 5.0,
          totalSales: 0,
          isVerifiedMerchant: false,
          joinedDate: new Date().toLocaleDateString(language === 'ar' ? 'ar-JO' : 'en-US', { month: 'long', year: 'numeric' }),
          location,
          followers: 0,
          following: 0,
          verificationStatus: 'not_verified',
          responseTime: isAr ? 'ساعة واحدة' : '1 hour',
          cancellationRate: 0,
          trustScore: 50,
          badges: []
        });
      }

      setCurrentUser(prev => prev ? ({ 
        ...prev, 
        role: 'seller', 
        isSeller: true, 
        sellerStatus: 'active',
        sellerActivatedAt: Date.now(),
        sellerProfile: {
          storeName,
          location,
          about,
          rating: 0,
          completedSales: 0
        }
      }) : null);

      addNotification(
        isAr ? '✅ تم تفعيل حساب البائع' : '✅ Seller Account Activated',
        isAr 
          ? 'تهانينا! تم تفعيل حساب البائع الخاص بك بنجاح. يمكنك الآن الانتقال إلى مركز البائع وإدراج المزادات.' 
          : 'Congratulations! Your seller account is active. You can now visit the Seller Center to manage your business.',
        'info'
      );
    } catch (err: any) {
      console.error("Failed to activate seller:", err);
      alert(isAr 
        ? `فشل تفعيل حساب البائع. التفاصيل: ${err.message || err}` 
        : `Failed to activate seller account. Details: ${err.message || err}`
      );
    } finally {
      setIsActivatingSeller(false);
    }
  };

  const isStrictAdmin = currentUser && (currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true);

  const myEscrows = isStrictAdmin 
    ? escrows 
    : (currentUser ? escrows.filter(e => e.bidderId === currentUser.id || e.sellerId === currentUser.id) : []);

  const myPendingDeposits = myEscrows.filter(e => e.auctionId === 'cliq-dep' && e.status === 'locked');
  const myWonAuctionsPayments = myEscrows.filter(e => e.auctionId !== 'cliq-dep' && e.auctionId !== 'cliq-sub');
  
  const myBuyerOrders = currentUser ? orders.filter(o => o.buyerId === currentUser.id) : [];
  const mySellerOrders = currentUser ? orders.filter(o => o.sellerId === currentUser.id) : [];
  
  const [amount, setAmount] = useState<string>('500');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const [alias, setAlias] = useState<string>('');
  const [fileUploaded, setFileUploaded] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedProof, setSubmittedProof] = useState<boolean>(false);
  const [copiedIBAN, setCopiedIBAN] = useState<boolean>(false);

  // Rebuilt Whatnot Screens State: 'wallet-home' | 'add-funds' | 'withdraw' | 'transactions' | 'orders'
  const [walletSubView, setWalletSubView] = useState<'wallet-home' | 'add-funds' | 'withdraw' | 'transactions' | 'orders'>('wallet-home');
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');
  const [ordersTab, setOrdersTab] = useState<'buying' | 'selling'>('buying');

  // New withdrawal states matching the Whatnot simple form style
  const [withdrawType, setWithdrawType] = useState<'bank' | 'cliq'>('cliq');
  const [wAmount, setWAmount] = useState<string>('');
  const [wBankName, setWBankName] = useState<string>('');
  const [wIban, setWIban] = useState<string>('');
  const [wHolderName, setWHolderName] = useState<string>('');
  const [wCliqAlias, setWCliqAlias] = useState<string>('');
  const [wPhone, setWPhone] = useState<string>('');
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<boolean>(false);

  // Fetch real-time withdrawals ledger
  const [myWithdrawals, setMyWithdrawals] = useState<any[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'withdrawals'), where('userId', '==', currentUser.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyWithdrawals(list);
    }, (err) => {
      console.warn("Withdrawal collection read permissions warning: ", err);
    });
    return () => unsub();
  }, [currentUser?.id]);

  // Admin Ledger States
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedProofEscrow, setSelectedProofEscrow] = useState<EscrowTransaction | null>(null);

  const presets = [100, 250, 500, 1000, 2500];

  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleRealFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setFileUploaded(true);
      addNotification(
        isAr ? '📎 تم إرفاق الوصل البنكي' : '📎 Receipt Attached', 
        isAr ? `تم إرفاق الملف "${file.name}" بنجاح.` : `File "${file.name}" attached successfully.`, 
        'info'
      );
    }
  };

  const handleCopyIBAN = () => {
    navigator.clipboard.writeText('JO83 CAPS 1020 0085 4100 00');
    setCopiedIBAN(true);
    addNotification(
      isAr ? '📋 تم النسخ' : '📋 Copied!',
      isAr ? 'تم نسخ رمز الآيبان (IBAN) إلى الحافظة.' : 'IBAN code copied to clipboard.',
      'info'
    );
    setTimeout(() => setCopiedIBAN(false), 2000);
  };

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert(isAr ? 'الرجاء إدخال قيمة مالية صحيحة بالدينار.' : 'Please enter a valid amount in JOD.');
      return;
    }
    if (!alias.trim()) {
      alert(isAr ? 'اسم مستعار كليك مطلوب لتأشير الحوالة.' : 'Your bank CliQ alias is required.');
      return;
    }
    if (!fileUploaded || !selectedFile) {
      alert(isAr ? 'الرجاء إرفاق لقطة شاشة لوصل حوالة كليك للتحقق.' : 'Please upload your CliQ receipt screenshot to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { getFirebaseStorage } = await import('../services/firebase');
      const storageInstance = await getFirebaseStorage();
      
      const storagePath = `payment-proofs/${currentUser?.id || 'anonymous'}/${Date.now()}_${selectedFile.name}`;
      const fileRef = ref(storageInstance, storagePath);
      await uploadBytes(fileRef, selectedFile);
      const downloadURL = await getDownloadURL(fileRef);

      await triggerCliQTopUp(Number(amount), alias, downloadURL);
      
      setIsSubmitting(false);
      setSubmittedProof(true);
      setAmount('500');
      setFileUploaded(false);
      setFileName('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error("Firebase Storage write failure during CliQ receipt upload:", error);
      addNotification(
        isAr ? '❌ فشل رفع الإثبات' : '❌ Storage Upload Failed',
        isAr ? `تعذر رفع صورة إيصال التحويل. الرجاء المحاولة مرة أخرى.` : `Failed to upload payment receipt. Please try again.`,
        'alert'
      );
      setIsSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const amountNum = Number(wAmount);
    if (!wAmount || isNaN(amountNum) || amountNum <= 0) {
      alert(isAr ? 'الرجاء إدخال مبلغ صحيح للسحب.' : 'Please enter a valid amount.');
      return;
    }
    if (amountNum > wallet.availableBalance) {
      alert(isAr ? 'المبلغ المطلوب يتجاوز الرصيد المتاح للسحب.' : 'Amount exceeds available balance.');
      return;
    }

    if (withdrawType === 'bank') {
      if (!wBankName.trim() || !wIban.trim() || !wHolderName.trim()) {
        alert(isAr ? 'الرجاء تعبئة كافة حقول الحساب البنكي.' : 'Please enter all bank account credentials.');
        return;
      }
    } else {
      if (!wCliqAlias.trim()) {
        alert(isAr ? 'الرجاء إدخال الاسم المستعار في كليك.' : 'Please enter your CliQ alias.');
        return;
      }
    }

    setIsWithdrawing(true);
    try {
      const wId = `with-${Date.now()}`;
      const refId = Math.floor(100000 + Math.random() * 900000).toString();
      
      const newWithdrawal = {
        id: wId,
        userId: currentUser.id,
        amount: amountNum,
        type: withdrawType,
        status: 'pending',
        timestamp: Date.now(),
        details: withdrawType === 'bank' ? {
          bankName: wBankName,
          iban: wIban,
          accountHolderName: wHolderName
        } : {
          cliqAlias: wCliqAlias,
          phone: wPhone || currentUser.phone || '0791234567'
        },
        referenceId: refId
      };

      await setDoc(doc(db, 'withdrawals', wId), newWithdrawal);

      const walletRef = doc(db, 'wallets', currentUser.id);
      const newAvailFils = Math.round((wallet.availableBalance - amountNum) * 1000);
      const newEscrowFils = Math.round((wallet.escrowBalance + amountNum) * 1000);

      await updateDoc(walletRef, {
        availableBalance: newAvailFils,
        escrowBalance: newEscrowFils
      });

      addNotification(
        isAr ? '💸 تم تقديم طلب السحب' : '💸 Withdrawal Request Logged',
        isAr 
          ? `تم تسجيل طلب سحب بقيمة ${amountNum} د.أ بنجاح وهو قيد التدقيق.` 
          : `Withdrawal request for ${amountNum} JOD logged successfully. Pending review.`,
        'info'
      );

      setWithdrawSuccess(true);
      setWAmount('');
      setWBankName('');
      setWIban('');
      setWHolderName('');
      setWCliqAlias('');
      setWPhone('');
    } catch (err: any) {
      console.error("Failed to submit withdrawal request:", err);
      alert(isAr ? 'عذراً، فشل تسجيل العملية البنكية في هذا الخادم.' : 'Failed to register the withdrawal transaction.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleAdminApproveDeposit = (escrowId: string) => {
    releaseEscrow(escrowId);
    const item = escrows.find(e => e.id === escrowId);
    if (item) {
      addNotification(
        isAr ? '✅ تم الموافقة والاعتماد' : '✅ CliQ Deposit Credited',
        isAr 
          ? `تم اعتماد الحوالة بقيمة ${item.amount} د.أ وشحن محفظة ${item.bidderName} بنجاح.`
          : `Approved ${item.amount} JOD CliQ and successfully credited user ${item.bidderName}'s wallet balance.`,
        'win'
      );
    }
    if (selectedProofEscrow?.id === escrowId) {
      setSelectedProofEscrow(null);
    }
  };

  const handleAdminRejectDeposit = (escrowId: string) => {
    refundEscrow(escrowId);
    const item = escrows.find(e => e.id === escrowId);
    if (item) {
      addNotification(
        isAr ? '❌ تم رفض وإلغاء الحوالة' : '❌ CliQ Deposit Rejected',
        isAr 
          ? `تم رفض الحوالة البنكية بقيمة ${item.amount} د.أ الخاصة بـ ${item.bidderName}.` 
          : `Rejected CliQ verification request for ${item.amount} JOD of user ${item.bidderName}.`,
        'refund'
      );
    }
    if (selectedProofEscrow?.id === escrowId) {
      setSelectedProofEscrow(null);
    }
  };

  // -------------------------------------------------------------
  // CALCULATE BALANCES FOR ADMIN PLATFORM TREASURY
  // -------------------------------------------------------------
  const userCliqDeposits = escrows.filter(e => e.auctionId === 'cliq-dep');
  const subscriptionTransfers = escrows.filter(e => e.auctionId === 'cliq-sub');

  const approvedDepositsSum = userCliqDeposits
    .filter(e => e.status === 'released')
    .reduce((sum, e) => sum + e.amount, 0);

  const pendingDepositsSum = userCliqDeposits
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingDepositsCount = userCliqDeposits.filter(e => e.status === 'locked').length;

  const subscriptionRevenueSum = subscriptionTransfers
    .filter(e => e.status === 'released')
    .reduce((sum, e) => sum + e.amount, 0);

  const activeBiddingLocksSum = escrows
    .filter(e => e.auctionId !== 'cliq-dep' && e.auctionId !== 'cliq-sub' && e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalMazadJomCapital = approvedDepositsSum + pendingDepositsSum + subscriptionRevenueSum;

  const currentLockedEscrows = escrows.filter(e => e.status === 'locked');
  const historicEscrows = escrows.filter(e => e.status !== 'locked');

  const filteredAdminDeposits = userCliqDeposits.filter(e => {
    if (adminFilter === 'all') return true;
    if (adminFilter === 'pending') return e.status === 'locked';
    if (adminFilter === 'approved') return e.status === 'released';
    if (adminFilter === 'rejected') return e.status === 'refunded';
    return true;
  });

  const activeSubscribers = users.filter(u => u.subscriptionStatus === 'active');

  // Sum of local pending cliq deposits
  const myPendingDepositsSum = myPendingDeposits.reduce((sum, e) => sum + e.amount, 0);

  // Consolidated Recent Activity logs
  const combinedRecentActivity = [
    ...myPendingDeposits.map(d => ({
      id: d.id,
      type: 'deposit' as const,
      title: isAr ? 'تمويل معلق عبر كليك' : 'Pending CliQ Top-Up',
      subtitle: `${isAr ? 'الاسم المستعار:' : 'Alias:'} ${d.cliqAlias}`,
      amount: d.amount,
      status: 'pending' as const,
      timestamp: d.timestamp,
    })),
    ...myWonAuctionsPayments.map(p => ({
      id: p.id,
      type: 'payment' as const,
      title: p.auctionTitle,
      subtitle: `REF_ID: ${p.id.substring(0, 8).toUpperCase()}`,
      amount: -p.amount,
      status: p.status, // 'locked' | 'released'
      timestamp: p.timestamp,
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  // Consolidated Full Ledger
  const combinedTransactions = [
    ...userCliqDeposits.filter(e => isStrictAdmin ? true : e.bidderId === currentUser?.id).map(d => ({
      id: d.id,
      type: 'deposit' as const,
      title: isAr ? 'تمويل محفظة كليك' : 'CliQ Wallet Top-Up',
      subtitle: `${isAr ? 'الاسم المستعار:' : 'Alias:'} ${d.cliqAlias}`,
      amount: d.amount,
      status: d.status, // 'locked' | 'released' | 'refunded'
      timestamp: d.timestamp,
    })),
    ...myWonAuctionsPayments.map(p => ({
      id: p.id,
      type: 'payment' as const,
      title: p.auctionTitle,
      subtitle: `REF_ID: ${p.id.substring(0, 8).toUpperCase()}`,
      amount: -p.amount,
      status: p.status, // 'locked' | 'released'
      timestamp: p.timestamp,
    })),
    ...myWithdrawals.map(w => ({
      id: w.id,
      type: 'withdrawal' as const,
      title: w.type === 'cliq' ? (isAr ? 'سحب فوري كليك' : 'CliQ Cash Withdrawal') : (isAr ? 'سحب حوالة بنكية' : 'Bank Cash Withdrawal'),
      subtitle: w.type === 'cliq' ? `CliQ Alias: ${w.details?.cliqAlias}` : `${w.details?.bankName} - IBAN: ...${w.details?.iban?.substring(Math.max(0, w.details.iban.length - 6))}`,
      amount: -w.amount,
      status: w.status, // 'pending' | 'approved' | 'rejected'
      timestamp: w.timestamp,
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  const filteredTransactions = combinedTransactions.filter(tx => {
    if (txFilter === 'all') return true;
    if (txFilter === 'in') return tx.amount > 0;
    if (txFilter === 'out') return tx.amount < 0;
    return true;
  });

  // Admin bypass
  if (isStrictAdmin) {
    return (
      <AdminWalletConsole
        isAr={isAr}
        currentUser={currentUser}
        logout={logout}
        totalMazadJomCapital={totalMazadJomCapital}
        approvedDepositsSum={approvedDepositsSum}
        subscriptionRevenueSum={subscriptionRevenueSum}
        activeSubscribers={activeSubscribers}
        pendingDepositsSum={pendingDepositsSum}
        pendingDepositsCount={pendingDepositsCount}
        activeBiddingLocksSum={activeBiddingLocksSum}
        adminFilter={adminFilter}
        setAdminFilter={setAdminFilter}
        filteredAdminDeposits={filteredAdminDeposits}
        selectedProofEscrow={selectedProofEscrow}
        setSelectedProofEscrow={setSelectedProofEscrow}
        handleAdminRejectDeposit={handleAdminRejectDeposit}
        handleAdminApproveDeposit={handleAdminApproveDeposit}
        currentLockedEscrows={currentLockedEscrows}
        historicEscrows={historicEscrows}
        users={users}
        language={language}
      />
    );
  }

  // If a single order is being inspected, overlay order details screen (keeps dark background unified)
  if (selectedOrderId) {
    return (
      <div 
        className="flex-1 min-h-screen bg-[#0E0E0E] text-white p-4 md:p-8 overflow-y-auto"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="order-details-pane-rebuilt"
      >
        <div className="max-w-4xl mx-auto">
          <OrderDetailsView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />
        </div>
      </div>
    );
  }

  // Helper render method for center column or mobile screen switcher
  const renderActiveScreen = () => {
    switch (walletSubView) {
      case 'wallet-home':
        return (
          <div className="space-y-6">
            {/* Desktop Only header */}
            <div className="hidden lg:block space-y-1">
              <h1 className="text-2xl font-black tracking-tight">{localT.myWallet}</h1>
              <p className="text-zinc-400 text-sm">{localT.howMuchYouHave}</p>
            </div>

            {/* Premium Balance display */}
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-44 h-44 bg-[#FF6B00]/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-[#FF6B00] font-mono font-black block">
                  {localT.totalBalance}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl md:text-5xl font-black font-mono tracking-tight text-white">
                    {wallet.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-black text-zinc-400 font-mono">JOD</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono font-extrabold uppercase block leading-none">{localT.availableBalance}</span>
                  <p className="text-lg font-mono font-black text-[#10B981]">{wallet.availableBalance.toLocaleString()} <span className="text-[10px]">JOD</span></p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono font-extrabold uppercase block leading-none">{localT.pendingBalance}</span>
                  <p className="text-lg font-mono font-black text-amber-500">{myPendingDepositsSum.toLocaleString()} <span className="text-[10px]">JOD</span></p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono font-extrabold uppercase block leading-none">{localT.escrowBalance}</span>
                  <p className="text-lg font-mono font-black text-rose-500">{wallet.escrowBalance.toLocaleString()} <span className="text-[10px]">JOD</span></p>
                </div>
              </div>
            </div>

            {/* Mobile Only Quick Actions Stack */}
            <div className="block lg:hidden grid grid-cols-2 gap-3.5">
              <button 
                onClick={() => setWalletSubView('add-funds')}
                className="w-full bg-[#FF6B00] hover:bg-orange-600 active:scale-98 font-mono font-black py-4 rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                id="mob-btn-add-funds"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{localT.addFunds}</span>
              </button>
              <button 
                onClick={() => setWalletSubView('withdraw')}
                className="w-full bg-[#202024] border border-white/10 hover:bg-[#2c2c32] active:scale-98 font-mono font-black py-4 rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer text-white transition-all"
                id="mob-btn-withdraw"
              >
                <ArrowDownLeft className="w-4 h-4 text-zinc-400 stroke-[3]" />
                <span>{localT.withdraw}</span>
              </button>
            </div>

            {/* Quick Navigation grid */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-mono font-black tracking-widest text-zinc-400">{isAr ? 'الوصول السريع للمهام' : 'Quick Actions'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setWalletSubView('add-funds')}
                  className="bg-[#18181B] border border-white/5 hover:border-[#FF6B00]/30 rounded-3xl p-5 text-left flex flex-col justify-between h-32 transition-all cursor-pointer group"
                  id="action-add-funds-home"
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#202024] flex items-center justify-center text-[#FF6B00] group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">{localT.addFunds}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{isAr ? 'شحن فوري بالآيبان وكليك' : 'Deposit instantly via CliQ'}</p>
                  </div>
                </button>

                <button 
                  onClick={() => setWalletSubView('withdraw')}
                  className="bg-[#18181B] border border-white/5 hover:border-[#FF6B00]/30 rounded-3xl p-5 text-left flex flex-col justify-between h-32 transition-all cursor-pointer group"
                  id="action-withdraw-home"
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#202024] flex items-center justify-center text-[#10B981] group-hover:scale-105 transition-transform">
                    <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">{localT.withdraw}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{isAr ? 'سحب رصيدك لحسابك البنكي الأردني' : 'Transfer JOD to bank account'}</p>
                  </div>
                </button>

                <button 
                  onClick={() => setWalletSubView('transactions')}
                  className="bg-[#18181B] border border-white/5 hover:border-[#FF6B00]/30 rounded-3xl p-5 text-left flex flex-col justify-between h-32 transition-all cursor-pointer group"
                  id="action-transactions-home"
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#202024] flex items-center justify-center text-zinc-400 group-hover:scale-105 transition-transform">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">{localT.transactions}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{isAr ? 'عرض الإيداعات والمكاسب بالتفصيل' : 'View financial entries log'}</p>
                  </div>
                </button>

                <button 
                  onClick={() => setWalletSubView('orders')}
                  className="bg-[#18181B] border border-white/5 hover:border-[#FF6B00]/30 rounded-3xl p-5 text-left flex flex-col justify-between h-32 transition-all cursor-pointer group"
                  id="action-orders-home"
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#202024] flex items-center justify-center text-amber-500 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">{localT.orders}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{isAr ? 'متابعة بضائعك المباعة والمشتراة' : 'Track won listings & sales'}</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Recent Activity lists */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase font-mono font-black tracking-widest text-zinc-400">{localT.recentActivity}</h3>
                <button 
                  onClick={() => setWalletSubView('transactions')}
                  className="text-xs text-[#FF6B00] font-black hover:underline cursor-pointer"
                >
                  {isAr ? 'مشاهدة الكل ←' : 'View All ←'}
                </button>
              </div>

              <div className="space-y-3.5">
                {isLoading ? (
                  <>
                    <WalletRowSkeleton />
                    <WalletRowSkeleton />
                  </>
                ) : combinedRecentActivity.length > 0 ? (
                  combinedRecentActivity.slice(0, 5).map((act) => {
                    const isPositive = act.amount > 0;
                    return (
                      <div 
                        key={act.id} 
                        className="bg-[#18181B] border border-white/5 p-4 rounded-3xl flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-3.5">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isPositive ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-rose-500/10 text-rose-500'
                          }`}>
                            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-sm text-white truncate">{act.title}</h5>
                            <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">{act.subtitle}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 font-mono">
                          <span className={`font-black text-sm block ${isPositive ? 'text-[#10B981]' : 'text-zinc-200'}`}>
                            {isPositive ? '+' : ''}{act.amount.toLocaleString()} JOD
                          </span>
                          <span className="text-[10px] text-zinc-500 uppercase font-black block mt-1">
                            {new Date(act.timestamp).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {month: 'short', day: 'numeric'})}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 bg-[#18181B] border border-white/5 rounded-3xl p-6">
                    <HelpCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="font-extrabold text-sm text-zinc-400 uppercase tracking-wider">{localT.emptyActivity}</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">{localT.emptyActivityDesc}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'add-funds':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setWalletSubView('wallet-home')}
                className="w-10 h-10 rounded-2xl bg-[#18181B] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <div>
                <h1 className="text-xl font-black">{localT.addFunds}</h1>
                <p className="text-xs text-zinc-400">{isAr ? 'تمويل فوري وآمن لرصيدك' : 'Top up your bidding wallet'}</p>
              </div>
            </div>

            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 md:p-8 space-y-6">
              {submittedProof ? (
                <div className="text-center space-y-6 py-6" id="submitted-slip-alert-rebuilt">
                  <div className="w-16 h-16 rounded-full bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mx-auto border border-[#10B981]/20 shadow-md">
                    <Check className="w-8 h-8 stroke-[3]" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-lg font-black text-white">{isAr ? 'تم رفع طلب الشحن بنجاح!' : 'DEPOSIT REQUEST SUBMITTED'}</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
                      {isAr 
                        ? 'تم رفع إشعار الحوالة والبيانات للقسم المالي. لاعتماده فورا والبدء بالمزايدة، تفضل بزيارة لوحة تحكم المدير ومراجعة الحوالات الواردة لاعتماده في ثوانٍ معدودة!' 
                        : 'Your receipt document was loaded successfully. In this sandbox environment, please navigate to the Admin Dashboard (top segment) to approve it instantly!'}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSubmittedProof(false)}
                    className="px-6 py-3 bg-[#FF6B00] text-white font-black text-xs rounded-2xl tracking-wider hover:bg-orange-600 transition-all cursor-pointer shadow-md uppercase font-mono"
                  >
                    {isAr ? 'إرسال حوالة أخرى 💳' : 'TRIGGER ANOTHER CLIQ DEPOSIT'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTopUpSubmit} className="space-y-6" id="topup-compliance-form-rebuilt">
                  
                  {/* Step 1: Input amount with quick presets */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block">
                      {localT.chooseAmount} <span className="text-[#FF6B00]">*</span>
                    </label>
                    
                    {/* Amount Large Input */}
                    <div className="relative flex items-center">
                      <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="500"
                        className="w-full bg-[#202024] border border-white/5 rounded-3xl py-5 px-6 font-black font-mono text-4xl text-center text-white focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] transition-all"
                      />
                      <span className={`absolute ${isAr ? 'left-6' : 'right-6'} text-sm font-black text-[#FF6B00] tracking-widest font-mono`}>JOD</span>
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-5 gap-2">
                      {presets.map((val) => {
                        const isActive = parseInt(amount, 10) === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setAmount(val.toString())}
                            className={`py-2 px-1 rounded-2xl text-xs font-black tracking-tight transition-all active:scale-95 text-center cursor-pointer font-mono border ${
                              isActive
                                ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-sm'
                                : 'bg-[#202024] border-white/5 text-zinc-400 hover:bg-[#2c2c32] hover:text-white'
                            }`}
                          >
                            +{val.toLocaleString()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: CliQ Alias */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block">
                      {localT.cliqAlias} <span className="text-[#FF6B00]">*</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        placeholder={localT.aliasPlaceholder}
                        className="w-full bg-[#202024] border border-white/5 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] font-mono"
                      />
                      <div className={`absolute top-4 ${isAr ? 'left-4' : 'right-4'} text-zinc-500`}>
                        <UserIcon className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* CliQ Bank details card */}
                  <div className="bg-[#202024] border border-white/5 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-[#FF6B00]" />
                        <span className="text-xs font-black text-white uppercase tracking-wider font-mono">
                          {localT.bankDetails}
                        </span>
                      </div>
                      <span className="text-[10px] font-black bg-[#FF6B00]/10 text-[#FF6B00] px-2 py-0.5 rounded-full font-mono uppercase">
                        {isAr ? 'فوري' : 'INSTANT'}
                      </span>
                    </div>

                    <div className="space-y-3 font-sans text-xs">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-zinc-400">{localT.recipientBank}:</span>
                        <span className="font-extrabold text-[#FF6B00] uppercase font-mono">CAPITAL BANK</span>
                      </div>
                      
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-zinc-400">{localT.accountName}:</span>
                        <span className="font-black text-white">{isAr ? 'مؤسسة مزاد الأردن م' : 'MAZAD JO M'}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400">IBAN:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-white select-all">JO83 CAPS 1020 0085 4100 00</span>
                          <button 
                            type="button" 
                            onClick={handleCopyIBAN}
                            className="p-1 bg-[#18181B] rounded-lg hover:text-[#FF6B00] text-zinc-400 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Screenshot Box */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block">
                      {localT.receiptAttachment} <span className="text-[#FF6B00]">*</span>
                    </label>
                    
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleRealFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    <div 
                      onClick={handleTriggerFileInput}
                      className="border-2 border-dashed border-white/10 hover:border-[#FF6B00] rounded-3xl p-6 text-center cursor-pointer transition-all space-y-3 bg-[#202024] group"
                      id="screenshot-uploader-box-rebuilt"
                    >
                      {fileUploaded && selectedFile ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-[#10B981]">
                          <div className="w-10 h-10 rounded-full bg-[#10B981]/10 text-[#10B981] flex items-center justify-center border border-[#10B981]/20">
                            <CheckCircle className="w-6 h-6 stroke-[3]" />
                          </div>
                          <span className="font-mono text-xs text-white font-extrabold max-w-full truncate px-3 bg-[#18181B] py-1.5 rounded-xl border border-white/5">
                            {fileName}
                          </span>
                          <span className="text-[10px] text-[#FF6B00] font-black uppercase">
                            {isAr ? 'انقر لاستبدال الإيصال المرفق' : 'Click to replace document'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-zinc-400 space-y-3">
                          <Camera className="w-10 h-10 mx-auto text-zinc-500 group-hover:text-[#FF6B00] transition-colors" />
                          <div>
                            <p className="font-extrabold text-xs text-[#FF6B00] uppercase tracking-wider">
                              {localT.uploadReceipt}
                            </p>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-tight mt-1">
                              {localT.supportedFormats}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button 
                    type="submit" 
                    disabled={isSubmitting || !fileUploaded || !selectedFile}
                    className={`w-full font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md uppercase text-xs cursor-pointer select-none ${
                      isSubmitting || !fileUploaded || !selectedFile
                        ? 'bg-[#202024] text-zinc-600 border border-white/5 cursor-not-allowed shadow-none' 
                        : 'bg-[#FF6B00] hover:bg-orange-600 text-white hover:shadow-lg active:scale-[0.99]'
                    }`}
                    id="submit-deposit-proof-btn-rebuilt"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>{isAr ? 'جاري التحقق وتسجيل المستند...' : 'TRANSMITTING RECEIPT FOR AUDIT...'}</span>
                      </>
                    ) : (
                      <span>{localT.submit}</span>
                    )}
                  </button>

                </form>
              )}
            </div>
          </div>
        );

      case 'withdraw':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setWalletSubView('wallet-home')}
                className="w-10 h-10 rounded-2xl bg-[#18181B] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <div>
                <h1 className="text-xl font-black">{localT.withdraw}</h1>
                <p className="text-xs text-zinc-400">{isAr ? 'سحب المبالغ المتاحة لحسابك البنكي' : 'Cash out your available JOD'}</p>
              </div>
            </div>

            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 md:p-8 space-y-6">
              {withdrawSuccess ? (
                <div className="text-center space-y-6 py-6" id="withdraw-success-card">
                  <div className="w-16 h-16 rounded-full bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mx-auto border border-[#10B981]/20 shadow-md">
                    <CheckCircle2 className="w-8 h-8 stroke-[3]" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-lg font-black text-white">{localT.withdrawSuccess}</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
                      {localT.withdrawSuccessDesc}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setWithdrawSuccess(false);
                      setWalletSubView('wallet-home');
                    }}
                    className="px-6 py-3 bg-[#FF6B00] text-white font-black text-xs rounded-2xl tracking-wider hover:bg-orange-600 transition-all cursor-pointer shadow-md uppercase font-mono"
                  >
                    {isAr ? 'العودة للمحفظة الرئيسة' : 'RETURN TO WALLET'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdrawSubmit} className="space-y-6">
                  
                  {/* Show available balance */}
                  <div className="bg-[#202024] border border-white/5 p-5 rounded-3xl flex justify-between items-center">
                    <div>
                      <span className="text-[10px] uppercase font-mono font-black text-zinc-400 block">{localT.availableToWithdraw}</span>
                      <p className="text-2xl font-black font-mono text-[#10B981] mt-1">
                        {wallet.availableBalance.toLocaleString()} <span className="text-xs">JOD</span>
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-[#18181B] flex items-center justify-center text-zinc-400">
                      <Wallet className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Choose withdraw method */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block">
                      {localT.withdrawMethod}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        type="button" 
                        onClick={() => setWithdrawType('cliq')}
                        className={`py-3.5 px-4 rounded-2xl text-xs font-black transition-all border cursor-pointer uppercase ${
                          withdrawType === 'cliq'
                            ? 'bg-[#FF6B00] border-[#FF6B00] text-white'
                            : 'bg-[#202024] border-white/5 text-zinc-400 hover:bg-[#2c2c32]'
                        }`}
                      >
                        {localT.cliqInstant}
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setWithdrawType('bank')}
                        className={`py-3.5 px-4 rounded-2xl text-xs font-black transition-all border cursor-pointer uppercase ${
                          withdrawType === 'bank'
                            ? 'bg-[#FF6B00] border-[#FF6B00] text-white'
                            : 'bg-[#202024] border-white/5 text-zinc-400 hover:bg-[#2c2c32]'
                        }`}
                      >
                        {localT.bankTransfer}
                      </button>
                    </div>
                  </div>

                  {/* Input amount */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block">
                      {localT.amountLabel} <span className="text-[#FF6B00]">*</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={wAmount}
                        onChange={(e) => setWAmount(e.target.value)}
                        placeholder="150"
                        className="w-full bg-[#202024] border border-white/5 rounded-2xl py-4 px-5 text-white font-black font-mono text-lg focus:outline-none focus:border-[#FF6B00]"
                      />
                      <span className="absolute right-5 top-4 text-xs font-black text-[#FF6B00] font-mono">JOD</span>
                    </div>
                  </div>

                  {/* Conditional inputs */}
                  <div className="space-y-4">
                    <h3 className="text-xs uppercase font-mono font-black text-zinc-400 tracking-wider">
                      {localT.withdrawDetailsTitle}
                    </h3>
                    
                    {withdrawType === 'bank' ? (
                      <div className="space-y-3.5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-400">{localT.bankInputLabel}</label>
                          <input 
                            type="text" 
                            value={wBankName}
                            onChange={(e) => setWBankName(e.target.value)}
                            placeholder={isAr ? "مثال: البنك العربي" : "e.g. Arab Bank"}
                            className="w-full bg-[#202024] border border-white/5 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-400">{localT.ibanInputLabel}</label>
                          <input 
                            type="text" 
                            value={wIban}
                            onChange={(e) => setWIban(e.target.value)}
                            placeholder="JO..."
                            className="w-full bg-[#202024] border border-white/5 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-400">{localT.holderInputLabel}</label>
                          <input 
                            type="text" 
                            value={wHolderName}
                            onChange={(e) => setWHolderName(e.target.value)}
                            placeholder={currentUser?.name}
                            className="w-full bg-[#202024] border border-white/5 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-400">{isAr ? 'اسم مستعار كليك (المرسل إليه)' : 'Target CliQ Alias'}</label>
                          <input 
                            type="text" 
                            value={wCliqAlias}
                            onChange={(e) => setWCliqAlias(e.target.value)}
                            placeholder="alias@cliq"
                            className="w-full bg-[#202024] border border-white/5 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-400">{localT.phoneLabel}</label>
                          <input 
                            type="text" 
                            value={wPhone}
                            onChange={(e) => setWPhone(e.target.value)}
                            placeholder={currentUser?.phoneNumber || "079..."}
                            className="w-full bg-[#202024] border border-white/5 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button 
                    type="submit" 
                    disabled={isWithdrawing || !wAmount}
                    className={`w-full font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md uppercase text-xs cursor-pointer select-none ${
                      isWithdrawing || !wAmount
                        ? 'bg-[#202024] text-zinc-600 border border-white/5 cursor-not-allowed shadow-none' 
                        : 'bg-[#FF6B00] hover:bg-orange-600 text-white hover:shadow-lg active:scale-[0.99]'
                    }`}
                  >
                    {isWithdrawing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>{isAr ? 'جاري تسجيل طلب السحب البنكي...' : 'TRANSMITTING REQUEST...'}</span>
                      </>
                    ) : (
                      <span>{localT.withdrawBtn}</span>
                    )}
                  </button>

                </form>
              )}
            </div>
          </div>
        );

      case 'transactions':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setWalletSubView('wallet-home')}
                className="w-10 h-10 rounded-2xl bg-[#18181B] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <div>
                <h1 className="text-xl font-black">{localT.transactions}</h1>
                <p className="text-xs text-zinc-400">{isAr ? 'مستندات العمليات والتدفقات النقدية' : 'Financial transactions ledger'}</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-[#18181B] border border-white/5 p-1 rounded-2xl gap-1">
              {(['all', 'in', 'out'] as const).map((filter) => {
                const label = filter === 'all' ? localT.allTx : filter === 'in' ? localT.moneyInTx : localT.moneyOutTx;
                return (
                  <button
                    key={filter}
                    onClick={() => setTxFilter(filter)}
                    className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
                      txFilter === filter
                        ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* List */}
            <div className="space-y-3">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <div 
                      key={tx.id} 
                      className="bg-[#18181B] border border-white/5 p-4.5 rounded-3xl flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isPositive ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-extrabold text-sm text-white truncate">{tx.title}</h5>
                          <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">{tx.subtitle}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono">
                        <span className={`font-black text-sm block ${isPositive ? 'text-[#10B981]' : 'text-zinc-200'}`}>
                          {isPositive ? '+' : ''}{tx.amount.toLocaleString()} JOD
                        </span>
                        
                        <div className="flex items-center gap-1.5 justify-end mt-1">
                          {tx.status === 'locked' || tx.status === 'pending' ? (
                            <span className="text-[9px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-md uppercase font-mono animate-pulse">{isAr ? 'قيد المراجعة' : 'PENDING'}</span>
                          ) : tx.status === 'released' || tx.status === 'approved' ? (
                            <span className="text-[9px] font-black text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-md uppercase font-mono">{isAr ? 'مكتمل' : 'APPROVED'}</span>
                          ) : (
                            <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-md uppercase font-mono">{isAr ? 'ملغي' : 'REJECTED'}</span>
                          )}
                          <span className="text-[10px] text-zinc-500 font-bold block">
                            {new Date(tx.timestamp).toLocaleDateString(isAr ? 'ar-JO' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-[#18181B] border border-white/5 rounded-3xl p-6">
                  <History className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="font-extrabold text-sm text-zinc-400 uppercase tracking-wider">{isAr ? 'لا يوجد عمليات ضمن هذا الفلتر' : 'No transactions found'}</p>
                  <p className="text-xs text-zinc-500 mt-1">{isAr ? 'جرب تغيير خيار التصفية أو قم بتمويل محفظتك الآن.' : 'Try changing your filter settings or top up your wallet.'}</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'orders':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setWalletSubView('wallet-home')}
                className="w-10 h-10 rounded-2xl bg-[#18181B] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <div>
                <h1 className="text-xl font-black">{localT.orders}</h1>
                <p className="text-xs text-zinc-400">{isAr ? 'إدارة العقود والمبيعات والمشتريات' : 'Fulfillment operations & shipping tracking'}</p>
              </div>
            </div>

            {/* Buying/Selling tabs */}
            <div className="flex bg-[#18181B] border border-white/5 p-1 rounded-2xl gap-1">
              <button
                onClick={() => setOrdersTab('buying')}
                className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all cursor-pointer uppercase flex items-center justify-center gap-2 ${
                  ordersTab === 'buying'
                    ? 'bg-[#FF6B00] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{localT.buying}</span>
              </button>
              <button
                onClick={() => setOrdersTab('selling')}
                className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all cursor-pointer uppercase flex items-center justify-center gap-2 ${
                  ordersTab === 'selling'
                    ? 'bg-[#FF6B00] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>{localT.selling}</span>
              </button>
            </div>

            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-5 md:p-6 space-y-4 text-white">
              {ordersTab === 'buying' ? (
                <MyOrdersList
                  isAr={isAr}
                  myBuyerOrders={myBuyerOrders}
                  setSelectedOrderId={setSelectedOrderId}
                />
              ) : (
                <SoldOrdersList
                  isAr={isAr}
                  mySellerOrders={mySellerOrders}
                  setSelectedOrderId={setSelectedOrderId}
                />
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="flex-1 min-h-screen bg-[#0E0E0E] text-white overflow-y-auto pb-16"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="wallet-rebuild-root-container"
    >
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        
        {/* DESKTOP 3-COLUMN LAYOUT (lg:grid) */}
        <div className="hidden lg:grid grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Navigation Sidebar */}
          <div className="col-span-3 space-y-4 sticky top-6">
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-mono font-black text-xs tracking-widest text-[#FF6B00]">{isAr ? 'محفظة المزاد' : 'WHATNOT WALLET'}</h2>
                  <p className="text-[10px] text-zinc-400 uppercase font-bold">{isAr ? 'تحكم مالي شامل' : 'Instant Secure FinTech'}</p>
                </div>
              </div>

              <nav className="flex flex-col gap-1.5 font-sans">
                <button
                  onClick={() => setWalletSubView('wallet-home')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'wallet-home'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  id="side-nav-home"
                >
                  <Wallet className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'الرئيسية والمحفظة' : 'My Wallet Home'}</span>
                </button>

                <button
                  onClick={() => setWalletSubView('add-funds')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'add-funds'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  id="side-nav-add"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>{localT.addFunds}</span>
                </button>

                <button
                  onClick={() => setWalletSubView('withdraw')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'withdraw'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  id="side-nav-withdraw"
                >
                  <ArrowDownLeft className="w-4 h-4 shrink-0" />
                  <span>{localT.withdraw}</span>
                </button>

                <button
                  onClick={() => setWalletSubView('transactions')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'transactions'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  id="side-nav-transactions"
                >
                  <History className="w-4 h-4 shrink-0" />
                  <span>{localT.transactions}</span>
                </button>

                <button
                  onClick={() => setWalletSubView('orders')}
                  className={`w-full py-3 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-3 ${
                    walletSubView === 'orders'
                      ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  id="side-nav-orders"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>{localT.orders}</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Center Column: Main Wallet Content */}
          <div className="col-span-6 space-y-6">
            {renderActiveScreen()}
          </div>

          {/* Right Column: Secure Wallet Summary */}
          <div className="col-span-3 space-y-6 sticky top-6">
            
            {/* Security Trust card */}
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-[#FF6B00]">
                <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                <h4 className="font-extrabold text-sm text-white">{localT.secureSummary}</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isAr 
                  ? 'جميع إيداعاتها وسحوباتها محمية بالكامل بواسطة محفظة كليك والبنك المركزي الأردني.'
                  : 'All transactions are strictly authorized under our secure Escrow Shield via the Central Bank of Jordan.'}
              </p>
            </div>

            {/* Support / Help card */}
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-5 space-y-3.5">
              <div className="flex items-center gap-2 text-amber-500">
                <HelpCircle className="w-5 h-5" />
                <h4 className="font-extrabold text-sm text-white">{localT.helpSupport}</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {localT.helpDesc}
              </p>
            </div>
          </div>
        </div>

        {/* MOBILE SINGLE-COLUMN LAYOUT (lg:hidden) */}
        <div className="block lg:hidden">
          {walletSubView === 'wallet-home' ? (
            <div className="space-y-6">
              
              {/* Mobile Title */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black">{isAr ? 'رصيدي ومحفظتي' : 'My Wallet'}</h1>
                  <p className="text-xs text-zinc-400 mt-0.5">{currentUser?.name}</p>
                </div>
                <div className="w-9 h-9 rounded-2xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>

              {/* Balance Card */}
              <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/5 rounded-full blur-2xl pointer-events-none"></div>
                
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#FF6B00] font-mono font-black block">
                    {localT.totalBalance}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black font-mono tracking-tight text-white">
                      {wallet.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-black text-zinc-400 font-mono">JOD</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 font-mono font-bold uppercase block leading-none">{localT.availableBalance}</span>
                    <p className="text-sm font-mono font-black text-[#10B981]">{wallet.availableBalance.toLocaleString()} <span className="text-[8px]">JOD</span></p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 font-mono font-bold uppercase block leading-none">{localT.pendingBalance}</span>
                    <p className="text-sm font-mono font-black text-amber-500">{myPendingDepositsSum.toLocaleString()} <span className="text-[8px]">JOD</span></p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 font-mono font-bold uppercase block leading-none">{localT.escrowBalance}</span>
                    <p className="text-sm font-mono font-black text-rose-500">{wallet.escrowBalance.toLocaleString()} <span className="text-[8px]">JOD</span></p>
                  </div>
                </div>
              </div>

              {/* Add & Withdraw Buttons */}
              <div className="grid grid-cols-2 gap-3.5">
                <button 
                  onClick={() => setWalletSubView('add-funds')}
                  className="w-full bg-[#FF6B00] hover:bg-orange-600 active:scale-98 font-mono font-black py-4 rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                  id="mob-btn-add-funds-alt"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{localT.addFunds}</span>
                </button>
                <button 
                  onClick={() => setWalletSubView('withdraw')}
                  className="w-full bg-[#202024] border border-white/10 hover:bg-[#2c2c32] active:scale-98 font-mono font-black py-4 rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer text-white transition-all"
                  id="mob-btn-withdraw-alt"
                >
                  <ArrowDownLeft className="w-4 h-4 text-zinc-400 stroke-[3]" />
                  <span>{localT.withdraw}</span>
                </button>
              </div>

              {/* Quick Actions List (Compact) */}
              <div className="space-y-2.5">
                <h3 className="text-xs uppercase font-mono font-black tracking-widest text-zinc-400">{isAr ? 'الوصول السريع' : 'Quick Actions'}</h3>
                
                <button 
                  onClick={() => setWalletSubView('transactions')}
                  className="w-full bg-[#18181B] border border-white/5 rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-99 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#202024] flex items-center justify-center text-zinc-400">
                      <History className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-white">{localT.transactions}</h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{isAr ? 'مستندات وكشوفات الحساب' : 'Review your transaction entries'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </button>

                <button 
                  onClick={() => setWalletSubView('orders')}
                  className="w-full bg-[#18181B] border border-white/5 rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-99 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#202024] flex items-center justify-center text-zinc-400">
                      <ShoppingBag className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-white">{localT.orders}</h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{isAr ? 'تتبع فوز ومبيعات مزاداتك' : 'Manage buyer & seller orders'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </button>
              </div>

              {/* Recent Activity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase font-mono font-black tracking-widest text-zinc-400">{localT.recentActivity}</h3>
                  <button 
                    onClick={() => setWalletSubView('transactions')}
                    className="text-xs text-[#FF6B00] font-black hover:underline cursor-pointer"
                  >
                    {isAr ? 'عرض الكل' : 'View All'}
                  </button>
                </div>

                <div className="space-y-3">
                  {combinedRecentActivity.length > 0 ? (
                    combinedRecentActivity.slice(0, 3).map((act) => {
                      const isPositive = act.amount > 0;
                      return (
                        <div 
                          key={act.id} 
                          className="bg-[#18181B] border border-white/5 p-4 rounded-2xl flex items-center justify-between"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isPositive ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-rose-500/10 text-rose-500'
                            }`}>
                              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <h5 className="font-extrabold text-xs text-white truncate">{act.title}</h5>
                              <p className="text-[10px] text-zinc-400 mt-0.5 truncate font-mono">{act.subtitle}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0 font-mono">
                            <span className={`font-black text-xs block ${isPositive ? 'text-[#10B981]' : 'text-zinc-200'}`}>
                              {isPositive ? '+' : ''}{act.amount.toLocaleString()} JOD
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-7 bg-[#18181B] border border-white/5 rounded-2xl p-5">
                      <p className="font-bold text-xs text-zinc-500 uppercase tracking-wide">{localT.emptyActivity}</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div>
              {renderActiveScreen()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
