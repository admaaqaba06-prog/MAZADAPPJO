import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { doc, updateDoc, arrayUnion, Timestamp, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
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
  RefreshCw
} from 'lucide-react';
import { Order } from '../types';
import { executeOrderTransition } from '../utils/orderWorkflow';

interface OrderDetailsViewProps {
  orderId: string;
  onBack: () => void;
}

export const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({ orderId, onBack }) => {
  const { orders, language, currentUser, addNotification, sellerProfiles } = useApp();
  const isAr = language === 'ar';

  const order = orders.find(o => o.id === orderId);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

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

  // Status index mapping
  const timelineSteps = [
    { id: 'waiting_payment', labelAr: 'بانتظار الدفع', labelEn: 'Waiting Payment', descAr: 'المشتري يجب أن يدفع لحساب الضمان', descEn: 'Buyer needs to pay to secure funds' },
    { id: 'paid', labelAr: 'تم الدفع', labelEn: 'Paid', descAr: 'تم حجز الأموال في الضمان بنجاح', descEn: 'Funds secured in escrow account' },
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

  // Action handlers using workflow engine
  const handlePayNow = async () => {
    if (confirm(isAr ? 'هل ترغب في دفع قيمة المزايدة من محفظتك لحساب الضمان الآمن؟' : 'Do you want to authorize payment from your available balance to the secure Escrow?')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'pay', currentUser);
        addNotification(
          isAr ? 'تم الدفع بنجاح' : 'Payment Confirmed',
          isAr ? 'تم دفع قيمة الطلب بنجاح وحجزها في حساب الضمان.' : 'Bid amount paid and secured in Escrow.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل الدفع: ${err.message}` : `Payment failed: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleCancelOrder = async () => {
    if (confirm(isAr ? 'هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to cancel this order? This action is irreversible.')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'cancel_before_payment', currentUser);
        addNotification(
          isAr ? 'تم إلغاء الطلب' : 'Order Cancelled',
          isAr ? 'تم إلغاء الطلب وتحرير الضمان المالي بالكامل.' : 'Order cancelled and escrow holdings resolved successfully.',
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
        await executeOrderTransition(order, 'confirm_delivery', currentUser);
        addNotification(
          isAr ? 'تم تأكيد الاستلام' : 'Delivery Confirmed',
          isAr ? 'شكراً لك! تم تسجيل تأكيد الاستلام بنجاح.' : 'Thank you! Delivery confirmed successfully.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل تأكيد الاستلام: ${err.message}` : `Confirmation failed: ${err.message}`);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleReleaseEscrow = async () => {
    if (confirm(isAr ? 'تأكيد تحرير الضمان المالي للبائع؟ سيتم قفل الطلب.' : 'Confirm release of Escrow funds directly to the seller? This closes the order.')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'release_escrow', currentUser);
        addNotification(
          isAr ? 'تم تحرير الضمان' : 'Escrow Released',
          isAr ? 'تم فك الحجز المالي وتحويل المبلغ لمحفظة البائع بنجاح.' : 'Escrow funds released and securely deposited into seller’s wallet.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل تحرير الضمان: ${err.message}` : `Release failed: ${err.message}`);
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
      await executeOrderTransition(order, 'resolve_dispute', currentUser, { resolutionType: lowerRes as any });
      addNotification(
        isAr ? 'تم حل النزاع' : 'Dispute Resolved',
        isAr ? 'تم إنهاء وحل النزاع بنجاح وتحديث قيود الضمان.' : 'Dispute resolved successfully and escrow accounts adjusted.',
        'info'
      );
    } catch (err: any) {
      console.error(err);
      alert(isAr ? `فشل حل النزاع: ${err.message}` : `Resolution failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleForceClose = async () => {
    if (confirm(isAr ? 'هل أنت متأكد من فرض إغلاق الطلب وتحرير الضمان للبائع؟' : 'Are you sure you want to force close this order and release escrow to the seller?')) {
      setIsUpdating(true);
      try {
        await executeOrderTransition(order, 'force_close', currentUser);
        addNotification(
          isAr ? 'تم فرض الإغلاق' : 'Order Force Closed',
          isAr ? 'قام المشرف بإغلاق الطلب قسرياً وتحرير الضمان للبائع.' : 'Admin forced close order and released secure Escrow funds to seller.',
          'info'
        );
      } catch (err: any) {
        console.error(err);
        alert(isAr ? `فشل فرض الإغلاق: ${err.message}` : `Force close failed: ${err.message}`);
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
                ? 'تم إلغاء هذه المعاملة بنجاح، وتحرير أي أموال معلقة لصالح المشتري.'
                : 'This transaction has been cancelled. All associated escrow funds have been released and returned to the buyer.'}
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
                ? 'تمت إعادة قيمة المعاملة بالكامل لمحفظة المشتري بناءً على قرار التحكيم.'
                : 'The entire bid amount has been fully refunded back to the buyer’s wallet based on dispute resolution/admin action.'}
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
                  <h5 className="font-black text-gray-900 text-xs">{isAr ? 'إيصال دفع كليك الضمان' : 'Escrow Payment Receipt'}</h5>
                  <p className="text-[9px] text-gray-400 leading-tight">
                    {order.paymentStatus === 'paid' ? (isAr ? 'مستند تحصيل رسمي جاهز' : 'Official payment receipt cleared') : (isAr ? 'بانتظار إتمام الدفع' : 'Awaiting payment ledger clearance')}
                  </p>
                </div>
                {order.paymentStatus === 'paid' ? (
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
                    <button
                      onClick={handlePayNow}
                      disabled={isUpdating}
                      className="w-full bg-[#FF6B00] hover:bg-[#FF8000] text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>{isAr ? 'ادفع الآن لحساب الضمان' : 'Authorize Escrow Payment'}</span>
                    </button>
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
                <div className="flex items-center gap-1 font-mono text-[9.5px] text-gray-500">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="font-black">4.8 / 5.0</span>
                  <span className="text-gray-250">•</span>
                  <span>(12 {isAr ? 'تقييمات' : 'bids'})</span>
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
              const trustScore = sellerProf?.trustScore || 85;
              const completedSales = sellerProf?.completedSales || 12;
              const ratingVal = sellerProf?.rating || 4.8;

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
                    <div className="flex items-center gap-1 font-mono text-[9.5px] text-gray-500 flex-wrap">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span className="font-black">{ratingVal.toFixed(1)} / 5.0</span>
                      <span className="text-gray-250">•</span>
                      <span>({completedSales} {isAr ? 'مبيعات' : 'lots'})</span>
                      <span className="text-gray-250">•</span>
                      <span className="text-orange-500 font-bold">{isAr ? 'ثقة' : 'Trust'} {trustScore}%</span>
                    </div>
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
