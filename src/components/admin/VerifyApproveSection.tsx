import React, { useMemo, useState } from 'react';
import { FileCheck2, FileText, ShieldCheck } from 'lucide-react';
import { PaymentVerifyCard } from './PaymentVerifyCard';
import { AdminListSkeleton, EmptyState } from '../FeedbackStates';
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
  // CliQ wallet top-ups (absorbed from the former PAYMENTS tab) — verbatim
  // escrow release/refund handlers from the shell.
  isLoading: boolean;
  cliqDrops: any[];
  onReleaseCliq: (id: string) => void;
  onRefundCliq: (id: string) => void;
  isRealUrl: (url?: string) => boolean;
  getReceiptImageSrc: (url?: string) => string;
  onViewReceipt: (url: string | null) => void;
  // Memberships failsafe (absorbed from the former SUBSCRIPTIONS tab) — users
  // whose receipt was too large to attach, approved/rejected directly.
  pendingByUsersOnly: any[];
  onApproveUserDirect: (user: any) => void;
  onRejectUserDirect: (user: any) => void;
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
  isLoading,
  cliqDrops,
  onReleaseCliq,
  onRefundCliq,
  isRealUrl,
  getReceiptImageSrc,
  onViewReceipt,
  pendingByUsersOnly,
  onApproveUserDirect,
  onRejectUserDirect,
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
      <div className="bg-white p-5 rounded-3xl border border-gray-200 space-y-1">
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
      <div className="bg-white border border-gray-200 rounded-2xl p-1.5 flex items-center gap-1">
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
        <>
          {membershipsCount === 0 ? emptyState : (
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
          )}

          {/* Failsafe: pending users — no receipt attached (moved from the
              former SUBSCRIPTIONS tab, markup unchanged). */}
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
                    <div key={user.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                      <div>
                        <h5 className="font-extrabold text-xs text-gray-900 leading-none">{user.name}</h5>
                        <p className="text-[10px] text-gray-400 mt-1">{user.email}</p>
                        <span className="inline-block text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-1.5 border border-amber-100">
                          {isAr ? 'اشتراك معلّق' : 'Subscription Pending'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onApproveUserDirect(user)}
                          className="bg-[#FF6B00] hover:bg-[#E05E00] text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl shadow-xs"
                        >
                          {isAr ? 'تفعيل فوري' : 'APPROVE VIP'}
                        </button>
                        <button
                          onClick={() => onRejectUserDirect(user)}
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
        </>
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
                cliqSenderPhone={o.cliqSenderPhone}
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

      {/* ==========================================
          CliQ wallet top-ups (moved from the former PAYMENTS tab, markup
          unchanged). Third receipt type in the Verify queue.
          ========================================== */}
      <div className="space-y-4">
            <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-xs">
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
              ) : cliqDrops.length > 0 ? (
                cliqDrops.map((dep) => (
                  <div key={dep.id} className="bg-white border border-gray-200 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden transition-all hover:border-gray-200">
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
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
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
                            onViewReceipt(isRealUrl(rawUrl) ? getReceiptImageSrc(rawUrl) : null);
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
                          onClick={() => onReleaseCliq(dep.id)}
                          className={`flex-1 md:w-44 font-extrabold text-xs py-2 px-3 rounded-xl transition-all shadow-xs ${
                            isRealUrl(dep.receiptUrl ?? dep.paymentProofUrl ?? dep.paymentProofImage ?? dep.proofUrl ?? dep.paymentImageUrl ?? null)
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isAr ? 'قبول وشحن الرصيد' : 'APPROVE & ADD JOD'}
                        </button>
                        <button
                          onClick={() => onRefundCliq(dep.id)}
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
    </div>
  );
};

export default VerifyApproveSection;
