// `validateDropForm` has TWO call sites in the drop builder. A missed one
// silently reopens the exact hole that let image-less lots reach the feed and
// pick up a stock photo of an unrelated product — and tsc will NOT catch it:
// this repo has no strict mode and no @types/react, so a .tsx call site with a
// missing argument type-checks clean (see the repo's testing notes).
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom, so
// the component cannot be rendered. House idiom, per descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./AuctionDropBuilderView.tsx', import.meta.url), 'utf8');

/**
 * Each `validateDropForm(...)` call, read to its balanced closing paren. A
 * naive `[^)]*` window stops at the inner `Date.now()` and would silently
 * inspect a truncated call — which would pass while asserting nothing.
 */
function calls(source: string): string[] {
  const out: string[] = [];
  const needle = 'validateDropForm(';
  let i = source.indexOf(needle);
  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < source.length; j++) {
      if (source[j] === '(') depth++;
      else if (source[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(i, j + 1));
    i = source.indexOf(needle, j);
  }
  return out;
}

describe('drop builder media gate', () => {
  it('finds both call sites', () => {
    expect(calls(src).length).toBeGreaterThanOrEqual(2);
  });

  it('passes a media argument at every call site', () => {
    for (const call of calls(src)) {
      expect(call, call).toMatch(/,\s*(hasMedia|draftHasMedia\()/);
    }
  });

  it('derives that argument from the shared rule, not a local expression', () => {
    expect(src).toMatch(/from '\.\.\/utils\/listingMedia'/);
    expect(src).toMatch(/draftHasMedia\(/);
  });

  it('renders a media error the admin can actually see', () => {
    expect(src).toMatch(/errors\.media|errors\['media'\]/);
  });
});
