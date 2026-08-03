# Listing Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app inventing product images, unify the two disagreeing category taxonomies into one, and show a rejected seller what to fix.

**Architecture:** Three pure-function modules (`categories.ts`, `listingMedia.ts`, and the backfill classifier) become the single source of truth for taxonomy and media rules; every existing surface is repointed at them. One new presentational component (`ListingImage`) replaces two hardcoded Unsplash fallbacks. No schema changes, no Firestore rules changes, no server/functions changes.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4, Firebase (Firestore + Storage), vitest (`environment: 'node'`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-03-listing-integrity-design.md`. Read it before Task 1.
- **Branch:** work on `feat/listing-integrity`, branched from `origin/main`. Never commit to `main`.
- **vitest is node-only.** No jsdom, no `@testing-library/react`. Components cannot be rendered in tests. Component behaviour is asserted with source-text reads — the house idiom, see `src/components/descriptionSurfaces.wiring.test.ts`.
- **`tsc` is not a safety net.** No `@types/react` and no `strict`, so `useApp()` is implicitly `any` and `.tsx` call sites are unchecked. A clean `npm run lint` proves nothing about component wiring. Wiring tests are the net.
- **Bilingual, Arabic-first.** Every user-visible string ships AR + EN via the existing `isAr ? 'ar' : 'en'` idiom. No English-only additions.
- **Theme tokens only.** Use `surface`, `surface-raised`, `surface-sunken`, `fg`, `fg-muted`, `line`. Raw Tailwind colours are blocked by the theme guard ratchet (`src/theme.guard.test.ts`) and will fail CI.
- **The stored value `Fashion` is never renamed.** Legacy docs carry it; it is labelled "Other / أخرى" at render time only.
- **Test command:** `npx vitest run <path>` for one file, `npm test` for the suite.
- **Commit style:** lowercase `type(scope): summary`, imperative, describing behaviour not mechanics.

---

### Task 1: The canonical category taxonomy

**Files:**
- Create: `src/utils/categories.ts`
- Create: `src/utils/categories.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Category`, `CATEGORIES`, `categoryLabel(value, isAr) => string`, `matchValues(value) => string[]`. Tasks 2 and 6 depend on all four.

- [ ] **Step 1: Write the failing test**

Create `src/utils/categories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORIES, categoryLabel, matchValues } from './categories';

