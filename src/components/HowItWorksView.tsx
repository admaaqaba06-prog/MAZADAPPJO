import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import AuctionRulesModal from './AuctionRulesModal';
import {
  UserPlus,
  Gavel,
  Trophy,
  Package,
  Store,
  ChevronDown,
  ShieldCheck,
  HelpCircle,
  Ban,
  ScrollText,
} from 'lucide-react';

/**
 * The single "understand everything" page (spec §3): the full Mazad JO loop —
 * join → browse & bid free → win & pay → get it → sell with us — plus an
 * honest FAQ. Routed as activeView 'about' (nav links already point here).
 *
 * Accuracy contract (must stay true to reality):
 * - Membership tiers: 1 JD/mo, 4 JD/6mo, 7 JD/yr — lead "from 1 JD/month".
 * - Fees: 5% buyer's premium on win + 5% seller commission.
 * - Payment: CliQ to Mazad JO (Arab Bank) within 24h of winning.
 * - Delivery: pickup or paid delivery (~2–4 JD), Mazad arranges.
 * - Sell: submit (self-serve or concierge) → Mazad reviews & approves → live → 5%.
 */

const easeOut = { duration: 0.3, ease: 'easeOut' as const };

interface StepDef {
  icon: React.ReactNode;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}

const STEPS: StepDef[] = [
  {
    icon: <UserPlus className="w-5 h-5" />,
    titleAr: 'انضم',
    titleEn: 'Join',
    bodyAr: 'عضوية شهرية تبدأ من ١ دينار (١ دينار/شهر، ٤ دنانير/٦ شهور، ٧ دنانير/سنة) — الدفع عبر كليك.',
    bodyEn: 'Monthly membership from 1 JD (1 JD/mo, 4 JD/6mo, 7 JD/yr) — paid via CliQ.',
  },
  {
    icon: <Gavel className="w-5 h-5" />,
    titleAr: 'تصفّح وزايد مجاناً',
    titleEn: 'Browse & bid free',
    bodyAr: 'المشاهدة والمزايدة مجانية بالكامل — ما بتدفع إلا إذا فزت.',
    bodyEn: 'Watching and bidding are completely free — you only pay if you win.',
  },
  {
    icon: <Trophy className="w-5 h-5" />,
    titleAr: 'اربح وادفع',
    titleEn: 'Win & pay',
    bodyAr: 'سعر الفوز + عمولة مشتري ٥٪ — عبر كليك إلى حساب مزاد جو (البنك العربي) خلال ٢٤ ساعة.',
    bodyEn: "Winning price + 5% buyer's premium — via CliQ to Mazad JO (Arab Bank) within 24 hours.",
  },
  {
    icon: <Package className="w-5 h-5" />,
    titleAr: 'استلم',
    titleEn: 'Get it',
    bodyAr: 'استلام من موقعنا أو توصيل بأجرة بسيطة (٢–٤ دنانير تقريباً) — إحنا منرتّب كل شي.',
    bodyEn: 'Pick up from our location or paid delivery (~2–4 JD) — we arrange everything.',
  },
  {
    icon: <Store className="w-5 h-5" />,
    titleAr: 'بيع معنا',
    titleEn: 'Sell with us',
    bodyAr: 'ابعت تفاصيل المنتج (أو خلينا ندرجه لك) ← فريقنا بيراجع ويوافق ← ينزل للمزاد ← عمولة بائع ٥٪ عند البيع.',
    bodyEn: 'Send your item details (or let us list it for you) → our team reviews & approves → it goes live → 5% seller commission on sale.',
  },
];

interface FaqDef {
  qAr: string;
  qEn: string;
  aAr: string;
  aEn: string;
}

