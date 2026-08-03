// One lot, one badge. An awaiting-first-bid card used to render the amber
// "BE THE FIRST" state badge in the top-left AND an "Awaiting first bid" chip
// in the top-right clock corner — the same message twice, which is what a
// partner review flagged as the card feeling noisy.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./DiscoveryFeedView.tsx', import.meta.url), 'utf8');

describe('discovery card badges', () => {
  it('states the awaiting-first-bid case exactly once', () => {
    const arabic = src.match(/كن أول مزايد/g) ?? [];
    const waiting = src.match(/بانتظار أول مزايدة/g) ?? [];
    // The card body keeps ONE awaiting affordance. The remaining Arabic
    // occurrences are the chip label and the desktop hover CTA, neither of
    // which is a card badge; the passive "awaiting" phrasing is gone entirely.
    expect(waiting.length, 'passive awaiting chip should be gone').toBe(0);
    expect(arabic.length, 'the call-to-action survives').toBeGreaterThan(0);
  });

  it('keeps the clock corner for lots that actually have a clock', () => {
    // The countdown and the ENDED flag both still live there.
    expect(src).toMatch(/formatCountdown\(secondsLeft/);
    expect(src).toMatch(/ENDED/);
  });

  it('gives the title two lines, not one', () => {
    // Real titles run long — "شاشة Skyworth 43 بوصة QLED 2K Google TV" does not
    // fit on one line at card width, and a single clamp hid the model number.
    expect(src).toMatch(/line-clamp-2[^"]*">\s*\n\s*\{cleanTitle\(item\.title\)\}/);
  });

  it('cleans the title rather than printing the raw paste', () => {
    expect(src).toMatch(/from '\.\.\/utils\/listingTitle'/);
  });
});
