# E7 — Two-Way Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sellers can rate buyers after a completed order; both directions feed a real reputation computed from the `reviews` collection; buyer reputation (never shown before) is surfaced to the seller + a buyer badge, via a shared StarRating.

**Architecture:** A `rateBuyer` callable (seller-only, post-completion, one-per-order) writes a `seller_rates_buyer` review — no money. Pure aggregation helpers compute buyer/seller reputation over `reviews`. A shared `StarRating` renders input + read modes. New display surfaces show buyer rep to sellers (not during live bidding) and make seller rep reflect real buyer ratings.

**Tech Stack:** React 19 + Vite + TS + Firebase (Functions CommonJS, Firestore), Vitest.

## Global Constraints
- Ratings NEVER touch money — `rateBuyer` makes zero wallet/ledger/escrow writes.
- `functions/ratings.js` + `src/utils/reputation.ts` are pure (no firebase imports).
- Test globs: `src/**/*.test.ts(x)`, `functions/**/*.test.js`. Functions tests need `import { describe, it, expect } from 'vitest'`.
- Stars: integer 1–5. Comment optional, ≤500 chars. Seller rates only after `status==='completed'`, one per order.
- Buyer reputation is NOT shown in the live-auction/bidding UI.
- Arabic-primary; bilingual UI; smooth ease-out motion.
- Worktree `/tmp/mazzado-e7`, branch `feat/e7-ratings` (off E6-inclusive main; spec committed).

---

## Slice A — Seller → buyer rating

### Task A1: pure rating helpers
**Files:** Create `functions/ratings.js`, `functions/ratings.test.js`.
**Interfaces:** `buildBuyerRating({stars, comment}, nowMs)` → `{stars, text, createdAt}` or throws `Error` w/ `code:'invalid-argument'`; `canSellerRateOrder(order, sellerId, existingSellerRating)` → boolean.

- [ ] **Step 1: failing test** — `functions/ratings.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { buildBuyerRating, canSellerRateOrder } = require('./ratings');

describe('buildBuyerRating', () => {
  it('accepts 1–5 stars + optional comment', () => {
    expect(buildBuyerRating({ stars: 5, comment: ' great ' }, 10))
      .toEqual({ stars: 5, text: 'great', createdAt: 10 });
    expect(buildBuyerRating({ stars: 3 }, 1)).toEqual({ stars: 3, text: '', createdAt: 1 });
  });
  it('rejects out-of-range / non-integer stars', () => {
    expect(() => buildBuyerRating({ stars: 0 }, 1)).toThrow(/star/i);
    expect(() => buildBuyerRating({ stars: 6 }, 1)).toThrow(/star/i);
    expect(() => buildBuyerRating({ stars: 4.5 }, 1)).toThrow(/star/i);
  });
  it('rejects a comment over 500 chars', () => {
    expect(() => buildBuyerRating({ stars: 5, comment: 'x'.repeat(501) }, 1)).toThrow(/comment/i);
  });
});

describe('canSellerRateOrder', () => {
  const order = { status: 'completed', sellerId: 's1' };
  it('true for completed order by its seller with no prior rating', () => {
    expect(canSellerRateOrder(order, 's1', null)).toBe(true);
  });
  it('false when not the seller', () => {
    expect(canSellerRateOrder(order, 's2', null)).toBe(false);
  });
  it('false when not completed', () => {
    expect(canSellerRateOrder({ ...order, status: 'shipped' }, 's1', null)).toBe(false);
  });
  it('false when already rated', () => {
    expect(canSellerRateOrder(order, 's1', { id: 'r1' })).toBe(false);
  });
  it('false on null order', () => { expect(canSellerRateOrder(null, 's1', null)).toBe(false); });
});
```
- [ ] **Step 2: red** — `cd /tmp/mazzado-e7 && npx vitest run functions/ratings.test.js` → FAIL.
- [ ] **Step 3: implement** — `functions/ratings.js`:
```js
'use strict';
// Pure rating helpers. NO firebase deps (root Vitest loads this; #138).
function invalid(msg) { const e = new Error(msg); e.code = 'invalid-argument'; return e; }

function buildBuyerRating(input, nowMs) {
  const stars = Number(input && input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw invalid('stars must be an integer 1–5');
  const text = String((input && input.comment) || '').trim();
  if (text.length > 500) throw invalid('comment must be ≤ 500 characters');
  return { stars, text, createdAt: nowMs };
}

function canSellerRateOrder(order, sellerId, existingSellerRating) {
  if (!order || order.status !== 'completed') return false;
  if (!sellerId || order.sellerId !== sellerId) return false;
  if (existingSellerRating) return false;
  return true;
}

module.exports = { buildBuyerRating, canSellerRateOrder };
```
- [ ] **Step 4: green** — `npx vitest run functions/ratings.test.js` → PASS.
- [ ] **Step 5: commit** — `git add functions/ratings.js functions/ratings.test.js && git commit -m "feat(ratings): pure buildBuyerRating/canSellerRateOrder helpers"`

---

