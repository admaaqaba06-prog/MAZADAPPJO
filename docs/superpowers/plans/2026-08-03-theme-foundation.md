# Theme Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working light/dark toggle, dark by default, with the token layer and persistence the rest of the theme work builds on.

**Architecture:** Semantic CSS variables defined for both themes in `src/index.css`, selected by `data-theme` on `<html>`. A blocking inline script sets that attribute before first paint. Preference lives in `localStorage` for signed-out visitors and `users/{uid}.theme` for signed-in ones, mirroring `languagePersistence.ts` exactly.

**Tech Stack:** Tailwind v4 (`@theme`), React 19, Firestore, vitest 2.1 (node environment).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-03-theme-foundation-design.md`. Read it before Task 1.
- **This slice is deliberately almost invisible.** Only the 12 files already using tokens respond. The app does not go dark until slice 2. A reviewer expecting a dark app will think this is broken — it is not.
- **Dark is a hard default.** `prefers-color-scheme` is ignored entirely.
- **A missing `localStorage` key means "never chose".** Boot to dark WITHOUT writing the key, exactly as language boots to Arabic without writing its key. Writing a defaulted value would make every visitor express a preference they never made.
- **Tokens are named for role, not colour.** `--color-text-inverted` is "reads on a filled accent" and stays light in BOTH themes.
- **`--color-accent` (`#F05123`) is identical in both themes.**
- **All new copy is bilingual**, Arabic first: `{isAr ? 'عربي' : 'English'}`.
- **`localStorage` access must never throw.** Private mode and embedded webviews throw on access; an unguarded read in the pre-paint script renders a blank page.
- **`tsc --noEmit` proves nothing about `.tsx` call sites** here (no `@types/react`, non-strict). Render tests via `react-dom/server` are the real check.
- Commit after every task. Branch: `feat/theme-foundation`.

---

### Task 1: Theme persistence helpers

Mirrors `src/utils/languagePersistence.ts` function for function. Same problem, same shape — a differently-shaped second solution is the thing to avoid.

**Files:**
- Create: `src/utils/themePersistence.ts`
- Create: `src/utils/themePersistence.test.ts`

**Interfaces:**
- Produces: `type Theme = 'dark' | 'light'`; `THEME_STORAGE_KEY = 'mazad.theme'`; `DEFAULT_THEME: Theme = 'dark'`; `normalizeTheme(v: unknown): Theme`; `canPersistTheme(session): boolean`; `storedDocTheme(v: unknown): Theme | null`; `shouldAdoptLocalTheme(args): boolean`; `persistThemePreference(session, theme, writeDoc, onError?): boolean`. `ThemeSession = { isAuthenticated?: boolean; userId?: unknown }`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/themePersistence.test.ts`:

```ts
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

  // Junk counts as ABSENT: nobody expressed it, so a real local choice
  // replacing it is an improvement rather than a loss.
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

  // Server wins; absence does not. A doc value may have been set on another
  // device more recently than this browser's.
  it('refuses when the account already holds a value', () => {
    expect(shouldAdoptLocalTheme({
      session: signedIn, storedTheme: 'light', docTheme: 'dark',
    })).toBe(false);
  });

  // A missing key is a DEFAULT, not a choice — the app boots dark without
  // writing it. Adopting here would make every visitor write the field once.
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

  // The caller is a UI handler that has already flipped the theme locally.
  // Nothing it does afterwards may depend on the network.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/themePersistence.test.ts`
Expected: FAIL — `Failed to resolve import "./themePersistence"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/themePersistence.ts`:

