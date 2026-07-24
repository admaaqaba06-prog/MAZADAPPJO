import React, { useState, useEffect } from 'react';
import { useApp, useAuctions } from '../context/AppContext';
import { isAdminUser } from '../utils/adminAuth';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Sparkles, 
  Check, 
  ArrowLeft, 
  Layers, 
  Info, 
  ChevronRight, 
  Tag, 
  Eye, 
  X, 
  Image as ImageIcon,
  Save,
  CheckCircle,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

interface CuratedDrop {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  bannerUrl: string;
  releaseTime: number; // Unix timestamp
  auctionIds: string[];
  status: 'draft' | 'scheduled' | 'live' | 'completed';
  sellerId: string;
  createdAt: number;
}

const PRESET_BANNERS = [
  {
    name: 'Luxury Watches',
    url: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=1200',
  },
  {
    name: 'Supercars & Vehicles',
    url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=1200',
  },
  {
    name: 'Premium Tech',
    url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=1200',
  },
];

export const DropBuilderView: React.FC = () => {
  const { currentUser, language, setActiveView } = useApp();
  const { auctions } = useAuctions();
  const isAr = language === 'ar';

  const [drops, setDrops] = useState<CuratedDrop[]>(() => {
    try {
      const saved = localStorage.getItem('mazad_curated_drops');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    // Return initial seed drops if none exist
    return [
      {
        id: 'drop-1',
        titleEn: 'Amman Luxury Swiss Chronometers',
        titleAr: 'مجموعة الساعات السويسرية الفاخرة عمان',
        descriptionEn: 'An ultra-exclusive selection of authenticated vintage and modern Swiss timepieces featuring Rolex, Omega, and Audemars Piguet.',
        descriptionAr: 'تشكيلة حصرية للغاية من الساعات السويسرية الفاخرة والموثقة كلاسيك والحديثة بما في ذلك رولكس، أوميغا، وأوديمار بيغيه.',
        bannerUrl: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=1200',
        releaseTime: Date.now() + 3600 * 1000 * 24 * 2, // 2 days from now
        auctionIds: ['auction-rolex', 'auction-omega'],
        status: 'scheduled',
        sellerId: currentUser?.id || 'admin',
        createdAt: Date.now() - 3600 * 1000 * 12,
      }
    ];
  });

  // State for creating/editing a drop
  const [isCreating, setIsCreating] = useState(false);
  const [editingDropId, setEditingDropId] = useState<string | null>(null);

  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [bannerUrl, setBannerUrl] = useState(PRESET_BANNERS[0].url);
  const [releaseDate, setReleaseDate] = useState('');
  const [releaseTime, setReleaseTime] = useState('');
  const [selectedAuctions, setSelectedAuctions] = useState<string[]>([]);
  const [dropStatus, setDropStatus] = useState<CuratedDrop['status']>('scheduled');

  // Preview modal state
  const [previewDrop, setPreviewDrop] = useState<CuratedDrop | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Save drops to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('mazad_curated_drops', JSON.stringify(drops));
  }, [drops]);

  // Clean-up or fetch seller-specific/all auctions
  const sellerAuctions = auctions.filter(a => {
    // If admin, they can see/use all auctions to curate a drop.
    // If seller, only their own upcoming/live auctions.
    const isAdmin = isAdminUser(currentUser);
    if (isAdmin) return true;
    return a.sellerId === currentUser?.id;
  });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleOpenCreate = () => {
    setTitleEn('');
    setTitleAr('');
    setDescriptionEn('');
    setDescriptionAr('');
    setBannerUrl(PRESET_BANNERS[0].url);
    
    // Default release time to tomorrow at 8 PM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    setReleaseDate(`${yyyy}-${mm}-${dd}`);
    setReleaseTime('20:00');
    
    setSelectedAuctions([]);
    setDropStatus('scheduled');
    setEditingDropId(null);
    setIsCreating(true);
  };

  const handleOpenEdit = (drop: CuratedDrop) => {
    setTitleEn(drop.titleEn);
    setTitleAr(drop.titleAr);
    setDescriptionEn(drop.descriptionEn);
    setDescriptionAr(drop.descriptionAr);
    setBannerUrl(drop.bannerUrl);
    
    const d = new Date(drop.releaseTime);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setReleaseDate(`${yyyy}-${mm}-${dd}`);
    
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    setReleaseTime(`${hh}:${min}`);
    
    setSelectedAuctions(drop.auctionIds);
    setDropStatus(drop.status);
    setEditingDropId(drop.id);
    setIsCreating(true);
  };

  const handleDeleteDrop = (id: string) => {
    if (window.confirm(isAr ? 'هل أنت متأكد من رغبتك في حذف هذا المجموعة المجدولة؟' : 'Are you sure you want to delete this scheduled drop?')) {
      setDrops(prev => prev.filter(d => d.id !== id));
      triggerToast(isAr ? 'تم حذف مجموعة الإطلاق بنجاح' : 'Drop deleted successfully');
    }
  };

  const handleSaveDrop = (e: React.FormEvent) => {
    e.preventDefault();

    const finalTitleEn = titleEn.trim() || 'Exclusive Curated Drop';
    const finalTitleAr = titleAr.trim() || 'مجموعة إطلاق حصرية متميزة';
    const finalDescEn = descriptionEn.trim() || 'A handpicked luxury batch of premium items releasing on schedule.';
    const finalDescAr = descriptionAr.trim() || 'مجموعة فاخرة ومختارة بعناية من السلع المميزة تطلق في الوقت المحدد.';

    // Calculate Unix timestamp
    const dt = new Date(`${releaseDate}T${releaseTime}`);
    const releaseTimestamp = isNaN(dt.getTime()) ? Date.now() + 3600 * 1000 * 24 : dt.getTime();

    if (editingDropId) {
      // Edit mode
      setDrops(prev => prev.map(d => {
        if (d.id === editingDropId) {
          return {
            ...d,
            titleEn: finalTitleEn,
            titleAr: finalTitleAr,
            descriptionEn: finalDescEn,
            descriptionAr: finalDescAr,
            bannerUrl: bannerUrl,
            releaseTime: releaseTimestamp,
            auctionIds: selectedAuctions,
            status: dropStatus,
          };
        }
        return d;
      }));
      triggerToast(isAr ? 'تم تحديث مجموعة الإطلاق بنجاح!' : 'Drop updated successfully!');
    } else {
      // Create mode
      const newDrop: CuratedDrop = {
        id: `drop-${Date.now()}`,
        titleEn: finalTitleEn,
        titleAr: finalTitleAr,
        descriptionEn: finalDescEn,
        descriptionAr: finalDescAr,
        bannerUrl: bannerUrl,
        releaseTime: releaseTimestamp,
        auctionIds: selectedAuctions,
        status: dropStatus,
        sellerId: currentUser?.id || 'admin',
        createdAt: Date.now(),
      };
      setDrops(prev => [newDrop, ...prev]);
      triggerToast(isAr ? 'تم إنشاء مجموعة الإطلاق وجدولتها بنجاح!' : 'Curated Drop created and scheduled successfully!');
    }

    setIsCreating(false);
    setEditingDropId(null);
  };

  const toggleAuctionSelection = (auctionId: string) => {
    setSelectedAuctions(prev => {
      if (prev.includes(auctionId)) {
        return prev.filter(id => id !== auctionId);
      } else {
        return [...prev, auctionId];
      }
    });
  };

  // Helper to format remaining time
  const formatCountdown = (targetTime: number) => {
    const diff = targetTime - Date.now();
    if (diff <= 0) {
      return isAr ? 'مباشر الآن' : 'LIVE NOW';
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return isAr 
        ? `${days} يوم و ${hours} ساعة`
        : `${days}d ${hours}h`;
    }
    return isAr 
      ? `${hours} ساعة و ${mins} دقيقة`
      : `${hours}h ${mins}m`;
  };

  // Filter listings based on search
  const filteredAuctions = sellerAuctions.filter(a => {
    const term = searchQuery.toLowerCase();
    return a.title.toLowerCase().includes(term) || a.description.toLowerCase().includes(term);
  });

  return (
    <div className="flex-1 min-h-0 bg-[#090909] text-white overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans">
      
      {/* Toast Alert */}
      {showToast && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 bg-zinc-900 border-2 border-[#FF6B00] text-white rounded-2xl p-4 shadow-2xl z-50 flex items-center gap-3 animate-slide-in">
          <div className="p-2 bg-orange-500/10 rounded-xl text-[#FF6B00]">
            <CheckCircle className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold">{toastMessage}</p>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10 space-y-8 pb-24">
        
        {/* Navigation / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="space-y-1">
            <button 
              onClick={() => setActiveView('seller-center')}
              className="group flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors uppercase font-mono font-bold tracking-widest mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              {isAr ? 'العودة لمركز البائع' : 'Back to Seller Center'}
            </button>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-orange-500/10 rounded-xl text-[#FF6B00]">
                <Layers className="w-5 h-5" />
              </span>
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight font-sans">
                {isAr ? 'منشئ مجموعات الإطلاق (Drops)' : 'Curated Drop Builder'}
              </h1>
            </div>
            <p className="text-zinc-400 text-sm">
              {isAr 
                ? 'قم بتنظيم مجموعات حصرية من المزادات وإطلاقها كمهرجانات تسوق مجدولة للجمهور.' 
                : 'Organize high-profile curated batches of luxury auctions to release together on schedule.'}
            </p>
          </div>

          {!isCreating && (
            <button
              onClick={handleOpenCreate}
              className="bg-[#E85D04] hover:bg-orange-500 text-white font-black px-6 py-3 rounded-2xl text-sm tracking-wide uppercase transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-900/20 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {isAr ? 'إنشاء مجموعة إطلاق جديدة' : 'Create Curated Drop'}
            </button>
          )}
        </div>

        {/* ----------------- CREATE / EDIT DROP VIEW ----------------- */}
        {isCreating ? (
          <form onSubmit={handleSaveDrop} className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Form Side */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Meta details card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6">
                  <h3 className="text-lg font-bold uppercase tracking-wider font-sans text-orange-500 border-b border-zinc-800 pb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    {isAr ? '1. تفاصيل مجموعة الإطلاق' : '1. Drop Metadata Details'}
                  </h3>

                  {/* English Fields */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono">
                        {isAr ? 'العنوان بالإنجليزية' : 'Title (English)'}
                      </label>
                      <span className="text-[10px] text-zinc-500 uppercase font-mono">Required</span>
                    </div>
                    <input 
                      type="text"
                      value={titleEn}
                      onChange={(e) => setTitleEn(e.target.value)}
                      required
                      placeholder="e.g. Vintage Swiss Timepieces Drop"
                      className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                    />

                    <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pt-1">
                      {isAr ? 'الوصف بالإنجليزية' : 'Description (English)'}
                    </label>
                    <textarea 
                      value={descriptionEn}
                      onChange={(e) => setDescriptionEn(e.target.value)}
                      rows={3}
                      placeholder="e.g. Hand-selected, fully authenticated premium Swiss watches including Rolex Oyster Perpetual..."
                      className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors resize-none"
                    />
                  </div>

                  <hr className="border-zinc-800 my-4" />

                  {/* Arabic Fields */}
                  <div className="space-y-4 text-right" dir={isAr ? 'rtl' : 'ltr'}>
                    <div className="flex items-center justify-between flex-row-reverse">
                      <label className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono">
                        {isAr ? 'العنوان بالعربية' : 'Title (Arabic)'}
                      </label>
                      <span className="text-[10px] text-zinc-500 uppercase font-mono">{isAr ? 'مطلوب' : 'Required'}</span>
                    </div>
                    <input 
                      type="text"
                      value={titleAr}
                      onChange={(e) => setTitleAr(e.target.value)}
                      required
                      placeholder="مثال: مجموعة الساعات السويسرية العريقة"
                      className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors text-right"
                    />

                    <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pt-1 text-right">
                      {isAr ? 'الوصف بالعربية' : 'Description (Arabic)'}
                    </label>
                    <textarea 
                      value={descriptionAr}
                      onChange={(e) => setDescriptionAr(e.target.value)}
                      rows={3}
                      placeholder="مثال: تشكيلة فاخرة من الساعات السويسرية الكلاسيكية والرياضية الموثقة بالكامل..."
                      className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors resize-none text-right"
                    />
                  </div>

                  {/* Status Selection */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 font-mono mb-2">
                        {isAr ? 'حالة الإطلاق' : 'Drop Status'}
                      </label>
                      <select
                        value={dropStatus}
                        onChange={(e) => setDropStatus(e.target.value as CuratedDrop['status'])}
                        className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      >
                        <option value="draft">{isAr ? 'مسودة' : 'Draft'}</option>
                        <option value="scheduled">{isAr ? 'مجدول' : 'Scheduled'}</option>
                        <option value="live">{isAr ? 'مباشر الآن' : 'Live Now'}</option>
                        <option value="completed">{isAr ? 'مكتمل' : 'Completed'}</option>
                      </select>
                    </div>

                    {/* Banner Image Custom Input */}
                    <div>
                      <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 font-mono mb-2">
                        {isAr ? 'رابط صورة الغلاف' : 'Custom Banner Image URL'}
                      </label>
                      <input 
                        type="url"
                        value={bannerUrl}
                        onChange={(e) => setBannerUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Preset Banner Images */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 font-mono">
                      {isAr ? 'أو اختر غلافاً جاهزاً' : 'Or Pick a Premium Theme Preset Banner'}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {PRESET_BANNERS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setBannerUrl(p.url)}
                          className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all ${
                            bannerUrl === p.url ? 'border-[#FF6B00] scale-[0.98]' : 'border-zinc-800 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-1 text-center">
                            <span className="text-[10px] font-bold text-white leading-tight">{p.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Date & Scheduling card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 md:p-8 space-y-4">
                  <h3 className="text-lg font-bold uppercase tracking-wider font-sans text-orange-500 border-b border-zinc-800 pb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {isAr ? '2. توقيت وجدولة الإطلاق الفائق' : '2. Scheduled Launch Timer'}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono">
                        {isAr ? 'تاريخ الإطلاق' : 'Release Date'}
                      </label>
                      <div className="relative">
                        <input 
                          type="date"
                          value={releaseDate}
                          onChange={(e) => setReleaseDate(e.target.value)}
                          required
                          className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono">
                        {isAr ? 'توقيت الإطلاق' : 'Release Time'}
                      </label>
                      <div className="relative">
                        <input 
                          type="time"
                          value={releaseTime}
                          onChange={(e) => setReleaseTime(e.target.value)}
                          required
                          className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-orange-500/5 rounded-2xl border border-orange-500/10 flex items-start gap-3 mt-4 text-xs text-orange-400">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {isAr
                        ? 'عند حلول هذا التوقيت، ستظهر المجموعات في واجهة المستخدم العامة كإطلاق مباشر فائق مفعم بالبث الحي والتنافس التفاعلي.'
                        : 'On scheduled release, this drop will instantly convert from "Scheduled" to "Live Now" to capture maximum buyer excitement.'}
                    </p>
                  </div>
                </div>

              </div>

              {/* Selection Side (List of seller's listings) */}
              <div className="lg:col-span-1 space-y-6">
                
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6">
                  <div className="border-b border-zinc-800 pb-3">
                    <h3 className="text-lg font-bold uppercase tracking-wider font-sans text-orange-500 flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      {isAr ? '3. اختيار المزادات' : '3. Curate Auctions'}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {isAr 
                        ? `اختر من مزاداتك المتوفرة (${sellerAuctions.length}) لضمها للإطلاق.` 
                        : `Select which of your active auctions (${sellerAuctions.length}) belong in this drop.`}
                    </p>
                  </div>

                  {/* Search filter */}
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isAr ? 'ابحث في مزاداتك المتاحة...' : 'Search your available auctions...'}
                    className="w-full bg-black border border-zinc-800 focus:border-[#FF6B00] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />

                  {/* Checklist of Auctions */}
                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {filteredAuctions.length === 0 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                        <p className="text-xs text-zinc-500">
                          {isAr ? 'لا يوجد مزادات متطابقة أو متاحة حالياً.' : 'No matching or available auctions found.'}
                        </p>
                      </div>
                    ) : (
                      filteredAuctions.map(a => {
                        const isSelected = selectedAuctions.includes(a.id);
                        return (
                          <div 
                            key={a.id}
                            onClick={() => toggleAuctionSelection(a.id)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex gap-3 items-center ${
                              isSelected 
                                ? 'border-[#FF6B00] bg-orange-500/5' 
                                : 'border-zinc-800 bg-black hover:border-zinc-700'
                            }`}
                          >
                            <img 
                              src={a.thumbnailUrl || 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&q=80&w=300'} 
                              alt={a.title} 
                              className="w-12 h-12 rounded-xl object-cover border border-zinc-800 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate text-white">{a.title}</p>
                              <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                {isAr ? `السعر الابتدائي: ${a.startingPrice} د.أ` : `Start: ${a.startingPrice} JOD`}
                              </p>
                              <span className={`inline-block px-1.5 py-0.5 text-[8px] font-bold rounded uppercase mt-1 ${
                                a.status === 'upcoming' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                {a.status}
                              </span>
                            </div>
                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? 'border-[#FF6B00] bg-[#FF6B00] text-white' : 'border-zinc-700 bg-zinc-900'
                            }`}>
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="bg-black/40 border border-zinc-800 p-4 rounded-2xl flex justify-between items-center text-xs">
                    <span className="text-zinc-400">{isAr ? 'عدد السلع المحددة:' : 'Selected items:'}</span>
                    <span className="font-mono font-bold text-orange-500 text-sm bg-orange-500/10 px-2.5 py-0.5 rounded-lg">
                      {selectedAuctions.length}
                    </span>
                  </div>

                </div>

              </div>

            </div>

            {/* Actions Bar */}
            <div className="border-t border-zinc-800 pt-6 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white font-bold px-6 py-3 rounded-2xl text-xs uppercase tracking-wider transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              
              <button
                type="submit"
                className="w-full sm:w-auto bg-gradient-to-r from-[#E85D04] to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-orange-950/30 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingDropId ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'جدولة وإطلاق' : 'Schedule Drop')}
              </button>
            </div>
          </form>
        ) : (
          
          /* ----------------- CURATED DROPS DASHBOARD ----------------- */
          <div className="space-y-6">
            
            {/* Summary counters widget */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500">
                  {isAr ? 'إجمالي المجموعات' : 'Total Drops'}
                </span>
                <p className="text-2xl font-black font-mono text-white">{drops.length}</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500">
                  {isAr ? 'مجدولة للإطلاق' : 'Scheduled'}
                </span>
                <p className="text-2xl font-black font-mono text-amber-400">
                  {drops.filter(d => d.status === 'scheduled').length}
                </p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500">
                  {isAr ? 'نشط الآن' : 'Live Now'}
                </span>
                <p className="text-2xl font-black font-mono text-emerald-400">
                  {drops.filter(d => d.status === 'live').length}
                </p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500">
                  {isAr ? 'السلع المجدولة' : 'Curated Items'}
                </span>
                <p className="text-2xl font-black font-mono text-orange-500">
                  {drops.reduce((sum, d) => sum + d.auctionIds.length, 0)}
                </p>
              </div>
            </div>

            {/* Curated drops lists */}
            {drops.length === 0 ? (
              <div className="bg-zinc-900/20 border border-zinc-800 border-dashed rounded-3xl py-16 text-center max-w-xl mx-auto space-y-4">
                <Layers className="w-12 h-12 text-zinc-600 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white uppercase">
                    {isAr ? 'لا توجد مجموعات إطلاق مصممة حالياً' : 'No Drops Configured Yet'}
                  </h4>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                    {isAr 
                      ? 'ابدأ بضم مجموعة من المزادات المميزة لجدولتها في مهرجان تسوق فائق وجذب المزايدين الأردنيين.' 
                      : 'Curate luxury collections and schedules to gain maximum momentum during launch festivals.'}
                  </p>
                </div>
                <button
                  onClick={handleOpenCreate}
                  className="bg-[#E85D04] hover:bg-orange-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {isAr ? 'أنشئ أول إطلاق مجدول' : 'Create First Curated Drop'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {drops.map((drop) => {
                  const itemsCount = drop.auctionIds.length;
                  const isScheduled = drop.status === 'scheduled';
                  const isLive = drop.status === 'live';
                  
                  return (
                    <div 
                      key={drop.id} 
                      className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col h-full shadow-lg group hover:border-zinc-700 transition-all duration-300"
                    >
                      {/* Banner Visual header */}
                      <div className="relative h-44 shrink-0 overflow-hidden bg-zinc-950">
                        <img 
                          src={drop.bannerUrl || PRESET_BANNERS[0].url} 
                          alt={isAr ? drop.titleAr : drop.titleEn} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                        
                        {/* Badges overlay */}
                        <div className="absolute top-3 left-3 flex gap-2">
                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider font-mono border ${
                            isLive 
                              ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                              : isScheduled 
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                              : 'bg-zinc-500/20 text-zinc-400 border-zinc-600/30'
                          }`}>
                            {isLive ? (isAr ? 'مباشر الآن' : 'LIVE') : isScheduled ? (isAr ? 'مجدول' : 'SCHEDULED') : drop.status}
                          </span>

                          <span className="bg-black/60 backdrop-blur-md text-white border border-zinc-800 px-2 py-0.5 rounded-lg text-[10px] font-black font-mono">
                            {itemsCount} {isAr ? 'مزاد' : 'ITEMS'}
                          </span>
                        </div>

                        {/* Title inside card */}
                        <div className="absolute bottom-3 left-3 right-3 text-left">
                          <h4 className="text-base font-black uppercase tracking-tight text-white drop-shadow-md">
                            {isAr ? drop.titleAr : drop.titleEn}
                          </h4>
                        </div>
                      </div>

                      {/* Content block */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        
                        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                          {isAr ? drop.descriptionAr : drop.descriptionEn}
                        </p>

                        <div className="bg-black/40 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[#FF6B00]">
                            <Clock className="w-4 h-4 shrink-0" />
                            <span className="text-[10px] uppercase font-bold tracking-widest font-mono text-zinc-500">
                              {isAr ? 'الوقت المتبقي:' : 'Starts In:'}
                            </span>
                          </div>
                          <span className="text-xs font-black font-mono text-zinc-200">
                            {formatCountdown(drop.releaseTime)}
                          </span>
                        </div>

                        {/* Curated list mini previews */}
                        {itemsCount > 0 && (
                          <div className="space-y-1.5">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 font-mono">
                              {isAr ? 'معاينة السلع المدرجة:' : 'Curated Items List:'}
                            </span>
                            <div className="flex -space-x-2 overflow-hidden">
                              {drop.auctionIds.map((id, index) => {
                                const matchedItem = auctions.find(a => a.id === id);
                                if (!matchedItem) return null;
                                return (
                                  <img
                                    key={id}
                                    src={matchedItem.thumbnailUrl || 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&q=80&w=200'}
                                    alt={matchedItem.title}
                                    title={matchedItem.title}
                                    className="w-7 h-7 rounded-full object-cover border-2 border-zinc-900 ring-1 ring-zinc-700/50"
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Actions bar inside card */}
                        <div className="flex items-center gap-2 border-t border-zinc-800 pt-4 mt-auto">
                          
                          {/* Live preview */}
                          <button
                            onClick={() => setPreviewDrop(drop)}
                            className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 border border-zinc-800"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isAr ? 'معاينة حية' : 'Live Preview'}
                          </button>

                          {/* Edit drop */}
                          <button
                            onClick={() => handleOpenEdit(drop)}
                            className="bg-zinc-900 hover:bg-zinc-800 text-amber-500 hover:text-amber-400 font-bold p-2 rounded-xl text-xs transition-colors border border-zinc-800"
                            title={isAr ? 'تعديل المجموعة' : 'Edit Drop'}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete drop */}
                          <button
                            onClick={() => handleDeleteDrop(drop.id)}
                            className="bg-zinc-900 hover:bg-rose-950 text-rose-500 hover:text-rose-400 font-bold p-2 rounded-xl text-xs transition-colors border border-zinc-800"
                            title={isAr ? 'حذف المجموعة' : 'Delete Drop'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

      </div>

      {/* ----------------- GORGEOUS IMMERSIVE DROP PREVIEW MODAL ----------------- */}
      {previewDrop && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-lg z-50 overflow-y-auto p-4 md:p-8 animate-fade-in">
          
          <div className="max-w-4xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative">
            
            {/* Close Button */}
            <button
              onClick={() => setPreviewDrop(null)}
              className="absolute top-4 right-4 bg-black/60 hover:bg-zinc-900 text-zinc-400 hover:text-white p-2.5 rounded-full border border-zinc-800 transition-colors z-50"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Immersive Banner */}
            <div className="relative h-64 md:h-80 w-full overflow-hidden">
              <img 
                src={previewDrop.bannerUrl || PRESET_BANNERS[0].url} 
                alt="Curated Banner"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
              
              {/* Floating badges */}
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="bg-orange-500/20 backdrop-blur-md text-[#FF6B00] border border-[#FF6B00]/30 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase font-mono">
                  {isAr ? 'إطلاق خاص وحصري' : 'EXCLUSIVE SHOPPING EVENT'}
                </span>
              </div>

              {/* Header Title / details */}
              <div className="absolute bottom-6 left-6 right-6 text-left">
                <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white mb-2">
                  {isAr ? previewDrop.titleAr : previewDrop.titleEn}
                </h2>
                <p className="text-zinc-300 text-xs md:text-sm max-w-2xl leading-relaxed">
                  {isAr ? previewDrop.descriptionAr : previewDrop.descriptionEn}
                </p>
              </div>
            </div>

            {/* Simulated Live Countdown Segment */}
            <div className="bg-zinc-900/80 border-y border-zinc-800 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-xl text-[#FF6B00]">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 font-mono">
                    {isAr ? 'مؤقت تنازلي للإطلاق الفائق' : 'LAUNCH FESTIVAL COUNTDOWN'}
                  </p>
                  <p className="text-sm font-bold text-zinc-300">
                    {isAr 
                      ? `يبدأ في: ${new Date(previewDrop.releaseTime).toLocaleString('ar-JO')}` 
                      : `Scheduled: ${new Date(previewDrop.releaseTime).toLocaleString('en-US')}`}
                  </p>
                </div>
              </div>

              {/* Large countdown elements */}
              <div className="flex items-center gap-2 font-mono text-white">
                <div className="bg-black/60 border border-zinc-800 px-3 py-2 rounded-xl text-center min-w-14">
                  <span className="block text-lg font-black">{Math.max(0, Math.floor((previewDrop.releaseTime - Date.now()) / (1000 * 60 * 60 * 24)))}</span>
                  <span className="block text-[8px] text-zinc-500 uppercase font-sans">Days</span>
                </div>
                <span className="text-orange-500 font-black animate-pulse">:</span>
                <div className="bg-black/60 border border-zinc-800 px-3 py-2 rounded-xl text-center min-w-14">
                  <span className="block text-lg font-black">{Math.max(0, Math.floor(((previewDrop.releaseTime - Date.now()) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)))}</span>
                  <span className="block text-[8px] text-zinc-500 uppercase font-sans">Hrs</span>
                </div>
                <span className="text-orange-500 font-black animate-pulse">:</span>
                <div className="bg-black/60 border border-zinc-800 px-3 py-2 rounded-xl text-center min-w-14">
                  <span className="block text-lg font-black">{Math.max(0, Math.floor(((previewDrop.releaseTime - Date.now()) % (1000 * 60 * 60)) / (1000 * 60)))}</span>
                  <span className="block text-[8px] text-zinc-500 uppercase font-sans">Mins</span>
                </div>
              </div>
            </div>

            {/* List of included Auction items inside the Drop */}
            <div className="p-6 md:p-8 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 font-mono">
                {isAr ? 'السلع المشمولة في هذا الإطلاق فائق الجودة:' : 'ITEMS CURATED IN THIS EXCLUSIVE DROP:'}
              </h3>

              {previewDrop.auctionIds.length === 0 ? (
                <div className="text-center py-12 bg-black/40 rounded-2xl border border-zinc-800 border-dashed">
                  <Tag className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">
                    {isAr ? 'لا توجد سلع مدرجة في هذه الإطلاق حتى الآن.' : 'No items have been curated into this drop yet.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previewDrop.auctionIds.map((id) => {
                    const item = auctions.find(a => a.id === id);
                    if (!item) return null;
                    return (
                      <div 
                        key={id} 
                        className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 flex gap-4 hover:border-zinc-700 transition-colors"
                      >
                        <img 
                          src={item.thumbnailUrl || 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&q=80&w=200'} 
                          alt={item.title} 
                          className="w-16 h-16 rounded-xl object-cover shrink-0 border border-zinc-800"
                        />
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-black text-white uppercase truncate">{item.title}</h4>
                            <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{item.description}</p>
                          </div>
                          
                          <div className="flex items-center justify-between pt-1">
                            <div>
                              <span className="block text-[8px] uppercase tracking-widest text-zinc-500 font-mono">Starting At</span>
                              <span className="text-xs font-bold text-orange-400 font-mono">{item.startingPrice} JOD</span>
                            </div>
                            <span className="bg-orange-500/10 text-orange-400 border border-orange-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase font-mono tracking-widest">
                              {item.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer view */}
            <div className="bg-zinc-900/20 border-t border-zinc-800 p-6 flex justify-end">
              <button
                onClick={() => setPreviewDrop(null)}
                className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors"
              >
                {isAr ? 'إغلاق المعاينة' : 'Close Preview'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
