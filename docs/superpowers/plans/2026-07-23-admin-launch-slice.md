# Admin Slice A — "Launch" Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the internal auction drop builder into the Launcher's workspace — auto auction numbers, multi-media, a hidden reserve price with a no-sale-below-reserve engine rule, faster copy-to-WhatsApp, a drops list, and a sectioned responsive form.

**Architecture:** Reserve amounts live in an admin-only `auctionSecrets/{auctionId}` doc — never on the world-readable `auctions/{id}` doc — with only a `reserveMet` boolean surfaced to clients. Settlement's sale/no-sale decision is extracted into a pure, unit-tested `functions/settlement.js` module (shared by `settleAuctionTxn`) so the reserve rule can't diverge. Auction numbers come from an atomic Firestore counter allocated in a client-side transaction (admin-gated by rules). The drop builder reuses the seller wizard's already-tested media-upload pattern and `createListing`'s existing upload plumbing.

**Tech Stack:** React 19 + Vite + TypeScript (loose/`strict` off, no `@types/react` full coverage), Firebase (Firestore + Storage + Cloud Functions, CommonJS), Vitest (node env), Tailwind. State-based routing via `AppContext` (no React Router).

## Global Constraints

- **Auction-number seed = `2000`** (the next number to assign; the first drop created is `2000`). Applied as the counter-init value.
- **Reserve amount is NEVER written to `auctions/{id}`** — that doc is `allow read: if true` (world-readable). Reserve lives only in `auctionSecrets/{auctionId}` (admin/server read). Only the boolean `reserveMet` may reach the client.
- **Bilingual RTL/LTR:** every user-facing string has Arabic + English via the existing `isAr` pattern; drop-builder container respects `direction: isAr ? 'rtl' : 'ltr'`.
- **Firestore rejects explicit `undefined`** (`ignoreUndefinedProperties` not enabled) — omit optional keys via conditional spread (`...(cond ? { key } : {})`), matching the existing `marketPrice`/`vendorName` pattern in `createListing`.
- **Client must never write settlement/money state.** Auction number (cosmetic) and reserve (admin-gated) are acceptable client writes; winner/price/order stay server-only.
- **Caption boilerplate** in `src/utils/dropCaption.ts` (HYPE/RULES/TERMS) MUST be confirmed verbatim with the team before production — do not alter it in this slice.
- **Deploy caveat:** `tsc --noEmit` can't fully type-check (no full `@types/react`, `strict` off) — rely on `npm run build` + Vitest + review.
- **Workflow:** Fable SDD — each Wave is a reviewed, mergeable PR; CI auto-deploys rules/functions on merge to main. Frequent commits (one per task minimum). TDD where a pure unit exists.

---

## File Structure

**New files:**
- `functions/settlement.js` — pure CommonJS: `reserveMet`, `resolveSettlement`, `nextAuctionNumber`. No firebase deps.
- `functions/settlement.test.js` — Vitest unit tests for the above.
- `src/utils/auctionNumber.ts` — pure `computeNextNumber` + `allocateAuctionNumber(db)` (client Firestore transaction).
- `src/utils/auctionNumber.test.ts` — tests for `computeNextNumber`.
- `src/utils/dropMedia.ts` — `copyImageToClipboard(url)`, `downloadMedia(items)`, `mediaFileName(url, kind, idx)`. Extracted so it's testable + reusable.
- `src/utils/dropMedia.test.ts` — tests for `mediaFileName`.
- `src/components/DropsListPanel.tsx` — Upcoming / Live / Recently-ended list with per-row copy + relist-prefill actions.

**Modified files:**
- `src/types.ts:104` — extend `AuctionItem.status`; add `auctionNumber?`, `reservePrice?` (client-side input type only — see Task 6), `reserveMet?`.
- `vitest.config.ts` — widen `include` to cover `functions/**/*.test.js`.
- `functions/index.js` — `settleAuctionTxn` reserve decision (reads `auctionSecrets` in-txn, uses `resolveSettlement`); `onBidCreated` maintains `reserveMet`.
- `firestore.rules` — add `counters/{counterId}` and `auctionSecrets/{auctionId}` blocks.
- `src/context/AppContext.tsx` (`createListing`, ~3042) — allocate auction number, write `auctionSecrets` reserve, thread `mediaUrls`/`videoFile`.
- `src/components/AuctionDropBuilderView.tsx` — sectioned form, auto-number display, reserve field, cover+gallery+video, copy-image/download, embed `DropsListPanel`.
- `src/components/DesktopLiveAuctionLayout.tsx` + `src/components/MobileLiveAuctionLayout.tsx` — reserve-met/not-met label from the boolean.

---

## WAVE 1 — Data model + pure logic (no UI, no wiring)

### Task 1: Pure settlement + counter logic module

**Files:**
- Create: `functions/settlement.js`
- Test: `functions/settlement.test.js`
- Modify: `vitest.config.ts`
- Modify: `src/types.ts:104`

**Interfaces:**
- Produces:
  - `reserveMet(finalPrice: number, reservePrice?: number|null): boolean` — `true` when no reserve, else `finalPrice >= reservePrice`.
  - `resolveSettlement({ totalBids, winnerId, finalPrice, reservePrice }): { outcome: 'sold'|'unsold'|'reserve_not_met', status: 'completed'|'ended'|'reserve_not_met' }`.
  - `nextAuctionNumber(current?: number|null, seed?: number): { assigned: number, next: number }` — `current` is the counter's stored `value` (next-to-assign). If `current` is null/undefined, uses `seed` (default 2000).

- [ ] **Step 1: Widen vitest include**

