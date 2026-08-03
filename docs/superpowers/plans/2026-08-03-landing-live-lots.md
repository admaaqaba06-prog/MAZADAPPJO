# Landing Live Lots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the landing page rendering an empty-marketplace state while 147 live lots exist, and label those lots honestly once they appear.

**Architecture:** The bug is one over-strict predicate in a pure function. `curateLandingAuctions` requires `typeof endTime === 'number'`, and every current live lot is `startMode: 'first_bid'` with no clock until someone bids — so all of them are discarded. Replacing that predicate with the existing `isLiveNow` helper admits them without loosening the expiry guard. Admitting clockless lots then forces two follow-on changes: a sort that no longer subtracts a possibly-absent `endTime`, and card copy that does not call a zero-bid lot's opening price a "current bid".

**Tech Stack:** React 18 + TypeScript (Vite), Firebase Firestore v9 modular SDK, Tailwind, `vitest` (node environment only).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-03-landing-live-lots-design.md`. Read it before Task 1.
- **`vitest` is node-only.** No jsdom, no `@testing-library/react`. Components CANNOT be render-tested. Never write a test that renders a component or touches `document`. Pure functions in `src/landing/` and `src/utils/` ARE testable and weak tests there are a defect.
- **`tsc` is not a safety net.** No `@types/react`, no `strict`/`strictNullChecks`, so `number | undefined` flows into `number` unchecked in `.tsx`. Verify `.tsx` changes by reading them. `npx vite build` is the only real JSX parse.
- **Bilingual copy is mandatory.** Every user-visible string needs an Arabic and an English form. On the landing page the idiom is a key in `src/landing/translations.ts` read as `t.marketplace.<key>`, NOT an inline `isAr ?` ternary.
- **RTL:** the landing card already uses logical properties (`start-3`, `end-3`). Keep using logical properties; do not introduce `left-`/`right-`.
- **A comment stating behaviour the code does not have is a real defect here.** The predecessor branch found six. Do not add a seventh, and fix any this change falsifies.
- **Branch:** work on `fix/landing-shows-live-lots`, already created off `main`. Do not commit to `main`.
- **Run `npm test` (full suite) + `npm run lint` + `npx vite build` before every commit.**
- **Never write to Firestore from the client.** This plan is read-path only.

---

### Task 1: Admit clockless lots, and order them deterministically

All of this lives in one pure module and is fully unit-testable, so it ships as one task with one test cycle.

**Files:**
- Modify: `src/landing/useLandingAuctions.ts` (the `LandingAuction` interface, its `endTime` docblock, `mapToLandingAuction`, and `curateLandingAuctions`)
- Test: `src/landing/useLandingAuctions.test.ts` (existing file — extend it)

**Interfaces:**
- Consumes: `isLiveNow(auction, now)` from `src/utils/auctionPhase.ts` — already imported by this file.
- Produces: `LandingAuction` gains `createdAt: number | undefined` and `featuredRank: number | undefined`. `LandingAuction.endTime` may now be `undefined` for a clockless lot. Task 2 reads all three.

- [ ] **Step 1: Write the failing tests**

Append to `src/landing/useLandingAuctions.test.ts`. The file's existing `auction()` factory defaults `endTime: NOW + 60_000`, so pass `endTime: undefined` explicitly to model a clockless lot.

```ts
describe('curateLandingAuctions — clockless (awaiting-first-bid) lots', () => {
  it('KEEPS a live lot that has no endTime (the regression this fixes)', () => {
    const out = curateLandingAuctions([auction({ id: 'clockless', endTime: undefined })], NOW);
    expect(out.map(a => a.id)).toEqual(['clockless']);
  });

  it('still drops a lot whose clock has expired', () => {
    const out = curateLandingAuctions([auction({ id: 'expired', endTime: NOW - 1 })], NOW);
    expect(out).toEqual([]);
  });

  it('still drops non-live lots, clockless or not', () => {
    const out = curateLandingAuctions([
      auction({ id: 'up', status: 'upcoming', endTime: undefined }),
      auction({ id: 'done', status: 'completed', endTime: undefined }),
    ], NOW);
    expect(out).toEqual([]);
  });

  it('still drops a titleless lot', () => {
    const out = curateLandingAuctions([auction({ id: 'notitle', title: '', endTime: undefined })], NOW);
    expect(out).toEqual([]);
  });
});

