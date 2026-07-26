'use strict';
// Pure notification policy + scheduling helpers. NO firebase deps (root Vitest
// must load this; see #138). channelsFor is the single source of truth for which
// channels an event reaches — spam-y events (outbid) skip email here.

const ALL = { inapp: true, whatsapp: true, email: true };
const INAPP_WA = { inapp: true, whatsapp: true, email: false };
const INAPP_ONLY = { inapp: true, whatsapp: false, email: false };

const CHANNEL_POLICY = {
  auction_won: ALL,
  payment_due: ALL,
  payment_reminder: ALL,
  below_reserve_offer: ALL,
  below_reserve_seller_accepted: ALL,
  below_reserve_declined: INAPP_ONLY,
  outbid: INAPP_WA,
  order_preparing: ALL,
  order_shipped: ALL,
  order_delivered: ALL,
  order_completed: ALL,
  order_refunded: ALL,
  membership_rejected: ALL,
  order_payment_rejected: ALL,
  account_banned: ALL,
  ban_lifted: ALL,
  seller_ship_nudge: INAPP_WA,
  buyer_confirm_nudge: INAPP_WA,
};

function channelsFor(event) {
  return CHANNEL_POLICY[event] || INAPP_ONLY;
}

// Bilingual (Arabic-primary) in-app copy map. Terse; interpolates from `data`.
// Every CHANNEL_POLICY event has an entry; unknown → safe info default.
// `type` must be one of the Notification union in src/types.ts.
function copyFor(event, data = {}) {
  const t = data.auctionTitle || data.orderId || '';
  const M = {
    auction_won:  { type: 'win',   title: 'فزت بالمزاد 🎉',   description: `مبروك! ربحت "${t}". المبلغ المستحق ${data.totalDue || ''} د.أ.` },
    payment_due:  { type: 'order', title: 'دفعة مستحقة',       description: `يرجى دفع "${t}" خلال ${data.paymentHours || 24} ساعة.` },
    payment_reminder: { type: 'order', title: 'تذكير بالدفع',  description: `ما زال "${t}" بانتظار الدفع. بادر قبل انتهاء المهلة.` },
    below_reserve_offer: { type: 'info', title: 'عرض أقل من السعر', description: `أعلى مزايدة على "${t}" ${data.topBid || ''} د.أ — تقبل؟` },
    below_reserve_seller_accepted: { type: 'win', title: 'البائع قبل عرضك', description: `قبل البائع مزايدتك على "${t}". أكّد للشراء.` },
    below_reserve_declined: { type: 'loss', title: 'لم يُقبل العرض', description: `لم يقبل البائع مزايدتك على "${t}".` },
    outbid: { type: 'outbid', title: 'تمت المزايدة عليك', description: `تجاوزك أحدهم على "${t}".` },
    order_preparing: { type: 'order', title: 'يتم التجهيز', description: `طلبك "${t}" قيد التجهيز.` },
    order_shipped: { type: 'order', title: 'تم الشحن', description: `تم شحن طلبك "${t}".` },
    order_delivered: { type: 'order', title: 'تم التوصيل', description: `تم توصيل طلبك "${t}".` },
    order_completed: { type: 'order', title: 'اكتمل الطلب', description: `اكتمل طلبك "${t}".` },
    order_refunded: { type: 'refund', title: 'تم الاسترجاع', description: `تمت إعادة مبلغ طلبك "${t}".` },
    membership_rejected: { type: 'subscription', title: 'مراجعة العضوية', description: data.reason || 'تم رفض طلب العضوية.' },
    order_payment_rejected: { type: 'order', title: 'رُفض إثبات الدفع', description: data.reason || 'يرجى إعادة إرسال إثبات الدفع.' },
    account_banned: { type: 'alert', title: 'تم تقييد الحساب', description:
      data.reason === 'payment_default_repeat' ? 'تم تعليق حسابك ٣ أشهر لتكرار عدم الدفع.'
      : data.reason === 'payment_default' ? 'تم تقييد المزايدة ٤٨ ساعة بسبب عدم الدفع.'
      : 'تم تقييد حسابك. يرجى مراجعة الدعم لمزيد من التفاصيل.' },
    ban_lifted: { type: 'info', title: 'تم رفع التقييد', description: 'يمكنك المزايدة مجدداً.' },
    seller_ship_nudge: { type: 'order', title: 'ذكّر بالشحن', description: `يرجى شحن الطلب "${t}".` },
    buyer_confirm_nudge: { type: 'order', title: 'أكّد الاستلام', description: `يرجى تأكيد استلام "${t}".` },
  };
  return M[event] || { type: 'info', title: 'تنبيه', description: '' };
}

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Which unpaid-order reminders are due now (and not already sent). 'final' (last
// 2h) supersedes '50' so a late first-run sends one message, not two. The cron
// (index.js) marks both flags when it sends 'final'.
function dueReminders(order, nowMs) {
  if (!order || order.status !== 'waiting_payment') return [];
  const deadline = toMs(order.paymentDeadlineAt);
  if (deadline == null || nowMs >= deadline) return [];
  const hours = Number(order.paymentWindowHours) > 0 ? Number(order.paymentWindowHours) : 24;
  const windowMs = hours * 3600 * 1000;
  const finalThreshold = deadline - 2 * 3600 * 1000;
  const halfway = deadline - windowMs / 2;
  // Inside the final window, 'final' supersedes '50': never fall back to '50'
  // once we've reached the last 2h (the cron marks both flags when it sends final).
  if (nowMs >= finalThreshold) return order.remindFinalSent ? [] : ['final'];
  if (!order.remind50Sent && nowMs >= halfway) return ['50'];
  return [];
}

module.exports = { channelsFor, copyFor, dueReminders };
