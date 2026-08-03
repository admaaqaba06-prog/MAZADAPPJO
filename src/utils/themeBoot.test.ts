import { describe, expect, it } from 'vitest';
import { resolveBootTheme } from './themeBoot';

describe('resolveBootTheme', () => {
  it('honours a real stored choice', () => {
    expect(resolveBootTheme('light')).toBe('light');
    expect(resolveBootTheme('dark')).toBe('dark');
  });

  // An absent key is the normal first-visit case, not an error.
  it('falls back to dark when nothing is stored', () => {
    expect(resolveBootTheme(null)).toBe('dark');
    expect(resolveBootTheme(undefined)).toBe('dark');
  });

  // localStorage can hold anything, including a value written by an older
  // build. This runs before paint, so it must resolve rather than throw.
  it('falls back to dark for junk', () => {
    expect(resolveBootTheme('SEPIA')).toBe('dark');
    expect(resolveBootTheme('')).toBe('dark');
  });
});