describe('curateLandingAuctions — ordering', () => {
  it('ranks featured lots first, by featuredRank ascending', () => {
    const out = curateLandingAuctions([
      auction({ id: 'plain' }),
      auction({ id: 'rank2', isFeatured: true, featuredRank: 2 } as any),
      auction({ id: 'rank1', isFeatured: true, featuredRank: 1 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['rank1', 'rank2', 'plain']);
  });

  it('places a featured lot with no rank after ranked ones but before unfeatured', () => {
    const out = curateLandingAuctions([
      auction({ id: 'plain' }),
      auction({ id: 'noRank', isFeatured: true }),
      auction({ id: 'rank1', isFeatured: true, featuredRank: 1 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['rank1', 'noRank', 'plain']);
  });

  it('places clocked lots before clockless ones', () => {
    const out = curateLandingAuctions([
      auction({ id: 'clockless', endTime: undefined }),
      auction({ id: 'clocked', endTime: NOW + 60_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['clocked', 'clockless']);
  });

  it('orders clocked lots by endTime ascending (soonest first)', () => {
    const out = curateLandingAuctions([
      auction({ id: 'later', endTime: NOW + 90_000 }),
      auction({ id: 'sooner', endTime: NOW + 10_000 }),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['sooner', 'later']);
  });

  it('orders clockless lots by createdAt descending (newest first)', () => {
    const out = curateLandingAuctions([
      auction({ id: 'old', endTime: undefined, createdAt: 100 } as any),
      auction({ id: 'new', endTime: undefined, createdAt: 900 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['new', 'old']);
  });

  it('sorts a clockless lot with no createdAt last, without throwing', () => {
    const out = curateLandingAuctions([
      auction({ id: 'nodate', endTime: undefined } as any),
      auction({ id: 'dated', endTime: undefined, createdAt: 500 } as any),
    ], NOW);
    expect(out.map(a => a.id)).toEqual(['dated', 'nodate']);
  });
});

describe('mapToLandingAuction — new fields', () => {
  it('carries createdAt through as epoch millis from a Firestore Timestamp shape', () => {
    expect(mapToLandingAuction(auction({ createdAt: { seconds: 5 } } as any)).createdAt).toBe(5000);
  });

  it('carries a numeric createdAt through unchanged', () => {
    expect(mapToLandingAuction(auction({ createdAt: 1234 } as any)).createdAt).toBe(1234);
  });

  it('leaves createdAt undefined when the doc has none — never fabricates one', () => {
    expect(mapToLandingAuction(auction({})).createdAt).toBeUndefined();
  });

  it('carries featuredRank through, undefined when absent', () => {
    expect(mapToLandingAuction(auction({ featuredRank: 3 } as any)).featuredRank).toBe(3);
    expect(mapToLandingAuction(auction({})).featuredRank).toBeUndefined();
  });

  it('leaves endTime undefined for a clockless lot rather than inventing a clock', () => {
    expect(mapToLandingAuction(auction({ endTime: undefined })).endTime).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/landing/useLandingAuctions.test.ts`
Expected: FAIL. The clockless-keep case returns `[]`, the ordering cases fail, and the `createdAt`/`featuredRank` cases return `undefined` because the fields do not exist yet.

- [ ] **Step 3: Add the two fields to `LandingAuction` and fix the falsified docblock**

In `src/landing/useLandingAuctions.ts`, replace the whole `endTime` docblock and field inside `interface LandingAuction` with:

```ts
  /**
   * Epoch millis, or `undefined` for a clockless lot. NOT the mapped
   * `AuctionItem.endTime`: this file never goes through `resolveEndTime` —
   * `fetchLandingAuctions` spreads the RAW doc (`{ id, ...d.data() }`), so
   * `mapToLandingAuction` copies the raw field straight across.
   *
   * A `first_bid` lot stores neither `endTime` nor `endsAt` until its first bid
   * (the server stamps `endsAt` then), so this lands as `undefined`. Curation
   * KEEPS such lots, so a curated LandingAuction does NOT always hold a number
   * and every consumer must guard before doing arithmetic on it.
   */
  endTime: number | null | undefined;
  /**
   * Epoch millis of the doc's `createdAt`, or `undefined` when the doc has none.
   * Used to order clockless lots newest-first; a lot without it sorts last.
   */
  createdAt: number | undefined;
  /**
   * Admin curation order — the contiguous 1..n integer written by the featured
   * flow (see `src/utils/featuredRank.ts`), absent when a lot is not featured.
   * `isFeatured` still drives rendering; this only drives ordering.
   */
  featuredRank: number | undefined;
```

- [ ] **Step 4: Add a local timestamp reader and extend the mapper**

Add above `mapToLandingAuction` in the same file:

```ts
/**
 * Read a raw Firestore timestamp-ish value as epoch millis, or `undefined` when
 * it is absent or unreadable.
 *
 * Deliberately NOT `parseAuctionTimestamp`: that helper falls back to
 * `Date.now() + 1h` for a missing value, which would sort an undated lot NEWEST
 * instead of last. This module also stays free of the mapper imports by design.
 */
function readMillis(val: any): number | undefined {
  if (val == null) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const parsed = Date.parse(val);
  return Number.isNaN(parsed) ? undefined : parsed;
}
```

Then in `mapToLandingAuction`, keep every existing field and add two lines after `endTime: a.endTime,`:

```ts
    createdAt: readMillis((a as any).createdAt),
    featuredRank: typeof (a as any).featuredRank === 'number' ? (a as any).featuredRank : undefined,
```

- [ ] **Step 5: Fix the filter and the comparator**

Replace the whole `curateLandingAuctions` function (its leading comment included) with:

```ts
// Pure curation: live, titled auctions ordered for the marketplace strip, capped.
// Simulated auctions ARE included pre-launch so the section never looks dead while
// real volume ramps (founder decision — revisit once real live volume is steady).
//
// `isLiveNow` is the ONLY liveness test: it keeps a lot with no clock and drops one
// whose clock has passed. The previous `typeof endTime === 'number'` guard was
// redundant with it for clocked lots and silently discarded every clockless
// (awaiting-first-bid) lot — which, with an all-first_bid catalogue, meant the
// section rendered its empty state while the whole inventory was live.
//
// Order: featured by rank, then clocked lots ending soonest, then clockless newest
// first. A running clock is real urgency and earns the top slots; a clockless lot
// has no meaningful position among clocked ones. Unit-tested; the hook wrapper is not.
export function curateLandingAuctions(
  auctions: AuctionItem[],
  now: number = Date.now(),
  cap: number = DISPLAY_CAP
): LandingAuction[] {
  return auctions
    .filter(a => !!a.title && isLiveNow(a, now))
    .map(mapToLandingAuction)
    .sort((x, y) => {
      if (x.isFeatured !== y.isFeatured) return x.isFeatured ? -1 : 1;
      if (x.isFeatured && y.isFeatured) {
        const xr = x.featuredRank ?? Number.MAX_SAFE_INTEGER;
        const yr = y.featuredRank ?? Number.MAX_SAFE_INTEGER;
        if (xr !== yr) return xr - yr;
      }
      const xClocked = typeof x.endTime === 'number';
      const yClocked = typeof y.endTime === 'number';
      if (xClocked !== yClocked) return xClocked ? -1 : 1;
      if (xClocked && yClocked) return (x.endTime as number) - (y.endTime as number);
      // Both clockless: newest first; an undated lot sorts last.
      return (y.createdAt ?? -Infinity) - (x.createdAt ?? -Infinity);
    })
    .slice(0, cap);
}
```

Note the `.map` now runs BEFORE `.sort` — the comparator reads `featuredRank` and `createdAt`, which only exist on the mapped shape. The `.slice(cap)` stays last so the cap still applies to the ordered list.

The old `totalBids desc` tie-break is deliberately dropped: every lot in the current catalogue has zero bids, so it never discriminated, and re-adding it above the clocked/clockless split would let a bid-less clocked lot fall below a clockless one.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS — full suite green, including the ~17 new cases and every pre-existing case in this file.

- [ ] **Step 7: Typecheck and build**

Run: `npm run lint && npx vite build`
Expected: both clean. Note `npm run lint` proves little here (see Global Constraints) — `vite build` is the meaningful check.

- [ ] **Step 8: Commit**

```bash
git add src/landing/useLandingAuctions.ts src/landing/useLandingAuctions.test.ts
git commit -m "fix(landing): stop discarding every clockless lot from the marketplace

curateLandingAuctions required typeof endTime === 'number'. A first_bid lot has
no clock until someone bids, and the whole live catalogue is first_bid — so all
147 live lots were dropped and the section rendered its empty state, telling
visitors to go sell something while the inventory sat live behind it."
```

---

### Task 2: Label the lots honestly on the card

**Files:**
- Modify: `src/landing/translations.ts` (add one key to BOTH language objects)
- Modify: `src/landing/LandingView.tsx` (inside `LiveMarketplaceSection`: the `endingSoon` derivation, the badge slot, the price label)

**Interfaces:**
- Consumes: `LandingAuction.endTime`/`createdAt`/`featuredRank` from Task 1; `priceLabel(totalBids, isAr)` from `src/utils/bidLabels.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the badge copy to both language objects**

In `src/landing/translations.ts`, the `marketplace` block appears twice — once in the Arabic object, once in the English one. Anchor on the existing `endingSoon` key in each and add `beTheFirst` directly after it.

Arabic (`endingSoon: "..."` in the `ar` object):
```ts
      beTheFirst: "كن أول مزايد",
```

English (`endingSoon: "Ending soon"`):
```ts
      beTheFirst: "Be the first",
```

Then add it to the `marketplace` type declaration near the top of the file, on the line that already declares `endingSoon`:
```ts
    verified: string; endingSoon: string; beTheFirst: string; viewBtn: string; emptyTitle: string; emptyDesc: string;
```

The Arabic string is byte-identical to the chip already shipping in `DiscoveryFeedView` so a visitor who taps through sees the same words.

- [ ] **Step 2: Make the clock check explicit and add the badge**

In `src/landing/LandingView.tsx`, inside `LiveMarketplaceSection`'s `auctions.map`, replace:

```tsx
                const endingSoon = a.endTime - Date.now() < 3600_000;
```

with:

```tsx
                // A clockless (awaiting-first-bid) lot has no endTime at all, so
                // it can be neither ending-soon nor expired. The old expression
                // reached the same result only via `NaN < n` being false — this
                // states the condition instead of relying on that.
                const hasClock = typeof a.endTime === 'number';
                const endingSoon = hasClock && a.endTime - Date.now() < 3600_000;
```

Then replace the badge block:

```tsx
                        {endingSoon ? (
                          <span className="absolute top-3 end-3 px-2 py-1 rounded-full bg-[#F05123] text-white text-xs font-semibold">
                            {t.marketplace.endingSoon}
                          </span>
                        ) : null}
```

with:

```tsx
                        {endingSoon ? (
                          <span className="absolute top-3 end-3 px-2 py-1 rounded-full bg-[#F05123] text-white text-xs font-semibold">
                            {t.marketplace.endingSoon}
                          </span>
                        ) : !hasClock ? (
                          /* Amber, not the brand orange above: on every other surface
                             orange means a clock is running, and this lot's has not
                             started. Matches the Discover card's amber badge. */
                          <span className="absolute top-3 end-3 px-2 py-1 rounded-full bg-amber-400 text-zinc-900 text-xs font-semibold">
                            {t.marketplace.beTheFirst}
                          </span>
                        ) : null}
```

- [ ] **Step 3: Stop calling an opening price a current bid**

Add to the imports at the top of `src/landing/LandingView.tsx`:

```tsx
import { priceLabel } from '../utils/bidLabels';
```

Then in the same `auctions.map`, replace:

```tsx
                            <span className="block text-xs text-[#0A0A0A]/50">{t.marketplace.currentBid}</span>
```

with:

```tsx
                            <span className="block text-xs text-[#0A0A0A]/50">{priceLabel(a.totalBids, lang === 'ar')}</span>
```

`lang` is already a prop of `LiveMarketplaceSection` (`lang: 'ar' | 'en'`) — do not add a new one. `priceLabel` returns `Opening price` / `السعر الافتتاحي` at zero bids and `Current bid` / `المزايدة الحالية` once a bid lands, which is exactly the distinction PR #220 introduced for the bidding surfaces and this card missed.

This leaves `t.marketplace.currentBid` with no readers. Leave the key in `translations.ts`; note it in your report as dead so it can be swept later.

- [ ] **Step 4: Verify no tests were owed and none broke**

Run: `npm test && npm run lint && npx vite build`
Expected: all clean. No tests are added in this task — every change is JSX or a translation string, and `vitest` here cannot render a component (see Global Constraints). Do NOT invent a test that asserts on a translation constant to have one.

- [ ] **Step 5: Commit**

```bash
git add src/landing/translations.ts src/landing/LandingView.tsx
git commit -m "fix(landing): badge clockless lots 'Be the first', not a current bid

The card hardcoded the current-bid label, so a zero-bid lot read 'Current bid
X JOD / 0 bids' — the exact mislabel bidLabels.priceLabel was added to fix on
the bidding surfaces. The ending-soon check now states its condition instead of
relying on NaN comparison."
```

---

### Task 3: Verify against real data

No code. This exists because nothing in Task 2 is render-testable here, and because the bug being fixed was invisible to the test suite for exactly that reason.

**Files:** none.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a verification report.

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run lint && npx vite build`
Paste the ACTUAL output into your report. Do not assert "tests pass" without it.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Note the port it prints — it will pick a free one if 3000 is taken.

- [ ] **Step 3: Confirm the empty state is gone**

Open the landing page and scroll to the marketplace section. Confirm, and record what you saw:
- Real lot cards render — NOT the "New auctions launch daily / Be one of the first sellers" empty state.
- Up to 8 cards (`DISPLAY_CAP`).
- Each shows an amber **Be the first** badge, not the orange **Ending soon** one, because no live lot currently has a running clock.
- Each price reads **Opening price**, not **Current bid**.

- [ ] **Step 4: Confirm Arabic**

Switch the page to Arabic. Confirm `كن أول مزايد` and `السعر الافتتاحي` render, that the badge sits on the correct (trailing) side under RTL, and that neither string wraps or clips inside the badge.

- [ ] **Step 5: Report**

Write up what you verified, what you could not, and anything that looked wrong. If fewer than 8 cards render, say how many and why — do not report a partial result as a full one.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 curation filter → `isLiveNow` alone | Task 1 step 5 |
| §2 ordering + `createdAt`/`featuredRank` fields | Task 1 steps 3-5 |
| §3 explicit clock check + Be-the-first badge | Task 2 steps 1-2 |
| §4 `priceLabel` on the card | Task 2 step 3 |
| §5 falsified `endTime` docblock rewritten | Task 1 step 3 |
| §Testing — pure curation cases | Task 1 step 1 |
| §Testing — manual pass | Task 3 |

Spec exclusions (sign-in redesign, `Fashion` category skew, query/cache/cap changes) have no task, by design.

**Placeholder scan:** no TBD/TODO, no "handle edge cases", no "similar to Task N". Every code step carries literal code.

**Type consistency:** `LandingAuction.createdAt: number | undefined` and `featuredRank: number | undefined` — declared Task 1 step 3, populated step 4, read by the comparator in step 5 and asserted in step 1's tests. `readMillis(val: any): number | undefined` — defined and used only in Task 1 step 4. `priceLabel(totalBids: number | undefined, isAr: boolean): string` — imported in Task 2 step 3, matching its real signature in `src/utils/bidLabels.ts`. `hasClock` — introduced in Task 2 step 2 and consumed by the badge block in the same step. `t.marketplace.beTheFirst` — added in Task 2 step 1, read in step 2.
