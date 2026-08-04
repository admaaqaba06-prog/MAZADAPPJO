// Every surface that PRINTS an auction description, other than the desktop
// bidding aside (which has its own file, desktopDescription.wiring.test.ts).
//
// Two rules, and both became reachable in this branch rather than being
// hypothetical:
//
//  1. Empty renders nothing. Production had zero empty descriptions until the
//     concierge form stopped inventing one from the product name and started
//     writing '' deliberately. `AuctionDetailsModal`'s box carries its own
//     background, border and padding, so unguarded it is a ~30px empty grey
//     card under the title — the exact anti-pattern this branch forbids.
//  2. A description that merely echoes the title renders nothing. 102 live lots
//     carry an exact copy, and `dropPayload.ts` still writes
//     `description: input.productName.trim()` for every admin drop, so this is
//     a live feed and not a one-off backfill. Every one of these surfaces
//     prints the description directly beneath the title, so an echo prints the
//     same string twice.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom, so
// the components cannot be rendered. House idiom, per sellerReviewSeeding.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

/**
 * The body of the IIFE that guards a description on `surface`, located by the
 * `const <name> = String(<expr>.description || '').trim();` derivation and then
 * read to the end of its `return null;` guard line. Anchored on real syntax and
 * throws loudly if the shape moves — never a character window.
 */
function guardOf(src: string, subject: string): string {
  const start = src.indexOf(`String(${subject}.description || '').trim()`);
  if (start === -1) throw new Error(`no trimmed description derivation for ${subject}`);
  const end = src.indexOf('return null;', start);
  if (end === -1) throw new Error(`no early return after the ${subject} derivation`);
  return src.slice(start, end + 'return null;'.length);
}

const SURFACES: Array<{ file: string; subject: string; note: string }> = [
  { file: 'MobileAuctionView.tsx', subject: 'activeAuction?', note: 'the mobile lot page' },
  { file: 'AuctionDetailsModal.tsx', subject: 'auction', note: 'Discovery / LiveStream / Seller Center' },
  { file: 'ReelsDesktopRightPanel.tsx', subject: 'currentItem', note: 'the desktop reels panel' },
];

describe.each(SURFACES)('$file — $note', ({ file, subject }) => {
  const SRC = read(file);

  it('delegates the decision to the shared rule', () => {
    // Each surface used to inline `!text || text === title`. Four copies of one
    // display rule is how they come to disagree — and they had already fallen
    // behind the data: none of them caught the 14 live lots carrying the
    // fabricated `معروض مميز: {title}`, because that is not an exact echo.
    expect(guardOf(SRC, subject)).toMatch(/isJunkDescription\(/);
  });

  it('passes the title, so the echo case is still decidable', () => {
    expect(guardOf(SRC, subject)).toMatch(
      new RegExp(`isJunkDescription\\(text, ${subject.replace('?', '\\?')}\\.title\\)`),
    );
  });

  it('renders the trimmed value, not the raw field', () => {
    // Printing `x.description` while guarding on a trimmed copy would put the
    // seller's leading whitespace back into the layout.
    const at = SRC.indexOf(`String(${subject}.description || '').trim()`);
    const after = SRC.slice(at, SRC.indexOf('</p>', at));
    expect(after).toMatch(/\{text\}/);
    expect(after).not.toMatch(/\{[a-zA-Z?.]*\.description\}/);
  });
});
