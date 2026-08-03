import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Light/dark switch.
 *
 * ONE component used in both places a language switcher lives — the app shell
 * (DesktopFrame) and the landing page — rather than the two separate
 * implementations the language switcher grew into.
 *
 * Two states, not three: there is no "system" option, because the theme
 * deliberately ignores `prefers-color-scheme` (see the design spec). A control
 * offering "system" would imply a behaviour that does not exist.
 *
 * The label names the theme you would SWITCH TO, not the one you are in — a
 * button saying "Dark" while already dark reads as a broken toggle.
 */
const ThemeToggle: React.FC<{ isAr: boolean }> = ({ isAr }) => {
  const { theme, setTheme } = useApp();
  const isDark = theme === 'dark';
  const nextLabel = isDark
    ? (isAr ? 'فاتح' : 'Light')
    : (isAr ? 'داكن' : 'Dark');

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-pressed={isDark}
      title={nextLabel}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
      id="theme-toggle"
    >
      {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      <span className="hidden xl:inline">{nextLabel}</span>
    </button>
  );
};

export default ThemeToggle;