```ts
/**
 * Theme preference persistence.
 *
 * Deliberately mirrors `languagePersistence.ts` function for function: it is the
 * same problem (a preference chosen before sign-in must survive sign-in without
 * clobbering the account's own value) and it was solved once already. A second,
 * differently-shaped solution to an identical problem is how the two drift.
 */
export type Theme = 'dark' | 'light';

export type ThemeSession = { isAuthenticated?: boolean; userId?: unknown };
export type ThemePatch = { theme: Theme };

export const THEME_STORAGE_KEY = 'mazad.theme';

/**
 * Dark, for everyone, including a first visit. `prefers-color-scheme` is
 * ignored ON PURPOSE — following the OS would leave some first-time visitors on
 * light, which is the inconsistency this feature exists to remove.
 */
export const DEFAULT_THEME: Theme = 'dark';

const UNAUTHENTICATED_ID = 'unauthenticated';

/** Anything that is not exactly 'light' or 'dark' resolves to the default. */
export function normalizeTheme(theme: unknown): Theme {
  return theme === 'light' || theme === 'dark' ? theme : DEFAULT_THEME;
}

/** True only for a signed-in session holding a real user document id. */
export function canPersistTheme(session: ThemeSession | null | undefined): boolean {
  if (!session || session.isAuthenticated !== true) return false;
  const uid = session.userId;
  if (typeof uid !== 'string') return false;
  const trimmed = uid.trim();
  return trimmed.length > 0 && trimmed !== UNAUTHENTICATED_ID;
}

/**
 * A theme stored on the user document, or null when the document carries no
 * real preference. Junk counts as ABSENT — nobody expressed it.
 */
export function storedDocTheme(docTheme: unknown): Theme | null {
  return docTheme === 'light' || docTheme === 'dark' ? docTheme : null;
}

/**
 * Whether a signed-in user's document should ADOPT the theme this browser holds.
 *
 * `storedTheme` must be the RAW localStorage value, and null when the key is
 * absent. Absence is the signal the visitor never chose: the app boots dark
 * without writing the key, so a missing key is a default and a present key is an
 * expressed preference.
 *
 * Only adopts when the document has NO theme of its own — a document that
 * already says 'light' or 'dark' holds a deliberate choice, possibly made on
 * another device more recently than this browser's. Server wins; absence does not.
 */
export function shouldAdoptLocalTheme(args: {
  session: ThemeSession | null | undefined;
  storedTheme: unknown;
  docTheme: unknown;
  alreadyAdopted?: boolean;
}): boolean {
  if (args.alreadyAdopted === true) return false;
  if (!canPersistTheme(args.session)) return false;
  if (storedDocTheme(args.docTheme) !== null) return false;
  return args.storedTheme === 'light' || args.storedTheme === 'dark';
}

/**
 * Fire-and-forget persistence. Never throws, never returns a promise: the caller
 * has already flipped the theme locally and nothing afterwards may depend on the
 * network.
 *
 * @returns whether a write was attempted — false means signed out, not an error.
 */
export function persistThemePreference(
  session: ThemeSession | null | undefined,
  theme: unknown,
  writeDoc: (uid: string, patch: ThemePatch) => unknown,
  onError?: (err: unknown) => void,
): boolean {
  if (!canPersistTheme(session)) return false;
  const uid = String(session!.userId).trim();
  const report = (err: unknown) => {
    try {
      if (onError) onError(err);
    } catch (_) {
      // Reporting a failure must not itself become a failure.
    }
  };
  try {
    const result = writeDoc(uid, { theme: normalizeTheme(theme) });
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(report);
    }
  } catch (err) {
    report(err);
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/themePersistence.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/themePersistence.ts src/utils/themePersistence.test.ts
git commit -m "feat(theme): persistence helpers mirroring the language pattern"
```

---

### Task 2: Boot resolution + the pre-paint script

The one piece of logic that exists twice: the inline script cannot import from a bundle that has not loaded. Extracting and testing the resolution is what makes the duplication safe.

**Files:**
- Create: `src/utils/themeBoot.ts`
- Create: `src/utils/themeBoot.test.ts`
- Modify: `index.html` (`<head>`, before any stylesheet)

**Interfaces:**
- Consumes: `Theme`, `DEFAULT_THEME`, `THEME_STORAGE_KEY`, `normalizeTheme` from Task 1.
- Produces: `resolveBootTheme(stored: unknown): Theme`, `readStoredTheme(): string | null`, `applyThemeAttribute(theme: Theme): void`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/themeBoot.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/themeBoot.test.ts`
Expected: FAIL — `Failed to resolve import "./themeBoot"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/themeBoot.ts`:

```ts
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
 * Read the stored preference, or null. Never throws: private mode and embedded
 * webviews throw on `localStorage` access, and a throw here would take out the
 * first paint.
 */
export function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) {
    return null;
  }
}

/** Write the attribute the CSS selects on, and keep the PWA chrome in step. */
export function applyThemeAttribute(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F0F10' : '#FFFFFF');
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
}

