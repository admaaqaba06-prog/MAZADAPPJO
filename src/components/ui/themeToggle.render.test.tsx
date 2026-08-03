/**
 * Executes ThemeToggle. No @types/react and non-strict TS, so a bad prop or a
 * TDZ fault survives `tsc` and the unit suite and only breaks in the browser.
 * react-dom/server runs no effects — this proves it renders, not that clicking
 * it works.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

let current: 'dark' | 'light' = 'dark';
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ theme: current, setTheme: () => {} }),
}));

import ThemeToggle from './ThemeToggle';

describe('ThemeToggle', () => {
  // The label must name the theme you would switch TO. A button reading "Dark"
  // while already dark reads as a broken toggle.
  it('offers the light option while dark is active', () => {
    current = 'dark';
    const html = renderToStaticMarkup(React.createElement(ThemeToggle, { isAr: false }));
    expect(html).toContain('Light');
    expect(html).not.toContain('>Dark<');
    expect(html).toContain('aria-pressed="true"');
  });

  it('offers the dark option while light is active', () => {
    current = 'light';
    const html = renderToStaticMarkup(React.createElement(ThemeToggle, { isAr: false }));
    expect(html).toContain('Dark');
    expect(html).toContain('aria-pressed="false"');
  });

  it('renders Arabic copy', () => {
    current = 'dark';
    expect(renderToStaticMarkup(React.createElement(ThemeToggle, { isAr: true }))).toContain('فاتح');
  });
});
