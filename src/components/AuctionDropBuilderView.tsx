import React, { useMemo, useState } from 'react';
import { useApp, useAuctions } from '../context/AppContext';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, type DropChannel } from '../utils/dropChannel';
import { buildDropPayload } from '../utils/dropPayload';
import { parseAmmanLocalToMs, formatAmmanClock } from '../utils/ammanTime';
import { copyImageToClipboard, downloadMedia } from '../utils/dropMedia';
import { resizeImage } from '../utils/resizeImage';
import { sellerNet } from '../utils/bidMath';
import DropsListPanel from './DropsListPanel';
import type { ViewingMode } from '../utils/viewing';
import { ViewingSelector } from './admin/ViewingSelector';
import type { AuctionItem } from '../types';

const DURATION_PRESETS = [
  { seconds: 600, label: '10 دقيقة', en: '10 min' },
  { seconds: 900, label: '15 دقيقة', en: '15 min' },
  { seconds: 1800, label: '30 دقيقة', en: '30 min' },
];

// How long the winner has to pay before the payment-default enforcer blocks
// them. Mirrors DEFAULT_PAYMENT_WINDOW_HOURS in functions/index.js (24h).
const PAYMENT_WINDOW_PRESETS = [
  { hours: 12, label: '12 ساعة', en: '12 hours' },
  { hours: 24, label: '24 ساعة', en: '24 hours' },
  { hours: 48, label: '48 ساعة', en: '48 hours' },
  { hours: 72, label: '72 ساعة', en: '72 hours' },
];

// Anti-snipe soft-close window: a bid in the final N seconds resets the clock
// to N seconds. Value tunes both window + extend (kept symmetric for v1).
const ANTI_SNIPE_PRESETS = [
  { sec: 15, label: '15 ثانية', en: '15s' },
  { sec: 30, label: '30 ثانية', en: '30s' },
  { sec: 60, label: '60 ثانية', en: '60s' },
];

