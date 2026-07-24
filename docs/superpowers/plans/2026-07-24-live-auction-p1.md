# Live Auction P1 (Feel Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three low-visual-risk "feel" fixes from the live-auction redesign spec — compact price formatting, optimistic bid paint, and a 30s/30s anti-snipe soft-close (per-auction configurable).

**Architecture:** Pure, unit-tested helpers (`bidFormat`, `resolveAntiSnipe`, `computeSoftCloseEnd`, `reconcileOptimistic`) hold the logic; thin wiring applies them. Optimistic paint lives entirely in `LiveStreamView.executeBid` + its derived `activePrice`/top-bidder/history, so neither layout component changes. Anti-snipe mirrors the payment-window pattern (settlement.js source of truth + drop-builder preset + rules pinning).

**Tech Stack:** React 19 + Vite + TypeScript, Firebase Cloud Functions (Node, CJS in `functions/`), Vitest, Tailwind v4.

## Global Constraints

- Money in integer **fils** on the server; `amountJod` is display JOD. Never introduce float drift.
- `functions/` is CommonJS; `src/` is ESM/TS. Pure helpers shared by functions live in `functions/settlement.js` and are unit-tested via Vitest.
- Anti-snipe defaults: **window 30s, extend 30s**; clamp window ∈ [5s,120s], extend ∈ [5s,120s]. Default when unset keeps every existing/seller/simulator auction working.
- All 463 existing tests must stay green; `npm run lint` (tsc --noEmit) and `npm run build` clean.
- Arabic-safe: formatting helpers return digit strings only; callers append `JOD`/`د.أ`.

---

### Task 1: Compact price formatting util

**Files:**
- Create: `src/utils/bidFormat.ts`
- Test: `src/utils/bidFormat.test.ts`
- Modify: `src/components/DesktopLiveAuctionLayout.tsx` (quick-bid chips + current-bid span)

**Interfaces:**
- Produces: `compactJod(n: number): string` — `500000→"500K"`, `1500000→"1.5M"`, `999→"999"`, `12345→"12.3K"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/bidFormat.test.ts
import { describe, it, expect } from 'vitest';
import { compactJod } from './bidFormat';

describe('compactJod', () => {
  it('leaves values under 1000 as plain integers', () => {
    expect(compactJod(0)).toBe('0');
    expect(compactJod(25)).toBe('25');
    expect(compactJod(999)).toBe('999');
  });
  it('formats thousands with K, one decimal, trailing zero trimmed', () => {
    expect(compactJod(1000)).toBe('1K');
    expect(compactJod(12345)).toBe('12.3K');
    expect(compactJod(500000)).toBe('500K');
  });
  it('formats millions with M', () => {
    expect(compactJod(1000000)).toBe('1M');
    expect(compactJod(1500000)).toBe('1.5M');
  });
  it('rounds, never fabricates precision, and handles junk as 0', () => {
    expect(compactJod(1949)).toBe('1.9K');
    expect(compactJod(NaN as unknown as number)).toBe('0');
    expect(compactJod(-5)).toBe('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/bidFormat.test.ts`
Expected: FAIL ("compactJod" not exported).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/bidFormat.ts
/** Compact JOD magnitude for tight labels (chips): 500000 -> "500K", 1.5M etc.
 * Digits only — callers append the JOD/د.أ unit. Non-finite/negative -> "0". */
