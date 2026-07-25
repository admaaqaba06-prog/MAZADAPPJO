import React from "react";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

/**
 * MazadJo wordmark — an orange "M" tile + "MAZAD JO" text, matching the in-app
 * header (DesktopFrame). Replaces the old external "Mazado" image asset (wrong
 * brand). Text-based so there's no dependency on a hosted logo file.
 */
export function Logo({
  className = "h-8",
  iconClassName = "h-8 w-8",
  textClassName = "text-xl font-black text-[#0A0A0A] font-sans",
  showText = true,
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      <span
        className={`rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base tracking-wider shadow-md shadow-orange-500/10 shrink-0 ${iconClassName}`}
        aria-hidden="true"
      >
        M
      </span>
      {showText && <span className={textClassName}>MAZAD JO</span>}
    </span>
  );
}
