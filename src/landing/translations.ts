/**
 * LEGACY landing copy. Nothing reads it.
 *
 * The landing page reads `landingContent.ts` — typed per section, with every
 * factual claim sourced against `content/auctionRules.ts`,
 * `content/legalTerms.ts` and `constants/subscriptionTiers.ts`. This file was
 * emptied field by field as each section moved across; the fields below are the
 * remainder, kept only for the reason in the last paragraph.
 *
 * ALREADY REMOVED, and not to be re-added: `nav.logo`, `nav.liveExp`, the hero
 * simulator's labels (`liveBadge`, `verifiedSeller`, `carTitle`, `carDetails`,
 * `currentPrice`, `bidBtn`, `features`, `seconds`, `minutes`), the whole
 * `howItWorks` block, every `interactive` field except `bidLogYou`, the
 * `comingSoon` countdown labels and `emptyRegistered`, and
 * `marketplace.currentBid`. Each had already lost its last reader — several
 * when the section that rendered it was deleted — and an unread translation
 * field is worse than none: it still gets dutifully re-translated, reviewed as
 * a live claim, and copied into the next redesign.
 *
 * NOW ALSO GONE, with the page that rendered them: `hero.proof` — the
 * `15,000+ buyers` / `1,250+ items sold` / `3,400+ items listed` figures, none
 * of which was ever measured — and the whole `comingSoon` block, which was a
 * local-storage-only "early adopter" form seeded with invented signups. It
 * recorded nothing and reached nobody. `nav.comingSoon` went with its anchor.
 *
 * WHAT IS LEFT IS UNRENDERED. The redesign reads `landingContent.ts`, so nothing
 * in this file reaches a screen any more; it survives only because
 * `utils/depositFraming.test.ts` scans it for deposit-to-bid phrasing. That scan
 * should be retargeted at `landingContent.ts` — the copy that actually ships —
 * and this file deleted. Flagged rather than done here: retargeting a test that
 * guards a different concern is a separate change.
 */