export function compactJod(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const trim = (v: number) => String(Number(v.toFixed(1))); // drop trailing .0
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(Math.round(n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/bidFormat.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply to the desktop quick-bid chips + current bid**

In `src/components/DesktopLiveAuctionLayout.tsx`:
- Add import at top with the other `../utils` imports: `import { compactJod } from '../utils/bidFormat';`
- Quick-bid chip label (currently `{isAr ? 'زايد' : 'Bid'} {amount.toLocaleString()} ...`): replace `{amount.toLocaleString()}` with `{compactJod(amount)}`.
- Current-bid `<CountUp .../>` line: wrap the number in a tabular-nums span so digits don't jitter. Change the `format` prop usage so the surrounding element has `className="tabular-nums"` (add `tabular-nums` to the existing className on the CountUp's parent `<span>`/`<div>`).

- [ ] **Step 6: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/utils/bidFormat.ts src/utils/bidFormat.test.ts src/components/DesktopLiveAuctionLayout.tsx
git commit -m "feat(bid): compact JOD formatting for chips + tabular-nums current bid"
```

---

### Task 2: Anti-snipe resolver (pure, in settlement.js)

**Files:**
- Modify: `functions/settlement.js`
- Test: `functions/settlement.test.js`

**Interfaces:**
- Produces: `resolveAntiSnipe(auctionData): { windowMs: number, extendMs: number }` — reads `auctionData.antiSnipeWindowSec` / `antiSnipeExtendSec`, default 30/30, clamps each to [5,120]s, returns milliseconds.
- Produces: `computeSoftCloseEnd(currentEndMs, nowMs, windowMs, extendMs): number` — if `0 < currentEndMs - nowMs < windowMs`, return `nowMs + extendMs` (reset-to-window soft close); else return `currentEndMs`.
- Constants exported: `DEFAULT_ANTISNIPE_WINDOW_SEC=30`, `DEFAULT_ANTISNIPE_EXTEND_SEC=30`, `MIN_ANTISNIPE_SEC=5`, `MAX_ANTISNIPE_SEC=120`.

- [ ] **Step 1: Write the failing test**

```js
// append to functions/settlement.test.js imports:
const {
  resolveAntiSnipe, computeSoftCloseEnd,
  DEFAULT_ANTISNIPE_WINDOW_SEC, MIN_ANTISNIPE_SEC, MAX_ANTISNIPE_SEC,
} = require('./settlement');

describe('resolveAntiSnipe', () => {
  it('defaults to 30s/30s when unset', () => {
    expect(resolveAntiSnipe({})).toEqual({ windowMs: 30000, extendMs: 30000 });
    expect(resolveAntiSnipe({ antiSnipeWindowSec: undefined })).toEqual({ windowMs: 30000, extendMs: 30000 });
  });
  it('reads per-auction values in seconds -> ms', () => {
    expect(resolveAntiSnipe({ antiSnipeWindowSec: 60, antiSnipeExtendSec: 15 })).toEqual({ windowMs: 60000, extendMs: 15000 });
  });
  it('clamps to [5,120]s and coerces junk to default', () => {
    expect(resolveAntiSnipe({ antiSnipeWindowSec: 9999 }).windowMs).toBe(MAX_ANTISNIPE_SEC * 1000);
    expect(resolveAntiSnipe({ antiSnipeWindowSec: 1 }).windowMs).toBe(MIN_ANTISNIPE_SEC * 1000);
    expect(resolveAntiSnipe({ antiSnipeWindowSec: 'abc' }).windowMs).toBe(DEFAULT_ANTISNIPE_WINDOW_SEC * 1000);
  });
});

describe('computeSoftCloseEnd', () => {
  const now = 1_000_000;
  it('extends to now+extend when a bid lands inside the window', () => {
    expect(computeSoftCloseEnd(now + 8000, now, 30000, 30000)).toBe(now + 30000);
  });
  it('does not shorten an end further out than the window', () => {
    expect(computeSoftCloseEnd(now + 90000, now, 30000, 30000)).toBe(now + 90000);
  });
  it('leaves an already-past end untouched', () => {
    expect(computeSoftCloseEnd(now - 1, now, 30000, 30000)).toBe(now - 1);
  });
  it('resets to a full window even for a bid at 1s remaining (soft close, not additive)', () => {
    expect(computeSoftCloseEnd(now + 1000, now, 30000, 30000)).toBe(now + 30000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run functions/settlement.test.js`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement in settlement.js**

```js
// add before module.exports in functions/settlement.js
const DEFAULT_ANTISNIPE_WINDOW_SEC = 30;
const DEFAULT_ANTISNIPE_EXTEND_SEC = 30;
const MIN_ANTISNIPE_SEC = 5;
const MAX_ANTISNIPE_SEC = 120;
function clampSec(v, def) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(MAX_ANTISNIPE_SEC, Math.max(MIN_ANTISNIPE_SEC, Math.round(n)));
}
function resolveAntiSnipe(auctionData) {
  const d = auctionData || {};
  return {
    windowMs: clampSec(d.antiSnipeWindowSec, DEFAULT_ANTISNIPE_WINDOW_SEC) * 1000,
    extendMs: clampSec(d.antiSnipeExtendSec, DEFAULT_ANTISNIPE_EXTEND_SEC) * 1000,
  };
}
function computeSoftCloseEnd(currentEndMs, nowMs, windowMs, extendMs) {
  const remaining = currentEndMs - nowMs;
  if (remaining > 0 && remaining < windowMs) return nowMs + extendMs;
  return currentEndMs;
}
```
Add all five names + the two functions to `module.exports`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run functions/settlement.test.js`
Expected: PASS (existing + 7 new).

- [ ] **Step 5: Commit**

```bash
git add functions/settlement.js functions/settlement.test.js
git commit -m "feat(bid): anti-snipe resolver + soft-close helper (30s/30s default)"
```

---

### Task 3: Wire soft-close into applyBidWrites

**Files:**
- Modify: `functions/index.js` (`applyBidWrites`, and its `require('./settlement')` line)

**Interfaces:**
- Consumes: `resolveAntiSnipe`, `computeSoftCloseEnd` from Task 2.

- [ ] **Step 1: Import the helpers**

In `functions/index.js`, extend the existing settlement require:
`const { resolveSettlement, reserveMet, resolvePaymentWindowHours, resolveAntiSnipe, computeSoftCloseEnd } = require('./settlement');`

- [ ] **Step 2: Replace the hardcoded extension**

In `applyBidWrites`, replace:
```js
  let finalEndTime = bid.endTimeMs || Date.now();
  const timeRemaining = finalEndTime - Date.now();
  if (timeRemaining > 0 && timeRemaining < 10000) {
    finalEndTime += 15000;
  }
```
with:
```js
  const nowMs = Date.now();
  const { windowMs, extendMs } = resolveAntiSnipe(auctionData);
  const finalEndTime = computeSoftCloseEnd(bid.endTimeMs || nowMs, nowMs, windowMs, extendMs);
```

- [ ] **Step 3: Syntax check + full suite**

Run: `node -c functions/index.js && npx vitest run`
Expected: `index.js` parses; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat(bid): apply per-auction anti-snipe soft-close in applyBidWrites"
```

---

### Task 4: Optimistic bid paint (LiveStreamView)

**Files:**
- Create: `src/utils/optimisticBid.ts`
- Test: `src/utils/optimisticBid.test.ts`
- Modify: `src/components/LiveStreamView.tsx`

**Interfaces:**
- Produces: `type OptimisticBid = { auctionId: string; price: number; bidderId: string; bidderName: string } | null`.
- Produces: `effectivePrice(docPrice: number, opt: OptimisticBid, auctionId: string): number` — returns `opt.price` when `opt` matches this auction and `opt.price > docPrice`, else `docPrice`.
- Produces: `optimisticResolved(docPrice: number, opt: OptimisticBid, auctionId: string): boolean` — true when the doc has caught up (`docPrice >= opt.price`) so the caller clears the overlay.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/optimisticBid.test.ts
import { describe, it, expect } from 'vitest';
import { effectivePrice, optimisticResolved } from './optimisticBid';

const opt = { auctionId: 'a1', price: 30, bidderId: 'u1', bidderName: 'Me' };

describe('effectivePrice', () => {
  it('prefers a higher optimistic price for the matching auction', () => {
    expect(effectivePrice(25, opt, 'a1')).toBe(30);
  });
  it('ignores optimistic for a different auction', () => {
    expect(effectivePrice(25, opt, 'a2')).toBe(25);
  });
  it('ignores a stale optimistic once the doc meets/exceeds it', () => {
    expect(effectivePrice(30, opt, 'a1')).toBe(30);
    expect(effectivePrice(35, opt, 'a1')).toBe(35);
  });
  it('handles null overlay', () => {
    expect(effectivePrice(25, null, 'a1')).toBe(25);
  });
});

describe('optimisticResolved', () => {
  it('is true when the doc caught up', () => {
    expect(optimisticResolved(30, opt, 'a1')).toBe(true);
    expect(optimisticResolved(31, opt, 'a1')).toBe(true);
  });
  it('is false while the doc still trails', () => {
    expect(optimisticResolved(25, opt, 'a1')).toBe(false);
  });
  it('is true (nothing to hold) for null or mismatched auction', () => {
    expect(optimisticResolved(25, null, 'a1')).toBe(true);
    expect(optimisticResolved(25, opt, 'a2')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/optimisticBid.test.ts`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement the util**

```ts
// src/utils/optimisticBid.ts
export type OptimisticBid =
  | { auctionId: string; price: number; bidderId: string; bidderName: string }
  | null;

const matches = (opt: OptimisticBid, auctionId: string): opt is Exclude<OptimisticBid, null> =>
  !!opt && opt.auctionId === auctionId;

/** Effective display price: the optimistic price wins only while it leads the doc. */
export function effectivePrice(docPrice: number, opt: OptimisticBid, auctionId: string): number {
  if (matches(opt, auctionId) && opt.price > docPrice) return opt.price;
  return docPrice;
}

/** True once the doc has caught up (or there's nothing/foreign to hold) — caller clears overlay. */
export function optimisticResolved(docPrice: number, opt: OptimisticBid, auctionId: string): boolean {
  if (!matches(opt, auctionId)) return true;
  return docPrice >= opt.price;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/optimisticBid.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into LiveStreamView**

In `src/components/LiveStreamView.tsx`:
- Import: `import { effectivePrice, optimisticResolved, type OptimisticBid } from '../utils/optimisticBid';` and ensure `useState`/`useEffect` are imported.
- Add state near the other hooks: `const [optimistic, setOptimistic] = useState<OptimisticBid>(null);`
- Change `activePrice` (line ~391) to derive optimistically:
  `const activePrice = activeAuction ? effectivePrice(activeAuction.currentPrice, optimistic, activeAuction.id) : 0;`
- In `executeBid`, set the overlay synchronously BEFORE awaiting `placeBid`, and roll back on failure:
```ts
    // Optimistic paint: show my bid instantly; reconcile when the listener echoes.
    if (currentUser) {
      setOptimistic({ auctionId: activeAuction.id, price: amount, bidderId: currentUser.id, bidderName: currentUser.name || 'You' });
    }
    const res = await placeBid(activeAuction.id, amount);
    if (!res.success) {
      setOptimistic(prev => (prev && prev.auctionId === activeAuction.id ? null : prev)); // roll back
      triggerToast(res.message);
    }
    return res;
```
- Add an effect to clear the overlay once the doc catches up (listener reconciled):
```ts
  useEffect(() => {
    if (activeAuction && optimisticResolved(activeAuction.currentPrice, optimistic, activeAuction.id)) {
      if (optimistic) setOptimistic(null);
    }
  }, [activeAuction?.currentPrice, activeAuction?.id, optimistic]);
```
- Also derive the optimistic top bidder for the panels: where `activeAuction.currentBidderName` is read for the "top bidder" display, prefer the overlay's `bidderName` while `optimistic` matches and leads (use a local `const topBidderName = optimistic && optimistic.auctionId === activeAuction?.id && optimistic.price >= activePrice ? optimistic.bidderName : activeAuction?.currentBidderName;` and pass that where the layouts show the top bidder). Keep this minimal — price is the primary win.

- [ ] **Step 6: Lint + build + full suite**

Run: `npm run lint && npm run build && npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/utils/optimisticBid.ts src/utils/optimisticBid.test.ts src/components/LiveStreamView.tsx
git commit -m "feat(bid): optimistic price paint on confirm, reconcile on listener echo"
```

---

### Task 5: Per-auction anti-snipe config (drop builder + rules)

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx`
- Modify: `src/types.ts` (add `antiSnipeWindowSec?`, `antiSnipeExtendSec?` to `AuctionItem`)
- Modify: `firestore.rules` (pin non-admin create/update to defaults, add to order-independent auction denylist)

**Interfaces:**
- Consumes: `AuctionItem.antiSnipeWindowSec/antiSnipeExtendSec` read server-side by `resolveAntiSnipe` (Task 2).

- [ ] **Step 1: Add the type fields**

In `src/types.ts`, right after `paymentWindowHours?: number;`:
```ts
  antiSnipeWindowSec?: number; // final-seconds window that triggers a soft-close extension; default 30 server-side
  antiSnipeExtendSec?: number; // seconds the clock resets to on a late bid; default 30 server-side
```

- [ ] **Step 2: Add the preset picker to the drop builder**

In `src/components/AuctionDropBuilderView.tsx`:
- Add a constant near `PAYMENT_WINDOW_PRESETS`:
```ts
const ANTI_SNIPE_PRESETS = [
  { sec: 0, label: 'إيقاف', en: 'Off' },
  { sec: 15, label: '15 ثانية', en: '15s' },
  { sec: 30, label: '30 ثانية', en: '30s' },
  { sec: 60, label: '60 ثانية', en: '60s' },
];
```
- Add state: `const [antiSnipeSec, setAntiSnipeSec] = useState(30);`
- Add to the `createListing` payload (next to `paymentWindowHours`): when `antiSnipeSec > 0`, include `antiSnipeWindowSec: antiSnipeSec, antiSnipeExtendSec: antiSnipeSec`; when `0` (Off) include both as `5` is invalid — instead omit them and rely on... NO: "Off" must disable, so set both to a sentinel the resolver treats as off. Simpler: drop "Off" for v1 (soft-close always on; the value only tunes it). Use presets 15/30/60 only, default 30. Payload always includes `antiSnipeWindowSec: antiSnipeSec, antiSnipeExtendSec: antiSnipeSec`.
- Carry through relist: `if (a.antiSnipeWindowSec) setAntiSnipeSec(a.antiSnipeWindowSec);`
- Add the `<select>` after the Payment-window `<label>`, mirroring its markup, bound to `antiSnipeSec`/`setAntiSnipeSec` over `ANTI_SNIPE_PRESETS` (15/30/60), with a helper line: EN "Bids in the final seconds extend the clock. Default 30s." / AR "المزايدات في الثواني الأخيرة تُمدّد الوقت. الافتراضي ٣٠ ثانية.".

(Remove the "Off" preset per the note above; keep `ANTI_SNIPE_PRESETS` = 15/30/60.)

- [ ] **Step 3: Pin non-admin auctions to defaults in rules**

In `firestore.rules`, in the non-admin auction **create** branch (next to the `paymentWindowHours == 24` line), add:
```
          (!('antiSnipeWindowSec' in request.resource.data) || request.resource.data.antiSnipeWindowSec == 30) &&
          (!('antiSnipeExtendSec' in request.resource.data) || request.resource.data.antiSnipeExtendSec == 30) &&
```
And add `'antiSnipeWindowSec', 'antiSnipeExtendSec'` to the non-admin auction **update** `affectedKeys().hasAny([...])` denylist (same array that now contains `'paymentWindowHours'`).

- [ ] **Step 4: Lint + build + suite**

Run: `npm run lint && npm run build && npx vitest run`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionDropBuilderView.tsx src/types.ts firestore.rules
git commit -m "feat(bid): per-auction anti-snipe preset (15/30/60s) + rules pinning"
```

---

## Self-Review notes

- **Spec coverage:** compact formatting (Task 1, spec §D + component 1), optimistic paint (Task 4, spec §C + component 2), anti-snipe soft-close + config (Tasks 2/3/5, spec §E + component 5). Mobile/desktop layout redesign is intentionally OUT of P1 (P2/P3, preview-gated).
- **Placeholder scan:** none — all code shown. Task 5 Step 2 resolves the "Off" ambiguity inline (dropped for v1).
- **Type consistency:** `resolveAntiSnipe`/`computeSoftCloseEnd` names identical across Tasks 2→3; `effectivePrice`/`optimisticResolved`/`OptimisticBid` identical across Task 4 def→use; `antiSnipeWindowSec/antiSnipeExtendSec` identical across types/drop-builder/rules/resolver.
- **Review gate:** Tasks 2–4 (money-path: end-time + displayed price) get cross-model adversarial review before merge. Whole branch stays unmerged until P2/P3 land and MJ approves the preview.
