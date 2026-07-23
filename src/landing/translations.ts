export interface TranslationType {
  dir: "rtl" | "ltr";
  langCode: "ar" | "en";
  nav: {
    logo: string;
    whyUs: string;
    liveExp: string;
    categories: string;
    comingSoon: string;
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
    stats: {
      steps: { title: string; desc: string };
      verified: { title: string; desc: string };
      live: { title: string; desc: string };
    };
    liveBadge: string;
    verifiedSeller: string;
    carTitle: string;
    carDetails: string;
    currentPrice: string;
    bidBtn: string;
    features: string[];
    seconds: string;
    minutes: string;
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
    title: string;
    subtitle: string;
    stats: Array<{ value: string; label: string }>;
    simulationTitle: string;
    competitionLevel: string;
    participantsLabel: string;
    bidButton: string;
    secureBadge: string;
    competitorsBadge: string;
    autoExtendBadge: string;
    bidLogYou: string;
    bidsTitle: string;
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
  howItWorks: {
    title: string;
    subtitle: string;
    steps: Array<{
      title: string;
      desc: string;
    }>;
  };
  comingSoon: {
    title: string;
    subtitle: string;
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
    formTitle: string;
    formName: string;
    formContact: string;
    formSubmit: string;
    formSuccess: string;
    formErrorEmailPhone: string;
    formErrorEmpty: string;
    experimentalNote: string;
    registeredTitle: string;
    emptyRegistered: string;
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
}

export const translations: Record<"ar" | "en", TranslationType> = {
  ar: {
    dir: "rtl",
    langCode: "ar",
    nav: {
      logo: "🔨 MazadJo",
      whyUs: "لماذا مزاد جو؟",
      liveExp: "تجربة مباشرة",
      categories: "الفئات",
      comingSoon: "ابدأ الآن",
      pricing: "الأسعار",
      reserveBtn: "تواصل معنا",
      langBtn: "English",
    },
    hero: {
      badge: "منصة مزادات ذكية للسوق الأردني 🇯🇴",
      titleFirst: "Mazad Jo",
      titleGradient: "البيع الذكي",
      titleLast: "والشراء الأذكى",
      desc: "مزاد جو تجربة بيع تنافسية حديثة تجمع الثقة، الفرصة، والمتعة. الآن في الأردن لتبيع أسرع، تزايد بذكاء، وتربح بثقة.",
      ctaPrimary: "ادخل المزادات المباشرة",
      ctaSecondary: "تواصل عبر واتساب",
      stats: {
        steps: { title: "3 خطوات", desc: "مزايدة سهلة وواضحة" },
        verified: { title: "توثيق كامل", desc: "بائعون وحسابات موثقة" },
        live: { title: "تحديث مباشر", desc: "تحديثات فورية للمزايدات" },
      },
      liveBadge: "مباشر الآن",
      verifiedSeller: "✓ بائع موثق",
      carTitle: "تويوتا كامري 2022",
      carDetails: "فحص كامل · عمّان · مزاد مميز",
      currentPrice: "السعر الحالي",
      bidBtn: "زايد الآن (+250 د.أ)",
      features: ["🔒 دفع آمن", "🔥 منافسة حقيقية", "⏱ تمديد تلقائي للوقت"],
      seconds: "ثانية",
      minutes: "دقيقة",
    },
    trust: {
      badge: "الأمان والنزاهة",
      title: "مزاد ليس للتصفية. مزاد للقيمة الحقيقية.",
      subtitle: "صممنا MazadJo ليكون بيئة آمنة تضمن لكل بائع حقه ولكل مشترٍ فرصته العادلة.",
      cards: [
        {
          icon: "🛡️",
          title: "توثيق البائعين",
          desc: "التحقق القانوني الكامل من الهوية والأوراق الرسمية قبل بدء أي مزاد لتعزيز المصداقية والثقة.",
        },
        {
          icon: "📸",
          title: "صور وفحص واضح",
          desc: "تقرير فحص فني شامل وصور حقيقية عالية الجودة تغطي جميع جوانب وتفاصيل المنتج.",
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
      title: "لماذا MazadJo؟",
      subtitle: "بدل ما تفاوض عشرات الناس… خليهم ينافسوا عليك.",
      traditionalTitle: "السوق المفتوح - تقليدي",
      traditionalPoints: [
        "مفاوضات متعبة وتكرار عبارة 'آخر سعر؟'",
        "تضييع وقت مع مشترين غير جادين وهواة بخس السلع",
        "السعر يعكس توقع البائع الشخصي لا الطلب الفعلي",
        "وقت بيع غير واضح قد يمتد لأسابيع أو أشهر",
      ],
      smartTitle: "MazadJo - ذكي",
      smartPoints: [
        "منافسة منظمة وعادلة ترفع السعر تلقائياً لصالحك",
        "مزايدون موثوقون ورسوم تأمين تضمن جدية الجميع",
        "اكتشاف السعر الحقيقي للمنتج بدقة حسب حجم الطلب",
        "وقت بيع محدد بدقة مع إشعارات ذكية وشفافية مطلقة",
      ],
    },
    interactive: {
      title: "تجربة تفاعلية",
      subtitle: "جرّب المزاد الحي الآن.",
      stats: [
        { value: "%98", label: "تركيز على الثقة" },
        { value: "3≤", label: "خطوات للمزايدة" },
        { value: "7 أيام", label: "مزاد مقترح للسلعة" },
        { value: "24/7", label: "تنبيهات ومتابعة" },
      ],
      simulationTitle: "محاكاة تفاعلية مباشرة لغرفة المزاد",
      competitionLevel: "مستوى المنافسة الآن",
      participantsLabel: "المزايدون المؤهلون",
      bidButton: "زايد الآن (+250 د.أ)",
      secureBadge: "🔒 مزايدة آمنة ومحمية",
      competitorsBadge: "🔥 منافسة نشطة",
      autoExtendBadge: "⏱ تمديد تلقائي للوقت",
      bidLogYou: "أنت (مزايد جديد)",
      bidsTitle: "سجل المزايدة اللحظي",
    },
    categories: {
      title: "الفئات",
      subtitle: "منتجات عالية القيمة تستحق مزاداً منظماً.",
      list: [
        {
          icon: "🚗",
          title: "سيارات",
          desc: "سيارات فحص كامل، تقرير شاصي واضح، وإجراءات نقل ملكية آمنة.",
        },
        {
          icon: "🏠",
          title: "عقارات",
          desc: "شقق سكنية، أراضي استثمارية، ومحلات تجارية منظمة قانونياً.",
        },
        {
          icon: "💻",
          title: "إلكترونيات",
          desc: "موبايلات مميزة، لابتوبات احترافية، وأجهزة ذكية بفحص معتمد.",
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
    howItWorks: {
      title: "كيف يعمل؟",
      subtitle: "بساطة كاملة من الإعلان إلى الفوز.",
      steps: [
        {
          title: "أنشئ مزادك",
          desc: "ارفع الصور الحقيقية، حدد السعر الأدنى الذي تقبله، وأرفق تقرير الفحص المعتمد في دقائق معدودة.",
        },
        {
          title: "نافس مباشرة",
          desc: "تابع المزايدين يتنافسون بجدية وشفافية في الوقت الفعلي مع نظام إشعارات ذكي وتمديد تلقائي للوقت.",
        },
        {
          title: "أغلق الصفقة",
          desc: "بمجرد انتهاء الوقت لصالح المزايد الأعلى، نضمن لك الدفع الآمن ونرتب عملية نقل الملكية بكل سلاسة.",
        },
      ],
    },
    comingSoon: {
      title: "الآن في الأردن",
      subtitle: "المزادات الحية انطلقت — جرّب المزاد الحي الآن.",
      days: "يوم",
      hours: "ساعة",
      minutes: "دقيقة",
      seconds: "ثانية",
      formTitle: "خلّيك على اطلاع — سجّل ليصلك جديد المزادات والقطع المميزة",
      formName: "الاسم الكامل (اختياري)",
      formContact: "البريد الإلكتروني أو رقم الهاتف الأردني (مثال: 079xxxxxxx)",
      formSubmit: "أبقني على اطلاع",
      formSuccess: "تم التسجيل بنجاح! سنرسل لك جديد المزادات والقطع المميزة 🎉",
      formErrorEmailPhone: "يرجى إدخال بريد إلكتروني صحيح أو رقم هاتف أردني صالح (مثل 079، 078، 077)",
      formErrorEmpty: "يرجى ملء حقل الاتصال (البريد أو الهاتف)",
      experimentalNote: "ملاحظة: هذا النموذج تجريبي لأغراض العرض والبيانات تخزن محلياً في متصفحك.",
      registeredTitle: "قائمة المنضمين الأوائل محلياً",
      emptyRegistered: "كن أول المنضمين في الأردن!",
    },
    faq: {
      title: "الأسئلة الشائعة",
      subtitle: "كل ما تود معرفته عن الاشتراك، المشاركة، العمولات، والضمانات في MazadJo",
      items: [
        {
          q: "لماذا يوجد اشتراك للمزايدة؟",
          a: "الاشتراك يضمن جدية المزايدين. مقابل دينار واحد شهرياً تحصل على مزايدة غير محدودة على قطع موثقة بالكامل — وهذا يمنع المزايدات الوهمية ويحافظ على عدالة المزاد للجميع."
        },
        {
          q: "كيف أدفع؟",
          a: "الاشتراكات تُدفع عبر كليك. أما مدفوعات المزادات فتمر عبر نظام الضمان المالي ولا تُحوَّل للبائع إلا بعد استلامك للقطعة. تُضاف عمولة مشترٍ ٥٪ عند الفوز."
        },
        {
          q: "ماذا تعني \"مفحوص من مزادو\"؟",
          a: "فريقنا يفحص كل قطعة فعلياً ويتحقق منها ويصوّرها ويدرجها بنفسه. البائعون لا يكتبون إعلاناتهم — نحن من يفعل ذلك."
        },
        {
          q: "ماذا يمكنني أن أبيع؟",
          a: "تقريباً أي شيء ذي قيمة — إلكترونيات، ساعات، مقتنيات، معدات وغيرها. أحضر قطعتك وسيقيّمها فريقنا. ولا توجد رسوم إدراج حالياً."
        },
        {
          q: "ماذا لو كانت القطعة مختلفة عن الوصف؟",
          a: "دفعتك تبقى محجوزة لدى مزاد ولا تُحوَّل للبائع إلا بعد ما تستلم القطعة وتتأكد إنها مطابقة. إذا صار أي إشكال، تواصل معنا وبنتوسّط لحلّه."
        },
        {
          q: "كم تكلفة البيع؟",
          a: "لا شيء مقدماً. البائع يستلم ٩٥٪ — عمولة ٥٪ فقط عند بيع قطعتك. إذا لم تُبع، لا تدفع شيئاً."
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
      rights: "© 2026 MazadJo. صمم للسوق الأردني بكل فخر 🇯🇴",
    },
  },
  en: {
    dir: "ltr",
    langCode: "en",
    nav: {
      logo: "🔨 MazadJo",
      whyUs: "Why MazadJo?",
      liveExp: "Live Experience",
      categories: "Categories",
      comingSoon: "Start Now",
      pricing: "Pricing",
      reserveBtn: "Contact Us",
      langBtn: "العربية",
    },
    hero: {
      badge: "Smart Auction Platform for Jordan 🇯🇴",
      titleFirst: "Mazad Jo",
      titleGradient: "Smart Selling",
      titleLast: "and Smarter Buying",
      desc: "MazadJo is a modern competitive selling experience combining trust, opportunity, and excitement. Now in Jordan so you can sell faster, bid smarter, and win with confidence.",
      ctaPrimary: "Enter Live Auctions",
      ctaSecondary: "Chat on WhatsApp",
      stats: {
        steps: { title: "3 Steps", desc: "Easy & clear bidding" },
        verified: { title: "Full Verification", desc: "Certified sellers & accounts" },
        live: { title: "Live Updates", desc: "Instant bidding updates" },
      },
      liveBadge: "Live Now",
      verifiedSeller: "✓ Verified Seller",
      carTitle: "Toyota Camry 2022",
      carDetails: "Full Inspection · Amman · Premium Auction",
      currentPrice: "Current Price",
      bidBtn: "Bid Now (+250 JOD)",
      features: ["🔒 Secure Payment", "🔥 Real Competition", "⏱ Auto-Extension"],
      seconds: "sec",
      minutes: "min",
    },
    trust: {
      badge: "Trust & Integrity",
      title: "Auctions are not for liquidation. Auctions are for true value.",
      subtitle: "We designed MazadJo to be a safe ecosystem that secures the seller's right and gives every buyer an equal, fair opportunity.",
      cards: [
        {
          icon: "🛡️",
          title: "Seller Verification",
          desc: "Full identity and document checking of all sellers before any auction begins to strengthen credibility and trust.",
        },
        {
          icon: "📸",
          title: "Clear Photos & Inspection",
          desc: "A comprehensive tech inspection report and high-res real photos covering all details and angles.",
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
      title: "Why MazadJo?",
      subtitle: "Instead of negotiating with dozens... let them compete for you.",
      traditionalTitle: "Open Market - Traditional",
      traditionalPoints: [
        "Exhausting negotiations and constant 'what's your final price?'",
        "Wasted time with unserious buyers and low-ball offers",
        "Price is based on seller expectations, not real demand",
        "Unclear sales timeframe stretching to weeks or months",
      ],
      smartTitle: "MazadJo - Smart",
      smartPoints: [
        "Organized, fair competition driving prices up automatically",
        "Verified bidders and deposit fees to ensure serious participation",
        "Accurate price discovery based purely on actual demand",
        "Strictly set sale window, smart notifications, and full transparency",
      ],
    },
    interactive: {
      title: "Interactive Experience",
      subtitle: "The feel of a live auction — try it right now.",
      stats: [
        { value: "98%", label: "Focus on Trust" },
        { value: "≤3", label: "Steps to Bid" },
        { value: "7 Days", label: "Suggested Listing" },
        { value: "24/7", label: "Alerts & Support" },
      ],
      simulationTitle: "Live Interactive Auction Room Simulator",
      competitionLevel: "Competition Level Now",
      participantsLabel: "Eligible Bidders",
      bidButton: "Bid Now (+250 JOD)",
      secureBadge: "🔒 Secure & Protected Bidding",
      competitorsBadge: "🔥 Active Battle",
      autoExtendBadge: "⏱ Auto-Time Extension",
      bidLogYou: "You (New Bidder)",
      bidsTitle: "Instant Bid History",
    },
    categories: {
      title: "Categories",
      subtitle: "High-value products that deserve an organized auction.",
      list: [
        {
          icon: "🚗",
          title: "Cars",
          desc: "Full-inspection vehicles, clear chassis reports, and secure registration transfers.",
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
    howItWorks: {
      title: "How It Works",
      subtitle: "Complete simplicity from listing to winning.",
      steps: [
        {
          title: "Create Your Auction",
          desc: "Upload real pictures, set your reserve price, and attach the certified inspection report in minutes.",
        },
        {
          title: "Compete Live",
          desc: "Watch buyers bid in real-time with full transparency, smart mobile notifications, and automated anti-sniping extensions.",
        },
        {
          title: "Close the Deal",
          desc: "Once the timer ends on the highest bid, we secure payment and guide both parties through seamless ownership transfer.",
        },
      ],
    },
    comingSoon: {
      title: "Now in Jordan",
      subtitle: "Live auctions are on — try the live auction now.",
      days: "Days",
      hours: "Hours",
      minutes: "Min",
      seconds: "Sec",
      formTitle: "Stay in the loop — get notified about new auctions and featured items",
      formName: "Full Name (Optional)",
      formContact: "Email or Jordanian Phone Number (e.g., 079xxxxxxx)",
      formSubmit: "Keep Me Posted",
      formSuccess: "Registered successfully! We'll keep you posted on new auctions 🎉",
      formErrorEmailPhone: "Please enter a valid email or active Jordanian phone number (079, 078, 077)",
      formErrorEmpty: "Please fill in the contact field (Email or Phone)",
      experimentalNote: "Note: This is a prototype form; data is saved locally in your browser's local storage.",
      registeredTitle: "Jordan's Early Adopters List",
      emptyRegistered: "Be the first to join from Jordan!",
    },
    faq: {
      title: "Frequently Asked Questions (FAQ)",
      subtitle: "Everything you need to know about subscriptions, bidding, commissions, and guarantees on MazadJo",
      items: [
        {
          q: "Why is there a subscription for bidding?",
          a: "The subscription guarantees the seriousness of the bidders. For only 1 JOD per month, you get unlimited bidding on fully verified items — this prevents fake bidding and maintains a fair auction environment for everyone."
        },
        {
          q: "How do I pay?",
          a: "Subscriptions are paid via CliQ. Auction payments go through our secure escrow system and are not transferred to the seller until you receive and approve the item. A 5% buyer's premium is added on winning bids."
        },
        {
          q: "What does \"Verified by Mazadjo\" mean?",
          a: "Our team physically inspects, verifies, photographs, and lists each item ourselves. Sellers do not write their own listings — we handle everything."
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
      rights: "© 2026 MazadJo. Proudly designed for the Jordanian market 🇯🇴",
    },
  },
};
