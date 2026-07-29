/**
 * Wave 4 — the admin Action Center queue.
 *
 * ONE pure function decides everything the admin panel puts in front of a
 * human: what qualifies, why, how urgent, and in what order. It touches no
 * Firestore and renders nothing, because vitest here is `environment: 'node'`
 * with no jsdom — logic left in a component ships untested. If the queue
 * DECIDES something, it belongs in this file.
 *
 * Post-Wave-3 this queue should be near-empty on a healthy day. A row means the
 * self-service flow did not complete.
 */
import { isPendingOrderPayment } from './paymentReceipt';
import { bucketOrder, isOverdue } from './fulfillmentQueues';
import { formatNumeral } from './arabicNumerals';

export type ActionKind =
  | 'verify_order_payment'
  | 'verify_membership'
  | 'approve_listing'
  | 'payout'
  | 'delivery_stalled'
  | 'dispute';

export type ActionReason =
  | 'receipt_to_verify'
  | 'membership_to_verify'
  | 'lot_awaiting_review'
  | 'payout_to_approve'
  | 'seller_hasnt_prepped'
  | 'buyer_hasnt_confirmed'
  | 'code_attempts_exhausted'
  | 'dispute_open'
  | 'return_claim';

export type ActionSeverity = 'blocking' | 'aging' | 'new';

export interface ActionRow {
  /** `${kind}:${entityId}` — stable across rebuilds, so React keys and expand state survive. */
  id: string;
  kind: ActionKind;
  entityId: string;
  reason: ActionReason;
  /** Epoch ms the wait started, or null when the source timestamp is unusable. */
  waitingSinceMs: number | null;
  severity: ActionSeverity;
  amountFils?: number;
  label: { ar: string; en: string };
}

export interface ActionQueueInput {
  /** Real (sim-excluded) orders. Drives payments, stalled deliveries, disputes and returns. */
  orders: any[];
  /** Auctions under review — status 'processing' or legacy 'pending'. */
  pendingListings: any[];
  subscriptionRequests: any[];
  withdrawals: any[];
}

/**
 * One number for the whole operation. MJ: shipment within 24h of payment, and
 * delivery is Amman and surrounding areas. Nobody should have to remember which
 * queue has which clock.
 */
export const SLA_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize a stored timestamp to epoch ms, or null.
 *
 * Rejects rather than coerces — the same discipline as `deadlineToMs` in
 * fulfillmentQueues.ts. A junk value that read as epoch 0 would mark its row
 * eternally overdue and park it permanently at the top of the queue.
 */
function toMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (value && typeof value === 'object') {
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return null;
}

/** JOD (as stored on legacy docs) → fils. Returns undefined for junk. */
function toFils(jod: unknown): number | undefined {
  const n = Number(jod);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
}

function severityFor(reason: ActionReason, waitingSinceMs: number | null, nowMs: number): ActionSeverity {
  // Blocking is about state, not age: the counterparty cannot proceed without a
  // human no matter how recent it is.
  if (reason === 'dispute_open' || reason === 'return_claim' || reason === 'code_attempts_exhausted') {
    return 'blocking';
  }
  if (waitingSinceMs === null) return 'new';
  return nowMs - waitingSinceMs > SLA_MS ? 'aging' : 'new';
}

const SEVERITY_RANK: Record<ActionSeverity, number> = { blocking: 0, aging: 1, new: 2 };

function row(
  kind: ActionKind,
  entityId: string,
  reason: ActionReason,
  waitingSinceMs: number | null,
  nowMs: number,
  label: { ar: string; en: string },
  amountFils?: number,
): ActionRow {
  return {
    id: `${kind}:${entityId}`,
    kind,
    entityId,
    reason,
    waitingSinceMs,
    severity: severityFor(reason, waitingSinceMs, nowMs),
    ...(amountFils !== undefined ? { amountFils } : {}),
    label,
  };
}

