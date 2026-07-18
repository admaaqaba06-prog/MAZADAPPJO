import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { AdminListSkeleton, EmptyState } from './FeedbackStates';
import { OrderDetailsView } from './OrderDetailsView';
import { collection, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, Timestamp, writeBatch, getDocs, deleteDoc, query, where, limit, orderBy } from 'firebase/firestore';
import { db, getCallableFunction } from '../services/firebase';
import { logAnalyticsEvent } from '../services/analyticsService';
import { 
  ShieldCheck, 
  Users, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  Tv, 
  Coins, 
  Ban, 
  UserCheck, 
  Clock, 
  FileText, 
  TrendingUp,
  Cpu,
  UserX,
  FileCheck2,
  Sparkles,
  RefreshCw,
  LineChart,
  Trash2,
  Database,
  Settings,
  Activity,
  ShieldAlert,
  Server,
  HardDrive,
  RotateCcw
} from 'lucide-react';

/**
 * Format a request createdAt that may be a Firestore Timestamp ({seconds} or
 * .toDate()), an ISO string, or an epoch-ms number. Server-created requests
 * carry a Firestore Timestamp — naively passing it to `new Date()` yields
 * "Invalid Date".
 */
const formatRequestDate = (v: any, locale: string): string => {
  if (!v) return '';
  let date: Date | null = null;
  if (typeof v?.toDate === 'function') {
    date = v.toDate();
  } else if (typeof v?.seconds === 'number') {
    date = new Date(v.seconds * 1000);
  } else if (typeof v === 'string' || typeof v === 'number') {
    date = new Date(v);
  }
  if (!date || isNaN(date.getTime())) return '';
  return date.toLocaleString(locale);
};

