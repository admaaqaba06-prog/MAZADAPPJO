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
    // The reported bug, at every guest-reachable Sell entry point. There were
    // three; the Discover header button was removed on 2026-08-25 because the
    // bottom nav's centre FAB is the primary Sell action and two entry points
    // to one route in a single mobile viewport is duplicated weight. The two
    // survivors both live in DesktopFrame — the FAB and the desktop top nav.
    //
    // Counted rather than merely matched: a single toMatch would still pass if
    // one of the two regressed to a bare requestSignIn(), which is exactly the
    // bug. If a Sell entry point is ever added elsewhere, this count fails and
    // the new file has to be added here deliberately.
    // Comments stripped before counting. Without this the scan reads PROSE as
    // code: DiscoveryFeedView carries a comment explaining that the FAB keeps
    // this intent, and that sentence contains the literal call, so the file
    // showed up as a third call site that does not exist.
    const code = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    const frame = code(read('components/DesktopFrame.tsx'));
    expect((frame.match(/requestSignIn\('sell'\)/g) ?? []).length).toBe(2);

    // And no OTHER component may offer Sell without the intent.
    const sellCallers = sourceFiles('src')
      .filter((f) => !f.includes('.test.'))
      .filter((f) => /requestSignIn\('sell'\)/.test(code(readFileSync(f, 'utf8'))))
      // sourceFiles returns repo-relative paths with the platform separator.
      .map((f) => f.replace(/\\/g, '/').replace(/^.*?src\//, ''));
    expect(sellCallers).toEqual(['components/DesktopFrame.tsx']);
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
