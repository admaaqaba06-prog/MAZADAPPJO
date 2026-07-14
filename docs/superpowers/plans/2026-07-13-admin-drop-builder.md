# Admin Drop-Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2 (post-review):** folds in the plan review's blockers and fixes — drops are created as `'upcoming'` so deep links resolve (B1); `createListing` returns the new id and is typed `Promise<string>` (B2); an admin nav entry makes the view reachable (S1); the caption is display-only, not persisted with a placeholder link (S2); `scheduledStartAt` is stored as `null` in Phase 1 (S3); category is derived from the channel (S4); the `as any` cast is removed by supplying the required bidder fields (S5).

**Goal:** Give the Mazad JO team an in-app admin screen that creates an auction and auto-produces the two things they paste into a WhatsApp Channel: the full Arabic caption and a shareable deep link that opens that exact auction in the app.

**Architecture:** Extend the existing state-based (no-router) React app. The daily-pain logic (Arabic caption, deep link, channel mapping) is extracted into pure, unit-tested modules under `src/utils/`. Persistence reuses the existing `createListing` path in `AppContext`, extended to (a) accept an `initialStatus`, (b) return the new auction id, and (c) write two additive optional fields (`channel`, `scheduledStartAt`). The UI is one new admin-gated view, reachable from an admin nav entry, following existing patterns. A tiny on-load URL parser turns `?auction=<id>` into the app's existing `setActiveAuctionId` + `setActiveView('live')` navigation.

**Tech Stack:** React 19, TypeScript, Vite 6, Firebase (Firestore + Storage). Adds **vitest** (dev-only) as the test runner — none exists today.

## Global Constraints

- **Runtime deps:** add NO new runtime dependencies. Only dev dependency `vitest` is permitted.
- **Firestore collection** for auctions is `auctions`; docs are keyed by the generated auction id. Never write balances/bids/escrows from the client — those are server-only (unchanged by this plan).
- **Additive only:** do not modify existing `category`, `endTime`/`endsAt`/`duration`, bid logic, or the `scheduledAuctionCloser`. New auction fields are optional and additive.
- **Drop lifecycle:** drops are created with `status: 'upcoming'` (this status IS in the live-auction listener's query at `AppContext.tsx:862-866`, so a deep link resolves to the exact auction the moment it's created). Going live and setting the authoritative countdown stays the existing manual `approveListing` (`AppContext.tsx:2582`) until Phase 2 auto-open. `'upcoming'` auctions are safe from `scheduledAuctionCloser` (it only closes `status === 'active' || 'live'`).
- **Deep-link origin:** links use `window.location.origin`. For real WhatsApp Channel posts the app must be opened from its deployed origin (not `localhost`). This is an ops fact, not a code branch.
- **Admin gate:** reuse the existing check verbatim — `currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true` (as in `src/App.tsx:30`/`:105`).
- **i18n/RTL:** no i18n library. UI labels use the existing inline pattern `const isAr = language === 'ar'; {isAr ? 'عربي' : 'English'}` and RTL via inline `style={{ direction: isAr ? 'rtl' : 'ltr' }}` (as in `src/components/ListingWizardView.tsx`). The generated **caption is always Arabic** (content, not chrome).
- **Numerals:** the generated caption uses Western digits throughout (matches the Task 1 tests). Do not mix Arabic-Indic and Western numerals in one caption.
- **Typecheck gate:** `npm run lint` (= `tsc --noEmit`) must pass after every task.
- **Human checkpoint (before shipping, not a task):** the Arabic boilerplate (hype / rules / terms lines) is transcribed from the current WhatsApp card and MUST be confirmed verbatim with the Mazad JO team before the feature is used in production.

---

### Task 1: Test runner + Arabic caption generator (pure, TDD)

**Files:**
- Modify: `package.json` (add `test` script + `vitest` devDependency)
- Create: `vitest.config.ts`
- Create: `src/utils/dropCaption.ts`
- Test: `src/utils/dropCaption.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface DropCaptionInput { auctionNumber: number | string; startTime: string; durationLabel: string; startingPriceJod: number; productName: string; specs: string[]; condition: string; deepLink: string }`
  - `export function buildAuctionCaption(input: DropCaptionInput): string`

