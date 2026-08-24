# Landing Page Seller-Trust Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the public landing page (`src/landing/LandingView.tsx`) from buyer-first to seller-trust-first, add a real-data live-auctions centerpiece, promote the real WhatsApp track record, and instrument a client-side seller-funnel analytics taxonomy — all RTL-native, no backend changes, hard preview-gated.

**Architecture:** Two new isolated, unit-tested modules (`landingAnalytics` client-emit helper; `useLandingAuctions` standalone Firestore hook mirroring `useSocialProof`) plus surgical edits to the existing 2846-line `LandingView.tsx` and its `translations.ts`. The big JSX file is evolved section-by-section (reusing `Reveal`/`Counter`/`getLineIcon`/`formatPrice`), never rewritten.

**Tech Stack:** React 19 + Vite + TypeScript, Tailwind, Firebase Firestore (`firebase/firestore`), Motion (`motion/react`), Vitest.

## Global Constraints

- Bilingual is first-class: EVERY new string is authored in BOTH `ar` (RTL) and `en` (LTR) via `translations.ts` typed keys + the file's `lang === "ar" ? … : …` pattern. Arabic is not an afterthought.
- Brand system only — orange `#F05123`, ink `#0A0A0A`, off-white `#F7F7F7`, borders `#F0F0EE`, gradient accents `#D93E15`/`#FF6B35`; fonts already configured. No new palette/fonts.
- NEVER fabricate numbers, cards, testimonials, or claims. The stats `15,000+ users / 1,250+ sales / 3,400+ inspected` are REAL (WhatsApp track record) — keep and reuse verbatim, do not alter the values. The live-auctions section shows REAL Firestore data or an honest founding-seller fallback — never fake cards.
- Analytics is CLIENT-EMIT ONLY (console + `window.dataLayer`). Do NOT call `logAnalyticsEvent`/write `analytics_events` from the landing page — anonymous visitors cannot write there (rule requires `isSignedIn()`), and the `AnalyticsEventType` union has no landing events. Do NOT modify `firestore.rules` or `analyticsService.ts`.
- Simulated auctions (`isSimulated === true`) must NEVER appear in the real live-auctions section.
- No backend, Firestore rules, data-model, routing, or auth changes.
- Money/functional risk is low (no writes), but this is the accidentally-reverted-once public front door: surgical edits, run `npx tsc --noEmit` (must stay 0 errors) and `npm test` (baseline 409 passing) after each task. HARD preview-gate — no merge until MJ approves the Vercel preview in BOTH languages.

**Key existing anchors (from recon):**
- `LandingView.tsx`: component sig line 220 `export default function LandingView({ onEnter, whatsappUrl = "https://wa.me/962781444899" }: { onEnter: () => void; whatsappUrl?: string })`; `lang` state line 221, `toggleLang` 222-226, `const t: TranslationType = translations[lang]` line 227. `Reveal` (46), `Counter` (62), `formatPrice` (435), `formatTimer` (450), `getLineIcon` (556). Hero headline 839-863, hero CTA block 877-904 (primary `onClick={onEnter}` 884-893; secondary `<motion.a href={whatsappUrl}>` 894-903). Stats bar (static strings, NOT Counter) 1681-1722 inside testimonials 1629-1725. Section order: hero 803, how-it-works 1242, trust 1475, comparison 1527, testimonials 1629, live-simulator 1727-1902 (KEEP as demo), escrow 1903, categories 2053, pricing 2106, office-visit 2366, faq 2445, coming-soon 2535, final-CTA 2680.
- `AuctionItem` (`src/types.ts` 82-153): `id`, `title`, `category: 'Electronics'|'Luxury'|'Vehicles'|'Fashion'|'Real Estate'`, `currentPrice: number`, `totalBids: number`, `endTime: number` (Unix ms), `thumbnailUrl: string`, `mediaUrls?: string[]`, `isFeatured: boolean`, `approvalStatus?: 'pending'|'approved'|'rejected'`, `isSimulated?: boolean`, `status: 'upcoming'|'live'|'processing'|'rejected'|'completed'|'ended'|'reserve_not_met'`.
- `src/utils/auctionPhase.ts`: `isLiveNow(auction, now=Date.now())` → `status==='live' && (!endTime || endTime>now)`; `getLiveAuctions<T>(auctions, now)`.
- `useSocialProof.ts` pattern: module-level `let cache: Promise<…>|null`, one `getDocs(query(collection(db,'auctions'), where(...), limit(24)))`, client-side filter/sort/slice, reset cache to null on error.