export function buildActionQueue(input: ActionQueueInput, nowMs: number): ActionRow[] {
  const rows: ActionRow[] = [];
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const withdrawals = Array.isArray(input.withdrawals) ? input.withdrawals : [];
  const subs = Array.isArray(input.subscriptionRequests) ? input.subscriptionRequests : [];

  // --- Money: order payments awaiting verification ------------------------
  // Same predicate the Verify queue uses, so the queue and that view can never
  // disagree about what is pending.
  for (const o of orders) {
    if (!o || !o.id) continue;
    if (!isPendingOrderPayment(o)) continue;
    rows.push(row(
      'verify_order_payment', o.id, 'receipt_to_verify',
      toMs(o.paymentSubmittedAt) ?? toMs(o.updatedAt),
      nowMs,
      { ar: 'إيصال دفع بانتظار التحقق', en: 'Payment receipt to verify' },
      toFils(o.totalDue ?? o.winningBidAmount),
    ));
  }

  // --- Money: membership requests -----------------------------------------
  // Filtered HERE, not left to the caller. AdminDashboardView happens to
  // pre-filter its subscription snapshot to pending, which is the only reason
  // production looked right: 45 requests existed, 33 approved and 9 rejected.
  // A second caller — or a change to that filter — would have flooded the queue
  // with 42 already-handled rows. Deciding what needs a human is this module's
  // whole job; it does not delegate that upward.
  //
  // No status at all is treated as NOT pending: ambiguous is not actionable,
  // and it matches the filter the dashboard already applies.
  for (const s of subs) {
    if (!s || !s.id) continue;
    const pending = s.status === 'pending' || s.subscriptionStatus === 'pending';
    if (!pending) continue;
    rows.push(row(
      'verify_membership', s.id, 'membership_to_verify',
      toMs(s.createdAt),
      nowMs,
      { ar: 'طلب عضوية بانتظار التحقق', en: 'Membership request to verify' },
    ));
  }

  // --- Money: payouts ------------------------------------------------------
  for (const w of withdrawals) {
    if (!w || !w.id) continue;
    if (w.status !== 'pending_review') continue;
    rows.push(row(
      'payout', w.id, 'payout_to_approve',
      toMs(w.timestamp),
      nowMs,
      { ar: 'طلب سحب بانتظار الموافقة', en: 'Payout awaiting approval' },
      toFils(w.amount),
    ));
  }

  // --- Customer lots awaiting review --------------------------------------
  // Doubly important since PR #188: approving a lot is what grants the seller
  // their account, so a lot sitting here is a seller who cannot trade at all.
  const listings = Array.isArray(input.pendingListings) ? input.pendingListings : [];
  for (const a of listings) {
    if (!a || !a.id) continue;
    const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim() : '';
    rows.push(row(
      'approve_listing', a.id, 'lot_awaiting_review',
      toMs(a.createdAt),
      nowMs,
      {
        ar: title ? `مزاد بانتظار الاعتماد: ${title}` : 'مزاد بانتظار الاعتماد',
        en: title ? `Lot awaiting approval: ${title}` : 'Lot awaiting approval',
      },
    ));
  }

  // --- Trouble: disputes and return claims --------------------------------
  // Derived from ORDERS, not a disputes collection — that is what
  // AdminDashboardView's openDisputesCount does, and returnClaim lives on the
  // order (functions/returns.js buildReturnClaim). Always blocking: a dispute
  // is someone stuck, however recent.
  for (const o of orders) {
    if (!o || !o.id) continue;
    if (o.status !== 'disputed') continue;
    const isReturn = o.disputeType === 'return' || (o.returnClaim && o.returnClaim.status === 'open');
    rows.push(row(
      'dispute', o.id, isReturn ? 'return_claim' : 'dispute_open',
      toMs(o.updatedAt),
      nowMs,
      isReturn
        ? { ar: 'طلب إرجاع بحاجة إلى قرار', en: 'Return claim needs a decision' }
        : { ar: 'نزاع مفتوح', en: 'Open dispute' },
      toFils(o.winningBidAmount),
    ));
  }

  // --- Stalled deliveries --------------------------------------------------
  // ONE row per order, not one per reason: the admin needs the order, and a
  // single order producing three rows would be the noise this wave removes.
  // Reasons are ordered by urgency — a locked-out buyer outranks mere lateness.
  for (const o of orders) {
    if (!o || !o.id) continue;
    if (o.status === 'disputed') continue;       // already a trouble row above

    const lockedOut = Number(o.deliveryCodeAttempts) >= 5 && o.status === 'out_for_delivery';

    const updatedAtMs = toMs(o.updatedAt) ?? toMs(o.createdAt);
    const overdue = updatedAtMs !== null && isOverdue(
      {
        status: o.status,
        paymentVerified: o.paymentVerified,
        paymentWindowHours: o.paymentWindowHours,
        paymentDeadlineAt: o.paymentDeadlineAt,
        updatedAtMs,
      },
      nowMs,
    );

    // `awaiting_payment` is the buyer owing money, not a stalled delivery — the
    // payment-default enforcer already handles it, and surfacing it here would
    // refill the queue with orders nobody can act on.
    const bucket = bucketOrder({ status: o.status, paymentVerified: o.paymentVerified });
    const isDeliveryBucket = bucket === 'awaiting_shipment' || bucket === 'awaiting_delivery' || bucket === 'awaiting_release';

    if (!lockedOut && (!overdue || !isDeliveryBucket)) continue;

    const reason: ActionReason = lockedOut
      ? 'code_attempts_exhausted'
      : bucket === 'awaiting_shipment'
        ? 'seller_hasnt_prepped'
        : 'buyer_hasnt_confirmed';

    const label = {
      code_attempts_exhausted: { ar: 'المشتري استنفد محاولات رمز التسليم', en: 'Buyer locked out of delivery code' },
      seller_hasnt_prepped: { ar: 'البائع لم يبدأ التجهيز', en: "Seller hasn't started preparing" },
      buyer_hasnt_confirmed: { ar: 'المشتري لم يؤكد الاستلام', en: "Buyer hasn't confirmed receipt" },
    }[reason];

    rows.push(row('delivery_stalled', o.id, reason, updatedAtMs, nowMs, label, toFils(o.winningBidAmount)));
  }

  return sortQueue(rows);
}

