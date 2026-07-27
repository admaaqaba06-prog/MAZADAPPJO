# Admin Drop Builder UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin drop builder as an essentials-first form with a real success state, edit/cancel, proper media pickers and a working mobile layout — without changing what a drop actually publishes.

**Architecture:** All decision logic moves out of `AuctionDropBuilderView.tsx` into pure modules under `src/utils/`, each with its own `.test.ts`. The view keeps layout and submit orchestration only. A characterization test locks today's `createListing` payload before any UI work starts, so the refactor is provably behaviour-preserving.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest 2 (`environment: 'node'`), Firebase v12 client SDK.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-27-drop-builder-ux-design.md`. Read it before Task 1.
- **Worktree:** work only in this worktree, branch `feat/drop-builder-ux`. Never run git commands in `/Users/mj/code/mazadjo` — concurrent sessions use that directory.
- **Test environment is `node`, not jsdom.** There is no `@testing-library/react` and no `jsdom` in this repo. **Do not write component-rendering tests.** Follow the established pattern (`src/components/SwipeToBid.test.ts`): keep logic in pure modules and test those. React components are verified by `npm run build` plus manual browser checks.
- **There is no Firestore rules test harness** (`@firebase/rules-unit-testing` is not a dependency; `firebase.json` has no emulators block). Task 12's rule change is verified manually in the Firebase console Rules Playground. Do not add an emulator harness.
- Run `npm test` (`vitest run`) and `npm run build` before every commit. Both must pass.
- `npm run lint` is `tsc --noEmit` and **cannot fully type-check this repo** (no `@types/react`, `strict` off). Do not treat it as a gate.
- Every user-visible string ships in Arabic and English via the existing `isAr` ternary pattern. Neither language is a fallback.
- Money and timing semantics must not change. Any diff in what reaches `createListing` for an unchanged form is a bug.
- Commit after every task. Conventional Commit prefixes (`feat:`, `refactor:`, `test:`, `fix:`).

---

### Task 1: Extract the drop payload and lock it with a characterization test

This is the safety net for every task after it. Pure extraction — no behaviour change.

**Files:**
- Create: `src/utils/dropPayload.ts`
- Create: `src/utils/dropPayload.test.ts`
- Modify: `src/components/AuctionDropBuilderView.tsx` (remove the inline `slugifyVendor` at lines 39-46 and the inline payload object inside `handleCreate`)

**Interfaces:**
- Consumes: `channelToCategory`, `DropChannel` from `src/utils/dropChannel`; `ViewingMode` from `src/utils/viewing`
- Produces: `slugifyVendor(name: string): string`, `DropPayloadInput`, `buildDropPayload(input: DropPayloadInput, now: number): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

Create `src/utils/dropPayload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDropPayload, slugifyVendor, type DropPayloadInput } from './dropPayload';

const NOW = 1_800_000_000_000;

const base: DropPayloadInput = {
  productName: '  iPhone 15 Pro  ',
  startingPrice: '250',
  channel: 'phones',
  durationSeconds: 1800,
  paymentWindowHours: 24,
  antiSnipeSec: 30,
  startMode: 'scheduled',
  scheduledStartAtMs: null,
  autoRelist: false,
  viewing: '',
  viewingPlace: '',
  marketPrice: '',
  reservePrice: '',
  vendorName: '',
  extraPhotoUrls: [],
};

describe('buildDropPayload — characterization of the shipped payload', () => {
  it('produces exactly the keys the current form sends for a minimal drop', () => {
    expect(buildDropPayload(base, NOW)).toEqual({
      title: 'iPhone 15 Pro',
      description: 'iPhone 15 Pro',
      category: 'Electronics',
      startingPrice: 250,
      minIncrement: 13,
      currentBidderId: null,
      currentBidderName: null,
      videoUrl: '',
      thumbnailUrl: '',
      endTime: NOW + 1800 * 1000,
      duration: 1800,
      paymentWindowHours: 24,
      antiSnipeWindowSec: 30,
      antiSnipeExtendSec: 30,
      channel: 'phones',
      startMode: 'scheduled',
      autoRelist: false,
      scheduledStartAt: NOW,
      soldByMazad: true,
    });
  });

  it('never emits condition or specs — the current form does not store them', () => {
    const p = buildDropPayload(base, NOW);
    expect(p).not.toHaveProperty('condition');
    expect(p).not.toHaveProperty('specs');
  });

  it('floors minIncrement at 5 for cheap lots', () => {
    expect(buildDropPayload({ ...base, startingPrice: '20' }, NOW).minIncrement).toBe(5);
  });

  it('uses the scheduled start when one is given', () => {
    const at = NOW + 3_600_000;
    const p = buildDropPayload({ ...base, scheduledStartAtMs: at }, NOW);
    expect(p.scheduledStartAt).toBe(at);
    expect(p.endTime).toBe(at + 1800 * 1000);
  });

  it('omits viewingPlace unless the mode is store and a place was typed', () => {
    expect(buildDropPayload({ ...base, viewing: 'office', viewingPlace: 'x' }, NOW))
      .not.toHaveProperty('viewingPlace');
    expect(buildDropPayload({ ...base, viewing: 'store', viewingPlace: '  ' }, NOW))
      .not.toHaveProperty('viewingPlace');
    expect(buildDropPayload({ ...base, viewing: 'store', viewingPlace: ' Shop 12 ' }, NOW))
      .toMatchObject({ viewing: 'store', viewingPlace: 'Shop 12' });
  });

  it('omits optional numerics when blank or zero', () => {
    const p = buildDropPayload({ ...base, marketPrice: '0', reservePrice: '' }, NOW);
    expect(p).not.toHaveProperty('marketPrice');
    expect(p).not.toHaveProperty('reservePrice');
  });

  it('emits vendorName with a slug when a vendor is named', () => {
    expect(buildDropPayload({ ...base, vendorName: '  Al Hani Traders ' }, NOW))
      .toMatchObject({ vendorName: 'Al Hani Traders', vendorId: 'al-hani-traders' });
  });

  it('attaches mediaUrls only when gallery photos uploaded', () => {
    expect(buildDropPayload(base, NOW)).not.toHaveProperty('mediaUrls');
    expect(buildDropPayload({ ...base, extraPhotoUrls: ['a', 'b'] }, NOW).mediaUrls)
      .toEqual(['a', 'b']);
  });
});

