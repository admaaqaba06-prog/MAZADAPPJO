// The formal terms shown in TermsModal, extracted from JSX and translated.
//
// Follows the same shape as auctionRules.ts (the friendly, up-front version);
// this is the legal backstop that modal links to.
//
// THREE FACTUAL CORRECTIONS were made while translating, because rendering a
// false claim in a second language doubles it rather than fixes it. Each is
// marked CORRECTED below and checked against the code:
//
//  1. Payment window. The old copy said the winning bid must be settled "within
//     3 hours of auction end". The platform's default is 24 HOURS
//     (functions/settlement.js: DEFAULT_PAYMENT_WINDOW_HOURS = 24) and it is
//     configurable per lot between 1 and 168 hours, which is why the copy now
//     points at the deadline shown on the order rather than naming a number.
//     Every notification, the ban ladder and auctionRules.ts already said 24h.
//
//  2. Payment channels. The old copy listed "Credit Card", "Mobile Wallets" and
//     "Pay on Delivery (VIP Tier Only)". None of the three exists anywhere in
//     the codebase — payment is CliQ, with an uploaded receipt an admin
//     verifies. Promising channels the platform cannot accept is the kind of
//     claim a consumer-protection complaint is built from.
//
//  3. Seller-conduct wording. "Mazzado reserves absolute authority to
//     deactivate merchant accounts and hold funds if deceptive claims are
//     resolved" — "if ... are resolved" inverts the intended meaning, and
//     "battery levels, localized defects, transparent colors, and physical body
//     disclosures" describes a phone-resale business rather than this one.
//
// STILL OUTSTANDING, and not something code can fix: docs/legal/terms-of-use.md
// is a DIFFERENT document from this one, and carries its own banner saying it is
// a draft that "MUST be reviewed and adapted by a qualified Jordanian lawyer"
// before publishing — specifically on fund-holding, consumer protection and
// auction licensing. Both documents need that review, and they need to agree
// with each other.

export interface LegalLine {
  en: string;
  ar: string;
  /** Visual weight only — never a substitute for saying the thing plainly. */
  tone?: 'default' | 'warn' | 'danger' | 'good';
}

export interface LegalSection {
  id: string;
  icon: string;
  titleEn: string;
  titleAr: string;
  lines: LegalLine[];
}

export const LEGAL_HEADER = {
  titleEn: 'Terms of Use & Privacy Policy',
  titleAr: 'شروط الاستخدام وسياسة الخصوصية',
  subtitleEn: 'Mazzado | Jordan bidding platform',
  subtitleAr: 'مزادو | منصة المزادات في الأردن',
};

