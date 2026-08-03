// `requestSignIn()` took no argument, so every entry point — a bid tap, a save,
// the chat composer, the Sell FAB, the profile tab — produced one screen whose
// only contextual line read "Sign in to join the live auction". A partner
// review caught it from the seller's side: tapping "Sell your product" asked
// them to sign in to bid.
//
// The intent has to be captured AT THE TAP. By the time LoginView renders, the
// only clue left is the URL, which is exactly why the old screen guessed.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

describe('sign-in intent', () => {
  it('has no call site left that asks without saying why', () => {
    // A bare requestSignIn() is not a type error — the parameter is optional,
    // deliberately, so the context provider can keep one signature. This is
    // what stops a new gated action silently reintroducing the bug.
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const src = readFileSync(file, 'utf8');
      // The definition and the doc comment both mention the bare form.
      if (file.endsWith('AppContext.tsx') || file.endsWith('signInIntent.ts')) continue;
      if (/requestSignIn\(\s*\)/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('asks a would-be seller to sign in to sell', () => {
    // The reported bug, at its three guest-reachable entry points: the bottom
    // nav FAB, the desktop top nav, and the Discover header button.
    expect(read('components/DesktopFrame.tsx')).toMatch(/requestSignIn\('sell'\)/);
    expect(read('components/DiscoveryFeedView.tsx')).toMatch(/requestSignIn\('sell'\)/);
  });

  it('asks a would-be bidder to sign in to bid', () => {
    expect(read('hooks/useBidFlow.ts')).toMatch(/requestSignIn\('bid'\)/);
  });

  it('renders the intent copy instead of a fixed headline', () => {
    const src = read('components/LoginView.tsx');
    expect(src).toMatch(/signInPrompt\(signInIntent, isAr\)/);
    expect(src).toMatch(/\{prompt\.headline\}/);
    // The old hardcoded bidding line must not outrank an explicit intent.
    expect(src).toMatch(/cameFromAuctionLink && !signInIntent/);
  });

  it('sends a would-be seller into the selling flow after sign-in', () => {
    expect(read('context/AppContext.tsx')).toMatch(/postSignInView\(signInIntent\)/);
  });
});
