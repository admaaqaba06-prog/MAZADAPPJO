import { db, handleFirestoreError, OperationType, getCallableFunction } from '../services/firebase';
import { collection, doc, addDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { Order } from '../types';
import { isAdminUser } from './adminAuth';

export type OrderStatus = "waiting_payment" | "paid" | "preparing_shipment" | "shipped" | "delivered" | "completed" | "disputed" | "cancelled" | "refunded";

// Allowed transitions mapping (Finite State Machine)
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  waiting_payment: ['paid', 'cancelled'],
  paid: ['preparing_shipment', 'refunded', 'disputed'],
  preparing_shipment: ['shipped'],
  shipped: ['delivered', 'disputed'],
  delivered: ['completed', 'disputed'],
  disputed: ['completed', 'refunded', 'paid'], // Admin resolutions
  completed: [],
  cancelled: [],
  refunded: [],
};

// Validate transition is legal
export function validateTransition(fromStatus: OrderStatus, toStatus: OrderStatus, escrowStatus?: string): void {
  // Check FSM allowed transitions
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new Error(`Illegal state transition from "${fromStatus}" to "${toStatus}".`);
  }

  // Prevent illegal transitions (extra rules)
  // 1. Cannot ship before payment
  if (toStatus === 'shipped' && fromStatus !== 'preparing_shipment') {
    throw new Error("Cannot ship before payment or preparation.");
  }

  // 2. Cannot release escrow before delivered (unless in disputed state where admin overrides)
  if (toStatus === 'completed' && escrowStatus === 'released' && fromStatus !== 'delivered' && fromStatus !== 'disputed') {
    throw new Error("Cannot release escrow before delivered or disputed.");
  }

  // 3. Cannot complete cancelled orders
  if (fromStatus === 'cancelled') {
    throw new Error("Cannot complete cancelled orders.");
  }

  // 4. Cannot refund completed orders
  if (fromStatus === 'completed' && toStatus === 'refunded') {
    throw new Error("Cannot refund completed orders.");
  }
}

// Check role permissions for specific actions
export function checkRolePermission(action: string, role: 'buyer' | 'seller' | 'admin'): boolean {
  const buyerActions = ['pay', 'cancel_before_payment', 'confirm_delivery', 'open_dispute'];
  // mark_delivered is a claim of FACT (the goods arrived), not a money move —
  // escrow release remains admin-only below. Admins inherit every action, which
  // is what lets the team advance an order on the seller's behalf.
  const sellerActions = ['prepare_shipment', 'mark_shipped', 'mark_delivered', 'upload_tracking', 'open_dispute'];
  const adminActions = ['release_escrow', 'refund', 'resolve_dispute', 'force_close'];

  if (role === 'admin') {
    return adminActions.includes(action) || buyerActions.includes(action) || sellerActions.includes(action); // Admin can do anything
  }
  if (role === 'buyer') {
    return buyerActions.includes(action);
  }
  if (role === 'seller') {
    return sellerActions.includes(action);
  }
  return false;
}

