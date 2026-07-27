// Build Messages — single choke point for WhatsApp + email copy.
//
// MIRRORS functions/notify.js -> copyFor() in the mazadjo repo. Same wording,
// same interpolation. If you edit copy there, edit it here too (and vice versa).
// Covers all 21 events in CHANNEL_POLICY; unknown events fall back to the same
// safe default as the app ({ title: 'تنبيه', description: '' }).
//
// Channel gating is NOT decided here — Cloud Functions already resolved it and
// sends `channels` on the payload. We only surface it as sendWhatsapp/sendEmail
// so the two IF nodes downstream stay dumb.

function copyFor(event, data) {
  const d = data || {};
  const t = d.auctionTitle || d.orderId || '';
  const M = {
    auction_won:  { type: 'win',   title: 'فزت بالمزاد 🎉',   description: `مبروك! ربحت "${t}". المبلغ المستحق ${d.totalDue || ''} د.أ.` },
    payment_due:  { type: 'order', title: 'دفعة مستحقة',       description: `يرجى دفع "${t}" خلال ${d.paymentHours || 24} ساعة.` },
    payment_reminder: { type: 'order', title: 'تذكير بالدفع',  description: `ما زال "${t}" بانتظار الدفع. بادر قبل انتهاء المهلة.` },
    below_reserve_offer: { type: 'info', title: 'عرض أقل من السعر', description: `أعلى مزايدة على "${t}" ${d.topBid || ''} د.أ — تقبل؟` },
    below_reserve_seller_accepted: { type: 'win', title: 'البائع قبل عرضك', description: `قبل البائع مزايدتك على "${t}". أكّد للشراء.` },
    below_reserve_declined: { type: 'loss', title: 'لم يُقبل العرض', description: `لم يقبل البائع مزايدتك على "${t}".` },
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

// Plain RTL table layout — no external CSS/images, so it renders the same in
// Gmail/Outlook/Apple Mail without a fetch.
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
  const waText = c.description ? `${c.title}\n${c.description}` : c.title;

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
      subject: c.title,
      html: buildHtml(c, name),
    },
  });
}
return out;
