import { DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme, type Theme } from './themePersistence';

/**
 * The theme to paint with, from whatever localStorage holds.
 *
 * DUPLICATED as an inline script in index.html — that copy runs before the
 * bundle exists and therefore cannot import this. This is the tested copy; keep
 * the two in step.
 */
export function resolveBootTheme(stored: unknown): Theme {
  return normalizeTheme(stored);
}

/**
 * Read the stored preference, or null. Never throws: private mode and some
 * embedded webviews throw on `localStorage` access, and a throw here would take
 * out the first paint.
 */
export function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) {
    return null;
  }
}

/**
 * Write the attribute the CSS selects on, and keep the PWA chrome in step —
 * otherwise an installed app keeps a white system bar above a dark UI.
 */
export function applyThemeAttribute(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F0F10' : '#FFFFFF');
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
}

export { DEFAULT_THEME, THEME_STORAGE_KEY };
