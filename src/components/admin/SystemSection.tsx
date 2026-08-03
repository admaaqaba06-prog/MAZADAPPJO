import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  ShieldAlert,
  CheckCircle,
  Settings,
  RotateCcw,
  RefreshCw,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { isAdminUser } from '../../utils/adminAuth';
import { collection, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import { db, getCallableFunction } from '../../services/firebase';

// Lazy: the simulator console (bots, spawn presets) is admin-only tooling —
// keep it out of the main dashboard chunk.
const SimulatorPanel = React.lazy(() => import('../SimulatorPanel'));

/**
 * Would `firestore.rules` refuse an admin write to this auction's money/timing
 * fields? Both bulk tools below write `endTime`/`endsAt`, which the rule locks
 * at the first bid.
 *
 * MIRRORS `adminEditBlocked()` in firestore.rules exactly — the two must agree
 * or the client filters the wrong set. Note the simulator half carefully:
 * simulated lots are EXEMPT from the rule, so a sim lot the bot has bid on must
 * stay IN the batch. Cleaning those up is the main thing these buttons are for.
 *
 * The count test is a bare `n > 0` rather than `bidCountOf()` from
 * dropEditability on purpose. That helper adds `Number.isFinite`, so it reads a
 * non-finite count as "no bids" and would KEEP such a doc in the batch. The two
 * mistakes are not symmetric: wrongly skipping a doc merely leaves one lot
 * unprocessed (and the summary says so), while wrongly keeping one the server
 * refuses fails the entire atomic chunk. So on any value we cannot be sure
 * about, this predicate must take the skip side — which `> 0` does and
 * `Number.isFinite(n) && n > 0` does not.
 */
export const isBidLocked = (data: any): boolean => {
  const n = data?.totalBids;
  return typeof n === 'number' && n > 0 && data?.isSimulated !== true;
};

type StatusSeverity = 'ok' | 'warn' | 'bad' | 'neutral';

/** One glanceable card on the health status board. */
const HealthStatusCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  severity: StatusSeverity;
  subtext?: string;
}> = ({ icon, label, value, severity, subtext }) => {
  const styles: Record<StatusSeverity, string> = {
    ok: 'bg-emerald-50/60 border-emerald-100 text-emerald-700',
    warn: 'bg-amber-50/60 border-amber-100 text-amber-700',
    bad: 'bg-rose-50/60 border-rose-100 text-rose-700',
    neutral: 'bg-surface-sunken border-line text-fg-muted',
  };
  const dotStyles: Record<StatusSeverity, string> = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-rose-500 animate-pulse',
    neutral: 'bg-gray-300',
  };
  return (
    <div className={`border rounded-2xl p-4 shadow-xs flex flex-col gap-1.5 ${styles[severity]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-fg-muted flex items-center gap-1.5">
          <span aria-hidden="true">{icon}</span> {label}
        </span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotStyles[severity]}`} />
      </div>
      <p className="text-lg font-black leading-none font-mono">{value}</p>
      {subtext && <p className="text-[9px] font-mono text-fg-muted leading-snug">{subtext}</p>}
    </div>
  );
};

/**
 * System — merges the former HEALTH, SESSIONS and SIMULATOR tabs into one
 * section with three labeled zones:
 *   • Operations  — maintenance mode, feature-flag valves, health status board,
 *                   live system-health log stream.
 *   • Monitoring  — read-only active user sessions table.
 *   • Developer   — QUARANTINED dev/danger tools (simulator, onboarding reset,
 *                   reactivate-all / reset-all-auctions).
 *
 * All money/context handlers are injected from AdminDashboardView and called
 * verbatim. This section creates NO Firestore listeners; the derived health
 * signals (stuck auctions/orders, settlement freshness, n8n rates) are computed
 * sim-excluded in the shell and passed in as props. The former fake "backup
 * snapshot" button (localStorage timestamp only) was removed with this merge.
 */
