# Awaiting-First-Bid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop fabricating an end time for lots whose clock has not started, which revives the four dead `isAwaitingFirstBid()` call sites app-wide, and surface first-bid inventory in the All tab with working pagination.

**Architecture:** One pure predicate over raw Firestore doc data (`isAwaitingFirstBidDoc`) becomes the single source of truth for "this lot has no clock yet". `resolveEndTime()` consults it and returns `null` instead of `Date.now() + 3600000`; because all five mappers already delegate to `resolveEndTime`, that one change propagates to every surface. Separately, `useDiscoverFeed` grows a `firstBidItems` list — populated by a cursor-paged query on the Be the First chip, and by a `limit(8)` query on the All chip — so first-bid lots stop being invisible to `orderBy('endsAt')`.

**Tech Stack:** React 18 + TypeScript (Vite), Firebase Firestore v9 modular SDK, Tailwind, `framer-motion`, `vitest` (node environment only), `lucide-react` icons.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-02-awaiting-first-bid-design.md`. Read it before Task 1.
- **`vitest` is node-only.** No jsdom, no `@testing-library/react`. Never write a test that renders a component or touches `document`. Tests go against pure functions in `src/utils/`.
- **`tsc` is not a safety net.** The repo has no `@types/react` and no `strict` mode, so `.tsx` call sites are unchecked. `npm run lint` (`tsc --noEmit`) will catch `.ts` files only. Verify `.tsx` changes by reading them.
- **Bilingual copy is mandatory.** Every user-visible string needs an Arabic and an English form, selected via the existing `isAr` boolean. Never ship an English-only string.
- **RTL:** every directional Tailwind class needs its `rtl:` counterpart, matching the surrounding code (e.g. `right-2.5 rtl:right-auto rtl:left-2.5`).
- **Branch / workspace:** all work happens in the isolated worktree at
  `/Users/mj/code/mazzado/.claude/worktrees/awaiting-first-bid`, on branch
  `worktree-awaiting-first-bid` (branched from `origin/main`). Never `cd` to
  `/Users/mj/code/mazzado` itself and never switch branches there — a second
  Claude session is actively committing to `feat/global-language` in that
  checkout, and a branch switch under it would send its next edit to the wrong
  branch.
- **Run `npm test` before every commit.** The full suite, not a single file.
- **Never write to Firestore from the client** in this plan. All changes are read-path only.

---

### Task 1: The `isAwaitingFirstBidDoc` predicate

A pure predicate over **raw Firestore doc data** (snake-ish server field names like `endsAt`), as opposed to the existing `isAwaitingFirstBid`, which operates on an already-mapped `AuctionItem` (camel `endTime`). Both are needed: the raw one runs before mapping, the mapped one runs in components.

**Files:**
- Modify: `src/utils/auctionPhase.ts` (append after `isAwaitingFirstBid`, ends line 24)
- Test: `src/utils/auctionPhase.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: nothing.
- Produces: `isAwaitingFirstBidDoc(data: any): boolean` — exported from `src/utils/auctionPhase.ts`. Tasks 2 and 4 both import it.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/auctionPhase.test.ts`. Also add `isAwaitingFirstBidDoc` to the existing `import { … } from './auctionPhase';` on line 2.

```ts
describe('isAwaitingFirstBidDoc', () => {
  it('true for a live first_bid doc with no clock and no bids', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', totalBids: 0 })).toBe(true);
  });
  it('true when totalBids is absent entirely (never-bid doc)', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid' })).toBe(true);
  });
  it('false once a bid has landed', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', totalBids: 1 })).toBe(false);
  });
  it('false once the server has stamped endsAt', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', endsAt: { seconds: 5 }, totalBids: 0 })).toBe(false);
  });
  it('false when a legacy endTime is present', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'first_bid', endTime: 123, totalBids: 0 })).toBe(false);
  });
  it('false for scheduled lots, which always have a clock', () => {
    expect(isAwaitingFirstBidDoc({ startMode: 'scheduled', totalBids: 0 })).toBe(false);
    expect(isAwaitingFirstBidDoc({ totalBids: 0 })).toBe(false);
  });
  it('false for null/undefined input rather than throwing', () => {
    expect(isAwaitingFirstBidDoc(null)).toBe(false);
    expect(isAwaitingFirstBidDoc(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/utils/auctionPhase.test.ts`
Expected: FAIL — `isAwaitingFirstBidDoc is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/utils/auctionPhase.ts`:

```ts
/**
 * The RAW-DOC twin of `isAwaitingFirstBid`. Takes Firestore doc data (server
 * field names: `endsAt`, not the mapped `endTime`) so it can be consulted
 * BEFORE mapping — which is the only point where the absence of a clock is
 * still observable. `resolveEndTime` fabricates `now + 1h` for a doc with no
 * end field, so by the time an AuctionItem exists the state is unrecoverable.
 *
 * Checks both `endsAt` (what the server stamps on the first bid) and `endTime`
 * (the legacy field): either one present means the clock has started.
 */
export function isAwaitingFirstBidDoc(data: any): boolean {
  if (!data) return false;
  return (
    data.startMode === 'first_bid' &&
    !data.endsAt &&
    !data.endTime &&
    (data.totalBids || 0) === 0
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS — full suite green, including the 7 new cases.

- [ ] **Step 5: Commit**

```bash
git add src/utils/auctionPhase.ts src/utils/auctionPhase.test.ts
git commit -m "feat(auction): add isAwaitingFirstBidDoc, the raw-doc awaiting predicate"
```

---

### Task 2: Stop fabricating endTime, and guard the two sites that break

This is the task that revives `isAwaitingFirstBid()` at all four of its call sites. The two guards ship in the same commit because between them the app would miscount awaiting lots as completed.

**Files:**
- Modify: `src/utils/liveAuctionFields.ts:34-50` (`resolveEndTime`)
- Modify: `src/types.ts:109` (`AuctionItem.endTime`)
- Modify: `src/components/admin/OurDropsSection.tsx:240`
- Modify: `src/components/AuctionDetailsModal.tsx:111`
- Create: `src/utils/liveAuctionFields.test.ts`

**Interfaces:**
- Consumes: `isAwaitingFirstBidDoc(data: any): boolean` from Task 1.
- Produces: `resolveEndTime(data: any): number | null` — returns `null` only for awaiting-first-bid docs. `AuctionItem.endTime` becomes `number | null`. Task 4 relies on `mapFeedDoc` inheriting this.

- [ ] **Step 1: Write the failing test**

Create `src/utils/liveAuctionFields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveEndTime, mapLiveAuctionFields } from './liveAuctionFields';

describe('resolveEndTime', () => {
  it('returns null for an awaiting-first-bid doc instead of fabricating a clock', () => {
    expect(resolveEndTime({ startMode: 'first_bid', totalBids: 0 })).toBeNull();
  });

  it('prefers endsAt over endTime', () => {
    expect(resolveEndTime({ endsAt: 5000, endTime: 9000 })).toBe(5000);
  });

  it('falls back to endTime when endsAt is absent', () => {
    expect(resolveEndTime({ endTime: 9000 })).toBe(9000);
  });

  it('returns a real clock for a first_bid lot whose first bid already landed', () => {
    expect(resolveEndTime({ startMode: 'first_bid', totalBids: 1, endsAt: 7000 })).toBe(7000);
  });

  it('still fabricates for a SCHEDULED doc missing both fields (unchanged behaviour)', () => {
    const t = resolveEndTime({ startMode: 'scheduled' });
    expect(typeof t).toBe('number');
    expect(t as number).toBeGreaterThan(Date.now());
  });

  it('falls back to a future number when the value is unparseable', () => {
    const t = resolveEndTime({ endsAt: 'not-a-date' });
    expect(typeof t).toBe('number');
    expect(t as number).toBeGreaterThan(Date.now());
  });
});

describe('mapLiveAuctionFields', () => {
  it('carries the null endTime through so isAwaitingFirstBid can see it', () => {
    expect(mapLiveAuctionFields({ startMode: 'first_bid', totalBids: 0 }).endTime).toBeNull();
  });

  it('carries a real endTime through unchanged', () => {
    expect(mapLiveAuctionFields({ endsAt: 4242 }).endTime).toBe(4242);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/utils/liveAuctionFields.test.ts`
Expected: FAIL — the first case gets a fabricated number, not `null`.

- [ ] **Step 3: Change `resolveEndTime`**

In `src/utils/liveAuctionFields.ts`, add to the imports at the top of the file:

```ts
import { isAwaitingFirstBidDoc } from './auctionPhase';
```

Then replace the whole `resolveEndTime` function (lines 34-50, docblock included) with:

```ts
/**
 * Resolve a lot's end time (epoch millis) from a raw doc: prefer the `endsAt`
 * Timestamp (the field anti-snipe extensions write), fall back to `endTime`,
 * then to a safe default. Guards against a NaN parse.
 *
 * Returns `null` for an awaiting-first-bid lot. That lot genuinely HAS no end
 * time — the server stamps `endsAt = now + duration` on the first bid — and the
 * old `now + 1h` fallback here was indistinguishable from a real clock, which
 * made `isAwaitingFirstBid()` (it requires `!endTime`) return false at every
 * call site in the app. Callers must treat null as "no clock yet", not as zero.
 */
export function resolveEndTime(data: any): number | null {
  if (isAwaitingFirstBidDoc(data)) return null;
  let t = Date.now() + 3600000;
  if (data.endsAt) {
    t = parseAuctionTimestamp(data.endsAt);
  } else if (data.endTime) {
    t = parseAuctionTimestamp(data.endTime);
  }
  if (isNaN(t)) {
    t = Date.now() + 3600000;
  }
  return t;
}
```

- [ ] **Step 4: Widen the type**

In `src/types.ts`, replace line 109:

```ts
  endTime: number; // Unix timestamp
```

with:

```ts
  /**
   * Unix timestamp (epoch millis), or null for an awaiting-first-bid lot whose
   * clock has not started — see utils/auctionPhase.isAwaitingFirstBidDoc.
   * Callers doing arithmetic MUST guard: `null - now` is a large negative
   * number and `null < now` is true, both of which read as "already ended".
   */
  endTime: number | null;
```

- [ ] **Step 5: Guard `OurDropsSection`**

In `src/components/admin/OurDropsSection.tsx`, replace line 240:

```tsx
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && a.endTime < Date.now()));
```

with:

```tsx
                // `typeof === 'number'` before the comparison: an awaiting-first-bid
                // lot now carries endTime null, and `null < Date.now()` is true —
                // which would list a lot that has not started under COMPLETED.
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && typeof a.endTime === 'number' && a.endTime < Date.now()));
```

- [ ] **Step 6: Guard `AuctionDetailsModal`**

In `src/components/AuctionDetailsModal.tsx`, replace the effect body at lines 108-125 with:

```tsx
  useEffect(() => {
    if (!auction) return;
    // No clock yet (awaiting first bid): show the awaiting copy and start no
    // interval. Without this, `null - serverNow()` clamps to 0 and the modal
    // reads "Ended" on a lot that has not started.
    if (auction.endTime == null) {
      setTimeLeftStr(isAr ? 'بانتظار أول مزايدة' : 'Awaiting first bid');
      return;
    }
    const endsAtMs = auction.endTime;
    const interval = setInterval(() => {
      const remainingSecs = Math.max(0, Math.floor((endsAtMs - serverNow()) / 1000));
      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        setTimeLeftStr(isAr ? 'منتهي' : 'Ended');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [auction, isAr]);
```

- [ ] **Step 7: Re-run the null-safety enumeration**

Do not trust the spec's list — re-derive it, because Tasks 1-2 may have added sites.

Run: `grep -rn "\.endTime" src | grep -v "\.test\." | grep -vE "\.endTime\s*(\)|,|\}|\?|&&|\|\||;|$)"`

Read every hit. A hit is SAFE if the value is guarded by `typeof x.endTime === 'number'`, by a truthiness check (`if (!x.endTime) return`), or by an `== null` check. A hit is UNSAFE if it does arithmetic (`-`, `+`) or an ordering comparison (`<`, `>`, `<=`, `>=`) on an unguarded read. Expect the only remaining unsafe hits to be none. If you find one the spec did not list, fix it in this commit and note it in the commit body.

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test && npm run lint`
Expected: both PASS. `npm run lint` is `tsc --noEmit`; it checks `.ts` files, so any `.ts` consumer of `resolveEndTime` that cannot take `null` surfaces here.

- [ ] **Step 9: Commit**

```bash
git add src/utils/liveAuctionFields.ts src/utils/liveAuctionFields.test.ts src/types.ts src/components/admin/OurDropsSection.tsx src/components/AuctionDetailsModal.tsx
git commit -m "fix(auction): stop fabricating endTime for clockless lots

resolveEndTime returned now+1h for any doc missing endsAt/endTime — the exact
shape of an awaiting-first-bid lot. Since isAwaitingFirstBid() requires
!endTime, the helper returned false at all four of its call sites and the
E3 Slice A awaiting state has never rendered in production.

Returns null for those docs now, and guards the two sites where null reads
as 'already ended'."
```

---

### Task 3: The awaiting-first-bid card

The `⏳ Awaiting first bid` pill at `DiscoveryFeedView.tsx:184` needs no change — Task 2 is what makes its branch reachable. This task differentiates the badge and the CTA.

**Files:**
- Modify: `src/components/DiscoveryFeedView.tsx:161-177` (top-left badge stack)
- Modify: `src/components/DiscoveryFeedView.tsx:214-221` (hover CTA)

**Interfaces:**
- Consumes: `awaitingFirstBid` — already computed at `DiscoveryFeedView.tsx:108` via `isAwaitingFirstBid(d)`, live as of Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the LIVE badge for awaiting lots**

In `src/components/DiscoveryFeedView.tsx`, replace lines 162-167:

```tsx
          {d.status === 'live' && (
            <div className="bg-red-600 text-white font-extrabold px-2.5 py-1 rounded-full text-[9px] tracking-wide flex items-center gap-1 shadow-md">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
              <span>{isAr ? 'مباشر' : 'LIVE'}</span>
            </div>
          )}
```

with:

```tsx
          {/* Three distinct states share this corner. Red + pulse = a clock is
              running. Amber, no pulse = open for bids but the clock has not
              started (the first bid starts it). Brand orange #E85D04 is
              deliberately NOT used here — it is the CTA colour, so an orange
              badge would not read as a state. */}
          {d.status === 'live' && !awaitingFirstBid && (
            <div className="bg-red-600 text-white font-extrabold px-2.5 py-1 rounded-full text-[9px] tracking-wide flex items-center gap-1 shadow-md">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
              <span>{isAr ? 'مباشر' : 'LIVE'}</span>
            </div>
          )}
          {d.status === 'live' && awaitingFirstBid && (
            <div className="bg-amber-400 text-zinc-900 font-extrabold px-2.5 py-1 rounded-full text-[9px] tracking-wide flex items-center gap-1 shadow-md">
              <Zap className="w-2.5 h-2.5 fill-zinc-900" />
              <span>{isAr ? 'كن أول مزايد' : 'BE THE FIRST'}</span>
            </div>
          )}
```

- [ ] **Step 2: Confirm the `Zap` icon is already imported**

Run: `grep -n "Zap" src/components/DiscoveryFeedView.tsx | head -3`
Expected: a hit in the `lucide-react` import block (it is already used by the Be the First chip at `:380`). If it is missing, add `Zap` to that import.

- [ ] **Step 3: Change the hover CTA**

Replace lines 215-221:

```tsx
        {!itemIsEnded && (
          <div className="absolute inset-0 z-10 hidden lg:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="bg-[#E85D04]/95 backdrop-blur-xs text-white text-xs font-black px-4 py-2 rounded-full shadow-lg">
              {d.status === 'live' ? (isAr ? '🔴 دخول البث' : '🔴 Join live') : (isAr ? '⏱️ زايد الآن' : '⏱️ Bid now')}
            </span>
          </div>
        )}
```

with:

```tsx
        {!itemIsEnded && (
          <div className="absolute inset-0 z-10 hidden lg:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="bg-[#E85D04]/95 backdrop-blur-xs text-white text-xs font-black px-4 py-2 rounded-full shadow-lg">
              {awaitingFirstBid
                ? (isAr ? '⚡ كن أول مزايد' : '⚡ Be the first to bid')
                : d.status === 'live'
                  ? (isAr ? '🔴 دخول البث' : '🔴 Join live')
                  : (isAr ? '⏱️ زايد الآن' : '⏱️ Bid now')}
            </span>
          </div>
        )}
```

- [ ] **Step 4: Verify the memo comparator already handles the transition**

Read `areCardPropsEqual` at `src/components/DiscoveryFeedView.tsx:259-282`. Confirm it compares both `endTime` and `totalBids`. It does today — this step is a read, not an edit. If either is missing, add it, because the awaiting→live flip changes exactly those two fields and a stale card would keep the amber badge after the first bid lands.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run lint`
Expected: both PASS. No new tests here — `vitest` is node-only and cannot render this component (see Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add src/components/DiscoveryFeedView.tsx
git commit -m "feat(discover): distinct amber badge + CTA for awaiting-first-bid cards"
```

---

### Task 4: First-bid query — descriptor, pagination, and `firstBidItems`

**Files:**
- Modify: `src/utils/discoverQuery.ts` (append after `buildLiveFeedConstraints`, ends line 60)
- Modify: `src/utils/discoverQuery.test.ts` (append a `describe` block)
- Modify: `src/hooks/useDiscoverFeed.ts:44-55` (result interface), `:130-145` (query builder), `:221-289` (`loadPage1`), `:299-335` (`loadMore`), `:386-396` (return)

**Interfaces:**
- Consumes: `isAwaitingFirstBidDoc` (Task 1), `PAGE` from `discoverQuery`.
- Produces:
  - `buildFirstBidFeedConstraints({ cursor?, limit? }): FeedConstraints` from `src/utils/discoverQuery.ts`
  - `UseDiscoverFeedResult.firstBidItems: AuctionItem[]` — Task 5 renders this.
  - `ALL_TAB_FIRST_BID_LIMIT = 8`, exported from `src/utils/discoverQuery.ts`.

- [ ] **Step 1: Write the failing descriptor test**

Append to `src/utils/discoverQuery.test.ts`. Add `buildFirstBidFeedConstraints` and `ALL_TAB_FIRST_BID_LIMIT` to the existing import from `./discoverQuery`.

```ts
describe('buildFirstBidFeedConstraints', () => {
  it('filters to live first_bid lots ordered newest-first', () => {
    const c = buildFirstBidFeedConstraints({});
    expect(c.where).toEqual([
      ['status', '==', 'live'],
      ['startMode', '==', 'first_bid'],
    ]);
    expect(c.orderBy).toEqual([['createdAt', 'desc']]);
  });

  it('defaults to the full page size and no cursor', () => {
    const c = buildFirstBidFeedConstraints({});
    expect(c.limit).toBe(PAGE);
    expect(c.startAfter).toBeNull();
  });

  it('carries a cursor through for infinite scroll', () => {
    const cursor = { __cursor: true };
    expect(buildFirstBidFeedConstraints({ cursor }).startAfter).toBe(cursor);
  });

  it('accepts a smaller limit for the All-tab preview section', () => {
    expect(buildFirstBidFeedConstraints({ limit: ALL_TAB_FIRST_BID_LIMIT }).limit).toBe(8);
  });

  it('never adds a category clause — first-bid lots are not category-scoped', () => {
    const c = buildFirstBidFeedConstraints({});
    expect(c.where.some(([field]) => field === 'category')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/utils/discoverQuery.test.ts`
Expected: FAIL — `buildFirstBidFeedConstraints is not a function`.

- [ ] **Step 3: Write the descriptor**

Append to `src/utils/discoverQuery.ts`:

```ts
/**
 * How many first-bid lots the All tab previews before its "See all" link.
 * The Be the First chip is the paged view; All is a merchandising slot, so it
 * stays short enough not to bury the Upcoming section below it.
 */
export const ALL_TAB_FIRST_BID_LIMIT = 8;

/**
 * Build the constraint descriptor for the "Be the First" feed: LIVE `first_bid`
 * lots, newest first.
 *
 * These lots have NO `endsAt` until the first bid lands, and Firestore drops
 * docs that are missing the field an query orders by — so the ending-soon feed
 * (`orderBy('endsAt')`) cannot see them at all. That is why this is a separate
 * query rather than a filter on the live one.
 *
 * Deliberately un-scoped by category: a category clause would need a second
 * composite index, and the All tab plus the Be the First chip are the only two
 * surfaces that render these (see the spec's Scope section).
 *
 * Backed by the existing `(status ASC, startMode ASC, createdAt DESC)` index in
 * firestore.indexes.json — no new index, no deploy ordering concern.
 */
export function buildFirstBidFeedConstraints({
  cursor,
  limit,
}: {
  cursor?: unknown;
  limit?: number;
}): FeedConstraints {
  return {
    where: [
      ['status', '==', 'live'],
      ['startMode', '==', 'first_bid'],
    ],
    orderBy: [['createdAt', 'desc']],
    startAfter: cursor ?? null,
    limit: limit ?? PAGE,
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/utils/discoverQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the descriptor**

```bash
git add src/utils/discoverQuery.ts src/utils/discoverQuery.test.ts
git commit -m "feat(discover): pure descriptor for the paged first-bid query"
```

- [ ] **Step 6: Add `firstBidItems` to the hook's result interface**

In `src/hooks/useDiscoverFeed.ts`, add to `UseDiscoverFeedResult` (after `liveItems`, line 46):

```ts
  /**
   * Awaiting-first-bid lots. Populated in `first_bid` mode (the Be the First
   * chip — paginated, and `liveItems` stays empty) AND on the All chip (a
   * `limit(8)` preview, alongside a full `liveItems`). Empty under any specific
   * category chip: first-bid lots are not category-scoped (see the spec).
   */
  firstBidItems: AuctionItem[];
```

- [ ] **Step 7: Replace the query builder with a cursor-aware one**

Replace `buildFirstBidQuery` (lines 130-145, docblock included) with:

```ts
/**
 * Build the "Be the First" query: LIVE `first_bid` lots, newest first,
 * optionally cursor-paged and size-capped. These go live with NO `endsAt` until
 * the first bid lands, so the ending-soon feed (`orderBy('endsAt')`) excludes
 * them entirely — this dedicated query surfaces them. Ordering by `createdAt
 * desc` keeps a stable, index-backed shape; lots whose clock has since started
 * are dropped client-side via `isAwaitingFirstBidDoc`.
 *
 * Mirrors the pure `buildFirstBidFeedConstraints` descriptor, which is where
 * this shape is unit-tested.
 */
function buildFirstBidQuery(
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  pageSize: number = PAGE,
) {
  const constraints: QueryConstraint[] = [
    where('status', '==', 'live'),
    where('startMode', '==', 'first_bid'),
    orderBy('createdAt', 'desc'),
  ];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize));
  return query(collection(db, 'auctions'), ...constraints);
}

/**
 * Keep only lots still awaiting their first bid, and drop simulator data.
 *
 * Filters RAW doc data, not mapped items: `resolveEndTime` returns null only
 * because it consults the same predicate, so filtering here on the raw doc is
 * the authoritative check and stays correct regardless of mapping order.
 *
 * The `isSimulated` clause is parity with `isDisplayableLive`, not a live fix —
 * `simulateSpawnAuction` writes no `startMode`, so simulated docs already fail
 * this query's `where`. It exists so that stays true if the simulator ever
 * gains a first-bid option.
 */
function keepAwaitingFirstBid(docs: QueryDocumentSnapshot<DocumentData>[]): AuctionItem[] {
  return docs
    .filter((d) => {
      const x = d.data() as any;
      return isAwaitingFirstBidDoc(x) && x.isSimulated !== true;
    })
    .map(mapFeedDoc);
}
```

Add to the imports at the top of the file:

```ts
import { isAwaitingFirstBidDoc } from '../utils/auctionPhase';
```

- [ ] **Step 8: Add the `firstBidItems` state**

In `useDiscoverFeed`, after the `liveItems` state declaration (line 187), add:

```ts
  const [firstBidItems, setFirstBidItems] = useState<AuctionItem[]>([]);
```

- [ ] **Step 9: Rewrite the `first_bid` branch of `loadPage1`**

Replace the whole `if (feedMode === 'first_bid') { … }` block (lines 235-256) with:

```ts
      // "Be the First" mode: a dedicated paginated query for live first_bid
      // lots awaiting their first bid. No upcoming list, no new-drops detector,
      // category filtering ignored (see the effect/loadMore guards). Results
      // land in `firstBidItems` and `liveItems` stays EMPTY — which is what
      // keeps the "Live now" section header and the orange live-now strip (both
      // rendered off `liveItems`) from claiming these lots have a clock.
      if (feedMode === 'first_bid') {
        const fbSnap = await getDocs(buildFirstBidQuery(null));
        if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale
        cursorRef.current = fbSnap.docs[fbSnap.docs.length - 1] ?? null;
        // Keyed off the RAW page length, not the filtered count: a page whose
        // lots have all since received a first bid filters to empty but must
        // still advance the cursor. Same contract as the ending-soon feed.
        hasMoreLiveRef.current = fbSnap.docs.length === PAGE;
        setFirstBidItems(keepAwaitingFirstBid(fbSnap.docs));
        setLiveItems([]);
        setUpcomingItems([]);
        setHasMoreLive(fbSnap.docs.length === PAGE);
        setLoading(false);
        return;
      }
```

- [ ] **Step 10: Fetch the All-tab preview in the default branch**

In the default branch of `loadPage1`, replace the `Promise.all` at lines 258-261 with:

```ts
      // The All chip (no category clause) additionally previews first-bid lots,
      // which the ending-soon query structurally cannot return. Capped at the
      // query level rather than sliced client-side, so it costs 8 reads not 24.
      // Any specific category chip skips it: first-bid lots are not
      // category-scoped in this slice (see the spec's Scope section).
      const isAllChip = !categoryMatchesRef.current || categoryMatchesRef.current.length === 0;
      const [liveSnap, upSnap, fbSnap] = await Promise.all([
        getDocs(buildLiveQuery(categoryMatchesRef.current, null)),
        getDocs(buildUpcomingQuery()),
        isAllChip
          ? getDocs(buildFirstBidQuery(null, ALL_TAB_FIRST_BID_LIMIT))
          : Promise.resolve(null),
      ]);
```

Then, immediately after the existing stale check on the next line (`if (reqId !== reqIdRef.current || !mountedRef.current) return;`), and alongside the other `set*` calls near line 279, add:

```ts
      setFirstBidItems(fbSnap ? keepAwaitingFirstBid(fbSnap.docs) : []);
```

Update the import from `../utils/discoverQuery` (line 34) to include `ALL_TAB_FIRST_BID_LIMIT`.

- [ ] **Step 11: Make `loadMore` page the first-bid feed**

Replace lines 299-310 (from `const loadMore = useCallback(() => {` through the `if (mountedRef.current) setLoadingMore(true);`) with:

```ts
  const loadMore = useCallback(() => {
    if (!hasMoreLiveRef.current || loadingMoreRef.current) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    const reqId = reqIdRef.current; // guards against a category switch mid-flight

    loadingMoreRef.current = true;
    if (mountedRef.current) setLoadingMore(true);

    // "Be the First" pages its own query and appends to `firstBidItems`; every
    // other mode pages the ending-soon feed into `liveItems`.
    if (feedMode === 'first_bid') {
      getDocs(buildFirstBidQuery(cursor))
        .then((snap) => {
          if (reqId !== reqIdRef.current || !mountedRef.current) return; // stale
          cursorRef.current = snap.docs[snap.docs.length - 1] ?? cursorRef.current;
          hasMoreLiveRef.current = snap.docs.length === PAGE;
          const more = keepAwaitingFirstBid(snap.docs);
          setFirstBidItems((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            return [...prev, ...more.filter((a) => !seen.has(a.id))];
          });
          setHasMoreLive(snap.docs.length === PAGE);
          loadingMoreRef.current = false;
          setLoadingMore(false);
        })
        .catch((e) => {
          loadingMoreRef.current = false;
          if (reqId !== reqIdRef.current || !mountedRef.current) return;
          setError(e);
          setLoadingMore(false);
        });
      return;
    }
```

The existing `getDocs(buildLiveQuery(...))` chain that follows stays exactly as it is.

- [ ] **Step 12: Return `firstBidItems`**

In the hook's return object (line 386), add `firstBidItems,` after `liveItems,`.

- [ ] **Step 13: Run tests and typecheck**

Run: `npm test && npm run lint`
Expected: both PASS.

- [ ] **Step 14: Commit**

```bash
git add src/hooks/useDiscoverFeed.ts
git commit -m "feat(discover): paginate the first-bid feed and expose firstBidItems

Be the First was capped at one 24-doc page with loadMore() early-returning,
so any inventory past 24 was unreachable from every chip. Results now land in
their own firstBidItems list, which also stops the Live-now header and strip
from counting clockless lots."
```

---

### Task 5: Render the `⚡ Be the first` section

**Files:**
- Modify: `src/components/DiscoveryFeedView.tsx:417-432` (`paginatedLists` + derived lists), `:1021` (grid render condition), `:1060-1068` (new section + sentinel)

**Interfaces:**
- Consumes: `feed.firstBidItems` (Task 4), `selectedCategory` / `setSelectedCategory` (already in scope at `:348`).
- Produces: nothing.

- [ ] **Step 1: Derive the filtered list**

In `src/components/DiscoveryFeedView.tsx`, add to the `paginatedLists` memo return object (line 421-424):

```ts
      firstBidList: feed.firstBidItems.filter(matchesSearch),
```

and add `feed.firstBidItems` to that memo's dependency array (line 425).

Then, after `const upcomingList = paginatedLists.upcomingList;` (line 431), add:

```ts
  const firstBidList = paginatedLists.firstBidList;
```

- [ ] **Step 2: Let the grid render when only first-bid lots exist**

Replace the render condition at line 1021:

```tsx
        ) : (liveList.length > 0 || upcomingList.length > 0 || feed.hasMoreLive) ? (
```

with:

```tsx
        ) : (liveList.length > 0 || firstBidList.length > 0 || upcomingList.length > 0 || feed.hasMoreLive) ? (
```

Without this, the Be the First chip — where `liveItems` is now empty by design — would fall through to the empty state.

- [ ] **Step 3: Insert the section**

Insert between the closing `)}` of the live-now section (line 1060) and the infinite-scroll sentinel comment (line 1062):

```tsx
            {/* Awaiting-first-bid lots. Their own section rather than mixed into
                the grid above: they have no endsAt, so any position in an
                ending-soon ordering would be arbitrary. On the All chip this is
                a capped preview (see ALL_TAB_FIRST_BID_LIMIT) with a link to
                the full paged view; on the Be the First chip it IS the feed. */}
            {firstBidList.length > 0 && (
              <section id="be-the-first-section">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    {isAr ? 'كن أول مزايد' : 'Be the first'}
                  </h2>
                  <span className="text-[10px] font-mono font-black bg-amber-400 text-zinc-900 px-2 py-0.5 rounded-full">
                    {firstBidList.length}
                  </span>
                  {selectedCategory === 'All' && (
                    <button
                      onClick={() => setSelectedCategory('Be the First')}
                      className="ms-auto text-[11px] font-bold text-[#E85D04] hover:text-[#c94d03] transition-colors cursor-pointer"
                    >
                      {isAr ? 'عرض الكل ←' : 'See all →'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {firstBidList.map((item, index) => (
                    <div
                      key={item.id}
                      className="feed-card-in h-full"
                      style={{
                        animationDelay: `${
                          gridStaggerDone.current
                            ? 0
                            : Math.min((liveList.length + index) * 0.04, 0.32)
                        }s`,
                      }}
                    >
                      <PremiumAuctionCard
                        item={item}
                        currentUser={currentUser}
                        bids={bids}
                        orders={orders}
                        sellerProfiles={sellerProfiles}
                        isAr={isAr}
                        onJoinLive={handleJoinLive}
                        onSelectLot={setSelectedLotId}
                        setGlobalSelectedOrderId={setGlobalSelectedOrderId}
                        setActiveView={setActiveView}
                        liveEnabled={true}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
```

Note `ms-auto` (logical margin), not `ml-auto` — it flips correctly under RTL without an explicit `rtl:` override.

- [ ] **Step 4: Keep the infinite-scroll sentinel below the section**

The existing sentinel block at lines 1066-1068 renders on `feed.hasMoreLive`, which Task 4 now also sets in `first_bid` mode. Confirm by reading that it sits AFTER the new section in the JSX. If the section was inserted above it as instructed, no edit is needed — the observer fires when the user scrolls past the first-bid grid, which is the correct trigger point in both modes.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run lint`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/DiscoveryFeedView.tsx
git commit -m "feat(discover): Be the first section in All, between Live now and Upcoming"
```

---

### Task 6: Manual verification and the preview gate

No code. This task exists because `vitest` cannot render any of Tasks 3 and 5, and because Task 2 revived three call sites that have never run in production.

**Files:** none.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: a verification report, and MJ's approval to merge.

- [ ] **Step 1: Run the whole suite and typecheck one final time**

Run: `npm test && npm run lint`
Expected: both PASS. Paste the actual output into the report — do not assert "tests pass" without it.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Open `http://localhost:3000/discover`.

- [ ] **Step 3: Verify the Be the First chip**

Confirm each of these by looking, and record what you saw:
- Cards show an amber `⚡ BE THE FIRST` badge, no red pulsing `LIVE`.
- Cards show `⏳ Awaiting first bid`, no ticking countdown.
- The `🔥 LIVE NOW` section header is GONE.
- The orange `Live now — N auctions · Watch` strip is GONE.
- Scrolling past 24 lots loads more (only verifiable if more than 24 exist — if not, say so rather than claiming it works).

- [ ] **Step 4: Verify the All chip**

- A `⚡ Be the first` section renders between `🔥 Live now` and `📅 Upcoming drops`, with at most 8 cards.
- `See all →` switches to the Be the First chip.
- Live-now cards still show red `LIVE` and real ticking countdowns — Task 3 must not have changed them.

- [ ] **Step 5: Verify the two live rooms**

These branches have never rendered in production. Click into an awaiting-first-bid lot on desktop, then at a mobile viewport width. Confirm each room shows its awaiting-first-bid copy and no countdown, and that the bid CTA is still enabled — these lots accept bids, that is the entire point. Report anything that looks wrong rather than fixing it silently.

- [ ] **Step 6: Verify the admin guard**

Open the admin Our Drops section. Confirm no awaiting-first-bid lot appears under `RECENTLY COMPLETED AUCTIONS & FULFILLMENT`.

- [ ] **Step 7: Get MJ's preview approval**

Customer-facing visual change: MJ approves BEFORE merge, not after. Send him the Be the First view and the All view. Do not open a PR for merge until he has replied.

- [ ] **Step 8: Report**

Write up what was verified, what could not be verified and why (e.g. fewer than 24 first-bid lots in the environment, so pagination went untested), and anything that looked wrong. Be specific about the gap — an unverified item reported as verified is worse than an honest gap.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 mapper — `isAwaitingFirstBidDoc` | Task 1 |
| §1 mapper — `resolveEndTime` → null, type widening | Task 2 |
| §1 null-safety audit — the two guards + re-enumeration | Task 2 steps 5-7 |
| §2 card — amber badge, hover CTA, memo comparator | Task 3 |
| §2 card — preview gate | Task 6 step 7 |
| §3 All tab — capped section, See all, chip behaviour | Tasks 4-5 |
| §4 pagination — cursor, `loadMore`, raw-page-length `hasMore` | Task 4 steps 7, 9, 11 |
| §5 testing — pure helpers + manual pass | Tasks 1, 2, 4 + Task 6 |
| §6 isSimulated | Task 4 step 7 (`keepAwaitingFirstBid`) |

Known gaps (Algolia `startMode`) and the category chips are explicitly out of scope per the spec, and have no task by design.

**Placeholder scan:** no TBD/TODO, no "add error handling", no "similar to Task N". Every code step carries the literal code.

**Type consistency:** `isAwaitingFirstBidDoc(data: any): boolean` — defined Task 1, used Tasks 2 and 4. `resolveEndTime(data: any): number | null` — Task 2, relied on by Task 4's `mapFeedDoc`. `buildFirstBidFeedConstraints({cursor?, limit?})` and `ALL_TAB_FIRST_BID_LIMIT` — Task 4 step 3, used Task 4 step 10. `firstBidItems` — Task 4, consumed as `feed.firstBidItems` in Task 5. `firstBidList` — Task 5 only. `keepAwaitingFirstBid(docs)` — Task 4 step 7, used in steps 9, 10, 11. `buildFirstBidQuery(cursor, pageSize?)` — Task 4 step 7, called in steps 9, 10, 11 with matching arity.