---

### Task 1: `landingAnalytics` client-emit helper

**Files:**
- Create: `src/landing/landingAnalytics.ts`
- Test: `src/landing/landingAnalytics.test.ts`

**Interfaces:**
- Produces: `type LandingEventName`; `interface LandingEventPayload { event: LandingEventName; params: Record<string, string | number | boolean>; ts: number }`; `buildLandingEvent(event: LandingEventName, params?: Record<string, string|number|boolean>, now?: number): LandingEventPayload`; `emitLandingEvent(event: LandingEventName, params?: Record<string, string|number|boolean>): void`.

- [ ] **Step 1: Write the failing test**

Create `src/landing/landingAnalytics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildLandingEvent, emitLandingEvent } from './landingAnalytics';

describe('buildLandingEvent', () => {
  it('normalizes event name, params, and timestamp', () => {
    const payload = buildLandingEvent('seller_cta_clicked', { location: 'hero' }, 1000);
    expect(payload).toEqual({
      event: 'seller_cta_clicked',
      params: { location: 'hero' },
      ts: 1000,
    });
  });

  it('defaults params to an empty object', () => {
    const payload = buildLandingEvent('landing_viewed', undefined, 42);
    expect(payload.params).toEqual({});
    expect(payload.event).toBe('landing_viewed');
    expect(payload.ts).toBe(42);
  });
});

describe('emitLandingEvent', () => {
  beforeEach(() => {
    delete (window as any).dataLayer;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    delete (window as any).dataLayer;
  });

  it('pushes onto window.dataLayer when present', () => {
    (window as any).dataLayer = [];
    emitLandingEvent('browse_cta_clicked', { location: 'hero' });
    expect((window as any).dataLayer).toHaveLength(1);
    expect((window as any).dataLayer[0].event).toBe('browse_cta_clicked');
    expect((window as any).dataLayer[0].params).toEqual({ location: 'hero' });
  });

  it('does not throw when window.dataLayer is absent', () => {
    expect(() => emitLandingEvent('landing_viewed')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mj/code/mazadjo/.claude/worktrees/feat+landing-seller-redesign && npx vitest run src/landing/landingAnalytics.test.ts`
Expected: FAIL — cannot resolve `./landingAnalytics`.

- [ ] **Step 3: Write minimal implementation**

Create `src/landing/landingAnalytics.ts`:

```ts
// Client-side seller-funnel analytics for the public landing page.
// The landing page is served to UNAUTHENTICATED visitors, who cannot write
// to Firestore `analytics_events` (rule requires isSignedIn()). So these
// events are emitted client-side only: to the console (dev visibility) and
// to window.dataLayer (ready for a future GA/Segment/GTM wiring). This is
// intentionally NOT wired to analyticsService.logAnalyticsEvent.

export type LandingEventName =
  | 'landing_viewed'
  | 'seller_cta_clicked'
  | 'browse_cta_clicked'
  | 'auction_viewed'
  | 'category_selected'
  | 'language_switched'
  | 'seller_form_started'
  | 'seller_form_submitted';

export interface LandingEventPayload {
  event: LandingEventName;
  params: Record<string, string | number | boolean>;
  ts: number;
}

export function buildLandingEvent(
  event: LandingEventName,
  params: Record<string, string | number | boolean> = {},
  now: number = Date.now()
): LandingEventPayload {
  return { event, params, ts: now };
}

export function emitLandingEvent(
  event: LandingEventName,
  params: Record<string, string | number | boolean> = {}
): void {
  const payload = buildLandingEvent(event, params);
  try {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (Array.isArray(w.dataLayer)) {
        w.dataLayer.push(payload);
      }
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[landing]', payload.event, payload.params);
      }
    }
  } catch {
    // analytics must never break the page
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/landing/landingAnalytics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/landing/landingAnalytics.ts src/landing/landingAnalytics.test.ts
git commit -m "feat(landing): client-emit seller-funnel analytics helper"
```

---

### Task 2: `useLandingAuctions` real-data hook

**Files:**
- Create: `src/landing/useLandingAuctions.ts`
- Test: `src/landing/useLandingAuctions.test.ts`

