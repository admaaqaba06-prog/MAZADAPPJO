import React, { useState } from 'react';
import { formatNumeral } from '../../utils/arabicNumerals';
import {
  MAX_GALLERY_PHOTOS,
  acceptGalleryFiles,
  addGalleryPhotos,
  classifyGalleryIntake,
  moveGalleryPhoto,
  imageFilesFromTransfer,
  removeGalleryPhoto,
  filesFromTransfer,
  isImageFile,
  isVideoFile,
  checkCoverFile,
  checkVideoFile,
  MAX_COVER_BYTES,
  MAX_VIDEO_BYTES,
  type MediaRefusal,
  type PickedPhoto,
} from '../../utils/mediaPickerState';

/**
 * Cover + gallery + video selection for the admin drop builder.
 *
 * Presentational: it owns no upload logic and touches no Firebase. The parent
 * holds the files and uploads them on submit.
 *
 * Deliberately no `capture="environment"` on the inputs: on iOS and most
 * Android browsers that attribute means "camera only" rather than "camera
 * first", and it hides the gallery/Files option outright. The team is
 * desktop-primary, so picking an existing photo is the common path — and the
 * seller sell-flow already has an open camera-only complaint from doing this.
 */
export interface MediaPickerProps {
  isAr: boolean;

  coverUrl: string;
  onCoverChange: (file: File | null) => void;

  gallery: PickedPhoto[];
  onGalleryChange: (next: PickedPhoto[]) => void;

  videoFile: File | null;
  onVideoChange: (file: File | null) => void;
}

const zone =
  'flex flex-col items-center justify-center border-2 border-dashed border-line rounded-xl cursor-pointer hover:bg-surface-sunken transition-colors';