### Task A2: `rateBuyer` callable
**Files:** Modify `functions/index.js` (add `require('./ratings')`; add `exports.rateBuyer`).
**Interfaces:** Consumes `buildBuyerRating`, `canSellerRateOrder` (A1). Callable `rateBuyer({orderId, stars, comment})`.

- [ ] **Step 1: add require** near other requires: `const { buildBuyerRating, canSellerRateOrder } = require('./ratings');`
- [ ] **Step 2: implement** `exports.rateBuyer` — mirror the auth/transaction style of the existing E6 `respondToReturn` callable:
  - Require `context.auth`; load `orders/{orderId}`; caller MUST be `orderData.sellerId` (else `HttpsError('permission-denied')`).
  - In a transaction: re-read the order; query `reviews where orderId==X and direction=='seller_rates_buyer'` (or track a flag) — if one exists, `HttpsError('failed-precondition','already rated')`. Guard `canSellerRateOrder(orderData, callerUid, existing)`.
  - Build via `buildBuyerRating({stars, comment}, Date.now())` (catch → `HttpsError('invalid-argument', e.message)`).
  - Write ONE new `reviews` doc: `{ orderId, auctionId: orderData.auctionId, buyerId: orderData.buyerId, sellerId: orderData.sellerId, ratedBy: orderData.sellerId, stars, text, direction:'seller_rates_buyer', createdAt: serverTimestamp() }`. **NO wallet/ledger/escrow writes.** No notification.
  - (Reads-before-writes; the existence query makes it idempotent against double-submit.)
- [ ] **Step 3: verify** — `node -c functions/index.js`; `npx vitest run` (suite still green). Grep the callable body: no `wallets`/`ledger`/`escrow` writes.
- [ ] **Step 4: commit** — `git add functions/index.js && git commit -m "feat(ratings): rateBuyer callable (seller->buyer, no money)"`

---

### Task A3: seller rating UI + types + wrapper
**Files:** Modify `src/types.ts` (add `'seller_rates_buyer'` to the `OrderReview.direction` union), `src/context/AppContext.tsx` (`rateBuyer` wrapper), the seller order surface (`src/components/OrderDetailsView.tsx` seller block and/or `SellerCenterView.tsx`).
**Interfaces:** `AppContext.rateBuyer(orderId, {stars, comment})` → httpsCallable.

- [ ] **Step 1: types** — add `| 'seller_rates_buyer'` to `OrderReview.direction` in `src/types.ts`.
- [ ] **Step 2: wrapper** — add `rateBuyer` in AppContext calling `httpsCallable(functions,'rateBuyer')`, exposed on the value + type (mirror the E6 `respondToReturn`/`requestReturn` wrappers).
- [ ] **Step 3: seller UI** — on a `completed` order in the seller's view, show a "Rate the buyer" prompt: a star input (use the shared `StarRating` from B2 in input mode — if B2 not yet built, a minimal inline star input is acceptable and can be swapped) + optional comment (≤500) → `rateBuyer`. Once a `seller_rates_buyer` review exists for the order, render it read-only. Bilingual; ease-out.
- [ ] **Step 4: verify** — `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run` green.
- [ ] **Step 5: commit** — `git add -A && git commit -m "feat(ratings): seller rates buyer UI + types + wrapper"`

---

## Slice B — Reputation aggregation + display

### Task B1: pure reputation helpers
**Files:** Create `src/utils/reputation.ts`, `src/utils/reputation.test.ts`.
**Interfaces:** `computeReputation(reviews, {subjectField, subjectId, directions}) → {average: number|null, count: number}`; `buyerReputation(reviews, buyerId, opts?)`; `sellerReputation(reviews, sellerId)`.

