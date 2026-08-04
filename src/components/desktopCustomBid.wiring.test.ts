// The desktop custom-bid field, pinned at the source.
//
// DesktopLiveAuctionLayout cannot be rendered here: it pulls in framer-motion,
// the live-auction context and a media stack, and vitest is `environment:
// 'node'`. The BEHAVIOUR is unit-tested in desktopBidAmount.test.ts; this file
// pins the WIRING — that the component actually routes through that decision
// rather than around it.
//
// Every anchor throws when it moves. A bare indexOf returns -1, and -1 satisfies
// every comparison, so an assertion anchored that way passes vacuously the
// moment the code it guards is deleted.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./DesktopLiveAuctionLayout.tsx', import.meta.url), 'utf8');

/** Strips comments so an anchor can never match explanatory prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CODE = stripComments(SRC);

function at(re: RegExp, label: string): number {
  const m = CODE.match(re);
  if (!m || m.index === undefined) throw new Error(`${label} not found — ${re}`);
  return m.index;
}

describe('the desktop panel has a custom-amount field at all', () => {
  it('renders an input the user can type an amount into', () => {
    // The reported bug: desktop had no way to enter an amount, because the
    // custom field lives in BidSheet and only MobileAuctionView renders it.
    expect(CODE).toMatch(/id="desktop-custom-bid"/);
    expect(CODE).toMatch(/<input/);
  });

  it('binds the input to state, not to a constant', () => {
    const i = at(/id="desktop-custom-bid"/, 'input');
    const block = CODE.slice(i, i + 900);
    expect(block).toMatch(/value=\{customBid\}/);
    expect(block).toMatch(/onChange=\{\(e\)\s*=>\s*setCustomBid\(e\.target\.value\)\}/);
  });

  it('is always rendered, never behind a disclosure toggle', () => {
    // MJ's call: the problem was that it was not visible. A `showCustom`-style
    // gate would reintroduce exactly that.
    const i = at(/id="desktop-custom-bid"/, 'input');
    const before = CODE.slice(Math.max(0, i - 700), i);
    expect(before).not.toMatch(/showCustom|customOpen|isCustomVisible|expanded/i);
  });
});

describe('the CTA sends what the field says', () => {
  it('routes the primary CTA through chooseBidAmount, not the raw minimum', () => {
    expect(CODE).toMatch(/const chosenBid = chooseBidAmount\(customBid, nextBidAmount\)/);
    const i = at(/id="desktop-bid-cta"/, 'cta');
    const block = CODE.slice(Math.max(0, i - 900), i + 400);
    expect(block).toMatch(/openConfirm\(chosenBid\.amount\)/);
    expect(block).not.toMatch(/openConfirm\(nextBidAmount\)/);
  });

  it('labels the CTA with the chosen amount', () => {
    const i = at(/id="desktop-bid-cta"/, 'cta');
    const block = CODE.slice(i, i + 700);
    expect(block).toMatch(/chosenBid\.amount\.toLocaleString\(\)/);
  });

  it('BLOCKS the CTA while the entry is invalid', () => {
    // The money-safety rule. Without the guard, typing 5 sends the minimum.
    const i = at(/id="desktop-bid-cta"/, 'cta');
    const block = CODE.slice(Math.max(0, i - 900), i + 400);
    expect(block).toMatch(/if \(chosenBid\.canBid\)/);
    expect(block).toMatch(/disabled=\{!chosenBid\.canBid\}/);
  });

  it('blocks it with a prop Pressable actually forwards to the DOM', () => {
    // This assertion exists because the first version used `aria-disabled`, the
    // source-text test passed, and the attribute NEVER REACHED THE DOM: Pressable
    // forwards an explicit allowlist (type, id, className, onClick, disabled,
    // aria-label) and silently drops everything else. tsc could not catch it —
    // @types/react is absent here, so JSX prop checking is effectively off.
    // Caught only by reading the rendered element in a browser.
    const pressableSrc = readFileSync(
      new URL('./feedback/Pressable.tsx', import.meta.url), 'utf8'
    );
    const forwarded = ['disabled', 'onClick', 'className', 'id', 'type'];
    for (const prop of forwarded) {
      expect(pressableSrc, `Pressable forwards ${prop}`).toMatch(
        new RegExp(`${prop}=\\{`)
      );
    }
    // And the CTA must not lean on an aria-* prop Pressable drops.
    const i = at(/id="desktop-bid-cta"/, 'cta');
    const block = CODE.slice(Math.max(0, i - 900), i + 400);
    expect(block, 'no aria-disabled — Pressable drops it').not.toMatch(/aria-disabled=/);
  });

  it('quotes the total-if-you-win against the SAME amount the CTA sends', () => {
    // Quoting the premium on a different number than the button bids is a lie
    // about money, and the one most likely to go unnoticed.
    expect(CODE).toMatch(/totalWithPremium\(chosenBid\.amount\)/);
    const i = at(/Total if you win/, 'total line');
    const block = CODE.slice(Math.max(0, i - 400), i + 400);
    expect(block).not.toMatch(/totalWithPremium\(nextBidAmount\)/);
  });
});

describe('it reuses the existing safety path', () => {
  it('goes through openConfirm — no second bid route', () => {
    // openConfirm carries the guest gate, the ban gate, and the price-moved
    // re-prompt. A custom bid that bypassed it would skip all three.
    const i = at(/id="desktop-custom-bid"/, 'input');
    const block = CODE.slice(i, i + 900);
    expect(block).toMatch(/openConfirm\(chosenBid\.amount\)/);
    expect(block).not.toMatch(/placeBid|executeBid|submitBid/);
  });

  it('commits on Enter, and only when the amount is sendable', () => {
    const i = at(/id="desktop-custom-bid"/, 'input');
    const block = CODE.slice(i, i + 900);
    expect(block).toMatch(/e\.key === 'Enter' && chosenBid\.canBid/);
  });

  it('does not re-implement validation', () => {
    // validateCustomBid owns "is this a legal bid" and mobile already uses it.
    expect(CODE).not.toMatch(/customBid\s*<\s*nextBidAmount/);
    expect(CODE).toMatch(/from '\.\.\/utils\/desktopBidAmount'/);
  });
});

describe('it is bilingual and themed', () => {
  it('gives the label, unit and both errors in Arabic and English', () => {
    const i = at(/id="desktop-custom-bid"/, 'input');
    const block = CODE.slice(Math.max(0, i - 400), i + 2000);
    expect(block).toMatch(/أو أدخل مبلغاً/);
    expect(block).toMatch(/Or enter an amount/);
    expect(block).toMatch(/الحد الأدنى/);
    expect(block).toMatch(/Minimum bid is/);
    expect(block).toMatch(/أدخل مبلغاً صالحاً/);
    expect(block).toMatch(/Enter a valid amount/);
  });

  it('uses theme tokens for the field, not raw neutrals', () => {
    // src/theme.guard.test.ts is a ratchet; catching it here reads clearer.
    const i = at(/id="desktop-custom-bid"/, 'input');
    const block = CODE.slice(i, i + 900);
    expect(block).toMatch(/bg-surface-sunken/);
    expect(block).toMatch(/text-fg/);
    expect(block).not.toMatch(/(?:text|bg)-\[#(?:[0-9A-Fa-f]{3}){1,2}\]/);
  });

  it('marks the invalid state for assistive tech, not by colour alone', () => {
    const i = at(/id="desktop-custom-bid"/, 'input');
    const block = CODE.slice(i, i + 900);
    expect(block).toMatch(/aria-invalid=/);
    expect(block).toMatch(/aria-describedby=/);
  });
});
