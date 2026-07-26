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

module.exports = { channelsFor };
