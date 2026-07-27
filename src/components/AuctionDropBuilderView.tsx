import React, { useCallback, useMemo, useState } from 'react';
import { useApp, useAuctions } from '../context/AppContext';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, type DropChannel } from '../utils/dropChannel';
import { buildDropPayload } from '../utils/dropPayload';
import { INITIAL_FORM, type DropFormValues } from '../utils/dropFormState';
import { resolveOpens, validateOpens, type OpensMode } from '../utils/opensMode';
import { formatAmmanClock } from '../utils/ammanTime';
import { copyImageToClipboard, downloadMedia } from '../utils/dropMedia';
import { resizeImage } from '../utils/resizeImage';
import { sellerNet } from '../utils/bidMath';
import DropsListPanel from './DropsListPanel';
import MediaPicker from './ui/MediaPicker';
import MoreSettingsDrawer from './admin/MoreSettingsDrawer';
import type { PickedPhoto } from '../utils/mediaPickerState';
import type { AuctionItem } from '../types';

const DURATION_PRESETS = [
  { seconds: 600, label: '10 دقيقة', en: '10 min' },
  { seconds: 900, label: '15 دقيقة', en: '15 min' },
  { seconds: 1800, label: '30 دقيقة', en: '30 min' },
];

const OPENS_OPTIONS: { id: OpensMode; ar: string; en: string }[] = [
  { id: 'now', ar: 'الآن', en: 'Now' },
  { id: 'scheduled', ar: 'بوقت محدد', en: 'At a set time' },
  { id: 'first_bid', ar: 'مع أول مزايدة', en: 'On first bid' },
];

