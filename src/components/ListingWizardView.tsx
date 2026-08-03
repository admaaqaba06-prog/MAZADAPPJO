import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { VideoUploadForm } from './VideoUploadForm';
import { resizeImage } from '../utils/resizeImage';
import { validateDescription } from '../utils/listingDescription';
import { CATEGORIES } from '../utils/categories';
import { Sparkles, CheckCircle, Loader2, Video, Image as ImageIcon, Save } from 'lucide-react';

interface ListingWizardViewProps {
  /**
   * Wave E2: when hosted inside SellView, the wizard hands off to the shared
   * "submitted for review" success screen instead of redirecting to discovery.
   */
  onDone?: () => void;
}

export const ListingWizardView: React.FC<ListingWizardViewProps> = ({ onDone }) => {
  const { createListing, setActiveView, language } = useApp();
  const isAr = language === 'ar';

  // Step state configurations
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  // Canonical value from utils/categories.ts. It used to be a local union whose
  // Watches option stored 'Luxury' — a value no Discover chip matched, so every
  // watch a seller listed was unfindable under any category filter.
  const [category, setCategory] = useState<string>('Electronics');
  const [duration, setDuration] = useState('3600'); // Default: 1 Hour (in seconds)

  // Video assets references
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [rawVideoFile, setRawVideoFile] = useState<File | null>(null);

  // Thumbnail assets references
  const [customThumbnailUrl, setCustomThumbnailUrl] = useState<string | null>(null);
  const [rawThumbnailFile, setRawThumbnailFile] = useState<File | null>(null);

  // Wave 2 (media gallery): up to 3 EXTRA photos beyond the cover → mediaUrls
  const [extraPhotos, setExtraPhotos] = useState<{ file: File; url: string }[]>([]);

  const addExtraPhotos = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter(f => f.type.startsWith('image/'));
    setExtraPhotos(prev =>
      [...prev, ...incoming.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, 3)
    );
  };

  const removeExtraPhoto = (idx: number) => {
    setExtraPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // Wave 4: required listing-time ownership + legality attestation
  const [ownershipAttested, setOwnershipAttested] = useState(false);

  // Success flow trigger & progress indicators
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'video' | 'thumbnail' | 'saving' | 'done' | null>(null);

  // One taxonomy, shared with the drop builder, the concierge form, the
  // Discover chips and the Algolia facet map. The old local array offered two
  // labels ("Phones" and "Electronics") that wrote the SAME value, and had no
  // Real Estate option despite the value and its chip both existing.
  const categoriesOpt = CATEGORIES.map(c => ({
    label: isAr ? c.labelAr : c.labelEn,
    value: c.value,
  }));

  // Duration Options in seconds
  const durationPresets = [
    { label: isAr ? '١٠ دقائق' : '10 min', value: '600' },
    { label: isAr ? '١ ساعة' : '1 Hour', value: '3600' },
    { label: isAr ? '٣ ساعات' : '3 Hours', value: '10800' },
    { label: isAr ? '٦ ساعات' : '6 Hours', value: '21600' },
    { label: isAr ? '٢٤ ساعة' : '24 Hours', value: '86400' }
  ];

  const handleSimulatedListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customVideoUrl) {
      alert(isAr ? 'الرجاء رفع فيديو أولاً.' : 'Please upload a video first.');
      return;
    }
    if (!title.trim()) {
      alert(isAr ? 'الرجاء إدخال اسم المنتج.' : 'Please enter the product name.');
      return;
    }
    const descCheck = validateDescription(description, isAr);
    if (!descCheck.ok) {
      alert(descCheck.message);
      return;
    }
    if (!startingPrice || isNaN(Number(startingPrice)) || Number(startingPrice) <= 0) {
      alert(isAr ? 'حدد سعر بدء صحيح بالدينار الأردني.' : 'Specify correct JOD price.');
      return;
    }
    if (!ownershipAttested) {
      alert(isAr
        ? 'يجب الإقرار بأن الغرض ملكك وقانوني للبيع في الأردن قبل النشر.'
        : 'You must confirm you own this item and it is legal to sell in Jordan before publishing.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage('video');

    try {
      // Wave 2 (media gallery): upload the extra gallery photos first (same
      // storage path pattern SellView's concierge extras use). Non-fatal on
      // failure — the listing still publishes with the cover + video.
      const extraPhotoUrls: string[] = [];
      if (extraPhotos.length > 0) {
        try {
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
          const { getFirebaseStorage } = await import('../services/firebase');
          const storage = await getFirebaseStorage();
          for (const photo of extraPhotos) {
            // Shrink to a card-friendly size before upload — same reasoning
            // as the cover thumbnail (createListing's uploadWithFallback).
            // Never throws; falls back to the original file untouched.
            const resized = await resizeImage(photo.file);
            const path = `auction-thumbnails/${Date.now()}_gallery_${photo.file.name}`;
            const snap = await uploadBytes(ref(storage, path), resized, {
              contentType: resized.type || photo.file.type || 'image/jpeg'
            });
            extraPhotoUrls.push(await getDownloadURL(snap.ref));
          }
        } catch (photoErr) {
          console.warn('Extra gallery photo upload failed (continuing):', photoErr);
        }
      }

      // Save under 'processing' state so Admin can click and instantly release
      await createListing({
        title,
        description: description.trim(),
        category,
        startingPrice: Number(startingPrice),
        minIncrement: Math.max(5, Math.round(Number(startingPrice) * 0.05)), // Auto-computed to keep it non-technical
        videoUrl: customVideoUrl || '',
        thumbnailUrl: customThumbnailUrl || '',
        mediaUrls: extraPhotoUrls,
        endTime: Date.now() + Number(duration) * 1000,
        duration: Number(duration),
        isFeatured: false
      }, rawVideoFile, rawThumbnailFile, (progress, stage) => {
        setUploadProgress(Math.round(progress));
        setUploadStage(stage);
      });
      
      if (onDone) {
        // Hosted in SellView: show the shared review-gate success screen.
        onDone();
        return;
      }
      setUploadStage('done');
      setTimeout(() => {
        setActiveView('discovery');
      }, 1800);
    } catch (err: any) {
      console.error("Failed to upload listing:", err);
      alert(isAr ? `فشل رفع المزاد: ${err.message || err}` : `Failed to upload listing: ${err.message || err}`);
    } finally {
      setIsUploading(false);
      setUploadStage(null);
    }
  };

  return (
    <div 
      className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col bg-surface-raised pb-4 overscroll-contain select-none font-sans text-fg"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="listing-wizard-root"
    >
      {/* Dynamic Success & Upload Progress View with Real Info */}
      {isUploading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 text-center min-h-[400px]" id="upload-success-screen">
          {uploadStage === 'done' ? (
            <>
              <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 scale-110 animate-bounce shadow-sm">
                <CheckCircle className="w-10 h-10" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-black text-emerald-600">
                  {isAr ? 'تم إطلاق المزاد بنجاح! 🚀' : 'Auction Created Successfully! 🚀'}
                </h3>
                <p className="text-xs text-fg-muted font-medium">
                  {isAr ? 'تم نشر معروضك، سيتم توجيهك إلى صفحة الاستكشاف تلقائياً...' : 'Your listing is live, redirecting to discovery feed now...'}
                </p>
              </div>
            </>
          ) : (
            <div className="w-full max-w-sm bg-surface-sunken border border-line rounded-3xl p-8 shadow-sm flex flex-col items-center space-y-6">
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-[#FF6B00] animate-spin stroke-[1.5]" />
                <div className="absolute text-xs font-bold text-fg">
                  {uploadProgress}%
                </div>
              </div>

              <div className="space-y-2 w-full text-center">
                <h3 className="text-base font-black text-fg flex items-center justify-center gap-2">
                  {uploadStage === 'video' && (
                    <>
                      <Video className="w-5 h-5 text-[#FF6B00] animate-pulse" />
                      <span>{isAr ? 'جاري رفع فيديو المنتج...' : 'Uploading product video...'}</span>
                    </>
                  )}
                  {uploadStage === 'thumbnail' && (
                    <>
                      <ImageIcon className="w-5 h-5 text-[#FF6B00] animate-pulse" />
                      <span>{isAr ? 'جاري رفع صورة الغلاف...' : 'Uploading cover photo...'}</span>
                    </>
                  )}
                  {uploadStage === 'saving' && (
                    <>
                      <Save className="w-5 h-5 text-[#FF6B00] animate-pulse" />
                      <span>{isAr ? 'جاري حفظ بيانات المزاد...' : 'Finalizing auction details...'}</span>
                    </>
                  )}
                </h3>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mt-1">
                  <div 
                    className="bg-gradient-to-r from-[#FF6B00] to-orange-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>

                <p className="text-xs text-fg-muted pt-1 font-medium leading-relaxed">
                  {isAr 
                    ? 'يرجى إبقاء هذه الصفحة مفتوحة. قد يستغرق رفع الفيديو عالي الدقة بعض الوقت تبعاً لسرعة الإنترنت لديك.' 
                    : 'Please keep this window open. High-quality video uploads may take a minute depending on your internet connection speed.'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-md lg:max-w-5xl mx-auto w-full p-4 lg:p-8 space-y-6">
          {/* Header */}
          <div className="text-center pb-2">
            <h2 className="text-sm lg:text-lg font-black tracking-wider text-[#FF6B00] uppercase font-mono">
              {isAr ? 'استديو إنشاء المزاد' : 'LOT CREATION STUDIO'}
            </h2>
            <p className="text-[10px] lg:text-xs text-fg-muted mt-1">
              {isAr ? 'انشر منتجك للجميع بفيديو تفاعلي وبث حي' : 'Broadcast your product directly with live video auctions'}
            </p>
          </div>

          <form onSubmit={handleSimulatedListingSubmit} className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-10" id="listing-wizard-form">
            
            {/* LEFT COLUMN: Media Upload */}
            <div className="space-y-6">
              {/* STEP 1 — Video */}
              <div className="space-y-2.5">
                <label className="text-xs lg:text-sm font-extrabold text-fg flex items-center gap-1.5">
                  <span className="text-[#FF6B00]">①</span> 
                  {isAr ? 'فيديو المعروض والمنتج' : 'Product Video'}
                </label>
                
                <div className="bg-surface-raised rounded-2xl">
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
                <label className="text-xs lg:text-sm font-extrabold text-fg flex items-center gap-1.5">
                  <span className="text-[#FF6B00]">①.⑤</span> 
                  {isAr ? 'صورة غلاف المزاد (اختياري)' : 'Auction Thumbnail Image (Optional)'}
                </label>
                
                <div className="bg-surface-raised rounded-2xl border border-line p-4">
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
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-line rounded-xl p-6 cursor-pointer hover:bg-surface-sunken transition-colors">
                      <span className="text-2xl">🖼️</span>
                      <span className="text-xs font-bold text-fg-muted mt-2">
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

              {/* STEP 1.6 — Extra gallery photos (Wave 2 media gallery) */}
              <div className="space-y-2.5">
                <label className="text-xs lg:text-sm font-extrabold text-fg flex items-center gap-1.5">
                  <span className="text-[#FF6B00]">①.⑥</span>
                  {isAr ? 'صور إضافية للمعرض (حتى ٣ — اختياري)' : 'Extra Gallery Photos (up to 3 — Optional)'}
                </label>

                <div className="bg-surface-raised rounded-2xl border border-line p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {extraPhotos.map((photo, idx) => (
                      <div key={photo.url} className="relative rounded-xl overflow-hidden bg-black aspect-square">
                        <img src={photo.url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeExtraPhoto(idx)}
                          className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-md px-1.5 py-0.5 text-[9px] font-bold cursor-pointer"
                        >
                          {isAr ? 'حذف' : 'Remove'}
                        </button>
                      </div>
                    ))}
                    {extraPhotos.length < 3 && (
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-line rounded-xl aspect-square cursor-pointer hover:bg-surface-sunken transition-colors">
                        <span className="text-xl">📸</span>
                        <span className="text-[10px] font-bold text-fg-muted mt-1 text-center px-1">
                          {isAr ? 'إضافة صورة' : 'Add photo'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            addExtraPhotos(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[10px] text-fg-muted mt-2 font-medium">
                    {isAr
                      ? 'يستطيع المزايدون التنقل بين هذه الصور داخل غرفة المزاد.'
                      : 'Bidders can swipe through these photos inside the live room.'}
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Details Form */}
            <div className="space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                {/* STEP 2 — Product Info */}
                <div className="space-y-4">
                  <label className="text-xs lg:text-sm font-extrabold text-fg flex items-center gap-1.5 border-b border-line pb-1">
                    <span className="text-[#FF6B00]">②</span> 
                    {isAr ? 'بيانات ومواصفات المنتج' : 'Product Information'}
                  </label>

                  {/* Input Name */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-fg-muted block">
                      {isAr ? 'اسم المنتج' : 'Product Name'}
                    </span>
                    <input 
                      type="text" 
                      placeholder={isAr ? 'مثال: iPhone 15 Pro Max' : 'e.g. iPhone 15 Pro Max'}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-surface-sunken border border-line rounded-xl py-3 px-4 text-xs font-semibold text-fg placeholder-gray-400 focus:outline-none focus:bg-surface-raised focus:border-[#FF6B00] transition-colors leading-none"
                    />
                  </div>

                  {/* Input Description */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-fg-muted block">
                      {isAr ? 'وصف المنتج' : 'Product Description'}
                    </span>
                    {/* maxLength is the ONLY cap on this value: firestore.rules has
                        no auction-description size rule (its size() <= 500 rule is
                        notifications), so without it a 5,000-character description
                        reaches the doc and Task 3's clamp. */}
                    <textarea
                      rows={3}
                      maxLength={1000}
                      placeholder={isAr
                        ? 'الحالة، ما يشمله البيع، وأي عيب أو خدش. كل ما يريد المشتري معرفته قبل المزايدة.'
                        : "Condition, what's included, and any flaw. Everything a bidder wants to know before bidding."}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-surface-sunken border border-line rounded-xl py-3 px-4 text-xs font-semibold text-fg placeholder-gray-400 focus:outline-none focus:bg-surface-raised focus:border-[#FF6B00] transition-colors resize-none leading-relaxed"
                    />
                  </div>

                  {/* Input Price */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-fg-muted block">
                      {isAr ? 'السعر الابتدائي بالدينار' : 'Starting Price (JOD)'}
                    </span>
                    <input 
                      type="number" 
                      placeholder="100"
                      value={startingPrice}
                      onChange={(e) => setStartingPrice(e.target.value)}
                      className="w-full bg-surface-sunken border border-line rounded-xl py-3 px-4 text-xs font-semibold text-fg placeholder-gray-400 focus:outline-none focus:bg-surface-raised focus:border-[#FF6B00] transition-colors leading-none"
                    />
                  </div>

                  {/* Select Category */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-fg-muted block">
                      {isAr ? 'الفئة' : 'Category'}
                    </span>
                    <div className="relative">
                      <select 
                        value={category} 
                        onChange={(e) => setCategory(e.target.value as any)}
                        className="w-full bg-surface-sunken border border-line rounded-xl py-3 px-4 text-xs font-semibold text-fg focus:outline-none focus:bg-surface-raised focus:border-[#FF6B00] transition-colors appearance-none cursor-pointer"
                      >
                        {categoriesOpt.map((opt, idx) => (
                          <option key={idx} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className={`absolute inset-y-0 ${isAr ? 'left-4' : 'right-4'} flex items-center pointer-events-none text-fg-muted`}>
                        ▼
                      </div>
                    </div>
                  </div>
                </div>

                {/* STEP 3 — Duration */}
                <div className="space-y-3">
                  <label className="text-xs lg:text-sm font-extrabold text-fg flex items-center gap-1.5 border-b border-line pb-1">
                    <span className="text-[#FF6B00]">③</span> 
                    {isAr ? 'مدة صلاحية المزاد' : 'Auction Duration'}
                  </label>

                  <div className="grid grid-cols-5 gap-1 md:gap-2">
                    {durationPresets.map((opt) => {
                      const isSelected = duration === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDuration(opt.value)}
                          className={`py-3.5 px-1 md:px-2 rounded-xl text-[10px] md:text-[11px] font-bold transition-all text-center border cursor-pointer ${
                            isSelected 
                              ? 'bg-[#FF6B00] border-transparent text-white shadow-sm' 
                              : 'bg-surface-raised border-line text-fg-muted hover:border-line'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Wave 4 — required ownership + legality attestation */}
              <label
                className="flex items-start gap-2.5 bg-surface-sunken border border-line rounded-xl p-3.5 cursor-pointer select-none"
                id="wizard-ownership-attestation"
              >
                <input
                  type="checkbox"
                  checked={ownershipAttested}
                  onChange={(e) => setOwnershipAttested(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[#FF6B00] cursor-pointer"
                />
                <span className="text-[11px] font-bold text-fg leading-relaxed">
                  {isAr
                    ? 'أُقرّ بأن هذا الغرض ملكي وقانوني للبيع في الأردن'
                    : 'I confirm I own this item and it is legal to sell in Jordan.'}
                </span>
              </label>

              {/* SUBMIT BUTTON */}
              <div className="pt-4 lg:pt-8">
                <button 
                  type="submit" 
                  className="w-full h-14 bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 border border-transparent cursor-pointer"
                  id="wizard-form-submit-btn"
                >
                  <span>{isAr ? '🚀 نشر المزاد' : '🚀 Publish Auction'}</span>
                </button>
              </div>
            </div>

          </form>
        </div>
      )}
    </div>
  );
};
