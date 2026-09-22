import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { VideoUploadForm } from './VideoUploadForm';
import { resizeImage } from '../utils/resizeImage';
import { validateDescription } from '../utils/listingDescription';
import { draftHasMedia } from '../utils/listingMedia';
import {
  splitPhotos, promoteToCover, removePhoto, remainingSlots, MAX_LISTING_PHOTOS,
  type ListingPhoto,
} from '../utils/listingPhotos';
import { CATEGORIES } from '../utils/categories';
import {
  filesFromTransfer,
  isImageFile,
  checkCoverFile,
  MAX_COVER_BYTES,
  type MediaRefusal,
} from '../utils/mediaPickerState';
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

  /**
   * ONE photo list. The first photo is the cover.
   *
   * There used to be two separate uploads — "cover image" and "extra gallery
   * photos" — which asked a seller to understand what a cover WAS before they
   * could list a phone. They are the same medium; the split existed only
   * because the backend stores a thumbnail and a gallery in different fields.
   * That split now happens at submit (`splitPhotos`), where it is a storage
   * detail rather than a question put to the seller.
   */
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [photoError, setPhotoError] = useState<MediaRefusal | null>(null);

  /**
   * One intake for every photo, used by the picker AND the drop, so validation
   * cannot diverge between them.
   *
   * EVERY file is checked, not just the first. The old code ran `checkCoverFile`
   * on the cover and nothing at all on gallery photos — which was survivable
   * only while the two were different things. Now any photo can be promoted to
   * cover, so a gallery photo that skipped the size check would fail at upload
   * against the 20MB ceiling in `storage.rules` after the seller had already
   * filled in the whole form.
   */
  const addPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPhotoError(null);
    const accepted: ListingPhoto[] = [];
    let refusal: MediaRefusal | null = null;
    for (const file of Array.from(files)) {
      const check = checkCoverFile(file);
      if (!check.ok) { refusal = refusal ?? (check.reason ?? 'wrong_type'); continue; }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (refusal) setPhotoError(refusal);
    if (accepted.length === 0) return;
    setPhotos(prev => {
      const room = remainingSlots(prev);
      // Revoke what does not fit rather than leaking the blobs for photos the
      // seller never sees.
      accepted.slice(room).forEach(p => URL.revokeObjectURL(p.url));
      return [...prev, ...accepted.slice(0, room)];
    });
  };

  const dropPhoto = (idx: number) => {
    setPhotos(prev => {
      const going = prev[idx];
      if (going) URL.revokeObjectURL(going.url);
      return removePhoto(prev, idx);
    });
  };

  /** "Use this one as the cover" — moves it to the front. */
  const makeCover = (idx: number) => setPhotos(prev => promoteToCover(prev, idx));

  // The shape the backend still wants: a thumbnail and a gallery. Derived here
  // so `createListing` and the media gate below are untouched by the UI change.
  const { cover: coverPhoto, gallery: galleryPhotos } = splitPhotos(photos);
  const rawThumbnailFile = coverPhoto?.file ?? null;
  const customThumbnailUrl = coverPhoto?.url ?? null;
  const extraPhotos = galleryPhotos;

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

    // Video is OPTIONAL. What a listing actually needs is SOME media, which is
    // the one rule in utils/listingMedia (`draftHasMedia`) that the admin drop
    // builder already uses — a video, a cover image, or a gallery photo will do.
    // This used to demand a video specifically, which failed otherwise-complete
    // submissions that had a perfectly good cover photo.
    if (!draftHasMedia({ thumbnailFile: rawThumbnailFile ?? customThumbnailUrl, videoFile: rawVideoFile ?? customVideoUrl, gallery: extraPhotos })) {
      alert(isAr
        ? 'أضف وسائط واحدة على الأقل: فيديو أو صورة غلاف.'
        : 'Add at least one piece of media: a video or a cover image.');
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
      /* A PLAIN container that grows with its content. It must not be a scroll
         container, and this is not a style preference — it was the bug.
         `#sell-view-root` is the scroll owner for the whole seller flow, and
         this element sat inside it carrying `overflow-y-auto overscroll-contain`.
         Measured at 375x812 with the wizard's real content:

           #sell-view-root        client 812   scroll 1656  → it has the overflow
           #listing-wizard-root   client 1616  scroll 1616  → nothing to scroll

         So this was a scroll container that could NEVER scroll: it lives in a
         `min-h-full` flex wrapper inside a scrolling parent, so `flex-1` simply
         let it grow to its content. `overscroll-behavior` still applies to it
         though — it applies to any scroll container, scrollable or not — and
         `contain` means "do not chain this gesture to my ancestors". Chrome
         Android and Samsung Internet honour that literally: a touch drag that
         begins in here is swallowed instead of being handed to the ancestor
         that actually scrolls. iOS Safari and desktop chain anyway, which is
         why the flow scrolled fine on iPhone and on a laptop.

         Either removing `overflow-y-auto` or removing `overscroll-contain`
         clears it, but both go: leaving a dead scroll container behind is a
         trap that returns the moment a layout change makes it scrollable. The
         `flex-1 min-h-0` pair goes with them — they only shaped a scroll box
         that should not exist. */
      className="w-full flex flex-col bg-surface-raised pb-4 select-none font-sans text-fg"
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
                  {isAr ? 'فيديو المعروض والمنتج (اختياري)' : 'Product Video (Optional)'}
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
              {/* STEP 1.5 — Photos. ONE picker; the first photo is the cover. */}
              <div className="space-y-2.5">
                <label className="text-xs lg:text-sm font-extrabold text-fg flex items-center gap-1.5">
                  <span className="text-[#FF6B00]">①.⑤</span>
                  {isAr ? 'صور المنتج' : 'Product Photos'}
                </label>
                <p className="text-[11px] text-fg-muted font-medium -mt-1">
                  {isAr
                    ? 'أول صورة تصير صورة الغلاف تلقائياً. تقدر تغيّرها بضغطة.'
                    : 'The first photo becomes the cover automatically. Tap any other to change it.'}
                </p>

                <div className="bg-surface-raised rounded-2xl border border-line p-4">
                  <div
                    className={`grid grid-cols-3 gap-2 rounded-xl transition-colors ${photoDragOver ? 'ring-2 ring-[#F05123] bg-accent-weak' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
                    onDragLeave={() => setPhotoDragOver(false)}
                    onDrop={(e) => {
                      // preventDefault or the browser navigates to the dropped
                      // image and the whole form is lost.
                      e.preventDefault();
                      setPhotoDragOver(false);
                      const dropped = filesFromTransfer(e.dataTransfer, isImageFile);
                      const dt = new DataTransfer();
                      dropped.forEach(f => dt.items.add(f));
                      addPhotos(dt.files);
                    }}
                  >
                    {photos.map((photo, idx) => (
                      <div key={photo.url} className="relative rounded-xl overflow-hidden bg-black aspect-square">
                        <img src={photo.url} alt={`${idx + 1}`} className="w-full h-full object-cover" />

                        {idx === 0 ? (
                          <span className="absolute bottom-1 start-1 bg-[#F05123] text-white rounded-md px-1.5 py-0.5 text-[9px] font-black">
                            {isAr ? 'الغلاف' : 'Cover'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => makeCover(idx)}
                            className="absolute bottom-1 start-1 bg-black/70 hover:bg-[#F05123] text-white rounded-md px-1.5 py-0.5 text-[9px] font-bold cursor-pointer transition-colors"
                          >
                            {isAr ? 'اجعلها الغلاف' : 'Make cover'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => dropPhoto(idx)}
                          aria-label={isAr ? 'حذف الصورة' : 'Remove photo'}
                          className="absolute top-1 end-1 bg-red-600 hover:bg-red-700 text-white rounded-md px-1.5 py-0.5 text-[9px] font-bold cursor-pointer"
                        >
                          {isAr ? 'حذف' : 'Remove'}
                        </button>
                      </div>
                    ))}

                    {remainingSlots(photos) > 0 && (
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-line rounded-xl aspect-square cursor-pointer hover:bg-surface-sunken transition-colors">
                        <span className="text-xl">📸</span>
                        <span className="text-[10px] font-bold text-fg-muted mt-1 text-center px-1">
                          {photos.length === 0
                            ? (isAr ? 'أضف صور' : 'Add photos')
                            : (isAr ? 'إضافة صورة' : 'Add photo')}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
                        />
                      </label>
                    )}
                  </div>

                  {photoError && (
                    <p className="mt-2 text-[11px] font-bold text-danger" role="alert">
                      {photoError === 'wrong_type'
                        ? (isAr ? 'أحد الملفات ليس صورة. الصور فقط.' : 'One of those files is not an image. Images only.')
                        : (isAr
                            ? `إحدى الصور أكبر من ${MAX_COVER_BYTES / (1024 * 1024)} ميجابايت.`
                            : `One of those images is larger than ${MAX_COVER_BYTES / (1024 * 1024)}MB.`)}
                    </p>
                  )}

                  <p className="text-[10px] text-fg-muted mt-2 font-medium">
                    {isAr
                      ? `حتى ${MAX_LISTING_PHOTOS} صور. يستطيع المزايدون التنقل بينها داخل غرفة المزاد.`
                      : `Up to ${MAX_LISTING_PHOTOS} photos. Bidders can swipe through them inside the live room.`}
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
