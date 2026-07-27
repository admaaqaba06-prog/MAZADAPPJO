import React, { useMemo, useState } from 'react';
import {
  bucketOrder,
  isOverdue,
  hoursBetween,
  daysBetween,
  FulfillmentBucket,
} from '../../utils/fulfillmentQueues';

/**
 * Slice C — Fulfillment (Job 2): the admin's "keep orders moving" queue as
 * three age-sorted buckets (awaiting shipment / delivery / release). Purely
 * presentational + per-row local busy state: ALL data and write handlers are
 * injected by AdminDashboardView. This section creates NO Firestore listeners.
 */
export interface FulfillmentSectionProps {
  isAr: boolean;
  orders: any[];                                  // realOrders (sim-excluded, matches Slice B's fix)
  onNudge: (orderId: string, kind: 'ship' | 'confirm_delivery') => Promise<void>;
  onReleaseEscrow: (orderId: string) => Promise<void>;
}

// The buckets this section currently renders. 'awaiting_payment' exists in
// FulfillmentBucket but has no queue UI here yet, so it stays excluded.
type LiveBucket = Exclude<FulfillmentBucket, null | 'awaiting_payment'>;

// Mirror AdminDashboardView's createdAt normalization: Firestore Timestamp
// ({seconds}) → ms, else pass-through epoch ms, else fall back to createdAt/now.
function orderUpdatedAtMs(order: any, now: number): number {
  return order?.updatedAt?.seconds
    ? order.updatedAt.seconds * 1000
    : (order?.updatedAt || order?.createdAt || now);
}

// Bilingual age label since stage entry: whole days once ≥ 1d, else hours.
function ageLabel(fromMs: number, now: number, isAr: boolean): string {
  const d = daysBetween(fromMs, now);
  if (d >= 1) return isAr ? `${d}ي` : `${d}d`;
  const h = Math.max(0, hoursBetween(fromMs, now));
  return isAr ? `${h}س` : `${h}h`;
}

// Same Timestamp/ms normalization as orderUpdatedAtMs, for the lastNudgedAt stamp.
function nudgedAtMs(order: any): number | null {
  const raw = order?.lastNudgedAt;
  if (!raw) return null;
  return raw?.seconds ? raw.seconds * 1000 : (typeof raw === 'number' ? raw : null);
}

// Bilingual "nudged Xh/Xd ago" — same h/d threshold as ageLabel.
function nudgedLabel(fromMs: number, now: number, isAr: boolean): string {
  const d = daysBetween(fromMs, now);
  if (d >= 1) return isAr ? `تم التذكير قبل ${d}ي` : `Nudged ${d}d ago`;
  const h = Math.max(0, hoursBetween(fromMs, now));
  return isAr ? `تم التذكير قبل ${h}س` : `Nudged ${h}h ago`;
}

interface BucketConfig {
  id: LiveBucket;
  title: { ar: string; en: string };
  nameLabel: { ar: string; en: string };
  nameField: 'sellerName' | 'buyerName';
}

const BUCKETS: BucketConfig[] = [
  {
    id: 'awaiting_shipment',
    title: { ar: 'بانتظار الشحن', en: 'Awaiting shipment' },
    nameLabel: { ar: 'البائع', en: 'Seller' },
    nameField: 'sellerName',
  },
  {
    id: 'awaiting_delivery',
    title: { ar: 'بانتظار التسليم', en: 'Awaiting delivery' },
    nameLabel: { ar: 'المشتري', en: 'Buyer' },
    nameField: 'buyerName',
  },
  {
    id: 'awaiting_release',
    title: { ar: 'بانتظار تحرير الضمان', en: 'Awaiting release' },
    nameLabel: { ar: 'البائع', en: 'Seller' },
    nameField: 'sellerName',
  },
];

interface DerivedOrder {
  order: any;
  updatedAtMs: number;
  overdue: boolean;
}

/**
 * One fulfillment row. Owns its own busy + feedback state (single-button
 * action per row) — mirrors PaymentVerifyCard's busy/disable idiom without
 * needing a shared component for this simpler case.
 */