Edit `vitest.config.ts` `include` array to:

```ts
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'functions/**/*.test.js'],
```

- [ ] **Step 2: Write the failing test** — `functions/settlement.test.js`

```js
import { describe, it, expect } from 'vitest';
const { reserveMet, resolveSettlement, nextAuctionNumber } = require('./settlement');

describe('reserveMet', () => {
  it('is true when no reserve is set', () => {
    expect(reserveMet(50, null)).toBe(true);
    expect(reserveMet(50, undefined)).toBe(true);
    expect(reserveMet(50, 0)).toBe(true); // 0/falsey reserve = no reserve
  });
  it('is true only when final price reaches the reserve', () => {
    expect(reserveMet(199, 200)).toBe(false);
    expect(reserveMet(200, 200)).toBe(true);
    expect(reserveMet(250, 200)).toBe(true);
  });
});

describe('resolveSettlement', () => {
  it('sold: bids exist, has winner, reserve met', () => {
    expect(resolveSettlement({ totalBids: 3, winnerId: 'u1', finalPrice: 250, reservePrice: 200 }))
      .toEqual({ outcome: 'sold', status: 'completed' });
  });
  it('sold: no reserve set', () => {
    expect(resolveSettlement({ totalBids: 1, winnerId: 'u1', finalPrice: 5, reservePrice: null }))
      .toEqual({ outcome: 'sold', status: 'completed' });
  });
  it('reserve_not_met: bids exist but under reserve', () => {
    expect(resolveSettlement({ totalBids: 3, winnerId: 'u1', finalPrice: 150, reservePrice: 200 }))
      .toEqual({ outcome: 'reserve_not_met', status: 'reserve_not_met' });
  });
  it('unsold: no bids / no winner', () => {
    expect(resolveSettlement({ totalBids: 0, winnerId: null, finalPrice: 0, reservePrice: 200 }))
      .toEqual({ outcome: 'unsold', status: 'ended' });
  });
});

describe('nextAuctionNumber', () => {
  it('seeds at 2000 when counter is missing', () => {
    expect(nextAuctionNumber(null)).toEqual({ assigned: 2000, next: 2001 });
    expect(nextAuctionNumber(undefined)).toEqual({ assigned: 2000, next: 2001 });
  });
  it('assigns the stored value and advances by one', () => {
    expect(nextAuctionNumber(2000)).toEqual({ assigned: 2000, next: 2001 });
    expect(nextAuctionNumber(2417)).toEqual({ assigned: 2417, next: 2418 });
  });
  it('honors a custom seed', () => {
    expect(nextAuctionNumber(null, 5000)).toEqual({ assigned: 5000, next: 5001 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run functions/settlement.test.js`
Expected: FAIL — "Cannot find module './settlement'".

- [ ] **Step 4: Write minimal implementation** — `functions/settlement.js`

```js
/**
 * Pure settlement + numbering helpers. No firebase deps so they are unit-testable
 * under Vitest (node env) and shared by functions/index.js — one source of truth
 * for the reserve rule (avoids the divergent-formula bug class).
 */

/** A reserve is "met" when unset (null/0/undefined) or the price reaches it. */
function reserveMet(finalPrice, reservePrice) {
  if (!reservePrice) return true;
  return finalPrice >= reservePrice;
}

/**
 * Decide how an expired auction settles.
 * - sold: real bids + a winner + reserve met  -> status 'completed' (create order)
 * - reserve_not_met: real bids + winner but under reserve -> 'reserve_not_met' (NO order)
 * - unsold: no bids / no winner -> 'ended'
 */
function resolveSettlement({ totalBids, winnerId, finalPrice, reservePrice }) {
  if (totalBids > 0 && winnerId) {
    if (reserveMet(finalPrice, reservePrice)) {
      return { outcome: 'sold', status: 'completed' };
    }
    return { outcome: 'reserve_not_met', status: 'reserve_not_met' };
  }
  return { outcome: 'unsold', status: 'ended' };
}

/**
 * Allocate the next auction number from a counter's stored value.
 * `current` = counters/auctionNumber.value (the NEXT number to assign).
 * Missing counter -> seed (default 2000).
 */
function nextAuctionNumber(current, seed = 2000) {
  const base = (typeof current === 'number' && Number.isFinite(current)) ? current : seed;
  return { assigned: base, next: base + 1 };
}

module.exports = { reserveMet, resolveSettlement, nextAuctionNumber };
```

- [ ] **Step 5: Add statuses to the type** — `src/types.ts:104`

Replace the `AuctionItem.status` union and add the new optional fields directly after `mediaUrls?` (line 98) / near `marketPrice?` (line 113):

```ts
  status: 'upcoming' | 'live' | 'processing' | 'rejected' | 'completed' | 'ended' | 'reserve_not_met';
```

Add near line 113 (after `marketPrice?`):

```ts
  /** Sequential internal auction number assigned at create from the atomic counter. */
  auctionNumber?: number;
  /**
   * Reserve gate: true when there is no reserve OR the price has reached it.
   * The reserve AMOUNT never lives on this (world-readable) doc — only this boolean.
   * Maintained by onBidCreated; authoritative sale decision re-checks in settleAuctionTxn.
   */
  reserveMet?: boolean;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run functions/settlement.test.js`
Expected: PASS (11 assertions across 3 describes).

- [ ] **Step 7: Full build + suite (regression guard)**

Run: `npm run build && npx vitest run`
Expected: build OK; all prior tests + the new ones pass.

- [ ] **Step 8: Commit**

