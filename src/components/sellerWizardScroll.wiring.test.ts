// The seller flow must have exactly ONE vertical scroll owner.
//
// THE BUG: `#listing-wizard-root` carried `overflow-y-auto overscroll-contain`
// while sitting inside `#sell-view-root`, which is the element that actually
// has the overflow. Measured at 375x812 against the wizard's real content:
//
//   #sell-view-root        clientHeight  812   scrollHeight 1656
//   #listing-wizard-root   clientHeight 1616   scrollHeight 1616
//
// So the wizard root was a scroll container that could never scroll — it lives
// in a `min-h-full` flex wrapper inside a scrolling parent, so `flex-1` simply
// let it grow to its content. `overscroll-behavior` still applied to it, though:
// it applies to any scroll container, scrollable or not. `contain` means "do not
// chain this gesture to my ancestors", and Chrome Android / Samsung Internet
// honour that literally — a touch drag starting inside it was swallowed instead
// of handed to the ancestor that scrolls. iOS Safari and desktop chain anyway,
// which is why the flow worked on iPhone and on a laptop.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// the components cannot be rendered. The house idiom, per
// src/components/desktopDescription.wiring.test.ts.
//
// Assertions anchor on real syntax — an id attribute, a parsed opening tag — not
// on fixed character windows, which decouple from the code the moment anything
// above them moves and then pass or fail for the wrong reason.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SELL = readFileSync(new URL('./SellView.tsx', import.meta.url), 'utf8');
const WIZARD = readFileSync(new URL('./ListingWizardView.tsx', import.meta.url), 'utf8');

/** Every Tailwind token that makes an element a VERTICAL scroll container. */
const VERTICAL_SCROLL = /(?<![\w-])overflow-(?:y-)?(?:auto|scroll)(?![\w-])/g;

/**
 * The full opening tag that carries `id="<id>"`, found structurally: scan back
 * to the tag's `<`, then forward to the `>` that closes it, tracking JSX brace
 * depth and quotes so an attribute value containing `>` cannot end the scan
 * early. Throws rather than returning a partial tag, so a structural change
 * surfaces as a loud failure instead of a silently-empty haystack.
 */
function openingTagWithId(src: string, id: string): string {
  const at = src.indexOf(`id="${id}"`);
  if (at === -1) throw new Error(`no element carries id="${id}"`);
  const start = src.lastIndexOf('<', at);
  if (start === -1) throw new Error(`no opening '<' before id="${id}"`);
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`the opening tag for id="${id}" never closes`);
}

/** The `className="…"` literal on that tag, or '' when it has none. */
function classNameOf(src: string, id: string): string {
  const tag = openingTagWithId(src, id);
  const m = tag.match(/className="([^"]*)"/);
  return m ? m[1] : '';
}

/**
 * Every `className="…"` value in the file, joined.
 *
 * Scanning the RAW source instead would read comments as markup: the comment
 * on `#listing-wizard-root` explains the bug and therefore names
 * `overflow-y-auto` twice, which made the first version of the nesting
 * assertion below fail on prose. Only real class literals count.
 */
function allClassNames(src: string): string {
  return [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(' ');
}

/** The source with comments removed, for assertions about code, not prose. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('the seller flow has exactly one vertical scroll owner', () => {
  it('keeps #sell-view-root as the scroll owner', () => {
    // Removing this is the other way to break the flow: nothing else in the
    // seller path can scroll, and DesktopFrame's mobile shell is overflow-hidden.
    expect(classNameOf(SELL, 'sell-view-root')).toMatch(/(?<![\w-])overflow-y-auto(?![\w-])/);
  });

  it('does not let #listing-wizard-root own vertical scroll', () => {
    expect(classNameOf(WIZARD, 'listing-wizard-root')).not.toMatch(VERTICAL_SCROLL);
  });

  it('does not let #listing-wizard-root contain the scroll gesture', () => {
    // This is the token that actually broke Samsung/Android: it stopped the
    // touch from chaining to #sell-view-root.
    expect(classNameOf(WIZARD, 'listing-wizard-root')).not.toMatch(/(?<![\w-])overscroll-contain(?![\w-])/);
  });

  it('has no NESTED vertical scroll owner anywhere in the flow', () => {
    // Counted across both files rather than only on the two roots: an inner
    // scroller added lower down would nest just as badly, and the whole point
    // of the fix is that the flow has one owner. If a future screen genuinely
    // needs its own scroller, that is a deliberate decision — raise it here
    // with the reason, do not silently widen the regex.
    const owners = [
      ...(allClassNames(SELL).match(VERTICAL_SCROLL) ?? []).map((t) => `SellView:${t}`),
      ...(allClassNames(WIZARD).match(VERTICAL_SCROLL) ?? []).map((t) => `ListingWizardView:${t}`),
    ];
    expect(owners).toEqual(['SellView:overflow-y-auto']);
  });

  it('fixes the flow by layout, not by fighting the browser', () => {
    // The constraints on the fix: no UA sniffing, no touch handlers, no
    // preventDefault, no position:fixed or body-level scrolling. Asserted so a
    // later "fix" cannot quietly reintroduce any of them.
    for (const [name, raw] of [['SellView', SELL], ['ListingWizardView', WIZARD]] as const) {
      // Comments stripped: this asserts what the CODE does, and the comment on
      // the wizard root necessarily discusses the very things banned here.
      const src = withoutComments(raw);
      expect(src, `${name} must not listen for touchmove`).not.toMatch(/touchmove/i);
      expect(src, `${name} must not sniff the user agent`).not.toMatch(/userAgent|navigator\.platform/);
      expect(allClassNames(raw), `${name} must not use position:fixed for scrolling`)
        .not.toMatch(/(?<![\w-])fixed(?![\w-])[^"]*overflow-y/);
    }
  });
});
