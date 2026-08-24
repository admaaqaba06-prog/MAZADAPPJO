/**
 * The pure half of MediaPicker. Object-URL creation and revocation stay in the
 * component — `URL.createObjectURL` does not exist in the node test
 * environment this repo runs vitest under, so these take formed records.
 */

/**
 * How many EXTRA photos a drop may carry, beyond its cover image.
 *
 * Raised 3 -> 15 on 2026-08-04 (MJ). The previous comment here claimed the value
 * "matches the gallery cap the seller wizard and the live room already assume" —
 * that was not true when checked: `MediaPicker` is imported only by
 * `AuctionDropBuilderView`, the seller wizard does not use it, and the live room
 * caps nothing it renders. Nothing outside this module reads the constant except
 * that one picker, so the number is free to move.
 *
 * What DOES scale with it: the picker grid (grid-cols-3, so 15 is five rows) and
 * upload time — the builder uploads gallery photos sequentially, resizing each
 * client-side first, and already renders per-photo progress.
 */
export const MAX_GALLERY_PHOTOS = 15;

export interface PickedPhoto {
  file: File;
  url: string;
}

export function isImageFile(f: { type: string }): boolean {
  return f.type.startsWith('image/');
}

/** Appends, then truncates to the cap. Never mutates `prev`. */
export function addGalleryPhotos(
  prev: PickedPhoto[],
  incoming: PickedPhoto[],
): PickedPhoto[] {
  if (incoming.length === 0) return prev;
  return [...prev, ...incoming].slice(0, MAX_GALLERY_PHOTOS);
}

/** How many more photos the gallery will actually accept. Never negative. */
export function remainingGallerySlots(prev: PickedPhoto[]): number {
  return Math.max(0, MAX_GALLERY_PHOTOS - prev.length);
}

/**
 * The files from a pick that will actually end up in the gallery.
 *
 * The caller mints one object URL per file it keeps, and it must mint them
 * AFTER this rather than before: the picker is `multiple`, so selecting five
 * photos into an empty gallery used to create five blob URLs and then hand them
 * to `addGalleryPhotos`, which kept three. The other two were never rendered,
 * never revoked, and leaked for the life of the page — twenty-odd times a day.
 *
 * Filtering and slicing here means the count this returns is exactly the count
 * `addGalleryPhotos` will keep, so nothing is minted that gets dropped.
 */
export function acceptGalleryFiles<T extends { type: string }>(
  prev: PickedPhoto[],
  incoming: T[],
): T[] {
  return incoming.filter(isImageFile).slice(0, remainingGallerySlots(prev));
}

/**
 * Out-of-range indices are a no-op rather than a silent whole-list rewrite.
 * NaN and fractional indices need the explicit integer check — both bounds
 * comparisons are false for NaN, so it would otherwise fall through to
 * `filter` and rewrite the list.
 */
export function removeGalleryPhoto(prev: PickedPhoto[], index: number): PickedPhoto[] {
  if (!Number.isInteger(index) || index < 0 || index >= prev.length) return prev;
  return prev.filter((_, i) => i !== index);
}

/**
 * Reorder within the gallery. Used by drag-to-reorder.
 *
 * Out-of-range, NaN and fractional indices are a no-op rather than a silent
 * rewrite — the same rule `removeGalleryPhoto` follows, and for the same reason:
 * a drop that lands nowhere should leave the list exactly as it was.
 *
 * NOTE ON COVER: reordering does NOT change the cover image. This wizard picks
 * the cover through its own input (`onCoverChange`) and the gallery is extra
 * photos, so there is no "first one wins" rule to honour here. A spec written
 * against a Shopify-style single list would expect otherwise.
 */
