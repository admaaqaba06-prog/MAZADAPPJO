import React from "react";

/**
 * The landing page's one button.
 *
 * WHY THIS EXISTS. Before it, every call to action on the page was hand-rolled:
 * the hero pair, the header, the sticky mobile bar and the closing section each
 * carried their own padding, radius, weight and hover, and between them they
 * used four different oranges (`#F05123`, `#D93E15`, `#FF6B35`, `#D63E10`) —
 * two of them inside a gradient that appeared on exactly one button. A visitor
 * scrolling the page met the same action wearing four faces, which is the
 * opposite of "one clear primary action throughout".
 *
 * THE RULE THIS ENCODES. `primary` is the app. It is the only variant that
 * glows, and there is never more than one of it in view. `secondary` is the
 * outlined alternative that may sit beside it — same size, visibly quieter.
 * `ghost` is for navigation-weight actions that must not compete at all.
 *
 * The glow is a shadow, not a ring or a blurred pseudo-element: it costs one
 * composited layer, it does not affect layout, and it can be dropped for
 * `prefers-reduced-motion` without the button moving.
 */
export type LandingButtonVariant = "primary" | "secondary" | "ghost" | "inverted";
export type LandingButtonSize = "md" | "lg";

const BASE =
  // `border border-transparent` on EVERY variant, including the ones with no
  // visible border. Without it a filled button measured 56px next to a bordered
  // one at 58px, and two CTAs side by side at different heights is the kind of
  // 2px that reads as sloppy without anyone being able to say why.
  "inline-flex items-center justify-center gap-2 rounded-xl border border-transparent " +
  "font-bold font-tajawal text-center " +
  "transition-[transform,background-color,border-color,box-shadow] duration-300 cursor-pointer " +
  "select-none disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none";

const SIZES: Record<LandingButtonSize, string> = {
  // 48px and 56px tall. Both clear the 44px touch target; `lg` is the hero and
  // sticky-bar size, where the button is the page's main affordance.
  md: "px-5 py-3 text-sm min-h-[48px]",
  lg: "px-7 py-4 text-base min-h-[56px]",
};

const VARIANTS: Record<LandingButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-strong " +
    // Restrained on rest, warmer on hover. The colour comes from
    // `--color-accent-glow`, so this is the only orange in a shadow on the page
    // and it moves with the theme. A wider or more opaque shadow reads as a
    // halo and cheapens the page.
    "shadow-[0_8px_24px_-10px_var(--color-accent-glow)] " +
    "hover:shadow-[0_14px_34px_-10px_var(--color-accent-glow)] hover:-translate-y-0.5 " +
    "motion-reduce:hover:translate-y-0",
  secondary:
    "bg-transparent text-fg border border-fg/25 hover:border-accent hover:text-accent " +
    "hover:bg-accent-weak",
  ghost: "bg-transparent text-fg-muted hover:text-fg",
  /* The primary, for the one section that is itself accent-filled. An orange
     button on an orange band is invisible, so the fill and the label swap. No
     glow: a shadow in the accent colour cannot be seen against the accent. */
  inverted:
    "bg-surface-raised text-accent-strong hover:bg-surface-sunken " +
    "shadow-[0_8px_24px_-10px_rgba(0,0,0,0.35)] hover:-translate-y-0.5 " +
    "motion-reduce:hover:translate-y-0",
};

type Props = {
  variant?: LandingButtonVariant;
  size?: LandingButtonSize;
  className?: string;
  /** Rendered after the label, flipped for RTL by the caller's own markup. */
  trailing?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function LandingButton({
  variant = "primary",
  size = "lg",
  className = "",
  trailing,
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}

export default LandingButton;
