import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { VideoUploadForm } from './VideoUploadForm';
import { Sparkles, CheckCircle } from 'lucide-react';

export const ListingWizardView: React.FC = () => {
  const { createListing, setActiveView, language } = useApp();
  const isAr = language === 'ar';

  // Step state configurations
  const [title, setTitle] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [category, setCategory] = useState<'Electronics' | 'Luxury' | 'Vehicles' | 'Fashion' | 'Real Estate'>('Electronics');
  const [duration, setDuration] = useState('3600'); // Default: 1 Hour (in seconds)

  // Video assets references
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [rawVideoFile, setRawVideoFile] = useState<File | null>(null);

  // Thumbnail assets references
  const [customThumbnailUrl, setCustomThumbnailUrl] = useState<string | null>(null);
  const [rawThumbnailFile, setRawThumbnailFile] = useState<File | null>(null);

  // Success flow trigger
  const [isUploading, setIsUploading] = useState(false);

  // Categories map to Arabic names and backend values
  const categoriesOpt = [
    { label: isAr ? 'هواتف' : 'Phones', value: 'Electronics' as const },
    { label: isAr ? 'ساعات' : 'Watches', value: 'Luxury' as const },
    { label: isAr ? 'سيارات' : 'Cars', value: 'Vehicles' as const },
    { label: isAr ? 'أجهزة' : 'Electronics', value: 'Electronics' as const },
    { label: isAr ? 'أخرى' : 'Other', value: 'Fashion' as const }
  ];

  // Duration Options in seconds
  const durationPresets = [
    { label: isAr ? '١ ساعة' : '1 Hour', value: '3600' },
    { label: isAr ? '٣ ساعات' : '3 Hours', value: '10800' },
    { label: isAr ? '٦ ساعات' : '6 Hours', value: '21600' },
    { label: isAr ? '٢٤ ساعة' : '24 Hours', value: '86400' }
  ];

  const handleSimulatedListingSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customVideoUrl) {
      alert(isAr ? 'الرجاء رفع فيديو أولاً.' : 'Please upload a video first.');
      return;
    }
    if (!title.trim()) {
      alert(isAr ? 'الرجاء إدخال اسم المنتج.' : 'Please enter the product name.');
      return;
    }
    if (!startingPrice || isNaN(Number(startingPrice)) || Number(startingPrice) <= 0) {
      alert(isAr ? 'حدد سعر بدء صحيح بالدينار الأردني.' : 'Specify correct JOD price.');
      return;
    }

    setIsUploading(true);

    // Save under 'processing' state so Admin can click and instantly release
    createListing({
      title,
      description: isAr ? `معروض مميز: ${title}` : `Premium Lot: ${title}`,
      category,
      startingPrice: Number(startingPrice),
      minIncrement: Math.max(5, Math.round(Number(startingPrice) * 0.05)), // Auto-computed to keep it non-technical
      videoUrl: customVideoUrl,
      thumbnailUrl: customThumbnailUrl || 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=500&q=80',
      endTime: Date.now() + Number(duration) * 1000,
      duration: Number(duration),
      isFeatured: false
    }, rawVideoFile, rawThumbnailFile);

    // Auto-redirect to home after 3 seconds
    setTimeout(() => {
      setIsUploading(false);
      setActiveView('discovery');
    }, 3000);
  };

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-white pb-4 overscroll-contain select-none font-sans text-gray-800"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="listing-wizard-root"
    >
      {/* Dynamic Success View with Animation */}
      {isUploading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-5 text-center min-h-[400px]" id="upload-success-screen">
          <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 scale-110 animate-bounce shadow-sm">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-black text-emerald-600">
              {isAr ? 'تم إطلاق المزاد مباشرة بنجاح! 🚀' : 'Live Auction Released Instantly! 🚀'}
            </h3>
            <p className="text-xs text-gray-400">
              {isAr ? 'سيتم توجيهك إلى المزاد تلقائياً خلال ٣ ثوانٍ...' : 'Auto-redirecting you home within 3 seconds...'}
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-md mx-auto w-full p-4 space-y-6">
          {/* Header */}
          <div className="text-center pb-2">
            <h2 className="text-sm font-black tracking-wider text-[#FF6B00] uppercase font-mono">
              {isAr ? 'استديو إنشاء المزاد' : 'LOT CREATION STUDIO'}
            </h2>
            <p className="text-[10px] text-gray-400 mt-1">
              {isAr ? 'انشر منتجك للجميع بفيديو تفاعلي وبث حي' : 'Broadcast your product directly with live video auctions'}
            </p>
          </div>

          <form onSubmit={handleSimulatedListingSubmit} className="space-y-6" id="listing-wizard-form">
            
            {/* STEP 1 — Video */}
            <div className="space-y-2.5">
              <label className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                <span className="text-[#FF6B00]">①</span> 
                {isAr ? 'فيديو المعروض والمنتج' : 'Product Video'}
              </label>
              
              <div className="bg-white rounded-2xl">
                <VideoUploadForm 
                  onVideoSelect={(file, url) => {
                    setCustomVideoUrl(url);
                    setRawVideoFile(file);
                  }} 
                  language={language} 
                />
              </div>
            </div>

            {/* STEP 1.5 — Thumbnail Image */}
            <div className="space-y-2.5">
              <label className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
                <span className="text-[#FF6B00]">①.⑤</span> 
                {isAr ? 'صورة غلاف المزاد (اختياري)' : 'Auction Thumbnail Image (Optional)'}
              </label>
              
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                {customThumbnailUrl ? (
                  <div className="relative rounded-xl overflow-hidden max-h-[160px] bg-black">
                    <img src={customThumbnailUrl} alt="Thumbnail Preview" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        setRawThumbnailFile(null);
                        setCustomThumbnailUrl(null);
                      }}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-2 py-1 text-[10px] font-bold cursor-pointer"
                    >
                      {isAr ? 'حذف صورة الغلاف' : 'Remove Cover'}
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                    <span className="text-2xl">🖼️</span>
                    <span className="text-xs font-bold text-gray-600 mt-2">
                      {isAr ? 'اضغط لرفع صورة غلاف' : 'Click to upload a cover image'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setRawThumbnailFile(file);
                          setCustomThumbnailUrl(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* STEP 2 — Product Info */}
            <div className="space-y-4 pt-1">
              <label className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5 border-b border-gray-100 pb-1">
                <span className="text-[#FF6B00]">②</span> 
                {isAr ? 'بيانات ومواصفات المنتج' : 'Product Information'}
              </label>

              {/* Input Name */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-gray-500 block">
                  {isAr ? 'اسم المنتج' : 'Product Name'}
                </span>
                <input 
                  type="text" 
                  placeholder={isAr ? 'مثال: iPhone 15 Pro Max' : 'e.g. iPhone 15 Pro Max'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-xs font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors leading-none"
                />
              </div>

              {/* Input Price */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-gray-500 block">
                  {isAr ? 'السعر الابتدائي بالدينار' : 'Starting Price (JOD)'}
                </span>
                <input 
                  type="number" 
                  placeholder="100"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-xs font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors leading-none"
                />
              </div>

              {/* Select Category */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-gray-500 block">
                  {isAr ? 'الفئة' : 'Category'}
                </span>
                <div className="relative">
                  <select 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-xs font-semibold text-gray-900 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors appearance-none cursor-pointer"
                  >
                    {categoriesOpt.map((opt, idx) => (
                      <option key={idx} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className={`absolute inset-y-0 ${isAr ? 'left-4' : 'right-4'} flex items-center pointer-events-none text-gray-400`}>
                    ▼
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 3 — Duration */}
            <div className="space-y-3 pt-1">
              <label className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5 border-b border-gray-100 pb-1">
                <span className="text-[#FF6B00]">③</span> 
                {isAr ? 'مدة صلاحية المزاد' : 'Auction Duration'}
              </label>

              <div className="grid grid-cols-4 gap-2">
                {durationPresets.map((opt) => {
                  const isSelected = duration === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDuration(opt.value)}
                      className={`py-3.5 px-2 rounded-xl text-[11px] font-bold transition-all text-center border cursor-pointer ${
                        isSelected 
                          ? 'bg-[#FF6B00] border-transparent text-white shadow-sm' 
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-4">
              <button 
                type="submit" 
                className="w-full h-14 bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 border border-transparent cursor-pointer"
                id="wizard-form-submit-btn"
              >
                <span>{isAr ? '🚀 نشر المزاد' : '🚀 Publish Auction'}</span>
              </button>
            </div>

          </form>
        </div>
      )}
    </div>
  );
};
