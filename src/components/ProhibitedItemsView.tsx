import React from 'react';
import { useApp } from '../context/AppContext';
import { motion } from 'motion/react';
import {
  Ban,
  ShieldAlert,
  Landmark,
  Pill,
  Copyright,
  AlertTriangle,
  Bird,
  Wine,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';

/**
 * Wave 4 (seller-KYC groundwork) — prohibited-items policy page.
 * Content-only bilingual list of goods that are forbidden or regulated in
 * Jordan and therefore not allowed on Mazad JO. Routed as activeView
 * 'prohibited-items'; linked from the Sell chooser and How-It-Works.
 * Styling mirrors HowItWorksView (same warm card language).
 */

const easeOut = { duration: 0.3, ease: 'easeOut' as const };

interface ProhibitedDef {
  icon: React.ReactNode;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}

const PROHIBITED: ProhibitedDef[] = [
  {
    icon: <ShieldAlert className="w-5 h-5" />,
    titleAr: 'الأسلحة والذخيرة',
    titleEn: 'Weapons & ammunition',
    bodyAr: 'الأسلحة النارية والذخيرة والمتفجرات والأسلحة البيضاء الهجومية — ممنوعة كلياً على مزاد جو.',
    bodyEn: 'Firearms, ammunition, explosives, and offensive bladed weapons — completely banned on Mazad JO.',
  },
  {
    icon: <Landmark className="w-5 h-5" />,
    titleAr: 'الآثار والعملات الأثرية',
    titleEn: 'Antiquities & ancient currency',
    bodyAr: 'القطع الأثرية والعملات القديمة المحمية قانونياً — بيعها والاتجار بها مخالف لقانون الآثار الأردني.',
    bodyEn: 'Archaeological artifacts and legally protected ancient coins — trading them violates Jordanian antiquities law.',
  },
  {
    icon: <Pill className="w-5 h-5" />,
    titleAr: 'الأدوية والمواد الخاضعة للرقابة',
    titleEn: 'Medications & controlled substances',
    bodyAr: 'الأدوية بوصفة أو بدون، المكملات غير المرخصة، وأي مواد مخدرة أو خاضعة للرقابة.',
    bodyEn: 'Prescription or over-the-counter medications, unlicensed supplements, and any narcotic or controlled substances.',
  },
  {
    icon: <Copyright className="w-5 h-5" />,
    titleAr: 'المنتجات المقلدة',
    titleEn: 'Counterfeit goods',
    bodyAr: 'التقليد والنسخ غير الأصلية (ساعات، شنط، إلكترونيات...) — كل غرض لازم يكون أصلي وموصوف بصدق.',
    bodyEn: 'Fakes and replicas (watches, bags, electronics...) — every item must be genuine and honestly described.',
  },
  {
    icon: <AlertTriangle className="w-5 h-5" />,
    titleAr: 'الأغراض المسروقة أو مجهولة المصدر',
    titleEn: 'Stolen goods or items of unknown origin',
    bodyAr: 'أي غرض مسروق أو ما بتقدر تثبت ملكيتك له — الإقرار بالملكية شرط لكل إعلان.',
    bodyEn: 'Anything stolen or that you cannot prove you own — the ownership attestation is required on every listing.',
  },
  {
    icon: <Bird className="w-5 h-5" />,
    titleAr: 'الحياة البرية والعاج',
    titleEn: 'Wildlife & ivory',
    bodyAr: 'الحيوانات البرية المحمية ومنتجاتها (عاج، فراء، جلود، طيور جارحة...) المشمولة بالحماية.',
    bodyEn: 'Protected wild animals and their products (ivory, fur, hides, birds of prey...) covered by conservation rules.',
  },
  {
    icon: <Wine className="w-5 h-5" />,
    titleAr: 'الكحول والتبغ',
    titleEn: 'Alcohol & tobacco',
    bodyAr: 'المشروبات الكحولية ومنتجات التبغ والسجائر الإلكترونية — بيعها مرخّص ومنظّم، وما منستضيفها على المنصة.',
    bodyEn: 'Alcoholic beverages, tobacco products, and vapes — their sale is licensed and regulated locally, and we do not host them on the platform.',
  },
  {
    icon: <EyeOff className="w-5 h-5" />,
    titleAr: 'المحتوى المخصص للبالغين',
    titleEn: 'Adult content',
    bodyAr: 'أي مواد أو منتجات مخصصة للبالغين — ما إلها مكان على مزاد جو.',
    bodyEn: 'Any adult materials or products — they have no place on Mazad JO.',
  },
];

export const ProhibitedItemsView: React.FC = () => {
  const { language } = useApp();
  const isAr = language === 'ar';

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="prohibited-items-root"
    >
      <div className="w-full max-w-2xl mx-auto px-4 py-8 lg:py-4 space-y-8 pb-16">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={easeOut}
          className="text-center space-y-4 pt-2"
          id="prohibited-items-hero"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white mx-auto shadow-md shadow-rose-500/20">
            <Ban className="w-6 h-6" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-950 tracking-tight">
            {isAr ? 'الأغراض الممنوعة على مزاد جو' : 'Prohibited items on Mazad JO'}
          </h1>
          <p className="text-xs lg:text-sm text-fg-muted font-medium max-w-md mx-auto leading-relaxed">
            {isAr
              ? 'هاي الأغراض ممنوع إدراجها على المنصة — لأنها ممنوعة أو منظّمة قانونياً في الأردن. كل إعلان بيمر بمراجعة فريقنا، وأي غرض منها بينرفض فوراً.'
              : 'These items are not allowed on the platform — they are forbidden or legally regulated in Jordan. Every listing is reviewed by our team, and any of these is rejected immediately.'}
          </p>
        </motion.div>

        {/* Prohibited list */}
        <div className="space-y-3" id="prohibited-items-list">
          {PROHIBITED.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeOut, delay: 0.08 + i * 0.05 }}
              className="bg-surface-raised border border-line/70 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-black text-gray-950 tracking-tight">
                  {isAr ? item.titleAr : item.titleEn}
                </h3>
                <p className="text-xs text-fg-muted font-medium leading-relaxed">
                  {isAr ? item.bodyAr : item.bodyEn}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Closing trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...easeOut, delay: 0.5 }}
          className="flex items-start gap-2.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3.5"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-800 font-semibold leading-relaxed">
            {isAr
              ? 'مش متأكد من غرضك؟ ابعثه عادي — فريقنا بيراجع كل إعلان قبل ما ينزل، وبيتواصل معك إذا في أي ملاحظة.'
              : 'Not sure about your item? Submit it anyway — our team reviews every listing before it goes live and will reach out if anything needs clarifying.'}
          </p>
        </motion.div>

      </div>
    </div>
  );
};
