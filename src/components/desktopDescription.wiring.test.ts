// The desktop bidding screen rendered NO description at all — the product-info
// row carries short fixed-shape facts (condition, viewing) and truncates, so
// prose needed its own section. Mobile's `التفاصيل` section is the model.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom, so
// the component cannot be rendered. The house idiom, per
// src/components/sellerReviewSeeding.test.ts.
//
// Every assertion below anchors on real syntax — a declaration, a JSX guard, a
// balanced-paren scan. No fixed character windows: those decouple from the code
// the moment anything above them moves, and pass or fail for the wrong reason.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./DesktopLiveAuctionLayout.tsx', import.meta.url), 'utf8');

/**
 * Returns the source of the ONE JSX expression container that the description
 * section lives in — `{descriptionText && ( … )}` — found by scanning braces
 * from the guard until they balance, not by slicing a guessed number of
 * characters. Anything the section renders must appear inside this string;
 * anything hoisted out of the guard falls outside it and the containment
 * assertions fail. Throws rather than returning a half-region, so a structural
 * change surfaces as a loud failure instead of a silently-empty haystack.
 */
function descriptionSection(): string {
  const guard = SRC.indexOf('{descriptionText &&');
  if (guard === -1) throw new Error('no `{descriptionText &&` guard in the source');
  let depth = 0;
  for (let i = guard; i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    else if (SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) return SRC.slice(guard, i + 1);
    }
  }
  throw new Error('the `{descriptionText &&` guard never closes');
}

describe('the desktop layout renders the description', () => {
  it('reads the field', () => {
    expect(SRC).toMatch(/activeAuction\??\.description/);
  });

  it('renders a bilingual Details heading', () => {
    expect(SRC).toMatch(/التفاصيل/);
    expect(SRC).toMatch(/'Details'/);
  });
});

