/**
 * Email content layer.
 *
 * Every channel used to share ONE string from `notify.js copyFor()`, so email
 * rendered an in-app toast inside an HTML shell. The live payment reminder read
 * «ما زال "ارقيله " بانتظار الدفع. بادر قبل انتهاء المهلة.» — no amount, no
 * deadline, no order reference, a stray space inside the quotes, and an "open
 * the app" button — while the order carried all of it.
 *
 * In-app has to be terse; email has room. This is the email's own copy.
 *
 * It also lets n8n stop duplicating a copy map: the webhook payload now carries
 * rendered content (subject / heading / rows / CTA / footer), so the workflow
 * becomes a dumb template and email wording changes here, in review, with tests.
 *
 * Arabic-primary, matching every other user-facing surface — but no longer
 * Arabic-only: `emailFor(event, data, lang)` renders the same email in English
 * for a user whose profile says so. Arabic remains the default for every caller
 * that does not ask, because an Arabic-only reader must never be sent English by
 * accident. Digits stay Western in BOTH languages, per the app-wide numeral
 * policy (see src/utils/arabicNumerals.ts, ARABIC_UI_DIGITS = 'western').
 */

const SITE = 'https://www.mazad-jo.com';

/**
 * Arabic unless the caller explicitly asks for English. Undefined, junk, a
 * non-string and an unsupported language all mean Arabic — same shape and same
 * safe direction as messageCopy.js resolveLang(). Never throws.
 */
function normalizeLang(lang) {
  return lang === 'en' ? 'en' : 'ar';
}

/**
 * Footer identity. These values are the registered entity behind Mazad and
 * already back the Terms and Privacy documents (docs/legal/) — the emails were
 * simply the one surface that never used them.
 *
 * THE IDENTITY ITSELF DOES NOT TRANSLATE. `Al Hani Commercial Brokerage LLC` is
 * the name on the registration, and `200213982` is that registration; an English
 * email states them exactly as an Arabic one does. Only the LABELS around them
 * (below) change language, plus the address and opening hours, which are prose
 * rather than identity.
 */
const BRAND = {
  nameAr: 'مزاد جو',
  nameEn: 'MAZAD JO',
  legalName: 'Al Hani Commercial Brokerage LLC',
  legalNameAr: 'شركة الهاني للوساطة التجارية ذ.م.م',
  registration: '200213982',
  addressAr: 'عمّان — شارع المدينة المنورة — مجمع سعد ٤ — مقابل حبيبة',
  addressEn: 'Amman — Al Madina Al Munawara Street — Saad 4 Complex — opposite Habibah',
  hoursAr: 'من ١٠ صباحاً حتى ٧ مساءً، السبت إلى الخميس',
  hoursEn: '10:00 AM to 7:00 PM, Saturday to Thursday',
  supportPhone: '+962781444899',
  paymentsPhone: '+962785446498',
  termsUrl: `${SITE}/terms`,
  privacyUrl: `${SITE}/privacy`,
  site: SITE,
};

/** The words WRAPPING the identity — these are the only part that translates. */
const BRAND_LABELS = {
  ar: {
    registration: 'السجل التجاري',
    address: 'العنوان',
    hours: 'ساعات العمل',
    support: 'الدعم',
    payments: 'الدفعات',
    terms: 'الشروط والأحكام',
    privacy: 'سياسة الخصوصية',
  },
  en: {
    registration: 'Commercial registration',
    address: 'Address',
    hours: 'Working hours',
    support: 'Support',
    payments: 'Payments',
    terms: 'Terms & Conditions',
    privacy: 'Privacy Policy',
  },
};

/**
 * The footer block for one language: every original BRAND key is kept (nothing
 * downstream can break by a key disappearing) and the language-resolved values
 * are added alongside, so a template renders `brand.name` / `brand.address` /
 * `brand.labels.registration` without knowing which language it is in.
 */
function brandFor(lang) {
  const l = normalizeLang(lang);
  const en = l === 'en';
  return {
    ...BRAND,
    lang: l,
    name: en ? BRAND.nameEn : BRAND.nameAr,
    // The registered name in the language it is registered under. Not a
    // translation — both of these are the entity's own filed names.
    legal: en ? BRAND.legalName : BRAND.legalNameAr,
    address: en ? BRAND.addressEn : BRAND.addressAr,
    hours: en ? BRAND.hoursEn : BRAND.hoursAr,
    labels: BRAND_LABELS[l],
  };
}

