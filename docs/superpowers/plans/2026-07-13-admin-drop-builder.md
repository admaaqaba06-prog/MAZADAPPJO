# Admin Drop-Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Mazad JO team an in-app admin screen that creates an auction and auto-produces the two things they paste into a WhatsApp Channel: the full Arabic caption and a shareable deep link that opens that exact auction in the app.

**Architecture:** Extend the existing state-based (no-router) React app. The daily-pain logic (Arabic caption, deep link, channel mapping) is extracted into three **pure, unit-tested** modules under `src/utils/`. Persistence reuses the existing `createListing` path in `AppContext`, extended with three additive optional fields (`caption`, `channel`, `scheduledStartAt`). The UI is one new admin-gated view following the existing `ListingWizardView`/`AdminDashboardView` patterns. A tiny on-load URL parser turns `?auction=<id>` into the app's existing `setActiveAuctionId` + `setActiveView('live')` navigation.

**Tech Stack:** React 19, TypeScript, Vite 6, Firebase (Firestore + Storage). Adds **vitest** (dev-only) as the test runner — none exists today.

## Global Constraints

- **Runtime deps:** add NO new runtime dependencies. Only dev dependency `vitest` is permitted.
- **Firestore collection** for auctions is `auctions`; docs are keyed by the generated auction id. Never write balances/bids/escrows from the client — those are server-only (unchanged by this plan).
- **Additive only:** do not modify existing `category`, `endTime`/`endsAt`/`duration`, bid logic, or the `scheduledAuctionCloser`. New auction fields are optional and additive.
- **Admin gate:** reuse the existing check verbatim — `currentUser?.email === 'admaaqaba06@gmail.com' || currentUser?.isAdmin === true` (as in `src/App.tsx:30`).
- **i18n/RTL:** no i18n library. UI labels use the existing inline pattern `const isAr = language === 'ar'; {isAr ? 'عربي' : 'English'}` and RTL via inline `style={{ direction: isAr ? 'rtl' : 'ltr' }}` (as in `src/components/ListingWizardView.tsx`). The generated **caption is always Arabic** regardless of UI language (it is content, not chrome).
- **Typecheck gate:** `npm run lint` (= `tsc --noEmit`) must pass after every task.
- **Deep-link start time is display-only in Phase 1.** Auto-opening at `scheduledStartAt` is Phase 2 (auto-open). Phase 1 stores the value and prints it in the caption; going live remains the existing manual `approveListing`.

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

// Standing boilerplate — matches the current WhatsApp card copy.
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

### Task 3: Channel (vertical) definitions + auction type extension (TDD)

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
  - `AuctionItem` gains: `caption?: string; channel?: DropChannel; scheduledStartAt?: number`

- [ ] **Step 1: Write the failing test**

Create `src/utils/dropChannel.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DROP_CHANNELS, channelLabel } from './dropChannel';

describe('drop channels', () => {
  it('defines exactly phones, cars, misc', () => {
    expect(DROP_CHANNELS.map((c) => c.value)).toEqual(['phones', 'cars', 'misc']);
  });

  it('returns the localized label', () => {
    expect(channelLabel('phones', 'en')).toBe('Mazad — Phones');
    expect(channelLabel('cars', 'ar')).toBe('مزاد — سيارات');
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
```

- [ ] **Step 4: Extend the auction type**