export function moveGalleryPhoto(
  prev: PickedPhoto[],
  from: number,
  to: number,
): PickedPhoto[] {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return prev;
  if (from < 0 || from >= prev.length) return prev;
  if (to < 0 || to >= prev.length) return prev;
  if (from === to) return prev;
  const next = [...prev];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** What a drop or paste actually did, so the UI can say so rather than imply it. */
export interface IntakeOutcome<T> {
  /** The files that will be kept — already filtered and capped. */
  accepted: T[];
  /** Dropped because they were not images. */
  rejectedNotImage: number;
  /** Dropped because the gallery is full. NEVER let this be silent. */
  rejectedOverCap: number;
}

/**
 * Split an incoming batch into what the gallery keeps and what it refuses, WITH
 * REASONS.
 *
 * `acceptGalleryFiles` already returns the keepers, but silently: drop five
 * photos into an empty gallery and three appear with no account of the other
 * two. A cap the user cannot see reads as "this is everything" — the exact bug
 * class behind #202 (150 lots looking like 20), #220 (the featured list
 * exceeding its own cap) and #221 (141 auctions invisible). Three times, so the
 * count comes back and the caller states it.
 */
export function classifyGalleryIntake<T extends { type: string }>(
  prev: PickedPhoto[],
  incoming: T[],
): IntakeOutcome<T> {
  const images = incoming.filter(isImageFile);
  const slots = remainingGallerySlots(prev);
  return {
    accepted: images.slice(0, slots),
    rejectedNotImage: incoming.length - images.length,
    rejectedOverCap: Math.max(0, images.length - slots),
  };
}

/**
 * Image files out of a DataTransfer (a drop) or a ClipboardEvent (a paste).
 *
 * Takes the `items`/`files` shape rather than the event so it is testable in
 * node. Prefers `files` and falls back to `items`, because a paste exposes the
 * image only through `items` while an OS drag populates `files`.
 */
export function imageFilesFromTransfer(transfer: {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
} | null | undefined): File[] {
  return filesFromTransfer(transfer, isImageFile);
}

/** The shape a drop (`DataTransfer`) and a paste (`ClipboardEvent`) share. */
export interface MediaTransfer {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
}

/**
 * Files out of a drop or a paste, filtered by `accept`.
 *
 * Generalised from `imageFilesFromTransfer` (kept above as a wrapper so its
 * call sites and tests are untouched) because the cover and video zones need
 * the same `files`-then-`items` walk with a different predicate. Takes the
 * shape rather than the event so it stays testable in node.
 */
export function filesFromTransfer(
  transfer: MediaTransfer | null | undefined,
  accept: (f: { type: string; name?: string }) => boolean,
): File[] {
  if (!transfer) return [];

  const fromFiles = transfer.files ? Array.from(transfer.files) : [];
  if (fromFiles.length > 0) return fromFiles.filter(accept);

  if (!transfer.items) return [];
  const out: File[] = [];
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (f && accept(f)) out.push(f);
  }
  return out;
}

/**
 * A video, judged the way `VideoUploadForm` already judges one: a `video/*` MIME
 * type, OR a known extension when the browser reports nothing useful. Android
 * file pickers and some OS drags hand over `''` or `application/octet-stream`
 * for a perfectly good .mov, so extension is the fallback rather than a reject.
 */
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm'] as const;

export function isVideoFile(f: { type: string; name?: string }): boolean {
  const type = f.type || '';
  if (type.startsWith('video/')) return true;
  if (type !== '' && type !== 'application/octet-stream') return false;
  const name = (f.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot !== -1 && (VIDEO_EXTENSIONS as readonly string[]).includes(name.slice(dot));
}

/**
 * Size ceilings, taken from `storage.rules` rather than picked — the server
 * rejects past these, so validating anywhere else would either surprise the
 * user with a server error or refuse a file that would have uploaded fine.
 *
 *   auction-thumbnails/  20MB  image/*   (cover + gallery)
 *   auction-videos/      250MB video/*
 *
 * The seller's video form applies its OWN stricter 100MB cap with a warning band
 * above 25MB; that is a deliberate product choice about upload reliability on
 * mobile connections and is left where it is.
 */
export const MAX_COVER_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

/** Why a single-file pick was refused, so the UI can say which it was. */
export type MediaRefusal = 'wrong_type' | 'too_large';

export interface MediaCheck {
  ok: boolean;
  reason?: MediaRefusal;
}

/**
 * Validate one picked/dropped file for a single-file zone.
 *
 * Separate from the gallery's `classifyGalleryIntake` because that one reports
 * counts across a batch against a cap; here exactly one file is either accepted
 * or refused for exactly one reason, and the caller shows that reason.
 */
export function checkCoverFile(f: { type: string; size: number } | null | undefined): MediaCheck {
  if (!f) return { ok: false, reason: 'wrong_type' };
  if (!isImageFile(f)) return { ok: false, reason: 'wrong_type' };
  if (f.size > MAX_COVER_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true };
}

export function checkVideoFile(
  f: { type: string; size: number; name?: string } | null | undefined,
  maxBytes: number = MAX_VIDEO_BYTES,
): MediaCheck {
  if (!f) return { ok: false, reason: 'wrong_type' };
  if (!isVideoFile(f)) return { ok: false, reason: 'wrong_type' };
  if (f.size > maxBytes) return { ok: false, reason: 'too_large' };
  return { ok: true };
}