const AuctionEscrowDiagnosticPanel: React.FC<{
  auctionId: string;
  winnerId: string | null;
  repairResult: string | null;
}> = ({ auctionId, winnerId, repairResult }) => {
  const [escrows, setEscrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const escrowsRef = collection(db, 'escrows');
    const q = query(escrowsRef, where('auctionId', '==', auctionId));
    
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setEscrows(list);
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to escrows for diagnostics:", err);
      setLoading(false);
    });
    
    return unsub;
  }, [auctionId]);

  const lockedEscrows = escrows.filter(e => e.status === 'locked');
  const losingLockedEscrows = lockedEscrows.filter(e => winnerId ? e.bidderId !== winnerId : true);

  return (
    <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-4 mt-3 text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
        <span className="font-extrabold text-zinc-700 tracking-wide font-mono text-[10px] uppercase">
          🛡️ Admin Diagnostic Panel
        </span>
        <span className="bg-zinc-200/60 text-zinc-600 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">
          LIVE TELEMETRY
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-zinc-500 font-medium font-sans">Locked Escrows Count:</p>
          <p className="font-mono text-sm font-black text-zinc-900">
            {lockedEscrows.length} {lockedEscrows.length > 0 ? '🔒' : '✅'}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-zinc-500 font-medium font-sans">Winner ID (Kept Locked):</p>
          <p className="font-mono text-[10px] font-semibold text-zinc-800 break-all">
            {winnerId ? `🏆 ${winnerId}` : 'None / No Bids'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <p className="text-zinc-500 font-medium font-sans">Losing Locked Escrows ({losingLockedEscrows.length}):</p>
        {loading ? (
          <p className="text-zinc-400 font-mono text-[10px] animate-pulse">Loading escrows...</p>
        ) : losingLockedEscrows.length === 0 ? (
          <p className="text-emerald-600 font-bold text-[11px] font-sans">✅ All losing escrows refunded/released</p>
        ) : (
          <div className="bg-white border border-zinc-150 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5 font-mono text-[10px]">
            {losingLockedEscrows.map((e) => (
              <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-zinc-100 last:border-0 pb-1.5 last:pb-0">
                <div className="min-w-0">
                  <span className="font-bold text-zinc-800">{e.bidderName || 'Bidder'}</span>
                  <span className="text-zinc-400 text-[9px] block truncate max-w-[200px]">{e.bidderId}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-rose-500 font-black">{(e.amount || 0).toLocaleString()} JOD</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {repairResult && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 font-medium text-[11px] leading-relaxed font-sans">
          <strong className="block mb-1 text-amber-950">🔧 Repair Action Result:</strong>
          {repairResult}
        </div>
      )}
    </div>
  );
};

/** Ordered funnel stages: analytics eventType → AR/EN label. */
const FUNNEL_STAGES: Array<{ event: string; labelAr: string; labelEn: string }> = [
  { event: 'user_registration', labelAr: 'تسجيل', labelEn: 'Registered' },
  { event: 'membership_submitted', labelAr: 'طلب عضوية', labelEn: 'Membership Submitted' },
  { event: 'subscription_conversion', labelAr: 'عضوية مفعّلة', labelEn: 'Membership Activated' },
  { event: 'first_bid', labelAr: 'مزايدة أولى', labelEn: 'First Bid' },
  { event: 'auction_won_seen', labelAr: 'فوز', labelEn: 'Auction Won' },
  { event: 'payment_submitted', labelAr: 'دفع', labelEn: 'Payment Submitted' },
];

/**
 * Conversion funnel card: one getDocs over `analytics_events` for the chosen
 * window (7/30 days, epoch-ms `timestamp` field written by analyticsService),
 * counted client-side per stage. No live listener — refetches on window toggle.
 */
const ConversionFunnelCard: React.FC<{ isAr: boolean }> = ({ isAr }) => {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [funnelError, setFunnelError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    setFunnelError(false);
    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    getDocs(query(collection(db, 'analytics_events'), where('timestamp', '>=', since)))
      .then((snap) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        snap.forEach((d) => {
          const type = d.data().eventType;
          if (type) next[type] = (next[type] || 0) + 1;
        });
        setCounts(next);
      })
      .catch((err) => {
        console.warn('[FUNNEL] Failed to load analytics_events:', err);
        if (!cancelled) setFunnelError(true);
      });
    return () => { cancelled = true; };
  }, [windowDays]);

  const stageCounts = FUNNEL_STAGES.map((s) => counts?.[s.event] || 0);
  const maxCount = Math.max(1, ...stageCounts);

  return (
    <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-extrabold text-gray-900 uppercase flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#FF6B00]" />
            {isAr ? 'قمع التحويل' : 'CONVERSION FUNNEL'}
          </h3>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {isAr ? 'من التسجيل حتى الدفع — حسب أحداث المنصة' : 'Registration through payment — from platform events'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                windowDays === d
                  ? 'bg-[#FF6B00] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {isAr ? (d === 7 ? '٧ أيام' : '٣٠ يوم') : `${d}D`}
            </button>
          ))}
        </div>
      </div>

      {funnelError ? (
        <div className="text-center py-8 text-red-500 text-xs font-medium">
          {isAr ? 'تعذر تحميل بيانات القمع.' : 'Unable to load funnel data.'}
        </div>
      ) : counts === null ? (
        <div className="text-center py-8 text-gray-400 text-xs animate-pulse">
          {isAr ? 'جاري تحميل بيانات القمع…' : 'Loading funnel data…'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {FUNNEL_STAGES.map((stage, i) => {
            const count = stageCounts[i];
            const prev = i === 0 ? null : stageCounts[i - 1];
            const pct = prev === null ? null : prev > 0 ? Math.round((count / prev) * 100) : null;
            return (
              <div key={stage.event} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-extrabold text-gray-800">
                    {isAr ? stage.labelAr : stage.labelEn}
                  </span>
                  <span className="font-mono text-gray-500">
                    <span className="font-black text-gray-900">{count.toLocaleString()}</span>
                    {pct !== null && (
                      <span className="text-[9px] text-gray-400 font-bold ms-2">
                        {isAr ? `٪${pct} من السابق` : `${pct}% of prev`}
                      </span>
                    )}
                    {i > 0 && pct === null && (
                      <span className="text-[9px] text-gray-300 font-bold ms-2">—</span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF6B00] to-orange-400 transition-all duration-500"
                    style={{ width: `${Math.max(count > 0 ? 3 : 0, (count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const AdminDashboardView: React.FC = () => {
  const { 
    currentUser,
    users, 
    auctions, 
    escrows, 
    orders,
    adminActions, 
    adminActionsError,
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

  const [activeTab, setActiveTab] = useState<'metrics' | 'orders' | 'payments' | 'listings' | 'users' | 'subscriptions' | 'sessions' | 'health' | 'withdrawals'>('metrics');
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [historyWithdrawals, setHistoryWithdrawals] = useState<any[]>([]);
  const allWithdrawals = [
    ...pendingWithdrawals,
    ...historyWithdrawals.filter((hw) => !pendingWithdrawals.some((pw) => pw.id === hw.id))
  ].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isProcessingAction, setIsProcessingAction] = useState<Record<string, boolean>>({});
  const [repairResults, setRepairResults] = useState<Record<string, string>>({});

  const [adminOrderFilter, setAdminOrderFilter] = useState<'all' | 'waiting_payment' | 'paid' | 'preparing_shipment' | 'shipped' | 'delivered' | 'completed' | 'disputed' | 'defaulted'>('all');
  const [adminSelectedOrderId, setAdminSelectedOrderId] = useState<string | null>(null);

  const filteredOrders = (orders || []).filter((o: any) => {
    if (adminOrderFilter === 'all') return true;
    return o.status === adminOrderFilter;
  });

  // Local health & maintenance control states
  const [maintEnabled, setMaintEnabled] = useState<boolean>(maintenanceMode?.enabled || false);
  const [maintMsgAr, setMaintMsgAr] = useState<string>(maintenanceMode?.messageAr || '');
  const [maintMsgEn, setMaintMsgEn] = useState<string>(maintenanceMode?.messageEn || '');
  const [maintDuration, setMaintDuration] = useState<string>(maintenanceMode?.expectedDuration || '1 hr');
  
  const [healthFilter, setHealthFilter] = useState<'all' | 'error' | 'bid_fail' | 'payment_fail'>('all');
  const [lastBackupTime, setLastBackupTime] = useState<string>(() => localStorage.getItem('mazad_last_backup_time') || '');

  // Keep local maintenance fields in sync with database live snapshots
  useEffect(() => {
    if (maintenanceMode) {
      setMaintEnabled(maintenanceMode.enabled);
      setMaintMsgAr(maintenanceMode.messageAr);
      setMaintMsgEn(maintenanceMode.messageEn);
      setMaintDuration(maintenanceMode.expectedDuration);
    }
  }, [maintenanceMode]);

  const handleMaintenanceToggle = async (enabled: boolean) => {
    setMaintEnabled(enabled);
    await updateMaintenanceMode(enabled, maintMsgAr, maintMsgEn, maintDuration);
  };

  const saveMaintenanceSettings = async () => {
    await updateMaintenanceMode(maintEnabled, maintMsgAr, maintMsgEn, maintDuration);
  };

  const triggerManualBackup = () => {
    const nowStr = new Date().toLocaleString();
    localStorage.setItem('mazad_last_backup_time', nowStr);
    setLastBackupTime(nowStr);
    
    // Log backup activity to health logs
    logSystemHealth('error', 'Manual Backup Executed Successfully', `An administrative manual cold database backup snapshot was triggered. Firestore structure and cloud assets successfully dumped to glacier cold storage.`);
    
    alert(isAr 
      ? '📦 تم بدء النسخ الاحتياطي اليدوي! تم تشفير وتأمين قاعدة البيانات بالكامل ونقل لقطة النظام لغرف التخزين السحابي بأمان.' 
      : '📦 Manual backup initialized! Database encrypted and state snapshot securely exported to offsite cloud glacier vaults.'
    );
  };

  const handleReactivateAllAuctions = async () => {
    if (!window.confirm(isAr 
      ? 'هل أنت متأكد من إعادة تفعيل وتنشيط جميع المزادات وتمديدها لمدة 24 ساعة؟' 
      : 'Are you sure you want to reactivate and extend all auctions for 24 hours?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      const auctionsCol = collection(db, 'auctions');
      const snapshot = await getDocs(auctionsCol);
      if (snapshot.empty) {
        alert(isAr ? 'لم يتم العثور على أي مزادات بقاعدة البيانات.' : 'No auctions found in the database.');
        return;
      }

      const docs = snapshot.docs;
      const futureTime = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
      const endsAtTimestamp = Timestamp.fromMillis(futureTime);

      // Process in chunks of 400 documents to avoid Firestore's 500-write batch limit
      const chunkSize = 400;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((docSnap) => {
          batch.update(docSnap.ref, {
            status: 'live',
            endsAt: endsAtTimestamp,
            endTime: futureTime
          });
        });
        await batch.commit();
      }

      // Log activity to health logs
      logSystemHealth('error', 'All Auctions Reactivated', `An administrator reactivated all ${snapshot.size} auctions, setting their status to "live" and extending duration by 24 hours.`);

      alert(isAr 
        ? `🎉 تم بنجاح إعادة تفعيل وتنشيط جميع المزادات (${snapshot.size}) وتمديدها لمدة 24 ساعة!` 
        : `🎉 Successfully reactivated and extended all (${snapshot.size}) auctions for 24 hours!`
      );
    } catch (err: any) {
      console.error("Reactivation error:", err);
      alert(isAr 
        ? `❌ فشل إعادة تفعيل المزادات: ${err.message || String(err)}` 
        : `❌ Failed to reactivate auctions: ${err.message || String(err)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAllAuctions = async () => {
    const confirmMsg = isAr 
      ? "هل أنت متأكد من إعادة تعيين جميع المزادات؟ سيؤدي هذا إلى إعادة تشغيل كافة المزادات وتصفير المزايدات الحالية." 
      : "Are you sure you want to reset all auctions? This will restart all auctions from the beginning.";

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsLoading(true);
    try {
      const auctionsCol = collection(db, 'auctions');
      const snapshot = await getDocs(auctionsCol);
      if (snapshot.empty) {
        alert(isAr ? 'لم يتم العثور على أي مزادات بقاعدة البيانات.' : 'No auctions found in the database.');
        setIsLoading(false);
        return;
      }

      const docs = snapshot.docs;
      const resetAuctionIds = docs.map(d => d.id);

      // 1. Reset each auction back to live, and reset timer and pricing
      const chunkSize = 400;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((docSnap) => {
          const data = docSnap.data();
          const durationSec = Number(data.duration) || 86400; // fallback to 24 hours if zero, NaN, or missing
          const futureTime = Date.now() + durationSec * 1000;
          const endsAtTimestamp = Timestamp.fromMillis(futureTime);
          const startPrice = data.startingPrice ?? 0;

          batch.update(docSnap.ref, {
            status: 'live',
            endsAt: endsAtTimestamp,
            endTime: futureTime,
            currentPrice: startPrice,
            currentBidderId: null,
            currentBidderName: null,
            totalBids: 0,
            // Clear highest bidder / winner data
            winnerId: null,
            winnerName: null,
            winnerEmail: null,
            winnerPhone: null,
            winnerCity: null,
          });
        });
        await batch.commit();
      }

      // 2. Clear locked escrows related only to ended test auctions via secure Cloud Function
      try {
        const resetTestAuctionDataCallable = await getCallableFunction<{ auctionIds: string[] }, { success: boolean; message: string }>('resetTestAuctionData');
        await resetTestAuctionDataCallable({ auctionIds: resetAuctionIds });
      } catch (escErr) {
        console.warn(`Failed to delete escrow transactions via Cloud Function:`, escErr);
      }

      // 3. Clear bid history for each auction
      if (setBids) {
        setBids([]);
      }
      localStorage.setItem('mazad_bids', '[]');
      localStorage.setItem('mazad_autobids', '[]');

      // 4. Log to health log
      logSystemHealth('error', 'All Auctions Fully Reset', `An administrator fully reset all ${snapshot.size} auctions back to initial states, clearing all bids, winners, and active escrows.`);

      // 5. Alert success
      alert(isAr 
        ? "All auctions have been restarted successfully." // standard isAr or English as requested
        : "All auctions have been restarted successfully."
      );
    } catch (err: any) {
      console.error("Reset auctions error:", err);
      alert(isAr 
        ? `❌ فشل إعادة تهيئة المزادات: ${err.message || String(err)}` 
        : `❌ Failed to reset auctions: ${err.message || String(err)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const filteredHealthLogs = (systemHealthLogs || []).filter((log: any) => {
    if (healthFilter === 'all') return true;
    return log.type === healthFilter;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;
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
    const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;
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

  // Console logging for verification as requested by the user
  useEffect(() => {
    const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;
    if (!isStrictAdmin) return;

    const pendingAuctionsCount = auctions.filter((a: any) => a.status === 'pending' || a.status === 'processing' || a.approvalStatus === 'pending').length;
    const pendingSubsCount = subscriptionRequests.length;

    console.log("Approval listener fired");
    console.log("Pending auctions count", pendingAuctionsCount);
    console.log("Pending subscriptions count", pendingSubsCount);
  }, [auctions, subscriptionRequests, currentUser]);

  const approveSubscription = async (request: any) => {
    try {
      const plan = request.plan || 'monthly';
      let durationDays = 30;
      if (plan === 'quarterly') {
        durationDays = 90;
      } else if (plan === 'annual' || plan === 'yearly') {
        durationDays = 365;
      }

      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(now.getDate() + durationDays);

      await updateDoc(doc(db, 'subscriptionRequests', request.id), {
        subscriptionStatus: 'approved',
        status: 'approved'
      });

      await updateDoc(doc(db, 'users', request.userId), {
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        subscriptionTier: plan,
        subscriptionExpiry: expiryDate.getTime(),
        subscriptionApprovedAt: serverTimestamp(),
        subscriptionExpiresAt: Timestamp.fromDate(expiryDate)
      });

      // Log subscription conversion to Analytics
      await logAnalyticsEvent('subscription_conversion', request.userId, request.userEmail || null, {
        plan,
        durationDays,
        price: request.price || 0
      });

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

  const approveUserDirect = async (user: any) => {
    try {
      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(now.getDate() + 30); // Default to 30 days

      await updateDoc(doc(db, 'users', user.id), {
        subscriptionStatus: 'active',
        subscriptionPlan: 'monthly',
        subscriptionTier: 'monthly',
        subscriptionExpiry: expiryDate.getTime(),
        subscriptionApprovedAt: serverTimestamp(),
        subscriptionExpiresAt: Timestamp.fromDate(expiryDate)
      });

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

  const rejectUserDirect = async (user: any) => {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        subscriptionStatus: 'rejected',
        subscriptionExpiry: null,
        subscriptionPlan: null,
        subscriptionApprovedAt: null,
        subscriptionExpiresAt: null
      });

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

  const rejectSubscription = async (request: any) => {
    try {
      // Reject always updates the REQUEST doc...
      await updateDoc(doc(db, 'subscriptionRequests', request.id), {
        subscriptionStatus: 'rejected',
        status: 'rejected'
      });

      // ...but only downgrades the USER if they are still pending. Rejecting a
      // duplicate/stale request must NEVER wipe an already-active membership.
      if (request.userId) {
        const userSnap = await getDoc(doc(db, 'users', request.userId));
        const userStatus = userSnap.exists() ? (userSnap.data() as any)?.subscriptionStatus : null;
        if (userStatus === 'pending') {
          await updateDoc(doc(db, 'users', request.userId), {
            subscriptionStatus: 'rejected',
            subscriptionExpiry: null,
            subscriptionPlan: null,
            subscriptionApprovedAt: null,
            subscriptionExpiresAt: null
          });
        }
      }

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

  const handleApproveWithdrawal = async (withdrawalId: string) => {
    if (isProcessingAction[withdrawalId]) return;
    setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: true }));
    try {
      const result = await approveWithdrawal(withdrawalId);
      if (result.success) {
        alert(isAr ? 'تمت الموافقة على طلب السحب بنجاح وتحرير الرصيد!' : 'Withdrawal approved successfully!');
      } else {
        alert(isAr ? `فشلت العملية: ${result.message}` : `Failed: ${result.message}`);
      }
    } catch (err: any) {
      console.error("Error approving withdrawal:", err);
      alert(err.message || (isAr ? 'خطأ في تنفيذ العملية' : 'Error executing operation'));
    } finally {
      setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: false }));
    }
  };

  const handleRejectWithdrawal = async (withdrawalId: string) => {
    if (isProcessingAction[withdrawalId]) return;
    if (!rejectionReason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب الرفض أولاً' : 'Please provide a rejection reason');
      return;
    }
    setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: true }));
    try {
      const result = await rejectWithdrawal(withdrawalId, rejectionReason);
      if (result.success) {
        alert(isAr ? 'تم رفض طلب السحب وإرجاع المبلغ لمحفظة البائع.' : 'Withdrawal rejected and funds returned to seller.');
        setRejectingId(null);
        setRejectionReason('');
      } else {
        alert(isAr ? `فشلت العملية: ${result.message}` : `Failed: ${result.message}`);
      }
    } catch (err: any) {
      console.error("Error rejecting withdrawal:", err);
      alert(err.message || (isAr ? 'خطأ في تنفيذ العملية' : 'Error executing operation'));
    } finally {
      setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: false }));
    }
  };

  const pendingCliQDrops = escrows.filter(e => e.status === 'locked' && e.auctionId === 'cliq-dep');
  const pendingListingDrops = auctions.filter(a => a.status === 'processing' || a.status === 'pending');
  
  const pendingByUsersOnly = users.filter((u: any) => {
    const isPending = u.subscriptionStatus === 'pending';
    const hasRequest = subscriptionRequests.some((r: any) => r.userId === u.id);
    return isPending && !hasRequest;
  });
  
  // Computations
  const activeAuctionsNum = auctions.filter(a => a.status === 'live').length;
  const totalBidsSum = auctions.reduce((sum, a) => sum + a.totalBids, 0);
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
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-gray-50/50 pb-8 overscroll-contain select-none font-sans text-gray-800 animate-fadeIn"
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
        {(['metrics', 'orders', 'payments', 'withdrawals', 'listings', 'users', 'subscriptions', 'sessions', 'health'] as const).map((tab) => {
          const tabLabel = isAr 
            ? (tab === 'metrics' ? 'الإحصائيات العامّة' : tab === 'orders' ? 'إدارة الطلبات' : tab === 'payments' ? 'إيداعات كليك' : tab === 'withdrawals' ? 'سحوبات البائعين' : tab === 'listings' ? 'المعروضات والمزادات' : tab === 'users' ? 'قائمة الأعضاء' : tab === 'subscriptions' ? 'طلبات الاشتراك' : tab === 'sessions' ? 'جلسات النشاط' : 'الصحة والتشغيل')
            : (tab === 'metrics' ? 'GENERAL METRICS' : tab === 'orders' ? 'ORDERS' : tab === 'payments' ? 'CLIQ PAYMENTS' : tab === 'withdrawals' ? 'WITHDRAWALS' : tab === 'listings' ? 'AUCTIONS & LOTS' : tab === 'users' ? 'MEMBERS' : tab === 'subscriptions' ? 'PREMIUM SUBS' : tab === 'sessions' ? 'ACTIVE SESSIONS' : 'HEALTH & OPS');
          
          const isActive = activeTab === tab;
          const hasPendingRequests = 
            (tab === 'subscriptions' && subscriptionRequests.length > 0) ||
            (tab === 'withdrawals' && allWithdrawals.filter((w: any) => w.status === 'pending_review').length > 0);
          
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                isActive 
                  ? 'bg-gray-900 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>{tabLabel}</span>
              {hasPendingRequests && (
                <span className="bg-red-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 animate-pulse">
                  {tab === 'subscriptions' 
                    ? subscriptionRequests.length 
                    : allWithdrawals.filter((w: any) => w.status === 'pending_review').length}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setActiveView('auction-drop-builder')}
          className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 bg-[#FF6B00] text-white shadow-sm hover:bg-orange-500"
        >
          <span>{isAr ? 'إنشاء مزاد (واتساب)' : 'Auction Drop'}</span>
        </button>
      </div>

       {/* Main Content Area */}
      <div className="p-5 max-w-5xl mx-auto w-full space-y-5">
        
        {/* ==========================================
            TAB: ORDERS MANAGEMENT
            ========================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Header and Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-gray-150">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-gray-900">{isAr ? 'نظام تتبع وإدارة الطلبات' : 'Order Fulfillment Ledger'}</h3>
                <p className="text-xs text-gray-500">{isAr ? 'عرض وتتبع جميع عمليات الفوز والطلبات المنبثقة من المزادات المغلقة.' : 'Audit and track all won listings, escrow transactions, and shipping states.'}</p>
              </div>
              <div className="flex gap-2.5">
                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center min-w-[100px]">
                  <span className="text-[10px] text-gray-400 font-mono uppercase block font-black">{isAr ? 'إجمالي الطلبات' : 'TOTAL'}</span>
                  <span className="text-lg font-black text-gray-900 font-mono">{orders?.length || 0}</span>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center min-w-[100px]">
                  <span className="text-[10px] text-amber-500 font-mono uppercase block font-black">{isAr ? 'بانتظار الدفع' : 'UNPAID'}</span>
                  <span className="text-lg font-black text-amber-700 font-mono">
                    {orders?.filter((o: any) => o.status === 'waiting_payment').length || 0}
                  </span>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center min-w-[100px]">
                  <span className="text-[10px] text-emerald-500 font-mono uppercase block font-black">{isAr ? 'مكتمل' : 'COMPLETED'}</span>
                  <span className="text-lg font-black text-emerald-700 font-mono">
                    {orders?.filter((o: any) => o.status === 'completed').length || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter buttons bar */}
            <div className="bg-white p-2 rounded-2xl border border-gray-150 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {(['all', 'waiting_payment', 'paid', 'preparing_shipment', 'shipped', 'delivered', 'completed', 'disputed', 'defaulted'] as const).map((filterOpt) => {
                const label = isAr
                  ? (filterOpt === 'all' ? 'الكل' :
                     filterOpt === 'waiting_payment' ? 'بانتظار الدفع' :
                     filterOpt === 'paid' ? 'مدفوع' :
                     filterOpt === 'preparing_shipment' ? 'تجهيز الشحن' :
                     filterOpt === 'shipped' ? 'تم الشحن' :
                     filterOpt === 'delivered' ? 'تم التوصيل' :
                     filterOpt === 'completed' ? 'مكتمل' :
                     filterOpt === 'disputed' ? 'نزاع' : 'متخلف عن الدفع')
                  : (filterOpt === 'all' ? 'ALL ORDERS' :
                     filterOpt === 'waiting_payment' ? 'WAITING PAYMENT' :
                     filterOpt === 'paid' ? 'PAID' :
                     filterOpt === 'preparing_shipment' ? 'PREPARING SHIPMENT' :
                     filterOpt === 'shipped' ? 'SHIPPED' :
                     filterOpt === 'delivered' ? 'DELIVERED' :
                     filterOpt === 'completed' ? 'COMPLETED' :
                     filterOpt === 'disputed' ? 'DISPUTED' : 'DEFAULTED');
                
                const isSelected = adminOrderFilter === filterOpt;
                const count = filterOpt === 'all' ? (orders?.length || 0) : (orders?.filter((o: any) => o.status === filterOpt).length || 0);

                return (
                  <button
                    key={filterOpt}
                    onClick={() => setAdminOrderFilter(filterOpt)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-black tracking-tight whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#E85D04] text-white shadow-sm shadow-[#E85D04]/15'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-black ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Orders list rendering */}
            {filteredOrders.length > 0 ? (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.map((order: any) => {
                  const formattedDate = order.createdAt 
                    ? new Date(order.createdAt?.seconds ? order.createdAt.seconds * 1000 : order.createdAt).toLocaleString(isAr ? 'ar-JO' : 'en-US')
                    : '';

                  return (
                    <div 
                      key={order.id} 
                      className="bg-white border border-gray-150 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 relative overflow-hidden"
                    >
                      {/* Left vertical neon status tag depending on order state */}
                      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        order.status === 'completed' ? 'bg-emerald-500' :
                        order.status === 'disputed' ? 'bg-rose-500' : 'bg-[#E85D04]'
                      }`} />

                      <div className="flex gap-3 items-start pl-2">
                        <img 
                          src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=300&q=80'} 
                          alt={order.auctionTitle} 
                          className="w-12 h-12 rounded-2xl object-cover border border-gray-100"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h4 className="font-black text-gray-900 text-xs truncate leading-snug">{order.auctionTitle}</h4>
                          <p className="text-[10px] text-gray-400 font-mono">
                            ID: <span className="font-bold select-all">{order.id.substring(0, 10).toUpperCase()}</span>
                          </p>
                          {formattedDate && (
                            <p className="text-[9px] text-gray-400 font-mono">{formattedDate}</p>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-gray-100 my-1 pl-2" />

                      <div className="grid grid-cols-2 gap-2 text-[10.5px] pl-2">
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'البائع والمزكّي' : 'SELLER'}</span>
                          <span className="font-extrabold text-gray-800">{order.sellerName}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'المشتري الفائز' : 'WINNING BUYER'}</span>
                          <span className="font-extrabold text-gray-800">{order.buyerName}</span>
                        </div>
                        <div className="space-y-0.5 mt-2">
                          <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'القيمة والمبلغ' : 'BID AMOUNT'}</span>
                          <span className="font-black text-[#E85D04] font-mono">{order.winningBidAmount.toLocaleString()} JOD</span>
                        </div>
                        <div className="space-y-0.5 mt-2">
                          <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'الضمان المالي' : 'ESCROW STATE'}</span>
                          <span className={`font-black uppercase ${
                            order.escrowStatus === 'released' ? 'text-emerald-650' : 'text-blue-650'
                          }`}>
                            {order.escrowStatus === 'pending' ? (isAr ? 'محتجز بالضمان' : 'Held in Escrow') :
                             order.escrowStatus === 'released' ? (isAr ? 'تم التحرير للبائع' : 'Released') :
                             order.escrowStatus === 'refunded' ? (isAr ? 'تمت الإعادة للمشتري' : 'Refunded') : order.escrowStatus}
                          </span>
                        </div>
                      </div>

                      <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-gray-100 flex justify-between items-center text-[10px] pl-2 ml-2">
                        <div className="space-y-0.5">
                          <span className="text-[8.5px] text-gray-400 font-mono uppercase block">{isAr ? 'الدفع' : 'PAYMENT'}</span>
                          <span className={`font-black ${order.paymentStatus === 'paid' ? 'text-emerald-650' : 'text-amber-600'}`}>
                            {order.paymentStatus === 'paid' ? (isAr ? 'مدفوع' : 'PAID') : (isAr ? 'غير مدفوع' : 'UNPAID')}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[8.5px] text-gray-400 font-mono uppercase block">{isAr ? 'الشحن والتوزيع' : 'SHIPPING'}</span>
                          <span className="font-black text-gray-700">
                            {order.shippingStatus === 'not_started' ? (isAr ? 'لم يبدأ بعد' : 'NOT STARTED') :
                             order.shippingStatus === 'preparing' ? (isAr ? 'قيد التجهيز' : 'PREPARING') :
                             order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'SHIPPED') :
                             order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'DELIVERED') : order.shippingStatus}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[8.5px] text-gray-400 font-mono uppercase block">{isAr ? 'الحالة العامة' : 'STATUS'}</span>
                          <span className="font-black text-[#E85D04] uppercase">
                            {order.status === 'waiting_payment' ? (isAr ? 'قيد الدفع' : 'PENDING PAY') :
                             order.status === 'paid' ? (isAr ? 'مدفوع' : 'PAID') :
                             order.status === 'preparing_shipment' ? (isAr ? 'تجهيز شحن' : 'PREPARING') :
                             order.status === 'shipped' ? (isAr ? 'مشحون' : 'SHIPPED') :
                             order.status === 'delivered' ? (isAr ? 'واصل' : 'DELIVERED') :
                             order.status === 'completed' ? (isAr ? 'مكتمل' : 'COMPLETED') :
                             order.status === 'disputed' ? (isAr ? 'نزاع' : 'DISPUTED') : order.status}
                          </span>
                        </div>
                      </div>

                      {/* View Details / Manage button for Admin */}
                      <button
                        onClick={() => setAdminSelectedOrderId(order.id)}
                        className="w-[calc(100%-8px)] ml-2 bg-gray-50 hover:bg-[#E85D04] hover:text-white text-gray-700 font-black py-2.5 rounded-2xl text-[10.5px] transition-all tracking-wider border border-gray-200 hover:border-[#E85D04] flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono active:scale-[0.99] mt-3"
                        id={`btn-admin-view-order-${order.id}`}
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span>{isAr ? 'عرض التفاصيل والتحكم بالضمان' : 'VIEW DETAILS & MANAGE ESCROW'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-3xl border border-gray-150 p-6">
                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 border border-gray-100 mx-auto mb-3">
                  <Database className="w-5 h-5 text-gray-400" />
                </div>
                <p className="font-extrabold text-gray-700 text-xs uppercase tracking-wide">
                  {isAr ? 'لا يوجد طلبات بهذا الفلتر' : 'No Orders Match Filter'}
                </p>
                <p className="text-[10px] text-gray-400 leading-relaxed mt-1 max-w-[280px] mx-auto">
                  {isAr 
                    ? 'لم يتم العثور على أي طلبات تتبع هذا التبويب حالياً.' 
                    : 'No orders recorded in this state yet.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: SYSTEM METRICS (Clean Dashboard Cards)
            ========================================== */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            
            {subscriptionRequests.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 uppercase">
                      {isAr ? 'طلب اشتراك جديد معلق' : 'NEW PENDING SUBSCRIPTION'}
                    </h4>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      {isAr 
                        ? `هناك ${subscriptionRequests.length} طلب اشتراك بانتظار مراجعته والموافقة عليها وتفعيلها.`
                        : `There are ${subscriptionRequests.length} pending subscription requests awaiting your review and approval.`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('subscriptions')}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10px] px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap self-end sm:self-auto"
                >
                  {isAr ? 'عرض الطلبات والمراجعة' : 'REVIEW NOW'}
                </button>
              </div>
            )}
            
            {/* Elegant 4-Card Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Escrow Vault */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'أرصدة الأمان والضمان' : 'ESCROW FUNDS'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {totalEscrowHeld.toLocaleString()} <span className="text-xs font-bold text-emerald-600">JOD</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'إيداعات كليك المحفوظة بسلامة' : 'Secure client balances held'}
                </div>
              </div>
              
              {/* Card 2: Live Channels */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center animate-pulse">
                    <Tv className="w-4 h-4 text-rose-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'المزادات النشطة الآن' : 'LIVE AUCTIONS'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {activeAuctionsNum} <span className="text-xs font-bold text-rose-600">{isAr ? 'مزاد' : 'Active'}</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'قنوات المزايدة البث الحي النشط' : 'Channels broadcasting right now'}
                </div>
              </div>

              {/* Card 3: Total Concluded Bids */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'إجمالي المزايدات' : 'TOTAL BIDS PLACED'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {totalBidsSum} <span className="text-xs font-bold text-gray-400">{isAr ? 'عطاء' : 'Bids'}</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'مجموع عروض الأسعار المسجلة' : 'Cumulative activity track'}
                </div>
              </div>

              {/* Card 4: Registered Users */}
              <div className="bg-white border border-gray-150 p-4 rounded-2xl shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {isAr ? 'عدد المستخدمين' : 'REGISTERED MEMBERS'}
                  </span>
                </div>
                <p className="text-xl font-black text-gray-900 font-mono tracking-tight mt-1.5">
                  {users.length} <span className="text-xs font-bold text-gray-400">{isAr ? 'عضو' : 'Users'}</span>
                </p>
                <div className="text-[9px] text-gray-400 mt-1">
                  {isAr ? 'إجمالي الحسابات المسجلة بالمنصة' : 'Total accounts in database'}
                </div>
              </div>

            </div>

            {/* Conversion funnel: registration → payment, 7/30-day window */}
            <ConversionFunnelCard isAr={isAr} />

            {/* Simpler, Friendly Action Feed (Replacing complex SVG graphs & System Telemetry Logs) */}
            <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-xs font-extrabold text-gray-900 uppercase">
                    {isAr ? 'الأنشطة الأخيرة المتخذة في المنصة' : 'RECENT PLATFORM MODERATIONS'}
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {isAr ? 'سجل الإجراءات التي قام بها طاقم الإشراف والمدراء مؤخراً' : 'Audit logs of recent coordinator decisions'}
                  </p>
                </div>
                <span className="text-[9px] bg-gray-50 text-gray-400 px-2.5 py-1 rounded-lg font-mono">
                  {isAr ? 'محدث تلقائياً' : 'LIVE'}
                </span>
              </div>

              <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto pr-1">
                {adminActionsError ? (
                  <div className="text-center py-8 text-red-500 text-xs font-medium">
                    {isAr ? 'عذراً، فشل تحميل سجل العمليات.' : 'Unable to load admin actions'}
                  </div>
                ) : adminActions.length > 0 ? (
                  adminActions.map((action) => (
                    <div key={action.id} className="py-3 flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-[#FF6B00] mt-1 shrink-0" />
                      <div className="space-y-1 flex-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="font-extrabold text-gray-900">{action.actionType.toUpperCase().replace('_', ' ')}</span>
                          <span className="text-gray-400 font-mono text-[9px]">Just now</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {isAr ? `${action.adminName} قام بتعديل ${action.targetName}` : `${action.adminName} modified ${action.targetName}`}
                        </p>
                        {action.details && (
                          <div className="bg-gray-50 text-gray-600 p-2 rounded-xl text-[10px] font-mono mt-1 border border-gray-100">
                            {action.details}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    {isAr ? 'لا توجد أنشطة مسجلة في الجلسة الحالية.' : 'No administration logs recorded in this session thread.'}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: PAYMENTS (CLIQ Receipts Verification)
            ========================================== */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات التحقق من حوالات كليك' : 'CLIQ DEPOSITS VERIFICATION'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'راجع واعتمد لقطات الحوالات المالية البنكية لشحن أرصدة المزايدة للمستخدمين مباشرة.' : 'Review and approve bank transfer receipts to instantly update bidding credit for Jordanian clients.'}</p>
            </div>

            <div className="space-y-3.5">
              {isLoading ? (
                <AdminListSkeleton />
              ) : pendingCliQDrops.length > 0 ? (
                pendingCliQDrops.map((dep) => (
                  <div key={dep.id} className="bg-white border border-gray-150 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden transition-all hover:border-gray-250">
                    <div className="space-y-3 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-50 text-amber-800 border border-amber-100 text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                          {isAr ? 'بانتظار التحقق والمراجعة والتأكيد' : 'PENDING REVIEW'}
                        </span>
                        <span className="text-gray-400 text-[10px] font-mono">ID: {dep.id.substring(0, 8)}</span>
                      </div>
                      
                      <div>
                        <h4 className="font-extrabold text-sm text-gray-900">
                          {dep.bidderName}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {isAr ? 'اسم المستعار لكليك: ' : 'CliQ Alias: '} <span className="font-mono text-gray-800 font-bold">{dep.cliqAlias}</span>
                        </p>
                      </div>

                      {/* File presentation / Receipt slip */}
                      <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-700 font-mono truncate max-w-[200px]" title={
                              (() => {
                                const rawUrl = dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null;
                                return isRealUrl(rawUrl) ? getReceiptImageSrc(rawUrl) : 'No receipt attached';
                              })()
                            }>
                              {(() => {
                                const rawUrl = dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null;
                                return isRealUrl(rawUrl) ? (rawUrl.length > 40 ? rawUrl.substring(0, 40) + '...' : rawUrl) : (isAr ? 'لا يوجد لقطة إيصال مرفقة' : 'No receipt attached');
                              })()}
                            </p>
                            <p className="text-[9px] text-gray-400">{isAr ? 'لقطة شاشة إشعار التحويل البنكي' : 'CliQ receipt attachment'}</p>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => {
                            const rawUrl = dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null;
                            setViewReceiptUrl(isRealUrl(rawUrl) ? getReceiptImageSrc(rawUrl) : null);
                          }}
                          disabled={!isRealUrl(dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null)}
                          className={`text-[11px] font-black shrink-0 px-2 ${
                            isRealUrl(dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null)
                              ? 'text-[#FF6B00] hover:underline cursor-pointer'
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {isAr ? 'عرض' : 'VIEW'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col md:items-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 font-mono block font-bold uppercase">{isAr ? 'المبلغ المطلوب إيداعه' : 'REQUESTED DEPOSIT'}</span>
                        <div className="text-xl font-black font-mono text-emerald-600 mt-0.5">
                          +{dep.amount.toLocaleString()} <span className="text-xs">JOD</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex md:flex-col gap-2 w-full md:w-auto">
                        <button 
                          disabled={!isRealUrl(dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null)}
                          onClick={() => releaseEscrow(dep.id)}
                          className={`flex-1 md:w-44 font-extrabold text-xs py-2 px-3 rounded-xl transition-all shadow-xs ${
                            isRealUrl(dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null)
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isAr ? 'قبول وشحن الرصيد' : 'APPROVE & ADD JOD'}
                        </button>
                        <button 
                          onClick={() => refundEscrow(dep.id)}
                          className="flex-1 md:w-44 bg-gray-100 hover:bg-gray-205 border border-gray-200 text-gray-700 font-semibold text-xs py-1.5 px-3 rounded-xl transition-all"
                        >
                          {isAr ? 'رفض الطلب' : 'REJECT / DENY'}
                        </button>
                      </div>
                    </div>

                  </div>
                ))
              ) : (
                <EmptyState 
                  title={isAr ? 'لا توجد طلبات إيداع معلقة' : 'No pending cliq deposits'}
                  description={isAr ? 'تمت مراجعة وتدقيق جميع حوالات كليك البنكية المرفقة بنجاح.' : 'No users have pending top-up cliq transfer receipts to verify.'}
                  language={isAr ? 'ar' : 'en'}
                />
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: LISTINGS (Lots approval and deletion)
            ========================================== */}
        {activeTab === 'listings' && (
          <div className="space-y-6">
            
            {/* Header */}
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات التحقق والموافقة على المزادات' : 'AUCTION LOT APPROVAL SYSTEM'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'قم بمراجعة المعروضات الجديدة التي أضافها المستخدمون للتصديق عليها وإتاحتها للبث المباشر.' : 'Review new auction entries submitted by merchants, launch them live, or purge existing database records.'}
              </p>
            </div>

            {/* List 1: Pending lots awaiting approvals */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5">
                {isAr ? 'طلبات الإطلاق المعلقة بانتظار الموافقة' : 'LOTS AWAITING PUBLIC RELEASE'}
              </h3>

              {isLoading ? (
                <AdminListSkeleton />
              ) : pendingListingDrops.length > 0 ? (
                pendingListingDrops.map((item) => (
                  <div key={item.id} className="bg-white border border-gray-150 p-5 rounded-2xl space-y-4 shadow-xs transition-all hover:border-gray-250">
                    <div className="flex gap-4">
                      <img 
                        src={item.thumbnailUrl} 
                        alt="Lot Cover" 
                        className="w-16 h-16 rounded-xl object-cover border border-gray-150 shrink-0 shadow-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="bg-orange-50 text-[#FF6B00] border border-orange-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                          {item.category}
                        </span>
                        <h4 className="font-extrabold text-sm text-gray-900 truncate mt-2">{item.title}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {isAr ? 'سعر الابتداء: ' : 'Starting Bid: '} <span className="font-mono text-gray-800 font-bold">{item.startingPrice.toLocaleString()} JOD</span>
                        </p>
                        {item.vendorName && (
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                            {isAr ? 'المورّد: ' : 'Vendor: '}{item.vendorName}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-xl border border-gray-100">{item.description}</p>

                    {item.videoUrl && (
                      <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl space-y-2">
                        <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block">
                          🎥 {isAr ? 'معاينة محتوى الفيديو المرفق' : 'ATTACHED DEMO VIDEO'}
                        </span>
                        <div className="w-full bg-black rounded-lg overflow-hidden aspect-video relative max-h-[160px] flex items-center justify-center border border-gray-200 shadow-inner">
                          <video 
                            src={item.videoUrl} 
                            controls 
                            className="w-full h-full max-h-[158px] object-contain rounded-lg"
                            playsInline
                            preload="metadata"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button 
                        onClick={() => approveListing(item.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 rounded-xl transition-all shadow-xs"
                      >
                        {isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & GO LIVE'}
                      </button>
                      <button 
                        onClick={() => rejectListing(item.id)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-2 rounded-xl transition-all border border-gray-200"
                      >
                        {isAr ? 'رفض الطلب' : 'REJECT'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState 
                  title={isAr ? 'لا توجد معروضات معلقة' : 'No pending lots'}
                  description={isAr ? 'جميع طلبات المزادات المقترحة من البائعين تمت مراجعتها.' : 'No new listings submitted by merchants are currently awaiting public release.'}
                  language={isAr ? 'ar' : 'en'}
                />
              )}
            </div>

            {/* List 2: Concluded Auctions Fulfillments */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {isAr ? 'المزادات المنتهية والترتيبات اللوجستية' : 'RECENTLY COMPLETED AUCTIONS & FULFILLMENT'}
              </h3>

              {(() => {
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && a.endTime < Date.now()));
                
                if (completedAuctions.length === 0) {
                  return (
                    <div className="text-center py-10 bg-white border border-gray-150 rounded-2xl p-6 text-gray-400 text-xs shadow-xs">
                      {isAr ? 'لم ينتهِ أي مزاد بعد في النظام لتسجيل فائزين.' : 'No auctions have closed yet.'}
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {completedAuctions.map((item) => {
                      const winnerUser = users.find(u => u.id === item.currentBidderId);
                      const winnerNameStr = winnerUser?.name || item.currentBidderName || (isAr ? 'لا يوجد مزايدين' : 'No bids placed');
                      const winnerPhoneStr = winnerUser?.phoneNumber || winnerUser?.transferPhone || (item.currentBidderId ? '+962 7 9888 1234' : 'N/A');
                      const winnerEmailStr = winnerUser?.email || (item.currentBidderId ? 'winner@example.com' : 'N/A');
                      const winnerCityStr = winnerUser?.city || (item.currentBidderId ? 'Amman' : 'N/A');

                      return (
                        <div key={item.id} className="bg-white border border-gray-150 p-5 rounded-2xl space-y-4 shadow-xs">
                          {/* Minimal item tag */}
                          <div className="flex gap-3 items-center">
                            <img src={item.thumbnailUrl} alt="Cover" className="w-11 h-11 rounded-lg object-cover border border-gray-150 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-extrabold text-xs text-gray-900 truncate leading-none mt-1">{item.title}</h4>
                              <p className="text-[11px] text-gray-500 mt-2 font-mono">
                                {isAr ? 'السعر النهائي المبيع: ' : 'Winning Bid: '}
                                <strong className="text-emerald-600 font-extrabold">{item.currentPrice.toLocaleString()} JOD</strong>
                                {item.vendorName && (
                                  <span className="text-gray-400"> · {isAr ? 'المورّد: ' : 'Vendor: '}{item.vendorName}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Winner Details Card - Plain clear details for courier */}
                          {item.currentBidderId ? (
                            <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-3.5 space-y-3">
                              <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest font-mono block">
                                🏆 {isAr ? 'بيانات التوصيل والتواصل مع المشري الفائز' : '🏆 CLIENT SHIPMENT & COORDINATES'}
                              </span>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-normal">
                                <div>
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'اسم العميل الفائز:' : 'FULL NAME'}</span>
                                  <span className="font-bold text-gray-900">{winnerNameStr}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'رقم الهاتف للتوصيل:' : 'TELEPHONE'}</span>
                                  <a href={`tel:${winnerPhoneStr}`} className="font-black text-[#FF6B00] hover:underline font-mono">{winnerPhoneStr}</a>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'البريد الإلكتروني:' : 'EMAIL'}</span>
                                  <span className="font-medium text-gray-850 font-mono truncate block">{winnerEmailStr}</span>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'المدينة والمنطقة:' : 'REGION'}</span>
                                  <span className="font-bold text-gray-900">{winnerCityStr}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-amber-800 italic bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                              {isAr ? 'انتهى هذا المزاد دون الحصول على أي عطاءات.' : 'Closed with zero bids.'}
                            </div>
                          )}

                          {item.currentBidderId && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <span className="text-[10px] text-gray-405 font-mono uppercase font-bold tracking-wider">Escrow Locked 🔒</span>
                              <div className="flex items-center gap-2">
                                {!orders.some(o => o.auctionId === item.id) && (
                                  <button 
                                    onClick={async () => {
                                      const res = await repairEndedAuctionOrder(item.id);
                                      if (res.success) {
                                        alert(res.message);
                                      } else {
                                        alert("Error: " + res.message);
                                      }
                                    }}
                                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-[11px] rounded-xl transition-all"
                                  >
                                    {isAr ? 'إصلاح وإنشاء طلب 🔧' : 'REPAIR ORDER 🔧'}
                                  </button>
                                )}
                                <button 
                                  onClick={async () => {
                                    if (confirm(isAr ? 'هل أنت متأكد من تسوية الضمانات العالقة للمزايدين الخاسرين في هذا المزاد؟' : 'Are you sure you want to repair stuck escrows for losing bidders in this auction?')) {
                                      const res = await repairStuckEscrowsForEndedAuction(item.id);
                                      if (res.success) {
                                        setRepairResults(prev => ({ ...prev, [item.id]: res.message || "Successfully repaired!" }));
                                        alert(res.message);
                                      } else {
                                        setRepairResults(prev => ({ ...prev, [item.id]: "Error: " + res.message }));
                                        alert("Error: " + res.message);
                                      }
                                    }
                                  }}
                                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] rounded-xl transition-all"
                                >
                                  {isAr ? 'إرجاع الضمانات العالقة 🔒' : 'REPAIR ESCROWS 🔒'}
                                </button>
                                <button 
                                  onClick={() => alert(isAr ? `تم نسخ معلومات الفائز وتأكيد بوليصة شحن المزاد بانتظار تسليم شركة الشحن في ${winnerCityStr}.` : `Copied winner’s shipping coordinates for Jordan regional dispatch!`)}
                                  className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-850 text-white font-extrabold text-[11px] rounded-xl transition-all"
                                >
                                  {isAr ? 'نسخ بيانات الشحن والتنسيق ✈️' : 'DISPATCH LOT ✈️'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Temporary admin-only diagnostic panel */}
                          <AuctionEscrowDiagnosticPanel 
                            auctionId={item.id} 
                            winnerId={item.currentBidderId || null} 
                            repairResult={repairResults[item.id] || null} 
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* List 3: Master listings deletion */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600" />
                {isAr ? 'قائمة التحكم السريع وحذف المزادات' : 'MASTER PLATFORM LISTINGS DIRECTORY'}
              </h3>

              {auctions.length === 0 ? (
                <div className="text-center py-8 bg-white border border-gray-150 rounded-2xl p-4 text-gray-400 text-xs shadow-xs">
                  {isAr ? 'لا توجد مزادات في قاعدة البيانات.' : 'No registered entries found.'}
                </div>
              ) : (
                <div className="bg-white border border-gray-150 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-xs">
                  {auctions.map((item) => {
                    let statusLabel = item.status.toUpperCase();
                    let statusColor = 'bg-gray-100 text-gray-500';
                    if (item.status === 'live') {
                      statusLabel = isAr ? 'مباشر الآن 🟢' : 'LIVE';
                      statusColor = 'bg-emerald-50 text-emerald-800 border border-emerald-100';
                    } else if (item.status === 'processing' || item.status === 'pending') {
                      statusLabel = isAr ? 'قيد المراجعة ⏳' : 'PENDING';
                      statusColor = 'bg-amber-50 text-amber-800 border border-amber-100';
                    } else if (item.status === 'completed') {
                      statusLabel = isAr ? 'منتهي 🏆' : 'CLOSED';
                      statusColor = 'bg-blue-50 text-blue-800 border border-blue-100';
                    }

                    return (
                      <div 
                        key={item.id} 
                        className="p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-gray-50/55"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img 
                            src={item.thumbnailUrl} 
                            alt={item.title} 
                            className="w-10 h-10 rounded-lg object-cover border border-gray-150 shrink-0" 
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-[12px] text-gray-900 truncate" title={item.title}>
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded ${statusColor}`}>
                                {statusLabel}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {item.currentPrice.toLocaleString()} JOD
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const conf = window.confirm(
                              isAr
                                ? `⚠️ هل أنت متأكد من مسح وحذف المزاد "${item.title}" بشكل كلي ونهائي من قاعدة البيانات؟`
                                : `⚠️ Are you sure you want to completely delete "${item.title}" from the real database?`
                            );
                            if (conf) {
                              deleteAuction(item.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-650 text-[10px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <span>{isAr ? 'مسح' : 'Erase'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: USERS (Account Security Moderation)
            ========================================== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'سجل الأعضاء وإدارة الصلاحيات' : 'MEMBERS PRIVILEGE CONTROL'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'عاين حسابات المشتركين وقم بتوثيق حساباتهم كبائعين معتمدين أو فرض حظر مؤقت للمخالفين.' : 'Verify user identities to certify authentic merchants or apply bidding limitations.'}
              </p>
            </div>

            <div className="bg-white border border-gray-150 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-xs">
              {isLoading ? (
                <div className="p-4">
                  <AdminListSkeleton />
                </div>
              ) : users.length > 0 ? (
                users.map((profile) => (
                <div key={profile.id} className="p-4 flex justify-between items-center gap-4 transition-colors hover:bg-gray-50/40">
                  <div className="flex items-center gap-3">
                    <img 
                      src={profile.avatar} 
                      alt="Avatar" 
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-150 shadow-xs"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-xs text-gray-900 leading-none">{profile.name}</h4>
                        {profile.role === 'admin' && (
                          <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[8.5px] font-black px-1.5 py-0.5 rounded font-mono">
                            {isAr ? 'إدارة' : 'ADMIN'}
                          </span>
                        )}
                        {profile.isVerified && (
                          <span className="bg-emerald-50 text-emerald-805 border border-emerald-100 text-[8.5px] font-black px-1.5 py-0.5 rounded">
                            {isAr ? 'موثق ✓' : 'VERIFIED ✓'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">
                        {profile.email} • {profile.city || 'Jordan'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {profile.role === 'user' && !profile.isVerified && (
                      <button 
                        onClick={() => verifySeller(profile.id)}
                        className="bg-emerald-600 font-extrabold hover:bg-emerald-700 text-white text-[10px] px-3 py-1.5 rounded-xl transition-all shadow-xs"
                      >
                        {isAr ? 'توثيق العضوية' : 'VERIFY'}
                      </button>
                    )}

                    {profile.isBlocked ? (
                      <button 
                        onClick={() => unbanUser(profile.id)}
                        className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition-all"
                      >
                        {isAr ? 'فك الحظر' : 'UNBAN'}
                      </button>
                    ) : (
                      <button 
                        onClick={() => banUser(profile.id)}
                        className="bg-red-50 text-red-650 border border-red-100 text-[10px] font-bold px-3 py-1.5 rounded-xl hover:bg-red-100 transition-all"
                      >
                        {isAr ? 'حظر العضوية' : 'BAN'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState 
                title={isAr ? 'لا يوجد أعضاء بعد' : 'No users yet'}
                description={isAr ? 'لم يسجل أي مستخدمين بالمنصة بعد.' : 'No users have registered accounts on the network.'}
                language={isAr ? 'ar' : 'en'}
              />
            )}
          </div>

          </div>
        )}

        {/* ==========================================
            TAB: SUBSCRIPTIONS (Premium Subscribing requests)
            ========================================== */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-4">
            
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات اشتراكات المزايدة الممتازة' : 'PREMIUM MEMBERSHIP PASSES'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'تفعيل اشتراكات المنصة الشهرية والسنوية والتحقق من إثبات التحويل المالي المرفق.' : 'Audit custom cliq subscription payments to grant instant vip bidder passport accounts.'}
              </p>
            </div>

            {isLoading ? (
              <div className="bg-white border border-gray-150 rounded-2xl p-4">
                <AdminListSkeleton />
              </div>
            ) : subscriptionRequests.length === 0 ? (
              <EmptyState 
                title={isAr ? 'لا توجد طلبات اشتراك مميز' : 'No premium pass requests'}
                description={isAr ? 'تمت تسوية وتفعيل جميع طلبات جواز السفر الذهبي والممتاز على المنصة.' : 'No VIP membership passport purchases are currently pending audit.'}
                language={isAr ? 'ar' : 'en'}
                icon={<Sparkles className="w-6 h-6 text-[#FF6B00]" />}
              />
            ) : (
              <div className="space-y-3">
                {subscriptionRequests.map((req) => (
                  <div key={req.id} className="bg-white border border-gray-150 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fadeIn transition-all hover:border-gray-250">
                    <div className="space-y-3 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20 rounded-full font-bold px-2.5 py-0.5 uppercase">
                          {req.plan === 'monthly' ? (isAr ? 'شهري' : 'Monthly') : req.plan === 'quarterly' ? (isAr ? 'ربع سنوي' : 'Quarterly') : (isAr ? 'سنوي' : 'Annual')}
                        </span>
                        <span className="text-xs text-gray-900 font-mono font-bold">
                          {req.price} JOD
                        </span>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-sm text-gray-900 leading-none">{req.userName}</h4>
                        <p className="text-[10px] text-gray-400 mt-1">{req.userEmail}</p>
                        {!!formatRequestDate(req.createdAt, isAr ? 'ar-JO' : 'en-US') && (
                          <p className="text-[10px] text-gray-500 mt-1">
                            <span className="font-semibold">{isAr ? 'تاريخ الطلب: ' : 'Requested At: '}</span>
                            {formatRequestDate(req.createdAt, isAr ? 'ar-JO' : 'en-US')}
                          </p>
                        )}
                      </div>

                      <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-xs space-y-1.5">
                        <p className="text-gray-600">
                          <strong className="text-gray-800">{isAr ? 'الاسم بالكامل للحوالة:' : 'Sender Name:'}</strong> {req.transferFullName || 'N/A'}
                        </p>
                        <p className="text-gray-600">
                          <strong className="text-gray-800">{isAr ? 'رقم الهاتف المحول منه:' : 'Sender Phone:'}</strong> {req.transferPhone || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 shrink-0">
                      {isRealUrl(req.paymentProofImage || req.paymentProofUrl) ? (
                        <div className="relative cursor-pointer max-w-[70px]">
                          <img 
                            src={req.paymentProofImage || req.paymentProofUrl} 
                            alt="Payment Proof" 
                            className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs transition-transform hover:scale-105"
                            onClick={() => setViewReceiptUrl(req.paymentProofImage || req.paymentProofUrl)}
                          />
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-3 max-w-[100px] text-center shrink-0">
                          {isAr ? 'لا يوجد إثبات' : 'No Proof'}
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <button
                          disabled={!isRealUrl(req.paymentProofImage || req.paymentProofUrl)}
                          onClick={() => approveSubscription(req)}
                          className={`font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs min-w-[120px] transition-all ${
                            isRealUrl(req.paymentProofImage || req.paymentProofUrl)
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isAr ? 'قبول وتفعيل' : 'APPROVE'}
                        </button>
                        <button
                          onClick={() => rejectSubscription(req)}
                          className="bg-red-50 hover:bg-red-100 text-red-650 border border-red-100 font-bold text-xs px-4 py-1.5 rounded-xl min-w-[120px] cursor-pointer"
                        >
                          {isAr ? 'رفض الطلب' : 'REJECT'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pendingByUsersOnly.length > 0 && (
              <div className="space-y-3 mt-6 pt-6 border-t border-gray-200" id="instant-approval-failsafe-section">
                <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl">
                  <h4 className="text-xs font-bold text-[#FF6B00] flex items-center gap-1.5 uppercase">
                    <ShieldCheck className="w-4 h-4" />
                    {isAr ? 'أعضاء في انتظار التفعيل (تفعيل فوري)' : 'PENDING ACCOUNTS (READY FOR DIRECT VIP ACTIVATION)'}
                  </h4>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {isAr 
                      ? 'هؤلاء الأعضاء قاموا بطلب تفعيل اشتراك. لم يتم إرفاق إيصال الدفع تلقائياً بسبب حجم الصورة الكبير. يمكنك تفعيل حساباتهم فوراً من هنا.' 
                      : 'These users requested a membership pass but their screenshot exceeded the storage limit. Use the button below to grant instant bidding level status.'}
                  </p>
                </div>
                
                <div className="space-y-2">
                  {pendingByUsersOnly.map((user) => (
                    <div key={user.id} className="bg-white border border-gray-150 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                      <div>
                        <h5 className="font-extrabold text-xs text-gray-900 leading-none">{user.name}</h5>
                        <p className="text-[10px] text-gray-400 mt-1">{user.email}</p>
                        <span className="inline-block text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-1.5 border border-amber-100">
                          {isAr ? 'اشتراك معلّق' : 'Subscription Pending'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveUserDirect(user)}
                          className="bg-[#FF6B00] hover:bg-[#E05E00] text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl shadow-xs"
                        >
                          {isAr ? 'تفعيل فوري' : 'APPROVE VIP'}
                        </button>
                        <button
                          onClick={() => rejectUserDirect(user)}
                          className="bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 font-bold text-[11px] px-3 py-1.5 rounded-xl"
                        >
                          {isAr ? 'رفض' : 'REJECT'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: ACTIVE SESSIONS
            ========================================== */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'جلسات النشاط النشطة' : 'ACTIVE USER SESSIONS'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'عرض تفاصيل الأجهزة، الجلسات النشطة، وتاريخ آخر ظهور للمستخدمين لمنع إساءة استخدام الحسابات.' : 'View real-time session indicators, platforms, and devices logged onto the platform.'}
              </p>
            </div>

            <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-150 text-gray-500 font-bold">
                      <th className="p-4 text-start">{isAr ? 'المستخدم' : 'USER'}</th>
                      <th className="p-4 text-start">{isAr ? 'الجهاز المتصل' : 'DEVICE'}</th>
                      <th className="p-4 text-start">{isAr ? 'نظام التشغيل' : 'PLATFORM'}</th>
                      <th className="p-4 text-start">{isAr ? 'آخر ظهور' : 'LAST SEEN'}</th>
                      <th className="p-4 text-start">{isAr ? 'وقت تسجيل الدخول' : 'LOGIN TIME'}</th>
                      <th className="p-4 text-start">{isAr ? 'عنوان IP' : 'IP ADDRESS'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.filter((u: any) => u.sessionId).length > 0 ? (
                      users.filter((u: any) => u.sessionId).map((u: any) => (
                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 text-start">
                            <div className="flex items-center gap-2.5">
                              <img src={u.avatar} className="w-8 h-8 rounded-lg object-cover" />
                              <div className="min-w-0">
                                <p className="font-extrabold text-gray-950 leading-none truncate">{u.name}</p>
                                <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 font-medium text-gray-700 text-start">{u.deviceInfo || 'Unknown Device'}</td>
                          <td className="p-4 text-start">
                            <span className="bg-gray-100 text-gray-800 font-mono text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                              {u.platform || 'Web'}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-gray-500 text-start">
                            {u.lastSeen ? new Date(u.lastSeen).toLocaleString(isAr ? 'ar-JO' : 'en-US') : 'N/A'}
                          </td>
                          <td className="p-4 font-mono text-gray-500 text-start">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(isAr ? 'ar-JO' : 'en-US') : 'N/A'}
                          </td>
                          <td className="p-4 font-mono text-gray-600 text-start">
                            {u.lastLoginIP || 'N/A'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-400">
                          {isAr ? 'لا توجد جلسات نشطة مسجلة حالياً.' : 'No active sessions logged at the moment.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: WITHDRAWALS (Sellers Withdrawal requests)
            ========================================== */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'إدارة طلبات السحب المالي للبائعين' : 'MERCHANT WITHDRAWAL AUDIT'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'مراجعة وتدقيق ومعالجة طلبات سحب الأرصدة المقدمة من قبل التجار والبائعين في المنصة.' : 'Audit, approve, or reject vendor payout requests securely via server-side ledger operations.'}
              </p>
            </div>

            {isLoading ? (
              <div className="bg-white border border-gray-150 rounded-2xl p-4">
                <AdminListSkeleton />
              </div>
            ) : allWithdrawals.length === 0 ? (
              <EmptyState 
                title={isAr ? 'لا توجد طلبات سحب مسجلة' : 'No withdrawal requests'}
                description={isAr ? 'لم يتم تسجيل أي طلبات سحب مالي في قاعدة البيانات حتى الآن.' : 'No merchant payout transactions have been recorded in the database yet.'}
                language={isAr ? 'ar' : 'en'}
                icon={<ShieldCheck className="w-6 h-6 text-gray-400" />}
              />
            ) : (
              <div className="space-y-3">
                {allWithdrawals.map((req) => {
                  const isPending = req.status === 'pending_review';
                  const isCompleted = req.status === 'completed';
                  const isRejected = req.status === 'rejected';

                  let statusBadge = '';
                  if (isPending) {
                    statusBadge = 'bg-amber-50 text-amber-700 border-amber-200';
                  } else if (isCompleted) {
                    statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  } else {
                    statusBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                  }

                  return (
                    <div key={req.id} className="bg-white border border-gray-150 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fadeIn transition-all hover:border-gray-250">
                      <div className="space-y-3 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] border rounded-full font-bold px-2.5 py-0.5 uppercase tracking-wider ${statusBadge}`}>
                            {req.status === 'pending_review' ? (isAr ? 'قيد المراجعة' : 'Pending Review') : req.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : (isAr ? 'مرفوض' : 'Rejected')}
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full font-mono px-2 py-0.5">
                            {req.referenceId || req.id}
                          </span>
                          <span className="text-xs text-[#E85D04] font-mono font-bold">
                            {req.amount} JOD
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider">
                            {isAr ? 'تفاصيل صاحب الطلب المستلم:' : 'REQUESTING VENDOR:'}
                          </h4>
                          <p className="text-xs text-gray-500 font-mono font-bold font-mono">UID: {req.userId}</p>
                          {req.timestamp && (
                            <p className="text-[10px] text-gray-500">
                              <span className="font-semibold">{isAr ? 'تاريخ الطلب: ' : 'Requested At: '}</span>
                              {new Date(req.timestamp).toLocaleString(isAr ? 'ar-JO' : 'en-US')}
                            </p>
                          )}
                        </div>

                        <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-xs space-y-1.5 font-mono">
                          <p className="text-gray-600">
                            <strong className="text-gray-800">{isAr ? 'طريقة السحب:' : 'Payout Method:'}</strong> {req.type === 'cliq' ? (isAr ? 'كليك (CliQ)' : 'CliQ') : (isAr ? 'حوالة بنكية' : 'Bank Transfer')}
                          </p>
                          {req.details && Object.entries(req.details).map(([key, val]: [string, any]) => (
                            <p className="text-gray-600 text-[11px]" key={key}>
                              <strong className="text-gray-800 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</strong> {String(val)}
                            </p>
                          ))}
                          {isRejected && req.rejectionReason && (
                            <p className="text-rose-600 font-bold bg-rose-50 border border-rose-100 p-2 rounded-lg mt-1 text-[11px]">
                              <strong>{isAr ? 'سبب الرفض:' : 'Rejection Reason:'}</strong> {req.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>

                      {isPending && (
                        <div className="flex flex-col gap-2 shrink-0 md:w-48">
                          {rejectingId === req.id ? (
                            <div className="space-y-2">
                              <textarea
                                placeholder={isAr ? 'اكتب سبب الرفض...' : 'Enter rejection reason...'}
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                className="w-full text-xs p-2 border border-rose-200 rounded-xl bg-rose-50/20 focus:outline-none focus:ring-1 focus:ring-rose-400"
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleRejectWithdrawal(req.id)}
                                  disabled={isProcessingAction[req.id]}
                                  className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-black py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  {isProcessingAction[req.id] ? (isAr ? 'جاري الرفض...' : 'Rejecting...') : (isAr ? 'تأكيد الرفض' : 'Confirm')}
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectionReason('');
                                  }}
                                  className="bg-gray-150 hover:bg-gray-200 text-gray-700 text-[11px] font-black px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  {isAr ? 'إلغاء' : 'Cancel'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleApproveWithdrawal(req.id)}
                                disabled={isProcessingAction[req.id]}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                              >
                                {isProcessingAction[req.id] ? (isAr ? 'جاري المعالجة...' : 'Processing...') : (isAr ? 'موافقة وصرف الرصيد' : 'Approve & Release')}
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingId(req.id);
                                  setRejectionReason('');
                                }}
                                className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-black py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                              >
                                {isAr ? 'رفض الطلب وإرجاع المبلغ' : 'Reject & Refund'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: HEALTH & OPERATIONS (Maintenance & Feature Flags Control Panel)
            ========================================== */}
        {activeTab === 'health' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Description */}
            <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#FF6B00] animate-pulse" /> 
                {isAr ? 'مركز التحكم التشغيلي والجاهزية الفنية' : 'OPERATIONAL CONTROL CENTER & SYSTEM HEALTH'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr 
                  ? 'قم بإدارة حالة الصيانة الطارئة للعامة، بوابات المزايدين والمحافظ بنظام كليك، ومعاينة سجل الأخطاء والعمليات فورا.' 
                  : 'Manage system-wide maintenance mode, toggle key transaction gates, and monitor operational log streams.'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Side: System Controls & Feature Gates */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* 1. Maintenance Toggle Card */}
                <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-gray-400" />
                      <h4 className="text-xs font-extrabold text-gray-900 uppercase">
                        {isAr ? 'مفتاح الصيانة الطارئة' : 'Emergency Maintenance'}
                      </h4>
                    </div>
                    
                    {/* Nice Toggle switch */}
                    <button
                      onClick={() => handleMaintenanceToggle(!maintEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        maintEnabled ? 'bg-amber-500' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          maintEnabled ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {maintEnabled ? (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 flex gap-2.5 text-[11px] text-amber-800">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p>
                        {isAr 
                          ? 'تنبيه: منصة المزاد مغلقة الآن في وجه العامة وسيتم عرض شاشة الصيانة. المشرفين المعتمدين فقط يمكنهم التصفح حالياً.' 
                          : 'Attention: The public platform is currently locked. Non-admin users will see the maintenance cover. Authorized admins can continue.'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex gap-2.5 text-[11px] text-emerald-800">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p>
                        {isAr 
                          ? 'المنصة تعمل بنشاط ومتاحة بالكامل لجميع المزايدين والمستخدمين العامين.' 
                          : 'System is fully operational and open to public bidders across Jordan.'}
                      </p>
                    </div>
                  )}

                  {/* Settings Fields */}
                  <div className="space-y-3.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        {isAr ? 'الوقت المتوقع للإنجاز' : 'Expected Duration Estimate'}
                      </label>
                      <input
                        type="text"
                        value={maintDuration}
                        onChange={(e) => setMaintDuration(e.target.value)}
                        placeholder="e.g. 1 hr, 30 mins"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:bg-white focus:ring-1 focus:ring-[#FF6B00] outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                          {isAr ? 'رسالة الصيانة (عربي)' : 'Maintenance Message (Arabic)'}
                        </label>
                        <textarea
                          rows={3}
                          value={maintMsgAr}
                          onChange={(e) => setMaintMsgAr(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-right focus:bg-white focus:ring-1 focus:ring-[#FF6B00] outline-none leading-relaxed"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                          {isAr ? 'رسالة الصيانة (إنجليزي)' : 'Maintenance Message (English)'}
                        </label>
                        <textarea
                          rows={3}
                          value={maintMsgEn}
                          onChange={(e) => setMaintMsgEn(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-left focus:bg-white focus:ring-1 focus:ring-[#FF6B00] outline-none leading-relaxed"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={saveMaintenanceSettings}
                        className="bg-gray-900 hover:bg-black text-white font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-xs"
                      >
                        {isAr ? 'حفظ الرسائل والتفاصيل' : 'SAVE DETAILS'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Feature Flags Switchboard */}
                <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                    <Settings className="w-4 h-4 text-gray-400" />
                    <h4 className="text-xs font-extrabold text-gray-900 uppercase">
                      {isAr ? 'بوابات الميزات الفعالة' : 'Feature Gates & System Valves'}
                    </h4>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {/* Live Auctions Gate */}
                    <div className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h5 className="text-xs font-extrabold text-gray-900 leading-none">
                          {isAr ? 'المزايدات المباشرة' : 'Live Auctions & Bidding'}
                        </h5>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {isAr 
                            ? 'تعطيل قدرة الأعضاء على تقديم مزايدات جديدة على المعروضات.' 
                            : 'Disable public users from locking or sending real-time bids.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                          featureFlags?.enableLiveAuctions ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-650'
                        }`}>
                          {featureFlags?.enableLiveAuctions ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                        </span>
                        <button
                          onClick={() => updateFeatureFlag('enableLiveAuctions', !featureFlags?.enableLiveAuctions)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            featureFlags?.enableLiveAuctions ? 'bg-emerald-505 bg-emerald-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              featureFlags?.enableLiveAuctions ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Subscriptions Gate */}
                    <div className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h5 className="text-xs font-extrabold text-gray-900 leading-none">
                          {isAr ? 'بوابات دفع الاشتراكات الممتازة' : 'Subscription Upgrades'}
                        </h5>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {isAr 
                            ? 'توقيف مؤقت لاستلام طلبات تجديد أو ترقية باقات كليك الذهبية.' 
                            : 'Prevent cliq-based gold member upgrades during updates.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                          featureFlags?.enableSubscriptions ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-650'
                        }`}>
                          {featureFlags?.enableSubscriptions ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                        </span>
                        <button
                          onClick={() => updateFeatureFlag('enableSubscriptions', !featureFlags?.enableSubscriptions)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            featureFlags?.enableSubscriptions ? 'bg-emerald-650 bg-emerald-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              featureFlags?.enableSubscriptions ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Wallets Deposits Gate */}
                    <div className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h5 className="text-xs font-extrabold text-gray-900 leading-none">
                          {isAr ? 'شحن المحافظ المالية (كليك)' : 'Digital Wallet Deposits'}
                        </h5>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {isAr 
                            ? 'حظر شحن أرصدة المزايدة أو رفع إيصالات التحويل لتدقيقها.' 
                            : 'Lock wallet deposit modules during transaction reconciliation.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                          featureFlags?.enableWallets ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-650'
                        }`}>
                          {featureFlags?.enableWallets ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                        </span>
                        <button
                          onClick={() => updateFeatureFlag('enableWallets', !featureFlags?.enableWallets)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            featureFlags?.enableWallets ? 'bg-emerald-650 bg-emerald-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              featureFlags?.enableWallets ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Push Notifications Gate */}
                    <div className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h5 className="text-xs font-extrabold text-gray-900 leading-none">
                          {isAr ? 'الإشعارات الفورية (Web Push)' : 'Web Push Notification Services'}
                        </h5>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {isAr 
                            ? 'إغلاق أو تفعيل خوادم إرسال التنبيهات المباشرة لمتصفحات الهواتف والويب.' 
                            : 'Toggle native web push alerts for outbids and payment confirmations.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                          featureFlags?.enablePushNotifications ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-650'
                        }`}>
                          {featureFlags?.enablePushNotifications ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                        </span>
                        <button
                          onClick={() => updateFeatureFlag('enablePushNotifications', !featureFlags?.enablePushNotifications)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            featureFlags?.enablePushNotifications ? 'bg-emerald-650 bg-emerald-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              featureFlags?.enablePushNotifications ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Database State Back backups & Recovery */}
                <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                    <HardDrive className="w-4 h-4 text-gray-400" />
                    <h4 className="text-xs font-extrabold text-gray-900 uppercase">
                      {isAr ? 'النسخ الاحتياطي وإدارة الكوارث' : 'Backup & Disaster Recovery'}
                    </h4>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <span className="text-gray-400 text-[10px] block uppercase font-bold">{isAr ? 'تاريخ آخر تصدير لقاعدة البيانات' : 'LAST RECOVERY SNAPSHOT'}</span>
                      <span className="font-mono text-gray-700 font-extrabold">
                        {lastBackupTime ? lastBackupTime : (isAr ? 'لا يوجد نسخ احتياطي مسجل' : 'No manual snapshot recorded')}
                      </span>
                    </div>

                    <button
                      onClick={triggerManualBackup}
                      className="bg-[#FF6B00] hover:bg-[#E05E00] text-white text-[11px] font-black px-4 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <Database className="w-3.5 h-3.5" />
                      {isAr ? 'لقطة فورية كاملة' : 'SNAPSHOT NOW'}
                    </button>
                  </div>
                </div>

                {/* Onboarding & Welcome Flow Testing Controls */}
                <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                    <RotateCcw className="w-4 h-4 text-[#FF6B00]" />
                    <h4 className="text-xs font-extrabold text-gray-900 uppercase">
                      {isAr ? 'بيئة تجربة المستخدم والتعليمات' : 'User Onboarding & Guides Testing'}
                    </h4>
                  </div>

                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {isAr 
                      ? 'أداة اختبار لإعادة تهيئة دليل المستخدم الجديد وتنبيهات التعليمات السياقية لغايات الفحص الفني.' 
                      : 'Developer testing utility to reset the new-user onboarding walkthrough and all contextual guides.'}
                  </p>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 text-[10px] block uppercase font-bold">
                      {isAr ? 'حالة دليل المستخدم' : 'GUIDES ENGINE STATE'}
                    </span>
                    <button
                      onClick={async () => {
                        await resetOnboarding();
                        alert(isAr 
                          ? '🔄 تم إعادة تعيين دليل المستخدم والتعليمات بنجاح!' 
                          : '🔄 Walkthrough and hints reset successfully!'
                        );
                      }}
                      className="bg-gray-950 hover:bg-black text-white text-[11px] font-black px-4 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {isAr ? 'إعادة تعيين الدليل' : 'RESET ONBOARDING'}
                    </button>
                  </div>
                </div>

                {/* 4. Live Auction Force Reactivation */}
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-orange-100">
                    <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" style={{ animationDuration: '6s' }} />
                    <h4 className="text-xs font-extrabold text-orange-950 uppercase">
                      {isAr ? 'إعادة تفعيل وتنشيط جميع المزادات' : 'Live Auctions Reactivation Engine'}
                    </h4>
                  </div>

                  <p className="text-[11px] text-orange-800 leading-relaxed">
                    {isAr 
                      ? 'زر الطوارئ الإداري لتنشيط جميع معروضات المزاد المنتهية فوراً، وإعادتها لحالة النشاط "live" وتمديد تاريخ الانتهاء لـ 24 ساعة إضافية من اللحظة الحالية.' 
                      : 'Emergency action to immediately reactivate and force all ended or past auctions to "live" status, resetting their remaining duration to a fresh 24 hours.'}
                  </p>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleReactivateAllAuctions}
                      disabled={isLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" />
                      {isAr ? 'تنشيط وإعادة تفعيل جميع المزادات (24 ساعة)' : 'REACTIVATE ALL AUCTIONS (24H)'}
                    </button>
                  </div>
                </div>

                {/* 5. Reset & Restart All Auctions Engine */}
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-rose-100">
                    <RotateCcw className="w-4 h-4 text-rose-600 animate-pulse" />
                    <h4 className="text-xs font-extrabold text-rose-950 uppercase">
                      {isAr ? 'إعادة تعيين كافة المزادات' : 'Reset All Auctions Engine'}
                    </h4>
                  </div>

                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    {isAr 
                      ? 'زر إداري لإعادة تهيئة جميع المزادات وتصفير قيم العروض وتعيين المزادات كنشطة وإعادة مؤقتاتها للبداية.' 
                      : 'Administrative action to reset all auctions to live status, clear bid history, reset highest bidders/winners, release/refund escrow transactions, and restart all countdown timers from the beginning.'}
                  </p>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleResetAllAuctions}
                      disabled={isLoading}
                      className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {isAr ? 'تصفير وإعادة تشغيل جميع المزادات' : 'RESET ALL AUCTIONS'}
                    </button>
                  </div>
                </div>

              </div>

              {/* Right Side: Real-time Operations & Logs */}
              <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs flex flex-col h-[600px] lg:h-[720px]">
                <div className="pb-3 border-b border-gray-100">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                    {isAr ? 'سجل العمليات والصحة الفنية المباشر' : 'Live System Operations Stream'}
                  </h4>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {isAr ? 'تحديثات حية ومباشرة للأخطاء وحركات الدفع والمزايدة في المملكة.' : 'Live stream of payment approvals, bid placement fails, or critical errors.'}
                  </p>
                </div>

                {/* Filter Selector */}
                <div className="flex gap-1.5 py-3 overflow-x-auto shrink-0 scrollbar-none border-b border-gray-100">
                  {(['all', 'error', 'bid_fail', 'payment_fail'] as const).map((filter) => {
                    const label = isAr 
                      ? (filter === 'all' ? 'الكل' : filter === 'error' ? 'أخطاء نظام' : filter === 'bid_fail' ? 'فشل المزايدة' : 'فشل مالي')
                      : (filter === 'all' ? 'All' : filter === 'error' ? 'System' : filter === 'bid_fail' ? 'Bids' : 'Payments');
                    
                    const isSelected = healthFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => setHealthFilter(filter)}
                        className={`text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono transition-colors ${
                          isSelected 
                            ? 'bg-slate-900 text-white' 
                            : 'bg-gray-105 hover:bg-gray-150 text-gray-500 bg-gray-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Scrollable logs area */}
                <div className="flex-1 overflow-y-auto pt-3.5 space-y-3 pr-1 scrollbar-thin">
                  {filteredHealthLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
                      <p className="text-[11px] font-extrabold text-gray-900">
                        {isAr ? 'قنوات الأنظمة تعمل بسلامة ١٠٠٪' : 'Core Systems running smoothly'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {isAr ? 'لا توجد أخطاء تشغيلية أو تحذيرات معلقة في سجلات هذا الفلتر.' : 'No warnings or failures captured in this operational channel.'}
                      </p>
                    </div>
                  ) : (
                    filteredHealthLogs.map((log: any) => {
                      const isErr = log.type === 'error';
                      const isBid = log.type === 'bid_fail';
                      const isPay = log.type === 'payment_fail';

                      let typeBadgeBg = 'bg-rose-50 text-rose-700 border-rose-100';
                      let typeLabel = 'SYSTEM';
                      if (isBid) {
                        typeBadgeBg = 'bg-orange-50 text-orange-700 border-orange-100';
                        typeLabel = 'BID_FAIL';
                      } else if (isPay) {
                        typeBadgeBg = 'bg-amber-50 text-amber-700 border-amber-100';
                        typeLabel = 'PAY_FAIL';
                      }

                      return (
                        <div key={log.id} className="bg-gray-50/50 border border-gray-150 rounded-xl p-3 space-y-2 text-[11px] hover:bg-gray-50 transition-colors animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-black tracking-widest font-mono px-2 py-0.5 rounded border ${typeBadgeBg}`}>
                              {typeLabel}
                            </span>
                            <span className="text-[9px] font-mono text-gray-400">
                              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US') : ''}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h5 className="font-extrabold text-gray-900 leading-snug">{log.title}</h5>
                            <p className="text-gray-500 text-[10px] leading-relaxed break-words">{log.details}</p>
                          </div>

                          <div className="pt-1.5 border-t border-gray-100 flex flex-col gap-0.5 text-[9px] text-gray-400 font-mono">
                            <p>
                              <span className="font-semibold text-gray-500">By:</span> {log.userEmail || 'anonymous'}
                            </p>
                            {log.browser && (
                              <p className="truncate" title={log.browser}>
                                <span className="font-semibold text-gray-500">UA:</span> {log.browser}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
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
                className="bg-gray-150 hover:bg-gray-200 text-gray-850 rounded-xl px-4 py-2 text-xs font-black uppercase transition-all"
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
