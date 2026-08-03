import React, { useState } from 'react';
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
