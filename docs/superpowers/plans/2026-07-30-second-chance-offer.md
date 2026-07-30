# Second Chance Offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a winner defaults, automatically offer the lot to the runner-up at their own bid — once, for 24 hours — so a sale that was one bidder away from closing is recovered instead of dying.

**Architecture:** All decisions (who the runner-up is, whether the reserve is cleared, whether an offer is live, what the new order's money should be) live in one pure module, `functions/secondChance.js`, mirroring how `settlement.js` holds the below-reserve logic. `paymentDefaultEnforcer` calls it after its batch commits; a `respondToSecondChance` callable handles accept/decline. The offer record reuses the `belowReserveOffer` state machine's shape and helpers rather than growing a parallel one.

**Tech Stack:** Cloud Functions (CommonJS, firebase-functions v4), Firestore, Vitest (node environment), React 19 + TypeScript for the two cards.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-30-second-chance-offer-design.md`. Read it first.
- **One offer only.** No cascade. The order id `<auctionId>__sc` is a one-shot scheme and works *because* of that — never extend it to `__sc2`.
- **24 hours per party.** `BELOW_RESERVE_WINDOW_HOURS` from `settlement.js` — do not introduce a new constant. On the below-reserve path the buyer gets a **fresh** 24h when the seller accepts, exactly as `acceptBelowReserve` already does (`index.js:2627`).
- **No new n8n events.** The live workflow has a fixed 21-event contract. Reuse `below_reserve_offer`, `below_reserve_seller_accepted`, `below_reserve_declined`.
- **Money is never copied from the dead order.** Recompute from the runner-up's bid via `buyerPremiumJod` / `totalDueJod` / `sellerCommissionFils` / `sellerNetFils`.
- **The reserve lives in `auctionSecrets/{auctionId}`**, never the world-readable auction doc. No `auctionSecrets` doc means no reserve, so any bid clears it.
- **The enforcer must never throw.** A second-chance failure logs and moves on — same contract as `assignOrderRef` at settlement.
- **Vitest is `environment: 'node'`** — no jsdom. Component tests are impossible; cards are verified by `npm run build` plus a browser pass.
- **Run `npx vitest run` from the repo root.**

## File Structure

**New**
- `functions/secondChance.js` — the pure brain.
- `functions/secondChance.test.js`
- `functions/secondChanceHook.test.js` — source guard that the enforcer hook sits outside the batch.
- `src/components/order/SecondChanceCard.tsx` — one card serving both the seller step and the buyer step.

**Modified**
- `functions/index.js` — enforcer hook; `respondToSecondChance` callable.
- `src/components/OrderDetailsView.tsx` or the auction view — render the card. (Task 4 resolves which, from where a bidder actually lands.)

---

### Task 1: The pure core

**Files:**
- Create: `functions/secondChance.js`, `functions/secondChance.test.js`

**Interfaces:**
- Consumes: `belowReserveExpiryMs`, `isBelowReserveOfferExpired`, `buyerPremiumJod`, `totalDueJod`, `sellerCommissionFils`, `sellerNetFils` from `./settlement`.
- Produces:
  - `pickRunnerUp(bids, defaulterId) → { bidderId, bidderName, amount } | null`
  - `openingStateFor(runnerUpAmount, reserve) → 'pending_buyer' | 'pending_seller'`
  - `buildOfferRecord(deps, { runnerUp, defaultedOrderId, openingState }) → object`
  - `secondChanceOrderMoney(amount) → { winningBidAmount, buyersPremium, totalDue, sellerCommission, sellerNet }`
  - `SECOND_CHANCE_ORDER_SUFFIX = '__sc'`, `secondChanceOrderId(auctionId) → string`
  - `offerIsLive(offer, nowMs) → boolean`

- [ ] **Step 1: Write the failing test**

Create `functions/secondChance.test.js`:

```js
// Second Chance Offer — the pure decisions.
//
// 21 of 31 real orders are `defaulted`: today the winner is banned and the lot
// simply dies, while the runner-up who bid real money hears nothing. Every
// judgement about who gets offered what, and for how much, lives here so each
// branch is testable without an emulator.
import { describe, it, expect } from 'vitest';
import {
  pickRunnerUp, openingStateFor, buildOfferRecord, secondChanceOrderMoney,
  secondChanceOrderId, offerIsLive, SECOND_CHANCE_ORDER_SUFFIX,
} from './secondChance.js';

const NOW = 1750000000000;
const HOUR = 3600000;
const FakeTimestamp = { fromMillis: (ms) => ({ _ms: ms, toMillis: () => ms }) };
const deps = { Timestamp: FakeTimestamp, now: () => NOW };

const bid = (bidderId, amount, over = {}) => ({ bidderId, amount, bidderName: bidderId, ...over });

describe('pickRunnerUp', () => {
  it('picks the highest bid that is not the defaulter\'s', () => {
    const r = pickRunnerUp([bid('w', 100), bid('a', 90), bid('b', 80)], 'w');
    expect(r.bidderId).toBe('a');
    expect(r.amount).toBe(90);
  });

  it('ignores EVERY bid by the defaulter, not just the top one', () => {
    // The winner bidding twice in a row is exactly why `previousBidderId` is
    // the wrong source: it would hand the lot back to the person who defaulted.
    const r = pickRunnerUp([bid('w', 100), bid('w', 95), bid('a', 90)], 'w');
    expect(r.bidderId).toBe('a');
  });

  it('returns null when the defaulter was the only bidder', () => {
    expect(pickRunnerUp([bid('w', 100), bid('w', 90)], 'w')).toBeNull();
  });

  it('returns null for an empty or missing bid list', () => {
    expect(pickRunnerUp([], 'w')).toBeNull();
    expect(pickRunnerUp(undefined, 'w')).toBeNull();
  });

  it('skips malformed bid rows rather than failing the whole lot', () => {
    const r = pickRunnerUp([null, { amount: 50 }, bid('a', 40), { bidderId: 'x' }], 'w');
    expect(r.bidderId).toBe('a');
  });
});

describe('openingStateFor — the reserve fork', () => {
  it('goes straight to the buyer when the bid clears the reserve', () => {
    expect(openingStateFor(100, 90)).toBe('pending_buyer');
    expect(openingStateFor(90, 90)).toBe('pending_buyer'); // equal clears
  });

  it('asks the seller first when the bid is under the reserve', () => {
    expect(openingStateFor(80, 90)).toBe('pending_seller');
  });

  it('treats no reserve as cleared — an auction without auctionSecrets has none', () => {
    for (const noReserve of [null, undefined, 0, NaN, 'abc']) {
      expect(openingStateFor(10, noReserve)).toBe('pending_buyer');
    }
  });
});

describe('secondChanceOrderId', () => {
  it('derives a distinct id — the defaulted order already owns the auction id', () => {
    expect(secondChanceOrderId('auction-1')).toBe('auction-1__sc');
    expect(SECOND_CHANCE_ORDER_SUFFIX).toBe('__sc');
  });
});

describe('secondChanceOrderMoney', () => {
  it('recomputes fees from the runner-up bid, never inherits the dead order\'s', () => {
    const m = secondChanceOrderMoney(100);
    expect(m.winningBidAmount).toBe(100);
    expect(m.buyersPremium).toBeGreaterThan(0);
    expect(m.totalDue).toBeGreaterThan(100);
    expect(m.sellerNet).toBeLessThan(100);
  });

  it('matches the platform rates used everywhere else', () => {
    // 5% buyer premium, 5% seller commission — from settlement.js, not inline.
    const m = secondChanceOrderMoney(100);
    expect(m.totalDue).toBeCloseTo(105, 5);
    expect(m.sellerNet).toBeCloseTo(95, 5);
  });
});

describe('buildOfferRecord', () => {
  const runnerUp = { bidderId: 'a', bidderName: 'Runner Up', amount: 90 };

  it('stamps the runner-up, the amount, the state and a 24h expiry', () => {
    const o = buildOfferRecord(deps, { runnerUp, defaultedOrderId: 'auction-1', openingState: 'pending_buyer' });
    expect(o.status).toBe('pending_buyer');
    expect(o.bidderId).toBe('a');
    expect(o.amount).toBe(90);
    expect(o.defaultedOrderId).toBe('auction-1');
    expect(o.expiresAt.toMillis()).toBe(NOW + 24 * HOUR);
  });

  it('records when it opened, for the audit trail', () => {
    const o = buildOfferRecord(deps, { runnerUp, defaultedOrderId: 'x', openingState: 'pending_seller' });
    expect(o.openedAt.toMillis()).toBe(NOW);
  });
});

describe('offerIsLive', () => {
  const live = { status: 'pending_buyer', expiresAt: FakeTimestamp.fromMillis(NOW + HOUR) };

  it('is live while pending and unexpired', () => {
    expect(offerIsLive(live, NOW)).toBe(true);
    expect(offerIsLive({ ...live, status: 'pending_seller' }, NOW)).toBe(true);
  });

  it('is not live once expired', () => {
    expect(offerIsLive({ ...live, expiresAt: FakeTimestamp.fromMillis(NOW - 1) }, NOW)).toBe(false);
  });

  it('is not live in a terminal state', () => {
    for (const status of ['confirmed', 'declined', 'expired']) {
      expect(offerIsLive({ ...live, status }, NOW)).toBe(false);
    }
  });

  it('is not live when there is no offer at all', () => {
    expect(offerIsLive(null, NOW)).toBe(false);
    expect(offerIsLive(undefined, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/secondChance.test.js`
Expected: FAIL — `Failed to load ./secondChance.js`

- [ ] **Step 3: Write the module**

Create `functions/secondChance.js`:

```js
/**
 * Second Chance Offer — the pure decisions.
 *
 * 21 of 31 real orders in production are `defaulted`. Today the enforcer bans
 * the buyer and the lot dies there; the runner-up who bid real money never
 * hears anything. This module decides who gets offered what, at what price, and
 * for how long.
 *
 * Pure by design: the enforcer hook and the accept/decline callable read and
 * write Firestore, and call in here for every judgement. Same split as
 * settlement.js, and the reason each branch below is unit-tested without an
 * emulator.
 *
 * The offer record mirrors `belowReserveOffer` and reuses its window helpers —
 * it is the same bounded-offer machine with a different trigger, so it must not
 * grow a second set of semantics.
 */
const {
  belowReserveExpiryMs,
  isBelowReserveOfferExpired,
  buyerPremiumJod,
  totalDueJod,
  sellerCommissionFils,
  sellerNetFils,
} = require('./settlement');

/**
 * The defaulted order already owns `orders/{auctionId}` — settleAuctionTxn keys
 * orders by auction id and guards on `!orderSnap.exists`. A second order for
 * the same lot therefore needs its own id.
 *
 * ONE-SHOT BY DESIGN. This works precisely because there is exactly one second
 * chance. If a cascade is ever wanted, redesign the id scheme — do NOT add
 * `__sc2`.
 */
const SECOND_CHANCE_ORDER_SUFFIX = '__sc';

function secondChanceOrderId(auctionId) {
  return `${auctionId}${SECOND_CHANCE_ORDER_SUFFIX}`;
}

/**
 * Highest bid not belonging to the defaulter, or null.
 *
 * Deliberately NOT `auction.previousBidderId`: that is the last person outbid,
 * which is the winner themselves whenever the winner bid twice in a row — it
 * would offer the lot straight back to whoever just defaulted.
 *
 * A malformed row is skipped rather than fatal: one bad bid document must not
 * deny the whole lot a second chance.
 */
function pickRunnerUp(bids, defaulterId) {
  if (!Array.isArray(bids)) return null;
  let best = null;
  for (const b of bids) {
    if (!b || typeof b !== 'object') continue;
    const bidderId = b.bidderId;
    const amount = Number(b.amount);
    if (!bidderId || !Number.isFinite(amount) || amount <= 0) continue;
    if (bidderId === defaulterId) continue;
    if (!best || amount > best.amount) {
      best = { bidderId, bidderName: b.bidderName || 'Bidder', amount };
    }
  }
  return best;
}

/**
 * The reserve fork. A bid at or above the reserve goes straight to the bidder —
 * the seller already agreed to sell at that level. Below it, the seller must
 * consent, because selling under a reserve without asking breaks the promise
 * the reserve makes.
 *
 * A non-numeric or absent reserve means the auction has no `auctionSecrets`
 * doc, i.e. no reserve — so anything clears it.
 */
function openingStateFor(runnerUpAmount, reserve) {
  const r = Number(reserve);
  if (!Number.isFinite(r) || r <= 0) return 'pending_buyer';
  return Number(runnerUpAmount) >= r ? 'pending_buyer' : 'pending_seller';
}

/** The offer stamped onto the auction as `secondChanceOffer`. */
function buildOfferRecord(deps, { runnerUp, defaultedOrderId, openingState }) {
  const { Timestamp, now = () => Date.now() } = deps;
  const nowMs = now();
  return {
    status: openingState,
    bidderId: runnerUp.bidderId,
    bidderName: runnerUp.bidderName,
    amount: runnerUp.amount,
    defaultedOrderId,
    openedAt: Timestamp.fromMillis(nowMs),
    expiresAt: Timestamp.fromMillis(belowReserveExpiryMs(nowMs)),
  };
}

/**
 * Money for the second-chance order, computed from the RUNNER-UP's bid.
 * Never inherited from the defaulted order — that order was for a different,
 * higher amount, and copying it would overcharge the runner-up.
 */
function secondChanceOrderMoney(amount) {
  const bid = Number(amount);
  const fils = Math.round(bid * 1000);
  return {
    winningBidAmount: bid,
    buyersPremium: buyerPremiumJod(bid),
    totalDue: totalDueJod(bid),
    sellerCommission: sellerCommissionFils(fils) / 1000,
    sellerNet: sellerNetFils(fils) / 1000,
  };
}

/** Pending and unexpired. Reuses the below-reserve expiry semantics exactly. */
function offerIsLive(offer, nowMs) {
  if (!offer || !offer.status) return false;
  if (offer.status !== 'pending_seller' && offer.status !== 'pending_buyer') return false;
  return !isBelowReserveOfferExpired(offer, nowMs);
}

module.exports = {
  SECOND_CHANCE_ORDER_SUFFIX,
  secondChanceOrderId,
  pickRunnerUp,
  openingStateFor,
  buildOfferRecord,
  secondChanceOrderMoney,
  offerIsLive,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/secondChance.test.js`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/secondChance.js functions/secondChance.test.js
git commit -m "feat(sco): pure second-chance decisions — runner-up, reserve fork, money"
```

---

### Task 2: Open the offer when an order defaults

**Files:**
- Modify: `functions/index.js` — `paymentDefaultEnforcer`, after the batch commit (the batch region is around `index.js:877-905`)
- Create: `functions/secondChanceHook.test.js`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `secondChanceOffer` on the auction doc; a `system_health` row recording the offer.

- [ ] **Step 1: Write the failing source-guard test**

Create `functions/secondChanceHook.test.js`:

```js
// The enforcer hook's PLACEMENT, which no unit test can reach.
//
// Two ways to get this wrong, both invisible to a behavioural test:
//   1. Opening offers INSIDE the batch loop. Finding the runner-up needs a bids
//      subcollection query; a query inside a write batch is not how the batch
//      API works, and mixing them makes the default itself fail.
//   2. Letting a second-chance failure escape. paymentDefaultEnforcer also
//      unblocks users whose ban cooldown expired — if it throws, orders stop
//      defaulting AND bans stop lifting.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'index.js'), 'utf8');

function enforcerSource() {
  const start = SOURCE.indexOf('exports.paymentDefaultEnforcer');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const next = rest.indexOf('\nexports.');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('paymentDefaultEnforcer — second-chance hook placement', () => {
  const body = enforcerSource();

  it('opens offers only after the batch has committed', () => {
    const commitAt = body.indexOf('batch.commit()');
    const hookAt = body.indexOf('openSecondChanceOffers');
    expect(commitAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(commitAt);
  });

  it('wraps the hook so a failure can never break defaulting or unblocking', () => {
    const hookAt = body.indexOf('openSecondChanceOffers');
    const slice = body.slice(Math.max(0, hookAt - 200), hookAt + 300);
    expect(slice).toMatch(/try\s*\{/);
    expect(slice).toMatch(/catch/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/secondChanceHook.test.js`
Expected: FAIL — `openSecondChanceOffers` does not appear in the enforcer

- [ ] **Step 3: Add the helper**

In `functions/index.js`, above `exports.paymentDefaultEnforcer`:

```js
/**
 * Open a second-chance offer on each freshly-defaulted lot.
 *
 * Runs AFTER the enforcer's batch commits: finding the runner-up needs a bids
 * subcollection query, which does not belong inside a write batch.
 *
 * NEVER THROWS. paymentDefaultEnforcer also lifts expired bans; a second-chance
 * failure must not stop that. A lot that fails to get an offer is simply the
 * status quo.
 *
 * Idempotent: the enforcer runs every 30 minutes, so an auction that already
 * carries a `secondChanceOffer` is skipped rather than re-offered.
 */
async function openSecondChanceOffers(defaultedDocs) {
  for (const doc of defaultedDocs) {
    const order = doc.data() || {};
    const auctionId = order.auctionId;
    if (!auctionId) continue;
    try {
      const auctionRef = db.collection('auctions').doc(auctionId);
      const auctionSnap = await auctionRef.get();
      if (!auctionSnap.exists) continue;
      const auction = auctionSnap.data() || {};

      // One offer per lot, ever.
      if (auction.secondChanceOffer) {
        console.log(`[secondChance] ${auctionId} already has an offer — skipping`);
        continue;
      }

      const bidsSnap = await auctionRef.collection('bids').get();
      const bids = bidsSnap.docs.map(d => d.data());
      const runnerUp = pickRunnerUp(bids, order.buyerId);
      if (!runnerUp) {
        console.log(`[secondChance] ${auctionId} has no runner-up — relist path unchanged`);
        continue;
      }

      // The reserve is admin-only (auctions/{id} is world-readable). No
      // auctionSecrets doc means no reserve, so any bid clears it.
      let reserve = null;
      try {
        const secretSnap = await db.collection('auctionSecrets').doc(auctionId).get();
        if (secretSnap.exists) reserve = (secretSnap.data() || {}).reservePrice ?? null;
      } catch (e) {
        console.warn(`[secondChance] reserve lookup failed for ${auctionId}:`, e && e.message);
      }

      const openingState = openingStateFor(runnerUp.amount, reserve);
      const offer = buildOfferRecord(
        { Timestamp: admin.firestore.Timestamp, now: () => Date.now() },
        { runnerUp, defaultedOrderId: doc.id, openingState },
      );

      await auctionRef.update({ secondChanceOffer: offer });

      await db.collection('system_health').add({
        type: 'second_chance_opened',
        title: `Second chance offered (${openingState})`,
        details: `Auction ${auctionId} (${order.auctionTitle || ''}) → ${runnerUp.bidderName} at ${runnerUp.amount} JOD after ${order.buyerName || order.buyerId} defaulted.`,
        source: 'paymentDefaultEnforcer',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // pending_seller waits on the seller; pending_buyer goes straight out.
      const notifyUid = openingState === 'pending_seller' ? auction.sellerId : runnerUp.bidderId;
      await notify({
        uid: notifyUid,
        event: 'below_reserve_offer',
        data: {
          auctionId,
          auctionTitle: auction.title || '',
          topBid: runnerUp.amount,
          idempotencyKey: `${auctionId}_second_chance_open`,
        },
      });
      console.log(`[secondChance] opened ${openingState} on ${auctionId} for ${runnerUp.bidderId}`);
    } catch (e) {
      console.error(`[secondChance] failed for auction ${auctionId} (non-fatal):`, e && e.message);
    }
  }
}
```

Add the import beside the other core modules near the top of `index.js`:

```js
const { pickRunnerUp, openingStateFor, buildOfferRecord, secondChanceOrderId, secondChanceOrderMoney, offerIsLive } = require('./secondChance');
```

- [ ] **Step 4: Call it after the batch commits**

Find the `batch.commit()` inside `paymentDefaultEnforcer` (section B, around `index.js:900-930`). Immediately after the commit resolves, add:

```js
      // Second chance: recover the sale the default just killed. Wrapped
      // because this function ALSO lifts expired bans above — a second-chance
      // failure must never stop that from running.
      try {
        await openSecondChanceOffers(snap.docs);
      } catch (e) {
        console.error('[paymentDefaultEnforcer] second-chance pass failed (non-fatal):', e && e.message);
      }
```

`snap.docs` is the set of orders this run defaulted — it is already in scope from the query above the batch.

- [ ] **Step 5: Run the guard test and the bundle check**

Run: `node --check functions/index.js && npx vitest run functions/secondChanceHook.test.js`
Expected: no syntax error; PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add functions/index.js functions/secondChanceHook.test.js
git commit -m "feat(sco): open a second-chance offer when an order defaults"
```

---

### Task 2a: Stop a relist running over a live offer

Verified while writing this plan: `shouldAutoRelist` (`functions/settlement.js:211`) checks
`belowReserveBlocksRelist(auction.belowReserveOffer, nowMs)` and **nothing else**. A lot carrying a
live `secondChanceOffer` would therefore be auto-relisted — the same item live twice, with two
people able to buy it. This must land with Task 2, not after.

**Files:**
- Modify: `functions/settlement.js:211-219`
- Test: `functions/settlement.test.js`

**Interfaces:**
- Consumes: `belowReserveBlocksRelist` (existing).
- Produces: `shouldAutoRelist` additionally blocking on a live `secondChanceOffer`.

- [ ] **Step 1: Write the failing test**

Append to `functions/settlement.test.js`:

```js
describe('shouldAutoRelist — a live second-chance offer blocks a relist', () => {
  const NOW = 1750000000000;
  const HOUR = 3600000;
  const ts = (ms) => ({ toMillis: () => ms });
  const base = { autoRelist: true, autoRelistCount: 0, relisted: false };

  it('does not relist a lot that is under a live second-chance offer', () => {
    // Without this, the same item goes live while the runner-up still holds an
    // offer on it — and two people can buy it.
    expect(shouldAutoRelist({
      ...base,
      secondChanceOffer: { status: 'pending_buyer', expiresAt: ts(NOW + HOUR) },
    }, NOW)).toBe(false);
  });

  it('blocks while the SELLER is still deciding, too', () => {
    expect(shouldAutoRelist({
      ...base,
      secondChanceOffer: { status: 'pending_seller', expiresAt: ts(NOW + HOUR) },
    }, NOW)).toBe(false);
  });

  it('relists once the offer has expired', () => {
    expect(shouldAutoRelist({
      ...base,
      secondChanceOffer: { status: 'pending_buyer', expiresAt: ts(NOW - 1) },
    }, NOW)).toBe(true);
  });

  it('relists after a decline, but never after a confirmed sale', () => {
    expect(shouldAutoRelist({ ...base, secondChanceOffer: { status: 'declined' } }, NOW)).toBe(true);
    expect(shouldAutoRelist({ ...base, secondChanceOffer: { status: 'confirmed' } }, NOW)).toBe(false);
  });

  it('still relists a lot with no second-chance offer at all', () => {
    expect(shouldAutoRelist(base, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/settlement.test.js`
Expected: FAIL — the pending cases return `true`, because `shouldAutoRelist` never looks at `secondChanceOffer`

- [ ] **Step 3: Extend `shouldAutoRelist`**

In `functions/settlement.js`, replace the function body:

```js
function shouldAutoRelist(auction, nowMs) {
  if (!auction) return false;
  return (
    auction.autoRelist === true &&
    (auction.autoRelistCount || 0) < MAX_AUTO_RELISTS &&
    auction.relisted !== true &&
    !belowReserveBlocksRelist(auction.belowReserveOffer, nowMs) &&
    // A live second-chance offer blocks a relist for the same reason a
    // below-reserve one does: the lot may still become a sale. Without this the
    // item goes live while the runner-up holds an offer on it, and two people
    // can buy the same thing. `belowReserveBlocksRelist` is reused rather than
    // duplicated — both are the same bounded-offer machine.
    !belowReserveBlocksRelist(auction.secondChanceOffer, nowMs)
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/settlement.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/settlement.js functions/settlement.test.js
git commit -m "fix(sco): a live second-chance offer blocks auto-relist"
```

---

### Task 3: Respond to the offer

**Files:**
- Modify: `functions/index.js` — new `respondToSecondChance` callable, placed beside `acceptBelowReserve` (`index.js:2521`)

**Interfaces:**
- Consumes: Task 1's helpers; the `secondChanceOffer` record from Task 2.
- Produces: callable `respondToSecondChance({ auctionId, action })` where `action` is `'seller_accept' | 'buyer_accept' | 'decline'`, returning `{ success, message }`.

- [ ] **Step 1: Read the pattern**

Read `exports.acceptBelowReserve` in full (`functions/index.js:2521` onward). It is the same shape: a transaction that reads the auction, order and caller; checks the offer's status and the caller's right to act; mints an order; advances the offer; and emits its notify **after** the transaction. Follow it — in particular, resetting the notify variable at the top of each attempt so a retried transaction cannot re-emit a prior attempt's message.

- [ ] **Step 2: Write the callable**

Add after `acceptBelowReserve`:

```js
/**
 * respondToSecondChance — act on a second-chance offer.
 *
 *   seller_accept → pending_seller becomes pending_buyer, and the BUYER gets a
 *                   FRESH 24h (not the residual of the seller's window), exactly
 *                   as acceptBelowReserve does.
 *   buyer_accept  → mints orders/<auctionId>__sc and confirms the offer.
 *   decline       → terminal; unblocks relist.
 *
 * The second-chance order CANNOT reuse the auction id: the defaulted order
 * already owns `orders/{auctionId}`. Money is recomputed from the runner-up's
 * own bid — never inherited from the dead order, which was for more.
 */
exports.respondToSecondChance = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }
  const callerUserId = context.auth.uid;
  const { auctionId, action } = data || {};
  if (!auctionId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرّف المزاد مطلوب.');
  }
  if (!['seller_accept', 'buyer_accept', 'decline'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'إجراء غير معروف.');
  }

  try {
    let pendingNotify = null;
    const result = await db.runTransaction(async (transaction) => {
      pendingNotify = null; // a retried txn must not re-emit a prior attempt's notify

      const auctionRef = db.collection('auctions').doc(auctionId);
      const orderRef = db.collection('orders').doc(secondChanceOrderId(auctionId));
      const [auctionSnap, orderSnap] = await Promise.all([
        transaction.get(auctionRef),
        transaction.get(orderRef),
      ]);
      if (!auctionSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'المزاد غير موجود.');
      }
      const auction = auctionSnap.data() || {};
      const offer = auction.secondChanceOffer;

      if (!offerIsLive(offer, Date.now())) {
        throw new functions.https.HttpsError('failed-precondition', 'انتهت صلاحية العرض أو تم إغلاقه.');
      }

      const isSeller = auction.sellerId === callerUserId;
      const isBidder = offer.bidderId === callerUserId;

      if (action === 'seller_accept') {
        if (!isSeller) throw new functions.https.HttpsError('permission-denied', 'البائع فقط يمكنه قبول هذا العرض.');
        if (offer.status !== 'pending_seller') throw new functions.https.HttpsError('failed-precondition', 'العرض ليس بانتظار موافقة البائع.');
        transaction.update(auctionRef, {
          'secondChanceOffer.status': 'pending_buyer',
          'secondChanceOffer.sellerAcceptedAt': admin.firestore.FieldValue.serverTimestamp(),
          // Fresh window for the buyer — see acceptBelowReserve for the same reasoning.
          'secondChanceOffer.expiresAt': admin.firestore.Timestamp.fromMillis(belowReserveExpiryMs(Date.now())),
        });
        pendingNotify = { uid: offer.bidderId, event: 'below_reserve_seller_accepted' };
        return { success: true, message: 'تم قبول العرض. بانتظار تأكيد المشتري.' };
      }

      if (action === 'decline') {
        if (!isSeller && !isBidder) throw new functions.https.HttpsError('permission-denied', 'لا تملك صلاحية على هذا العرض.');
        transaction.update(auctionRef, {
          'secondChanceOffer.status': 'declined',
          'secondChanceOffer.declinedAt': admin.firestore.FieldValue.serverTimestamp(),
          'secondChanceOffer.declinedBy': callerUserId,
        });
        pendingNotify = { uid: offer.bidderId, event: 'below_reserve_declined' };
        return { success: true, message: 'تم إغلاق العرض.' };
      }

      // buyer_accept
      if (!isBidder) throw new functions.https.HttpsError('permission-denied', 'صاحب العرض فقط يمكنه القبول.');
      if (offer.status !== 'pending_buyer') throw new functions.https.HttpsError('failed-precondition', 'العرض بانتظار موافقة البائع.');
      if (orderSnap.exists) {
        return { success: true, message: 'تم إنشاء الطلب سابقاً.', alreadyCreated: true };
      }

      const money = secondChanceOrderMoney(offer.amount);
      transaction.set(orderRef, {
        id: orderRef.id,
        auctionId,
        auctionTitle: auction.title || '',
        auctionImage: auction.thumbnailUrl || auction.imageUrl || '',
        sellerId: auction.sellerId || '',
        sellerName: auction.sellerName || 'Seller',
        buyerId: offer.bidderId,
        buyerName: offer.bidderName || 'Buyer',
        ...money,
        paymentDeadlineAt: paymentDeadlineFromNow(auction),
        paymentWindowHours: resolvePaymentWindowHours(auction.paymentWindowHours),
        status: 'waiting_payment',
        paymentStatus: 'unpaid',
        shippingStatus: 'not_started',
        escrowStatus: 'locked',
        // Provenance: this order exists because another one died.
        secondChanceFor: offer.defaultedOrderId || auctionId,
        ...(auction.isSimulated === true ? { isSimulated: true } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(auctionRef, {
        'secondChanceOffer.status': 'confirmed',
        'secondChanceOffer.confirmedAt': admin.firestore.FieldValue.serverTimestamp(),
      });
      pendingNotify = { uid: offer.bidderId, event: 'payment_due', orderId: orderRef.id, totalDue: money.totalDue };
      return { success: true, message: 'تم تأكيد الشراء. أكمل الدفع خلال المهلة.' };
    });

    // Post-commit: a notify inside a transaction re-sends on every retry.
    if (pendingNotify) {
      try {
        await notify({
          uid: pendingNotify.uid,
          event: pendingNotify.event,
          data: {
            auctionId,
            ...(pendingNotify.orderId ? { orderId: pendingNotify.orderId } : {}),
            ...(pendingNotify.totalDue ? { totalDue: pendingNotify.totalDue } : {}),
            idempotencyKey: `${auctionId}_sc_${action}`,
          },
        });
      } catch (e) {
        console.warn('[respondToSecondChance] notify failed (non-fatal):', e && e.message);
      }
    }

    // A ref is cosmetic — never let it fail the purchase.
    if (result && result.success && action === 'buyer_accept' && !result.alreadyCreated) {
      try {
        await assignOrderRef({ db, Timestamp: admin.firestore.Timestamp, now: () => Date.now() }, secondChanceOrderId(auctionId));
      } catch (e) {
        console.error('[respondToSecondChance] assignOrderRef failed (non-fatal):', e && e.message);
      }
    }
    return result;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in respondToSecondChance:', error);
    throw new functions.https.HttpsError('internal', error.message || 'تعذر تنفيذ العملية.');
  }
});
```

- [ ] **Step 3: Verify the bundle**

Run: `node --check functions/index.js && npx vitest run functions/`
Expected: no syntax error; all function tests pass. If `txnPurity.test.js` fails, a notify has been left inside the transaction — move it out rather than relaxing the test.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat(sco): respondToSecondChance — seller accept, buyer accept, decline"
```

---

### Task 4: The card

**Files:**
- Create: `src/components/order/SecondChanceCard.tsx`
- Modify: whichever view renders a bidder's live auctions — resolve by reading how `belowReserveOffer` is surfaced today (`grep -rn "belowReserveOffer" src`), and follow it exactly.

**Interfaces:**
- Consumes: `respondToSecondChance` callable (Task 3).
- Produces: `SecondChanceCard({ auction, currentUserId, isAr, onRespond })`.

- [ ] **Step 1: Find where the below-reserve offer surfaces**

Run: `grep -rn "belowReserveOffer" src --include=*.tsx --include=*.ts`

Whatever component renders that offer to a seller and a bidder is where this belongs, and its layout is the one to copy. If the below-reserve offer has no UI at all, put the card in `OrderDetailsView`'s sibling auction view and say so in the commit — do not invent a third surface.

- [ ] **Step 2: Build the card**

Requirements:
- Shows the lot, the runner-up's bid amount, and how long is left (`expiresAt`).
- **Seller sees** an accept/decline pair only when `status === 'pending_seller'` and they are `auction.sellerId`.
- **Bidder sees** accept/decline only when `status === 'pending_buyer'` and they are `offer.bidderId`.
- Nobody sees it when `offerIsLive` is false.
- Accept states the amount plainly — `سيتم إنشاء طلب بقيمة {totalDue} د.أ` — so nobody accepts without seeing the number.
- Bilingual, Arabic-primary, following the file's existing `isAr ? '…' : '…'` idiom.

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: build succeeds; no NEW TypeScript errors (CI runs `tsc --noEmit` and fails on new ones).

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat(sco): second-chance card for the seller and the runner-up"
```

---

### Task 5: Docs and verification

**Files:**
- Modify: `docs/admin-seller-audit-2026-07.md` (D2 row + the deferred list), `docs/BACKLOG.md`

- [ ] **Step 1: Update the audit**

Mark `D2`'s "Second Chance Offer MISSING" as shipped, and remove it from the deferred list with a note that the cascade was deliberately not built.

- [ ] **Step 2: Note the behaviour change in the backlog**

Record that a defaulted lot now automatically offers to the runner-up — the first fully automatic sale path — and that `system_health` carries a `second_chance_opened` row for each one.

- [ ] **Step 3: Full verification**

Run each and paste the real output into the PR:

```bash
npx vitest run
npm run build
npm run lint
node --check functions/index.js
```

- [ ] **Step 4: Commit and open the PR**

The PR body must include those four outputs and the smoke-test list below.

- [ ] **Step 5: Prod smoke test (MJ)**

This is a money path and the first automatic sale, so it wants a live check:

1. A defaulted lot **above** reserve → the runner-up gets an offer, the seller is not asked.
2. A defaulted lot **below** reserve → the seller is asked first; accepting gives the buyer a fresh 24h.
3. Accepting mints `orders/<auctionId>__sc` at the **runner-up's** bid, not the defaulter's, with an MZ ref.
4. The defaulted order is still there, still `defaulted`.
5. A single-bidder lot gets **no** offer.
6. Re-running the enforcer does not open a second offer on the same lot.
7. Declining unblocks relist.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Automatic trigger on default | 2 |
| Runner-up from bids, not `previousBidderId` | 1 |
| Reserve fork; `auctionSecrets` as the source; no reserve = cleared | 1, 2 |
| One offer only; idempotent re-runs | 1, 2 |
| 24h per party; fresh window on seller accept | 1, 3 |
| `<auctionId>__sc` order id | 1, 3 |
| Money recomputed from the runner-up's bid | 1, 3 |
| Defaulted order preserved | 3 (new doc id) |
| Defaulter's ban untouched | inherent — no ban code is touched |
| Reuse `below_reserve_*` events | 2, 3 |
| Enforcer never throws | 2 |
| Malformed bid skipped | 1 |
| Accept is transactional + idempotent | 3 |
| Relist blocking | **2a** — confirmed broken as-is: `shouldAutoRelist` reads only `auction.belowReserveOffer`, so a live second-chance offer would not block a relist |
| `system_health` records the offer | 2 |

**Notes for the implementer**

- Task 1 is pure and independently reviewable. Tasks 2 and 3 both touch `index.js` and should land separately so each is reviewable on its own.
- The riskiest step is Task 3's order creation. Copy `acceptBelowReserve`'s structure rather than improvising: it already solves the retry-safe notify and the idempotent order mint.
- Task 2a is not optional. `shouldAutoRelist` was verified while writing this plan and reads only `auction.belowReserveOffer` — without 2a, a lot under a live second-chance offer can be auto-relisted, putting the same item live twice and letting two people buy it.
