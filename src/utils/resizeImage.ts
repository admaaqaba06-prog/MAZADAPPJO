/**
 * Client-side resize of an image File/Blob before upload.
 *
 * Phone cameras produce 3-6MB, 12MP+ photos. Uploaded raw, every one of
 * those becomes a "thumbnail" that every Discovery card downloads — a huge,
 * avoidable amount of bandwidth/decode cost on the mid-range Android devices
 * this app targets. This shrinks the longest edge to `maxDimension` (default
 * 1280px, plenty for a card/gallery image) and re-encodes as JPEG at
 * `quality` (default 0.8) via an offscreen <canvas> BEFORE the bytes ever
 * leave the device.
 *
 * Deliberately conservative: falls back to the ORIGINAL file/blob, untouched,
 * whenever anything isn't a clear win —
 *  - input isn't an image (checked via MIME type)
 *  - input is an animated GIF (resizing would flatten it to one frame)
 *  - no DOM/canvas available in this environment (e.g. Node test runs)
 *  - image fails to decode for any reason (corrupt file, unsupported format,
 *    private-mode restrictions, etc.)
 *  - the image is already within `maxDimension`
 *  - the "resized" result would be larger than the original (rare, but
 *    possible for already heavily-compressed small source images)
 *
 * Never throws — always resolves, so it's safe to await unconditionally
 * ahead of an upload call.
 */

export interface ResizeImageOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: string;
}

const DEFAULT_MAX_DIMENSION = 1280;
const DEFAULT_QUALITY = 0.8;
const DEFAULT_MIME_TYPE = 'image/jpeg';

export function resizeImage(file: File | Blob, options: ResizeImageOptions = {}): Promise<Blob> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const mimeType = options.mimeType ?? DEFAULT_MIME_TYPE;

  return new Promise((resolve) => {
    const type = (file as File).type || '';

    // Not an image, or an animated GIF — upload untouched.
    if (!type.startsWith('image/') || type === 'image/gif') {
      resolve(file);
      return;
    }

    // No DOM/canvas available in this environment (e.g. a Node test run
    // with no jsdom) — fall back rather than throw.
    if (
      typeof document === 'undefined' ||
      typeof Image === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      resolve(file);
      return;
    }

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(file);
      return;
    }

    const cleanup = () => {
      try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ }
    };

    const img = new Image();

    img.onerror = () => {
      cleanup();
      resolve(file);
    };

    img.onload = () => {
      try {
        const { width, height } = img;
        if (!width || !height) {
          cleanup();
          resolve(file);
          return;
        }

        const scale = Math.min(1, maxDimension / Math.max(width, height));
        if (scale >= 1) {
          // Already within bounds — nothing to gain from re-encoding.
          cleanup();
          resolve(file);
          return;
        }

        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob((blob) => {
          cleanup();
          if (!blob || blob.size === 0 || (file.size && blob.size >= file.size)) {
            resolve(file);
            return;
          }
          resolve(blob);
        }, mimeType, quality);
      } catch {
        cleanup();
        resolve(file);
      }
    };

    img.src = objectUrl;
  });
}
