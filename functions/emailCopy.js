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
 * Arabic-primary, matching every other user-facing surface. Digits stay Western
 * per the app-wide numeral policy (see src/utils/arabicNumerals.ts).
 */

const SITE = 'https://www.mazad-jo.com';

/**
 * Footer identity. These values are the registered entity behind Mazad and
 * already back the Terms and Privacy documents (docs/legal/) — the emails were
 * simply the one surface that never used them.
 */
const BRAND = {
  nameAr: 'مزاد جو',
  nameEn: 'MAZAD JO',
  legalName: 'Al Hani Commercial Brokerage LLC',
  legalNameAr: 'شركة الهاني للوساطة التجارية ذ.م.م',
  registration: '200213982',
  addressAr: 'عمّان — شارع المدينة المنورة — مجمع سعد ٤ — مقابل حبيبة',
  hoursAr: 'من ١٠ صباحاً حتى ٧ مساءً، السبت إلى الخميس',
  supportPhone: '+962781444899',
  paymentsPhone: '+962785446498',
  termsUrl: `${SITE}/terms`,
  privacyUrl: `${SITE}/privacy`,
  site: SITE,
};

/** Collapse whitespace and trim. Fixes the «"ارقيله "» that shipped. */
function cleanTitle(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/** "105.00 د.أ", or '' when there is no real amount to state. */
function formatJod(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n.toFixed(2)} د.أ`;
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
 */
function formatDeadline(value) {
  const ms = toMs(value);
  if (ms == null) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
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

/** Rows shown as a labelled table. Anything without a value is omitted. */
function detailRows(data) {
  const t = cleanTitle(data.auctionTitle);
  const rows = [
    { label: 'المزاد', value: t },
    { label: 'رقم الطلب', value: String(data.orderRef || '').trim() },
    { label: 'المبلغ المستحق', value: formatJod(data.totalDue ?? data.amount) },
    { label: 'آخر موعد للدفع', value: formatDeadline(data.paymentDeadlineAt) },
  ];
  return rows.filter(r => r.value && String(r.value).trim().length > 0);
}

// heading / intro / cta label per event. `intro` is the sentence the old email
// tried to carry alone; the numbers now live in the detail rows beneath it.
const CONTENT = {
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

const FALLBACK = {
  subject: () => 'تحديث من مزاد جو',
  heading: 'تحديث على حسابك',
  intro: 'لديك تحديث جديد. افتح التطبيق للاطلاع على التفاصيل.',
  cta: 'فتح مزاد جو',
};

/**
 * Build the email for an event.
 *
 * `kind` drives the footer: 'transactional' mail (money owed, order status, a
 * ban) carries NO unsubscribe — the recipient cannot opt out of being told they
 * owe money — while marketing must. Sharing one footer between the two is the
 * usual mistake.
 */
function emailFor(event, data = {}) {
  const c = CONTENT[event] || FALLBACK;
  const t = cleanTitle(data.auctionTitle) || 'مزاد جو';
  const orderId = data.orderId || data.auctionId || '';

  return {
    event,
    kind: 'transactional',
    subject: c.subject(t),
    // Preview text in the inbox list — otherwise clients scrape the first
    // visible markup, which is how a header ends up as the preview.
    preheader: c.intro.slice(0, 120),
    heading: c.heading,
    intro: c.intro,
    details: detailRows(data),
    cta: c.cta ? { label: c.cta, url: orderDeepLink(orderId) } : null,
    brand: BRAND,
  };
}

module.exports = {
  emailFor, formatJod, formatDeadline, orderDeepLink, cleanTitle, detailRows, BRAND,
};
