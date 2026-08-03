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

/** Accent + deliberate dark blocks. Matching these is correct, not a violation. */
const EXEMPT = /FF6B00|F05123|E85D04|FF8000|E05E00|c94d03|10B981|D93E15|FF5A4D|FF6B35|D63E10|0A0A0A|121318|111111/i;

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
    const neutral = all.filter((c) => !EXEMPT.test(c));
    expect(neutral.length).toBeLessThanOrEqual(65);
  });

  // `text-gray-300` is decorative (separators, chevrons) and reads on dark;
  // `text-gray-200` and the dark border shades sit on already-dark surfaces.
  it('does not grow the remaining light-gray usage', () => {
    expect(count(/(?<![\w-])text-gray-(200|300)(?![\w-])/g)).toBeLessThanOrEqual(43);
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
