# Sign-in Screen Marketing Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the sign-in screen from a login box on an empty black page into a marketing surface that sells live activity, escrow safety, and how the product works — without touching auth.

**Architecture:** A new presentational component `SignInMarketingPanel` takes plain props and renders the three blocks. All selection logic lives in a pure `src/utils/signInPanel.ts`. `LoginView` gains a two-column wrapper on `lg:` and passes `useLandingAuctions()` through. The existing sign-in card is moved as-is into the right column — not rewritten.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@import "tailwindcss"`, no config file), vitest `environment: 'node'` with `renderToStaticMarkup` from `react-dom/server`.

**Spec:** `docs/superpowers/specs/2026-08-03-signin-screen-design.md`

## Global Constraints

- **Auth mechanics are untouched.** No change to phone/Google sign-in, OTP, resend cooldown, SMS fallback, reCAPTCHA, or `ConfirmationResult` state. A sign-in regression blocks every new user.
- **Tokens only.** Use `bg-surface-raised`, `bg-surface-sunken`, `border-line`, `text-fg`, `text-fg-muted`, and the accent. **No raw neutral hex.** `src/theme.guard.test.ts` is a ratchet: neutral hex ≤ 31, `text-gray-200|300` ≤ 43, `border-gray-100|200|300` = 0. These budgets must not rise.
- **No countdowns, no "ending soon", no time-remaining text.** Production 2026-08-03: 149 lots `live`, only **4** with a future `endTime`. A clock would be wrong on ~97% of inventory.
- **Real data only.** No fabricated counts, no placeholder lots, no rounding up.
- **The form never waits.** The sign-in card renders and is interactive on first paint in every fetch state.
- **Loading renders nothing** in the activity slot — no skeleton, no shimmer.
- **Empty or error removes the activity block entirely.** Trust and how-it-works remain.
- **Both languages, both themes.** Arabic RTL is a first-class check. Western numerals per `ARABIC_UI_DIGITS`.
- vitest is `environment: 'node'`. **Do NOT add jsdom or @testing-library.** Use `renderToStaticMarkup`.
- `npm run lint` (`tsc --noEmit`) must exit 0 with no output. `npm run build` must exit 0. Full suite green; counts may only rise.
- **`LoginView.tsx` is contended** — edited today by #224 and #228. Check for an in-flight session before starting.

---

### Task 1: Pure selection logic

**Files:**
- Create: `src/utils/signInPanel.ts`
- Test: `src/utils/signInPanel.test.ts`

**Interfaces:**
- Consumes: `LandingAuction`, `LandingAuctionsState` from `src/landing/useLandingAuctions.ts`.
- Produces: `PANEL_LOT_CAP`, `isRenderableLot(lot)`, `selectPanelActivity(state, cap?)` returning `PanelActivity | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { selectPanelActivity, isRenderableLot, PANEL_LOT_CAP } from './signInPanel';
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

const lot = (over: Partial<LandingAuction> = {}): LandingAuction => ({
  id: 'a1', title: 'Apple Watch Ultra', category: 'misc' as LandingAuction['category'],
  currentPrice: 145, totalBids: 3, endTime: undefined, createdAt: 1,
  featuredRank: undefined, imageUrl: 'https://x/y.jpg', isFeatured: false, isVerified: true,
  ...over,
});
const state = (over: Partial<LandingAuctionsState> = {}): LandingAuctionsState => ({
  auctions: [lot()], isLoading: false, isEmpty: false, isError: false, ...over,
});