// Central transition function
export async function executeOrderTransition(
  order: Order,
  action: 'pay' | 'cancel_before_payment' | 'prepare_shipment' | 'mark_shipped' | 'mark_delivered' | 'confirm_delivery' | 'open_dispute' | 'release_escrow' | 'refund' | 'resolve_dispute' | 'force_close',
  currentUser: { id: string; email: string; name: string; role: 'user' | 'seller' | 'admin'; isAdmin?: boolean },
  extraFields?: {
    trackingNumber?: string;
    resolutionType?: 'release' | 'refund' | 'resume';
    disputeReason?: string;
    /**
     * Free-text context from whoever advanced the order — "called seller,
     * courier collects Tuesday". Additive: the canned bilingual activity
     * message still goes to the buyer and seller, this is what the TEAM reads
     * when picking the order up next.
     *
     * INTERNAL. It is written to orders/{orderId}/adminNotes, which
     * firestore.rules gates on isAdmin() for read AND write. It must never go
     * onto the activity record — OrderDetailsView onSnapshot-subscribes
     * orders/{orderId}/activity for the buyer and the seller, so anything
     * written there is transmitted to their browsers regardless of what the UI
     * chooses to render.
     */
    note?: string;
  }
): Promise<any> {
  // Determine role
  let role: 'buyer' | 'seller' | 'admin' = 'buyer';
  if (isAdminUser(currentUser)) {
    role = 'admin';
  } else if (currentUser.id === order.sellerId) {
    role = 'seller';
  } else if (currentUser.id === order.buyerId) {
    role = 'buyer';
  }

  // Check permission
  if (!checkRolePermission(action, role)) {
    throw new Error(`Role "${role}" does not have permission to execute action "${action}".`);
  }

  // CRITICAL FIX PHASE 1 — Secure Escrow Release Cloud Function delegation
  if (
    action === 'release_escrow' || 
    action === 'force_close' || 
    (action === 'resolve_dispute' && extraFields?.resolutionType === 'release') ||
    action === 'confirm_delivery'
  ) {
    const releaseCallable = await getCallableFunction<
      { orderId: string; action: 'buyer_confirm_delivery' | 'admin_release' | 'admin_force_close' }, 
      { success: boolean; message: string; alreadyReleased?: boolean }
    >('releaseOrderEscrow');

    let cfAction: 'buyer_confirm_delivery' | 'admin_release' | 'admin_force_close' = 'buyer_confirm_delivery';
    if (action === 'release_escrow' || (action === 'resolve_dispute' && extraFields?.resolutionType === 'release')) {
      cfAction = 'admin_release';
    } else if (action === 'force_close') {
      cfAction = 'admin_force_close';
    } else if (action === 'confirm_delivery') {
      cfAction = 'buyer_confirm_delivery';
    }

    try {
      const result = await releaseCallable({
        orderId: order.id,
        action: cfAction
      });
      if (!result.data || !result.data.success) {
        throw new Error(result.data?.message || 'Escrow release Cloud Function execution failed.');
      }
      return {
        success: true,
        alreadyReleased: !!result.data.alreadyReleased,
        message: result.data.message
      };
    } catch (err: any) {
      console.error('Error executing escrow release:', err);
      throw new Error(err.message || 'تعذر تحرير المبلغ، حاول مرة أخرى');
    }
  }

  // CRITICAL FIX PHASE 2 — Secure Escrow Refund Cloud Function delegation
  if (
    action === 'refund' ||
    (action === 'resolve_dispute' && extraFields?.resolutionType === 'refund')
  ) {
    const refundCallable = await getCallableFunction<
      { orderId: string; action: 'admin_refund' }, 
      { success: boolean; message: string; alreadyRefunded?: boolean }
    >('refundOrderEscrow');

    try {
      const result = await refundCallable({
        orderId: order.id,
        action: 'admin_refund'
      });
      if (!result.data || !result.data.success) {
        throw new Error(result.data?.message || 'Escrow refund Cloud Function execution failed.');
      }
      return {
        success: true,
        alreadyRefunded: !!result.data.alreadyRefunded,
        message: result.data.message
      };
    } catch (err: any) {
      console.error('Error executing escrow refund:', err);
      throw new Error(err.message || 'تعذر استرداد المبلغ، حاول مرة أخرى');
    }
  }

  const fromStatus = order.status as OrderStatus;
  let toStatus: OrderStatus = fromStatus;
  let updateFields: Partial<Order> & Record<string, any> = {};

  let activityType = '';
  let activityMessageAr = '';
  let activityMessageEn = '';

  // Determine transition target and fields
  switch (action as any) {
    case 'pay':
      toStatus = 'paid';
      // NOTE: escrowStatus intentionally NOT written here — the client guard
      // below forbids that key (server owns escrow state), and including it
      // made this transition throw on every call.
      updateFields = {
        status: 'paid',
        paymentStatus: 'paid'
      };
      activityType = 'Buyer Paid';
      activityMessageAr = 'رفع المشتري إثبات الدفع عبر كليك — بانتظار تأكيد الإدارة.';
      activityMessageEn = 'Buyer submitted CliQ payment proof — pending admin confirmation.';
      break;

    case 'cancel_before_payment':
      toStatus = 'cancelled';
      updateFields = {
        status: 'cancelled',
        paymentStatus: 'unpaid'
      };
      activityType = 'Order Cancelled';
      activityMessageAr = 'تم إلغاء الطلب وتحرير الضمان المالي بالكامل.';
      activityMessageEn = 'Order cancelled and escrow holdings resolved successfully.';
      break;

    case 'prepare_shipment':
      toStatus = 'preparing_shipment';
      updateFields = {
        status: 'preparing_shipment',
        shippingStatus: 'preparing'
      };
      activityType = 'Seller Started Shipment';
      activityMessageAr = 'البائع يجهز المنتج والملصقات للشحن اللوجستي.';
      activityMessageEn = 'Seller started preparing items and labels for parcel fulfillment.';
      break;

    case 'mark_shipped':
      toStatus = 'shipped';
      // NEVER FABRICATE A TRACKING NUMBER. This used to fall back to a random
      // `MJ-######`, which was then interpolated into the activity messages the
      // BUYER and SELLER read — a tracking ID that tracks nothing. The admin
      // relay (handleAdvanceOrder) passes only `{ note }`, so that fallback was
      // the default for every admin-driven "Out for delivery". The parcel really
      // is in transit, so say exactly that and omit the ID we do not have.
      const tracking = typeof extraFields?.trackingNumber === 'string'
        ? extraFields.trackingNumber.trim()
        : '';
      updateFields = {
        status: 'shipped',
        shippingStatus: 'shipped',
        // Conditional spread: Firestore rejects an explicit `undefined`, and
        // writing an empty string would clobber a tracking number set earlier.
        ...(tracking ? { trackingNumber: tracking } : {})
      };
      activityType = 'Package Shipped';
      activityMessageAr = tracking
        ? `تم شحن الطرد بنجاح مع شركة التوصيل. رقم التتبع: ${tracking}`
        : 'تم شحن الطرد بنجاح مع شركة التوصيل.';
      activityMessageEn = tracking
        ? `Parcel in transit with courier. Tracking ID: ${tracking}`
        : 'Parcel in transit with courier.';
      break;

    case 'mark_delivered':
      toStatus = 'delivered';
      // MONEY-FREE BY CONSTRUCTION. `confirm_delivery` above routes to the
      // releaseOrderEscrow Cloud Function, so using it to record "the goods
      // arrived" would also pay the seller. The admin relay needs those
      // separate: goods arrive -> buyer accepts or rejects -> only THEN does
      // accounting release. So this writes status/shippingStatus only, and the
      // forbiddenFields guard below still rejects any escrow key.
      updateFields = {
        status: 'delivered',
        shippingStatus: 'delivered'
      };
      activityType = 'Package Delivered';
      activityMessageAr = 'تم تسليم الطرد للمشتري — بانتظار تأكيد الاستلام قبل تحرير المبلغ.';
      activityMessageEn = 'Parcel delivered to the buyer — awaiting acceptance before funds are released.';
      break;

    case 'open_dispute':
      toStatus = 'disputed';
      updateFields = {
        status: 'disputed',
        disputeReason: extraFields?.disputeReason || ''
      };
      activityType = 'Dispute Opened';
      activityMessageAr = 'تم فتح نزاع رسمي. مزاد أوقف تحويل المبلغ للبائع لحين مراجعة الفريق.';
      activityMessageEn = 'Formal dispute logged. Mazad has paused the payout to the seller pending review.';
      break;

    case 'resolve_dispute':
      const resType = extraFields?.resolutionType || 'release';
      if (resType === 'resume') {
        toStatus = 'paid';
        updateFields = {
          status: 'paid'
        };
        activityType = 'Dispute Closed (Resumed)';
        activityMessageAr = 'تم إغلاق النزاع وإعادة الطلب للحالة النشطة المدفوعة.';
        activityMessageEn = 'Dispute closed and order set back to active Paid status.';
      } else {
        throw new Error(`Financial transitions (resolution: ${resType}) are server-only and cannot be executed client-side.`);
      }
      break;

    default:
      throw new Error(`Unknown action type or action requires server-side processing: ${action}`);
  }

  // Validate the status transition
  validateTransition(fromStatus, toStatus, updateFields.escrowStatus || order.escrowStatus);

  const orderPath = `orders/${order.id}`;

  try {
    // Financial transitions are server-only. Do not update escrow/payment settlement fields from the client.
    const forbiddenFields = [
      'escrowStatus',
      'financialStatus',
      'settlementStatus',
      'payoutStatus',
      'escrowReleasedAt',
      'escrowRefundedAt',
      'escrowReleasedBy',
      'escrowRefundedBy'
    ];
    const forbiddenStatuses = ['completed', 'refunded'];
    const forbiddenEscrows = ['released', 'refunded'];

    for (const key of Object.keys(updateFields)) {
      if (forbiddenFields.includes(key)) {
        throw new Error(`Financial transitions are server-only. Do not update escrow/payment settlement fields from the client. Forbidden field: "${key}"`);
      }
    }
    if (updateFields.status && forbiddenStatuses.includes(updateFields.status)) {
      throw new Error(`Financial transitions are server-only. Do not update escrow/payment settlement fields from the client. Forbidden status: "${updateFields.status}"`);
    }
    if (updateFields.escrowStatus && forbiddenEscrows.includes(updateFields.escrowStatus)) {
      throw new Error(`Financial transitions are server-only. Do not update escrow/payment settlement fields from the client. Forbidden escrowStatus: "${updateFields.escrowStatus}"`);
    }

    // 1. Update Order in Firestore
    const orderRef = doc(db, 'orders', order.id);
    await updateDoc(orderRef, {
      ...updateFields,
      updatedAt: Timestamp.now()
    });

    // 2. Add Order Activity record to orders/{orderId}/activity subcollection
    const activityColRef = collection(db, 'orders', order.id, 'activity');
    const activityId = `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const trimmedNote = typeof extraFields?.note === 'string' ? extraFields.note.trim() : '';
    await addDoc(activityColRef, {
      id: activityId,
      type: activityType,
      messageAr: activityMessageAr,
      messageEn: activityMessageEn,
      message: activityMessageEn, // English default as requested
      // NO `note` KEY HERE, EVER. The buyer and the seller can read this
      // subcollection (firestore.rules) and OrderDetailsView keeps a live
      // onSnapshot on it, so a note written here reaches their browsers even
      // though nothing renders it. The note goes to adminNotes below instead.
      performedBy: currentUser.id,
      performedByName: currentUser.name || 'User',
      timestamp: Timestamp.now()
    });

    // 3. Write adminActions log if role is Admin.
    //
    // NEVER throws — by the time we get here the order has already been moved
    // and the activity record written, so a failure in this audit entry must
    // only log. Letting it escape meant a transition that HAD committed was
    // reported to the caller as a failure; the admin would then retry and get
    // "Illegal state transition" because the order had already advanced.
    //
    // Note this write cannot currently succeed from a client AT ALL:
    // firestore.rules has `match /adminActions/{actionId} { allow write: if
    // false; }`, which denies admins too, so every admin transition takes this
    // catch. Do NOT "clean up" the try/catch — until adminActions is written
    // server-side (or the rule is deliberately changed), removing it re-breaks
    // every admin-driven order transition.
    if (role === 'admin') {
      try {
        const adminActionsColRef = collection(db, 'adminActions');
        const adminActionId = `adm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await addDoc(adminActionsColRef, {
          id: adminActionId,
          orderId: order.id,
          action: action,
          adminId: currentUser.id,
          adminName: currentUser.name || 'System Administrator',
          timestamp: Timestamp.now(),
          details: `Transitioned order from ${fromStatus} to ${toStatus} via action: ${action}`
            + (trimmedNote ? ` — note: ${trimmedNote}` : '')
        });
      } catch (auditError: any) {
        console.warn(
          `[orderWorkflow] adminActions audit write failed for order ${order.id} (${action}):`,
          auditError && auditError.message
        );
      }
    }

    // 4. Write the internal note to orders/{orderId}/adminNotes.
    //
    // Separate subcollection, not the activity record and not the order doc:
    // buyer and seller can read BOTH of those. adminNotes is isAdmin() on read
    // and write, so this is the only channel where "seller is dodging us" is
    // genuinely internal.
    //
    // NEVER throws — same contract as the adminActions audit write above. The
    // order has already moved and the activity record is already written; a
    // note is context for the next team member, not the operation, so a failed
    // write must only log. Letting it escape would report a transition that HAD
    // committed as a failure, and the retry would then fail as "Illegal state
    // transition" because the order had already advanced.
    if (trimmedNote) {
      try {
        const adminNotesColRef = collection(db, 'orders', order.id, 'adminNotes');
        await addDoc(adminNotesColRef, {
          note: trimmedNote,
          performedBy: currentUser.id,
          performedByName: currentUser.name || 'User',
          action: action,
          fromStatus: fromStatus,
          toStatus: toStatus,
          timestamp: Timestamp.now()
        });
      } catch (noteError: any) {
        console.warn(
          `[orderWorkflow] adminNotes write failed for order ${order.id} (${action}):`,
          noteError && noteError.message
        );
      }
    }

    // 5. Send Notifications (Buyer, Seller, Admin)
    const notificationsColRef = collection(db, 'notifications');
    const timestamp = Date.now();

    const notifyUsers = [
      {
        userId: order.buyerId,
        titleAr: 'تحديث الطلب',
        titleEn: 'Order Update',
        descAr: `الطلب الخاص بك انتقل من حالة [${fromStatus}] إلى [${toStatus}]: ${activityMessageAr}`,
        descEn: `Your order transitioned from [${fromStatus}] to [${toStatus}]: ${activityMessageEn}`
      },
      {
        userId: order.sellerId,
        titleAr: 'تحديث الطلب المبيع',
        titleEn: 'Sold Order Update',
        descAr: `طلب البيع الخاص بك انتقل من حالة [${fromStatus}] إلى [${toStatus}]: ${activityMessageAr}`,
        descEn: `Your sold order transitioned from [${fromStatus}] to [${toStatus}]: ${activityMessageEn}`
      },
      {
        userId: 'admin',
        titleAr: 'إشعار النظام والمشرف',
        titleEn: 'Admin System Notification',
        descAr: `الطلب رقم ${order.id.substring(0, 8)} انتقل إلى [${toStatus}] بواسطة [${currentUser.name}]`,
        descEn: `Order #${order.id.substring(0, 8)} transitioned to [${toStatus}] by [${currentUser.name}]`
      }
    ];

    // NEVER throws — same contract as the audit write above. The order has
    // already moved; a notification is a courtesy, not the operation, so a
    // failed fan-out must only log. The catch sits INSIDE the loop so one
    // undeliverable recipient does not silently drop the other two.
    for (const notif of notifyUsers) {
      try {
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await addDoc(notificationsColRef, {
          id: notifId,
          userId: notif.userId,
          title: isAdminUser(currentUser) ? notif.titleEn : notif.titleAr, // Bilingual choice
          titleAr: notif.titleAr,
          titleEn: notif.titleEn,
          description: isAdminUser(currentUser) ? notif.descEn : notif.descAr,
          descriptionAr: notif.descAr,
          descriptionEn: notif.descEn,
          type: (toStatus as string) === 'completed' ? 'win' : 'info',
          timestamp,
          read: false,
          orderId: order.id
        });
      } catch (notifyError: any) {
        console.warn(
          `[orderWorkflow] notification write failed for order ${order.id} -> ${notif.userId}:`,
          notifyError && notifyError.message
        );
      }
    }

  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, orderPath);
  }
}
