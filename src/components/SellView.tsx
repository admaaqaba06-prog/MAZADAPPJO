import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { ListingWizardView } from './ListingWizardView';
import { DROP_CHANNELS, channelToCategory, type DropChannel } from '../utils/dropChannel';
import { resizeImage } from '../utils/resizeImage';
import { hasRealPhoto } from '../utils/avatarPlaceholder';
import { sellerNet } from '../utils/bidMath';
import {
  Store,
  Handshake,
  MessageCircle,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  ImagePlus,
  Loader2,
  X,
  Phone,
  Ban
} from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/962781444899';
// House motion: smooth ease-out, no bouncy springs.
const easeOut = { duration: 0.3, ease: 'easeOut' as const };

type SellMode = 'choose' | 'wizard' | 'concierge' | 'success';

/**
 * Wave E2 — unified seller-facing Sell entry (spec §6).
 * Any authenticated member reaches this from the 'upload' view:
 *  - Self-serve: full ListingWizardView (createListing → 'processing' → Mazad approval gate)
 *  - Concierge: lighter submit form; the Mazad team completes + approves
 * Both paths end on the same "submitted for review" success screen.
 * Selling never requires the bidding membership — the approval gate is the quality control.
 */
export const SellView: React.FC = () => {
  const { createListing, setActiveView, currentUser, language, setShowPhotoGate } = useApp();
  const isAr = language === 'ar';
  const canList = hasRealPhoto(currentUser);

  const [mode, setMode] = useState<SellMode>('choose');

  // Trust gate: selling — like bidding — requires a real profile photo. Block the
  // "choose a path" actions until the seller has one (client-side UX only; the
  // listing/approval server path is untouched).
  const startPath = (id: 'wizard' | 'concierge') => {
    if (!canList) {
      setShowPhotoGate(true);
      return;
    }
    setMode(id);
  };

  // ---- Concierge form state ----
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cCondition, setCCondition] = useState<'new' | 'used' | null>(null);
  const [cChannel, setCChannel] = useState<DropChannel | null>(null);
  const [cPrice, setCPrice] = useState('');
  const [cContact, setCContact] = useState(currentUser?.phone || currentUser?.phoneNumber || '');
  const [cPhotos, setCPhotos] = useState<{ file: File; url: string }[]>([]);
  // Wave 4: required listing-time ownership + legality attestation
  const [cAttested, setCAttested] = useState(false);
  // E3 Slice B — seller opt-in auto-relist (off by default)
  const [cAutoRelist, setCAutoRelist] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [cError, setCError] = useState<string | null>(null);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).slice(0, 3 - cPhotos.length);
    if (incoming.length === 0) return;
    setCPhotos(prev => [
      ...prev,
      ...incoming.map(file => ({ file, url: URL.createObjectURL(file) }))
    ].slice(0, 3));
  };

  const removePhoto = (idx: number) => {
    setCPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConciergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCError(null);

    if (!cName.trim()) {
      setCError(isAr ? 'الرجاء إدخال اسم المنتج.' : 'Please enter the item name.');
      return;
    }
    if (!cCondition) {
      setCError(isAr ? 'حدد حالة المنتج: جديد أو مستعمل.' : 'Select the item condition: new or used.');
      return;
    }
    if (!cChannel) {
      setCError(isAr ? 'اختر فئة المنتج: هواتف أو سيارات أو منوعات.' : 'Choose a category: phones, cars, or misc.');
      return;
    }
    const priceNum = Number(cPrice);
    if (!cPrice || isNaN(priceNum) || priceNum <= 0) {
      setCError(isAr ? 'حدد السعر المتوقع بالدينار الأردني.' : 'Enter a valid expected price in JOD.');
      return;
    }
    if (cPhotos.length === 0) {
      setCError(isAr ? 'أضف صورة واحدة على الأقل (حتى ٣ صور).' : 'Add at least one photo (up to 3).');
      return;
    }
    if (!cContact.trim()) {
      setCError(isAr ? 'أدخل رقم تواصل (هاتف أو واتساب).' : 'Enter a contact number (phone or WhatsApp).');
      return;
    }
    if (!cAttested) {
      setCError(isAr
        ? 'يجب الإقرار بأن الغرض ملكك وقانوني للبيع في الأردن قبل الإرسال.'
        : 'You must confirm you own this item and it is legal to sell in Jordan before submitting.');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress(0);

    try {
      // Photos 2–3 upload directly (photo 1 rides through createListing as the
      // thumbnail with its built-in fallback-bucket retry). Non-fatal on failure —
      // the concierge team follows up with the seller anyway.
      const extraPhotoUrls: string[] = [];
      if (cPhotos.length > 1) {
        try {
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
          const { getFirebaseStorage } = await import('../services/firebase');
          const storage = await getFirebaseStorage();
          for (const photo of cPhotos.slice(1)) {
            // Shrink to a card-friendly size before upload — same reasoning
            // as the cover photo (createListing's uploadWithFallback).
            // Never throws; falls back to the original file untouched.
            const resized = await resizeImage(photo.file);
            const path = `auction-thumbnails/${Date.now()}_concierge_${photo.file.name}`;
            const snap = await uploadBytes(ref(storage, path), resized, {
              contentType: resized.type || photo.file.type || 'image/jpeg'
            });
            extraPhotoUrls.push(await getDownloadURL(snap.ref));
          }
        } catch (photoErr) {
          console.warn('Concierge extra photo upload failed (continuing):', photoErr);
        }
      }

      await createListing(
        {
          title: cName.trim(),
          description: cDesc.trim() || cName.trim(),
          // Seller picks the drop channel; category is derived from it (same
          // mapping the self-serve drop builder uses) so discovery filters and
          // media fallbacks line up. The Mazad team can still refine before approving.
          channel: cChannel,
          category: channelToCategory(cChannel),
          startingPrice: priceNum,
          minIncrement: Math.max(5, Math.round(priceNum * 0.05)),
          videoUrl: '',
          thumbnailUrl: '',
          endTime: Date.now() + 3600 * 1000,
          duration: 3600,
          isFeatured: false,
          isConcierge: true,
          condition: cCondition,
          conciergeContact: cContact.trim(),
          // Admin concierge queue keeps reading conciergePhotos; the live-room
          // media gallery reads mediaUrls (Wave 2) — write both.
          conciergePhotos: extraPhotoUrls,
          mediaUrls: extraPhotoUrls,
          // E3 Slice B — carries onto the doc; auto-relist honored once the
          // listing goes live and later settles unsold.
          autoRelist: cAutoRelist
        } as any,
        null,
        cPhotos[0].file,
        (progress) => setSubmitProgress(Math.round(progress)),
        'processing'
      );

      setMode('success');
    } catch (err: any) {
      console.error('Concierge submission failed:', err);
      setCError(
        isAr
          ? `تعذّر إرسال طلبك: ${err?.message || err}`
          : `Could not submit your request: ${err?.message || err}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const BackChevron = isAr ? ChevronRight : ChevronLeft;

  const backButton = (
    <button
      onClick={() => setMode('choose')}
      className="inline-flex items-center gap-1 text-xs font-black text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
    >
      <BackChevron className="w-4 h-4" />
      <span>{isAr ? 'رجوع' : 'Back'}</span>
    </button>
  );

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto w-full bg-[#F7F6F3] font-sans"
      dir={isAr ? 'rtl' : 'ltr'}
      id="sell-view-root"
    >
      <AnimatePresence mode="wait">
        {/* ======================= SUCCESS (shared by both paths) ======================= */}
        {mode === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={easeOut}
            className="min-h-full flex items-center justify-center p-6"
            id="sell-success-screen"
          >
            <div className="max-w-md w-full bg-white border border-gray-200/80 rounded-3xl shadow-sm p-8 text-center space-y-5">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...easeOut, delay: 0.1 }}
                className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center"
              >
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </motion.div>

              <h1 className="text-lg font-black text-gray-950 leading-snug">
                {isAr
                  ? 'استلمنا مزادك — فريق مزاد جو رح يراجعه ويوافق عليه، وبعدها بينزل مباشر 🌹'
                  : 'Got it — Mazad JO will review & approve your listing, then it goes live 🌹'}
              </h1>

              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {isAr
                  ? 'بتقدر تتابع حالة مزادك أول بأول من مركز البائع.'
                  : 'You can track your listing status anytime from your Seller Center.'}
              </p>

              <button
                onClick={() => setActiveView('seller-center')}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-sm rounded-2xl transition-all shadow-xs active:scale-95 cursor-pointer"
                id="sell-success-track-cta"
              >
                <Store className="w-4.5 h-4.5" />
                {isAr ? 'تابع مزادك في مركز البائع' : 'Track it in Seller Center'}
              </button>

              <button
                onClick={() => setMode('choose')}
                className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
              >
                {isAr ? 'أضف منتج آخر' : 'Add another item'}
              </button>
            </div>
          </motion.div>
        )}

        {/* ======================= SELF-SERVE WIZARD ======================= */}
        {mode === 'wizard' && (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={easeOut}
            className="flex flex-col min-h-full"
          >
            <div className="px-4 pt-4 lg:px-8">{backButton}</div>
            <ListingWizardView onDone={() => setMode('success')} />
          </motion.div>
        )}

        {/* ======================= CONCIERGE FORM ======================= */}
        {mode === 'concierge' && (
          <motion.div
            key="concierge"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={easeOut}
            className="max-w-md mx-auto w-full p-4 lg:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] space-y-5"
            id="sell-concierge-form"
          >
            <div>{backButton}</div>

            <div className="text-center space-y-1">
              <h2 className="text-base font-black text-gray-950">
                {isAr ? 'خلّي مزاد جو يدرجه لك 🤝' : 'Let Mazad list it for you 🤝'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {isAr
                  ? 'ابعثلنا تفاصيل منتجك وفريقنا بجهّز المزاد كامل وبنزّله بعد الموافقة.'
                  : 'Send us your item details — our team builds the full listing and publishes it after review.'}
              </p>
            </div>

            <form onSubmit={handleConciergeSubmit} className="bg-white border border-gray-200/80 rounded-3xl shadow-sm p-5 space-y-4 text-xs font-bold text-gray-700">
              {/* Item name */}
              <div className="space-y-1">
                <label className="block text-gray-600">{isAr ? 'اسم المنتج' : 'Item name'}</label>
                <input
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder={isAr ? 'مثال: iPhone 15 Pro Max' : 'e.g. iPhone 15 Pro Max'}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors"
                />
              </div>

              {/* Short description */}
              <div className="space-y-1">
                <label className="block text-gray-600">{isAr ? 'وصف قصير' : 'Short description'}</label>
                <textarea
                  rows={2}
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  placeholder={isAr ? 'الموديل، الحالة، أي ملاحظات...' : 'Model, condition details, any notes...'}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors resize-none"
                />
              </div>

              {/* Condition */}
              <div className="space-y-1">
                <label className="block text-gray-600">{isAr ? 'حالة المنتج' : 'Condition'}</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'new' as const, label: isAr ? 'جديد' : 'New' },
                    { value: 'used' as const, label: isAr ? 'مستعمل' : 'Used' }
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCCondition(opt.value)}
                      className={`py-3 rounded-xl font-black text-center border transition-all cursor-pointer ${
                        cCondition === opt.value
                          ? 'bg-[#FF6B00] border-transparent text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category / channel (required) */}
              <div className="space-y-1">
                <label className="block text-gray-600">{isAr ? 'فئة المنتج' : 'Category'}</label>
                <div className="grid grid-cols-3 gap-2">
                  {DROP_CHANNELS.map(opt => {
                    const label = opt.value === 'phones'
                      ? (isAr ? 'هواتف' : 'Phones')
                      : opt.value === 'cars'
                        ? (isAr ? 'سيارات' : 'Cars')
                        : (isAr ? 'منوعات' : 'Misc');
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCChannel(opt.value)}
                        className={`py-3 rounded-xl font-black text-center border transition-all cursor-pointer ${
                          cChannel === opt.value
                            ? 'bg-[#FF6B00] border-transparent text-white shadow-sm'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Expected price */}
              <div className="space-y-1">
                <label className="block text-gray-600">{isAr ? 'السعر المتوقع (دينار)' : 'Expected price (JOD)'}</label>
                <input
                  type="number"
                  min="1"
                  value={cPrice}
                  onChange={(e) => setCPrice(e.target.value)}
                  placeholder="100"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors"
                />
                {/* E1 — seller take estimate: ~95% of the final price after Mazad's 5% commission. */}
                <p className="text-[11px] text-gray-400 font-medium">
                  {Number(cPrice) > 0
                    ? (isAr
                        ? `ستستلم ~${sellerNet(Number(cPrice)).toLocaleString('en-US')} دينار (تقريباً ٩٥٪ بعد عمولة مزاد ٥٪)`
                        : `You'll receive ~${sellerNet(Number(cPrice)).toLocaleString('en-US')} JOD (~95% after 5% Mazad commission)`)
                    : (isAr
                        ? 'ستستلم ~٩٥٪ من السعر النهائي (بعد عمولة مزاد ٥٪)'
                        : "You'll receive ~95% of the final price (after 5% Mazad commission)")}
                </p>
              </div>

              {/* Photos (1–3) */}
              <div className="space-y-1.5">
                <label className="block text-gray-600">{isAr ? 'الصور (١–٣ صور)' : 'Photos (1–3)'}</label>
                <div className="flex gap-2 flex-wrap">
                  {cPhotos.map((photo, idx) => (
                    <div key={photo.url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                      <img src={photo.url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 rtl:right-auto rtl:left-1 p-0.5 bg-black/60 hover:bg-black text-white rounded-md cursor-pointer"
                        aria-label={isAr ? 'حذف الصورة' : 'Remove photo'}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {cPhotos.length < 3 && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#FF6B00] hover:bg-orange-50/40 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-gray-400 hover:text-[#FF6B00]">
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-[9px] font-black">{isAr ? 'أضف' : 'Add'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addPhotos(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-1">
                <label className="block text-gray-600">{isAr ? 'رقم التواصل (هاتف / واتساب)' : 'Your contact (phone / WhatsApp)'}</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-4" />
                  <input
                    type="tel"
                    value={cContact}
                    onChange={(e) => setCContact(e.target.value)}
                    placeholder="07XXXXXXXX"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 ps-11 pe-4 font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Wave 4 — required ownership + legality attestation */}
              <label
                className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl p-3.5 cursor-pointer select-none"
                id="concierge-ownership-attestation"
              >
                <input
                  type="checkbox"
                  checked={cAttested}
                  onChange={(e) => setCAttested(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[#FF6B00] cursor-pointer"
                />
                <span className="text-[11px] font-bold text-gray-700 leading-relaxed">
                  {isAr
                    ? 'أُقرّ بأن هذا الغرض ملكي وقانوني للبيع في الأردن'
                    : 'I confirm I own this item and it is legal to sell in Jordan.'}
                </span>
              </label>

              {/* E3 Slice B — auto-relist opt-in */}
              <label className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl p-3.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cAutoRelist}
                  onChange={(e) => setCAutoRelist(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[#FF6B00] cursor-pointer"
                />
                <span className="text-[11px] font-bold text-gray-700 leading-relaxed">
                  {isAr
                    ? 'إعادة الإدراج تلقائياً إن لم يُبع (حتى مرتين)'
                    : 'Auto-relist if unsold (up to 2×)'}
                </span>
              </label>

              {cError && (
                <p className="text-[11px] text-rose-600 font-bold bg-rose-50 border border-rose-100 p-2.5 rounded-xl">
                  {cError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-13 py-3.5 bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                id="concierge-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    <span>{isAr ? `جاري الإرسال... ${submitProgress}%` : `Submitting... ${submitProgress}%`}</span>
                  </>
                ) : (
                  <>
                    <Handshake className="w-4.5 h-4.5" />
                    <span>{isAr ? 'أرسل الطلب لفريق مزاد جو' : 'Send it to the Mazad JO team'}</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-gray-400 font-medium text-center leading-relaxed">
                {isAr
                  ? 'فريقنا بكمّل تفاصيل المزاد وبتواصل معك قبل النشر.'
                  : 'Our team completes the listing details and contacts you before it goes live.'}
              </p>
            </form>
          </motion.div>
        )}

        {/* ======================= CHOOSER ======================= */}
        {mode === 'choose' && (
          <motion.div
            key="choose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={easeOut}
            className="max-w-md lg:max-w-2xl mx-auto w-full p-4 lg:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] space-y-6"
            id="sell-chooser"
          >
            {/* Header */}
            <div className="text-center space-y-1.5 pt-2">
              <h1 className="text-xl font-black text-gray-950">
                {isAr ? 'بيع على مزاد جو' : 'Sell on Mazad JO'}
              </h1>
              <p className="text-xs text-gray-500 font-medium leading-relaxed max-w-sm mx-auto">
                {isAr
                  ? 'كل المزادات بمرّ فيها فريقنا للمراجعة والموافقة قبل ما تنزل مباشر.'
                  : 'Every listing is reviewed & approved by our team before it goes live.'}
              </p>
            </div>

            {/* Two path cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                {
                  id: 'wizard' as const,
                  icon: Store,
                  title: isAr ? 'أدرج منتجك بنفسك' : 'List it yourself',
                  desc: isAr
                    ? 'صوّر منتجك، حدد السعر والمدة، وابعثه للمراجعة — كله بإيدك.'
                    : 'Shoot your item, set the price and duration, and submit it for review — all in your hands.',
                  cta: isAr ? 'ابدأ الإدراج' : 'Start listing'
                },
                {
                  id: 'concierge' as const,
                  icon: Handshake,
                  title: isAr ? 'خلّي مزاد جو يدرجه لك' : 'Let Mazad list it for you',
                  desc: isAr
                    ? 'ابعثلنا الاسم والصور والسعر المتوقع، وفريقنا بجهّز المزاد عنك.'
                    : 'Send us the name, photos, and expected price — our team builds the listing for you.',
                  cta: isAr ? 'ابعث التفاصيل' : 'Send details'
                }
              ].map((card, i) => {
                const CardIcon = card.icon;
                return (
                  <motion.button
                    key={card.id}
                    type="button"
                    onClick={() => startPath(card.id)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...easeOut, delay: 0.08 + i * 0.06 }}
                    className="group relative overflow-hidden bg-gradient-to-b from-white to-[#FFF7F1] border border-orange-100/70 hover:border-[#FF6B00]/45 rounded-3xl shadow-[0_2px_16px_rgba(255,107,0,0.05)] hover:shadow-[0_10px_30px_rgba(255,107,0,0.14)] p-6 text-start flex flex-col gap-4 transition-all duration-300 cursor-pointer active:scale-[0.99] hover:-translate-y-0.5"
                    id={`sell-card-${card.id}`}
                    style={{ direction: isAr ? 'rtl' : 'ltr' }}
                  >
                    {/* Soft brand glow in the trailing-top corner */}
                    <span className="pointer-events-none absolute -top-10 end-[-2.5rem] w-32 h-32 rounded-full bg-[#FF6B00]/10 blur-2xl" />

                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF9A4D] to-[#E85D04] shadow-lg shadow-orange-500/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                      <CardIcon className="w-7 h-7 text-white" />
                    </div>
                    <div className="space-y-1.5 relative">
                      <h3 className="text-base font-black text-gray-950 leading-tight">{card.title}</h3>
                      <p className="text-xs text-gray-500 font-medium leading-relaxed min-h-[48px]">{card.desc}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#FF6B00] mt-auto relative">
                      <span>{card.cta}</span>
                      <span className="group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform">
                        {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Secondary WhatsApp fallback */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...easeOut, delay: 0.25 }}
              className="text-center"
            >
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-[#FF6B00] transition-colors"
                id="sell-whatsapp-fallback"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {isAr ? 'أو راسلنا على واتساب' : 'or message us on WhatsApp'}
              </a>
            </motion.div>

            {/* Prohibited-items policy link */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...easeOut, delay: 0.3 }}
              className="text-center"
            >
              <button
                type="button"
                onClick={() => setActiveView('prohibited-items')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                id="sell-prohibited-items-link"
              >
                <Ban className="w-3.5 h-3.5" />
                {isAr ? 'شو الأغراض الممنوع بيعها؟' : 'What items are prohibited?'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