describe('slugifyVendor', () => {
  it('lowercases and dashes latin names', () => {
    expect(slugifyVendor('  Al Hani   Traders ')).toBe('al-hani-traders');
  });
  it('keeps arabic letters', () => {
    expect(slugifyVendor('الهاني للتجارة')).toBe('الهاني-للتجارة');
  });
  it('strips punctuation and collapses dashes', () => {
    expect(slugifyVendor('A&&&B -- C!')).toBe('ab-c');
  });
  it('returns empty string for punctuation-only input', () => {
    expect(slugifyVendor('!!!')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/dropPayload.test.ts`
Expected: FAIL — `Failed to resolve import "./dropPayload"`

- [ ] **Step 3: Write the implementation**

Create `src/utils/dropPayload.ts`:

```ts
import { channelToCategory, type DropChannel } from './dropChannel';
import type { ViewingMode } from './viewing';

/**
 * The exact payload the admin drop builder sends to createListing.
 *
 * Extracted verbatim from AuctionDropBuilderView.handleCreate so the UI
 * rebuild around it can be proven not to change what publishes. `now` is
 * injected rather than read from Date.now() so the shape is testable.
 *
 * Note: `condition` and `specs` are deliberately absent. The current form
 * collects both but uses them only for the WhatsApp caption — they have
 * never reached the auction document. Preserved as-is; changing it is a
 * product decision, not a refactor.
 */

/** Internal vendor slug: lowercase, dashes, keeps Arabic/Latin letters + digits. */
export const slugifyVendor = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export interface DropPayloadInput {
  productName: string;
  startingPrice: string;
  channel: DropChannel;
  durationSeconds: number;
  paymentWindowHours: number;
  antiSnipeSec: number;
  startMode: 'scheduled' | 'first_bid';
  scheduledStartAtMs: number | null;
  autoRelist: boolean;
  viewing: ViewingMode | '';
  viewingPlace: string;
  marketPrice: string;
  reservePrice: string;
  vendorName: string;
  extraPhotoUrls: string[];
}

export function buildDropPayload(
  input: DropPayloadInput,
  now: number,
): Record<string, unknown> {
  const priceNum = Number(input.startingPrice);
  const startAt = input.scheduledStartAtMs ?? now;

  return {
    title: input.productName.trim(),
    description: input.productName.trim(),
    category: channelToCategory(input.channel),
    startingPrice: priceNum,
    minIncrement: Math.max(5, Math.round(priceNum * 0.05)),
    currentBidderId: null,
    currentBidderName: null,
    videoUrl: '',
    thumbnailUrl: '',
    endTime: startAt + input.durationSeconds * 1000,
    duration: input.durationSeconds,
    paymentWindowHours: input.paymentWindowHours,
    antiSnipeWindowSec: input.antiSnipeSec,
    antiSnipeExtendSec: input.antiSnipeSec,
    channel: input.channel,
    startMode: input.startMode,
    autoRelist: input.autoRelist,
    scheduledStartAt: startAt,
    soldByMazad: true,
    ...(input.viewing ? { viewing: input.viewing } : {}),
    ...(input.viewing === 'store' && input.viewingPlace.trim()
      ? { viewingPlace: input.viewingPlace.trim() }
      : {}),
    ...(input.extraPhotoUrls.length > 0 ? { mediaUrls: input.extraPhotoUrls } : {}),
    ...(Number(input.marketPrice) > 0 ? { marketPrice: Number(input.marketPrice) } : {}),
    ...(Number(input.reservePrice) > 0 ? { reservePrice: Number(input.reservePrice) } : {}),
    ...(input.vendorName.trim()
      ? { vendorName: input.vendorName.trim(), vendorId: slugifyVendor(input.vendorName) || null }
      : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/dropPayload.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Rewire the view to use it**

In `src/components/AuctionDropBuilderView.tsx`, delete the local `slugifyVendor` const (lines 39-46) and add to the imports:

```ts
import { buildDropPayload } from '../utils/dropPayload';
```

Inside `handleCreate`, replace the whole inline object literal passed as the first argument to `createListing` (from `{ title: productName.trim(),` through the closing `} as any,`) with:

```ts
      const newId = await createListing(
        buildDropPayload(
          {
            productName,
            startingPrice,
            channel,
            durationSeconds,
            paymentWindowHours,
            antiSnipeSec,
            startMode,
            scheduledStartAtMs,
            autoRelist,
            viewing,
            viewingPlace,
            marketPrice,
            reservePrice,
            vendorName,
            extraPhotoUrls,
          },
          Date.now(),
        ) as any,
        videoFile ?? undefined,
        thumbnailFile ?? undefined,
        undefined,
        'upcoming',
      );
```

Delete the now-unused `const priceNum = Number(startingPrice);` line above it.

- [ ] **Step 6: Verify the whole suite and build still pass**

Run: `npm test && npm run build`
Expected: full suite PASS (previous count + 12), build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/utils/dropPayload.ts src/utils/dropPayload.test.ts src/components/AuctionDropBuilderView.tsx
git commit -m "refactor(drop-builder): extract buildDropPayload behind a characterization test"
```

---

### Task 2: `opensMode` — collapse start mode and start time into one control

**Files:**
- Create: `src/utils/opensMode.ts`
- Create: `src/utils/opensMode.test.ts`

**Interfaces:**
- Consumes: `parseAmmanLocalToMs` from `src/utils/ammanTime`
- Produces: `type OpensMode = 'now' | 'scheduled' | 'first_bid'`, `resolveOpens(mode: OpensMode, scheduledLocal: string): { startMode: 'scheduled' | 'first_bid'; scheduledStartAtMs: number | null }`, `validateOpens(mode: OpensMode, scheduledLocal: string, now: number): 'REQUIRED' | 'PAST' | null`

- [ ] **Step 1: Write the failing test**

Create `src/utils/opensMode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveOpens, validateOpens } from './opensMode';

// parseAmmanLocalToMs reads "YYYY-MM-DDTHH:mm" as Amman wall-clock time.
const FUTURE = '2030-01-01T20:00';
const PAST = '2020-01-01T20:00';
const NOW = Date.UTC(2026, 0, 1);

describe('resolveOpens', () => {
  it('maps "now" to a scheduled start with no explicit time', () => {
    expect(resolveOpens('now', '')).toEqual({
      startMode: 'scheduled',
      scheduledStartAtMs: null,
    });
  });

  it('maps "first_bid" to first_bid with no explicit time', () => {
    expect(resolveOpens('first_bid', FUTURE)).toEqual({
      startMode: 'first_bid',
      scheduledStartAtMs: null,
    });
  });

  it('maps "scheduled" to the parsed Amman time', () => {
    const r = resolveOpens('scheduled', FUTURE);
    expect(r.startMode).toBe('scheduled');
    expect(typeof r.scheduledStartAtMs).toBe('number');
  });

  it('yields a null time for "scheduled" with an unparseable value', () => {
    expect(resolveOpens('scheduled', '')).toEqual({
      startMode: 'scheduled',
      scheduledStartAtMs: null,
    });
  });
});

describe('validateOpens', () => {
  it('never complains about "now"', () => {
    expect(validateOpens('now', '', NOW)).toBeNull();
  });

  it('never complains about "first_bid"', () => {
    expect(validateOpens('first_bid', '', NOW)).toBeNull();
  });

  it('requires a time when "scheduled" is chosen', () => {
    expect(validateOpens('scheduled', '', NOW)).toBe('REQUIRED');
  });

  it('rejects a scheduled time in the past', () => {
    expect(validateOpens('scheduled', PAST, NOW)).toBe('PAST');
  });

  it('accepts a scheduled time in the future', () => {
    expect(validateOpens('scheduled', FUTURE, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/opensMode.test.ts`
Expected: FAIL — `Failed to resolve import "./opensMode"`

- [ ] **Step 3: Write the implementation**

Create `src/utils/opensMode.ts`:

```ts
import { parseAmmanLocalToMs } from './ammanTime';

/**
 * When a drop opens, as one control instead of two.
 *
 * The old form had a `startMode` toggle AND a start-time field, where
 * "Scheduled" with an empty time silently meant *immediately* — the label
 * contradicted the behaviour, so someone who meant to schedule and left the
 * field blank opened the lot instantly. These three states are explicit and
 * map onto the unchanged server semantics.
 *
 *   now        -> scheduled, scheduledStartAt = <caller's now>
 *   scheduled  -> scheduled, scheduledStartAt = the picked Amman time
 *   first_bid  -> first_bid, clock starts on the first bid
 *
 * `scheduledStartAtMs: null` means "the caller substitutes its own now",
 * which is exactly what buildDropPayload's `?? now` already does.
 */
export type OpensMode = 'now' | 'scheduled' | 'first_bid';

export interface OpensResult {
  startMode: 'scheduled' | 'first_bid';
  scheduledStartAtMs: number | null;
}

export function resolveOpens(mode: OpensMode, scheduledLocal: string): OpensResult {
  if (mode === 'first_bid') {
    return { startMode: 'first_bid', scheduledStartAtMs: null };
  }
  if (mode === 'now') {
    return { startMode: 'scheduled', scheduledStartAtMs: null };
  }
  return { startMode: 'scheduled', scheduledStartAtMs: parseAmmanLocalToMs(scheduledLocal) };
}

export type OpensError = 'REQUIRED' | 'PAST';

/**
 * A time is only meaningful in the `scheduled` state, so the other two can
 * never be invalid. Unlike the old form, a blank time is an error here rather
 * than a silent "open now" — that is what `now` is for.
 */
export function validateOpens(
  mode: OpensMode,
  scheduledLocal: string,
  now: number,
): OpensError | null {
  if (mode !== 'scheduled') return null;
  const ms = parseAmmanLocalToMs(scheduledLocal);
  if (ms == null) return 'REQUIRED';
  if (ms <= now) return 'PAST';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/opensMode.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/opensMode.ts src/utils/opensMode.test.ts
git commit -m "feat(drop-builder): add opensMode — one control for now/scheduled/first-bid"
```

---

### Task 3: `dropFormState` — defaults, validation, and what Create-another keeps

**Files:**
- Create: `src/utils/dropFormState.ts`
- Create: `src/utils/dropFormState.test.ts`

**Interfaces:**
- Consumes: `OpensMode`, `validateOpens` from `src/utils/opensMode`; `DropChannel` from `src/utils/dropChannel`; `ViewingMode` from `src/utils/viewing`
- Produces: `DropFormValues`, `INITIAL_FORM: DropFormValues`, `afterCreateAnother(prev: DropFormValues): DropFormValues`, `validateDropForm(v: DropFormValues, now: number): Record<string, string>`

- [ ] **Step 1: Write the failing test**

Create `src/utils/dropFormState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { INITIAL_FORM, afterCreateAnother, validateDropForm, type DropFormValues } from './dropFormState';

const NOW = Date.UTC(2026, 0, 1);

const filled: DropFormValues = {
  ...INITIAL_FORM,
  productName: 'iPhone 15 Pro',
  startingPrice: '250',
  specsText: '256GB\nSealed',
  marketPrice: '400',
  reservePrice: '300',
  viewing: 'store',
  viewingPlace: 'Shop 12',
  channel: 'phones',
  durationSeconds: 600,
  paymentWindowHours: 48,
  antiSnipeSec: 60,
  condition: 'مستعملة',
  vendorName: 'Al Hani',
  autoRelist: true,
  opensMode: 'first_bid',
  scheduledLocal: '2030-01-01T20:00',
};

describe('afterCreateAnother', () => {
  it('keeps the ops settings the admin just chose', () => {
    const next = afterCreateAnother(filled);
    expect(next.channel).toBe('phones');
    expect(next.durationSeconds).toBe(600);
    expect(next.paymentWindowHours).toBe(48);
    expect(next.antiSnipeSec).toBe(60);
    expect(next.condition).toBe('مستعملة');
    expect(next.vendorName).toBe('Al Hani');
    expect(next.autoRelist).toBe(true);
    expect(next.opensMode).toBe('first_bid');
  });

  it('clears everything specific to the item just published', () => {
    const next = afterCreateAnother(filled);
    expect(next.productName).toBe('');
    expect(next.startingPrice).toBe('');
    expect(next.specsText).toBe('');
    expect(next.marketPrice).toBe('');
    expect(next.reservePrice).toBe('');
  });

  it('always clears viewing, never carrying a location claim to a different item', () => {
    const next = afterCreateAnother(filled);
    expect(next.viewing).toBe('');
    expect(next.viewingPlace).toBe('');
  });

  it('is idempotent — running it twice equals running it once', () => {
    expect(afterCreateAnother(afterCreateAnother(filled))).toEqual(afterCreateAnother(filled));
  });
});

describe('validateDropForm', () => {
  it('passes a minimally complete form', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '10' }, NOW))
      .toEqual({});
  });

  it('flags a missing product name', () => {
    const e = validateDropForm({ ...INITIAL_FORM, startingPrice: '10' }, NOW);
    expect(e.productName).toBe('REQUIRED');
  });

  it('flags a whitespace-only product name', () => {
    const e = validateDropForm({ ...INITIAL_FORM, productName: '   ', startingPrice: '10' }, NOW);
    expect(e.productName).toBe('REQUIRED');
  });

  it('flags a missing or zero starting price', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x' }, NOW).startingPrice).toBe('REQUIRED');
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '0' }, NOW).startingPrice).toBe('REQUIRED');
  });

  it('flags a negative starting price', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '-5' }, NOW).startingPrice).toBe('REQUIRED');
  });

  it('flags a scheduled drop with no time chosen', () => {
    const e = validateDropForm(
      { ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'scheduled' },
      NOW,
    );
    expect(e.scheduledLocal).toBe('REQUIRED');
  });

  it('flags a scheduled time in the past', () => {
    const e = validateDropForm(
      { ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'scheduled', scheduledLocal: '2020-01-01T20:00' },
      NOW,
    );
    expect(e.scheduledLocal).toBe('PAST');
  });

  it('does not flag timing for the now and first-bid modes', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'now' }, NOW).scheduledLocal).toBeUndefined();
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'first_bid' }, NOW).scheduledLocal).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/dropFormState.test.ts`
Expected: FAIL — `Failed to resolve import "./dropFormState"`

- [ ] **Step 3: Write the implementation**

Create `src/utils/dropFormState.ts`:

```ts
import { validateOpens, type OpensMode } from './opensMode';
import type { DropChannel } from './dropChannel';
import type { ViewingMode } from './viewing';