export default function AuctionDropBuilderView() {
  const { language, currentUser, createListing } = useApp();
  const { auctions } = useAuctions();
  const isAr = language === 'ar';

  // Every text/select value the form holds lives in one object. The old form
  // carried sixteen parallel useState calls, which is what made "reset for the
  // next drop" and "prefill from a relist" each have to remember all sixteen.
  const [form, setForm] = useState<DropFormValues>(INITIAL_FORM);
  const setField = useCallback(
    <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  // Media are File objects, not serialisable form state, so they stay separate.
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [extraPhotos, setExtraPhotos] = useState<PickedPhoto[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [copyImageMsg, setCopyImageMsg] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const specs = useMemo(
    () => form.specsText.split('\n').map((s) => s.trim()).filter(Boolean),
    [form.specsText],
  );

  const opens = useMemo(
    () => resolveOpens(form.opensMode, form.scheduledLocal),
    [form.opensMode, form.scheduledLocal],
  );
  const scheduledStartAtMs = opens.scheduledStartAtMs;
  const startTimeDisplay = useMemo(
    () => (scheduledStartAtMs != null ? formatAmmanClock(scheduledStartAtMs) : '—'),
    [scheduledStartAtMs],
  );

  const durationLabel = useMemo(() => {
    const p = DURATION_PRESETS.find((d) => d.seconds === form.durationSeconds);
    return p ? p.label : `${Math.round(form.durationSeconds / 60)} دقيقة`;
  }, [form.durationSeconds]);

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
        startingPriceJod: Number(form.startingPrice) || 0,
        productName: form.productName.trim() || '—',
        specs,
        condition: form.condition.trim(),
        deepLink,
      }),
    [assignedNumber, startTimeDisplay, durationLabel, form.startingPrice, form.productName, specs, form.condition, deepLink],
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!form.productName.trim() || !Number(form.startingPrice)) {
      setError(isAr ? 'أدخل اسم المنتج وسعر البداية' : 'Enter a product name and starting price');
      return;
    }
    // validateOpens, NOT resolveOpens, is what makes "At a set time" mean it.
    // resolveOpens returns scheduledStartAtMs: null for a blank/unparseable
    // time, and buildDropPayload's `?? now` would then open the lot
    // immediately — the exact silent degrade the old Scheduled-with-no-time
    // field had. Blocking here is the only thing between the two.
    const opensError = validateOpens(form.opensMode, form.scheduledLocal, Date.now());
    if (opensError === 'REQUIRED') {
      setError(isAr ? 'اختر وقت بدء المزاد' : 'Pick a start time');
      return;
    }
    if (opensError === 'PAST') {
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
            productName: form.productName,
            startingPrice: form.startingPrice,
            channel: form.channel,
            durationSeconds: form.durationSeconds,
            paymentWindowHours: form.paymentWindowHours,
            antiSnipeSec: form.antiSnipeSec,
            startMode: opens.startMode,
            scheduledStartAtMs,
            autoRelist: form.autoRelist,
            viewing: form.viewing,
            viewingPlace: form.viewingPlace,
            marketPrice: form.marketPrice,
            reservePrice: form.reservePrice,
            vendorName: form.vendorName,
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
      setForm((prev) => ({ ...prev, viewing: '', viewingPlace: '' }));
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل إنشاء المزاد' : 'Failed to create auction'));
    } finally {
      setSubmitting(false);
    }
  };

  const finalLink = createdId ? buildAuctionUrl(createdId, window.location.origin) : '';
  const sectionHeader = 'text-xs font-bold text-neutral-400 uppercase tracking-wide';
  const label = 'block text-sm font-bold text-gray-800';
  const field =
    'mt-1 w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#FF6B00]';

  // Relist prefills the form from a past drop. The reserve is intentionally NOT
  // carried over — it lives in the admin-only secrets doc and isn't readable here.
  const handleRelist = (a: AuctionItem) => {
    // Viewing is always seeded from the SOURCE lot, never left as-is. The other
    // fields below are internal, so a leftover is just an ops slip; a leftover
    // `viewing` would sit highlighted on the new form looking like this lot's own
    // claim and publish a place nobody stated for it. A relist is the same
    // physical item, so the source's OWN recorded viewing is a real claim and is
    // safe to carry — anything else (unset, or a value we don't recognise) fails
    // closed to "not stated".
    const sourceViewing = a.viewing;
    const hasSourceViewing =
      sourceViewing === 'office' || sourceViewing === 'store' || sourceViewing === 'private';

    setForm((prev) => ({
      ...prev,
      productName: a.title,
      startingPrice: String(a.startingPrice),
      condition: a.condition ?? prev.condition,
      channel: a.channel || prev.channel,
      marketPrice: a.marketPrice ? String(a.marketPrice) : prev.marketPrice,
      durationSeconds: a.duration || prev.durationSeconds,
      paymentWindowHours: a.paymentWindowHours || prev.paymentWindowHours,
      antiSnipeSec: a.antiSnipeWindowSec || prev.antiSnipeSec,
      viewing: hasSourceViewing ? sourceViewing : '',
      viewingPlace: hasSourceViewing && typeof a.viewingPlace === 'string' ? a.viewingPlace : '',
    }));
    setCreatedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ direction: isAr ? 'rtl' : 'ltr' }} className="h-full overflow-y-auto max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="space-y-6">
        <h1 className="text-xl font-bold">{isAr ? 'إنشاء مزاد جديد' : 'Create a Drop'}</h1>

        {/* MEDIA — first, the team is holding the item */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'الوسائط' : 'Media'}</h2>
          <MediaPicker
            isAr={isAr}
            coverUrl={thumbnailPreview}
            onCoverChange={(f) => {
              // Revoke the outgoing preview before replacing it — covers both
              // Remove (f === null) and swapping one cover for another. Without
              // this a 20-30 drop day leaks a blob per swap. Mirrors the
              // revoke MediaPicker's own gallery removal already does.
              if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
              setThumbnailFile(f);
              setThumbnailPreview(f ? URL.createObjectURL(f) : '');
            }}
            gallery={extraPhotos}
            onGalleryChange={setExtraPhotos}
            videoFile={videoFile}
            onVideoChange={setVideoFile}
          />
        </section>

        <label className={label}>
          {isAr ? 'اسم المنتج' : 'Product name'} <span className="text-[#FF6B00]">*</span>
          <input
            className={field}
            value={form.productName}
            onChange={(e) => setField('productName', e.target.value)}
          />
        </label>

        <label className={label}>
          {isAr ? 'سعر البداية (دينار)' : 'Starting price (JOD)'} <span className="text-[#FF6B00]">*</span>
          <input
            type="number"
            className={field}
            value={form.startingPrice}
            onChange={(e) => setField('startingPrice', e.target.value)}
          />
          {/* E1 — seller take estimate: ~95% of the final price after Mazad's 5% commission. */}
          <span className="mt-1 block text-[11px] text-gray-400">
            {Number(form.startingPrice) > 0
              ? (isAr
                  ? `يستلم البائع ~${sellerNet(Number(form.startingPrice)).toLocaleString('en-US')} دينار (تقريباً ٩٥٪ بعد عمولة مزاد ٥٪)`
                  : `Seller receives ~${sellerNet(Number(form.startingPrice)).toLocaleString('en-US')} JOD (~95% after 5% Mazad commission)`)
              : (isAr
                  ? 'يستلم البائع ~٩٥٪ من السعر النهائي (بعد عمولة مزاد ٥٪)'
                  : 'Seller receives ~95% of the final price (after 5% Mazad commission)')}
          </span>
        </label>

        <div>
          <span className={label}>{isAr ? 'يفتح' : 'Opens'}</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {OPENS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setField('opensMode', o.id)}
                className={`border rounded-xl p-2.5 text-xs font-bold transition-colors ${
                  form.opensMode === o.id
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00]'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {isAr ? o.ar : o.en}
              </button>
            ))}
          </div>

          {form.opensMode === 'scheduled' && (
            <label className={`${label} mt-3`}>
              {isAr ? 'وقت البدء (توقيت عمّان)' : 'Start time (Amman)'}
              <input
                type="datetime-local"
                className={field}
                value={form.scheduledLocal}
                onChange={(e) => setField('scheduledLocal', e.target.value)}
              />
            </label>
          )}

          {form.opensMode === 'first_bid' && (
            <p className="mt-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-2.5">
              {isAr ? 'يبدأ فوراً — يبدأ العدّاد مع أول مزايدة' : 'Goes live now — the timer starts on the first bid'}
            </p>
          )}
        </div>

        <label className={label}>
          {isAr ? 'مدة المزاد' : 'Runs for'}
          <select
            className={field}
            value={form.durationSeconds}
            onChange={(e) => setField('durationSeconds', Number(e.target.value))}
          >
            {DURATION_PRESETS.map((d) => (
              <option key={d.seconds} value={d.seconds}>{isAr ? d.label : d.en}</option>
            ))}
          </select>
        </label>

        <label className={label}>
          {isAr ? 'القناة' : 'Channel'}
          <select
            className={field}
            value={form.channel}
            onChange={(e) => setField('channel', e.target.value as DropChannel)}
          >
            {DROP_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{channelLabel(c.value, isAr ? 'ar' : 'en')}</option>
            ))}
          </select>
        </label>

        <MoreSettingsDrawer isAr={isAr} values={form} onChange={setField} />

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