- [ ] **Step 1: failing test** — `src/utils/reputation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeReputation, buyerReputation, sellerReputation } from './reputation';

const R = [
  { direction: 'seller_rates_buyer', buyerId: 'b1', stars: 5 },
  { direction: 'seller_rates_buyer', buyerId: 'b1', stars: 3 },
  { direction: 'mazad_rates_buyer',  buyerId: 'b1', stars: 1 },
  { direction: 'buyer_rates_auction', vendorId: 's1', stars: 4 },
  { direction: 'buyer_rates_auction', vendorId: 's1', stars: 2 },
];

describe('buyerReputation', () => {
  it('averages seller_rates_buyer for the buyer (excludes admin by default)', () => {
    expect(buyerReputation(R, 'b1')).toEqual({ average: 4, count: 2 });
  });
  it('can include mazad_rates_buyer', () => {
    expect(buyerReputation(R, 'b1', { includeAdmin: true })).toEqual({ average: 3, count: 3 });
  });
  it('empty for an unrated buyer', () => {
    expect(buyerReputation(R, 'bX')).toEqual({ average: null, count: 0 });
  });
});

describe('sellerReputation', () => {
  it('averages buyer_rates_auction by vendorId', () => {
    expect(sellerReputation(R, 's1')).toEqual({ average: 3, count: 2 });
  });
});
```
- [ ] **Step 2: red** — `npx vitest run src/utils/reputation.test.ts` → FAIL.
- [ ] **Step 3: implement** — `src/utils/reputation.ts`:
```ts
export interface Reputation { average: number | null; count: number; }
interface AnyReview { direction?: string; stars?: number; buyerId?: string; vendorId?: string; }

export function computeReputation(
  reviews: AnyReview[] | null | undefined,
  opts: { subjectField: 'buyerId' | 'vendorId'; subjectId: string; directions: string[] },
): Reputation {
  const rows = (reviews || []).filter(
    (r) => r && opts.directions.includes(r.direction || '') &&
      (r as any)[opts.subjectField] === opts.subjectId &&
      Number.isFinite(Number(r.stars)),
  );
  if (rows.length === 0) return { average: null, count: 0 };
  const sum = rows.reduce((a, r) => a + Number(r.stars), 0);
  return { average: sum / rows.length, count: rows.length };
}

export function buyerReputation(
  reviews: AnyReview[] | null | undefined, buyerId: string, opts?: { includeAdmin?: boolean },
): Reputation {
  const directions = opts?.includeAdmin
    ? ['seller_rates_buyer', 'mazad_rates_buyer'] : ['seller_rates_buyer'];
  return computeReputation(reviews, { subjectField: 'buyerId', subjectId: buyerId, directions });
}

export function sellerReputation(reviews: AnyReview[] | null | undefined, sellerId: string): Reputation {
  return computeReputation(reviews, { subjectField: 'vendorId', subjectId: sellerId, directions: ['buyer_rates_auction'] });
}
```
- [ ] **Step 4: green** — `npx vitest run src/utils/reputation.test.ts` → PASS.
- [ ] **Step 5: commit** — `git add src/utils/reputation.ts src/utils/reputation.test.ts && git commit -m "feat(ratings): pure reputation aggregation helpers"`

---

### Task B2: shared StarRating + display surfaces
**Files:** Create `src/components/ui/StarRating.tsx`; modify the seller/admin order view (`OrderDetailsView.tsx`) to show buyer reputation; `SellerProfileModal.tsx` to prefer real `sellerReputation`; a buyer badge surface (`MyOrdersView.tsx` or the buyer profile). Retrofit A3's seller rating UI to use `StarRating` if it used a placeholder.
**Interfaces:** `<StarRating value={n} count?={n} size? />` (read) and `<StarRating value onChange={fn} />` (input).

- [ ] **Step 1: StarRating** — a small reusable component (lucide `Star`), read mode (filled/half by `value`, optional `(count)`), input mode (hover + click `onChange`). Bilingual-agnostic (numbers only).
- [ ] **Step 2: buyer reputation to seller** — on the seller's (and admin's) view of an order, load reviews for the buyer (`where buyerId==order.buyerId, direction=='seller_rates_buyer'`, on-demand like `SellerProfileModal`) and render `<StarRating>` from `buyerReputation`. Do NOT add this to any live-auction/bidding component.
- [ ] **Step 3: seller reputation real** — in `SellerProfileModal.tsx`, compute the header rating from `sellerReputation(loadedReviews, sellerId)` when it has ≥1 real review, else fall back to the existing seeded `profile.rating`. (Reviews are already loaded there.)
- [ ] **Step 4: buyer badge** — surface the buyer's own rating (`buyerReputation(myReviews-or-loaded, myId)`) as a small badge on `MyOrdersView` / buyer profile.
- [ ] **Step 5: verify** — `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run` green.
- [ ] **Step 6: commit** — `git add -A && git commit -m "feat(ratings): shared StarRating + buyer/seller reputation display"`

---

### Task B3: full green + PR
- [ ] **Step 1:** `node -c functions/index.js && npx tsc --noEmit && npm run lint && npm run build && npx vitest run` — all green.
- [ ] **Step 2:** Push; open DRAFT PR (base main). Body: the new seller→buyer direction, real two-way reputation, buyer-rep surfaces (not during bidding), shared StarRating, deferrals; flag that seller scores now reflect real buyer ratings (may differ from seeded).
- [ ] **Step 3:** Cross-model review of `functions/index.js` — confirm `rateBuyer` makes zero wallet writes, seller-only auth, one-per-order.
- [ ] **Step 4:** Report to MJ with the Vercel preview URL for the seller rating flow + reputation surfaces; hold for merge approval.

---

## Self-Review
- **Spec coverage:** seller→buyer rating (A1/A2/A3), reputation aggregation both directions (B1), display incl. buyer rep + real seller rep + shared StarRating (B2). Deferrals (edit, mutual-blind, retrofit, tags, notify) not built. ✓
- **Placeholders:** pure-helper code verbatim; callable/UI anchor to exact files + the E6 `respondToReturn` pattern. ✓
- **Type consistency:** `'seller_rates_buyer'` added to the union (A3) and written by the callable (A2); `buildBuyerRating`/`canSellerRateOrder` (A1) used by A2; `buyerReputation`/`sellerReputation` (B1) used by B2. ✓
- **Money-path:** `rateBuyer` is rating-only, zero wallet writes. ✓