const FulfillmentRow: React.FC<{
  entry: DerivedOrder;
  config: BucketConfig;
  isAr: boolean;
  now: number;
  onAction: () => Promise<void>;
  actionLabel: string;
}> = ({ entry, config, isAr, now, onAction, actionLabel }) => {
  const { order, updatedAtMs, overdue } = entry;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'ok' | 'error' | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onAction();
      setFeedback('ok');
    } catch {
      setFeedback('error');
    } finally {
      setBusy(false);
    }
  };

  const counterpart = order[config.nameField] || '—';
  const isRelease = config.id === 'awaiting_release';
  const nudgedMs = nudgedAtMs(order);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3 flex-wrap animate-fadeIn">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-extrabold text-sm text-gray-900 leading-snug truncate">
            {order.auctionTitle || (isAr ? 'طلب' : 'Order')}
          </h4>
          <span
            className={`text-[10px] font-black rounded-full px-2 py-0.5 whitespace-nowrap ${
              overdue ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {ageLabel(updatedAtMs, now, isAr)}
          </span>
          {overdue && (
            <span className="text-[10px] bg-red-50 text-red-650 border border-red-100 rounded-full font-bold px-2 py-0.5 whitespace-nowrap">
              ⚠ {isAr ? 'متأخر' : 'overdue'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 font-bold">
          {isAr ? config.nameLabel.ar : config.nameLabel.en}:{' '}
          <span className="text-gray-800">{counterpart}</span>
        </p>
        {nudgedMs && (
          <p className="text-[10px] text-gray-400 font-bold">
            {nudgedLabel(nudgedMs, now, isAr)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {feedback === 'ok' && (
          <span className="text-[11px] font-bold text-emerald-600 whitespace-nowrap">
            {isAr ? 'تم ✅' : '✅ done'}
          </span>
        )}
        {feedback === 'error' && (
          <span className="text-[11px] font-bold text-red-650 whitespace-nowrap">
            {isAr ? 'فشل — أعد المحاولة' : 'Failed — retry'}
          </span>
        )}
        <button
          disabled={busy}
          onClick={run}
          className={`font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs min-w-[120px] transition-all ${
            busy
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : isRelease
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                : 'bg-gray-900 hover:bg-black text-white cursor-pointer'
          }`}
        >
          {busy ? (isAr ? '…' : '…') : actionLabel}
        </button>
      </div>
    </div>
  );
};

export const FulfillmentSection: React.FC<FulfillmentSectionProps> = ({
  isAr,
  orders,
  onNudge,
  onReleaseEscrow,
}) => {
  const now = Date.now();

  // Bucket + sort oldest-first once per render. isOverdue re-derives the
  // bucket internally; we pass the normalized updatedAtMs it needs.
  const grouped = useMemo(() => {
    const map: Record<LiveBucket, DerivedOrder[]> = {
      awaiting_shipment: [],
      awaiting_delivery: [],
      awaiting_release: [],
    };
    for (const order of orders || []) {
      const bucket = bucketOrder(order);
      // bucketOrder can also return 'awaiting_payment', which has no queue in
      // this section yet — skip it rather than indexing a missing map key.
      if (!bucket || !(bucket in map)) continue;
      const updatedAtMs = orderUpdatedAtMs(order, now);
      const overdue = isOverdue({ ...order, updatedAtMs }, now);
      map[bucket as LiveBucket].push({ order, updatedAtMs, overdue });
    }
    for (const key of Object.keys(map) as LiveBucket[]) {
      map[key].sort((a, b) => a.updatedAtMs - b.updatedAtMs); // oldest / most stuck first
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const totalCount =
    grouped.awaiting_shipment.length +
    grouped.awaiting_delivery.length +
    grouped.awaiting_release.length;

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-4">
      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-gray-900">
            {isAr ? 'متابعة التنفيذ' : 'Fulfillment'}
          </h3>
          <span className="text-xs font-black text-gray-500 font-mono">{totalCount}</span>
        </div>
        <p className="text-xs text-gray-500">
          {isAr
            ? 'الطلبات المدفوعة قيد التنفيذ — نبّه البائع/المشتري أو حرّر الضمان عند التسليم.'
            : 'Paid orders in motion — nudge the seller/buyer or release escrow once delivered.'}
        </p>
      </div>

      {BUCKETS.map((config) => {
        const entries = grouped[config.id];
        const overdueCount = entries.filter((e) => e.overdue).length;

        return (
          <div key={config.id} className="space-y-3">
            {/* Bucket sub-header */}
            <div className="flex items-center gap-2 px-1">
              <h4 className="text-sm font-black text-gray-800">
                {isAr ? config.title.ar : config.title.en}
              </h4>
              <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                {entries.length}
              </span>
              {overdueCount > 0 && (
                <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                  {overdueCount} {isAr ? 'متأخر' : 'overdue'}
                </span>
              )}
            </div>

            {entries.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-400 font-bold">
                {isAr ? 'لا يوجد طلبات متأخرة هنا ✅' : 'Nothing stuck here ✅'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {entries.map((entry) => {
                  const id = entry.order.id;
                  if (config.id === 'awaiting_shipment') {
                    return (
                      <FulfillmentRow
                        key={id}
                        entry={entry}
                        config={config}
                        isAr={isAr}
                        now={now}
                        actionLabel={isAr ? 'تذكير بالشحن' : 'Nudge'}
                        onAction={() => onNudge(id, 'ship')}
                      />
                    );
                  }
                  if (config.id === 'awaiting_delivery') {
                    return (
                      <FulfillmentRow
                        key={id}
                        entry={entry}
                        config={config}
                        isAr={isAr}
                        now={now}
                        actionLabel={isAr ? 'تذكير بالتسليم' : 'Nudge'}
                        onAction={() => onNudge(id, 'confirm_delivery')}
                      />
                    );
                  }
                  return (
                    <FulfillmentRow
                      key={id}
                      entry={entry}
                      config={config}
                      isAr={isAr}
                      now={now}
                      actionLabel={isAr ? 'تحرير الضمان' : 'Release escrow'}
                      onAction={() => onReleaseEscrow(id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FulfillmentSection;