export { DEFAULT_THEME, THEME_STORAGE_KEY };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/themeBoot.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the inline pre-paint script**

In `index.html`, immediately after the `<meta name="viewport">` line and **before any stylesheet or module script**, insert:

```html
    <!-- Pre-paint theme. MUST be inline, synchronous, and before any stylesheet:
         anything deferred runs after the first paint and the page flashes light
         before flipping to dark on every cold load.

         This DUPLICATES src/utils/themeBoot.ts on purpose — it runs before the
         bundle exists, so it cannot import it. Keep the two in step; the logic
         is tested there.

         The try/catch is load-bearing: localStorage access THROWS in private
         mode and some embedded webviews, and an uncaught throw here renders a
         blank page. -->
    <script>
      (function () {
        var t = 'dark';
        try {
          var s = window.localStorage.getItem('mazad.theme');
          if (s === 'light' || s === 'dark') t = s;
        } catch (e) {}
        document.documentElement.setAttribute('data-theme', t);
        var m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', t === 'dark' ? '#0F0F10' : '#FFFFFF');
        var b = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (b) b.setAttribute('content', t === 'dark' ? 'black-translucent' : 'default');
      })();
    </script>
```

The script queries the two `<meta>` tags, so it must sit **after** them in the head. Move it below both if the viewport line precedes them.

Also correct the stale comment above `apple-mobile-web-app-status-bar-style`, which currently asserts "the app is light":

```html
    <!-- Overwritten at boot by the theme script above: 'default' (light bar,
         dark text) under light, 'black-translucent' under dark. The value here
         is only what ships in the HTML before that script runs. -->
```

- [ ] **Step 6: Verify no flash by hand**

Run: `npm run dev`, hard-reload `http://localhost:3000/`, and confirm `<html>` carries `data-theme="dark"` in the elements panel on first paint. Then run `localStorage.setItem('mazad.theme','light')`, reload, and confirm it is `light`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/themeBoot.ts src/utils/themeBoot.test.ts index.html
git commit -m "feat(theme): resolve and apply the theme before first paint"
```

---

### Task 3: The token layer

**Files:**
- Modify: `src/index.css` (the `@theme` block at `:4`, and `.landing-root` below it)

**Interfaces:**
- Produces: the CSS variables every later slice consumes.

- [ ] **Step 1: Add the semantic tokens to `@theme`**

Append inside the existing `@theme { ... }` block, after `--color-green`:

```css
  /* Semantic theme tokens — named for ROLE, not colour, because "surface"
     means something in both themes and "white" cannot. Light values reproduce
     today's palette exactly, so this slice is a visual no-op in light mode.
     Dark values are a FIRST PASS, tuned in slice 2 against real screens. */
  --color-surface: #F7F7F7;
  --color-surface-raised: #FFFFFF;
  --color-surface-sunken: #EFEFEF;
  --color-border: #E5E5E5;
  --color-text-primary: #0A0A0A;
  --color-text-muted: #4B4B4B;
  /* Reads on a filled accent. Light in BOTH themes — this is what the 354
     `text-white` labels in slice 2 actually mean. */
  --color-text-inverted: #FFFFFF;
  --color-accent: #F05123;
  --color-accent-weak: #FFF1EC;
```

Note `--color-surface` already exists at `:13` with the same value — replace that line rather than adding a duplicate.

- [ ] **Step 2: Add the dark overrides**

After the `@theme` block, before `.landing-root`:

```css
/* Dark theme. Selected by the attribute the pre-paint script sets, so the
   first frame is already correct. An attribute rather than a class: greppable,
   settable without React, and it cannot collide with Tailwind's own `dark:`
   variant. The accent is deliberately IDENTICAL across themes — it is the
   brand, and it carries on both backgrounds. */
[data-theme='dark'] {
  --color-surface: #0F0F10;
  --color-surface-raised: #17181A;
  --color-surface-sunken: #0A0A0B;
  --color-border: #2A2C30;
  --color-text-primary: #F2F2F3;
  --color-text-muted: #A0A3A8;
  --color-text-inverted: #FFFFFF;
  --color-accent: #F05123;
  --color-accent-weak: rgba(240, 81, 35, 0.14);
}

