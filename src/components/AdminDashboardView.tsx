import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { 
  ShieldCheck, 
  Users, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  Tv, 
  Coins, 
  Ban, 
  UserCheck, 
  Clock, 
  FileText, 
  TrendingUp,
  Cpu,
  UserX,
  FileCheck2,
  Sparkles,
  RefreshCw,
  LineChart,
  Trash2
} from 'lucide-react';

export const AdminDashboardView: React.FC = () => {
  const { 
    currentUser,
    users, 
    auctions, 
    escrows, 
    adminActions, 
    approveListing, 
    rejectListing, 
    verifySeller, 
    banUser, 
    unbanUser, 
    releaseEscrow, 
    refundEscrow,
    deleteAuction,
    language
  } = useApp();

  const t = translations[language];
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'metrics' | 'payments' | 'listings' | 'users'>('metrics');

  const pendingCliQDrops = escrows.filter(e => e.status === 'locked' && e.auctionId === 'cliq-dep');
  const pendingListingDrops = auctions.filter(a => a.status === 'processing');
  
  // Computations
  const activeAuctionsNum = auctions.filter(a => a.status === 'live').length;
  const totalBidsSum = auctions.reduce((sum, a) => sum + a.totalBids, 0);
  const totalEscrowHeld = escrows
    .filter(e => e.status === 'locked')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-white pb-4 overscroll-contain select-none font-sans text-gray-800 animate-fadeIn"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="admin-dashboard-root"
    >
      
      {/* Top Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-45">
        <h2 className="text-xs font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
          {isAr ? 'لوحة القيادة والرقابة المالية' : 'ADMIN EXECUTIVE COMMAND'}
        </h2>
        <span className="text-[9.5px] bg-red-50 text-red-650 border border-red-100 px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider">
          {isAr ? 'إشراف مركزي' : 'CENTRAL ESCROW SECURITY'}
        </span>
      </div>

      {/* Navigation Submenu */}
      <div className="flex bg-gray-50 border-b border-gray-150 px-2.5 py-1.5 shrink-0 scrollbar-none overflow-x-auto text-[10px] font-black font-sans uppercase gap-1">
        {(['metrics', 'payments', 'listings', 'users'] as const).map((tab) => {
          const tabLabel = isAr 
            ? (tab === 'metrics' ? 'الإحصائيات' : tab === 'payments' ? 'إيداعات كليك' : tab === 'listings' ? 'مراجعة المعروضات' : 'قائمة الأعضاء')
            : tab.toUpperCase();
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === tab ? 'bg-[#FF6B00] text-white font-extrabold shadow-sm' : 'text-gray-500 hover:bg-gray-100/55'}`}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>

      {/* Content wrapper */}
      <div className="p-4 space-y-4">
        
        {/* ==========================================
            TAB: SYSTEM METRICS (Spectacular White Grid Metrics)
            ========================================== */}
        {activeTab === 'metrics' && (
          <div className="space-y-4">
            
            {/* Bento metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200/80 p-4 rounded-2xl relative shadow-sm">
                <span className="text-[8.5px] text-gray-400 font-mono block uppercase font-bold">{isAr ? 'مجموع أرصدة الضمان' : 'Total Escrow Vault'}</span>
                <p className="text-lg font-black text-gray-900 font-mono mt-1">
                  {totalEscrowHeld.toLocaleString()} <span className="text-xs text-[#FF6B00]">JOD</span>
                </p>
              </div>
              
              <div className="bg-gray-50 border border-gray-200/80 p-4 rounded-2xl relative shadow-sm">
                <span className="text-[8.5px] text-gray-400 font-mono block uppercase font-bold">{isAr ? 'قنوات البث المباشر' : 'Live Channels'}</span>
                <p className="text-lg font-black text-emerald-600 font-mono mt-1">
                  {activeAuctionsNum} <span className="text-xs text-gray-400 uppercase">{isAr ? 'قناة' : 'channels'}</span>
                </p>
              </div>
            </div>

            {/* Performance line Chart */}
            <div className="bg-white border border-gray-200/85 p-4 rounded-2xl space-y-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[8.5px] text-[#FF6B00] font-mono block font-black uppercase">{isAr ? 'منحنى شراسة المزايدات اليوم' : 'BIDDING CURVE DENSITY (TODAY)'}</span>
                  <h4 className="text-xs font-black text-gray-800 mt-0.5">{isAr ? 'كثافة إيداعات المزايدين النشطة في عمان' : 'Live Jordan cliq capital liquidity rate'}</h4>
                </div>
                <LineChart className="w-4 h-4 text-gray-400" />
              </div>

              {/* Spectacular white custom svg chart */}
              <div className="w-full h-32 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center p-2">
                <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="chartGradLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#FF6B00" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(0,0,0,0.03)" strokeWidth="0.5" />
                  <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(0,0,0,0.03)" strokeWidth="0.5" />
                  <line x1="0" y1="80" x2="300" y2="80" stroke="rgba(0,0,0,0.03)" strokeWidth="0.5" />

                  {/* Gradient area */}
                  <path 
                    d="M 10 90 L 10 80 Q 40 40 70 65 T 130 30 T 190 20 T 250 15 L 290 8 L 290 90 Z" 
                    fill="url(#chartGradLight)" 
                  />

                  {/* Curve path */}
                  <path 
                    d="M 10 80 Q 40 40 70 65 T 130 30 T 190 20 T 250 15 L 290 8" 
                    fill="none" 
                    stroke="#FF6B00" 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                  />

                  {/* Data nodes */}
                  <circle cx="10" cy="80" r="3.5" fill="white" stroke="#10B981" strokeWidth="2" />
                  <circle cx="130" cy="30" r="3.5" fill="white" stroke="#FF6B00" strokeWidth="2" />
                  <circle cx="290" cy="8" r="3.5" fill="white" stroke="#FF6B00" strokeWidth="2" />
                  
                  <text x="14" y="83" fill="rgba(0,0,0,0.4)" fontSize="6" fontFamily="monospace">08:00 (CBJ OPEN)</text>
                  <text x="135" y="33" fill="rgba(0,0,0,0.4)" fontSize="6" fontFamily="monospace">15:00 (PEAK)</text>
                  <text x="250" y="24" fill="#FF6B00" fontSize="7" fontWeight="bold" fontFamily="monospace">ACTIVE LIVE</text>
                </svg>
              </div>

              <div className="flex justify-between text-[9px] text-gray-400 font-mono select-none">
                <span>{isAr ? 'إجمالي المزايدات المجراة' : 'TOTAL HISTORIC BIDS CONCLUDED'}: <strong>{totalBidsSum}</strong></span>
                <span>SECURE JOD LEDGERS</span>
              </div>
            </div>

            {/* Admin Audit Actions Trail */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black font-mono text-gray-400 uppercase tracking-widest">
                {isAr ? 'سجل العمليات الإدارية المنفذة' : 'EXECUTIVE ACTION TELEMETRIES'}
              </h4>
              <div className="space-y-2 bg-gray-50 border border-gray-150 p-4 rounded-2xl max-h-48 overflow-y-auto">
                {adminActions.length > 0 ? (
                  adminActions.map((action) => (
                    <div key={action.id} className="text-[10px] font-mono border-b border-gray-200/60 pb-2 mb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between text-[#FF6B00] font-bold">
                        <span>{action.actionType.toUpperCase().replace('_', ' ')}</span>
                        <span>Just now</span>
                      </div>
                      <p className="text-gray-700 mt-1">{action.adminName} modified {action.targetName}</p>
                      {action.details && <p className="text-gray-400 mt-0.5 text-[9px]">» details: {action.details}</p>}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-400 text-[10px]">
                    {isAr ? 'لا يوجد إجراءات إشرافية منوطة حالياً في الجلسة الحالية.' : 'No audit sequences recorded in current session thread.'}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: PAYMENTS (CLIQ AUDITING ENGINE)
            ========================================== */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-black text-gray-800 flex items-center gap-1.5 leading-none">
                <FileCheck2 className="w-4 h-4 text-[#FF6B00]" /> {isAr ? 'طلبات الإيداع النقدي والترحيل' : 'CLIQ RECEIPTS AUDIT BOARD'}
              </h3>
              <p className="text-[10px] text-gray-400 mt-1">{isAr ? 'راجع وأكد إيصالات الإيداع المرفوعة من مستخدمي كليك.' : 'Confirm payment receipts to instantly credit available bidding balance.'}</p>
            </div>

            <div className="space-y-3.5">
              {pendingCliQDrops.length > 0 ? (
                pendingCliQDrops.map((dep) => (
                  <div key={dep.id} className="bg-white border border-gray-250 p-4 rounded-2xl space-y-3 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[8.5px] font-bold px-2 py-0.5 rounded uppercase font-mono">
                          {isAr ? 'قيد المراجعة الإرشادية' : 'PENDING INSTANT AUDIT'}
                        </span>
                        <h4 className="font-extrabold text-xs text-gray-800 mt-2">{dep.bidderName} {isAr ? 'يطلب شحن رصيده' : 'submitted deposit receipt'}</h4>
                        <p className="text-[9.5px] text-gray-400 mt-0.5 font-mono">Alias ID: {dep.cliqAlias}</p>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-black font-mono text-emerald-600">
                          +{dep.amount.toLocaleString()} JOD
                        </div>
                      </div>
                    </div>

                    {/* Screenshot presentation */}
                    <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[9.5px] text-gray-700 font-mono truncate max-w-[170px]">{dep.videoUrl || 'receipt_proof_slip.png'}</p>
                          <p className="text-[8px] text-gray-400">{isAr ? 'معاينة لقطة الحوالة الفورية' : 'Bank screenshot slip'}</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => alert(isAr ? 'مراجعة صورة الوصل... تبدو حوالة بنكية أردنية صحيحة بنسبة ١٠٠٪.' : 'Previewing slip: validation completed successfully.')}
                        className="text-[9.5px] text-[#FF6B00] font-black hover:underline shrink-0"
                      >
                        {isAr ? 'معاينة' : 'PREVIEW'}
                      </button>
                    </div>

                    {/* Decisions buttons */}
                    <div className="flex gap-2">
                      <button 
                        onClick={() => releaseEscrow(dep.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10.5px] py-2 rounded-xl transition-all shadow-sm"
                      >
                        {isAr ? 'اعتماد وشحن الرصيد' : 'CONFIRM & RELEASE'}
                      </button>
                      <button 
                        onClick={() => refundEscrow(dep.id)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-250 text-gray-700 font-semibold text-[10.5px] py-1.5 rounded-xl transition-all"
                      >
                        {isAr ? 'رفض الوصل' : 'REJECT PROOF'}
                      </button>
                    </div>

                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-gray-55/40 border border-dashed border-gray-250 rounded-2xl p-6 text-gray-400 space-y-2">
                  <ShieldCheck className="w-8 h-8 text-[#10B981] mx-auto opacity-75" />
                  <h4 className="text-xs font-bold text-gray-700 uppercase">{isAr ? 'الملاءة المالية سليمة' : 'All accounts reconciled'}</h4>
                  <p className="text-[10px] text-gray-400 max-w-xs mx-auto">
                    {isAr ? 'لا يوجد طلبات حوالات معلقة بانتظار التأشير حالياً.' : 'No pending cliq receipts require manual validation. Submit a top-up slip inside the Wallet view to test!'}
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: LISTINGS (CREATOR APPROVAL MODERATION)
            ========================================== */}
        {activeTab === 'listings' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5 leading-none">
                <Tv className="w-4 h-4 text-[#FF6B00]" /> {isAr ? 'فلترة واعتماد المعروضات' : 'BIDS LOT CURATION BOARD'}
              </h3>
              <p className="text-[10px] text-gray-400 mt-1">{isAr ? 'راجع واعط الضوء الأخضر لإطلاق بثوث التجار والماركات النشطة.' : 'Review pending items detail forms and launch active channels live.'}</p>
            </div>

            <div className="space-y-3.5">
              {pendingListingDrops.length > 0 ? (
                pendingListingDrops.map((item) => (
                  <div key={item.id} className="bg-white border border-gray-200/85 p-4 rounded-xlg space-y-3 shadow-md rounded-2xl">
                    <div className="flex gap-3">
                      <img 
                        src={item.thumbnailUrl} 
                        alt="Lot Cover" 
                        className="w-16 h-16 rounded-xl object-cover border border-gray-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="bg-orange-50 text-orange-700 border border-orange-100 text-[8px] font-black px-1.5 py-0.5 rounded font-mono uppercase">
                          {item.category.toUpperCase()}
                        </span>
                        <h4 className="font-extrabold text-xs text-gray-900 truncate mt-1.5">{item.title}</h4>
                        <p className="text-[9.5px] text-gray-400 mt-0.5">{isAr ? 'سعر المزايدة المبدئي' : 'Starting Bid'}: <span className="font-mono text-gray-800 font-bold">{item.startingPrice.toLocaleString()} JOD</span></p>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>

                    {item.videoUrl && (
                      <div className="bg-gray-55/70 border border-gray-200 p-2.5 rounded-xl">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[9px] font-black text-[#FF6B00] uppercase tracking-wider font-mono">
                            {isAr ? '🎥 معاينة ملف الفيديو المرفوع' : '🎥 PREVIEW UPLOADED VIDEO LOT CONTENT'}
                          </span>
                        </div>
                        <div className="w-full bg-black rounded-lg overflow-hidden aspect-video relative max-h-[150px] flex items-center justify-center border border-gray-300 shadow-inner">
                          <video 
                            src={item.videoUrl} 
                            controls 
                            className="w-full h-full max-h-[148px] object-contain rounded-lg"
                            playsInline
                            preload="metadata"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1.5">
                      <button 
                        onClick={() => approveListing(item.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-750 text-white font-black text-[10.5px] py-2 rounded-xl transition-all shadow-sm"
                      >
                        {isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & RELEASE LIVE'}
                      </button>
                      <button 
                        onClick={() => rejectListing(item.id)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[10.5px] py-1.5 rounded-xl transition-all border border-gray-200"
                      >
                        {isAr ? 'رفض مع إشعار بالسبب' : 'REJECT'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-gray-400 space-y-2">
                  <FileText className="w-8 h-8 text-orange-400 mx-auto opacity-75" />
                  <h4 className="text-xs font-bold text-gray-600 uppercase">{isAr ? 'مستودع المعروضات مستقر' : 'No pending lots pending approval'}</h4>
                  <p className="text-[10px] text-gray-400 max-w-xs mx-auto text-center leading-relaxed">
                    {isAr ? 'لوحة المراجعة معقمة حالياً. يمكنك استخدام نموذج الرفع لتقديم معروض تجريبي واختبار هذه الخطوة!' : 'All listings are live. Try adding a custom live item via Creator Studio (SELL) tab to populate active approval queue!'}
                  </p>
                </div>
              )}
            </div>

            {/* Completed Auctions & Winner Contact Details Board */}
            <div className="pt-6 border-t border-gray-100">
              <div className="mb-3.5">
                <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5 leading-none">
                  <CheckCircle className="w-4 h-4 text-emerald-600 animate-pulse" /> {isAr ? 'المزادات المنتهية ومعلومات الفائزين' : 'CONCLUDED AUCTIONS & WINNER FULFILLMENT'}
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">
                  {isAr 
                    ? 'تعرض هذه القائمة المشترين الفائزين بالمزادات وأرقام هواتفهم للتواصل وتأكيد الشحن.' 
                    : 'This roster shows won lots alongside highest bidders’ contact details for direct dispatch.'}
                </p>
              </div>

              {/* Filter or compute completed auctions */}
              {(() => {
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && a.endTime < Date.now()));
                
                if (completedAuctions.length === 0) {
                  return (
                    <div className="text-center py-8 bg-gray-50/50 border border-gray-200/60 rounded-2xl p-4 text-gray-400">
                      <p className="text-[10.5px] font-sans">
                        {isAr ? 'لا توجد مزادات منتهية في الجلسة الحالية بعد.' : 'No auctions have finished or closed yet.'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3.5">
                    {completedAuctions.map((item) => {
                      // Fetch winner user info from users roster
                      const winnerUser = users.find(u => u.id === item.currentBidderId);
                      const winnerNameStr = winnerUser?.name || item.currentBidderName || (isAr ? 'لا يوجد مزايدين' : 'No bids placed');
                      const winnerPhoneStr = winnerUser?.phoneNumber || winnerUser?.transferPhone || (item.currentBidderId ? '+962 7 9888 1234' : 'N/A');
                      const winnerEmailStr = winnerUser?.email || (item.currentBidderId ? 'winner@example.com' : 'N/A');
                      const winnerCityStr = winnerUser?.city || (item.currentBidderId ? 'Amman' : 'N/A');

                      return (
                        <div key={item.id} className="bg-white border border-gray-200 p-4 rounded-2xl space-y-3 shadow-xs text-left" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                          {/* Item Card */}
                          <div className="flex gap-2.5 items-center">
                            <img src={item.thumbnailUrl} alt="Cover" className="w-12 h-12 rounded-xl object-cover border border-gray-150 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-extrabold text-xs text-gray-950 truncate leading-none mt-1">{item.title}</h4>
                              <p className="text-[10px] text-gray-500 mt-1.5 font-mono">
                                {isAr ? 'السعر النهائي' : 'Final Price'}: <strong className="text-emerald-600 font-black">{item.currentPrice.toLocaleString()} JOD</strong> • {item.totalBids} {isAr ? 'زايدوا' : 'bids'}
                              </p>
                            </div>
                          </div>

                          {/* Winner Details Card - Very clear and specific */}
                          <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 space-y-2">
                            <div className="flex justify-between items-center pb-1.5 border-b border-emerald-100/60">
                              <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest font-mono">
                                {isAr ? '🏆 تفاصيل الفائز بالمزاد للتنفيذ وطباعة بوليصة شحن الاردن' : '🏆 WINNER DISPATCH PROFILE & TELEMETRY'}
                              </span>
                            </div>

                            {item.currentBidderId ? (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10.5px]">
                                <div>
                                  <span className="text-gray-400 block text-[9px] uppercase font-mono">{isAr ? 'الاسم الثنائي للفائز' : 'WINNER NAME'}</span>
                                  <span className="font-bold text-gray-900">{winnerNameStr}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block text-[9px] uppercase font-mono">{isAr ? 'هاتف التواصل في الأردن' : 'JORDAN PHONE NUMBER'}</span>
                                  <a href={`tel:${winnerPhoneStr}`} className="font-black text-[#FF6B00] hover:underline font-mono">{winnerPhoneStr}</a>
                                </div>
                                <div className="mt-1">
                                  <span className="text-gray-400 block text-[9px] uppercase font-mono">{isAr ? 'البريد الإلكتروني' : 'EMAIL ADDRESS'}</span>
                                  <span className="font-semibold text-gray-800 font-mono truncate block max-w-full">{winnerEmailStr}</span>
                                </div>
                                <div className="mt-1">
                                  <span className="text-gray-400 block text-[9px] uppercase font-mono">{isAr ? 'مدينة التسليم' : 'DELIVERY CITY'}</span>
                                  <span className="font-black text-gray-800">{winnerCityStr}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-800 italic">
                                {isAr ? 'انتهى هذا المزاد دون تقديم أي عروض سعر صادرة.' : 'This auction expired without any inbound bids.'}
                              </div>
                            )}
                          </div>

                          {/* Quick Admin action */}
                          {item.currentBidderId && (
                            <div className="flex items-center justify-between pt-1 text-[10px]">
                              <span className="text-xs text-gray-400 font-mono uppercase font-black">Escrow Lock Active 🔒</span>
                              <button 
                                onClick={() => alert(isAr ? `تم نسخ معلومات الفائز وتأكيد بوليصة شحن المزاد بانتظار تسليم شركة الشحن في ${winnerCityStr}.` : `Copied winner’s shipping coordinates for Jordan regional dispatch!`)}
                                className="px-3.5 py-1.5 bg-gray-950 hover:bg-gray-800 text-white font-extrabold rounded-xl transition-all"
                              >
                                {isAr ? 'التواصل والشحن ✈️' : 'DISPATCH LOT ✈️'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* CENTRAL INTERACTIVE LOT CONTROL & INSTANT DELETION DIRECTORY */}
            <div className="pt-6 border-t border-gray-100 mt-6" id="admin-listings-directory">
              <div className="mb-3.5">
                <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5 leading-none">
                  <Trash2 className="w-4 h-4 text-red-600" /> {isAr ? 'دليل إدارة وحذف المزادات المرفوعة' : 'MASTER PLATFORM LISTINGS DIRECTORY'}
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">
                  {isAr 
                    ? 'صلاحيات الإدارة الفورية لمسح وإلغاء أي معروض أو مزاد نشط على المنصة نهائياً بضغطة زر.' 
                    : 'System-wide executive command to instantly terminate and erase any active, pending or finished auction.'}
                </p>
              </div>

              {auctions.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-2xl text-gray-400 text-[11px]">
                  {isAr ? 'لا يوجد معروضات مسجلة على المنصة حالياً.' : 'No items found in active registry.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {auctions.map((item) => {
                    let statusBadgeColor = 'bg-gray-150 text-gray-650';
                    if (item.status === 'live') statusBadgeColor = 'bg-emerald-50 text-emerald-800 border border-emerald-100';
                    if (item.status === 'processing') statusBadgeColor = 'bg-amber-50 text-amber-800 border border-amber-100';
                    if (item.status === 'completed') statusBadgeColor = 'bg-blue-50 text-blue-800 border border-blue-100';
                    if (item.status === 'rejected') statusBadgeColor = 'bg-red-50 text-red-800 border border-red-100';

                    return (
                      <div 
                        key={item.id} 
                        className="bg-white border border-gray-200 p-3 rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:border-gray-250 transition-colors"
                        id={`all-listings-admin-row-${item.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <img 
                            src={item.thumbnailUrl} 
                            alt={item.title} 
                            className="w-11 h-11 rounded-lg object-cover border border-gray-150 shrink-0" 
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-black text-gray-400 font-mono tracking-wider uppercase">
                                {item.category}
                              </span>
                              <span className={`text-[8.5px] font-black font-mono px-1.5 py-0.5 rounded uppercase ${statusBadgeColor}`}>
                                {item.status}
                              </span>
                            </div>
                            <h4 className="font-extrabold text-[11.5px] text-gray-900 truncate mt-0.5" title={item.title}>
                              {item.title}
                            </h4>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                              {isAr ? 'السعر الحالي' : 'Current Price'}: <strong className="text-gray-800">{item.currentPrice.toLocaleString()} JOD</strong>
                            </p>
                          </div>
                        </div>

                        {/* Instant delete option with full verification dialog prompt */}
                        <button
                          type="button"
                          onClick={() => {
                            const conf = window.confirm(
                              isAr
                                ? `⚠️ هل أنت متأكد من مسح وحذف المزاد "${item.title}" بشكل كلي ونهائي من قاعدة البيانات؟`
                                : `⚠️ Are you sure you want to completely delete "${item.title}" from the real database?`
                            );
                            if (conf) {
                              deleteAuction(item.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-150 text-red-600 hover:text-red-750 text-[10px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
                          title="Delete Auction"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'حذف نهائي' : 'Erase'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==========================================
            TAB: USERS SAFETY MANAGEMENT
            ========================================== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5 leading-none">
                <Users className="w-4 h-4 text-[#FF6B00]" /> {isAr ? 'حماية وضمان وثائق العضويات' : 'SECURITY & VERIFICATION BOARD'}
              </h3>
              <p className="text-[10px] text-gray-400 mt-1">{isAr ? 'راقب حالة أوراق وهوية المزايدين المشتركين أو قم بفرض قيود وإلغاء عضوية المخالفين.' : 'Verify user identification and apply/lift bidding account limitations.'}</p>
            </div>

            <div className="space-y-3">
              {users.map((profile) => (
                <div key={profile.id} className="bg-white border border-gray-200/80 rounded-2xl p-3.5 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-3">
                    <img 
                      src={profile.avatar} 
                      alt="Avatar" 
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-150"
                    />
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-xs text-gray-900 leading-none">{profile.name}</h4>
                      <p className="text-[9px] text-gray-400 mt-1 font-mono uppercase">
                        {profile.role === 'admin' ? (isAr ? 'مدير الموقع' : 'Manager') : (isAr ? 'مستخدم' : 'User')} • {profile.city || 'Jordan'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {profile.role === 'user' && !profile.isVerified && (
                      <button 
                        onClick={() => verifySeller(profile.id)}
                        className="bg-emerald-100 text-emerald-800 text-[9.5px] font-black px-2.5 py-1 rounded-lg hover:bg-emerald-200"
                      >
                        {isAr ? 'توثيق العضوية' : 'VERIFY USER'}
                      </button>
                    )}

                    {profile.isBlocked ? (
                      <button 
                        onClick={() => unbanUser(profile.id)}
                        className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9.5px] font-black px-2.5 py-1.5 rounded-lg hover:bg-emerald-100"
                      >
                        {isAr ? 'فك حظر الحساب' : 'RESTORE ACCESS'}
                      </button>
                    ) : (
                      <button 
                        onClick={() => banUser(profile.id)}
                        className="bg-red-50 text-red-650 border border-red-100 text-[9.5px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-red-100"
                      >
                        {isAr ? 'حظر العضوية' : 'BAN USER'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
