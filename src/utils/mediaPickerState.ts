/**
 * The pure half of MediaPicker. Object-URL creation and revocation stay in the
 * component — `URL.createObjectURL` does not exist in the node test
 * environment this repo runs vitest under, so these take formed records.
 */

/** Matches the gallery cap the seller wizard and the live room already assume. */
export const MAX_GALLERY_PHOTOS = 3;

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
