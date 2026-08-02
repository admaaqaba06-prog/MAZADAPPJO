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
  return_requested: ALL,
  return_resolved: ALL,
};

function channelsFor(event) {
  return CHANNEL_POLICY[event] || INAPP_ONLY;
}

// Product copy now lives in ONE place, in both languages: ./messageCopy.js.
// Re-exported here so existing callers (index.js, notifyCopyParity.test.js) keep
// working. Note the direction of the dependency: messageCopy.js must NOT require
// this file — CHANNEL_POLICY stays here, copy stays there, no cycle.
const { copyFor } = require('./messageCopy');

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

module.exports = { CHANNEL_POLICY, channelsFor, copyFor, dueReminders };
