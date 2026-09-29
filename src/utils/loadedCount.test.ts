// The live-count honesty rules.
//
// Reported from production: the "مباشر الآن" number sat on 24 and never moved.
// 24 is PAGE in discoverQuery.ts — the feed was reporting how many live lots it
// had FETCHED as though it were how many exist. These tests pin the fix so the
// cap can never go silent again.

import { describe, it, expect } from 'vitest';
import { loadedCountBadge, arabicAuctions, liveNowPhrase } from './loadedCount';
import { PAGE } from './discoverQuery';

describe('loadedCountBadge', () => {
  it('states an exact number only when the list is complete', () => {
    expect(loadedCountBadge(7, false)).toBe('7');
    expect(loadedCountBadge(0, false)).toBe('0');
  });

  it('marks the number as a FLOOR while more remain', () => {
    // The whole bug: a full page with more behind it used to claim exactness.
    expect(loadedCountBadge(PAGE, true)).toBe(`${PAGE}+`);
    expect(loadedCountBadge(24, true)).toBe('24+');
    expect(loadedCountBadge(48, true)).toBe('48+');
  });

  it('never renders a negative or fractional count', () => {
    expect(loadedCountBadge(-3, false)).toBe('0');
    expect(loadedCountBadge(4.7, false)).toBe('4');
    expect(loadedCountBadge(NaN as unknown as number, false)).toBe('0');
  });
});

describe('arabicAuctions — counted nouns, not English plurals', () => {
  it('uses the bare singular for 1 and the dual for 2', () => {
    expect(arabicAuctions(1)).toBe('مزاد واحد');
    expect(arabicAuctions(2)).toBe('مزادان');
    // The defect being replaced: «2 مزادات».
    expect(arabicAuctions(2)).not.toBe('2 مزادات');
  });

  it('uses the plural for 3–10', () => {
    expect(arabicAuctions(3)).toBe('3 مزادات');
    expect(arabicAuctions(10)).toBe('10 مزادات');
  });

  it('returns to the singular after 10', () => {
    expect(arabicAuctions(11)).toBe('11 مزاداً');
    expect(arabicAuctions(24)).toBe('24 مزاداً');
    // The old code said «24 مزادات» here.
    expect(arabicAuctions(24)).not.toContain('مزادات');
  });
});

describe('liveNowPhrase', () => {
  it('reads as a floor in Arabic without bolting + onto a counted noun', () => {
    const s = liveNowPhrase(24, true, true);
    expect(s).toBe('مباشر الآن — أكثر من 24 مزاد');
    expect(s).not.toContain('+');
  });

  it('gives an exact, grammatical count when everything is loaded', () => {
    expect(liveNowPhrase(2, false, true)).toBe('مباشر الآن — مزادان');
    expect(liveNowPhrase(5, false, true)).toBe('مباشر الآن — 5 مزادات');
    expect(liveNowPhrase(30, false, true)).toBe('مباشر الآن — 30 مزاداً');
  });

  it('handles English both ways', () => {
    expect(liveNowPhrase(1, false, false)).toBe('Live now — 1 auction');
    expect(liveNowPhrase(9, false, false)).toBe('Live now — 9 auctions');
    expect(liveNowPhrase(24, true, false)).toBe('Live now — 24+ auctions');
  });
});

describe('the cap this protects against is real', () => {
  it('PAGE is the number that was stuck on screen', () => {
    // If PAGE changes, the reported symptom changes with it — this is here so
    // the connection between the page size and the frozen badge stays visible.
    expect(PAGE).toBe(24);
  });
});
