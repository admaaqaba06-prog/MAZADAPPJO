import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { doc, updateDoc, arrayUnion, Timestamp, collection, query, orderBy, onSnapshot, addDoc, getDocs, where, limit, serverTimestamp } from 'firebase/firestore';
import { 
  ArrowLeft, 
  Check, 
  Clock, 
  CreditCard, 
  Package, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Download, 
  ExternalLink, 
  ShieldCheck, 
  User, 
  Copy, 
  Star, 
  BadgeCheck,
  Eye,
  FileCheck,
  XCircle,
  ShieldAlert,
  MapPin,
  Calendar,
  Building,
  Activity,
  DollarSign,
  RefreshCw,
  UploadCloud,
  Landmark,
  Mail,
  X
} from 'lucide-react';
import { Order } from '../types';
import { translations } from '../utils/translations';
import { executeOrderTransition } from '../utils/orderWorkflow';
import { logAnalyticsEvent } from '../services/analyticsService';
import { CountUp, useToast, winTotalDue } from './feedback';

interface OrderDetailsViewProps {
  orderId: string;
  onBack: () => void;
}

export const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({ orderId, onBack }) => {
  const { orders, language, currentUser, addNotification, sellerProfiles, myReviews, setReviewPromptOrderId, updateOwnProfile } = useApp();
  const isAr = language === 'ar';
  const t = translations[language as 'en' | 'ar'];

  const order = orders.find(o => o.id === orderId);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const { showToast } = useToast();

  // Progressive email capture (Auth/KYC Wave 3): shown only while the account
  // has no email — the rules allow a one-time empty→set claim by the owner.
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptEmailSaving, setReceiptEmailSaving] = useState(false);
  const [receiptEmailError, setReceiptEmailError] = useState(false);
  const [receiptEmailDismissed, setReceiptEmailDismissed] = useState(false);

  // Admin one-tap buyer rating (mazad_rates_buyer): existing stars for this order, if any.
  const [adminBuyerStars, setAdminBuyerStars] = useState<number | null>(null);
  const [adminRatingSaving, setAdminRatingSaving] = useState(false);

  const isAdminViewer = currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true || currentUser.role === 'admin';

  useEffect(() => {
    if (!order || !isAdminViewer) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'reviews'),
          where('orderId', '==', order.id),
          where('direction', '==', 'mazad_rates_buyer'),
          limit(1)
        ));
        if (!cancelled && !snap.empty) {
          setAdminBuyerStars((snap.docs[0].data() as any).stars ?? null);
        }
      } catch (err) {
        console.warn('Admin buyer-rating lookup failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [order?.id, isAdminViewer]);

  const handleAdminRateBuyer = async (starsValue: number) => {
    if (!order || adminRatingSaving || adminBuyerStars !== null) return;
    setAdminRatingSaving(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        orderId: order.id,
        auctionId: order.auctionId,
        buyerId: order.buyerId,
        ratedBy: currentUser.id,
        stars: starsValue,
        text: '',
        direction: 'mazad_rates_buyer',
        createdAt: serverTimestamp()
      });
      setAdminBuyerStars(starsValue);
      showToast({
        type: 'success',
        title: isAr ? `تم تقييم المشتري ${starsValue}/5 ⭐` : `Buyer rated ${starsValue}/5 ⭐`,
      });
    } catch (err: any) {
      console.error('Admin buyer rating failed:', err);
      showToast({
        type: 'warn',
        title: isAr ? 'تعذر حفظ تقييم المشتري' : 'Could not save buyer rating',
      });
    } finally {
      setAdminRatingSaving(false);
    }
  };

  // Subscribe to real-time order activity history from Firestore
  useEffect(() => {
    if (!order) return;
    const q = query(
      collection(db, 'orders', order.id, 'activity'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setActivities(list);
      setLoadingActivities(false);
    }, (err) => {
      console.error("Error loading activities:", err);
      setLoadingActivities(false);
    });
    return () => unsub();
  }, [order?.id]);

  if (!order) {
    return (
      <div className="bg-white border border-gray-150 rounded-3xl p-8 text-center space-y-4 max-w-lg mx-auto mt-10">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-gray-900 uppercase font-mono">
          {isAr ? 'الطلب غير موجود' : 'Order Not Found'}
        </h3>
        <p className="text-xs text-gray-500">
          {isAr ? 'لم نتمكن من العثور على تفاصيل هذا الطلب في قاعدة البيانات.' : 'The requested order ledger could not be retrieved.'}
        </p>
        <button 
          onClick={onBack}
          className="px-6 py-2.5 bg-[#FF6B00] text-white rounded-2xl text-xs font-black hover:bg-orange-600 transition-all uppercase flex items-center justify-center gap-1.5 mx-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isAr ? 'العودة للخلف' : 'Go Back'}</span>
        </button>
      </div>
    );
  }

  // Identify roles
  const isBuyer = currentUser.id === order.buyerId;
  const isSeller = currentUser.id === order.sellerId;
  const isAdmin = currentUser.email === 'admaaqaba06@gmail.com' || currentUser.isAdmin === true || currentUser.role === 'admin';

  // Post-win review: buyer can rate a delivered/completed order they haven't reviewed yet.
  const hasBuyerReview = (myReviews || []).some(
    r => r.direction === 'buyer_rates_auction' && r.orderId === order.id
  );
  const canRateOrder = isBuyer && (order.status === 'completed' || order.status === 'delivered') && !hasBuyerReview;

  // Status index mapping
  const timelineSteps = [
    { id: 'waiting_payment', labelAr: 'بانتظار الدفع', labelEn: 'Waiting Payment', descAr: 'المشتري يحوّل عبر كليك ويرفع الإيصال', descEn: 'Buyer pays via CliQ and uploads the receipt' },
    { id: 'paid', labelAr: 'تم الدفع', labelEn: 'Paid', descAr: 'استلمنا إثبات الدفع وتم تأكيده', descEn: 'Payment proof received and confirmed' },
    { id: 'preparing_shipment', labelAr: 'تجهيز الشحن', labelEn: 'Preparing Shipment', descAr: 'البائع يجهز المنتج والملصقات', descEn: 'Seller is preparing items and labels' },
    { id: 'shipped', labelAr: 'تم الشحن', labelEn: 'Shipped', descAr: 'الشحنة مع شركة التوصيل الآن', descEn: 'Parcel in transit with courier' },
    { id: 'delivered', labelAr: 'تم التوصيل', labelEn: 'Delivered', descAr: 'تم توصيل الشحنة للمشتري', descEn: 'Delivered to buyer destination' },
    { id: 'completed', labelAr: 'مكتمل', labelEn: 'Completed', descAr: 'تم تحرير الأموال والطلب مغلق', descEn: 'Funds released to seller & order closed' }
  ];

  const currentStepIndex = timelineSteps.findIndex(s => s.id === order.status);

  // Helper to format date
  const formatDate = (rawDate: any) => {
    if (!rawDate) return '';
    const dateObj = rawDate.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate);
    return dateObj.toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(order.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // CliQ recipient details — same constants as the membership (SubscriptionView) flow
  const CLIQ_IBAN = 'JO83 CAPS 1020 0085 4100 00';
  const totalDue = order.totalDue ?? winTotalDue(order.winningBidAmount);

  const handleCopyIban = () => {
    navigator.clipboard.writeText(CLIQ_IBAN);
    setCopiedIban(true);
    setTimeout(() => setCopiedIban(false), 2000);
  };

  // Copy the exact amount to the fil (3 dp) so the buyer transfers a value that
  // matches the order to the fil — mismatches stall reconciliation.
  const handleCopyAmount = () => {
    navigator.clipboard.writeText(totalDue.toFixed(3));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Save the optional receipt email (write-once claim; rules allow empty→set only).
  const handleSaveReceiptEmail = async () => {
    if (receiptEmailSaving) return;
    const value = receiptEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setReceiptEmailError(true);
      return;
    }
    setReceiptEmailError(false);
    setReceiptEmailSaving(true);
    try {
      const result = await updateOwnProfile({ email: value });
      if (result.success) {
        setReceiptEmailDismissed(true);
        showToast({ type: 'success', title: t.receiptEmailSavedTitle });
      } else {
        showToast({ type: 'warn', title: t.receiptEmailFailedTitle });
      }
    } catch (err) {
      console.error('Receipt email save failed:', err);
      showToast({ type: 'warn', title: t.receiptEmailFailedTitle });
    } finally {
      setReceiptEmailSaving(false);
    }
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match('image.*')) {
      alert(isAr ? 'الرجاء اختيار صورة فقط (jpg أو png).' : 'Please select an image file only (jpg, png).');
      return;
    }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setReceiptPreview(event.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Buyer CliQ payment: upload the transfer receipt screenshot, attach it to the
  // order, then run the existing 'pay' workflow transition (admin confirms later).
  const handleSubmitCliqPayment = async () => {
    if (!receiptFile) {
      alert(isAr ? 'الرجاء إرفاق لقطة شاشة لإيصال حوالة كليك أولاً.' : 'Please attach your CliQ transfer receipt screenshot first.');
      return;
    }
    setIsUpdating(true);
    try {
      const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { getFirebaseStorage } = await import('../services/firebase');
      const storageInstance = await getFirebaseStorage();

      const storagePath = `payment-proofs/${currentUser.id}/${Date.now()}_order_${order.id}.png`;
      const fileRef = storageRef(storageInstance, storagePath);
      await uploadBytes(fileRef, receiptFile);
      const proofUrl = await getDownloadURL(fileRef);

      await updateDoc(doc(db, 'orders', order.id), {
        paymentProofUrl: proofUrl,
        updatedAt: Timestamp.now()
      });

      await executeOrderTransition(order, 'pay', currentUser);

      // Funnel metric — fire-and-forget (service handles its own errors)
      logAnalyticsEvent('payment_submitted', currentUser.id, currentUser.email, {
        orderId: order.id,
        totalDue
      });

      showToast({
        type: 'success',
        title: isAr ? 'استلمنا إثبات الدفع — بانتظار التأكيد' : 'Payment proof received — pending confirmation',
      });
      setReceiptFile(null);
      setReceiptPreview('');
    } catch (err: any) {
      console.error(err);
      alert(isAr ? `تعذر إرسال إثبات الدفع: ${err.message}` : `Failed to submit payment proof: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelOrder = async () => {
    if (confirm(isAr ? 'هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to cancel this order? This action is irreversible.')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'cancel_before_payment', currentUser);
        addNotification(
          isAr ? 'تم إلغاء الطلب' : 'Order Cancelled',
          isAr ? 'تم إلغاء الطلب بنجاح — لا يوجد أي مبلغ مستحق عليك.' : 'Order cancelled successfully — nothing is due from you.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل إلغاء الطلب: ${err.message}` : `Cancel failed: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handlePrepareShipment = async () => {
    setIsUpdating(true);
    try {
      await executeOrderTransition(order, 'prepare_shipment', currentUser);
      addNotification(
        isAr ? 'جاري الشحن' : 'Preparing Shipment',
        isAr ? 'تم تحديث حالة الطلب إلى جاري تجهيز الشحنة.' : 'Order status updated to preparing shipment.',
        'info'
      );
    } catch (err: any) {
      console.error(err);
      alert(isAr ? `فشل تحديث الحالة: ${err.message}` : `Fulfillment failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkAsShipped = async () => {
    const trackingInput = prompt(
      isAr ? 'يرجى إدخال رقم تتبع الشحنة (أو اتركه فارغاً للتوليد التلقائي):' : 'Enter tracking number (or leave blank to auto-generate):'
    );
    if (trackingInput === null) return; // User cancelled prompt

    setIsUpdating(true);
    try {
      await executeOrderTransition(order, 'mark_shipped', currentUser, { trackingNumber: trackingInput || undefined });
      addNotification(
        isAr ? 'تم الشحن بنجاح' : 'Order Dispatched',
        isAr ? 'تم تحديث حالة الطلب إلى مشحون وإضافة رقم التتبع.' : 'Order status updated to shipped with tracking number.',
        'info'
      );
    } catch (err: any) {
      console.error(err);
      alert(isAr ? `فشل تحديث الحالة: ${err.message}` : `Shipping failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (confirm(isAr ? 'هل تؤكد استلام الشحنة ومعاينتها بنجاح؟' : 'Do you confirm you have received and inspected the parcel?')) {
      setIsUpdating(true);
      try {
        const result = await executeOrderTransition(order, 'confirm_delivery', currentUser);
        if (result && result.alreadyReleased) {
          alert(isAr ? 'تم تحرير هذا المبلغ سابقاً' : 'This amount was already released.');
        } else {
          alert(isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.');
        }
        addNotification(
          isAr ? 'تم تأكيد الاستلام' : 'Delivery Confirmed',
          isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `تعذر تحرير المبلغ، حاول مرة أخرى: ${err.message}` : `Failed to release funds, please try again: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleReleaseEscrow = async () => {
    if (confirm(isAr ? 'تأكيد تحرير الضمان المالي للبائع؟ سيتم قفل الطلب.' : 'Confirm release of Escrow funds directly to the seller? This closes the order.')) {
      setIsUpdating(true);
      try {
        const result = await executeOrderTransition(order, 'release_escrow', currentUser);
        if (result && result.alreadyReleased) {
          alert(isAr ? 'تم تحرير هذا المبلغ سابقاً' : 'This amount was already released.');
        } else {
          alert(isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.');
        }
        addNotification(
          isAr ? 'تم تحرير الضمان' : 'Escrow Released',
          isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `تعذر تحرير المبلغ، حاول مرة أخرى: ${err.message}` : `Failed to release funds, please try again: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleRefundBuyer = async () => {
    if (confirm(isAr ? 'تأكيد إعادة المبالغ كاملة للمشتري؟ سيتم إغلاق الملف.' : 'Confirm refund of full Escrow balance to the buyer? This closes the order.')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'refund', currentUser);
        addNotification(
          isAr ? 'تمت إعادة الأموال' : 'Refund Completed',
          isAr ? 'تمت إعادة الأموال بالكامل لمحفظة المشتري.' : 'Escrow funds fully refunded and returned back to buyer’s balance.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل إعادة الأموال: ${err.message}` : `Refund failed: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleOpenDispute = async () => {
    if (confirm(isAr ? 'هل ترغب في فتح نزاع رسمي حول هذا الطلب؟ سيتم تجميد الضمان.' : 'Open a formal dispute for this order? Escrow assets will be locked.')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'open_dispute', currentUser);
        addNotification(
          isAr ? 'تم فتح نزاع رسمي' : 'Dispute Opened',
          isAr ? 'تم فتح نزاع رسمي وتجميد حساب الضمان لحين مراجعة المشرفين.' : 'Formal dispute logged. Escrow assets frozen pending admin mediation.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل فتح النزاع: ${err.message}` : `Failed to open dispute: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleCloseDispute = async () => {
    const resolution = prompt(
      isAr 
        ? 'يرجى تحديد طريقة حل النزاع:\nاكتب "release" لتحرير الأموال للبائع\nاكتب "refund" لإعادة الأموال للمشتري\nاكتب "resume" لإعادة الطلب للحالة المدفوعة المعتادة'
        : 'Select dispute resolution method:\nType "release" to release escrow to seller\nType "refund" to refund buyer\nType "resume" to resume the order as Paid'
    );
    if (!resolution) return;

    const lowerRes = resolution.trim().toLowerCase();
    if (lowerRes !== 'release' && lowerRes !== 'refund' && lowerRes !== 'resume') {
      alert(isAr ? 'خيار غير صحيح.' : 'Invalid resolution choice.');
      return;
    }

    setIsUpdating(true);
    try {
      const result = await executeOrderTransition(order, 'resolve_dispute', currentUser, { resolutionType: lowerRes as any });
      if (lowerRes === 'release') {
        if (result && result.alreadyReleased) {
          alert(isAr ? 'تم تحرير هذا المبلغ سابقاً' : 'This amount was already released.');
        } else {
          alert(isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.');
        }
      } else {
        alert(isAr ? 'تمت تسوية النزاع بنجاح.' : 'Dispute resolved successfully.');
      }
      addNotification(
        isAr ? 'تم حل النزاع' : 'Dispute Resolved',
        isAr ? 'تم إنهاء وحل النزاع بنجاح وتحديث قيود الضمان.' : 'Dispute resolved successfully and escrow accounts adjusted.',
        'info'
      );
    } catch (err: any) {
      console.error(err);
      if (lowerRes === 'release') {
        alert(isAr ? `تعذر تحرير المبلغ، حاول مرة أخرى: ${err.message}` : `Failed to release funds, please try again: ${err.message}`);
      } else {
        alert(isAr ? `فشل حل النزاع: ${err.message}` : `Resolution failed: ${err.message}`);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleForceClose = async () => {
    if (confirm(isAr ? 'هل أنت متأكد من فرض إغلاق الطلب وتحرير الضمان للبائع؟' : 'Are you sure you want to force close this order and release escrow to the seller?')) {
      setIsUpdating(true);
      try {
        const result = await executeOrderTransition(order, 'force_close', currentUser);
        if (result && result.alreadyReleased) {
          alert(isAr ? 'تم تحرير هذا المبلغ سابقاً' : 'This amount was already released.');
        } else {
          alert(isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.');
        }
        addNotification(
          isAr ? 'تم فرض الإغلاق' : 'Order Force Closed',
          isAr ? 'تم تحويل المبلغ للبائع بنجاح' : 'Funds successfully transferred to the seller.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `تعذر تحرير المبلغ، حاول مرة أخرى: ${err.message}` : `Failed to release funds, please try again: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const getActivityIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('won') || t.includes('create')) return <FileText className="w-4 h-4 text-orange-500" />;
    if (t.includes('paid') || t.includes('pay')) return <CreditCard className="w-4 h-4 text-blue-500" />;
    if (t.includes('prepare') || t.includes('start')) return <Package className="w-4 h-4 text-amber-500" />;
    if (t.includes('ship') || t.includes('transit')) return <Truck className="w-4 h-4 text-orange-500" />;
    if (t.includes('deliver') || t.includes('confirm')) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (t.includes('release')) return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    if (t.includes('refund')) return <XCircle className="w-4 h-4 text-rose-500" />;
    if (t.includes('dispute') && (t.includes('open') || t.includes('initiate'))) return <ShieldAlert className="w-4 h-4 text-rose-500" />;
    return <Activity className="w-4 h-4 text-gray-500" />;
  };

  // Generate activities for rendering
  const getDisplayActivities = () => {
    // Sort activities descending for rendering (newest first)
    const sortedActivities = [...activities].sort((a, b) => {
      const tA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const tB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return tB - tA;
    });

    if (sortedActivities.length > 0) {
      return sortedActivities.map(act => {
        const time = act.timestamp?.seconds ? act.timestamp.seconds * 1000 : (act.timestamp ? new Date(act.timestamp).getTime() : Date.now());
        return {
          titleAr: act.messageAr || act.type || 'نشاط الطلب',
          titleEn: act.messageEn || act.type || 'Order Activity',
          descAr: act.performedByName ? `بواسطة: ${act.performedByName}` : 'تحديث من النظام',
          descEn: act.performedByName ? `Performed by: ${act.performedByName}` : 'System Update',
          time,
          icon: getActivityIcon(act.type || '')
        };
      });
    }

    // Fallback if no activities exist yet
    const createdTime = order.createdAt?.seconds ? order.createdAt.seconds * 1000 : (order.createdAt ? new Date(order.createdAt).getTime() : Date.now() - 86400000);
    return [
      {
        titleAr: 'تأسيس وإنشاء الطلب',
        titleEn: 'Order Created',
        descAr: 'تم فتح ملف تتبع الشحن والضمان المالي',
        descEn: 'Escrow tracker and fulfillment record initiated',
        time: createdTime,
        icon: <FileText className="w-4 h-4 text-orange-500" />
      }
    ];
  };

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in text-gray-900 leading-relaxed">
      {/* Header Back Bar */}
      <div className="flex items-center justify-between bg-white px-5 py-4 rounded-3xl border border-gray-150 shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-black text-gray-700 hover:text-gray-950 transition-colors uppercase font-mono cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isAr ? 'العودة للقائمة' : 'Back to List'}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-mono font-black uppercase">
            {isAr ? 'رقم الطلب:' : 'ORDER ID:'}
          </span>
          <span className="text-xs font-mono font-black bg-gray-50 border border-gray-100 px-3 py-1 rounded-xl select-all flex items-center gap-1">
            <span>{order.id.substring(0, 12).toUpperCase()}</span>
            <button onClick={copyToClipboard} className="text-gray-400 hover:text-[#FF6B00] transition-colors cursor-pointer">
              {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </span>
        </div>
      </div>

      {/* Disputed Danger Banner Alert */}
      {order.status === 'disputed' && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-4 flex gap-4 items-start shadow-sm">
          <div className="p-2.5 bg-red-500 text-white rounded-2xl shrink-0 shadow-sm animate-pulse">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-black text-red-950 text-xs uppercase font-mono tracking-wide">
              {isAr ? 'تنبيه: يوجد نزاع نشط على هذا الطلب' : 'DISPUTE RESOLUTION PROTOCOL ACTIVE'}
            </h4>
            <p className="text-[11px] text-red-800 leading-relaxed">
              {isAr 
                ? 'تم حجز أموال الضمان المالي بالكامل. فريق النزاعات والتحكيم يراجع المستندات ومستندات الإثبات حالياً لحل القضية.'
                : 'Escrow holdings have been frozen. Audit officials are verifying documentation, shipping metrics, and buyer/seller activity logs.'}
            </p>
          </div>
        </div>
      )}

      {/* Cancelled Banner Alert */}
      {order.status === 'cancelled' && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-4 flex gap-4 items-start shadow-sm">
          <div className="p-2.5 bg-red-600 text-white rounded-2xl shrink-0 shadow-sm">
            <XCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-black text-red-950 text-xs uppercase font-mono tracking-wide">
              {isAr ? 'تنبيه: تم إلغاء هذا الطلب' : 'ORDER CANCELLED'}
            </h4>
            <p className="text-[11px] text-red-800 leading-relaxed">
              {isAr
                ? 'تم إلغاء هذه المعاملة بنجاح. إذا كنت قد دفعت عبر كليك فسيتم إعادة المبلغ لك بحوالة بنكية.'
                : 'This transaction has been cancelled. If you already paid via CliQ, the amount will be returned to you by bank transfer.'}
            </p>
          </div>
        </div>
      )}

      {/* Refunded Banner Alert */}
      {order.status === 'refunded' && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex gap-4 items-start shadow-sm">
          <div className="p-2.5 bg-amber-500 text-white rounded-2xl shrink-0 shadow-sm">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-black text-amber-950 text-xs uppercase font-mono tracking-wide">
              {isAr ? 'تنبيه: تم إرجاع قيمة هذا الطلب' : 'ORDER REFUNDED'}
            </h4>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {isAr
                ? 'تمت إعادة قيمة المعاملة بالكامل للمشتري بحوالة بنكية / كليك بناءً على قرار التحكيم.'
                : 'The entire amount has been fully refunded back to the buyer via bank/CliQ transfer based on dispute resolution/admin action.'}
            </p>
          </div>
        </div>
      )}

      {/* SECTION 1: Horizontal progress timeline */}
      <div className="bg-[#121318] text-white rounded-3xl p-6 shadow-xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#FF6B00]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="text-xs font-black tracking-widest font-mono text-gray-400 uppercase flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'تتبع حالة الطلب الفوري' : 'ORDER STATUS TRACKER'}</span>
            </h3>
            {order.status !== 'completed' && order.status !== 'disputed' && (
              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-black px-2 py-0.5 rounded-md uppercase animate-pulse">
                {isAr ? 'نشط' : 'Active'}
              </span>
            )}
          </div>

          {/* Timeline Steps layout */}
          <div className="relative">
            {/* Desktop progress line */}
            <div className="hidden md:block absolute top-[18px] left-[6%] right-[6%] h-0.5 bg-white/10" />
            <div 
              className="hidden md:block absolute top-[18px] left-[6%] h-0.5 bg-gradient-to-r from-[#FF6B00] to-orange-400 transition-all duration-500"
              style={{ width: `${currentStepIndex >= 0 ? (currentStepIndex / (timelineSteps.length - 1)) * 88 : 0}%` }}
            />

            {/* Steps map */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6 md:gap-2 relative z-10">
              {timelineSteps.map((step, idx) => {
                const isCompleted = idx < currentStepIndex;
                const isActive = idx === currentStepIndex;
                const isUpcoming = idx > currentStepIndex;

                return (
                  <div key={step.id} className="flex md:flex-col items-center gap-4 md:gap-2 md:text-center">
                    {/* Circle */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border font-mono font-black text-xs shrink-0 transition-all ${
                      isCompleted 
                        ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/25'
                        : isActive
                        ? 'bg-white text-slate-950 border-white ring-4 ring-[#FF6B00]/30 animate-pulse'
                        : 'bg-slate-900 border-white/10 text-gray-500'
                    }`}>
                      {isCompleted ? <Check className="w-4 h-4 text-white" /> : idx + 1}
                    </div>

                    {/* Texts */}
                    <div className="space-y-0.5">
                      <p className={`text-xs font-black transition-colors ${
                        isActive ? 'text-white' : isCompleted ? 'text-gray-200 font-extrabold' : 'text-gray-500'
                      }`}>
                        {isAr ? step.labelAr : step.labelEn}
                      </p>
                      <p className="text-[9px] text-gray-500 leading-tight block max-w-[140px] md:mx-auto">
                        {isAr ? step.descAr : step.descEn}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RESPONSIVE LAYOUT CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* LEFT COLUMN: 2 Cols span (Main Information) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* SECTION 2: Auction Information */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'معلومات وتفاصيل المزاد المغلق' : 'AUCTION DETAILS'}</span>
            </h3>

            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <img 
                src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=400&q=80'} 
                alt={order.auctionTitle} 
                className="w-full sm:w-28 h-28 rounded-2xl object-cover border border-gray-150 shrink-0 shadow-xs"
                referrerPolicy="no-referrer"
              />
              <div className="space-y-2.5 flex-1 min-w-0">
                <h4 className="font-black text-gray-950 text-base sm:text-lg tracking-tight leading-snug">
                  {order.auctionTitle}
                </h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'مبلغ الفوز' : 'WINNING BID'}</span>
                    <span className="text-base font-black text-[#FF6B00]">
                      {order.winningBidAmount.toLocaleString()} JOD
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'رقم المزاد' : 'AUCTION ID'}</span>
                    <span className="font-extrabold text-gray-700 truncate block">
                      {order.auctionId.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'تاريخ الترسية' : 'WON DATE'}</span>
                    <span className="font-extrabold text-gray-700 block">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: Escrow premium card */}
          <div className="bg-[#FAF9F6] border border-gray-150 rounded-3xl p-6 relative overflow-hidden">
            {/* Background luxury watermark */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-orange-500/[0.02] rounded-full pointer-events-none" />
            
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-gray-200/60 pb-3">
                <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#FF6B00]" />
                  <span>{isAr ? 'إدارة الضمان وحساب المودع المالي' : 'ESCROW HOLDING SUMMARY'}</span>
                </h3>
                <span className={`font-mono text-[10px] font-black px-2.5 py-1 rounded-full uppercase border ${
                  order.escrowStatus === 'released' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    : order.escrowStatus === 'refunded'
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-blue-50 border-blue-200 text-blue-600'
                }`}>
                  {order.escrowStatus === 'pending' ? (isAr ? 'محتجز بالضمان' : 'Held in Escrow') :
                   order.escrowStatus === 'released' ? (isAr ? 'تم التحرير للبائع' : 'Released') :
                   order.escrowStatus === 'refunded' ? (isAr ? 'تمت الإعادة للمشتري' : 'Refunded') : order.escrowStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white border border-gray-100 p-4 rounded-2xl space-y-1">
                  <span className="text-[9px] text-gray-400 font-mono block uppercase font-black">{isAr ? 'الأموال المحجوزة' : 'FUNDS LOCKED'}</span>
                  <p className="text-lg font-mono font-black text-gray-950">
                    {order.paymentStatus === 'paid' ? `${order.winningBidAmount.toLocaleString()} JOD` : '0 JOD'}
                  </p>
                  <p className="text-[9.5px] text-gray-400">
                    {order.paymentStatus === 'paid' ? (isAr ? 'مؤمن بالكامل في حساب الضمان' : 'Secured fully in Escrow vaults') : (isAr ? 'بانتظار التحصيل' : 'Waiting on authorization')}
                  </p>
                </div>

                <div className="bg-white border border-gray-100 p-4 rounded-2xl space-y-1">
                  <span className="text-[9px] text-gray-400 font-mono block uppercase font-black">{isAr ? 'الأموال المحررة' : 'FUNDS RELEASED'}</span>
                  <p className="text-lg font-mono font-black text-emerald-600">
                    {order.escrowStatus === 'released' ? `${order.winningBidAmount.toLocaleString()} JOD` : '0 JOD'}
                  </p>
                  <p className="text-[9.5px] text-gray-400">
                    {order.escrowStatus === 'released' ? (isAr ? 'تم الإيداع بمحفظة البائع' : 'Successfully credited to seller') : (isAr ? 'محجوز مؤقتاً بالضمان' : 'Under escrow safety hold')}
                  </p>
                </div>

                <div className="bg-white border border-gray-100 p-4 rounded-2xl space-y-1">
                  <span className="text-[9px] text-gray-400 font-mono block uppercase font-black">{isAr ? 'درجة الأمان والحماية' : 'PROTECTION STATUS'}</span>
                  <div className="flex items-center gap-1.5 mt-0.5 text-emerald-600">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="font-extrabold text-xs">{isAr ? 'حماية كاملة 100%' : '100% Fully Protected'}</span>
                  </div>
                  <p className="text-[9.5px] text-gray-400 mt-1">
                    {isAr ? 'الضمان يضمن جودة المنتج والتسليم الآمن' : 'Secures item authenticity & courier tracking logs'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 6: Shipping details with placeholders */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'معلومات الشحن واللوجستيات الافتراضية' : 'SHIPPING & LOGISTICS FULFILLMENT'}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-mono">
              <div className="space-y-3">
                <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-gray-100 space-y-0.5">
                  <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'رقم التتبع اللوجستي' : 'TRACKING NUMBER'}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-black text-gray-800">
                      {['shipped', 'delivered', 'completed'].includes(order.status) ? `MJ-${order.id.substring(0,6).toUpperCase()}` : (isAr ? 'لم ينشأ بعد' : 'Not Generated Yet')}
                    </span>
                    {['shipped', 'delivered', 'completed'].includes(order.status) && (
                      <span className="text-[9px] bg-orange-100 text-[#FF6B00] px-1.5 py-0.5 rounded-md font-sans font-bold">Aramex</span>
                    )}
                  </div>
                </div>

                <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-gray-100 space-y-0.5">
                  <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'شركة الشحن والتوصيل' : 'COURIER PARTNER'}</span>
                  <span className="font-extrabold text-gray-800 mt-0.5 block">
                    {isAr ? 'أرامكس المعتمدة (عمان - الأردن)' : 'Aramex Express Jordan'}
                  </span>
                </div>

                <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-gray-100 space-y-0.5">
                  <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'الوقت المتوقع للتوصيل' : 'ESTIMATED DELIVERY'}</span>
                  <span className="font-extrabold text-gray-800 mt-0.5 block flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span>{isAr ? 'خلال 48 ساعة عمل كحد أقصى' : 'Within 48 Business Hours'}</span>
                  </span>
                </div>
              </div>

              <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-gray-100 space-y-2">
                <span className="text-[9px] text-gray-400 uppercase font-black block">{isAr ? 'عنوان وموقع التوصيل' : 'DELIVERY SHIPPING ADDRESS'}</span>
                <div className="flex gap-2.5 items-start mt-1 text-gray-700">
                  <MapPin className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5" />
                  <div className="space-y-1 font-sans text-xs">
                    <p className="font-black text-gray-900">{order.buyerName}</p>
                    <p>{isAr ? 'الأردن ، عمان الغربية' : 'Amman, Western District, Jordan'}</p>
                    <p>{isAr ? 'شارع مكة ، مجمع رقم 42 ، الطابق الثاني' : 'Mecca St, Complex No. 42, 2nd Floor'}</p>
                    <p className="font-mono text-[10px] text-gray-400">Tel: +962 7 9000 0000</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 9: Documents Area */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'المستندات وإيصالات المعاملة' : 'TRANSACTIONAL DOCUMENTS & RECEIPT'}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Receipt */}
              <div className="bg-[#FAF9F6] border border-gray-100 hover:border-orange-200 p-4 rounded-2xl space-y-3 transition-colors flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="p-2 bg-orange-100 text-[#FF6B00] rounded-xl w-fit">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h5 className="font-black text-gray-900 text-xs">{isAr ? 'إيصال الدفع عبر كليك' : 'CliQ Payment Receipt'}</h5>
                  <p className="text-[9px] text-gray-400 leading-tight">
                    {order.paymentProofUrl
                      ? (isAr ? 'تم رفع إيصال حوالة كليك' : 'CliQ transfer receipt uploaded')
                      : order.paymentStatus === 'paid'
                        ? (isAr ? 'مستند الدفع مؤكد' : 'Payment record confirmed')
                        : (isAr ? 'بانتظار الدفع عبر كليك' : 'Awaiting CliQ payment')}
                  </p>
                </div>
                {order.paymentProofUrl ? (
                  <button
                    onClick={() => window.open(order.paymentProofUrl, '_blank', 'noopener,noreferrer')}
                    className="w-full bg-white hover:bg-gray-50 text-gray-700 hover:text-[#FF6B00] border border-gray-200 rounded-xl py-1.5 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer mt-2"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{isAr ? 'عرض الإيصال' : 'View Receipt'}</span>
                  </button>
                ) : order.paymentStatus === 'paid' ? (
                  <button
                    onClick={() => alert(isAr ? 'مستند الدفع متاح للتحميل للمحاسبين.' : 'Payment receipt available for direct download.')}
                    className="w-full bg-white hover:bg-gray-50 text-gray-700 hover:text-[#FF6B00] border border-gray-200 rounded-xl py-1.5 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer mt-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تحميل الإيصال' : 'Download Receipt'}</span>
                  </button>
                ) : (
                  <span className="text-[9px] text-gray-400 italic block text-center mt-2">{isAr ? 'غير متوفر بعد' : 'Not Available Yet'}</span>
                )}
              </div>

              {/* Shipping Label */}
              <div className="bg-[#FAF9F6] border border-gray-100 hover:border-orange-200 p-4 rounded-2xl space-y-3 transition-colors flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="p-2 bg-orange-100 text-[#FF6B00] rounded-xl w-fit">
                    <Truck className="w-4 h-4" />
                  </div>
                  <h5 className="font-black text-gray-900 text-xs">{isAr ? 'ملصق الشحن (أرامكس)' : 'Courier Shipping Label'}</h5>
                  <p className="text-[9px] text-gray-400 leading-tight">
                    {['preparing_shipment', 'shipped', 'delivered', 'completed'].includes(order.status) 
                      ? (isAr ? 'بوليصة الشحن معتمدة وجاهزة' : 'Shipping waybill authorized and ready')
                      : (isAr ? 'بانتظار تجهيز الطلب' : 'Waybill requires status preparation')}
                  </p>
                </div>
                {['preparing_shipment', 'shipped', 'delivered', 'completed'].includes(order.status) ? (
                  <button 
                    onClick={() => alert(isAr ? 'تحميل بوليصة أرامكس للطباعة والتغليف.' : 'Downloading waybill for shipping tag creation.')}
                    className="w-full bg-white hover:bg-gray-50 text-gray-700 hover:text-[#FF6B00] border border-gray-200 rounded-xl py-1.5 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer mt-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? 'طباعة البوليصة' : 'Print Waybill'}</span>
                  </button>
                ) : (
                  <span className="text-[9px] text-gray-400 italic block text-center mt-2">{isAr ? 'غير متوفر بعد' : 'Not Available Yet'}</span>
                )}
              </div>

              {/* Delivery Proof */}
              <div className="bg-[#FAF9F6] border border-gray-100 hover:border-orange-200 p-4 rounded-2xl space-y-3 transition-colors flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="p-2 bg-orange-100 text-[#FF6B00] rounded-xl w-fit">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h5 className="font-black text-gray-900 text-xs">{isAr ? 'مستند إثبات الاستلام' : 'POD Delivery Proof'}</h5>
                  <p className="text-[9px] text-gray-400 leading-tight">
                    {['delivered', 'completed'].includes(order.status) 
                      ? (isAr ? 'تم التوقيع الإلكتروني من المشتري' : 'Digitally signed by recipient')
                      : (isAr ? 'متاح عند التوصيل الفعلي' : 'Requires parcel delivery clearance')}
                  </p>
                </div>
                {['delivered', 'completed'].includes(order.status) ? (
                  <button 
                    onClick={() => alert(isAr ? 'عرض توقيع العميل ومكان التوصيل.' : 'Viewing customer signature and geoloc logs.')}
                    className="w-full bg-white hover:bg-gray-50 text-gray-700 hover:text-[#FF6B00] border border-gray-200 rounded-xl py-1.5 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer mt-2"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{isAr ? 'عرض الإثبات' : 'View Proof'}</span>
                  </button>
                ) : (
                  <span className="text-[9px] text-gray-400 italic block text-center mt-2">{isAr ? 'غير متوفر بعد' : 'Not Available Yet'}</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: 1 Col span (Fulfillment Sidebar) */}
        <div className="space-y-6">
          
          {/* ACTION BUTTONS (Section 8) */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'مركز إجراءات الضمان والتسليم' : 'FULFILLMENT INTERACTION PANEL'}</span>
            </h3>

            <div className="space-y-3">
              {/* Buyer specific operations */}
              {isBuyer && (
                <>
                  {order.status === 'waiting_payment' && (
                    <div className="bg-[#FFF8F3] border border-[#FF6B00] rounded-2xl p-4 space-y-4" id="buyer-cliq-payment-panel">
                      {/* Amount due */}
                      <div className="text-center space-y-1 border-b border-orange-100 pb-3">
                        <span className="text-[9px] text-gray-400 uppercase font-black font-mono block">
                          {isAr ? 'المبلغ المستحق — شامل عمولة ٥٪' : 'AMOUNT DUE — INCL. 5% PREMIUM'}
                        </span>
                        <div className="flex items-center justify-center gap-2">
                          <div className="text-2xl font-black text-[#FF6B00] font-mono">
                            <CountUp value={totalDue} format={(n) => Number(n.toFixed(3)).toLocaleString('en-US')} />
                            <span className="text-xs font-sans font-bold text-gray-500"> JOD</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyAmount}
                            className="p-1 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-[#FF6B00] transition-colors cursor-pointer shrink-0"
                            aria-label={isAr ? 'نسخ المبلغ' : 'Copy amount'}
                          >
                            {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-[9.5px] text-gray-500 font-bold">
                          {isAr ? 'لازم يطابق للفلس' : 'Must match to the fil'}
                        </p>
                        {order.paymentDeadlineAt && (
                          <p className="text-[10px] text-amber-700 font-bold flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{isAr ? `ادفع قبل: ${formatDate(order.paymentDeadlineAt)}` : `Pay before: ${formatDate(order.paymentDeadlineAt)}`}</span>
                          </p>
                        )}
                      </div>

                      {/* Buyer-protection reassurance — a dispute model backs this pay step. */}
                      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 -mt-1">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-emerald-800 font-bold leading-snug">
                          {isAr
                            ? 'مبلغك محمي: إذا لم تستلم القطعة كما وُصفت، افتح نزاعاً وسنسترجع لك المبلغ وفق سياسة حماية المشتري.'
                            : 'Your payment is protected: if the item does not arrive as described, open a dispute and you are refunded under our buyer-protection policy.'}
                        </p>
                      </div>

                      {/* CliQ recipient details */}
                      <div className="space-y-2 text-xs">
                        <div className="text-[10px] font-black text-gray-800 uppercase tracking-tight font-mono flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-[#FF6B00]" />
                          <span>{isAr ? 'حوّل عبر كليك (CliQ) إلى:' : 'Transfer via CliQ to:'}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-orange-100 pb-1.5">
                          <span className="font-bold text-gray-500">{isAr ? 'اسم الحساب' : 'Account Name'}:</span>
                          <span className="font-black text-gray-900 font-mono">MAZAD JO M</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-orange-100 pb-1.5">
                          <span className="font-bold text-gray-500">{isAr ? 'البنك' : 'Bank'}:</span>
                          <span className="font-black text-[#FF6B00] uppercase font-mono">CAPITAL BANK</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-bold text-gray-500">IBAN:</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono font-black text-gray-900 select-all text-[10.5px] truncate">{CLIQ_IBAN}</span>
                            <button
                              type="button"
                              onClick={handleCopyIban}
                              className="p-1 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-[#FF6B00] transition-colors cursor-pointer shrink-0"
                            >
                              {copiedIban ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Receipt screenshot upload */}
                      <div className="relative border-2 border-dashed border-orange-200 hover:border-[#FF6B00] transition-all rounded-xl p-4 flex flex-col items-center justify-center bg-white cursor-pointer group min-h-[110px]">
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg"
                          onChange={handleReceiptFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          id="order-payment-receipt-input"
                        />
                        {receiptPreview ? (
                          <div className="w-full relative flex flex-col items-center space-y-2">
                            <img
                              src={receiptPreview}
                              alt="CliQ Receipt"
                              className="max-h-40 w-auto object-contain rounded-lg border border-gray-200 shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                            <span className="text-[10px] text-gray-400 font-bold group-hover:text-[#FF6B00] transition-colors">
                              {isAr ? 'اضغط لتغيير لقطة الشاشة' : 'Click to change screenshot'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-center space-y-1.5">
                            <UploadCloud className="w-6 h-6 text-gray-400 group-hover:text-[#FF6B00] transition-colors" />
                            <p className="text-[11px] text-gray-700 font-extrabold">
                              {isAr ? 'ارفع لقطة شاشة لإيصال حوالة كليك' : 'Upload your CliQ transfer receipt screenshot'}
                            </p>
                            <p className="text-[9px] text-gray-400 font-mono">PNG, JPG</p>
                          </div>
                        )}
                      </div>

                      {/* Submit */}
                      <button
                        onClick={handleSubmitCliqPayment}
                        disabled={isUpdating}
                        className="w-full bg-[#FF6B00] hover:bg-[#FF8000] text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                        id="submit-cliq-payment-btn"
                      >
                        {isUpdating ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4" />
                        )}
                        <span>{isAr ? 'أرسل إثبات الدفع' : 'Submit Payment Proof'}</span>
                      </button>
                    </div>
                  )}

                  {order.status === 'waiting_payment' && (
                    <button
                      onClick={handleCancelOrder}
                      disabled={isUpdating}
                      className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 font-black py-3 rounded-2xl text-xs transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{isAr ? 'إلغاء الطلب بالكامل' : 'Cancel Bidding Order'}</span>
                    </button>
                  )}

                  {/* Progressive email capture — only while the account has no email.
                      Optional and dismissible; persists via the write-once rules claim. */}
                  {!currentUser?.email && !receiptEmailDismissed && (
                    <div className="bg-white border border-gray-150 rounded-2xl p-3.5 space-y-2" id="receipt-email-capture">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-black text-gray-800 flex items-center gap-1.5">
                          <Mail className="w-4 h-4 text-[#FF6B00] shrink-0" />
                          <span>{t.receiptEmailPromptTitle}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setReceiptEmailDismissed(true)}
                          aria-label={t.receiptEmailSkip}
                          className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer shrink-0"
                          id="receipt-email-skip-btn"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[9.5px] text-gray-400 leading-snug">{t.receiptEmailPromptHint}</p>
                      <div className="flex items-stretch gap-2">
                        <input
                          type="email"
                          dir="ltr"
                          inputMode="email"
                          autoComplete="email"
                          value={receiptEmail}
                          onChange={e => { setReceiptEmail(e.target.value); if (receiptEmailError) setReceiptEmailError(false); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveReceiptEmail(); } }}
                          placeholder={t.receiptEmailPlaceholder}
                          className={`flex-1 min-w-0 bg-[#FAF9F6] border rounded-xl px-3 py-2 text-xs font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#FF6B00] transition-colors ${receiptEmailError ? 'border-red-300' : 'border-gray-150'}`}
                          id="receipt-email-input"
                        />
                        <button
                          type="button"
                          onClick={handleSaveReceiptEmail}
                          disabled={receiptEmailSaving}
                          className="bg-[#121318] hover:bg-gray-900 text-white font-black px-4 rounded-xl text-[10px] uppercase font-mono transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                          id="receipt-email-save-btn"
                        >
                          {receiptEmailSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>{t.receiptEmailSave}</span>}
                        </button>
                      </div>
                      {receiptEmailError && (
                        <p className="text-[9.5px] text-red-500 font-bold">{t.receiptEmailInvalid}</p>
                      )}
                    </div>
                  )}

                  {canRateOrder && (
                    <button
                      onClick={() => setReviewPromptOrderId(order.id)}
                      className="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-amber-400/20 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99]"
                      id="rate-order-details-btn"
                    >
                      <Star className="w-4 h-4 fill-amber-950" />
                      <span>{isAr ? 'قيّم تجربتك ⭐' : 'Rate Your Experience ⭐'}</span>
                    </button>
                  )}

                  {order.status === 'shipped' && (
                    <button
                      onClick={handleConfirmDelivery}
                      disabled={isUpdating}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'تأكيد استلام الشحنة' : 'Confirm Parcel Received'}</span>
                    </button>
                  )}

                  {/* Open dispute */}
                  {order.status !== 'completed' && order.status !== 'disputed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
                    <button
                      onClick={handleOpenDispute}
                      disabled={isUpdating}
                      className="w-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 font-bold py-3 rounded-2xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                      <span>{isAr ? 'رفع نزاع رسمي ومراجعة المشرف' : 'File Formal Dispute'}</span>
                    </button>
                  )}
                </>
              )}

              {/* Seller specific operations */}
              {isSeller && (
                <>
                  {order.status === 'paid' && (
                    <button
                      onClick={handlePrepareShipment}
                      disabled={isUpdating}
                      className="w-full bg-[#FF6B00] hover:bg-[#FF8000] text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                    >
                      <Package className="w-4 h-4" />
                      <span>{isAr ? 'بدء تجهيز وتعبئة الشحنة' : 'Begin Preparing Shipment'}</span>
                    </button>
                  )}

                  {order.status === 'preparing_shipment' && (
                    <button
                      onClick={handleMarkAsShipped}
                      disabled={isUpdating}
                      className="w-full bg-[#121318] hover:bg-gray-900 text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                    >
                      <Truck className="w-4 h-4" />
                      <span>{isAr ? 'تأكيد التسليم لشركة الشحن' : 'Mark as Dispatched / Shipped'}</span>
                    </button>
                  )}

                  {order.status === 'waiting_payment' && (
                    <div className="bg-amber-50/50 border border-amber-200/50 p-3.5 rounded-2xl text-center">
                      <p className="text-xs font-bold text-amber-700 flex items-center justify-center gap-1.5">
                        <Clock className="w-4 h-4 animate-pulse" />
                        <span>{isAr ? 'بانتظار قيام المشتري بالدفع لحساب الضمان.' : 'Awaiting buyer Escrow deposit.'}</span>
                      </p>
                    </div>
                  )}

                  {/* Open dispute */}
                  {order.status !== 'completed' && order.status !== 'disputed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
                    <button
                      onClick={handleOpenDispute}
                      disabled={isUpdating}
                      className="w-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 font-bold py-3 rounded-2xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                      <span>{isAr ? 'رفع نزاع رسمي ومشكلة الشحن' : 'File Formal Dispute'}</span>
                    </button>
                  )}
                </>
              )}

              {/* Admin specific operations (Section 8) */}
              {isAdmin && (
                <div className="space-y-2.5 bg-[#FAF9F6] p-4 rounded-2xl border border-gray-150">
                  <div className="flex items-center gap-1 text-[9px] text-[#FF6B00] font-mono font-black uppercase mb-1">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    <span>{isAr ? 'صلاحيات المشرف الفورية' : 'SUPERADMIN OVERRIDE CONSOLE'}</span>
                  </div>

                  {order.escrowStatus === 'pending' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
                    <button
                      onClick={handleReleaseEscrow}
                      disabled={isUpdating}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'تحرير الضمان المالي للبائع' : 'Release Escrow to Seller'}</span>
                    </button>
                  )}

                  {order.escrowStatus === 'pending' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
                    <button
                      onClick={handleRefundBuyer}
                      disabled={isUpdating}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{isAr ? 'إعادة الأموال للمشتري' : 'Refund Escrow to Buyer'}</span>
                    </button>
                  )}

                  {order.status !== 'disputed' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
                    <button
                      onClick={handleOpenDispute}
                      disabled={isUpdating}
                      className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>{isAr ? 'فتح نزاع رسمي فوري' : 'Force Open Dispute'}</span>
                    </button>
                  )}

                  {order.status === 'disputed' && (
                    <button
                      onClick={handleCloseDispute}
                      disabled={isUpdating}
                      className="w-full bg-[#121318] hover:bg-slate-900 text-white font-black py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isAr ? 'إنهاء وحل النزاع' : 'Resolve & Close Dispute'}</span>
                    </button>
                  )}

                  {order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded' && (
                    <button
                      onClick={handleForceClose}
                      disabled={isUpdating}
                      className="w-full bg-slate-800 hover:bg-slate-950 text-white font-black py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{isAr ? 'إغلاق الطلب قسرياً' : 'Force Close Order'}</span>
                    </button>
                  )}

                  {/* One-tap buyer trust rating at close-out (mazad_rates_buyer) */}
                  {(order.status === 'completed' || order.status === 'delivered') && (
                    <div className="bg-white border border-gray-150 rounded-xl p-3 space-y-2" id="admin-rate-buyer-row">
                      <span className="text-[9px] text-gray-400 font-mono font-black uppercase block">
                        {isAr ? 'تقييم المشتري (نقرة واحدة)' : 'RATE BUYER (ONE TAP)'}
                      </span>
                      <div className="flex items-center gap-1.5" dir="ltr">
                        {[1, 2, 3, 4, 5].map((n) => {
                          const highlighted = n <= (adminBuyerStars ?? 5); // defaults to a full 5-star highlight
                          return (
                            <button
                              key={n}
                              type="button"
                              disabled={adminRatingSaving || adminBuyerStars !== null}
                              onClick={() => handleAdminRateBuyer(n)}
                              aria-label={`${n}/5`}
                              className={`p-0.5 transition-transform cursor-pointer disabled:cursor-default ${adminBuyerStars === null ? 'hover:scale-110 active:scale-95' : ''}`}
                              id={`admin-rate-buyer-star-${n}`}
                            >
                              <Star
                                className={`w-6 h-6 ${highlighted ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} ${adminBuyerStars !== null && !highlighted ? 'opacity-60' : ''}`}
                                strokeWidth={1.75}
                              />
                            </button>
                          );
                        })}
                        <span className="text-[9.5px] text-gray-400 font-mono font-bold ms-1">
                          {adminBuyerStars !== null
                            ? (isAr ? `تم التقييم ${adminBuyerStars}/5` : `Rated ${adminBuyerStars}/5`)
                            : adminRatingSaving
                              ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
                              : (isAr ? 'اضغط نجمة للحفظ' : 'Tap a star to save')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No actions warning if completed */}
              {order.status === 'completed' && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-center space-y-1">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                  <p className="font-black text-xs uppercase font-mono">{isAr ? 'الصفقة مغلقة بالكامل' : 'ORDER ARCHIVED & COMPLETED'}</p>
                  <p className="text-[10px] text-emerald-650">
                    {isAr ? 'تم الانتهاء من الطلب بنجاح وتحرير حسابات الضمان المالي بالكامل.' : 'All goods arrived safely and escrow transaction accounts cleared.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: Buyer Information */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'معلومات حساب المشتري' : 'BUYER INFORMATION'}</span>
            </h3>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#121318] text-white flex items-center justify-center font-black text-xs shadow-xs border border-white/5 font-mono">
                {order.buyerName.substring(0, 2).toUpperCase()}
              </div>
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-black text-gray-950 text-xs truncate leading-snug">{order.buyerName}</h4>
                  <span className="text-[10px] bg-orange-100 text-[#FF6B00] px-1.5 py-0.2 rounded-md font-sans font-black">Bidder</span>
                </div>
                <p className="text-[9px] text-gray-400 font-mono">
                  ID: <span className="font-bold select-all">{order.buyerId.substring(0, 8).toUpperCase()}</span>
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 4: Seller Information */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'معلومات حساب البائع' : 'SELLER PROFILE'}</span>
            </h3>

            {(() => {
              const sellerProf = sellerProfiles?.find(p => p.userId === order.sellerId || p.id === order.sellerId);
              const isPremium = sellerProf?.verificationStatus === 'premium_verified';
              const isVerified = sellerProf?.verificationStatus === 'verified' || isPremium;
              const trustScore = sellerProf?.trustScore;
              const completedSales = sellerProf?.totalSales;
              const ratingVal = sellerProf?.rating;

              return (
                <div className="flex items-center gap-3">
                  {sellerProf?.storeLogo ? (
                    <img src={sellerProf.storeLogo} alt="Logo" className="w-11 h-11 rounded-full object-cover border border-gray-200 shadow-xs shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-orange-50 text-[#FF6B00] flex items-center justify-center font-black text-xs shadow-xs border border-orange-100 font-mono shrink-0">
                      {order.sellerName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <h4 className="font-black text-gray-950 text-xs truncate leading-snug">{sellerProf?.storeName || order.sellerName}</h4>
                      {isVerified && (
                        <ShieldCheck className={`w-4 h-4 ${isPremium ? 'text-amber-500' : 'text-emerald-500'} shrink-0`} />
                      )}
                    </div>
                    {(!!ratingVal || !!completedSales || !!trustScore) && (
                      <div className="flex items-center gap-1 font-mono text-[9.5px] text-gray-500 flex-wrap">
                        {!!ratingVal && (
                          <>
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            <span className="font-black">{ratingVal.toFixed(1)} / 5.0</span>
                          </>
                        )}
                        {!!completedSales && (
                          <>
                            {!!ratingVal && <span className="text-gray-250">•</span>}
                            <span>({completedSales} {isAr ? 'مبيعات' : 'lots'})</span>
                          </>
                        )}
                        {!!trustScore && (
                          <>
                            {(!!ratingVal || !!completedSales) && <span className="text-gray-250">•</span>}
                            <span className="text-orange-500 font-bold">{isAr ? 'ثقة' : 'Trust'} {trustScore}%</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[8.5px] font-sans font-extrabold px-1.5 py-0.5 rounded-md border ${
                        isPremium 
                          ? 'bg-amber-50 border-amber-200 text-amber-600' 
                          : isVerified 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}>
                        {isPremium 
                          ? (isAr ? 'موثق متميز بلس' : 'Premium Verified +') 
                          : isVerified 
                            ? (isAr ? 'بائع موثق معتمد' : 'Verified Merchant') 
                            : (isAr ? 'بائع قياسي' : 'Standard Seller')}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-400 font-mono mt-0.5">
                      ID: <span className="font-bold select-all">{order.sellerId.substring(0, 8).toUpperCase()}</span>
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* SECTION 7: Order Activity chronological history */}
          <div className="bg-white border border-gray-150 rounded-3xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] space-y-4">
            <h3 className="text-xs font-black text-gray-400 tracking-wider uppercase font-mono border-b border-gray-100 pb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#FF6B00]" />
              <span>{isAr ? 'سجل تتبع الشحنة والنشاط' : 'AUDIT LEDGER & ACTIVITY'}</span>
            </h3>

            <div className="relative pl-1.5 text-xs font-mono">
              {/* Vertical line */}
              <div className="absolute left-[13px] top-3.5 bottom-3.5 w-0.5 bg-gray-100" />

              <div className="space-y-5">
                {getDisplayActivities().map((act, idx) => (
                  <div key={idx} className="flex gap-3 items-start relative z-10">
                    <div className="w-7 h-7 rounded-full bg-white border border-gray-100 shadow-xs flex items-center justify-center shrink-0">
                      {act.icon}
                    </div>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="font-black text-gray-900 leading-tight text-xs">
                        {isAr ? act.titleAr : act.titleEn}
                      </p>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                        {isAr ? act.descAr : act.descEn}
                      </p>
                      <p className="text-[8.5px] text-gray-400">
                        {new Date(act.time).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
