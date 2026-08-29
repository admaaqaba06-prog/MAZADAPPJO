# Verification — Landing Conversion Redesign

**Status:** IN PROGRESS. Automated checks complete. Rendered review: **two
defects found, both fixed and verified; viewport pass complete (Codex)**; some
network/data/auth states remain unobserved. Owner approvals **pending**. This
document must not be read as a sign-off.

**Who observed what.** Rows are attributed: **(Codex)** — observed independently
at true viewports with controllable browser tooling; **(Claude, 1440)** —
observed in this session, which could only reach 1440; **(derived)** /
**(deterministic)** — not observed, closed by a mutation-verified proof that says
so. Of 54 matrix rows: 29 PASS, 10 PARTIAL, 10 PENDING, 0 FAIL.

**Branch:** `feat/landing-conversion-redesign`
**Commit under verification:** `7ad63a1db63851624a46691516d7b83aa63c01db`
**Uncommitted on top:** the D1 header fix (§4.1.1), the D2 scroll fix (§4.1.2)
and this document. §1 figures were captured on `7ad63a1`; §1.1 records the
re-run including both fixes.
**Date of this run:** 2026-08-27
**Spec:** `docs/superpowers/specs/2026-08-27-landing-conversion-redesign-design.md`
**Plan:** `docs/superpowers/plans/2026-08-27-landing-conversion-redesign.md`

**Environment:** node v25.7.0, npm 11.10.1, vitest 2.1.9, vite 6.4.3, darwin
25.6.0. Run from the isolated worktree
`/Users/mj/code/mazadjo/.worktrees/landing-conversion-redesign`.

> Every result below was produced by running the stated command on the stated
> commit. Nothing in this file is inferred, and the sections marked PENDING
> contain no results because none have been observed.

---

## 1. Static checks and full test suite

All three commands exit 0.

| Command | Exit | Result |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | 0 | No diagnostics; no output |
| `npm test` (`vitest run`) | 0 | **200 test files, 2976 tests, all passed** — 8.06s |
| `npm run build` (`vite build`) | 0 | Built in 3.41s; `dist/` 3.2 MB |

### Landing-suite breakdown

`npx vitest run src/landing` — 11 files, 253 tests:

| File | Tests |
|---|---|
| `useLandingAuctions.test.ts` | 43 |
| `components/landingAuctionShowcase.render.test.tsx` | 43 |
| `LandingView.render.test.tsx` | 34 |
| `components/landingEducation.render.test.tsx` | 29 |
| `components/landingClosing.render.test.tsx` | 26 |
| `components/landingHero.render.test.tsx` | 23 |
| `landingSectionNav.wiring.test.ts` | 16 |
| `landingContent.test.ts` | 13 |
| `landingAnalytics.test.ts` | 12 |
| `logoTheme.wiring.test.ts` | 9 |
| `landingRootOverflow.wiring.test.ts` | 5 |

### Build summary — landing-relevant assets

| Asset | Raw | Gzip |
|---|---|---|
| `LandingView-CTon6NtS.js` | 49.47 kB | 13.02 kB |
| `motion-VEelL21a.js` (shared) | 148.96 kB | 49.67 kB |
| `index-g23vz6KG.css` (whole app) | 163.55 kB | 24.07 kB |
| `index-CEL2xQJm.js` (app shell) | 539.59 kB | 157.97 kB |

**Bundle change for the landing chunk:** 118.77 kB → 49.47 kB raw
(29.46 kB → 13.02 kB gzipped), a 58% reduction. No dependency was added; the
redesign uses the existing `motion` and `lucide-react` packages.

### 1.1 Re-run including the D1 header fix (uncommitted)

Same three commands, re-run after the §4.1.1 fix. All exit 0.

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | No diagnostics |
| `npm test` | 0 | **201 files, 3001 tests passed** |
| `npm run build` | 0 | Built in 3.38s |

Landing suite: 12 files, **278 tests** (was 253 on `7ad63a1`). The D1 block added
7; the D2 retarget of `landingSectionNav.wiring.test.ts` replaced 16 assertions
with 15 covering the narrower contract (net −1, all 15 mutation-verified,
§4.1.2); and the deterministic closures for rows 2/3/3b and 23 added 7 more
(§4.1.4); and `landingImageFallback.render.test.tsx` added 12 more, closing
row 20 (§4.1.5).

Bundle across both fixes. D1 added an icon import and a media query; D2 **removed**
~71 lines of scroll machinery, which more than paid for it:

| Asset | `7ad63a1` | After D1 | After D2 (current) |
|---|---|---|---|
| `LandingView…js` | 49.47 kB (13.02 gzip) | 49.80 kB (13.12 gzip) | **48.68 kB (12.63 gzip)** |
| `index…css` | 163.55 kB (24.07 gzip) | 164.05 kB (24.18 gzip) | **164.11 kB (24.20 gzip)** |

`LandingView.tsx` is **244 lines**, down from 315 at `7ad63a1` and 3,086 before
the redesign.

The scroll-margin rule is present in the built CSS:
`.landing-root section[id]{scroll-margin-top:5rem}` — `calc(4rem + 1rem)` folded
by the minifier.

---

## 2. Known pre-existing warnings

Both warnings below are reproduced on this commit AND predate this branch.
Neither was introduced by the redesign, and neither is treated as resolved here.

### 2.1 `--localstorage-file` (test run, 3 occurrences)

```
(node:19383) Warning: `--localstorage-file` was provided without a valid path
(Use `node --trace-warnings ...` to show where the warning was created)
```

Emitted by the vitest worker process, not by repository code. Evidence: the flag
appears nowhere in `package.json`, `vitest.config.ts`, `src/`, or the
environment (`env | grep -i node_options` is empty). It is an artefact of node
v25 + vitest worker startup. Cosmetic; no test is affected.

### 2.2 Firebase static/dynamic import mixing (build)

```
(!) src/services/firebase.ts is dynamically imported by … but also statically
imported by … dynamic import will not move module into another chunk.
```

