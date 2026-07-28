/**
 * Single source of truth for the mobile/desktop shell split.
 *
 * DesktopFrame renders two sibling shells toggled by `lg:hidden` /
 * `hidden lg:flex`. Tailwind's `hidden` is only `display:none` — React still
 * MOUNTS both subtrees — so whichever shell receives `children` has to be
 * chosen in JS, against this exact threshold. Keep it identical to Tailwind's
 * `lg`: if the JS and CSS thresholds ever disagree, children are handed to the
 * display:none shell and the app renders blank at that width.
 */
export const DESKTOP_MIN_WIDTH = 1024;

/** True when the viewport is at/above Tailwind's `lg` breakpoint (inclusive). */
export function isDesktopWidth(width: number): boolean {
  return width >= DESKTOP_MIN_WIDTH;
}
