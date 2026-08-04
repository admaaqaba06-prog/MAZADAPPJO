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
      /const\s+rawDescriptionText\s*=\s*String\(\s*activeAuction\??\.description\s*\|\|\s*''\s*\)\.trim\(\)/,
    );
  });
});

describe('a description that merely echoes the title renders NOTHING', () => {
  // 102 live lots carry a description that is an exact copy of their title,
  // and `dropPayload.ts` still writes `description: input.productName.trim()`
  // for every admin drop — a third fabrication path, still live. Without this
  // the card prints the lot title a few pixels under the lot title on
  // essentially every live lot.
  it('delegates the decision to the shared rule', () => {
    // Was an inline `rawDescriptionText === auctionTitleText`. That is one of
    // four copies this rule had, and none of them caught the 14 live lots whose
    // description is the fabricated `معروض مميز: {title}` rather than an exact
    // echo. The rule now lives in utils/listingDescription.
    expect(SRC).toMatch(/const\s+auctionTitleText\s*=\s*String\(\s*activeAuction\??\.title\s*\|\|\s*''\s*\)\.trim\(\)/);
    expect(SRC).toMatch(
      /const\s+descriptionText\s*=\s*isJunkDescription\(rawDescriptionText,\s*auctionTitleText\)\s*\?\s*''\s*:\s*rawDescriptionText/,
    );
  });

  it('suppresses it at the derivation, not in the JSX', () => {
    // One source of truth: the guard, the clamp and the overflow measurement
    // must all agree on what counts as a description. A second condition bolted
    // onto the JSX would leave the measurement running on text nobody renders.
    expect(descriptionSection()).not.toMatch(/title/);
    expect(SRC).toMatch(/\{\s*descriptionText\s*&&\s*\(/);
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
    expect(SRC).toMatch(/line-clamp-4/);
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
    expect(descriptionSection()).toMatch(/descriptionExpanded\s*\?\s*''\s*:\s*'line-clamp-4'/);
  });

  it('the toggle label is bilingual in BOTH states', () => {
    // The original assertion was `/عرض المزيد|عرض أقل/` — an alternation, so
    // one Arabic label satisfied it and neither English label was asserted
    // anywhere. Replacing both English strings with Arabic left all 30 tests
    // green: an English-locale bidder would have got Arabic labels in silence.
    const section = descriptionSection();
    expect(section).toMatch(/isAr \? 'عرض المزيد' : 'Show more'/);
    expect(section).toMatch(/isAr \? 'عرض أقل' : 'Show less'/);
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
    // permanently truncated to four lines with no way to read the rest —
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

describe('the section lives in the aside, below the bid panel', () => {
  // It was first built under the video in <main>. That column is sized so the
  // video plus the product-info row exactly fill it — 12px of slack at every
  // viewport size — so the card opened BELOW THE FOLD of a pane that had never
  // scrolled, and the whole payload of the feature was invisible. The aside
  // already scrolls and already holds the long-form cards.
  const guard = () => {
    const at = SRC.indexOf('{descriptionText &&');
    expect(at).toBeGreaterThan(-1);
    return at;
  };

  it('is not in <main>', () => {
    expect(guard()).toBeGreaterThan(SRC.indexOf('</main>'));
  });

  it('is inside the right-hand aside', () => {
    const aside = SRC.indexOf('id="desktop-live-new-aside-panel"');
    expect(aside).toBeGreaterThan(-1);
    expect(guard()).toBeGreaterThan(aside);
    expect(guard()).toBeLessThan(SRC.indexOf('</aside>', aside));
  });

  it('comes after the bid panel, so it cannot push the bid controls down', () => {
    // The bid controls are the reason this column exists; anything above them
    // moves them at first paint.
    expect(guard()).toBeGreaterThan(SRC.indexOf('id="desktop-bid-panel"'));
    expect(guard()).toBeLessThan(SRC.indexOf('Card 3: Bid History'));
  });

  it('carries no viewport-derived width', () => {
    // The media-column pin it used to have (`w-[calc((100vh-220px)*9/16)]`)
    // would overflow this fixed 360px column at tall viewports. The info row
    // in <main> is now the only place that calc appears.
    const width = /w-\[calc\(\(100vh-220px\)\*9\/16\)\]/g;
    expect(SRC.match(width)?.length).toBe(1);
    expect(descriptionSection()).not.toMatch(/w-\[calc|max-w-full|mx-auto/);
  });

  it('does not let the flex column squash it', () => {
    // Every sibling card in the aside is `shrink-0`; a shrinkable one would be
    // compressed by the cards below instead of letting the column scroll.
    expect(descriptionSection()).toMatch(/shrink-0/);
  });

  it('gives the Arabic heading an explicit line-height', () => {
    // `text-[12px]` sets font-size only; Arabic descenders clip under the ~1.2
    // normal default. `text-xs` is the same size WITH a 1rem line-height.
    expect(descriptionSection()).toMatch(/<h2 className="text-xs /);
    expect(descriptionSection()).not.toMatch(/<h2 className="text-\[12px\]/);
  });
});
