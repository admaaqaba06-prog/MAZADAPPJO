import React, { useState } from 'react';
import { formatWaitingFor, type ActionRow } from '../../utils/actionQueue';
import { PaymentVerifyCard } from './PaymentVerifyCard';
import { ListingApprovalCard } from './cards/ListingApprovalCard';
import { DisputeCard } from './cards/DisputeCard';
import { PayoutCard } from './cards/PayoutCard';
import { StalledDeliveryCard } from './cards/StalledDeliveryCard';
import type { ViewingMode } from '../../utils/viewing';

/**
 * Wave 4 — the Action Center.
 *
 * The one place anything needing a human shows up. Everything else in the admin
 * panel is reference, visited deliberately.
 *
 * THIS COMPONENT DECIDES NOTHING. It does not sort, filter, rank or compute
 * severity — `buildActionQueue` owns all of that, because vitest here is
 * node-only and logic living in a component cannot be tested. If you find
 * yourself adding a comparison here, it belongs in `utils/actionQueue.ts`.
 *
 * Rows expand in place: you never leave the queue, and expand state is keyed on
 * the row id, which is stable across rebuilds, so a live snapshot arriving does
 * not collapse the row the admin is working in.
 */
export interface ActionCenterHandlers {
  onApproveOrderPayment: (orderId: string) => void | Promise<any>;
  onRejectOrderPayment: (orderId: string, reason: string) => void | Promise<any>;
  onApproveMembership: (requestId: string) => void | Promise<any>;
  onRejectMembership: (requestId: string, reason: string) => void | Promise<any>;
  onApproveListing: (auctionId: string, viewing?: ViewingMode, viewingPlace?: string) => void | Promise<any>;
  onRejectListing: (auctionId: string, reason?: string) => void | Promise<any>;
  /** transferRef is REQUIRED — the server refuses a payout approval without it. */
  onApprovePayout: (withdrawalId: string, transferRef: string) => Promise<any>;
  onRejectPayout: (withdrawalId: string, reason: string) => Promise<any>;
  onResolveDispute: (orderId: string, resolutionType: 'release' | 'refund' | 'resume', notes: string) => Promise<void>;
  onNudge: (orderId: string, kind: 'ship' | 'confirm_delivery') => Promise<void>;
  onAdvance: (order: any, note: string) => Promise<{ success: boolean; message?: string }>;
  onOpenOrder: (orderId: string) => void;
}

export interface ActionCenterSectionProps {
  isAr: boolean;
  /** `readonly`: this is the memoized, optimism-filtered queue — never sort or push it. */
  queue: readonly ActionRow[];
  /** Source records, so a row can find its entity without another subscription. */
  orders: any[];
  pendingListings: any[];
  subscriptionRequests: any[];
  withdrawals: any[];
  users: any[];
  /**
   * True while THIS row's action is in flight — `useAdminAction().isPending`,
   * keyed on `ActionRow.id`. Six of the handlers below sit behind a callable
   * that cold-starts for ~2s, and without this the button looks dead and gets
   * clicked again.
   */
  isPending: (rowId: string) => boolean;
  handlers: ActionCenterHandlers;
}

const SEVERITY_DOT: Record<string, string> = {
  blocking: 'bg-rose-500',
  aging: 'bg-amber-500',
  new: 'bg-gray-300',
};

