import React, { useState, useEffect, useMemo } from 'react';
import { useApp, useAuctions } from '../context/AppContext';
import { translations } from '../utils/translations';
import { isAdminUser } from '../utils/adminAuth';
import { isPendingOrderPayment } from '../utils/paymentReceipt';
import { isOverdue } from '../utils/fulfillmentQueues';
import { executeOrderTransition } from '../utils/orderWorkflow';
import { OrderDetailsView } from './OrderDetailsView';
import { collection, onSnapshot, doc, query, where, limit, orderBy } from 'firebase/firestore';
import { db, getCallableFunction } from '../services/firebase';
import {
  type AdminTabId,
  ADMIN_PRIMARY_TABS,
  ADMIN_REFERENCE_TABS,
  ADMIN_TAB_DEFAULT,
  migrateStoredAdminTab,
} from '../utils/adminNav';
import { ShieldCheck } from 'lucide-react';

// Lazy: the Verify & Approve section (Slice B). The pending-count badge only needs the tiny paymentReceipt util,
// so the heavy section stays out of the main chunk until the tab opens.
const AdminHome = React.lazy(() => import('./admin/AdminHome'));
const VerifyApproveSection = React.lazy(() => import('./admin/VerifyApproveSection'));
const FulfillmentSection = React.lazy(() => import('./admin/FulfillmentSection'));
const DisputesSection = React.lazy(() => import('./admin/DisputesSection'));
const PayoutsSection = React.lazy(() => import('./admin/PayoutsSection'));
const LaunchSection = React.lazy(() => import('./admin/LaunchSection'));
const OrdersLedgerSection = React.lazy(() => import('./admin/OrdersLedgerSection'));
const MembersSection = React.lazy(() => import('./admin/MembersSection'));
const SystemSection = React.lazy(() => import('./admin/SystemSection'));

/**
 * Normalize any timestamp shape we store (Firestore Timestamp, {seconds},
 * ISO string, epoch ms) to epoch milliseconds. Returns 0 when unparseable.
 */
const tsToMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

type StatusSeverity = 'ok' | 'warn' | 'bad' | 'neutral';

// ── Active-tab persistence ───────────────────────────────────────────────
// The dashboard occasionally remounts mid-session (live E2E finding), which
// reset the useState tab back to GENERAL METRICS. The active tab is therefore
// mirrored into sessionStorage and restored (validated) on mount.
const ADMIN_TAB_STORAGE_KEY = 'mazad_admin_tab';

function readStoredAdminTab(): AdminTabId {
  try {
    return migrateStoredAdminTab(sessionStorage.getItem(ADMIN_TAB_STORAGE_KEY));
  } catch {
    return ADMIN_TAB_DEFAULT; // storage unavailable — session-local only
  }
}

// Bilingual labels for every nav tab, keyed by AdminTabId.
const TAB_META: Record<AdminTabId, { ar: string; en: string }> = {
  home: { ar: 'الرئيسية', en: 'HOME' },
  verify: { ar: 'التحقق والموافقات', en: 'VERIFY & APPROVE' },
  fulfillment: { ar: 'المتابعة والتنفيذ', en: 'FULFILLMENT' },
  disputes: { ar: 'النزاعات', en: 'DISPUTES' },
  payouts: { ar: 'المدفوعات', en: 'PAYOUTS' },
  launch: { ar: 'إطلاق المزادات', en: 'LAUNCH' },
  orders: { ar: 'الطلبات', en: 'ORDERS' },
  members: { ar: 'الأعضاء', en: 'MEMBERS' },
  system: { ar: 'النظام', en: 'SYSTEM' },
};