Pre-existing. `src/landing/useLandingAuctions.ts` is one of the ~30 static
importers listed, and that import arrived on `main` in commit `923e15e`
("fix(landing): show the 147 live lots the marketplace was hiding", #231),
before this branch existed. None of the components added by this redesign
imports firebase at all — verified by
`grep -ln "services/firebase" src/landing/components/*.tsx src/landing/landingContent.ts`,
which matches nothing. Out of scope for this work.

---

## 3. Analytics observability — **NOT LIVE**

**Finding: landing analytics events are emitted to nothing. `window.dataLayer`
is never created anywhere in the application, so every landing event is
silently discarded in production.**

This is a stronger finding than "no consumer is attached". There is no array to
push to.

### Evidence

`emitLandingEvent` (`src/landing/landingAnalytics.ts`) pushes only when the array
already exists:

```ts
const w = window as any;
if (Array.isArray(w.dataLayer)) {
  w.dataLayer.push(payload);
}
```

Searching the whole repository (excluding `node_modules` and `dist`) for
`dataLayer` returns **only** `landingAnalytics.ts` itself and three test files
that create the array as a stub. No source file, and no line of `index.html`,
ever assigns `window.dataLayer`.

`index.html` contains exactly three `<script>` elements, none of them analytics:

| Line | Purpose |
|---|---|
| 30 | Pre-paint theme boot (`data-theme`, `theme-color`) |
| 102 | `application/ld+json` structured data |
| 234 | `<script type="module" src="/src/main.tsx">` — the app entry |

There is no Google Tag Manager container, no `gtag.js`, no GA4 measurement id,
and no Segment snippet: `grep -n "gtag\|googletagmanager\|google-analytics\|segment\|GTM-\|UA-" index.html`
returns nothing.

Confirmed at runtime against the dev server on this commit:
`curl -s http://localhost:3000/ | grep -c dataLayer` → **0**.

### What this does and does not mean

- The failure mode is **safe**: `emitLandingEvent` is wrapped in `try/catch`, the
  array check is a guard, and `LandingView` emits before it navigates. A missing
  `dataLayer` cannot break the page or block a CTA. This is covered by
  `landingAnalytics.test.ts` (throwing `push`, non-array value, throwing getter)
  and by `LandingView.render.test.tsx` ("survives an analytics failure without
  blocking navigation").
- The consequence is that **none of the spec's core evaluation metrics can be
  computed today** — landing-to-browse CTR, landing-to-auction-view rate, and
  conversion by language / viewport / placement all depend on these events
  reaching a destination.
- The app's own `src/services/analyticsService.ts` writes to the Firestore
  collection `analytics_events`, but it is deliberately **not** used here: the
  landing page serves unauthenticated visitors, and `firestore.rules` requires
  `isSignedIn()` for that collection. That separation is intentional and
  documented in `landingAnalytics.ts`; it is not the gap.

### Launch dependency (owner action required)

**Attaching an analytics destination is a launch blocker for measurement, not a
code defect in this redesign.** Required before launch:

1. Decide the destination (GTM container, GA4, or another consumer).
2. Initialise `window.dataLayer` before the app entry script in `index.html`.
3. Re-verify in a browser that a real page view and a real Browse click appear
   in the destination — not merely in the array.

Until step 3 is observed, **no claim that landing measurement is live may be
made.**

---

## 4. Rendered review matrix — **PENDING**

**Not yet performed. No visual result in this section has been observed, and
none is recorded.** The dev server is running (§6) for a Codex browser review.

Each row must be marked PASS or FAIL with the observed behaviour. A FAIL is
fixed in the owning task's file and given a regression test before the review
continues, per the plan.

### 4.1 Viewport × direction × theme

Widths required by the spec: **320, 375/390, 768, 1024, 1440**.

**Attribution.** Every row names who observed it. **(Codex)** rows were observed
independently at true viewports using controllable browser tooling. **(Claude)**
rows were observed in this session at 1440, the only width reachable here.
**(derived)** rows were not observed at all and say so, with the proof that makes
them follow. Nothing in this table is inferred from a screenshot of another size.

| # | Width | Direction | Theme | Result | Observation |
|---|---|---|---|---|---|
| 1 | 320 | AR / RTL | light | **PASS (Codex)** | 320x700, true viewport: `clientWidth 320`, `scrollWidth 320` (no overflow, nothing clipped), and logo, theme, language and menu all visible and accessible |
| 2 | 320 | AR / RTL | dark | **PASS (derived)** | Not separately observed. Proven to follow from row 1: the header carries no theme-conditional layout class, asserted and mutation-verified (§4.1.4) |
| 3 | 320 | EN / LTR | light | **PASS (derived)** | As row 2, plus the language control is a fixed-size icon below `xs`, so the budget cannot depend on label length (§4.1.4) |
| 3b | 320 | EN / LTR | dark | **PASS (derived)** | Both arguments above apply |
| 3c | 375 | AR / RTL | light | **PARTIAL (Codex)** | Overflow confirmed at this width (`clientWidth == scrollWidth`). This particular direction/theme cell was not separately rendered; the observed 375 cell was EN/LTR dark, row 3d |
| 3d | 375 | EN / LTR | dark | **PASS (Codex)** | 375x812. Logo and the support/theme/language/menu controls all visible; hero hierarchy and **both CTAs** rendered correctly; the featured card stayed within width |
| 4 | 390 | AR / RTL | light | **PARTIAL (Codex)** | Overflow confirmed at 390 (`clientWidth == scrollWidth`); this cell not separately rendered |
| 5 | 390 | AR / RTL | dark | **PARTIAL (Codex)** | As row 4 |
| 6 | 390 | EN / LTR | light | **PARTIAL (Codex)** | As row 4 |
| 7 | 390 | EN / LTR | dark | **PARTIAL (Codex)** | As row 4 |
| 8 | 768 | AR / RTL | light | **PASS (Codex)** | 768x900. Header controls and CTA visible; centred hero and lead card rendered with **no overlap and no overflow** |
| 9 | 768 | EN / LTR | dark | **PARTIAL (Codex)** | Overflow confirmed at 768; this cell not separately rendered |
| 10 | 1024 | AR / RTL | light | **PARTIAL (Codex)** | Overflow confirmed at 1024; this cell not separately rendered |
| 11 | 1024 | EN / LTR | dark | **PASS (Codex)** | 1024x800. Desktop navigation visible; two-column hero/card layout rendered cleanly; `clientWidth == scrollWidth == 1024` |
| 12 | 1440 | AR / RTL | light | **PASS (Claude, corroborated by Codex)** | Screenshot captured. `scrollWidth 1440 == clientWidth 1440` (no overflow). Logo right-aligned, Browse filled and ahead of Sell, `--color-surface: #FDF7F2` |
| 13 | 1440 | AR / RTL | dark | **PASS (Claude, corroborated by Codex)** | `body` background `rgb(15,15,16)`; `--color-surface: #0F0F10` (cream correctly NOT applied); logo swaps to `/logo-mazzado.png`; no overflow |
| 14 | 1440 | EN / LTR | light | **PASS (Claude, corroborated by Codex)** | `dir=ltr`, `lang=en`, h1 "Find your deal and start the auction yourself"; logo `/logo-mazzado-light.png`; no overflow |
| 15 | 1440 | EN / LTR | dark | **PASS (Claude, corroborated by Codex)** | Observed during the toggle sequence; no overflow |

### 4.1.1 Defect D1 — header controls clipped at 320px (FIXED, re-review pending)

**Reported by:** Codex browser review, 320x700, Arabic RTL.

**Observed:** the header clipped the language control at the inline (left) edge
and the mobile menu button was entirely off-screen and unavailable.
`documentElement.scrollWidth` remained 320, so the controls were being **clipped
rather than creating scroll**.

**Severity:** high. Below `lg` the menu button is the only route to the section
links and the Browse CTA, so an unreachable button strands the whole mobile
navigation — and 320px is a width the spec requires.

**Root cause, measured rather than guessed.** The MAZZADO lockup
(`public/logo-mazzado.png`) is **600x127**, an aspect ratio of 4.72:1, so at
`h-8` it renders **151px wide**. At 320px with `px-4` the header row has 288px:

| Item | Width |
|---|---|
| Lockup at `h-8` | 151 px |
| Gap (`gap-3`) | 12 px |
| Theme control | ~36 px |
| Gap (`gap-2`) | 8 px |
| Language control (text "English", 11px bold) | ~60 px |
| Gap (`gap-2`) | 8 px |
| Menu button (`h-9 w-9`) | 36 px |
| **Required** | **~311 px** |
| **Available (320 − 2×16)** | **288 px** |

The row overflowed by roughly 23px, and because the landing root carries
`overflow-x-clip` — correct, and load-bearing for the separate second-scroller
fix — the overflow was clipped instead of scrolled. That is exactly why
`scrollWidth` stayed 320: `clip` produces no scrollable overflow.

A contributing cause: **Tailwind's smallest default breakpoint is `sm` at
640px**, so there was no way to treat a 320px screen differently from a 480px
one. No `xs` breakpoint was defined in the project.

**Fix** (`src/index.css`, `components/LandingHeader.tsx`, `components/Logo.tsx`):

1. **Defined `--breakpoint-xs: 360px`.** 360 rather than 384 so that **375 and
   390 keep the layout they already had**. Verified to compile: the built CSS
   contains `@media(min-width:360px){.xs\:hidden{display:none}.xs\:inline{display:inline}…}`.
2. **The brand is the only shrinkable item.** The control cluster is now
   `shrink-0` and the brand button is `min-w-0`, so the flex algorithm can only
   take width from the lockup — a control can never be pushed out. This is
   width-independent and holds at viewports nobody tested.
3. **The lockup is capped below `xs`** (`max-w-[132px] xs:max-w-none`), and
   `Logo`'s img gained `max-w-full` so `object-contain` scales the artwork inside
   the cap instead of overflowing it. Never distorted, never cropped.
4. **The language control collapses to an icon below `xs`**, keeping
   `aria-label`/`title` from the reviewed copy at every width, so it is never an
   unnamed button. This is the largest single saving (~24px).
5. **Padding and gaps tighten below `xs`** (`px-3 xs:px-4`, `gap-2 xs:gap-3`,
   `gap-1.5 xs:gap-2`).

Recomputed at 320px with `px-3` (296px available): 132 + 8 + (36 + 6 + 36 + 6 +
36) = **260px**, leaving ~36px of slack.

**Support control:** deliberately left `hidden sm:inline-flex`. Making it visible
below `sm` fitted at 320px but pushed **360–639px into overflow**, which are the
widths this fix must preserve. Below `sm` the support route is the mobile panel,
which renders it as a full-width link and is now reachable because the button
that opens it is no longer off-screen. **Flagged for Codex confirmation** — the
alternative is showing support at every width, which would change 390px.

**Regression test:** `components/landingHero.render.test.tsx` → "the header fits
a 320px screen", 7 assertions. Layout cannot be measured under
`environment: 'node'`, so these pin the structural invariants that make the
overflow impossible. Each was mutation-verified — reverting any one mechanism
fails exactly one test:

| Mutation | Test that fails |
|---|---|
| Remove `--breakpoint-xs` | "defines every responsive variant it uses" |
| Make the control cluster shrinkable | "lets the brand give up width, and nothing else" |
| Drop `max-w-full` from the logo img | "caps the lockup below xs and lets it scale…" |
| Hide the menu button below `sm` | "keeps the menu button present at every width" |

The first is the most valuable: an **undefined** Tailwind variant emits no CSS at
all, so without it every `xs:` class would silently do nothing while the source
still looked correct.

**Still required:** browser re-review at 320x700 in both directions and both
themes, plus confirmation that 375 and 390 are unchanged.

### 4.1.2 Defect D2 — a suppressed smooth scroll turned a section link into a dead link (FIXED, verified)

**Found:** browser re-review, 1440px, Arabic RTL, on commit `7ad63a1` plus the D1 fix.

**Observed:** clicking a header section link updates the hash (`location.hash`
becomes `#how`) but **`window.scrollY` stays 0** — the page does not move. The
link is therefore inert: it changes the URL and nothing else. Reproduced on
`#how` and `#trust`.

**Root cause, isolated by a control experiment.** `window.scrollTo` was measured
three ways on the landing page:

| Call | Result |
|---|---|
| `window.scrollTo({top: 500, behavior: 'instant'})` | scrollY **500** — works |
| `window.scrollTo({top: 800, behavior: 'smooth'})` | scrollY **0** — no-op |
| `element.scrollIntoView({behavior: 'instant'})` | scrollY **2056.5** — works |

Then the same three calls on a **bare same-origin page** containing a single
6000px `<div>` and none of the application's code, CSS or React:

| Call | Result |
|---|---|
| `behavior: 'instant'` | scrollY **900** — works |
| `behavior: 'smooth'` | scrollY **0** — no-op |

**So smooth scrolling is suppressed browser-wide in this environment, not by the
application.** `scroll-behavior` computes to `auto` on both `html` and `body`,
and `prefers-reduced-motion` is `false`, so this is a browser/profile-level
condition (a disabled smooth-scrolling flag or the automation context).

**Why this is still a real defect, and not merely an environment note.**
`scrollToSection` calls `window.scrollTo({behavior: 'smooth'})`, returns `true`
unconditionally, and the delegated handler then calls `e.preventDefault()`. So
wherever smooth scroll is unavailable — this profile, a hardened browser, a
future policy — the handler **suppresses the native fragment jump and replaces it
with nothing**. The pre-redesign behaviour was a jump to the wrong offset; the
current behaviour is no navigation at all, which is worse.

The offset logic itself is sound and was independently confirmed: the header
measured `position: sticky`, height 65px, which is exactly the branch the Task 6
`headerOverlap` fix takes (treating `overflow-x: clip` as NOT establishing a
scrollport). The computed target was correct; only the animation failed to run.

**Recommended fix — delete the JavaScript rather than patch it.** Put
`scroll-margin-top` on each anchored section and let the browser's own fragment
navigation do the work:

- it lands the section below the sticky header with no measurement,
- Back/Forward work natively,
- it cannot ever produce a dead link, because there is no `preventDefault()`,
- it honours the user's `scroll-behavior` and reduced-motion preference,
- and it removes `headerOverlap`, `scrollToSection`, `onRootClick` and
  `SECTION_TOP_GAP` — roughly 60 lines including the two bugs already found in
  that code during Task 6.

The header is `h-16` (64px) by design, so `scroll-margin-top: 80px`
(64 + the 16px gap) is derived from a known constant rather than a measurement.
The affected wiring assertions in `landingSectionNav.wiring.test.ts` would be
retargeted from "the handler measures the header" to "every anchored section
reserves scroll margin clearing the header" — a narrower and more durable
contract.

**Fix, as recommended and approved.** The JavaScript is deleted, not patched.
`LandingView.tsx` loses `headerOverlap`, `scrollToSection`, `onRootClick`,
`SECTION_TOP_GAP` and its root `ref`/`onClick` — 315 lines down to **244**. The
offset now comes from one CSS rule:

```css
.landing-root section[id] {
  scroll-margin-top: calc(4rem + 1rem);   /* header h-16 + 1rem gap */
}
```

`section[id]` rather than a list of ids, so a section added later is covered with
nothing to remember — the same structural-instead-of-per-instance reasoning that
the delegated handler applied to links, taken one step further.

**Verified in the browser, in the same profile where smooth scroll is
suppressed** — which is what proves the dependency is gone:

| Link | scrollY before fix | scrollY after | Section top | Clears header |
|---|---|---|---|---|
| `#how` | 0 | **2013** | 80px | yes (15px gap) |
| `#trust` | 0 | **2660** | 80px | yes (15px gap) |
| `#pricing` | 0 | **3893** | 80px | yes (15px gap) |

Computed `scroll-margin-top` reads `80px`; the header measures 65px, leaving a
15px gap. Every section lands at exactly 80px from the viewport top.

**Back/Forward, now native and no longer a `pushState` call:**
`#pricing` → back → `#trust` (scrollY 2660) → back → `#how` → forward →
`#trust` (scrollY 2660). Scroll positions are restored by the browser.

**Regression coverage** — `landingSectionNav.wiring.test.ts`, retargeted from
"the handler measures the header" to the narrower, more durable contract. Each
assertion was mutation-verified:

| Mutation | Test that fails |
|---|---|
| Delete the `scroll-margin-top` rule | "reserves scroll margin on every anchored section" (+ the header-clearance test) |
| Move an anchor id from its `<section>` onto a `<div>` | "puts every anchor target on a `<section>`, which is what the rule selects" |
| Change the header from `h-16` to `h-20` | "clears the header height with room to spare" |
| Reintroduce `preventDefault` + `window.scrollTo` in the shell | "never calls preventDefault on a navigation" and "runs no scroll machinery of its own" |

The third is worth noting: the CSS constant and the header height are two numbers
that must agree, so the test asserts the header is still `h-16` and names the
file to update. The fourth is the D2 guarantee itself — the shell can never again
suppress a navigation it then fails to perform.

### 4.1.3 Why the viewport pass was performed by a second reviewer

`resize_window` reported success but had **no effect on the viewport**, at three
different sizes:

| Requested | Measured `window.innerWidth` |
|---|---|
| 320 x 700 | 1440 |
| 320 x 700 (retry) | 1440 (`window.outerWidth` read 0) |
| 800 x 700 | 1440 (height became 813, not 700) |

The browser window appears to be maximised, and the automation tool cannot
resize it. Because Tailwind's `xs` variant is a **viewport** media query, the
below-360px styles cannot be exercised at an `innerWidth` of 1440, and no
container-width trick would exercise them either — it would test the wrong style
set and produce a misleading PASS.

**No 320px visual result is recorded, and none was inferred.** What WAS
established in the browser, and is real:

| Fact | Measured value |
|---|---|
| Lockup rendered width at `h-8` | **151.2px** — confirms the D1 arithmetic exactly |
| Language control width with its text label | **62.9px** — 3px MORE than the estimate in D1, so the row was even tighter than calculated |
| Support link width | 36px |
| Brand button `flex-shrink` | **1** (it yields) |
| Control cluster `flex-shrink` | **0** (it does not) |
| Brand button `min-width` | **0px** |
| Logo img `max-width` | **100%** (the cap can take effect) |
| `--breakpoint-xs` served by the dev server | **360px** |

So all four fix mechanisms are confirmed *present and live in the browser*; only
their effect at a sub-360px viewport is unobserved.

**Closed by Codex, which has controllable viewport tooling.** The whole viewport
pass was performed independently. What it observed:

| Viewport | Direction / theme | Observed |
|---|---|---|
| 320 x 700 | AR / RTL light | `clientWidth == scrollWidth == 320`; logo, theme, language and menu all visible and accessible |
| 375 x 812 | EN / LTR dark | Logo and the support/theme/language/menu controls visible; hero hierarchy and both CTAs correct; featured card within width |
| 768 x 900 | AR / RTL light | Header controls and CTA visible; centred hero and lead card, no overlap, no overflow |
| 1024 x 800 | EN / LTR dark | Desktop navigation visible; two-column hero/card layout clean; `clientWidth == scrollWidth == 1024` |
| 375, 390, 768, 1024, 1440 | — | `clientWidth == scrollWidth` exactly, no horizontal overflow at any of them |

That closes the D1 defect at its own width and closes row 24 across the whole
required range. It does NOT close every cell: the observations cover four
specific direction/theme combinations, and the remaining cells are marked
PARTIAL rather than promoted, because overflow being correct at a width is not
the same as having rendered that width in that direction and theme.

### 4.1.4 Rows closed deterministically, without a viewport or an OS setting

Three matrix rows were closed by proving a property of the code rather than by
observing a pixel. Each assertion is mutation-verified, so it fails if the
property stops holding.

**Rows 2, 3 and 3b — the other three 320px cells.** Row 1 was confirmed by Codex
at a true 320x700 viewport in Arabic RTL light. Rather than assume the remaining
three follow, the header is asserted to carry:

- **no theme-conditional layout class** — no `dark:` variant on any width,
  padding, gap, margin, flex or display utility, so the dark header is the same
  size as the light one;
- **no direction-conditional class** — no `rtl:`/`ltr:` variants at all. The
  header uses logical properties (`ms-auto`, `start-3`, `px-`), which are
  direction-aware *without* a variant and therefore identical in extent;
- **a language-independent control width** — below `xs` the language control is
  a fixed `h-9 w-9` icon button, so the narrow-width budget cannot depend on
  whether the label reads "English" (62.9px measured) or "العربية".

Together these mean no theme and no direction can change what fits in the row, so
row 1's result is the result for all four. Mutation-verified: adding
`dark:px-8`, or `rtl:gap-4`, fails.

**Row 23 — reduced motion.** The OS setting cannot be changed from here, so the
stylesheet is checked instead: every `.landing-*` rule that carries an
`animation` is disabled inside `@media (prefers-reduced-motion: reduce)`, and the
hero's entrance is gated on `useReducedMotion` rendering its final state
directly. Mutation-verified: adding an animated `.landing-*` class with no
reduced-motion escape fails, naming the class.

### 4.1.5 Row 20 — the coverage gap, and how it was closed

The image fallback has two entry conditions and they were not equally covered:

| Branch | Before | Now |
|---|---|---|
| `!auction.imageUrl` — the lot has no image at all | covered | covered |
| `onError` — a URL exists but the load fails | **nothing** | **covered** |

**Why it was hard.** `renderToStaticMarkup` runs no effects and dispatches no
events, and vitest here is `environment: 'node'` — no jsdom, no browser, and
none may be installed. A browser attempt also failed, for a reason worth
recording: the Vite dev server answers unknown paths with **`200 text/html`**
(its SPA fallback), so an image request against it never 404s.

**How it is reached without a DOM.** An event is not the only way to reach an
event handler. `onError` is a plain function sitting on a React element, and
React elements are inspectable objects:

1. `LandingAuctionCard` uses no hooks of its own, so it is called directly as a
   function to obtain its element tree.
2. The `<CardImage>` element is located in that tree.
3. It is called in turn with `React.useState` temporarily stubbed (restored in a
   `finally`), which yields the real `<img>` element carrying the real handler.
4. **That handler is invoked**, and the effect on the state is asserted.

This exercises the production handler on the production element. It does not
prove the browser fires `error` at that handler — that is React's contract for
`onError` on an `<img>`, not this component's — and the fallback's visual
appearance still belongs to the viewport pass.

**Mutation-verified, six ways.** Each mutation fails exactly the assertion that
should catch it:

| Mutation | Test that fails |
|---|---|
| Remove `onError` from the card img | "attaches an error handler" + "the error handler marks the image failed" |
| Keep `onError` but make it a no-op | **"the error handler marks the image failed"** |
| Drop `\|\| failed` from the fallback condition | "the failed state renders the branded fallback" + the accessible-name test |
| Remove the fallback's `aria-label` | "gives the fallback an accessible name" |
| Remove the fallback's `aspect-[4/3]` | "keeps the fallback the same size as the image it replaces" |
| Make the hero's `onError` a no-op | "the hero image carries the same wiring" |

The second is the one that justifies the whole approach: a handler that exists
but does nothing passes every source-level and markup-level check, and is caught
only by invoking it.

**Hero scope, stated plainly.** `LandingHero` calls `useReducedMotion`, whose own
hooks would have to be stubbed to call it directly — a deeper patch than the
behaviour warrants. Its image is the same shape as the card's, so its wiring is
pinned at the source while the CARD's identical path is the one exercised
behaviourally. The card is also the higher-traffic case: eight instances per page
against the hero's one.

### 4.2 Data and environment states

| # | State | How to reach it | Result | Observation |
|---|---|---|---|---|
| 16 | Real populated inventory | Default load against live Firestore | **PASS** (Claude, 1440) | 8 real cards + 1 hero lot from `firebasestorage.googleapis.com`; all 8 card images loaded (`naturalWidth > 0`), 0 broken |
| 17 | Loading skeleton | Throttle network; observe first paint | PENDING | Not captured — the local fetch resolves too fast to observe without throttling |
| 18 | Empty catalogue | No live lots returned by curation | PENDING | Requires forcing an empty result |
| 19 | Fetch error | Block the Firestore request | PENDING | Requires blocking the request |
| 20 | Missing image | Lot with no `thumbnailUrl`/`mediaUrls`, or a 404 URL | **PASS (deterministic)** | Both branches now covered. The **no-URL** branch by the card and hero render tests; the **load-failure (`onError`)** branch by `landingImageFallback.render.test.tsx`, which invokes the real handler on the real element and asserts it marks the image failed, that the failed state swaps in the fallback, that the fallback keeps an accessible name, and that it preserves the aspect ratio so a 404 cannot reflow the strip. Six mutations verified (§4.1.5). Visual appearance of the fallback remains for the viewport pass |
| 21 | Long mixed AR/EN title | Lot whose title mixes scripts and wraps | **PASS (real data)** | Hero lot is "Braided sterling silver box chain bracelet with black textile cord Size:17" — a full English title inside the Arabic RTL page; wraps to 2 lines, no overflow |
| 22 | Unusually large JOD price | Six-figure `currentPrice` | **PARTIAL** | The formatter is pure and was exercised directly: 10 / 1,200 / 45,000 / 320,000 / 1,250,000 all group correctly. Cards carry `tabular-nums` and the title is `line-clamp-2`. Visual wrapping at a six-figure price still needs a real lot or a narrow viewport |
| 23 | Reduced motion | OS "reduce motion" enabled | **PASS (deterministic)** | Verified against the stylesheet instead of an OS setting: every `.landing-*` rule carrying an `animation` is disabled inside `@media (prefers-reduced-motion: reduce)`, and the hero's entrance is gated on `useReducedMotion` returning its final state. Mutation-verified — adding an ungated animation fails the test (§4.1.4) |
| 24 | No horizontal overflow | Both directions, every width above | **PASS at every required width** | `clientWidth == scrollWidth` exactly, with no horizontal overflow, at **320 (Codex)**, **375, 390, 768, 1024 (Codex)** and **1440 (Claude, corroborated by Codex)**. This is the row the D1 defect broke — at 320 the controls were clipped rather than scrolling, so `scrollWidth` read 320 while content sat outside it; the equality now holds because nothing overflows |
| 25 | Keyboard-only traversal | Tab through header → sections → FAQ → footer | **PASS** (Claude, 1440) | 41 focusable controls, **zero positive `tabindex`** anywhere, so tab order is DOM order. Real `Tab` keypresses moved focus through the page |
| 26 | Visible focus on every control | Same pass as 25 | **PASS, with one caveat** (Claude, 1440) | Under **real keyboard** focus a control matched `:focus-visible` and rendered a **solid 2px outline**. (A scripted `.focus()` reports `outline-style: none` — Chrome only matches `:focus-visible` on genuine keyboard interaction, so scripted measurement is a false negative and was discarded.) **Caveat:** one reading showed the ring falling back to `currentColor` (near-black) rather than the accent on a FAQ control, while a pricing control measured the accent `rgb(240,81,35)` correctly. `focus-visible:outline-accent` IS emitted in the built CSS. Not reproduced; **ring visibility is confirmed, ring colour is not** — flagged for the visual review |

### 4.3 Specific points to confirm

Carried forward from the task reports, each unverified in a browser:

| # | Item | Result |
|---|---|---|
| 27 | A clockless first-bid lot shows **no** countdown, and shows the first-bid explanation | **PASS (real data)** — `[data-card-clock]` count is **0** across the whole page, and 8 first-bid badges render. The entire live catalogue is clockless `first_bid` inventory, so this is the real launch state, not a fixture |
| 28 | Section links land the heading **below** the sticky header | **PASS** (Claude, 1440) — after the D2 fix (§4.1.2). All three tested links scroll (2013 / 2660 / 3893) and land the section at exactly 80px, clearing the 65px sticky header by 15px. Back/Forward verified native |
| 29 | Warm cream ground is visible in light mode and dark mode is unaffected | **PASS** (Claude, 1440) — light: `--color-surface: #FDF7F2`, shell paints `rgb(253,247,242)`; dark: `--color-surface: #0F0F10`. The `html:not([data-theme='dark'])` guard works in both directions |
| 30 | Explainer lead card (`md:col-span-2`) reads correctly at 768 | **PENDING** — 768 was rendered without overlap or overflow (row 8, Codex), but that report describes the HERO and its card. The explainer's full-width lead step is a different element and was not called out, so this is not promoted on an ambiguous reading |
| 31 | Pricing badge (`-top-3`) is not clipped at 320 | **PENDING** — 320 showed no overflow (row 1), but a negatively-offset badge can be clipped by an ancestor without affecting document width, so overflow evidence does not settle it |
| 32 | FAQ focus ring is not clipped by its `overflow-hidden` container | **PASS** (Claude, 1440) — the control uses `focus-visible:-outline-offset-2`, a NEGATIVE offset, so the ring is drawn inside its own box and `overflow-hidden` on the frame cannot clip it. Measured inset from the frame is 1px on both sides |
| 33 | Footer three-column grid collapses correctly at 768 | **PENDING** — not called out in the 768 report, which described the header and hero |
| 34 | Mobile menu opens/closes, closes after navigation, and its links are unfocusable when closed | **PARTIAL** — the unfocusable-when-closed half is confirmed: the panel is present with the `hidden` attribute, `offsetParent` is `null`, and **0 of its 7 controls are focusable**. Open/close and close-after-navigation need a viewport below `lg` |
| 35 | Phone number renders LTR inside RTL copy (`unicode-bidi: plaintext`) | **PASS** (Claude, 1440) — computed `unicode-bidi: plaintext` on the phone span inside a `direction: rtl` context; text `0785168550`, href `tel:+962785168550` |
| 35a | Single document scroll owner | **PASS** (Claude, 1440) — `document.scrollingElement` is `HTML`; the root reads `overflow-x: clip / overflow-y: visible` and every ancestor of a section is non-scrollable (`scrollHeight == clientHeight`). The second-scroller fix holds |
| 35b | FAQ opens exactly one answer at a time | **PASS** (Claude, 1440) — 1 control `aria-expanded="true"`, 5 `false`, 5 panels carrying `hidden` |
| 35c | Card images lazy-load | **PASS** (Claude, 1440) — all 8 card images `loading="lazy"`; the hero image is `eager` and loaded (1000x1000) |
| 35d | Exactly one `h1` on the page | **PASS** (Claude, 1440) — `document.querySelectorAll('h1').length === 1` |

### 4.4 Conversion path (plan Step 4) — PENDING

| # | Assertion | Result |
|---|---|---|
| 36 | Hero Browse opens discovery | PENDING |
| 37 | A real auction card opens **that exact** auction | PENDING |
| 38 | Seller CTAs open the upload/auth path | PENDING |
| 39 | Subscribe opens the subscription screen (`wallet` → `SubscriptionView`) | PENDING |
| 40 | Language choice persists through refresh and into authentication | **PASS through refresh; authentication PENDING** — full cycle observed: first visit with `mazad_language` absent renders `dir=rtl / lang=ar`; toggling stores `'en'` and flips to `ltr/en`; **after a reload the page still renders English LTR** with the English h1. Continuity into authentication requires signing in and is not exercised (no production data touched) |
| 41 | Rules, terms, privacy, WhatsApp, phone and Instagram reach the intended surfaces | **PARTIAL** — targets verified by reading hrefs, deliberately WITHOUT clicking (a click would navigate off-site). Exactly three distinct external targets, all from the constants: `https://wa.me/962785168550`, `tel:+962785168550`, `https://www.instagram.com/mazzadoofficial`. **Zero** `target="_blank"` links missing `rel="noopener noreferrer"`. Three `[data-legal-action]` buttons present. Opening the modals not exercised |
| 42 | No unverified scale number, testimonial, bidder count or adopter identity is rendered | **PASS** (Claude, 1440) — the rendered `document.body.innerText` of the whole page was scanned for `15,000`, `1,250`, `3,400`, `Early Adopters`, `المنضمين الأوائل`, `watching`, `مشاهد الآن`, `Rolex`, `Toyota`, `Camry`. **Zero matches.** This tests the DOM a visitor actually receives, not the source |

Note on 37 and 39: both are covered behaviourally by
`LandingView.render.test.tsx` (exact-id routing; `onEnter('wallet')`), but
neither has been exercised through a real click.

---

## 5. Public claims requiring owner confirmation — **PENDING**

Every statement below ships to visitors. Each is quoted **exactly** as it
appears in `src/landing/landingContent.ts`, with the repository source it was
derived from. Product and operations must confirm each one before deployment.

Nothing in this section is approved. The "Source" column records where the claim
came from, not that anyone has signed it off.

### 5.1 Fees, pricing and commissions

| # | Claim (EN) | Source | Confirmed |
|---|---|---|---|
| C1 | "1 JOD / month" | `constants/subscriptionTiers.ts` → `monthly.price = 1`; mirrors `functions/subscriptionTiers.js` | ☐ |
| C2 | "4 JOD / 6 months" | `semiannual.price = 4` | ☐ |
| C3 | "7 JOD / year" | `annual.price = 7` | ☐ |
| C4 | "A 5% buyer premium is added on top of the winning bid at payment." | `content/auctionRules.ts` — "the buyer pays a 5% premium added on top of the winning bid" | ☐ |
| C5 | "No security deposit is required to bid." | `content/auctionRules.ts` — verbatim rule | ☐ |
| C6 | "There are currently no listing fees. You keep 95% of the sale price, with a 5% success commission only when the item sells." | `content/auctionRules.ts` (5% seller commission) + prior landing FAQ ("no listing fees currently") | ☐ |
| C7 | "A subscription is required to bid" / "Browsing is free for everyone." | `content/auctionRules.ts` — "Bidding requires an active membership" | ☐ |

**C6 carries the most risk:** "currently no listing fees" is a time-bound
promotional statement. Confirm the promotion is still active and state its end
condition, or the sentence must change.

### 5.2 Timing and auction mechanics

| # | Claim (EN) | Source | Confirmed |
|---|---|---|---|
| C8 | "On eligible lots, the first bid starts the countdown." | `functions/settlement.js` — a `startMode: 'first_bid'` lot is stamped with an end time on its first bid | ☐ |
| C9 | "A bid in the final seconds extends the clock automatically, so a deal cannot be sniped at the last moment." | `functions/settlement.js` `resolveAntiSnipe` — 30s window / 30s extension by default | ☐ |
| C10 | "Every auction shows its minimum increment, and every bid is binding." | `content/auctionRules.ts` — verbatim | ☐ |
| C11 | "payment is due within 24 hours via CliQ" | `content/auctionRules.ts` — verbatim | ☐ |

**C9 is not in the approved rules document.** Anti-sniping is implemented
server-side and was verified in code, but `content/auctionRules.ts` does not
list it. Either confirm the claim and **add it to the canonical rules**, or
remove it from the landing page. It should not live only in marketing copy.

### 5.3 Verification, protection and disputes

| # | Claim (EN) | Source | Confirmed |
|---|---|---|---|
| C12 | "Reviewed listing" / "Mazzado reviewed this listing before it went live." | `LandingAuction.isVerified` = `approvalStatus === 'approved'` | ☐ |
| C13 | "Mazzado reviews a listing before it goes live, and may cancel or suspend any auction to protect fairness." | `content/auctionRules.ts` — cancellation right is verbatim | ☐ |
| C14 | "Mazzado holds the money and releases it only after you receive and approve the item." | `content/auctionRules.ts` + `content/legalTerms.ts` | ☐ |
| C15 | "If it does not match the listing, open a dispute before approving and Mazzado will mediate." | `content/legalTerms.ts` — verbatim | ☐ |
| C16 | "Where a refund is due, it is processed back to you within 72 working hours of the request." | `content/legalTerms.ts` — verbatim, and deliberately a PROCESSING time, not a claim window | ☐ |
| C17 | "Once you approve release, the sale is complete." | `content/legalTerms.ts` — "there are no refunds after that point" | ☐ |
| C18 | "Real photos from the seller … as the seller provided them." | `content/auctionRules.ts` — "Product details are as provided by the seller" | ☐ |

**C12 is a deliberate weakening of the previous claim.** The old page said "full
identity and document checking of ALL sellers before any auction begins"; the
flag behind the badge is a listing approval. If seller identity verification IS
performed, this copy understates reality and should be upgraded — with the
`/verif/` ratchet in `landingEducation.render.test.tsx` updated deliberately.

### 5.4 Viewing and support

| # | Claim (EN) | Source | Confirmed |
|---|---|---|---|
| C19 | "Viewing is not offered on every auction — it depends on the item and the seller. … message us on WhatsApp and we will check whether it can be arranged." | Deliberately non-committal; no repository source guarantees viewing | ☐ |
| C20 | "Direct WhatsApp support … the same number answers." | `constants/support.ts` — `SUPPORT_WHATSAPP_URL` | ☐ |
| C21 | Phone `0785168550` shown and dialled as `tel:+962785168550` | `constants/support.ts`, derived from one national value | ☐ |
| C22 | Instagram `@mazzadoofficial` | `constants/support.ts` — canonical URL, share token stripped | ☐ |

**C19 promises a response.** Confirm that a WhatsApp viewing request will
actually be answered and acted on, or soften the sentence.
**C20 implies availability.** No operating hours are published anywhere (see
below), so "the same number answers" carries an implicit always. Confirm, or add
hours.

### 5.5 Deliberate omissions — confirm each is intended

| # | Omission | Reason | Confirmed |
|---|---|---|---|
| O1 | No operating hours anywhere | No hours constant exists in the repository; any value would be invented. Asserted absent in `landingClosing.render.test.tsx` | ☐ |
| O2 | No operator entity, registration number or street address | Removed 2026-08-26; enforced repo-wide by `constants/operatorIdentity.test.ts`. **A marketplace holding buyer funds is normally expected to name its operator** — concern recorded in `docs/legal` for counsel | ☐ |
| O3 | No scale statistics (`15,000+`, `1,250+`, `3,400+`) | Never measured | ☐ |
| O4 | No testimonials | None ever collected | ☐ |
| O5 | No live bidder/watcher counts or activity toasts | Were simulated | ☐ |
| O6 | Terms and Privacy open the same combined modal | `TermsModal` **is** the "Terms of Use & Privacy Policy" document — pre-existing behaviour. Confirm one document is acceptable, or split it | ☐ |

---

## 6. Dev server (running, for the rendered review)

| | |
|---|---|
| Command | `npm run dev` (`vite --port=3000 --host=0.0.0.0`) |
| Local URL | **http://localhost:3000/** |
| Status | Listening — `HTTP 200` in 0.035s; `node` PID 20192 on TCP \*:3000 |
| Vite | v6.4.3, ready in 155 ms |

The landing page is at `/`. It is served to everyone when `activeView` is
`'landing'`; a cold `/auction/:id` URL bypasses the landing page by design.

Stop the server when the rendered review is finished. It is a development
server: it must not be used for the launch-content review of production data,
and it is not a deployment.

---

## 7. Outstanding gates before merge or deployment

Per the plan's Final Acceptance Gate. None of these is satisfied by this
document.

| Gate | State |
|---|---|
| All seven task commits exist and the worktree is clean | 6 of 7 — Task 7 not committed |
| `npm run lint`, `npm test`, `npm run build` pass on the final commit | **PASS on `7ad63a1`** (§1); must be re-run on the Task 7 commit |
| Rendered review matrix has no unresolved failures | **IN PROGRESS — no open defects.** D1 (§4.1.1) fixed and confirmed by Codex at a true 320x700 viewport. D2 (§4.1.2) fixed and verified in the browser. Both carry mutation-verified regression tests. Of 54 matrix rows: **29 PASS**, 10 PARTIAL, 10 PENDING. Every non-PASS row is unobserved, not failing |
| Public commercial and trust claims have explicit owner approval | **PENDING** — 22 claims + 6 omissions unconfirmed (§5) |
| Final diff contains no simulated social proof or local-only adopter form | **PASS** — asserted by `LandingView.render.test.tsx` and the content ratchets |
| Primary CTA is Browse in both languages and at mobile/desktop widths | Content and composition **asserted in tests**; visual confirmation PENDING |
| Analytics destination verified end to end | **FAIL / launch dependency** — no `dataLayer` exists (§3) |

### 7.1 What remains, separated by who can close it

Nothing below is a failing check. They are unobserved or unapproved, which is a
different thing, and they fall into three groups with different owners.

**A. CODE-QUALITY GATES — closed, nothing outstanding.**

| Gate | State |
|---|---|
| `npm run lint`, `npm test`, `npm run build` | PASS — 201 files, 3001 tests, build 3.38s |
| Both review defects fixed with mutation-verified regression tests | D1 and D2 closed |
| No simulated proof in the rendered DOM | PASS — scanned the live page (row 42) |
| Conversion hierarchy, section wiring, analytics payloads | PASS — deterministic tests |
| Theme, direction, reduced motion, focus order | PASS (rows 2/3/3b/23/25/26/32/35) |

**No code-side gaps remain.** Row 20's `onError` branch — the last one — is
closed by `landingImageFallback.render.test.tsx` (§4.1.5).

**B. ENVIRONMENT GATES — largely closed by the Codex viewport pass.**

`resize_window` does not work against this session's Chrome window (three
attempts, three sizes, `innerWidth` pinned at 1440), and `xs` is a viewport media
query, so sub-1440 layouts cannot be exercised here. Codex performed the whole
viewport pass with controllable tooling (§4.1.3).

**Closed:** row 24 across 320/375/390/768/1024/1440, and cells 1, 3d, 8 and 11.

**Still open, and what each needs:**

| Rows | What is needed | Why the viewport pass did not close it |
|---|---|---|
| 3c, 4-7, 9, 10 | Render those direction/theme cells | Overflow is confirmed at each width, but the specific cell was not rendered |
| 30, 33 | Explainer lead card and footer grid at 768 | The 768 report covered the header and hero, not these |
| 31 | Pricing badge at 320 | A negative offset can clip without changing document width |
| 34 (open half) | Mobile menu open/close below `lg` | Not exercised |
| 17, 18, 19 | Loading, empty and error states — network throttling or request blocking | **Behaviour already proven deterministically** (`landingAuctionShowcase.render.test.tsx`); only appearance is unobserved |
| 20 (appearance only) | How the fallback LOOKS in place | Behaviour closed deterministically (§4.1.5) |
| 22 | A six-figure lot | The live catalogue has none; the formatter itself is exercised |
| 36-39, 41 (open half) | Click through to discovery, an auction, upload, wallet, and the legal modals | Not exercised; the wiring is covered by `LandingView.render.test.tsx` |

**C. OWNER GATES — irreducible. No amount of testing closes these.**

| Gate | Who | Why it cannot be automated |
|---|---|---|
| **22 public claims** (§5.1-5.4) | Product / operations | Whether a sentence is TRUE of the business is not a property of the code. Tests pin the copy to its source; only an owner can confirm the source is current |
| **6 deliberate omissions** (§5.5) | Product / legal | Especially **O2**, naming the operator entity — a marketplace holding buyer funds is normally expected to, and that is a legal call |
| **Analytics destination** (§3) | Product | `window.dataLayer` does not exist at runtime — confirmed again this pass. Someone must choose a destination and verify an event arrives |
| Row 40, authentication half | Owner | Requires signing in; no production data was touched |
| **C6** "currently no listing fees" | Product | Time-bound promotional claim; needs its end condition |
| **C9** anti-sniping | Product | Implemented in `settlement.js` but absent from the canonical `auctionRules.ts`. Confirm and add it there, or drop it from the page |
| **C12** "Reviewed listing" | Product | Deliberately weaker than the old claim. If identity verification IS performed, the copy understates it |

### Carried-forward code concerns (not blockers, decisions needed)

1. **A started first-bid lot shows no countdown although it has one.** The
   server stamps `endsAt`; `mapToLandingAuction` copies `endTime`. The card
   correctly makes no time claim — a missing countdown, never a false one — but a
   live clock is invisible. Fixing it changes which lots count as clocked and
   therefore curation ordering, which the plan fenced off. Needs a decision.
2. **Pricing-CTA clicks are unmeasured.** The five approved placements have no
   pricing bucket, so `onSubscribe` deliberately emits nothing. A named
   `subscribe_cta_clicked` event needs product approval.
3. **`src/landing/translations.ts` is entirely unrendered**, surviving only
   because `utils/depositFraming.test.ts` scans it. That scan therefore guards
   dead copy while `landingContent.ts` — what ships — goes unscanned. Retarget
   and delete.
4. **Four unused content fields**: `hero.openingPriceLabel`,
   `marketplace.openingPriceLabel`, `marketplace.currentBidLabel` (superseded by
   `utils/bidLabels.priceLabel`) and `footer.languageLabel`.
5. **Price formatting is duplicated** between `LandingHero` (lang-derived unit)
   and `LandingAuctionCard` (`copy.currency`). Same output today.
6. **Stale comments** in `components/signInPanelCopy.ts` and its test cite
   `translations.ts:551` / `:309`; those line numbers moved when the obsolete
   fields were pruned.
