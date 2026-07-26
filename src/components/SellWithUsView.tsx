import React from 'react';
import { useApp } from '../context/AppContext';
import { MessageCircle, ShieldCheck } from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/962781444899';

export const SellWithUsView: React.FC = () => {
  const { language } = useApp();
  const isAr = language === 'ar';

  return (
    <div className="min-h-full flex-grow flex items-center justify-center p-6 font-sans bg-[#F7F6F3]" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-md w-full bg-white border border-gray-200/80 rounded-3xl shadow-sm p-8 text-center space-y-5 animate-in fade-in duration-300">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-[#FF6B00]" />
        </div>

        <h1 className="text-xl font-black text-gray-950">
          {isAr ? 'بيع معنا 🤝' : 'Sell with us 🤝'}
        </h1>

        <p className="text-sm text-gray-500 font-medium leading-relaxed">
          {isAr
            ? 'فريقنا بساعدك تجهّز منتجك وتعرضه — تواصل معنا على واتساب ونرتب لك كل شي.'
            : "Our team helps you prepare and list your product — message us on WhatsApp and we'll handle everything."}
        </p>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-sm rounded-2xl transition-all shadow-xs active:scale-95 cursor-pointer"
        >
          <MessageCircle className="w-4.5 h-4.5" />
          {isAr ? 'تواصل معنا على واتساب' : 'Message us on WhatsApp'}
        </a>
      </div>
    </div>
  );
};
