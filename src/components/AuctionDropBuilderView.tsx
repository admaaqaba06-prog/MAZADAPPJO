import React, { useCallback, useMemo, useState } from 'react';
import { useApp, useAuctions } from '../context/AppContext';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, type DropChannel } from '../utils/dropChannel';
import { buildDropPayload } from '../utils/dropPayload';
import {
  INITIAL_FORM,
  afterCreateAnother,
  dropErrorText,
  firstErrorField,
  validateDropForm,
  type DropFormValues,
} from '../utils/dropFormState';
import { photoUploadLabel, uploadStageLabel } from '../utils/dropProgress';
import { opensSummaryLabel, resolveOpens, type OpensMode } from '../utils/opensMode';
import { formatAmmanClock } from '../utils/ammanTime';
import { copyImageToClipboard, downloadMedia } from '../utils/dropMedia';
import { resizeImage } from '../utils/resizeImage';
import { sellerNet } from '../utils/bidMath';
import DropsListPanel from './DropsListPanel';
import MediaPicker from './ui/MediaPicker';
import MoreSettingsDrawer from './admin/MoreSettingsDrawer';
import DropSuccessPanel from './admin/DropSuccessPanel';
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
  // Re-opening a created drop for edits. Set only by the success panel's Edit
  // button, which Task 10 wires up alongside the save bar this flag reveals —
  // until then the panel stands from create until "Create another".
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Per-field validation codes, keyed by DropFormValues field name. Recomputed
  // wholesale on every Create click, so nothing stale can survive a submit.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // What the submit button says mid-upload. Empty outside a submit.
  const [progressLabel, setProgressLabel] = useState('');

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

  // The live doc for the drop just created. Status and bid count come from here
  // rather than from anything this view remembers, so a bid landing while the
  // success panel is open closes Edit off on the next snapshot.
  const createdAuction = useMemo(
    () => (createdId ? auctions.find((a) => a.id === createdId) : undefined),
    [createdId, auctions],
  );

  // The auction number is allocated server-side by createListing; post-create
  // it flows back through the auctions collection in context.
  const assignedNumber = createdAuction?.auctionNumber;

  // Pre-create there is no id yet. The old build interpolated a literal
  // "{{auction-id}}" into the caption, which rendered as a broken percent-
  // encoded URL in the preview — something an admin could copy by accident.
  const deepLink = useMemo(
    () =>
      createdId
        ? buildAuctionUrl(createdId, window.location.origin)
        : (isAr ? '(يُضاف الرابط عند الإنشاء)' : '(link added when you create)'),
    [createdId, isAr],
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
    // One guard for every essential field, including timing. validateDropForm
    // delegates the timing half to validateOpens, and validateOpens — NOT
    // resolveOpens — is what makes "At a set time" mean it: resolveOpens
    // returns scheduledStartAtMs: null for a blank/unparseable time, and
    // buildDropPayload's `?? now` would then open the lot immediately, the
    // exact silent degrade the old Scheduled-with-no-time field had. Returning
    // here before any upload is the only thing between the two, so both
    // REQUIRED and PAST must keep blocking.
    const found = validateDropForm(form, Date.now());
    setErrors(found);
    const firstKey = firstErrorField(found);
    if (firstKey) {
      // Scroll the FIRST problem into view — the button stays enabled precisely
      // so that clicking it says what is wrong, and a message rendered below the
      // fold says nothing.
      const el = document.getElementById(`field-${firstKey}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus?.();
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
          for (let i = 0; i < extraPhotos.length; i++) {
            const photo = extraPhotos[i];
            setProgressLabel(photoUploadLabel(i, extraPhotos.length, isAr));
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
        // createListing has always accepted this callback; the builder just
        // never passed it, which is why the button sat on "Creating..." for the
        // whole of a multi-minute video upload. It covers the cover image and
        // the video — the gallery photos are uploaded in the loop above.
        (progress, stage) => setProgressLabel(uploadStageLabel(progress, stage, isAr)),
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
      setProgressLabel('');
    }
  };

  /**
   * Clear the item, keep the batch. `afterCreateAnother` owns the keep-vs-clear
   * rule for every form field (including always clearing `viewing`) — the work
   * left here is the state that lives outside the form object.
   */
  const handleCreateAnother = () => {
    setForm(afterCreateAnother(form));
    // Both media paths that abandon an object URL have to revoke it. The cover
    // is easy to miss because swapping one already revokes in onCoverChange —
    // but "create another" abandons the last cover of the previous drop, and at
    // 20-30 drops a day that is 20-30 leaked blobs per session on its own.
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    extraPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    setExtraPhotos([]);
    setThumbnailFile(null);
    setThumbnailPreview('');
    setVideoFile(null);
    setCreatedId(null);
    setEditing(false);
    // Per-field errors are their own state and survive a form reset, so the
    // fresh drop would otherwise open wearing the previous lot's red messages.
    setErrors({});
    setError('');
    setCopyImageMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    // A relist is a NEW drop, so it must leave edit mode too — otherwise the
    // save bar Task 10 hangs off `editing` would sit over a prefilled form with
    // no created id to save to.
    setEditing(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ direction: isAr ? 'rtl' : 'ltr' }} className="h-full overflow-y-auto max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Success REPLACES the form, in place. The old build reported a create
          as one green line in the column to the right, which on a phone sits
          below the entire form — the admin's most-repeated action of the day
          confirmed somewhere they were not looking.

          The form block below is deliberately left at its original indentation
          rather than re-indented into this ternary: it is ~150 unchanged lines
          and shifting them all would bury the actual change in the diff. */}
      {createdId && !editing ? (
        <DropSuccessPanel
          isAr={isAr}
          auctionNumber={assignedNumber}
          title={form.productName.trim()}
          startingPrice={Number(form.startingPrice) || 0}
          coverUrl={thumbnailPreview}
          opensLabel={opensSummaryLabel(form.opensMode, startTimeDisplay, isAr)}
          durationLabel={durationLabel}
          finalLink={finalLink}
          caption={caption}
          status={createdAuction?.status}
          totalBids={createdAuction?.totalBids}
          hasCopyableMedia={Boolean(thumbnailFile || videoFile)}
          copyMessage={copyImageMsg}
          onCopyLink={() => copy(finalLink)}
          onCopyCaption={() => copy(caption)}
          onCopyImage={async () => {
            const ok = thumbnailPreview ? await copyImageToClipboard(thumbnailPreview) : false;
            setCopyImageMsg(ok ? (isAr ? '✅ نُسخت الصورة' : '✅ Image copied') : (isAr ? 'تعذّر النسخ — استخدم تنزيل' : "Couldn't copy — use Download"));
          }}
          onDownloadMedia={() => downloadMedia([
            ...(thumbnailPreview ? [{ url: thumbnailPreview, kind: 'cover' as const }] : []),
            ...extraPhotos.map((p, i) => ({ url: p.url, kind: 'gallery' as const, idx: i })),
            ...(videoFile ? [{ url: URL.createObjectURL(videoFile), kind: 'video' as const }] : []),
          ])}
          onCreateAnother={handleCreateAnother}
          // onEdit / onCancel land in Task 10 with handleSaveEdit and
          // handleCancelDrop. Wiring Edit before the save bar exists would swap
          // the panel for a form whose only button says "Create drop", so the
          // panel renders neither button until it has a handler for it.
        />
      ) : (
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
            id="field-productName"
            className={field}
            value={form.productName}
            onChange={(e) => setField('productName', e.target.value)}
          />
          {errors.productName && (
            <span className="mt-1 block text-[11px] font-bold text-rose-600">{dropErrorText(errors.productName, isAr)}</span>
          )}
        </label>

        <label className={label}>
          {isAr ? 'سعر البداية (دينار)' : 'Starting price (JOD)'} <span className="text-[#FF6B00]">*</span>
          <input
            id="field-startingPrice"
            type="number"
            className={field}
            value={form.startingPrice}
            onChange={(e) => setField('startingPrice', e.target.value)}
          />
          {errors.startingPrice && (
            <span className="mt-1 block text-[11px] font-bold text-rose-600">{dropErrorText(errors.startingPrice, isAr)}</span>
          )}
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
                id="field-scheduledLocal"
                type="datetime-local"
                className={field}
                value={form.scheduledLocal}
                onChange={(e) => setField('scheduledLocal', e.target.value)}
              />
              {errors.scheduledLocal && (
                <span className="mt-1 block text-[11px] font-bold text-rose-600">{dropErrorText(errors.scheduledLocal, isAr)}</span>
              )}
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

        {/* Submit area — kept self-contained so Task 9's success panel and
            Task 10's edit-mode save bar can wrap it in a conditional.
            Deliberately NOT disabled on an incomplete form: clicking it is what
            reveals the missing fields, and a disabled button that won't say why
            is the failure mode being removed. */}
        <button
          disabled={submitting}
          onClick={handleCreate}
          className="w-full bg-[#FF6B00] hover:bg-orange-500 disabled:opacity-60 text-white font-black text-sm py-3.5 rounded-2xl transition-all"
        >
          {submitting
            ? (progressLabel || (isAr ? 'جارٍ الإنشاء…' : 'Creating…'))
            : (isAr ? 'إنشاء المزاد' : 'Create drop')}
        </button>
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
      </div>
      )}

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
