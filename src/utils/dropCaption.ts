export interface DropCaptionInput {
  auctionNumber: number | string;
  startTime: string;        // e.g. "7:30"
  durationLabel: string;    // e.g. "30 دقيقة"
  startingPriceJod: number;
  productName: string;
  specs: string[];
  condition: string;
  deepLink: string;
}

// Standing boilerplate — transcribed from the current WhatsApp card.
// MUST be confirmed verbatim with the team before production use (see Global Constraints).
const HYPE = [
  '🚀 سرعة... حماس... وحسم حقيقي بأقوى الأسعار',
  '🔥 كل ثانية بالمزاد أصبحت تصنع الفرق',
  'والرابح الحقيقي هو الأسرع والأذكى بالمزايدة',
];

const RULES = [
  '⚠️ يبدأ احتساب المزايدات فقط عند الإعلان الرسمي عن بدء المزاد',
  '⚠️ عند انتهاء الوقت يتم اعتماد آخر مزايدة مسجلة',
];

const TERMS = [
  '🛡️ حماية المشتري: مزاد بيحتفظ بمبلغك حتى تأكيد الاستلام',
  '⚠️ المزايدة للمشتركين فقط',
  '💰 الدفع: فوري بعد رسو المزاد',
  '🏆 الدفع عند الاستلام: متاح لمشتركي Mazad JO VIP فقط',
  '🚚 التسليم: خلال 2 – 4 أيام',
];

export function buildAuctionCaption(input: DropCaptionInput): string {
  const specLines = input.specs
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `• ${s}`)
    .join('\n');

  return [
    `🔥 مزاد رقم: ${input.auctionNumber} | يبدأ الساعة: ${input.startTime} 🔥`,
    `⏱️ مدة المزاد: ${input.durationLabel} فقط`,
    '',
    `👑 يبدأ المزاد من: (${input.startingPriceJod} دينار)`,
    '',
    `🖤 اسم المنتج: ${input.productName}`,
    '',
    'المواصفات:',
    specLines,
    '',
    'الحالة:',
    input.condition,
    '',
    ...HYPE,
    '',
    ...RULES,
    '',
    ...TERMS,
    '',
    `🔗 زايد الآن: ${input.deepLink}`,
    '',
    'البيع الذكي والشراء الأذكى — Mazad JO 🔥',
  ].join('\n');
}