/**
 * Every text and select value the drop builder holds. Media files live in the
 * component (they are File objects, not serialisable form state).
 */
export interface DropFormValues {
  productName: string;
  startingPrice: string;
  condition: string;
  specsText: string;
  vendorName: string;
  marketPrice: string;
  reservePrice: string;
  viewing: ViewingMode | '';
  viewingPlace: string;
  channel: DropChannel;
  opensMode: OpensMode;
  scheduledLocal: string;
  durationSeconds: number;
  paymentWindowHours: number;
  antiSnipeSec: number;
  autoRelist: boolean;
}

/** Defaults are the ones the previous form shipped with — unchanged. */
export const INITIAL_FORM: DropFormValues = {
  productName: '',
  startingPrice: '',
  condition: 'جديدة كلياً',
  specsText: '',
  vendorName: '',
  marketPrice: '',
  reservePrice: '',
  viewing: '',
  viewingPlace: '',
  channel: 'misc',
  opensMode: 'now',
  scheduledLocal: '',
  durationSeconds: 1800,
  paymentWindowHours: 24,
  antiSnipeSec: 30,
  autoRelist: false,
};

/**
 * "Create another" keeps the ops settings (the admin picked them for this
 * batch and the next lot almost certainly wants the same) and clears the
 * item.
 *
 * `viewing` is the deliberate exception: it is ALWAYS cleared. A carried-over
 * viewing value sits pre-selected on the next form looking like that lot's own
 * claim, and publishes a physical-location statement about a DIFFERENT item —
 * exactly the fabrication utils/viewing.ts exists to prevent. The next drop
 * has to state it deliberately.
 */
export function afterCreateAnother(prev: DropFormValues): DropFormValues {
  return {
    ...INITIAL_FORM,
    condition: prev.condition,
    vendorName: prev.vendorName,
    channel: prev.channel,
    opensMode: prev.opensMode,
    durationSeconds: prev.durationSeconds,
    paymentWindowHours: prev.paymentWindowHours,
    antiSnipeSec: prev.antiSnipeSec,
    autoRelist: prev.autoRelist,
  };
}

/**
 * Returns a field-keyed map of error codes; empty means valid. The required
 * set is unchanged from the previous form (name + starting price) — it is only
 * surfaced per-field now instead of as one combined message. Timing joins it
 * because `scheduled` no longer silently degrades to "open now".
 */
export function validateDropForm(
  v: DropFormValues,
  now: number,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!v.productName.trim()) errors.productName = 'REQUIRED';

  const price = Number(v.startingPrice);
  if (!Number.isFinite(price) || price <= 0) errors.startingPrice = 'REQUIRED';

  const opensError = validateOpens(v.opensMode, v.scheduledLocal, now);
  if (opensError) errors.scheduledLocal = opensError;

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/dropFormState.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/dropFormState.ts src/utils/dropFormState.test.ts
git commit -m "feat(drop-builder): add dropFormState — defaults, validation, create-another"
```

---

### Task 4: `dropEditability` — when edit and cancel are offered

**Files:**
- Create: `src/utils/dropEditability.ts`
- Create: `src/utils/dropEditability.test.ts`

**Interfaces:**
- Produces: `DropEditabilitySource`, `bidCountOf(a)`, `canEditDrop(a)`, `canCancelDrop(a)`, `cancelWarnsAboutBids(a)`

- [ ] **Step 1: Write the failing test**

Create `src/utils/dropEditability.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  bidCountOf,
  canEditDrop,
  canCancelDrop,
  cancelWarnsAboutBids,
} from './dropEditability';

describe('bidCountOf — fails closed to "has bids" only on real numbers', () => {
  it('reads a numeric count', () => {
    expect(bidCountOf({ totalBids: 3 })).toBe(3);
  });
  it('treats missing, null and non-numeric as zero', () => {
    expect(bidCountOf({})).toBe(0);
    expect(bidCountOf({ totalBids: null })).toBe(0);
    expect(bidCountOf({ totalBids: undefined })).toBe(0);
    expect(bidCountOf({ totalBids: NaN })).toBe(0);
  });
});

describe('canEditDrop', () => {
  it('allows editing an upcoming lot with no bids', () => {
    expect(canEditDrop({ status: 'upcoming', totalBids: 0 })).toBe(true);
  });
  it('allows editing a live lot that nobody has bid on yet', () => {
    expect(canEditDrop({ status: 'live', totalBids: 0 })).toBe(true);
  });
  it('refuses once a single bid lands', () => {
    expect(canEditDrop({ status: 'live', totalBids: 1 })).toBe(false);
  });
  it('refuses on a finished lot regardless of bids', () => {
    expect(canEditDrop({ status: 'completed', totalBids: 0 })).toBe(false);
    expect(canEditDrop({ status: 'ended', totalBids: 0 })).toBe(false);
  });
});

describe('canCancelDrop', () => {
  it('allows cancelling before and during bidding', () => {
    expect(canCancelDrop({ status: 'upcoming', totalBids: 0 })).toBe(true);
    expect(canCancelDrop({ status: 'live', totalBids: 4 })).toBe(true);
  });
  it('refuses on a finished lot — settlement already ran', () => {
    expect(canCancelDrop({ status: 'completed', totalBids: 4 })).toBe(false);
    expect(canCancelDrop({ status: 'ended', totalBids: 0 })).toBe(false);
  });
});

