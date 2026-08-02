# Featured Lots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pin up to 6 live lots to the head of the Discover feed, and stop labelling a lot nobody has bid on as having a "current bid".

**Architecture:** A single `featuredRank` integer (1–6) on the auction doc. Pure array helpers compute the ranks, a batched Firestore writer commits them, a fourth query descriptor reads them, and the feed hook merges the result at the head of the list each lot already belongs to. No new feed section. The zero-bid copy fix is an independent pure helper consumed by four components.

**Tech Stack:** React 19, TypeScript (non-strict, no `@types/react`), Firestore, framer-motion 12.40 (`Reorder`), vitest 2.1 (node environment only).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-02-featured-lots-design.md`. Read it before Task 2.
- **Cap is 6**, exported as `FEATURED_CAP`. Never inline the literal.
- **`featuredRank` is absent, never `null`**, when a lot is not featured. Unpin uses `deleteField()`.
- **Ranks are contiguous 1..n** after every operation. No holes, no duplicates.
- **`isFeatured` is not touched.** The landing page must behave identically after this work.
- **vitest is node-only** — no jsdom, no testing-library. Components cannot be render-tested. Test pure helpers.
- **`tsc --noEmit` proves nothing about `.tsx` call sites** in this repo (no `@types/react`, non-strict). A clean lint is not verification.
- **All new copy is bilingual.** Arabic first in the ternary, matching every existing call site: `{isAr ? 'عربي' : 'English'}`.
- **The composite index deploys BEFORE the frontend that queries it** (Task 4 before Task 7).
- Commit after every task. Branch: `feat/display-order`.

---

### Task 1: Zero-bid price and CTA copy (#203)

A lot with `totalBids === 0` has no current bid — the first bid may legally equal the asking price (`functions/index.js:1789`, `src/utils/bidMath.ts:5`). Four components label that price "Current bid" anyway, which is what made a partner report correct bid math as broken.

**Files:**
- Create: `src/utils/bidLabels.ts`
- Create: `src/utils/bidLabels.test.ts`
- Modify: `src/components/MobileAuctionView.tsx:460` (price label), `:624` (CTA label)
- Modify: `src/components/DesktopLiveAuctionLayout.tsx:896`
- Modify: `src/components/ReelsDesktopRightPanel.tsx:144`
- Modify: `src/components/AuctionDetailsModal.tsx:278`

**Interfaces:**
- Produces: `priceLabel(totalBids: number | undefined, isAr: boolean): string` and `bidCtaLabel(totalBids: number | undefined, isAr: boolean): string` from `src/utils/bidLabels.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/bidLabels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { priceLabel, bidCtaLabel } from './bidLabels';

describe('priceLabel', () => {
  it('calls it an opening price when nobody has bid', () => {
    expect(priceLabel(0, false)).toBe('Opening price');
    expect(priceLabel(0, true)).toBe('السعر الافتتاحي');
  });

  it('calls it the current bid once a bid has landed', () => {
    expect(priceLabel(1, false)).toBe('Current bid');
    expect(priceLabel(9, true)).toBe('المزايدة الحالية');
  });

  // A doc that predates the counter, or one mid-write, must not claim a bid
  // exists. Absent is treated exactly like zero.
  it('treats a missing count as no bids', () => {
    expect(priceLabel(undefined, false)).toBe('Opening price');
  });
});