```bash
git add functions/settlement.js functions/settlement.test.js vitest.config.ts src/types.ts
git commit -m "feat(settle): pure reserve+numbering logic module + status types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Firestore rules for counter + reserve secrets

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `counters/{counterId}` (admin read + write) and `auctionSecrets/{auctionId}` (admin read + write; Cloud Functions bypass rules).

- [ ] **Step 1: Add the rule blocks**

In `firestore.rules`, inside the top-level `match /databases/{database}/documents {` block (alongside the other `match` blocks, e.g. after the `auctions` block ~line 123), add:

```
    // Atomic sequence for internal auction numbers. Admin-gated: only the
    // drop builder (admin) reads + increments it in a transaction. Cosmetic
    // value — no money state — so a client transaction is acceptable here.
    match /counters/{counterId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    // Reserve prices (and any future per-auction secrets). NEVER world-readable:
    // auctions/{id} is `allow read: if true`, so the reserve amount must live
    // here, admin-only. Cloud Functions (settleAuctionTxn) bypass rules entirely.
    match /auctionSecrets/{auctionId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
```

- [ ] **Step 2: Validate rules syntax (if firebase CLI available)**

Run: `npx firebase deploy --only firestore:rules --dry-run 2>/dev/null || echo "CLI not available — CI validates on merge"`
Expected: either a successful dry-run compile, or the fallback message (CI's "Deploy Firebase" workflow compiles on merge).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): admin-only counters + auctionSecrets (reserve never world-readable)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Wave 1 review gate.** Deliverable: pure logic + rules landed, fully unit-tested, no behavior change yet.

---

## WAVE 2 — Engine wiring

### Task 3: Reserve decision in `settleAuctionTxn`

**Files:**
- Modify: `functions/index.js` (require settlement; `settleAuctionTxn` body ~88-233)

**Interfaces:**
- Consumes: `resolveSettlement`, `reserveMet` from `./settlement`.
- Produces: settlement that (a) reads `auctionSecrets/{id}` in-txn, (b) creates an order + `completed` status only when `outcome==='sold'`, (c) writes `reserve_not_met` (no order, no wonCount) when a winner exists under reserve, (d) `ended` when no winner — unchanged.

- [ ] **Step 1: Require the module** — top of `functions/index.js` (after the existing requires, ~line 3)

```js
const { resolveSettlement } = require('./settlement');
```

- [ ] **Step 2: Read the reserve secret before the transaction** — inside `settleAuctionTxn`, after the escrow lookup block (~line 118), before `let notifyData = null;`

```js
  // Reserve lives in an admin/server-only doc (never on the world-readable
  // auction). Read it here; the authoritative sale decision re-derives price
  // from the in-txn snapshot below.
  let reservePrice = null;
  try {
    const secretSnap = await db.collection('auctionSecrets').doc(auctionId).get();
    if (secretSnap.exists) reservePrice = secretSnap.data().reservePrice ?? null;
  } catch (secErr) {
    console.warn(`[settleAuctionTxn] auctionSecrets fetch failed for ${auctionId}:`, secErr);
  }
```

- [ ] **Step 3: Branch on `resolveSettlement`** — replace the `if (totalBids > 0 && winnerId) { ... } else { ... }` control (lines ~153-232) so the winner path is gated on `outcome === 'sold'`, and a new `reserve_not_met` branch writes no order.

Replace the opening of the decision (keep the existing winner-path body verbatim inside the `if`), i.e. change:

```js
    if (totalBids > 0 && winnerId) {
      // Mark completed
      transaction.update(auctionRef, {
        status: 'completed',
```

to:

```js
    const decision = resolveSettlement({ totalBids, winnerId, finalPrice, reservePrice });

    if (decision.outcome === 'sold') {
      // Mark completed
      transaction.update(auctionRef, {
        status: 'completed',
```

Then replace the final `} else {` unsold block (lines ~224-232) with an explicit two-branch tail:

```js
    } else if (decision.outcome === 'reserve_not_met') {
      // A winner exists but the top bid never cleared the hidden reserve.
      // Per spec: NO sale, NO order, NO wonCount. Relist-able.
      transaction.update(auctionRef, {
        status: 'reserve_not_met',
        settledAt: admin.firestore.FieldValue.serverTimestamp()
      });
      settled = true;
      console.log(`[settleAuctionTxn] Reserve not met for ${auctionId} (top ${finalPrice} < reserve ${reservePrice}) — no order created`);
    } else {
      // Close without bidder
      transaction.update(auctionRef, {
        status: 'ended',
        settledAt: admin.firestore.FieldValue.serverTimestamp()
      });
      settled = true;
      console.log(`[settleAuctionTxn] Closed unsold auction ${auctionId}`);
    }
```

- [ ] **Step 4: Guard the re-entry check** — the early `if (freshData.status === 'completed' || freshData.status === 'ended')` (line ~131) must also skip already-`reserve_not_met` auctions so the closer doesn't reprocess them. Change to:

```js
    if (['completed', 'ended', 'reserve_not_met'].includes(freshData.status)) {
      return;
    }
```

- [ ] **Step 5: Verify build (functions lint/parse)**

Run: `node -e "require('./functions/settlement.js'); require('./functions/index.js')" 2>&1 | head -5 || echo "note: index.js may need firebase env to fully load; syntax errors will still surface"`
Expected: no `SyntaxError`. (Runtime firebase-init warnings are acceptable; a `SyntaxError` is a fail.)

- [ ] **Step 6: Regression suite**

Run: `npx vitest run`
Expected: all pass (settlement unit tests already cover the decision matrix Task 3 wires in).

- [ ] **Step 7: Commit**

```bash
git add functions/index.js
git commit -m "feat(settle): hidden-reserve rule — no sale/order below reserve

Reads admin-only auctionSecrets in-txn, routes via resolveSettlement:
sold->completed(+order), under-reserve->reserve_not_met(no order),
no-winner->ended. reserve_not_met added to re-entry guard.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Maintain the `reserveMet` display boolean on bid

**Files:**
- Modify: `functions/index.js` (`onBidCreated`, ~540-604)

**Interfaces:**
- Consumes: `reserveMet` from `./settlement` (add to the Task 3 require: `const { resolveSettlement, reserveMet } = require('./settlement');`).
- Produces: after each bid, `auctions/{id}.reserveMet` reflects whether `currentPrice` has cleared the hidden reserve. Best-effort/eventual (the room label); the authoritative decision stays in `settleAuctionTxn`.

- [ ] **Step 1: Extend the require** (from Task 3)

```js
const { resolveSettlement, reserveMet } = require('./settlement');
```

- [ ] **Step 2: Update the boolean inside `onBidCreated`** — after `const auctionData = auctionSnap.data();` (~line 557), add:

```js
      // Maintain the room's reserve-met label without leaking the amount.
      // Only flip false -> true (once), and only when a reserve actually exists.
      try {
        const secretSnap = await db.collection('auctionSecrets').doc(auctionId).get();
        const rp = secretSnap.exists ? (secretSnap.data().reservePrice ?? null) : null;
        if (rp) {
          const met = reserveMet(auctionData.currentPrice ?? amount, rp);
          if (met && auctionData.reserveMet !== true) {
            await db.collection('auctions').doc(auctionId).update({ reserveMet: true });
          }
        }
      } catch (rmErr) {
        console.warn(`[onBidCreated] reserveMet update failed for ${auctionId}:`, rmErr);
      }
```

- [ ] **Step 3: Syntax check + suite**

Run: `node -e "require('./functions/index.js')" 2>&1 | grep -i "SyntaxError" && echo FAIL || echo "no syntax error"; npx vitest run`
Expected: "no syntax error"; suite passes.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat(bid): maintain reserveMet label boolean (never exposes amount)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Wave 2 review gate + manual smoke (needs a simulated drop):** set a reserve, bid under it → auction ends `reserve_not_met`, NO order in admin Orders; bid over it → normal completed order. Verify no `reservePrice` field ever appears on the `auctions/{id}` doc (only `reserveMet`).

---

## WAVE 3 — Client create path

### Task 5: Auction-number allocation util

**Files:**
- Create: `src/utils/auctionNumber.ts`
- Test: `src/utils/auctionNumber.test.ts`

**Interfaces:**
- Consumes: `nextAuctionNumber` logic (re-implemented in TS here — the `functions/` CommonJS module isn't importable from `src/`; the shared behavior is pinned by identical tests on both sides).
- Produces:
  - `computeNextNumber(current?: number|null, seed?: number): { assigned: number; next: number }`
  - `allocateAuctionNumber(db: Firestore): Promise<number>` — runs a Firestore transaction on `counters/auctionNumber`, returns the assigned number.

- [ ] **Step 1: Write the failing test** — `src/utils/auctionNumber.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { computeNextNumber } from './auctionNumber';

describe('computeNextNumber', () => {
  it('seeds at 2000 when the counter is missing', () => {
    expect(computeNextNumber(null)).toEqual({ assigned: 2000, next: 2001 });
    expect(computeNextNumber(undefined)).toEqual({ assigned: 2000, next: 2001 });
  });
  it('assigns the stored value and advances by one', () => {
    expect(computeNextNumber(2000)).toEqual({ assigned: 2000, next: 2001 });
    expect(computeNextNumber(2417)).toEqual({ assigned: 2417, next: 2418 });
  });
  it('honors a custom seed', () => {
    expect(computeNextNumber(null, 5000)).toEqual({ assigned: 5000, next: 5001 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/auctionNumber.test.ts`
Expected: FAIL — cannot find `./auctionNumber`.

- [ ] **Step 3: Implement** — `src/utils/auctionNumber.ts`

```ts
import type { Firestore } from 'firebase/firestore';

/** Auction-number seed — the first number ever assigned. Keep in sync with functions/settlement.js. */
export const AUCTION_NUMBER_SEED = 2000;

/** Pure allocation: `current` is the counter's stored value (next-to-assign). */
export function computeNextNumber(
  current?: number | null,
  seed: number = AUCTION_NUMBER_SEED,
): { assigned: number; next: number } {
  const base = typeof current === 'number' && Number.isFinite(current) ? current : seed;
  return { assigned: base, next: base + 1 };
}

/**
 * Atomically allocate the next auction number via a Firestore transaction on
 * counters/auctionNumber. Safe against concurrent launches. Admin-gated by rules.
 */
export async function allocateAuctionNumber(db: Firestore): Promise<number> {
  const { doc, runTransaction } = await import('firebase/firestore');
  const ref = doc(db, 'counters', 'auctionNumber');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().value as number) : null;
    const { assigned, next } = computeNextNumber(current);
    tx.set(ref, { value: next }, { merge: true });
    return assigned;
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/utils/auctionNumber.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/auctionNumber.ts src/utils/auctionNumber.test.ts
git commit -m "feat(drops): atomic auction-number counter util (seed 2000)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Thread number, reserve, media through `createListing`

**Files:**
- Modify: `src/context/AppContext.tsx` (`createListing`, ~3042-3200; find the `setDoc`/auction-doc write and the return)

**Interfaces:**
- Consumes: `allocateAuctionNumber` (Task 5); `getFirebaseDb`/`db` handle (use the same import pattern `createListing` already uses for Firestore — grep `getFirebaseDb`/`db` within the function).
- Produces: `createListing` now (a) allocates `auctionNumber` when `initialStatus === 'upcoming'` and the caller is admin, writing it onto the auction doc; (b) writes `{ reservePrice }` to `auctionSecrets/{newListingId}` when the caller passes a `reservePrice` (via a new optional field on `listingData`); (c) already accepts `mediaUrls` (in `listingData`) and `videoFile` (2nd arg) — no change needed for media beyond passing them from the builder. `reservePrice` is stripped from the auction doc payload (must never land there).

**Note on typing:** `listingData` is `Omit<AuctionItem, ...>`. Add `reservePrice?: number` to the accepted input by widening the param type locally (e.g. `listingData: Omit<AuctionItem,...> & { reservePrice?: number }`), then destructure it out before writing the auction doc.

- [ ] **Step 1: Pull reservePrice out of the auction payload**

At the top of `createListing`, after the `currentUser` guard, destructure and separate the secret:

```ts
    // Reserve must NOT be written to the world-readable auction doc.
    const { reservePrice, ...auctionInput } = listingData as typeof listingData & { reservePrice?: number };
```

Use `auctionInput` in place of `listingData` when assembling the doc to write (spread `...auctionInput` where it currently spreads `listingData`).

- [ ] **Step 2: Allocate the auction number for admin drops**

Just before assembling the auction doc payload, add:

```ts
    // Admin drop-builder auctions get a sequential number from the atomic counter.
    // (Seller-wizard 'processing' submissions don't — they're numbered at approval time, later slice.)
    let assignedAuctionNumber: number | undefined;
    if (initialStatus === 'upcoming') {
      try {
        const { getFirebaseDb } = await import('../services/firebase');
        const dbh = await getFirebaseDb();
        const { allocateAuctionNumber } = await import('../utils/auctionNumber');
        assignedAuctionNumber = await allocateAuctionNumber(dbh);
      } catch (numErr) {
        console.warn('[createListing] auction number allocation failed (continuing without):', numErr);
      }
    }
```

Confirm the firebase service exposes `getFirebaseDb` — grep `getFirebaseDb\|getFirestore` in `src/services/firebase*`; if the accessor differs, use the existing one `createListing` already uses to reach Firestore.

- [ ] **Step 3: Include the number in the auction doc**

In the object passed to the auction write, add (conditional spread — never write `undefined`):

```ts
        ...(assignedAuctionNumber != null ? { auctionNumber: assignedAuctionNumber } : {}),
```

- [ ] **Step 4: Write the reserve secret after the auction doc is created**

Immediately after the auction doc write succeeds (before `return newListingId`), add:

```ts
    if (reservePrice && reservePrice > 0) {
      try {
        const { getFirebaseDb } = await import('../services/firebase');
        const dbh = await getFirebaseDb();
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(dbh, 'auctionSecrets', newListingId), { reservePrice });
      } catch (resErr) {
        console.warn('[createListing] reserve secret write failed:', resErr);
      }
    }
```

- [ ] **Step 5: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: build OK; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "feat(drops): createListing allocates auction number + writes reserve secret

Reserve stripped from the (world-readable) auction doc, stored in
auctionSecrets/{id}. Auto auction number for admin 'upcoming' drops.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Wave 3 review gate.** Deliverable: server + client create-path fully support number + reserve; still no UI change.

---

## WAVE 4 — Drop builder UI

### Task 7: Copy-image / download media util

**Files:**
- Create: `src/utils/dropMedia.ts`
- Test: `src/utils/dropMedia.test.ts`

**Interfaces:**
- Produces:
  - `mediaFileName(url: string, kind: 'cover'|'gallery'|'video', idx?: number): string` — pure; derives a sensible download filename.
  - `copyImageToClipboard(url: string): Promise<boolean>` — fetches the image, writes a `ClipboardItem`; returns `false` (never throws) if blocked/unsupported.
  - `downloadMedia(items: { url: string; kind: 'cover'|'gallery'|'video'; idx?: number }[]): Promise<void>` — triggers a download per item via a temporary anchor.

- [ ] **Step 1: Write the failing test** — `src/utils/dropMedia.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mediaFileName } from './dropMedia';

describe('mediaFileName', () => {
  it('names the cover with its extension', () => {
    expect(mediaFileName('https://x/y/photo.jpg?alt=media', 'cover')).toBe('cover.jpg');
  });
  it('numbers gallery photos from 1', () => {
    expect(mediaFileName('https://x/pic.png', 'gallery', 0)).toBe('gallery-1.png');
    expect(mediaFileName('https://x/pic.png', 'gallery', 2)).toBe('gallery-3.png');
  });
  it('names the video', () => {
    expect(mediaFileName('https://x/clip.mp4', 'video')).toBe('video.mp4');
  });
  it('falls back to jpg when no extension is present', () => {
    expect(mediaFileName('https://x/noext', 'cover')).toBe('cover.jpg');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/dropMedia.test.ts`
Expected: FAIL — cannot find `./dropMedia`.

- [ ] **Step 3: Implement** — `src/utils/dropMedia.ts`

```ts
type MediaKind = 'cover' | 'gallery' | 'video';

const EXT_RE = /\.([a-z0-9]{2,4})(?:\?|$)/i;

/** Derive a download filename; defaults to .jpg for images with no discernible extension. */
export function mediaFileName(url: string, kind: MediaKind, idx = 0): string {
  const m = url.match(EXT_RE);
  const ext = m ? m[1].toLowerCase() : (kind === 'video' ? 'mp4' : 'jpg');
  if (kind === 'gallery') return `gallery-${idx + 1}.${ext}`;
  return `${kind}.${ext}`;
}

/** Copy an image to the clipboard. Returns false (never throws) if unsupported/blocked. */
export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    if (!('clipboard' in navigator) || typeof (window as any).ClipboardItem === 'undefined') return false;
    const resp = await fetch(url);
    const blob = await resp.blob();
    // Safari/Chrome accept image/png; convert only if needed is out of scope — most covers are jpg/png.
    await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Download each media item via a temporary anchor (blob URL to force a save). */
export async function downloadMedia(
  items: { url: string; kind: MediaKind; idx?: number }[],
): Promise<void> {
  for (const it of items) {
    try {
      const resp = await fetch(it.url);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = mediaFileName(it.url, it.kind, it.idx ?? 0);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      /* skip a failed item; others still download */
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/utils/dropMedia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/dropMedia.ts src/utils/dropMedia.test.ts
git commit -m "feat(drops): copy-image + download-media helpers for WhatsApp posting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Rebuild the drop builder form (sections + media + reserve + auto number + copy-image)

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx` (full form region)

**Interfaces:**
- Consumes: `allocateAuctionNumber`/`computeNextNumber` (display of the *next* number pre-create is optional; the authoritative number is assigned in `createListing`), `copyImageToClipboard`, `downloadMedia`, `mediaFileName`; the wizard's media patterns (`resizeImage`, `extraPhotos` state shape, cover/video refs).
- Produces: a sectioned, responsive form that passes `mediaUrls` (uploaded gallery), `videoFile`, and `reservePrice` into `createListing`.

- [ ] **Step 1: Add reserve + media + video state**

Add alongside existing `useState`s (near line 38):

```tsx
  const [reservePrice, setReservePrice] = useState('');
  const [extraPhotos, setExtraPhotos] = useState<{ file: File; url: string }[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [copyImageMsg, setCopyImageMsg] = useState('');
```

Add the wizard's gallery helpers (ported verbatim from `ListingWizardView.tsx:36-48`):

```tsx
  const addExtraPhotos = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setExtraPhotos((prev) =>
      [...prev, ...incoming.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 3),
    );
  };
  const removeExtraPhoto = (idx: number) => setExtraPhotos((prev) => prev.filter((_, i) => i !== idx));
```

- [ ] **Step 2: Upload gallery photos + pass media into `createListing`**

In `handleCreate`, before the `createListing` call, port the wizard's gallery upload (from `ListingWizardView.tsx:104-124`, using `resizeImage` — add `import { resizeImage } from '../utils/resizeImage';`). Then extend the `createListing` `listingData` object with:

```tsx
          ...(extraPhotoUrls.length > 0 ? { mediaUrls: extraPhotoUrls } : {}),
          ...(Number(reservePrice) > 0 ? { reservePrice: Number(reservePrice) } : {}),
```

and pass `videoFile ?? undefined` as the **2nd** arg to `createListing` (it's the `videoFile` param):

```tsx
      const newId = await createListing(
        { /* ...existing fields..., mediaUrls, reservePrice (as above) */ },
        videoFile ?? undefined,      // videoFile (was `undefined`)
        thumbnailFile ?? undefined,  // thumbnailFile (cover)
        undefined,
        'upcoming',
      );
```

- [ ] **Step 3: Make the "Auction number" field read-only / auto**

Replace the free-text auction-number input (lines ~154-156) with a read-only display. Pre-create it shows an "auto" hint; post-create it shows the assigned number from the created auction. Fetch the created auction's `auctionNumber` from context (the created listing is in `auctions`) or show `createdId`-derived confirmation:

```tsx
        <label className="block text-sm">{isAr ? 'رقم المزاد' : 'Auction number'}
          <input
            className="mt-1 w-full border rounded p-2 bg-neutral-100 text-neutral-500"
            value={assignedNumber != null ? String(assignedNumber) : (isAr ? 'تلقائي' : 'Auto')}
            readOnly
          />
          <span className="mt-1 block text-xs text-neutral-500">
            {isAr ? 'يُخصَّص تلقائياً عند الإنشاء' : 'Assigned automatically on create'}
          </span>
        </label>
```

Where `assignedNumber` is read post-create from the created auction doc: after `setCreatedId(newId)`, look it up from the app's `auctions` collection (`auctions.find(a => a.id === newId)?.auctionNumber`) via a `useMemo`, or capture it if `createListing` is extended to return it. **Simplest:** derive from context — add near the other memos:

```tsx
  const { auctions } = useApp(); // ensure `auctions` is destructured from useApp()
  const assignedNumber = useMemo(
    () => (createdId ? auctions.find((a) => a.id === createdId)?.auctionNumber : undefined),
    [createdId, auctions],
  );
```

The caption's `auctionNumber` should use `assignedNumber ?? '—'` instead of the old `title` field.

**Decouple title from the number:** the listing `title` now comes from `productName` only — change `title: title.trim() || productName.trim()` to `title: productName.trim()` and remove the now-unused `title`/`setTitle` state.

- [ ] **Step 4: Add the Reserve field + group into sections**

Add the reserve input in a **Pricing** section (with starting + market price):

```tsx
        <label className="block text-sm">{isAr ? 'السعر الاحتياطي (اختياري — مخفي عن المزايدين)' : 'Reserve price (optional — hidden from bidders)'}
          <input type="number" className="mt-1 w-full border rounded p-2" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} />
          <span className="mt-1 block text-xs text-neutral-500">
            {isAr ? 'لن يُباع المنتج إذا لم تصل المزايدة لهذا السعر' : "Item won't sell if bidding doesn't reach this"}
          </span>
        </label>
```

Wrap the existing fields into four labeled `<section>`s with headings: **Item** (product name, condition, specs, vendor), **Pricing** (starting, market, reserve), **Timing** (channel, start time, duration), **Media** (cover image, gallery photos, video). Keep the existing two-column page grid; within the form use `space-y` per section and a small uppercase section header (`text-xs font-bold text-neutral-400 uppercase`).

- [ ] **Step 5: Add gallery + video inputs to the Media section**

Port the wizard's gallery grid (`ListingWizardView.tsx:319-357`, adapting styling to the builder's plainer look) using `extraPhotos`/`addExtraPhotos`/`removeExtraPhoto`, and add a video input:

```tsx
        <label className="block text-sm">{isAr ? 'فيديو المنتج (اختياري)' : 'Product video (optional)'}
          <input type="file" accept="video/*" className="mt-1 w-full"
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
        </label>
```

- [ ] **Step 6: Add Copy image + Download media buttons**

In the preview column, after the existing Copy-caption button, add (enabled once a cover exists):

```tsx
        <button
          onClick={async () => {
            const ok = thumbnailPreview ? await copyImageToClipboard(thumbnailPreview) : false;
            setCopyImageMsg(ok ? (isAr ? '✅ نُسخت الصورة' : '✅ Image copied') : (isAr ? 'تعذّر النسخ — استخدم تنزيل' : "Couldn't copy — use Download"));
          }}
          disabled={!thumbnailFile}
          className="w-full border rounded p-2 disabled:opacity-50"
        >{isAr ? 'نسخ الصورة' : 'Copy image'}</button>
        {copyImageMsg && <p className="text-xs text-neutral-500">{copyImageMsg}</p>}

        <button
          onClick={() => downloadMedia([
            ...(thumbnailPreview ? [{ url: thumbnailPreview, kind: 'cover' as const }] : []),
            ...extraPhotos.map((p, i) => ({ url: p.url, kind: 'gallery' as const, idx: i })),
            ...(videoFile ? [{ url: URL.createObjectURL(videoFile), kind: 'video' as const }] : []),
          ])}
          disabled={!thumbnailFile && extraPhotos.length === 0 && !videoFile}
          className="w-full border rounded p-2 disabled:opacity-50"
        >{isAr ? 'تنزيل الوسائط' : 'Download media'}</button>
```

Add imports: `import { copyImageToClipboard, downloadMedia } from '../utils/dropMedia';`

- [ ] **Step 7: Build + suite**

Run: `npm run build && npx vitest run`
Expected: build OK; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drops): sectioned builder — auto number, reserve, media, copy-image

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Drops list panel (Upcoming / Live / Recently-ended)

**Files:**
- Create: `src/components/DropsListPanel.tsx`
- Modify: `src/components/AuctionDropBuilderView.tsx` (embed the panel)

**Interfaces:**
- Consumes: `auctions` from `useApp()`, `buildAuctionUrl`, `buildAuctionCaption`, `copyImageToClipboard`.
- Produces: `<DropsListPanel onRelist={(auction) => void} />` — a read-only grouped list with per-row Copy link / Copy caption / Copy image and, for `reserve_not_met`/`ended` rows, a "Relist" button that calls `onRelist` to prefill the form.

- [ ] **Step 1: Implement the panel** — `src/components/DropsListPanel.tsx`

```tsx
import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import type { AuctionItem } from '../types';
import { buildAuctionUrl } from '../utils/deepLink';

const GROUPS: { key: string; ar: string; en: string; match: (a: AuctionItem) => boolean }[] = [
  { key: 'live', ar: 'مباشر الآن', en: 'Live now', match: (a) => a.status === 'live' },
  { key: 'upcoming', ar: 'قادمة', en: 'Upcoming', match: (a) => a.status === 'upcoming' },
  {
    key: 'ended', ar: 'انتهت مؤخراً', en: 'Recently ended',
    match: (a) => ['completed', 'ended', 'reserve_not_met'].includes(a.status),
  },
];

export default function DropsListPanel({ onRelist }: { onRelist?: (a: AuctionItem) => void }) {
  const { auctions, language } = useApp();
  const isAr = language === 'ar';
  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

  const grouped = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: auctions.filter(g.match).slice(0, 15) })),
    [auctions],
  );

  return (
    <div className="space-y-4" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <h2 className="text-lg font-semibold">{isAr ? 'مزاداتك' : 'Your drops'}</h2>
      {grouped.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="text-xs font-bold text-neutral-400 uppercase">
            {isAr ? g.ar : g.en} ({g.items.length})
          </h3>
          {g.items.length === 0 && <p className="text-xs text-neutral-400">—</p>}
          {g.items.map((a) => (
            <div key={a.id} className="border rounded p-2 text-sm flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {a.auctionNumber ? `#${a.auctionNumber} · ` : ''}{a.title}
                </div>
                <div className="text-xs text-neutral-500">
                  {a.status}{a.status === 'reserve_not_met' ? (isAr ? ' (لم يصل الاحتياطي)' : ' (reserve not met)') : ''}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="border rounded px-2 py-1 text-xs"
                  onClick={() => copy(buildAuctionUrl(a.id, window.location.origin))}>
                  {isAr ? 'رابط' : 'Link'}
                </button>
                {onRelist && ['reserve_not_met', 'ended'].includes(a.status) && (
                  <button className="border rounded px-2 py-1 text-xs" onClick={() => onRelist(a)}>
                    {isAr ? 'إعادة' : 'Relist'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Embed it in the builder**

In `AuctionDropBuilderView.tsx`, below the preview column content, render `<DropsListPanel onRelist={handleRelist} />` where `handleRelist(a)` prefills `productName`, `startingPrice`, `condition`, `channel`, `marketPrice`, `durationSeconds` from `a` and scrolls to top. Add `import DropsListPanel from './DropsListPanel';`. Keep the page a two-column grid on desktop; the panel stacks under the form on mobile.

```tsx
  const handleRelist = (a: AuctionItem) => {
    setProductName(a.title);
    setStartingPrice(String(a.startingPrice));
    setCondition(a.condition ?? condition);
    if (a.channel) setChannel(a.channel);
    if (a.marketPrice) setMarketPrice(String(a.marketPrice));
    setDurationSeconds(a.duration || durationSeconds);
    setCreatedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
```

- [ ] **Step 3: Build + suite**

Run: `npm run build && npx vitest run`
Expected: build OK; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/DropsListPanel.tsx src/components/AuctionDropBuilderView.tsx
git commit -m "feat(drops): drops list panel (upcoming/live/recent) + relist prefill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Wave 4 review gate + manual smoke:** create a drop with cover + 2 gallery photos + video + reserve; confirm auto number shows post-create, caption uses it, Copy image pastes into WhatsApp Web (desktop), Download media saves all files, the new drop appears under Upcoming, and a reserve_not_met drop offers Relist.

---

## WAVE 5 — Live room reserve label

### Task 10: "Reserve not yet met / met" label in the live room

**Files:**
- Modify: `src/components/DesktopLiveAuctionLayout.tsx`
- Modify: `src/components/MobileLiveAuctionLayout.tsx`

**Interfaces:**
- Consumes: `auction.reserveMet` (boolean; only present when a reserve exists — `undefined` means "no reserve / show nothing").
- Produces: a subtle label near the current price. Shows nothing when `reserveMet === undefined` (no reserve). Shows "reserve not yet met" when `false`, "reserve met" when `true`.

- [ ] **Step 1: Add a shared label helper**

At the top of each layout (or as a tiny inline component), where the current price renders, add:

```tsx
        {auction.reserveMet === false && (
          <span className="text-xs font-semibold text-amber-600">
            {isAr ? 'لم يصل السعر الاحتياطي بعد' : 'Reserve not yet met'}
          </span>
        )}
        {auction.reserveMet === true && (
          <span className="text-xs font-semibold text-emerald-600">
            {isAr ? '✓ تم بلوغ السعر الاحتياطي' : '✓ Reserve met'}
          </span>
        )}
```

Locate the current-price render in each file (grep `currentPrice` / `currentBid`) and place the label directly beneath it. Confirm `isAr`/`language` is in scope in each layout (grep — both use the `useApp` language pattern).

- [ ] **Step 2: Build + suite**

Run: `npm run build && npx vitest run`
Expected: build OK; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/DesktopLiveAuctionLayout.tsx src/components/MobileLiveAuctionLayout.tsx
git commit -m "feat(liveroom): hidden-reserve label (not-met/met) from reserveMet boolean

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Wave 5 review gate + manual smoke (simulated drop):** an auction with a reserve shows "not yet met" while low, flips to "met" once bids clear it; an auction with no reserve shows no label; the reserve amount never appears anywhere client-side (inspect network/Firestore reads).

---

## Post-implementation

- **Seed the counter once before first real use:** create Firestore doc `counters/auctionNumber` = `{ value: 2000 }` (or leave absent — the first `allocateAuctionNumber` seeds 2000 via `computeNextNumber(null)`). Verify the first real drop is `#2000`.
- **Finish the branch** via superpowers:finishing-a-development-branch → PR into main; CI deploys rules + functions.
- **North-star follow-ups (out of scope, next slices):** role-based admin home + per-job "needs attention" queue; Jobs 1/2/4; automated relist; numbering seller-wizard listings at approval time.

---

## Self-Review

**Spec coverage:**
- Drops list → Task 9 ✓
- Auto auction number (server counter, seed 2000) → Tasks 1, 5, 6 ✓
- Multi-media (cover + gallery + video) → Tasks 6, 8 ✓
- Hidden reserve + no-sale-below engine rule → Tasks 1, 2, 3, 6 ✓
- Reserve label (boolean only, amount never client-side) → Tasks 4, 10 ✓
- Copy-image + download for WhatsApp → Tasks 7, 8 ✓
- Sectioned responsive form → Task 8 ✓
- Non-goals respected (no role shell, no Jobs 1/2/4, no public reserve, no WhatsApp API) ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step carries real code. The two "grep to confirm the accessor name" notes (Task 6 `getFirebaseDb`, Task 10 `isAr` scope) are verification instructions, not placeholders; the surrounding code is complete.

**Type consistency:** `reserveMet(finalPrice, reservePrice)`, `resolveSettlement({totalBids,winnerId,finalPrice,reservePrice})`, `nextAuctionNumber/computeNextNumber(current, seed) -> {assigned,next}`, `mediaFileName(url,kind,idx)`, `copyImageToClipboard(url)`, `downloadMedia(items[])`, `auctionSecrets/{id}.reservePrice`, `auctions/{id}.reserveMet|auctionNumber`, status `'reserve_not_met'|'ended'` — names/signatures consistent across tasks. The TS `computeNextNumber` mirrors the JS `nextAuctionNumber` (different names by module boundary, pinned by identical tests on both sides — intentional, noted in Task 5).