/**
 * Severity, then oldest first, then larger amount first. Fully deterministic —
 * no tie is left to array order, so the queue does not reshuffle between
 * renders when two rows are otherwise equal.
 */
export function sortQueue(rows: ActionRow[]): ActionRow[] {
  return [...rows].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    const aw = a.waitingSinceMs ?? Number.POSITIVE_INFINITY;
    const bw = b.waitingSinceMs ?? Number.POSITIVE_INFINITY;
    if (aw !== bw) return aw - bw;
    const amt = (b.amountFils ?? 0) - (a.amountFils ?? 0);
    if (amt !== 0) return amt;
    return a.id.localeCompare(b.id);
  });
}

/**
 * "3h" / "2d" — how long a row has waited.
 *
 * Returns '' for an unusable timestamp: a row that says nothing is honest, one
 * that says "56 years" is not. Clamps at zero so clock skew never renders a
 * negative age.
 *
 * Digits go through `formatNumeral`, which owns the app-wide Arabic numeral
 * policy (currently Western). Interpolating raw digits here would be exactly
 * the drift that module was created to remove.
 */
export function formatWaitingFor(waitingSinceMs: number | null, nowMs: number, lang: 'ar' | 'en'): string {
  if (waitingSinceMs === null) return '';
  const isAr = lang === 'ar';
  const ms = Math.max(0, nowMs - waitingSinceMs);
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return isAr ? `${formatNumeral(hours, true)} ساعات` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return isAr ? `${formatNumeral(days, true)} أيام` : `${days}d`;
}
