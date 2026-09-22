/**
 * One photo list, and the cover comes out of it.
 *
 * WHY THIS EXISTS. The seller wizard asked for three separate uploads — a
 * video, a cover image, and then "extra gallery photos" — and a seller had to
 * understand what a cover WAS before they could list a phone. Most people have
 * photos of the thing; nobody has "a cover" and "extras". Two of the three
 * boxes were the same medium wearing different names, and the split existed
 * only because the backend stores them in two fields.
 *
 * So the split moves here, where the backend's shape is a detail rather than a
 * question the seller is asked: they add photos, the FIRST one is the cover,
 * and they can promote any other photo to first if they prefer it.
 *
 * `createListing` is untouched — it still receives a thumbnail and a gallery.
 */

export interface ListingPhoto {
  file: File;
  /** Object URL for the preview. The caller owns revoking it. */
  url: string;
}

/**
 * Cover + gallery, at the boundary where the backend needs them apart.
 *
 * The cap counts the cover: four photos total, one of which is the cover and
 * three of which are gallery — the same ceiling the old two-box UI had
 * (1 cover + 3 extras), so no seller loses capacity in the simplification.
 */
export const MAX_LISTING_PHOTOS = 4;

export function splitPhotos(photos: readonly ListingPhoto[] | null | undefined): {
  cover: ListingPhoto | null;
  gallery: ListingPhoto[];
} {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (list.length === 0) return { cover: null, gallery: [] };
  return { cover: list[0], gallery: list.slice(1) };
}

/**
 * Move `index` to the front — "use this one as the cover".
 *
 * Returns a NEW array; the original is never mutated, so React state updates
 * stay honest. An out-of-range index returns the list unchanged rather than
 * producing a hole or an undefined cover.
 */
export function promoteToCover(
  photos: readonly ListingPhoto[],
  index: number,
): ListingPhoto[] {
  if (!Array.isArray(photos)) return [];
  if (!Number.isInteger(index) || index <= 0 || index >= photos.length) return [...photos];
  const next = [...photos];
  const [picked] = next.splice(index, 1);
  next.unshift(picked);
  return next;
}

/** Remove one photo, keeping order. The next photo silently becomes the cover. */
export function removePhoto(
  photos: readonly ListingPhoto[],
  index: number,
): ListingPhoto[] {
  if (!Array.isArray(photos)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= photos.length) return [...photos];
  return photos.filter((_, i) => i !== index);
}

/**
 * How many more photos may be added.
 *
 * Returned rather than computed at the call site so the "add" control and the
 * file-input `multiple` handler cannot disagree about the limit and let a
 * seller pick five, upload four, and never be told which one was dropped.
 */
export function remainingSlots(photos: readonly ListingPhoto[] | null | undefined): number {
  const n = Array.isArray(photos) ? photos.length : 0;
  return Math.max(0, MAX_LISTING_PHOTOS - n);
}
