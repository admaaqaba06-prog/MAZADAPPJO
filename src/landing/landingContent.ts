/**
 * Typed bilingual content for the public landing page.
 *
 * WHY THIS IS NOT `translations.ts`
 *
 * The old landing copy lived in a 590-line `TranslationType` shared by a
 * 3,000-line page, and the two grew into each other: fields survived long after
 * their section was deleted (`howItWorks`, most of `interactive`), and sections
 * read fields that described a simulation rather than the marketplace
 * (`carTitle`, `bidBtn`, `hero.proof`). Splitting the copy out gives each
 * redesigned section an explicit, narrow contract its component can be tested
 * against, and gives the claims a single place to be reviewed.
 *
 * EVERY FACTUAL CLAIM HERE IS SOURCED, NOT WRITTEN
 *
 * This file states fees, timing, protection and verification, which means a
 * wrong sentence here is a promise the product does not keep. The sources:
 *
 * - Fees, binding bids, 24h payment, anti-sniping, no deposit, buyer
 *   protection, inspect-on-delivery → `src/content/auctionRules.ts`
 *   (the locked E1/E4 policy).
 * - Dispute handling and the 72-working-hour refund PROCESSING time →
 *   `src/content/legalTerms.ts`.
 * - Subscription prices → `src/constants/subscriptionTiers.ts`, itself a mirror
 *   of the authoritative `functions/subscriptionTiers.js`.
 * - "First bid starts the clock" → `functions/settlement.js`, where a
 *   `startMode: 'first_bid'` lot is stamped with an end time on its first bid.
 * - Support number, WhatsApp and Instagram → `src/constants/support.ts`
 *   (referenced by the components, never re-typed as copy).
 *
 * DELIBERATELY ABSENT, and not to be added without evidence:
 *
 * - Scale statistics (`15,000+ buyers` and friends). Never measured.
 * - Testimonials. None were ever collected.
 * - Any claim that sellers are identity-verified. `LandingAuction.isVerified`
 *   is `approvalStatus === 'approved'` — Mazzado reviewed the LISTING. The copy
 *   says exactly that much and no more.
 * - Any claim that every lot can be viewed in person, or that refunds are
 *   unconditional. Viewing is arranged per auction; once release is approved
 *   the sale is final.
 * - Operating hours. There is no constant for them anywhere in the repo, so
 *   there is no verified value to print.
 */
import type { SubscriptionTierId } from '../constants/subscriptionTiers';

export type LandingLanguage = 'ar' | 'en';

/**
 * The language the landing page opens in.
 *
 * Arabic-first: a visitor with no saved choice gets Arabic. A saved choice
 * wins, and — matching `normalizeLanguage` in `utils/languagePersistence.ts`
 * and `resolveLang` in `functions/messageCopy.js` — only an exact `'en'` counts
 * as English, so a junk value reads as Arabic rather than as a third state.
 *
 * Takes the storage rather than reaching for `localStorage` itself: this ran
 * inline in a `useState` initialiser before, which made the rule untestable and
 * threw outright in a browser with site data blocked. `null` is a legitimate
 * argument, meaning "no storage available".
 */
export function getInitialLandingLanguage(
  storage: Pick<Storage, 'getItem'> | null
): LandingLanguage {
  try {
    return storage?.getItem('mazad_language') === 'en' ? 'en' : 'ar';
  } catch {
    // Private-mode Safari and cookie-blocked embeds throw here rather than
    // returning null. A default is always available; a crash is not.
    return 'ar';
  }
}

/** A header link. `id` must match a section id actually rendered on the page. */
export interface LandingNavLink {
  id: string;
  label: string;
}

export interface LandingNavContent {
  /** Accessible name for the logo link, since the mark carries no text. */
  brandLabel: string;
  links: LandingNavLink[];
  browseCta: string;
  sellCta: string;
  /** Names the language being switched TO, which is what the control offers. */
  languageToggle: string;
  menuOpenLabel: string;
  menuCloseLabel: string;
  supportLabel: string;
}