**Interfaces:**
- Consumes: `AuctionItem` (`../types`), `isLiveNow` (`../utils/auctionPhase`), `db` (`../services/firebase`).
- Produces: `interface LandingAuction { id: string; title: string; category: AuctionItem['category']; currentPrice: number; totalBids: number; endTime: number; imageUrl: string; isFeatured: boolean; isVerified: boolean }`; pure `mapToLandingAuction(a: AuctionItem): LandingAuction`; pure `curateLandingAuctions(auctions: AuctionItem[], now?: number, cap?: number): LandingAuction[]`; `interface LandingAuctionsState { auctions: LandingAuction[]; isLoading: boolean; isEmpty: boolean }`; `useLandingAuctions(): LandingAuctionsState`.

- [ ] **Step 1: Write the failing test**

Create `src/landing/useLandingAuctions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { curateLandingAuctions, mapToLandingAuction } from './useLandingAuctions';
import type { AuctionItem } from '../types';

const NOW = 1_000_000_000_000;

function auction(overrides: Partial<AuctionItem>): AuctionItem {
  return {
    id: 'a', title: 'Item', category: 'Electronics', startingPrice: 10,
    currentPrice: 100, minIncrement: 5, currentBidderId: null, currentBidderName: null,
    videoUrl: '', thumbnailUrl: 'thumb.jpg', endTime: NOW + 60_000, duration: 300,
    sellerId: 's', sellerName: 'Seller', status: 'live', totalBids: 3, viewersCount: 0,
    isFeatured: false, ...overrides,
  } as AuctionItem;
}

describe('mapToLandingAuction', () => {
  it('prefers thumbnailUrl, falls back to first mediaUrl', () => {
    expect(mapToLandingAuction(auction({ thumbnailUrl: 't.jpg' })).imageUrl).toBe('t.jpg');
    expect(mapToLandingAuction(auction({ thumbnailUrl: '', mediaUrls: ['m.jpg'] })).imageUrl).toBe('m.jpg');
  });
  it('marks approved auctions as verified', () => {
    expect(mapToLandingAuction(auction({ approvalStatus: 'approved' })).isVerified).toBe(true);
    expect(mapToLandingAuction(auction({ approvalStatus: 'pending' })).isVerified).toBe(false);
    expect(mapToLandingAuction(auction({})).isVerified).toBe(false);
  });
});

describe('curateLandingAuctions', () => {
  it('excludes simulated auctions', () => {
    const out = curateLandingAuctions([auction({ id: 'x', isSimulated: true })], NOW);
    expect(out).toHaveLength(0);
  });
  it('excludes non-live and past-endTime auctions', () => {
    const out = curateLandingAuctions([
      auction({ id: 'live', status: 'live', endTime: NOW + 60_000 }),
      auction({ id: 'upcoming', status: 'upcoming' }),
      auction({ id: 'past', status: 'live', endTime: NOW - 1 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['live']);
  });
  it('excludes items without a title', () => {
    expect(curateLandingAuctions([auction({ title: '' })], NOW)).toHaveLength(0);
  });
  it('orders featured first, then soonest endTime', () => {
    const out = curateLandingAuctions([
      auction({ id: 'soon', endTime: NOW + 10_000, isFeatured: false }),
      auction({ id: 'later', endTime: NOW + 90_000, isFeatured: false }),
      auction({ id: 'feat', endTime: NOW + 50_000, isFeatured: true }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['feat', 'soon', 'later']);
  });
  it('caps the result to the requested limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => auction({ id: `a${i}`, endTime: NOW + i * 1000 }));
    expect(curateLandingAuctions(many, NOW, 8)).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/landing/useLandingAuctions.test.ts`
Expected: FAIL — cannot resolve `./useLandingAuctions`.

- [ ] **Step 3: Write minimal implementation**

Create `src/landing/useLandingAuctions.ts`:

