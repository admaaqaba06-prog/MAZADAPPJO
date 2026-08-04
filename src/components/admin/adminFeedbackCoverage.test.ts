// Every admin list uses the SHARED empty/skeleton components.
//
// Not "has an empty state" — all three of these already had one, hand-rolled
// inline. The problem was five different treatments of the same moment, so this
// asserts they route through FeedbackStates rather than re-inventing it. That
// is also what makes a future restyle one edit instead of a hunt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SECTIONS = [
  'OrdersLedgerSection',
  'AuctionLookupSection',
  'AuditLogSection',
  'MembersSection',
  'OurDropsSection',
] as const;

/**
 * Comments are stripped before every assertion. The first version of this file
 * matched the word "Searching…" inside the comment EXPLAINING why the label was
 * removed — a test that fails on its own documentation is worse than no test.
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const read = (name: string) =>
  stripComments(readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8'));

describe('admin sections use the shared feedback components', () => {
  for (const name of SECTIONS) {
    it(`${name} renders EmptyState, not a bespoke empty block`, () => {
      const src = read(name);
      expect(src, `${name} imports EmptyState`).toMatch(/EmptyState/);
    });
  }

  it('no admin section hand-rolls a centred empty block any more', () => {
    // The shape that was duplicated: a centred div whose only job is to say
    // "nothing here". Catching the pattern stops it growing a sixth variant.
    const offenders: string[] = [];
    for (const name of SECTIONS) {
      const src = read(name);
      // A bespoke empty block: centred text mentioning "No …" with no EmptyState
      // on the same element.
      const bespoke = /<div[^>]*className="[^"]*text-center[^"]*"[^>]*>\s*\n\s*\{isAr \? '[^']*' : 'No /g;
      if (bespoke.test(src)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('AuctionLookupSection shows a skeleton while searching, not a text label', () => {
    // A "Searching…" label is a spinner in disguise: the list jumps when
    // results replace it. A skeleton reserves the row heights.
    const src = read('AuctionLookupSection');
    expect(src).toMatch(/AdminListSkeleton/);
    expect(src).not.toMatch(/جاري البحث…/);
    expect(src).not.toMatch(/Searching…/);
  });

  it('every EmptyState is given both languages', () => {
    // An English-only empty state on an Arabic-primary product is a blank
    // screen to most of the audience.
    for (const name of SECTIONS) {
      const src = read(name);
      const i = src.indexOf('<EmptyState');
      if (i === -1) continue;
      const block = src.slice(i, i + 900);
      expect(block, `${name} passes language`).toMatch(/language=\{/);
      expect(block, `${name} has Arabic copy`).toMatch(/[؀-ۿ]/);
    }
  });
});
