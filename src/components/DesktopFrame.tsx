import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import TermsModal from './TermsModal';

const AdminPanel = lazy(() => import('./AdminPanel'));
import { 
  Wallet as WalletIcon, 
  User,
  TrendingUp, 
  Tv, 
  ShieldAlert, 
  PlusCircle, 
  Activity, 
  Clock, 
  ShieldCheck, 
  Coins,
  Globe,
  LogOut,
  HelpCircle,
  Search,
  Bell
} from 'lucide-react';

interface DesktopFrameProps {
  children: React.ReactNode;
}

export const DesktopFrame: React.FC<DesktopFrameProps> = ({ children }) => {
  const { 
    currentUser, 
    activeView, 
    setActiveView, 
    auctions,
    isSimulating,
    setIsSimulating,
    language,
    setLanguage,
    logout,
    setActiveAuctionId
  } = useApp();

  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const t = translations[language];
  const isAr = language === 'ar';

  const liveAuctions = auctions.filter(a => a.status === 'live');

  const handleAuctionClick = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  return (
    <div 
      className="w-full h-screen overflow-hidden text-gray-900 font-sans selection:bg-[#FF6B00]/20"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="desktop-frame-root"
    >
      {/* ======================================================================
          1. MOBILE EMULATOR LAYOUT (Presented on screens below 1024px / lg)
          ====================================================================== */}
      <div 
        className="lg:hidden h-[100dvh] max-h-[100dvh] w-full bg-white flex flex-col overflow-hidden"
        id="mobile-layout-root"
      >
        {/* Main Application active view fills standard mobile viewport exactly */}
        <div className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
          {children}
        </div>

        {/* Global Bottom Navigation bar strictly at foot of phone screens */}
        {activeView !== 'live' && (
          <nav 
            className="bg-white border-t border-gray-200/80 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 px-6 flex items-center justify-between text-[11px] font-bold tracking-wider text-gray-500 select-none h-16 shrink-0 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]"
            id="mobile-nav-bar"
          >
            <button 
              onClick={() => setActiveView('discovery')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'discovery' ? 'text-[#FF6B00]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <Tv className="w-5 h-5" />
              <span className="text-[9px] font-bold tracking-normal">{t.navDiscover}</span>
            </button>
            <button 
              onClick={() => setActiveView('wallet')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'wallet' ? 'text-[#FF6B00]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[9px] font-bold tracking-normal">{t.navWallet}</span>
            </button>
            <button 
              onClick={() => setActiveView('upload')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'upload' ? 'text-[#FF6B00]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <PlusCircle className="w-5 h-5" />
              <span className="text-[9px] font-bold tracking-normal">{t.navAddListing}</span>
            </button>
            {currentUser && currentUser.role === 'admin' && (
              <button 
                onClick={() => {
                  setActiveView('admin');
                  setIsSimulating(true);
                }}
                className={`flex flex-col items-center gap-1 transition-all ${activeView === 'admin' ? 'text-black font-black' : 'text-gray-400 hover:text-gray-700'}`}
              >
                <ShieldAlert className="w-5 h-5 text-orange-500" />
                <span className="text-[9px] font-bold tracking-normal">{t.navAdmin}</span>
              </button>
            )}
          </nav>
        )}
      </div>

      {/* ======================================================================
          2. WHATNOT DESKTOP LAYOUT (Presented strictly on screens lg and above)
          ====================================================================== */}
      <div className="hidden lg:flex flex-col h-screen overflow-hidden bg-white">
        
        {/* UPPER NAVBAR */}
        <header className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-200 bg-white">
          {/* Left Area: Circle Logo and MAZAD JO */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer selection:bg-transparent"
            onClick={() => setActiveView('discovery')}
          >
            <div className="w-9 h-9 rounded-full bg-[#FF6B00] flex items-center justify-center font-black text-white text-base">
              M
            </div>
            <span className="text-base font-extrabold tracking-tight text-gray-900">
              MAZAD JO
            </span>
          </div>

          {/* Center Area: Home, Browse and Search */}
          <div className="flex items-center gap-5">
            <button 
              onClick={() => setActiveView('discovery')}
              className="px-5 py-2 rounded-full bg-[#FF6B00] text-white text-sm font-semibold tracking-wide hover:opacity-95 transition-opacity"
            >
              {isAr ? 'الرئيسية' : 'Home'}
            </button>
            <button 
              onClick={() => setActiveView('discovery')}
              className="text-gray-600 hover:text-black text-sm font-medium transition-colors"
            >
              {isAr ? 'تصفح' : 'Browse'}
            </button>
            <div className="relative w-72">
              <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                placeholder={isAr ? 'ابحث عن مزادات...' : 'Search auctions...'}
                className="w-full pl-10 pr-4 py-1.5 bg-gray-100 rounded-full text-xs text-gray-800 placeholder-gray-500 border border-transparent focus:bg-white focus:border-gray-200 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Right Area: Language Switcher, Become small-seller CTA, alert notifications and Avatar */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-gray-400" />
              <span>{language === 'en' ? 'العربية' : 'English'}</span>
            </button>

            <button className="px-5 py-2 border border-gray-200 hover:border-gray-300 rounded-full text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all">
              {isAr ? 'كن بائعاً' : 'Become a Seller'}
            </button>

            <button className="p-2 text-gray-400 hover:text-[#FF6B00] transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
            </button>

            <div className="relative group">
              <img 
                src={currentUser.avatar} 
                alt={currentUser.name} 
                className="w-8 h-8 rounded-full object-cover border border-gray-200 hover:brightness-95 transition-all select-none"
              />
              <div className="absolute right-0 top-10 w-48 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5 hidden group-hover:block z-50">
                <div className="text-xs font-bold text-gray-800 px-2 py-1 select-none border-b border-gray-100 pb-1.5 mb-1.5 truncate">
                  {currentUser.email}
                </div>
                <button 
                  onClick={() => setIsTermsOpen(true)}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >
                  {isAr ? 'الشروط والأحكام' : 'Terms & Conditions'}
                </button>
                <button 
                  onClick={logout}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-red-500 hover:bg-red-50 rounded-lg font-medium transition-colors mt-1 block"
                >
                  {isAr ? 'تسجيل الخروج' : 'Log Out'}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN BODY LAYOUT */}
        <div className="flex flex-1 min-h-0 w-full">
          
          {/* LEFT SIDEBAR NAVBAR */}
          <div className="w-[220px] bg-white border-r border-gray-200 flex flex-col p-5 overflow-y-auto min-h-0 select-none shrink-0">
            <h2 className="text-xl font-extrabold text-black tracking-tight mb-6">
              {isAr ? `مرحباً ${currentUser.name}!` : `Hi ${currentUser.name}!`}
            </h2>

            <div className="flex flex-col gap-1 flex-1">
              {/* Dashboard - للأدمن فقط */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setActiveView('admin')}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-orange-500 hover:bg-orange-50 transition flex items-center gap-2"
                >
                  ⚙️ {isAr ? 'لوحة التحكم' : 'Dashboard'}
                </button>
              )}

              {/* Profile */}
              <button
                onClick={() => setActiveView('profile')}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition flex items-center gap-2"
              >
                👤 {isAr ? 'الملف الشخصي' : 'Profile'}
              </button>

              {/* Wallet */}
              <button
                onClick={() => setActiveView('wallet')}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition flex items-center gap-2"
              >
                💰 {isAr ? 'المحفظة' : 'Wallet'}
              </button>

              <button 
                onClick={() => setActiveView('discovery')}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold bg-transparent text-[#FF6B00] flex items-center justify-between transition-colors"
              >
                <span>{isAr ? 'خصيصاً لك' : 'For You'}</span>
              </button>

              {[
                { en: 'Electronics', ar: 'إلكترونيات' },
                { en: 'Fashion', ar: 'الأزياء' },
                { en: 'Watches', ar: 'الساعات' },
                { en: 'Jewelry', ar: 'المجوهرات' },
                { en: 'Tools', ar: 'المعدات والعدد' }
              ].map((cat) => (
                <button 
                  key={cat.en}
                  onClick={() => setActiveView('discovery')}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-black hover:bg-gray-50 transition-colors"
                >
                  {isAr ? cat.ar : cat.en}
                </button>
              ))}
            </div>

            {/* Bottom Section: Footer Links */}
            <div className="pt-6 border-t border-gray-100 mt-auto">
              <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 text-[11px] font-medium text-gray-400 mb-4">
                <span className="hover:text-gray-600 cursor-pointer">Blog</span>
                <span className="hover:text-gray-600 cursor-pointer">About</span>
                <span className="hover:text-gray-600 cursor-pointer">FAQ</span>
                <span className="hover:text-gray-600 cursor-pointer">Privacy</span>
                <span className="hover:text-gray-600 cursor-pointer">Terms</span>
              </div>
              <p className="text-[10px] text-gray-400 tracking-wider font-mono">
                © 2026 MAZAD JO
              </p>
            </div>
          </div>

          {/* MAIN GRID VIEW AREA */}
          <main className="flex-1 overflow-y-auto min-h-0 bg-gray-50 p-6">
            {activeView === 'discovery' ? (
              <div className="max-w-6xl mx-auto flex flex-col h-full">
                
                <div className="mb-4">
                  <h2 className="text-base font-extrabold text-gray-900 tracking-tight uppercase font-mono">
                    {isAr ? 'المزادات المباشرة الآن' : 'LIVE AUCTIONS NOW'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isAr ? 'مزادات تفاعلية حية برعاية وضمان كليك لجميع المستخدمين' : 'Interactive live stream bidding backed by secure escrow for all users.'}
                  </p>
                </div>

                {liveAuctions.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {liveAuctions.map((auction) => (
                      <div key={auction.id} className="flex flex-col gap-2">
                        {/* Top seller tag bar above each card */}
                        <div className="flex items-center gap-2 px-1">
                          <img 
                            src={auction.sellerLogo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80'}
                            alt={auction.sellerName}
                            className="w-5 h-5 rounded-full object-cover border border-gray-200 shadow-sm"
                          />
                          <span className="text-[11px] font-bold text-gray-700 hover:text-[#FF6B00] cursor-pointer transition-colors max-w-[160px] truncate">
                            {auction.sellerName || 'Custom Merchant'}
                          </span>
                        </div>

                        {/* Card block */}
                        <div 
                          onClick={() => handleAuctionClick(auction.id)}
                          className="bg-white rounded-[12px] border border-gray-200 overflow-hidden shadow-sm hover:shadow-md cursor-pointer group transition-all duration-200"
                        >
                          {/* Aspect 4:3 Image container with Red Live badge Overlay */}
                          <div className="relative aspect-[4/3] w-full bg-gray-100 overflow-hidden">
                            <img 
                              src={auction.thumbnailUrl} 
                              alt={auction.title}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-white rounded-full px-2.5 py-1 text-[10px] font-bold select-none">
                              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                              <span>Live · {auction.viewersCount || 105} watching</span>
                            </div>
                          </div>

                          {/* Text and stats details block */}
                          <div className="p-3 select-none">
                            <h3 className="text-sm font-bold text-gray-900 group-hover:text-[#FF6B00] transition-colors truncate">
                              {auction.title}
                            </h3>
                            <div className="text-[11px] text-gray-400 font-semibold mt-0.5">
                              {auction.category}
                            </div>
                            <div className="text-sm font-black text-[#FF6B00] font-mono mt-2">
                              {auction.currentPrice.toLocaleString()} JOD
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-center text-gray-400 font-sans">
                    <Tv className="w-12 h-12 text-gray-300 mb-3 animate-pulse" />
                    <span className="text-sm font-bold text-gray-500">
                      {isAr ? 'لا توجد مزادات نشطة حالياً' : 'No live auctions right now'}
                    </span>
                  </div>
                )}

              </div>
            ) : (
              children
            )}
          </main>

        </div>

      </div>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
};
