import { describe, it, expect } from 'vitest';
import { compactJod } from './bidFormat';

describe('compactJod', () => {
  it('leaves values under 1000 as plain integers', () => {
    expect(compactJod(0)).toBe('0');
    expect(compactJod(25)).toBe('25');
    expect(compactJod(999)).toBe('999');
  });
  it('formats thousands with K, one decimal, trailing zero trimmed', () => {
    expect(compactJod(1000)).toBe('1K');
    expect(compactJod(12345)).toBe('12.3K');
    expect(compactJod(500000)).toBe('500K');
  });
  it('formats millions with M', () => {
    expect(compactJod(1000000)).toBe('1M');
    expect(compactJod(1500000)).toBe('1.5M');
  });
  it('rounds, never fabricates precision, and handles junk as 0', () => {
    expect(compactJod(1949)).toBe('1.9K');
    expect(compactJod(NaN as unknown as number)).toBe('0');
    expect(compactJod(-5)).toBe('0');
  });
  it('promotes the 999.95K–999.999K rounding edge to 1M, never "1000K"', () => {
    expect(compactJod(999999)).toBe('1M');
    expect(compactJod(999950)).toBe('1M');
    expect(compactJod(999499)).toBe('999.5K');
  });
});