/** Collapse whitespace and trim. Fixes the «"ارقيله "» that shipped. */
function cleanTitle(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * "105.00 د.أ" — or "105.00 JOD" in English — and '' when there is no real
 * amount to state. The digits are Western in both languages by policy; only the
 * currency word changes, because «د.أ» is unreadable to an English reader while
 * the number is not.
 */
function formatJod(amount, lang = 'ar') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n.toFixed(2)} ${normalizeLang(lang) === 'en' ? 'JOD' : 'د.أ'}`;
}

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Amman-local date and time. Jordan is UTC+3 year-round (DST abolished 2022),
 * but the timezone is named rather than hard-offset so this stays correct if
 * that ever changes. Returns '' rather than "Invalid Date".
 *
 * THE TIMEZONE IS NOT A LANGUAGE SETTING. Every deadline in this product is an
 * Amman deadline whoever is reading it, so `Asia/Amman` is fixed in both
 * languages — only the field ORDER changes (en-GB "30 Jul 2026, 12:00" reads
 * naturally next to Arabic, en-US "Jul 30, 2026, 12:00" to an English reader).
 * 24-hour in both, so a payment deadline can never be read twelve hours out.
 */
function formatDeadline(value, lang = 'ar') {
  const ms = toMs(value);
  if (ms == null) return '';
  try {
    return new Intl.DateTimeFormat(normalizeLang(lang) === 'en' ? 'en-US' : 'en-GB', {
      timeZone: 'Asia/Amman',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

/**
 * Deep link to ONE order. `modal=order` + `order=<id>` is a real route —
 * AppContext feeds modalParam into setGlobalSelectedOrderId. Without an id we
 * fall back to the orders list rather than emit a broken link.
 */
function orderDeepLink(orderId) {
  const id = String(orderId ?? '').trim();
  if (!id) return `${SITE}/orders`;
  return `${SITE}/orders?modal=order&order=${encodeURIComponent(id)}`;
}

/** The lot's own page (`/auction/<id>` — see src/utils/navUrl.ts VIEW_PATH). */
function auctionDeepLink(auctionId) {
  const id = String(auctionId ?? '').trim();
  if (!id) return `${SITE}/discover`;
  return `${SITE}/auction/${encodeURIComponent(id)}`;
}

/**
 * Where the CTA points.
 *
 * A real order id always wins. Without one we normally fall back to the auction
 * id, which works because a normal order IS `orders/{auctionId}` — but a
 * SECOND-CHANCE email breaks that assumption twice over: no order exists yet
 * when the offer goes out, and `orders/{auctionId}` is the DEFAULTED buyer's
 * document, which firestore.rules refuses to show the runner-up. The one email
 * whose whole job is to convert them would land on a permission error. So a
 * second chance links to the lot itself, which exists and which they can open.
 */
function ctaUrlFor(data) {
  const orderId = String(data.orderId ?? '').trim();
  if (orderId) return orderDeepLink(orderId);
  const auctionId = String(data.auctionId ?? '').trim();
  if (data.secondChance === true && auctionId) return auctionDeepLink(auctionId);
  return orderDeepLink(auctionId);
}

/** The labelled table's column headings, per language. */
const ROW_LABELS = {
  ar: { auction: 'المزاد', orderRef: 'رقم الطلب', amount: 'المبلغ المستحق', deadline: 'آخر موعد للدفع' },
  en: { auction: 'Auction', orderRef: 'Order number', amount: 'Amount due', deadline: 'Payment deadline' },
};

/**
 * Rows shown as a labelled table. Anything without a value is omitted — a row
 * rendered present-but-blank claims information the email does not have, which
 * is worse than the row being absent. The filter runs in both languages.
 */
function detailRows(data, lang = 'ar') {
  const l = normalizeLang(lang);
  const L = ROW_LABELS[l];
  const t = cleanTitle(data.auctionTitle);
  const rows = [
    { label: L.auction, value: t },
    { label: L.orderRef, value: String(data.orderRef || '').trim() },
    { label: L.amount, value: formatJod(data.totalDue ?? data.amount, l) },
    { label: L.deadline, value: formatDeadline(data.paymentDeadlineAt, l) },
  ];
  return rows.filter(r => r.value && String(r.value).trim().length > 0);
}

// heading / intro / cta label per event. `intro` is the sentence the old email
// tried to carry alone; the numbers now live in the detail rows beneath it.
//
// One map per language, same keys in both. They are kept as two separate
// objects rather than one object of {ar, en} pairs so the Arabic below stays
// byte-for-byte the live wording that shipped on 2026-07-29 — a reviewer can
// diff it against production without reading around an English string.
const CONTENT_AR = {
  auction_won: {
    subject: (t) => `مبروك! فزت بمزاد ${t}`,
    heading: 'مبروك، لقد فزت 🎉',
    intro: 'فزت بالمزاد. أكمل الدفع خلال المهلة المحددة ليُحجز لك المنتج.',
    cta: 'أكمل الدفع',
  },
  payment_due: {
    subject: (t) => `دفعة مستحقة — ${t}`,
    heading: 'دفعة مستحقة',
    intro: 'مزادك بانتظار الدفع. أكمل التحويل عبر كليك قبل الموعد أدناه، ثم ارفع صورة الإيصال في التطبيق.',
    cta: 'ادفع الآن',
  },
  payment_reminder: {
    subject: (t) => `تذكير: الدفع لم يكتمل بعد — ${t}`,
    heading: 'تذكير بالدفع',
    intro: 'ما زال طلبك بانتظار الدفع. إذا انتهت المهلة دون دفع يُلغى الطلب وقد يُقيَّد حسابك عن المزايدة.',
    cta: 'أكمل الدفع',
  },
  below_reserve_offer: {
    subject: (t) => `عرض على ${t} — بانتظار قرارك`,
    heading: 'عرض أقل من السعر المطلوب',
    intro: 'لم تبلغ المزايدات السعر المطلوب. يمكنك قبول أعلى مزايدة أو رفضها.',
    cta: 'راجع العرض',
  },
  below_reserve_seller_accepted: {
    subject: (t) => `البائع قبل عرضك على ${t}`,
    heading: 'البائع قبل عرضك',
    intro: 'قبل البائع مزايدتك. أكمل الدفع لإتمام الشراء.',
    cta: 'أكمل الشراء',
  },
  order_preparing: {
    subject: (t) => `طلبك قيد التجهيز — ${t}`,
    heading: 'طلبك قيد التجهيز',
    intro: 'بدأ البائع تجهيز طلبك ورفع صورة المنتج. سنعلمك فور خروجه للتوصيل.',
    cta: 'تابع الطلب',
  },
  order_shipped: {
    subject: (t) => `طلبك في الطريق — ${t}`,
    heading: 'طلبك خرج للتوصيل',
    intro: 'طلبك في الطريق إليك. عند الاستلام صوّر المنتج مع رمز التسليم المكتوب على الطرد وأدخل الرمز في التطبيق لتأكيد الاستلام.',
    cta: 'تأكيد الاستلام',
  },
  order_delivered: {
    subject: (t) => `تم تسليم ${t}`,
    heading: 'تم التسليم',
    intro: 'وصل طلبك. أكّد الاستلام في التطبيق ليُحرَّر المبلغ للبائع.',
    cta: 'تأكيد الاستلام',
  },
  order_completed: {
    subject: (t) => `اكتمل طلبك — ${t}`,
    heading: 'اكتمل الطلب',
    intro: 'تم تأكيد الاستلام وتحرير المبلغ للبائع. شكراً لك — نسعد بتقييمك للتجربة.',
    cta: 'قيّم تجربتك',
  },
  order_refunded: {
    subject: (t) => `تم استرداد مبلغ ${t}`,
    heading: 'تم استرداد المبلغ',
    intro: 'تمت إعادة المبلغ إلى محفظتك. قد يستغرق ظهوره في حسابك البنكي بضعة أيام عمل.',
    cta: 'عرض الطلب',
  },
  membership_rejected: {
    subject: () => 'طلب العضوية — بحاجة إلى مراجعة',
    heading: 'لم نتمكن من اعتماد العضوية',
    intro: 'راجع تفاصيل الدفع وأعد الإرسال، أو تواصل معنا وسنساعدك.',
    cta: 'إعادة المحاولة',
  },
  order_payment_rejected: {
    subject: (t) => `إثبات الدفع لم يُقبل — ${t}`,
    heading: 'لم يُقبل إثبات الدفع',
    intro: 'راجع رقم العملية وصورة الإيصال وأعد الإرسال قبل انتهاء المهلة.',
    cta: 'إعادة إرسال الإثبات',
  },
  account_banned: {
    subject: () => 'تم تقييد حسابك مؤقتاً',
    heading: 'تم تقييد الحساب',
    intro: 'تم تقييد المزايدة من حسابك. إذا كنت ترى أن هذا خطأ تواصل مع الدعم على الأرقام أدناه.',
    cta: null,
  },
  ban_lifted: {
    subject: () => 'تم رفع التقييد عن حسابك',
    heading: 'تم رفع التقييد',
    intro: 'يمكنك المزايدة من جديد. أهلاً بعودتك.',
    cta: 'تصفح المزادات',
  },
  return_requested: {
    subject: (t) => `طلب إرجاع على ${t}`,
    heading: 'طلب إرجاع',
    intro: 'فتح المشتري طلب إرجاع. راجع التفاصيل والصور وردّ عليه من التطبيق.',
    cta: 'مراجعة الطلب',
  },
  return_resolved: {
    subject: (t) => `نتيجة طلب الإرجاع — ${t}`,
    heading: 'نتيجة طلب الإرجاع',
    intro: 'تمت مراجعة طلب الإرجاع وصدر القرار. التفاصيل داخل الطلب.',
    cta: 'عرض الطلب',
  },
};

// English. Not a word-for-word translation of the Arabic — the same facts, said
// the way an English reader expects them: the instruction the recipient has to
// act on comes first, the consequence of not acting second. Every key in
// CONTENT_AR must exist here; a missing one leaks Arabic into an English inbox
// and the Arabic-leak assertions in emailCopy.test.js turn that into a red build.
const CONTENT_EN = {
  auction_won: {
    subject: (t) => `Congratulations! You won ${t}`,
    heading: 'Congratulations, you won 🎉',
    intro: 'You won the auction. Complete payment within the deadline below and the item is reserved for you.',
    cta: 'Complete payment',
  },
  payment_due: {
    subject: (t) => `Payment due — ${t}`,
    heading: 'Payment due',
    intro: 'Your auction is awaiting payment. Send the transfer by CliQ before the deadline below, then upload a photo of the receipt in the app.',
    cta: 'Pay now',
  },
  payment_reminder: {
    subject: (t) => `Reminder: your payment is still outstanding — ${t}`,
    heading: 'Payment reminder',
    intro: 'Your order is still awaiting payment. If the deadline passes without payment the order is cancelled and your account may be restricted from bidding.',
    cta: 'Complete payment',
  },
  below_reserve_offer: {
    subject: (t) => `An offer on ${t} — awaiting your decision`,
    heading: 'Offer below your asking price',
    intro: 'The bidding did not reach your asking price. You can accept the highest bid or decline it.',
    cta: 'Review the offer',
  },
  below_reserve_seller_accepted: {
    subject: (t) => `The seller accepted your offer on ${t}`,
    heading: 'The seller accepted your offer',
    intro: 'The seller accepted your bid. Complete payment to finish the purchase.',
    cta: 'Complete the purchase',
  },
  order_preparing: {
    subject: (t) => `Your order is being prepared — ${t}`,
    heading: 'Your order is being prepared',
    intro: 'The seller has started preparing your order and uploaded a photo of the item. We will let you know as soon as it goes out for delivery.',
    cta: 'Track your order',
  },
  order_shipped: {
    subject: (t) => `Your order is on its way — ${t}`,
    heading: 'Your order is out for delivery',
    intro: 'Your order is on its way. When it arrives, photograph the item together with the delivery code written on the parcel, then enter that code in the app to confirm receipt.',
    cta: 'Confirm receipt',
  },
  order_delivered: {
    subject: (t) => `${t} has been delivered`,
    heading: 'Delivered',
    intro: 'Your order has arrived. Confirm receipt in the app so the amount is released to the seller.',
    cta: 'Confirm receipt',
  },
  order_completed: {
    subject: (t) => `Your order is complete — ${t}`,
    heading: 'Order complete',
    intro: 'Receipt was confirmed and the amount has been released to the seller. Thank you — we would love to hear how it went.',
    cta: 'Rate your experience',
  },
  order_refunded: {
    subject: (t) => `Refund issued for ${t}`,
    heading: 'Refund issued',
    intro: 'The amount has been returned to your wallet. If you withdraw it, it may take a few working days to appear in your bank account.',
    cta: 'View order',
  },
  membership_rejected: {
    subject: () => 'Your membership request needs another look',
    heading: 'We could not approve your membership',
    intro: 'Please check your payment details and send the request again, or contact us and we will help.',
    cta: 'Try again',
  },
  order_payment_rejected: {
    subject: (t) => `Your payment proof was not accepted — ${t}`,
    heading: 'Payment proof not accepted',
    intro: 'Please check the transaction number and the receipt photo, then send them again before the deadline.',
    cta: 'Resend proof',
  },
  account_banned: {
    subject: () => 'Your account has been restricted',
    heading: 'Account restricted',
    intro: 'Bidding from your account has been restricted. If you believe this is a mistake, contact support on the numbers below.',
    cta: null,
  },
  ban_lifted: {
    subject: () => 'The restriction on your account has been lifted',
    heading: 'Restriction lifted',
    intro: 'You can bid again. Welcome back.',
    cta: 'Browse auctions',
  },
  return_requested: {
    subject: (t) => `Return request on ${t}`,
    heading: 'Return request',
    intro: 'The buyer has opened a return request. Review the details and the photos, and reply from the app.',
    cta: 'Review the request',
  },
  return_resolved: {
    subject: (t) => `Outcome of the return request — ${t}`,
    heading: 'Return request outcome',
    intro: 'The return request has been reviewed and a decision has been made. The details are inside the order.',
    cta: 'View order',
  },
};

const CONTENT = { ar: CONTENT_AR, en: CONTENT_EN };

/**
 * Second-chance overrides, keyed by event then by the offer's status.
 *
 * A second-chance offer travels on the `below_reserve_offer` event because the
 * live n8n workflow routes a FIXED event contract and silently drops anything
 * it does not know. The event is therefore reused — but its default copy («لم
 * تبلغ المزايدات السعر المطلوب») is simply false here: the bids were fine, the
 * WINNER FAILED TO PAY. Sending that to a runner-up would misstate why they are
 * being offered the lot, and misstate their own bid as too low.
 *
 * The two recipients are different people with different asks:
 *   pending_seller — the SELLER is asked to accept a runner-up bid that sits
 *                    under their reserve.
 *   pending_buyer  — the RUNNER-UP is offered the lot at their own bid.
 * Anything other than `pending_seller` is treated as the runner-up: that is the
 * common case (a bid at or above the reserve goes straight to the bidder), and
 * both emit sites send the status explicitly.
 *
 * The same falsehood is available in English — CONTENT_EN.below_reserve_offer
 * says "the bidding did not reach your asking price" — so English needs the
 * same branch, and it must carry the real reason POSITIVELY: the winner did not
 * pay. Deleting the English branch here must fail the suite, not merely stop
 * matching a banned phrase.
 */
const SECOND_CHANCE_AR = {
  below_reserve_offer: {
    pending_seller: {
      subject: (t) => `فرصة ثانية على ${t} — بانتظار قرارك`,
      heading: 'فرصة ثانية — بانتظار قرارك',
      intro: 'لم يكمل الفائز الدفع خلال المهلة وأُلغي طلبه. أعلى مزايدة بعده أقل من السعر المطلوب، ويمكنك قبولها لإتمام البيع أو رفضها وإعادة عرض المنتج.',
      cta: 'راجع العرض',
    },
    pending_buyer: {
      subject: (t) => `فرصة ثانية: ${t} معروض عليك`,
      heading: 'فرصة ثانية لك',
      intro: 'لم يكمل الفائز بالمزاد الدفع خلال المهلة وأُلغي طلبه، والمنتج معروض عليك الآن بقيمة مزايدتك. أكّد الشراء قبل انتهاء مهلة العرض.',
      cta: 'راجع العرض',
    },
  },
};

const SECOND_CHANCE_EN = {
  below_reserve_offer: {
    pending_seller: {
      subject: (t) => `Second chance on ${t} — awaiting your decision`,
      heading: 'Second chance — your decision',
      intro: 'The winner did not complete payment within the deadline, so their order was cancelled. The next-highest bid is below your asking price: you can accept it and complete the sale, or decline it and list the item again.',
      cta: 'Review the offer',
    },
    pending_buyer: {
      subject: (t) => `Second chance: ${t} is now offered to you`,
      heading: 'A second chance for you',
      intro: 'The winner of the auction did not complete payment within the deadline, so their order was cancelled and the item is now offered to you at the value of your own bid. Confirm the purchase before the offer expires.',
      cta: 'Review the offer',
    },
  },
};

const SECOND_CHANCE_CONTENT = { ar: SECOND_CHANCE_AR, en: SECOND_CHANCE_EN };

/** The second-chance variant of an event's copy, or null when it has none. */
function secondChanceContent(event, data, lang) {
  if (!data || data.secondChance !== true) return null;
  const variants = SECOND_CHANCE_CONTENT[normalizeLang(lang)][event];
  if (!variants) return null;
  return data.offerStatus === 'pending_seller' ? variants.pending_seller : variants.pending_buyer;
}

const FALLBACK = {
  ar: {
    subject: () => 'تحديث من مزاد جو',
    heading: 'تحديث على حسابك',
    intro: 'لديك تحديث جديد. افتح التطبيق للاطلاع على التفاصيل.',
    cta: 'فتح مزاد جو',
  },
  en: {
    subject: () => 'An update from Mazad JO',
    heading: 'An update on your account',
    intro: 'You have a new update. Open the app to see the details.',
    cta: 'Open Mazad JO',
  },
};

/** The subject's stand-in when the payload carries no lot title. */
const UNTITLED = { ar: 'مزاد جو', en: 'Mazad JO' };

/**
 * Build the email for an event.
 *
 * `kind` drives the footer: 'transactional' mail (money owed, order status, a
 * ban) carries NO unsubscribe — the recipient cannot opt out of being told they
 * owe money — while marketing must. Sharing one footer between the two is the
 * usual mistake.
 *
 * @param {string} event    the notification event
 * @param {object} data     interpolation values; missing fields degrade to ''
 * @param {'ar'|'en'} lang  DEFAULTS TO ARABIC. Every caller that predates the
 *   bilingual work passes two arguments and must keep getting exactly the email
 *   it got before; defaulting to English would silently re-language production.
 */
function emailFor(event, data = {}, lang = 'ar') {
  const l = normalizeLang(lang);
  const c = secondChanceContent(event, data, l) || contentFor(event, l) || FALLBACK[l];
  const t = cleanTitle(data.auctionTitle) || UNTITLED[l];

  return {
    event,
    lang: l,
    kind: 'transactional',
    subject: c.subject(t),
    // Preview text in the inbox list — otherwise clients scrape the first
    // visible markup, which is how a header ends up as the preview.
    preheader: c.intro.slice(0, 120),
    heading: c.heading,
    intro: c.intro,
    details: detailRows(data, l),
    cta: c.cta ? { label: c.cta, url: ctaUrlFor(data) } : null,
    brand: brandFor(l),
  };
}

/**
 * An event's copy in the asked-for language.
 *
 * A KNOWN event missing from the English map is a BUG, not an unknown event.
 * It falls through to Arabic rather than to FALLBACK for the same reason as
 * messageCopy.js: the Arabic is at least true and specific, and — critically —
 * it is DETECTABLE, because the Arabic-leak assertions over every event turn a
 * deleted English entry into a red build. Dropping to the generic FALLBACK
 * would hide it behind a plausible-looking email.
 */
function contentFor(event, lang) {
  const own = CONTENT[lang][event];
  if (own) return own;
  return lang === 'ar' ? null : (CONTENT.ar[event] || null);
}

module.exports = {
  emailFor, formatJod, formatDeadline, orderDeepLink, auctionDeepLink, cleanTitle, detailRows,
  brandFor, BRAND, BRAND_LABELS,
};
