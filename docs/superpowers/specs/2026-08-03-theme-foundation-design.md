# Theme foundation: a real light/dark toggle, dark by default

**Date:** 2026-08-03
**Status:** Approved, ready for implementation plan
**Slice:** 1 of 4 (foundation only — see Decomposition)

## Problem

The app has no theme system. Colour is decided at ~2,880 call sites across 124
component files:

| | Count |
|---|---|
| `bg-white` | 370 |
| `text-gray-*` | 1,284 |
| `text-white` | 354 |
| Arbitrary hex (`text-[#666]`, `bg-[#F7F6F3]`) | 1,113 |
| Already-dark surfaces (`bg-black`, `bg-zinc-8/900`) | 87 |
| `dark:` variants | **1** |

`src/index.css` defines semantic tokens in an `@theme` block (`--color-ink`,
`--color-surface`, `--color-orange`), but **only 12 of 124 files use them**. The
rest bypass the layer entirely.

## Decomposition

This is four cycles, not one. **This spec covers slice 1 only.**

1. **Foundation (this spec)** — token layer, provider, persistence, toggle,
   PWA chrome. Machinery only; almost nothing changes visually yet.
2. **The flip** — primitive overrides under `[data-theme="dark"]` **plus** the
   441 known exceptions fixed in the same PR, so a half-inverted app is never
   merged. After this the app is genuinely dark.
3. **The long tail** — migrate 1,113 arbitrary hex values to tokens, surface by
   surface (shell → discover → live room → admin → landing), one preview pass
   each.
4. **A guard** — CI check rejecting new raw hex / `bg-white` in components.

Slice 1 is where every real decision lives; 2–4 are mechanical once it exists.

### Why slice 2 cannot be the whole job

Tailwind v4 emits utilities as variable references — verified against the built
CSS: `.bg-white{background-color:var(--color-white)}`. Overriding `--color-white`
and `--color-gray-*` under `[data-theme="dark"]` therefore flips 1,654 instances
for free.

But that override is **context-blind**, and it breaks three things:

- **354 `text-white`** — mostly labels on orange buttons, which must STAY white.
- **87 already-dark surfaces** — the reels panel, live room and discover cards
  are dark on a light shell today; inverting turns them light, backwards.
- **1,113 arbitrary hex values** — emitted literally, so they never flip.

The free flip covers about half the app and actively breaks 441 places. It is an
accelerator for slice 2, not a substitute for the token migration.

## Scope of slice 1

In:

1. Semantic token layer, defined for both themes.
2. A theme provider that writes `data-theme` on `<html>`.
3. Persistence, mirroring the shipped language pattern.
4. A pre-paint script so the first frame is never the wrong theme.
5. The toggle control.
6. Theme-aware PWA chrome (`theme-color`, iOS status bar).
7. The landing page brought under the token layer (in scope per MJ).

Out:

- Recolouring components. Slice 1 changes almost nothing visually — that is the
  point. Only the 12 files already using tokens will respond.
- The 441 exceptions and the 1,113 hex literals. Slices 2 and 3.

## Token set

Named for **role, not colour** — the whole point is that `surface` means
something in both themes, where `white` cannot.

```
--color-surface           page background
--color-surface-raised    cards, sheets, modals
--color-surface-sunken    inset wells, code/telemetry blocks
--color-border            hairlines and dividers
--color-text-primary      body copy and headings
--color-text-muted        secondary/label copy
--color-text-inverted     copy on a filled accent (stays light in BOTH themes)
--color-accent            the orange; unchanged across themes
--color-accent-weak       tinted accent backgrounds
```

`--color-accent` deliberately does not vary by theme: the orange is the brand
and it carries sufficient contrast on both backgrounds.

`--color-text-inverted` exists specifically for the 354 `text-white` sites in
slice 2. Those are not "white" — they are "the colour that reads on a filled
accent," which is the same in both themes. Naming it correctly here is what stops
slice 2 from darkening every button label.

Light values reproduce today's palette exactly (`--color-surface: #F7F7F7`,
`--color-text-primary: #0A0A0A`, `--color-accent: #F05123`) so slice 1 is a
visual no-op in light mode.

**Dark values ship in slice 1 too**, as a first pass. They have to: with only one
set of values the toggle would change nothing at all, and an unfalsifiable toggle
is not a foundation — there would be no way to tell a working provider from a
broken one. The 12 token-using files responding is the proof the machinery works.

The first-pass dark palette inverts lightness while holding the accent:
`surface #0F0F10`, `surface-raised #17181A`, `surface-sunken #0A0A0B`,
`border #2A2C30`, `text-primary #F2F2F3`, `text-muted #A0A3A8`,
`text-inverted #FFFFFF`, `accent #F05123`, `accent-weak rgba(240,81,35,0.14)`.

These are a starting point, not a finished palette — slice 2 tunes them against
real screens where contrast can actually be judged. Every value here clears 4.5:1
for body text on its own surface, which is the bar that matters before anything
ships.