In `src/types.ts`, inside `interface AuctionItem` (currently ending around `:89` with `viewersCount: number;`), add these three optional fields right after `viewersCount: number;`:
```ts
  // Drop-builder fields (additive; optional). See docs/superpowers/plans/2026-07-13-admin-drop-builder.md
  caption?: string;                 // generated Arabic channel caption
  channel?: 'phones' | 'cars' | 'misc'; // which WhatsApp channel this drop targets
  scheduledStartAt?: number;        // Unix ms; display-only in Phase 1, consumed by auto-open in Phase 2
```
(The literal union is repeated here rather than importing `DropChannel` to keep `types.ts` dependency-free, matching the file's existing self-contained style.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/mj/code/mazadjo && npx vitest run src/utils/dropChannel.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/utils/dropChannel.ts src/utils/dropChannel.test.ts src/types.ts
git commit -m "feat(drop-builder): add channel verticals + additive auction fields"
```

---

### Task 4: Parse `?auction=<id>` on app load (integration)

**Files:**
- Modify: `src/App.tsx` (add a mount effect in the component that already calls `useApp()` and renders `ActiveViewRenderer`)

**Interfaces:**
- Consumes: `parseAuctionIdFromSearch` (Task 2); context `setActiveAuctionId`, `setActiveView` (`AppContext.tsx:73-74`).
- Produces: nothing new.

- [ ] **Step 1: Add the deep-link effect**

`App.tsx` lives at `src/App.tsx` (per grounding), so `src/utils` is a sibling directory. Add the import at the top with the other imports:
```ts
import { parseAuctionIdFromSearch } from './utils/deepLink';
```

Inside the component that consumes `useApp()` and renders `<ActiveViewRenderer />` (the one holding the `isStrictAdmin` check near line 30), destructure the two setters and add a mount effect:
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
Ensure `useEffect` is imported from `react` (add it to the existing React import if not already present). If `setActiveAuctionId`/`setActiveView` are already destructured elsewhere in this component, reuse those bindings instead of re-declaring.

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify in the running app**

Run: `cd /Users/mj/code/mazadjo && npm run dev`
Then open `http://localhost:3000/?auction=auction-rolex` (`auction-rolex` is the default seeded id per `AppContext.tsx:379`).
Expected: the app boots directly into the **live auction view** for that id (not the discovery feed). Open `http://localhost:3000/` with no query → boots to the normal default view. Stop the dev server when confirmed.

- [ ] **Step 4: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/App.tsx
git commit -m "feat(drop-builder): open ?auction=<id> deep links into the live view"
```

---

### Task 5: Persist drop fields through `createListing`

**Files:**
- Modify: `src/context/AppContext.tsx` — the `createListing` signature/interface (`:125-130`) and the `newListing` doc object (`:2520-2540`)

**Interfaces:**
- Consumes: the extended `AuctionItem` (Task 3).
- Produces: `createListing` now accepts and writes `caption?`, `channel?`, `scheduledStartAt?` on the auction doc.

- [ ] **Step 1: Widen the createListing parameter type**

In `src/context/AppContext.tsx` at the interface declaration (`:125-130`), the first parameter is `Omit<AuctionItem, 'id' | 'currentPrice' | 'sellerId' | 'sellerName' | 'sellerLogo' | 'status' | 'isFeatured' | 'totalBids' | 'viewersCount'>`. Because `caption`, `channel`, and `scheduledStartAt` are now optional members of `AuctionItem`, they are already permitted by this `Omit` type — **no signature change is required.** Confirm by reading the interface; if the caller passes them, they type-check.

- [ ] **Step 2: Write the new fields into the doc**

In the `newListing` object (`:2520-2540`), add these three lines alongside the other spread fields (place them after the `spread of listingData` line so an explicit value still wins if needed — but since they come from `listingData` they are already spread; add explicit passthrough only if the spread does not include them). Concretely, ensure the object contains:
```ts
      caption: listingData.caption ?? '',
      channel: listingData.channel ?? 'misc',
      scheduledStartAt: listingData.scheduledStartAt ?? null,
```
If `listingData` is already spread with `...listingData` at the top of `newListing`, these explicit lines are still safe (they normalize undefined → default) and make the drop fields first-class on the written doc.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mj/code/mazadjo && npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify the write shape (temporary log)**

Add a temporary `console.log('[drop] writing', { caption: newListing.caption, channel: newListing.channel, scheduledStartAt: newListing.scheduledStartAt });` immediately before the `setDoc(doc(db,'auctions',newListingId), newListing)` call (`:2543-2545`). This is verified end-to-end in Task 6; the log is removed there.

- [ ] **Step 5: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/context/AppContext.tsx
git commit -m "feat(drop-builder): persist caption, channel, scheduledStartAt on auctions"
```

---

### Task 6: The Drop-Builder admin view (UI + assisted-post package)

**Files:**
- Create: `src/components/DropBuilderView.tsx`
- Modify: `src/context/AppContext.tsx:75-76` (add `'drop-builder'` to the `activeView` union, both occurrences)
- Modify: `src/App.tsx` (lazy import + `switch` case, admin-gated like the `'admin'` case)
- Modify: `src/context/AppContext.tsx` (remove the temporary log from Task 5, Step 4)

**Interfaces:**
- Consumes: `useApp()` (`language`, `currentUser`, `createListing`); `buildAuctionCaption` (Task 1); `buildAuctionUrl` (Task 2); `DROP_CHANNELS`, `channelLabel`, `DropChannel` (Task 3).
- Produces: an admin route value `'drop-builder'`.

- [ ] **Step 1: Add the view to the union**

In `src/context/AppContext.tsx`, the `activeView` union appears twice (`:75` interface field and `:76`/`:380` state). Add `'drop-builder'` to each occurrence, e.g.:
```ts
activeView: 'discovery' | 'live' | 'wallet' | 'admin' | 'upload' | 'about' | 'seller-center' | 'drop-builder';
```
Do the same for the matching `setActiveView` parameter type and the `useState` default if it is typed inline.

- [ ] **Step 2: Create the Drop-Builder component**

Create `src/components/DropBuilderView.tsx`:
```tsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, type DropChannel } from '../utils/dropChannel';

const DURATION_PRESETS = [
  { seconds: 600, ar: '١٠ دقيقة', en: '10 min' },
  { seconds: 900, ar: '١٥ دقيقة', en: '15 min' },
  { seconds: 1800, ar: '٣٠ دقيقة', en: '30 min' },
];

export default function DropBuilderView() {
  const { language, currentUser, createListing } = useApp();
  const isAr = language === 'ar';

  const [title, setTitle] = useState('');
  const [productName, setProductName] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [channel, setChannel] = useState<DropChannel>('misc');
  const [startTime, setStartTime] = useState(''); // e.g. "7:30"
  const [durationSeconds, setDurationSeconds] = useState(1800);
  const [condition, setCondition] = useState(isAr ? 'جديدة كلياً' : 'Brand new');
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
    return p ? p.ar : `${Math.round(durationSeconds / 60)} دقيقة`;
  }, [durationSeconds]);

  // Preview deep link uses a placeholder id until the drop is created.
  const previewLink = useMemo(
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
        deepLink: previewLink,
      }),
    [title, startTime, durationLabel, startingPrice, productName, specs, condition, previewLink],
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
      const created = await createListing(
        {
          title: title.trim() || productName.trim(),
          description: productName.trim(),
          category: 'Electronics',
          startingPrice: priceNum,
          minIncrement: Math.max(5, Math.round(priceNum * 0.05)),
          videoUrl: '',
          thumbnailUrl: '',
          endTime: Date.now() + durationSeconds * 1000,
          duration: durationSeconds,
          caption,
          channel,
          scheduledStartAt: startTime.trim() ? Date.now() : null,
        } as any,
        undefined,
        thumbnailFile ?? undefined,
      );
      // createListing returns the new id (or the created doc); capture the id string.
      const newId = typeof created === 'string' ? created : (created as any)?.id;
      if (newId) setCreatedId(newId);
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
              <option key={d.seconds} value={d.seconds}>{isAr ? d.ar : d.en}</option>
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
        <button onClick={() => copy(caption)} className="w-full border rounded p-2">{isAr ? 'نسخ النص' : 'Copy caption'}</button>

        {createdId ? (
          <>
            <div className="border rounded p-2 text-sm break-all">{finalLink}</div>
            <button onClick={() => copy(finalLink)} className="w-full border rounded p-2">{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
            <p className="text-green-700 text-sm">{isAr ? '✅ تم الإنشاء — الصقه في القناة' : '✅ Created — paste into the channel'}</p>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">{isAr ? 'أنشئ المزاد للحصول على الرابط النهائي' : 'Create the drop to get the final link'}</p>
        )}
      </div>
    </div>
  );
}
```

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
Use whatever binding `App.tsx` already has for the current user (it references `currentUser` for the existing admin check); reuse it rather than re-fetching.

- [ ] **Step 4: Remove the temporary log from Task 5**

In `src/context/AppContext.tsx`, delete the `console.log('[drop] writing', ...)` line added in Task 5, Step 4.

- [ ] **Step 5: Typecheck + run the pure tests**

Run: `cd /Users/mj/code/mazadjo && npm run lint && npx vitest run`
Expected: typecheck clean; all pure-logic tests (Tasks 1–3) still pass.

- [ ] **Step 6: Verify end-to-end in the running app**

Run: `cd /Users/mj/code/mazadjo && npm run dev`
As an admin user (email `admaaqaba06@gmail.com` or a user with `isAdmin === true`), set `activeView` to `'drop-builder'` (temporarily wire a nav button, or set it via the existing admin nav). Then:
1. Fill product name, starting price, start time, specs → confirm the **caption preview updates live** and reads like the washing-machine card, with the deep-link line present.
2. Click **Create drop** → confirm no error, the **final link** appears (`.../?auction=<real-id>`), and "Copy caption"/"Copy link" work.
3. In another tab open that final link → confirm it lands on the **live view** for the created auction (proves Task 4 + the real id line up).
4. In the Firebase console, open the new `auctions/<id>` doc → confirm `caption`, `channel`, and `scheduledStartAt` are present.
Stop the dev server when confirmed.

- [ ] **Step 7: Commit**

```bash
cd /Users/mj/code/mazadjo
git add src/components/DropBuilderView.tsx src/App.tsx src/context/AppContext.tsx
git commit -m "feat(drop-builder): admin drop-builder view with live caption + deep link"
```

---

## Notes for the executor

- **`createListing` return value:** the plan captures the new id via `typeof created === 'string' ? created : created?.id`. Before Task 6 Step 2, read `createListing`'s actual `return` (`AppContext.tsx:2383-2579`) and adjust that one line to match what it really returns (it generates `newListingId` internally). If it returns nothing today, add `return newListingId;` at the end of `createListing` and note it in the Task 5 commit instead.
- **Admin identity:** the operator team logs in as `admaaqaba06@gmail.com` or with the `isAdmin` custom claim (`set-admin.cjs`). Granting the wider team access is an ops step outside this plan.
- **Image compositing (branded frame + badges + price plaque) is intentionally out of scope** — the team uploads the hero image they already produce. Auto-branding is a separate fast-follow slice.
- **Auto-open at `scheduledStartAt` is Phase 2.** Until then, created drops sit as normal listings and go live via the existing `approveListing`.
