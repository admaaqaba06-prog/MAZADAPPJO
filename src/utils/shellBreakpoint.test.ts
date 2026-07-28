import { describe, it, expect } from 'vitest';
import { DESKTOP_MIN_WIDTH, isDesktopWidth } from './shellBreakpoint';

describe('shellBreakpoint', () => {
  it("matches Tailwind's lg breakpoint exactly", () => {
    // DesktopFrame's two shells are toggled by `lg:hidden` / `hidden lg:flex`.
    // If this constant ever drifts from Tailwind's lg, children are handed to
    // the display:none shell and the app renders blank at that width.
    expect(DESKTOP_MIN_WIDTH).toBe(1024);
  });

  it('treats the breakpoint itself as desktop (min-width is inclusive)', () => {
    expect(isDesktopWidth(1024)).toBe(true);
  });

  it('treats one pixel below the breakpoint as mobile', () => {
    expect(isDesktopWidth(1023)).toBe(false);
  });

  it('classifies widths either side of the boundary', () => {
    expect(isDesktopWidth(0)).toBe(false);
    expect(isDesktopWidth(390)).toBe(false);
    expect(isDesktopWidth(1440)).toBe(true);
    expect(isDesktopWidth(2560)).toBe(true);
  });
});