describe('an absent description renders NOTHING', () => {
  it('is guarded on a non-empty trimmed value', () => {
    // The file's own rule: "an empty bordered card claims there is information
    // when there is none." A heading over a blank body is the same lie.
    expect(SRC).toMatch(/descriptionText/);
    expect(SRC).toMatch(/\.description\s*\|\|\s*''\)\.trim\(\)/);
  });

  it('derives the guarded value by trimming, so whitespace-only is absent too', () => {
    // Pins the whole derivation as one shape. A guard swapped to a presence
    // check (`activeAuction?.description !== undefined`) admits '' and '   ',
    // both of which Task 2 now writes deliberately.
    expect(SRC).toMatch(
      /const\s+descriptionText\s*=\s*String\(\s*activeAuction\??\.description\s*\|\|\s*''\s*\)\.trim\(\)/,
    );
  });

  it('gates the section on that trimmed string and nothing else', () => {
    // The empty string is falsy, so this renders nothing at all — no heading,
    // no bordered card. React renders '' as an empty text node, never "0".
    expect(SRC).toMatch(/\{\s*descriptionText\s*&&\s*\(/);
    expect(SRC).not.toMatch(/description\s*!==\s*undefined/);
    expect(SRC).not.toMatch(/description\s*!=\s*null/);
  });

  it('the heading is inside the guard, not beside it', () => {
    const guard = SRC.indexOf('descriptionText &&');
    const heading = SRC.indexOf('التفاصيل');
    expect(guard).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(guard);
  });

  it('the heading, the body and the toggle are all INSIDE the guard', () => {
    // Ordering alone would still pass if the heading were hoisted above the
    // card and merely happened to sit later in the file. Containment is the
    // real property: the guard's balanced region must hold all three.
    const section = descriptionSection();
    expect(section).toMatch(/التفاصيل/);
    expect(section).toMatch(/\{descriptionText\}/);
    expect(section).toMatch(/setDescriptionExpanded/);
  });
});

describe('long descriptions cannot push the bid controls off screen', () => {
  it('clamps by default', () => {
    expect(SRC).toMatch(/line-clamp-3/);
  });

  it('has a show-more toggle bound to state', () => {
    expect(SRC).toMatch(/descriptionExpanded/);
    expect(SRC).toMatch(/setDescriptionExpanded/);
  });

  it('starts collapsed', () => {
    // Starting expanded is the same bug as not clamping at all: the very first
    // paint of a long lot is the one that shifts the page.
    expect(SRC).toMatch(/const\s+\[descriptionExpanded,\s*setDescriptionExpanded\]\s*=\s*useState\(false\)/);
  });

  it('applies the clamp in the collapsed state, not the expanded one', () => {
    // Polarity, pinned. Swapped, the class lands on the expanded branch and the
    // toggle reads backwards for every bidder.
    expect(descriptionSection()).toMatch(/descriptionExpanded\s*\?\s*''\s*:\s*'line-clamp-3'/);
  });

  it('the toggle label is bilingual', () => {
    expect(SRC).toMatch(/عرض المزيد|عرض أقل/);
  });

  it('preserves seller line breaks', () => {
    expect(SRC).toMatch(/whitespace-pre-line/);
  });
});

describe('the toggle only appears when the clamp is actually hiding something', () => {
  // A "show more" under a two-line description promises text that does not
  // exist — the same lie as an empty card, and the same rule the product-info
  // row above applies to itself.
  it('is gated on a measured overflow flag', () => {
    expect(descriptionSection()).toMatch(
      /\{\s*\(\s*descriptionClamped\s*\|\|\s*descriptionExpanded\s*\)\s*&&\s*\(/,
    );
  });

  it('measures the rendered paragraph rather than guessing at its length', () => {
    // Character-count heuristics are wrong at every width; the clamp is a CSS
    // effect, so only the clamped box can answer whether it clipped.
    expect(SRC).toMatch(/setDescriptionClamped/);
    expect(SRC).toMatch(/scrollHeight\s*-\s*el\.clientHeight/);
    expect(SRC).toMatch(/ResizeObserver/);
  });

  it('the ref the measurement reads is actually ON the paragraph', () => {
    // Detach it and the measurement silently never runs: `descriptionClamped`
    // stays false, the toggle never appears, and EVERY long description is
    // permanently truncated to three lines with no way to read the rest —
    // precisely the failure this section exists to prevent. Class strings and
    // markup all still look correct, which is why this needs its own assertion.
    expect(descriptionSection()).toMatch(/<p\s+ref=\{descriptionRef\}/);
    expect(SRC).toMatch(/const\s+el\s*=\s*descriptionRef\.current/);
  });

  it('measures with a real threshold, not one that is always true', () => {
    // `> -1` (or `>= 0`) makes every description report as clamped, putting a
    // dead "عرض المزيد" under one-line text — the exact lie the gate exists to
    // prevent. Sub-pixel line-height rounding is why the threshold is 1, not 0.
    expect(SRC).toMatch(/el\.scrollHeight\s*-\s*el\.clientHeight\s*>\s*1\s*\)/);
  });

  it('starts unclamped, so a short description never flashes a toggle', () => {
    expect(SRC).toMatch(/const\s+\[descriptionClamped,\s*setDescriptionClamped\]\s*=\s*useState\(false\)/);
  });

  it('disconnects the observer on cleanup', () => {
    // One ResizeObserver per lot switch, never released, on the screen bidders
    // sit on longest and switch lots from most often.
    expect(SRC).toMatch(/return\s*\(\)\s*=>\s*ro\.disconnect\(\)/);
  });
});

describe('the toggle actually toggles', () => {
  it('inverts the state rather than re-setting it', () => {
    // `(v) => v` renders a button that does nothing: it looks live, it has a
    // cursor, and the description never expands.
    expect(descriptionSection()).toMatch(
      /onClick=\{\(\)\s*=>\s*setDescriptionExpanded\(\(v\)\s*=>\s*!v\)\}/,
    );
  });

  it('swaps its own label with the state', () => {
    const section = descriptionSection();
    expect(section).toMatch(/descriptionExpanded\s*\?\s*\(isAr \? 'عرض أقل'/);
    expect(section).toMatch(/:\s*\(isAr \? 'عرض المزيد'/);
  });
});

describe('switching lots resets the section BEFORE the next paint', () => {
  it('clears both expanded and the measured flag, keyed on the lot id', () => {
    // Without this, a new lot inherits the previous lot's expanded body and its
    // stale "عرض المزيد". `useLayoutEffect`, not `useEffect`: the latter runs
    // AFTER the browser paints, so the stale frame would be visible.
    expect(SRC).toMatch(
      /useLayoutEffect\(\(\)\s*=>\s*\{\s*setDescriptionExpanded\(false\);\s*setDescriptionClamped\(false\);\s*\},\s*\[activeAuction\?\.id\]\)/,
    );
  });

  it('re-measures on the lot id too, not on the text alone', () => {
    // Two lots can carry identical description text; keyed only on the text,
    // the reset above would clear the flag and nothing would ever restore it.
    expect(SRC).toMatch(/\[descriptionText,\s*descriptionExpanded,\s*activeAuction\?\.id\]/);
  });

  it('keeps a way back once expanded', () => {
    // `descriptionExpanded` is part of the gate, so an expanded section always
    // still renders its toggle even if a re-measure were to report no overflow.
    expect(descriptionSection()).toMatch(/descriptionClamped\s*\|\|\s*descriptionExpanded/);
  });
});

describe('the section keeps the media column geometry', () => {
  it('matches the product-info row width instead of spanning the whole pane', () => {
    // The video canvas is `aspect-[9/16]` of `h-[calc(100vh-220px)]` and the
    // info row pins itself to exactly that width. A full-width card underneath
    // them would be roughly twice the media column on a 1440px desktop.
    const width = /w-\[calc\(\(100vh-220px\)\*9\/16\)\]\s+max-w-full\s+mx-auto/g;
    expect(SRC.match(width)?.length).toBe(2);
    expect(descriptionSection()).toMatch(width);
  });

  it('does not let the flex column squash it', () => {
    // Every other child of <main> is `shrink-0`; a shrinkable one would absorb
    // the overflow instead of letting the column scroll.
    expect(descriptionSection()).toMatch(/shrink-0/);
  });
});
