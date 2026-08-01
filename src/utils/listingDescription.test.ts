import { describe, it, expect } from 'vitest';
import { validateDescription, DESCRIPTION_MIN } from './listingDescription';

describe('DESCRIPTION_MIN', () => {
  it('is 20 — low enough for one honest sentence, high enough to exclude a bare product name', () => {
    expect(DESCRIPTION_MIN).toBe(20);
  });
});

describe('validateDescription — the boundary', () => {
  it('rejects one character below the floor', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN - 1), true).ok).toBe(false);
  });

  it('accepts exactly the floor', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN), true).ok).toBe(true);
  });

  it('accepts above the floor', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN + 50), true).ok).toBe(true);
  });
});

describe('validateDescription — trims before counting', () => {
  it('rejects whitespace padded out to the floor', () => {
    // 20 spaces is not a description.
    expect(validateDescription(' '.repeat(DESCRIPTION_MIN + 5), true).ok).toBe(false);
  });

  it('rejects a short body wrapped in whitespace', () => {
    expect(validateDescription('   short   ', true).ok).toBe(false);
  });

  it('accepts a valid body wrapped in whitespace', () => {
    expect(validateDescription('  ' + 'x'.repeat(DESCRIPTION_MIN) + '  ', true).ok).toBe(true);
  });

  it('rejects a body padded on the LEFT only — trimming one side is not trimming', () => {
    // 'Apple Watch Ultra' is 17 characters and a real production string. Three
    // leading spaces make it exactly DESCRIPTION_MIN, so a right-only trim
    // (which has nothing to remove here) would let a bare product name through.
    expect(validateDescription('   Apple Watch Ultra', false).ok).toBe(false);
  });

  it('rejects a body padded on the RIGHT only — the mirror of the case above', () => {
    expect(validateDescription('Apple Watch Ultra   ', false).ok).toBe(false);
  });

  it('rejects empty and nullish input without throwing', () => {
    for (const bad of ['', undefined, null]) {
      expect(() => validateDescription(bad, true)).not.toThrow();
      expect(validateDescription(bad, true).ok).toBe(false);
    }
  });

  it('survives a non-string that the type system says cannot happen', () => {
    // AuctionItem.description is declared `string` but the value arrives from
    // Firestore, which enforces nothing — a numeric description would make a
    // bare `raw.trim()` throw. The String() wrapper is load-bearing, not noise.
    expect(() => validateDescription(12345 as any, false)).not.toThrow();
    expect(validateDescription(12345 as any, false).ok).toBe(false);
  });

  it('treats nullish as empty, not as the text "null" or "undefined"', () => {
    // Pins the `?? ''` coalesce to the empty-string contract rather than to the
    // arithmetic accident that 'null' (4) and 'undefined' (9) both sit under 20.
    const empty = validateDescription('', false);
    expect(validateDescription(null, false)).toEqual(empty);
    expect(validateDescription(undefined, false)).toEqual(empty);
  });
});

describe('validateDescription — the message the caller shows', () => {
  it('returns Arabic when isAr', () => {
    const r = validateDescription('short', true);
    expect(r.message).toBeTruthy();
    expect(r.message!).toMatch(/[؀-ۿ]/);
  });

  it('returns English when not isAr', () => {
    const r = validateDescription('short', false);
    expect(r.message).toBeTruthy();
    expect(r.message!).not.toMatch(/[؀-ۿ]/);
  });

  it('states the minimum in the message, so the seller knows the target', () => {
    expect(validateDescription('short', false).message).toContain(String(DESCRIPTION_MIN));
    expect(validateDescription('short', true).message).toContain(String(DESCRIPTION_MIN));
  });

  it('carries NO message when valid', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN), true).message).toBeUndefined();
  });
});

describe('validateDescription — real content', () => {
  it('accepts a genuine Arabic description', () => {
    expect(validateDescription('آيفون 15 برو ماكس، مستعمل بحالة ممتازة، مع العلبة والشاحن الأصلي.', true).ok).toBe(true);
  });

  it('rejects a bare product name, which is what production is full of today', () => {
    // 115 real auctions and not one carries a real description — the field was
    // fabricated from the title. These are the actual strings in the database.
    for (const name of ['iPhone 17 pro max', 'Apple Watch Ultra']) {
      expect(validateDescription(name, false).ok, name).toBe(false);
    }
  });

  it('counts emoji as UTF-16 units, not as visible characters', () => {
    // '🍽️' is ONE visible character but THREE UTF-16 units (U+1F37D + U+FE0F),
    // so 7 of them clear the floor at 21 units while showing 7 glyphs. That is
    // the deliberate choice, not an oversight: the floor is a nudge, not a
    // security boundary, so no grapheme-cluster cleverness is attempted.
    expect(() => validateDescription('🍽️'.repeat(30), true)).not.toThrow();
    expect(validateDescription('🍽️'.repeat(30), true).ok).toBe(true);
    expect(validateDescription('🍽️'.repeat(7), true).ok).toBe(true);
  });
});
