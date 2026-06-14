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
  Sliders,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface DesktopFrameProps {
  children: React.ReactNode;
}

export const DesktopFrame: React.FC<DesktopFrameProps> = ({ children }) => {
  const { 
    currentUser, 
    wallet, 
    activeView, 
    setActiveView, 
    escrows, 
    adminActions, 
    auctions,
    isSimulating,
    setIsSimulating,
    language,
    setLanguage,
    logout
  } = useApp();

  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const t = translations[language];
  const isAr = language === 'ar';

  const systemAuditLogs = [
    ...adminActions.map(a => ({
      id: a.id,
      text: isAr ? `${a.adminName} نفذ ${a.actionType.toUpperCase().replace('_', ' ')} على ${a.targetName}` : `${a.adminName} executed ${a.actionType.toUpperCase().replace('_', ' ')} on ${a.targetName}`,
      timestamp: a.timestamp,
      icon: <ShieldCheck className="w-3.5 h-3.5 text-[#FF6B00]" />
    })),
    ...escrows.map(e => ({
      id: e.id,
      text: isAr ? `تم حجز ${e.amount.toLocaleString()} د.أ في الضمان لصالح ${e.auctionTitle}` : `${e.bidderName} locked ${e.amount.toLocaleString()} JOD in escrow for ${e.auctionTitle}`,
      timestamp: e.timestamp,
      icon: <Coins className="w-3.5 h-3.5 text-emerald-600" />
    }))
  ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);

  const totalLiveAuctionsCount = auctions.filter(a => a.status === 'live').length;
  const activeEscrowsSum = escrows
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div 
      className="h-[100dvh] lg:min-h-screen bg-white text-gray-900 flex flex-col font-sans selection:bg-[#FF6B00]/20 overflow-x-hidden"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="desktop-frame-root"
    >
      
      {/* 1. Global Navigation Premium Header (Visible only on Desktop Viewports) */}
      <header className="hidden lg:flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-white/95 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF6B00] flex items-center justify-center font-bold text-white tracking-widest text-lg shadow-[0_4px_12px_rgba(255,107,0,0.3)] font-mono">
            M
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-gray-900 font-mono flex items-center gap-1.5 leading-none">
              {t.appName}
              <span className="text-[9px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-sans border border-gray-200">V3 PILOT</span>
            </h1>
            <p className="text-[11px] text-gray-400 font-sans mt-0.5">{t.appSubtitle}</p>
          </div>
        </div>

        {/* Real-time System state diagnostics */}
        <div className="flex items-center gap-7 text-xs text-gray-500 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
            <span>{isAr ? 'الإشارة: متصل' : 'LIVE STATE: CONNECTED'}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-r border-gray-100 px-5">
            <Tv className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span>{isAr ? 'المزادات النشطة' : 'LIVE AUCTIONS'}: <strong className="text-gray-900">{totalLiveAuctionsCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 pr-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAr ? 'الضمانات النشطة' : 'ESCROW RESERVES'}: <strong className="text-gray-900">{activeEscrowsSum.toLocaleString()} {isAr ? 'د.أ' : 'JD'}</strong></span>
          </div>
        </div>

        {/* Language switcher & profile credentials */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-gray-400" />
            <span>{language === 'en' ? 'العربية' : 'English'}</span>
          </button>

          <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-full py-1 pl-2 pr-3.5">
            <img 
              src={currentUser.avatar} 
              alt={currentUser.name} 
              className="w-6 h-6 rounded-full object-cover border border-white"
            />
            <div className="text-left">
              <span className="text-[11.5px] font-bold block leading-none text-gray-800">{currentUser.name}</span>
              <span className="text-[9px] text-gray-400 font-mono uppercase">{currentUser.role === 'admin' ? 'SYSTEM CRITICAL' : 'SUBSCRIBER PASS'}</span>
            </div>
          </div>

          <button 
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50 transition-colors"
            title="Log Out Session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Structuring Section Grid */}
      <main className="flex-grow flex-1 w-full mx-auto max-w-7xl flex flex-col lg:flex-row items-stretch lg:py-6 lg:px-4 lg:gap-6 min-h-0">
        
        {/* ==========================================
            LEFT ASIDE: MERCHANDISE WALLET LEDGER
            ========================================== */}
        <aside className="hidden lg:flex w-72 flex-col gap-4 shrink-0 select-none">
          {/* User Status Ledger card */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,0,0,0.02)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#FF6B00]/5 rounded-full blur-2xl"></div>
            
            <div className="flex items-center gap-3.5 mb-4">
              <img 
                src={currentUser.avatar} 
                alt="Avatar" 
                className="w-11 h-11 rounded-xl object-cover border border-gray-100 shadow-sm"
              />
              <div className="text-left">
                <h3 className="font-extrabold text-xs tracking-wide text-gray-800">{currentUser.name}</h3>
                <p className="text-[11px] text-gray-400">{currentUser.city || t.city}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-[9px] text-gray-500 font-mono tracking-wider font-extrabold uppercase">{t.verifiedMerchant}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-[11px] pt-3 border-t border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-400">{isAr ? 'حساب التدقيق' : 'Signature Security'}</span>
                <span className="text-gray-800 font-mono font-bold uppercase">{t.escrowAudit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{isAr ? 'رابط كليك' : 'CliQ Target'}</span>
                <span className="text-gray-500 font-mono">{currentUser.email.split('@')[0]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{isAr ? 'حالة الاشتراك' : 'Access Status'}</span>
                <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase">
                  {currentUser.role === 'admin' ? 'ADMIN VIP' : 'ACTIVE_PASS'}
                </span>
              </div>
            </div>
          </div>

          {/* Liquid Balances Card */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="text-xs font-black font-sans text-gray-800 flex items-center gap-2">
                <WalletIcon className="w-4 h-4 text-[#FF6B00]" /> {isAr ? 'محفظة الرصيد المالي' : 'WALLET ACCRUALS'}
              </h3>
              <button 
                onClick={() => setActiveView('wallet')} 
                className="text-[10px] text-[#FF6B00] hover:underline font-mono font-black uppercase"
              >
                {isAr ? 'إيداع' : 'TOP UP'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider block">{t.availableBid}</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-gray-900 font-mono tracking-tight leading-none">
                    {wallet.availableBalance.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono font-black text-gray-500">JOD</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div>
                  <span className="text-[8.5px] text-gray-400 font-mono block">{t.escrowMargin}</span>
                  <div className="text-xs font-black text-amber-600 font-mono mt-0.5">
                    {wallet.escrowBalance.toLocaleString()} <span className="text-[8px] text-gray-400">JD</span>
                  </div>
                </div>
                <div>
                  <span className="text-[8.5px] text-gray-400 font-mono block">{isAr ? 'إجمالي الأصول' : 'Accrued Ledger'}</span>
                  <div className="text-xs font-black text-gray-800 font-mono mt-0.5">
                    {wallet.totalBalance.toLocaleString()} <span className="text-[8px] text-gray-400">JD</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-[10px] text-gray-500 leading-relaxed font-sans">
              ℹ️ {t.subLockText.split('.')[0]}.
            </div>
          </div>

          {/* Quick Nav shortcut links */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col gap-10 bg-gray-50/50">
            <div className="flex flex-col gap-1 w-full">
              <button 
                onClick={() => setActiveView('discovery')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeView === 'discovery' ? 'bg-[#FF6B00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.25)]' : 'text-gray-600 hover:bg-gray-100/50'}`}
              >
                <Tv className="w-4 h-4 shrink-0" /> 
                <span>{t.navDiscover}</span>
              </button>
              
              <button 
                onClick={() => setActiveView('wallet')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeView === 'wallet' ? 'bg-[#FF6B00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.25)]' : 'text-gray-600 hover:bg-gray-100/50'}`}
              >
                <User className="w-4 h-4 shrink-0" /> 
                <span>{t.navWallet}</span>
              </button>

              <button 
                onClick={() => setActiveView('upload')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeView === 'upload' ? 'bg-[#FF6B00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.25)]' : 'text-gray-600 hover:bg-gray-100/50'}`}
              >
                <PlusCircle className="w-4 h-4 shrink-0" /> 
                <span>{t.navAddListing}</span>
              </button>

              {currentUser && currentUser.role === 'admin' && (
                <button 
                  onClick={() => setActiveView('admin')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeView === 'admin' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100/50'}`}
                >
                  <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0" /> 
                  <span>{t.navAdmin}</span>
                </button>
              )}

              <button 
                onClick={() => setIsTermsOpen(true)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-gray-600 hover:bg-gray-100/50`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0 text-orange-500" /> 
                <span>{isAr ? 'سياسات الشروط والأحكام' : 'Terms & Policies'}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ==========================================
            CENTER STAGE: PHONE WRAPPER FRAME
            ========================================== */}
        <section className="flex-1 flex flex-col items-stretch lg:items-center lg:justify-center min-w-0 h-full w-full" id="center-iphone-frame-stage">
          <div className={`w-full h-full lg:h-[860px] lg:max-w-[430px] flex flex-col overflow-hidden relative lg:rounded-[48px] lg:border-[8px] lg:border-gray-200/90 shadow-none lg:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.06)] lg:ring-1 lg:ring-black/5 ${activeView === 'live' ? 'bg-[#111111]' : 'bg-white lg:bg-[#111111]'}`}>
            
            {/* Dynamic island (fits pristine clean screen rules) */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-full z-50 pointer-events-none hidden lg:block"></div>

            {/* Simulated Frame Screen Internal Viewport */}
            <div className={`flex-1 w-full relative overflow-hidden h-full flex flex-col ${activeView === 'live' ? 'bg-[#111111]' : 'bg-white'}`}>
              {children}
            </div>
            
            {/* Native Home bar indicator simulation for desktop */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-36 h-1.2 bg-black/10 rounded-full z-50 pointer-events-none hidden lg:block"></div>
          </div>
        </section>

        {/* ==========================================
            RIGHT ASIDE: LOGS DICTIONARY AUDITOR
            ========================================== */}
        <aside className="hidden lg:flex w-72 flex-col gap-4 shrink-0 select-none">
          {currentUser && currentUser.role === 'admin' && (
            <Suspense fallback={
              <div className="h-48 border border-dashed border-gray-200 rounded-2xl flex items-center justify-center text-xs text-gray-400 font-mono">
                LOADING PANEL...
              </div>
            }>
              <AdminPanel />
            </Suspense>
          )}
          
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-xs font-black font-sans text-gray-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500 animate-pulse" /> {isAr ? 'مستند العمليات فوري' : 'HOT LEDGER STREAM'}
              </h3>
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded text-[8.5px] text-emerald-700 font-mono font-bold uppercase">
                {isAr ? 'نشط' : 'WS ACTIVE'}
              </div>
            </div>

            {/* Real-time Ticker Audit rows */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-[11px] font-mono leading-relaxed" id="live-ledger-logs-scroll">
              {systemAuditLogs.length > 0 ? (
                systemAuditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-gray-50/50 rounded-xl border border-gray-100 flex gap-2.5 items-start">
                    <div className="mt-0.5 p-1 rounded bg-white border border-gray-100 shrink-0">
                      {log.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 font-sans tracking-wide leading-snug">{log.text}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[9px] text-[#FF6B00] font-bold">{isAr ? 'كليك الأردن' : 'CliQ Sec'}</span>
                        <span className="text-[9px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> {isAr ? 'الآن' : 'Just now'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-400 font-sans flex flex-col items-center gap-2">
                  <Activity className="w-7 h-7 text-gray-200" />
                  <span>No events synced. Complete bids inside to populate ledger logs stream!</span>
                </div>
              )}
            </div>

            {/* Toggle Real-time data feed simulator */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">{isAr ? 'خادم المزايدات الوهمية' : 'Bids Generator Run'}</span>
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-bold font-mono tracking-wide transition-all ${isSimulating ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}
                >
                  {isSimulating ? (isAr ? 'نشط (٨ ثوان)' : 'ACTIVE (8s)') : (isAr ? 'إيقاف' : 'STOPPED')}
                </button>
              </div>
            </div>
          </div>

          {/* Guidelines Box */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm text-[11px] text-gray-500 leading-relaxed bg-gray-50/50">
            <h4 className="font-extrabold text-gray-800 mb-1 flex items-center gap-1.5 uppercase font-mono text-[9px] tracking-wide">
              <HelpCircle className="w-4 h-4 text-[#FF6B00]" /> {isAr ? 'أدلة التشاور الأمنية' : 'SECURITIES COMPLIANCE'}
            </h4>
            <p>
              {isAr ? 'جميع العمليات والمزايدات تودع في رصيد مالي مجمد كضمان لحين شحن معروضك وتأكيد التسليم يداً بيد.' : 'Bid security utilizes legal instant escrow margin. Top-up using the CliQ Deposit slip feature prior to placement.'}
            </p>
          </div>
        </aside>

      </main>

      {/* 3. Global Mobile Dynamic bottom navigation bar (Hidden on lg layout and when live) */}
      {activeView !== 'live' && (
        <nav 
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200/60 backdrop-blur-lg pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2.5 px-6 flex items-center justify-between text-[11px] font-bold tracking-wider text-gray-500 select-none h-16 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]"
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
                setIsSimulating(true); // Auto power generator
              }}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'admin' ? 'text-black font-black' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <ShieldAlert className="w-5 h-5 text-orange-500" />
              <span className="text-[9px] font-bold tracking-normal">{t.navAdmin}</span>
            </button>
          )}
        </nav>
      )}

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />

    </div>
  );
};
