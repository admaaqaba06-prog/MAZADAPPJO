import { describe, expect, it } from 'vitest';
import { isSearchActive } from './useAlgoliaSearch';

describe('isSearchActive', () => {
  it('is false when the flag is off, regardless of term', () => {
    expect(isSearchActive('cars', false)).toBe(false);
    expect(isSearchActive('', false)).toBe(false);
    expect(isSearchActive('   ', false)).toBe(false);
  });

  it('is false when the flag is on but the term is empty/whitespace', () => {
    expect(isSearchActive('', true)).toBe(false);
    expect(isSearchActive('   ', true)).toBe(false);
    expect(isSearchActive('\t\n', true)).toBe(false);
  });

  it('is true only when the flag is on AND the trimmed term is non-empty', () => {
    expect(isSearchActive('cars', true)).toBe(true);
    expect(isSearchActive('  watch  ', true)).toBe(true);
  });
});