describe('CATEGORIES', () => {
  it('gives every category an Arabic and an English label', () => {
    for (const c of CATEGORIES) {
      expect(c.labelAr.trim(), `${c.value} labelAr`).not.toBe('');
      expect(c.labelEn.trim(), `${c.value} labelEn`).not.toBe('');
    }
  });

  it('has no duplicate stored values', () => {
    const values = CATEGORIES.map(c => c.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the legacy Luxury value reachable under Watches', () => {
    // Every watch a seller listed before this change stored 'Luxury', which
    // matched no Discover chip at all. It must filter under Watches now.
    expect(matchValues('Watches')).toContain('Luxury');
  });

  it('keeps the legacy Cars value reachable under Vehicles', () => {
    expect(matchValues('Vehicles')).toContain('Cars');
  });

  it('keeps the catch-all Fashion bucket reachable under Other', () => {
    expect(matchValues('Fashion')).toContain('Fashion');
  });

  it('offers Real Estate, which no seller could previously pick', () => {
    expect(CATEGORIES.map(c => c.value)).toContain('Real Estate');
  });
});

describe('categoryLabel', () => {
  it('labels the Fashion catch-all as Other, not as clothing', () => {
    expect(categoryLabel('Fashion', false)).toBe('Other');
    expect(categoryLabel('Fashion', true)).toBe('أخرى');
  });

  it('is case-insensitive, because legacy docs are inconsistent', () => {
    expect(categoryLabel('fashion', false)).toBe('Other');
    expect(categoryLabel('VEHICLES', false)).toBe('Vehicles');
  });

  it('labels a legacy value by the category that absorbed it', () => {
    expect(categoryLabel('Luxury', false)).toBe('Watches');
    expect(categoryLabel('Luxury', true)).toBe('ساعات');
  });

  it('falls back to the raw string so a chip never renders empty', () => {
    expect(categoryLabel('Something New', false)).toBe('Something New');
  });

  it('returns empty for a missing category', () => {
    expect(categoryLabel(null, true)).toBe('');
    expect(categoryLabel(undefined, false)).toBe('');
  });
});

describe('matchValues', () => {
  it('always includes the canonical value itself', () => {
    for (const c of CATEGORIES) {
      expect(matchValues(c.value), c.value).toContain(c.value);
    }
  });

  it('returns the raw value for an unknown category', () => {
    expect(matchValues('Something New')).toEqual(['Something New']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categories.test.ts`
Expected: FAIL — `Failed to resolve import "./categories"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/categories.ts`:

```ts
/**
 * The ONE category taxonomy. Before this file there were two, written
 * independently and disagreeing:
 *
 *  - The seller picker (ListingWizardView) offered 7 labels over 6 stored
 *    values, storing 'Luxury' for Watches — a value NO Discover chip matched,
 *    so every watch a seller listed was invisible under every category filter
 *    except "All".
 *  - The admin drop builder had 3 channels, and `channelToCategory` collapsed
 *    everything that was not a phone or a car into 'Fashion'.
 *
 * Stored values are NEVER renamed — legacy docs carry them and a rename would
 * orphan every existing lot. `legacyMatch` is how an old value stays reachable:
 * a chip filters on its canonical value PLUS everything it absorbed, so the
 * feed is correct whether or not the backfill has run.
 *
 * `Fashion` is the historical catch-all, not a clothing category. It is stored
 * as `Fashion` and labelled "Other / أخرى" everywhere it is shown.
 */
export interface Category {
  /** The canonical value written to `auctions/{id}.category`. */
  value: string;
  labelAr: string;
  labelEn: string;
  /** Stored values this category must ALSO match when filtering. */
  legacyMatch: string[];
}

export const CATEGORIES: readonly Category[] = [
  { value: 'Vehicles',        labelAr: 'سيارات',        labelEn: 'Vehicles',        legacyMatch: ['Cars'] },
  { value: 'Phones',          labelAr: 'هواتف',          labelEn: 'Phones',          legacyMatch: [] },
  { value: 'Electronics',     labelAr: 'إلكترونيات',     labelEn: 'Electronics',     legacyMatch: [] },
  { value: 'Watches',         labelAr: 'ساعات',          labelEn: 'Watches',         legacyMatch: ['Luxury'] },
  { value: 'Appliances',      labelAr: 'أجهزة كهربائية', labelEn: 'Appliances',      legacyMatch: [] },
  { value: 'Home & Furniture', labelAr: 'أثاث ومنزل',    labelEn: 'Home & Furniture', legacyMatch: [] },
  { value: 'Real Estate',     labelAr: 'عقارات',         labelEn: 'Real Estate',     legacyMatch: [] },
  { value: 'Fashion',         labelAr: 'أخرى',           labelEn: 'Other',           legacyMatch: ['Misc'] },
] as const;

/** Case-insensitive lookup over canonical values AND absorbed legacy values. */
function find(raw: string): Category | undefined {
  const key = raw.trim().toLowerCase();
  return CATEGORIES.find(
    c =>
      c.value.toLowerCase() === key ||
      c.legacyMatch.some(l => l.toLowerCase() === key),
  );
}

/**
 * Bilingual label. Falls back to the raw string for an unknown value so a chip
 * never renders empty — a future category added server-side shows its own name
 * rather than vanishing.
 */
export function categoryLabel(value: string | null | undefined, isAr: boolean): string {
  if (!value) return '';
  const hit = find(value);
  if (!hit) return value;
  return isAr ? hit.labelAr : hit.labelEn;
}

/**
 * Every stored value a filter for `value` must match. Firestore `in` clauses
 * take this array directly.
 */
export function matchValues(value: string): string[] {
  const hit = find(value);
  if (!hit) return [value];
  return [hit.value, ...hit.legacyMatch];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/categories.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/categories.ts src/utils/categories.test.ts
git commit -m "feat(categories): one taxonomy, and the legacy values it absorbs"
```

---

### Task 2: Repoint every consumer at the taxonomy

Five surfaces currently hardcode their own category list. This task points all of them at Task 1's module and deletes `channelToCategory`. It is one task rather than five because a half-migration is worse than none: the wizard writing `Watches` while Discover still matches only `Luxury` inverts the bug instead of fixing it.

**Files:**
- Modify: `src/utils/categoryLabel.ts` (becomes a re-export)
- Modify: `src/utils/dropChannel.ts:17-27` (delete `channelToCategory`)
- Modify: `src/utils/dropPayload.ts:27,74`
- Modify: `src/components/ListingWizardView.tsx:24,58-68`
- Modify: `src/components/SellView.tsx:5,179`
- Modify: `src/components/DiscoveryFeedView.tsx:392-410`
- Create: `src/utils/categoryConsumers.wiring.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `categoryLabel`, `matchValues` from Task 1.
- Produces: `DropPayloadInput` gains a required `category: string` field. `channelToCategory` no longer exists. Task 6's backfill relies on the wizard writing `Watches`.

- [ ] **Step 1: Write the failing wiring test**

Create `src/utils/categoryConsumers.wiring.test.ts`:

```ts
// The taxonomy lived in five places and they disagreed (see categories.ts).
// These are source-text assertions because vitest here is environment: 'node'
// with no jsdom — components cannot be rendered. House idiom, per
// descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('category consumers', () => {
  it('has no callers of channelToCategory left', () => {
    // It mapped 3 drop channels onto 3 categories and sent everything else to
    // 'Fashion' — the funnel that put a TV in the catch-all bucket.
    for (const f of [
      'utils/dropPayload.ts',
      'components/SellView.tsx',
      'utils/dropChannel.ts',
    ]) {
      expect(read(f), f).not.toMatch(/channelToCategory/);
    }
  });

  it('keeps DropChannel itself, which still routes WhatsApp drops', () => {
    const src = read('utils/dropChannel.ts');
    expect(src).toMatch(/export type DropChannel/);
    expect(src).toMatch(/export const DROP_CHANNELS/);
    expect(src).toMatch(/export function channelLabel/);
  });

  it('builds the seller picker from CATEGORIES, not a local array', () => {
    const src = read('components/ListingWizardView.tsx');
    expect(src).toMatch(/from '\.\.\/utils\/categories'/);
    expect(src).not.toMatch(/value: 'Luxury'/);
  });

  it('builds the Discover chips from CATEGORIES', () => {
    const src = read('components/DiscoveryFeedView.tsx');
    expect(src).toMatch(/from '\.\.\/utils\/categories'/);
    // The old literal chip array carried its match lists inline.
    expect(src).not.toMatch(/match: \['Cars', 'Vehicles'\]/);
  });

  it('makes the concierge form carry a real category', () => {
    const src = read('components/SellView.tsx');
    expect(src).toMatch(/category: cCategory/);
  });

  it('makes the drop payload carry the picked category', () => {
    const src = read('utils/dropPayload.ts');
    expect(src).toMatch(/category: input\.category/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categoryConsumers.wiring.test.ts`
Expected: FAIL — `channelToCategory` still present in all three files.

- [ ] **Step 3: Collapse `categoryLabel.ts` into a re-export**

Replace the entire contents of `src/utils/categoryLabel.ts` with:

```ts
/**
 * Kept as a module so the ~10 existing import sites do not churn. The taxonomy
 * itself moved to `categories.ts` when the seller picker, the drop builder, the
 * concierge form and the Discover chips were unified onto one list.
 */
export { categoryLabel } from './categories';
```

- [ ] **Step 4: Delete `channelToCategory`**

In `src/utils/dropChannel.ts`, delete the `channelToCategory` function (lines 17-27). Leave `DropChannel`, `DROP_CHANNELS` and `channelLabel` untouched — the drop channel is still a real concept for WhatsApp routing; it just stops doubling as the buyer-facing category.

- [ ] **Step 5: Make the drop payload take a category**

In `src/utils/dropPayload.ts`: remove `channelToCategory` from the import on line 27 (keep `type DropChannel`), add `category: string;` to the `DropPayloadInput` interface, and change line 74:

```ts
    category: input.category,
```

- [ ] **Step 6: Rebuild the seller picker**

In `src/components/ListingWizardView.tsx`, add the import:

```ts
import { CATEGORIES } from '../utils/categories';
```

Replace the `category` state type on line 24 with `useState<string>('Electronics')`, and replace the whole `categoriesOpt` array (lines 59-68) with:

```ts
  const categoriesOpt = CATEGORIES.map(c => ({
    label: isAr ? c.labelAr : c.labelEn,
    value: c.value,
  }));
```

This removes the duplicate Phones/Electronics pair (two labels writing one value), starts storing `Watches` instead of `Luxury`, and makes Real Estate selectable for the first time.

- [ ] **Step 7: Give the concierge form a category field**

In `src/components/SellView.tsx`: drop `channelToCategory` from the line 5 import (keep `DROP_CHANNELS` and `type DropChannel`), add `import { CATEGORIES } from '../utils/categories';`, add state `const [cCategory, setCCategory] = useState<string>('Electronics');` beside the existing `cChannel` state, and change line 179 to `category: cCategory,`.

Render a category `<select>` directly beneath the existing channel picker, matching the surrounding form's markup:

```tsx
<label className="block text-[11px] font-black text-fg-muted mb-1.5">
  {isAr ? 'الفئة' : 'Category'}
</label>
<select
  value={cCategory}
  onChange={(e) => setCCategory(e.target.value)}
  className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2.5 text-sm text-fg"
>
  {CATEGORIES.map(c => (
    <option key={c.value} value={c.value}>{isAr ? c.labelAr : c.labelEn}</option>
  ))}
</select>
```

- [ ] **Step 8: Rebuild the Discover chips**

In `src/components/DiscoveryFeedView.tsx`, add `import { CATEGORIES, matchValues } from '../utils/categories';` and replace the literal category entries in `categoriesList` (lines 397-409) with a generated tail, keeping the two special leading chips exactly as they are:

```tsx
  const categoriesList = React.useMemo(() => [
    { name: 'All', icon: <LayoutGrid className="w-3.5 h-3.5" />, arName: 'الكل', match: null as string[] | null },
    // Special filter: live 'first_bid' lots awaiting their first bid (see feedMode).
    // `match: null` — the hook switches to a dedicated query, so no category clause.
    { name: 'Be the First', icon: <Zap className="w-3.5 h-3.5" />, arName: 'كن أول مزايد', match: null },
    ...CATEGORIES.map(c => ({
      name: c.labelEn,
      icon: CATEGORY_ICONS[c.value] ?? <Package className="w-3.5 h-3.5" />,
      arName: c.labelAr,
      match: matchValues(c.value),
    })),
  ], []);
```

**Watch the chip identity.** The old list named the vehicles chip `'Cars'` and the phones chip `'Phones'`; the generated list names them from `labelEn`, so `'Cars'` becomes `'Vehicles'`. Before changing it, grep this file for how the selected chip is tracked (`selectedCategory`, `setSelectedCategory`, and any `localStorage` persistence). If selection is compared by `name`, either keep comparing by a stable key you add to the generated objects (`key: c.value`) or clear the persisted value on first load — otherwise a returning user's saved `'Cars'` matches no chip and the feed silently renders empty.

Add the icon map above the component, preserving the icons already in use:

```tsx
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Vehicles': <Car className="w-3.5 h-3.5" />,
  'Phones': <Smartphone className="w-3.5 h-3.5" />,
  'Electronics': <Laptop className="w-3.5 h-3.5" />,
  'Watches': <Watch className="w-3.5 h-3.5" />,
  'Appliances': <Refrigerator className="w-3.5 h-3.5" />,
  'Home & Furniture': <Sofa className="w-3.5 h-3.5" />,
  'Real Estate': <Building2 className="w-3.5 h-3.5" />,
  'Fashion': <Package className="w-3.5 h-3.5" />,
};
```

- [ ] **Step 9: Run the wiring test and the full suite**

Run: `npx vitest run src/utils/categoryConsumers.wiring.test.ts`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: PASS. `dropPayload.test.ts` will fail if it constructs a `DropPayloadInput` without `category` — add `category: 'Electronics'` to its fixtures and assert `category` round-trips.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "fix(categories): one taxonomy across all five surfaces

Watches stored 'Luxury', which matched no Discover chip — every watch a seller
listed was invisible under every category filter except All. Real Estate had a
chip no seller could populate. The drop builder and concierge form collapsed
every lot to one of three values.

channelToCategory is deleted; channel and category are now independent fields."
```

---

### Task 3: One media rule, enforced on every publish path

**Files:**
- Create: `src/utils/listingMedia.ts`
- Create: `src/utils/listingMedia.test.ts`
- Modify: `src/utils/dropFormState.ts` (`validateDropForm`, `ERROR_FIELD_ORDER`)
- Modify: `src/utils/dropFormState.test.ts`
- Modify: `src/components/admin/cards/ListingApprovalCard.tsx:48`
- Modify: `src/components/AuctionDropBuilderView.tsx:302,408`
- Create: `src/components/dropBuilderMediaGate.wiring.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `docHasMedia(a) => boolean`, `draftHasMedia(d) => boolean`. `validateDropForm` gains a third parameter: `(v: DropFormValues, now: number, hasMedia: boolean)`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/listingMedia.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { docHasMedia, draftHasMedia } from './listingMedia';

describe('docHasMedia', () => {
  it('accepts a lot with only a cover image', () => {
    expect(docHasMedia({ thumbnailUrl: 'https://x/a.jpg' })).toBe(true);
  });
  it('accepts a lot with only a video', () => {
    expect(docHasMedia({ videoUrl: 'https://x/a.mp4' })).toBe(true);
  });
  it('accepts a lot with only a gallery', () => {
    expect(docHasMedia({ mediaUrls: ['https://x/a.jpg'] })).toBe(true);
  });
  it('rejects a lot with nothing', () => {
    expect(docHasMedia({})).toBe(false);
    expect(docHasMedia({ thumbnailUrl: '', videoUrl: null, mediaUrls: [] })).toBe(false);
  });
  it('rejects a whitespace-only url, which is not an image', () => {
    expect(docHasMedia({ thumbnailUrl: '   ' })).toBe(false);
  });
});

describe('draftHasMedia', () => {
  it('accepts a draft with only a cover file', () => {
    expect(draftHasMedia({ thumbnailFile: {} })).toBe(true);
  });
  it('accepts a draft with only a video file', () => {
    expect(draftHasMedia({ videoFile: {} })).toBe(true);
  });
  it('accepts a draft with only gallery photos', () => {
    expect(draftHasMedia({ gallery: [{}] })).toBe(true);
  });
  it('rejects an empty draft', () => {
    expect(draftHasMedia({})).toBe(false);
    expect(draftHasMedia({ thumbnailFile: null, videoFile: null, gallery: [] })).toBe(false);
  });
});

describe('the two adapters agree', () => {
  // They read different shapes (saved doc vs unsaved Files) but encode ONE
  // rule. If they drift, one publish path silently reopens the hole that made
  // the stock-photo fallback necessary.
  const cases: [boolean, boolean][] = [
    [docHasMedia({ thumbnailUrl: 'u' }), draftHasMedia({ thumbnailFile: {} })],
    [docHasMedia({ videoUrl: 'u' }),     draftHasMedia({ videoFile: {} })],
    [docHasMedia({ mediaUrls: ['u'] }),  draftHasMedia({ gallery: [{}] })],
    [docHasMedia({}),                    draftHasMedia({})],
  ];
  it.each(cases)('agree on the same logical input (%s === %s)', (a, b) => {
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/listingMedia.test.ts`
Expected: FAIL — `Failed to resolve import "./listingMedia"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/listingMedia.ts`:

```ts
/**
 * ONE rule: a listing has media if it has any of cover / gallery / video.
 *
 * Two adapters because the two publish paths hold media in different shapes —
 * the approval card reads a SAVED doc (url strings), the drop builder holds
 * UNSAVED File objects in component state that `DropFormValues` does not carry.
 * Keeping both here is what stops the two gates drifting apart; a shared test
 * asserts they agree.
 *
 * This gate is why the stock-photo fallback could be deleted: the fallback
 * existed only because a lot could publish with no image at all.
 */
const present = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim() !== '' : v != null;

export function docHasMedia(a: {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: unknown[] | null;
}): boolean {
  return present(a.thumbnailUrl) || present(a.videoUrl) || (a.mediaUrls?.length ?? 0) > 0;
}

export function draftHasMedia(d: {
  thumbnailFile?: unknown;
  videoFile?: unknown;
  gallery?: unknown[] | null;
}): boolean {
  return present(d.thumbnailFile) || present(d.videoFile) || (d.gallery?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/listingMedia.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the failing validator test**

Append to `src/utils/dropFormState.test.ts`:

```ts
describe('validateDropForm media gate', () => {
  const ok = { ...INITIAL_FORM, productName: 'Skyworth 55" TV', startingPrice: '100' };

  it('refuses to publish a lot with no media', () => {
    const errors = validateDropForm(ok, Date.now(), false);
    expect(errors.media).toBe('REQUIRED');
  });

  it('publishes a complete lot that has media', () => {
    expect(validateDropForm(ok, Date.now(), true)).toEqual({});
  });

  it('sends the admin to the media picker before the timing field', () => {
    // Visual order: name, price, media, then timing.
    const errors = validateDropForm({ ...ok, productName: '' }, Date.now(), false);
    expect(firstErrorField(errors)).toBe('productName');
    expect(firstErrorField(validateDropForm(ok, Date.now(), false))).toBe('media');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/utils/dropFormState.test.ts`
Expected: FAIL — `errors.media` is `undefined`.

- [ ] **Step 7: Add the gate to the validator**

In `src/utils/dropFormState.ts`, change the signature and add the check:

```ts
export function validateDropForm(
  v: DropFormValues,
  now: number,
  hasMedia: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!v.productName.trim()) errors.productName = 'REQUIRED';

  const price = Number(v.startingPrice);
  if (!Number.isFinite(price) || price <= 0) errors.startingPrice = 'REQUIRED';

  // Media is passed in, not read off `v`: the files are File objects living in
  // component state, deliberately not part of serialisable form state. Keeping
  // the validator pure is what lets it run in the node test environment.
  if (!hasMedia) errors.media = 'REQUIRED';

  const opensError = validateOpens(v.opensMode, v.scheduledLocal, now);
  if (opensError) errors.scheduledLocal = opensError;

  return errors;
}
```

And add `'media'` to `ERROR_FIELD_ORDER`, between `startingPrice` and `scheduledLocal`:

```ts
const ERROR_FIELD_ORDER: (keyof DropFormValues | 'media')[] = [
  'productName',
  'startingPrice',
  'media',
  'scheduledLocal',
];
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/utils/dropFormState.test.ts`
Expected: PASS. Pre-existing tests in this file call `validateDropForm(form, now)` with two arguments — update each to pass `true` as the third, since they assert non-media behaviour.

- [ ] **Step 9: Write the failing call-site wiring test**

Create `src/components/dropBuilderMediaGate.wiring.test.ts`:

```ts
// `validateDropForm` has TWO call sites in the drop builder. A missed one
// silently reopens the exact hole that let image-less lots reach the feed and
// pick up a stock photo of an unrelated product — and tsc will not catch it
// (no strict mode; see the repo's testing notes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./AuctionDropBuilderView.tsx', import.meta.url), 'utf8');

describe('drop builder media gate', () => {
  it('passes a media argument at every validateDropForm call site', () => {
    const calls = src.match(/validateDropForm\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call, call).toMatch(/,\s*(hasMedia|draftHasMedia\()/);
    }
  });

  it('derives that argument from the shared rule, not a local expression', () => {
    expect(src).toMatch(/from '\.\.\/utils\/listingMedia'/);
    expect(src).toMatch(/draftHasMedia\(/);
  });

  it('renders a media error the admin can actually see', () => {
    expect(src).toMatch(/errors\.media|errors\['media'\]/);
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/components/dropBuilderMediaGate.wiring.test.ts`
Expected: FAIL — no `listingMedia` import.

- [ ] **Step 11: Wire the drop builder**

In `src/components/AuctionDropBuilderView.tsx`, add the import:

```ts
import { draftHasMedia } from '../utils/listingMedia';
```

Add the derivation near the other memos:

```ts
  const hasMedia = draftHasMedia({ thumbnailFile, videoFile, gallery: extraPhotos });
```

Update **both** call sites (currently lines 302 and 408) to `validateDropForm(form, Date.now(), hasMedia)`.

Render the error on the media picker, matching the form's existing per-field error markup:

```tsx
{errors.media && (
  <p id="media" className="text-[11px] font-black text-red-500 mt-1.5">
    {isAr ? 'أضف صورة أو فيديو للمنتج قبل النشر' : 'Add a photo or video of the product before publishing'}
  </p>
)}
```

- [ ] **Step 12: Point the approval card at the shared rule**

In `src/components/admin/cards/ListingApprovalCard.tsx`, add `import { docHasMedia } from '../../../utils/listingMedia';` and replace line 48:

```ts
  const hasMedia = docHasMedia(auction);
```

- [ ] **Step 13: Run the suite**

Run: `npx vitest run src/components/dropBuilderMediaGate.wiring.test.ts`
Expected: PASS, 3 tests.

Run: `npm test && npm run lint`
Expected: PASS, clean.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(publish): a lot cannot go live without a photo

The seller path already gated this hard (ListingApprovalCard: 'No photo/video —
cannot approve'). The admin drop builder did not: validateDropForm checked only
name and price, so Mazad's own drops reached the feed image-less and the
createListing fallback supplied a stock photo of an unrelated product.

One rule now, in listingMedia.ts, called by both paths."
```

---

### Task 4: A missing image looks missing

**Files:**
- Create: `src/components/ui/ListingImage.tsx`
- Modify: `src/context/AppContext.tsx:3960-3971` (delete the fallback block)
- Modify: `src/components/DiscoveryFeedView.tsx:143-156`
- Create: `src/components/listingImage.wiring.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `<ListingImage src alt isAr className imgClassName onLoad />` — `isAr` is required, the placeholder carries a bilingual label.

- [ ] **Step 1: Write the failing wiring test**

Create `src/components/listingImage.wiring.test.ts`:

```ts
// The app used to INVENT a product photo. createListing picked a stock Unsplash
// image by keyword when no thumbnail was uploaded, and its else-branch was a
// photo of red Nike sneakers — which is what a Skyworth TV got, because a TV is
// the 'misc' channel, stored 'Fashion', matching none of the keyword branches.
// The card's onError handler independently swapped in a stock wristwatch.
//
// Neither was a broken image link. The rule now: the app never displays a
// photograph it did not receive for that lot.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('listing images are never fabricated', () => {
  it('has no stock-photo fallback in createListing', () => {
    const src = read('context/AppContext.tsx');
    expect(src).not.toMatch(/photo-1542291026-7eec264c27ff/); // the Nike sneakers
    expect(src).not.toMatch(/if \(!finalThumbnailUrl\)/);
  });

  it('has no stock photo on the discovery card, src or onError', () => {
    const src = read('components/DiscoveryFeedView.tsx');
    expect(src).not.toMatch(/images\.unsplash\.com/);
  });

  it('routes the card through ListingImage', () => {
    expect(read('components/DiscoveryFeedView.tsx')).toMatch(/<ListingImage/);
  });

  it('gives the placeholder a bilingual label rather than a bare box', () => {
    const src = read('components/ui/ListingImage.tsx');
    expect(src).toMatch(/isAr|lang ===/);
  });
});
```

Note: the avatar placeholders in `AppContext.tsx` are a different concern (`avatarPlaceholder.ts` owns those) and are unaffected — the first assertion targets the listing thumbnail block only, by its exact photo id and guard.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/listingImage.wiring.test.ts`
Expected: FAIL — the Nike photo id is still present.

- [ ] **Step 3: Build the component**

Create `src/components/ui/ListingImage.tsx`:

```tsx
import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * A lot's image, or an honest blank.
 *
 * Replaces two fabrications: `createListing` invented a stock Unsplash photo by
 * category keyword when nothing was uploaded, and the discovery card's onError
 * swapped in a stock wristwatch. Both rendered someone else's product as this
 * lot's, which reads as a broken image LINK and is actually a fabricated image.
 *
 * The placeholder is deliberately not a photograph — no stock imagery can be
 * correct for an unknown product, so the honest answer is a labelled blank.
 */
interface Props {
  src?: string | null;
  alt: string;
  isAr: boolean;
  /** Applied to the wrapper (both states), so callers keep their layout. */
  className?: string;
  /** Applied to the <img> only. */
  imgClassName?: string;
  onLoad?: () => void;
}

const ListingImage: React.FC<Props> = ({ src, alt, isAr, className = '', imgClassName = '', onLoad }) => {
  const [failed, setFailed] = useState(false);
  const usable = typeof src === 'string' && src.trim() !== '' && !failed;

  if (!usable) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-surface-sunken text-fg-muted ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="w-6 h-6 opacity-40" />
        <span className="text-[9px] font-black tracking-wide opacity-60">
          {isAr ? 'لا توجد صورة' : 'No photo'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src as string}
      alt={alt}
      className={`${className} ${imgClassName}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onLoad={onLoad}
      onError={() => {
        // Fall back to the placeholder — never to a different product's photo.
        setFailed(true);
        onLoad?.();
      }}
    />
  );
};

export default ListingImage;
```

- [ ] **Step 4: Delete the fabrication in `createListing`**

In `src/context/AppContext.tsx`, delete the entire block at lines 3960-3971 (`if (!finalThumbnailUrl) { … }`). Leave `finalThumbnailUrl` as whatever the upload produced — `''` when there was no file. Task 3's gate means a new lot cannot reach here empty; historical lots that are empty now render the placeholder.

- [ ] **Step 5: Route the discovery card through the component**

In `src/components/DiscoveryFeedView.tsx`, add `import ListingImage from './ui/ListingImage';` and replace the `<img>` block (lines 143-156) with:

```tsx
        <ListingImage
          src={item.thumbnailUrl}
          alt={item.title}
          isAr={isAr}
          className={`absolute inset-0 w-full h-full transition-all duration-500 ${
            !imageLoaded ? 'opacity-0' : itemIsEnded ? 'opacity-60 grayscale-[35%]' : 'opacity-100'
          }`}
          imgClassName="object-cover group-hover:scale-105"
          onLoad={() => setImageLoaded(true)}
        />
```

The placeholder branch has no `onLoad`, so `imageLoaded` would stay false and hold the shimmer forever. Seed it instead — change the state initialiser to:

```tsx
  const [imageLoaded, setImageLoaded] = useState(() => !item.thumbnailUrl);
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/components/listingImage.wiring.test.ts`
Expected: PASS, 4 tests.

Run: `npm test && npm run lint`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(images): stop inventing a product photo

createListing picked a stock Unsplash image by category keyword when no
thumbnail was uploaded; the else-branch was a photo of red Nike sneakers, which
is what a Skyworth TV received (a TV is 'misc' → stored 'Fashion' → matched no
keyword branch). The discovery card separately swapped in a stock wristwatch on
any image error.

Nothing was mislinked — the app wrote a photograph it was never given. A missing
image now renders a labelled blank."
```

---

### Task 5: Tell the seller what to fix

**Files:**
- Modify: `src/components/SellerCenterView.tsx:99-113,150,227,269,346,1439`
- Modify: `src/components/admin/cards/ListingApprovalCard.tsx`
- Create: `src/utils/rejectionReasons.ts`
- Create: `src/utils/rejectionReasons.test.ts`
- Create: `src/components/rejectionReason.wiring.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `REJECTION_PRESETS`, `rejectionPresetLabel(key, isAr)`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/rejectionReasons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REJECTION_PRESETS, rejectionPresetLabel } from './rejectionReasons';

describe('rejection presets', () => {
  it('covers the two reasons that actually recur', () => {
    const keys = REJECTION_PRESETS.map(p => p.key);
    expect(keys).toContain('wrong_category');
    expect(keys).toContain('bad_photos');
  });

  it('phrases every preset as an instruction, not a verdict', () => {
    // The seller reads this as their next action. "Rejected" tells them they
    // failed; "Fix the category" tells them what to do.
    for (const p of REJECTION_PRESETS) {
      expect(p.ar.trim(), p.key).not.toBe('');
      expect(p.en.trim(), p.key).not.toBe('');
    }
  });

  it('labels a known preset in both languages', () => {
    expect(rejectionPresetLabel('wrong_category', false)).toBe('Fix the category');
    expect(rejectionPresetLabel('wrong_category', true)).toBe('صحّح التصنيف');
  });

  it('echoes a historical free-text reason unchanged', () => {
    // Reasons stored before presets existed are arbitrary strings and must
    // still render to the seller.
    expect(rejectionPresetLabel('blurry photo of the box', false)).toBe('blurry photo of the box');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/rejectionReasons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/utils/rejectionReasons.ts`:

```ts
/**
 * Why a listing was sent back, phrased as the seller's next action.
 *
 * `rejectionReason` has been written on every reject and cleared on every
 * resubmit since the review gate shipped — and rendered NOWHERE. The seller saw
 * only the badge "مرفوض / Rejected" and had to guess.
 *
 * Presets are stored as their key; anything else is historical free text and is
 * echoed unchanged, so the seller-side render works for every existing doc.
 */
export interface RejectionPreset {
  key: string;
  ar: string;
  en: string;
}

export const REJECTION_PRESETS: readonly RejectionPreset[] = [
  { key: 'wrong_category', ar: 'صحّح التصنيف',              en: 'Fix the category' },
  { key: 'bad_photos',     ar: 'أضف صوراً واضحة للمنتج',    en: 'Add clear photos of the product' },
  { key: 'prohibited',     ar: 'هذا الصنف غير مسموح',       en: 'This item is not allowed' },
  { key: 'bad_title',      ar: 'اكتب اسماً وصفياً للمنتج',  en: 'Write a descriptive product name' },
] as const;

export function rejectionPresetLabel(reason: string, isAr: boolean): string {
  const hit = REJECTION_PRESETS.find(p => p.key === reason);
  if (!hit) return reason;
  return isAr ? hit.ar : hit.en;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/utils/rejectionReasons.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing wiring test**

Create `src/components/rejectionReason.wiring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

describe('the seller learns what to fix', () => {
  it('renders the stored rejection reason', () => {
    const src = read('SellerCenterView.tsx');
    // It was written and cleared but never displayed.
    expect(src).toMatch(/rejectionPresetLabel\(/);
  });

  it('calls the state Needs editing, not Rejected', () => {
    // The state has always been editable and resubmittable
    // (handleResubmit sets status back to 'processing'). Only the label
    // called it final.
    const src = read('SellerCenterView.tsx');
    expect(src).toMatch(/يحتاج تعديل/);
    expect(src).toMatch(/Needs editing/);
    expect(src).not.toMatch(/en: 'Rejected'/);
  });

  it('offers the admin preset reasons', () => {
    expect(read('admin/cards/ListingApprovalCard.tsx')).toMatch(/REJECTION_PRESETS/);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/rejectionReason.wiring.test.ts`
Expected: FAIL.

- [ ] **Step 7: Relabel the state**

In `src/components/SellerCenterView.tsx`, change the four label sites. Line 103:

```ts
  rejected: { ar: 'يحتاج تعديل', en: 'Needs editing' },
```

Line 150 → `rejected: 'يحتاج تعديل',`; line 227 → `bucket_rejected: 'يحتاج تعديل',`; line 269 → `rejected: 'Needs editing',`; line 346 → `bucket_rejected: 'Needs editing',`.

The stored status value `rejected` is unchanged — this is copy only. No query, filter or write is touched.

- [ ] **Step 8: Render the reason**

In `src/components/SellerCenterView.tsx`, add `import { rejectionPresetLabel } from '../utils/rejectionReasons';`.

After the card's action-button row closes (the `</div>` at line 1478, immediately before the `showAcceptOffer` block), add a banner mirroring that block's markup so the card keeps one visual language:

```tsx
{auction.status === 'rejected' && auction.rejectionReason && (
  <div className="mx-3.5 mb-3.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5" id={`needs-editing-${auction.id}`}>
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11.5px] font-black text-amber-900 leading-snug">
          {rejectionPresetLabel(auction.rejectionReason, isAr)}
        </p>
        <p className="text-[10px] text-amber-700/90 font-semibold leading-relaxed">
          {isAr
            ? 'عدّل الإعلان ثم أعد إرساله للمراجعة.'
            : 'Edit the listing and resubmit it for review.'}
        </p>
      </div>
    </div>
  </div>
)}
```

`AlertTriangle` is already imported in this file.

- [ ] **Step 9: Add preset chips to the approval card**

In `src/components/admin/cards/ListingApprovalCard.tsx`, add `import { REJECTION_PRESETS } from '../../../utils/rejectionReasons';` and render a chip row directly above the existing reason textarea (line 80), prefilling it:

```tsx
<div className="flex flex-wrap gap-1.5 mb-2">
  {REJECTION_PRESETS.map(p => (
    <button
      key={p.key}
      type="button"
      onClick={() => setReason(p.key)}
      className={`px-2.5 py-1 rounded-full text-[10px] font-black border transition-colors cursor-pointer ${
        reason === p.key
          ? 'bg-amber-100 border-amber-300 text-amber-900'
          : 'bg-surface-raised border-line text-fg-muted hover:text-fg'
      }`}
    >
      {isAr ? p.ar : p.en}
    </button>
  ))}
</div>
```

The existing `disabled={!reason.trim()}` guard on the reject button is unchanged, so a preset satisfies it and free text still works.

- [ ] **Step 10: Run the suite**

Run: `npx vitest run src/components/rejectionReason.wiring.test.ts`
Expected: PASS, 3 tests.

Run: `npm test && npm run lint`
Expected: PASS, clean.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(seller): say what to fix, not just that it failed

rejectionReason has been stored on every reject and cleared on every resubmit
since the review gate shipped, and rendered nowhere — the seller saw the badge
'Rejected' and had to guess. The state was always editable and resubmittable;
only the label called it final."
```

---

### Task 6: Backfill the mis-bucketed lots

**Files:**
- Create: `scripts/admin/backfill-categories.cjs`
- Create: `scripts/admin/classifyCategory.cjs`
- Create: `scripts/admin/classifyCategory.test.ts`

**Interfaces:**
- Consumes: the canonical values from Task 1 (`Electronics`, `Watches`, …).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing test**

Create `scripts/admin/classifyCategory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
// @ts-expect-error — .cjs module, no types
import { classifyCategory } from './classifyCategory.cjs';

describe('classifyCategory', () => {
  it('reads an English television as Electronics', () => {
    expect(classifyCategory('Skyworth 55" Smart TV')).toBe('Electronics');
  });

  it('reads an Arabic television as Electronics', () => {
    expect(classifyCategory('شاشة سكاي ورث ٥٥ بوصة')).toBe('Electronics');
  });

  it('reads a watch in either language', () => {
    expect(classifyCategory('Rolex Submariner')).toBe('Watches');
    expect(classifyCategory('ساعة رولكس')).toBe('Watches');
  });

  it('reads a phone as Phones, not generic Electronics', () => {
    expect(classifyCategory('iPhone 15 Pro Max')).toBe('Phones');
    expect(classifyCategory('جوال ايفون ١٥')).toBe('Phones');
  });

  it('reads a car in either language', () => {
    expect(classifyCategory('Toyota Corolla 2019')).toBe('Vehicles');
    expect(classifyCategory('سيارة تويوتا كورولا')).toBe('Vehicles');
  });

  it('LEAVES an unrecognised title alone rather than guessing', () => {
    // A wrong auto-guess on a live auction is worse than the status quo.
    expect(classifyCategory('لوحة فنية قديمة')).toBeNull();
    expect(classifyCategory('')).toBeNull();
    expect(classifyCategory(undefined)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyCategory('SAMSUNG FRIDGE')).toBe('Appliances');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/admin/classifyCategory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the classifier**

Create `scripts/admin/classifyCategory.cjs`:

```js
/**
 * Title → category, by keyword, for the one-off backfill of lots stored under
 * the 'Fashion' catch-all.
 *
 * Returns null for anything it does not recognise, and the caller LEAVES THOSE
 * ALONE. A wrong automatic guess on a live auction is worse than the
 * mis-bucketing it would replace, so no fuzzy matching and no "best effort"
 * default.
 *
 * Order matters: phones are checked before generic electronics so an iPhone
 * lands in Phones rather than Electronics.
 */
const RULES = [
  { category: 'Phones',      words: ['iphone', 'samsung galaxy', 'phone', 'smartphone', 'جوال', 'هاتف', 'ايفون', 'آيفون'] },
  { category: 'Vehicles',    words: ['toyota', 'hyundai', 'kia', 'mercedes', 'bmw', 'car', 'سيارة', 'مركبة'] },
  { category: 'Watches',     words: ['rolex', 'omega', 'watch', 'ساعة', 'ساعه'] },
  { category: 'Appliances',  words: ['fridge', 'refrigerator', 'washing machine', 'oven', 'ثلاجة', 'غسالة', 'فرن'] },
  { category: 'Electronics', words: ['tv', 'television', 'laptop', 'macbook', 'playstation', 'شاشة', 'تلفزيون', 'لابتوب'] },
  { category: 'Home & Furniture', words: ['sofa', 'table', 'chair', 'كنبة', 'طاولة', 'كرسي'] },
  { category: 'Real Estate', words: ['apartment', 'land', 'شقة', 'أرض', 'قطعة أرض'] },
];

function classifyCategory(title) {
  const t = String(title ?? '').toLowerCase();
  if (!t.trim()) return null;
  for (const rule of RULES) {
    if (rule.words.some(w => t.includes(w))) return rule.category;
  }
  return null;
}

module.exports = { classifyCategory, RULES };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scripts/admin/classifyCategory.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the runner**

Create `scripts/admin/backfill-categories.cjs`, following the service-account pattern in `scripts/admin/unblock-user.cjs`:

```js
/**
 * Two-phase category backfill.
 *
 *   node scripts/admin/backfill-categories.cjs            # report only, writes nothing
 *   node scripts/admin/backfill-categories.cjs --apply    # writes
 *
 * Phase 1 prints every proposed change so a human approves the set before it
 * touches live auctions. Lots with active bids are INCLUDED (a category
 * correction does not affect bidding) but flagged in the report so they can be
 * excluded by hand.
 *
 * 'Luxury' → 'Watches' is a rename, not a guess, and applies unconditionally:
 * 'Luxury' matches no Discover chip, so those lots are currently invisible
 * under every category filter.
 *
 * Idempotent: the classifier is a pure function of the title, so re-running
 * --apply over corrected lots is a no-op.
 */
const admin = require('firebase-admin');
const { classifyCategory } = require('./classifyCategory.cjs');

const APPLY = process.argv.includes('--apply');

admin.initializeApp({
  credential: admin.credential.cert(require(process.env.MAZADJO_SA_KEY)),
});
const db = admin.firestore();

(async () => {
  const snap = await db.collection('auctions').where('category', 'in', ['Fashion', 'Luxury']).get();
  const changes = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const from = d.category;
    const to = from === 'Luxury' ? 'Watches' : classifyCategory(d.title);
    if (!to || to === from) continue;
    changes.push({ id: doc.id, title: d.title, from, to, bids: d.totalBids || 0, status: d.status });
  }

  console.log(`\n${snap.size} lots in Fashion/Luxury; ${changes.length} would change:\n`);
  console.table(changes);
  const withBids = changes.filter(c => c.bids > 0);
  if (withBids.length) {
    console.log(`\n⚠  ${withBids.length} of these have live bids: ${withBids.map(c => c.id).join(', ')}\n`);
  }

  if (!APPLY) {
    console.log('Report only. Re-run with --apply to write.\n');
    process.exit(0);
  }

  let batch = db.batch();
  let n = 0;
  for (const c of changes) {
    batch.update(db.collection('auctions').doc(c.id), { category: c.to });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`✅ Updated ${changes.length} lots.\n`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run phase 1 against prod and read the output**

```bash
MAZADJO_SA_KEY=<path to the mazadjoapp service-account key> \
  node scripts/admin/backfill-categories.cjs
```

Expected: a table of proposed changes, no writes. **Do not run `--apply` yet** — the report goes to MJ first (see Manual verification below).

- [ ] **Step 7: Commit**

```bash
git add scripts/admin/
git commit -m "feat(scripts): two-phase category backfill

Reports by default and writes only with --apply. An unrecognised title keeps its
current category rather than being guessed at — a wrong auto-guess on a live
auction is worse than the mis-bucketing."
```

---

## Manual verification before merge

Run the app (`npm run dev`) and check each, on mobile width and desktop:

- [ ] Drop builder: fill name + price, attach nothing, publish → blocked with the media message, form scrolls to the picker.
- [ ] Drop builder: the category picker offers all 8 categories; publishing writes the picked one (verify in Firestore, not just the UI).
- [ ] Seller wizard: pick Watches → the doc stores `Watches`; the lot appears under the Watches chip on Discover.
- [ ] Discover: a lot with no image renders the labelled blank, not a photograph. No shimmer stuck on.
- [ ] Discover: Real Estate chip is present and selectable.
- [ ] Seller Center: a rejected lot reads "Needs editing" with the reason as an instruction, and the edit button still works.
- [ ] Admin approval card: preset chips prefill the reason; reject still requires a non-empty reason.
- [ ] Both themes (light and dark) on the placeholder and the needs-editing banner.

**Preview gate:** the card placeholder and the Seller Center relabel are customer-facing composition changes. Per `feedback_visual_changes_need_mj_eyes`, MJ previews and approves these before merge.

**Backfill gate:** phase 1's report goes to MJ. `--apply` runs only after approval, and after checking whether `Luxury` appears as a facet value in the Algolia index — a stale facet would silently drop watches from search.

## Deployment note

Per `reference_mazadjo_worktree_deploy`: if deploying from a worktree, diff `functions/` against `origin/main` first. This epic changes no `functions/` code, so a functions deploy should not be needed — verify rather than assume.

---

## Deviations from this plan, and why

Recorded during execution. All are expansions found by the code or by
production data, not scope changes.

1. **Six category consumers, not five.** `src/services/search/searchMap.ts`
   carried a hand-copied duplicate of the Discover chip match lists under a
   "keep this in sync" comment — and had already drifted: no entry for the
   catch-all chip, so searching inside it applied no category facet at all. It
   is now generated from `categories.ts`.

2. **`categoryToChannel` replaces `channelToCategory`.** The plan said delete
   the latter; the concierge form still needed a WhatsApp routing channel. The
   mapping now runs the other way — the item's category picks the audience,
   which is sound, where deriving a category from an audience could only ever
   produce three categories.

3. **`category` joins `DropFormValues`.** The plan left the drop builder's
   category "a field on the channel selector". It is serialisable state, so it
   belongs in the form object with the rest, and it carries over on "create
   another" like the other batch settings.

4. **Twelve image fabrications, not two.** The reported symptoms were
   `createListing` and the Discovery card. The same `|| '<unsplash url>'`
   pattern was in ten more places: the drop builder's three lot pickers, the
   seller's listing rows, and six order surfaces where it showed a buyer a
   stock photo of a product they had not won. All are fixed and the wiring test
   covers every one.

5. **`vitest.config.ts` now globs `scripts/**/*.test.ts`.** Task 6's classifier
   tests live under `scripts/`, which no glob matched — they would have been
   collected by nothing and "passed" by never running.

6. **A second backfill: `backfill-stock-covers.cjs`.** Task 6 covered
   categories only. Production data showed 23 lots already wearing a fabricated
   cover (12 the Nike sneakers, 12 buyer-visible), and 18 of them already hold
   real photographs in `mediaUrls`. Removing the fallback does not clean those
   up, so a second two-phase script promotes the lot's own gallery image to its
   cover. Five lots have no real media at all and are reported as human work.

7. **The classifier was widened from real data.** The first pass left 129 of
   the catch-all unclassified. Reading the actual titles showed the gap was
   vocabulary — two live spellings of ميكروويف, plus خلاط / مقلى / غلاية /
   مروحة / مكنسة / برادة / كشاف, and PS4 / ايباد. 130 lots now auto-classify
   and 67 remain for a human. Appliances moved ahead of Home & Furniture so
   "برادة مياه طاولة" reads as a water cooler rather than a table.

## Production findings (read-only, from phase-1 reports)

- 249 lots total; **zero** have no media at all, because the fallback always
  wrote *something*. The risk flagged in the spec ("removing the fallback makes
  lots visibly blank") does not materialise.
- **23 lots carry a stock cover photo**, 12 of them the Nike sneakers, 12
  live/upcoming.
- 221 lots sit in Fashion / Luxury / Electronics; **130 would be recategorised**,
  14 of those have live bids, and 67 need a human.