export const AdminDashboardView: React.FC = () => {
  const {
    currentUser,
    users,
    usersTotalCount,
    escrows,
    orders,
    approveListing,
    setAuctionViewing, 
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
    language,
    maintenanceMode,
    featureFlags,
    updateMaintenanceMode,
    updateFeatureFlag,
    systemHealthLogs,
    logSystemHealth,
    setBids,
    resetOnboarding,
    setActiveView
  } = useApp();
  const { auctions } = useAuctions();

  const t = translations[language];
  const isAr = language === 'ar';

  const isRealUrl = (url?: string) => {
    if (!url) return false;
    const clean = url.trim();
    return clean.startsWith('http://') || 
           clean.startsWith('https://') || 
           clean.startsWith('data:') || 
           (clean.length > 30 && /^[A-Za-z0-9+/=]+$/.test(clean.substring(0, 30)));
  };

  const getReceiptImageSrc = (url?: string): string => {
    if (!url) return '';
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
      return clean;
    }
    return `data:image/png;base64,${clean}`;
  };

  const [activeTab, setActiveTab] = useState<AdminTabId>(readStoredAdminTab);
  // Every tab selection goes through here so it survives remounts.
  const selectTab = (tab: AdminTabId) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem(ADMIN_TAB_STORAGE_KEY, tab);
    } catch {
      /* storage unavailable — selection stays session-local */
    }
  };
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [historyWithdrawals, setHistoryWithdrawals] = useState<any[]>([]);
  const allWithdrawals = [
    ...pendingWithdrawals,
    ...historyWithdrawals.filter((hw) => !pendingWithdrawals.some((pw) => pw.id === hw.id))
  ].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const [adminOrderFilter, setAdminOrderFilter] = useState<'all' | 'waiting_payment' | 'paid' | 'preparing_shipment' | 'shipped' | 'delivered' | 'completed' | 'disputed' | 'defaulted'>('all');
  const [adminSelectedOrderId, setAdminSelectedOrderId] = useState<string | null>(null);

  const filteredOrders = (orders || []).filter((o: any) => {
    if (adminOrderFilter === 'all') return true;
    return o.status === adminOrderFilter;
  });

  // ── Health status board ──────────────────────────────────────────────────
  // system_status/current is written by the pollN8nHealth Cloud Function every
  // 15 minutes; null means the doc doesn't exist yet (pre-first-poll).
  const [systemStatus, setSystemStatus] = useState<any | null>(null);
  // Ticker so the time-derived signals (stuck auctions / unpaid >48h /
  // settlement freshness) stay honest even when no snapshot fires.
  const [healthNow, setHealthNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_status', 'current'), (snap) => {
      setSystemStatus(snap.exists() ? snap.data() : null);
    }, (err) => {
      console.warn('[HEALTH] system_status subscription failed:', err);
    });
    const tick = setInterval(() => setHealthNow(Date.now()), 30000);
    return () => { unsub(); clearInterval(tick); };
  }, []);

  // Wave 3 metric hygiene: simulator test data must never inflate REAL
  // numbers. Context `auctions` is deliberately unfiltered in admin mode and
  // `orders` includes simulated orders while the toggle is ON, so every
  // metric/health computation below reads these sim-free views instead.
  const realAuctions = (auctions || []).filter((a: any) => a.isSimulated !== true);
  const realOrders = (orders || []).filter((o: any) => o.isSimulated !== true);
  const simOrdersCount = (orders || []).length - realOrders.length;

  // Verify & Approve — order payments awaiting review (receipt attached, not
  // yet verified). Same predicate as the section's queue (shared util), and
  // sourced from realOrders (isSimulated !== true) so simulated orders never
  // inflate the badge — matching the real-metric hygiene used across this file.
  const pendingOrderPaymentsCount = useMemo(
    () => realOrders.filter(isPendingOrderPayment).length,
    [realOrders]
  );

  // Fulfillment (Slice C): orders sitting past their stage's overdue threshold,
  // across all three buckets. Sourced from realOrders (sim-excluded), matching
  // the Slice B fix for the Verify badge.
  const overdueFulfillmentCount = useMemo(() => {
    const now = Date.now();
    return realOrders.filter((o: any) => {
      const updatedAtMs = o.updatedAt?.seconds ? o.updatedAt.seconds * 1000 : (o.updatedAt || o.createdAt || now);
      return isOverdue({ status: o.status, paymentVerified: o.paymentVerified, updatedAtMs }, now);
    }).length;
  }, [realOrders]);

  // Disputes (Slice D): count of open disputed orders, for the tab's
  // attention dot. Sourced from realOrders (sim-excluded), matching the
  // established pattern from Slices B/C.
  const openDisputesCount = useMemo(
    () => realOrders.filter((o: any) => o.status === 'disputed').length,
    [realOrders]
  );

  // Auctions the settlement cron should already have closed: still live/active
  // but ended more than 2 minutes ago.
  const stuckAuctions = realAuctions.filter((a: any) => {
    if (a.status !== 'live' && a.status !== 'active') return false;
    const endMs = tsToMillis(a.endTime) || tsToMillis(a.endsAt);
    return endMs > 0 && endMs < healthNow - 2 * 60 * 1000;
  });

  // Orders still unpaid more than 48h after creation.
  const stuckOrders = realOrders.filter((o: any) => {
    if (o.status !== 'waiting_payment') return false;
    const createdMs = tsToMillis(o.createdAt);
    return createdMs > 0 && createdMs < healthNow - 48 * 60 * 60 * 1000;
  });

  // Coarse "settlement cron is alive" signal: either nothing was due to close,
  // or the most recent settlement happened within the last ~10 minutes of an
  // auction actually ending (no stuck auctions means the closer is keeping up).
  const anyAuctionsDue = realAuctions.some((a: any) => {
    if (a.status !== 'live' && a.status !== 'active') return false;
    const endMs = tsToMillis(a.endTime) || tsToMillis(a.endsAt);
    return endMs > 0 && endMs < healthNow;
  });
  // NOTE: a simulateSettleNow on a test lot must not fake closer-cron
  // freshness (masking a real stall), so this also reads realAuctions.
  const lastSettledMs = Math.max(0, ...realAuctions.map((a: any) => tsToMillis(a.settledAt)));
  const settlementFresh =
    (!anyAuctionsDue && stuckAuctions.length === 0) ||
    (lastSettledMs > 0 && lastSettledMs > healthNow - 10 * 60 * 1000);

  const n8nBot = systemStatus?.n8n?.bot;
  const n8nNotif = systemStatus?.n8n?.notifications;
  const statusAsOfMs = tsToMillis(systemStatus?.updatedAt);

  const rateSeverity = (stats: any): StatusSeverity => {
    if (!stats || typeof stats.failureRate !== 'number') return 'neutral';
    if (stats.failureRate > 0.25) return 'bad';
    if (stats.failureRate >= 0.10) return 'warn';
    return 'ok';
  };
  const rateValue = (stats: any): string =>
    stats && typeof stats.failureRate === 'number'
      ? `${Math.round(stats.failureRate * 100)}%`
      : '—';
  const rateSubtext = (stats: any): string => {
    if (!stats) return isAr ? 'بانتظار أول فحص' : 'awaiting first check';
    const asOf = statusAsOfMs || tsToMillis(stats.checkedAt);
    const asOfStr = asOf ? new Date(asOf).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US') : '';
    const runs = isAr ? `آخر ${stats.total} تشغيلة` : `last ${stats.total} runs`;
    return asOfStr ? `${runs} · ${isAr ? 'حتى' : 'as of'} ${asOfStr}` : runs;
  };
  // ─────────────────────────────────────────────────────────────────────────

  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    const isStrictAdmin = isAdminUser(currentUser);
    if (!isStrictAdmin) {
      setSubscriptionRequests([]);
      return;
    }
    const unsub = onSnapshot(collection(db, 'subscriptionRequests'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubscriptionRequests(list.filter((r: any) => r.subscriptionStatus === 'pending' || r.status === 'pending'));
    }, (err) => {
      console.warn("Firestore subscriptionRequests query failed with permission or other error:", err);
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    const isStrictAdmin = isAdminUser(currentUser);
    if (!isStrictAdmin) {
      setPendingWithdrawals([]);
      setHistoryWithdrawals([]);
      return;
    }

    const qPending = query(
      collection(db, 'withdrawals'),
      where('status', '==', 'pending_review'),
      limit(100)
    );

    const unsubPending = onSnapshot(qPending, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPendingWithdrawals(list);
    }, (err) => {
      console.warn("Firestore pending withdrawals query failed with permission or other error:", err);
    });

    const qHistory = query(
      collection(db, 'withdrawals'),
      where('status', 'in', ['completed', 'rejected']),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubHistory = onSnapshot(qHistory, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistoryWithdrawals(list);
    }, (err) => {
      console.warn("Firestore history withdrawals query failed with permission or other error:", err);
    });

    return () => {
      unsubPending();
      unsubHistory();
    };
  }, [currentUser]);

  // Wave 1 S3 — grants are SERVER-ONLY. The approveSubscription callable is
  // the sole writer of the user subscription fields (rules block all client
  // writes, this admin dashboard included). It re-derives the duration from
  // the request's verified amount / canonical tier and logs the conversion.
  const approveSubscription = async (request: any) => {
    try {
      const approveCallable = await getCallableFunction<
        { reqId: string },
        { success: boolean; alreadyApproved?: boolean; tier?: string; durationDays?: number }
      >('approveSubscription');
      await approveCallable({ reqId: request.id });

      alert(isAr
        ? `🎉 تم تفعيل اشتراك المستخدم (${request.userName || request.userEmail || 'المشترك'}) بنجاح!` 
        : `🎉 User subscription (${request.userName || request.userEmail || 'Subscriber'}) has been activated successfully!`
      );
    } catch (err: any) {
      console.error("Error approving subscription:", err);
      alert(isAr 
        ? `❌ فشل تفعيل الاشتراك: ${err.message || String(err)}` 
        : `❌ Failed to activate subscription: ${err.message || String(err)}`
      );
    }
  };

  // Direct (comped) activation — also server-only via the same callable
  // (defaults to the 30-day monthly tier; duration comes from the canonical
  // tier table on the server).
  const approveUserDirect = async (user: any) => {
    try {
      const approveCallable = await getCallableFunction<
        { userId: string },
        { success: boolean }
      >('approveSubscription');
      await approveCallable({ userId: user.id });

      alert(isAr
        ? `🎉 تم التفعيل الفوري لحساب العضو (${user.name || user.email}) بنجاح!` 
        : `🎉 Direct VIP status has been granted to user (${user.name || user.email}) successfully!`
      );
    } catch (err: any) {
      console.error("Error direct approving user:", err);
      alert(isAr 
        ? `❌ فشل التفعيل المباشر: ${err.message || String(err)}` 
        : `❌ Failed to directly approve user: ${err.message || String(err)}`
      );
    }
  };

  // Wave 1 S3 — the user subscription fields are locked to the server, so the
  // downgrade goes through the admin-only rejectSubscription callable.
  const rejectUserDirect = async (user: any) => {
    try {
      const rejectCallable = await getCallableFunction<
        { userId: string },
        { success: boolean }
      >('rejectSubscription');
      await rejectCallable({ userId: user.id });

      alert(isAr
        ? `⚠️ تم رفض تفعيل العضو (${user.name || user.email}).` 
        : `⚠️ User (${user.name || user.email}) activation has been rejected.`
      );
    } catch (err: any) {
      console.error("Error rejecting user:", err);
      alert(isAr 
        ? `❌ فشل رفض التفعيل: ${err.message || String(err)}` 
        : `❌ Failed to reject user activation: ${err.message || String(err)}`
      );
    }
  };

  // Wave 1 S3 — server-side reject: marks the request rejected and downgrades
  // the user ONLY if they are still pending (rejecting a duplicate/stale
  // request never wipes an already-active membership — enforced in the
  // rejectSubscription Cloud Function).
  const rejectSubscription = async (request: any, reason?: string) => {
    try {
      const rejectCallable = await getCallableFunction<
        { reqId: string; reason?: string },
        { success: boolean; userDowngraded?: boolean }
      >('rejectSubscription');
      await rejectCallable({ reqId: request.id, ...(reason ? { reason } : {}) });

      alert(isAr
        ? `⚠️ تم رفض طلب الاشتراك للعضو (${request.userName || request.userEmail}) بنجاح.` 
        : `⚠️ Subscription request for (${request.userName || request.userEmail}) has been rejected.`
      );
    } catch (err: any) {
      console.error("Error rejecting subscription:", err);
      alert(isAr 
        ? `❌ فشل رفض الطلب: ${err.message || String(err)}` 
        : `❌ Failed to reject subscription: ${err.message || String(err)}`
      );
    }
  };

  // Slice B — order-payment verification is SERVER-ONLY (rules deny client
  // writes to paymentVerified*); both actions go through the admin-only
  // verifyOrderPayment callable.
  const handleVerifyOrderPayment = async (orderId: string) => {
    try {
      const verifyCallable = await getCallableFunction<
        { orderId: string; action: 'verify' | 'reject'; reason?: string },
        { success: boolean; alreadyVerified?: boolean }
      >('verifyOrderPayment');
      await verifyCallable({ orderId, action: 'verify' });

      alert(isAr
        ? '✅ تم تأكيد استلام الدفعة وتوثيقها على الطلب.'
        : '✅ Payment marked verified on the order.'
      );
    } catch (err: any) {
      console.error('Error verifying order payment:', err);
      alert(isAr
        ? `❌ فشل تأكيد الدفع: ${err.message || String(err)}`
        : `❌ Failed to verify payment: ${err.message || String(err)}`
      );
    }
  };

  const handleRejectOrderPayment = async (orderId: string, reason: string) => {
    try {
      const verifyCallable = await getCallableFunction<
        { orderId: string; action: 'verify' | 'reject'; reason?: string },
        { success: boolean }
      >('verifyOrderPayment');
      await verifyCallable({ orderId, action: 'reject', reason });

      alert(isAr
        ? '⚠️ تم رفض إثبات الدفع وإرجاع الطلب إلى انتظار الدفع.'
        : '⚠️ Payment proof rejected — order returned to waiting for payment.'
      );
    } catch (err: any) {
      console.error('Error rejecting order payment:', err);
      alert(isAr
        ? `❌ فشل رفض إثبات الدفع: ${err.message || String(err)}`
        : `❌ Failed to reject payment proof: ${err.message || String(err)}`
      );
    }
  };

  const handleSendFulfillmentNudge = async (orderId: string, kind: 'ship' | 'confirm_delivery') => {
    try {
      const nudgeCallable = await getCallableFunction<
        { orderId: string; kind: 'ship' | 'confirm_delivery' },
        { success: boolean; targetUserName?: string }
      >('sendFulfillmentNudge');
      await nudgeCallable({ orderId, kind });
      alert(isAr ? '✅ تم إرسال التذكير.' : '✅ Nudge sent.');
    } catch (err: any) {
      console.error('Error sending fulfillment nudge:', err);
      alert(isAr ? `❌ فشل إرسال التذكير: ${err.message || String(err)}` : `❌ Failed to send nudge: ${err.message || String(err)}`);
    }
  };

  const handleFulfillmentReleaseEscrow = async (orderId: string) => {
    try {
      const releaseCallable = await getCallableFunction<
        { orderId: string; action: 'admin_release' },
        { success: boolean; message?: string }
      >('releaseOrderEscrow');
      await releaseCallable({ orderId, action: 'admin_release' });
      alert(isAr ? '✅ تم تحرير المبلغ.' : '✅ Escrow released.');
    } catch (err: any) {
      console.error('Error releasing escrow:', err);
      alert(isAr ? `❌ فشل تحرير المبلغ: ${err.message || String(err)}` : `❌ Failed to release escrow: ${err.message || String(err)}`);
    }
  };

  const handleResolveDispute = async (orderId: string, resolutionType: 'release' | 'refund' | 'resume', notes: string) => {
    const order = realOrders.find((o: any) => o.id === orderId);
    if (!order) {
      alert(isAr ? 'تعذر العثور على الطلب.' : 'Order not found.');
      return;
    }
    try {
      // 1. The REAL resolution — untouched, existing engine (money moves here).
      await executeOrderTransition(order, 'resolve_dispute', currentUser, { resolutionType });
      // 2. ONLY on success: record the admin's note. A failure here must never
      // read as if the resolution itself failed — it already succeeded.
      try {
        const stampCallable = await getCallableFunction<
          { orderId: string; resolutionType: 'release' | 'refund' | 'resume'; notes: string },
          { success: boolean }
        >('stampDisputeResolution');
        await stampCallable({ orderId, resolutionType, notes });
      } catch (stampErr: any) {
        console.warn('[handleResolveDispute] resolution succeeded but the note failed to save:', stampErr);
        alert(isAr
          ? '✅ تم الحل، لكن تعذر حفظ الملاحظة.'
          : '✅ Resolved, but the note could not be saved.'
        );
        return;
      }
      alert(isAr ? '✅ تم حل النزاع بنجاح.' : '✅ Dispute resolved successfully.');
    } catch (err: any) {
      console.error('Error resolving dispute:', err);
      alert(isAr ? `❌ فشل حل النزاع: ${err.message || String(err)}` : `❌ Failed to resolve dispute: ${err.message || String(err)}`);
      throw err;
    }
  };

  const pendingCliQDrops = escrows.filter(e => e.status === 'locked' && e.auctionId === 'cliq-dep');
  // Approval queue: every under-review listing ('processing' + legacy 'pending'), newest first.
  const pendingListingDrops = auctions
    .filter((a: any) => a.status === 'processing' || a.status === 'pending')
    .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
  
  const pendingByUsersOnly = users.filter((u: any) => {
    const isPending = u.subscriptionStatus === 'pending';
    const hasRequest = subscriptionRequests.some((r: any) => r.userId === u.id);
    return isPending && !hasRequest;
  });
  
  // Computations (Wave 3: from realAuctions — sim lots never inflate metrics)
  const activeAuctionsNum = realAuctions.filter(a => a.status === 'live').length;
  const totalEscrowHeld = escrows
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  if (adminSelectedOrderId) {
    return (
      <div 
        className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-gray-50/50 p-4 md:p-6 overscroll-contain select-none font-sans text-gray-800"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="admin-order-details-pane"
      >
        <div className="max-w-4xl mx-auto w-full">
          <OrderDetailsView orderId={adminSelectedOrderId} onBack={() => setAdminSelectedOrderId(null)} />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-gray-50/50 pb-[calc(6rem+env(safe-area-inset-bottom))] overscroll-contain select-none font-sans text-gray-800 animate-fadeIn"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="admin-dashboard-root"
    >
      
      {/* Top Header - Streamlined & Elegant */}
      <div className="p-5 flex items-center justify-between border-b border-gray-100 bg-white sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E85D04]/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#E85D04]" />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900 leading-none">
              {isAr ? 'لوحة التحكم والإشراف' : 'Control & Administration Panel'}
            </h2>
            <p className="text-[10px] text-gray-400 mt-1">
              {isAr ? 'إدارة المزادات، الحسابات، الدفعات والضمان' : 'Manage live auctions, accounts, payouts, and escrow'}
            </p>
          </div>
        </div>
        <span className="text-[10px] bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
          {isAr ? 'حساب مدير النظام' : 'SYSTEM ADMIN'}
        </span>
      </div>

      {/* Navigation Submenu - Premium Tab Buttons */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        {(() => {
          const pendingPayoutsCount = allWithdrawals.filter((w: any) => w.status === 'pending_review').length;
          const badgeFor = (tab: AdminTabId): number | null => {
            if (tab === 'verify') return subscriptionRequests.length + pendingOrderPaymentsCount;
            if (tab === 'fulfillment') return overdueFulfillmentCount;
            if (tab === 'disputes') return openDisputesCount;
            if (tab === 'payouts') return pendingPayoutsCount;
            return null;
          };
          const renderTab = (tab: AdminTabId) => {
            const isActive = activeTab === tab;
            const badge = badgeFor(tab);
            return (
              <button
                key={tab}
                onClick={() => selectTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span>{isAr ? TAB_META[tab].ar : TAB_META[tab].en}</span>
                {badge !== null && badge > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 animate-pulse">
                    {badge}
                  </span>
                )}
              </button>
            );
          };
          return (
            <>
              {ADMIN_PRIMARY_TABS.map(renderTab)}
              <span className="mx-1 h-5 w-px bg-gray-200 shrink-0" />
              {ADMIN_REFERENCE_TABS.map(renderTab)}
            </>
          );
        })()}
      </div>

       {/* Main Content Area */}
      <div className="p-5 max-w-5xl mx-auto w-full space-y-5">

        {/* ==========================================
            TAB: HOME (needs-attention landing)
            ========================================== */}
        {activeTab === 'home' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <AdminHome
              isAr={isAr}
              counts={{
                pendingVerify: subscriptionRequests.length + pendingOrderPaymentsCount,
                overdueFulfillment: overdueFulfillmentCount,
                openDisputes: openDisputesCount,
                pendingPayouts: allWithdrawals.filter((w: any) => w.status === 'pending_review').length,
                pendingListings: pendingListingDrops.length,
              }}
              metrics={{
                escrowHeld: totalEscrowHeld,
                liveAuctions: activeAuctionsNum,
                members: usersTotalCount ?? users.length,
              }}
              onSelectTab={selectTab}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: VERIFY & APPROVE (Slice B — daily money job)
            ========================================== */}
        {activeTab === 'verify' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <VerifyApproveSection
              isAr={isAr}
              subscriptionRequests={subscriptionRequests}
              orders={realOrders}
              onApproveSubscription={approveSubscription}
              onRejectSubscription={rejectSubscription}
              onVerifyOrderPayment={handleVerifyOrderPayment}
              onRejectOrderPayment={handleRejectOrderPayment}
              isLoading={isLoading}
              cliqDrops={pendingCliQDrops}
              onReleaseCliq={releaseEscrow}
              onRefundCliq={refundEscrow}
              isRealUrl={isRealUrl}
              getReceiptImageSrc={getReceiptImageSrc}
              onViewReceipt={setViewReceiptUrl}
              pendingByUsersOnly={pendingByUsersOnly}
              onApproveUserDirect={approveUserDirect}
              onRejectUserDirect={rejectUserDirect}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: FULFILLMENT (Slice C — keep orders moving)
            ========================================== */}
        {activeTab === 'fulfillment' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <FulfillmentSection
              isAr={isAr}
              orders={realOrders}
              onNudge={handleSendFulfillmentNudge}
              onReleaseEscrow={handleFulfillmentReleaseEscrow}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: DISPUTES (Slice D — resolve stuck orders)
            ========================================== */}
        {activeTab === 'disputes' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <DisputesSection
              isAr={isAr}
              orders={realOrders}
              onResolve={handleResolveDispute}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: ORDERS MANAGEMENT
            ========================================== */}
        {activeTab === 'orders' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <OrdersLedgerSection
              isAr={isAr}
              orders={orders}
              filteredOrders={filteredOrders}
              realOrders={realOrders}
              simOrdersCount={simOrdersCount}
              adminOrderFilter={adminOrderFilter}
              onFilterChange={setAdminOrderFilter}
              onOpenOrder={setAdminSelectedOrderId}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: LISTINGS (Lots approval and deletion)
            ========================================== */}
        {activeTab === 'launch' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <LaunchSection
              isAr={isAr}
              isLoading={isLoading}
              pendingListingDrops={pendingListingDrops}
              auctions={auctions}
              orders={orders}
              users={users}
              rejectingId={rejectingId}
              setRejectingId={setRejectingId}
              rejectionReason={rejectionReason}
              setRejectionReason={setRejectionReason}
              onApproveListing={approveListing}
              onRejectListing={rejectListing}
              onRepairOrder={repairEndedAuctionOrder}
              onRepairEscrow={repairStuckEscrowsForEndedAuction}
              onDeleteAuction={deleteAuction}
              onSetViewing={setAuctionViewing}
              onCreateDrop={() => setActiveView('auction-drop-builder')}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: USERS (Account Security Moderation)
            ========================================== */}
        {activeTab === 'members' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <MembersSection
              isAr={isAr}
              isLoading={isLoading}
              users={users}
              onVerifySeller={verifySeller}
              onBan={banUser}
              onUnban={unbanUser}
              currentUserId={currentUser?.id}
              currentUserEmail={currentUser?.email}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: WITHDRAWALS (Sellers Withdrawal requests)
            ========================================== */}
        {activeTab === 'payouts' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <PayoutsSection
              isAr={isAr}
              isLoading={isLoading}
              withdrawals={allWithdrawals}
              rejectingId={rejectingId}
              setRejectingId={setRejectingId}
              rejectionReason={rejectionReason}
              setRejectionReason={setRejectionReason}
              onApprove={approveWithdrawal}
              onReject={rejectWithdrawal}
            />
          </React.Suspense>
        )}

        {/* ==========================================
            TAB: SYSTEM (Operations + Monitoring + quarantined Developer tools)
            ========================================== */}
        {activeTab === 'system' && (
          <React.Suspense
            fallback={
              <div className="bg-white p-5 rounded-3xl border border-gray-200 text-xs text-gray-400 font-semibold">
                {isAr ? 'جاري التحميل…' : 'Loading…'}
              </div>
            }
          >
            <SystemSection
              isAr={isAr}
              currentUser={currentUser}
              maintenanceMode={maintenanceMode}
              featureFlags={featureFlags}
              updateMaintenanceMode={updateMaintenanceMode}
              updateFeatureFlag={updateFeatureFlag}
              systemHealthLogs={systemHealthLogs}
              logSystemHealth={logSystemHealth}
              stuckAuctions={stuckAuctions}
              stuckOrders={stuckOrders}
              settlementFresh={settlementFresh}
              n8nBot={n8nBot}
              n8nNotif={n8nNotif}
              rateValue={rateValue}
              rateSeverity={rateSeverity}
              rateSubtext={rateSubtext}
              users={users}
              resetOnboarding={resetOnboarding}
              setBids={setBids}
            />
          </React.Suspense>
        )}

      </div>

      {/* Full Preview Dialog for Receipts */}
      {viewReceiptUrl && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setViewReceiptUrl(null)}
        >
          <div className="relative max-w-lg w-full bg-white rounded-3xl p-3 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <img 
              src={viewReceiptUrl} 
              alt="Receipt Full Preview" 
              className="w-full max-h-[70vh] object-contain rounded-2xl"
            />
            <div className="mt-3.5 flex justify-between items-center px-1">
              <span className="text-[10px] text-gray-400 font-mono uppercase">{isAr ? 'إثبات تحويل كليك' : 'CliQ Transfer Proof'}</span>
              <button 
                onClick={() => setViewReceiptUrl(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl px-4 py-2 text-xs font-black uppercase transition-all"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