- [ ] **Step 1: Install vitest (dev-only)**

Run:
```bash
cd /Users/mj/code/mazadjo && npm install -D vitest@^2
```
Expected: `vitest` added under `devDependencies`; no runtime deps changed.

- [ ] **Step 2: Add the test script**

Modify `package.json` `scripts` block — add the `test` line (keep all existing scripts):
```json
    "lint": "tsc --noEmit",
    "test": "vitest run"
```

- [ ] **Step 3: Create the vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/utils/dropCaption.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildAuctionCaption } from './dropCaption';

const sample = {
  auctionNumber: 1706,
  startTime: '7:30',
  durationLabel: '30 دقيقة',
  startingPriceJod: 125,
  productName: 'Green Home غسالة',
  specs: ['السعة: 7 كغم', 'تحميل أمامي', 'شاشة رقمية'],
  condition: 'جديدة كلياً',
  deepLink: 'https://mazadjo.app/?auction=auction-123',
};

describe('buildAuctionCaption', () => {
  it('includes the auction number and start time', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('مزاد رقم: 1706');
    expect(out).toContain('يبدأ الساعة: 7:30');
  });

  it('includes duration, starting price and product name', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('مدة المزاد: 30 دقيقة');
    expect(out).toContain('يبدأ المزاد من: (125 دينار)');
    expect(out).toContain('اسم المنتج: Green Home غسالة');
  });

  it('renders every spec as a bullet and the condition', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('• السعة: 7 كغم');
    expect(out).toContain('• تحميل أمامي');
    expect(out).toContain('• شاشة رقمية');
    expect(out).toContain('جديدة كلياً');
  });

  it('includes the subscribers-only rule, the guarantee and the deep link', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('المزايدة للمشتركين فقط');
    expect(out).toContain('كفالة المزاد: شهر استرجاع');
    expect(out).toContain('https://mazadjo.app/?auction=auction-123');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/dropCaption.test.ts`
Expected: FAIL — `Failed to resolve import "./dropCaption"` / `buildAuctionCaption is not a function`.

- [ ] **Step 6: Implement the generator**

Create `src/utils/dropCaption.ts`:
```ts
export interface DropCaptionInput {
  auctionNumber: number | string;
  startTime: string;        // e.g. "7:30"
  durationLabel: string;    // e.g. "30 دقيقة"
  startingPriceJod: number;
  productName: string;
  specs: string[];
  condition: string;
  deepLink: string;
}

// Standing boilerplate — transcribed from the current WhatsApp card.
// MUST be confirmed verbatim with the team before production use (see Global Constraints).
const HYPE = [
  '🚀 سرعة... حماس... وحسم حقيقي بأقوى الأسعار',
  '🔥 كل ثانية بالمزاد أصبحت تصنع الفرق',
  'والرابح الحقيقي هو الأسرع والأذكى بالمزايدة',
];

const RULES = [
  '⚠️ يبدأ احتساب المزايدات فقط عند الإعلان الرسمي عن بدء المزاد',
  '⚠️ عند انتهاء الوقت يتم اعتماد آخر مزايدة مسجلة',
];

const TERMS = [
  '🛡️ كفالة المزاد: شهر استرجاع',
  '⚠️ المزايدة للمشتركين فقط',
  '💰 الدفع: فوري بعد رسو المزاد',
  '🏆 الدفع عند الاستلام: متاح لمشتركي Mazad JO VIP فقط ضمن نظام التأمين المعتمد',
  '🚚 التسليم: خلال 2 – 4 أيام',
];

export function buildAuctionCaption(input: DropCaptionInput): string {
  const specLines = input.specs
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `• ${s}`)
    .join('\n');

  return [
    `🔥 مزاد رقم: ${input.auctionNumber} | يبدأ الساعة: ${input.startTime} 🔥`,
    `⏱️ مدة المزاد: ${input.durationLabel} فقط`,
    '',
    `👑 يبدأ المزاد من: (${input.startingPriceJod} دينار)`,
    '',
    `🖤 اسم المنتج: ${input.productName}`,
    '',
    'المواصفات:',
    specLines,
    '',
    'الحالة:',
    input.condition,
    '',
    ...HYPE,
    '',
    ...RULES,
    '',
    ...TERMS,
    '',
    `🔗 زايد الآن: ${input.deepLink}`,
    '',
    'البيع الذكي والشراء الأذكى — Mazad JO 🔥',
  ].join('\n');
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/dropCaption.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/mj/code/mazadjo
git add package.json package-lock.json vitest.config.ts src/utils/dropCaption.ts src/utils/dropCaption.test.ts
git commit -m "feat(drop-builder): add vitest + Arabic auction caption generator"
```

---

### Task 2: Deep-link builder + parser (pure, TDD)

**Files:**
- Create: `src/utils/deepLink.ts`
- Test: `src/utils/deepLink.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function buildAuctionUrl(auctionId: string, origin: string): string`
  - `export function parseAuctionIdFromSearch(search: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/utils/deepLink.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildAuctionUrl, parseAuctionIdFromSearch } from './deepLink';

describe('buildAuctionUrl', () => {
  it('builds an origin-rooted url with the auction query param', () => {
    expect(buildAuctionUrl('auction-123', 'https://mazadjo.app')).toBe(
      'https://mazadjo.app/?auction=auction-123',
    );
  });

  it('strips a trailing slash on the origin', () => {
    expect(buildAuctionUrl('a1', 'https://mazadjo.app/')).toBe(
      'https://mazadjo.app/?auction=a1',
    );
  });

  it('url-encodes the id', () => {
    expect(buildAuctionUrl('a b', 'https://x.com')).toBe(
      'https://x.com/?auction=a%20b',
    );
  });
});

describe('parseAuctionIdFromSearch', () => {
  it('reads the auction id from a query string', () => {
    expect(parseAuctionIdFromSearch('?auction=auction-123')).toBe('auction-123');
  });

  it('returns null when absent', () => {
    expect(parseAuctionIdFromSearch('?foo=bar')).toBeNull();
    expect(parseAuctionIdFromSearch('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/deepLink.test.ts`
Expected: FAIL — cannot resolve `./deepLink`.

- [ ] **Step 3: Implement**

Create `src/utils/deepLink.ts`:
```ts
export function buildAuctionUrl(auctionId: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/?auction=${encodeURIComponent(auctionId)}`;
}

export function parseAuctionIdFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const id = params.get('auction');
  return id && id.trim() ? id : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/deepLink.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/utils/deepLink.ts src/utils/deepLink.test.ts
git commit -m "feat(drop-builder): add deep-link builder and query parser"
```

---

### Task 3: Channel (vertical) definitions + category mapping + auction type extension (TDD)

**Files:**
- Create: `src/utils/dropChannel.ts`
- Test: `src/utils/dropChannel.test.ts`
- Modify: `src/types.ts:68-89` (add three optional fields to `AuctionItem`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type DropChannel = 'phones' | 'cars' | 'misc'`
  - `export const DROP_CHANNELS: ReadonlyArray<{ value: DropChannel; en: string; ar: string }>`
  - `export function channelLabel(value: DropChannel, lang: 'en' | 'ar'): string`
  - `export function channelToCategory(value: DropChannel): 'Electronics' | 'Vehicles' | 'Fashion'`
  - `AuctionItem` gains: `caption?: string; channel?: DropChannel; scheduledStartAt?: number | null`

- [ ] **Step 1: Write the failing test**

Create `src/utils/dropChannel.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DROP_CHANNELS, channelLabel, channelToCategory } from './dropChannel';

describe('drop channels', () => {
  it('defines exactly phones, cars, misc', () => {
    expect(DROP_CHANNELS.map((c) => c.value)).toEqual(['phones', 'cars', 'misc']);
  });

  it('returns the localized label', () => {
    expect(channelLabel('phones', 'en')).toBe('Mazad — Phones');
    expect(channelLabel('cars', 'ar')).toBe('مزاد — سيارات');
  });

  it('maps each channel to an existing AuctionItem category', () => {
    expect(channelToCategory('phones')).toBe('Electronics');
    expect(channelToCategory('cars')).toBe('Vehicles');
    expect(channelToCategory('misc')).toBe('Fashion');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/dropChannel.test.ts`
Expected: FAIL — cannot resolve `./dropChannel`.

- [ ] **Step 3: Implement the channel module**

Create `src/utils/dropChannel.ts`:
```ts
export type DropChannel = 'phones' | 'cars' | 'misc';

export const DROP_CHANNELS: ReadonlyArray<{ value: DropChannel; en: string; ar: string }> = [
  { value: 'phones', en: 'Mazad — Phones', ar: 'مزاد — هواتف' },
  { value: 'cars', en: 'Mazad — Cars', ar: 'مزاد — سيارات' },
  { value: 'misc', en: 'Mazad — Misc', ar: 'مزاد — منوعات' },
];

export function channelLabel(value: DropChannel, lang: 'en' | 'ar'): string {
  const found = DROP_CHANNELS.find((c) => c.value === value);
  if (!found) return value;
  return lang === 'ar' ? found.ar : found.en;
}

// Maps a drop channel to one of AuctionItem.category's existing values, since
// category drives the app's discovery filter and media-fallback logic.
export function channelToCategory(value: DropChannel): 'Electronics' | 'Vehicles' | 'Fashion' {
  switch (value) {
    case 'cars':
      return 'Vehicles';
    case 'phones':
      return 'Electronics';
    case 'misc':
    default:
      return 'Fashion';
  }
}
```

- [ ] **Step 4: Extend the auction type**

In `src/types.ts`, inside `interface AuctionItem` (currently ending around `:89` with `viewersCount: number;`), add these three optional fields right after `viewersCount: number;`:
```ts
  // Drop-builder fields (additive; optional). See docs/superpowers/plans/2026-07-13-admin-drop-builder.md
  caption?: string;                       // generated Arabic caption (display-only in Phase 1; not persisted)
  channel?: 'phones' | 'cars' | 'misc';   // which WhatsApp channel this drop targets
  scheduledStartAt?: number | null;       // Unix ms; null in Phase 1, consumed by auto-open in Phase 2
```
(The literal union is repeated here rather than importing `DropChannel` to keep `types.ts` dependency-free, matching the file's existing self-contained style.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/dropChannel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/utils/dropChannel.ts src/utils/dropChannel.test.ts src/types.ts
git commit -m "feat(drop-builder): add channel verticals, category mapping + auction fields"
```

---

### Task 4: Parse `?auction=<id>` on app load (integration)

**Files:**
- Modify: `src/App.tsx` — add a mount effect in **`MainAppShell`** (the component that renders `<ActiveViewRenderer />` and holds the `isStrictAdmin` check at `:105`; it only mounts post-auth, so navigating to `'live'` is safe there). Do NOT put the effect in `ActiveViewRenderer`.

**Interfaces:**
- Consumes: `parseAuctionIdFromSearch` (Task 2); context `setActiveAuctionId`, `setActiveView` (`AppContext.tsx:73-74`).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

`App.tsx` lives at `src/App.tsx`, so `src/utils` is a sibling directory. Add with the other imports:
```ts
import { parseAuctionIdFromSearch } from './utils/deepLink';
```
Ensure `useEffect` is imported from `react` (add it to the existing React import if not already present).

- [ ] **Step 2: Add the deep-link effect in `MainAppShell`**

Inside `MainAppShell` (the component holding the `isStrictAdmin` check at `:105`), destructure the two setters from `useApp()` (reuse existing bindings if already destructured there) and add a mount-only effect:
```tsx
  const { setActiveAuctionId, setActiveView } = useApp();

  useEffect(() => {
    const id = parseAuctionIdFromSearch(window.location.search);
    if (id) {
      setActiveAuctionId(id);
      setActiveView('live');
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify in the running app**

Run: `cd /Users/mj/code/mazadjo && npm run dev`
Then open `http://localhost:3000/?auction=auction-rolex` (`auction-rolex` is the default seeded id per `AppContext.tsx:379`).
Expected: after auth, the app opens the **live auction view** targeting that id (not the discovery feed). Open `http://localhost:3000/` with no query → normal default view. Stop the dev server when confirmed.

- [ ] **Step 5: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/App.tsx
git commit -m "feat(drop-builder): open ?auction=<id> deep links into the live view"
```

---

### Task 5: `createListing` returns the id + accepts an initial status + persists drop fields

**Files:**
- Modify: `src/context/AppContext.tsx` — the `createListing` interface (`:125-130`), its function signature/body (`:2383-2579`), and the `newListing` doc object (`:2520-2540`)

**Interfaces:**
- Consumes: the extended `AuctionItem` (Task 3).
- Produces: `createListing(listingData, videoFile?, thumbnailFile?, onProgress?, initialStatus?): Promise<string>` — resolves to the new auction id; writes `status: initialStatus` (default `'pending'`), `channel`, and `scheduledStartAt` on the doc.

- [ ] **Step 1: Change the interface signature**

In `src/context/AppContext.tsx` at the interface declaration (`:125-130`), change `createListing`'s return type from `Promise<void>` to `Promise<string>` and add a trailing optional `initialStatus` param. The declaration becomes:
```ts
  createListing: (
    listingData: Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>,
    videoFile?: File,
    thumbnailFile?: File,
    onProgress?: (progress: number) => void,
    initialStatus?: string,
  ) => Promise<string>;
```
(Keep the exact `Omit` field list already present in the file. `caption?`/`channel?`/`scheduledStartAt?` are optional members of `AuctionItem`, so they are already permitted by this `Omit` — no change needed to accept them.)

- [ ] **Step 2: Match the function signature**

At the `createListing` implementation (`:2383-2388`), add the same trailing param with a default:
```ts
  const createListing = async (
    listingData: /* keep existing Omit type */,
    videoFile?: File,
    thumbnailFile?: File,
    onProgress?: (progress: number) => void,
    initialStatus: string = 'pending',
  ) => {
```

- [ ] **Step 3: Use the status + write the drop fields in the doc**

In the `newListing` object (`:2520-2540`), (a) change the hardcoded `status: 'pending'` to `status: initialStatus`, and (b) add these two normalized passthrough fields (in addition to the existing `...listingData` spread):
```ts
      status: initialStatus,
      channel: listingData.channel ?? 'misc',
      scheduledStartAt: listingData.scheduledStartAt ?? null,
```
Do NOT persist `caption` — it is display-only in Phase 1 (a stored caption would embed a placeholder link before the id exists). Leave the `caption?` type field unwritten.

- [ ] **Step 4: Return the new id**

At the end of the `createListing` body (after the `setDoc(...)` at `:2543-2545` and any post-write logic, before the function closes at `:2579`), add:
```ts
    return newListingId;
```
`newListingId` is generated at `:2395`. If any early-return path exists in the function, ensure it also returns the id (or throws) rather than returning `undefined`.

- [ ] **Step 5: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors. In particular, the existing `ListingWizardView` caller (which ignores the return value and omits `initialStatus`) still type-checks because both changes are backward-compatible.

- [ ] **Step 6: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/context/AppContext.tsx
git commit -m "feat(drop-builder): createListing returns id, accepts initialStatus, writes channel"
```

---

### Task 6: The Drop-Builder admin view (UI + assisted-post package + nav entry)

**Files:**
- Create: `src/components/DropBuilderView.tsx`
- Modify: `src/context/AppContext.tsx` — add `'drop-builder'` to the `activeView` union in **all three places** (`:75` interface field, `:76` setter param, `:380` state default's inline type if present)
- Modify: `src/App.tsx` (lazy import + admin-gated `switch` case)
- Modify: `src/components/AdminDashboardView.tsx` (add a nav button that opens the drop-builder)

**Interfaces:**
- Consumes: `useApp()` (`language`, `currentUser`, `createListing`, `setActiveView`); `buildAuctionCaption` (Task 1); `buildAuctionUrl` (Task 2); `DROP_CHANNELS`, `channelLabel`, `channelToCategory`, `DropChannel` (Task 3).
- Produces: an admin route value `'drop-builder'`.

- [ ] **Step 1: Add the view to the union (three places)**

In `src/context/AppContext.tsx`, add `'drop-builder'` to the `activeView` union everywhere it is declared — the interface field (`:75`), the `setActiveView` parameter type (`:76`), and the `useState` default's inline type if it is typed inline (`:380`). Example for each occurrence:
```ts
'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about' | 'seller-center' | 'drop-builder'
```

- [ ] **Step 2: Create the Drop-Builder component**

Create `src/components/DropBuilderView.tsx`:
```tsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, channelToCategory, type DropChannel } from '../utils/dropChannel';

const DURATION_PRESETS = [
  { seconds: 600, label: '10 دقيقة', en: '10 min' },
  { seconds: 900, label: '15 دقيقة', en: '15 min' },
  { seconds: 1800, label: '30 دقيقة', en: '30 min' },
];

export default function DropBuilderView() {
  const { language, currentUser, createListing } = useApp();
  const isAr = language === 'ar';

  const [title, setTitle] = useState('');
  const [productName, setProductName] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [channel, setChannel] = useState<DropChannel>('misc');
  const [startTime, setStartTime] = useState(''); // display only, e.g. "7:30"
  const [durationSeconds, setDurationSeconds] = useState(1800);
  const [condition, setCondition] = useState('جديدة كلياً');
  const [specsText, setSpecsText] = useState(''); // one spec per line
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const specs = useMemo(
    () => specsText.split('\n').map((s) => s.trim()).filter(Boolean),
    [specsText],
  );

  const durationLabel = useMemo(() => {
    const p = DURATION_PRESETS.find((d) => d.seconds === durationSeconds);
    return p ? p.label : `${Math.round(durationSeconds / 60)} دقيقة`;
  }, [durationSeconds]);

  // Before the drop is created we show a placeholder link; after creation the
  // real id flows in and the caption/copy buttons reflect the final link.
  const deepLink = useMemo(
    () => buildAuctionUrl(createdId ?? '{{auction-id}}', window.location.origin),
    [createdId],
  );

  const caption = useMemo(
    () =>
      buildAuctionCaption({
        auctionNumber: title.trim() || '—',
        startTime: startTime.trim() || '—',
        durationLabel,
        startingPriceJod: Number(startingPrice) || 0,
        productName: productName.trim() || '—',
        specs,
        condition: condition.trim(),
        deepLink,
      }),
    [title, startTime, durationLabel, startingPrice, productName, specs, condition, deepLink],
  );

  const onThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setThumbnailFile(f);
    setThumbnailPreview(f ? URL.createObjectURL(f) : '');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!productName.trim() || !Number(startingPrice)) {
      setError(isAr ? 'أدخل اسم المنتج وسعر البداية' : 'Enter a product name and starting price');
      return;
    }
    setSubmitting(true);
    try {
      const priceNum = Number(startingPrice);
      const newId = await createListing(
        {
          title: title.trim() || productName.trim(),
          description: productName.trim(),
          category: channelToCategory(channel),
          startingPrice: priceNum,
          minIncrement: Math.max(5, Math.round(priceNum * 0.05)),
          currentBidderId: null,
          currentBidderName: null,
          videoUrl: '',
          thumbnailUrl: '',
          endTime: Date.now() + durationSeconds * 1000,
          duration: durationSeconds,
          channel,
          scheduledStartAt: null,
        },
        undefined,
        thumbnailFile ?? undefined,
        undefined,
        'upcoming',
      );
      setCreatedId(newId);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل إنشاء المزاد' : 'Failed to create auction'));
    } finally {
      setSubmitting(false);
    }
  };

  const finalLink = createdId ? buildAuctionUrl(createdId, window.location.origin) : '';

  return (
    <div style={{ direction: isAr ? 'rtl' : 'ltr' }} className="max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-xl font-bold">{isAr ? 'إنشاء مزاد جديد' : 'Create a Drop'}</h1>

        <label className="block text-sm">{isAr ? 'رقم المزاد' : 'Auction number'}
          <input className="mt-1 w-full border rounded p-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1706" />
        </label>

        <label className="block text-sm">{isAr ? 'اسم المنتج' : 'Product name'}
          <input className="mt-1 w-full border rounded p-2" value={productName} onChange={(e) => setProductName(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'سعر البداية (دينار)' : 'Starting price (JOD)'}
          <input type="number" className="mt-1 w-full border rounded p-2" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'القناة' : 'Channel'}
          <select className="mt-1 w-full border rounded p-2" value={channel} onChange={(e) => setChannel(e.target.value as DropChannel)}>
            {DROP_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{channelLabel(c.value, isAr ? 'ar' : 'en')}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">{isAr ? 'وقت البدء' : 'Start time'}
          <input className="mt-1 w-full border rounded p-2" value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="7:30" />
        </label>

        <label className="block text-sm">{isAr ? 'المدة' : 'Duration'}
          <select className="mt-1 w-full border rounded p-2" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))}>
            {DURATION_PRESETS.map((d) => (
              <option key={d.seconds} value={d.seconds}>{isAr ? d.label : d.en}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">{isAr ? 'الحالة' : 'Condition'}
          <input className="mt-1 w-full border rounded p-2" value={condition} onChange={(e) => setCondition(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'المواصفات (سطر لكل مواصفة)' : 'Specs (one per line)'}
          <textarea className="mt-1 w-full border rounded p-2 h-28" value={specsText} onChange={(e) => setSpecsText(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'صورة المنتج' : 'Product image'}
          <input type="file" accept="image/*" className="mt-1 w-full" onChange={onThumb} />
        </label>
        {thumbnailPreview && <img src={thumbnailPreview} alt="" className="w-32 h-32 object-cover rounded" />}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={submitting} onClick={handleCreate} className="w-full bg-amber-600 text-white rounded p-3 disabled:opacity-50">
          {submitting ? (isAr ? 'جارٍ الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء المزاد' : 'Create drop')}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{isAr ? 'معاينة المنشور' : 'Post preview'}</h2>
        <pre className="whitespace-pre-wrap border rounded p-3 text-sm bg-neutral-50" style={{ direction: 'rtl' }}>{caption}</pre>
        <button onClick={() => copy(caption)} disabled={!createdId} className="w-full border rounded p-2 disabled:opacity-50">{isAr ? 'نسخ النص' : 'Copy caption'}</button>

        {createdId ? (
          <>
            <div className="border rounded p-2 text-sm break-all">{finalLink}</div>
            <button onClick={() => copy(finalLink)} className="w-full border rounded p-2">{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
            <p className="text-green-700 text-sm">{isAr ? '✅ تم الإنشاء — الصقه في القناة' : '✅ Created — paste into the channel'}</p>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">{isAr ? 'أنشئ المزاد للحصول على الرابط النهائي ثم انسخ النص' : 'Create the drop to get the final link, then copy the caption'}</p>
        )}
      </div>
    </div>
  );
}
```
Note: "Copy caption" is disabled until the drop is created, so the team never copies a caption containing the `{{auction-id}}` placeholder.

- [ ] **Step 3: Register the lazy-loaded route (admin-gated)**

In `src/App.tsx`:
1. Add a lazy import alongside the other view imports (near `:8-15`). Since `App.tsx` is at `src/App.tsx`, the component is a sibling under `./components`:
```tsx
const DropBuilderView = React.lazy(() => import('./components/DropBuilderView'));
```
2. In the `ActiveViewRenderer` `switch (activeView)` (`:17-40`), add a case mirroring the admin gating used by the `'admin'` case (`:30`):
```tsx
    case 'drop-builder': {
      const isStrictAdmin = currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true;
      return isStrictAdmin ? <DropBuilderView /> : <DiscoveryFeedView />;
    }
```
Reuse whatever `currentUser` binding this component already has for the existing admin check.

- [ ] **Step 4: Add the admin nav entry (makes the view reachable)**

In `src/components/AdminDashboardView.tsx`, this component already calls `useApp()`. Ensure `setActiveView` is destructured from it, then add a button in the dashboard's primary action area (near the other top-level admin action buttons) that navigates to the drop-builder:
```tsx
<button
  onClick={() => setActiveView('drop-builder')}
  className="px-4 py-2 rounded bg-amber-600 text-white"
>
  {language === 'ar' ? 'إنشاء مزاد (Drop Builder)' : 'Create Drop'}
</button>
```
Place it where the admin will see it on load (e.g. the header/actions row). If `language`/`setActiveView` are not yet destructured in this component, add them to its existing `useApp()` destructure.

- [ ] **Step 5: Typecheck + run the pure tests**

Run: `cd /Users/mj/code/mazadjo && npm run lint && npx vitest run`
Expected: typecheck clean; all pure-logic tests (Tasks 1–3) still pass.

- [ ] **Step 6: Verify end-to-end in the running app**

Run: `cd /Users/mj/code/mazadjo && npm run dev`
As an admin user (email `admaaqaba06@gmail.com` or a user with `isAdmin === true`):
1. From the admin dashboard, click **Create Drop** → the drop-builder opens.
2. Fill product name, starting price, start time, specs, pick a channel → confirm the **caption preview updates live** and reads like the washing-machine card; "Copy caption" is disabled pre-create.
3. Click **Create drop** → no error; the **final link** appears (`.../?auction=<real-id>`); "Copy caption" enables; both copy buttons work.
4. In another tab open that final link → it lands on the **live view** for the created auction (proves Task 4 + `'upcoming'` status + the real id line up).
5. In the Firebase console, open the new `auctions/<id>` doc → confirm `status: 'upcoming'`, `channel` set, `scheduledStartAt: null`, `category` matches the channel (e.g. `cars` → `Vehicles`).
Stop the dev server when confirmed.

- [ ] **Step 7: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/components/DropBuilderView.tsx src/App.tsx src/context/AppContext.tsx src/components/AdminDashboardView.tsx
git commit -m "feat(drop-builder): admin drop-builder view, nav entry, live caption + deep link"
```

---

## Notes for the executor

- **`createListing` early returns:** Task 5 assumes a single success path returning `newListingId`. Before Task 5, read the full function (`AppContext.tsx:2383-2579`) — if it has intermediate `return;` statements (e.g. on upload fallback), make each return the id or throw, so the signature's `Promise<string>` never resolves to `undefined`.
- **Admin identity:** the operator team logs in as `admaaqaba06@gmail.com` or with the `isAdmin` custom claim (`set-admin.cjs`). Granting the wider team access is an ops step outside this plan.
- **`'upcoming'` pre-open countdown (known, deferred):** a created drop carries `endTime`/`endsAt` set to creation-time + duration, so its countdown may appear to run before the operator opens it. This is cosmetic in Phase 1 — `approveListing` resets the authoritative timer at go-live, and `scheduledAuctionCloser` never closes a non-`live` auction. Proper scheduled opening is Phase 2 (auto-open).
- **Image compositing (branded frame + badges + price plaque) is intentionally out of scope** — the team uploads the hero image they already produce. Auto-branding is a separate fast-follow slice.
- **Confirm the Arabic boilerplate copy** with the team before production (Global Constraints).