## Where the theme is applied

`data-theme="dark" | "light"` on `<html>`, with tokens redefined under
`[data-theme="dark"]` in `src/index.css`.

An attribute on the root rather than a class, so it is greppable, settable from
the pre-paint script without touching React, and cannot collide with Tailwind's
own `dark:` variant handling.

`.landing-root` currently hardcodes `background-color: #FFFFFF; color: #0A0A0A`
and is scoped so it "never restyles the app shell." It moves onto
`var(--color-surface)` / `var(--color-text-primary)`. Its two radial-gradient
accents keep their existing rgba orange, which reads on both backgrounds.

## Persistence

Mirrors `src/utils/languagePersistence.ts`, which already solved this exact
problem for language (#201, #209). Same failure modes, same shape — a second,
differently-shaped solution to an identical problem is the thing to avoid.

- `localStorage` key `mazad.theme` holds the choice for signed-out visitors.
- `users/{uid}.theme` holds it for signed-in users and follows them across
  devices.
- On sign-in, a theme chosen while signed out is **adopted** onto the account —
  but must never clobber an existing server value with whatever this browser's
  `localStorage` happens to contain. `shouldAdoptLocalTheme` mirrors
  `shouldAdoptLocalLanguage` exactly.

Pure helpers in `src/utils/themePersistence.ts`: `normalizeTheme`,
`storedDocTheme`, `shouldAdoptLocalTheme`, `persistThemePreference`. Unit-tested
against the same cases the language suite covers.

## Default, and what it does NOT do

**Dark, for everyone, including first visit.** Not `prefers-color-scheme`.

A deliberate decision: MJ asked for dark by default, and following the OS would
make the default unpredictable — some first-time visitors would see light, which
is exactly the inconsistency the request is trying to remove. The OS preference
is ignored entirely; the toggle is the only input.

Recorded because it will look like an oversight later: honouring
`prefers-color-scheme` is a one-line change if that turns out to be wanted.

## First paint

Without intervention the page renders light, then flips to dark once React
mounts — a white flash on every cold load, worst on mobile.

A small blocking script in `<head>`, before any stylesheet, reads
`localStorage.getItem('mazad.theme')` and sets `data-theme` on
`document.documentElement`, defaulting to `dark`. It must be inline and
synchronous; a deferred or module script runs too late.

It is the one place theme logic is duplicated outside the provider. That
duplication is deliberate and commented: it cannot import from the bundle,
because the bundle has not loaded yet.

## PWA chrome

`index.html` hardcodes `<meta name="theme-color" content="#FFFFFF">` and
`apple-mobile-web-app-status-bar-style="default"`, with a comment stating "the
app is light" — the status bar is light with dark text.

Both become theme-aware, or an installed PWA keeps a white system bar above a
dark app. The pre-paint script updates `theme-color`; the iOS status-bar style
switches to `black-translucent` under dark. The stale comment gets corrected.

## Toggle

There are **two** language switchers, not one: the app shell
(`DesktopFrame.tsx:410`) and the landing page's own (`LandingView.tsx`, which
delegates to the context's `setLanguage`). Since the landing page is in scope,
the theme toggle ships in **both**, beside its language sibling and matching its
shape.

One shared `ThemeToggle` component used twice — not two implementations. The
language switcher is currently duplicated in exactly this way, which is why the
landing one had to be pointed back at the context to stay consistent; the theme
toggle starts shared rather than repeating that.

Two explicit states (sun/moon), not a three-way with "system" — there is no
system option, per the default decision above.

## Testing

`vitest` is node-only, but components CAN be executed via `react-dom/server` —
see `adminDashboard.render.test.tsx` and the two render tests added in #221/#222.

Unit:

- `themePersistence.ts` — every case the language suite covers: unknown values
  normalise to the default, an absent doc value yields null, adoption is refused
  when the account already holds a value, and a signed-out session never writes
  to Firestore.
- The pre-paint script's resolution logic, extracted as a pure function and
  tested, even though the inline copy is duplicated. The duplication is what
  makes testing the logic matter.

Render:

- The toggle renders both states and is present in the shell.

Manual (MJ's preview gate — this is customer-facing):

- Cold load with no stored preference shows dark with **no white flash**.
- Toggle flips, survives a reload, and survives sign-in.
- A preference set while signed out is adopted on sign-in and does not overwrite
  a different one already on the account.
- Installed PWA: system bar matches the theme.

## Risks

- **Slice 1 is nearly invisible.** It ships a toggle that changes very little,
  because only 12 files use tokens. That is expected and must not be mistaken
  for a broken build — the app goes dark in slice 2.
- **The pre-paint script is duplicated logic.** Guarded by testing the extracted
  function and by a comment explaining why it cannot import.
- **`localStorage` may be unavailable** (private mode, embedded webviews). Every
  read is wrapped; failure degrades to the dark default rather than throwing
  before first paint, which would render a blank page.
