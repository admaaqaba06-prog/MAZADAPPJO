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

/** Out-of-range indices are a no-op rather than a silent whole-list rewrite. */
export function removeGalleryPhoto(prev: PickedPhoto[], index: number): PickedPhoto[] {
  if (index < 0 || index >= prev.length) return prev;
  return prev.filter((_, i) => i !== index);
}
