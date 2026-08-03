import React, { useCallback, useMemo, useRef, useState } from 'react';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { useApp, useAuctions } from '../context/AppContext';
import { db } from '../services/firebase';
import {
  canEditDrop,
  canCancelDrop,
  cancelConfirmMessage,
  buildDropEditWrite,
} from '../utils/dropEditability';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, type DropChannel } from '../utils/dropChannel';
import { buildDropPayload } from '../utils/dropPayload';
import {
  INITIAL_FORM,
  afterCreateAnother,
  clearErrorsForField,
  dropErrorText,
  firstErrorField,
  validateDropForm,
  type DropFormValues,
} from '../utils/dropFormState';
import { photoUploadLabel, uploadStageLabel } from '../utils/dropProgress';
import { DURATION_PRESETS, durationLabel } from '../utils/dropDuration';
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

const OPENS_OPTIONS: { id: OpensMode; ar: string; en: string }[] = [
  { id: 'now', ar: 'الآن', en: 'Now' },
  { id: 'scheduled', ar: 'بوقت محدد', en: 'At a set time' },
  { id: 'first_bid', ar: 'مع أول مزايدة', en: 'On first bid' },
];

export default function AuctionDropBuilderView() {
  const { language, createListing, deleteAuction } = useApp();
  const { auctions } = useAuctions();
  const isAr = language === 'ar';

  // Every text/select value the form holds lives in one object. The old form
  // carried sixteen parallel useState calls, which is what made "reset for the
  // next drop" and "prefill from a relist" each have to remember all sixteen.
  const [form, setForm] = useState<DropFormValues>(INITIAL_FORM);

  // Media are File objects, not serialisable form state, so they stay separate.
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [extraPhotos, setExtraPhotos] = useState<PickedPhoto[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [copyImageMsg, setCopyImageMsg] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Re-opening a created drop for edits. Set only by the success panel's Edit
  // button; it swaps the panel back for the form and reveals the save bar at
  // the bottom of it, in place of Create.
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Per-field validation codes, keyed by DropFormValues field name. Recomputed
  // wholesale on every Create click, so nothing stale can survive a submit —
  // and cleared per field by setField below, so nothing stale survives the fix
  // either.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // What the submit button says mid-upload. Empty outside a submit.
  const [progressLabel, setProgressLabel] = useState('');

  /**
   * The one write path into the form — and therefore the one place a field's
   * error can be retired.
   *
   * Every control in this view goes through it: the two required inputs, the
   * Opens buttons, the start-time picker, the duration and channel selects and
   * all ten of the drawer's fields. That is what lets the clear live here
   * instead of on ~fifteen `onChange` handlers, each of which would have to
   * remember — the shipped defect was a red "This field is required" sitting
   * under a name the admin had already typed, and it survived until the next
   * submit precisely because nothing but a submit ever touched `errors`.
   *
   * clearErrorsForField owns which errors a change retires, including the
   * cross-field one: changing the Opens mode retires the `scheduledLocal`
   * error, whose input that change may have just unmounted.
   */
  const setField = useCallback(
    <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => clearErrorsForField(prev, key));
    },
    [],
  );

  // THE scrolling element for this view. DesktopFrame is `overflow-hidden` and
  // every in-frame view owns its own scroll, so the document itself never
  // moves: `window.scrollTo` here is a silent no-op, which is what left the
  // admin looking at the middle of a form after "create another". Every
  // programmatic scroll below goes through this ref instead.
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /**
   * Centre a field inside the scroll container.
   *
   * `scrollIntoView` walks up to the nearest scrollable ancestor, which USUALLY
   * resolves to the same div — but "usually" is doing real work in a view that
   * lives inside a fixed frame and gains a sticky footer below `md`. Measuring
   * against the container we already hold a ref to removes the guess. Falls
   * back to `scrollIntoView` if the ref is somehow not attached, so the worst
   * case is the previous behaviour rather than no scroll at all.
   */
  const scrollFieldIntoView = useCallback((el: HTMLElement) => {
    const container = scrollRef.current;
    if (!container) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const elBox = el.getBoundingClientRect();
    const centred =
      container.scrollTop + (elBox.top - containerBox.top) - (container.clientHeight - elBox.height) / 2;
    container.scrollTo({ top: Math.max(0, centred), behavior: 'smooth' });
  }, []);

  /**
   * Move the admin to the FIRST field that failed validation. Returns true when
   * there was one, i.e. "the submit must stop here".
   *
   * Shared by Create and Save deliberately. Both buttons stay enabled on an
   * incomplete form because clicking them is what reveals what is missing — and
   * a message rendered below the fold reveals nothing. Save needs this MORE than
   * Create: the sticky bottom bar sits over the lower half of the form on a
   * phone, so a silent `return` leaves the admin pressing a button that does
   * nothing with the reason hidden underneath it.
   */
  const focusFirstError = useCallback(
    (found: Record<string, string>): boolean => {
      const firstKey = firstErrorField(found);
      if (!firstKey) return false;
      const el = document.getElementById(`field-${firstKey}`);
      if (el) {
        scrollFieldIntoView(el);
        // preventScroll, or the focus call scrolls the container itself — the
        // browser's own instant jump landing on top of the smooth one above.
        el.focus?.({ preventScroll: true });
      }
      return true;
    },
    [scrollFieldIntoView],
  );

  /**
   * Drop every picked file and revoke its object URL.
   *
   * Both paths that abandon a set of picked media go through here: "create
   * another" and "relist". The cover is the easy one to miss because swapping
   * one already revokes in onCoverChange — but abandoning the last cover leaks
   * it, and at 20-30 drops a day that is 20-30 blobs a session on its own.
   */
  const clearPickedMedia = () => {
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    extraPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    setExtraPhotos([]);
    setThumbnailFile(null);
    setThumbnailPreview('');
    setVideoFile(null);
  };

  /**
   * Everything a "start the next drop" does OUTSIDE the form object.
   *
   * Two entry points reach this state — "create another" and a relist — and
   * they differ only in how they fill the form: one clears it down to the batch
   * settings, the other prefills it from a past lot. Every other step is
   * identical, so it lives here rather than in both.
   *
   * That was not cosmetic. handleRelist had grown five of the seven steps and
   * was missing the three message resets, so a failed submit followed by a
   * relist prefilled the form with valid values and left the previous attempt's
   * red "This field is required" sitting underneath them — Bug 3 again, through
   * the other door. A shared helper is what stops the two paths drifting apart
   * a third time; the media revoke below already had to learn this lesson.
   *
   * The caller sets the form itself, immediately before or after calling this.
   */
  const resetForNextDrop = () => {
    // Picked files belong to the drop that was just abandoned. Leaving them
    // would publish the previous item's photos and video on this one.
    clearPickedMedia();
    setCreatedId(null);
    // A new drop is never in edit mode — the save bar hangs off `editing` and
    // would otherwise sit over a form with no created id to save to.
    setEditing(false);
    // The three message channels, all of which survive a form reset on their
    // own: per-field validation errors, the shared failure line (which can be
    // holding "a bid landed — editing is locked" about the PREVIOUS lot), and
    // the copy-image result.
    setErrors({});
    setError('');
    setCopyImageMsg('');
    // DesktopFrame is overflow-hidden, so `window.scrollTo` is a no-op here and
    // the new form would otherwise open scrolled to the middle of the last one.
    scrollToTop();
  };

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

  // TWO labels for one duration, deliberately, because the two consumers below
  // are not in the same language.
  //
  // The caption is the buyer-facing WhatsApp post: dropCaption.ts is Arabic end
  // to end, so its duration line stays Arabic no matter which language the
  // admin is running the console in. The success panel is admin-facing and
  // follows `isAr` — it used to take the Arabic label too, which is why an
  // English admin saw "Opens now · 30 دقيقة".
  const captionDurationLabel = useMemo(
    () => durationLabel(form.durationSeconds, true),
    [form.durationSeconds],
  );
  const uiDurationLabel = useMemo(
    () => durationLabel(form.durationSeconds, isAr),
    [form.durationSeconds, isAr],
  );

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
        durationLabel: captionDurationLabel,
        startingPriceJod: Number(form.startingPrice) || 0,
        productName: form.productName.trim() || '—',
        specs,
        condition: form.condition.trim(),
        deepLink,
      }),
    [assignedNumber, startTimeDisplay, captionDurationLabel, form.startingPrice, form.productName, specs, form.condition, deepLink],
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
    // Scroll the FIRST problem into view — the button stays enabled precisely
    // so that clicking it says what is wrong, and a message rendered below the
    // fold says nothing.
    if (focusFirstError(found)) return;
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
            specs,
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
      // The success panel renders this string as its copy-result line, so a
      // "✅ Image copied" left over from a pre-create Copy image would open the
      // fresh panel already reporting a result nobody asked for.
      setCopyImageMsg('');
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
   * rule for every form field (including always clearing `viewing`);
   * `resetForNextDrop` owns everything outside the form object.
   */
  const handleCreateAnother = () => {
    setForm(afterCreateAnother(form));
    resetForNextDrop();
  };

  /**
   * Save an edit to the drop that was just created.
   *
   * Two guards, both against the LIVE lot rather than whatever the success
   * panel rendered from, because the gap between opening the editor and
   * pressing Save is exactly long enough for a bid to land — and once someone
   * has committed money, the terms they committed to stop moving.
   */
  const handleSaveEdit = async () => {
    if (!createdId) return;
    const found = validateDropForm(form, Date.now());
    setErrors(found);
    // Same treatment Create gets, and for a sharper reason: the save bar is
    // sticky below md, so it sits ON TOP of the lower half of the form. A bare
    // `return` here is a button that visibly does nothing, with the red message
    // explaining why hidden behind the bar that was just pressed.
    if (focusFirstError(found)) return;

    const lockedMsg = isAr
      ? 'وصلت مزايدة — لم يعد التعديل ممكناً.'
      : 'A bid landed — this drop can no longer be edited.';

    // Guard 1 — the auctions subscription. `createdAuction` is derived from the
    // live onSnapshot listener, not from anything this view remembers, so a bid
    // that has already reached the client blocks the save without a round trip.
    if (!canEditDrop({ status: createdAuction?.status, totalBids: createdAuction?.totalBids })) {
      setError(lockedMsg);
      setEditing(false);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      // Guard 2 — the document itself, read immediately before the write. Guard 1
      // is only as fresh as the last snapshot delivered; this closes the window
      // between that snapshot and this write. It fails CLOSED: an unreadable or
      // missing doc falls to the catch/return below and nothing is written.
      // (Task 12 adds the server-side twin — a rule refusing money/timing edits
      // once totalBids > 0 — which is what actually makes this unbypassable.)
      const liveSnap = await getDoc(doc(db, 'auctions', createdId));
      if (!liveSnap.exists()) {
        setError(isAr ? 'هذا المزاد لم يعد موجوداً.' : 'This drop no longer exists.');
        setEditing(false);
        return;
      }
      const live = liveSnap.data() as { status?: string; totalBids?: number };
      if (!canEditDrop({ status: live?.status, totalBids: live?.totalBids })) {
        setError(lockedMsg);
        setEditing(false);
        return;
      }

      const payload = buildDropPayload(
        {
          productName: form.productName,
          specs,
          startingPrice: form.startingPrice,
          channel: form.channel,
          durationSeconds: form.durationSeconds,
          paymentWindowHours: form.paymentWindowHours,
          antiSnipeSec: form.antiSnipeSec,
          startMode: opens.startMode,
          scheduledStartAtMs: opens.scheduledStartAtMs,
          autoRelist: form.autoRelist,
          viewing: form.viewing,
          viewingPlace: form.viewingPlace,
          marketPrice: form.marketPrice,
          reservePrice: form.reservePrice,
          vendorName: form.vendorName,
          extraPhotoUrls: [],
        },
        Date.now(),
      );

      // buildDropEditWrite owns the whole difference between a CREATION payload
      // and an EDIT write, and documents why each part of it is there.
      //
      // What it removes: media and the reserve. The form holds File objects, not
      // uploaded URLs, so the media keys would blank media that uploaded fine;
      // the reserve lives in the admin-only auctionSecrets doc this form cannot
      // read, so a blank reserve field here means "unknown", never "none". Plus
      // the clock on a first_bid lot, which createListing drops on the create
      // path and this write would otherwise stamp back on.
      //
      // What it adds: `endsAt` on a scheduled lot. The closer reads endsAt in
      // preference to endTime (functions/index.js:511-522), so an edit that
      // moved only endTime left the lot closing at its original time.
      // Timestamp.fromMillis is the same constructor createListing uses.
      await updateDoc(
        doc(db, 'auctions', createdId),
        buildDropEditWrite(payload, (ms) => Timestamp.fromMillis(ms)) as any,
      );
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل حفظ التعديل' : 'Failed to save changes'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Delete the drop. Destructive and unrecoverable: the auction doc goes, and
   * any bids on it go with it — so the confirm names the bid count out loud
   * rather than hiding it behind a warning triangle.
   */
  const handleCancelDrop = async () => {
    if (!createdId) return;
    // The live lot, for the same reason handleSaveEdit uses it: the panel's
    // Cancel button was rendered from a snapshot that may now be one settlement
    // out of date, and a settled lot has orders hanging off it.
    const lot = { status: createdAuction?.status, totalBids: createdAuction?.totalBids };
    if (!canCancelDrop(lot)) {
      setError(isAr ? 'انتهى هذا المزاد — لم يعد الإلغاء ممكناً.' : 'This drop has ended — it can no longer be cancelled.');
      return;
    }

    if (!window.confirm(cancelConfirmMessage(lot, isAr))) return;

    setSubmitting(true);
    try {
      await deleteAuction(createdId);
      handleCreateAnother();
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل إلغاء المزاد' : 'Failed to cancel the drop'));
    } finally {
      setSubmitting(false);
    }
  };

  const finalLink = createdId ? buildAuctionUrl(createdId, window.location.origin) : '';

  // One flag for "the success panel owns the screen", used by BOTH columns.
  // The panel replaces the form on the left; the preview column on the right
  // must simultaneously stop rendering its own link, copy buttons and created
  // line, or a successful create ships two success indicators and two sources
  // of truth for the same URL — worse than the single green line this task
  // replaced. Derived once so the two halves cannot drift apart.
  const showSuccessPanel = Boolean(createdId) && !editing;
  const sectionHeader = 'text-xs font-bold text-neutral-400 uppercase tracking-wide';
  const label = 'block text-sm font-bold text-fg';
  const field =
    'mt-1 w-full border border-line rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#FF6B00]';

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
    // A relist is a NEW drop that happens to arrive prefilled, so it gets the
    // same treatment "create another" does — media dropped, edit mode left,
    // every stale message cleared, scrolled to the top. It used to do four of
    // those seven things inline and none of the three message resets, which is
    // how a failed submit's red errors survived onto a freshly prefilled form.
    resetForNextDrop();
  };

  return (
    // h-full overflow-y-auto, never min-h-screen: DesktopFrame is
    // overflow-hidden, so this div is the scrollport for the whole view. The
    // bottom padding clears the frame's nav AND the sticky submit bar below md,
    // so the last field is never parked underneath the Create button.
    <div
      ref={scrollRef}
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      className="h-full overflow-y-auto max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2 pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      {/* Success REPLACES the form, in place. The old build reported a create
          as one green line in the column to the right, which on a phone sits
          below the entire form — the admin's most-repeated action of the day
          confirmed somewhere they were not looking.

          The form block below is deliberately left at its original indentation
          rather than re-indented into this ternary: it is ~150 unchanged lines
          and shifting them all would bury the actual change in the diff. */}
      {showSuccessPanel ? (
        // The panel is wrapped rather than being the grid child itself so the
        // shared `error` line can sit under it. Every failure this view reports
        // used to render at the bottom of the FORM, which is unmounted whenever
        // the panel is up — so "a bid landed, editing is locked" and a failed
        // cancel both landed on a node nobody was rendering. Same message, same
        // state, now visible in both halves of the ternary.
        <div className="space-y-3">
        <DropSuccessPanel
          isAr={isAr}
          auctionNumber={assignedNumber}
          title={form.productName.trim()}
          startingPrice={Number(form.startingPrice) || 0}
          coverUrl={thumbnailPreview}
          opensLabel={opensSummaryLabel(form.opensMode, startTimeDisplay, isAr)}
          durationLabel={uiDurationLabel}
          finalLink={finalLink}
          caption={caption}
          status={createdAuction?.status}
          totalBids={createdAuction?.totalBids}
          // Each action is gated on what its own handler actually needs:
          // onCopyImage below can only copy `thumbnailPreview`, while
          // onDownloadMedia takes the gallery photos too.
          canCopyImage={Boolean(thumbnailPreview)}
          canDownloadMedia={Boolean(thumbnailPreview || extraPhotos.length > 0 || videoFile)}
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
          // The panel renders Edit and Cancel only once it has a handler for
          // each — a button that does nothing is worse than an absent one. Both
          // land here: Edit swaps the panel back for the form (which now ends in
          // a save bar instead of Create), Cancel confirms and deletes.
          onEdit={() => setEditing(true)}
          onCancel={handleCancelDrop}
        />
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
        </div>
      ) : (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">{isAr ? 'إنشاء مزاد جديد' : 'Create a Drop'}</h1>

        {/* MEDIA — first, the team is holding the item */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'الوسائط' : 'Media'}</h2>
          {/* An edit write cannot carry media: the form holds File objects, not
              the uploaded URLs, so stripNonEditableKeys drops mediaUrls/
              videoUrl/thumbnailUrl rather than blanking media that uploaded
              fine. Leaving the picker on screen in edit mode therefore offers an
              action that is silently discarded on Save — the admin adds a photo,
              saves, and nothing happens. Hidden rather than disabled: a greyed
              picker still has to be trusted not to leak a change through any one
              of its cover/gallery/video controls, while a note says the same
              thing with nothing to get wrong. */}
          {editing ? (
            <p className="text-[11px] text-fg-muted bg-surface-sunken border border-line rounded-xl p-2.5">
              {isAr
                ? 'لا يمكن تغيير الوسائط من هنا. الصور والفيديو المرفوعة تبقى كما هي — لتغييرها ألغِ المزاد وأنشئه من جديد.'
                : "Media can't be changed here. The uploaded photos and video stay as they are — to change them, cancel this drop and create it again."}
            </p>
          ) : (
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
          )}
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
          <span className="mt-1 block text-[11px] text-fg-muted">
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
          {/* Three equal segments that survive both languages. «مع أول مزايدة»
              is more than three times the width of «الآن», so on a phone the
              third label wraps while its neighbours stay on one line.
              `whitespace-nowrap` is the wrong fix — it would overflow the
              column instead. So: let it wrap, but make the wrap harmless.
              `items-stretch` + `min-h-11` keeps all three the same height
              whether one line or two, the inner flex centres the label
              vertically and horizontally in both directions (no `text-left`
              that RTL would have to undo), and `leading-tight` keeps two lines
              inside the pill. min-h-11 is also the 44px tap target. */}
          <div className="mt-1 grid grid-cols-3 gap-2 items-stretch">
            {OPENS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setField('opensMode', o.id)}
                className={`flex items-center justify-center text-center min-h-11 px-1.5 py-2 border rounded-xl text-xs font-bold leading-tight transition-colors cursor-pointer ${
                  form.opensMode === o.id
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00]'
                    : 'bg-surface-raised text-fg border-line hover:border-gray-400'
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
            <p className="mt-2 text-[11px] text-fg-muted bg-surface-sunken border border-line rounded-xl p-2.5">
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
              <option key={d.seconds} value={d.seconds}>{isAr ? d.ar : d.en}</option>
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

        {/* Submit area. In edit mode the same form is saving changes to a lot
            that already exists, so Create is replaced outright rather than
            joined — one button, one meaning.
            Deliberately NOT disabled on an incomplete form: clicking it is what
            reveals the missing fields, and a disabled button that won't say why
            is the failure mode being removed. */}
        {/* Below md the bar pins to the bottom of the scrollport so Create is
            reachable from anywhere in a long form; from md up it is static and
            simply ends the column. `-mx-4 px-4` makes it full-bleed against the
            root's p-4 on phones only. The error line lives INSIDE the bar: it is
            the message the button just produced, and left outside it would
            render below the fold the bar is covering. */}
        <div className="sticky bottom-0 z-10 md:static -mx-4 md:mx-0 px-4 md:px-0 py-3 md:py-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-0 border-t md:border-t-0 border-line bg-surface-raised/95 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none space-y-2">
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveEdit}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-sm py-3.5 rounded-2xl transition-all cursor-pointer"
            >
              {submitting ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ التعديلات' : 'Save changes')}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setErrors({}); setError(''); }}
              className="flex-1 border border-line rounded-2xl py-3.5 text-sm font-bold text-fg hover:bg-surface-sunken transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء التعديل' : 'Discard changes'}
            </button>
          </div>
        ) : (
          <button
            disabled={submitting}
            onClick={handleCreate}
            className="w-full bg-[#FF6B00] hover:bg-orange-500 disabled:opacity-60 text-white font-black text-sm py-3.5 rounded-2xl transition-all"
          >
            {submitting
              ? (progressLabel || (isAr ? 'جارٍ الإنشاء…' : 'Creating…'))
              : (isAr ? 'إنشاء المزاد' : 'Create drop')}
          </button>
        )}
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
        </div>
      </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{isAr ? 'معاينة المنشور' : 'Post preview'}</h2>
        <pre className="whitespace-pre-wrap border rounded p-3 text-sm bg-surface-sunken" style={{ direction: 'rtl' }}>{caption}</pre>

        {/* Everything below is the PRE-create half of this column. Once the
            success panel is up it owns the link, the copy actions and the
            confirmation — the created line, the link box and its Copy link
            button used to live here and are gone, not duplicated.

            "Copy caption" went with them rather than moving inside this block:
            it was `disabled={!createdId}`, so it never did anything before a
            create in the first place. Copy image and Download media DO work
            pre-create (on the picked files), so they stay for that half only. */}
        {!showSuccessPanel && (
          <>
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

            {!createdId && (
              <p className="text-neutral-500 text-sm">{isAr ? 'أنشئ المزاد للحصول على الرابط النهائي ثم انسخ النص' : 'Create the drop to get the final link, then copy the caption'}</p>
            )}
          </>
        )}

        <div className="pt-4 mt-4 border-t">
          <DropsListPanel onRelist={handleRelist} />
        </div>
      </div>
    </div>
  );
}