export interface TranslationType {
  dir: "rtl" | "ltr";
  langCode: "ar" | "en";
  nav: {
    whyUs: string;
    categories: string;
    pricing: string;
    reserveBtn: string;
    langBtn: string;
  };
  hero: {
    badge: string;
    titleFirst: string;
    titleGradient: string;
    titleLast: string;
    desc: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  trust: {
    badge: string;
    title: string;
    subtitle: string;
    cards: Array<{
      icon: string;
      title: string;
      desc: string;
    }>;
  };
  why: {
    title: string;
    subtitle: string;
    traditionalTitle: string;
    traditionalPoints: string[];
    smartTitle: string;
    smartPoints: string[];
  };
  interactive: {
    bidLogYou: string;
  };
  categories: {
    title: string;
    subtitle: string;
    list: Array<{
      icon: string;
      title: string;
      desc: string;
    }>;
  };
  faq: {
    title: string;
    subtitle: string;
    items: Array<{
      q: string;
      a: string;
    }>;
  };
  footer: {
    desc: string;
    links: {
      whyUs: string;
      categories: string;
      contact: string;
    };
    rights: string;
  };
  marketplace: {
    badge: string; title: string; subtitle: string; bids: string;
    verified: string; endingSoon: string; beTheFirst: string; viewBtn: string; emptyTitle: string; emptyDesc: string;
    unavailableTitle: string; unavailableDesc: string;
    sellerCtaText: string; sellerCtaBtn: string;
    /* `categoryLabels` was here — a second copy of the category taxonomy,
       maintained by hand and drifted from `utils/categories.ts`. Category
       labels now come from `categoryLabel()` at the call site, so there is one
       list to keep correct instead of two. Do not add it back. */
  };
}

export const translations: Record<"ar" | "en", TranslationType> = {
  ar: {
    dir: "rtl",
    langCode: "ar",
    nav: {
      whyUs: "لماذا مزادو؟",
      categories: "الفئات",
      pricing: "اشتراكات",
      reserveBtn: "تواصل معنا",
      langBtn: "English",
    },
    hero: {
      badge: "منصة مزادات ذكية للسوق الأردني 🇯🇴",
      titleFirst: "بيع أسرع.",
      titleGradient: "واشترِ بأرخص سعر.",
      // Two lines now, not three. The third span is guarded in LandingView so an
      // empty string does not leave a flex gap where a line used to be.
      titleLast: "",
      desc: "اعرض منتجك وبِعه خلال 15 دقيقة، واكتشف أفضل الصفقات بأقل الأسعار.",
      ctaPrimary: "اعرض سلعتك للبيع",
      ctaSecondary: "تصفّح المزادات المباشرة",
    },
    trust: {
      badge: "الأمان والنزاهة",
      title: "مزاد ليس للتصفية. مزاد للقيمة الحقيقية.",
      subtitle: "صممنا Mazzado ليكون بيئة آمنة تضمن لكل بائع حقه ولكل مشترٍ فرصته العادلة.",
      cards: [
        {
          icon: "🛡️",
          title: "توثيق البائعين",
          desc: "التحقق القانوني الكامل من الهوية والأوراق الرسمية قبل بدء أي مزاد لتعزيز المصداقية والثقة.",
        },
        {
          icon: "📸",
          title: "صور واضحة وحقيقية",
          desc: "صور حقيقية عالية الجودة تغطي جميع جوانب وتفاصيل المنتج.",
        },
        {
          icon: "⚡",
          title: "مزايدة مباشرة",
          desc: "متابعة المزايدات وتحديث الأسعار بشكل لحظي وتفاعلي متزامن دون أي تأخير.",
        },
        {
          icon: "⚖️",
          title: "قواعد عادلة",
          desc: "تمديد تلقائي للوقت عند المزايدة في الدقائق الأخيرة لضمان عدم ضياع الفرصة بمنع المزايدات الخاطفة.",
        },
      ],
    },
    why: {
      title: "لماذا Mazzado؟",
      subtitle: "بدل ما تفاوض عشرات الناس… خليهم ينافسوا عليك.",
      traditionalTitle: "الطريقة التقليدية",
      traditionalPoints: [
        "مفاوضات متعبة وتكرار عبارة 'آخر سعر؟'",
        "هدر وقت مع مشترين غير جادين وهواة بخس السلع",
        "السعر يعكس توقع البائع الشخصي لا الطلب الفعلي",
        "وقت بيع غير واضح قد يمتد لأسابيع أو أشهر",
      ],
      smartTitle: "Mazzado - ذكي",
      smartPoints: [
        "منافسة منظمة وعادلة ترفع السعر تلقائياً لصالحك",
        "مزايدون موثوقون وعضوية مدفوعة تضمن جدية الجميع",
        "اكتشاف السعر الحقيقي للمنتج بدقة حسب حجم الطلب",
        "وقت بيع محدد بدقة مع إشعارات ذكية وشفافية مطلقة",
      ],
    },
    interactive: {
      bidLogYou: "أنت (مزايد جديد)",
    },
    categories: {
      title: "الفئات",
      subtitle: "منتجات عالية القيمة تستحق مزاداً منظماً.",
      list: [
        {
          icon: "🚗",
          title: "سيارات",
          desc: "سيارات بصور حقيقية وتفاصيل واضحة وإجراءات نقل ملكية آمنة.",
        },
        {
          icon: "🏠",
          title: "عقارات",
          desc: "شقق سكنية، أراضي استثمارية، ومحلات تجارية منظمة قانونياً.",
        },
        {
          icon: "💻",
          title: "إلكترونيات",
          desc: "موبايلات مميزة، لابتوبات احترافية، وأجهزة ذكية بصور حقيقية.",
        },
        {
          icon: "🏗️",
          title: "معدات وآلات",
          desc: "معدات صناعية، زراعية، وآلات تشغيلية للمشاريع.",
        },
        {
          icon: "⌚",
          title: "مقتنيات فاخرة",
          desc: "ساعات ثمينة، مجوهرات، تحف ونوادر لهواة التميز.",
        },
        {
          icon: "🔢",
          title: "أرقام مميزة",
          desc: "أرقام لوحات سيارات وأرقام هواتف موثقة قانونياً ومنظمة.",
        },
      ],
    },
    faq: {
      title: "الأسئلة الشائعة",
      subtitle: "كل ما تود معرفته عن الاشتراك، المشاركة، العمولات، والضمانات في Mazzado",
      items: [
        {
          q: "لماذا يوجد اشتراك للمزايدة؟",
          a: "الاشتراك يضمن جدية المزايدين. مقابل دينار واحد شهرياً تحصل على مزايدة غير محدودة على قطع موثقة بالكامل — وهذا يمنع المزايدات الوهمية ويحافظ على عدالة المزاد للجميع."
        },
        {
          q: "كيف أدفع؟",
          a: "الاشتراكات تُدفع عبر كليك. أما مدفوعات المزادات فيحتفظ بها مزادو ولا تُحوَّل للبائع إلا بعد استلامك للقطعة وتأكيدك. تُضاف عمولة مشترٍ 5٪ عند الفوز."
        },
        {
          q: "ماذا تعني \"حماية المشتري من مزادو\"؟",
          a: "نحتجز مبلغ الدفع حتى تستلم المنتج وتؤكد مطابقته للوصف، ثم نحوّله للبائع. ويمكنك عرض منتجك بنفسك أو يساعدك فريقنا في تجهيزه وعرضه."
        },
        {
          q: "ماذا يمكنني أن أبيع؟",
          a: "تقريباً أي شيء ذي قيمة — إلكترونيات، ساعات، مقتنيات، معدات وغيرها. أحضر منتجك وسيقيّمه فريقنا. ولا توجد رسوم عرض حالياً."
        },
        {
          q: "ماذا لو كانت القطعة مختلفة عن الوصف؟",
          a: "دفعتك تبقى محجوزة لدى مزادو ولا تُحوَّل للبائع إلا بعد ما تستلم القطعة وتتأكد إنها مطابقة. إذا صار أي إشكال، تواصل معنا وبنتوسّط لحلّه."
        },
        {
          q: "كم تكلفة البيع؟",
          a: "لا شيء مقدماً. البائع يستلم 95٪ — عمولة 5٪ فقط عند بيع منتجك. إذا لم يُبَع، لا تدفع شيئاً."
        }
      ]
    },
    footer: {
      desc: "منصة المزادات الحديثة الأولى في المملكة الأردنية الهاشمية - بيع أسرع، تزايد بذكاء، واربح بثقة.",
      links: {
        whyUs: "لماذا نحن؟",
        categories: "الفئات",
        contact: "تواصل معنا",
      },
      rights: "© 2026 Mazzado. صمم للسوق الأردني بكل فخر 🇯🇴",
    },
    marketplace: {
      badge: "مباشر الآن",
      title: "مزادات مباشرة على مزادو الآن",
      subtitle: "سلع معروضة تُباع الآن — هكذا ستظهر سلعتك أمام المشترين.",
      bids: "مزايدة",
      verified: "موثّقة",
      endingSoon: "ينتهي قريباً",
      beTheFirst: "كن أول مزايد",
      viewBtn: "شاهد المزاد",
      emptyTitle: "المزادات تنطلق يومياً",
      emptyDesc: "كن من أوائل البائعين — اعرض سلعتك الآن وتصدَّر الصفحة.",
      unavailableTitle: "المزادات المباشرة غير متاحة الآن",
      unavailableDesc: "يرجى تحديث الصفحة بعد قليل.",
      sellerCtaText: "جاهز لرؤية سلعتك هنا؟",
      sellerCtaBtn: "اعرض سلعتك للبيع",
    },
  },
  en: {
    dir: "ltr",
    langCode: "en",
    nav: {
      whyUs: "Why Mazzado?",
      categories: "Categories",
      pricing: "Subscriptions",
      reserveBtn: "Contact Us",
      langBtn: "العربية",
    },
    hero: {
      badge: "Smart Auction Platform for Jordan 🇯🇴",
      titleFirst: "Sell faster.",
      titleGradient: "Buy for less.",
      titleLast: "",
      desc: "List your item and sell it within 15 minutes — and find the best deals at the lowest prices.",
      ctaPrimary: "List your item",
      ctaSecondary: "Browse live auctions",
    },
    trust: {
      badge: "Trust & Integrity",
      title: "Auctions are not for liquidation. Auctions are for true value.",
      subtitle: "We designed Mazzado to be a safe ecosystem that secures the seller's right and gives every buyer an equal, fair opportunity.",
      cards: [
        {
          icon: "🛡️",
          title: "Seller Verification",
          desc: "Full identity and document checking of all sellers before any auction begins to strengthen credibility and trust.",
        },
        {
          icon: "📸",
          title: "Clear, Real Photos",
          desc: "High-res real photos covering every detail and angle.",
        },
        {
          icon: "⚡",
          title: "Live Bidding",
          desc: "Track active bids and watch prices update instantly in real-time with zero lag.",
        },
        {
          icon: "⚖️",
          title: "Fair Rules",
          desc: "Automatic time extension (anti-sniping) if a bid is placed in the final minutes, ensuring everyone gets a fair shot.",
        },
      ],
    },
    why: {
      title: "Why Mazzado?",
      subtitle: "Instead of negotiating with dozens... let them compete for you.",
      traditionalTitle: "The Traditional Way",
      traditionalPoints: [
        "Exhausting negotiations and constant 'what's your final price?'",
        "Wasted time with unserious buyers and low-ball offers",
        "Price is based on seller expectations, not real demand",
        "Unclear sales timeframe stretching to weeks or months",
      ],
      smartTitle: "Mazzado - Smart",
      smartPoints: [
        "Organized, fair competition driving prices up automatically",
        "Verified, members-only bidders to ensure serious participation",
        "Accurate price discovery based purely on actual demand",
        "Strictly set sale window, smart notifications, and full transparency",
      ],
    },
    interactive: {
      bidLogYou: "You (New Bidder)",
    },
    categories: {
      title: "Categories",
      subtitle: "High-value products that deserve an organized auction.",
      list: [
        {
          icon: "🚗",
          title: "Cars",
          desc: "Detailed vehicle listings with real photos and secure registration transfers.",
        },
        {
          icon: "🏠",
          title: "Real Estate",
          desc: "Apartments, investment lands, and commercial shops with legal verification.",
        },
        {
          icon: "💻",
          title: "Electronics",
          desc: "Premium phones, professional laptops, and smart devices with certified checks.",
        },
        {
          icon: "🏗️",
          title: "Equipment & Machinery",
          desc: "Industrial machinery, agricultural tools, and operational heavy equipment.",
        },
        {
          icon: "⌚",
          title: "Luxury Collectibles",
          desc: "Precious watches, fine jewelry, antiques, and rare goods for collectors.",
        },
        {
          icon: "🔢",
          title: "Special Numbers",
          desc: "Legally registered elite license plates and VIP telephone numbers.",
        },
      ],
    },
    faq: {
      title: "Frequently Asked Questions (FAQ)",
      subtitle: "Everything you need to know about subscriptions, bidding, commissions, and guarantees on Mazzado",
      items: [
        {
          q: "Why is there a subscription for bidding?",
          a: "The subscription guarantees the seriousness of the bidders. For only 1 JOD per month, you get unlimited bidding on fully verified items — this prevents fake bidding and maintains a fair auction environment for everyone."
        },
        {
          q: "How do I pay?",
          a: "Subscriptions are paid via CliQ. Auction payments are held by Mazad and are not transferred to the seller until you receive and approve the item. A 5% buyer's premium is added on winning bids."
        },
        {
          q: "What does \"buyer protection\" mean?",
          a: "Mazad holds your payment until you receive and approve the item, then releases it to the seller. You can list your item yourself, or our team can help prepare and list it for you."
        },
        {
          q: "What can I sell?",
          a: "Almost anything of value — electronics, watches, collectibles, equipment, and more. Bring your item and our team will evaluate it. There are currently no listing fees."
        },
        {
          q: "What if the item is different from the description?",
          a: "Your payment stays held by Mazad and is only released to the seller after you receive the item and confirm it matches. If anything goes wrong, contact us and we'll mediate."
        },
        {
          q: "How much does it cost to sell?",
          a: "Nothing upfront. Sellers keep 95% — just 5% commission when your item is successfully sold. If it doesn't sell, you pay absolutely nothing."
        }
      ]
    },
    footer: {
      desc: "The premier modern auction platform in the Hashemite Kingdom of Jordan. Sell faster, bid smarter, and win with absolute confidence.",
      links: {
        whyUs: "Why Us",
        categories: "Categories",
        contact: "Contact Us",
      },
      rights: "© 2026 Mazzado. Proudly designed for the Jordanian market 🇯🇴",
    },
    marketplace: {
      badge: "Live now",
      title: "Live on Mazzado right now",
      subtitle: "Items selling now — this is where your item shows up for buyers.",
      bids: "bids",
      verified: "Verified",
      endingSoon: "Ending soon",
      beTheFirst: "Be the first",
      viewBtn: "View auction",
      emptyTitle: "New auctions launch daily",
      emptyDesc: "Be one of the first sellers — list your item now and lead the page.",
      unavailableTitle: "Live auctions are momentarily unavailable",
      unavailableDesc: "Please refresh in a moment.",
      sellerCtaText: "Ready to see your item here?",
      sellerCtaBtn: "List your item",
    },
  },
};
