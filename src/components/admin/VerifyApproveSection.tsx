import React, { useMemo, useState } from 'react';
import { PaymentVerifyCard } from './PaymentVerifyCard';
import {
  normalizeReceiptUrl,
  findDuplicateFingerprints,
  receiptFingerprint,
  isPendingOrderPayment,
} from '../../utils/paymentReceipt';
import { SUBSCRIPTION_TIERS } from '../../constants/subscriptionTiers';

/**
 * Slice B — Verify & Approve: the admin's daily money job as one queue-first
 * tab (memberships + order payments). Purely presentational + local segment
 * state: ALL data and write handlers are injected by AdminDashboardView.
 * This section creates NO Firestore listeners — ever.
 */
export interface VerifyApproveSectionProps {
  isAr: boolean;
  subscriptionRequests: any[];
  orders: any[];                        // admin's orders array (same source the ORDERS tab uses)
  onApproveSubscription: (req: any) => Promise<void>;
  onRejectSubscription: (req: any, reason: string) => Promise<void>;
  onVerifyOrderPayment: (orderId: string) => Promise<void>;
  onRejectOrderPayment: (orderId: string, reason: string) => Promise<void>;
}

// Legacy plan-label aliases + legacy tiers, mirroring functions/subscriptionTiers.js.
// 'quarterly' is honored on old requests but has no offered price, so it never
// participates in the amount-mismatch check.
const PLAN_ALIASES: Record<string, string> = { yearly: 'annual' };

const PLAN_LABELS: Record<string, { ar: string; en: string }> = {
  monthly: { ar: 'شهري', en: 'Monthly' },
  quarterly: { ar: 'ربع سنوي', en: 'Quarterly' },
  semiannual: { ar: 'نصف سنوي', en: 'Semiannual' },
  annual: { ar: 'سنوي', en: 'Annual' },
};

function normalizePlanId(req: any): string {
  const raw = req?.plan ?? req?.planId ?? req?.subscriptionPlan;
  if (typeof raw !== 'string') return '';
  const lowered = raw.toLowerCase().trim();
  return PLAN_ALIASES[lowered] || lowered;
}

/** Canonical tier price for the request's plan, or null when the plan is
 * unknown/legacy (no offered price to compare against). */
function canonicalTierPrice(req: any): number | null {
  const plan = normalizePlanId(req);
  const tier = (SUBSCRIPTION_TIERS as Record<string, { price: number }>)[plan];
  return tier ? tier.price : null;
}

function planLabel(req: any, isAr: boolean): string {
  const plan = normalizePlanId(req);
  const label = PLAN_LABELS[plan];
  if (label) return isAr ? label.ar : label.en;
  return plan || (isAr ? 'اشتراك' : 'Membership');
}

type VerifyQueue = 'memberships' | 'orderPayments';