export default function AuctionDropBuilderView() {
  const { language, currentUser, createListing } = useApp();
  const { auctions } = useAuctions();
  const isAr = language === 'ar';

  const [productName, setProductName] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  // Per-lot viewing for admin-created drops. Optional — unset means the lot
  // states nothing about viewing (renders nothing) rather than claiming a place.
  const [viewing, setViewing] = useState<ViewingMode | ''>('');
  const [viewingPlace, setViewingPlace] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [channel, setChannel] = useState<DropChannel>('misc');
  const [startMode, setStartMode] = useState<'scheduled' | 'first_bid'>('scheduled'); // E3 Slice A
  const [autoRelist, setAutoRelist] = useState(false); // E3 Slice B — off by default
  const [scheduledLocal, setScheduledLocal] = useState(''); // "YYYY-MM-DDTHH:mm" (Amman)
  const [durationSeconds, setDurationSeconds] = useState(1800);
  const [paymentWindowHours, setPaymentWindowHours] = useState(24);
  const [antiSnipeSec, setAntiSnipeSec] = useState(30);
  const [condition, setCondition] = useState('جديدة كلياً');
  const [vendorName, setVendorName] = useState(''); // internal-only, never buyer-facing
  const [specsText, setSpecsText] = useState(''); // one spec per line
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [extraPhotos, setExtraPhotos] = useState<{ file: File; url: string }[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [copyImageMsg, setCopyImageMsg] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Gallery helpers (same pattern as the seller wizard): up to 3 extra photos.
  const addExtraPhotos = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setExtraPhotos((prev) =>
      [...prev, ...incoming.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 3),
    );
  };
  const removeExtraPhoto = (idx: number) => setExtraPhotos((prev) => prev.filter((_, i) => i !== idx));

  const specs = useMemo(
    () => specsText.split('\n').map((s) => s.trim()).filter(Boolean),
    [specsText],
  );

  const scheduledStartAtMs = useMemo(() => parseAmmanLocalToMs(scheduledLocal), [scheduledLocal]);
  const startTimeDisplay = useMemo(
    () => (scheduledStartAtMs != null ? formatAmmanClock(scheduledStartAtMs) : '—'),
    [scheduledStartAtMs],
  );

  const durationLabel = useMemo(() => {
    const p = DURATION_PRESETS.find((d) => d.seconds === durationSeconds);
    return p ? p.label : `${Math.round(durationSeconds / 60)} دقيقة`;
  }, [durationSeconds]);

  // The auction number is allocated server-side by createListing; post-create
  // it flows back through the auctions collection in context.
  const assignedNumber = useMemo(
    () => (createdId ? auctions.find((a) => a.id === createdId)?.auctionNumber : undefined),
    [createdId, auctions],
  );

  // Before the drop is created we show a placeholder link; after creation the
  // real id flows in and the caption/copy buttons reflect the final link.
  const deepLink = useMemo(
    () => buildAuctionUrl(createdId ?? '{{auction-id}}', window.location.origin),
    [createdId],
  );

  const caption = useMemo(
    () =>
      buildAuctionCaption({
        auctionNumber: assignedNumber ?? '—',
        startTime: startTimeDisplay,
        durationLabel,
        startingPriceJod: Number(startingPrice) || 0,
        productName: productName.trim() || '—',
        specs,
        condition: condition.trim(),
        deepLink,
      }),
    [assignedNumber, startTimeDisplay, durationLabel, startingPrice, productName, specs, condition, deepLink],
  );

  const onThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setThumbnailFile(f);
    setThumbnailPreview(f ? URL.createObjectURL(f) : '');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!productName.trim() || !Number(startingPrice)) {
      setError(isAr ? 'أدخل اسم المنتج وسعر البداية' : 'Enter a product name and starting price');
      return;
    }
    if (startMode === 'scheduled' && scheduledStartAtMs != null && scheduledStartAtMs <= Date.now()) {
      setError(isAr ? 'وقت البدء يجب أن يكون في المستقبل' : 'Start time must be in the future');
      return;
    }
    setSubmitting(true);
    try {
      // Upload the extra gallery photos first (same storage path pattern the
      // seller wizard uses). Non-fatal on failure — the drop still publishes
      // with the cover + video.
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
              contentType: resized.type || photo.file.type || 'image/jpeg',
            });
            extraPhotoUrls.push(await getDownloadURL(snap.ref));
          }
        } catch (photoErr) {
          console.warn('Extra gallery photo upload failed (continuing):', photoErr);
        }
      }

      const newId = await createListing(
        buildDropPayload(
          {
            productName,
            startingPrice,
            channel,
            durationSeconds,
            paymentWindowHours,
            antiSnipeSec,
            startMode,
            scheduledStartAtMs,
            autoRelist,
            viewing,
            viewingPlace,
            marketPrice,
            reservePrice,
            vendorName,
            extraPhotoUrls,
          },
          Date.now(),
        ) as any,
        videoFile ?? undefined,
        thumbnailFile ?? undefined,
        undefined,
        'upcoming',
      );
      setCreatedId(newId);
      // Viewing does NOT carry to the next drop, unlike the reserve/vendor/specs
      // left standing above. Those are internal ops fields — a stale one is an
      // admin's own problem. A stale `viewing` publishes a physical viewing claim
      // about a DIFFERENT item to buyers, which is exactly the fabrication
      // utils/viewing.ts exists to prevent. Back to "not stated": the next drop
      // has to state it deliberately.
      setViewing('');
      setViewingPlace('');
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل إنشاء المزاد' : 'Failed to create auction'));
    } finally {
      setSubmitting(false);
    }
  };

  const finalLink = createdId ? buildAuctionUrl(createdId, window.location.origin) : '';
  const sectionHeader = 'text-xs font-bold text-neutral-400 uppercase tracking-wide';

  // Relist prefills the form from a past drop. The reserve is intentionally NOT
  // carried over — it lives in the admin-only secrets doc and isn't readable here.
  const handleRelist = (a: AuctionItem) => {
    setProductName(a.title);
    setStartingPrice(String(a.startingPrice));
    setCondition(a.condition ?? condition);
    if (a.channel) setChannel(a.channel);
    if (a.marketPrice) setMarketPrice(String(a.marketPrice));
    setDurationSeconds(a.duration || durationSeconds);
    if (a.paymentWindowHours) setPaymentWindowHours(a.paymentWindowHours);
    if (a.antiSnipeWindowSec) setAntiSnipeSec(a.antiSnipeWindowSec);
    // Viewing is always seeded from the SOURCE lot, never left as-is. The other
    // fields above are internal, so a leftover is just an ops slip; a leftover
    // `viewing` would sit highlighted on the new form looking like this lot's own
    // claim and publish a place nobody stated for it. A relist is the same
    // physical item, so the source's OWN recorded viewing is a real claim and is
    // safe to carry — anything else (unset, or a value we don't recognise) fails
    // closed to "not stated".
    const sourceViewing = a.viewing;
    const hasSourceViewing =
      sourceViewing === 'office' || sourceViewing === 'store' || sourceViewing === 'private';
    setViewing(hasSourceViewing ? sourceViewing : '');
    setViewingPlace(hasSourceViewing && typeof a.viewingPlace === 'string' ? a.viewingPlace : '');
    setCreatedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ direction: isAr ? 'rtl' : 'ltr' }} className="h-full overflow-y-auto max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="space-y-6">
        <h1 className="text-xl font-bold">{isAr ? 'إنشاء مزاد جديد' : 'Create a Drop'}</h1>

        {/* ITEM */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'المنتج' : 'Item'}</h2>

          <label className="block text-sm">{isAr ? 'رقم المزاد' : 'Auction number'}
            <input
              className="mt-1 w-full border rounded p-2 bg-neutral-100 text-neutral-500"
              value={assignedNumber != null ? String(assignedNumber) : (isAr ? 'تلقائي' : 'Auto')}
              readOnly
            />
            <span className="mt-1 block text-xs text-neutral-500">
              {isAr ? 'يُخصَّص تلقائياً عند الإنشاء' : 'Assigned automatically on create'}
            </span>
          </label>

          <label className="block text-sm">{isAr ? 'اسم المنتج' : 'Product name'}
            <input className="mt-1 w-full border rounded p-2" value={productName} onChange={(e) => setProductName(e.target.value)} />
          </label>

          <label className="block text-sm">{isAr ? 'الحالة' : 'Condition'}
            <input className="mt-1 w-full border rounded p-2" value={condition} onChange={(e) => setCondition(e.target.value)} />
          </label>

          <label className="block text-sm">{isAr ? 'المواصفات (سطر لكل مواصفة)' : 'Specs (one per line)'}
            <textarea className="mt-1 w-full border rounded p-2 h-28" value={specsText} onChange={(e) => setSpecsText(e.target.value)} />
          </label>

          <label className="block text-sm">{isAr ? 'المورّد (داخلي)' : 'Vendor (internal)'}
            <input
              className="mt-1 w-full border rounded p-2"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder={isAr ? 'اختياري — لا يظهر للمشترين' : 'Optional — never shown to buyers'}
            />
          </label>
        </section>

        {/* PRICING */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'التسعير' : 'Pricing'}</h2>

          <label className="block text-sm">{isAr ? 'سعر البداية (دينار)' : 'Starting price (JOD)'}
            <input type="number" className="mt-1 w-full border rounded p-2" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} />
            {/* E1 — seller take estimate: ~95% of the final price after Mazad's 5% commission. */}
            <span className="mt-1 block text-xs text-neutral-500">
              {Number(startingPrice) > 0
                ? (isAr
                    ? `يستلم البائع ~${sellerNet(Number(startingPrice)).toLocaleString('en-US')} دينار (تقريباً ٩٥٪ بعد عمولة مزاد ٥٪)`
                    : `Seller receives ~${sellerNet(Number(startingPrice)).toLocaleString('en-US')} JOD (~95% after 5% Mazad commission)`)
                : (isAr
                    ? 'يستلم البائع ~٩٥٪ من السعر النهائي (بعد عمولة مزاد ٥٪)'
                    : 'Seller receives ~95% of the final price (after 5% Mazad commission)')}
            </span>
          </label>

          {/* Per-lot viewing — optional. Same control as the approval card. */}
          <ViewingSelector
            value={viewing}
            onChange={setViewing}
            place={viewingPlace}
            onPlaceChange={setViewingPlace}
            isAr={isAr}
            accentClass="bg-[#F05123] text-white border-[#F05123]"
            focusClass="focus:border-[#F05123]"
          />

          <label className="block text-sm">{isAr ? 'سعر السوق (اختياري)' : 'Market price (optional)'}
            <input type="number" className="mt-1 w-full border rounded p-2" value={marketPrice} onChange={(e) => setMarketPrice(e.target.value)} />
          </label>

          <label className="block text-sm">{isAr ? 'السعر الاحتياطي (اختياري — مخفي عن المزايدين)' : 'Reserve price (optional — hidden from bidders)'}
            <input type="number" className="mt-1 w-full border rounded p-2" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} />
            <span className="mt-1 block text-xs text-neutral-500">
              {isAr ? 'لن يُباع المنتج إذا لم تصل المزايدة لهذا السعر' : "Item won't sell if bidding doesn't reach this"}
            </span>
          </label>
        </section>

        {/* TIMING */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'التوقيت' : 'Timing'}</h2>

          <label className="block text-sm">{isAr ? 'القناة' : 'Channel'}
            <select className="mt-1 w-full border rounded p-2" value={channel} onChange={(e) => setChannel(e.target.value as DropChannel)}>
              {DROP_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{channelLabel(c.value, isAr ? 'ar' : 'en')}</option>
              ))}
            </select>
          </label>

          <div className="block text-sm">
            <span>{isAr ? 'وضع البدء' : 'Start mode'}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStartMode('scheduled')}
                className={`border rounded p-2 text-sm ${startMode === 'scheduled' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-neutral-700'}`}
              >
                {isAr ? 'مجدول' : 'Scheduled'}
              </button>
              <button
                type="button"
                onClick={() => setStartMode('first_bid')}
                className={`border rounded p-2 text-sm ${startMode === 'first_bid' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-neutral-700'}`}
              >
                {isAr ? 'أول مزايدة' : 'First bid'}
              </button>
            </div>
          </div>

          {startMode === 'scheduled' ? (
            <label className="block text-sm">{isAr ? 'وقت البدء (توقيت عمّان)' : 'Start time (Amman)'}
              <input
                type="datetime-local"
                className="mt-1 w-full border rounded p-2"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
              />
              <span className="mt-1 block text-xs text-neutral-500">
                {isAr ? 'اتركه فارغاً ليفتح المزاد فوراً (خلال دقيقة)' : 'Leave empty to open immediately (within a minute)'}
              </span>
            </label>
          ) : (
            <p className="text-xs text-neutral-500 bg-neutral-50 border rounded p-2">
              {isAr ? 'يبدأ فوراً — يبدأ العدّاد مع أول مزايدة' : 'Goes live now — the timer starts on the first bid'}
            </p>
          )}

          <label className="block text-sm">{isAr ? 'المدة' : 'Duration'}
            <select className="mt-1 w-full border rounded p-2" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))}>
              {DURATION_PRESETS.map((d) => (
                <option key={d.seconds} value={d.seconds}>{isAr ? d.label : d.en}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">{isAr ? 'مهلة الدفع' : 'Payment window'}
            <select className="mt-1 w-full border rounded p-2" value={paymentWindowHours} onChange={(e) => setPaymentWindowHours(Number(e.target.value))}>
              {PAYMENT_WINDOW_PRESETS.map((p) => (
                <option key={p.hours} value={p.hours}>{isAr ? p.label : p.en}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutral-400">
              {isAr
                ? 'الوقت المتاح للفائز للدفع قبل تقييد الحساب. الافتراضي 24 ساعة.'
                : 'Time the winner has to pay before their account is restricted. Default 24h.'}
            </span>
          </label>

          <label className="block text-sm">{isAr ? 'الحماية من القنص' : 'Anti-snipe'}
            <select className="mt-1 w-full border rounded p-2" value={antiSnipeSec} onChange={(e) => setAntiSnipeSec(Number(e.target.value))}>
              {ANTI_SNIPE_PRESETS.map((p) => (
                <option key={p.sec} value={p.sec}>{isAr ? p.label : p.en}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutral-400">
              {isAr
                ? 'المزايدات في الثواني الأخيرة تُمدّد الوقت. الافتراضي ٣٠ ثانية.'
                : 'Bids in the final seconds extend the clock. Default 30s.'}
            </span>
          </label>

          {/* E3 Slice B — auto-relist opt-in */}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoRelist}
              onChange={(e) => setAutoRelist(e.target.checked)}
            />
            <span>
              {isAr ? 'إعادة الإدراج تلقائياً إن لم يُبع (حتى مرتين)' : 'Auto-relist if unsold (up to 2×)'}
              <span className="mt-0.5 block text-xs text-neutral-400">
                {isAr
                  ? 'يُعاد إدراج المنتج تلقائياً بعد ٢٤ ساعة إن انتهى دون بيع.'
                  : 'The item is automatically relisted 24h after it ends unsold.'}
              </span>
            </span>
          </label>
        </section>

        {/* MEDIA */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'الوسائط' : 'Media'}</h2>

          <label className="block text-sm">{isAr ? 'صورة الغلاف' : 'Cover image'}
            <input type="file" accept="image/*" className="mt-1 w-full" onChange={onThumb} />
          </label>
          {thumbnailPreview && <img src={thumbnailPreview} alt="" className="w-32 h-32 object-cover rounded" />}

          <div className="block text-sm">
            <span>{isAr ? 'صور إضافية للمعرض (حتى ٣ — اختياري)' : 'Extra gallery photos (up to 3 — optional)'}</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {extraPhotos.map((photo, idx) => (
                <div key={photo.url} className="relative rounded overflow-hidden bg-neutral-100 aspect-square">
                  <img src={photo.url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExtraPhoto(idx)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded px-1.5 py-0.5 text-[10px]"
                  >
                    {isAr ? 'حذف' : 'Remove'}
                  </button>
                </div>
              ))}
              {extraPhotos.length < 3 && (
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded aspect-square cursor-pointer text-neutral-500 hover:bg-neutral-50">
                  <span className="text-xl">＋</span>
                  <span className="text-[10px]">{isAr ? 'إضافة صورة' : 'Add photo'}</span>
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
            <span className="mt-1 block text-xs text-neutral-500">
              {isAr ? 'يستطيع المزايدون التنقل بين هذه الصور داخل غرفة المزاد' : 'Bidders can swipe through these photos inside the live room'}
            </span>
          </div>

          <label className="block text-sm">{isAr ? 'فيديو المنتج (اختياري)' : 'Product video (optional)'}
            <input
              type="file"
              accept="video/*"
              className="mt-1 w-full"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </section>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={submitting} onClick={handleCreate} className="w-full bg-amber-600 text-white rounded p-3 disabled:opacity-50">
          {submitting ? (isAr ? 'جارٍ الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء المزاد' : 'Create drop')}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{isAr ? 'معاينة المنشور' : 'Post preview'}</h2>
        <pre className="whitespace-pre-wrap border rounded p-3 text-sm bg-neutral-50" style={{ direction: 'rtl' }}>{caption}</pre>
        <button onClick={() => copy(caption)} disabled={!createdId} className="w-full border rounded p-2 disabled:opacity-50">{isAr ? 'نسخ النص' : 'Copy caption'}</button>

        <button
          onClick={async () => {
            const ok = thumbnailPreview ? await copyImageToClipboard(thumbnailPreview) : false;
            setCopyImageMsg(ok ? (isAr ? '✅ نُسخت الصورة' : '✅ Image copied') : (isAr ? 'تعذّر النسخ — استخدم تنزيل' : "Couldn't copy — use Download"));
          }}
          disabled={!thumbnailFile}
          className="w-full border rounded p-2 disabled:opacity-50"
        >{isAr ? 'نسخ الصورة' : 'Copy image'}</button>
        {copyImageMsg && <p className="text-xs text-neutral-500">{copyImageMsg}</p>}

        <button
          onClick={() => downloadMedia([
            ...(thumbnailPreview ? [{ url: thumbnailPreview, kind: 'cover' as const }] : []),
            ...extraPhotos.map((p, i) => ({ url: p.url, kind: 'gallery' as const, idx: i })),
            ...(videoFile ? [{ url: URL.createObjectURL(videoFile), kind: 'video' as const }] : []),
          ])}
          disabled={!thumbnailFile && extraPhotos.length === 0 && !videoFile}
          className="w-full border rounded p-2 disabled:opacity-50"
        >{isAr ? 'تنزيل الوسائط' : 'Download media'}</button>

        {createdId ? (
          <>
            <div className="border rounded p-2 text-sm break-all">{finalLink}</div>
            <button onClick={() => copy(finalLink)} className="w-full border rounded p-2">{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
            <p className="text-green-700 text-sm">{isAr ? '✅ تم الإنشاء — الصقه في القناة' : '✅ Created — paste into the channel'}</p>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">{isAr ? 'أنشئ المزاد للحصول على الرابط النهائي ثم انسخ النص' : 'Create the drop to get the final link, then copy the caption'}</p>
        )}

        <div className="pt-4 mt-4 border-t">
          <DropsListPanel onRelist={handleRelist} />
        </div>
      </div>
    </div>
  );
}