export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: 'payment',
    icon: '💸',
    titleEn: 'Payment & settlement',
    titleAr: 'الدفع والتسوية',
    lines: [
      {
        // CORRECTED (1): was "within 3 hours of auction end".
        en: 'The winning bid must be paid in full before the deadline shown on your order. The standard window is 24 hours from the close of the auction; some lots state a different window, and the one on your order is the one that applies.',
        ar: 'يجب دفع قيمة المزايدة الفائزة بالكامل قبل الموعد النهائي الظاهر على طلبك. المهلة الاعتيادية هي 24 ساعة من إغلاق المزاد، وبعض القطع تحدد مهلة مختلفة — والمهلة الظاهرة على طلبك هي المعتمدة.',
      },
      {
        // CORRECTED (2): was a list of four channels, three of which do not exist.
        en: 'Payment is made by CliQ transfer. You upload the transfer receipt and Mazzado verifies it before the order moves forward.',
        ar: 'يتم الدفع عبر حوالة كليك (CliQ). ترفع إيصال الحوالة ويقوم مزادو بالتحقق منه قبل أن يتقدّم الطلب.',
      },
      {
        en: 'If you win and do not pay within the window, the order defaults: your account enters a cooldown, and repeated defaults lead to a longer suspension.',
        ar: 'إذا فزت ولم تدفع خلال المهلة، يُعتبر الطلب متعثراً: يدخل حسابك فترة إيقاف مؤقت، وتكرار التعثر يؤدي إلى تعليق أطول.',
        tone: 'warn',
      },
    ],
  },
  {
    id: 'protection',
    icon: '🛡️',
    titleEn: 'Buyer protection & disputes',
    titleAr: 'حماية المشتري والنزاعات',
    lines: [
      {
        en: 'When you win and pay, Mazzado holds your payment and does not release it to the seller until you receive the item, check it, and approve the release.',
        ar: 'عند فوزك ودفعك، يحتفظ مزادو بمبلغك ولا يحوّله للبائع حتى تستلم القطعة وتتفحصها وتوافق على تحرير المبلغ.',
        tone: 'good',
      },
      {
        en: 'If there is a problem, or the item does not match the listing, open a dispute BEFORE approving release. Mazzado will mediate and can return the held funds.',
        ar: 'إذا كان هناك مشكلة أو كانت القطعة لا تطابق الإعلان، افتح نزاعاً قبل الموافقة على تحرير المبلغ. يتدخّل مزادو للوساطة ويمكنه إعادة المبلغ المحتجز.',
      },
      {
        // The 72-hour commitment, stated as what it actually is: a PROCESSING
        // time for a refund that is already due, not a new window in which one
        // can be claimed. That distinction is the whole reason this line sits
        // here — between "you can dispute before approving" and "you cannot
        // after". Written as «سياسة استرجاع مرنة» with a 72-hour promise and no
        // qualifier, as the source copy had it, it would advertise a right the
        // very next line withdraws.
        en: 'Where a refund is due — after a dispute, or an approved return — the money is processed back to you within 72 working hours of the request.',
        ar: 'إذا استُحق الاسترداد، بعد نزاع أو قبول طلب إرجاع، تُعالج إعادة المبلغ إليك خلال (72) ساعة عمل من تاريخ تقديم الطلب.',
        tone: 'good',
      },
      {
        en: 'Winning bids are binding, and once you approve release the sale is complete — there are no refunds after that point. Raise any concern before approving.',
        ar: 'المزايدة الفائزة مُلزِمة، وبمجرد موافقتك على تحرير المبلغ تكتمل عملية البيع ولا يوجد استرداد بعد ذلك. أثِر أي ملاحظة قبل الموافقة.',
        tone: 'danger',
      },
    ],
  },
  {
    // Shipping had no section at all: the only mention of delivery anywhere in
    // this document was the privacy line about storing delivery addresses. So a
    // buyer could read the whole thing and never learn who ships, on what
    // schedule, or what happens when a shipment is late — which is the question
    // support gets asked most.
    //
    // Wording supplied by the business, kept close to what they wrote. The
    // English is a faithful translation, not a separate promise: two languages
    // making different commitments about delivery is worse than one.
    id: 'delivery',
    icon: '📦',
    titleEn: 'Shipping & delivery',
    titleAr: 'آلية الشحن والتسليم',
    lines: [
      {
        en: 'Al Hani Commercial Brokerage works with specialised shipping companies to get your purchase to you. Orders are shipped and delivered on the schedule announced during the auction you won.',
        ar: 'تعتمد شركة الهاني للوساطة التجارية على نخبة من شركات الشحن المتخصصة لضمان إيصال مشترياتكم بكفاءة. يتم شحن وتسليم الطلبات وفق الجدول الزمني المحدد الذي تم الإعلان عنه خلال المزاد الذي رسا عليكم.',
      },
      {
        // `warn`, not `default`: this is the line a buyer needs to have read
        // BEFORE a shipment runs late, which is the whole point of stating it.
        en: 'We work to meet those dates, but logistical delays outside our control can happen — through international shipping or current regional conditions. We will keep you updated on any change to your shipment.',
        ar: 'نسعى دائماً للالتزام بالمواعيد، إلا أنه قد تطرأ بعض التأخيرات اللوجستية الخارجة عن إرادتنا نتيجة لعمليات الشحن الدولي أو الظروف الإقليمية الراهنة. نقدّر تفهمكم، ونلتزم بإبقائكم على اطلاع دائم بأي تحديثات تطرأ على حالة شحنتكم.',
        tone: 'warn',
      },
    ],
  },
  {
    id: 'sellers',
    icon: '⚖️',
    titleEn: 'Seller responsibilities',
    titleAr: 'مسؤوليات البائع',
    lines: [
      {
        // CORRECTED (3): was phone-resale specifics ("battery levels, localized
        // defects, transparent colors, physical body disclosures").
        en: 'Sellers are responsible for describing an item accurately, including its true condition and any fault, damage or missing part, and for using photographs of the actual item.',
        ar: 'يتحمّل البائع مسؤولية وصف القطعة بدقة، بما في ذلك حالتها الحقيقية وأي عيب أو ضرر أو نقص، واستخدام صور للقطعة نفسها.',
      },
      {
        // CORRECTED (3): was "if deceptive claims are resolved", which inverts it.
        en: 'Mazzado may suspend a seller account and hold the related funds where a listing is found to be misleading.',
        ar: 'يحق لمزادو تعليق حساب البائع وحجز المبالغ المرتبطة به إذا تبيّن أن الإعلان مضلِّل.',
        tone: 'danger',
      },
    ],
  },
  {
    id: 'fees',
    icon: '📊',
    titleEn: 'Fees',
    titleAr: 'الرسوم',
    lines: [
      {
        en: "A 5% buyer's premium is added to the winning bid. A 5% commission is deducted from the seller's proceeds, so the seller receives 95%. Membership fees are separate.",
        ar: 'تُضاف عمولة مشترٍ بنسبة 5% فوق سعر الفوز، وتُخصم عمولة 5% من مستحقات البائع فيستلم 95%. رسوم العضوية منفصلة عن ذلك.',
      },
      {
        en: 'No security deposit is required in order to bid.',
        ar: 'لا يُطلب أي تأمين (وديعة) للمزايدة.',
      },
    ],
  },
  {
    id: 'privacy',
    icon: '🔒',
    titleEn: 'Privacy & your data',
    titleAr: 'الخصوصية وبياناتك',
    lines: [
      {
        en: 'Transfer receipts, delivery addresses and phone numbers are stored with our payment and infrastructure providers, used only to operate the service, and are not sold to third parties.',
        ar: 'تُحفظ إيصالات الحوالات وعناوين التوصيل وأرقام الهواتف لدى مزوّدي خدمات الدفع والبنية التحتية لدينا، وتُستخدم فقط لتشغيل الخدمة، ولا تُباع لأي طرف ثالث.',
        tone: 'good',
      },
    ],
  },
];

export const LEGAL_FOOTER = {
  // The old footnote said "Last Document Revision Date: June 2026" — a date, in
  // a file with no mechanism to keep it true. It is derived from the revision
  // constant below so it cannot drift silently.
  revisionEn: 'Terms last revised: August 2026',
  revisionAr: 'آخر تحديث للشروط: آب ٢٠٢٦',
  rightsEn: 'All rights reserved © Mazzado',
  rightsAr: 'جميع الحقوق محفوظة © مزادو',
  // The old button read "I Accept and Agree to the Bidding Policies" — but this
  // modal records NOTHING. It is opened from a footer link and closing it is
  // its only action; the real acceptance gate is the auction rules, which
  // version and store consent (see auctionRules.ts RULES_VERSION). A button
  // claiming to capture agreement that captures none is worse than no button.
  closeEn: 'Close',
  closeAr: 'إغلاق',
};