export const MediaPicker: React.FC<MediaPickerProps> = ({
  isAr,
  coverUrl,
  onCoverChange,
  gallery,
  onGalleryChange,
  videoFile,
  onVideoChange,
}) => {
  // Hover treatment while a file drag is over the gallery.
  const [dragOver, setDragOver] = useState(false);
  // Same, for the two single-file zones, kept separate so dragging over one
  // does not light up the other.
  const [coverDragOver, setCoverDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  // Why the last cover/video pick was refused, or null. The gallery states its
  // refusals already; these two said nothing at all, so an oversized cover just
  // appeared not to work.
  const [coverError, setCoverError] = useState<MediaRefusal | null>(null);
  const [videoError, setVideoError] = useState<MediaRefusal | null>(null);

  /**
   * Accept a cover, or refuse it with a reason. Validated against the SERVER's
   * ceiling (`storage.rules`, 20MB on auction-thumbnails) so a file that would
   * be rejected on upload is refused here instead, where it can be explained.
   * `null` clears — that is the Remove button, not a refusal.
   */
  const takeCover = (f: File | null) => {
    if (!f) { setCoverError(null); onCoverChange(null); return; }
    const check = checkCoverFile(f);
    if (!check.ok) { setCoverError(check.reason ?? 'wrong_type'); return; }
    setCoverError(null);
    onCoverChange(f);
  };

  const takeVideo = (f: File | null) => {
    if (!f) { setVideoError(null); onVideoChange(null); return; }
    const check = checkVideoFile(f);
    if (!check.ok) { setVideoError(check.reason ?? 'wrong_type'); return; }
    setVideoError(null);
    onVideoChange(f);
  };
  // Index being dragged for reorder, or null.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  /**
   * What the last intake REFUSED, so the UI can say so.
   * A cap the user cannot see reads as "this is everything" — the bug class
   * behind #202, #220 and #221. Three times, so it gets stated on screen.
   */
  const [refused, setRefused] = useState<{ overCap: number; notImage: number } | null>(null);

  const intake = (files: File[]) => {
    const outcome = classifyGalleryIntake(gallery, files);
    setRefused(
      outcome.rejectedOverCap > 0 || outcome.rejectedNotImage > 0
        ? { overCap: outcome.rejectedOverCap, notImage: outcome.rejectedNotImage }
        : null,
    );
    if (outcome.accepted.length === 0) return;
    // Mint object URLs only for what is KEPT. A multi-select of five photos into
    // an empty gallery would otherwise create five blobs and keep three, leaking
    // the two the cap truncates.
    const incoming: PickedPhoto[] = outcome.accepted.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    onGalleryChange(addGalleryPhotos(gallery, incoming));
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    intake(Array.from(list));
  };

  const removeAt = (idx: number) => {
    const victim = gallery[idx];
    if (victim) URL.revokeObjectURL(victim.url);
    onGalleryChange(removeGalleryPhoto(gallery, idx));
  };

  return (
    <div className="space-y-4">
      {/* COVER */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-fg">
          {isAr ? 'صورة الغلاف' : 'Cover image'}
        </span>
        {coverUrl ? (
          <div className="relative rounded-xl overflow-hidden bg-black max-h-[200px]">
            <img src={coverUrl} alt="" className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => takeCover(null)}
              className="absolute top-2 end-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-2 py-1 text-[10px] font-bold cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ) : (
          /* Drop + click. `onDragOver` MUST preventDefault or the browser
             navigates away to the dropped file and the form is lost — the same
             reason the gallery zone below does it. `<label>` keeps the click
             path and the native picker, so mobile is unaffected. */
          <label
            className={`${zone} p-6 ${coverDragOver ? 'border-[#F05123] bg-accent-weak' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setCoverDragOver(true); }}
            onDragLeave={() => setCoverDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setCoverDragOver(false);
              takeCover(filesFromTransfer(e.dataTransfer, isImageFile)[0] ?? null);
            }}
          >
            <span className="text-2xl">🖼️</span>
            <span className="text-xs font-bold text-fg-muted mt-2">
              {coverDragOver
                ? (isAr ? 'أفلت الصورة هنا' : 'Drop the image here')
                : (isAr ? 'اسحب صورة الغلاف أو اضغط لاختيارها' : 'Drag a cover image here, or tap to choose')}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                takeCover(e.target.files?.[0] ?? null);
                // Clear the input so re-picking the SAME file fires onChange
                // again — otherwise a refused file cannot be retried.
                e.target.value = '';
              }}
            />
          </label>
        )}
        {coverError && (
          <p className="text-[11px] font-bold text-danger" role="alert">
            {coverError === 'wrong_type'
              ? (isAr ? 'الملف ليس صورة. الصور فقط.' : 'That file is not an image. Images only.')
              : (isAr
                  ? `الصورة أكبر من ${formatNumeral(MAX_COVER_BYTES / (1024 * 1024), isAr)} ميجابايت.`
                  : `The image is larger than ${MAX_COVER_BYTES / (1024 * 1024)}MB.`)}
          </p>
        )}
      </div>

      {/* GALLERY */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-fg">
          {isAr
            ? `صور إضافية (حتى ${formatNumeral(MAX_GALLERY_PHOTOS, isAr)} — اختياري)`
            : `Extra photos (up to ${formatNumeral(MAX_GALLERY_PHOTOS, isAr)} — optional)`}
        </span>
        {/*
          Drop + paste zone. `onDragOver` MUST preventDefault or the browser
          navigates to the dropped file instead of handing it over — the single
          most common reason a drop target silently does nothing.

          tabIndex makes it focusable so a paste has somewhere to land; the
          handler is on the container rather than window so pasting into this
          builder cannot hijack a paste meant for another field.
        */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            // A reorder drag is internal and carries no files; let it fall
            // through to the per-thumbnail handler rather than treating it as
            // an intake of zero files.
            const files = imageFilesFromTransfer(e.dataTransfer);
            if (files.length > 0) intake(files);
          }}
          onPaste={(e) => {
            const files = imageFilesFromTransfer(e.clipboardData);
            if (files.length > 0) { e.preventDefault(); intake(files); }
          }}
          tabIndex={0}
          /* 3 columns on a phone, 5 from sm up: at the raised cap of 15 a
             3-wide grid is five rows of thumbnails, which pushes the rest of
             the builder form off screen. */
          className={`grid grid-cols-3 sm:grid-cols-5 gap-2 rounded-xl transition-colors outline-none ${
            dragOver ? 'ring-2 ring-[#FF6B00] bg-accent-weak/40' : ''
          }`}
          id="gallery-drop-zone"
        >
          {gallery.map((photo, idx) => (
            <div
              key={photo.url}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                // Reorder only — a file drop is handled by the container above.
                if (dragIndex === null) return;
                e.stopPropagation();
                onGalleryChange(moveGalleryPhoto(gallery, dragIndex, idx));
                setDragIndex(null);
              }}
              className={`relative rounded-xl overflow-hidden bg-black aspect-square cursor-grab active:cursor-grabbing ${
                dragIndex === idx ? 'opacity-40' : ''
              }`}
            >
              <img src={photo.url} alt="" className="w-full h-full object-cover pointer-events-none" />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 end-1 bg-red-600 hover:bg-red-700 text-white rounded-md px-1.5 py-0.5 text-[9px] font-bold cursor-pointer"
              >
                {isAr ? 'حذف' : 'Remove'}
              </button>
            </div>
          ))}
          {gallery.length < MAX_GALLERY_PHOTOS && (
            <label className={`${zone} aspect-square`}>
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
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {refused && (
          <p className="text-[11px] font-bold text-amber-600" id="gallery-refused-notice">
            {isAr
              ? [
                  refused.overCap > 0
                    ? `لم تُضف ${formatNumeral(refused.overCap, isAr)} صورة — الحد ${formatNumeral(MAX_GALLERY_PHOTOS, isAr)}.`
                    : '',
                  refused.notImage > 0
                    ? `تم تجاهل ${formatNumeral(refused.notImage, isAr)} ملف غير صورة.`
                    : '',
                ].filter(Boolean).join(' ')
              : [
                  refused.overCap > 0
                    ? `${refused.overCap} photo${refused.overCap === 1 ? '' : 's'} not added — the limit is ${MAX_GALLERY_PHOTOS}.`
                    : '',
                  refused.notImage > 0
                    ? `${refused.notImage} non-image file${refused.notImage === 1 ? '' : 's'} ignored.`
                    : '',
                ].filter(Boolean).join(' ')}
          </p>
        )}
        <span className="block text-[11px] text-fg-muted">
          {isAr
            ? 'اسحب صوراً هنا أو الصقها (Ctrl+V)، ورتّبها بالسحب. يستطيع المزايدون التنقل بينها داخل غرفة المزاد.'
            : 'Drag photos here or paste them (Ctrl+V), and drag to reorder. Bidders swipe through these inside the live room.'}
        </span>
      </div>

      {/* VIDEO */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-fg">
          {isAr ? 'فيديو المنتج (اختياري)' : 'Product video (optional)'}
        </span>
        {videoFile ? (
          <div className="flex items-center justify-between gap-3 bg-surface-sunken border border-line rounded-xl p-3">
            <span className="text-xs font-bold text-fg truncate">
              🎥 {videoFile.name}
              <span className="block text-[10px] font-mono text-fg-muted">
                {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </span>
            <button
              type="button"
              onClick={() => takeVideo(null)}
              className="shrink-0 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg px-2.5 py-1 text-[10px] font-bold cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ) : (
          <label
            className={`${zone} p-5 ${videoDragOver ? 'border-[#F05123] bg-accent-weak' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setVideoDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setVideoDragOver(true); }}
            onDragLeave={() => setVideoDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setVideoDragOver(false);
              takeVideo(filesFromTransfer(e.dataTransfer, isVideoFile)[0] ?? null);
            }}
          >
            <span className="text-2xl">🎥</span>
            <span className="text-xs font-bold text-fg-muted mt-2">
              {videoDragOver
                ? (isAr ? 'أفلت الفيديو هنا' : 'Drop the video here')
                : (isAr ? 'اسحب الفيديو أو اضغط لاختياره' : 'Drag a video here, or tap to choose')}
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                takeVideo(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {videoError && (
          <p className="text-[11px] font-bold text-danger" role="alert">
            {videoError === 'wrong_type'
              ? (isAr ? 'الملف ليس فيديو. MP4 أو MOV أو M4V أو WEBM.' : 'That file is not a video. MP4, MOV, M4V or WEBM.')
              : (isAr
                  ? `الفيديو أكبر من ${formatNumeral(MAX_VIDEO_BYTES / (1024 * 1024), isAr)} ميجابايت.`
                  : `The video is larger than ${MAX_VIDEO_BYTES / (1024 * 1024)}MB.`)}
          </p>
        )}
      </div>
    </div>
  );
};

export default MediaPicker;