/* The page itself, so the area outside any component is themed too. Without
   this the body stays white behind a dark app on short pages and on overscroll. */
html[data-theme] body {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
}
```

- [ ] **Step 3: Bring the landing page onto the tokens**

`.landing-root` hardcodes `background-color: #FFFFFF; color: #0A0A0A` and is scoped so it "never restyles the app shell." The landing page is in scope, so it moves onto tokens. Replace those two declarations:

```css
  /* Was #FFFFFF / #0A0A0A. On tokens now — the landing page is in scope for
     the theme (MJ, 2026-08-03). The radial-gradient accents below keep their
     rgba orange, which reads on both backgrounds. */
  background-color: var(--color-surface);
  color: var(--color-text-primary);
```

Leave the two `radial-gradient` lines untouched.

- [ ] **Step 4: Verify both themes render**

Run: `npm run dev`. With `data-theme="dark"` the page background is `#0F0F10`; setting `localStorage.mazad.theme = 'light'` and reloading restores today's appearance exactly. **Most components stay light in dark mode — that is expected in this slice.**

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): semantic token layer with a first-pass dark palette"
```

---

### Task 4: Theme state in AppContext

**Files:**
- Modify: `src/context/AppContext.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `theme: Theme` and `setTheme: (t: Theme) => void` on the app context.

- [ ] **Step 1: Add state and the setter**

Import beside the existing `languagePersistence` import:

```ts
import {
  DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme, shouldAdoptLocalTheme,
  persistThemePreference, storedDocTheme, type Theme,
} from '../utils/themePersistence';
import { applyThemeAttribute, readStoredTheme } from '../utils/themeBoot';
```

Add state near the `language` state:

```ts
  // Seeded from the attribute the pre-paint script already set, NOT from a
  // fresh default — re-deriving here would flip the theme on hydration and
  // undo the whole point of the inline script.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return DEFAULT_THEME;
    return normalizeTheme(document.documentElement.getAttribute('data-theme'));
  });
```

Add the setter next to `setLanguage`:

```ts
  const setTheme = useCallback((next: Theme) => {
    const value = normalizeTheme(next);
    setThemeState(value);
    applyThemeAttribute(value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch (_) {
      // Private mode / embedded webview. The theme still applies for this
      // session; only its persistence is lost.
    }
    persistThemePreference(
      { isAuthenticated: !!currentUser?.id, userId: currentUser?.id },
      value,
      (uid, patch) => setDoc(doc(db, 'users', uid), patch, { merge: true }),
      (err) => console.warn('[theme] persist failed:', err),
    );
  }, [currentUser?.id]);
```

- [ ] **Step 2: Follow the account's stored theme, and adopt a local choice**

Add an effect beside the equivalent language effect:

```ts
  // Two directions, one effect:
  //  - the account HAS a theme -> follow it (it may have been set on another
  //    device more recently than this browser's localStorage);
  //  - the account has NONE and this browser holds an explicit choice -> adopt
  //    it, so a theme picked before signing up is not silently lost.
  const themeAdoptedRef = useRef(false);
  useEffect(() => {
    if (!currentUser?.id) {
      themeAdoptedRef.current = false;
      return;
    }
    const session = { isAuthenticated: true, userId: currentUser.id };
    const docTheme = storedDocTheme((currentUser as any).theme);
    if (docTheme) {
      if (docTheme !== theme) {
        setThemeState(docTheme);
        applyThemeAttribute(docTheme);
      }
      return;
    }
    if (shouldAdoptLocalTheme({
      session,
      storedTheme: readStoredTheme(),
      docTheme: (currentUser as any).theme,
      alreadyAdopted: themeAdoptedRef.current,
    })) {
      themeAdoptedRef.current = true;
      persistThemePreference(
        session, theme,
        (uid, patch) => setDoc(doc(db, 'users', uid), patch, { merge: true }),
        (err) => console.warn('[theme] adopt failed:', err),
      );
    }
  }, [currentUser?.id, (currentUser as any)?.theme, theme]);
```

- [ ] **Step 3: Expose on the context**

Add `theme: Theme;` and `setTheme: (t: Theme) => void;` to the context interface beside `language`/`setLanguage`, add `theme, setTheme,` to the provider value object, and add `theme, setTheme,` to the value memo's dependency array.

- [ ] **Step 4: Typecheck and test**

