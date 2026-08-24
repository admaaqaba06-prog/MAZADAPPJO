import React from "react";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

/**
 * The two lockups. Same artwork, same orange M — only the WORDMARK differs.
 *
 * The supplied PNG has a white wordmark, drawn for the dark ground it was
 * presented on. On the light theme's white surface the name simply vanished and
 * only the orange M was left. `logo-mazzado-light.png` is that same file with
 * the wordmark recoloured to `--color-text-primary` (#0A0A0A), split by CHROMA
 * so the M is byte-identical: the mark is the brand and carries on both grounds,
 * exactly like `--color-accent`, while the wordmark is ink and must flip.
 *
 * Both are transparent PNGs. The black-PLATE variant is still not used anywhere —
 * this mark sits on `surface-raised`, white in light mode and near-black in dark,
 * and transparency is correct on both.
 */
const LOGO_SRC: Record<'dark' | 'light', string> = {
  dark: "/logo-mazzado.png",   // white wordmark
  light: "/logo-mazzado-light.png", // ink wordmark
};

/**
 * The current theme, read from the attribute rather than from context.
 *
 * The attribute is the single source of truth here: the pre-paint script in
 * index.html writes `data-theme` before the bundle exists, so React's very first
 * render already reads the right value and there is no wrong-logo flash. Reading
 * it directly also keeps this landing-page component free of any dependency on
 * AppContext, which it is not guaranteed to sit inside.
 *
 * The observer is what makes the theme toggle work: `applyThemeAttribute` sets
 * the attribute imperatively, outside React's render, so nothing would re-render
 * this component without it. Scoped to the one attribute on the one element.
 */
function useThemeAttribute(): 'dark' | 'light' {
  const read = (): 'dark' | 'light' =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';

  const [theme, setTheme] = React.useState<'dark' | 'light'>(read);

  React.useEffect(() => {
    setTheme(read());   // covers a toggle between first render and this effect
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * MAZZADO logo.
 *
 * Renders the theme's lockup, sized with `object-contain` so it is never
 * stretched, cropped or filtered — only fitted. `h-full w-auto` keeps it
 * proportional inside whatever height the caller sets, which is how it stays
 * aligned in the header, the mobile menu and the footer without per-site tweaks.
 *
 * FALLBACK, deliberately kept: if the PNG is missing the image's `onError` swaps
 * in the text lockup instead of leaving a broken-image icon in the header. That
 * is not decoration — it keeps a future 404 (bad deploy, wrong path) from
 * blanking the header. `key` on the <img> resets that failed state when the
 * theme changes, so one missing file cannot condemn the other to the fallback.
 */
export function Logo({
  className = "h-8",
  iconClassName = "h-8 w-8",
  textClassName = "text-xl font-black text-fg font-sans",
  showText = true,
}: LogoProps) {
  const theme = useThemeAttribute();
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const src = LOGO_SRC[theme];

  if (failedSrc !== src) {
    return (
      <span className={`inline-flex items-center select-none ${className}`}>
        <img
          key={src}
          src={src}
          alt="MAZZADO"
          className="h-full w-auto object-contain"
          draggable={false}
          onError={() => setFailedSrc(src)}
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
