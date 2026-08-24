import React from "react";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

/** The transparent-background lockup. Primary asset everywhere. */
const LOGO_SRC = "/logo-mazzado.png";

/**
 * MAZZADO logo.
 *
 * Renders the supplied transparent PNG, sized with `object-contain` so it is
 * never stretched, cropped, recoloured or filtered — only fitted. `h-full
 * w-auto` keeps it proportional inside whatever height the caller sets, which is
 * how it stays aligned in the header, the mobile menu and the footer without any
 * per-site tweaking.
 *
 * FALLBACK, deliberately kept: if `/logo-mazzado.png` is missing the image's
 * `onError` swaps in the text lockup instead of leaving a broken-image icon in
 * the header. That is not decoration — it is what lets the brand name ship
 * correctly even before the asset file lands, and it keeps a future 404 (bad
 * deploy, wrong path) from blanking the header.
 *
 * The BLACK-BACKGROUND variant is intentionally NOT used here. This mark sits on
 * `surface-raised`, which is white in light mode and near-black in dark, and a
 * transparent PNG is correct on both. Reach for the black-plate version only
 * where transparency genuinely cannot work — a third-party embed or a print
 * surface that composites onto an unknown colour.
 */
export function Logo({
  className = "h-8",
  iconClassName = "h-8 w-8",
  textClassName = "text-xl font-black text-fg font-sans",
  showText = true,
}: LogoProps) {
  const [imageFailed, setImageFailed] = React.useState(false);

  if (!imageFailed) {
    return (
      <span className={`inline-flex items-center select-none ${className}`}>
        <img
          src={LOGO_SRC}
          alt="MAZZADO"
          className="h-full w-auto object-contain"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  // Text lockup — the pre-asset fallback described above.
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      <span
        className={`rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base tracking-wider shadow-md shadow-orange-500/10 shrink-0 ${iconClassName}`}
        aria-hidden="true"
      >
        M
      </span>
      {showText && <span className={textClassName}>MAZZADO</span>}
    </span>
  );
}
