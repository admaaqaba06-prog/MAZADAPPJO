import React, { useState, useEffect, useRef } from "react";
import {
  Hammer,
  ShieldCheck,
  Camera,
  CheckCircle2,
  XCircle,
  Car,
  Home,
  Laptop,
  Wrench,
  Watch,
  Hash,
  Globe,
  Clock,
  Users,
  Bell,
  Menu,
  X,
  Lock,
  TrendingUp,
  Award,
  Sparkles,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MessageCircle,
  Check,
  Search,
  Eye,
  MapPin,
  Building2,
  Quote,
  Star,
  Heart,
  Share2,
  Flame
} from "lucide-react";
import { motion, useScroll, useTransform, useInView, useSpring, AnimatePresence, useMotionValue, animate, useReducedMotion } from "motion/react";
import { translations, TranslationType } from "./translations";
import { formatCountdown, stepPrice as stepPriceBy, driftWatchers, antiSnipe } from "./heroSim";
import { emitLandingEvent } from './landingAnalytics';
import { useLandingAuctions } from './useLandingAuctions';
import { Logo } from "./components/Logo";
import TermsModal from "../components/TermsModal";

// Reveal scroll component
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number; key?: React.Key }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

// Counter component for interactive stats count-up
function Counter({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 70,
    restDelta: 0.001
  });
  const rounded = useTransform(springValue, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    if (isInView) {
      animate(motionValue, target, {
        duration: 1.4,
        ease: "easeOut"
      });
    }
  }, [isInView, target, motionValue]);

  useEffect(() => {
    return rounded.on("change", (latest) => {
      setDisplayValue(latest.toLocaleString("en-US"));
    });
  }, [rounded]);

  const hasArPrefix = /[\u0600-\u06FF]/.test(prefix);
  const hasArSuffix = /[\u0600-\u06FF]/.test(suffix);

  return (
    <span ref={ref} className="inline-flex items-center">
      {prefix && (
        <span className={hasArPrefix ? "font-ibmarabic" : "font-sans"} style={hasArPrefix ? { letterSpacing: "0px" } : undefined}>
          {prefix}
        </span>
      )}
      <span className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
        {displayValue}
      </span>
      {suffix && (
        <span className={hasArSuffix ? "font-ibmarabic" : "font-sans"} style={hasArSuffix ? { letterSpacing: "0px" } : undefined}>
          {suffix}
        </span>
      )}
    </span>
  );
}


const translateLogTime = (timeStr: string, isAr: boolean): string => {
  if (isAr) {
    if (timeStr === "Just now" || timeStr === "الآن") return "الآن";
    if (timeStr === "10s ago") return "منذ 10 ثوانٍ";
    if (timeStr === "20s ago") return "منذ 20 ثانية";
    if (timeStr === "40s ago") return "منذ 40 ثانية";
    if (timeStr === "1m ago") return "منذ دقيقة";
    if (timeStr === "2m ago") return "منذ دقيقتين";
    if (timeStr === "3m ago") return "منذ 3 دقائق";
    if (timeStr === "4m ago") return "منذ 4 دقائق";
    if (timeStr === "5m ago") return "منذ 5 دقائق";
    if (timeStr === "8m ago") return "منذ 8 دقائق";
    return timeStr;
  } else {
    if (timeStr === "Just now" || timeStr === "الآن") return "Just now";
    if (timeStr === "منذ 10 ثوانٍ") return "10s ago";
    if (timeStr === "منذ 20 ثانية") return "20s ago";
    if (timeStr === "منذ 40 ثانية") return "40s ago";
    if (timeStr === "منذ دقيقة") return "1m ago";
    if (timeStr === "منذ دقيقتين") return "2m ago";
    if (timeStr === "منذ 3 دقائق") return "3m ago";
    if (timeStr === "منذ 4 دقائق") return "4m ago";
    if (timeStr === "منذ 5 دقائق") return "5m ago";
    if (timeStr === "منذ 8 دقائق") return "8m ago";
    return timeStr;
  }
};

const renderMixedText = (text: string, isAr: boolean) => {
  const segments = text.split(/(\d[\d,.]*)/g);
  return segments.map((seg, idx) => {
    if (/^\d[\d,.]*$/.test(seg)) {
      return (
        <span key={idx} className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {seg}
        </span>
      );
    } else {
      return (
        <span 
          key={idx} 
          className={isAr ? "font-ibmarabic" : ""} 
          style={isAr ? { letterSpacing: "0px" } : undefined}
        >
          {seg}
        </span>
      );
    }
  });
};

// Simulated Jordanian names for the interactive feed
const AR_NAMES = ["مصطفى القضاة", "أحمد العبادي", "سارة حداد", "خالد الشوابكة", "رانيا الفايز", "حمزة المصري", "عمر الزعبي", "هديل الخلايلة", "طارق الحسين", "زيد النابلسي"];
const EN_NAMES = ["Mustafa Al-Qudah", "Ahmad Al-Abadi", "Sarah Haddad", "Khalid Shawabkeh", "Rania Al-Fayez", "Hamzah Al-Masri", "Omar Al-Zoubi", "Hadeel Al-Khalayleh", "Tariq Al-Hussein", "Zaid Al-Nabulsi"];

// First-name-only demo list for the "🔥 <name> just bid" toast in the hero simulator
const HERO_FIRST_NAMES: Record<"ar" | "en", string[]> = {
  en: ["Omar", "Layla", "Khaled", "Sara", "Yousef", "Rania", "Tariq", "Dana"],
  ar: ["عمر", "ليلى", "خالد", "سارة", "يوسف", "رانيا", "طارق", "دانا"]
};

interface BidLog {
  id: string;
  name: string;
  amount: number;
  time: string;
  isUser?: boolean;
}

const ACTIVE_ITEMS = [
  {
    id: "car",
    icon: "🚗",
    titleAr: "تويوتا كامري 2022",
    titleEn: "Toyota Camry 2022",
    detailsAr: "فحص كامل · عمّان · مزاد مميز",
    detailsEn: "Full Inspection · Amman · Premium Auction",
    image: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=800&q=80",
    badgeAr: "فحص كامل",
    badgeEn: "Passed",
    basePrice: 14250,
    stepPrice: 250,
    timerStart: 138
  },
  {
    id: "phone",
    icon: "📱",
    titleAr: "آيفون 15 برو ماكس",
    titleEn: "iPhone 15 Pro Max",
    detailsAr: "سعة 512 جيجابايت · كفالة الوكيل · كالجديد",
    detailsEn: "512GB · Agency Warranty · Like New",
    image: "https://images.unsplash.com/photo-1592286927505-1def25115558?auto=format&fit=crop&w=800&q=80",
    badgeAr: "كفالة الوكيل",
    badgeEn: "Warranty Active",
    basePrice: 850,
    stepPrice: 25,
    timerStart: 180
  },
  {
    id: "watch",
    icon: "⌚",
    titleAr: "رولكس ديت جست ٤١",
    titleEn: "Rolex Datejust 41",
    detailsAr: "٤١ ملم · ستيل · بالكرت والعلبة · مفحوصة",
    detailsEn: "41mm · Oystersteel · Box & Papers · Inspected",
    image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=800&q=80",
    badgeAr: "موثّقة",
    badgeEn: "Authenticated",
    basePrice: 2150,
    stepPrice: 50,
    timerStart: 120
  },
  {
    id: "house",
    icon: "🏡",
    titleAr: "فيلا مودرن في دابوق",
    titleEn: "Modern Villa in Dabouq",
    detailsAr: "مساحة 450م² · 4 غرف نوم · مسبح خاص",
    detailsEn: "450 sqm · 4 Bedrooms · Private Pool",
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=600&q=80",
    badgeAr: "طابو جاهز",
    badgeEn: "Title Deed Ready",
    basePrice: 320000,
    stepPrice: 5000,
    timerStart: 3600
  }
];

