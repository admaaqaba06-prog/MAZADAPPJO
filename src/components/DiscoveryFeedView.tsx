import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AuctionItem } from '../types';
import { translations } from '../utils/translations';
import { 
  Flame, 
  Sparkles, 
  Search, 
  Clock, 
  Tv, 
  Plus, 
  Watch, 
  Car, 
  Laptop, 
  HardHat, 
  Gem,
  Bell,
  Globe,
  Info,
  Bookmark
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { CountdownStoriesBar } from './CountdownStoriesBar';

export const DiscoveryFeedView: React.FC = () => {
  const { auctions, setActiveAuctionId, setActiveView, notifications, language, setLanguage, approveListing } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming'>('live');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const t = translations[language];
  const isAr = language === 'ar';

  const categoriesList = [
    { name: 'All', icon: <Sparkles className="w-3.5 h-3.5" />, arName: 'الكل' },
    { name: 'Luxury', icon: <Watch className="w-3.5 h-3.5" />, arName: 'فاخر' },
    { name: 'Vehicles', icon: <Car className="w-3.5 h-3.5" />, arName: 'مركبات' },
    { name: 'Electronics', icon: <Laptop className="w-3.5 h-3.5" />, arName: 'إلكترونيات' },
    { name: 'Fashion', icon: <Gem className="w-3.5 h-3.5" />, arName: 'أزياء' },
    { name: 'Real Estate', icon: <HardHat className="w-3.5 h-3.5" />, arName: 'عقارات' }
  ];

  const filteredAuctions = auctions.filter(item => {
    if (activeTab === 'live' && item.status !== 'live') return false;
    if (activeTab === 'upcoming' && item.status !== 'upcoming') return false;

    if (searchTerm) {
      const matchText = (item.title + item.description).toLowerCase();
      if (!matchText.includes(searchTerm.toLowerCase())) return false;
    }

    if (selectedCategory !== 'All' && item.category !== selectedCategory) {
      return false;
    }

    return true;
  });

  const handleJoinLive = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  return (
    <div 
      className="flex-1 overflow-y-auto w-full flex flex-col bg-white pb-24 overscroll-behavior-y-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="discovery-feed-root"
    >
      
      {/* Top Mobile Bar Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B00] flex items-center justify-center font-black text-white text-sm shadow-[0_3px_8px_rgba(255,107,0,0.3)]">
            M
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest text-[#FF6B00] leading-none font-mono">{t.appName}</h1>
          </div>
        </div>

        {/* Action Header controls */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="p-1 px-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-[10px] font-bold font-mono tracking-tight text-gray-500 uppercase"
            id="discover-lang-btn"
          >
            {language === 'en' ? 'العربية' : 'EN'}
          </button>

          <button 
            onClick={() => setActiveView('upload')}
            className="px-3 py-1.5 rounded-xl bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-[11px] flex items-center gap-1.5 shadow-[0_3px_10px_rgba(255,107,0,0.2)] transition-all"
            id="sell-wizard-btn"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" /> 
            <span>{isAr ? 'بيع' : 'SELL'}</span>
          </button>
        </div>
      </div>

      {/* Hero Welcome Banner Card (Slate Premium style) */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative rounded-2xl bg-[#1A1A1A] p-5 overflow-hidden shadow-sm border border-gray-800">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/10 rounded-full translate-x-12 -translate-y-12 blur-2xl"></div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <h2 className="text-base font-black text-white leading-tight font-sans tracking-tight uppercase">
                {isAr ? 'مزاد مباشر — زايد. اشترِ. بع.' : 'Live Auction — Bid. Buy. Sell.'}
              </h2>
            </div>
            <p className="text-[10.5px] text-gray-400 mt-2 leading-relaxed">
              {isAr ? 'اشترك الآن لتفعيل المحفظة السريعة والمزايدة بضمان كليك فوري مع حماية البائعين والمشترين يداً بيد.' : 'Unlock real-time authenticated high bidding. Protect your payments via central escrow guarantee lines.'}
            </p>
          </div>
        </div>
      </div>

      {/* Countdown Stories Bar */}
      <CountdownStoriesBar />

      {/* Search Input block */}
      <div className="p-4 space-y-3.5">
        <div className="relative">
          <input
            type="text"
            placeholder={isAr ? 'ابحث عن سيارات، ساعات رولكس، أراضي في عمان والبلقاء...' : 'Search Rolex, premium land slots, high assets...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full bg-gray-50 border border-gray-200/80 rounded-xl py-3 ${isAr ? 'pr-9 pl-4' : 'pl-9 pr-4'} text-xs text-gray-800 focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all font-sans`}
          />
          <Search className={`absolute ${isAr ? 'right-3' : 'left-3'} top-3.5 w-4 h-4 text-gray-400`} />
        </div>

        {/* Categories Carousel */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 font-sans">
          {categoriesList.map(cat => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10.5px] font-bold select-none shrink-0 transition-all border ${selectedCategory === cat.name ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-sm' : 'bg-white text-gray-500 border-gray-200/80 hover:bg-gray-50'}`}
            >
              {cat.icon}
              <span>{isAr ? cat.arName : cat.name.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pending Listings Banner */}
      {auctions.filter(a => a.status === 'processing').length > 0 && (
        <div className="mx-4 mb-4 p-4 bg-orange-50 border border-orange-100 rounded-2xl space-y-2.5">
          <div className="flex gap-2 items-start">
            <span className="w-2.5 h-2.5 bg-[#FF6B00] rounded-full mt-1.5 animate-ping shrink-0"></span>
            <div>
              <h4 className="text-xs font-black text-[#FF6B00] uppercase font-mono tracking-wide">
                {isAr ? 'لديك معروض جديد بانتظار التأكيد' : 'PENDING CHANNELS AUDITED'}
              </h4>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                {isAr 
                  ? 'رفع الفيديو واللوت نجح كلياً! اضغط للموافقة والإطلاق اللحظي ليظهر في القنوات المفتوحة المباشرة فوراً:' 
                  : 'Your video stream asset successfully resolved and audited! Launch it direct to general live feed below:'}
              </p>
            </div>
          </div>
          
          <div className="space-y-2 pt-1 border-t border-orange-200/50">
            {auctions.filter(a => a.status === 'processing').map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white border border-gray-150 p-2.5 rounded-xl shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <img src={item.thumbnailUrl} alt="Cover" className="w-8.5 h-8.5 rounded-lg object-cover border border-gray-150 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-extrabold text-xs text-gray-900 block truncate leading-tight">{item.title}</span>
                    <span className="text-[9px] text-gray-400 font-mono block mt-0.5">{item.startingPrice.toLocaleString()} JOD starting</span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    approveListing(item.id);
                    setActiveView('live');
                    setActiveAuctionId(item.id);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10.5px] px-3.5 py-1.5 rounded-xl shrink-0 shadow-sm transition-colors cursor-pointer"
                >
                  {isAr ? 'إطلاق بث مباشر' : 'LAUNCH LIVE 🚀'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="px-4 flex border-b border-gray-155 mb-2">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-3 text-center text-[11px] font-bold tracking-wider relative transition-all ${activeTab === 'live' ? 'text-[#FF6B00]' : 'text-gray-400'}`}
        >
          <span className="flex items-center justify-center gap-1.5 uppercase">
            <Flame className="w-3.5 h-3.5 text-[#FF6B00]" /> {isAr ? 'المزادات المباشرة النشطة' : 'ACTIVE LIVE FEED'}
          </span>
          {activeTab === 'live' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00] rounded-full"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-3 text-center text-[11px] font-bold tracking-wider relative transition-all ${activeTab === 'upcoming' ? 'text-[#FF6B00]' : 'text-gray-400'}`}
        >
          <span className="flex items-center justify-center gap-1.5 uppercase">
            <Clock className="w-3.5 h-3.5" /> {isAr ? 'المقترحة قريباً' : 'UPCOMING DROPS'}
          </span>
          {activeTab === 'upcoming' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6B00] rounded-full"></span>
          )}
        </button>
      </div>

      {/* Header categories list & Tag Pills matching the layout in image */}
      {activeTab === 'live' && (
        <div className="w-full border-b border-gray-100 bg-white sticky top-[51px] z-20 font-sans mb-3.5">
          <div className="flex items-center gap-1.5 px-4 py-1.5 overflow-x-auto scrollbar-none">
            {/* Grid dots icon :: on the left */}
            <div className="flex flex-col gap-1 pr-2 shrink-0 border-r border-gray-150 mr-1 py-1">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-black rounded-full" />
                <span className="w-1.5 h-1.5 bg-black rounded-full" />
              </div>
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-black rounded-full" />
                <span className="w-1.5 h-1.5 bg-black rounded-full" />
              </div>
            </div>
            
            {/* Horizontal Scrollable Categories */}
            {['Thrift', "Men's Modern & Thrift", 'Soccer', 'Accessories', 'Art', 'Collectibles'].map((catName, index) => {
              const isSelected = index === 1; // Default "Men's Modern & Thrift" selected as in screenshot
              return (
                <button
                  key={catName}
                  onClick={() => {
                    if (catName === 'Thrift') setSelectedCategory('Fashion');
                    else if (catName === 'Soccer') setSelectedCategory('Fashion');
                    else setSelectedCategory('All');
                  }}
                  className={`px-3 py-1.5 text-[13px] font-black shrink-0 transition-all relative ${isSelected ? 'text-black font-black' : 'text-gray-400 hover:text-black'}`}
                >
                  <span>{isAr ? (
                    catName === 'Thrift' ? 'مستعمل مميز' :
                    catName === "Men's Modern & Thrift" ? 'حديث ومستعمل للرجال' :
                    catName === 'Soccer' ? 'كرة قدم رياضية' :
                    catName === 'Accessories' ? 'إكسسوارات' :
                    catName === 'Art' ? 'فنون' : 'مقتنيات'
                  ) : catName}</span>
                  {isSelected && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-black rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Sub Filter Capsules */}
          <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-none bg-white">
            {["Men's", 'Mixed Sizes', "Women's", 'Large', 'Vintage'].map((pill, idx) => {
              const isSelected = idx === 0; // "Men's" selected (black capsule)
              return (
                <button
                  key={pill}
                  onClick={() => {
                    if (pill === "Women's") setSelectedCategory('Fashion');
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-black shrink-0 transition-colors ${isSelected ? 'bg-black text-white' : 'bg-white text-zinc-900 border border-gray-200/80 hover:bg-gray-50'}`}
                >
                  {isAr ? (
                    pill === "Men's" ? 'رجالي' :
                    pill === 'Mixed Sizes' ? 'مقاسات متنوعة' :
                    pill === "Women's" ? 'نسائي' :
                    pill === 'Large' ? 'مقاس كبير' : 'كلاسيك'
                  ) : pill}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Channels listing Grid */}
      <div className="flex-grow px-4 pb-12">
        {filteredAuctions.length > 0 ? (
          activeTab === 'live' ? (
            /* Dual-column grid designed EXACTLY like the user's high-fidelity mockup */
            <div className="grid grid-cols-2 gap-3.5">
              {filteredAuctions.map(item => (
                <div 
                  key={item.id}
                  onClick={() => handleJoinLive(item.id)}
                  className="group flex flex-col cursor-pointer pb-2"
                >
                  {/* Card Body */}
                  <div className="aspect-[3/4.2] w-full relative overflow-hidden bg-zinc-950 rounded-[22px] shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-gray-100">
                    <img 
                      src={item.thumbnailUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-[1.03] duration-500 transition-transform"
                    />
                    {/* Dark gradient overlay for bottom-to-top legibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent z-10" />

                    {/* Top-left capsule: Today, time */}
                    <div className="absolute top-2.5 left-2.5 bg-white px-2.5 py-1 rounded-full z-20 shadow-sm">
                      <span className="text-[9px] font-extrabold text-black tracking-tight leading-none">
                        {isAr ? 'اليوم، 11:00 م' : 'Today, 11:00PM'}
                      </span>
                    </div>

                    {/* Top-right bookmark */}
                    <div className="absolute top-2.5 right-2.5 flex flex-col items-center gap-0.5 z-20">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLotId(item.id);
                        }}
                        className="p-1 rounded-full text-white/90 hover:scale-110 active:scale-95 transition-all text-shadow"
                      >
                        <Bookmark className="w-4 h-4 text-white hover:fill-current stroke-[2.5]" />
                      </button>
                      <span className="text-[10px] font-extrabold text-white leading-none font-mono drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.8)]">
                        {item.totalBids + 3}
                      </span>
                    </div>

                    {/* Bottom Info details inside the card */}
                    <div className="absolute bottom-3 inset-x-3 z-20 text-left flex flex-col justify-end">
                      <span className="text-[11px] font-extrabold text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] line-clamp-2 pr-1 select-none">
                        {item.title}
                      </span>
                      <div className="flex items-center gap-1 mt-1.5 text-[9px] font-black text-[#FFE500] drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.9)] uppercase tracking-tight select-none">
                        <span className="truncate max-w-[105px]">{isAr ? 'عرض مباشر ومستعمل' : "Men's Modern & Thrift"}</span>
                        <span className="w-1 h-1 bg-[#FFE500] rounded-full shrink-0" />
                        <span>{item.currentPrice} JD</span>
                      </div>
                    </div>
                  </div>

                  {/* Under the card avatar and name */}
                  <div className="mt-2 flex items-center gap-1 px-1 pb-1">
                    <span className="text-[11px] font-extrabold text-zinc-700 hover:text-black transition-all truncate leading-none">
                      {item.sellerName.toLowerCase().replace(/\s+/g, '')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Upcoming / Default Single Column Grid */
            <div className="grid grid-cols-1 gap-4">
              {filteredAuctions.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedLotId(item.id)}
                  className="group relative bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-md transition-all cursor-pointer flex flex-col"
                >
                  {/* Media Image Holder */}
                  <div className="aspect-[16/9] w-full relative overflow-hidden bg-[#1A1A1A]">
                    <img 
                      src={item.thumbnailUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>

                    {/* Top Overlays parameters */}
                    <div className="absolute top-3 left-3 right-3 flex justify-between items-center">
                      <span className="bg-red-600 text-white font-extrabold px-2.5 py-1 rounded-md text-[8.5px] tracking-wide flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 bg-white rounded-full"></span> {item.status.toUpperCase()}
                      </span>

                      <span className="bg-black/65 text-white font-mono text-[8.5px] px-2 py-0.5 rounded-md font-bold">
                        👁️ {item.viewersCount} {isAr ? 'متابع' : 'viewers'}
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
                      <img src={item.sellerLogo} alt="M" className="w-4.5 h-4.5 rounded-full object-cover" />
                      <span className="text-[9px] text-white font-bold">{item.sellerName}</span>
                    </div>
                  </div>

                  {/* Info Deck */}
                  <div className="p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-black text-gray-900 group-hover:text-[#FF6B00] transition-all leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50/80 p-3 rounded-xl mt-3 border border-gray-100">
                      <div>
                        <span className="text-[9px] text-gray-400 font-mono uppercase block">{isAr ? 'قيمة السعر الحالي' : 'CURRENT CALLING PRICE'}</span>
                        <span className="text-sm font-black font-mono text-gray-950 leading-none">
                          {item.currentPrice.toLocaleString()} <span className="text-[10px] text-[#FF6B00] font-bold">JOD</span>
                        </span>
                      </div>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinLive(item.id);
                        }}
                        className="bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-[11px] px-4 py-2 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,107,0,0.15)] uppercase"
                      >
                        {item.status === 'live' ? (isAr ? 'شاهد المزايدة' : 'JOIN STREAM') : (isAr ? 'عرض اللوت' : 'INSPECT LOT')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200/80 space-y-2">
            <Tv className="w-10 h-10 text-gray-300 mx-auto animate-bounce" />
            <h3 className="text-xs font-bold text-gray-500 uppercase">{isAr ? 'لم يعثر على مزادات نشطة مطابقة للبحث' : 'No auctions found'}</h3>
            <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
              {isAr ? 'غير شروط الفرز لعرض قائمة المعروضات الفاخرة الأخرى المتاحة حالياً.' : 'Reset filters or swap categories to view other hot premium slots.'}
            </p>
          </div>
        )}
      </div>

      {/* Render specification details slide modal */}
      {selectedLotId && (
        <AuctionDetailsModal 
          auctionId={selectedLotId} 
          onClose={() => setSelectedLotId(null)} 
        />
      )}

    </div>
  );
};
