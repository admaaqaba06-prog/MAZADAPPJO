import React, { useState, useRef, useEffect } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * A lot's image, or an honest blank.
 *
 * Replaces two fabrications. `createListing` invented a stock Unsplash photo by
 * category keyword when nothing was uploaded — and because the drop builder
 * filed every non-phone, non-car lot under the 'Fashion' catch-all, a
 * television matched no keyword branch and received the else-branch: a photo of
 * red Nike sneakers. Separately, the discovery card's `onError` swapped in a
 * stock wristwatch. Both rendered someone else's product as this lot's, which
 * reads to a buyer as a broken image link and is actually a fabricated image.
 *
 * The placeholder is deliberately not a photograph: no stock image can be
 * correct for an unknown product, so the honest answer is a labelled blank.
 */
interface Props {
  src?: string | null;
  alt: string;
  isAr: boolean;
  /** Applied to the wrapper in both states, so callers keep their layout. */
  className?: string;
  /** Applied to the <img> only — object-fit, hover transforms, and so on. */
  imgClassName?: string;
  /**
   * Fired when the real image loads AND when we fall back to the placeholder,
   * so a caller gating a shimmer on it is never left waiting forever on a lot
   * that has no image.
   */
  onLoad?: () => void;
}

const ListingImage: React.FC<Props> = ({
  src,
  alt,
  isAr,
  className = '',
  imgClassName = '',
  onLoad,
}) => {
  const [failed, setFailed] = useState(false);
  const usable = typeof src === 'string' && src.trim() !== '' && !failed;

  /**
   * The cached-image race, which made `onLoad` a promise this component was
   * quietly breaking.
   *
   * A cached image can finish decoding BEFORE React attaches the `onLoad`
   * handler. The browser has already dispatched its `load` event by then, and
   * it does not dispatch a second one — so the handler never fires, for an
   * image that is fully present and painted. `complete` is the only way to
   * observe that state after the fact.
   *
   * Measured on production /discover: all eight thumbnails sat at
   * `complete: true` with valid `naturalWidth` (1024, 1200, 1000, 600, 500,
   * 260, 600, 1100) while every caller gating on `onLoad` still believed they
   * were loading.
   *
   * Keyed on `src` so a card recycled onto a different lot re-checks. The
   * callback is read through a ref rather than listed as a dependency: callers
   * pass an inline arrow, so depending on it would re-run this on every render.
   */
  const imgRef = useRef<HTMLImageElement | null>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  useEffect(() => {
    const node = imgRef.current;
    if (node?.complete && node.naturalWidth > 0) onLoadRef.current?.();
  }, [src]);

  if (!usable) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-surface-sunken text-fg-muted ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="w-6 h-6 opacity-40" />
        <span className="text-[9px] font-black tracking-wide opacity-60">
          {isAr ? 'لا توجد صورة' : 'No photo'}
        </span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src as string}
      alt={alt}
      className={`${className} ${imgClassName}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onLoad={onLoad}
      onError={() => {
        // Fall back to the placeholder — never to a different product's photo.
        setFailed(true);
        onLoad?.();
      }}
    />
  );
};

export default ListingImage;