const FAQS: FaqDef[] = [
  {
    qAr: 'ليش في عضوية إذا في عمولة؟',
    qEn: 'Why a membership if there is a commission?',
    aAr: 'العضوية رمزية (من ١ دينار بالشهر) وهدفها جدية المزايدين — غرفة مزايدة نظيفة بدون مزايدات وهمية. المزايدة نفسها مجانية، والعمولة (٥٪) بتنطبق فقط عند إتمام صفقة فعلية.',
    aEn: 'Membership is symbolic (from 1 JD/month) — it keeps the bidding room serious and free of fake bids. Bidding itself is free, and the 5% commission only applies when a real deal closes.',
  },
  {
    qAr: 'شو بصير إذا خسرت المزاد؟',
    qEn: 'What happens if I lose an auction?',
    aAr: 'ولا شي — ما بتدفع أي مبلغ. بتضل عضويتك فعّالة وبتقدر تزايد على أي مزاد ثاني مجاناً.',
    aEn: 'Nothing — you pay nothing. Your membership stays active and you can bid on any other auction for free.',
  },
  {
    qAr: 'كيف بتأكدوا إني رح أستلم غرضي؟',
    qEn: 'How do I know I will actually get my item?',
    aAr: 'دفعتك بتروح عبر كليك إلى حساب مزاد جو في البنك العربي — مش للبائع مباشرة. كل إعلان بيمر بمراجعة فريقنا قبل ما ينزل، وإحنا اللي منرتّب الاستلام أو التوصيل. حمايتك جزء من الصفقة.',
    aEn: "Your payment goes via CliQ to Mazad JO's Arab Bank account — not directly to the seller. Every listing is reviewed by our team before going live, and we arrange the pickup or delivery ourselves. Buyer protection is built into the deal.",
  },
  {
    qAr: 'كيف أبيع معكم؟',
    qEn: 'How do I sell with you?',
    aAr: 'ابعت تفاصيل منتجك وصوره من صفحة "بيع" — أو خلينا ندرجه عنك. فريقنا بيراجع ويوافق، وبعدها ينزل للمزاد. عند البيع في عمولة بائع ٥٪ فقط.',
    aEn: 'Submit your item details and photos from the "Sell" page — or let us list it for you. Our team reviews and approves, then it goes live. On sale, there is only a 5% seller commission.',
  },
  {
    qAr: 'شو طرق الدفع؟',
    qEn: 'What are the payment methods?',
    aAr: 'كليك (CliQ) إلى حساب مزاد جو في البنك العربي — للعضوية وللدفع بعد الفوز (خلال ٢٤ ساعة من الفوز).',
    aEn: "CliQ to Mazad JO's Arab Bank account — for membership and for paying after a win (within 24 hours of winning).",
  },
];