describe('bidCtaLabel', () => {
  it('invites the first bid when nobody has bid', () => {
    expect(bidCtaLabel(0, false)).toBe('Be the first to bid');
    expect(bidCtaLabel(0, true)).toBe('كن أول مزايد');
  });

  it('is a plain place-bid once bidding is open', () => {
    expect(bidCtaLabel(3, false)).toBe('Place Bid');
    expect(bidCtaLabel(3, true)).toBe('قدّم مزايدة');
  });

  it('treats a missing count as no bids', () => {
    expect(bidCtaLabel(undefined, true)).toBe('كن أول مزايد');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/bidLabels.test.ts`
Expected: FAIL — `Failed to resolve import "./bidLabels"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/bidLabels.ts`:

```ts
/**
 * Price and CTA copy for the bidding surfaces.
 *
 * A `first_bid` lot opens with `currentPrice === startingPrice` and
 * `totalBids === 0`, and the server deliberately allows the first bid to EQUAL
 * that price (functions/index.js bidPricing). Labelling it "Current bid" next to
 * "0 bids" made a correct opening bid read as a broken increment — the bid math
 * was never wrong, the label was.
 *
 * Absent counts are treated as zero: a doc mid-write or predating the counter
 * must not claim a bid that does not exist.
 */
export function priceLabel(totalBids: number | undefined, isAr: boolean): string {
  const bidded = (totalBids || 0) > 0;
  if (bidded) return isAr ? 'المزايدة الحالية' : 'Current bid';
  return isAr ? 'السعر الافتتاحي' : 'Opening price';
}

export function bidCtaLabel(totalBids: number | undefined, isAr: boolean): string {
  const bidded = (totalBids || 0) > 0;
  if (bidded) return isAr ? 'قدّم مزايدة' : 'Place Bid';
  // Matches the feed section copy in DiscoveryFeedView (`⚡ كن أول مزايد`) so the
  // card a visitor tapped and the screen it opens use the same words.
  return isAr ? 'كن أول مزايد' : 'Be the first to bid';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/bidLabels.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the four call sites**

`src/components/MobileAuctionView.tsx` — add `import { priceLabel, bidCtaLabel } from '../utils/bidLabels';` beside the existing `bidMath` import at `:16`. Replace the label at `:460`:

```tsx
{priceLabel(activeAuction?.totalBids, isAr)}
```

and the CTA text at `:624` — the guest branch at `:623` stays exactly as it is, only the signed-in branch changes:

```tsx
: bidCtaLabel(activeAuction?.totalBids, isAr)}
```

`src/components/DesktopLiveAuctionLayout.tsx:896` — same import, then:

```tsx
{priceLabel(activeAuction?.totalBids, isAr)}
```

`src/components/ReelsDesktopRightPanel.tsx:144` — this one is uppercase-styled via `uppercase` on the span, so pass the label through unchanged and let CSS do the casing:

```tsx
<span className="text-[8px] text-zinc-500 font-bold block uppercase">{priceLabel(currentItem.totalBids, isAr)}</span>
```

`src/components/AuctionDetailsModal.tsx:278`:

```tsx
<span className="text-gray-500 font-bold">{priceLabel(auction.totalBids, isAr)}</span>
```

Leave the `LEADING BIDDER` row directly below it alone — it already renders `No offers yet` / `لا مزايدات حتى الآن` correctly for a zero-bid lot.

- [ ] **Step 6: Verify no hardcoded label survives**

Run: `grep -rn "المزايدة الحالية\|Current bid\|Current Bid\|CURRENT PRICE\|CURRENT HIGH BID\|السعر الحالي\|العطاء الحالي\|السعر التجاري الحالي" src/components/`
Expected: no hits in the four modified components. Hits elsewhere (e.g. `translations.ts`) are fine and out of scope.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. No existing test asserts the old strings; if one does, it was asserting the bug — update it and say so in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/utils/bidLabels.ts src/utils/bidLabels.test.ts src/components/MobileAuctionView.tsx src/components/DesktopLiveAuctionLayout.tsx src/components/ReelsDesktopRightPanel.tsx src/components/AuctionDetailsModal.tsx
git commit -m "fix(bid): a lot nobody has bid on shows an opening price, not a current bid"
```

---

### Task 2: `featuredRank` pure helpers

All rank arithmetic lives here as array operations, so the writer and the UI never compute ranks themselves.

**Files:**
- Create: `src/utils/featuredRank.ts`
- Create: `src/utils/featuredRank.test.ts`

**Interfaces:**
- Produces: `FEATURED_CAP: 6`, `canPin(ids: string[]): boolean`, `pin(ids: string[], id: string): string[]`, `unpin(ids: string[], id: string): string[]`, `reorder(ids: string[], nextIds: string[]): string[]`, `ranksFor(ids: string[]): Record<string, number>`. Every function is pure and returns a NEW array; none mutate their input.

- [ ] **Step 1: Write the failing test**

Create `src/utils/featuredRank.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FEATURED_CAP, canPin, pin, unpin, reorder, ranksFor } from './featuredRank';

describe('FEATURED_CAP', () => {
  it('is 6', () => {
    expect(FEATURED_CAP).toBe(6);
  });
});

describe('canPin', () => {
  it('allows a pin below the cap', () => {
    expect(canPin([])).toBe(true);
    expect(canPin(['a', 'b', 'c', 'd', 'e'])).toBe(true);
  });

  it('refuses at the cap', () => {
    expect(canPin(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false);
  });
});

describe('pin', () => {
  it('appends to the end so an existing order is undisturbed', () => {
    expect(pin(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('refuses past the cap, returning the list unchanged', () => {
    const full = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(pin(full, 'g')).toEqual(full);
  });

  // Double-tap, or a second admin tab. Pinning twice must not create a
  // duplicate that would then claim two ranks.
  it('is idempotent for an already-pinned id', () => {
    expect(pin(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = ['a'];
    pin(input, 'b');
    expect(input).toEqual(['a']);
  });
});

describe('unpin', () => {
  it('removes the id and closes the gap', () => {
    expect(unpin(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('is a no-op for an unknown id', () => {
    expect(unpin(['a', 'b'], 'zz')).toEqual(['a', 'b']);
  });
});

describe('reorder', () => {
  it('accepts a permutation of the same set', () => {
    expect(reorder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  // A drag that races an unpin from another tab would otherwise write ranks for
  // a lot that is no longer featured, or drop one that still is.
  it('rejects a next list that is not the same set, keeping the current order', () => {
    expect(reorder(['a', 'b', 'c'], ['a', 'b'])).toEqual(['a', 'b', 'c']);
    expect(reorder(['a', 'b'], ['a', 'b', 'zz'])).toEqual(['a', 'b']);
  });
});

describe('ranksFor', () => {
  it('numbers from 1 contiguously', () => {
    expect(ranksFor(['x', 'y', 'z'])).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('is empty for an empty list', () => {
    expect(ranksFor([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/featuredRank.test.ts`
Expected: FAIL — `Failed to resolve import "./featuredRank"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/featuredRank.ts`:

```ts
/**
 * Pure rank arithmetic for admin-featured lots.
 *
 * The stored field is `featuredRank`: a contiguous integer 1..n, absent when a
 * lot is not featured. Every operation here works on an ORDERED ID LIST and the
 * writer converts that list to ranks via `ranksFor` — so no caller ever computes
 * a rank itself and ranks cannot develop holes or duplicates.
 *
 * Sparse integers rather than fractional/LexoRank keys: at a cap of 6 a reorder
 * rewrites at most 6 docs in one batch, and fractional keys exist to avoid
 * rewriting neighbours in long lists.
 */
export const FEATURED_CAP = 6;

export function canPin(ids: string[]): boolean {
  return ids.length < FEATURED_CAP;
}

export function pin(ids: string[], id: string): string[] {
  if (ids.includes(id)) return [...ids];
  if (!canPin(ids)) return [...ids];
  return [...ids, id];
}

export function unpin(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * Accepts `nextIds` only when it is a permutation of `ids`. A drag that races an
 * unpin in another tab would otherwise write ranks for a lot that is no longer
 * featured (or drop one that still is); rejecting keeps the current order and
 * lets the subscription reconcile.
 */
export function reorder(ids: string[], nextIds: string[]): string[] {
  const same =
    ids.length === nextIds.length &&
    new Set(nextIds).size === nextIds.length &&
    ids.every((x) => nextIds.includes(x));
  return same ? [...nextIds] : [...ids];
}

export function ranksFor(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    out[id] = i + 1;
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/featuredRank.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/featuredRank.ts src/utils/featuredRank.test.ts
git commit -m "feat(featured): pure rank arithmetic for admin-featured lots"
```

---

### Task 3: Feed query descriptor and merge helpers

**Files:**
- Modify: `src/utils/discoverQuery.ts` (append after `buildUpcomingFeedConstraints` at `:118`)
- Modify: `src/utils/discoverQuery.test.ts` (append)

**Interfaces:**
- Consumes: `FEATURED_CAP` from `src/utils/featuredRank.ts` (Task 2); `isAwaitingFirstBidDoc` from `src/utils/auctionPhase.ts`.
- Produces: `buildFeaturedFeedConstraints(): FeedConstraints` and `mergeFeatured(base: AuctionItem[], featured: AuctionItem[]): AuctionItem[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/discoverQuery.test.ts` (add `buildFeaturedFeedConstraints` and `mergeFeatured` to the existing import block at the top of the file):

```ts
describe('buildFeaturedFeedConstraints', () => {
  it('asks for live featured lots ordered by rank, capped', () => {
    expect(buildFeaturedFeedConstraints()).toEqual({
      where: [
        ['status', '==', 'live'],
        ['featuredRank', '>', 0],
      ],
      orderBy: [['featuredRank', 'asc']],
      startAfter: null,
      limit: 6,
    });
  });
});

describe('mergeFeatured', () => {
  const item = (id: string): AuctionItem => ({ id } as AuctionItem);

  it('puts featured lots at the head, in the order given', () => {
    expect(mergeFeatured([item('a'), item('b')], [item('z'), item('y')]).map((x) => x.id))
      .toEqual(['z', 'y', 'a', 'b']);
  });

  // The featured query and the page query are separate reads; a featured lot is
  // very likely to also be on page 1. It must appear once, at the top.
  it('drops the page copy of a lot that is already featured', () => {
    expect(mergeFeatured([item('a'), item('z')], [item('z')]).map((x) => x.id))
      .toEqual(['z', 'a']);
  });

  it('returns the base unchanged when nothing is featured', () => {
    expect(mergeFeatured([item('a')], []).map((x) => x.id)).toEqual(['a']);
  });

  it('does not mutate either input', () => {
    const base = [item('a')];
    const featured = [item('z')];
    mergeFeatured(base, featured);
    expect(base.map((x) => x.id)).toEqual(['a']);
    expect(featured.map((x) => x.id)).toEqual(['z']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/discoverQuery.test.ts`
Expected: FAIL — `buildFeaturedFeedConstraints is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/discoverQuery.ts`, and add `import { FEATURED_CAP } from './featuredRank';` at the top beside the `AuctionItem` import:

```ts
/**
 * Build the constraint descriptor for admin-featured lots.
 *
 * `featuredRank > 0` plus `orderBy('featuredRank')` deliberately relies on
 * Firestore excluding docs that lack the ordered field — an unfeatured lot has
 * no `featuredRank` at all, so it cannot appear. That is the same exclusion that
 * hid every first-bid lot from the live feed (#202); here it is the intent, and
 * it is why no backfill onto existing docs is needed.
 *
 * Needs the composite index (status ASC, featuredRank ASC), which must be
 * deployed BEFORE this query ships — a missing composite index fails the query
 * outright.
 *
 * Deliberately un-scoped by category, matching the first-bid feed: featuring is
 * an All/Be-the-First surface only.
 */
export function buildFeaturedFeedConstraints(): FeedConstraints {
  return {
    where: [
      ['status', '==', 'live'],
      ['featuredRank', '>', 0],
    ],
    orderBy: [['featuredRank', 'asc']],
    startAfter: null,
    limit: FEATURED_CAP,
  };
}

/**
 * Put featured lots at the head of a feed list, de-duplicated.
 *
 * The featured query and the page query are separate reads, so a featured lot is
 * usually ALSO in the page — it must render once, at the top. Featured order is
 * authoritative; the page keeps its own order below.
 */
export function mergeFeatured(base: AuctionItem[], featured: AuctionItem[]): AuctionItem[] {
  if (featured.length === 0) return base;
  const featuredIds = new Set(featured.map((x) => x.id));
  return [...featured, ...base.filter((x) => !featuredIds.has(x.id))];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/discoverQuery.test.ts`
Expected: PASS — the 4 new `mergeFeatured` cases and 1 new descriptor case, plus every pre-existing case in the file still green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/discoverQuery.ts src/utils/discoverQuery.test.ts
git commit -m "feat(featured): feed query descriptor and head-merge helper"
```

---

### Task 4: Firestore rules and composite index

Ships and DEPLOYS before any code queries or writes the field. The rule change is the security half: `featuredRank` is currently writable by a seller on their own in-review listing, and that value would survive admin approval straight to the top of the feed.

**Files:**
- Modify: `firestore.rules:133-171` (non-admin create branch), `:196-207` (creator update denylist)
- Modify: `firestore.indexes.json`

**Interfaces:**
- Produces: the `(status ASC, featuredRank ASC)` index that Task 3's descriptor requires and Task 7 queries against.

- [ ] **Step 1: Add the composite index**

In `firestore.indexes.json`, add to the `indexes` array, matching the formatting of the entries already there:

```json
{
  "collectionGroup": "auctions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "featuredRank", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 2: Close the seller self-featuring hole**

In `firestore.rules`, non-admin `allow create` branch — add beside the existing `soldByMazad` guard at `:167`:

```
// Featuring is a Mazad merchandising decision, not a seller's to make.
// Without this a seller could seed featuredRank at creation and the value
// would survive admin approval straight to the head of the feed.
(!('featuredRank' in request.resource.data)) &&
```

And in the creator `allow update` denylist at `:201-206`, add `'featuredRank'` to the `hasAny([...])` list — same reasoning, for the edit-while-in-review path.

- [ ] **Step 3: Constrain the value itself on the admin branch**

Still in `firestore.rules`, add a helper beside `auctionBidCount()` at `:110`:

```
// featuredRank is admin-only (enforced by the branches above) and must be a
// whole number inside the cap. The CAP ITSELF IS NOT ENFORCEABLE HERE — rules
// cannot count documents, so nothing stops an admin writing rank 1 on seven
// lots. The feed query's limit(6) bounds that: the failure mode is a confusing
// admin panel, not a broken feed.
//
// The 6 below duplicates FEATURED_CAP in src/utils/featuredRank.ts — rules
// cannot import TypeScript. Changing the cap means changing BOTH.
function featuredRankValid() {
  return !request.resource.data.diff(resource.data).affectedKeys().hasAny(['featuredRank'])
    || !('featuredRank' in request.resource.data)
    || (request.resource.data.featuredRank is int
        && request.resource.data.featuredRank >= 1
        && request.resource.data.featuredRank <= 6);
}
```

and extend the admin arm of `allow update` at `:196`:

```
(isAdmin() && !adminEditBlocked() && featuredRankValid()) ||
```

- [ ] **Step 4: Compile the rules**

Run: `firebase deploy --only firestore:rules --project mazadjoapp --dry-run`
Expected: compiles clean, no release published. A syntax error must be fixed here — CI uses the same compiler.

- [ ] **Step 5: Evaluate the rules against synthetic requests**

There is no emulator and no `@firebase/rules-unit-testing` in this repo (confirmed: neither is in `package.json`). Use the Firebase Rules test endpoint, which evaluates inline source and touches no data:

`POST https://firebaserules.googleapis.com/v1/projects/mazadjoapp:test` with the contents of `firestore.rules` as inline source.

Write the runner as a throwaway script in the scratch directory — **not committed**. Cover at minimum:

1. Admin sets `featuredRank: 1` on a `live` lot with 0 bids → ALLOW
2. Admin sets `featuredRank: 3` on a `live` lot **with** bids → ALLOW (not a money/timing key)
3. Admin sets `featuredRank: 0` → DENY
4. Admin sets `featuredRank: 7` → DENY
5. Admin sets `featuredRank: 2.5` → DENY
6. Admin deletes `featuredRank` → ALLOW
7. Creator (non-admin) sets `featuredRank: 1` on their own `processing` listing → DENY
8. Creator sets `featuredRank: 1` on their own `rejected` listing → DENY
9. Non-admin **creates** a `processing` listing carrying `featuredRank: 1` → DENY
10. Non-admin creates a `processing` listing with no `featuredRank` → ALLOW (regression guard: the new create guard must not break normal listing creation)

**Run cases 7, 8 and 9 against the pre-change rules as a control** (`git show HEAD:firestore.rules`). They must flip from ALLOW to DENY. If a verdict does not flip, the endpoint is not evaluating the source you passed and the whole run is meaningless.

Record the verdict table in the commit message.

- [ ] **Step 6: Deploy the index and the rules**

Run: `firebase deploy --only firestore:indexes,firestore:rules --project mazadjoapp`
Expected: index build starts. **Wait for it to report `READY`** before Task 7 ships a query against it.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(featured): admin-only featuredRank, and the index the feed reads it by"
```

---

### Task 5: Firestore writer

**Files:**
- Create: `src/services/featuredService.ts`
- Create: `src/services/featuredService.test.ts`

**Interfaces:**
- Consumes: `ranksFor` from `src/utils/featuredRank.ts` (Task 2).
- Produces: `featuredWrites(prevIds: string[], nextIds: string[]): FeaturedWrite[]` where `FeaturedWrite = { id: string; rank: number | null }` (`null` means delete the field), and `commitFeaturedOrder(db: Firestore, prevIds: string[], nextIds: string[]): Promise<void>`.

The pure `featuredWrites` is what gets tested; `commitFeaturedOrder` is the thin Firestore shell around it, following the same split the repo already uses for query descriptors.

- [ ] **Step 1: Write the failing test**

Create `src/services/featuredService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { featuredWrites } from './featuredService';

describe('featuredWrites', () => {
  it('writes a rank for each lot in the new order', () => {
    expect(featuredWrites([], ['a', 'b'])).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: 2 },
    ]);
  });

  it('deletes the field for a lot that was dropped', () => {
    expect(featuredWrites(['a', 'b'], ['a'])).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: null },
    ]);
  });

  // The point of rewriting every survivor rather than only the moved one: after
  // an unpin the remaining ranks must close up to 1..n with no holes.
  it('compacts survivors after a removal from the middle', () => {
    expect(featuredWrites(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { id: 'a', rank: 1 },
      { id: 'c', rank: 2 },
      { id: 'b', rank: null },
    ]);
  });

  it('rewrites every rank on a reorder', () => {
    expect(featuredWrites(['a', 'b'], ['b', 'a'])).toEqual([
      { id: 'b', rank: 1 },
      { id: 'a', rank: 2 },
    ]);
  });

  it('emits nothing when the order is unchanged and nothing was dropped', () => {
    expect(featuredWrites(['a'], ['a'])).toEqual([{ id: 'a', rank: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/featuredService.test.ts`
Expected: FAIL — `Failed to resolve import "./featuredService"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/featuredService.ts`:

```ts
import { deleteField, doc, writeBatch, type Firestore } from 'firebase/firestore';
import { ranksFor } from '../utils/featuredRank';

/** One doc's worth of pending change. `rank: null` means delete the field. */
export interface FeaturedWrite {
  id: string;
  rank: number | null;
}

/**
 * The writes that take the featured set from `prevIds` to `nextIds`.
 *
 * EVERY survivor is rewritten, not just the lot that moved: after an unpin the
 * remaining ranks must compact to a contiguous 1..n, and a partial write would
 * leave holes that make the next reorder ambiguous. At a cap of 6 the whole set
 * is at most 6 docs, which is one batch.
 */
export function featuredWrites(prevIds: string[], nextIds: string[]): FeaturedWrite[] {
  const ranks = ranksFor(nextIds);
  const writes: FeaturedWrite[] = nextIds.map((id) => ({ id, rank: ranks[id] }));
  const kept = new Set(nextIds);
  for (const id of prevIds) {
    if (!kept.has(id)) writes.push({ id, rank: null });
  }
  return writes;
}

/**
 * Commit the whole transition atomically. Atomic matters: a half-applied
 * reorder would let the feed observe two lots claiming the same rank, and the
 * order of two equal ranks is undefined.
 */
export async function commitFeaturedOrder(
  db: Firestore,
  prevIds: string[],
  nextIds: string[],
): Promise<void> {
  const writes = featuredWrites(prevIds, nextIds);
  if (writes.length === 0) return;
  const batch = writeBatch(db);
  for (const w of writes) {
    batch.update(doc(db, 'auctions', w.id), {
      featuredRank: w.rank === null ? deleteField() : w.rank,
    });
  }
  await batch.commit();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/featuredService.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/featuredService.ts src/services/featuredService.test.ts
git commit -m "feat(featured): batched writer that keeps ranks contiguous"
```

---

### Task 6: Admin featured panel

**Files:**
- Create: `src/components/admin/FeaturedSection.tsx`
- Modify: `src/components/AdminDashboardView.tsx` (render the section alongside the existing ones)

**Interfaces:**
- Consumes: `FEATURED_CAP`, `canPin`, `pin`, `unpin`, `reorder` (Task 2); `commitFeaturedOrder` (Task 5); `useAdminAuctionSearch` from `src/hooks/useAdminAuctionSearch.ts`.
- Props: `{ auctions: AuctionItem[]; isAr: boolean }` — `auctions` is the existing admin array already threaded into the other sections from `AdminDashboardView`.

No unit test: this is a component, and vitest here is node-only with no jsdom. Every decision it makes is delegated to the helpers tested in Tasks 2 and 5; the component only wires them. Verified manually in Task 8.

- [ ] **Step 1: Build the section**

Create `src/components/admin/FeaturedSection.tsx`. Requirements, all load-bearing:

- Derive the current featured list from the `auctions` prop: filter to those with a numeric `featuredRank`, sort ascending by it, map to ids. **Never hold the order in local state as the source of truth** — the auctions subscription is authoritative and reconciles after every write.
- Render the pinned lots with `Reorder.Group` / `Reorder.Item` from `framer-motion` (already installed; import from `'framer-motion'`). `onReorder` calls `reorder(currentIds, nextIds)` then `commitFeaturedOrder(db, currentIds, nextIds)`.
- Transition uses a bezier ease-out, **not a spring**: `transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}`.
- The list renders at most 6 rows and **must not introduce its own scroll container** — `DesktopFrame` is `overflow-hidden` and a nested scroller is what breaks touch drag on mobile.
- Each row: thumbnail, title, a drag affordance, and an unpin button calling `unpin` + `commitFeaturedOrder`.
- Pin picker: a search input wired to `useAdminAuctionSearch`, results rendered with a "Pin" button per row. The picker exists because the admin auctions subscription is capped at `limit(100)` against 241 production auctions (`AppContext.tsx:1576`) — browsing cannot reach most lots, searching can.
- When `!canPin(currentIds)`, disable every Pin button and show `{isAr ? 'وصلت الحد: ٦ مزادات' : 'Cap reached — 6 lots'}`. This is where the cap is enforced; rules cannot count docs.
- Writes are optimistic: paint the new order immediately, and on a rejected batch revert to the subscription's order and surface the error inline.
- Section heading: `{isAr ? 'المزادات المميزة' : 'Featured lots'}` with a `{currentIds.length}/{FEATURED_CAP}` counter.

The `Reorder` wiring is the only unfamiliar API here; the rest is ordinary JSX in the style of the sibling sections. Skeleton:

```tsx
import { Reorder } from 'framer-motion';
import { FEATURED_CAP, canPin, pin, unpin, reorder } from '../../utils/featuredRank';
import { commitFeaturedOrder } from '../../services/featuredService';
import { db } from '../../services/firebase';

// Derived from the subscription every render — NOT local state. A write that
// fails simply never changes this, which is the revert.
const featured = React.useMemo(
  () => auctions
    .filter((a: any) => typeof a.featuredRank === 'number')
    .sort((a: any, b: any) => a.featuredRank - b.featuredRank),
  [auctions],
);
const currentIds = featured.map((a: any) => a.id);

// `pending` holds the dragged order for the moment between drop and the
// subscription catching up, so the row does not snap back mid-write.
const [pending, setPending] = React.useState<string[] | null>(null);
const shown = pending ?? currentIds;

const applyOrder = async (nextIds: string[]) => {
  const next = reorder(currentIds, nextIds);
  setPending(next);
  try {
    await commitFeaturedOrder(db, currentIds, next);
  } catch (e: any) {
    setError(e?.message || 'Write failed');
  } finally {
    setPending(null);
  }
};

<Reorder.Group axis="y" values={shown} onReorder={applyOrder} className="space-y-2">
  {shown.map((id: string) => {
    const lot = featured.find((a: any) => a.id === id);
    if (!lot) return null;
    return (
      <Reorder.Item
        key={id}
        value={id}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl p-2.5 cursor-grab active:cursor-grabbing"
      >
        {/* thumbnail, title, and an unpin button calling
            applyOrder(unpin(currentIds, id)) */}
      </Reorder.Item>
    );
  })}
</Reorder.Group>
```

Pinning from the picker is the same path: `applyOrder(pin(currentIds, hit.objectID))`, guarded by `canPin(currentIds)`.

- [ ] **Step 2: Wire it into the dashboard**

In `src/components/AdminDashboardView.tsx`, render `<FeaturedSection auctions={auctions} isAr={isAr} />` alongside the existing sections, following exactly how `OurDropsSection` receives its props there.

- [ ] **Step 3: Typecheck and test**

Run: `npm run lint && npm test`
Expected: both PASS. Remember this repo has no `@types/react` and is non-strict — a clean `tsc` says nothing about whether the JSX call sites are right. Task 8 is the real check.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/FeaturedSection.tsx src/components/AdminDashboardView.tsx
git commit -m "feat(admin): pin, reorder and unpin featured lots"
```

---

### Task 7: Feed integration

Ships only after Task 4's index reports `READY`.

**Files:**
- Modify: `src/hooks/useDiscoverFeed.ts`

**Interfaces:**
- Consumes: `buildFeaturedFeedConstraints`, `mergeFeatured` (Task 3); `isAwaitingFirstBidDoc` from `src/utils/auctionPhase.ts` (already imported at `:37`).

- [ ] **Step 1: Add the query builder**

Beside the existing `buildFirstBidQuery` / `buildLiveQuery` helpers, add a `buildFeaturedQuery()` that translates `buildFeaturedFeedConstraints()` into real constraints, exactly as its neighbours translate theirs.

- [ ] **Step 2: Fetch and split**

In the page-1 load, add `getDocs(buildFeaturedQuery())` to the existing parallel fetch (`:307`). Split the result by doc shape, **not by which section is on screen**:

```ts
// Which list a featured lot joins is decided by the doc, using the same
// predicate the first-bid feed filters on — so a featured lot lands in exactly
// one list, never both and never neither. isSimulated is excluded to match
// keepAwaitingFirstBid; the feed's two entry points must not disagree about
// whether a simulated lot is visible.
const featuredDocs = featSnap.docs.filter((d) => d.data().isSimulated !== true);
const featuredAwaiting = featuredDocs.filter((d) => isAwaitingFirstBidDoc(d.data())).map(mapFeedDoc);
const featuredLive = featuredDocs.filter((d) => !isAwaitingFirstBidDoc(d.data())).map(mapFeedDoc);
```

- [ ] **Step 3: Merge at the head of each list**

Apply `mergeFeatured(liveItems, featuredLive)` and `mergeFeatured(firstBidItems, featuredAwaiting)` when setting page-1 state.

**Only on page 1, and only when no category is selected.** `loadMore` must NOT re-merge — a featured lot already sits at the head of the list, and merging again on every page would move it or duplicate it. On a category chip, skip the merge entirely: featuring is an `All` / `Be the First` surface per the spec.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS, including every pre-existing `useDiscoverFeed` and `discoverQuery` test.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDiscoverFeed.ts
git commit -m "feat(featured): featured lots lead the section they already belong to"
```

---

### Task 8: Manual verification and preview gate

Nothing here is optional. vitest cannot render a component in this repo, so this task is the only coverage the UI gets.

- [ ] **Step 1: Full suite and typecheck**

Run: `npm test && npm run lint`
Expected: both PASS.

- [ ] **Step 2: Admin panel, desktop**

Pin 3 lots via search, drag to reorder, unpin the middle one. Confirm in the Firebase console that the survivors hold ranks 1 and 2 — **no holes**. Pin up to 6 and confirm the 7th Pin button is disabled.

- [ ] **Step 3: Admin panel, touch**

Repeat the drag on a real mobile viewport. The list must reorder without the page scrolling underneath it — this is the `DesktopFrame` `overflow-hidden` trap.

- [ ] **Step 4: Feed**

With a mix pinned — at least one awaiting-first-bid lot and one clock-running lot — load `/discover`:

- the first-bid lot heads `Be the first`, the live one heads `LIVE NOW`
- neither appears twice on the page
- a category chip shows NO featured treatment
- scrolling to page 2 does not move or duplicate a featured card

- [ ] **Step 5: Confirm the landing page did not change**

Load the landing page with lots pinned. Its ordering must be **identical** to before — `isFeatured` is untouched and no pinned lot may float there. If anything moved, stop: the deferred landing coupling has leaked.

- [ ] **Step 6: MJ's preview pass**

`/discover` is customer-facing and this changes what leads the feed. Send MJ the preview and **wait for explicit approval before merge**, per the standing preview gate.

- [ ] **Step 7: Final commit**

```bash
git commit --allow-empty -m "chore(featured): manual verification pass complete"
```