export interface LandingHeroContent {
  badge: string;
  title: string;
  /** Must carry the first-bid mechanic; it is the page's whole explanation. */
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  points: string[];
  featuredLabel: string;
  openingPriceLabel: string;
  viewCta: string;
  loadingLabel: string;
  /** Shown when curation yields no lot — an honest panel, never a fake one. */
  fallbackTitle: string;
  fallbackBody: string;
}

export interface LandingMarketplaceContent {
  title: string;
  subtitle: string;
  /** Badge on a lot with no bids and no clock. */
  firstBidLabel: string;
  /** The one sentence that explains why such a lot shows no countdown. */
  firstBidHint: string;
  openingPriceLabel: string;
  currentBidLabel: string;
  bidsLabel: string;
  /** Listing review, NOT seller identity verification. See the file header. */
  verifiedLabel: string;
  verifiedHint: string;
  endingSoonLabel: string;
  viewCta: string;
  categoryAllLabel: string;
  loadingLabel: string;
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  errorTitle: string;
  errorBody: string;
  errorRetryCta: string;
  /** Alt/label text when a lot's image is missing or fails to load. */
  imageFallbackLabel: string;
  /** Currency suffix. Category labels come from `utils/categories.ts`. */
  currency: string;
}

export interface LandingHowStep {
  id: string;
  title: string;
  body: string;
}

export interface LandingHowContent {
  title: string;
  subtitle: string;
  steps: LandingHowStep[];
}

export interface LandingTrustPoint {
  id: string;
  title: string;
  body: string;
}

export interface LandingTrustContent {
  title: string;
  subtitle: string;
  points: LandingTrustPoint[];
  rulesCta: string;
  supportCta: string;
}

export interface LandingSellerContent {
  badge: string;
  title: string;
  body: string;
  points: string[];
  cta: string;
  /** Must state the commission; the test pins the 5%. */
  feeNote: string;
}

export interface LandingPricingPlan {
  id: SubscriptionTierId;
  name: string;
  priceLabel: string;
  periodLabel: string;
  /** Empty string rather than an absent key, so both languages share a shape. */
  badge: string;
  features: string[];
}

export interface LandingPricingContent {
  title: string;
  subtitle: string;
  plans: LandingPricingPlan[];
  buyerPremiumLabel: string;
  buyerPremiumNote: string;
  noDepositNote: string;
  cta: string;
}

export interface LandingFaqItem {
  id: string;
  q: string;
  a: string;
}

export interface LandingFaqContent {
  title: string;
  subtitle: string;
  items: LandingFaqItem[];
}

export interface LandingFooterContent {
  finalTitle: string;
  finalBody: string;
  browseCta: string;
  sellCta: string;
  description: string;
  supportTitle: string;
  whatsappLabel: string;
  phoneLabel: string;
  instagramLabel: string;
  legalTitle: string;
  termsLabel: string;
  privacyLabel: string;
  rulesLabel: string;
  languageLabel: string;
  rights: string;
}

export interface LandingContent {
  dir: 'rtl' | 'ltr';
  langCode: LandingLanguage;
  nav: LandingNavContent;
  hero: LandingHeroContent;
  marketplace: LandingMarketplaceContent;
  how: LandingHowContent;
  trust: LandingTrustContent;
  seller: LandingSellerContent;
  pricing: LandingPricingContent;
  faq: LandingFaqContent;
  footer: LandingFooterContent;
}