function LiveMarketplaceSection({ lang, t, onEnter, formatPrice }: {
  lang: 'ar' | 'en';
  t: TranslationType;
  onEnter: (target?: string) => void;
  formatPrice: (val: number) => React.ReactNode;
}) {
  const { auctions, isLoading, isEmpty, isError } = useLandingAuctions();
  const formatTimeLeft = (endTime: number, now = Date.now()): string => {
    const ms = Math.max(0, endTime - now);
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (lang === 'ar') {
      if (days > 0) return `${days} يوم ${hours} س`;
      if (hours > 0) return `${hours} س ${mins} د`;
      return `${mins} د`;
    }
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };
  return (
    <section id="live-marketplace" className="py-20 md:py-28 bg-[#F7F7F7]">
      <div className="max-w-7xl mx-auto px-5">
        <Reveal>
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-[#F05123] font-semibold text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F05123] animate-pulse" />
              {t.marketplace.badge}
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold text-[#0A0A0A]">{t.marketplace.title}</h2>
            <p className="mt-3 text-[#0A0A0A]/60 max-w-xl mx-auto">{t.marketplace.subtitle}</p>
          </div>
        </Reveal>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-[#F0F0EE] h-72 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <Reveal>
            <div className="max-w-md mx-auto text-center rounded-2xl bg-white border border-[#F0F0EE] p-10">
              <h3 className="text-xl font-bold text-[#0A0A0A]">{t.marketplace.unavailableTitle}</h3>
              <p className="mt-2 text-[#0A0A0A]/60">{t.marketplace.unavailableDesc}</p>
              <button
                type="button"
                onClick={() => { emitLandingEvent('seller_cta_clicked', { location: 'marketplace_error' }); onEnter('upload'); }}
                className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#F05123] text-white font-semibold hover:bg-[#D93E15] transition"
              >
                {t.marketplace.sellerCtaBtn}
              </button>
            </div>
          </Reveal>
        ) : isEmpty ? (
          <Reveal>
            <div className="max-w-md mx-auto text-center rounded-2xl bg-white border border-[#F0F0EE] p-10">
              <h3 className="text-xl font-bold text-[#0A0A0A]">{t.marketplace.emptyTitle}</h3>
              <p className="mt-2 text-[#0A0A0A]/60">{t.marketplace.emptyDesc}</p>
              <button
                type="button"
                onClick={() => { emitLandingEvent('seller_cta_clicked', { location: 'marketplace_empty' }); onEnter('upload'); }}
                className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#F05123] text-white font-semibold hover:bg-[#D93E15] transition"
              >
                {t.marketplace.sellerCtaBtn}
              </button>
            </div>
          </Reveal>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {auctions.map((a) => {
                const endingSoon = a.endTime - Date.now() < 3600_000;
                return (
                  <Reveal key={a.id}>
                    <button
                      type="button"
                      onClick={() => { emitLandingEvent('auction_viewed', { auctionId: a.id }); onEnter(); }}
                      className="group text-start w-full rounded-2xl bg-white border border-[#F0F0EE] overflow-hidden hover:-translate-y-1 hover:shadow-xl transition"
                    >
                      <div className="relative aspect-[4/3] bg-[#F0F0EE] overflow-hidden">
                        {a.imageUrl ? (
                          <img src={a.imageUrl} alt={a.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                        ) : null}
                        {a.isVerified ? (
                          <span className="absolute top-3 start-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-xs font-semibold text-[#0A0A0A]">
                            ✓ {t.marketplace.verified}
                          </span>
                        ) : null}
                        {endingSoon ? (
                          <span className="absolute top-3 end-3 px-2 py-1 rounded-full bg-[#F05123] text-white text-xs font-semibold">
                            {t.marketplace.endingSoon}
                          </span>
                        ) : null}
                      </div>
                      <div className="p-4">
                        <span className="text-xs text-[#0A0A0A]/50">{t.marketplace.categoryLabels[a.category] ?? a.category}</span>
                        <h3 className="mt-1 font-semibold text-[#0A0A0A] line-clamp-1">{a.title}</h3>
                        <div className="mt-3 flex items-end justify-between">
                          <div>
                            <span className="block text-xs text-[#0A0A0A]/50">{t.marketplace.currentBid}</span>
                            <span dir="ltr" className="block font-bold text-[#0A0A0A]">{formatPrice(a.currentPrice)}</span>
                          </div>
                          <div className="text-end">
                            <span dir="ltr" className="block text-xs text-[#0A0A0A]/50">{a.totalBids} {t.marketplace.bids}</span>
                            <span dir="ltr" className="block text-sm font-semibold text-[#F05123]">{formatTimeLeft(a.endTime)}</span>
                          </div>
                        </div>
                        <span className="mt-4 block text-center text-sm font-semibold text-[#F05123]">{t.marketplace.viewBtn} {lang === 'ar' ? '←' : '→'}</span>
                      </div>
                    </button>
                  </Reveal>
                );
              })}
            </div>
            <Reveal>
              <div className="mt-12 text-center">
                <p className="text-lg font-semibold text-[#0A0A0A]">{t.marketplace.sellerCtaText}</p>
                <button
                  type="button"
                  onClick={() => { emitLandingEvent('seller_cta_clicked', { location: 'marketplace' }); onEnter('upload'); }}
                  className="mt-4 inline-flex items-center justify-center px-8 py-4 rounded-full bg-[#F05123] text-white font-bold text-lg hover:bg-[#D93E15] transition"
                >
                  {t.marketplace.sellerCtaBtn}
                </button>
              </div>
            </Reveal>
          </>
        )}
      </div>
    </section>
  );
}

export default function LandingView({ onEnter, whatsappUrl = "https://wa.me/962781444899" }: { onEnter: (target?: string) => void; whatsappUrl?: string }) {
  const [lang, setLang] = useState<"ar" | "en">(() => (localStorage.getItem('mazad_language') === 'en' ? 'en' : 'ar'));
  const toggleLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    emitLandingEvent('language_switched', { to: next });
    setLang(next);
    localStorage.setItem('mazad_language', next);
  };
  const t: TranslationType = translations[lang];

  useEffect(() => {
    emitLandingEvent('landing_viewed', { lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active item switching states
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [isAutoCycling, setIsAutoCycling] = useState<boolean>(true);
  const [likesCount, setLikesCount] = useState<number>(1428);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  // NOTE: these parallel arrays are indexed by activeItemIndex and MUST stay
  // aligned with ACTIVE_ITEMS ([car, phone, watch, house]).
  const [prices, setPrices] = useState<number[]>([14250, 850, 2150, 320000]);
  const [timers, setTimers] = useState<number[]>([138, 180, 120, 3600]);
  const [bidLogsList, setBidLogsList] = useState<BidLog[][]>(() => [
    [
      { id: "c1", name: "أحمد العبادي", amount: 14250, time: "10s ago" },
      { id: "c2", name: "سارة حداد", amount: 14000, time: "1m ago" },
      { id: "c3", name: "خالد الشوابكة", amount: 13750, time: "3m ago" },
      { id: "c4", name: "مصطفى القضاة", amount: 13500, time: "5m ago" }
    ],
    [
      { id: "p1", name: "هديل الخلايلة", amount: 850, time: "20s ago" },
      { id: "p2", name: "طارق الحسين", amount: 825, time: "1m ago" },
      { id: "p3", name: "رائد بني هاني", amount: 800, time: "4m ago" }
    ],
    [
      { id: "w1", name: "عمر الزعبي", amount: 2150, time: "15s ago" },
      { id: "w2", name: "رانيا الفايز", amount: 2100, time: "1m ago" },
      { id: "w3", name: "زيد النابلسي", amount: 2050, time: "3m ago" }
    ],
    [
      { id: "h1", name: "حمزة المصري", amount: 320000, time: "40s ago" },
      { id: "h2", name: "عمر الزعبي", amount: 315000, time: "2m ago" },
      { id: "h3", name: "زيد النابلسي", amount: 310000, time: "8m ago" }
    ]
  ]);

  // Live-room ambient sim state (hero right column)
  const prefersReducedMotion = useReducedMotion();
  const [watchers, setWatchers] = useState<number>(1420);
  const [bidCount, setBidCount] = useState<number>(12);
  const [priceBump, setPriceBump] = useState<boolean>(false);
  const [flashHit, setFlashHit] = useState<boolean>(false);
  const [extraAvatars, setExtraAvatars] = useState<number>(0);
  const [justBidToast, setJustBidToast] = useState<{ name: string; key: number } | null>(null);

  // Derived active item fields
  const currentItem = ACTIVE_ITEMS[activeItemIndex];
  const currentPrice = prices[activeItemIndex];
  const carTimer = timers[activeItemIndex];
  const bidLogs = bidLogsList[activeItemIndex];

  // Helper for rendering localized names
  const getLogName = (log: BidLog) => {
    const arIndex = AR_NAMES.indexOf(log.name);
    if (arIndex !== -1 && lang === "en") {
      return EN_NAMES[arIndex];
    }
    const enIndex = EN_NAMES.indexOf(log.name);
    if (enIndex !== -1 && lang === "ar") {
      return AR_NAMES[enIndex];
    }
    if (log.isUser) {
      return t.interactive.bidLogYou;
    }
    return log.name;
  };
  
  // Animation pulse states
  const [pulsePrice, setPulsePrice] = useState<boolean>(false);
  const [pulseUserAction, setPulseUserAction] = useState<boolean>(false);
  const [showExtensionAlert, setShowExtensionAlert] = useState<boolean>(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [howItWorksTab, setHowItWorksTab] = useState<"buyer" | "seller">("seller");
  const [activeEscrowStep, setActiveEscrowStep] = useState<number>(2);

  // Live competition level state
  const [compLevel, setCompLevel] = useState<number>(84);

  // Registered waitlist members from localStorage
  const [waitlist, setWaitlist] = useState<Array<{ name: string; contact: string; date: string }>>(() => {
    try {
      const stored = localStorage.getItem("mazadjo_waitlist");
      return stored ? JSON.parse(stored) : [
        { name: lang === "ar" ? "رائد بني هاني" : "Raed Bani Hani", contact: "079***4512", date: "2026-07-13" },
        { name: lang === "ar" ? "أمجد المعاني" : "Amjad Al-Maani", contact: "amj***@outlook.com", date: "2026-07-13" },
        { name: lang === "ar" ? "لينا العباسي" : "Lina Al-Abbasi", contact: "078***8819", date: "2026-07-12" }
      ];
    } catch {
      return [];
    }
  });

  // Waitlist form inputs
  const [formName, setFormName] = useState<string>("");
  const [formContact, setFormContact] = useState<string>("");
  const [formSuccess, setFormSuccess] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>("");

  // Terms & Privacy modal state (public legal reachability from the landing footer)
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);

  // Sticky Header state
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [showStickyBar, setShowStickyBar] = useState<boolean>(false);

  // Scroll Progress Bar Setup
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Effects
  useEffect(() => {
    // Scroll event
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
      
      const heroEl = document.getElementById("hero-section");
      if (heroEl) {
        const heroBottom = heroEl.offsetTop + heroEl.offsetHeight;
        setShowStickyBar(window.scrollY > heroBottom - 80);
      } else {
        setShowStickyBar(window.scrollY > 600);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Update HTML dir and lang
  useEffect(() => {
    document.documentElement.dir = t.dir;
    document.documentElement.lang = t.langCode;
    // Set font style class on body
    if (lang === "ar") {
      document.body.style.fontFamily = '"IBM Plex Sans Arabic", sans-serif';
    } else {
      document.body.style.fontFamily = '"IBM Plex Sans Arabic", sans-serif';
    }
  }, [lang, t]);

  // Timers countdown ticker for all active items.
  // Reduced motion → freeze (calm static hero). Also pauses while the tab is hidden.
  useEffect(() => {
    if (prefersReducedMotion) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setTimers((prevTimers) =>
        prevTimers.map((tVal, idx) => {
          if (tVal <= 1) {
            if (idx === activeItemIndex) {
              setShowExtensionAlert(true);
              setTimeout(() => setShowExtensionAlert(false), 3000);
            }
            return ACTIVE_ITEMS[idx].timerStart; // reset to its original start
          }
          return tVal - 1;
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeItemIndex, prefersReducedMotion]);

  // Automatically cycle through items every 8 seconds (frozen under reduced motion)
  useEffect(() => {
    if (!isAutoCycling || prefersReducedMotion) return;
    const cycleInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setActiveItemIndex((prev) => (prev + 1) % ACTIVE_ITEMS.length);
    }, 8000);
    return () => clearInterval(cycleInterval);
  }, [isAutoCycling, prefersReducedMotion]);

  // Watcher count gently drifts (ambient life). Reduced motion → static.
  useEffect(() => {
    if (prefersReducedMotion) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setWatchers((w) => driftWatchers(w));
    }, 2600);
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  // Landing bids: a new bid lands every ~2.5–4.5s (single self-scheduling engine).
  // Price steps + bump, "latest bid" flash, bid count climbs, toast blips, anti-snipe.
  // Reduced motion → no landing bids at all (calm static hero).
  useEffect(() => {
    if (prefersReducedMotion) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const landBid = () => {
      if (cancelled) return;
      // Pause while hidden; re-check shortly.
      if (typeof document !== "undefined" && document.hidden) {
        timeoutId = setTimeout(landBid, 1500);
        return;
      }

      const fullNames = lang === "ar" ? AR_NAMES : EN_NAMES;
      const randomName = fullNames[Math.floor(Math.random() * fullNames.length)];
      const firstNames = HERO_FIRST_NAMES[lang];
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const step = ACTIVE_ITEMS[activeItemIndex].stepPrice;

      setPrices((prevPrices) => {
        const nextPrices = [...prevPrices];
        const nextPrice = stepPriceBy(nextPrices[activeItemIndex], step);
        nextPrices[activeItemIndex] = nextPrice;

        // Schedule log update outside to avoid React state loop issues
        setTimeout(() => {
          setBidLogsList((prevList) => {
            const newList = [...prevList];
            const currentItemLogs = newList[activeItemIndex];
            if (currentItemLogs.some((l) => l.amount === nextPrice)) {
              return prevList;
            }
            const newLog: BidLog = {
              id: `${Date.now()}-${Math.random()}`,
              name: randomName,
              amount: nextPrice,
              time: lang === "ar" ? "الآن" : "Just now"
            };
            newList[activeItemIndex] = [newLog, ...currentItemLogs.slice(0, 5)];
            return newList;
          });
        }, 0);

        return nextPrices;
      });

      // Anti-snipe: a late bid nudges the countdown back up so the lot never dies.
      setTimers((prevTimers) => {
        const nextTimers = [...prevTimers];
        const extended = antiSnipe(nextTimers[activeItemIndex]);
        if (extended !== nextTimers[activeItemIndex]) {
          nextTimers[activeItemIndex] = extended;
          setShowExtensionAlert(true);
          setTimeout(() => setShowExtensionAlert(false), 3000);
        }
        return nextTimers;
      });

      // Climbing bid count + occasional avatar pop
      setBidCount((c) => Math.min(60, c + 1));
      if (Math.random() < 0.4) setExtraAvatars((a) => Math.min(3, a + 1));

      // Price bump + "latest bid" flash
      setPriceBump(true);
      setTimeout(() => setPriceBump(false), 200);
      setFlashHit(true);
      setTimeout(() => setFlashHit(false), 300);

      // "🔥 <FirstName> just bid" toast
      setJustBidToast({ name: firstName, key: Date.now() });

      // Fluctuating competition level
      setCompLevel((prev) => {
        const next = prev + Math.floor(Math.random() * 3) + 1;
        return next > 99 ? 84 : next;
      });

      // Price Pulse Animation
      setPulsePrice(true);
      setTimeout(() => setPulsePrice(false), 600);

      timeoutId = setTimeout(landBid, 2500 + Math.random() * 2000);
    };

    timeoutId = setTimeout(landBid, 1400);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [lang, activeItemIndex, prefersReducedMotion]);

  // Format Helper
  const formatPrice = (val: number): React.ReactNode => {
    const numStr = val.toLocaleString("en-US");
    const currency = lang === "ar" ? "د.أ" : "JOD";
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {numStr}
        </span>
        <span className={lang === "ar" ? "font-ibmarabic text-xs" : "font-sans text-xs"} style={lang === "ar" ? { letterSpacing: "0px" } : undefined}>
          {currency}
        </span>
      </span>
    );
  };

  // Count text in the active language's numerals (Arabic-Indic for ar).
  const formatCount = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");

  // formatTimeLeft and LiveMarketplaceSection hoisted to module scope (see above export)

  // Manual User Bidding Handler
  const handleUserBid = () => {
    setIsAutoCycling(false);
    // Flash button and price
    setPulseUserAction(true);
    setPulsePrice(true);
    setTimeout(() => setPulseUserAction(false), 300);
    setTimeout(() => setPulsePrice(false), 600);

    const step = ACTIVE_ITEMS[activeItemIndex].stepPrice;

    // If timer is extremely low (e.g., less than 60s), extend it as a real auction anti-snipe feature
    if (carTimer < 60) {
      setTimers((prevTimers) => {
        const nextTimers = [...prevTimers];
        nextTimers[activeItemIndex] += 30;
        return nextTimers;
      });
      setShowExtensionAlert(true);
      setTimeout(() => setShowExtensionAlert(false), 3000);
    }

    setPrices((prevPrices) => {
      const nextPrices = [...prevPrices];
      const nextPrice = nextPrices[activeItemIndex] + step;
      nextPrices[activeItemIndex] = nextPrice;

      // Schedule log update
      setTimeout(() => {
        setBidLogsList((prevList) => {
          const newList = [...prevList];
          const currentItemLogs = newList[activeItemIndex];
          if (currentItemLogs.some((l) => l.amount === nextPrice)) {
            return prevList;
          }
          const userLog: BidLog = {
            id: `user-${Date.now()}-${Math.random()}`,
            name: t.interactive.bidLogYou,
            amount: nextPrice,
            time: lang === "ar" ? "الآن" : "Just now",
            isUser: true
          };
          newList[activeItemIndex] = [userLog, ...currentItemLogs.slice(0, 5)];
          return newList;
        });
      }, 0);

      return nextPrices;
    });

    // Bump competition level
    setCompLevel((prev) => Math.min(prev + 2, 99));
  };

  // Form Submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess(false);

    const contactClean = formContact.trim();
    if (!contactClean) {
      setFormError(t.comingSoon.formErrorEmpty);
      return;
    }

    // Contact verification regex: standard email or Jordan phone numbers
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const joPhoneRegex = /^(079|078|077|\+96279|\+96278|\+96277|96279|96278|96277)\d{7}$/;

    const isValidEmail = emailRegex.test(contactClean);
    const isValidPhone = joPhoneRegex.test(contactClean);

    if (!isValidEmail && !isValidPhone) {
      setFormError(t.comingSoon.formErrorEmailPhone);
      return;
    }

    // Save registration
    const newRegistration = {
      name: formName.trim() || (lang === "ar" ? "مستخدم مهتم" : "Interested User"),
      contact: contactClean,
      date: new Date().toISOString().split("T")[0]
    };

    const updatedWaitlist = [newRegistration, ...waitlist];
    setWaitlist(updatedWaitlist);
    try {
      localStorage.setItem("mazadjo_waitlist", JSON.stringify(updatedWaitlist));
    } catch (e) {
      console.error("Local storage error", e);
    }

    setFormSuccess(true);
    setFormName("");
    setFormContact("");
  };

  const getLineIcon = (type: string, className = "w-6 h-6 text-[#F05123]") => {
    switch (type) {
      case "trust-0":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
        );
      case "trust-1":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        );
      case "trust-2":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        );
      case "trust-3":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0-17.25a9 9 0 11-9 9m9-9a9 9 0 109 9M9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.01h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.01h-.008V9.75z" />
          </svg>
        );
      case "cat-0":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.129-1.125v-3.071M14 6h4a2 2 0 012 2v4H4V8a2 2 0 012-2h8z" />
          </svg>
        );
      case "cat-1":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        );
      case "cat-2":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "cat-3":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A1.5 1.5 0 0019 21l2-2a1.5 1.5 0 000-2.12l-5.83-5.83M11.42 15.17l2.42-2.42M11.42 15.17l-4.5-4.5M13.84 12.75l-4.5-4.5M13.84 12.75L21 6a1.5 1.5 0 000-2.12l-2-2a1.5 1.5 0 00-2.12 0l-6.75 6.75M9.34 8.25L3 14.5A1.5 1.5 0 003 16.62l2 2a1.5 1.5 0 002.12 0l6.25-6.25M9.34 8.25l1.08-1.08" />
          </svg>
        );
      case "cat-4":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case "cat-5":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.875-12l-3 16.5m-4.5-16.5L7.875 20.25" />
          </svg>
        );
      case "item-car":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.129-1.125v-3.071M14 6h4a2 2 0 012 2v4H4V8a2 2 0 012-2h8z" />
          </svg>
        );
      case "item-phone":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "item-house":
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen font-sans bg-[#FFFFFF] text-[#0A0A0A] flex flex-col selection:bg-[#F05123]/20 selection:text-[#F05123] relative overflow-hidden">
      
      {/* Scroll Progress Indicator at top of screen */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2.5px] bg-[#F05123] z-[60]"
        style={{ scaleX, transformOrigin: lang === "ar" ? "right" : "left" }}
      />

      {/* Absolute Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[15%] w-[600px] h-[600px] rounded-full orange-glow-bg pointer-events-none z-0 opacity-40"></div>
      <div className="absolute top-[45%] right-[-10%] w-[700px] h-[700px] rounded-full orange-glow-bg opacity-30 pointer-events-none z-0"></div>
      <div className="absolute bottom-[-5%] left-[-10%] w-[600px] h-[600px] rounded-full orange-glow-bg opacity-30 pointer-events-none z-0"></div>

      {/* 1. Header (Sticky) */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 border-b ${
          scrolled
            ? "bg-white/85 backdrop-blur-md py-2.5 border-[#F0F0EE] shadow-sm"
            : "bg-white/85 backdrop-blur-md py-5 border-[#F0F0EE]"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          
          {/* Logo */}
          <div className="z-50 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <Logo className="h-8" iconClassName="h-8 w-8" textClassName="text-xl font-black text-[#0A0A0A] font-sans" />
          </div>

          {/* Desktop Navigation Links with gold sliding underline on hover */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#why-mazadjo" className={`text-[#0A0A0A]/80 hover:text-[#F05123] transition-colors duration-200 font-ibmarabic relative group py-1 ${lang === "en" ? "tracking-wide" : ""}`}>
              {t.nav.whyUs}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#F05123] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#live-experience" className={`text-[#0A0A0A]/80 hover:text-[#F05123] transition-colors duration-200 font-ibmarabic relative group py-1 ${lang === "en" ? "tracking-wide" : ""}`}>
              {t.nav.liveExp}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#F05123] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#categories" className={`text-[#0A0A0A]/80 hover:text-[#F05123] transition-colors duration-200 font-ibmarabic relative group py-1 ${lang === "en" ? "tracking-wide" : ""}`}>
              {t.nav.categories}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#F05123] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#pricing" className={`text-[#0A0A0A]/80 hover:text-[#F05123] transition-colors duration-200 font-ibmarabic relative group py-1 ${lang === "en" ? "tracking-wide" : ""}`}>
              {t.nav.pricing}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#F05123] transition-all duration-300 group-hover:w-full" />
            </a>
            <button type="button" onClick={() => { emitLandingEvent('browse_cta_clicked', { location: 'nav' }); onEnter(); }} className={`text-[#0A0A0A]/80 hover:text-[#F05123] transition-colors duration-200 font-ibmarabic relative group py-1 cursor-pointer ${lang === "en" ? "tracking-wide" : ""}`}>
              {t.nav.comingSoon}
              <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#F05123] transition-all duration-300 group-hover:w-full" />
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {/* Language Switch */}
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] border border-[#E5E5E5] hover:border-[#F05123] text-[#0A0A0A] hover:text-[#F05123] transition-all duration-200 bg-white/60 text-xs font-semibold cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-[#F05123]" />
              <span className="font-ibmarabic">{t.nav.langBtn}</span>
            </button>

            {/* CTA Button */}
            <a
              href="https://wa.me/962781444899"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-[8px] bg-[#F05123] hover:bg-[#D93E15] text-white text-xs font-bold shadow-sm transition-all duration-300 hover:scale-[1.02] text-center font-ibmarabic"
            >
              {t.nav.reserveBtn}
            </a>
          </div>

          {/* Mobile Navigation controls */}
          <div className="flex md:hidden items-center gap-3">
            {/* Language switch on mobile */}
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] border border-[#E5E5E5] text-[#0A0A0A] bg-white text-xs"
            >
              <Globe className="w-3 h-3 text-[#F05123]" />
              <span>{t.nav.langBtn}</span>
            </button>

            {/* Hamburger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-[8px] border border-[#E5E5E5] hover:bg-[#F7F7F7] text-[#0A0A0A] focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <div
        className={`fixed inset-x-0 top-[65px] bg-white/95 backdrop-blur-xl border-b border-[#E5E5E5] z-40 transition-all duration-300 md:hidden ${
          mobileMenuOpen ? "opacity-100 translate-y-0 shadow-lg" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        <div className="px-6 py-8 space-y-5 flex flex-col bg-white">
          <a
            href="#why-mazadjo"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-semibold text-[#0A0A0A] hover:text-[#F05123] py-2 border-b border-[#E5E5E5]/40 transition-colors duration-200 font-ibmarabic"
          >
            {t.nav.whyUs}
          </a>
          <a
            href="#live-experience"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-semibold text-[#0A0A0A] hover:text-[#F05123] py-2 border-b border-[#E5E5E5]/40 transition-colors duration-200 font-ibmarabic"
          >
            {t.nav.liveExp}
          </a>
          <a
            href="#categories"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-semibold text-[#0A0A0A] hover:text-[#F05123] py-2 border-b border-[#E5E5E5]/40 transition-colors duration-200 font-ibmarabic"
          >
            {t.nav.categories}
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-semibold text-[#0A0A0A] hover:text-[#F05123] py-2 border-b border-[#E5E5E5]/40 transition-colors duration-200 font-ibmarabic"
          >
            {t.nav.pricing}
          </a>
          <button
            type="button"
            onClick={() => { emitLandingEvent('browse_cta_clicked', { location: 'mobile_menu' }); setMobileMenuOpen(false); onEnter(); }}
            className="text-start text-base font-semibold text-[#0A0A0A] hover:text-[#F05123] py-2 border-b border-[#E5E5E5]/40 transition-colors duration-200 font-ibmarabic cursor-pointer"
          >
            {t.nav.comingSoon}
          </button>
          
          <a
            href="https://wa.me/962781444899"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full text-center py-3 rounded-[8px] bg-[#F05123] text-white font-bold text-sm shadow-sm font-ibmarabic block"
          >
            {t.nav.reserveBtn}
          </a>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow z-10">

        {/* 2. Hero Section */}
        <section 
          id="hero-section"
          className="relative pt-8 pb-16 lg:pt-16 lg:pb-24 px-4 sm:px-6 lg:px-8"
          style={{ backgroundImage: "radial-gradient(circle at 50% 0%, rgba(240, 81, 35, 0.04) 0%, rgba(255, 255, 255, 0) 70%)" }}
        >
          {/* Live-room simulator motion — ALL keyframes gated behind prefers-reduced-motion: no-preference */}
          <style>{`
            .hero-phwrap { transform: rotate(-3deg); }
            @media (prefers-reduced-motion: no-preference) {
              @keyframes hero-float { 50% { transform: rotate(-3deg) translateY(-9px); } }
              .hero-phwrap { animation: hero-float 6s ease-in-out infinite; }
              .hero-sheen::after {
                content: ""; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
                animation: hero-sheen 3.4s infinite; pointer-events: none;
              }
              @keyframes hero-sheen { 0% { left: -60%; } 55%, 100% { left: 130%; } }
              @keyframes hero-toast { 0% { opacity: 0; transform: translateY(6px); } 12%, 72% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-6px); } }
              .hero-toast { animation: hero-toast 2.2s ease forwards; }
              @keyframes hero-tick { 50% { opacity: 0.45; } }
              .hero-timer-tick { animation: hero-tick 1s infinite; }
              @keyframes hero-pop { 0% { transform: scale(0); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
              .hero-avatar-pop { animation: hero-pop 0.4s; }
            }
          `}</style>
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              
              {/* Left Column (Main Text Copy) - Orchestrated Staggered Entrance */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: 0.12
                    }
                  }
                }}
                className="lg:col-span-7 space-y-6 text-center lg:text-start"
              >
                
                {/* Badge */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F05123]/10 border border-[#F05123]/20 text-xs text-[#F05123] font-semibold font-ibmarabic mx-auto lg:mx-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F05123]" />
                  <span>{t.hero.badge}</span>
                </motion.div>

                {/* Heading with self-drawing gold line */}
                <motion.h1
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-[-0.03em] leading-[1.02] text-[#0A0A0A] font-alexandria flex flex-col items-center lg:items-start gap-1"
                >
                  <span className="block">{t.hero.titleFirst}</span>
                  <span className="text-[#F05123] block relative pb-1">
                    {t.hero.titleGradient}
                    <svg className={`absolute left-0 bottom-[-2px] w-full h-2 overflow-visible ${prefersReducedMotion ? "" : "animate-pulse-slow"}`} viewBox="0 0 100 10" preserveAspectRatio="none">
                      <motion.path
                        d="M0,5 Q50,0 100,5"
                        fill="none"
                        stroke="#F05123"
                        strokeWidth="3"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.9, duration: 1, ease: "easeInOut" }}
                      />
                    </svg>
                  </span>
                  <span className="block">{t.hero.titleLast}</span>
                </motion.h1>

                {/* Paragraph */}
                <motion.p
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  className="text-gray-700 text-base sm:text-lg max-w-xl mx-auto lg:mx-0 leading-relaxed font-ibmarabic font-medium pt-3"
                >
                  {t.hero.desc}
                </motion.p>

                {/* Action buttons */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2"
                >
                  <motion.button
                    type="button"
                    onClick={() => { emitLandingEvent('seller_cta_clicked', { location: 'hero' }); onEnter('upload'); }}
                    whileHover={{ scale: 1.02, filter: "brightness(1.08)" }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full sm:w-auto px-8 py-4 rounded-[8px] bg-[#F05123] hover:bg-[#D93E15] text-white font-bold text-base shadow-sm transition-all duration-300 text-center font-ibmarabic flex items-center justify-center gap-1.5 group cursor-pointer"
                  >
                    <span>{t.hero.ctaPrimary}</span>
                    <span className="inline-block transition-transform duration-300 group-hover:translate-x-1.5 rtl:group-hover:-translate-x-1.5">→</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => { emitLandingEvent('browse_cta_clicked', { location: 'hero' }); onEnter(); }}
                    whileHover={{ scale: 1.02, filter: "brightness(1.08)" }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full sm:w-auto px-8 py-4 rounded-[8px] border-[1.5px] border-[#0A0A0A] text-[#0A0A0A] font-semibold text-base bg-white hover:bg-[#0A0A0A] hover:text-white transition-all duration-300 text-center font-ibmarabic"
                  >
                    {t.hero.ctaSecondary}
                  </motion.button>
                </motion.div>

                {/* Real proof row */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
                  }}
                  className="flex items-center justify-center lg:justify-start gap-5 sm:gap-7 pt-6 border-t border-[#F0F0EE]"
                >
                  {t.hero.proof.map((s, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="w-px h-7 bg-[#F0F0EE] shrink-0" aria-hidden="true" />}
                      <div className="text-center lg:text-start">
                        <div dir="ltr" className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] font-alexandria leading-none">{s.value}</div>
                        <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[#0A0A0A]/50 font-ibmarabic mt-1.5">{s.label}</div>
                      </div>
                    </React.Fragment>
                  ))}
                </motion.div>

              </motion.div>

              {/* Right Column (Interactive Live Auction Card) enters last */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end relative my-auto py-4 w-full">
                
                {/* Soft blurred orange gradient blob behind the card */}
                <div className="absolute inset-0 m-auto w-[420px] h-[420px] max-w-full rounded-full bg-gradient-to-tr from-[#F05123]/25 via-[#FF6B00]/15 to-amber-200/20 filter blur-3xl pointer-events-none -z-10 opacity-80" />

                {/* Second/third-lot peeks — a small deck of live lots flanking the phone, balances the composition */}
                {/* Watch — upper left, pulled out so it reads clearly next to the phone */}
                <div
                  aria-hidden="true"
                  className="hidden lg:block absolute top-6 start-[-76px] z-0 w-[248px] rounded-[22px] overflow-hidden shadow-[0_28px_64px_rgba(0,0,0,0.32)] -rotate-[10deg] opacity-95 pointer-events-none select-none bg-white border border-black/5"
                >
                  <img
                    src="https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=600&q=80"
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-[188px] object-cover block"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      if (target.parentElement) {
                        target.parentElement.style.backgroundImage =
                          "radial-gradient(120% 120% at 30% 20%, #2a2a2e, #0d0d0f)";
                      }
                    }}
                  />
                  <div className="bg-[#0A0A0A] text-white px-3.5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="block text-[12px] font-bold font-alexandria truncate">{lang === "ar" ? "رولكس ديت جست ٤١" : "Rolex Datejust 41"}</span>
                      <span className="block text-[9px] text-white/50 font-ibmarabic mt-0.5">{lang === "ar" ? "ساعات · مباشر" : "Watches · Live"}</span>
                    </div>
                    <span dir="ltr" className="text-[#FF6B35] font-mono font-black text-sm flex items-center gap-1 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full bg-[#FF6B35] ${prefersReducedMotion ? "" : "animate-pulse"}`} />
                      2,150
                    </span>
                  </div>
                </div>
                {/* Car — lower left, overlapping below the watch to form the deck */}
                <div
                  aria-hidden="true"
                  className="hidden lg:block absolute top-[356px] start-[-28px] z-0 w-[232px] rounded-[22px] overflow-hidden shadow-[0_28px_64px_rgba(0,0,0,0.30)] rotate-[7deg] opacity-95 pointer-events-none select-none bg-white border border-black/5"
                >
                  <img
                    src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80"
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-[172px] object-cover block"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      if (target.parentElement) {
                        target.parentElement.style.backgroundImage =
                          "radial-gradient(120% 120% at 30% 20%, #2a2a2e, #0d0d0f)";
                      }
                    }}
                  />
                  <div className="bg-[#0A0A0A] text-white px-3.5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="block text-[12px] font-bold font-alexandria truncate">{lang === "ar" ? "بورش ٩١١" : "Porsche 911"}</span>
                      <span className="block text-[9px] text-white/50 font-ibmarabic mt-0.5">{lang === "ar" ? "مركبات · مباشر" : "Vehicles · Live"}</span>
                    </div>
                    <span dir="ltr" className="text-[#FF6B35] font-mono font-black text-sm flex items-center gap-1 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full bg-[#FF6B35] ${prefersReducedMotion ? "" : "animate-pulse"}`} />
                      42,500
                    </span>
                  </div>
                </div>

                {/* Premium Floating Reels Card Container with Phone Bezel */}
                <div className={`relative z-10 w-full max-w-[370px] ${prefersReducedMotion ? "-rotate-3" : "hero-phwrap"}`}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
                  className="w-full h-[640px] rounded-[38px] border-[5px] border-gray-900 bg-gray-950 text-white relative shadow-[0_25px_60px_-10px_rgba(240,81,35,0.35)] overflow-hidden flex flex-col justify-between p-4 selection:bg-[#F05123] select-none group"
                  id="hero-live-card"
                  onMouseEnter={() => setIsAutoCycling(false)}
                >
                  {/* Glowing warm orange aura behind card */}
                  <div className={`absolute -inset-2 bg-gradient-to-r from-[#FF6B00]/25 via-[#E85D04]/20 to-[#FF8C00]/25 rounded-[44px] blur-2xl opacity-75 ${prefersReducedMotion ? "" : "animate-pulse"} -z-10 pointer-events-none`} />

                  {/* Phone Bezel Top Notch */}
                  <div className="w-20 h-4 bg-gray-900 rounded-b-xl mx-auto absolute top-0 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center gap-1.5 shadow-inner">
                    <span className="w-2.5 h-2.5 rounded-full bg-black border border-gray-800" />
                    <span className="w-4 h-1 rounded-full bg-gray-800" />
                  </div>

                  {/* FULL-BLEED REELS MEDIA BACKGROUND */}
                  <div className="absolute inset-0 z-0 overflow-hidden bg-gray-900">
                    <img
                      src={currentItem.image}
                      alt={lang === "ar" ? currentItem.titleAr : currentItem.titleEn}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-1000 opacity-90"
                      key={currentItem.id}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.dataset.fallback === "done") return;
                        if (currentItem.id === "phone") {
                          if (target.src.includes("/iphone.png")) {
                            target.src = "/iphone.jpg";
                            return;
                          }
                          if (target.src.includes("/iphone.jpg")) {
                            target.src = "/src/iphone.png";
                            return;
                          }
                        }
                        // Final fallback for any lot: warm gradient, never a broken image
                        target.dataset.fallback = "done";
                        target.style.display = "none";
                        if (target.parentElement) {
                          target.parentElement.style.backgroundImage =
                            "radial-gradient(120% 120% at 30% 20%, #2a2a2e, #0d0d0f)";
                        }
                      }}
                    />
                    {/* Top and Bottom Reels Vignette Gradients */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/25 to-black/95 pointer-events-none" />
                  </div>

                  {/* "🔥 <name> just bid" toast — blips in on each landing bid */}
                  {justBidToast && !prefersReducedMotion && (
                    <div
                      key={justBidToast.key}
                      className={`hero-toast absolute top-[120px] ${lang === "ar" ? "right-3" : "left-3"} z-20 bg-black/80 backdrop-blur-md border border-white/15 text-white text-[10.5px] font-bold font-ibmarabic px-2.5 py-1.5 rounded-full pointer-events-none shadow-lg`}
                      onAnimationEnd={() => setJustBidToast(null)}
                    >
                      🔥 {justBidToast.name} {lang === "ar" ? "زايد الآن" : "just bid"}
                    </div>
                  )}

                  {/* Z-10 TOP OVERLAY: REELS HEADER */}
                  <div className="relative z-10 pt-3">
                    {/* Reels Streamer Profile & Live Badge Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/15">
                        <div className="relative flex shrink-0">
                          <img 
                            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" 
                            alt="MazadJo Streamer" 
                            className="w-7 h-7 rounded-full object-cover border-2 border-[#F05123]" 
                          />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-black ${prefersReducedMotion ? "" : "animate-pulse"}`} />
                        </div>
                        <div className={`flex flex-col ${lang === "ar" ? "text-right" : "text-left"}`}>
                          <span className="text-xs font-bold text-white font-alexandria leading-none flex items-center gap-1">
                            {lang === "ar" ? "مزاد جو مباشر" : "Mazad JO Live"}
                            <Sparkles className="w-3 h-3 text-amber-400" />
                          </span>
                          <span className="text-[9px] text-gray-300 font-ibmarabic flex items-center gap-1 mt-0.5">
                            <Eye className="w-2.5 h-2.5 text-emerald-400" />
                            <span dir="ltr" className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCount(watchers)}</span>
                            {lang === "ar" ? "يشاهدون" : "watching"}
                          </span>
                        </div>
                      </div>

                      {/* Live Badge Pill */}
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F05123] text-white text-[11px] font-bold font-ibmarabic shadow-lg shadow-[#F05123]/40 border border-white/20 ${prefersReducedMotion ? "" : "animate-pulse"}`}>
                        <span className={`w-2 h-2 rounded-full bg-white ${prefersReducedMotion ? "" : "animate-ping"}`} />
                        <span>{lang === "ar" ? "بث المزاد 🔴" : "LIVE 🔴"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Z-10 BOTTOM OVERLAY: REELS DETAILS & INSTANT BID */}
                  <div className="relative z-10 space-y-2.5 pb-1">
                    {/* Dynamic Auto-Extension Alert Banner */}
                    {showExtensionAlert && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-amber-500/90 text-black backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold font-ibmarabic shadow-lg flex items-center gap-1.5 border border-amber-300"
                      >
                        <Bell className="w-3.5 h-3.5 text-black animate-ring shrink-0" />
                        <span>{lang === "ar" ? "⏱ تم تمديد الوقت دقيقة إضافية للمنافسة!" : "⏱ Extended +1 min for live bids!"}</span>
                      </motion.div>
                    )}

                    {/* "Latest bid" chip — flashes an orange ring + price bump on each landing bid */}
                    <div className={`max-w-[85%] bg-black/60 backdrop-blur-md rounded-2xl px-3 py-2.5 border border-white/15 shadow-xl flex items-center justify-between gap-3 transition-all duration-300 ${flashHit ? "ring-2 ring-[#F05123] ring-offset-0 -translate-y-0.5" : ""}`}>
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-bold font-ibmarabic uppercase tracking-wide">
                        <Flame className={`w-3 h-3 text-[#F05123] ${prefersReducedMotion ? "" : "animate-pulse"}`} />
                        <span>{lang === "ar" ? "آخر مزايدة 🔥" : "Latest bid 🔥"}</span>
                      </div>
                      <span dir="ltr" className={`text-sm text-[#F05123] font-black font-mono inline-block transition-transform duration-200 ${priceBump ? "scale-[1.14]" : "scale-100"}`}>
                        {formatPrice(currentPrice)}
                      </span>
                    </div>

                    {/* Product Title & Badge */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-[#F05123]/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md font-ibmarabic">
                          {lang === "ar" ? currentItem.badgeAr : currentItem.badgeEn}
                        </span>
                        <span className="text-[10px] text-gray-300 font-ibmarabic">
                          {lang === "ar" ? "الرقم المرجعي: #JO-22419" : "Ref: #JO-22419"}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white font-alexandria leading-snug drop-shadow-md">
                        {lang === "ar" ? currentItem.titleAr : currentItem.titleEn}
                      </h3>
                      <p className="text-xs text-gray-300 font-ibmarabic line-clamp-1 drop-shadow-sm">
                        {lang === "ar" ? currentItem.detailsAr : currentItem.detailsEn}
                      </p>
                    </div>

                    {/* Price & Countdown Timer Bar */}
                    <div className="bg-black/60 backdrop-blur-md rounded-2xl p-3 border border-white/15 flex items-center justify-between shadow-xl">
                      <div>
                        <span className="text-[10px] text-gray-300 font-bold uppercase font-ibmarabic block">
                          {lang === "ar" ? "السعر الحالي" : "Current Bid"}
                        </span>
                        <div className="overflow-hidden relative h-6">
                          <AnimatePresence mode="popLayout">
                            <motion.span
                              key={currentPrice}
                              initial={{ y: 15, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -15, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="text-lg sm:text-xl font-black text-amber-400 block font-mono"
                            >
                              {formatPrice(currentPrice)}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                      </div>

                      <div className="text-end">
                        <span className="text-[10px] text-gray-300 font-bold uppercase font-ibmarabic block">
                          {lang === "ar" ? "الوقت المتبقي" : "Ends In"}
                        </span>
                        <span dir="ltr" className={`text-xs font-mono font-extrabold flex items-center gap-1 justify-end bg-black/80 border px-2.5 py-1 rounded-lg mt-0.5 shadow-inner transition-colors duration-300 ${carTimer < 12 ? "text-[#FF5A4D] border-[#FF5A4D]/50" : "text-[#F05123] border-[#F05123]/40"} ${carTimer < 12 && !prefersReducedMotion ? "hero-timer-tick" : ""}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                          <Clock className={`w-3.5 h-3.5 ${carTimer < 12 ? "text-[#FF5A4D]" : "text-[#F05123]"} ${prefersReducedMotion ? "" : "animate-pulse"}`} />
                          {formatCountdown(carTimer)}
                        </span>
                      </div>
                    </div>

                    {/* Main Reels Instant Bid Button */}
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={handleUserBid}
                      className="hero-sheen w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#F05123] via-[#FF6B35] to-[#F05123] hover:brightness-110 text-white font-extrabold text-sm shadow-[0_10px_25px_-5px_rgba(240,81,35,0.6)] transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 border border-white/20 relative overflow-hidden group/bid"
                    >
                      <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/bid:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                      <Hammer className={`w-4 h-4 text-white ${prefersReducedMotion ? "" : "animate-bounce"}`} />
                      <span className="font-ibmarabic tracking-wide text-sm">
                        {lang === "ar" 
                          ? `زايد الآن (+${currentItem.stepPrice.toLocaleString("ar-JO")} د.أ)` 
                          : `Bid Now (+${currentItem.stepPrice.toLocaleString("en-US")} JOD)`}
                      </span>
                    </motion.button>

                    {/* Active Bidders Footer Row */}
                    <div className="flex items-center justify-between text-[11px] text-gray-300 font-ibmarabic px-1 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5 rtl:space-x-reverse">
                          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="Bidder" className="w-4 h-4 rounded-full object-cover border border-black" />
                          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" alt="Bidder" className="w-4 h-4 rounded-full object-cover border border-black" />
                          <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" alt="Bidder" className="w-4 h-4 rounded-full object-cover border border-black" />
                          {/* Occasional avatar pops in as bids land */}
                          {Array.from({ length: extraAvatars }).map((_, i) => (
                            <span
                              key={i}
                              aria-hidden="true"
                              className={`w-4 h-4 rounded-full border border-black bg-gradient-to-br from-gray-500 to-gray-800 ${prefersReducedMotion ? "" : "hero-avatar-pop"}`}
                            />
                          ))}
                        </div>
                        <span dir="ltr" className="text-[10px] text-gray-300 font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatCount(bidCount)} {lang === "ar" ? "مزايد نشط" : "bidders active"}
                        </span>
                      </div>

                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${prefersReducedMotion ? "" : "animate-ping"}`} />
                        {lang === "ar" ? "متواجدين الآن" : "Live Now"}
                      </span>
                    </div>
                  </div>

                </motion.div>
                </div>

              </div>

            </div>

          </div>
        </section>

        {/* 2.5 Section: How it works (كيف بيشتغل مزاد جو) */}
        <section id="how-it-works" className="py-[96px] bg-[#FFFFFF] border-b border-[#F0F0EE] relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <Reveal>
              <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-12">
                <span className={`inline-block px-3.5 py-1 rounded-full bg-[#F05123]/10 text-[#F05123] text-xs font-bold font-ibmarabic border border-[#F05123]/20 mb-3 ${lang === "en" ? "tracking-wide" : ""}`}>
                  {lang === "ar" ? "خطواتنا" : "Our Process"}
                </span>
                <h2 className="text-4xl md:text-5xl font-bold text-[#0A0A0A] font-ibmarabic mb-4 leading-tight">
                  {lang === "ar" ? "كيف بيشتغل مزاد جو؟" : "How does MazadJo work?"}
                </h2>
                <p className="text-lg text-gray-600 font-ibmarabic">
                  {lang === "ar" ? "أربع خطوات بسيطة وواضحة." : "Four simple, transparent steps."}
                </p>
              </div>
            </Reveal>

            {/* Tab Switcher */}
            <Reveal delay={0.1}>
              <div className="flex justify-center mb-12">
                <div className="inline-flex bg-[#0A0A0A]/5 p-1 rounded-full border border-gray-200">
                  <button
                    onClick={() => setHowItWorksTab("buyer")}
                    className={`px-6 py-3 min-h-[44px] flex items-center justify-center rounded-full text-sm font-bold font-ibmarabic transition-all duration-300 ${
                      howItWorksTab === "buyer"
                        ? "bg-[#F05123] text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {lang === "ar" ? "أنا مشتري" : "I am a Buyer"}
                  </button>
                  <button
                    onClick={() => setHowItWorksTab("seller")}
                    className={`px-6 py-3 min-h-[44px] flex items-center justify-center rounded-full text-sm font-bold font-ibmarabic transition-all duration-300 ${
                      howItWorksTab === "seller"
                        ? "bg-[#F05123] text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {lang === "ar" ? "أنا بائع" : "I am a Seller"}
                  </button>
                </div>
              </div>
            </Reveal>

            {/* Steps Grid container with tab switching animations */}
            <AnimatePresence mode="wait">
              <motion.div
                key={howItWorksTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-6 relative"
              >
                {howItWorksTab === "buyer" ? (
                  <>
                    {/* Buyer Step 1 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        1
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <Search className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "تصفح وافحص" : "Browse & Inspect"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "شوف تقرير الفحص الكامل لكل منتج قبل ما تزايد" : "Check the comprehensive inspection report for each item before you bid."}
                      </p>
                      
                      <div className="hidden md:block absolute top-[2.75rem] -right-3 translate-x-1/2 z-10 text-[#F05123]/40 animate-pulse">
                        <svg className="w-5 h-5 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Buyer Step 2 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        2
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <Hammer className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "زايد براحتك" : "Bid with Ease"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "السعر بيرتفع أوتوماتيك، بدون تفاوض ولا مساومة" : "The price rises automatically, with no negotiations or haggling."}
                      </p>
                      
                      <div className="hidden md:block absolute top-[2.75rem] -right-3 translate-x-1/2 z-10 text-[#F05123]/40 animate-pulse">
                        <svg className="w-5 h-5 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Buyer Step 3 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        3
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <Lock className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "فلوسك محجوزة" : "Held Until You Confirm"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "لما تربح، فلوسك تنحجز بالضمان، ما بتوصل للبائع لسا" : "When you win, your funds are securely held in escrow and not yet sent."}
                      </p>
                      
                      <div className="hidden md:block absolute top-[2.75rem] -right-3 translate-x-1/2 z-10 text-[#F05123]/40 animate-pulse">
                        <svg className="w-5 h-5 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Buyer Step 4 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        4
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "استلم ووافق" : "Receive & Approve"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "افحص المنتج، ولما توافق، وقتها بس تنطلق الفلوس" : "Inspect the product, and only when you approve, the funds are released."}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Seller Step 1 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        1
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <Camera className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "ارفع منتجك" : "List Your Product"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "صوّره وارفعه، بدون أي رسم عرض حالياً" : "Take photos and list your product, completely free of any listing fees right now."}
                      </p>
                      
                      <div className="hidden md:block absolute top-[2.75rem] -right-3 translate-x-1/2 z-10 text-[#F05123]/40 animate-pulse">
                        <svg className="w-5 h-5 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Seller Step 2 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        2
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <Wrench className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "نفحصه ونوثقه" : "Verify & Inspect"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "فريقنا يتأكد من دقة ووصف المنتج" : "Our expert team verifies the accuracy and description of the product."}
                      </p>
                      
                      <div className="hidden md:block absolute top-[2.75rem] -right-3 translate-x-1/2 z-10 text-[#F05123]/40 animate-pulse">
                        <svg className="w-5 h-5 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Seller Step 3 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        3
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <TrendingUp className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "المزاد يفتح" : "Auction Goes Live"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "السعر يرتفع حسب الطلب الحقيقي للمشترين" : "The price climbs based on actual demand from real buyers."}
                      </p>
                      
                      <div className="hidden md:block absolute top-[2.75rem] -right-3 translate-x-1/2 z-10 text-[#F05123]/40 animate-pulse">
                        <svg className="w-5 h-5 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Seller Step 4 */}
                    <div className="brand-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white border border-[#E5E5E5] p-6 relative flex flex-col items-center text-center">
                      <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#F05123]/10 text-[#F05123] font-bold font-mono flex items-center justify-center text-sm">
                        4
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-[#FFF1EC] flex items-center justify-center mb-5 text-[#F05123]">
                        <Award className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A] font-ibmarabic mb-2">
                        {lang === "ar" ? "استلم فلوسك" : "Get Paid"}
                      </h3>
                      <p className="text-sm text-gray-600 font-ibmarabic leading-relaxed">
                        {lang === "ar" ? "البائع يستلم ٩٥٪ — عمولة ٥٪ فقط عند البيع، والباقي إلك فوراً" : "Sellers keep 95% — just 5% commission on sale, and the rest is yours instantly."}
                      </p>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>





        <LiveMarketplaceSection lang={lang} t={t} onEnter={onEnter} formatPrice={formatPrice} />

        {/* 3. Section "الثقة أولاً" (Trust First) */}
        <section id="why-mazadjo" className="py-20 bg-white border-y border-[#F0F0EE] relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Title */}
            <Reveal>
              <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16 gap-4">
                <span className={`inline-block px-3.5 py-1 rounded-full bg-[#F05123]/10 text-[#F05123] text-xs font-bold font-ibmarabic border border-[#F05123]/20 ${lang === "en" ? "tracking-wide" : ""}`}>
                  {t.trust.badge}
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] font-alexandria">
                  {t.trust.title}
                </h2>
                <p className="text-gray-700 text-sm sm:text-base font-ibmarabic max-w-xl mx-auto">
                  {t.trust.subtitle}
                </p>
              </div>
            </Reveal>

            {/* Core Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {t.trust.cards.map((card, idx) => (
                <Reveal key={idx} delay={idx * 0.1}>
                  <motion.div
                    whileHover={{ 
                      y: -8, 
                      borderColor: "#F05123",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.08)" 
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="bg-white rounded-[10px] p-6 border border-[#ECECEA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-300 group h-full relative overflow-hidden"
                  >
                    {/* Golden accent bar at top on hover */}
                    <span className="absolute top-0 left-0 right-0 h-[2.5px] bg-[#F05123] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

                    <div className="w-12 h-12 rounded-[10px] bg-[#F05123]/10 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-[#F05123]/15 transition-all duration-300">
                      {getLineIcon(`trust-${idx}`, "w-6 h-6 text-[#F05123]")}
                    </div>
                    <h3 className="text-lg font-bold text-[#0A0A0A] font-alexandria mb-2 group-hover:text-[#F05123] transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-gray-600 leading-relaxed font-ibmarabic">
                      {card.desc}
                    </p>
                  </motion.div>
                </Reveal>
              ))}
            </div>

          </div>
        </section>

        {/* 4. Section "لماذا MazadJo" (Comparison VS) */}
        <section className="py-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Title */}
            <Reveal>
              <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] font-alexandria">
                  {t.why.title}
                </h2>
                <p className="text-gray-700 text-sm sm:text-base font-ibmarabic max-w-xl mx-auto">
                  {t.why.subtitle}
                </p>
              </div>
            </Reveal>

            {/* VS Comparison Container */}
            <div className="grid grid-cols-1 lg:grid-cols-11 gap-8 items-center relative">
              
              {/* Column 1: Traditional (Red cross) */}
              <div className="lg:col-span-5">
                <Reveal>
                  <motion.div
                    whileHover={{ y: -5, borderColor: "rgba(239, 68, 68, 0.3)", boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}
                    className="bg-white border border-[#ECECEA] rounded-[10px] p-8 space-y-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-300 h-full"
                  >
                    <div className="flex items-center gap-3 pb-4 border-b border-[#ECECEA]">
                      <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600 font-bold shrink-0">
                        ✕
                      </div>
                      <h3 className="text-lg font-bold text-[#0A0A0A]/90 font-alexandria">
                        {t.why.traditionalTitle}
                      </h3>
                    </div>

                    <ul className="space-y-4">
                      {t.why.traditionalPoints.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-600 font-ibmarabic leading-relaxed">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </Reveal>
              </div>

              {/* VS Divider in middle */}
              <div className="lg:col-span-1 flex justify-center z-10">
                <Reveal delay={0.25}>
                  <motion.div
                    whileHover={{ scale: 1.15, rotate: 12 }}
                    className="w-12 h-12 rounded-full bg-[#F05123] flex items-center justify-center font-bold text-white text-lg shadow-sm select-none cursor-pointer"
                  >
                    VS
                  </motion.div>
                </Reveal>
              </div>

              {/* Column 2: MazadJo (Smart Royal Gold hover highlights) */}
              <div className="lg:col-span-5">
                <Reveal delay={0.2}>
                  <motion.div
                    whileHover={{ 
                      y: -8, 
                      borderColor: "#F05123",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.08)"
                    }}
                    className="bg-white border-2 border-[#F05123] rounded-[10px] p-8 space-y-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative overflow-hidden group transition-all duration-300 h-full"
                  >
                    
                    {/* Visual highlights */}
                    <div className={`absolute top-0 right-0 bg-[#F05123] text-white text-[10px] uppercase font-black px-4 py-1 rounded-bl-lg font-ibmarabic shadow-sm ${lang === "en" ? "tracking-wide" : ""}`}>
                      {lang === "ar" ? "موصى به" : "RECOMMENDED"}
                    </div>

                    <div className="flex items-center gap-3 pb-4 border-b border-[#ECECEA]">
                      <div className="w-10 h-10 rounded-lg bg-[#F05123]/10 flex items-center justify-center text-[#F05123] shrink-0">
                        <Hammer className="w-5 h-5" />
                      </div>
                      <h3 className="text-xl font-bold text-[#0A0A0A] font-alexandria">
                        {t.why.smartTitle}
                      </h3>
                    </div>

                    <ul className="space-y-4">
                      {t.why.smartPoints.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-[#F05123] shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-800 font-ibmarabic font-medium leading-relaxed">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </Reveal>
              </div>

            </div>

          </div>
        </section>

        {/* Real Customer Testimonials Section */}
        <section id="testimonials" className="py-20 bg-[#FAF7EE]/30 border-t border-[#F0F0EE]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal>
              <h2 className="text-4xl font-bold text-center text-black font-alexandria mb-12">
                {lang === "ar" ? "قصص حقيقية من ناس زيك" : "Real Stories From People Like You"}
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  ar: "بعت سيارتي خلال 3 أيام وبسعر أعلى مما توقعت. العمولة بسيطة جداً مقارنة بالراحة.",
                  en: "I sold my car in just 3 days and for a higher price than I expected. The commission is very small compared to the convenience.",
                  nameAr: "أحمد. م — عمّان",
                  nameEn: "Ahmad M. — Amman"
                },
                {
                  ar: "اشتريت آيفون واستلمته مطابق تماماً للفحص. ما دفعت للبائع إلا بعد ما تأكدت بنفسي.",
                  en: "I bought an iPhone and received it exactly matching the inspection. I didn't pay the seller until I verified it myself.",
                  nameAr: "سارة. ح — إربد",
                  nameEn: "Sarah H. — Irbid"
                },
                {
                  ar: "زرت المكتب قبل ما أعرض غرفة نوم، واطمنيت إنهم فاحصين كل التفاصيل.",
                  en: "I visited the office before offering a bedroom set, and felt assured knowing they inspect every single detail.",
                  nameAr: "خليل. ع — الزرقاء",
                  nameEn: "Khalil A. — Zarqa"
                }
              ].map((testi, idx) => (
                <Reveal key={idx} delay={idx * 0.15}>
                  <div className="bg-white border border-[#ECECEA] rounded-2xl p-8 flex flex-col justify-between h-full shadow-sm hover:shadow-md transition-all duration-300 relative group">
                    <div>
                      <Quote className="w-8 h-8 text-[#F05123] mb-5 shrink-0 transform -scale-x-100" />
                      <p className="text-gray-700 font-ibmarabic text-base leading-relaxed mb-6 font-medium">
                        {lang === "ar" ? testi.ar : testi.en}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 font-ibmarabic font-semibold">
                        {lang === "ar" ? testi.nameAr : testi.nameEn}
                      </span>
                      <div className="flex gap-1 mt-2">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 text-[#F05123] fill-[#F05123]" />
                        ))}
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Statistics and Badges Bar */}
            <Reveal delay={0.4}>
              <div className="mt-16 bg-[#0A0A0A] text-white rounded-2xl p-8 border border-gray-800 shadow-xl">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  {[
                    {
                      arVal: "١,٢٥٠+",
                      enVal: "1,250+",
                      arLabel: "عملية بيع ناجحة",
                      enLabel: "Successful Sales"
                    },
                    {
                      arVal: "٣,٤٠٠+",
                      enVal: "3,400+",
                      arLabel: "منتج مفحوص",
                      enLabel: "Inspected Items"
                    },
                    {
                      arVal: "١٥,٠٠٠+",
                      enVal: "15,000+",
                      arLabel: "مستخدم نشط",
                      enLabel: "Active Users"
                    },
                    {
                      arVal: <Lock className="w-8 h-8 sm:w-9 sm:h-9 inline-block" aria-hidden="true" />,
                      enVal: <Lock className="w-8 h-8 sm:w-9 sm:h-9 inline-block" aria-hidden="true" />,
                      arLabel: "محجوز حتى الاستلام",
                      enLabel: "Held until you confirm"
                    }
                  ].map((stat, idx) => (
                    <div key={idx} className="space-y-2 flex flex-col items-center justify-center">
                      <span className="text-3xl sm:text-4xl font-extrabold text-[#F05123] font-mono tracking-tight block">
                        {lang === "ar" ? stat.arVal : stat.enVal}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-300 font-ibmarabic font-medium">
                        {lang === "ar" ? stat.arLabel : stat.enLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 5. Section "تجربة تفاعلية" (Interactive Live Room Simulator) */}
        <section id="live-experience" className="py-20 bg-white border-t border-[#F0F0EE]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Specs & Mini Stats */}
              <div className="lg:col-span-6 space-y-8">
                <div className="flex flex-col items-start gap-4">
                  <span className={`inline-block px-3.5 py-1 rounded-full bg-[#F05123]/10 text-[#F05123] text-xs font-bold font-ibmarabic border border-[#F05123]/20 ${lang === "en" ? "tracking-wide" : ""}`}>
                    {t.interactive.title}
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] font-alexandria leading-tight">
                    {t.interactive.subtitle}
                  </h2>
                  <p className="text-gray-700 text-sm sm:text-base leading-relaxed font-ibmarabic">
                    {lang === "ar" 
                      ? "جرب بنفسك حماس المزايدة في الوقت الفعلي. انظر كيف تتنافس الأطراف المختلفة وتتفاعل ديناميكياً لترفع القيمة الحقيقية للسلعة خلال ثوانٍ معدودة."
                      : "Try the bidding excitement yourself in real-time. Experience how participants battle dynamically to raise the real value of the item in seconds."}
                  </p>
                </div>

                {/* 4 Block Stats with Gold Numbers */}
                <div className="grid grid-cols-2 gap-4">
                  {t.interactive.stats.map((stat, idx) => (
                    <div key={idx} className="bg-white border border-[#ECECEA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] rounded-[10px] p-4 hover:bg-[#FAFAFA] transition-all duration-300">
                      <span className="text-2xl sm:text-3xl font-bold text-[#F05123] block font-mono tabular-nums">
                        {idx === 0 ? (
                          <Counter target={98} suffix="%" />
                        ) : idx === 1 ? (
                          <Counter target={3} prefix="≤ " />
                        ) : idx === 2 ? (
                          <Counter target={7} suffix={lang === "ar" ? " أيام" : " Days"} />
                        ) : (
                          <span>
                            <Counter target={24} />/7
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-600 font-ibmarabic mt-1 block">
                        {stat.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Live Room Simulation Card */}
              <div className="lg:col-span-6 flex justify-center">
                
                <div 
                  className="w-full max-w-[500px] bg-white rounded-[10px] p-6 border border-[#ECECEA] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] relative overflow-hidden transition-all duration-300"
                  onMouseEnter={() => setIsAutoCycling(false)}
                >
                  
                  {/* Top Bar */}
                  <div className="flex items-center justify-between pb-4 border-b border-[#ECECEA] mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#F05123] animate-ping"></div>
                      <span className={`text-xs font-bold text-[#F05123] uppercase font-alexandria flex items-center gap-1 ${lang === "en" ? "tracking-wider" : ""}`}>
                        <TrendingUp className="w-3.5 h-3.5" />
                        {t.interactive.simulationTitle}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">ID: JO-22419</span>
                  </div>

                  {/* Header Item specs connected to Hero price */}
                  <div className="bg-[#FAFAFA] rounded-[10px] p-4 border border-[#ECECEA] mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
                    <div>
                      <span className="px-2 py-0.5 rounded-[10px] bg-[#F05123]/10 text-[#F05123] text-[10px] font-bold uppercase font-ibmarabic">
                        {lang === "ar" ? "المزاد النشط الحالي" : "Current Active Auction"}
                      </span>
                      <h4 className="text-base font-bold text-[#0A0A0A] font-alexandria mt-1 flex items-center gap-1.5 transition-all duration-300">
                        <span>{lang === "ar" ? currentItem.titleAr : currentItem.titleEn}</span>
                      </h4>
                      <span className="text-xs text-gray-600 font-ibmarabic transition-all duration-300">
                        {lang === "ar" ? currentItem.detailsAr : currentItem.detailsEn}
                      </span>
                    </div>

                    <div className="sm:text-end shrink-0">
                      <span className="text-[10px] text-gray-500 font-ibmarabic block">{t.hero.currentPrice}</span>
                      <span className={`text-xl font-bold text-[#F05123] transition-all duration-300 block ${
                        pulsePrice ? "scale-105" : ""
                      }`}>
                        {formatPrice(currentPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Competition Intensity indicator */}
                  <div className="mb-4 bg-[#FAFAFA] rounded-[10px] p-3 border border-[#ECECEA] space-y-2">
                    <div className="flex justify-between text-xs font-ibmarabic text-gray-700">
                      <span>{t.interactive.competitionLevel}</span>
                      <span className="font-bold font-mono text-[#F05123]">{compLevel}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-[#F0F0EE] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#F05123] rounded-full transition-all duration-500"
                        style={{ width: `${compLevel}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Participants List */}
                  <div className="flex items-center justify-between gap-2 mb-4 bg-[#FAFAFA] rounded-[10px] p-3 border border-[#ECECEA]">
                    <span className="text-xs text-gray-600 font-ibmarabic">{t.interactive.participantsLabel}</span>
                    
                    <div className="flex items-center">
                      <div className="flex -space-x-2 overflow-hidden rtl:space-x-reverse">
                        <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">M</span>
                        <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">A</span>
                        <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">S</span>
                        <span className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">R</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-[#F05123] ml-2 rtl:mr-2">+9</span>
                    </div>
                  </div>

                  {/* Real-time Bid Log List */}
                  <div className="space-y-2 mb-4">
                    <span className="text-xs text-gray-600 font-ibmarabic block mb-1">{t.interactive.bidsTitle}:</span>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {bidLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-center justify-between p-2.5 rounded-[10px] border text-xs transition-all duration-300 ${
                            log.isUser
                              ? "bg-[#F05123]/10 border-[#F05123] text-[#F05123] shadow-sm font-semibold"
                              : "bg-white border-[#ECECEA] text-[#0A0A0A]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${log.isUser ? "bg-[#F05123]" : "bg-gray-400"}`}></span>
                            <span className="font-semibold font-ibmarabic">{getLogName(log)}</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-[10px]">
                              {renderMixedText(translateLogTime(log.time, lang === "ar"), lang === "ar")}
                            </span>
                            <span className="font-bold text-[#F05123]">
                              {formatPrice(log.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Manual trigger buttons inside simulator */}
                  <button
                    onClick={handleUserBid}
                    className="w-full py-3.5 rounded-[10px] bg-[#F05123] hover:bg-[#D93E15] text-white font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Hammer className="w-4 h-4 text-white" />
                    <span className="font-ibmarabic">{t.interactive.bidButton}</span>
                  </button>

                  {/* Badges footer */}
                  <div className="mt-4 pt-3 border-t border-[#ECECEA] flex items-center justify-between text-[9px] text-gray-500 font-ibmarabic">
                    <span>{t.interactive.secureBadge}</span>
                    <span>{t.interactive.competitorsBadge}</span>
                    <span>{t.interactive.autoExtendBadge}</span>
                  </div>

                </div>

              </div>

            </div>

          </div>
        </section>

        {/* 2.6 Section: Escrow (الضمان المالي) */}
        <section id="escrow-protection" className="py-[96px] bg-[#F7F7F7] border-b border-[#F0F0EE] relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              
              {/* Right/Main Column: Text content */}
              <Reveal>
                <div className="flex flex-col space-y-6">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#FFF1EC] text-[#D63E10] text-xs font-bold font-ibmarabic border border-[#F05123]/20 mb-3">
                      <ShieldCheck className="w-4 h-4" />
                      {lang === "ar" ? "الأمان المالي" : "Financial Security"}
                    </span>
                    <h2 className="text-4xl md:text-5xl font-bold text-[#0A0A0A] font-ibmarabic leading-tight">
                      {lang === "ar" ? "فلوسك بأمان لحد ما توافق إنت — مش قبل." : "Your money is safe until you approve — never before."}
                    </h2>
                  </div>
                  
                  <p className="text-lg text-gray-600 font-ibmarabic leading-relaxed">
                    {lang === "ar"
                      ? "ما في مفاجآت. فلوسك تضل محجوزة عندنا لحد ما تستلم المنتج وتتأكد إنه مطابق تماماً لما اتفقنا عليه. بس هيك بتنطلق للبائع."
                      : "No surprises. Your funds remain securely held by us until you receive the product and verify that it perfectly matches what was agreed upon. Only then is it released to the seller."}
                  </p>
                  
                  {/* Confirmatory List with Checkmarks */}
                  <div className="space-y-4 pt-2">
                    {[
                      {
                        ar: "مزاد بيحتفظ بمبلغك وما بيحوّله للبائع إلا بعد ما تستلم القطعة وتتأكد إنها مطابقة.",
                        en: "Mazad holds your payment and releases it to the seller only after you receive the item and confirm it matches."
                      },
                      {
                        ar: "الدفع لا يكتمل إلا بعد معاينة السلعة فعلياً ومطابقتها للمواصفات.",
                        en: "Payment is never disbursed until you inspect the item and approve its specifications."
                      },
                      {
                        ar: "إذا كان في مشكلة أو عدم تطابق قبل تأكيدك للاستلام، مزاد يتوسط ويرجّع لك مبلغك المحجوز.",
                        en: "If there is a problem or mismatch before you confirm receipt, Mazad mediates and returns your held payment."
                      }
                    ].map((point, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#F05123]/10 flex items-center justify-center shrink-0 mt-1">
                          <Check className="w-3.5 h-3.5 text-[#F05123]" />
                        </div>
                        <span className="text-gray-700 font-ibmarabic text-sm sm:text-base leading-relaxed font-medium">
                          {lang === "ar" ? point.ar : point.en}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              {/* Left Column: Interactive Escrow Path Diagram */}
              <Reveal delay={0.2}>
                <div className="bg-white rounded-2xl p-6 sm:p-8 border border-[#E5E5E5] shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#F05123]/5 rounded-bl-full pointer-events-none" />
                  
                  <div className="flex items-center justify-between mb-8 border-b border-gray-100 pb-4">
                    <h3 className="font-bold text-[#0A0A0A] font-ibmarabic text-lg">
                      {lang === "ar" ? "مسار الضمان المالي الحي" : "How Your Payment Is Held"}
                    </h3>
                    <span className="text-xs font-bold text-gray-500 font-ibmarabic">
                      {lang === "ar" ? "اضغط على الخطوة للتجربة" : "Click step to interact"}
                    </span>
                  </div>

                  {/* Connecting Line Container */}
                  <div className="relative space-y-6">
                    {/* Vertical connector line */}
                    <div className="absolute right-[21px] top-4 bottom-4 w-0.5 bg-gray-200 transform translate-x-1/2 rtl:right-auto rtl:left-[21px] rtl:-translate-x-1/2" />
                    
                    {[
                      {
                        step: 1,
                        arTitle: "البائع يستلم المزايدة الفائزة",
                        enTitle: "Seller accepts the winning bid",
                        arDesc: "يتم تحديد العرض الأعلى الفائز بالمزاد رسمياً.",
                        enDesc: "The highest winning bid of the auction is officially determined."
                      },
                      {
                        step: 2,
                        arTitle: "مزاد بتحتفظ بالمبلغ",
                        enTitle: "Mazad holds the payment",
                        arDesc: "مزاد بتحتفظ بمبلغك وما بتحوّله للبائع إلا بعد ما تستلم القطعة وتتأكد إنها مطابقة.",
                        enDesc: "Mazad holds your payment and does not release it to the seller until you receive the item and confirm it matches."
                      },
                      {
                        step: 3,
                        arTitle: "المشتري يفحص المنتج فعلياً",
                        enTitle: "Buyer physically inspects the item",
                        arDesc: "يلتقي الطرفان للمعاينة الأخيرة ومطابقة تقرير الفحص المعتمد.",
                        enDesc: "Both parties meet for physical inspection and specs verification."
                      },
                      {
                        step: 4,
                        arTitle: "عند الموافقة، الفلوس تنطلق للبائع فوراً",
                        enTitle: "Upon approval, funds release to seller",
                        arDesc: "بعد تأكيد المشتري، يتم صرف المستحقات ونقل الملكية بأمان.",
                        enDesc: "Once buyer confirms, payment is instantly released and ownership is transferred."
                      }
                    ].map((stepObj) => {
                      const isActive = activeEscrowStep === stepObj.step;
                      return (
                        <button
                          key={stepObj.step}
                          onClick={() => setActiveEscrowStep(stepObj.step)}
                          className={`w-full text-right rtl:text-right ltr:text-left flex items-start gap-4 p-3.5 rounded-xl transition-all duration-300 relative z-10 ${
                            isActive 
                              ? "bg-[#F05123]/5 border border-[#F05123]/20 shadow-sm" 
                              : "hover:bg-gray-50 border border-transparent"
                          }`}
                        >
                          {/* Number Circle with potential pulse animation */}
                          <div className="relative shrink-0">
                            <div className={`w-10 h-10 rounded-full font-bold font-mono text-sm flex items-center justify-center transition-all duration-300 ${
                              isActive
                                ? "bg-[#F05123] text-white"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              <span className="font-mono" dir="ltr">{stepObj.step}</span>
                            </div>
                            
                            {/* Pulse animation for active step */}
                            {isActive && (
                              <span className="absolute -inset-1 rounded-full border border-[#F05123] animate-pulse pointer-events-none opacity-60" />
                            )}
                          </div>

                          <div className="flex-1">
                            <h4 className={`text-base font-bold font-ibmarabic transition-colors duration-300 ${
                              isActive ? "text-[#F05123]" : "text-[#0A0A0A]"
                            }`}>
                              {lang === "ar" ? stepObj.arTitle : stepObj.enTitle}
                            </h4>
                            <p className="text-xs text-gray-500 font-ibmarabic mt-0.5 leading-relaxed">
                              {lang === "ar" ? stepObj.arDesc : stepObj.enDesc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Reveal>

            </div>
          </div>
        </section>

        {/* 6. Section "الفئات" (Categories) */}
        <section id="categories" className="py-20 bg-[#F7F7F7] border-y border-[#F0F0EE] relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Title */}
            <Reveal>
              <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] font-alexandria">
                  {t.categories.title}
                </h2>
                <p className="text-gray-700 text-sm sm:text-base font-ibmarabic max-w-xl mx-auto">
                  {t.categories.subtitle}
                </p>
              </div>
            </Reveal>

            {/* Categories list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {t.categories.list.map((cat, idx) => {
                return (
                  <Reveal key={idx} delay={idx * 0.08}>
                    <motion.div
                      whileHover={{
                        scale: 1.03,
                        rotate: 1,
                        borderColor: "#F05123",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.08)"
                      }}
                      transition={{ type: "spring", stiffness: 260, damping: 22 }}
                      className="bg-white border border-[#ECECEA] hover:border-[#F05123] rounded-[10px] p-6 transition-all duration-300 group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-full"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-[10px] bg-[#F05123]/10 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-[#F05123]/15 transition-all duration-300">
                          {getLineIcon(`cat-${idx}`, "w-6 h-6 text-[#F05123]")}
                        </div>
                        <h3 className="text-lg font-bold text-[#0A0A0A] font-alexandria group-hover:text-[#F05123] transition-colors">
                          {cat.title}
                        </h3>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed font-ibmarabic">
                        {cat.desc}
                      </p>
                    </motion.div>
                  </Reveal>
                );
              })}
            </div>

          </div>
        </section>



        {/* 8. Pricing Section (قسم الأسعار) */}
        <section id="pricing" className="py-24 bg-[#F7F7F7] border-t border-[#F0F0EE] relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            
            {/* Header */}
            <Reveal>
              <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] font-alexandria leading-tight">
                  {lang === "ar" ? "أسعار بسيطة وواضحة" : "Simple and Clear Pricing"}
                </h2>
                <p className="text-gray-700 text-sm sm:text-base font-ibmarabic max-w-xl mx-auto leading-relaxed">
                  {lang === "ar" 
                    ? "ادفع بسهولة عبر كليك. ألغِ اشتراكك في أي وقت." 
                    : "Pay easily via CliQ. Cancel your subscription at any time."}
                </p>
              </div>
            </Reveal>

            {/* Three Pricing Cards */}
            <div className="flex md:grid md:grid-cols-3 gap-6 md:gap-8 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory pb-6 md:pb-0 scrollbar-none scroll-smooth -mx-4 px-4 md:mx-0 md:px-0">
              
              {/* Card 1: 1 Month */}
              <div className="snap-start min-w-[280px] xs:min-w-[320px] flex-shrink-0 md:min-w-0 w-full">
                <Reveal delay={0.05}>
                  <motion.div
                    whileHover={{ y: -6, boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
                    className="bg-white border border-[#ECECEA] rounded-[20px] p-8 flex flex-col justify-between h-full relative"
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-ibmarabic">
                          {lang === "ar" ? "جرّبها" : "Try it out"}
                        </span>
                        <h3 className="text-xl font-bold text-[#0A0A0A] font-alexandria">
                          {lang === "ar" ? "شهر واحد" : "1 Month"}
                        </h3>
                      </div>
                      
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-[#0A0A0A] font-alexandria">
                          {lang === "ar" ? "١ دينار" : "1 JOD"}
                        </span>
                        <span className="text-sm text-gray-500 font-ibmarabic">
                          / {lang === "ar" ? "شهرياً" : "month"}
                        </span>
                      </div>

                      <div className="border-t border-[#F0F0EE] pt-6">
                        <ul className="space-y-3.5 text-xs text-gray-600 font-ibmarabic">
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{lang === "ar" ? "مزايدة غير محدودة" : "Unlimited bidding"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{lang === "ar" ? "دخول فوري للمزادات المباشرة" : "Instant entry to live auctions"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{lang === "ar" ? "دعم فني عبر الواتساب" : "WhatsApp support"}</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-8">
                      <button
                        type="button"
                        onClick={onEnter}
                        className="block w-full text-center py-3.5 px-6 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#0A0A0A] font-bold text-sm font-ibmarabic transition-colors duration-200 cursor-pointer"
                      >
                        {lang === "ar" ? "اشترك الآن" : "Subscribe Now"}
                      </button>
                    </div>
                  </motion.div>
                </Reveal>
              </div>

              {/* Card 2: 6 Months (Featured, elevated middle card) */}
              <div className="snap-start min-w-[280px] xs:min-w-[320px] flex-shrink-0 md:min-w-0 w-full md:-translate-y-4">
                <Reveal delay={0.15}>
                  <motion.div
                    whileHover={{ y: -10, boxShadow: "0 20px 40px rgba(240,81,35,0.12)" }}
                    className="bg-white border-2 border-[#F05123] rounded-[20px] p-8 flex flex-col justify-between h-full relative shadow-[0_12px_40px_rgba(240,81,35,0.08)] overflow-hidden"
                  >
                    {/* Orange Badge */}
                    <div className="absolute top-0 right-0 bg-[#F05123] text-white text-[10px] font-black px-4 py-1.5 rounded-bl-lg font-ibmarabic uppercase tracking-wide">
                      {lang === "ar" ? "الأكثر شيوعاً" : "Most Popular"}
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#F05123] uppercase tracking-wider font-ibmarabic">
                            {lang === "ar" ? "وفّر ٣٣٪" : "Save 33%"}
                          </span>
                        </div>
                        <h3 className="text-2xl font-bold text-[#0A0A0A] font-alexandria flex items-center gap-2">
                          {lang === "ar" ? "٦ أشهر" : "6 Months"}
                        </h3>
                      </div>
                      
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-[#F05123] font-alexandria">
                          {lang === "ar" ? "٤ دنانير" : "4 JOD"}
                        </span>
                        <span className="text-sm text-gray-500 font-ibmarabic">
                          / {lang === "ar" ? "٦ أشهر" : "6 months"}
                        </span>
                      </div>

                      <div className="border-t border-[#F0F0EE] pt-6">
                        <ul className="space-y-3.5 text-xs text-gray-800 font-ibmarabic font-medium">
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-[#F05123] shrink-0" />
                            <span>{lang === "ar" ? "مزايدة غير محدودة" : "Unlimited bidding"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-[#F05123] shrink-0" />
                            <span>{lang === "ar" ? "دخول فوري للمزادات المباشرة" : "Instant entry to live auctions"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-[#F05123] shrink-0" />
                            <span>{lang === "ar" ? "دعم فني ذو أولوية" : "Priority WhatsApp support"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-[#F05123] shrink-0" />
                            <span>{lang === "ar" ? "توفير مستمر" : "Ongoing savings"}</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-8">
                      <button
                        type="button"
                        onClick={onEnter}
                        className="block w-full text-center py-3.5 px-6 rounded-xl bg-[#F05123] hover:bg-[#d44319] text-white font-bold text-sm font-ibmarabic transition-all duration-200 shadow-md shadow-[#F05123]/25 cursor-pointer"
                      >
                        {lang === "ar" ? "اشترك الآن" : "Subscribe Now"}
                      </button>
                    </div>
                  </motion.div>
                </Reveal>
              </div>

              {/* Card 3: 1 Year */}
              <div className="snap-start min-w-[280px] xs:min-w-[320px] flex-shrink-0 md:min-w-0 w-full">
                <Reveal delay={0.25}>
                  <motion.div
                    whileHover={{ y: -6, boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
                    className="bg-white border border-[#ECECEA] rounded-[20px] p-8 flex flex-col justify-between h-full relative"
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-ibmarabic">
                          {lang === "ar" ? "أفضل قيمة — وفّر ٤٢٪" : "Best Value — Save 42%"}
                        </span>
                        <h3 className="text-xl font-bold text-[#0A0A0A] font-alexandria">
                          {lang === "ar" ? "سنة كاملة" : "1 Year"}
                        </h3>
                      </div>
                      
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-[#0A0A0A] font-alexandria">
                          {lang === "ar" ? "٧ دنانير" : "7 JOD"}
                        </span>
                        <span className="text-sm text-gray-500 font-ibmarabic">
                          / {lang === "ar" ? "سنوياً" : "yearly"}
                        </span>
                      </div>

                      <div className="border-t border-[#F0F0EE] pt-6">
                        <ul className="space-y-3.5 text-xs text-gray-600 font-ibmarabic">
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{lang === "ar" ? "مزايدة غير محدودة" : "Unlimited bidding"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{lang === "ar" ? "دخول فوري للمزادات المباشرة" : "Instant entry to live auctions"}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{lang === "ar" ? "دعم فني ذو أولوية فائقة" : "VIP WhatsApp support"}</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="pt-8">
                      <button
                        type="button"
                        onClick={onEnter}
                        className="block w-full text-center py-3.5 px-6 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#0A0A0A] font-bold text-sm font-ibmarabic transition-colors duration-200 cursor-pointer"
                      >
                        {lang === "ar" ? "اشترك الآن" : "Subscribe Now"}
                      </button>
                    </div>
                  </motion.div>
                </Reveal>
              </div>

            </div>

            {/* Small Grey Line below cards */}
            <Reveal>
              <div className="text-center mt-8 text-xs text-gray-500 font-ibmarabic">
                {lang === "ar"
                  ? "مزايدة بلا حدود · الدفع عبر كليك · بدون رسوم خفية · + عمولة مشترٍ ٥٪ عند الفوز"
                  : "Unlimited bidding · Pay via CliQ · No hidden fees · +5% buyer's premium on wins"}
              </div>
            </Reveal>

            {/* Wide Sellers Banner under cards (Black with white text replacing any previous turquoise banner) */}
            <div className="mt-16">
              <Reveal>
                <div className="relative rounded-[24px] bg-[#0A0A0A] text-white p-8 md:p-12 overflow-hidden border border-white/5 shadow-2xl">
                  
                  {/* Decorative faint grid lines or blurred glow */}
                  <div className="absolute top-0 right-0 -translate-x-1/4 -translate-y-1/4 w-[200px] h-[200px] rounded-full bg-[#F05123]/10 blur-2xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 translate-x-1/4 translate-y-1/4 w-[150px] h-[150px] rounded-full bg-white/5 blur-2xl pointer-events-none" />

                  {/* Corner Badge - Orange Gradient */}
                  <div className="absolute top-4 right-4 md:top-6 md:right-6 bg-gradient-to-r from-[#FF6B35] to-[#D63E10] text-white text-[10px] md:text-xs font-bold px-3.5 py-1.5 rounded-full font-ibmarabic shadow-md border border-white/10">
                    {lang === "ar" ? "رسوم إدراج ٠ دينار — لفترة محدودة" : "Listing fee 0 JOD — Limited time"}
                  </div>

                  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 pt-8 lg:pt-0">
                    <div className="space-y-4 max-w-2xl">
                      <h3 className="text-xl md:text-2xl font-bold font-alexandria tracking-tight leading-tight">
                        {lang === "ar" ? "البائع يستلم ٩٥٪ — عمولة ٥٪ فقط" : "Sellers keep 95% — just 5% commission"}
                      </h3>
                      <p className="text-gray-400 text-xs md:text-sm leading-relaxed font-ibmarabic">
                        {lang === "ar" 
                          ? "بدون رسوم إدراج حالياً. لا رسوم إذا لم تُبع القطعة. عمولة ٥٪ فقط عندما تجد قطعتك مشتريها."
                          : "No listing fees right now. No fees if the item is not sold. Just 5% commission when your item finds a buyer."}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <motion.button
                        type="button"
                        onClick={() => { emitLandingEvent('seller_cta_clicked', { location: 'pricing' }); onEnter('upload'); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-block px-8 py-3.5 bg-white text-black hover:bg-gray-50 font-bold text-sm font-ibmarabic rounded-xl shadow-md transition-colors duration-200 text-center w-full lg:w-auto cursor-pointer"
                      >
                        {lang === "ar" ? "بيع معنا" : "Sell with Us"}
                      </motion.button>
                    </div>
                  </div>

                </div>
              </Reveal>
            </div>

          </div>
        </section>

        {/* 2.7 Section: Office Visit & Physical Inspection (زيارة مكاتبنا) */}
        <section id="office-visit" className="py-[96px] bg-[#0A0A0A] text-white relative overflow-hidden">
          {/* Subtle abstract glow in the background */}
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[400px] h-[400px] bg-[#F05123]/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] bg-[#F05123]/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] rounded-3xl p-8 md:p-12 border border-gray-800 shadow-xl relative overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                
                {/* Text Content Area */}
                <div className="lg:col-span-7 space-y-6">
                  <Reveal>
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#F05123]/20 text-[#F05123] text-xs font-bold font-ibmarabic border border-[#F05123]/30 mb-3">
                        <Building2 className="w-4 h-4" />
                        {lang === "ar" ? "زيارة مكاتبنا والفحص الميداني" : "Office Visit & Physical Inspection"}
                      </span>
                      <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white font-ibmarabic leading-tight">
                        {lang === "ar" ? "مش لازم تصدقنا بالكلام بس — تعال شوف بعينك." : "Don't just take our word for it — come see for yourself."}
                      </h2>
                    </div>
                  </Reveal>

                  <Reveal delay={0.1}>
                    <p className="text-gray-300 text-base sm:text-lg font-ibmarabic leading-relaxed">
                      {lang === "ar"
                        ? "كل منتج بنعرضه فحصناه فعلياً بمكاتبنا. زورنا، افحص، واسأل أي سؤال قبل ما تزايد."
                        : "Every product listed on our platform is physically inspected at our offices. Visit us to inspect, feel, and ask any questions before you make your bid."}
                    </p>
                  </Reveal>

                  <Reveal delay={0.2}>
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-start md:items-center gap-4">
                      <a
                        href="https://wa.me/962781444899"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-[#0A0A0A] hover:bg-gray-100 font-bold font-ibmarabic transition-all duration-300 hover:scale-105 shadow-md text-center"
                      >
                        <MapPin className="w-5 h-5 text-[#F05123]" />
                        {lang === "ar" ? "زور مكتبنا" : "Visit Our Office"}
                      </a>
                      
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 self-center">
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs text-gray-300 font-ibmarabic">
                          {lang === "ar" ? "مفتوحون الآن لاستقبالكم" : "We are open and welcoming visitors"}
                        </span>
                      </div>
                    </div>
                  </Reveal>
                </div>

                {/* Big Pin or Office Icon on the opposite side (Lg:col-span-5) */}
                <div className="lg:col-span-5 flex justify-center lg:justify-end">
                  <Reveal delay={0.3}>
                    <div className="relative group">
                      {/* Decorative glowing backdrops */}
                      <div className="absolute -inset-4 bg-gradient-to-tr from-[#F05123]/20 to-[#F05123]/20 rounded-full blur-2xl group-hover:opacity-100 transition duration-1000 opacity-70" />
                      
                      <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-[#1A1A1A] border border-gray-800 flex items-center justify-center shadow-2xl transition-all duration-500 group-hover:scale-110">
                        {/* MapPin & Building dynamic composition */}
                        <div className="absolute text-[#F05123] animate-bounce duration-1000">
                          <MapPin className="w-20 h-20 drop-shadow-[0_10px_15px_rgba(240,81,35,0.3)]" />
                        </div>
                        <div className="absolute text-white/10 pointer-events-none">
                          <Building2 className="w-32 h-32" />
                        </div>
                      </div>
                    </div>
                  </Reveal>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* Section FAQ (الأسئلة الشائعة) */}
        <section id="faq" className="py-20 bg-white border-t border-[#F0F0EE] relative overflow-hidden">
          
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            
            {/* Title & Header */}
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16 gap-4">
              <span className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#F05123]/10 text-[#F05123] text-xs font-bold font-ibmarabic border border-[#F05123]/20 ${lang === "en" ? "tracking-wide" : ""}`}>
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{t.faq.title}</span>
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] font-alexandria leading-tight">
                {t.faq.title}
              </h2>
              <p className="text-gray-700 text-sm sm:text-base font-ibmarabic max-w-xl mx-auto">
                {t.faq.subtitle}
              </p>
            </div>

            {/* Accordion List */}
            <div className="space-y-4">
              {t.faq.items.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div
                    key={idx}
                    className="bg-white border border-[#ECECEA] rounded-[16px] overflow-hidden transition-all duration-300 hover:border-[#F05123] shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
                  >
                    <button
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full text-start px-6 py-5 min-h-[44px] flex items-center justify-between gap-4 text-black focus:outline-none select-none cursor-pointer rounded-[12px]"
                    >
                      <span className="text-base sm:text-lg font-bold text-black font-alexandria leading-snug">
                        {faq.q}
                      </span>
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-[#FAFAFA] border border-[#ECECEA] flex items-center justify-center transition-colors">
                        <ChevronDown 
                          className={`w-4 h-4 text-[#F05123] transition-transform duration-300 ${
                            isOpen ? "rotate-180" : "rotate-0"
                          }`} 
                        />
                      </div>
                    </button>

                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="px-6 pb-6 text-gray-600 text-sm sm:text-base font-ibmarabic leading-relaxed border-t border-[#ECECEA] pt-5 space-y-3">
                        <p>{faq.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Direct support WhatsApp callout */}
            <div className="mt-12 p-6 rounded-[16px] bg-[#FAFAFA] border border-[#ECECEA] flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3.5 text-center sm:text-start">
                <div className="w-12 h-12 rounded-[12px] bg-[#F05123]/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-6 h-6 text-[#F05123]" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[#0A0A0A] font-alexandria">
                    {lang === "ar" ? "لم تجد إجابة لسؤالك؟" : "Didn't find your answer?"}
                  </h4>
                  <p className="text-xs text-gray-400 font-cairo">
                    {lang === "ar" 
                      ? "تواصل معنا مباشرة عبر الواتساب وسيجيبك فريق الدعم فوراً!"
                      : "Chat with us directly on WhatsApp and our support team will answer you instantly!"}
                  </p>
                </div>
              </div>
              
              <a
                href="https://wa.me/962781444899"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3 rounded-[12px] bg-[#25D366] hover:bg-[#20ba56] text-white font-bold text-sm shadow-lg shadow-[#25D366]/10 hover:shadow-[#25D366]/20 transition-all duration-300 hover:scale-[1.03] text-center font-cairo flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4 fill-white text-transparent" />
                <span>{lang === "ar" ? "محادثة واتساب مباشرة" : "Direct WhatsApp Chat"}</span>
              </a>
            </div>

          </div>
        </section>

        {/* 8. Section "الآن في الأردن" (We're Live — CTA & Updates Signup) */}
        <section id="coming-soon" className="py-24 bg-[#F7F7F7] border-t border-[#F0F0EE] relative overflow-hidden">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-12">

            {/* Title */}
            <div className="flex flex-col items-center gap-4 text-center">
              <span className={`inline-block px-3.5 py-1 rounded-full bg-[#F05123]/10 text-[#F05123] text-xs font-bold font-ibmarabic border border-[#F05123]/20 ${lang === "en" ? "tracking-wide" : ""}`}>
                {lang === "ar" ? "متاح الآن" : "NOW LIVE"}
              </span>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-[#0A0A0A] font-alexandria">
                {t.comingSoon.title}
              </h2>
              <p className="text-gray-700 text-sm sm:text-base font-ibmarabic max-w-lg mx-auto">
                {t.comingSoon.subtitle}
              </p>
              <motion.button
                type="button"
                onClick={() => { emitLandingEvent('browse_cta_clicked', { location: 'coming_soon' }); onEnter(); }}
                whileHover={{ scale: 1.02, filter: "brightness(1.08)" }}
                whileTap={{ scale: 0.97 }}
                className="mt-2 px-8 py-4 rounded-[8px] bg-[#F05123] hover:bg-[#D93E15] text-white font-bold text-base shadow-sm transition-all duration-300 text-center font-ibmarabic flex items-center justify-center gap-1.5 group cursor-pointer"
              >
                <span>{lang === "ar" ? "جرّب المزاد الحي الآن" : "Try the live auction now"}</span>
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1.5 rtl:group-hover:-translate-x-1.5">→</span>
              </motion.button>
            </div>

            {/* Form Box with Slide Reveal and active focus states */}
            <Reveal delay={0.25}>
              <div className="max-w-2xl mx-auto bg-white border border-[#ECECEA] rounded-[10px] p-6 sm:p-10 shadow-[0_12px_32px_rgba(0,0,0,0.08)] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-[#F05123] rounded-t-[10px]"></div>
                
                <h3 className="text-lg sm:text-xl font-bold text-[#0A0A0A] font-alexandria mb-6">
                  {t.comingSoon.formTitle}
                </h3>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  
                  {/* Full name input */}
                  <div className="text-start">
                    <label htmlFor="full-name" className="text-xs text-gray-600 font-ibmarabic mb-1 block">
                      {t.comingSoon.formName}
                    </label>
                    <motion.input
                      whileFocus={{ scale: 1.01, borderColor: "#F05123" }}
                      type="text"
                      id="full-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder={lang === "ar" ? "أدخل اسمك الكريم" : "Enter your full name"}
                      className="w-full bg-[#FAFAFA] border border-[#ECECEA] rounded-[10px] px-4 py-3 text-sm text-[#0A0A0A] placeholder-gray-400 focus:outline-none focus:border-[#F05123] focus:ring-1 focus:ring-[#F05123] transition duration-200"
                    />
                  </div>

                  {/* Contact phone/email input */}
                  <div className="text-start">
                    <label htmlFor="contact" className="text-xs text-gray-600 font-ibmarabic mb-1 block">
                      {t.comingSoon.formContact} <span className="text-red-500">*</span>
                    </label>
                    <motion.input
                      whileFocus={{ scale: 1.01, borderColor: "#F05123" }}
                      type="text"
                      id="contact"
                      value={formContact}
                      onChange={(e) => setFormContact(e.target.value)}
                      placeholder={lang === "ar" ? "example@email.com أو 0790000000" : "example@email.com or 0790000000"}
                      className="w-full bg-[#FAFAFA] border border-[#ECECEA] rounded-[10px] px-4 py-3 text-sm text-[#0A0A0A] placeholder-gray-400 focus:outline-none focus:border-[#F05123] focus:ring-1 focus:ring-[#F05123] transition duration-200"
                    />
                  </div>

                  {/* Error Box with AnimatePresence */}
                  <AnimatePresence>
                    {formError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-[10px] text-xs font-ibmarabic text-start"
                      >
                        {formError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Success Box with AnimatePresence */}
                  <AnimatePresence>
                    {formSuccess && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-green-50 border border-green-200 text-emerald-700 p-3.5 rounded-[10px] text-xs font-ibmarabic text-start flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#F05123]" />
                        <span>{t.comingSoon.formSuccess}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit button */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full py-4 rounded-[10px] bg-[#F05123] hover:bg-[#D93E15] text-white font-bold text-base shadow-sm transition-all duration-200 cursor-pointer font-ibmarabic"
                  >
                    {t.comingSoon.formSubmit}
                  </motion.button>

                </form>

                {/* Experimental notice */}
                <p className="text-[10px] text-gray-500 font-ibmarabic mt-5">
                  {t.comingSoon.experimentalNote}
                </p>

                {/* Dynamic local registered waitlist */}
                {waitlist.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-[#ECECEA] text-start">
                    <h4 className="text-xs font-bold text-[#0A0A0A] font-alexandria mb-3 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#F05123]" />
                      <span>{t.comingSoon.registeredTitle} ({waitlist.length})</span>
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[120px] overflow-y-auto pr-1">
                      {waitlist.map((member, idx) => (
                      <div key={idx} className="bg-[#FAFAFA] rounded-[10px] p-2.5 border border-[#ECECEA] flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-800 truncate max-w-[120px] font-ibmarabic">
                          {member.name}
                        </span>
                        <span className="font-mono text-gray-500">
                          {member.contact.length > 15 ? member.contact.slice(0, 15) + "..." : member.contact}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
            </Reveal>

          </div>
        </section>

        {/* Final CTA Section (الدعوة الأخيرة للتسجيل والتفاعل) */}
        <section className="py-24 bg-[#0A0A0A] relative overflow-hidden">
          {/* Main Container */}
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#FF6B35] to-[#D63E10] px-6 py-16 sm:px-12 sm:py-20 md:p-20 shadow-2xl">
              
              {/* Decorative visual elements for visual depth */}
              <div className="absolute top-0 left-0 -translate-x-1/3 -translate-y-1/3 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] rounded-full bg-black/20 blur-2xl pointer-events-none" />
              <div className="absolute top-1/2 right-10 -translate-y-1/2 w-24 h-24 border border-white/15 rounded-full pointer-events-none hidden md:block" />
              <div className="absolute bottom-10 left-12 w-16 h-16 border-2 border-white/10 rounded-xl rotate-45 pointer-events-none hidden md:block" />

              <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
                <Reveal>
                  <h2 className="text-4xl md:text-5xl font-bold text-white font-alexandria leading-tight">
                    {lang === "ar" ? "جاهز تبيع بسرعة أو تشتري بأمان؟" : "Ready to sell quickly or buy safely?"}
                  </h2>
                </Reveal>

                <Reveal delay={0.15}>
                  <p className="text-white/90 text-sm sm:text-lg font-ibmarabic max-w-xl mx-auto leading-relaxed">
                    {lang === "ar"
                      ? "انضم اليوم واستفد من فترة بدون رسوم عرض — البائع يستلم ٩٥٪ وعمولتنا ٥٪ فقط عند البيع الفعلي، + عمولة مشترٍ ٥٪ عند الفوز."
                      : "Join today and take advantage of a listing fee-free period — sellers keep 95% with just 5% commission on actual sales, +5% buyer's premium on wins."}
                  </p>
                </Reveal>

                <Reveal delay={0.3}>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <motion.button
                      type="button"
                      onClick={() => { emitLandingEvent('browse_cta_clicked', { location: 'final' }); onEnter(); }}
                      whileHover={{ scale: 1.05, boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-[#D63E10] hover:bg-gray-50 font-bold font-ibmarabic text-base transition-colors duration-200 text-center shadow-lg cursor-pointer"
                    >
                      {lang === "ar" ? "ابدأ البيع الآن" : "Start Selling Now"}
                    </motion.button>
                    
                    <motion.a
                      whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                      whileTap={{ scale: 0.98 }}
                      href="#live-experience"
                      className="w-full sm:w-auto px-8 py-4 rounded-full border-2 border-white bg-transparent text-white font-bold font-ibmarabic text-base transition-colors duration-200 text-center"
                    >
                      {lang === "ar" ? "تصفح المزادات" : "Browse Auctions"}
                    </motion.a>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* 9. Footer (الفوتر) */}
      <footer className="bg-[#F7F7F7] border-t border-[#F0F0EE] py-12 relative z-10 text-[#0A0A0A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center pb-8 border-b border-[#F0F0EE]">
            
            {/* Logo and Tagline Column */}
            <div className="md:col-span-5 space-y-4 text-center md:text-start">
              <div className="flex items-center justify-center md:justify-start">
                <Logo className="h-8" iconClassName="h-8 w-8" textClassName="text-xl font-black text-[#0A0A0A] font-sans" />
              </div>
              <p className="text-xs text-gray-600 font-ibmarabic leading-relaxed max-w-sm">
                {t.footer.desc}
              </p>
            </div>

            {/* Quick Links Column */}
            <div className="md:col-span-7 flex flex-wrap items-center justify-center md:justify-end gap-6 text-xs font-semibold text-gray-600">
              <a href="#why-mazadjo" className="hover:text-[#F05123] transition-colors duration-200 font-ibmarabic">
                {t.footer.links.whyUs}
              </a>
              <a href="#categories" className="hover:text-[#F05123] transition-colors duration-200 font-ibmarabic">
                {t.footer.links.categories}
              </a>
              <a href="#pricing" className="hover:text-[#F05123] transition-colors duration-200 font-ibmarabic">
                {t.nav.pricing}
              </a>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#F05123] transition-colors duration-200 font-ibmarabic font-semibold">
                {t.footer.links.contact}
              </a>
              <button
                type="button"
                onClick={() => setIsTermsOpen(true)}
                className="hover:text-[#F05123] transition-colors duration-200 font-ibmarabic cursor-pointer bg-transparent border-none p-0 text-xs font-semibold text-gray-600"
              >
                {lang === "ar" ? "شروط الاستخدام" : "Terms of Use"}
              </button>
              <button
                type="button"
                onClick={() => setIsTermsOpen(true)}
                className="hover:text-[#F05123] transition-colors duration-200 font-ibmarabic cursor-pointer bg-transparent border-none p-0 text-xs font-semibold text-gray-600"
              >
                {lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
              </button>
            </div>

          </div>

          {/* Company / Contact Info */}
          <div className="pt-6 flex flex-col items-center justify-center gap-2.5 text-center text-xs text-gray-500 font-ibmarabic">
            <span className="flex items-center gap-1.5 max-w-md">
              <MapPin className="w-3.5 h-3.5 text-[#F05123] shrink-0" />
              <span>
                {lang === "ar"
                  ? "عمّان — شارع المدينة المنورة — مجمع سعد ٤ — مقابل حبيبة"
                  : "Amman — Al-Madina Al-Munawara St — Saad 4 Complex — Opposite Habiba"}
              </span>
            </span>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5">
              <a href="tel:+962781444899" className="flex items-center gap-1.5 hover:text-[#F05123] transition-colors duration-200">
                <span>{lang === "ar" ? "خدمة العملاء:" : "Customer Service:"}</span>
                <span className="font-mono" dir="ltr">+962 78 144 4899</span>
              </a>
              <a href="tel:+962785446498" className="flex items-center gap-1.5 hover:text-[#F05123] transition-colors duration-200">
                <span>{lang === "ar" ? "المزادات والدفع:" : "Auctions & Payment:"}</span>
                <span className="font-mono" dir="ltr">+962 78 544 6498</span>
              </a>
            </div>
            <span className="text-[11px] text-gray-400">
              {lang === "ar"
                ? "ساعات العمل: ١٠ صباحاً – ٧ مساءً · السبت إلى الخميس"
                : "Working hours: 10 AM – 7 PM · Saturday to Thursday"}
            </span>
          </div>

          {/* Registered company identity (compliance / ads trust signal) */}
          <div className="pt-4 text-center text-[11px] leading-relaxed text-gray-400 font-ibmarabic">
            <span>
              {lang === "ar"
                ? "الهاني للوساطة التجارية (Al Hani Commercial Brokerage) · سجل تجاري 200213982 · عمّان، الأردن"
                : "Al Hani Commercial Brokerage (الهاني للوساطة التجارية) · Commercial Reg. 200213982 · Amman, Jordan"}
            </span>
          </div>

          {/* Copyrights and Jordan Badge */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center">
            <p className="text-xs text-gray-500 font-ibmarabic">
              {t.footer.rights}
            </p>

            {/* Tiny secure seal */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#ECECEA] text-[10px] text-gray-600 font-ibmarabic shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Lock className="w-3 h-3 text-[#F05123]" />
              <span>{lang === "ar" ? "مزادات تعمل في الأردن" : "Auctions operating in Jordan"}</span>
            </div>
          </div>

        </div>
      </footer>

      {/* Mobile Sticky CTA Bar */}
      <AnimatePresence>
        {showStickyBar && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[#ECECEA] p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:hidden flex items-center justify-between gap-3"
          >
            <button
              onClick={() => {
                handleUserBid();
                document.getElementById("live-experience")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex-1 py-4 min-h-[52px] flex items-center justify-center rounded-[12px] bg-gradient-to-br from-[#FF6B35] via-[#F05123] to-[#D63E10] text-white font-bold text-sm shadow-sm active:scale-95 transition-all duration-300 font-ibmarabic"
            >
              <span>{lang === "ar" ? "ابدأ المزايدة — 1 دينار" : "Start Bidding — 1 JOD"}</span>
            </button>
            <button
              type="button"
              onClick={() => { emitLandingEvent('seller_cta_clicked', { location: 'sticky' }); onEnter('upload'); }}
              className="flex-1 py-4 min-h-[52px] flex items-center justify-center rounded-[12px] bg-white border-2 border-[#0A0A0A] text-[#0A0A0A] font-bold text-sm transition-all duration-300 active:scale-95 text-center font-ibmarabic cursor-pointer"
            >
              <span>{lang === "ar" ? "بيع قطعتك" : "Sell Your Item"}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terms of Use & Privacy Policy modal (opened from the footer) */}
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />

    </div>
  );
}
