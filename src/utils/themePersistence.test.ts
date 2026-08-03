import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme, canPersistTheme,
  storedDocTheme, shouldAdoptLocalTheme, persistThemePreference,
} from './themePersistence';

const signedIn = { isAuthenticated: true, userId: 'u1' };
const signedOut = { isAuthenticated: false, userId: 'unauthenticated' };

describe('constants', () => {
  it('defaults to dark and stores under a namespaced key', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(THEME_STORAGE_KEY).toBe('mazad.theme');
  });
});

describe('normalizeTheme', () => {
  it('accepts the two real values', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
  });

  // Junk must resolve to the DEFAULT, never throw — this runs before paint.
  it('resolves anything else to the default', () => {
    for (const junk of ['DARK', 'sepia', '', null, undefined, 7, {}]) {
      expect(normalizeTheme(junk)).toBe(DEFAULT_THEME);
    }
  });
});

describe('canPersistTheme', () => {
  it('is true only for a signed-in session with a real uid', () => {
    expect(canPersistTheme(signedIn)).toBe(true);
    expect(canPersistTheme(signedOut)).toBe(false);
    expect(canPersistTheme(null)).toBe(false);
    expect(canPersistTheme({ isAuthenticated: true, userId: '   ' })).toBe(false);
    expect(canPersistTheme({ isAuthenticated: true, userId: 42 })).toBe(false);
  });
});

describe('storedDocTheme', () => {
  it('returns a real stored preference', () => {
    expect(storedDocTheme('light')).toBe('light');
    expect(storedDocTheme('dark')).toBe('dark');
  });

  it('treats junk as absent', () => {
    expect(storedDocTheme('SEPIA')).toBeNull();
    expect(storedDocTheme(undefined)).toBeNull();
  });
});

describe('shouldAdoptLocalTheme', () => {
  it('adopts an explicit local choice when the account holds none', () => {
    expect(shouldAdoptLocalTheme({
      session: signedIn, storedTheme: 'light', docTheme: undefined,
    })).toBe(true);
  });

  // Server wins; absence does not.
  it('refuses when the account already holds a value', () => {
    expect(shouldAdoptLocalTheme({
      session: signedIn, storedTheme: 'light', docTheme: 'dark',
    })).toBe(false);
  });

  // A missing key is a DEFAULT, not a choice.
  it('refuses when nothing was ever stored locally', () => {
    expect(shouldAdoptLocalTheme({
      session: signedIn, storedTheme: null, docTheme: undefined,
    })).toBe(false);
  });

  it('refuses junk, a signed-out session, and a repeat adoption', () => {
    expect(shouldAdoptLocalTheme({ session: signedIn, storedTheme: 'SEPIA', docTheme: undefined })).toBe(false);
    expect(shouldAdoptLocalTheme({ session: signedOut, storedTheme: 'light', docTheme: undefined })).toBe(false);
    expect(shouldAdoptLocalTheme({
      session: signedIn, storedTheme: 'light', docTheme: undefined, alreadyAdopted: true,
    })).toBe(false);
  });
});

describe('persistThemePreference', () => {
  it('writes the normalized theme for a signed-in user', () => {
    const writeDoc = vi.fn();
    expect(persistThemePreference(signedIn, 'light', writeDoc)).toBe(true);
    expect(writeDoc).toHaveBeenCalledWith('u1', { theme: 'light' });
  });

  it('does not write when signed out, and that is not an error', () => {
    const writeDoc = vi.fn();
    expect(persistThemePreference(signedOut, 'light', writeDoc)).toBe(false);
    expect(writeDoc).not.toHaveBeenCalled();
  });

  it('swallows a synchronous throw and reports it', () => {
    const onError = vi.fn();
    const boom = () => { throw new Error('offline'); };
    expect(() => persistThemePreference(signedIn, 'dark', boom, onError)).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });

  it('swallows a rejected promise and reports it', async () => {
    const onError = vi.fn();
    persistThemePreference(signedIn, 'dark', () => Promise.reject(new Error('nope')), onError);
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalled();
  });

  it('tolerates a writeDoc that returns a non-promise', () => {
    expect(() => persistThemePreference(signedIn, 'dark', () => 'not a promise')).not.toThrow();
  });
});