export const HowItWorksView: React.FC = () => {
  const { language, currentUser, setActiveView } = useApp();
  const isAr = language === 'ar';
  const isMember = currentUser?.subscriptionStatus === 'active';
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false); // E4 — Auction Rules modal

  const PrimaryCta = ({ id }: { id: string }) => (
    <button
      onClick={() => setActiveView(isMember ? 'discovery' : 'wallet')}
      className="px-6 py-3 bg-[#E85D04] hover:bg-orange-600 text-white font-extrabold text-sm rounded-2xl transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
      id={id}
    >
      {isMember
        ? (isAr ? 'تصفّح المزادات' : 'Browse auctions')
        : (isAr ? 'انضم من ١ دينار' : 'Join from 1 JD')}
    </button>
  );

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-surface font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="how-it-works-root"
    >
      <div className="w-full max-w-2xl mx-auto px-4 py-8 lg:py-4 space-y-8 pb-[calc(6rem+env(safe-area-inset-bottom))]">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={easeOut}
          className="text-center space-y-4 pt-2"
          id="how-it-works-hero"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#E85D04] flex items-center justify-center text-white mx-auto shadow-md shadow-orange-500/20">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-fg tracking-tight">
            {isAr ? 'كيف يعمل مزاد جو؟' : 'How Mazad JO works'}
          </h1>
          <p className="text-xs lg:text-sm text-fg-muted font-medium max-w-md mx-auto leading-relaxed">
            {isAr
              ? 'مزادات مباشرة في الأردن — انضم، زايد مجاناً، وادفع فقط إذا فزت.'
              : 'Live auctions in Jordan — join, bid free, and pay only if you win.'}
          </p>
          <PrimaryCta id="how-it-works-cta-top" />
        </motion.div>

        {/* The 5-step loop */}
        <div className="space-y-3" id="how-it-works-steps">
          {STEPS.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeOut, delay: 0.08 + i * 0.06 }}
              className="bg-surface-raised border border-line/70 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 text-[#E85D04] flex items-center justify-center shrink-0">
                {step.icon}
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-black text-fg tracking-tight flex items-center gap-2">
                  <span className="text-[#E85D04] font-black text-xs">
                    {isAr ? ['١', '٢', '٣', '٤', '٥'][i] : i + 1}
                  </span>
                  {isAr ? step.titleAr : step.titleEn}
                </h3>
                <p className="text-xs text-fg-muted font-medium leading-relaxed">
                  {isAr ? step.bodyAr : step.bodyEn}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...easeOut, delay: 0.4 }}
          className="flex items-start gap-2.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3.5"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-800 font-semibold leading-relaxed">
            {isAr
              ? 'كل المدفوعات عبر كليك إلى حساب مزاد جو في البنك العربي — مش للبائع مباشرة.'
              : "All payments go via CliQ to Mazad JO's Arab Bank account — never directly to the seller."}
          </p>
        </motion.div>

        {/* Prohibited-items policy link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...easeOut, delay: 0.42 }}
          className="text-center"
        >
          <button
            type="button"
            onClick={() => setActiveView('prohibited-items')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted hover:text-rose-600 transition-colors cursor-pointer"
            id="how-it-works-prohibited-items-link"
          >
            <Ban className="w-3.5 h-3.5" />
            {isAr ? 'شو الأغراض الممنوع بيعها على مزاد جو؟' : 'What items are prohibited on Mazad JO?'}
          </button>
        </motion.div>

        {/* E4 — full auction rules entry point */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...easeOut, delay: 0.43 }}
          className="text-center"
        >
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E85D04] hover:text-orange-600 transition-colors cursor-pointer"
            id="how-it-works-auction-rules-link"
          >
            <ScrollText className="w-3.5 h-3.5" />
            {isAr ? 'اقرأ قواعد المزاد كاملة' : 'Read the full auction rules'}
          </button>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeOut, delay: 0.45 }}
          className="space-y-3"
          id="how-it-works-faq"
        >
          <h2 className="text-sm font-black text-fg uppercase tracking-wide px-1">
            {isAr ? 'أسئلة شائعة' : 'Common questions'}
          </h2>
          <div className="bg-surface-raised border border-line/70 rounded-2xl divide-y divide-line shadow-xs overflow-hidden">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-start cursor-pointer hover:bg-surface-sunken/60 transition-colors"
                    aria-expanded={isOpen}
                    id={`faq-toggle-${i}`}
                  >
                    <span className="text-xs font-extrabold text-fg leading-snug">
                      {isAr ? faq.qAr : faq.qEn}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className="shrink-0 text-fg-muted"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <p className="px-4 pb-4 text-xs text-fg-muted font-medium leading-relaxed">
                          {isAr ? faq.aAr : faq.aEn}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeOut, delay: 0.5 }}
          className="text-center space-y-3 pt-2"
        >
          <p className="text-xs text-fg-muted font-medium">
            {isAr ? 'جاهز تجرب؟ المزايدة مجانية.' : 'Ready to try? Bidding is free.'}
          </p>
          <PrimaryCta id="how-it-works-cta-bottom" />
        </motion.div>

      </div>

      <AuctionRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} isAr={isAr} />
    </div>
  );
};