describe('selectPanelActivity', () => {
  it('returns the real count and at most PANEL_LOT_CAP lots', () => {
    const many = Array.from({ length: 8 }, (_, i) => lot({ id: `a${i}` }));
    const r = selectPanelActivity(state({ auctions: many }));
    expect(r).not.toBeNull();
    expect(r!.count).toBe(8);              // the REAL number, not the capped one
    expect(r!.lots).toHaveLength(PANEL_LOT_CAP);
  });

  it('returns null while loading — the slot renders nothing, never a skeleton', () => {
    expect(selectPanelActivity(state({ isLoading: true, auctions: [] }))).toBeNull();
  });

  it('returns null when empty or errored — the block disappears', () => {
    expect(selectPanelActivity(state({ isEmpty: true, auctions: [] }))).toBeNull();
    expect(selectPanelActivity(state({ isError: true, auctions: [] }))).toBeNull();
  });

  it('skips a lot missing an image, a title, or a price rather than half-rendering it', () => {
    const lots = [lot({ id: 'ok' }), lot({ id: 'noimg', imageUrl: '' }),
                  lot({ id: 'notitle', title: '   ' }), lot({ id: 'ok2' })];
    const r = selectPanelActivity(state({ auctions: lots }));
    expect(r!.lots.map(l => l.id)).toEqual(['ok', 'ok2']);
  });

  it('counts every live lot, including ones it cannot render', () => {
    // The count is the marketplace's size, not how many happen to have images.
    const lots = [lot({ id: 'ok' }), lot({ id: 'noimg', imageUrl: '' })];
    expect(selectPanelActivity(state({ auctions: lots }))!.count).toBe(2);
  });

  it('returns null when nothing is renderable, even with a non-zero count', () => {
    const lots = [lot({ id: 'x', imageUrl: '' })];
    expect(selectPanelActivity(state({ auctions: lots }))).toBeNull();
  });

  it('never exposes a countdown field — 97% of live lots have no clock', () => {
    const r = selectPanelActivity(state());
    expect(Object.keys(r!.lots[0])).not.toContain('endTime');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/signInPanel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * What the sign-in screen's activity block shows.
 *
 * Pure and props-shaped so the panel can be rendered in a node test. The rules
 * here are the spec's honesty rules: real data or nothing.
 */
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

export const PANEL_LOT_CAP = 3;

/** A lot the panel can render without inventing anything. */
export interface PanelLot {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
}

export interface PanelActivity {
  /** Every live lot the query returned — NOT the number shown. Never padded. */
  count: number;
  lots: PanelLot[];
}

/**
 * A half-rendered card (no image, blank title) reads as broken and implies the
 * marketplace is broken. Skip it instead.
 */
export function isRenderableLot(lot: LandingAuction): boolean {
  return (
    typeof lot.imageUrl === 'string' && lot.imageUrl.trim() !== '' &&
    typeof lot.title === 'string' && lot.title.trim() !== '' &&
    typeof lot.currentPrice === 'number' && Number.isFinite(lot.currentPrice)
  );
}

/**
 * `null` means RENDER NOTHING — loading, empty, errored, or nothing renderable.
 * Deliberately one signal: the panel must not distinguish "still coming" from
 * "none", because a skeleton claims content that may never arrive.
 *
 * `endTime` is intentionally absent from PanelLot. Only 4 of 149 live lots carry
 * a future clock, so a countdown would be wrong on almost all of them.
 */
export function selectPanelActivity(
  state: LandingAuctionsState,
  cap: number = PANEL_LOT_CAP
): PanelActivity | null {
  if (state.isLoading || state.isError || state.isEmpty) return null;
  const all = Array.isArray(state.auctions) ? state.auctions : [];
  if (all.length === 0) return null;
  const lots = all.filter(isRenderableLot).slice(0, cap).map((l) => ({
    id: l.id, title: l.title.trim(), imageUrl: l.imageUrl, currentPrice: l.currentPrice,
  }));
  if (lots.length === 0) return null;
  return { count: all.length, lots };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/utils/signInPanel.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify with mutants** — apply each, confirm FAIL, revert, name the killing test.

| mutant | expected |
|---|---|
| return `{count: lots.length}` instead of `all.length` | FAIL |
| drop the `isLoading` guard | FAIL |
| drop the `isEmpty`/`isError` guards | FAIL |
| `isRenderableLot` always returns `true` | FAIL |
| add `endTime` to `PanelLot` | FAIL |

- [ ] **Step 6: Commit**

```bash
git add src/utils/signInPanel.ts src/utils/signInPanel.test.ts
git commit -m "feat(signin): pure selection rules for the marketing panel"
```

---

### Task 2: Bilingual panel copy

**Files:**
- Create: `src/components/signInPanelCopy.ts`
- Test: `src/components/signInPanelCopy.test.ts`

**Interfaces:**
- Produces: `panelCopy(lang: 'ar' | 'en'): PanelCopy`.

**Every claim must already be true and already stated elsewhere in the product.** The escrow line is condensed from `src/landing/translations.ts:551` (EN) / `:309` (AR). Write no new promises.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { panelCopy } from './signInPanelCopy';

const ARABIC = /[؀-ۿ]/;

describe('panelCopy', () => {
  it('gives every field in both languages, non-empty', () => {
    for (const lang of ['ar', 'en'] as const) {
      const c = panelCopy(lang);
      for (const [k, v] of Object.entries(c)) {
        if (typeof v === 'string') expect(v.trim(), `${lang}.${k}`).not.toBe('');
      }
      expect(c.steps, lang).toHaveLength(3);
      c.steps.forEach((s, i) => expect(s.trim(), `${lang}.step${i}`).not.toBe(''));
    }
  });

  it('does not leak one language into the other', () => {
    const en = panelCopy('en');
    expect(ARABIC.test([en.trustTitle, en.trustBody, ...en.steps].join(' '))).toBe(false);
    const ar = panelCopy('ar');
    expect(ARABIC.test(ar.trustBody)).toBe(true);
  });

  it('promises escrow in the terms the product already uses', () => {
    // Condensed from translations.ts:551 — the claim must not drift from it.
    expect(panelCopy('en').trustBody.toLowerCase()).toMatch(/hold|holds/);
    expect(panelCopy('en').trustBody.toLowerCase()).toMatch(/confirm|approve|receive/);
  });

  it('states no delivery time, fee, or guarantee the product does not make', () => {
    const all = [...Object.values(panelCopy('en')), ...panelCopy('en').steps].join(' ');
    expect(all).not.toMatch(/free shipping|guarantee|refund|24 hours|next day/i);
  });

  it('uses Western digits in Arabic, per ARABIC_UI_DIGITS', () => {
    const ar = [panelCopy('ar').trustBody, ...panelCopy('ar').steps].join(' ');
    expect(ar).not.toMatch(/[٠-٩]/);
  });

  it('takes an unknown language as Arabic, like every other renderer here', () => {
    expect(panelCopy('fr' as never)).toEqual(panelCopy('ar'));
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found).**

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Copy for the sign-in marketing panel.
 *
 * Kept out of src/landing/translations.ts on purpose: that file is the landing
 * page's, already ~600 lines per language, and this panel is a different surface
 * with a different lifecycle. Every claim below is condensed from an existing,
 * already-approved product statement — nothing here is new marketing.
 */
export interface PanelCopy {
  activityLabel: (count: number) => string;
  trustTitle: string;
  trustBody: string;
  howTitle: string;
  steps: [string, string, string];
}

const EN: PanelCopy = {
  // Western digits in both languages (ARABIC_UI_DIGITS).
  activityLabel: (n) => `${n} lots live right now`,
  trustTitle: 'Buy safely from anyone',
  // Condensed from translations.ts:551. Do not strengthen this claim.
  trustBody: 'Mazad holds your payment until you receive the item and confirm it matches. Only then is the seller paid.',
  howTitle: 'How it works',
  steps: ['Watch a live auction', 'Place your bid', 'Pay by CliQ — the item ships to you'],
};

const AR: PanelCopy = {
  activityLabel: (n) => `${n} قطعة معروضة الآن`,
  trustTitle: 'اشترِ بأمان من أي بائع',
  // Condensed from translations.ts:309.
  trustBody: 'مزاد جو يحتفظ بمبلغك حتى تستلم القطعة وتتأكد أنها مطابقة. عندها فقط يُحوَّل للبائع.',
  howTitle: 'كيف تعمل المنصة',
  steps: ['تابع مزاداً مباشراً', 'قدّم مزايدتك', 'ادفع عبر كليك — وتصلك القطعة'],
};

/** Unknown languages fall back to Arabic, matching resolveLang and copyFor. */
export function panelCopy(lang: 'ar' | 'en'): PanelCopy {
  return lang === 'en' ? EN : AR;
}
```

- [ ] **Step 4: Run the tests — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/components/signInPanelCopy.ts src/components/signInPanelCopy.test.ts
git commit -m "feat(signin): bilingual panel copy, condensed from approved product claims"
```

---

### Task 3: The panel component

**Files:**
- Create: `src/components/SignInMarketingPanel.tsx`
- Test: `src/components/signInMarketingPanel.render.test.tsx`

**Interfaces:**
- Consumes: `selectPanelActivity`, `PanelActivity` (Task 1); `panelCopy` (Task 2); `LandingAuctionsState`.
- Produces: `<SignInMarketingPanel state={LandingAuctionsState} lang={'ar'|'en'} variant={'full'|'compact'} />`.

**Presentational only** — no context, no hooks, no data fetching. That is what makes it renderable in a node test. `variant="compact"` is the mobile block (activity + trust title/body only, no steps); `variant="full"` is desktop.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

import { SignInMarketingPanel } from './SignInMarketingPanel';
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

const lot = (over: Partial<LandingAuction> = {}): LandingAuction => ({
  id: 'a1', title: 'Apple Watch Ultra', category: 'misc' as LandingAuction['category'],
  currentPrice: 145, totalBids: 3, endTime: undefined, createdAt: 1,
  featuredRank: undefined, imageUrl: 'https://x/y.jpg', isFeatured: false, isVerified: true,
  ...over,
});
const state = (o: Partial<LandingAuctionsState> = {}): LandingAuctionsState =>
  ({ auctions: [lot()], isLoading: false, isEmpty: false, isError: false, ...o });

const render = (s: LandingAuctionsState, lang: 'ar' | 'en' = 'en', variant: 'full' | 'compact' = 'full') =>
  renderToStaticMarkup(React.createElement(SignInMarketingPanel, { state: s, lang, variant }));

describe('SignInMarketingPanel', () => {
  it('renders the real count and the lot', () => {
    const html = render(state({ auctions: [lot(), lot({ id: 'b' })] }));
    expect(html).toContain('2 lots live right now');
    expect(html).toContain('Apple Watch Ultra');
    expect(html).toContain('145');
  });

  it('renders NO lot markup while loading — no skeleton', () => {
    const html = render(state({ isLoading: true, auctions: [] }));
    expect(html).not.toContain('lots live right now');
    expect(html).not.toMatch(/animate-pulse|skeleton/i);
  });

  it('drops the activity block when empty or errored, and keeps trust', () => {
    for (const s of [state({ isEmpty: true, auctions: [] }), state({ isError: true, auctions: [] })]) {
      const html = render(s);
      expect(html).not.toContain('lots live right now');
      expect(html).toContain('Buy safely from anyone');   // the panel still stands
    }
  });

  it('never renders a countdown — almost no live lot has a clock', () => {
    const html = render(state({ auctions: [lot({ endTime: Date.now() + 600000 })] }));
    expect(html).not.toMatch(/ends in|ending soon|remaining|ينتهي|متبقّ/i);
  });

  it('renders the three steps in full, and omits them in compact', () => {
    expect(render(state(), 'en', 'full')).toContain('Pay by CliQ');
    expect(render(state(), 'en', 'compact')).not.toContain('Pay by CliQ');
    // compact still carries the hook and the objection
    expect(render(state(), 'en', 'compact')).toContain('lots live right now');
    expect(render(state(), 'en', 'compact')).toContain('Buy safely from anyone');
  });

  it('renders Arabic without English leaking, and with Western digits', () => {
    const html = render(state(), 'ar');
    expect(html).toContain('قطعة معروضة الآن');
    expect(html).not.toContain('lots live right now');
    expect(html).not.toMatch(/[٠-٩]/);
  });

  it('uses theme tokens, never a raw neutral hex', () => {
    // The #226 ratchet fails the build on these; catch it here with a clearer message.
    expect(render(state())).not.toMatch(/#(?:[0-9a-f]{3}){1,2}\b/i);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found).**

- [ ] **Step 3: Implement the component**

Presentational, tokens only, `<img>` with `loading="lazy"` and an `alt` of the lot title. Structure:

```tsx
export function SignInMarketingPanel({ state, lang, variant = 'full' }: Props) {
  const activity = selectPanelActivity(state);
  const c = panelCopy(lang);
  return (
    <div className="w-full max-w-md lg:max-w-lg text-fg">
      {/* Activity — real data or nothing at all. Never a skeleton. */}
      {activity && (
        <section>
          <p className="text-sm font-bold text-fg">{c.activityLabel(activity.count)}</p>
          <ul className="mt-3 space-y-2">
            {activity.lots.map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-surface-sunken border border-line p-2">
                <img src={l.imageUrl} alt={l.title} loading="lazy"
                     className="h-12 w-12 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{l.title}</span>
                {/* No countdown: only 4 of 149 live lots carry a clock. */}
                <span className="text-sm font-bold text-fg whitespace-nowrap">{l.currentPrice} {lang === 'en' ? 'JOD' : 'د.أ'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={activity ? 'mt-6' : ''}>
        <h2 className="text-base font-black text-fg">{c.trustTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{c.trustBody}</p>
      </section>

      {variant === 'full' && (
        <section className="mt-6">
          <h2 className="text-base font-black text-fg">{c.howTitle}</h2>
          <ol className="mt-2 space-y-1.5">
            {c.steps.map((s, i) => (
              <li key={i} className="text-sm text-fg-muted">{i + 1}. {s}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests — expect PASS.**

- [ ] **Step 5: Verify with mutants**

| mutant | expected |
|---|---|
| render a `animate-pulse` placeholder while loading | FAIL |
| render the activity block when `activity === null` | FAIL |
| add an "ends in …" line to each lot | FAIL |
| render steps in `compact` | FAIL |
| swap `text-fg` for `text-[#FFFFFF]` | FAIL |

- [ ] **Step 6: Commit**

```bash
git add src/components/SignInMarketingPanel.tsx src/components/signInMarketingPanel.render.test.tsx
git commit -m "feat(signin): the marketing panel, real data or nothing"
```

---

### Task 4: Wire it into LoginView

**Files:**
- Modify: `src/components/LoginView.tsx`
- Test: `src/components/loginView.render.test.tsx` (create)

**Interfaces:**
- Consumes: `SignInMarketingPanel` (Task 3), `useLandingAuctions` (existing, unchanged).

**`LoginView.tsx` is contended — check for an in-flight session first.** The existing card moves into a column wrapper **unchanged**; do not rewrite its internals, do not touch auth handlers.

- [ ] **Step 1: Write the failing test**

The single most important assertion in this plan is that **sign-in survives every panel state**.

```tsx
// mocks as in Task 3, plus:
vi.mock('../services/firebase', () => ({ auth: {}, db: {} }));
vi.mock('../landing/useLandingAuctions', () => ({ useLandingAuctions: () => mockState }));

describe('LoginView keeps sign-in reachable in every panel state', () => {
  for (const [name, s] of Object.entries({
    loaded:  { auctions: [lot()], isLoading: false, isEmpty: false, isError: false },
    loading: { auctions: [], isLoading: true,  isEmpty: false, isError: false },
    empty:   { auctions: [], isLoading: false, isEmpty: true,  isError: false },
    error:   { auctions: [], isLoading: false, isEmpty: false, isError: true  },
  })) {
    it(`renders both sign-in buttons when the panel is ${name}`, () => {
      mockState = s;
      const html = render();
      expect(html).toMatch(/Continue with phone/i);
      expect(html).toMatch(/Continue with Google/i);
    });
  }

  it('renders the panel above the card on mobile and beside it on desktop', () => {
    const html = render();
    expect(html).toMatch(/lg:grid-cols-2|lg:flex-row/);
  });

  it('uses the compact variant on mobile and full on desktop', () => {
    const html = render();
    expect(html).toMatch(/lg:hidden/);   // compact block
    expect(html).toMatch(/hidden lg:/);  // full block
  });

  it('keeps the deep-link banner working', () => {
    // cameFromAuctionLink must be untouched by this change.
    expect(render()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement the wiring**

Wrap the existing content in a responsive two-column container. Mobile: `<SignInMarketingPanel variant="compact" className="lg:hidden" />` above the card, full variant below it. Desktop: full variant in the left column.

Do **not** move the `cameFromAuctionLink` banner or change its condition.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all green, lint exit 0 no output, ratchet budgets unchanged.

- [ ] **Step 5: Verify with mutants**

| mutant | expected |
|---|---|
| render the panel *instead of* the card when loading | FAIL |
| drop the `lg:` breakpoint so mobile gets two columns | FAIL |
| use `variant="full"` on mobile | FAIL |
| remove the `cameFromAuctionLink` banner | FAIL |

- [ ] **Step 6: Commit**

```bash
git add src/components/LoginView.tsx src/components/loginView.render.test.tsx
git commit -m "feat(signin): two-column sign-in — marketing beside the form"
```

---

### Task 5: Preview gate and documentation

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Verify the theme ratchet did not move**

Run: `npx vitest run src/theme.guard.test.ts`
Expected: PASS, budgets unchanged (neutral hex ≤ 31, `text-gray-200|300` ≤ 43).

- [ ] **Step 2: Capture previews for MJ — REQUIRED, HARD GATE, no merge without approval**

Six shots: **desktop + mobile × English + Arabic × light + dark** (at minimum desktop/mobile in both languages, in dark, plus one light check). Confirm in each:
- The form is reachable without scrolling on a 667pt-tall mobile viewport.
- Arabic is native RTL — no LTR bleed, no mirrored images, Western numerals.
- Real lots render; the count matches the marketplace.
- Nothing renders in the activity slot while loading.

- [ ] **Step 3: Verify the empty state against production reality**

Temporarily force `isEmpty` and confirm the panel still reads as a complete, honest screen with trust and how-it-works alone.

- [ ] **Step 4: Add a BACKLOG entry**

Record what shipped, that the count is live and unpadded, that there are deliberately no countdowns (and why), and that per-trigger contextual lines remain a follow-on.

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs/BACKLOG.md
git commit -m "docs: record the sign-in marketing panel"
```

PR body must state: closes #232, links the spec, and notes the preview gate was satisfied with MJ's approval.

---

## Follow-ons, deliberately not in this plan

- **Per-trigger contextual lines** for bid / sell / save / chat (`requestSignIn()` call sites in `src/utils/guestGate.ts` consumers). Layers on top of this panel.
- **Analytics instrumentation** of `view→signup→first-bid`. Without it this change's effect is unmeasurable — worth its own slice.
- **The clockless-lot problem** (149 live, 4 with a clock). Tracked separately; this plan only avoids depending on it.