const ar: LandingContent = {
  dir: 'rtl',
  langCode: 'ar',
  nav: {
    brandLabel: 'مزادو — الصفحة الرئيسية',
    links: [
      { id: 'auctions', label: 'المزادات' },
      { id: 'how', label: 'كيف يعمل' },
      { id: 'trust', label: 'الأمان' },
      { id: 'sell', label: 'بيع' },
      { id: 'pricing', label: 'الاشتراك' },
    ],
    browseCta: 'تصفّح المزادات',
    sellCta: 'بيع منتجك',
    languageToggle: 'English',
    menuOpenLabel: 'افتح القائمة',
    menuCloseLabel: 'أغلق القائمة',
    supportLabel: 'دعم واتساب',
  },
  hero: {
    badge: 'مزادات حقيقية في الأردن 🇯🇴',
    title: 'اكتشف صفقتك وابدأ المزاد بنفسك',
    subtitle:
      'منتجات حقيقية معروضة بأسعار افتتاح واضحة. وفي المزادات المؤهّلة، أول مزايدة صحيحة هي اللي تشغّل العدّاد.',
    primaryCta: 'تصفّح المزادات',
    secondaryCta: 'بيع منتجك',
    points: [
      'منتجات حقيقية بصور من البائع',
      'سعر الافتتاح واضح قبل ما تزايد',
      'تتصفّح بدون تسجيل',
    ],
    featuredLabel: 'مزاد مميّز',
    openingPriceLabel: 'سعر الافتتاح',
    viewCta: 'شوف المزاد',
    loadingLabel: 'جاري تحميل المزادات…',
    fallbackTitle: 'المزادات تتجدّد باستمرار',
    fallbackBody: 'تصفّح كل المعروض الآن، أو اعرض سلعتك وخلّي المشترين ينافسوا عليها.',
  },
  marketplace: {
    title: 'مزادات تنتظر أول مزايدة',
    subtitle: 'سلع حقيقية معروضة الآن بأسعار افتتاح منخفضة.',
    firstBidLabel: 'كن أول مزايد',
    firstBidHint: 'أول مزايدة صحيحة تشغّل عدّاد المزاد.',
    openingPriceLabel: 'سعر الافتتاح',
    currentBidLabel: 'أعلى مزايدة',
    bidsLabel: 'مزايدة',
    verifiedLabel: 'إعلان مُراجَع',
    verifiedHint: 'راجَع مزادو هذا الإعلان قبل نشره.',
    endingSoonLabel: 'ينتهي قريباً',
    viewCta: 'شوف المزاد',
    categoryAllLabel: 'كل الفئات',
    loadingLabel: 'جاري تحميل المزادات…',
    emptyTitle: 'ما في مزادات معروضة هالوقت',
    emptyBody: 'كن من أوائل البائعين — اعرض سلعتك وخلّيها أول ما يشوفه المشترين.',
    emptyCta: 'بيع منتجك',
    errorTitle: 'ما قدرنا نحمّل المزادات',
    errorBody: 'صار خلل مؤقت بالاتصال. جرّب مرة ثانية، وإذا استمر تواصل معنا على واتساب.',
    errorRetryCta: 'جرّب مرة ثانية',
    imageFallbackLabel: 'ما في صورة لهذا المنتج',
    currency: 'د.أ',
  },
  how: {
    title: 'كيف يعمل المزاد؟',
    subtitle: 'ثلاث خطوات من أول مزايدة لحد ما توصلك السلعة.',
    steps: [
      {
        id: 'first-bid',
        title: 'زايد أول واحد وشغّل العدّاد',
        body:
          'في المزادات المؤهّلة، ما في عدّاد قبل ما تصير أول مزايدة. أول مزايدة صحيحة هي اللي تبدأ الوقت — فتكون أنت من فتح المزاد بسعر الافتتاح.',
      },
      {
        id: 'bid-rules',
        title: 'زايد بقواعد واضحة',
        body:
          'كل مزاد يعرض الحد الأدنى للزيادة، وكل مزايدة مُلزِمة. وإذا صارت مزايدة في الثواني الأخيرة، يتمدّد الوقت تلقائياً حتى ما تُخطف الصفقة في اللحظة الأخيرة.',
      },
      {
        id: 'win-pay',
        title: 'افز وادفع بأمان',
        body:
          'صاحب أعلى مزايدة صحيحة عند الإغلاق يفوز، ويدفع خلال 24 ساعة عبر كليك. يحتجز مزادو المبلغ ولا يحوّله للبائع إلا بعد ما تستلم السلعة وتتفحصها وتوافق.',
      },
    ],
  },
  trust: {
    title: 'ليش تزايد على مزادو بأمان؟',
    subtitle: 'قواعد مكتوبة، دفع محتجز، ودعم تقدر توصله.',
    points: [
      {
        id: 'real-photos',
        title: 'صور حقيقية من البائع',
        body: 'كل إعلان يعرض صور السلعة نفسها وتفاصيلها كما قدّمها البائع.',
      },
      {
        id: 'reviewed-listings',
        title: 'إعلانات مُراجَعة',
        body: 'يراجع مزادو الإعلان قبل نشره، ويحق له إلغاء أو تعليق أي مزاد لحماية العدالة.',
      },
      {
        id: 'fair-rules',
        title: 'قواعد واضحة وحماية من المزايدة الخاطفة',
        body: 'الحد الأدنى للزيادة معروض، والمزايدة في الثواني الأخيرة تمدّد الوقت تلقائياً.',
      },
      {
        id: 'held-payment',
        title: 'دفعتك محتجزة حتى تتأكد',
        body:
          'يحتجز مزادو المبلغ ولا يحوّله للبائع إلا بعد استلامك وتأكيدك. وإذا كانت السلعة مختلفة عن الوصف، افتح نزاعاً قبل الموافقة ويتوسّط مزادو.',
      },
      {
        id: 'no-deposit',
        title: 'لا تأمين للمزايدة',
        body: 'ما في وديعة ولا رصيد مطلوب حتى تزايد. تدفع بعد الفوز فقط.',
      },
      {
        id: 'support',
        title: 'دعم واتساب مباشر',
        body: 'تواصل معنا مباشرة قبل المزايدة أو بعدها، وبنرد عليك على نفس الرقم.',
      },
    ],
    rulesCta: 'اقرأ قواعد المزاد',
    supportCta: 'تواصل عبر واتساب',
  },
  seller: {
    badge: 'للبائعين',
    title: 'خلّي المشترين ينافسوا على سلعتك',
    body:
      'بدل ما تفاوض عشرات الناس على السعر، اعرض سلعتك مرة واحدة وخلّي المزاد يوصل للسعر الحقيقي.',
    points: [
      'منافسة منظّمة بدل مفاوضات متكرّرة',
      'وقت بيع محدّد بقواعد واضحة',
      'ما تدفع شي إلا إذا انباعت السلعة',
    ],
    cta: 'بيع منتجك',
    feeNote: 'لا رسوم عرض حالياً. تستلم 95٪ من سعر البيع، وعمولة نجاح 5٪ فقط عند البيع.',
  },
  pricing: {
    title: 'اشتراك المزايدة',
    subtitle: 'التصفّح مجاني للجميع. الاشتراك مطلوب للمزايدة، وهو اللي يحفظ جدّية المزايدين.',
    plans: [
      {
        id: 'monthly',
        name: 'شهر واحد',
        priceLabel: '1 دينار',
        periodLabel: '/ شهر',
        badge: '',
        features: ['مزايدة غير محدودة', 'دخول فوري للمزادات', 'دعم عبر واتساب'],
      },
      {
        id: 'semiannual',
        name: '6 أشهر',
        priceLabel: '4 دنانير',
        periodLabel: '/ 6 أشهر',
        badge: 'الأكثر شيوعاً',
        features: ['مزايدة غير محدودة', 'دخول فوري للمزادات', 'دعم واتساب بأولوية'],
      },
      {
        id: 'annual',
        name: 'سنة كاملة',
        priceLabel: '7 دنانير',
        periodLabel: '/ سنة',
        badge: 'أفضل قيمة',
        features: ['مزايدة غير محدودة', 'دخول فوري للمزادات', 'دعم واتساب بأولوية'],
      },
    ],
    buyerPremiumLabel: 'عمولة المشتري',
    buyerPremiumNote: 'تُضاف عمولة مشترٍ 5٪ فوق سعر الفوز عند الدفع.',
    noDepositNote: 'لا يُطلب أي تأمين (وديعة) للمزايدة.',
    cta: 'اشترك الآن',
  },
  faq: {
    title: 'أسئلة قبل ما تزايد',
    subtitle: 'أهم ست نقاط عن الاشتراك، الوقت، الدفع، والبيع.',
    items: [
      {
        id: 'why-subscription',
        q: 'ليش في اشتراك للمزايدة؟',
        a:
          'الاشتراك يحفظ جدّية المزايدين ويقلّل المزايدات الوهمية. بدينار واحد شهرياً تزايد على كل المزادات بلا حد. والتصفّح يبقى مجاني بدون تسجيل.',
      },
      {
        id: 'when-timer-starts',
        q: 'إيمتى يبدأ العدّاد؟',
        a:
          'في المزادات المؤهّلة، ما في عدّاد لحد ما تصير أول مزايدة صحيحة — وهي اللي تبدأ الوقت. أما المزادات المجدولة فتشتغل بوقت محدّد معروض على الإعلان. وفي كل الحالات، المزايدة في الثواني الأخيرة تمدّد الوقت.',
      },
      {
        id: 'item-differs',
        q: 'شو إذا كانت السلعة مختلفة عن الوصف؟',
        a:
          'افحص السلعة عند الاستلام. إذا كانت تالفة أو مختلفة جوهرياً عن الإعلان، افتح نزاعاً قبل ما توافق على تحرير المبلغ، ويتوسّط مزادو ويمكنه إرجاع المبلغ المحتجز. وإذا استُحق الاسترداد، تُعالج إعادته خلال 72 ساعة عمل من تقديم الطلب.',
      },
      {
        id: 'how-payment-works',
        q: 'كيف تصير عملية الدفع؟',
        a:
          'الفائز يدفع خلال 24 ساعة من إغلاق المزاد عبر كليك، وتُضاف عمولة مشترٍ 5٪ فوق سعر الفوز. يحتجز مزادو المبلغ ولا يحوّله للبائع إلا بعد استلامك وتأكيدك. وبمجرد موافقتك على تحرير المبلغ تكتمل الصفقة.',
      },
      {
        id: 'cost-to-sell',
        q: 'قدّيش تكلفة البيع؟',
        a:
          'لا رسوم عرض حالياً. تستلم 95٪ من سعر البيع وتُخصم عمولة نجاح 5٪ عند البيع فقط. وإذا ما انباعت السلعة، ما تدفع شي.',
      },
      {
        id: 'arrange-viewing',
        q: 'كيف أرتّب معاينة إذا كانت متاحة؟',
        a:
          'المعاينة ما هي متاحة على كل مزاد — تختلف حسب السلعة والبائع. إذا حابب تعاين قطعة معيّنة قبل المزايدة، تواصل معنا على واتساب وبنتأكد إذا ممكن نرتّبها.',
      },
    ],
  },
  footer: {
    finalTitle: 'جاهز تلقط صفقتك؟',
    finalBody: 'تصفّح المزادات المعروضة الآن، وكن أول مزايد على سلعة تناسبك.',
    browseCta: 'تصفّح المزادات',
    sellCta: 'بيع منتجك',
    description: 'مزادو — مزادات حقيقية في الأردن، بقواعد واضحة ودفع محتجز حتى الاستلام.',
    supportTitle: 'الدعم',
    whatsappLabel: 'واتساب',
    phoneLabel: 'اتصل بنا',
    instagramLabel: 'إنستغرام',
    legalTitle: 'قانوني',
    termsLabel: 'الشروط والأحكام',
    privacyLabel: 'سياسة الخصوصية',
    rulesLabel: 'قواعد المزاد',
    languageLabel: 'اللغة',
    rights: '© 2026 مزادو. صُمّم للسوق الأردني 🇯🇴',
  },
};