export interface SystemSectionProps {
  isAr: boolean;
  currentUser: any;
  // Operations — maintenance + feature flags + health logs (context values).
  maintenanceMode: any;
  featureFlags: any;
  updateMaintenanceMode: (
    enabled: boolean,
    messageAr: string,
    messageEn: string,
    expectedDuration: string
  ) => Promise<void> | void;
  updateFeatureFlag: (key: string, value: boolean) => Promise<void> | void;
  systemHealthLogs: any[];
  logSystemHealth: (type: string, title: string, details: string) => void;
  // Derived health signals (computed sim-excluded in the shell, passed verbatim).
  stuckAuctions: any[];
  stuckOrders: any[];
  settlementFresh: boolean;
  n8nBot: any;
  n8nNotif: any;
  rateValue: (stats: any) => string;
  rateSeverity: (stats: any) => StatusSeverity;
  rateSubtext: (stats: any) => string;
  // Monitoring — active sessions.
  users: any[];
  // Developer — quarantined dev tools.
  resetOnboarding: () => Promise<void> | void;
  setBids: (bids: any[]) => void;
}

export const SystemSection: React.FC<SystemSectionProps> = ({
  isAr,
  currentUser,
  maintenanceMode,
  featureFlags,
  updateMaintenanceMode,
  updateFeatureFlag,
  systemHealthLogs,
  logSystemHealth,
  stuckAuctions,
  stuckOrders,
  settlementFresh,
  n8nBot,
  n8nNotif,
  rateValue,
  rateSeverity,
  rateSubtext,
  users,
  resetOnboarding,
  setBids,
}) => {
  // Local health & maintenance control states
  const [maintEnabled, setMaintEnabled] = useState<boolean>(maintenanceMode?.enabled || false);
  const [maintMsgAr, setMaintMsgAr] = useState<string>(maintenanceMode?.messageAr || '');
  const [maintMsgEn, setMaintMsgEn] = useState<string>(maintenanceMode?.messageEn || '');
  const [maintDuration, setMaintDuration] = useState<string>(maintenanceMode?.expectedDuration || '1 hr');

  const [healthFilter, setHealthFilter] = useState<'all' | 'error' | 'bid_fail' | 'payment_fail'>('all');

  const [isLoading, setIsLoading] = useState<boolean>(false);

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

      // NEVER force-publish listings that haven't cleared the approval gate:
      // 'processing' (+ legacy 'pending') are still under review and
      // 'rejected' was explicitly declined — both stay out of this batch.
      const eligible = snapshot.docs.filter((docSnap) => {
        const s = docSnap.data().status;
        return s !== 'processing' && s !== 'pending' && s !== 'rejected';
      });
      const skippedCount = snapshot.size - eligible.length;

      // Lots with bids are dropped here, not left for the server to reject.
      // This batch writes endTime/endsAt, which firestore.rules locks at the
      // first bid, and a Firestore batch is atomic — so ONE bid-carrying lot in
      // a 400-doc chunk fails the entire chunk and takes every innocent lot with
      // it. Filtering degrades the tool to "did what it could" instead of dying
      // wholesale, and the summary names the count: a silent skip is nearly as
      // bad as the failure it replaces.
      const docs = eligible.filter((docSnap) => !isBidLocked(docSnap.data()));
      const bidLockedCount = eligible.length - docs.length;

      if (docs.length === 0) {
        alert(isAr
          ? `لا توجد مزادات مؤهلة لإعادة التفعيل — ${skippedCount} قيد المراجعة أو مرفوضة، و${bidLockedCount} عليها مزايدات (لا يمكن تعديل وقتها بعد أول مزايدة).`
          : `No auctions eligible for reactivation — ${skippedCount} under review or rejected, and ${bidLockedCount} have bids (timing is locked after the first bid).`);
        return;
      }
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
      logSystemHealth('error', 'All Auctions Reactivated', `An administrator reactivated ${docs.length} auctions (${skippedCount} under-review/rejected listings excluded, ${bidLockedCount} skipped because they have bids), setting their status to "live" and extending duration by 24 hours.`);

      alert(isAr
        ? `🎉 تم بنجاح إعادة تفعيل وتنشيط المزادات (${docs.length}) وتمديدها لمدة 24 ساعة!${skippedCount > 0 ? ` تم استثناء ${skippedCount} من المعروضات قيد المراجعة أو المرفوضة.` : ''}${bidLockedCount > 0 ? ` وتم تخطي ${bidLockedCount} لأن عليها مزايدات — لا يمكن تعديل وقت المزاد بعد أول مزايدة.` : ''}`
        : `🎉 Successfully reactivated and extended (${docs.length}) auctions for 24 hours!${skippedCount > 0 ? ` Excluded ${skippedCount} under-review/rejected listings.` : ''}${bidLockedCount > 0 ? ` Skipped ${bidLockedCount} with bids — auction timing is locked after the first bid.` : ''}`
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

      // Same atomic-batch hazard as the reactivate tool above: this batch writes
      // endTime/endsAt/currentPrice, all locked by firestore.rules once a lot has
      // bids, and one rejected doc fails the whole 400-doc chunk. Skip them so a
      // single real bid can't disable the reset button for every test lot.
      const docs = snapshot.docs.filter((docSnap) => !isBidLocked(docSnap.data()));
      const bidLockedCount = snapshot.size - docs.length;

      if (docs.length === 0) {
        alert(isAr
          ? `لا توجد مزادات قابلة لإعادة التهيئة — جميع الـ ${bidLockedCount} مزاد عليها مزايدات، ولا يمكن تعديل سعرها أو وقتها بعد أول مزايدة.`
          : `No auctions can be reset — all ${bidLockedCount} have bids, and price and timing are locked after the first bid.`);
        setIsLoading(false);
        return;
      }

      // Only the auctions actually reset. Passing a skipped lot's id would have
      // the Cloud Function clear escrows out from under an auction still running
      // with live bids on it.
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
      logSystemHealth('error', 'All Auctions Fully Reset', `An administrator fully reset ${docs.length} of ${snapshot.size} auctions back to initial states, clearing their bids, winners, and active escrows (${bidLockedCount} skipped because they have bids).`);

      // 5. Alert success
      alert(isAr
        ? `تمت إعادة تهيئة ${docs.length} مزاد بنجاح.${bidLockedCount > 0 ? ` وتم تخطي ${bidLockedCount} لأن عليها مزايدات — لا يمكن تعديل سعر المزاد أو وقته بعد أول مزايدة.` : ''}`
        : `${docs.length} auctions have been restarted successfully.${bidLockedCount > 0 ? ` Skipped ${bidLockedCount} with bids — price and timing are locked after the first bid.` : ''}`
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

  return (
    <div className="space-y-10 animate-fadeIn">
      {/* ══════════════ ZONE 1: OPERATIONS ══════════════ */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-fg-muted">
            {isAr ? 'العمليات' : 'OPERATIONS'}
          </span>
          <span className="h-px flex-1 bg-surface-sunken" />
        </div>

        {/* Header Description */}
        <div className="bg-surface-raised border border-line p-5 rounded-2xl shadow-xs">
          <h3 className="text-xs font-extrabold text-fg flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#FF6B00] animate-pulse" />
            {isAr ? 'مركز التحكم التشغيلي والجاهزية الفنية' : 'OPERATIONAL CONTROL CENTER & SYSTEM HEALTH'}
          </h3>
          <p className="text-[11px] text-fg-muted mt-1">
            {isAr
              ? 'قم بإدارة حالة الصيانة الطارئة للعامة، بوابات المزايدين والمحافظ بنظام كليك، ومعاينة سجل الأخطاء والعمليات فورا.'
              : 'Manage system-wide maintenance mode, toggle key transaction gates, and monitor operational log streams.'}
          </p>
        </div>

        {/* Status board: n8n pipes (polled server-side) + Firestore-derived operational signals */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <HealthStatusCard
            icon="🤖"
            label={isAr ? 'صحة البوت' : 'Bot health'}
            value={rateValue(n8nBot)}
            severity={rateSeverity(n8nBot)}
            subtext={rateSubtext(n8nBot)}
          />
          <HealthStatusCard
            icon="📲"
            label={isAr ? 'صحة الإشعارات' : 'Notification health'}
            value={rateValue(n8nNotif)}
            severity={rateSeverity(n8nNotif)}
            subtext={rateSubtext(n8nNotif)}
          />
          <HealthStatusCard
            icon="⏱️"
            label={isAr ? 'مزادات عالقة' : 'Stuck auctions'}
            value={String(stuckAuctions.length)}
            severity={stuckAuctions.length > 0 ? 'bad' : 'ok'}
            subtext={isAr ? 'انتهت منذ >دقيقتين ولم تُغلق' : 'ended >2 min ago, still open'}
          />
          <HealthStatusCard
            icon="📦"
            label={isAr ? 'غير مدفوعة +٤٨ س' : 'Unpaid >48h'}
            value={String(stuckOrders.length)}
            severity={stuckOrders.length > 0 ? 'warn' : 'ok'}
            subtext={isAr ? 'طلبات بانتظار الدفع' : 'orders awaiting payment'}
          />
          <HealthStatusCard
            icon="✅"
            label={isAr ? 'التسوية' : 'Settlement'}
            value={settlementFresh ? (isAr ? 'حديثة' : 'Fresh') : (isAr ? 'متأخرة' : 'Stale')}
            severity={settlementFresh ? 'ok' : 'bad'}
            subtext={isAr ? 'إشارة حياة مؤقّت الإغلاق' : 'closer-cron liveness signal'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side: System Controls & Feature Gates */}
          <div className="lg:col-span-2 space-y-6">

            {/* 1. Maintenance Toggle Card */}
            <div className="bg-surface-raised border border-line rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-fg-muted" />
                  <h4 className="text-xs font-extrabold text-fg uppercase">
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
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface-raised shadow-lg ring-0 transition duration-200 ease-in-out ${
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
                  <label className="block text-[10px] font-bold text-fg-muted uppercase mb-1">
                    {isAr ? 'الوقت المتوقع للإنجاز' : 'Expected Duration Estimate'}
                  </label>
                  <input
                    type="text"
                    value={maintDuration}
                    onChange={(e) => setMaintDuration(e.target.value)}
                    placeholder="e.g. 1 hr, 30 mins"
                    className="w-full bg-surface-sunken border border-line rounded-xl px-3 py-2 text-xs font-mono focus:bg-surface-raised focus:ring-1 focus:ring-[#FF6B00] outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-fg-muted uppercase mb-1">
                      {isAr ? 'رسالة الصيانة (عربي)' : 'Maintenance Message (Arabic)'}
                    </label>
                    <textarea
                      rows={3}
                      value={maintMsgAr}
                      onChange={(e) => setMaintMsgAr(e.target.value)}
                      className="w-full bg-surface-sunken border border-line rounded-xl p-3 text-xs text-right focus:bg-surface-raised focus:ring-1 focus:ring-[#FF6B00] outline-none leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-fg-muted uppercase mb-1">
                      {isAr ? 'رسالة الصيانة (إنجليزي)' : 'Maintenance Message (English)'}
                    </label>
                    <textarea
                      rows={3}
                      value={maintMsgEn}
                      onChange={(e) => setMaintMsgEn(e.target.value)}
                      className="w-full bg-surface-sunken border border-line rounded-xl p-3 text-xs text-left focus:bg-surface-raised focus:ring-1 focus:ring-[#FF6B00] outline-none leading-relaxed"
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
            <div className="bg-surface-raised border border-line rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-line">
                <Settings className="w-4 h-4 text-fg-muted" />
                <h4 className="text-xs font-extrabold text-fg uppercase">
                  {isAr ? 'بوابات الميزات الفعالة' : 'Feature Gates & System Valves'}
                </h4>
              </div>

              <div className="divide-y divide-line">
                {/* Live Auctions Gate */}
                <div className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-fg leading-none">
                      {isAr ? 'المزايدات المباشرة' : 'Live Auctions & Bidding'}
                    </h5>
                    <p className="text-[10px] text-fg-muted mt-1">
                      {isAr
                        ? 'تعطيل قدرة الأعضاء على تقديم مزايدات جديدة على المعروضات.'
                        : 'Disable public users from locking or sending real-time bids.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                      featureFlags?.enableLiveAuctions ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {featureFlags?.enableLiveAuctions ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                    </span>
                    <button
                      onClick={() => updateFeatureFlag('enableLiveAuctions', !featureFlags?.enableLiveAuctions)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        featureFlags?.enableLiveAuctions ? 'bg-emerald-500 bg-emerald-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-raised shadow-sm ring-0 transition duration-200 ease-in-out ${
                          featureFlags?.enableLiveAuctions ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Subscriptions Gate */}
                <div className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-fg leading-none">
                      {isAr ? 'بوابات دفع الاشتراكات الممتازة' : 'Subscription Upgrades'}
                    </h5>
                    <p className="text-[10px] text-fg-muted mt-1">
                      {isAr
                        ? 'توقيف مؤقت لاستلام طلبات تجديد أو ترقية باقات كليك الذهبية.'
                        : 'Prevent cliq-based gold member upgrades during updates.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                      featureFlags?.enableSubscriptions ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {featureFlags?.enableSubscriptions ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                    </span>
                    <button
                      onClick={() => updateFeatureFlag('enableSubscriptions', !featureFlags?.enableSubscriptions)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        featureFlags?.enableSubscriptions ? 'bg-emerald-600 bg-emerald-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-raised shadow-sm ring-0 transition duration-200 ease-in-out ${
                          featureFlags?.enableSubscriptions ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Wallets Deposits Gate */}
                <div className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-fg leading-none">
                      {isAr ? 'شحن المحافظ المالية (كليك)' : 'Digital Wallet Deposits'}
                    </h5>
                    <p className="text-[10px] text-fg-muted mt-1">
                      {isAr
                        ? 'حظر شحن أرصدة المزايدة أو رفع إيصالات التحويل لتدقيقها.'
                        : 'Lock wallet deposit modules during transaction reconciliation.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                      featureFlags?.enableWallets ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {featureFlags?.enableWallets ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                    </span>
                    <button
                      onClick={() => updateFeatureFlag('enableWallets', !featureFlags?.enableWallets)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        featureFlags?.enableWallets ? 'bg-emerald-600 bg-emerald-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-raised shadow-sm ring-0 transition duration-200 ease-in-out ${
                          featureFlags?.enableWallets ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Push Notifications Gate */}
                <div className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-fg leading-none">
                      {isAr ? 'الإشعارات الفورية (Web Push)' : 'Web Push Notification Services'}
                    </h5>
                    <p className="text-[10px] text-fg-muted mt-1">
                      {isAr
                        ? 'إغلاق أو تفعيل خوادم إرسال التنبيهات المباشرة لمتصفحات الهواتف والويب.'
                        : 'Toggle native web push alerts for outbids and payment confirmations.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                      featureFlags?.enablePushNotifications ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {featureFlags?.enablePushNotifications ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                    </span>
                    <button
                      onClick={() => updateFeatureFlag('enablePushNotifications', !featureFlags?.enablePushNotifications)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        featureFlags?.enablePushNotifications ? 'bg-emerald-600 bg-emerald-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-raised shadow-sm ring-0 transition duration-200 ease-in-out ${
                          featureFlags?.enablePushNotifications ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Guest Browsing Gate (kill switch — flag OFF restores the
                    login-gated front door instantly, no redeploy) */}
                <div className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-fg leading-none">
                      {isAr ? 'التصفح كزائر (بدون تسجيل)' : 'Guest Browsing (logged-out visitors)'}
                    </h5>
                    <p className="text-[10px] text-fg-muted mt-1">
                      {isAr
                        ? 'السماح للزوار بتصفح المزادات ومشاهدتها بدون حساب — المزايدة والدردشة والحفظ تتطلب التسجيل.'
                        : 'Let logged-out visitors browse and watch auctions read-only — bidding, chat and saving still require signup.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black font-mono uppercase px-2 py-0.5 rounded-full ${
                      featureFlags?.enableGuestBrowsing ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {featureFlags?.enableGuestBrowsing ? (isAr ? 'فعال' : 'ON') : (isAr ? 'معطل' : 'OFF')}
                    </span>
                    <button
                      onClick={() => updateFeatureFlag('enableGuestBrowsing', !featureFlags?.enableGuestBrowsing)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        featureFlags?.enableGuestBrowsing ? 'bg-emerald-600 bg-emerald-600' : 'bg-gray-200'
                      }`}
                      id="admin-guest-browsing-toggle"
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface-raised shadow-sm ring-0 transition duration-200 ease-in-out ${
                          featureFlags?.enableGuestBrowsing ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Real-time Operations & Logs */}
          <div className="bg-surface-raised border border-line rounded-2xl p-5 shadow-xs flex flex-col h-[600px] lg:h-[720px]">
            <div className="pb-3 border-b border-line">
              <h4 className="text-xs font-extrabold text-fg uppercase flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                {isAr ? 'سجل العمليات والصحة الفنية المباشر' : 'Live System Operations Stream'}
              </h4>
              <p className="text-[10px] text-fg-muted mt-1">
                {isAr ? 'تحديثات حية ومباشرة للأخطاء وحركات الدفع والمزايدة في المملكة.' : 'Live stream of payment approvals, bid placement fails, or critical errors.'}
              </p>
            </div>

            {/* Filter Selector */}
            <div className="flex gap-1.5 py-3 overflow-x-auto shrink-0 scrollbar-none border-b border-line">
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
                        : 'bg-surface-sunken hover:bg-surface text-fg-muted'
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
                  <p className="text-[11px] font-extrabold text-fg">
                    {isAr ? 'قنوات الأنظمة تعمل بسلامة ١٠٠٪' : 'Core Systems running smoothly'}
                  </p>
                  <p className="text-[10px] text-fg-muted mt-1">
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
                    <div key={log.id} className="bg-surface-sunken/50 border border-line rounded-xl p-3 space-y-2 text-[11px] hover:bg-surface-sunken transition-colors animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className={`text-[8px] font-black tracking-widest font-mono px-2 py-0.5 rounded border ${typeBadgeBg}`}>
                          {typeLabel}
                        </span>
                        <span className="text-[9px] font-mono text-fg-muted">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US') : ''}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h5 className="font-extrabold text-fg leading-snug">{log.title}</h5>
                        <p className="text-fg-muted text-[10px] leading-relaxed break-words">{log.details}</p>
                      </div>

                      <div className="pt-1.5 border-t border-line flex flex-col gap-0.5 text-[9px] text-fg-muted font-mono">
                        <p>
                          <span className="font-semibold text-fg-muted">By:</span> {log.userEmail || 'anonymous'}
                        </p>
                        {log.browser && (
                          <p className="truncate" title={log.browser}>
                            <span className="font-semibold text-fg-muted">UA:</span> {log.browser}
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
      </section>

      {/* ══════════════ ZONE 2: MONITORING ══════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-fg-muted">
            {isAr ? 'المراقبة' : 'MONITORING'}
          </span>
          <span className="h-px flex-1 bg-surface-sunken" />
        </div>

        <div className="bg-surface-raised border border-line p-5 rounded-2xl shadow-xs">
          <h3 className="text-sm font-extrabold text-fg flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#FF6B00]" />
            {isAr ? 'جلسات النشاط النشطة' : 'ACTIVE USER SESSIONS'}
          </h3>
          <p className="text-[11px] text-fg-muted mt-1">
            {isAr ? 'عرض تفاصيل الأجهزة، الجلسات النشطة، وتاريخ آخر ظهور للمستخدمين لمنع إساءة استخدام الحسابات.' : 'View real-time session indicators, platforms, and devices logged onto the platform.'}
          </p>
        </div>

        <div className="bg-surface-raised border border-line rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-sunken border-b border-line text-fg-muted font-bold">
                  <th className="p-4 text-start">{isAr ? 'المستخدم' : 'USER'}</th>
                  <th className="p-4 text-start">{isAr ? 'الجهاز المتصل' : 'DEVICE'}</th>
                  <th className="p-4 text-start">{isAr ? 'نظام التشغيل' : 'PLATFORM'}</th>
                  <th className="p-4 text-start">{isAr ? 'آخر ظهور' : 'LAST SEEN'}</th>
                  <th className="p-4 text-start">{isAr ? 'وقت تسجيل الدخول' : 'LOGIN TIME'}</th>
                  <th className="p-4 text-start">{isAr ? 'عنوان IP' : 'IP ADDRESS'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.filter((u: any) => u.sessionId).length > 0 ? (
                  users.filter((u: any) => u.sessionId).map((u: any) => (
                    <tr key={u.id} className="hover:bg-surface-sunken/50 transition-colors">
                      <td className="p-4 text-start">
                        <div className="flex items-center gap-2.5">
                          <img src={u.avatar} className="w-8 h-8 rounded-lg object-cover" />
                          <div className="min-w-0">
                            <p className="font-extrabold text-fg leading-none truncate">{u.name}</p>
                            <p className="text-[10px] text-fg-muted mt-1 font-mono truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-medium text-fg text-start">{u.deviceInfo || 'Unknown Device'}</td>
                      <td className="p-4 text-start">
                        <span className="bg-surface-sunken text-fg font-mono text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                          {u.platform || 'Web'}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-fg-muted text-start">
                        {u.lastSeen ? new Date(u.lastSeen).toLocaleString(isAr ? 'ar-JO' : 'en-US') : 'N/A'}
                      </td>
                      <td className="p-4 font-mono text-fg-muted text-start">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(isAr ? 'ar-JO' : 'en-US') : 'N/A'}
                      </td>
                      <td className="p-4 font-mono text-fg-muted text-start">
                        {u.lastLoginIP || 'N/A'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-fg-muted">
                      {isAr ? 'لا توجد جلسات نشطة مسجلة حالياً.' : 'No active sessions logged at the moment.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════ ZONE 3: DEVELOPER (QUARANTINE / DANGER) ══════════════ */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-rose-500">
            {isAr ? '⚠ المطوّر — أدوات خطرة' : '⚠ DEVELOPER — DANGER ZONE'}
          </span>
          <span className="h-px flex-1 bg-rose-100" />
        </div>
        <p className="text-[11px] text-rose-500/80 -mt-3">
          {isAr
            ? 'أدوات تطوير واختبار حساسة ومعزولة. لا تستخدمها على بيانات الإنتاج إلا عن قصد.'
            : 'Quarantined developer & testing tools. Do not run against production data unless intentional.'}
        </p>

        {/* Onboarding & Welcome Flow Testing Controls */}
        <div className="bg-surface-raised border border-line rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-line">
            <RotateCcw className="w-4 h-4 text-[#FF6B00]" />
            <h4 className="text-xs font-extrabold text-fg uppercase">
              {isAr ? 'بيئة تجربة المستخدم والتعليمات' : 'User Onboarding & Guides Testing'}
            </h4>
          </div>

          <p className="text-[11px] text-fg-muted leading-relaxed">
            {isAr
              ? 'أداة اختبار لإعادة تهيئة دليل المستخدم الجديد وتنبيهات التعليمات السياقية لغايات الفحص الفني.'
              : 'Developer testing utility to reset the new-user onboarding walkthrough and all contextual guides.'}
          </p>

          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-muted text-[10px] block uppercase font-bold">
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

        {/* 🧪 Simulator (admin-only engine test console) — inline gate preserved */}
        {isAdminUser(currentUser) && (
          <React.Suspense
            fallback={
              <div className="bg-surface-raised p-5 rounded-3xl border border-line text-xs text-fg-muted font-semibold">
                Loading simulator…
              </div>
            }
          >
            <SimulatorPanel />
          </React.Suspense>
        )}
      </section>
    </div>
  );
};

export default SystemSection;
