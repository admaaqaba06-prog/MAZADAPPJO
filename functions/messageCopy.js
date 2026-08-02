'use strict';
// The single source of customer-facing product copy, in both languages.
//
// This lived only in Arabic and in TWO places: functions/notify.js and a
// hand-mirrored copy inside the n8n Build Messages node. That duplication is
// why the branded email layer could ship on 2026-07-29 and be dead on arrival
// for four days — the parity guard compared the two copyFor implementations,
// which were both correct, while nothing compared emailFor to what the node
// actually sent.
//
// Pure: no Firestore, no network, no Date.now(). Every branch is testable.
//
// MUST NOT require('./notify') — notify.js re-exports copyFor from here, and a
// cycle would break every test that imports both.
//
// The Arabic below is live production wording, moved verbatim from
// functions/notify.js. functions/notifyCopyParity.test.js holds it byte-for-byte
// against the hand-mirrored copy in n8n/build-messages.js — if you reword the
// Arabic, you must reword the n8n node in the same commit or CI goes red.

const SUPPORTED_LANGS = Object.freeze(['ar', 'en']);

/**
 * Which language to write for. Arabic unless the user document explicitly says
 * English — missing doc, missing field, junk and non-strings all mean Arabic.
 * Arabic is the market default and the safe direction: an Arabic-only reader
 * must never receive English by accident. Never throws.
 */
function resolveLang(user) {
  const v = user && typeof user === 'object' ? user.language : null;
  return v === 'en' ? 'en' : 'ar';
}

/**
 * The full copy map for one language, with `data` already interpolated.
 * Built per call because every string interpolates — there is nothing to cache.
 */