const en: LandingContent = {
  dir: 'ltr',
  langCode: 'en',
  nav: {
    brandLabel: 'Mazzado — home',
    links: [
      { id: 'auctions', label: 'Auctions' },
      { id: 'how', label: 'How it works' },
      { id: 'trust', label: 'Safety' },
      { id: 'sell', label: 'Sell' },
      { id: 'pricing', label: 'Subscription' },
    ],
    browseCta: 'Browse auctions',
    sellCta: 'Sell an item',
    languageToggle: 'العربية',
    menuOpenLabel: 'Open menu',
    menuCloseLabel: 'Close menu',
    supportLabel: 'WhatsApp support',
  },
  hero: {
    badge: 'Real auctions in Jordan 🇯🇴',
    title: 'Find your deal and start the auction yourself',
    subtitle:
      'Real items listed with clear opening prices. On eligible lots, the first bid starts the countdown.',
    primaryCta: 'Browse auctions',
    secondaryCta: 'Sell an item',
    points: [
      'Real items, photographed by the seller',
      'Opening price shown before you bid',
      'Browse without registering',
    ],
    featuredLabel: 'Featured auction',
    openingPriceLabel: 'Opening price',
    viewCta: 'View auction',
    loadingLabel: 'Loading auctions…',
    fallbackTitle: 'New auctions arrive regularly',
    fallbackBody: 'Browse everything listed right now, or list your own item and let buyers compete.',
  },
  marketplace: {
    title: 'Auctions waiting for their first bid',
    subtitle: 'Real items listed right now at low opening prices.',
    firstBidLabel: 'Be the first',
    firstBidHint: 'The first bid starts this auction’s countdown.',
    openingPriceLabel: 'Opening price',
    currentBidLabel: 'Highest bid',
    bidsLabel: 'bids',
    verifiedLabel: 'Reviewed listing',
    verifiedHint: 'Mazzado reviewed this listing before it went live.',
    endingSoonLabel: 'Ending soon',
    viewCta: 'View auction',
    categoryAllLabel: 'All categories',
    loadingLabel: 'Loading auctions…',
    emptyTitle: 'No auctions are listed right now',
    emptyBody: 'Be one of the first sellers — list your item and be what buyers see first.',
    emptyCta: 'Sell an item',
    errorTitle: 'We could not load the auctions',
    errorBody:
      'That was a temporary connection problem. Try again, and if it keeps happening reach us on WhatsApp.',
    errorRetryCta: 'Try again',
    imageFallbackLabel: 'No photo for this item',
    currency: 'JOD',
  },
  how: {
    title: 'How the auction works',
    subtitle: 'Three steps, from the first bid to the item in your hands.',
    steps: [
      {
        id: 'first-bid',
        title: 'Place the first bid and start the clock',
        body:
          'On eligible lots there is no countdown until someone bids. The first bid starts the clock — so you open the auction at its opening price.',
      },
      {
        id: 'bid-rules',
        title: 'Bid under clear rules',
        body:
          'Every auction shows its minimum increment, and every bid is binding. A bid in the final seconds extends the clock automatically, so a deal cannot be sniped at the last moment.',
      },
      {
        id: 'win-pay',
        title: 'Win and pay safely',
        body:
          'The highest valid bid at closing wins, and payment is due within 24 hours via CliQ. Mazzado holds the money and releases it to the seller only after you receive the item, check it, and approve.',
      },
    ],
  },
  trust: {
    title: 'Why bidding here is safe',
    subtitle: 'Written rules, held payments, and support you can actually reach.',
    points: [
      {
        id: 'real-photos',
        title: 'Real photos from the seller',
        body: 'Every listing shows the actual item and its details as the seller provided them.',
      },
      {
        id: 'reviewed-listings',
        title: 'Reviewed listings',
        body:
          'Mazzado reviews a listing before it goes live, and may cancel or suspend any auction to protect fairness.',
      },
      {
        id: 'fair-rules',
        title: 'Clear rules and anti-sniping',
        body: 'The minimum increment is published, and a bid in the final seconds extends the clock.',
      },
      {
        id: 'held-payment',
        title: 'Your payment is held until you confirm',
        body:
          'Mazzado holds the money and releases it only after you receive and approve the item. If it does not match the listing, open a dispute before approving and Mazzado will mediate.',
      },
      {
        id: 'no-deposit',
        title: 'No deposit to bid',
        body: 'No security deposit and no balance are required to bid. You pay only after you win.',
      },
      {
        id: 'support',
        title: 'Direct WhatsApp support',
        body: 'Message us before or after you bid — the same number answers.',
      },
    ],
    rulesCta: 'Read the auction rules',
    supportCta: 'Chat on WhatsApp',
  },
  seller: {
    badge: 'For sellers',
    title: 'Let buyers compete for your item',
    body:
      'Instead of negotiating the same price with dozens of people, list once and let the auction find what the item is really worth.',
    points: [
      'Structured competition instead of repeated haggling',
      'A defined selling window with clear rules',
      'You pay nothing unless the item sells',
    ],
    cta: 'Sell an item',
    feeNote:
      'There are currently no listing fees. You keep 95% of the sale price, with a 5% success commission only when the item sells.',
  },
  pricing: {
    title: 'Bidder subscription',
    subtitle:
      'Browsing is free for everyone. A subscription is required to bid, and it is what keeps bidders serious.',
    plans: [
      {
        id: 'monthly',
        name: '1 month',
        priceLabel: '1 JOD',
        periodLabel: '/ month',
        badge: '',
        features: ['Unlimited bidding', 'Instant entry to auctions', 'WhatsApp support'],
      },
      {
        id: 'semiannual',
        name: '6 months',
        priceLabel: '4 JOD',
        periodLabel: '/ 6 months',
        badge: 'Most popular',
        features: ['Unlimited bidding', 'Instant entry to auctions', 'Priority WhatsApp support'],
      },
      {
        id: 'annual',
        name: '1 year',
        priceLabel: '7 JOD',
        periodLabel: '/ year',
        badge: 'Best value',
        features: ['Unlimited bidding', 'Instant entry to auctions', 'Priority WhatsApp support'],
      },
    ],
    buyerPremiumLabel: 'Buyer premium',
    buyerPremiumNote: 'A 5% buyer premium is added on top of the winning bid at payment.',
    noDepositNote: 'No security deposit is required to bid.',
    cta: 'Subscribe now',
  },
  faq: {
    title: 'Questions before you bid',
    subtitle: 'The six things most worth knowing about subscribing, timing, paying, and selling.',
    items: [
      {
        id: 'why-subscription',
        q: 'Why is there a subscription for bidding?',
        a:
          'It keeps bidders serious and cuts down fake bidding. For 1 JOD a month you can bid on every auction without limit, and browsing stays free with no account at all.',
      },
      {
        id: 'when-timer-starts',
        q: 'When does the timer start?',
        a:
          'On eligible lots there is no countdown until the first bid is placed — that bid starts the clock. Scheduled auctions instead run a fixed window shown on the listing. In both cases, a bid in the final seconds extends the clock.',
      },
      {
        id: 'item-differs',
        q: 'What if the item differs from its description?',
        a:
          'Inspect the item on delivery. If it is damaged or materially different from the listing, open a dispute before approving release: Mazzado mediates and can return the held funds. Where a refund is due, it is processed back to you within 72 working hours of the request.',
      },
      {
        id: 'how-payment-works',
        q: 'How does payment work?',
        a:
          'The winner pays within 24 hours of closing via CliQ, with a 5% buyer premium added on top of the winning bid. Mazzado holds the payment and releases it to the seller only after you receive and approve the item. Once you approve release, the sale is complete.',
      },
      {
        id: 'cost-to-sell',
        q: 'What does it cost to sell?',
        a:
          'There are currently no listing fees. You keep 95% of the sale price and a 5% success commission is deducted only when the item sells. If it does not sell, you pay nothing.',
      },
      {
        id: 'arrange-viewing',
        q: 'How can I arrange a viewing when one is available?',
        a:
          'Viewing is not offered on every auction — it depends on the item and the seller. If you want to see a particular lot before bidding, message us on WhatsApp and we will check whether it can be arranged.',
      },
    ],
  },
  footer: {
    finalTitle: 'Ready to find your deal?',
    finalBody: 'Browse what is listed right now and be the first to bid on something you want.',
    browseCta: 'Browse auctions',
    sellCta: 'Sell an item',
    description:
      'Mazzado — real auctions in Jordan, with clear rules and payment held until you receive your item.',
    supportTitle: 'Support',
    whatsappLabel: 'WhatsApp',
    phoneLabel: 'Call us',
    instagramLabel: 'Instagram',
    legalTitle: 'Legal',
    termsLabel: 'Terms & conditions',
    privacyLabel: 'Privacy policy',
    rulesLabel: 'Auction rules',
    languageLabel: 'Language',
    rights: '© 2026 Mazzado. Built for the Jordanian market 🇯🇴',
  },
};

export const landingContent: Record<LandingLanguage, LandingContent> = { ar, en };
