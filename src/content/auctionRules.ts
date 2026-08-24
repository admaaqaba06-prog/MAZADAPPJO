// Single source of truth for the plain-language auction rules shown in the
// AuctionRulesModal, the acceptance gate, and every discoverable entry point.
// Reconciled with the locked policy (E1/E4): 5% buyer premium + 5% seller
// commission, NO security deposit, 24h payment, graduated cooldown/ban ladder.
// This is the friendly, up-front version — the formal ToC (TermsModal) is the
// legal backstop. Bump RULES_VERSION on any material change to re-prompt acceptance.

export const RULES_VERSION = 1;

export interface AuctionRule {
  en: string;
  ar: string;
}

export const AUCTION_RULES: AuctionRule[] = [
  {
    en: 'Only registered, active members can bid. Bidding requires an active membership.',
    ar: 'المزايدة متاحة فقط للأعضاء المسجّلين والمفعّلين، وتتطلّب عضوية فعّالة.',
  },
  {
    en: 'Every bid is binding. You cannot retract or delete a bid — bid only what you intend to pay.',
    ar: 'كل مزايدة مُلزِمة. لا يمكن التراجع عن المزايدة أو حذفها — زايد فقط بالمبلغ الذي تنوي دفعه.',
  },
  {
    en: 'Each auction shows its minimum bid increment. The highest valid bid when the auction closes wins.',
    ar: 'يعرض كل مزاد الحد الأدنى للزيادة. صاحب أعلى مزايدة صحيحة عند إغلاق المزاد هو الفائز.',
  },
  {
    en: 'Winners pay within 24 hours of the auction closing, via CliQ.',
    ar: 'يدفع الفائز خلال 24 ساعة من إغلاق المزاد، عبر كليك (CliQ).',
  },
  {
    en: 'If you win and do not pay in time: your account enters a short cooldown; a repeated miss leads to a 3-month suspension. Fraud or manipulation leads to a permanent ban.',
    ar: 'إذا فزت ولم تدفع في الوقت المحدد: يدخل حسابك فترة إيقاف قصيرة، وتكرار ذلك يؤدي إلى تعليق لمدة 3 أشهر. أما التلاعب أو الاحتيال فيؤدي إلى حظر دائم.',
  },
  {
    en: 'Fees: the buyer pays a 5% premium added on top of the winning bid. The seller pays a 5% Mazad commission, deducted from their proceeds.',
    ar: 'الرسوم: يدفع المشتري عمولة 5% تُضاف فوق سعر الفوز. ويدفع البائع عمولة 5% لمزادو تُخصم من مستحقاته.',
  },
  {
    en: 'No security deposit is required to bid.',
    ar: 'لا يُطلب أي تأمين (وديعة) للمزايدة.',
  },
  {
    en: 'Buyer protection: Mazzado holds your payment and only releases it to the seller after you receive the item and confirm it. All payments are reviewed and approved by Mazzado.',
    ar: 'حماية المشتري: يحتجز مزادو مبلغ الدفع ولا يحوّله للبائع إلا بعد استلامك السلعة وتأكيدك لها. وتتم مراجعة جميع المدفوعات واعتمادها من مزادو.',
  },
  {
    en: 'On delivery, inspect the item. You may reject an item that is damaged or materially different from the listing; returns are handled through Mazzado.',
    ar: 'عند الاستلام، افحص السلعة. يحق لك رفض أي سلعة تالفة أو مختلفة جوهرياً عن الوصف؛ وتُدار عمليات الإرجاع عبر مزادو.',
  },
  {
    en: 'Both sides rate each other after a completed sale. Ratings are visible across the platform to keep the community trustworthy.',
    ar: 'يقيّم الطرفان بعضهما بعد إتمام البيع، وتظهر التقييمات في المنصة للحفاظ على مجتمع موثوق.',
  },
  {
    en: 'Product details are as provided by the seller, who must be accurate and have the legal right to sell the item. Delivery times are announced per auction and may vary.',
    ar: 'تفاصيل المنتج كما يقدّمها البائع، الذي يجب أن يكون دقيقاً وله الحق القانوني في البيع. وتُعلن مواعيد التسليم لكل مزاد وقد تختلف.',
  },
  {
    en: 'Manipulation, collusion, fake bidding, or multiple accounts lead to a permanent ban. Mazzado may cancel or suspend any auction to protect fairness and transparency.',
    ar: 'التلاعب أو التواطؤ أو المزايدات الوهمية أو تعدّد الحسابات يؤدي إلى حظر دائم. ويحق لمزادو إلغاء أو تعليق أي مزاد لحماية العدالة والشفافية.',
  },
];