function build(lang, data) {
  const d = data || {};
  const t = d.auctionTitle || d.orderId || '';
  // A SECOND-CHANCE offer reuses the `below_reserve_offer` event on purpose (the
  // live n8n workflow routes a fixed event contract and silently drops anything
  // else), but the situation is not the same: the bids did NOT fall short — the
  // winner failed to pay. `secondChance` + `offerStatus` pick copy that is true
  // for the actual recipient. `pending_seller` asks the SELLER to accept a bid
  // under their reserve; anything else is the RUNNER-UP being offered the lot.
  // Neither branch may say the bids fell short, in EITHER language.
  const sc = d.secondChance === true;

  if (lang === 'en') {
    return {
      auction_won: { type: 'win', title: 'You won the auction 🎉', description: `Congratulations — you won "${t}". Amount due ${d.totalDue || ''} JOD.` },
      payment_due: { type: 'order', title: 'Payment due', description: `Please pay for "${t}" within ${d.paymentHours || 24} hours.` },
      payment_reminder: { type: 'order', title: 'Payment reminder', description: `"${t}" is still awaiting payment. Please pay before the window closes.` },
      below_reserve_offer: !sc
        ? { type: 'info', title: 'Offer below your price', description: `The highest bid on "${t}" is ${d.topBid || ''} JOD — accept it?` }
        : d.offerStatus === 'pending_seller'
          ? { type: 'info', title: 'Second chance — your decision', description: `The winner of "${t}" never paid. The next-highest bid is ${d.topBid || ''} JOD, under your asking price — accept it?` }
          : { type: 'info', title: 'A second chance for you', description: `The winner of "${t}" never paid, so the item is offered to you at your bid of ${d.topBid || ''} JOD — accept it?` },
      below_reserve_seller_accepted: { type: 'win', title: 'The seller accepted your offer', description: `The seller accepted your bid on "${t}". Confirm to buy.` },
      below_reserve_declined: sc && d.declinedBy === 'buyer'
        ? { type: 'info', title: 'Second chance closed', description: `The bidder turned down the second chance on "${t}". You can list the item again.` }
        : { type: 'loss', title: 'Offer not accepted', description: `The seller did not accept your bid on "${t}".` },
      outbid: { type: 'outbid', title: 'You have been outbid', description: `Someone bid higher than you on "${t}".` },
      order_preparing: { type: 'order', title: 'Being prepared', description: `Your order "${t}" is being prepared.` },
      order_shipped: { type: 'order', title: 'Shipped', description: `Your order "${t}" has been shipped.` },
      order_delivered: { type: 'order', title: 'Delivered', description: `Your order "${t}" has been delivered.` },
      order_completed: { type: 'order', title: 'Order complete', description: `Your order "${t}" is complete.` },
      order_refunded: { type: 'refund', title: 'Refunded', description: `Your order "${t}" has been refunded.` },
      membership_rejected: { type: 'subscription', title: 'Membership review', description: d.reason || 'Your membership request was not approved.' },
      order_payment_rejected: { type: 'order', title: 'Payment proof rejected', description: d.reason || 'Please send your payment proof again.' },
      account_banned: { type: 'alert', title: 'Account restricted', description:
        d.reason === 'payment_default_repeat' ? 'Your account is suspended for 3 months for repeated non-payment.'
        : d.reason === 'payment_default' ? 'Bidding is restricted for 48 hours because of non-payment.'
        : 'Your account has been restricted. Please contact support for details.' },
      ban_lifted: { type: 'info', title: 'Restriction lifted', description: 'The restriction on your account has been lifted.' },
      seller_ship_nudge: { type: 'order', title: 'Shipping reminder', description: `Please ship order "${t}".` },
      buyer_confirm_nudge: { type: 'order', title: 'Confirm receipt', description: `Please confirm you received "${t}".` },
      return_requested: { type: 'order', title: 'Return requested', description: `A return request was opened on "${t}". Please review it.` },
      return_resolved: { type: 'order', title: 'Return request outcome',
        description: d.outcome === 'refunded'
          ? `The return of "${t}" was approved and the amount will be returned to your wallet.`
          : `The return request for "${t}" was reviewed and not approved.` },
    };
  }

  // Arabic — verbatim production wording. Do not reword without n8n/build-messages.js.
  // NOTE: functions/notifyCopyParity.test.js extracts the event keys from this
  // object by matching 4-space-indented keys after `const M = {`. Keep the shape.
  const M = {
    auction_won:  { type: 'win',   title: 'فزت بالمزاد 🎉',   description: `مبروك! ربحت "${t}". المبلغ المستحق ${d.totalDue || ''} د.أ.` },
    payment_due:  { type: 'order', title: 'دفعة مستحقة',       description: `يرجى دفع "${t}" خلال ${d.paymentHours || 24} ساعة.` },
    payment_reminder: { type: 'order', title: 'تذكير بالدفع',  description: `ما زال "${t}" بانتظار الدفع. بادر قبل انتهاء المهلة.` },
    below_reserve_offer: !sc
      ? { type: 'info', title: 'عرض أقل من السعر', description: `أعلى مزايدة على "${t}" ${d.topBid || ''} د.أ — تقبل؟` }
      : d.offerStatus === 'pending_seller'
        ? { type: 'info', title: 'فرصة ثانية — بانتظار قرارك', description: `لم يكمل الفائز بـ"${t}" الدفع. أعلى مزايدة بعده ${d.topBid || ''} د.أ وهي أقل من سعرك المطلوب — تقبل؟` }
        : { type: 'info', title: 'فرصة ثانية لك', description: `لم يكمل الفائز بـ"${t}" الدفع، والمنتج معروض عليك بمزايدتك ${d.topBid || ''} د.أ — تقبل؟` },
    below_reserve_seller_accepted: { type: 'win', title: 'البائع قبل عرضك', description: `قبل البائع مزايدتك على "${t}". أكّد للشراء.` },
    below_reserve_declined: sc && d.declinedBy === 'buyer'
      ? { type: 'info', title: 'أُغلقت الفرصة الثانية', description: `رفض المزايد الفرصة الثانية على "${t}". يمكنك إعادة عرض المنتج.` }
      : { type: 'loss', title: 'لم يُقبل العرض', description: `لم يقبل البائع مزايدتك على "${t}".` },
    outbid: { type: 'outbid', title: 'تمت المزايدة عليك', description: `تجاوزك أحدهم على "${t}".` },
    order_preparing: { type: 'order', title: 'يتم التجهيز', description: `طلبك "${t}" قيد التجهيز.` },
    order_shipped: { type: 'order', title: 'تم الشحن', description: `تم شحن طلبك "${t}".` },
    order_delivered: { type: 'order', title: 'تم التوصيل', description: `تم توصيل طلبك "${t}".` },
    order_completed: { type: 'order', title: 'اكتمل الطلب', description: `اكتمل طلبك "${t}".` },
    order_refunded: { type: 'refund', title: 'تم الاسترجاع', description: `تمت إعادة مبلغ طلبك "${t}".` },
    membership_rejected: { type: 'subscription', title: 'مراجعة العضوية', description: d.reason || 'تم رفض طلب العضوية.' },
    order_payment_rejected: { type: 'order', title: 'رُفض إثبات الدفع', description: d.reason || 'يرجى إعادة إرسال إثبات الدفع.' },
    account_banned: { type: 'alert', title: 'تم تقييد الحساب', description:
      d.reason === 'payment_default_repeat' ? 'تم تعليق حسابك ٣ أشهر لتكرار عدم الدفع.'
      : d.reason === 'payment_default' ? 'تم تقييد المزايدة ٤٨ ساعة بسبب عدم الدفع.'
      : 'تم تقييد حسابك. يرجى مراجعة الدعم لمزيد من التفاصيل.' },
    ban_lifted: { type: 'info', title: 'تم رفع التقييد', description: 'تم رفع التقييد عن حسابك.' },
    seller_ship_nudge: { type: 'order', title: 'ذكّر بالشحن', description: `يرجى شحن الطلب "${t}".` },
    buyer_confirm_nudge: { type: 'order', title: 'أكّد الاستلام', description: `يرجى تأكيد استلام "${t}".` },
    return_requested: { type: 'order', title: 'طلب إرجاع', description: `تم فتح طلب إرجاع على "${t}". يرجى المراجعة.` },
    return_resolved: { type: 'order', title: 'نتيجة طلب الإرجاع',
      description: d.outcome === 'refunded'
        ? `تمت الموافقة على إرجاع "${t}" وسيُعاد المبلغ إلى محفظتك.`
        : `تمت مراجعة طلب إرجاع "${t}" ولم تتم الموافقة عليه.` },
  };
  return M;
}