Run: `npm run lint && npm test`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "feat(theme): theme state, persistence and account adoption"
```

---

### Task 5: The toggle

**Files:**
- Create: `src/components/ui/ThemeToggle.tsx`
- Create: `src/components/ui/themeToggle.render.test.tsx`
- Modify: `src/components/DesktopFrame.tsx` (beside the language switcher at `:410`)
- Modify: `src/landing/LandingView.tsx` (beside its own language switcher)

**Interfaces:**
- Consumes: `theme` / `setTheme` from Task 4.
- Produces: `<ThemeToggle isAr={boolean} />`, default export.

- [ ] **Step 1: Write the failing render test**

Create `src/components/ui/themeToggle.render.test.tsx`:

```tsx
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
  it('offers the light option while dark is active', () => {
    current = 'dark';
    const html = renderToStaticMarkup(React.createElement(ThemeToggle, { isAr: false }));
    expect(html).toContain('Light');
    expect(html).toContain('aria-pressed="true"');
  });

  it('offers the dark option while light is active', () => {
    current = 'light';
    expect(renderToStaticMarkup(React.createElement(ThemeToggle, { isAr: false }))).toContain('Dark');
  });

  it('renders Arabic copy', () => {
    current = 'dark';
    expect(renderToStaticMarkup(React.createElement(ThemeToggle, { isAr: true }))).toContain('فاتح');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/themeToggle.render.test.tsx`
Expected: FAIL — `Failed to resolve import './ThemeToggle'`.

- [ ] **Step 3: Write the component**

Create `src/components/ui/ThemeToggle.tsx`:

```tsx
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Light/dark switch. ONE component used in both places a language switcher
 * lives — the app shell (DesktopFrame) and the landing page — rather than the
 * two separate implementations the language switcher grew.
 *
 * Two states, not three: there is no "system" option, because the theme
 * deliberately ignores `prefers-color-scheme` (see the design spec).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/themeToggle.render.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Mount it in both shells**

In `src/components/DesktopFrame.tsx`, import `ThemeToggle` and render `<ThemeToggle isAr={language !== 'en'} />` immediately after the language button that ends around `:414`.

In `src/landing/LandingView.tsx`, import it and render it beside that view's own language control (the one calling `setLanguage` around `:355`).

- [ ] **Step 6: Verify the whole suite and the build**

Run: `npm run lint && npm test && npx vite build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/ThemeToggle.tsx src/components/ui/themeToggle.render.test.tsx src/components/DesktopFrame.tsx src/landing/LandingView.tsx
git commit -m "feat(theme): one toggle, mounted in the shell and on the landing page"
```

---

### Task 6: Verification

vitest runs no effects and cannot render a browser, so everything below is the only coverage these paths get.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run lint && npx vite build`
Expected: all PASS.

- [ ] **Step 2: No flash on a cold load**

Clear `localStorage`, hard-reload. The first painted frame must be dark — no white flash. Check on a throttled connection, where the gap between HTML and bundle is widest and a missing pre-paint script is obvious.

- [ ] **Step 3: The toggle persists**

Flip to light, reload — still light. Flip to dark, reload — still dark. Confirm `localStorage['mazad.theme']` matches.

- [ ] **Step 4: Adoption on sign-in**

Signed out, choose light. Sign in with an account that has **no** `theme` field. The account adopts light: check `users/{uid}.theme === 'light'` in the console.

- [ ] **Step 5: The server wins over local**

Set `users/{uid}.theme = 'dark'` directly. In a browser whose `localStorage` says `light`, sign in. The app must go **dark** and the doc must stay `dark` — a value set on another device is not overwritten by this browser's.

- [ ] **Step 6: Private mode**

Open a private window (where `localStorage` throws). The app must load dark and the toggle must still work for the session. A blank page here means a `try/catch` is missing.

- [ ] **Step 7: PWA chrome**

Installed / standalone, confirm the system bar matches the theme rather than staying white.

- [ ] **Step 8: MJ's preview pass**

Customer-facing, so it goes through the preview gate before merge. **Say explicitly that most of the app is still light in dark mode** — that is this slice, and it will otherwise read as a broken build.

- [ ] **Step 9: Commit**

```bash
git commit --allow-empty -m "chore(theme): verification pass complete"
```
