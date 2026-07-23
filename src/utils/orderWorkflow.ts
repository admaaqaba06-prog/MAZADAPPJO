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
  const sellerActions = ['prepare_shipment', 'mark_shipped', 'upload_tracking', 'open_dispute'];
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
  action: 'pay' | 'cancel_before_payment' | 'prepare_shipment' | 'mark_shipped' | 'confirm_delivery' | 'open_dispute' | 'release_escrow' | 'refund' | 'resolve_dispute' | 'force_close',
  currentUser: { id: string; email: string; name: string; role: 'user' | 'seller' | 'admin'; isAdmin?: boolean },
  extraFields?: { trackingNumber?: string; resolutionType?: 'release' | 'refund' | 'resume' }
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
      const tracking = extraFields?.trackingNumber || 'MJ-' + Math.floor(100000 + Math.random() * 900000);
      updateFields = {
        status: 'shipped',
        shippingStatus: 'shipped',
        trackingNumber: tracking
      };
      activityType = 'Package Shipped';
      activityMessageAr = `تم شحن الطرد بنجاح مع شركة التوصيل. رقم التتبع: ${tracking}`;
      activityMessageEn = `Parcel in transit with courier. Tracking ID: ${tracking}`;
      break;

    case 'open_dispute':
      toStatus = 'disputed';
      updateFields = {
        status: 'disputed'
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
    await addDoc(activityColRef, {
      id: activityId,
      type: activityType,
      messageAr: activityMessageAr,
      messageEn: activityMessageEn,
      message: activityMessageEn, // English default as requested
      performedBy: currentUser.id,
      performedByName: currentUser.name || 'User',
      timestamp: Timestamp.now()
    });

    // 3. Write adminActions log if role is Admin
    if (role === 'admin') {
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
      });
    }

    // 4. Send Notifications (Buyer, Seller, Admin)
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

    for (const notif of notifyUsers) {
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
    }

  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, orderPath);
  }
}
