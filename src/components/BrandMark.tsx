import React from 'react';

/**
 * The official icon-only MAZZADO mark, used AS THE SUPPLIED FILE.
 *
 * `public/icon-512.png` is the approved artwork already in the repo: 512x512,
 * transparent, orange geometric M, no wordmark. It is rendered untouched — no
 * recolour, no crop, no filter, no baked shadow, and no background plate. The
 * mark carries on both the light and the dark surface for the same reason
 * `--color-accent` does: the orange IS the brand and is theme-invariant.
 *
 * WHY icon-512 AND NOT icon-192: index.html preloads icon-512 for the boot
 * splash, so by the time any header renders it is already in cache. Reaching for
 * the smaller file would add a second request to save bytes that are no longer
 * being spent. 512 into a 32-40px box also leaves plenty of headroom on a 3x
 * screen, which is what keeps it sharp.
 *
 * WHY A COMPONENT: this replaced FIVE separate hand-rolled copies of an orange
 * rounded square with a monospace "M" in it — in the desktop header, the login
 * header, the mobile discover header, the install prompt, and the landing
 * lockup's fallback. They had drifted to four different sizes, three different
 * oranges (#E85D04, #FF6B00, a gradient) and two different corner radii. One
 * component is what stops the sixth copy.
 *
 * DECORATIVE BY DEFAULT. Every call site sits directly beside the brand name in
 * text, so announcing the image too would just repeat it. The old markup
 * rendered a literal "M" character, which a screen reader read out as the letter
 * M — `alt=""` with `aria-hidden` is strictly better. Pass a `label` where the
 * mark stands alone with no adjacent name.
 */
const MARK_SRC = '/icon-512.png';

interface BrandMarkProps {
  /** Box size and any layout classes. Square values only — the art is square. */
  className?: string;
  /** Set only when no brand name sits next to the mark. */
  label?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'w-8 h-8', label }) => {
  return (
    <img
      src={MARK_SRC}
      // `contain` on a square box for a square source is a no-op that stays a
      // no-op: if a call site ever passes a non-square class, the mark letterboxes
      // instead of stretching.
      className={`${className} shrink-0 object-contain select-none`}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      decoding="async"
    />
  );
};