```ts
import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { isLiveNow } from '../utils/auctionPhase';
import type { AuctionItem } from '../types';

export interface LandingAuction {
  id: string;
  title: string;
  category: AuctionItem['category'];
  currentPrice: number;
  totalBids: number;
  endTime: number;
  imageUrl: string;
  isFeatured: boolean;
  isVerified: boolean;
}

export interface LandingAuctionsState {
  auctions: LandingAuction[];
  isLoading: boolean;
  isEmpty: boolean;
}

const DISPLAY_CAP = 8;

export function mapToLandingAuction(a: AuctionItem): LandingAuction {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    currentPrice: a.currentPrice,
    totalBids: a.totalBids,
    endTime: a.endTime,
    imageUrl: a.thumbnailUrl || a.mediaUrls?.[0] || '',
    isFeatured: a.isFeatured === true,
    isVerified: a.approvalStatus === 'approved',
  };
}

// Pure curation: live, non-simulated, titled auctions, ordered featured-first
// then soonest-ending, capped. Unit-tested; the hook wrapper is not.
export function curateLandingAuctions(
  auctions: AuctionItem[],
  now: number = Date.now(),
  cap: number = DISPLAY_CAP
): LandingAuction[] {
  return auctions
    .filter(a => a.isSimulated !== true && !!a.title && isLiveNow(a, now))
    .sort((x, y) => {
      if (x.isFeatured !== y.isFeatured) return x.isFeatured ? -1 : 1;
      return x.endTime - y.endTime;
    })
    .slice(0, cap)
    .map(mapToLandingAuction);
}

// One fetch per session, mirroring useSocialProof's module-level cache.
let landingAuctionsCache: Promise<AuctionItem[]> | null = null;

function fetchLandingAuctions(): Promise<AuctionItem[]> {
  if (landingAuctionsCache) return landingAuctionsCache;
  landingAuctionsCache = getDocs(
    query(
      collection(db, 'auctions'),
      where('status', '==', 'live'),
      limit(24)
    )
  )
    .then(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuctionItem, 'id'>) })))
    .catch(err => {
      console.warn('[landing] failed to load live auctions', err);
      landingAuctionsCache = null; // allow retry next mount
      return [];
    });
  return landingAuctionsCache;
}

export function useLandingAuctions(): LandingAuctionsState {
  const [auctions, setAuctions] = useState<LandingAuction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchLandingAuctions().then(raw => {
      if (!active) return;
      setAuctions(curateLandingAuctions(raw));
      setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { auctions, isLoading, isEmpty: !isLoading && auctions.length === 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/landing/useLandingAuctions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Verify types + commit**

Run: `npx tsc --noEmit` (expect 0 errors).
```bash
git add src/landing/useLandingAuctions.ts src/landing/useLandingAuctions.test.ts
git commit -m "feat(landing): standalone real-data live-auctions hook"
```

---

### Task 3: Seller-first hero reframe + top-level analytics wiring

**Files:**
- Modify: `src/landing/translations.ts` (hero copy keys + new `sellerIntentMsg`)
- Modify: `src/landing/LandingView.tsx` (hero CTA block 877-904, headline copy, mount + language analytics)

**Interfaces:**
- Consumes: `emitLandingEvent` from `./landingAnalytics` (Task 1).

- [ ] **Step 1: Update hero copy in `translations.ts`**

In BOTH `ar` and `en` objects, set these `hero` values verbatim (replace existing strings; keep the same keys so the typed interface is unchanged):

`ar`:
- `hero.titleFirst`: `"اعرض سلعتك و"`
- `hero.titleGradient`: `"بِعْها مباشرةً"`
- `hero.titleLast`: `" لآلاف المشترين الجادّين"`
- `hero.desc`: `"منصة المزادات الموثوقة في الأردن. نفحص سلعتك، ونعرضها على مشترين جادّين، ونضمن وصول أموالك بأمان."`
- `hero.ctaPrimary`: `"اعرض سلعتك للبيع"`
- `hero.ctaSecondary`: `"تصفّح المزادات المباشرة"`

`en`:
- `hero.titleFirst`: `"List your item and "`
- `hero.titleGradient`: `"sell it live"`
- `hero.titleLast`: `" to thousands of serious buyers"`
- `hero.desc`: `"Jordan's trusted auction platform. We inspect your item, put it in front of serious buyers, and make sure you get paid safely."`
- `hero.ctaPrimary`: `"List your item"`
- `hero.ctaSecondary`: `"Browse live auctions"`

Add a new top-level key to `interface TranslationType` (near `dir`/`langCode`) `sellerIntentMsg: string;` and in both language objects:
- `ar`: `sellerIntentMsg: "مرحباً، أرغب بعرض سلعة للبيع في مزاد الأردن."`
- `en`: `sellerIntentMsg: "Hi, I'd like to list an item to sell on Mazzado."`

- [ ] **Step 2: Add analytics import + a seller WhatsApp URL helper in `LandingView.tsx`**

At the top imports, add: `import { emitLandingEvent } from './landingAnalytics';`

Immediately after `const t: TranslationType = translations[lang];` (line 227), add:
```tsx
const sellerWhatsappUrl = `${whatsappUrl}?text=${encodeURIComponent(t.sellerIntentMsg)}`;
```

- [ ] **Step 3: Fire `landing_viewed` on mount and `language_switched` on toggle**

Add a mount effect (near the other top-level `useEffect`s in the component body):
```tsx
useEffect(() => {
  emitLandingEvent('landing_viewed', { lang });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```
In `toggleLang` (222-226), after computing the next language `next`, add `emitLandingEvent('language_switched', { to: next });` before/after the `setLang(next)` call (whichever matches the existing variable name; if the function toggles inline, add `emitLandingEvent('language_switched', { to: lang === 'ar' ? 'en' : 'ar' });`).

- [ ] **Step 4: Reframe the hero CTA block (877-904) — swap CTA semantics, keep the visual slots**

The dominant solid-orange slot becomes the SELLER CTA (WhatsApp intake); the lighter slot becomes the BROWSE CTA (`onEnter`). Replace the primary button (884-893) and secondary anchor (894-903) so that:

Primary/dominant (was `<motion.button onClick={onEnter}>`) becomes the seller WhatsApp link, KEEPING the existing solid-orange className and motion props from the current primary button:
```tsx
<motion.a
  href={sellerWhatsappUrl}
  target="_blank"
  rel="noopener noreferrer"
  onClick={() => emitLandingEvent('seller_cta_clicked', { location: 'hero' })}
  /* KEEP the existing className + whileHover/whileTap/transition from the current primary button */
>
  {t.hero.ctaPrimary}
  {/* keep the existing arrow span */}
</motion.a>
```
Secondary/lighter (was `<motion.a href={whatsappUrl}>`) becomes the browse button, KEEPING the existing outline className and motion props from the current secondary anchor:
```tsx
<motion.button
  type="button"
  onClick={() => { emitLandingEvent('browse_cta_clicked', { location: 'hero' }); onEnter(); }}
  /* KEEP the existing className + whileHover/whileTap/transition from the current secondary anchor */
>
  {t.hero.ctaSecondary}
</motion.button>
```
Preserve all existing Tailwind classes, `dir` attributes, and motion props on both slots — only the element type, target/handler, and text change. The solid-orange (seller) slot stays visually dominant.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` (0 errors) and `npm test` (409 pass).
Manually confirm in the code that the hero now leads with the seller CTA in the dominant slot.
```bash
git add src/landing/translations.ts src/landing/LandingView.tsx
git commit -m "feat(landing): seller-first hero + landing/language analytics"
```

---

### Task 4: Real-data live-auctions centerpiece + seller CTA

**Files:**
- Modify: `src/landing/translations.ts` (new `marketplace` group + `categoryLabels`)
- Modify: `src/landing/LandingView.tsx` (new `LiveMarketplaceSection` + card, insert after how-it-works ~1474, consume `useLandingAuctions`)

**Interfaces:**
- Consumes: `useLandingAuctions`, `LandingAuction` (Task 2); `emitLandingEvent` (Task 1); existing `Reveal`, `formatPrice`.

- [ ] **Step 1: Add `marketplace` translations**

Add to `interface TranslationType` a `marketplace` group and add to BOTH language objects. `ar`:
```ts
marketplace: {
  badge: "مباشر الآن",
  title: "مزادات مباشرة على مزاد الأردن الآن",
  subtitle: "سلع مفحوصة تُباع الآن — هكذا ستظهر سلعتك أمام المشترين.",
  currentBid: "أعلى مزايدة",
  bids: "مزايدة",
  verified: "موثّقة",
  endingSoon: "ينتهي قريباً",
  viewBtn: "شاهد المزاد",
  emptyTitle: "المزادات تنطلق يومياً",
  emptyDesc: "كن من أوائل البائعين — اعرض سلعتك الآن وتصدَّر الصفحة.",
  sellerCtaText: "جاهز لرؤية سلعتك هنا؟",
  sellerCtaBtn: "اعرض سلعتك للبيع",
  categoryLabels: {
    Electronics: "إلكترونيات",
    Luxury: "كماليات",
    Vehicles: "مركبات",
    Fashion: "أزياء",
    "Real Estate": "عقارات",
  },
},
```
`en`:
```ts
marketplace: {
  badge: "Live now",
  title: "Live on Mazzado right now",
  subtitle: "Inspected items selling now — this is where your item shows up for buyers.",
  currentBid: "Current bid",
  bids: "bids",
  verified: "Verified",
  endingSoon: "Ending soon",
  viewBtn: "View auction",
  emptyTitle: "New auctions launch daily",
  emptyDesc: "Be one of the first sellers — list your item now and lead the page.",
  sellerCtaText: "Ready to see your item here?",
  sellerCtaBtn: "List your item",
  categoryLabels: {
    Electronics: "Electronics",
    Luxury: "Luxury",
    Vehicles: "Vehicles",
    Fashion: "Fashion",
    "Real Estate": "Real Estate",
  },
},
```
Type the group in `TranslationType`:
```ts
marketplace: {
  badge: string; title: string; subtitle: string; currentBid: string; bids: string;
  verified: string; endingSoon: string; viewBtn: string; emptyTitle: string; emptyDesc: string;
  sellerCtaText: string; sellerCtaBtn: string;
  categoryLabels: Record<'Electronics' | 'Luxury' | 'Vehicles' | 'Fashion' | 'Real Estate', string>;
};
```

- [ ] **Step 2: Add a `formatTimeLeft` helper + the `LiveMarketplaceSection` component inside `LandingView`**

Inside the component body (so it closes over `lang`, `t`, `onEnter`, `sellerWhatsappUrl`, `formatPrice`), add:
```tsx
const formatTimeLeft = (endTime: number, now = Date.now()): string => {
  const ms = Math.max(0, endTime - now);
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (lang === 'ar') {
    if (days > 0) return `${days} يوم ${hours} س`;
    if (hours > 0) return `${hours} س ${mins} د`;
    return `${mins} د`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};
```
Then define the section (use `Reveal`, brand classes, RTL-native — `dir="ltr"` on price/number spans; card grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`; hover lift `hover:-translate-y-1 hover:shadow-xl transition`; verified badge only when `a.isVerified`; ending-soon pill when `endTime - now < 3600_000`):
```tsx
const LiveMarketplaceSection = () => {
  const { auctions, isLoading, isEmpty } = useLandingAuctions();
  return (
    <section id="live-marketplace" className="py-20 md:py-28 bg-[#F7F7F7]">
      <div className="max-w-7xl mx-auto px-5">
        <Reveal>
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-[#F05123] font-semibold text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F05123] animate-pulse" />
              {t.marketplace.badge}
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold text-[#0A0A0A]">{t.marketplace.title}</h2>
            <p className="mt-3 text-[#0A0A0A]/60 max-w-xl mx-auto">{t.marketplace.subtitle}</p>
          </div>
        </Reveal>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-[#F0F0EE] h-72 animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <Reveal>
            <div className="max-w-md mx-auto text-center rounded-2xl bg-white border border-[#F0F0EE] p-10">
              <h3 className="text-xl font-bold text-[#0A0A0A]">{t.marketplace.emptyTitle}</h3>
              <p className="mt-2 text-[#0A0A0A]/60">{t.marketplace.emptyDesc}</p>
              <a
                href={sellerWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => emitLandingEvent('seller_cta_clicked', { location: 'marketplace_empty' })}
                className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#F05123] text-white font-semibold hover:bg-[#D93E15] transition"
              >
                {t.marketplace.sellerCtaBtn}
              </a>
            </div>
          </Reveal>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {auctions.map((a) => {
                const endingSoon = a.endTime - Date.now() < 3600_000;
                return (
                  <Reveal key={a.id}>
                    <button
                      type="button"
                      onClick={() => { emitLandingEvent('auction_viewed', { auctionId: a.id }); onEnter(); }}
                      className="group text-start w-full rounded-2xl bg-white border border-[#F0F0EE] overflow-hidden hover:-translate-y-1 hover:shadow-xl transition"
                    >
                      <div className="relative aspect-[4/3] bg-[#F0F0EE] overflow-hidden">
                        {a.imageUrl ? (
                          <img src={a.imageUrl} alt={a.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                        ) : null}
                        {a.isVerified ? (
                          <span className="absolute top-3 start-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-xs font-semibold text-[#0A0A0A]">
                            ✓ {t.marketplace.verified}
                          </span>
                        ) : null}
                        {endingSoon ? (
                          <span className="absolute top-3 end-3 px-2 py-1 rounded-full bg-[#F05123] text-white text-xs font-semibold">
                            {t.marketplace.endingSoon}
                          </span>
                        ) : null}
                      </div>
                      <div className="p-4">
                        <span className="text-xs text-[#0A0A0A]/50">{t.marketplace.categoryLabels[a.category]}</span>
                        <h3 className="mt-1 font-semibold text-[#0A0A0A] line-clamp-1">{a.title}</h3>
                        <div className="mt-3 flex items-end justify-between">
                          <div>
                            <span className="block text-xs text-[#0A0A0A]/50">{t.marketplace.currentBid}</span>
                            <span dir="ltr" className="block font-bold text-[#0A0A0A]">{formatPrice(a.currentPrice)}</span>
                          </div>
                          <div className="text-end">
                            <span dir="ltr" className="block text-xs text-[#0A0A0A]/50">{a.totalBids} {t.marketplace.bids}</span>
                            <span dir="ltr" className="block text-sm font-semibold text-[#F05123]">{formatTimeLeft(a.endTime)}</span>
                          </div>
                        </div>
                        <span className="mt-4 block text-center text-sm font-semibold text-[#F05123]">{t.marketplace.viewBtn} →</span>
                      </div>
                    </button>
                  </Reveal>
                );
              })}
            </div>
            <Reveal>
              <div className="mt-12 text-center">
                <p className="text-lg font-semibold text-[#0A0A0A]">{t.marketplace.sellerCtaText}</p>
                <a
                  href={sellerWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => emitLandingEvent('seller_cta_clicked', { location: 'marketplace' })}
                  className="mt-4 inline-flex items-center justify-center px-8 py-4 rounded-full bg-[#F05123] text-white font-bold text-lg hover:bg-[#D93E15] transition"
                >
                  {t.marketplace.sellerCtaBtn}
                </a>
              </div>
            </Reveal>
          </>
        )}
      </div>
    </section>
  );
};
```

- [ ] **Step 3: Render the section after how-it-works**

Immediately after the how-it-works `</section>` (closes ~1474, before the Trust First section at 1475), insert `<LiveMarketplaceSection />`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` (0 errors) and `npm test` (409 pass).
```bash
git add src/landing/translations.ts src/landing/LandingView.tsx
git commit -m "feat(landing): real-data live-auctions centerpiece + seller CTA"
```

---

### Task 5: Promoted proof strip + how-it-works seller-first + remaining CTA analytics

**Files:**
- Modify: `src/landing/translations.ts` (new `proof` group)
- Modify: `src/landing/LandingView.tsx` (proof strip after hero; seller-tab default; analytics on remaining seller/browse CTAs)

**Interfaces:**
- Consumes: `emitLandingEvent` (Task 1); existing `Reveal`.

- [ ] **Step 1: Add `proof` translations (reuses the REAL numbers verbatim)**

Add to `interface TranslationType`:
```ts
proof: {
  headline: string; subline: string;
  stats: Array<{ value: string; label: string }>;
};
```
`ar`:
```ts
proof: {
  headline: "آلاف الأردنيين يشترون على مزاد الأردن",
  subline: "سلعتك تصل إلى طلبٍ حقيقي.",
  stats: [
    { value: "١٥,٠٠٠+", label: "مشترٍ" },
    { value: "١,٢٥٠+", label: "سلعة مُباعة" },
    { value: "٣,٤٠٠+", label: "سلعة مفحوصة" },
  ],
},
```
`en`:
```ts
proof: {
  headline: "Thousands of Jordanians already buy on Mazzado",
  subline: "Your item meets real demand.",
  stats: [
    { value: "15,000+", label: "buyers" },
    { value: "1,250+", label: "items sold" },
    { value: "3,400+", label: "items inspected" },
  ],
},
```

- [ ] **Step 2: Insert the proof strip immediately after the hero section**

After the hero `</section>` (closes ~1241, before how-it-works at 1242), insert:
```tsx
<section className="py-10 bg-[#0A0A0A]">
  <div className="max-w-5xl mx-auto px-5">
    <Reveal>
      <div className="text-center mb-6">
        <p className="text-white font-bold text-lg md:text-xl">{t.proof.headline}</p>
        <p className="text-white/50 text-sm mt-1">{t.proof.subline}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {t.proof.stats.map((s, i) => (
          <div key={i} className="text-center">
            <span dir="ltr" className="block text-2xl md:text-4xl font-bold text-[#F05123]">{s.value}</span>
            <span className="block text-white/60 text-xs md:text-sm mt-1">{s.label}</span>
          </div>
        ))}
      </div>
    </Reveal>
  </div>
</section>
```

- [ ] **Step 3: Default the how-it-works audience tab to the seller view**

Locate the `useState` that controls the how-it-works buyer/seller tab (in the component body, drives the how-it-works section at 1242). Change its initial value to the seller option (e.g. `useState<'seller' | 'buyer'>('seller')`, or `useState(true)` if it's a boolean `isSeller`). If the tab toggle handler is easy to reach, also fire `emitLandingEvent('seller_cta_clicked', { location: 'howitworks_tab' })` when the seller tab is selected — skip if it would require restructuring. Do NOT remove the buyer tab; buyer stays available, seller is just the default.

- [ ] **Step 4: Wire analytics on the remaining seller/browse CTAs**

For the remaining `onClick={onEnter}` CTAs (lines ~692 desktop nav, ~781 mobile menu, ~2551 coming-soon, ~2710 final CTA, ~2832 sticky mobile bar) wrap each as `onClick={() => { emitLandingEvent('browse_cta_clicked', { location: '<name>' }); onEnter(); }}` using a distinct location label per call site (`nav`, `mobile_menu`, `coming_soon`, `final`, `sticky`). For the pricing seller/WhatsApp buttons (`href={whatsappUrl}` at ~2173/2241/2298/2348), add `onClick={() => emitLandingEvent('seller_cta_clicked', { location: 'pricing' })}` WITHOUT changing their href. Do not alter layout/classes — only add the handler wrappers.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` (0 errors) and `npm test` (409 pass).
```bash
git add src/landing/translations.ts src/landing/LandingView.tsx
git commit -m "feat(landing): promoted proof strip, seller-first how-it-works, CTA analytics"
```

---

## Self-Review

**Spec coverage:**
- Seller-first hero (§1) → Task 3. ✓
- Promote real proof (§2) → Task 5 proof strip (reuses real numbers verbatim); testimonials/stats bar untouched. ✓
- Real live-marketplace centerpiece (§3) → Tasks 2 + 4 (hook + section + honest empty fallback + seller CTA). ✓
- Seller-trust journey ordering (§4) → Task 4 (marketplace after how-it-works) + Task 5 (proof after hero, seller-tab default). Materially-helpful moves only; escrow/categories/testimonials/FAQ left in place (spec: don't gratuitously reorder). ✓
- Seller-funnel analytics + CTA intent (§5) → Task 1 (helper) wired in Tasks 3/4/5; seller CTAs carry WhatsApp seller-intent prefill; client-emit only per the write-auth constraint. ✓
- RTL-native (§6) → every new string bilingual via translations; `dir="ltr"` on numerals; `start/end` logical classes in the card. ✓

**Placeholder scan:** New-module code is complete. LandingView edits are surgical against exact anchors with exact copy strings — the implementer reads the file to preserve existing classes/motion props (reproducing 2846 lines is not feasible; the "keep existing className" instructions are explicit).

**Type consistency:** `LandingAuction`, `curateLandingAuctions`, `mapToLandingAuction`, `useLandingAuctions`, `LandingEventName`, `buildLandingEvent`, `emitLandingEvent`, `sellerIntentMsg`, `marketplace`, `proof` names match across tasks. `AuctionItem` field names (`currentPrice`, `totalBids`, `endTime`, `thumbnailUrl`, `mediaUrls`, `approvalStatus`, `isFeatured`, `isSimulated`) match recon.

**Preview gate:** After Task 5 + whole-branch review, STOP. Deploy Vercel preview, present to MJ in BOTH languages. No merge until approved. Then write the post-implementation deliverable (design rationale, assumptions, weaknesses, off-landing improvements, 6-month liquidity priorities).
