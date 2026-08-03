/**
 * Theme ratchet.
 *
 * ~2,880 hardcoded colour decisions accumulated across 124 files because
 * nothing ever stopped the next one. Slices 2 and 3 migrated them onto semantic
 * tokens; this is what stops them regrowing.
 *
 * It is a RATCHET, not a ban: each budget below is the count that survives
 * today, and the assertion is `<=`. New code cannot add a raw colour, but the
 * remaining stragglers do not block the build. When you migrate some, lower the
 * budget — the test tells you the new number.
 *
 * Deliberately NOT counted:
 *  - The oranges (#FF6B00, #F05123, #E85D04, …). The accent is theme-invariant;
 *    it is the brand and it carries on both backgrounds.
 *  - Intentional dark blocks (#0A0A0A, #121318, #111111). A dark section on a
 *    light page must STAY dark in light mode — tokenising it would flip it.
 *  - zinc/slate/neutral scales. Those live on surfaces that are dark in both
 *    themes (the reels panel, the live room) and are correct as they are.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const SOURCE = tsxFiles('src').map((f) => readFileSync(f, 'utf8')).join('\n');

function count(re: RegExp): number {
  return (SOURCE.match(re) ?? []).length;
}

/** The accent. Theme-invariant brand colour — correct anywhere. */
const ACCENT = /FF6B00|F05123|E85D04|FF8000|E05E00|c94d03|10B981|D93E15|FF5A4D|FF6B35|D63E10/i;
/**
 * Near-black values. Exempt as a BACKGROUND only — a dark section on a light
 * page must stay dark in light mode. As TEXT they are invisible on a dark
 * surface, so `text-[#0A0A0A]` must never be waved through the way
 * `bg-[#0A0A0A]` is. Keying the exemption on the colour alone (as the first
 * version of this file did) allowed exactly that.
 */
const DARK_VALUE = /0A0A0A|121318|111111/i;

function exempt(cls: string): boolean {
  if (ACCENT.test(cls)) return true;
  return DARK_VALUE.test(cls) && cls.startsWith('bg-');
}

describe('theme ratchet', () => {
  // Fully migrated. A single new one is a regression, so the budget is zero.
  it('has no bg-white left', () => {
    expect(count(/(?<![\w-])bg-white(?![\w-])/g)).toBe(0);
  });

  it('has no text-gray-950 left — it is near-black, invisible on a dark surface', () => {
    expect(count(/(?<![\w-])text-gray-950(?![\w-])/g)).toBe(0);
  });

  // The mid scale carried body copy and headings; all of it is on tokens now.
  it('has no mid-scale text-gray left', () => {
    expect(count(/(?<![\w-])text-gray-(400|500|600|700|800|900)(?![\w-])/g)).toBe(0);
  });

  it('has no mid-scale border-gray left', () => {
    expect(count(/(?<![\w-])border-gray-(100|200|300)(?![\w-])/g)).toBe(0);
  });

  // Budgeted stragglers. Lower these as they are migrated; never raise them.
  it('does not grow the neutral-hex backlog', () => {
    const all = SOURCE.match(/(?:text|bg|border)-\[#[0-9A-Fa-f]{3,8}\]/g) ?? [];
    const neutral = all.filter((c) => !exempt(c));
    // 31. What remains is deliberate: semantic status colours (the greens,
    // the reds, WhatsApp's #25D366), and dark surfaces other than the three
    // exempted values. The migratable ones — light panels, accent tints, light
    // hairlines and near-black text — are done.
    expect(neutral.length).toBeLessThanOrEqual(31);
  });

  // `text-gray-300` is decorative (separators, chevrons) and reads on dark;
  // `text-gray-200` and the dark border shades sit on already-dark surfaces.
  it('does not grow the remaining light-gray usage', () => {
    expect(count(/(?<![\w-])text-gray-(200|300)(?![\w-])/g)).toBeLessThanOrEqual(43);
  });

  // `text-black` is invisible on every dark surface. The two that remain sit on
  // `bg-amber-500`, where black-on-amber is correct in BOTH themes — the same
  // role `text-on-accent` fills for the orange. Four others were headings and
  // buttons on the landing page, shipped invisible in #225 and fixed here.
  it('keeps text-black to the on-accent cases only', () => {
    expect(count(/(?<![\w-])text-black(?![\w-])/g)).toBeLessThanOrEqual(2);
  });

  // GRADIENT STOPS were a blind spot in the first version of this file, and in
  // the codemods it was written to protect: everything matched `text-`, `bg-`
  // or `border-`, so `from-white` and `from-[#ffffff]` sailed through. The live
  // room's media stage was a white slab in dark mode because of exactly that.
  it('has no light gradient stops', () => {
    expect(count(/(?<![\w-])(?:from|via|to)-white(?![\w-])/g)).toBe(0);
    const hexStops = SOURCE.match(/(?:from|via|to)-\[#[0-9A-Fa-f]{3,8}\]/g) ?? [];
    // Only LIGHT stops are the bug. Accent gradients are the point of having a
    // gradient, and the dark stops (#0A0A0A, #121318, #1A1A1A, #1e2029) are
    // scrims — an overlay that must stay dark over media in BOTH themes.
    const LIGHT = /^(?:from|via|to)-\[#(?:[fFeE][0-9a-fA-F]){3}\]$/;
    const offenders = hexStops.filter((c) => !ACCENT.test(c) && LIGHT.test(c));
    expect(offenders).toEqual([]);
  });

  // A shade Tailwind does not generate emits NO css, so the element silently
  // has no colour at all. One of these shipped (`text-gray-405`) and rendered
  // an admin label with no styling until it was caught.
  it('uses no non-existent Tailwind shade', () => {
    const shades = SOURCE.match(/(?:text|bg|border)-(?:gray|zinc|slate|neutral)-(\d+)/g) ?? [];
    const VALID = new Set(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
    const bogus = shades.filter((s) => !VALID.has(s.split('-').pop()!));
    expect(bogus).toEqual([]);
  });
});
