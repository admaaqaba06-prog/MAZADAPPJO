// Build Messages — forwards the message Cloud Functions already rendered.
//
// Cloud Functions render every customer message in the RECIPIENT'S LANGUAGE and
// put it on the payload as `email_content` (a structure: subject / preheader /
// heading / intro / details / cta / brand) and `wa_text` (a string). This node
// templates that structure; it does not decide wording. Copy changes therefore
// ship from the repo with tests and review, and need no paste here.
//
// `copyFor` and `buildHtml` below stay as the FALLBACK, used only when the
// payload carries no usable render — a half-landed deploy, a renamed field, a
// truncated body. Without them the server would be a single point of failure
// for message copy and a bad render would post a blank subject and a blank body
// into a customer's inbox. They mirror functions/messageCopy.js verbatim and
// functions/notifyCopyParity.test.js fails the moment they drift, so if you
// edit copy there, edit it here too.
//
// Channel gating is NOT decided here either — Cloud Functions already resolved
// it and sends `channels` on the payload. We only surface it as sendWhatsapp/
// sendEmail so the two IF nodes downstream stay dumb.

function copyFor(event, data) {
  const d = data || {};
  const t = d.auctionTitle || d.orderId || '';
  // MIRRORS functions/notify.js. A second-chance offer reuses the
  // `below_reserve_offer` event (this workflow's event contract is fixed), but
  // the winner defaulted — the bids did not fall short. `secondChance` +
  // `offerStatus` pick the copy that is true for the actual recipient.
  const sc = d.secondChance === true;
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
  return M[event] || { type: 'info', title: 'تنبيه', description: '' };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- small guards, so a malformed payload degrades instead of throwing. A
// throw in this Code node aborts the run before EITHER send node, so one bad
// field would silence WhatsApp as well as email.
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function txt(v) {
  return v == null ? '' : String(v);
}
function has(v) {
  return txt(v).trim() !== '';
}

/**
 * The server's render, or null to fall back to the local one.
 *
 * `subject` and `heading` must both be real strings: they are the two fields
 * with no sane default — a blank subject line is the most visible thing an
 * email can get wrong, and a body with no heading is not a message. Everything
 * else (details, cta, brand) is optional and degrades inside the template.
 */
function usableContent(v) {
  const ec = obj(v);
  const ok = (s) => typeof s === 'string' && s.trim() !== '';
  return ok(ec.subject) && ok(ec.heading) ? ec : null;
}

/**
 * Template for the server-rendered content. Same table-based, inline-styled,
 * fetch-free shape as buildHtml below, so it renders identically in Gmail,
 * Outlook and Apple Mail.
 *
 * DIRECTION IS A PROPERTY OF THE CONTENT, NOT OF THIS FILE. buildHtml is
 * hardcoded rtl/ar because it only ever renders this node's own Arabic; here
 * the server may hand us either language, and an English email laid out
 * right-to-left and announced as Arabic by a screen reader is visibly broken.
 *
 * Every interpolated value is escaped. Lot titles are user-supplied and reach
 * the heading, the rows and the CTA; unescaped, one title is an HTML injection
 * into every recipient's inbox.
 */
function buildHtmlFromContent(ec, name) {
  const en = ec.lang === 'en';
  const dir = en ? 'ltr' : 'rtl';
  const align = en ? 'left' : 'right';
  const brand = obj(ec.brand);
  const labels = obj(brand.labels);
  // The ONLY wording this template owns is the greeting; everything else is the
  // server's. Keep it that way.
  const greet = has(name)
    ? (en ? `Hi ${esc(name)},` : `مرحباً ${esc(name)}،`)
    : (en ? 'Hi,' : 'مرحباً،');
  const brandName = has(brand.name) ? esc(brand.name) : (en ? 'MAZAD JO' : 'مزاد جو');

  // Absent rows render NOTHING — a present-but-blank row claims information the
  // email does not have, which is worse than the row being missing.
  const rows = (Array.isArray(ec.details) ? ec.details : []).filter((r) => r && has(r.value));
  const rowsHtml = rows.length
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #eef0f2;border-radius:8px;">'
      + rows.map((r) => '<tr>'
        + `<td style="padding:10px 14px;font-family:Tahoma,Arial,sans-serif;font-size:13px;color:#8a9099;text-align:${align};white-space:nowrap;">${esc(r.label)}</td>`
        + `<td style="padding:10px 14px;font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#111111;text-align:${align};">${esc(r.value)}</td>`
        + '</tr>').join('')
      + '</table>'
    : '';

  // Same rule for the button: no label or no url means no button, never a dead one.
  const cta = obj(ec.cta);
  const ctaHtml = has(cta.label) && has(cta.url)
    ? `<a href="${esc(cta.url)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:bold;">${esc(cta.label)}</a>`
    : '';

  // Footer identity. The labels are the server's translations; the legal name
  // and registration number are not translated — they are what is filed.
  const line = (label, value) => (has(value)
    ? `<div style="margin:0 0 4px;">${has(label) ? `${esc(label)}: ` : ''}${esc(value)}</div>`
    : '');
  const footer = (has(brand.legal) ? `<div style="margin:0 0 6px;color:#6b7280;">${esc(brand.legal)}</div>` : '')
    + line(labels.registration, brand.registration)
    + line(labels.address, brand.address)
    + line(labels.hours, brand.hours)
    // account_banned tells the recipient to "contact support on the numbers
    // below" and carries no CTA — without these lines that sentence is a lie.
    + line(labels.support, brand.supportPhone)
    + line(labels.payments, brand.paymentsPhone);

  return `<!doctype html><html dir="${dir}" lang="${en ? 'en' : 'ar'}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f5f6f8;">'
    // Inbox preview text. Without it clients scrape the first visible markup,
    // which is how the header ends up as the preview line.
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(ec.preheader)}</div>`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6f8;padding:24px 12px;">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">'
    + `<tr><td style="padding:20px 24px;border-bottom:1px solid #eef0f2;font-family:Tahoma,Arial,sans-serif;font-size:18px;font-weight:bold;color:#111111;text-align:${align};">${brandName}</td></tr>`
    + `<tr><td style="padding:24px;font-family:Tahoma,Arial,sans-serif;text-align:${align};">`
    + `<p style="margin:0 0 12px;font-size:14px;color:#555555;">${greet}</p>`
    + `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#111111;">${esc(ec.heading)}</h1>`
    + (has(ec.intro) ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#333333;">${esc(ec.intro)}</p>` : '')
    + rowsHtml
    + ctaHtml
    + '</td></tr>'
    + `<tr><td style="padding:16px 24px;background:#fafbfc;border-top:1px solid #eef0f2;font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#8a9099;text-align:${align};">`
    + footer
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

// FALLBACK ONLY. Plain RTL table layout — no external CSS/images, so it renders
// the same in Gmail/Outlook/Apple Mail without a fetch. Hardcoded rtl/ar is
// correct here: this only ever renders copyFor's Arabic.
function buildHtml(c, name) {
  const greet = name ? `مرحباً ${esc(name)}،` : 'مرحباً،';
  const body = esc(c.description);
  return '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f5f6f8;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6f8;padding:24px 12px;">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">'
    + '<tr><td style="padding:20px 24px;border-bottom:1px solid #eef0f2;font-family:Tahoma,Arial,sans-serif;font-size:18px;font-weight:bold;color:#111111;">مزاد جو</td></tr>'
    + '<tr><td style="padding:24px;font-family:Tahoma,Arial,sans-serif;">'
    + `<p style="margin:0 0 12px;font-size:14px;color:#555555;">${greet}</p>`
    + `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#111111;">${esc(c.title)}</h1>`
    + (body ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#333333;">${body}</p>` : '')
    + '<a href="https://mazad-jo.com" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:bold;">افتح التطبيق</a>'
    + '</td></tr>'
    + '<tr><td style="padding:16px 24px;background:#fafbfc;border-top:1px solid #eef0f2;font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#8a9099;">'
    + 'هذه رسالة آلية من مزاد جو، لا حاجة للرد عليها.</td></tr>'
    + '</table></td></tr></table></body></html>';
}

const out = [];
for (const item of $input.all()) {
  const b = (item.json && item.json.body) || {};
  const ch = b.channels || {};
  const c = copyFor(b.event, b);          // per-event data is spread onto the body
  const phone = String(b.phone || '').replace(/[^0-9]/g, '');
  const email = String(b.email || '').trim();
  const name = b.name || '';
  // Prefer what the server rendered in the recipient's language; fall back to
  // the local render only when it did not send a usable one.
  const ec = usableContent(b.email_content);
  const waText = has(b.wa_text)
    ? b.wa_text
    : (c.description ? `${c.title}\n${c.description}` : c.title);

  out.push({
    json: {
      event: b.event || '',
      idempotencyKey: b.idempotencyKey || '',
      name, phone, email,
      // Functions own the channel policy; we only honour what it sent, and
      // additionally require the destination to actually exist.
      sendWhatsapp: ch.whatsapp === true && phone.length >= 8,
      sendEmail: ch.email === true && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
      title: c.title,
      description: c.description,
      waText,
      subject: ec ? ec.subject : c.title,
      html: ec ? buildHtmlFromContent(ec, name) : buildHtml(c, name),
    },
  });
}
return out;
