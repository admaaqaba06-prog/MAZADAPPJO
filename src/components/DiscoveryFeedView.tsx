import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AuctionItem } from '../types';
import { translations } from '../utils/translations';
import { 
  Flame, 
  Search, 
  Clock, 
  Plus, 
  Car, 
  Laptop, 
  Gem,
  Smartphone,
  Shirt,
  LayoutGrid,
  Calendar,
  ArrowDown,
  Bookmark,
  Bell,
  ShieldCheck,
  Play
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { CountdownStoriesBar } from './CountdownStoriesBar';
import { AuctionCardSkeleton, EmptyState } from './FeedbackStates';
import { SellerProfileModal } from './SellerProfileModal';

export const DiscoveryFeedView: React.FC = () => {
  const { 
    auctions, 
    setActiveAuctionId, 
    setActiveView, 
    language, 
    setLanguage, 
    approveListing, 
    currentUser,
    notifications,
    setShowNotifications,
    sellerProfiles
  } = useApp();
  
  const unreadCount = notifications ? notifications.filter(n => !n.read).length : 0;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming'>('live');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  React.useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 550);
    return () => clearTimeout(timer);
  }, [selectedCategory, activeTab, searchTerm]);

  const t = translations[language];
  const isAr = language === 'ar';

  const categoriesList = [
    { name: 'All', icon: <LayoutGrid className="w-3.5 h-3.5" />, arName: 'الكل' },
    { name: 'Luxury', icon: <Gem className="w-3.5 h-3.5" />, arName: 'فاخر' },
    { name: 'Vehicles', icon: <Car className="w-3.5 h-3.5" />, arName: 'مركبات' },
    { name: 'Electronics', icon: <Laptop className="w-3.5 h-3.5" />, arName: 'إلكترونيات' },
    { name: 'Fashion', icon: <Shirt className="w-3.5 h-3.5" />, arName: 'أزياء' }
  ];

  const filteredAuctions = auctions.filter(item => {
    if (activeTab === 'live') {
      if (item.status !== 'live') return false;
      if (item.endTime && item.endTime <= Date.now()) return false;
    }
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

  const formatItemTimeLeft = (item?: AuctionItem) => {
    if (!item) return '12:30';
    if (!item.endTime) return '12:30';
    const secondsLeft = Math.max(0, Math.floor((item.endTime - Date.now()) / 1000));
    if (secondsLeft <= 0) return '00:00';
    const mm = Math.floor(secondsLeft / 60);
    const ss = secondsLeft % 60;
    return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  };

  const renderCardCover = (item?: AuctionItem, fallbackIcon?: React.ReactNode) => {
    if (item && item.thumbnailUrl) {
      return (
        <>
          <img 
            src={item.thumbnailUrl} 
            alt={item.title} 
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
        </>
      );
    } else if (item && item.videoUrl) {
      return (
        <>
          <video 
            src={item.videoUrl} 
            muted 
            playsInline 
            loop 
            autoPlay 
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10" />
        </>
      );
    } else {
      return (
        <div className="transform group-hover:scale-105 duration-300 transition-transform z-10">
          {fallbackIcon}
        </div>
      );
    }
  };

  const handleJoinLive = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-[#F7F6F3] pb-4 overscroll-contain select-none font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="discovery-feed-root"
    >
      
      {/* Top Mobile Bar Header - Exactly like the Screenshot, hidden on desktop */}
      <div className="p-4 flex items-center justify-between sticky top-0 bg-white z-40 lg:hidden">
        <div className="flex items-center gap-2">
          {/* Orange Brand Square M logo */}
          <div className="w-9 h-9 rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base shadow-sm">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gray-950 font-sans">
              {isAr ? 'مزاد جو' : 'Mazad Jo'}
            </h1>
          </div>
        </div>

        {/* Action Header controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-[11px] font-bold text-gray-700 font-sans transition-all shrink-0"
            id="discover-lang-btn"
          >
            {language === 'en' ? 'العربية' : 'EN'}
          </button>

          <button
            onClick={() => setShowNotifications(true)}
            className="relative p-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
            title={isAr ? 'الإشعارات' : 'Notifications'}
            id="mobile-header-bell"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#E85D04] text-white text-[7.5px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveView('upload')}
            className="px-3 py-1.5 border border-[#E85D04] bg-[#E85D04]/5 hover:bg-[#E85D04]/10 rounded-xl text-[11px] font-bold text-[#E85D04] flex items-center gap-1 transition-all shrink-0"
            id="sell-wizard-btn"
          >
            <Plus className="w-3 h-3 stroke-[3]" /> 
            <span>{isAr ? 'بيع' : 'Sell'}</span>
          </button>
        </div>
      </div>

      {/* Premium Desktop Page Header (Apple / Stripe Dashboard style) */}
      <div className="hidden lg:flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 mt-2" id="discover-desktop-header">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {isAr ? 'اكتشف المزادات الحية والنشطة' : 'Discover Live Drops'}
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            {isAr 
              ? 'تصفح وشارك في مزادات الفيديو الفورية والمؤمنة بالكامل لحمايتك وضمان أموالك.' 
              : 'Browse and bid in real-time verified video stream drops with secure Jordan CliQ escrow.'}
          </p>
        </div>
        <div>
          <button 
            onClick={() => {
              const firstLive = auctions.filter(a => a.status === 'live')[0] || auctions[0];
              if (firstLive) {
                setActiveAuctionId(firstLive.id);
              }
              setActiveView('live');
            }}
            className="px-4 py-2 bg-[#E85D04] hover:bg-[#D05303] text-white font-bold text-xs rounded-xl flex items-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isAr ? 'شاهد البث الآن' : 'Watch Live Drops'}</span>
          </button>
        </div>
      </div>

      {/* Hero Welcome Banner Card (Black Slate Vibe with Glow Accent) - Mobile only */}
      <div className="px-4 pb-2 lg:hidden">
        <div className="relative rounded-3xl bg-[#111111] p-5 overflow-hidden shadow-sm">
          {/* Circular subtle glowing background shape */}
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-orange-950/40 rounded-full blur-xl"></div>
          
          <div className="relative z-10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-[#E85D04] tracking-wider uppercase block">
                {isAr ? 'مزادات مباشرة' : 'LIVE AUCTIONS'}
              </span>
              <h2 className="text-xl font-black text-white leading-tight font-sans tracking-tight mt-1">
                {isAr ? 'زايد. اشترِ.' : 'Bid. Buy.'} <br/>
                {isAr ? 'بع — مباشر.' : 'Sell — Live.'}
              </h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 font-sans font-medium">
              {isAr ? 'مزادات فورية بالوقت الحقيقي مع حماية وضمان أموال المشترين.' : 'Real-time auctions with secure escrow payments.'}
            </p>
          </div>
        </div>
      </div>

      {/* Countdown Stories Bar - Horizontally Scrollable rectangular cards */}
      <CountdownStoriesBar />

      {/* Search Input bar with soft beige/gray layout bg */}
      <div className="p-4 space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder={isAr ? 'ابحث عن سيارات، ساعات رولكس، أراضي ونقاط البيع الفاخرة...' : 'Search Rolex, premium land slots...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full bg-[#F2F2EF] border border-transparent rounded-[18px] py-3.5 ${isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-xs font-medium text-gray-900 placeholder-gray-450 focus:outline-none focus:bg-white focus:border-gray-250 transition-all font-sans`}
          />
          <Search className={`absolute ${isAr ? 'right-4' : 'left-4'} top-4 w-4.5 h-4.5 text-gray-400`} />
        </div>

        {/* Elegant Horizontal Categories Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 font-sans">
          {categoriesList.map(cat => {
            const isSelected = selectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-xs' : 'bg-white text-gray-700 border-gray-200/80 hover:bg-gray-50'}`}
              >
                {cat.icon}
                <span>{isAr ? cat.arName : cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending Listings Banner (For Admins) */}
      {(() => {
        const pendingListingsToDisplay = auctions.filter(a => {
          if (a.status !== 'processing') return false;
          if (currentUser?.role === 'admin') return false;
          return a.sellerId === currentUser?.id;
        });

        if (pendingListingsToDisplay.length === 0) return null;

        return (
          <div className="mx-4 mb-4 p-4 bg-orange-50/70 border border-orange-100 rounded-2xl space-y-2.5">
            <div className="flex gap-2 items-start">
              <span className="w-2 h-2 bg-[#FF6B00] rounded-full mt-1.5 animate-ping shrink-0 animate-pulse"></span>
              <div>
                <h4 className="text-xs font-extrabold text-[#FF6B00] uppercase font-sans tracking-wide">
                  {isAr ? 'مزادك قيد المراجعة والتحقق' : 'YOUR UNDER REVIEW AUCTION'}
                </h4>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                  {isAr
                    ? 'لقد تم رفع معروضك بنجاح وهو الآن تحت مراجعة الإدارة بهدف حمايتك:'
                    : 'Your video stream asset successfully verified. It will appear live once approved:'}
                </p>
              </div>
            </div>
            
            <div className="space-y-2 pt-1 border-t border-orange-100">
              {pendingListingsToDisplay.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-white border border-gray-150 p-2 rounded-xl">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={item.thumbnailUrl} alt="Cover" className="w-8 h-8 rounded-lg object-cover border border-gray-150 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-gray-900 block truncate leading-tight">{item.title}</span>
                      <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                        {item.startingPrice.toLocaleString()} JOD
                      </span>
                    </div>
                  </div>
                  <span className="text-[9.5px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg">
                    {isAr ? '⏳ قيد المراجعة' : '⏳ IN REVIEW'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Tabs active live feed & upcoming drops with Fire & Calendar icon */}
      <div className="px-4 flex border-b border-gray-100 mb-3">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-3 text-center text-xs font-bold relative transition-all ${activeTab === 'live' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Flame className={`w-4 h-4 ${activeTab === 'live' ? 'text-[#E85D04] fill-[#E85D04] animate-pulse' : 'text-gray-400'}`} /> 
            {isAr ? 'بث مباشر نشط' : 'Active live feed'}
          </span>
          {activeTab === 'live' && (
            <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#E85D04] rounded-full"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-3 text-center text-xs font-bold relative transition-all ${activeTab === 'upcoming' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400" /> 
            {isAr ? 'مواعيد قادمة' : 'Upcoming drops'}
          </span>
          {activeTab === 'upcoming' && (
            <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#E85D04] rounded-full"></span>
          )}
        </button>
      </div>

      {/* Sub Filter Capsules Row matches screenshot */}
      {activeTab === 'live' && (
        <div className="w-full bg-white z-20 font-sans mb-3.5 px-1">
          <div className="flex gap-2 px-3 overflow-x-auto scrollbar-none bg-white">
            <button className="px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors bg-white text-gray-800 border border-gray-950">
              {isAr ? 'حديث ومستعمل للرجال' : "Men's modern & thrift"}
            </button>
            <button className="px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors bg-white text-gray-400 border border-gray-200">
              {isAr ? 'مستعمل مميز' : 'Thrift'}
            </button>
            <button className="px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors bg-white text-gray-400 border border-gray-200">
              {isAr ? 'كرة قدم رياضية' : 'Soccer'}
            </button>
            <button className="px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors bg-white text-gray-400 border border-gray-200">
              {isAr ? 'إكسسوارات' : 'Accessories'}
            </button>
          </div>
        </div>
      )}

      {/* Dual-Column High Fidelity grid list of live streams preview */}
      <div className="flex-grow px-4 pb-12">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <AuctionCardSkeleton key={n} />
            ))}
          </div>
        ) : filteredAuctions.length > 0 ? (
          activeTab === 'live' ? (
            <div className="relative">
              {/* Dual-column grid styled EXACTLY like the user's high-fidelity mockup */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {/* Simulated Grid Item 1: Phone card */}
                <div 
                  onClick={() => handleJoinLive(filteredAuctions[0]?.id || '')}
                  className="group flex flex-col cursor-pointer"
                >
                  <div className="aspect-[3/4] w-full relative overflow-hidden bg-[#1E1F35] rounded-3xl border border-gray-100 flex flex-col items-center justify-center p-4">
                    {/* Top right "LIVE" overlay */}
                    <div className="absolute top-2.5 right-2.5 bg-red-600 px-2.5 py-0.5 rounded-full z-20">
                      <span className="text-[8px] font-black text-white tracking-widest leading-none">LIVE</span>
                    </div>

                    {/* Dynamic Cover or Fallback Smartphone Icon */}
                    {renderCardCover(filteredAuctions[0], <Smartphone className="w-12 h-12 text-[#A8AEC6] stroke-[1.25]" />)}

                    {/* Bottom overlay: Timer */}
                    <div className="absolute bottom-2.5 right-2.5 bg-black/60 px-2 py-0.5 rounded-lg z-20 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-white/90" />
                      <span className="text-[9px] font-bold text-white font-mono leading-none mt-[1px]">
                        {formatItemTimeLeft(filteredAuctions[0])}
                      </span>
                    </div>
                  </div>

                  {/* Metadata below the card */}
                  <div className="mt-2 text-left">
                    <span className="text-xs font-bold text-gray-950 block truncate leading-tight">
                      {filteredAuctions[0] ? filteredAuctions[0].title : (isAr ? 'آيفون ١٥ برو ماكس' : 'iPhone 15 Pro Max')}
                    </span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-black text-[#E85D04]">
                        {filteredAuctions[0] ? `${filteredAuctions[0].currentPrice} JOD` : '280 JOD'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">
                        {filteredAuctions[0] ? `${filteredAuctions[0].totalBids || 0} ${isAr ? 'مزايدات' : 'bids'}` : (isAr ? '١٤ مزايدة' : '14 bids')}
                      </span>
                    </div>
                  </div>

                  {/* Bid Now Action Button as in Screenshot */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinLive(filteredAuctions[0]?.id || '');
                    }}
                    className="w-full py-2.5 mt-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-xl text-xs font-bold text-center transition-all cursor-pointer"
                  >
                    {isAr ? 'زايد الآن' : 'Bid now'}
                  </button>
                </div>

                {/* Simulated Grid Item 2: Vintage Jacket shirt card */}
                <div 
                  onClick={() => handleJoinLive(filteredAuctions[1]?.id || filteredAuctions[0]?.id || '')}
                  className="group flex flex-col cursor-pointer"
                >
                  <div className="aspect-[3/4] w-full relative overflow-hidden bg-[#0F2213] rounded-3xl border border-gray-100 flex flex-col items-center justify-center p-4">
                    {/* Top right "LIVE" overlay */}
                    <div className="absolute top-2.5 right-2.5 bg-red-600 px-2.5 py-0.5 rounded-full z-20">
                      <span className="text-[8px] font-black text-white tracking-widest leading-none">LIVE</span>
                    </div>

                    {/* Dynamic Cover or Fallback Shirt Icon */}
                    {renderCardCover(filteredAuctions[1], <Shirt className="w-12 h-12 text-[#2D6A4F] stroke-[1.25]" />)}

                    {/* Bottom overlay: Timer */}
                    <div className="absolute bottom-2.5 right-2.5 bg-black/60 px-2 py-0.5 rounded-lg z-20 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-white/90" />
                      <span className="text-[9px] font-bold text-white font-mono leading-none mt-[1px]">
                        {filteredAuctions[1] ? formatItemTimeLeft(filteredAuctions[1]) : '44:10'}
                      </span>
                    </div>
                  </div>

                  {/* Metadata below the card */}
                  <div className="mt-2 text-left">
                    <span className="text-xs font-bold text-gray-950 block truncate leading-tight">
                      {filteredAuctions[1] ? filteredAuctions[1].title : (isAr ? 'جاكيت فنتج' : 'Vintage Jacket')}
                    </span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-black text-[#E85D04]">
                        {filteredAuctions[1] ? `${filteredAuctions[1].currentPrice} JOD` : '38 JOD'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">
                        {filteredAuctions[1] ? `${filteredAuctions[1].totalBids || 0} ${isAr ? 'مزايدات' : 'bids'}` : (isAr ? '٧ مزايدات' : '7 bids')}
                      </span>
                    </div>
                  </div>

                  {/* Bid Now Action Button as in Screenshot */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinLive(filteredAuctions[1]?.id || filteredAuctions[0]?.id || '');
                    }}
                    className="w-full py-2.5 mt-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-xl text-xs font-bold text-center transition-all cursor-pointer"
                  >
                    {isAr ? 'زايد الآن' : 'Bid now'}
                  </button>
                </div>

                {/* Recursively support any other items cleanly with distinct stylized background colors depending on category */}
                {filteredAuctions.slice(2).map((item) => {
                  let bgCardColor = 'bg-[#1D1D1D]';
                  let itemDefaultIcon = <Gem className="w-12 h-12 text-[#DCA268] stroke-[1.25]" />;
                  
                  if (item.category === 'Luxury') {
                    bgCardColor = 'bg-[#211B14]';
                    itemDefaultIcon = <Gem className="w-12 h-12 text-[#DCA268] stroke-[1.25]" />;
                  } else if (item.category === 'Electronics') {
                    bgCardColor = 'bg-[#0E1B29]';
                    itemDefaultIcon = <Laptop className="w-12 h-12 text-[#9BCAE6] stroke-[1.25]" />;
                  } else if (item.category === 'Vehicles') {
                    bgCardColor = 'bg-[#1C2023]';
                    itemDefaultIcon = <Car className="w-12 h-12 text-gray-400 stroke-[1.25]" />;
                  } else if (item.category === 'Fashion' || item.category === 'أزياء') {
                    bgCardColor = 'bg-[#1E1122]';
                    itemDefaultIcon = <Shirt className="w-12 h-12 text-[#E29578] stroke-[1.25]" />;
                  }

                  return (
                    <div 
                      key={item.id}
                      onClick={() => handleJoinLive(item.id)}
                      className="group flex flex-col cursor-pointer"
                    >
                      <div className={`aspect-[3/4] w-full relative overflow-hidden ${bgCardColor} rounded-3xl border border-gray-100 flex flex-col items-center justify-center p-4`}>
                        {/* Top right "LIVE" overlay */}
                        <div className="absolute top-2.5 right-2.5 bg-red-600 px-2.5 py-0.5 rounded-full z-20">
                          <span className="text-[8px] font-black text-white tracking-widest leading-none">LIVE</span>
                        </div>

                        {/* Custom Dynamic Cover or default Category Icon */}
                        {renderCardCover(item, itemDefaultIcon)}

                        {/* Bottom overlay: Timer */}
                        <div className="absolute bottom-2.5 right-2.5 bg-black/60 px-2 py-0.5 rounded-lg z-20 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-white/90" />
                          <span className="text-[9px] font-bold text-white font-mono leading-none mt-[1px]">
                            {formatItemTimeLeft(item)}
                          </span>
                        </div>
                      </div>

                      {/* Metadata below the card */}
                      <div className="mt-2 text-left">
                        <span className="text-xs font-bold text-gray-950 block truncate leading-tight">
                          {item.title}
                        </span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm font-black text-[#E85D04]">{item.currentPrice} JOD</span>
                          <span className="text-[10px] font-bold text-gray-400">
                            {item.totalBids || 0} {isAr ? 'مزايدات' : 'bids'}
                          </span>
                        </div>
                      </div>

                      {/* Bid Now Action Button as in Screenshot */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinLive(item.id);
                        }}
                        className="w-full py-2.5 mt-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-xl text-xs font-bold text-center transition-all cursor-pointer"
                      >
                        {isAr ? 'زايد الآن' : 'Bid now'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Floating scroll down arrow indicator as in screenshot */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-10 z-30">
                <div className="w-10 h-10 rounded-full bg-white border border-gray-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.08)] flex items-center justify-center text-gray-900 animate-bounce cursor-pointer">
                  <ArrowDown className="w-5 h-5 stroke-[2.5]" />
                </div>
              </div>
            </div>
          ) : (
            /* Upcoming / Default Responsive Grid with exact style overlays */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {filteredAuctions.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedLotId(item.id)}
                  className="group relative bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col"
                >
                  <div className="aspect-[16/9] w-full relative overflow-hidden bg-[#1A1A1A]">
                    <img 
                      src={item.thumbnailUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>

                    {/* Top Overlays parameters */}
                    <div className="absolute top-3 left-3 right-3 flex justify-between items-center">
                      <span className="bg-red-600 text-white font-extrabold px-2.5 py-1 rounded-md text-[8.5px] tracking-wide flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-white rounded-full"></span> {item.status.toUpperCase()}
                      </span>

                      <span className="bg-black/65 text-white font-mono text-[8.5px] px-2 py-0.5 rounded-md font-bold">
                        👁️ {item.viewersCount} {isAr ? 'متابع' : 'viewers'}
                      </span>
                    </div>

                    {/* Seller Badge and Trust Score Overlay */}
                    {(() => {
                      const p = sellerProfiles?.find(profile => profile.userId === item.sellerId || profile.id === item.sellerId);
                      if (!p) {
                        return (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProfileId(item.sellerId);
                            }}
                            className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-xs px-2 py-1 rounded-lg z-20 cursor-pointer"
                          >
                            <img src={item.sellerLogo} alt="M" className="w-4.5 h-4.5 rounded-full object-cover animate-fade-in" />
                            <span className="text-[9px] text-white font-bold">{item.sellerName}</span>
                          </div>
                        );
                      }

                      const isPremium = p.verificationStatus === 'premium_verified';
                      const isVerified = p.verificationStatus === 'verified' || isPremium;
                      const score = p.trustScore || 85;

                      return (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfileId(p.userId);
                          }}
                          className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20"
                        >
                          <div className="flex items-center gap-1.5 bg-black/70 hover:bg-black/95 backdrop-blur-xs px-2.5 py-1 rounded-lg cursor-pointer max-w-[65%] truncate transition-all">
                            <img src={p.storeLogo || item.sellerLogo} alt="M" className="w-4.5 h-4.5 rounded-full object-cover" />
                            <span className="text-[9px] text-white font-extrabold truncate">{p.storeName}</span>
                            {isVerified && (
                              <ShieldCheck className={`w-3.5 h-3.5 ${isPremium ? 'text-amber-400' : 'text-emerald-400'} shrink-0`} />
                            )}
                          </div>
                          
                          <div className="bg-black/70 backdrop-blur-xs px-2 py-1 rounded-lg flex items-center gap-1 text-[8.5px] font-black text-orange-400 shadow-sm border border-white/5">
                            <span className="text-[7.5px] text-zinc-400 uppercase tracking-wide">TS</span>
                            <span>{score}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Info Deck */}
                  <div className="p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-black text-gray-900 group-hover:text-[#E85D04] transition-all leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-xl mt-3 border border-gray-100">
                      <div>
                        <span className="text-[9px] text-gray-400 font-mono uppercase block">{isAr ? 'قيمة السعر الحالي' : 'CURRENT CALLING PRICE'}</span>
                        <span className="text-sm font-black font-mono text-gray-950 leading-none">
                          {item.currentPrice.toLocaleString()} <span className="text-[10px] text-[#E85D04] font-bold">JOD</span>
                        </span>
                      </div>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinLive(item.id);
                        }}
                        className="bg-[#E85D04] hover:bg-orange-600 text-white font-black text-[11px] px-4 py-2 rounded-xl transition-all shadow-xs uppercase cursor-pointer"
                      >
                        {isAr ? 'شاهد التفاصيل' : 'JOIN STREAM'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState 
            title={auctions.length === 0 ? (isAr ? 'لا توجد مزادات بعد' : 'No auctions yet') : (isAr ? 'لم يتم العثور على أي مزادات مطابقة' : 'No auctions found')}
            description={auctions.length === 0 ? (isAr ? 'لا توجد أي مزادات نشطة أو مجدولة على المنصة حالياً.' : 'There are no active or scheduled auctions on the platform currently.') : (isAr ? 'يرجى تغيير فئة الفرز أو مسح كلمات البحث للوصول لمعروضات فاخرة أخرى.' : 'No active or upcoming slots match your filter conditions. Try changing categories or resetting search parameters.')}
            language={isAr ? 'ar' : 'en'}
          />
        )}
      </div>

      {/* Render specification details slide modal */}
      {selectedLotId && (
        <AuctionDetailsModal 
          auctionId={selectedLotId} 
          onClose={() => setSelectedLotId(null)} 
        />
      )}

      {/* Render Seller complete profile modal */}
      {selectedProfileId && (
        <SellerProfileModal 
          sellerId={selectedProfileId}
          isOpen={true}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

    </div>
  );
};