// Unknown event. The Arabic entry is byte-identical to what notify.js and the
// n8n node have always returned (empty description) — notifyCopyParity.test.js
// asserts it exactly, and the n8n node is not editable in this task. It is NOT
// silently dropped in-app: NotificationCenter.tsx filters only when the title
// AND the description are both blank, and the title is set.
const FALLBACK = {
  ar: { type: 'info', title: 'تنبيه', description: '' },
  en: { type: 'info', title: 'Notification', description: 'You have an update.' },
};

/**
 * @param {string} event   one of the 20 keys in notify.js CHANNEL_POLICY
 * @param {object} data    interpolation values; missing fields degrade to ''
 * @param {'ar'|'en'} lang unknown languages fall back to Arabic
 * @returns {{type: string, title: string, description: string}}
 */
function copyFor(event, data = {}, lang = 'ar') {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : 'ar';
  const map = build(l, data);
  if (map[event]) return map[event];
  // A KNOWN event with no entry in the asked-for language is a BUG, not an
  // unknown event, and the two must not be confused. Fall through to Arabic:
  // the copy is at least true and specific (it names the lot), where the generic
  // default says nothing — and, critically, it is DETECTABLE. Dropping straight
  // to FALLBACK would hide a deleted English entry behind a plausible-looking
  // 'info' notification; the Arabic-leak assertion in messageCopy.test.js turns
  // the same mistake into a red build. Verified by mutation (Task 1, Step 6).
  if (l !== 'ar') {
    const ar = build('ar', data);
    if (ar[event]) return ar[event];
  }
  return FALLBACK[l];
}

/**
 * Push-only wording, for the few events where a phone alert should say more
 * than the in-app line.
 *
 * A push is the only surface a bidder sees without opening anything, so for
 * `outbid` the NEW PRICE is the whole point — it is what decides whether they
 * come back and bid again. The in-app and WhatsApp copy deliberately stays
 * terse (the amount is one tap away there), so this cannot be fixed by editing
 * the shared entry without also changing the WhatsApp message.
 *
 * Everything not overridden here falls through to `copyFor`, so a push can
 * never silently lose an event: adding one to CHANNEL_POLICY needs no change
 * in this map. Overrides carry BOTH languages — `pushLanguage.test.js` asserts
 * every override has an `ar` and an `en` and that the shared copy is unchanged.
 *
 * @param {string} event
 * @param {object} data
 * @param {'ar'|'en'} lang unknown languages fall back to Arabic
 * @returns {{type: string, title: string, description: string}}
 */
function pushCopyFor(event, data = {}, lang = 'ar') {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : 'ar';
  const base = copyFor(event, data, l);
  // Same title derivation as build(), so the push names the lot exactly as the
  // in-app line does rather than inventing a second convention.
  const t = data.auctionTitle || data.orderId || '';
  // Western digits, per ARABIC_UI_DIGITS, in both languages.
  const amt = data.amount === 0 || data.amount ? String(data.amount) : '';
  if (event === 'outbid' && amt) {
    return l === 'en'
      ? { ...base, title: 'You have been outbid ⚡', description: `Someone bid ${amt} JOD on "${t}".` }
      : { ...base, title: 'تمت المزايدة عليك ⚡', description: `زايد أحدهم بـ ${amt} د.أ على "${t}".` };
  }
  return base;
}

module.exports = { copyFor, pushCopyFor, resolveLang, SUPPORTED_LANGS };
