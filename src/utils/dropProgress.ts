/**
 * What the submit button says while a drop is being published.
 *
 * A drop upload is three separate transfers (gallery photos, then the cover,
 * then the video) and can run for minutes on a phone connection. The button
 * used to say "Creating..." for the whole of it, which is indistinguishable
 * from a hung tab — so admins tapped it again or reloaded mid-upload. These
 * labels are the only signal that the thing is still moving.
 */

/** The stages createListing's own onProgress callback reports. */
export type UploadStage = 'video' | 'thumbnail' | 'saving';

/**
 * Firebase reports progress as bytesTransferred/totalBytes * 100, which is NaN
 * for a zero-byte file and can land a hair over 100 on the final event. Neither
 * belongs on a button, and "Uploading video… NaN%" reads as a crash.
 */
function percent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

/**
 * The gallery photos upload in the builder's own loop, before createListing is
 * called, so their progress is a position (photo 2 of 3) rather than a
 * percentage — that loop uploads whole files one at a time with no byte-level
 * callback. `index` is zero-based; the label is one-based for humans.
 */
export function photoUploadLabel(index: number, total: number, isAr: boolean): string {
  return isAr
    ? `جارٍ رفع الصورة ${index + 1} من ${total}…`
    : `Uploading photo ${index + 1} of ${total}…`;
}

/**
 * The cover and video stages come from createListing with a real byte
 * percentage; 'saving' is the write itself, which has no meaningful percentage
 * so it gets a plain sentence instead of a misleading number.
 */
export function uploadStageLabel(progress: number, stage: UploadStage, isAr: boolean): string {
  if (stage === 'video') {
    return isAr
      ? `جارٍ رفع الفيديو… ${percent(progress)}%`
      : `Uploading video… ${percent(progress)}%`;
  }
  if (stage === 'thumbnail') {
    return isAr
      ? `جارٍ رفع صورة الغلاف… ${percent(progress)}%`
      : `Uploading cover… ${percent(progress)}%`;
  }
  return isAr ? 'جارٍ إنشاء المزاد…' : 'Creating auction…';
}