describe('cancelWarnsAboutBids', () => {
  it('stays quiet when nobody has bid', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: 0 })).toBe(false);
  });
  it('warns as soon as there is a bid to destroy', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: 1 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/dropEditability.test.ts`
Expected: FAIL — `Failed to resolve import "./dropEditability"`

- [ ] **Step 3: Write the implementation**

Create `src/utils/dropEditability.ts`:

```ts
/**
 * What an admin may still do to a drop they just created.
 *
 * The rule agreed in the spec: edit freely until the first bid, then editing
 * locks because changing an item's terms under someone who has already
 * committed money is not something a UI should make easy. Cancelling stays
 * available while the lot is running, but the caller must confirm loudly once
 * bids exist. Nothing is editable or cancellable after close — settlement has
 * run and orders exist.
 */

export interface DropEditabilitySource {
  status?: string | null;
  totalBids?: number | null;
}

const FINISHED = new Set(['completed', 'ended']);

/** Non-numeric counts read as zero; only a real positive number counts as bids. */
export function bidCountOf(a: DropEditabilitySource): number {
  const n = a.totalBids;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

const isFinished = (a: DropEditabilitySource): boolean =>
  FINISHED.has(String(a.status ?? ''));

export function canEditDrop(a: DropEditabilitySource): boolean {
  return !isFinished(a) && bidCountOf(a) === 0;
}

export function canCancelDrop(a: DropEditabilitySource): boolean {
  return !isFinished(a);
}

export function cancelWarnsAboutBids(a: DropEditabilitySource): boolean {
  return bidCountOf(a) > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/dropEditability.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/dropEditability.ts src/utils/dropEditability.test.ts
git commit -m "feat(drop-builder): add dropEditability — edit until first bid, cancel until close"
```

---

### Task 5: `mediaPickerState` — the pure half of the media picker

`URL.createObjectURL` does not exist in the `node` test environment, so object-URL creation stays in the component and these functions take already-formed `{ file, url }` records.

**Files:**
- Create: `src/utils/mediaPickerState.ts`
- Create: `src/utils/mediaPickerState.test.ts`

**Interfaces:**
- Produces: `MAX_GALLERY_PHOTOS: 3`, `PickedPhoto`, `isImageFile(f)`, `addGalleryPhotos(prev, incoming)`, `removeGalleryPhoto(prev, index)`

- [ ] **Step 1: Write the failing test**

Create `src/utils/mediaPickerState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  MAX_GALLERY_PHOTOS,
  addGalleryPhotos,
  removeGalleryPhoto,
  isImageFile,
  type PickedPhoto,
} from './mediaPickerState';

const photo = (n: number): PickedPhoto => ({ file: { name: `${n}.jpg` } as any, url: `blob:${n}` });

describe('isImageFile', () => {
  it('accepts image mime types', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/png' })).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isImageFile({ type: 'video/mp4' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
});

describe('addGalleryPhotos', () => {
  it('appends to the end', () => {
    expect(addGalleryPhotos([photo(1)], [photo(2)]).map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });

  it('caps the gallery at three', () => {
    const result = addGalleryPhotos([], [photo(1), photo(2), photo(3), photo(4), photo(5)]);
    expect(result).toHaveLength(MAX_GALLERY_PHOTOS);
    expect(result.map((p) => p.url)).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('drops overflow when the gallery is already partly full', () => {
    const result = addGalleryPhotos([photo(1), photo(2)], [photo(3), photo(4)]);
    expect(result.map((p) => p.url)).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('is a no-op for an empty incoming list', () => {
    const prev = [photo(1)];
    expect(addGalleryPhotos(prev, [])).toEqual(prev);
  });

  it('does not mutate the previous array', () => {
    const prev = [photo(1)];
    addGalleryPhotos(prev, [photo(2)]);
    expect(prev).toHaveLength(1);
  });
});

describe('removeGalleryPhoto', () => {
  it('removes the photo at the given index', () => {
    expect(removeGalleryPhoto([photo(1), photo(2), photo(3)], 1).map((p) => p.url))
      .toEqual(['blob:1', 'blob:3']);
  });

  it('ignores an out-of-range index', () => {
    const prev = [photo(1)];
    expect(removeGalleryPhoto(prev, 5)).toEqual(prev);
    expect(removeGalleryPhoto(prev, -1)).toEqual(prev);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/mediaPickerState.test.ts`
Expected: FAIL — `Failed to resolve import "./mediaPickerState"`

- [ ] **Step 3: Write the implementation**

Create `src/utils/mediaPickerState.ts`:

```ts
/**
 * The pure half of MediaPicker. Object-URL creation and revocation stay in the
 * component — `URL.createObjectURL` does not exist in the node test
 * environment this repo runs vitest under, so these take formed records.
 */

/** Matches the gallery cap the seller wizard and the live room already assume. */
export const MAX_GALLERY_PHOTOS = 3;

export interface PickedPhoto {
  file: File;
  url: string;
}

export function isImageFile(f: { type: string }): boolean {
  return f.type.startsWith('image/');
}

/** Appends, then truncates to the cap. Never mutates `prev`. */
export function addGalleryPhotos(
  prev: PickedPhoto[],
  incoming: PickedPhoto[],
): PickedPhoto[] {
  if (incoming.length === 0) return prev;
  return [...prev, ...incoming].slice(0, MAX_GALLERY_PHOTOS);
}

/** Out-of-range indices are a no-op rather than a silent whole-list rewrite. */
export function removeGalleryPhoto(prev: PickedPhoto[], index: number): PickedPhoto[] {
  if (index < 0 || index >= prev.length) return prev;
  return prev.filter((_, i) => i !== index);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/mediaPickerState.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/mediaPickerState.ts src/utils/mediaPickerState.test.ts
git commit -m "feat(drop-builder): add mediaPickerState — gallery cap, add and remove"
```

---

### Task 6: `MediaPicker` component

Replaces the native `Choose File / No file chosen` controls. Presentational only — no Firebase, no uploads. Modelled on the pattern already shipped in `ListingWizardView.tsx:274-350`.

**Files:**
- Create: `src/components/ui/MediaPicker.tsx`
- Modify: `src/components/AuctionDropBuilderView.tsx` (replace the MEDIA `<section>`, currently lines 473-526)

**Interfaces:**
- Consumes: `MAX_GALLERY_PHOTOS`, `PickedPhoto`, `isImageFile`, `addGalleryPhotos`, `removeGalleryPhoto` from `src/utils/mediaPickerState`
- Produces: `MediaPickerProps`, default export `MediaPicker`

- [ ] **Step 1: Write the component**

Create `src/components/ui/MediaPicker.tsx`:

```tsx
import React from 'react';
import {
  MAX_GALLERY_PHOTOS,
  addGalleryPhotos,
  removeGalleryPhoto,
  isImageFile,
  type PickedPhoto,
} from '../../utils/mediaPickerState';

/**
 * Cover + gallery + video selection for the admin drop builder.
 *
 * Presentational: it owns no upload logic and touches no Firebase. The parent
 * holds the files and uploads them on submit. `capture="environment"` means a
 * phone opens the rear camera straight away instead of a file browser.
 */
export interface MediaPickerProps {
  isAr: boolean;

  coverUrl: string;
  onCoverChange: (file: File | null) => void;

  gallery: PickedPhoto[];
  onGalleryChange: (next: PickedPhoto[]) => void;

  videoFile: File | null;
  onVideoChange: (file: File | null) => void;
}

const zone =
  'flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors';

export const MediaPicker: React.FC<MediaPickerProps> = ({
  isAr,
  coverUrl,
  onCoverChange,
  gallery,
  onGalleryChange,
  videoFile,
  onVideoChange,
}) => {
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming: PickedPhoto[] = Array.from(list)
      .filter(isImageFile)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    onGalleryChange(addGalleryPhotos(gallery, incoming));
  };

  const removeAt = (idx: number) => {
    const victim = gallery[idx];
    if (victim) URL.revokeObjectURL(victim.url);
    onGalleryChange(removeGalleryPhoto(gallery, idx));
  };

  return (
    <div className="space-y-4">
      {/* COVER */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-gray-900">
          {isAr ? 'صورة الغلاف' : 'Cover image'}
        </span>
        {coverUrl ? (
          <div className="relative rounded-xl overflow-hidden bg-black max-h-[200px]">
            <img src={coverUrl} alt="" className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => onCoverChange(null)}
              className="absolute top-2 end-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-2 py-1 text-[10px] font-bold cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ) : (
          <label className={`${zone} p-6`}>
            <span className="text-2xl">🖼️</span>
            <span className="text-xs font-bold text-gray-600 mt-2">
              {isAr ? 'اضغط لرفع صورة الغلاف' : 'Tap to add a cover image'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onCoverChange(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>

      {/* GALLERY */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-gray-900">
          {isAr
            ? `صور إضافية (حتى ${MAX_GALLERY_PHOTOS} — اختياري)`
            : `Extra photos (up to ${MAX_GALLERY_PHOTOS} — optional)`}
        </span>
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((photo, idx) => (
            <div key={photo.url} className="relative rounded-xl overflow-hidden bg-black aspect-square">
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 end-1 bg-red-600 hover:bg-red-700 text-white rounded-md px-1.5 py-0.5 text-[9px] font-bold cursor-pointer"
              >
                {isAr ? 'حذف' : 'Remove'}
              </button>
            </div>
          ))}
          {gallery.length < MAX_GALLERY_PHOTOS && (
            <label className={`${zone} aspect-square`}>
              <span className="text-xl">📸</span>
              <span className="text-[10px] font-bold text-gray-500 mt-1 text-center px-1">
                {isAr ? 'إضافة صورة' : 'Add photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        <span className="block text-[11px] text-gray-400">
          {isAr
            ? 'يستطيع المزايدون التنقل بين هذه الصور داخل غرفة المزاد'
            : 'Bidders can swipe through these inside the live room'}
        </span>
      </div>

      {/* VIDEO */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-gray-900">
          {isAr ? 'فيديو المنتج (اختياري)' : 'Product video (optional)'}
        </span>
        {videoFile ? (
          <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-xs font-bold text-gray-700 truncate">
              🎥 {videoFile.name}
              <span className="block text-[10px] font-mono text-gray-400">
                {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </span>
            <button
              type="button"
              onClick={() => onVideoChange(null)}
              className="shrink-0 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg px-2.5 py-1 text-[10px] font-bold cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ) : (
          <label className={`${zone} p-5`}>
            <span className="text-2xl">🎥</span>
            <span className="text-xs font-bold text-gray-600 mt-2">
              {isAr ? 'اضغط لرفع فيديو' : 'Tap to add a video'}
            </span>
            <input
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onVideoChange(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export default MediaPicker;
```

- [ ] **Step 2: Wire it into the builder**

In `src/components/AuctionDropBuilderView.tsx` add the import:

```ts
import MediaPicker from './ui/MediaPicker';
import type { PickedPhoto } from '../utils/mediaPickerState';
```

Replace the entire `{/* MEDIA */}` section (lines 473-526) with:

```tsx
        {/* MEDIA */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'الوسائط' : 'Media'}</h2>
          <MediaPicker
            isAr={isAr}
            coverUrl={thumbnailPreview}
            onCoverChange={(f) => {
              setThumbnailFile(f);
              setThumbnailPreview(f ? URL.createObjectURL(f) : '');
            }}
            gallery={extraPhotos}
            onGalleryChange={setExtraPhotos}
            videoFile={videoFile}
            onVideoChange={setVideoFile}
          />
        </section>
```

Delete the now-unused `onThumb`, `addExtraPhotos` and `removeExtraPhoto` helpers (lines 81-88 and 135-139). Change the `extraPhotos` state declaration to use the shared type:

```ts
  const [extraPhotos, setExtraPhotos] = useState<PickedPhoto[]>([]);
```

- [ ] **Step 3: Verify the suite and build**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds

- [ ] **Step 4: Manual check in the browser**

Run `npm run dev`, open `http://localhost:3000/auction-drop-builder` as an admin. Confirm: cover zone accepts an image and shows a thumbnail with Remove; gallery accepts up to 3 and the `+` tile disappears at 3; video shows filename and size. Then switch to Arabic via the header toggle and confirm the zones read correctly right-to-left.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/MediaPicker.tsx src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drop-builder): replace native file inputs with MediaPicker"
```

---

### Task 7: Essentials-first layout with the More-settings drawer

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx` (form column: the ITEM, PRICING and TIMING sections, currently lines 291-470)
- Create: `src/components/admin/MoreSettingsDrawer.tsx`

**Interfaces:**
- Consumes: `DropFormValues` from `src/utils/dropFormState`; `ViewingSelector` from `src/components/admin/ViewingSelector`; `DROP_CHANNELS`, `channelLabel` from `src/utils/dropChannel`
- Produces: `MoreSettingsDrawerProps`, default export `MoreSettingsDrawer`, and `summarizeSettings(v, isAr): string` exported from the same file

- [ ] **Step 1: Write the failing test for the summary line**

Create `src/components/admin/MoreSettingsDrawer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeSettings } from './MoreSettingsDrawer';
import { INITIAL_FORM } from '../../utils/dropFormState';

describe('summarizeSettings — the line under the collapsed drawer', () => {
  it('describes the shipped defaults in English', () => {
    expect(summarizeSettings(INITIAL_FORM, false)).toBe(
      'جديدة كلياً · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated',
    );
  });

  it('reports a reserve once one is set', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, reservePrice: '300' }, false))
      .toContain('reserve 300 JOD');
  });

  it('reports the viewing mode once one is chosen', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'office' }, false))
      .toContain('viewing at our office');
  });

  it('reports auto-relist only when enabled', () => {
    expect(summarizeSettings(INITIAL_FORM, false)).not.toContain('auto-relist');
    expect(summarizeSettings({ ...INITIAL_FORM, autoRelist: true }, false))
      .toContain('auto-relist');
  });

  it('renders in Arabic when asked', () => {
    const s = summarizeSettings(INITIAL_FORM, true);
    expect(s).toContain('بدون سعر احتياطي');
    expect(s).toContain('مهلة الدفع ٢٤ ساعة');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/admin/MoreSettingsDrawer.test.ts`
Expected: FAIL — `Failed to resolve import "./MoreSettingsDrawer"`

- [ ] **Step 3: Write the drawer**

Create `src/components/admin/MoreSettingsDrawer.tsx`:

```tsx
import React, { useState } from 'react';
import { ViewingSelector } from './ViewingSelector';
import type { DropFormValues } from '../../utils/dropFormState';
import type { ViewingMode } from '../../utils/viewing';

/**
 * The ten set-and-forget fields, folded away.
 *
 * Nothing is removed — the summary line renders the current values whether the
 * drawer is open or shut, so an admin who never opens it can still see what
 * their drop will ship with. That is the whole point: the previous form gave
 * all fifteen fields equal weight when only five change between drops.
 */

const PAYMENT_WINDOW_PRESETS = [
  { hours: 12, label: '12 ساعة', en: '12 hours' },
  { hours: 24, label: '24 ساعة', en: '24 hours' },
  { hours: 48, label: '48 ساعة', en: '48 hours' },
  { hours: 72, label: '72 ساعة', en: '72 hours' },
];

const ANTI_SNIPE_PRESETS = [
  { sec: 15, label: '15 ثانية', en: '15s' },
  { sec: 30, label: '30 ثانية', en: '30s' },
  { sec: 60, label: '60 ثانية', en: '60s' },
];

const VIEWING_SUMMARY: Record<ViewingMode, { en: string; ar: string }> = {
  office: { en: 'viewing at our office', ar: 'معاينة بمكاتبنا' },
  store: { en: 'viewing at the seller', ar: 'معاينة عند البائع' },
  private: { en: 'no viewing', ar: 'بدون معاينة' },
};

export function summarizeSettings(v: DropFormValues, isAr: boolean): string {
  const parts: string[] = [];

  parts.push(v.condition.trim() || (isAr ? 'الحالة غير محددة' : 'condition not set'));
  parts.push(isAr ? `${Math.round(v.durationSeconds / 60)} دقيقة` : `${Math.round(v.durationSeconds / 60)} min`);
  parts.push(isAr ? `مهلة الدفع ${v.paymentWindowHours === 24 ? '٢٤' : v.paymentWindowHours} ساعة` : `pay within ${v.paymentWindowHours}h`);
  parts.push(isAr ? `حماية من القنص ${v.antiSnipeSec} ثانية` : `anti-snipe ${v.antiSnipeSec}s`);

  const reserve = Number(v.reservePrice);
  parts.push(
    reserve > 0
      ? (isAr ? `سعر احتياطي ${reserve} دينار` : `reserve ${reserve} JOD`)
      : (isAr ? 'بدون سعر احتياطي' : 'no reserve'),
  );

  parts.push(
    v.viewing
      ? (isAr ? VIEWING_SUMMARY[v.viewing].ar : VIEWING_SUMMARY[v.viewing].en)
      : (isAr ? 'المعاينة غير محددة' : 'viewing not stated'),
  );

  if (v.autoRelist) parts.push(isAr ? 'إعادة إدراج تلقائية' : 'auto-relist');
  if (v.vendorName.trim()) parts.push(`${isAr ? 'المورّد' : 'vendor'} ${v.vendorName.trim()}`);

  return parts.join(' · ');
}

export interface MoreSettingsDrawerProps {
  isAr: boolean;
  values: DropFormValues;
  onChange: <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) => void;
}

const label = 'block text-sm font-bold text-gray-800';
const field =
  'mt-1 w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#FF6B00]';

export const MoreSettingsDrawer: React.FC<MoreSettingsDrawerProps> = ({
  isAr,
  values,
  onChange,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-start px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-black text-gray-900">
          <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          {isAr ? 'إعدادات إضافية' : 'More settings'}
        </span>
        <span className="block mt-1 text-[11px] text-gray-400 leading-relaxed">
          {summarizeSettings(values, isAr)}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          <label className={label}>
            {isAr ? 'الحالة' : 'Condition'}
            <input
              className={field}
              value={values.condition}
              onChange={(e) => onChange('condition', e.target.value)}
            />
          </label>

          <label className={label}>
            {isAr ? 'المواصفات (سطر لكل مواصفة)' : 'Specs (one per line)'}
            <textarea
              className={`${field} h-28`}
              value={values.specsText}
              onChange={(e) => onChange('specsText', e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr ? 'تظهر في نص المنشور فقط' : 'Appears in the post caption only'}
            </span>
          </label>

          <label className={label}>
            {isAr ? 'المورّد (داخلي)' : 'Vendor (internal)'}
            <input
              className={field}
              value={values.vendorName}
              onChange={(e) => onChange('vendorName', e.target.value)}
              placeholder={isAr ? 'اختياري — لا يظهر للمشترين' : 'Optional — never shown to buyers'}
            />
          </label>

          <label className={label}>
            {isAr ? 'سعر السوق (اختياري)' : 'Market price (optional)'}
            <input
              type="number"
              className={field}
              value={values.marketPrice}
              onChange={(e) => onChange('marketPrice', e.target.value)}
            />
          </label>

          <label className={label}>
            {isAr ? 'السعر الاحتياطي (مخفي عن المزايدين)' : 'Reserve price (hidden from bidders)'}
            <input
              type="number"
              className={field}
              value={values.reservePrice}
              onChange={(e) => onChange('reservePrice', e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr ? 'لن يُباع المنتج إذا لم تصل المزايدة لهذا السعر' : "Item won't sell if bidding doesn't reach this"}
            </span>
          </label>

          <ViewingSelector
            value={values.viewing}
            onChange={(next) => onChange('viewing', next)}
            place={values.viewingPlace}
            onPlaceChange={(next) => onChange('viewingPlace', next)}
            isAr={isAr}
            accentClass="bg-[#F05123] text-white border-[#F05123]"
            focusClass="focus:border-[#F05123]"
          />

          <label className={label}>
            {isAr ? 'مهلة الدفع' : 'Payment window'}
            <select
              className={field}
              value={values.paymentWindowHours}
              onChange={(e) => onChange('paymentWindowHours', Number(e.target.value))}
            >
              {PAYMENT_WINDOW_PRESETS.map((p) => (
                <option key={p.hours} value={p.hours}>{isAr ? p.label : p.en}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr
                ? 'الوقت المتاح للفائز للدفع قبل تقييد الحساب. الافتراضي 24 ساعة.'
                : 'Time the winner has to pay before their account is restricted. Default 24h.'}
            </span>
          </label>

          <label className={label}>
            {isAr ? 'الحماية من القنص' : 'Anti-snipe'}
            <select
              className={field}
              value={values.antiSnipeSec}
              onChange={(e) => onChange('antiSnipeSec', Number(e.target.value))}
            >
              {ANTI_SNIPE_PRESETS.map((p) => (
                <option key={p.sec} value={p.sec}>{isAr ? p.label : p.en}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr
                ? 'المزايدات في الثواني الأخيرة تُمدّد الوقت. الافتراضي ٣٠ ثانية.'
                : 'Bids in the final seconds extend the clock. Default 30s.'}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.autoRelist}
              onChange={(e) => onChange('autoRelist', e.target.checked)}
            />
            <span className="font-bold text-gray-800">
              {isAr ? 'إعادة الإدراج تلقائياً إن لم يُبع (حتى مرتين)' : 'Auto-relist if unsold (up to 2×)'}
              <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                {isAr
                  ? 'يُعاد إدراج المنتج تلقائياً بعد ٢٤ ساعة إن انتهى دون بيع.'
                  : 'The item is automatically relisted 24h after it ends unsold.'}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
};

export default MoreSettingsDrawer;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/admin/MoreSettingsDrawer.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Convert the view to a single form-state object**

In `src/components/AuctionDropBuilderView.tsx`, replace the sixteen individual `useState` calls for form values (lines 53-70, everything from `productName` through `specsText`, excluding the media, `copyImageMsg`, `createdId`, `submitting` and `error` states) with:

```ts
  const [form, setForm] = useState<DropFormValues>(INITIAL_FORM);
  const setField = useCallback(
    <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );
```

Add to the imports:

```ts
import { useCallback } from 'react';
import { INITIAL_FORM, type DropFormValues } from '../utils/dropFormState';
import { resolveOpens, type OpensMode } from '../utils/opensMode';
import MoreSettingsDrawer from './admin/MoreSettingsDrawer';
```

Update every remaining reference from the old bare names to `form.<field>` (for example `productName` → `form.productName`, `setDurationSeconds(n)` → `setField('durationSeconds', n)`). `scheduledStartAtMs` becomes:

```ts
  const opens = useMemo(
    () => resolveOpens(form.opensMode, form.scheduledLocal),
    [form.opensMode, form.scheduledLocal],
  );
  const scheduledStartAtMs = opens.scheduledStartAtMs;
```

and the `startMode` passed to `buildDropPayload` becomes `opens.startMode`.

- [ ] **Step 6: Replace the essentials markup**

Replace the ITEM, PRICING and TIMING sections (lines 291-470) with the six essentials followed by the drawer:

Move the `{/* MEDIA */}` section built in Task 6 so it is the **first** child of the form column, above Product name — the team is holding the item, so photos come first. It is the same block, relocated:

```tsx
        {/* MEDIA — first, the team is holding the item */}
        <section className="space-y-3">
          <h2 className={sectionHeader}>{isAr ? 'الوسائط' : 'Media'}</h2>
          <MediaPicker
            isAr={isAr}
            coverUrl={thumbnailPreview}
            onCoverChange={(f) => {
              setThumbnailFile(f);
              setThumbnailPreview(f ? URL.createObjectURL(f) : '');
            }}
            gallery={extraPhotos}
            onGalleryChange={setExtraPhotos}
            videoFile={videoFile}
            onVideoChange={setVideoFile}
          />
        </section>

        <label className={label}>
          {isAr ? 'اسم المنتج' : 'Product name'} <span className="text-[#FF6B00]">*</span>
          <input
            className={field}
            value={form.productName}
            onChange={(e) => setField('productName', e.target.value)}
          />
        </label>

        <label className={label}>
          {isAr ? 'سعر البداية (دينار)' : 'Starting price (JOD)'} <span className="text-[#FF6B00]">*</span>
          <input
            type="number"
            className={field}
            value={form.startingPrice}
            onChange={(e) => setField('startingPrice', e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            {Number(form.startingPrice) > 0
              ? (isAr
                  ? `يستلم البائع ~${sellerNet(Number(form.startingPrice)).toLocaleString('en-US')} دينار (تقريباً ٩٥٪ بعد عمولة مزاد ٥٪)`
                  : `Seller receives ~${sellerNet(Number(form.startingPrice)).toLocaleString('en-US')} JOD (~95% after 5% Mazad commission)`)
              : (isAr
                  ? 'يستلم البائع ~٩٥٪ من السعر النهائي (بعد عمولة مزاد ٥٪)'
                  : 'Seller receives ~95% of the final price (after 5% Mazad commission)')}
          </span>
        </label>

        <div>
          <span className={label}>{isAr ? 'يفتح' : 'Opens'}</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {([
              { id: 'now', ar: 'الآن', en: 'Now' },
              { id: 'scheduled', ar: 'بوقت محدد', en: 'At a set time' },
              { id: 'first_bid', ar: 'مع أول مزايدة', en: 'On first bid' },
            ] as { id: OpensMode; ar: string; en: string }[]).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setField('opensMode', o.id)}
                className={`border rounded-xl p-2.5 text-xs font-bold transition-colors ${
                  form.opensMode === o.id
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00]'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {isAr ? o.ar : o.en}
              </button>
            ))}
          </div>

          {form.opensMode === 'scheduled' && (
            <label className={`${label} mt-3`}>
              {isAr ? 'وقت البدء (توقيت عمّان)' : 'Start time (Amman)'}
              <input
                type="datetime-local"
                className={field}
                value={form.scheduledLocal}
                onChange={(e) => setField('scheduledLocal', e.target.value)}
              />
            </label>
          )}

          {form.opensMode === 'first_bid' && (
            <p className="mt-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-2.5">
              {isAr ? 'يبدأ فوراً — يبدأ العدّاد مع أول مزايدة' : 'Goes live now — the timer starts on the first bid'}
            </p>
          )}
        </div>

        <label className={label}>
          {isAr ? 'مدة المزاد' : 'Runs for'}
          <select
            className={field}
            value={form.durationSeconds}
            onChange={(e) => setField('durationSeconds', Number(e.target.value))}
          >
            {DURATION_PRESETS.map((d) => (
              <option key={d.seconds} value={d.seconds}>{isAr ? d.label : d.en}</option>
            ))}
          </select>
        </label>

        <label className={label}>
          {isAr ? 'القناة' : 'Channel'}
          <select
            className={field}
            value={form.channel}
            onChange={(e) => setField('channel', e.target.value as DropChannel)}
          >
            {DROP_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{channelLabel(c.value, isAr ? 'ar' : 'en')}</option>
            ))}
          </select>
        </label>

        <MoreSettingsDrawer isAr={isAr} values={form} onChange={setField} />
```

Add the shared class constants near `sectionHeader`:

```ts
  const label = 'block text-sm font-bold text-gray-800';
  const field =
    'mt-1 w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#FF6B00]';
```

Delete the `Auction number` read-only `<label>` block (lines 295-304) entirely — the assigned number moves to the success panel in Task 9.

- [ ] **Step 7: Verify the suite and build**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/MoreSettingsDrawer.tsx src/components/admin/MoreSettingsDrawer.test.ts src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drop-builder): essentials-first layout with a More-settings drawer"
```

---

### Task 8: Per-field validation and real submit progress

`createListing` already accepts `onProgress(progress, stage)` where `stage` is `'video' | 'thumbnail' | 'saving'`. The builder has never passed it. Wire it rather than inventing a new mechanism.

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx`

**Interfaces:**
- Consumes: `validateDropForm` from `src/utils/dropFormState`

- [ ] **Step 1: Add validation state and the submit guard**

Add the import:

```ts
import { validateDropForm } from '../utils/dropFormState';
```

(extend the existing `dropFormState` import from Task 7 rather than adding a second one).

Add near the other state:

```ts
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progressLabel, setProgressLabel] = useState('');
```

Add an error-message helper above the return:

```ts
  const errorText = (code?: string): string => {
    if (!code) return '';
    if (code === 'PAST') return isAr ? 'وقت البدء يجب أن يكون في المستقبل' : 'Start time must be in the future';
    return isAr ? 'هذا الحقل مطلوب' : 'This field is required';
  };
```

At the top of `handleCreate`, replace the two ad-hoc checks (lines 151-158) with:

```ts
    const found = validateDropForm(form, Date.now());
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const firstKey = Object.keys(found)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (document.getElementById(`field-${firstKey}`) as HTMLElement | null)?.focus?.();
      return;
    }
```

Give each essential input a matching id (`id="field-productName"`, `id="field-startingPrice"`, `id="field-scheduledLocal"`) and render its error under it:

```tsx
          {errors.productName && (
            <span className="mt-1 block text-[11px] font-bold text-rose-600">{errorText(errors.productName)}</span>
          )}
```

- [ ] **Step 2: Label the gallery uploads**

The gallery photos upload in `handleCreate`'s own loop, before `createListing` is called. Change that loop from a `for...of` to an indexed loop so it can report position, replacing:

```ts
          for (const photo of extraPhotos) {
```

with:

```ts
          for (let i = 0; i < extraPhotos.length; i++) {
            const photo = extraPhotos[i];
            setProgressLabel(
              isAr
                ? `جارٍ رفع الصورة ${i + 1} من ${extraPhotos.length}…`
                : `Uploading photo ${i + 1} of ${extraPhotos.length}…`,
            );
```

The loop body (resize, `uploadBytes`, `getDownloadURL`, `extraPhotoUrls.push`) is unchanged.

- [ ] **Step 3: Wire createListing's existing onProgress callback**

`createListing`'s fourth parameter is `onProgress?: (progress: number, stage: 'video' | 'thumbnail' | 'saving') => void` (`AppContext.tsx:247`). The builder currently passes `undefined` there. Replace that `undefined` argument with:

```ts
        (progress, stage) => {
          if (stage === 'video') {
            setProgressLabel(isAr ? `جارٍ رفع الفيديو… ${Math.round(progress)}%` : `Uploading video… ${Math.round(progress)}%`);
          } else if (stage === 'thumbnail') {
            setProgressLabel(isAr ? `جارٍ رفع صورة الغلاف… ${Math.round(progress)}%` : `Uploading cover… ${Math.round(progress)}%`);
          } else {
            setProgressLabel(isAr ? 'جارٍ إنشاء المزاد…' : 'Creating auction…');
          }
        },
```

so the call reads `createListing(payload, videoFile ?? undefined, thumbnailFile ?? undefined, <the callback above>, 'upcoming')`.

Add `setProgressLabel('');` to the existing `finally` block alongside `setSubmitting(false)`.

- [ ] **Step 4: Show it on the button**

Replace the submit button with:

```tsx
        <button
          disabled={submitting}
          onClick={handleCreate}
          className="w-full bg-[#FF6B00] hover:bg-orange-500 disabled:opacity-60 text-white font-black text-sm py-3.5 rounded-2xl transition-all"
        >
          {submitting
            ? (progressLabel || (isAr ? 'جارٍ الإنشاء…' : 'Creating…'))
            : (isAr ? 'إنشاء المزاد' : 'Create drop')}
        </button>
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
```

Note the button is **not** disabled for an incomplete form — clicking it reveals what is missing.

- [ ] **Step 5: Verify the suite and build**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds

- [ ] **Step 6: Manual check**

With `npm run dev`, click Create on an empty form: the page should scroll to Product name and show its error, not sit inert. Then create a real drop with a video attached and confirm the button text advances through the upload stages.

- [ ] **Step 7: Commit**

```bash
git add src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drop-builder): per-field validation and real upload progress"
```

---

### Task 9: Success panel with Create another

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx`
- Create: `src/components/admin/DropSuccessPanel.tsx`

**Interfaces:**
- Consumes: `afterCreateAnother` from `src/utils/dropFormState`; `canEditDrop`, `canCancelDrop`, `cancelWarnsAboutBids`, `bidCountOf` from `src/utils/dropEditability`; `buildAuctionUrl` from `src/utils/deepLink`
- Produces: `DropSuccessPanelProps`, default export `DropSuccessPanel`

- [ ] **Step 1: Write the panel**

Create `src/components/admin/DropSuccessPanel.tsx`:

```tsx
import React from 'react';
import { canEditDrop, canCancelDrop, cancelWarnsAboutBids, bidCountOf } from '../../utils/dropEditability';

/**
 * Replaces the form after a successful create.
 *
 * The previous build left the whole form populated and reported success as one
 * small green line in the *other* column — on a phone, off screen entirely.
 * This panel takes the form's place so the confirmation lands where the admin
 * is already looking, and carries every next action they might want.
 */
export interface DropSuccessPanelProps {
  isAr: boolean;
  auctionNumber: number | string | undefined;
  title: string;
  startingPrice: number;
  coverUrl: string;
  opensLabel: string;
  durationLabel: string;
  finalLink: string;
  caption: string;
  status?: string | null;
  totalBids?: number | null;
  hasCopyableMedia: boolean;
  onCopyLink: () => void;
  onCopyCaption: () => void;
  onCopyImage: () => void;
  onDownloadMedia: () => void;
  onCreateAnother: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

const action =
  'flex-1 border border-gray-300 rounded-xl py-2.5 text-xs font-bold text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export const DropSuccessPanel: React.FC<DropSuccessPanelProps> = ({
  isAr, auctionNumber, title, startingPrice, coverUrl, opensLabel, durationLabel,
  finalLink, caption, status, totalBids, hasCopyableMedia,
  onCopyLink, onCopyCaption, onCopyImage, onDownloadMedia,
  onCreateAnother, onEdit, onCancel,
}) => {
  const lot = { status, totalBids };
  const bids = bidCountOf(lot);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-black text-emerald-700">
          ✅ {isAr ? `تم إنشاء المزاد رقم ${auctionNumber ?? '—'}` : `Auction #${auctionNumber ?? '—'} created`}
        </h2>
        <p className="mt-1 text-xs font-bold text-gray-500">{opensLabel} · {durationLabel}</p>
      </div>

      <div className="flex items-center gap-3">
        {coverUrl && <img src={coverUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />}
        <div className="min-w-0">
          <p className="font-extrabold text-sm text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-500 font-mono">
            {isAr ? 'يبدأ من ' : 'Starting at '}{startingPrice.toLocaleString('en-US')} JOD
          </p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-2.5 text-xs break-all font-mono text-gray-700">{finalLink}</div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCopyLink} className={action}>{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
        <button type="button" onClick={onCopyCaption} className={action}>{isAr ? 'نسخ النص' : 'Copy caption'}</button>
        <button type="button" onClick={onCopyImage} disabled={!hasCopyableMedia} className={action}>{isAr ? 'نسخ الصورة' : 'Copy image'}</button>
        <button type="button" onClick={onDownloadMedia} disabled={!hasCopyableMedia} className={action}>{isAr ? 'تنزيل الوسائط' : 'Download media'}</button>
      </div>
      {!hasCopyableMedia && (
        <p className="text-[11px] text-gray-400">
          {isAr ? 'لا توجد وسائط لنسخها — أضف صورة غلاف أو فيديو.' : 'Nothing to copy — this drop has no cover image or video.'}
        </p>
      )}

      <pre className="whitespace-pre-wrap border border-gray-200 rounded-xl p-3 text-xs bg-gray-50 max-h-64 overflow-y-auto" style={{ direction: 'rtl' }}>{caption}</pre>

      <div className="pt-2 border-t border-gray-100 space-y-2">
        <button
          type="button"
          onClick={onCreateAnother}
          className="w-full bg-[#FF6B00] hover:bg-orange-500 text-white font-black text-sm py-3 rounded-2xl transition-all cursor-pointer"
        >
          {isAr ? '＋ إنشاء مزاد آخر' : '＋ Create another'}
        </button>

        <div className="flex gap-2">
          {canEditDrop(lot) ? (
            <button type="button" onClick={onEdit} className={action}>{isAr ? 'تعديل' : 'Edit'}</button>
          ) : (
            <p className="flex-1 text-[11px] font-bold text-gray-500 self-center">
              {isAr
                ? `عليه ${bids} مزايدة — لم يعد قابلاً للتعديل`
                : `${bids} bid${bids === 1 ? '' : 's'} placed — no longer editable`}
            </p>
          )}
          {canCancelDrop(lot) && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء المزاد' : 'Cancel drop'}
              {cancelWarnsAboutBids(lot) ? ' ⚠️' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DropSuccessPanel;
```

- [ ] **Step 2: Swap the form for the panel after create**

In `AuctionDropBuilderView.tsx`, wrap the form column so it renders the panel once `createdId` is set and the admin has not re-entered edit mode:

```tsx
      {createdId && !editing ? (
        <DropSuccessPanel
          isAr={isAr}
          auctionNumber={assignedNumber}
          title={form.productName.trim()}
          startingPrice={Number(form.startingPrice) || 0}
          coverUrl={thumbnailPreview}
          opensLabel={
            form.opensMode === 'now'
              ? (isAr ? 'يفتح الآن' : 'Opens now')
              : form.opensMode === 'first_bid'
                ? (isAr ? 'يبدأ مع أول مزايدة' : 'Starts on the first bid')
                : (isAr ? `يفتح ${startTimeDisplay}` : `Opens at ${startTimeDisplay}`)
          }
          durationLabel={durationLabel}
          finalLink={finalLink}
          caption={caption}
          status={createdAuction?.status}
          totalBids={createdAuction?.totalBids}
          hasCopyableMedia={Boolean(thumbnailFile || videoFile)}
          onCopyLink={() => copy(finalLink)}
          onCopyCaption={() => copy(caption)}
          onCopyImage={async () => {
            const ok = thumbnailPreview ? await copyImageToClipboard(thumbnailPreview) : false;
            setCopyImageMsg(ok ? (isAr ? '✅ نُسخت الصورة' : '✅ Image copied') : (isAr ? 'تعذّر النسخ — استخدم تنزيل' : "Couldn't copy — use Download"));
          }}
          onDownloadMedia={() => downloadMedia([
            ...(thumbnailPreview ? [{ url: thumbnailPreview, kind: 'cover' as const }] : []),
            ...extraPhotos.map((p, i) => ({ url: p.url, kind: 'gallery' as const, idx: i })),
            ...(videoFile ? [{ url: URL.createObjectURL(videoFile), kind: 'video' as const }] : []),
          ])}
          onCreateAnother={handleCreateAnother}
          onEdit={() => setEditing(true)}
          onCancel={handleCancelDrop}
        />
      ) : (
        <div className="space-y-6">
          {/* the entire form column as built in Tasks 6-8: MediaPicker section,
              Product name, Starting price, Opens, Runs for, Channel,
              MoreSettingsDrawer, then the submit bar */}
        </div>
      )}
```

Note the panel reads `form.productName` and `form.startingPrice` — those still hold the created lot's values because `handleCreateAnother` is what clears them, not `handleCreate`.

Add the supporting state and handler:

```ts
  const [editing, setEditing] = useState(false);

  const createdAuction = useMemo(
    () => (createdId ? auctions.find((a) => a.id === createdId) : undefined),
    [createdId, auctions],
  );

  const handleCreateAnother = () => {
    setForm(afterCreateAnother(form));
    extraPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    setExtraPhotos([]);
    setThumbnailFile(null);
    setThumbnailPreview('');
    setVideoFile(null);
    setCreatedId(null);
    setEditing(false);
    setErrors({});
    setError('');
    setCopyImageMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
```

- [ ] **Step 3: Stop rendering a dead placeholder link pre-create**

Replace the `deepLink` memo (lines 115-118) with:

```ts
  // Pre-create there is no id yet. The old build interpolated a literal
  // "{{auction-id}}" into the caption, which rendered as a broken percent-
  // encoded URL in the preview — something an admin could copy by accident.
  const deepLink = useMemo(
    () =>
      createdId
        ? buildAuctionUrl(createdId, window.location.origin)
        : (isAr ? '(يُضاف الرابط عند الإنشاء)' : '(link added when you create)'),
    [createdId, isAr],
  );
```

- [ ] **Step 4: Verify the suite and build**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds

- [ ] **Step 5: Manual check**

Create a drop. Confirm the form is replaced by the panel, the auction number appears, the link is real, Copy caption works, and Create another returns an empty item form that still has the channel, duration, payment window and anti-snipe you had chosen — with **viewing cleared**.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/DropSuccessPanel.tsx src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drop-builder): success panel with create-another, and no dead preview link"
```

---

### Task 10: Edit and cancel a just-created drop

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx`

**Interfaces:**
- Consumes: `canEditDrop`, `cancelWarnsAboutBids`, `bidCountOf` from `src/utils/dropEditability`; `deleteAuction` from `useApp()`
- Produces: `handleSaveEdit`, `handleCancelDrop` (local to the view)

- [ ] **Step 1: Add the save-edit handler**

Add `deleteAuction` to the `useApp()` destructure, plus these imports:

```ts
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { canEditDrop, cancelWarnsAboutBids, bidCountOf } from '../utils/dropEditability';
```

```ts
  const handleSaveEdit = async () => {
    if (!createdId) return;
    const found = validateDropForm(form, Date.now());
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Re-check against the live doc, not the snapshot the panel rendered from:
    // a bid can land between opening the editor and pressing Save.
    if (!canEditDrop({ status: createdAuction?.status, totalBids: createdAuction?.totalBids })) {
      setError(isAr ? 'وصلت مزايدة — لم يعد التعديل ممكناً.' : 'A bid landed — this drop can no longer be edited.');
      setEditing(false);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = buildDropPayload(
        {
          productName: form.productName,
          startingPrice: form.startingPrice,
          channel: form.channel,
          durationSeconds: form.durationSeconds,
          paymentWindowHours: form.paymentWindowHours,
          antiSnipeSec: form.antiSnipeSec,
          startMode: opens.startMode,
          scheduledStartAtMs: opens.scheduledStartAtMs,
          autoRelist: form.autoRelist,
          viewing: form.viewing,
          viewingPlace: form.viewingPlace,
          marketPrice: form.marketPrice,
          reservePrice: form.reservePrice,
          vendorName: form.vendorName,
          extraPhotoUrls: [],
        },
        Date.now(),
      );

      // Media and the reserve are deliberately NOT part of an edit write.
      // mediaUrls/videoUrl/thumbnailUrl would be clobbered to empty by a
      // payload built from a form that holds no uploaded URLs, and the reserve
      // lives in the admin-only auctionSecrets doc which this form cannot read
      // — so a blank reserve field here must not erase a stored one.
      delete (payload as any).mediaUrls;
      delete (payload as any).videoUrl;
      delete (payload as any).thumbnailUrl;
      delete (payload as any).reservePrice;
      delete (payload as any).currentBidderId;
      delete (payload as any).currentBidderName;

      await updateDoc(doc(db, 'auctions', createdId), payload as any);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل حفظ التعديل' : 'Failed to save changes'));
    } finally {
      setSubmitting(false);
    }
  };
```

- [ ] **Step 2: Add the cancel handler**

```ts
  const handleCancelDrop = async () => {
    if (!createdId) return;
    const lot = { status: createdAuction?.status, totalBids: createdAuction?.totalBids };
    const bids = bidCountOf(lot);

    const message = cancelWarnsAboutBids(lot)
      ? (isAr
          ? `${bids} شخص زايد على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم. هل أنت متأكد؟`
          : `${bids} ${bids === 1 ? 'person has' : 'people have'} bid on this. Cancelling removes the auction and their bids. Are you sure?`)
      : (isAr ? 'هل تريد إلغاء هذا المزاد وحذفه؟' : 'Cancel this drop and delete it?');

    if (!window.confirm(message)) return;

    setSubmitting(true);
    try {
      await deleteAuction(createdId);
      handleCreateAnother();
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل إلغاء المزاد' : 'Failed to cancel the drop'));
    } finally {
      setSubmitting(false);
    }
  };
```

- [ ] **Step 3: Render the edit-mode save bar**

When `editing` is true the form column shows, with the Create button replaced by:

```tsx
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveEdit}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-sm py-3.5 rounded-2xl transition-all cursor-pointer"
            >
              {submitting ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ التعديلات' : 'Save changes')}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setErrors({}); setError(''); }}
              className="flex-1 border border-gray-300 rounded-2xl py-3.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء التعديل' : 'Discard changes'}
            </button>
          </div>
        ) : (
          <button
            disabled={submitting}
            onClick={handleCreate}
            className="w-full bg-[#FF6B00] hover:bg-orange-500 disabled:opacity-60 text-white font-black text-sm py-3.5 rounded-2xl transition-all"
          >
            {submitting
              ? (progressLabel || (isAr ? 'جارٍ الإنشاء…' : 'Creating…'))
              : (isAr ? 'إنشاء المزاد' : 'Create drop')}
          </button>
        )}
```

- [ ] **Step 4: Verify the suite and build**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds

- [ ] **Step 5: Manual check**

Create a drop, press Edit, change the title and price, Save, and confirm both changed in Admin → Launch's master directory. Then create another, place a bid on it from a second browser profile, and confirm Edit is replaced by the "N bids placed" line while Cancel still appears with a warning.

- [ ] **Step 6: Commit**

```bash
git add src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drop-builder): edit until first bid, cancel with a bid-count warning"
```

---

### Task 11: Mobile layout

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx` (root container, line 287)
- Modify: `src/components/DropsListPanel.tsx` (wrap in a mobile accordion)

- [ ] **Step 1: Make the drops list collapsible below `md`**

In `src/components/DropsListPanel.tsx`, wrap the returned content so it is closed by default on small screens and always open from `md` up:

```tsx
  const [openOnMobile, setOpenOnMobile] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpenOnMobile((o) => !o)}
        aria-expanded={openOnMobile}
        className="md:hidden w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-2xl text-sm font-black text-gray-900 bg-white cursor-pointer"
      >
        <span>{isAr ? 'مزاداتك' : 'Your drops'}</span>
        <span className={`transition-transform ${openOnMobile ? 'rotate-90' : ''}`}>▸</span>
      </button>
      <div className={`${openOnMobile ? 'block' : 'hidden'} md:block mt-3 md:mt-0`}>
        {/* existing panel body, unchanged */}
      </div>
    </div>
  );
```

If `DropsListPanel` does not already have `isAr` in scope, derive it from `useApp()` the same way the file's other language strings do.

- [ ] **Step 2: Sticky submit on small screens**

Change the root container (line 287) to keep the scroll ownership rule — `h-full overflow-y-auto`, no `min-h-screen` — and wrap the submit button in a sticky footer below `md`:

```tsx
    <div
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      className="h-full overflow-y-auto max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2 pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
```

and around the Create / Save bar:

```tsx
        <div className="sticky bottom-0 md:static bg-white/95 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none -mx-4 md:mx-0 px-4 md:px-0 py-3 md:py-0 border-t md:border-t-0 border-gray-200 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-0">
          {/* Create button, or the edit save bar */}
        </div>
```

- [ ] **Step 3: Verify the suite and build**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds

- [ ] **Step 4: Manual check on a phone viewport**

In Chrome DevTools device mode at 390×844, confirm: the form is a single column; the Create button stays pinned above the home indicator; after creating, the success panel is visible without scrolling; "Your drops" is collapsed and expands on tap. Repeat in Arabic and confirm the sticky bar and drawer chevron sit correctly in RTL.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionDropBuilderView.tsx src/components/DropsListPanel.tsx
git commit -m "feat(drop-builder): mobile layout — sticky submit, collapsible drops list"
```

---

### Task 12: Lock money and timing fields once a lot has bids

**Files:**
- Modify: `firestore.rules` (the `match /auctions/{auctionId}` update rule, lines 150-164)

**⚠️ Two things this rule must not break — verify both before committing:**
1. **`SimulatorPanel.tsx:216`** writes `endTime` and `endsAt` directly from the client, as admin, on simulated lots the bot has **already bid on**. Without the `isSimulated` exemption below, "End now" in the simulator stops working.
2. **`LaunchSection.tsx:602-669`** edits `viewing`/`viewingPlace` on **live** lots via `setAuctionViewing` (`AppContext.tsx:3974`). Those two keys must stay editable at any bid count.

Cloud Functions use the Admin SDK and bypass rules entirely, so `placeBid`, `scheduledAuctionCloser` and `settleAuctionTxn` are unaffected.

- [ ] **Step 1: Add the helper functions**

In `firestore.rules`, inside `match /auctions/{auctionId}`, above the `allow create` line:

```
      // Money- and timing-defining fields. Changing any of these after someone
      // has committed a bid changes the deal under them, so admins lose write
      // access to them at the first bid. Title, media, viewing and approval
      // fields stay editable — LaunchSection edits viewing on LIVE lots.
      function moneyTimingKeys() {
        return [
          'startingPrice', 'currentPrice', 'duration', 'endTime', 'endsAt',
          'scheduledStartAt', 'paymentWindowHours',
          'antiSnipeWindowSec', 'antiSnipeExtendSec'
        ];
      }

      // Reads as zero for missing, null or non-numeric counts, so a malformed
      // doc fails OPEN (editable) rather than locking an admin out of a lot
      // nobody has bid on.
      function auctionBidCount() {
        return resource.data.get('totalBids', 0) is number
          ? resource.data.get('totalBids', 0)
          : 0;
      }

      // Simulated lots are exempt: the admin Simulator's "End now" writes
      // endTime/endsAt from the client on lots its bot has already bid on
      // (SimulatorPanel.tsx). Simulated data is invisible to real users by
      // construction, so no real bidder can be affected.
      function adminEditBlocked() {
        return auctionBidCount() > 0
          && resource.data.get('isSimulated', false) != true
          && request.resource.data.diff(resource.data).affectedKeys().hasAny(moneyTimingKeys());
      }
```

- [ ] **Step 2: Apply it to the update rule**

Change the opening of the `allow update` rule (line 150) from:

```
      allow update: if isSignedIn() && (
        isAdmin() ||
```

to:

```
      allow update: if isSignedIn() && (
        (isAdmin() && !adminEditBlocked()) ||
```

Leave the entire creator branch below it untouched.

- [ ] **Step 3: Verify the suite and build still pass**

Run: `npm test && npm run build`
Expected: full suite PASS, build succeeds (rules are not covered by either, but nothing should regress)

- [ ] **Step 4: Verify the rule by hand**

This repo has no rules test harness, so verify in the Firebase console → Firestore → Rules → **Rules Playground**, against project `mazadjoapp`, using the rules text from this branch (paste it in — do **not** publish from the playground):

| # | Simulation | Location | Auth | Data | Expect |
|---|---|---|---|---|---|
| 1 | update | `/auctions/testA` | admin uid `tCAmo1C49aOdzbhZ2W0w6pf5ZNA2` | doc `{totalBids: 0}`, write `{startingPrice: 99}` | **Allow** |
| 2 | update | `/auctions/testA` | same | doc `{totalBids: 3}`, write `{startingPrice: 99}` | **Deny** |
| 3 | update | `/auctions/testA` | same | doc `{totalBids: 3}`, write `{viewing: 'office'}` | **Allow** |
| 4 | update | `/auctions/testA` | same | doc `{totalBids: 3}`, write `{title: 'x'}` | **Allow** |
| 5 | update | `/auctions/testA` | same | doc `{totalBids: 3, isSimulated: true}`, write `{endTime: 123}` | **Allow** |
| 6 | update | `/auctions/testA` | same | doc `{}` (no totalBids), write `{startingPrice: 99}` | **Allow** |
| 7 | update | `/auctions/testA` | same | doc `{totalBids: null}`, write `{startingPrice: 99}` | **Allow** |

Record the seven outcomes in the PR description. If any differs, stop and fix the rule before merging — this deploys to production via the CI "Deploy Firebase" workflow the moment the branch merges to main.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "fix(rules): lock auction money and timing fields once a lot has bids"
```

---

## Final verification

- [ ] `npm test` — full suite green, roughly 60 new tests over the pre-branch count
- [ ] `npm run build` — succeeds
- [ ] `git show --stat` on every commit in the branch — confirm no `node_modules` symlink or other stray file was tracked (this has bitten the repo before)
- [ ] Manual end-to-end: create a drop with cover + 2 gallery photos + video, confirm progress labels advance, success panel shows the real number and link, Copy caption produces the caption with the real URL, Create another preserves ops settings and clears viewing, Edit changes the title, Cancel deletes it
- [ ] Repeat the end-to-end in Arabic
- [ ] Repeat the end-to-end at 390×844
- [ ] Confirm Admin → Launch's "Edit viewing" still saves on a live lot (Task 12 regression)
- [ ] Confirm the Simulator's "End now" still works on a lot with bot bids (Task 12 regression)

## Notes for the reviewer

- **`condition` and `specs` never reach the auction document.** The form collects both and uses them only for the WhatsApp caption. This is pre-existing and deliberately unchanged here — Task 1's characterization test pins it. Worth raising with the product owner separately.
- **`AdminPanel.tsx` is dead code** — lazily imported in `DesktopFrame.tsx:14` and never rendered. Its client-side "RESET ALL AUCTIONS" batch would otherwise conflict with Task 12's rule. Left alone.
- **15 `TEST — …` lots are live in production** as of 2026-07-27. Unrelated to this work, flagged separately.