export const VerifyApproveSection: React.FC<VerifyApproveSectionProps> = ({
  isAr,
  subscriptionRequests,
  orders,
  onApproveSubscription,
  onRejectSubscription,
  onVerifyOrderPayment,
  onRejectOrderPayment,
}) => {
  const [queue, setQueue] = useState<VerifyQueue>('memberships');
  // One in-flight action at a time — the acting card shows busy, and the
  // guard prevents double-fires while a callable is running.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Order-payments queue: receipt attached + not yet verified + in a
  // reviewable status (waiting_payment self-claim or legacy 'paid').
  const orderQueue = useMemo(
    () => (orders || []).filter(isPendingOrderPayment),
    [orders]
  );

  // Dup guard — memberships: across ALL pending requests' fingerprints.
  const subDupFps = useMemo(
    () =>
      findDuplicateFingerprints(
        (subscriptionRequests || []).map((r: any) => ({ id: r.id, url: normalizeReceiptUrl(r) }))
      ),
    [subscriptionRequests]
  );

  // Dup guard — orders: across the queue + already-verified orders, so a
  // receipt reused from a past verified payment still flags.
  const orderDupFps = useMemo(
    () =>
      findDuplicateFingerprints(
        (orders || [])
          .filter((o: any) => isPendingOrderPayment(o) || o.paymentVerified === true)
          .map((o: any) => ({ id: o.id, url: normalizeReceiptUrl(o) }))
      ),
    [orders]
  );

  const runAction = async (id: string, action: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const isDup = (record: any, fps: Set<string>): boolean => {
    const fp = receiptFingerprint(normalizeReceiptUrl(record));
    return !!fp && fps.has(fp);
  };

  const membershipsCount = (subscriptionRequests || []).length;
  const ordersCount = orderQueue.length;

  const segments: { id: VerifyQueue; label: string; count: number }[] = [
    { id: 'memberships', label: isAr ? 'العضويات' : 'Memberships', count: membershipsCount },
    { id: 'orderPayments', label: isAr ? 'دفعات الطلبات' : 'Order payments', count: ordersCount },
  ];

  const emptyState = (
    <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400 font-bold">
      {isAr ? 'لا يوجد طلبات بانتظار المراجعة ✅' : 'Nothing waiting for review ✅'}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 space-y-1">
        <h3 className="text-lg font-black text-gray-900">
          {isAr ? 'التحقق والموافقات' : 'Verify & Approve'}
        </h3>
        <p className="text-xs text-gray-500">
          {isAr
            ? 'مراجعة إيصالات كليك للعضويات ودفعات الطلبات — الموافقة أو الرفض مع السبب.'
            : 'Review CliQ receipts for memberships and order payments — approve, or reject with a reason.'}
        </p>
      </div>

      {/* Segment switch */}
      <div className="bg-white border border-gray-150 rounded-2xl p-1.5 flex items-center gap-1">
        {segments.map((seg) => {
          const active = queue === seg.id;
          return (
            <button
              key={seg.id}
              onClick={() => setQueue(seg.id)}
              className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                active ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>{seg.label}</span>
              <span
                className={`text-[9px] font-black rounded-full px-1.5 py-0.5 ${
                  seg.count > 0
                    ? active
                      ? 'bg-red-500 text-white'
                      : 'bg-red-50 text-red-650'
                    : active
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {seg.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Memberships queue */}
      {queue === 'memberships' && (
        membershipsCount === 0 ? emptyState : (
          <div className="space-y-3">
            {subscriptionRequests.map((req: any) => {
              const tierPrice = canonicalTierPrice(req);
              return (
                <PaymentVerifyCard
                  key={req.id}
                  record={req}
                  title={`${planLabel(req, isAr)} · ${req.userName || req.userEmail || (isAr ? 'عضو' : 'Member')}`}
                  expectedAmountJod={typeof req.price === 'number' ? req.price : Number(req.price) || 0}
                  amountMismatch={tierPrice !== null && req.price !== tierPrice}
                  payerName={req.transferFullName || req.userName || '—'}
                  payerPhone={req.transferPhone}
                  isDuplicateReceipt={isDup(req, subDupFps)}
                  approveLabel={isAr ? 'قبول وتفعيل' : 'Approve'}
                  busy={busyId === req.id}
                  isAr={isAr}
                  onApprove={() => runAction(req.id, () => onApproveSubscription(req))}
                  onReject={(reason) => runAction(req.id, () => onRejectSubscription(req, reason))}
                />
              );
            })}
          </div>
        )
      )}

      {/* Order-payments queue */}
      {queue === 'orderPayments' && (
        ordersCount === 0 ? emptyState : (
          <div className="space-y-3">
            {orderQueue.map((o: any) => (
              <PaymentVerifyCard
                key={o.id}
                record={o}
                title={o.auctionTitle || (isAr ? 'طلب' : 'Order')}
                expectedAmountJod={typeof o.totalDue === 'number' ? o.totalDue : Number(o.totalDue) || 0}
                payerName={o.buyerName || '—'}
                payerPhone={o.deliveryPhone}
                isDuplicateReceipt={isDup(o, orderDupFps)}
                approveLabel={isAr ? 'تأكيد الدفع' : 'Mark verified'}
                busy={busyId === o.id}
                isAr={isAr}
                onApprove={() => runAction(o.id, () => onVerifyOrderPayment(o.id))}
                onReject={(reason) => runAction(o.id, () => onRejectOrderPayment(o.id, reason))}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default VerifyApproveSection;