export const ActionCenterSection: React.FC<ActionCenterSectionProps> = ({
  isAr, queue, orders, pendingListings, subscriptionRequests, withdrawals, users, isPending, handlers,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const now = Date.now();

  const findOrder = (id: string) => orders.find((o: any) => o?.id === id);
  const userName = (uid: string) => {
    const u = users.find((x: any) => x?.id === uid);
    return (u && (u.name || u.email || u.phoneNumber)) || (isAr ? 'مستخدم' : 'User');
  };

  const renderBody = (r: ActionRow): React.ReactNode => {
    // One flag per ROW, not per button: `useAdminAction` gates a row's approve
    // and its reject under the same id, so while either is in flight the whole
    // card is busy. That is what the admin means by "I clicked it".
    const busy = isPending(r.id);
    switch (r.kind) {
      case 'verify_order_payment': {
        const order = findOrder(r.entityId);
        if (!order) return null;
        return (
          <PaymentVerifyCard
            record={order}
            title={order.auctionTitle || order.id}
            expectedAmountJod={Number(order.totalDue ?? order.winningBidAmount ?? 0)}
            payerName={order.buyerName || userName(order.buyerId)}
            cliqSenderPhone={order.cliqSenderPhone}
            approveLabel={isAr ? 'تأكيد الدفع' : 'Mark verified'}
            isAr={isAr}
            busy={busy}
            onApprove={() => handlers.onApproveOrderPayment(order.id)}
            onReject={(reason) => handlers.onRejectOrderPayment(order.id, reason)}
          />
        );
      }
      case 'verify_membership': {
        const req = subscriptionRequests.find((s: any) => s?.id === r.entityId);
        if (!req) return null;
        return (
          <PaymentVerifyCard
            record={req}
            title={isAr ? 'طلب عضوية' : 'Membership request'}
            expectedAmountJod={Number(req.price ?? 0)}
            payerName={userName(req.userId)}
            approveLabel={isAr ? 'اعتماد العضوية' : 'Approve membership'}
            isAr={isAr}
            busy={busy}
            onApprove={() => handlers.onApproveMembership(req.id)}
            onReject={(reason) => handlers.onRejectMembership(req.id, reason)}
          />
        );
      }
      case 'approve_listing': {
        const auction = pendingListings.find((a: any) => a?.id === r.entityId);
        if (!auction) return null;
        return (
          <ListingApprovalCard
            auction={auction}
            isAr={isAr}
            busy={busy}
            onApprove={handlers.onApproveListing}
            onReject={handlers.onRejectListing}
          />
        );
      }
      case 'payout': {
        const w = withdrawals.find((x: any) => x?.id === r.entityId);
        if (!w) return null;
        return (
          <PayoutCard
            withdrawal={w}
            userName={userName(w.userId)}
            isAr={isAr}
            busy={busy}
            onApprove={handlers.onApprovePayout}
            onReject={handlers.onRejectPayout}
          />
        );
      }
      case 'dispute': {
        const order = findOrder(r.entityId);
        if (!order) return null;
        return <DisputeCard order={order} isAr={isAr} busy={busy} onResolve={handlers.onResolveDispute} />;
      }
      case 'delivery_stalled': {
        const order = findOrder(r.entityId);
        if (!order) return null;
        return (
          <StalledDeliveryCard
            order={order}
            reason={r.reason}
            isAr={isAr}
            busy={busy}
            onNudge={handlers.onNudge}
            onAdvance={handlers.onAdvance}
            onOpenOrder={handlers.onOpenOrder}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-950">{isAr ? 'بحاجة إلى انتباهك' : 'Needs your attention'}</h2>
          {queue.length > 0 && (
            <span className="min-w-6 h-6 px-2 inline-flex items-center justify-center rounded-full bg-[#FF6B00] text-white text-xs font-black">
              {queue.length}
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="text-xs font-semibold text-gray-400">
            {isAr ? 'كل شيء تحت السيطرة — لا يوجد ما ينتظر.' : 'All clear — nothing waiting.'}
          </p>
        ) : (
          <div className="space-y-2">
            {queue.map((r) => {
              const open = expandedId === r.id;
              const age = formatWaitingFor(r.waitingSinceMs, now, isAr ? 'ar' : 'en');
              return (
                <div key={r.id} className={`rounded-2xl border transition ${open ? 'border-[#FF6B00] bg-orange-50/20' : 'border-gray-200 hover:border-orange-300'}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : r.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[r.severity]}`} />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-gray-800 truncate">
                          {isAr ? r.label.ar : r.label.en}
                        </span>
                        <span className="block text-[10px] font-mono uppercase text-gray-400 mt-0.5">
                          {[age, r.amountFils !== undefined
                            ? `${(r.amountFils / 1000).toLocaleString('en-US')} ${isAr ? 'د.أ' : 'JOD'}`
                            : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </span>
                    <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                      {renderBody(r) ?? (
                        <p className="text-[11px] text-gray-400 font-semibold">
                          {isAr ? 'تم التعامل مع هذا العنصر — سيختفي بعد التحديث.' : 'This item was already handled — it will disappear on the next refresh.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionCenterSection;
