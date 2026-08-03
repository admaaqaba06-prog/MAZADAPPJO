/**
 * ONE rule: a listing has media if it has any of cover / gallery / video.
 *
 * Two adapters because the two publish paths hold media in different shapes —
 * the approval card reads a SAVED doc (url strings), the drop builder holds
 * UNSAVED File objects in component state that `DropFormValues` deliberately
 * does not carry. Keeping both here is what stops the two gates drifting
 * apart; a shared test asserts they agree.
 *
 * This gate is why the stock-photo fallback in `createListing` could be
 * deleted: that fallback existed only because a lot could publish with no
 * image at all, and its category-keyword guess served a photograph of an
 * unrelated product.
 */
const present = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim() !== '' : v != null;

export function docHasMedia(a: {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: unknown[] | null;
}): boolean {
  return present(a.thumbnailUrl) || present(a.videoUrl) || (a.mediaUrls?.length ?? 0) > 0;
}

export function draftHasMedia(d: {
  thumbnailFile?: unknown;
  videoFile?: unknown;
  gallery?: unknown[] | null;
}): boolean {
  return present(d.thumbnailFile) || present(d.videoFile) || (d.gallery?.length ?? 0) > 0;
}
